from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from local_llm.model_manager import (
    GenerationError,
    GenerationInputError,
    ModelLoadError,
    ModelNotLoadedError,
    ModelPathError,
)
from local_llm.router import (
    LocalLLMRequestSizeLimitMiddleware,
    create_local_llm_router,
    install_local_llm_validation_handler,
)


class FakeManager:
    def __init__(self) -> None:
        self.error: Exception | None = None
        self.last_chat: dict[str, Any] | None = None

    def _raise(self) -> None:
        if self.error:
            raise self.error

    def status(self) -> dict[str, object]:
        self._raise()
        return {
            "loaded": False,
            "model_path": None,
            "model_name": None,
            "device": None,
            "cuda_available": False,
            "dependencies_available": True,
            "unavailable_reason": None,
        }

    def load_model(self, model_path: str) -> dict[str, object]:
        self._raise()
        return {
            "status": "success",
            "model_path": model_path,
            "model_name": "demo",
            "device": "cpu",
        }

    def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_new_tokens: int = 512,
        top_p: float = 0.9,
    ) -> str:
        self._raise()
        self.last_chat = {
            "messages": messages,
            "temperature": temperature,
            "max_new_tokens": max_new_tokens,
            "top_p": top_p,
        }
        return "模型回复"

    def unload_model(self) -> dict[str, str]:
        self._raise()
        return {"status": "success"}


def make_client(
    role: str,
) -> tuple[TestClient, FakeManager, dict[str, str], list[tuple[str, str, str]]]:
    manager = FakeManager()
    settings: dict[str, str] = {}
    writes: list[tuple[str, str, str]] = []

    def require_auth() -> dict[str, object]:
        if role == "anonymous":
            raise HTTPException(status_code=401, detail="未授权访问")
        return {"user_id": 1, "is_admin": role == "admin"}

    def require_admin() -> dict[str, object]:
        user = require_auth()
        if not user["is_admin"]:
            raise HTTPException(status_code=403, detail="需要管理员权限")
        return user

    def get_setting(key: str) -> str | None:
        return settings.get(key)

    def set_setting(key: str, value: str, description: str | None = None) -> bool:
        settings[key] = value
        writes.append((key, value, description or ""))
        return True

    app = FastAPI()
    install_local_llm_validation_handler(app)
    app.add_middleware(LocalLLMRequestSizeLimitMiddleware)
    app.include_router(
        create_local_llm_router(
            require_auth=require_auth,
            require_admin=require_admin,
            manager=manager,
            get_setting=get_setting,
            set_setting=set_setting,
        )
    )
    return TestClient(app), manager, settings, writes


@pytest.mark.parametrize(
    "method,path,json_body",
    [
        ("get", "/api/local-llm/status", None),
        (
            "post",
            "/api/local-llm/chat",
            {"messages": [{"role": "user", "content": "你好"}]},
        ),
        (
            "post",
            "/api/local-llm/load-model",
            {"model_path": "D:/models/demo"},
        ),
        ("post", "/api/local-llm/unload-model", None),
    ],
)
def test_anonymous_user_cannot_access_any_endpoint(method, path, json_body):
    client, _, _, _ = make_client("anonymous")

    response = client.request(method, path, json=json_body)

    assert response.status_code == 401


