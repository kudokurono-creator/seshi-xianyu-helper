"""单个本地 HuggingFace 因果语言模型的生命周期与推理管理。"""

from __future__ import annotations

import gc
import json
import threading
from pathlib import Path
from typing import Any

try:
    import torch
except (ImportError, OSError, RuntimeError):
    torch = None  # type: ignore[assignment]

try:
    from transformers import AutoModelForCausalLM, AutoTokenizer
except (ImportError, OSError, RuntimeError):
    AutoModelForCausalLM = None  # type: ignore[assignment,misc]
    AutoTokenizer = None  # type: ignore[assignment,misc]

try:
    import accelerate  # noqa: F401
except (ImportError, OSError, RuntimeError):
    accelerate = None  # type: ignore[assignment]


class ModelManagerError(RuntimeError):
    """本地模型管理错误基类。"""


class ModelPathError(ModelManagerError):
    """模型目录无效或文件不完整。"""


class ModelLoadError(ModelManagerError):
    """分词器或模型权重加载失败。"""


class ModelNotLoadedError(ModelManagerError):
    """尚未加载可供推理的模型。"""


class GenerationInputError(ModelManagerError):
    """聊天输入不符合模型管理器约束。"""


class GenerationError(ModelManagerError):
    """文本生成过程失败。"""


