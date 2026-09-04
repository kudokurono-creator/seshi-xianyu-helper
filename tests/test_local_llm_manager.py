from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import threading
from types import SimpleNamespace

import pytest

import local_llm.model_manager as model_manager_module
from local_llm.model_manager import (
    GenerationError,
    GenerationInputError,
    ModelLoadError,
    ModelManager,
    ModelNotLoadedError,
    ModelPathError,
)


class FakeCuda:
    class OutOfMemoryError(RuntimeError):
        pass

    def __init__(self) -> None:
        self.available = False
        self.empty_cache_calls = 0

    def is_available(self) -> bool:
        return self.available

    def empty_cache(self) -> None:
        self.empty_cache_calls += 1

    def get_device_name(self, index: int) -> str:
        return "Fake GPU"

    def memory_allocated(self, index: int) -> int:
        return 128 * 1024**2

    def memory_reserved(self, index: int) -> int:
        return 256 * 1024**2


class FakeTensor:
    def __init__(self, data: list[list[int]]) -> None:
        self.data = data
        self.moved_to: str | None = None

    @property
    def shape(self) -> tuple[int, int]:
        return (len(self.data), len(self.data[0]))

    def to(self, device: str) -> "FakeTensor":
        self.moved_to = device
        return self

    def __getitem__(self, key: object) -> object:
        if isinstance(key, tuple):
            row, column = key
            return self.data[row][column]
        return self.data[key]


class FakeInferenceMode:
    def __enter__(self) -> None:
        return None

    def __exit__(self, *args: object) -> None:
        return None


class FakeTokenizer:
    def __init__(self) -> None:
        self.chat_template: str | None = "{{ messages }}"
        self.pad_token_id = None
        self.eos_token_id = 2
        self.template_messages: list[dict[str, str]] | None = None
        self.template_kwargs: dict[str, object] | None = None
        self.encoded_text: str | None = None

    def apply_chat_template(
        self, messages: list[dict[str, str]], **kwargs: object
    ) -> dict[str, FakeTensor]:
        self.template_messages = messages
        self.template_kwargs = kwargs
        return {
            "input_ids": FakeTensor([[1, 2]]),
            "attention_mask": FakeTensor([[1, 1]]),
        }

    def __call__(self, text: str, **kwargs: object) -> dict[str, FakeTensor]:
        self.encoded_text = text
        return {
            "input_ids": FakeTensor([[1, 2]]),
            "attention_mask": FakeTensor([[1, 1]]),
        }

    def decode(self, tokens: list[int], **kwargs: object) -> str:
        return "decoded:" + ",".join(str(token) for token in tokens)


class FakeModel:
    def __init__(self) -> None:
        self.eval_called = False
        self.to_device: str | None = None
        self.device = "cpu"
        self.generate_kwargs: dict[str, object] | None = None

    def eval(self) -> None:
        self.eval_called = True

    def to(self, device: str) -> "FakeModel":
        self.to_device = device
        self.device = device
        return self

    def get_input_embeddings(self) -> SimpleNamespace:
        return SimpleNamespace(weight=SimpleNamespace(device=self.device))

    def generate(self, **kwargs: object) -> FakeTensor:
        self.generate_kwargs = kwargs
        return FakeTensor([[1, 2, 7, 8, 9]])


@pytest.fixture
def manager() -> ModelManager:
    return ModelManager()


@pytest.fixture
def model_dir(tmp_path: Path) -> Path:
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")
    (tmp_path / "model.safetensors").write_bytes(b"test-only")
    return tmp_path


