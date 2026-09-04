"""受闲鱼系统登录态保护的本地模型 API 路由。"""

from __future__ import annotations

import json
from typing import Any, Callable, Literal, Self

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message as ASGIMessage, Receive, Scope, Send
from pydantic import BaseModel, Field, model_validator

from .model_manager import (
    GenerationError,
    GenerationInputError,
    ModelLoadError,
    ModelManager,
    ModelManagerError,
    ModelNotLoadedError,
    ModelPathError,
)


MAX_MESSAGES = 64
MAX_MESSAGE_CHARS = 16_000
MAX_TOTAL_MESSAGE_CHARS = 64_000
MAX_REQUEST_BODY_BYTES = 64 * 1024
MAX_VALIDATION_BODY_BYTES = 80 * 1024

LOCAL_LLM_CONFIG_KEYS = {
    "model_path": "local_llm_model_path",
    "system_prompt": "local_llm_system_prompt",
    "temperature": "local_llm_temperature",
    "top_p": "local_llm_top_p",
    "max_new_tokens": "local_llm_max_new_tokens",
}
LOCAL_LLM_CONFIG_DEFAULTS = {
    "model_path": "",
    "system_prompt": "你是一个有帮助的助手。",
    "temperature": 0.7,
    "top_p": 0.9,
    "max_new_tokens": 512,
}