class ModelManager:
    """持有应用进程内唯一的模型和分词器实例。"""

    def __init__(self) -> None:
        self.model: Any | None = None
        self.tokenizer: Any | None = None
        self.model_path: str | None = None
        self.model_name: str | None = None
        self.device: str | None = None
        self._lock = threading.RLock()

    def validate_model_path(self, model_path: str) -> Path:
        """验证并返回规范化后的本地 HuggingFace 模型目录。"""
        if not model_path or not model_path.strip():
            raise ModelPathError("模型路径不能为空")

        path = Path(model_path.strip()).expanduser()
        if not path.exists() or not path.is_dir():
            raise ModelPathError("模型目录不存在或不是文件夹")
        if not (path / "config.json").is_file():
            raise ModelPathError("模型目录缺少 config.json")

        weight_files = list(path.glob("*.safetensors")) + list(
            path.glob("pytorch_model*.bin")
        )
        weight_indexes = (
            path / "model.safetensors.index.json",
            path / "pytorch_model.bin.index.json",
        )
        existing_indexes = [item for item in weight_indexes if item.is_file()]
        if not weight_files and not existing_indexes:
            raise ModelPathError("模型目录中未找到 HuggingFace 权重文件")
        for index_path in existing_indexes:
            self._validate_weight_index(path, index_path)

        return path.resolve()

    def status(self) -> dict[str, object]:
        """返回模型、可选依赖和 GPU 的当前状态。"""
        with self._lock:
            dependencies_available = (
                torch is not None
                and AutoTokenizer is not None
                and AutoModelForCausalLM is not None
                and accelerate is not None
            )
            result: dict[str, object] = {
                "loaded": self.model is not None and self.tokenizer is not None,
                "model_path": self.model_path,
                "model_name": self.model_name,
                "device": self.device,
                "cuda_available": self._cuda_available(),
                "dependencies_available": dependencies_available,
                "unavailable_reason": None
                if dependencies_available
                else (
                    "本地模型依赖未安装，请运行: "
                    "pip install -r requirements-local-llm.txt"
                ),
            }

            if not result["cuda_available"] or torch is None:
                return result

            try:
                result["gpu_name"] = torch.cuda.get_device_name(0)
            except Exception:
                pass
            try:
                allocated = torch.cuda.memory_allocated(0) / (1024**2)
                result["gpu_memory_allocated"] = f"{allocated:.0f} MiB"
            except Exception:
                pass
            try:
                reserved = torch.cuda.memory_reserved(0) / (1024**2)
                result["gpu_memory_reserved"] = f"{reserved:.0f} MiB"
            except Exception:
                pass

            return result

    def load_model(self, model_path: str) -> dict[str, object]:
        """校验目录、释放旧模型并加载一个本地模型。"""
        with self._lock:
            path = self.validate_model_path(model_path)

            if (
                AutoTokenizer is None
                or AutoModelForCausalLM is None
                or torch is None
            ):
                raise ModelLoadError(
                    "本地模型依赖未安装，请运行: "
                    "pip install -r requirements-local-llm.txt"
                )

            self._unload_locked()

            try:
                tokenizer = AutoTokenizer.from_pretrained(
                    str(path), trust_remote_code=True
                )
            except Exception as exc:
                self._unload_locked()
                raise ModelLoadError(
                    "分词器加载失败，请检查分词器文件、自定义模型代码和 "
                    "Transformers 版本"
                ) from exc

            try:
                model_kwargs: dict[str, object] = {
                    "trust_remote_code": True,
                    "torch_dtype": "auto",
                }
                cuda_available = self._cuda_available()
                if cuda_available:
                    model_kwargs["device_map"] = "auto"

                model = AutoModelForCausalLM.from_pretrained(
                    str(path), **model_kwargs
                )
                if not cuda_available:
                    model.to("cpu")
                model.eval()
            except Exception as exc:
                self._unload_locked()
                if self._is_cuda_out_of_memory(exc):
                    raise ModelLoadError(
                        "CUDA 显存不足，无法加载模型。请关闭占用 GPU 的程序、"
                        "改用更小的模型或使用 CPU。"
                    ) from exc
                raise ModelLoadError(
                    "模型权重加载失败，请检查文件完整性和 Transformers 兼容性"
                ) from exc

            self.tokenizer = tokenizer
            self.model = model
            self.model_path = str(path)
            self.model_name = path.name
            self.device = "cuda" if cuda_available else "cpu"

            return {
                "status": "success",
                "model_path": self.model_path,
                "model_name": self.model_name,
                "device": self.device,
            }

    def unload_model(self) -> dict[str, str]:
        """释放当前模型和可回收的加速器缓存。"""
        with self._lock:
            self._unload_locked()
        return {"status": "success"}

    def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_new_tokens: int = 512,
        top_p: float = 0.9,
    ) -> str:
        """根据调用方提供的完整对话生成一条助手回复。"""
        with self._lock:
            if self.model is None or self.tokenizer is None:
                raise ModelNotLoadedError("尚未加载模型")
            if torch is None:
                raise GenerationError(
                    "本地模型依赖未安装，请运行: "
                    "pip install -r requirements-local-llm.txt"
                )

            self._validate_messages(messages)

            try:
                encoded = self._encode_messages(messages)
                input_ids = encoded["input_ids"]
                attention_mask = encoded.get("attention_mask")
                input_device = self._input_device()
                input_ids = input_ids.to(input_device)
                if attention_mask is not None:
                    attention_mask = attention_mask.to(input_device)

                generation_kwargs: dict[str, object] = {
                    "input_ids": input_ids,
                    "max_new_tokens": max_new_tokens,
                    "do_sample": temperature > 0,
                }
                if attention_mask is not None:
                    generation_kwargs["attention_mask"] = attention_mask
                if temperature > 0:
                    generation_kwargs.update(
                        temperature=temperature,
                        top_p=top_p,
                    )

                pad_token_id = getattr(self.tokenizer, "pad_token_id", None)
                if pad_token_id is None:
                    pad_token_id = getattr(self.tokenizer, "eos_token_id", None)
                if pad_token_id is not None:
                    generation_kwargs["pad_token_id"] = pad_token_id

                with torch.inference_mode():
                    generated = self.model.generate(**generation_kwargs)

                new_tokens = generated[0, input_ids.shape[-1] :]
                return self.tokenizer.decode(
                    new_tokens,
                    skip_special_tokens=True,
                ).strip()
            except ModelManagerError:
                raise
            except Exception as exc:
                if self._is_cuda_out_of_memory(exc):
                    raise GenerationError(
                        "CUDA 显存不足，无法生成回复。请减少 max_new_tokens、"
                        "关闭占用 GPU 的程序或改用更小的模型。"
                    ) from exc
                raise GenerationError("文本生成失败") from exc

    @staticmethod
    def _validate_weight_index(model_dir: Path, index_path: Path) -> None:
        """确认分片索引有效，且引用的每个权重分片都位于模型目录内。"""
        try:
            payload = json.loads(index_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise ModelPathError("分片权重索引无法读取或格式无效") from exc

        weight_map = payload.get("weight_map") if isinstance(payload, dict) else None
        if not isinstance(weight_map, dict) or not weight_map:
            raise ModelPathError("分片权重索引缺少有效的 weight_map")

        resolved_model_dir = model_dir.resolve()
        raw_shard_names = list(weight_map.values())
        if not raw_shard_names or any(
            not isinstance(name, str) or not name.strip() for name in raw_shard_names
        ):
            raise ModelPathError("分片权重索引包含无效的分片文件名")

        for shard_name in set(raw_shard_names):
            shard_path = (resolved_model_dir / shard_name).resolve()
            if (
                not shard_path.is_relative_to(resolved_model_dir)
                or not shard_path.is_file()
            ):
                raise ModelPathError("分片权重索引引用了缺失或越界的权重文件")

    @staticmethod
    def _validate_messages(messages: list[dict[str, str]]) -> None:
        if not messages:
            raise GenerationInputError("至少需要一条消息")

        allowed_roles = {"system", "user", "assistant"}
        for message in messages:
            role = message.get("role")
            content = message.get("content")
            if role not in allowed_roles:
                raise GenerationInputError(f"不支持的消息角色: {role}")
            if not isinstance(content, str) or not content.strip():
                raise GenerationInputError("消息内容不能为空")

    def _encode_messages(self, messages: list[dict[str, str]]) -> Any:
        chat_template = getattr(self.tokenizer, "chat_template", None)
        apply_template = getattr(self.tokenizer, "apply_chat_template", None)
        if chat_template and callable(apply_template):
            try:
                return apply_template(
                    messages,
                    add_generation_prompt=True,
                    return_tensors="pt",
                    return_dict=True,
                )
            except (ValueError, TypeError):
                pass

        prompt = "".join(
            f"<|{message['role']}|>\n{message['content']}\n"
            for message in messages
        )
        prompt += "<|assistant|>\n"
        return self.tokenizer(prompt, return_tensors="pt")

    def _input_device(self) -> Any:
        try:
            return self.model.get_input_embeddings().weight.device
        except (AttributeError, RuntimeError):
            return getattr(self.model, "device", "cpu")

    def _unload_locked(self) -> None:
        self.model = None
        self.tokenizer = None
        self.model_path = None
        self.model_name = None
        self.device = None
        gc.collect()

        if torch is not None and self._cuda_available():
            try:
                torch.cuda.empty_cache()
            except Exception:
                pass

    @staticmethod
    def _is_cuda_out_of_memory(exc: Exception) -> bool:
        if torch is not None:
            try:
                if isinstance(exc, torch.cuda.OutOfMemoryError):
                    return True
            except (AttributeError, TypeError):
                pass
        message = str(exc).lower()
        return "out of memory" in message and "cuda" in message

    @staticmethod
    def _cuda_available() -> bool:
        if torch is None:
            return False
        try:
            return bool(torch.cuda.is_available())
        except Exception:
            return False