@pytest.fixture
def fake_hf(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    state = SimpleNamespace(
        tokenizer=FakeTokenizer(),
        model=FakeModel(),
        tokenizer_kwargs=None,
        model_kwargs=None,
        raise_tokenizer_error=None,
        raise_model_error=None,
        cuda=FakeCuda(),
    )

    def load_tokenizer(path: str, **kwargs: object) -> object:
        state.tokenizer_path = path
        state.tokenizer_kwargs = kwargs
        if state.raise_tokenizer_error:
            raise state.raise_tokenizer_error
        return state.tokenizer

    def load_model(path: str, **kwargs: object) -> FakeModel:
        state.model_path = path
        state.model_kwargs = kwargs
        if state.raise_model_error:
            raise state.raise_model_error
        return state.model

    fake_torch = SimpleNamespace(
        cuda=state.cuda,
        inference_mode=lambda: FakeInferenceMode(),
    )
    monkeypatch.setattr(model_manager_module, "torch", fake_torch)
    monkeypatch.setattr(
        model_manager_module,
        "AutoTokenizer",
        SimpleNamespace(from_pretrained=load_tokenizer),
    )
    monkeypatch.setattr(
        model_manager_module,
        "AutoModelForCausalLM",
        SimpleNamespace(from_pretrained=load_model),
    )
    return state


@pytest.fixture
def loaded_manager(fake_hf: SimpleNamespace) -> ModelManager:
    instance = ModelManager()
    instance.model = fake_hf.model
    instance.tokenizer = fake_hf.tokenizer
    instance.model_path = "D:\\models\\demo"
    instance.model_name = "demo"
    instance.device = "cpu"
    return instance


def test_status_survives_missing_optional_dependencies(monkeypatch):
    monkeypatch.setattr(model_manager_module, "torch", None)
    monkeypatch.setattr(model_manager_module, "AutoTokenizer", None)
    monkeypatch.setattr(model_manager_module, "AutoModelForCausalLM", None)
    monkeypatch.setattr(model_manager_module, "accelerate", None)

    status = ModelManager().status()

    assert status["loaded"] is False
    assert status["dependencies_available"] is False
    assert "requirements-local-llm.txt" in status["unavailable_reason"]


def test_empty_manager_is_offline(manager: ModelManager, fake_hf: SimpleNamespace):
    status = manager.status()

    assert status["loaded"] is False
    assert status["model_path"] is None
    assert status["model_name"] is None
    assert status["device"] is None
    assert status["dependencies_available"] is (model_manager_module.accelerate is not None)
    if status["dependencies_available"]:
        assert status["unavailable_reason"] is None
    else:
        assert "requirements-local-llm.txt" in status["unavailable_reason"]


@pytest.mark.parametrize("value", ["", "   "])
def test_validate_rejects_empty_path(manager: ModelManager, value: str):
    with pytest.raises(ModelPathError, match="模型路径不能为空"):
        manager.validate_model_path(value)


def test_validate_rejects_missing_directory(manager: ModelManager, tmp_path: Path):
    with pytest.raises(ModelPathError, match="模型目录不存在"):
        manager.validate_model_path(str(tmp_path / "missing"))


def test_validate_requires_config_json(manager: ModelManager, tmp_path: Path):
    with pytest.raises(ModelPathError, match="config.json"):
        manager.validate_model_path(str(tmp_path))


def test_validate_requires_weight_file(manager: ModelManager, tmp_path: Path):
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")

    with pytest.raises(ModelPathError, match="权重文件"):
        manager.validate_model_path(str(tmp_path))


def test_validate_accepts_sharded_weight_index(manager: ModelManager, tmp_path: Path):
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")
    (tmp_path / "model-00001-of-00001.safetensors").write_bytes(b"test-only")
    (tmp_path / "model.safetensors.index.json").write_text(
        '{"weight_map":{"model.embed_tokens.weight":'
        '"model-00001-of-00001.safetensors"}}',
        encoding="utf-8",
    )

    assert manager.validate_model_path(str(tmp_path)) == tmp_path.resolve()


@pytest.mark.parametrize(
    "index_payload",
    [
        "{}",
        '{"weight_map":{}}',
        '{"weight_map":{"layer":"missing-00001.safetensors"}}',
        "not-json",
    ],
)
def test_incomplete_sharded_replacement_preserves_active_model(
    manager: ModelManager, tmp_path: Path, index_payload: str
):
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")
    (tmp_path / "model.safetensors.index.json").write_text(
        index_payload, encoding="utf-8"
    )
    active_model = object()
    active_tokenizer = object()
    manager.model = active_model
    manager.tokenizer = active_tokenizer

    with pytest.raises(ModelPathError, match="分片权重索引"):
        manager.load_model(str(tmp_path))

    assert manager.model is active_model
    assert manager.tokenizer is active_tokenizer


def test_sharded_index_rejects_non_string_shard_name(
    manager: ModelManager, tmp_path: Path
):
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")
    (tmp_path / "model.safetensors.index.json").write_text(
        '{"weight_map":{"layer":[]}}', encoding="utf-8"
    )

    with pytest.raises(ModelPathError, match="分片权重索引"):
        manager.validate_model_path(str(tmp_path))


def test_sharded_index_cannot_reference_file_outside_model_directory(
    manager: ModelManager, tmp_path: Path
):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "config.json").write_text("{}", encoding="utf-8")
    (tmp_path / "outside.safetensors").write_bytes(b"test-only")
    (model_dir / "model.safetensors.index.json").write_text(
        '{"weight_map":{"layer":"../outside.safetensors"}}', encoding="utf-8"
    )

    with pytest.raises(ModelPathError, match="分片权重索引"):
        manager.validate_model_path(str(model_dir))