class LocalLLMRequestSizeLimitMiddleware:
    """限制本地模型接口请求体大小，避免解析前的资源消耗。"""

    def __init__(self, app: ASGIApp, max_body_bytes: int = MAX_REQUEST_BODY_BYTES) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http" or not str(scope.get("path", "")).startswith(
            "/api/local-llm/"
        ):
            await self.app(scope, receive, send)
            return

        body_messages: list[ASGIMessage] = []
        received = 0
        while True:
            message = await receive()
            body_messages.append(message)
            if message.get("type") != "http.request":
                break
            received += len(message.get("body", b""))
            if received > MAX_VALIDATION_BODY_BYTES:
                await self._reject(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        if received > self.max_body_bytes and not self._defer_structured_validation(
            body_messages
        ):
            await self._reject(scope, receive, send)
            return

        replay_index = 0

        async def replay_receive() -> ASGIMessage:
            nonlocal replay_index
            if replay_index < len(body_messages):
                message = body_messages[replay_index]
                replay_index += 1
                return message
            return {"type": "http.disconnect"}

        await self.app(scope, replay_receive, send)

    @staticmethod
    def _defer_structured_validation(messages: list[ASGIMessage]) -> bool:
        """Allow bounded chat payloads to reach Pydantic for precise 422 errors."""
        raw_body = b"".join(
            message.get("body", b"")
            for message in messages
            if message.get("type") == "http.request"
        )
        try:
            payload = json.loads(raw_body)
            entries = payload.get("messages") if isinstance(payload, dict) else None
            if not isinstance(entries, list) or not entries:
                return False
            if len(entries) > MAX_MESSAGES:
                return False
            contents = [
                item.get("content")
                for item in entries
                if isinstance(item, dict)
            ]
            return (
                len(contents) == len(entries)
                and all(isinstance(content, str) for content in contents)
                and all(len(content) <= MAX_MESSAGE_CHARS for content in contents)
                and sum(len(content) for content in contents) <= MAX_TOTAL_MESSAGE_CHARS + MAX_MESSAGE_CHARS
            )
        except (UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
            return False

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse({"detail": "本地模型请求体过大"}, status_code=413)
        await response(scope, receive, send)


def install_local_llm_validation_handler(app: Any) -> None:
    """为本地模型路由安装不回显请求正文的 422 处理器。"""

    @app.exception_handler(RequestValidationError)
    async def local_llm_validation_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        if not request.url.path.startswith("/api/local-llm/"):
            return await request_validation_exception_handler(request, exc)
        detail = [
            {
                "loc": error.get("loc", ()),
                "msg": error.get("msg", "请求参数无效"),
                "type": error.get("type", "value_error"),
            }
            for error in exc.errors()
        ]
        return JSONResponse({"detail": detail}, status_code=422)


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class LocalLLMConfig(BaseModel):
    model_path: str = Field(default="", max_length=1024)
    system_prompt: str = Field(
        default=LOCAL_LLM_CONFIG_DEFAULTS["system_prompt"], max_length=8000
    )
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float = Field(default=0.9, gt=0, le=1)
    max_new_tokens: int = Field(default=512, ge=1, le=4096)


class LoadModelRequest(BaseModel):
    model_path: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=MAX_MESSAGES)
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_new_tokens: int = Field(default=512, ge=1, le=4096)
    top_p: float = Field(default=0.9, gt=0, le=1)

    @model_validator(mode="after")
    def validate_total_message_size(self) -> Self:
        if sum(len(message.content) for message in self.messages) > MAX_TOTAL_MESSAGE_CHARS:
            raise ValueError(
                f"消息总长度不能超过 {MAX_TOTAL_MESSAGE_CHARS} 个字符"
            )
        return self


DEFAULT_MODEL_MANAGER = ModelManager()


def _http_error(exc: ModelManagerError) -> HTTPException:
    if isinstance(exc, (ModelPathError, GenerationInputError)):
        status_code = 400
        detail = str(exc)
    elif isinstance(exc, ModelNotLoadedError):
        status_code = 409
        detail = "尚未加载模型"
    elif "显存不足" in str(exc) or "out of memory" in str(exc).lower():
        status_code = 507
        detail = "CUDA 显存不足，无法完成请求"
    elif isinstance(exc, ModelLoadError):
        status_code = 500
        detail = "模型加载失败"
    elif isinstance(exc, GenerationError):
        status_code = 500
        detail = "文本生成失败"
    else:
        status_code = 500
        detail = "本地模型服务错误"
    return HTTPException(status_code=status_code, detail=detail)


def create_local_llm_router(
    require_auth: Callable[..., Any],
    require_admin: Callable[..., Any],
    manager: ModelManager | None = None,
    get_setting: Callable[[str], str | None] | None = None,
    set_setting: Callable[[str, str, str | None], bool] | None = None,
) -> APIRouter:
    """创建复用宿主项目认证依赖的本地模型路由。"""
    router = APIRouter(prefix="/api/local-llm", tags=["本地模型"])
    active_manager = manager or DEFAULT_MODEL_MANAGER

    def read_config() -> LocalLLMConfig:
        values: dict[str, object] = dict(LOCAL_LLM_CONFIG_DEFAULTS)
        if get_setting is None:
            return LocalLLMConfig(**values)
        try:
            path_value = get_setting(LOCAL_LLM_CONFIG_KEYS["model_path"])
            prompt_value = get_setting(LOCAL_LLM_CONFIG_KEYS["system_prompt"])
            temperature_value = get_setting(LOCAL_LLM_CONFIG_KEYS["temperature"])
            top_p_value = get_setting(LOCAL_LLM_CONFIG_KEYS["top_p"])
            max_tokens_value = get_setting(LOCAL_LLM_CONFIG_KEYS["max_new_tokens"])
            if path_value is not None:
                values["model_path"] = path_value
            if prompt_value is not None:
                values["system_prompt"] = prompt_value
            if temperature_value is not None:
                values["temperature"] = float(temperature_value)
            if top_p_value is not None:
                values["top_p"] = float(top_p_value)
            if max_tokens_value is not None:
                values["max_new_tokens"] = int(max_tokens_value)
            return LocalLLMConfig(**values)
        except (TypeError, ValueError, OverflowError):
            return LocalLLMConfig(**LOCAL_LLM_CONFIG_DEFAULTS)

    @router.get("/config", dependencies=[Depends(require_auth)])
    def get_config() -> LocalLLMConfig:
        return read_config()

    @router.put("/config", dependencies=[Depends(require_admin)])
    def update_config(request: LocalLLMConfig) -> LocalLLMConfig:
        if set_setting is None:
            raise HTTPException(status_code=500, detail="本地模型配置保存失败")
        descriptions = {
            "model_path": "本地 HuggingFace 模型目录",
            "system_prompt": "本地模型测试默认系统提示词",
            "temperature": "本地模型测试温度",
            "top_p": "本地模型测试 Top P",
            "max_new_tokens": "本地模型测试最大生成字数",
        }
        try:
            values = request.model_dump()
            for field, key in LOCAL_LLM_CONFIG_KEYS.items():
                if not set_setting(
                    key, str(values[field]), descriptions[field]
                ):
                    raise RuntimeError("settings write failed")
        except Exception as exc:
            raise HTTPException(status_code=500, detail="本地模型配置保存失败") from exc
        return request

    @router.get("/status", dependencies=[Depends(require_auth)])
    def get_status() -> dict[str, object]:
        return active_manager.status()

    @router.post("/load-model", dependencies=[Depends(require_admin)])
    def load_model(request: LoadModelRequest) -> dict[str, object]:
        try:
            return active_manager.load_model(request.model_path)
        except (ModelPathError, ModelLoadError) as exc:
            raise _http_error(exc) from exc

    @router.post("/chat", dependencies=[Depends(require_auth)])
    def chat(request: ChatRequest) -> dict[str, str]:
        try:
            reply = active_manager.chat(
                messages=[message.model_dump() for message in request.messages],
                temperature=request.temperature,
                max_new_tokens=request.max_new_tokens,
                top_p=request.top_p,
            )
            return {"reply": reply}
        except (ModelNotLoadedError, GenerationInputError, GenerationError) as exc:
            raise _http_error(exc) from exc

    @router.post("/unload-model", dependencies=[Depends(require_admin)])
    def unload_model() -> dict[str, str]:
        try:
            return active_manager.unload_model()
        except ModelManagerError as exc:
            raise _http_error(exc) from exc

    return router