def test_normal_user_can_get_status_and_chat():
    client, manager, _, _ = make_client("user")

    assert client.get("/api/local-llm/status").status_code == 200
    response = client.post(
        "/api/local-llm/chat",
        json={
            "messages": [{"role": "user", "content": "你好"}],
            "temperature": 0.2,
            "max_new_tokens": 128,
            "top_p": 0.8,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"reply": "模型回复"}
    assert manager.last_chat == {
        "messages": [{"role": "user", "content": "你好"}],
        "temperature": 0.2,
        "max_new_tokens": 128,
        "top_p": 0.8,
    }


@pytest.mark.parametrize(
    "path,json_body",
    [
        ("/api/local-llm/load-model", {"model_path": "D:/models/demo"}),
        ("/api/local-llm/unload-model", None),
    ],
)
def test_normal_user_cannot_manage_model(path, json_body):
    client, _, _, _ = make_client("user")

    response = client.post(path, json=json_body)

    assert response.status_code == 403


def test_admin_can_load_and_unload():
    client, _, _, _ = make_client("admin")

    loaded = client.post(
        "/api/local-llm/load-model",
        json={"model_path": "D:/models/demo"},
    )
    unloaded = client.post("/api/local-llm/unload-model")

    assert loaded.status_code == 200
    assert loaded.json()["model_name"] == "demo"
    assert unloaded.status_code == 200
    assert unloaded.json() == {"status": "success"}


def test_logged_in_user_can_read_default_local_llm_config():
    client, _, _, _ = make_client("user")

    response = client.get("/api/local-llm/config")

    assert response.status_code == 200
    assert response.json() == {
        "model_path": "",
        "system_prompt": "你是一个有帮助的助手。",
        "temperature": 0.7,
        "top_p": 0.9,
        "max_new_tokens": 512,
    }


def test_admin_saves_local_llm_config_without_loading_model():
    client, manager, settings, writes = make_client("admin")
    payload = {
        "model_path": "D:/models/Qwen",
        "system_prompt": "你是闲鱼客服助手。",
        "temperature": 0.4,
        "top_p": 0.85,
        "max_new_tokens": 1024,
    }

    response = client.put("/api/local-llm/config", json=payload)

    assert response.status_code == 200
    assert response.json() == payload
    assert manager.last_chat is None
    assert settings == {
        "local_llm_model_path": "D:/models/Qwen",
        "local_llm_system_prompt": "你是闲鱼客服助手。",
        "local_llm_temperature": "0.4",
        "local_llm_top_p": "0.85",
        "local_llm_max_new_tokens": "1024",
    }
    assert len(writes) == 5


def test_normal_user_cannot_save_local_llm_config():
    client, _, _, _ = make_client("user")

    response = client.put(
        "/api/local-llm/config",
        json={"model_path": "D:/models/Qwen"},
    )

    assert response.status_code == 403


@pytest.mark.parametrize(
    "field,value",
    [
        ("temperature", 2.1),
        ("top_p", 0),
        ("max_new_tokens", 0),
        ("system_prompt", "x" * 8001),
        ("model_path", "x" * 1025),
    ],
)
def test_local_llm_config_rejects_invalid_values(field, value):
    client, _, _, _ = make_client("admin")
    payload = {
        "model_path": "",
        "system_prompt": "你是一个有帮助的助手。",
        "temperature": 0.7,
        "top_p": 0.9,
        "max_new_tokens": 512,
    }
    payload[field] = value

    response = client.put("/api/local-llm/config", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "path,payload,error,status_code,public_detail",
    [
        (
            "/api/local-llm/load-model",
            {"model_path": "D:/models/demo"},
            ModelPathError("模型目录不存在"),
            400,
            "模型目录不存在",
        ),
        (
            "/api/local-llm/chat",
            {"messages": [{"role": "user", "content": "你好"}]},
            ModelNotLoadedError("尚未加载模型"),
            409,
            "尚未加载模型",
        ),
        (
            "/api/local-llm/chat",
            {"messages": [{"role": "user", "content": " "}]},
            GenerationInputError("消息内容不能为空"),
            400,
            "消息内容不能为空",
        ),
        (
            "/api/local-llm/load-model",
            {"model_path": "D:/models/demo"},
            ModelLoadError("CUDA 显存不足 secret-load-detail"),
            507,
            "CUDA 显存不足，无法完成请求",
        ),
        (
            "/api/local-llm/chat",
            {"messages": [{"role": "user", "content": "你好"}]},
            GenerationError("CUDA out of memory secret-prompt-detail"),
            507,
            "CUDA 显存不足，无法完成请求",
        ),
        (
            "/api/local-llm/load-model",
            {"model_path": "D:/models/demo"},
            ModelLoadError("模型加载失败 secret-load-detail"),
            500,
            "模型加载失败",
        ),
        (
            "/api/local-llm/chat",
            {"messages": [{"role": "user", "content": "你好"}]},
            GenerationError("生成失败 secret-prompt-detail"),
            500,
            "文本生成失败",
        ),
    ],
)
def test_domain_errors_are_mapped(path, payload, error, status_code, public_detail):
    client, manager, _, _ = make_client("admin")
    manager.error = error

    response = client.post(path, json=payload)

    assert response.status_code == status_code
    assert response.json()["detail"] == public_detail
    assert "secret" not in response.json()["detail"]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"messages": []},
        {"messages": [{"role": "tool", "content": "你好"}]},
        {
            "messages": [{"role": "user", "content": "你好"}],
            "temperature": 3,
        },
        {
            "messages": [{"role": "user", "content": "你好"}],
            "max_new_tokens": 0,
        },
        {
            "messages": [{"role": "user", "content": "你好"}],
            "top_p": 0,
        },
    ],
)
def test_chat_schema_rejects_invalid_payload(payload):
    client, _, _, _ = make_client("user")

    response = client.post("/api/local-llm/chat", json=payload)

    assert response.status_code == 422


def test_load_schema_rejects_missing_or_empty_path():
    client, _, _, _ = make_client("admin")

    assert client.post("/api/local-llm/load-model", json={}).status_code == 422
    assert (
        client.post(
            "/api/local-llm/load-model", json={"model_path": ""}
        ).status_code
        == 422
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"messages": [{"role": "user", "content": "x" * 16001}]},
        {"messages": [{"role": "user", "content": "x"}] * 65},
        {"messages": [{"role": "user", "content": "x" * 15000}] * 5},
    ],
)
def test_chat_rejects_resource_exhausting_input(payload):
    client, _, _, _ = make_client("user")

    response = client.post("/api/local-llm/chat", json=payload)

    assert response.status_code == 422


def test_validation_error_does_not_echo_message_content():
    client, _, _, _ = make_client("user")
    secret_message = "do-not-echo-this-message"

    response = client.post(
        "/api/local-llm/chat",
        json={"messages": [{"role": "tool", "content": secret_message}]},
    )

    assert response.status_code == 422
    assert secret_message not in response.text
    assert all("input" not in error for error in response.json()["detail"])


def test_request_body_limit_returns_413_before_parsing():
    client, _, _, _ = make_client("user")
    oversized = {"messages": [{"role": "user", "content": "x" * 70_000}]}

    response = client.post("/api/local-llm/chat", json=oversized)

    assert response.status_code == 413
    assert response.json() == {"detail": "本地模型请求体过大"}