def test_sharded_index_rejects_partially_missing_shards(
    manager: ModelManager, tmp_path: Path
):
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")
    (tmp_path / "model-00001-of-00002.safetensors").write_bytes(b"test-only")
    (tmp_path / "model.safetensors.index.json").write_text(
        '{"weight_map":{'
        '"layer.0":"model-00001-of-00002.safetensors",'
        '"layer.1":"model-00002-of-00002.safetensors"}}',
        encoding="utf-8",
    )

    with pytest.raises(ModelPathError, match="分片权重索引"):
        manager.validate_model_path(str(tmp_path))


def test_invalid_new_path_does_not_unload_active_model(manager: ModelManager, tmp_path: Path):
    manager.model = object()
    manager.tokenizer = object()

    with pytest.raises(ModelPathError):
        manager.load_model(str(tmp_path / "missing"))

    assert manager.model is not None
    assert manager.tokenizer is not None


def test_load_uses_cpu_without_cuda(manager: ModelManager, model_dir: Path, fake_hf):
    result = manager.load_model(str(model_dir))

    assert "device_map" not in fake_hf.model_kwargs
    assert fake_hf.model.to_device == "cpu"
    assert fake_hf.tokenizer_kwargs == {"trust_remote_code": True}
    assert result["device"] == "cpu"


def test_load_uses_auto_device_map_on_cuda(manager: ModelManager, model_dir: Path, fake_hf):
    fake_hf.cuda.available = True

    result = manager.load_model(str(model_dir))

    assert fake_hf.model_kwargs["device_map"] == "auto"
    assert fake_hf.model_kwargs["torch_dtype"] == "auto"
    assert fake_hf.model.eval_called is True
    assert result["device"] == "cuda"


def test_tokenizer_failure_leaves_manager_unloaded(manager: ModelManager, model_dir: Path, fake_hf):
    fake_hf.raise_tokenizer_error = RuntimeError("secret-tokenizer-detail")

    with pytest.raises(ModelLoadError, match="分词器") as error:
        manager.load_model(str(model_dir))

    assert manager.status()["loaded"] is False
    assert "secret-tokenizer-detail" not in str(error.value)


def test_model_failure_leaves_manager_unloaded(manager: ModelManager, model_dir: Path, fake_hf):
    fake_hf.raise_model_error = RuntimeError("secret-model-detail")

    with pytest.raises(ModelLoadError, match="模型权重") as error:
        manager.load_model(str(model_dir))

    assert manager.status()["loaded"] is False
    assert "secret-model-detail" not in str(error.value)


def test_load_classifies_cuda_out_of_memory(manager: ModelManager, model_dir: Path, fake_hf):
    fake_hf.raise_model_error = fake_hf.cuda.OutOfMemoryError("CUDA out of memory")

    with pytest.raises(ModelLoadError, match="CUDA 显存不足"):
        manager.load_model(str(model_dir))


def test_chat_decodes_only_new_tokens(loaded_manager: ModelManager):
    reply = loaded_manager.chat(
        [{"role": "user", "content": "你好"}],
        temperature=0.7,
        max_new_tokens=32,
        top_p=0.9,
    )

    assert reply == "decoded:7,8,9"
    assert loaded_manager.tokenizer.template_messages == [
        {"role": "user", "content": "你好"}
    ]
    assert loaded_manager.tokenizer.template_kwargs == {
        "add_generation_prompt": True,
        "return_tensors": "pt",
        "return_dict": True,
    }
    assert loaded_manager.model.generate_kwargs["temperature"] == 0.7
    assert loaded_manager.model.generate_kwargs["top_p"] == 0.9
    assert loaded_manager.model.generate_kwargs["attention_mask"].moved_to == "cpu"


def test_chat_uses_role_tag_fallback_without_template(loaded_manager: ModelManager):
    loaded_manager.tokenizer.chat_template = None

    loaded_manager.chat(
        [{"role": "user", "content": "你好"}],
        temperature=0,
        max_new_tokens=8,
        top_p=1,
    )

    assert "<|user|>\n你好" in loaded_manager.tokenizer.encoded_text
    assert loaded_manager.tokenizer.encoded_text.endswith("<|assistant|>\n")
    assert loaded_manager.model.generate_kwargs["do_sample"] is False
    assert "temperature" not in loaded_manager.model.generate_kwargs
    assert "top_p" not in loaded_manager.model.generate_kwargs


def test_chat_requires_loaded_model(manager: ModelManager):
    with pytest.raises(ModelNotLoadedError, match="尚未加载模型"):
        manager.chat([{"role": "user", "content": "你好"}])


def test_chat_rejects_unknown_role_as_input_error(loaded_manager: ModelManager):
    with pytest.raises(GenerationInputError, match="不支持的消息角色"):
        loaded_manager.chat([{"role": "tool", "content": "你好"}])


def test_chat_rejects_empty_message_list(loaded_manager: ModelManager):
    with pytest.raises(GenerationInputError, match="至少需要一条消息"):
        loaded_manager.chat([])


def test_chat_rejects_blank_content(loaded_manager: ModelManager):
    with pytest.raises(GenerationInputError, match="消息内容不能为空"):
        loaded_manager.chat([{"role": "user", "content": "  "}])


def test_chat_wraps_generation_failure(loaded_manager: ModelManager):
    def fail_generate(**kwargs: object) -> FakeTensor:
        raise RuntimeError("secret-prompt-detail")

    loaded_manager.model.generate = fail_generate

    with pytest.raises(GenerationError, match="文本生成失败") as error:
        loaded_manager.chat([{"role": "user", "content": "你好"}])

    assert "secret-prompt-detail" not in str(error.value)


def test_chat_classifies_cuda_out_of_memory(loaded_manager: ModelManager, fake_hf):
    def fail_generate(**kwargs: object) -> FakeTensor:
        raise fake_hf.cuda.OutOfMemoryError("CUDA out of memory")

    loaded_manager.model.generate = fail_generate

    with pytest.raises(GenerationError, match="CUDA 显存不足"):
        loaded_manager.chat([{"role": "user", "content": "你好"}])


def test_unload_is_idempotent(manager: ModelManager, fake_hf):
    assert manager.unload_model() == {"status": "success"}
    assert manager.unload_model() == {"status": "success"}
    assert fake_hf.cuda.empty_cache_calls == 0


def test_concurrent_generations_are_serialized(loaded_manager: ModelManager):
    first_entered = threading.Event()
    second_entered = threading.Event()
    release_generation = threading.Event()
    counter_lock = threading.Lock()
    call_count = 0
    errors: list[Exception] = []

    def blocking_generate(**kwargs: object) -> FakeTensor:
        nonlocal call_count
        with counter_lock:
            call_count += 1
            current_call = call_count
        if current_call == 1:
            first_entered.set()
        else:
            second_entered.set()
        if not release_generation.wait(timeout=2):
            raise RuntimeError("test timed out waiting to release generation")
        return FakeTensor([[1, 2, 7, 8, 9]])

    def run_chat() -> None:
        try:
            loaded_manager.chat([{"role": "user", "content": "你好"}])
        except Exception as exc:
            errors.append(exc)

    loaded_manager.model.generate = blocking_generate
    first = threading.Thread(target=run_chat)
    second = threading.Thread(target=run_chat)

    first.start()
    assert first_entered.wait(timeout=1)
    second.start()
    assert second_entered.wait(timeout=0.2) is False
    release_generation.set()
    first.join(timeout=1)
    second.join(timeout=1)

    assert second_entered.is_set()
    assert first.is_alive() is False
    assert second.is_alive() is False
    assert errors == []


@pytest.mark.parametrize(
    "module_name,exception_expression",
    [
        ("torch", "OSError('missing DLL')"),
        ("transformers", "RuntimeError('incompatible package')"),
    ],
)
def test_broken_optional_dependency_does_not_break_package_import(
    tmp_path: Path, module_name: str, exception_expression: str
):
    (tmp_path / f"{module_name}.py").write_text(
        f"raise {exception_expression}\n", encoding="utf-8"
    )
    project_root = Path(__file__).resolve().parents[1]
    script = (
        "import sys; "
        f"sys.path.insert(0, {str(tmp_path)!r}); "
        "from local_llm.model_manager import ModelManager; "
        "status = ModelManager().status(); "
        "assert status['dependencies_available'] is False; "
        "print('optional dependency unavailable')"
    )

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=project_root,
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "optional dependency unavailable"
