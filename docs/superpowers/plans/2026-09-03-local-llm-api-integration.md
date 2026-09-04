# Local HuggingFace Model API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在闲鱼项目现有 FastAPI 服务中增加四个受 Cookie Session 权限保护的本地 HuggingFace 模型 API，同时保持现有前端、数据库和 AI 自动回复链路不变。

**Architecture:** 新增独立 `local_llm` 包，模型管理器持有进程内单模型实例，路由工厂接收闲鱼项目已有的认证依赖并生成 `/api/local-llm` 路由。模型依赖保持可选，使没有安装 PyTorch/Transformers 的普通闲鱼部署仍能启动和查询模型不可用状态。

**Tech Stack:** Python 3.11+、FastAPI、Pydantic 2、PyTorch 2.2+、Transformers 4.51+、Accelerate 1.x、pytest、FastAPI TestClient

**Spec:** `docs/superpowers/specs/2026-09-03-local-llm-api-integration-design.md`

## Global Constraints

- 工作目录固定为 `D:\claude_project\闲鱼project`，源实现位于 `D:\鱼哥大模型接口`。
- 保留工作树中用户已有的所有修改；禁止重置、覆盖或清理无关文件。
- 每次只用精确路径暂存本任务文件，并在提交前运行 `git diff --cached --name-status`。
- 不修改 `ai_reply_engine.py`、`db_manager.py`、`XianyuAutoAsync.py`、`frontend/` 或 `static/`。
- API 路径固定为 `/api/local-llm/load-model`、`/api/local-llm/status`、`/api/local-llm/chat`、`/api/local-llm/unload-model`。
- 加载和卸载仅管理员可用；状态和聊天允许任意已登录用户使用；匿名访问全部拒绝。
- 单进程内只加载一个模型；加载、推理和卸载互斥；聊天请求串行生成。
- 不实现流式响应、聊天记录持久化、模型目录浏览、模型上传、远程下载或多模型并存。
- 不记录请求中的消息正文。
- 可选依赖版本固定为 `torch>=2.2`、`transformers>=4.51,<6`、`accelerate>=1.0,<2`。
- 保留 `trust_remote_code=True`，并依靠管理员权限限制模型加载操作。

## File Map

- Create `local_llm/__init__.py`：声明本地模型包并导出公共异常与 `ModelManager`。
- Create `local_llm/model_manager.py`：单模型生命周期、路径校验、设备状态、生成和资源释放。
- Create `local_llm/router.py`：Pydantic 请求模型、路由工厂、权限依赖和 HTTP 错误映射。
- Create `requirements-local-llm.txt`：可选模型依赖。
- Create `tests/test_local_llm_manager.py`：不加载真实模型的模型管理器单元测试。
- Create `tests/test_local_llm_api.py`：使用替身管理器的权限、契约和错误映射测试。
- Create `tests/test_local_llm_registration.py`：确认四个路由已注册到主 FastAPI 应用。
- Modify `reply_server.py:1-35`：导入路由工厂。
- Modify `reply_server.py:389-418`：在应用创建后注册本地模型路由。

---

### Task 1: 本地模型管理器与可选依赖

**Files:**
- Create: `local_llm/__init__.py`
- Create: `local_llm/model_manager.py`
- Create: `requirements-local-llm.txt`
- Test: `tests/test_local_llm_manager.py`

**Interfaces:**
- Consumes: 本地 HuggingFace 模型目录；可选的 `torch`、`transformers.AutoTokenizer`、`transformers.AutoModelForCausalLM`。
- Produces: `ModelManager.status() -> dict[str, object]`、`load_model(model_path: str) -> dict[str, object]`、`chat(messages: list[dict[str, str]], temperature: float, max_new_tokens: int, top_p: float) -> str`、`unload_model() -> dict[str, str]`。
- Produces: `ModelManagerError`、`ModelPathError`、`ModelLoadError`、`ModelNotLoadedError`、`GenerationInputError`、`GenerationError`。

- [ ] **Step 1: 建立现有测试基线**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: 记录当前测试的通过数；如果有失败，保存失败测试名和错误，后续只把新增失败或本任务导致的回归视为本任务问题。

- [ ] **Step 2: 写模型管理器失败测试**

用 `apply_patch` 创建 `tests/test_local_llm_manager.py`。从 `D:\鱼哥大模型接口\tests\test_model_manager.py` 移植完整的 `FakeCuda`、`FakeTensor`、`FakeInferenceMode`、`FakeTokenizer`、`FakeModel`、`fake_hf` 和 `loaded_manager` 测试夹具，并把导入改为 `local_llm.model_manager`。测试不得下载或加载真实模型；通过 monkeypatch 替换模块级 `torch`、`AutoTokenizer` 和 `AutoModelForCausalLM`。

保留源测试覆盖的路径校验、分片权重索引、CPU/CUDA 加载、Tokenizer/模型失败、模板/回退模板、只解码新 Token、未加载模型、非法角色、生成失败和幂等卸载。将原英文异常断言改成设计中对应的中文短语，并新增以下测试：

```python
from pathlib import Path
import pytest

import local_llm.model_manager as module
from local_llm.model_manager import (
    GenerationError,
    GenerationInputError,
    ModelLoadError,
    ModelManager,
    ModelNotLoadedError,
    ModelPathError,
)


def test_status_survives_missing_optional_dependencies(monkeypatch):
    monkeypatch.setattr(module, "torch", None)
    monkeypatch.setattr(module, "AutoTokenizer", None)
    monkeypatch.setattr(module, "AutoModelForCausalLM", None)
    status = ModelManager().status()
    assert status["loaded"] is False
    assert status["dependencies_available"] is False
    assert "requirements-local-llm.txt" in status["unavailable_reason"]


@pytest.mark.parametrize("value", ["", "   "])
def test_validate_rejects_empty_path(value):
    with pytest.raises(ModelPathError, match="模型路径不能为空"):
        ModelManager().validate_model_path(value)


def test_invalid_new_path_does_not_unload_active_model(tmp_path):
    manager = ModelManager()
    manager.model = object()
    manager.tokenizer = object()
    with pytest.raises(ModelPathError):
        manager.load_model(str(tmp_path / "missing"))
    assert manager.model is not None
    assert manager.tokenizer is not None


def test_chat_rejects_unknown_role_as_input_error(loaded_manager):
    with pytest.raises(GenerationInputError, match="不支持的消息角色"):
        loaded_manager.chat([{"role": "tool", "content": "你好"}])


def test_chat_rejects_empty_message_list(loaded_manager):
    with pytest.raises(GenerationInputError, match="至少需要一条消息"):
        loaded_manager.chat([])


def test_chat_rejects_blank_content(loaded_manager):
    with pytest.raises(GenerationInputError, match="消息内容不能为空"):
        loaded_manager.chat([{"role": "user", "content": "  "}])
```

在源测试基础上再增加两个 OOM 用例：让 `fake_hf.raise_model_error` 和 `FakeModel.generate()` 分别抛出 `fake_hf.cuda.OutOfMemoryError("CUDA out of memory")`，断言加载抛出 `ModelLoadError`、生成抛出 `GenerationError`，且两条异常消息都包含“CUDA 显存不足”。同时补充对 `apply_chat_template()` 参数 `add_generation_prompt=True`、`return_tensors="pt"`、`return_dict=True` 的断言。

- [ ] **Step 3: 运行测试确认因模块缺失而失败**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_local_llm_manager.py -q
```

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'local_llm'`。

- [ ] **Step 4: 实现模型管理器**

用 `apply_patch` 创建 `local_llm/model_manager.py`。完整移植 `D:\鱼哥大模型接口\model_manager.py` 的已验证实现，并落实以下公共异常、实例字段和行为：

```python
class ModelManagerError(RuntimeError):
    pass


class ModelPathError(ModelManagerError):
    pass


class ModelLoadError(ModelManagerError):
    pass


class ModelNotLoadedError(ModelManagerError):
    pass


class GenerationInputError(ModelManagerError):
    pass


class GenerationError(ModelManagerError):
    pass


class ModelManager:
    def __init__(self) -> None:
        self.model = None
        self.tokenizer = None
        self.model_path: str | None = None
        self.model_name: str | None = None
        self.device: str | None = None
        self._lock = threading.RLock()
```

实现 Interfaces 中列出的全部方法和源实现已有的 `_validate_messages()`、`_encode_messages()`、`_input_device()`、`_unload_locked()`、`_is_cuda_out_of_memory()`、`_cuda_available()` 私有方法。与源实现相比做四项明确调整：

1. `load_model()` 在调用 `_unload_locked()` 前先执行 `path = self.validate_model_path(model_path)`，无效新路径不能卸载当前可用模型。
2. `status()` 始终返回下列字段，并只在可获得时追加 GPU 字段：

```python
{
    "loaded": self.model is not None and self.tokenizer is not None,
    "model_path": self.model_path,
    "model_name": self.model_name,
    "device": self.device,
    "cuda_available": self._cuda_available(),
    "dependencies_available": dependencies_available,
    "unavailable_reason": None if dependencies_available else (
        "本地模型依赖未安装，请运行: "
        "pip install -r requirements-local-llm.txt"
    ),
}
```

3. `_validate_messages()` 对空列表、非法角色和空正文抛出 `GenerationInputError`；模型执行错误才抛出 `GenerationError`。
4. 所有面向 API 的异常消息改成中文，但不要包含消息正文。

用 `apply_patch` 创建 `local_llm/__init__.py`，明确导出公共类型：

```python
from .model_manager import (
    GenerationError,
    GenerationInputError,
    ModelLoadError,
    ModelManager,
    ModelManagerError,
    ModelNotLoadedError,
    ModelPathError,
)

__all__ = [
    "GenerationError",
    "GenerationInputError",
    "ModelLoadError",
    "ModelManager",
    "ModelManagerError",
    "ModelNotLoadedError",
    "ModelPathError",
]
```

用 `apply_patch` 创建 `requirements-local-llm.txt`：

```text
torch>=2.2
transformers>=4.51,<6
accelerate>=1.0,<2
```

- [ ] **Step 5: 运行模型管理器测试**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_local_llm_manager.py -q
```

Expected: PASS，且测试过程中没有网络访问或真实模型加载。

- [ ] **Step 6: 检查并提交 Task 1**

Run:

```powershell
git diff --check -- local_llm requirements-local-llm.txt tests/test_local_llm_manager.py
git add -- local_llm/__init__.py local_llm/model_manager.py requirements-local-llm.txt tests/test_local_llm_manager.py
git diff --cached --name-status
git commit -m "feat: add local HuggingFace model manager"
```

Expected staged paths: 只包含上述四个文件。

---

### Task 2: 带登录权限的本地模型 API 路由

**Files:**
- Create: `local_llm/router.py`
- Test: `tests/test_local_llm_api.py`

**Interfaces:**
- Consumes: Task 1 的 `ModelManager` 和六个领域异常。
- Produces: `create_local_llm_router(require_auth: Callable[..., Any], require_admin: Callable[..., Any], manager: ModelManager | None = None) -> APIRouter`。
- Produces: `Message`、`LoadModelRequest`、`ChatRequest` Pydantic 模型。

- [ ] **Step 1: 写权限和 API 契约失败测试**

用 `apply_patch` 创建 `tests/test_local_llm_api.py`，使用如下替身和应用工厂：

```python
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from local_llm.model_manager import (
    GenerationError,
    ModelLoadError,
    ModelNotLoadedError,
    ModelPathError,
)
from local_llm.router import create_local_llm_router


class FakeManager:
    def __init__(self):
        self.error = None

    def _raise(self):
        if self.error:
            raise self.error

    def status(self):
        self._raise()
        return {"loaded": False, "model_name": None}

    def load_model(self, model_path):
        self._raise()
        return {"status": "success", "model_path": model_path,
                "model_name": "demo", "device": "cpu"}

    def chat(self, messages, temperature=0.7, max_new_tokens=512, top_p=0.9):
        self._raise()
        assert messages[-1] == {"role": "user", "content": "你好"}
        return "模型回复"

    def unload_model(self):
        self._raise()
        return {"status": "success"}


def make_client(role):
    manager = FakeManager()

    def require_auth():
        if role == "anonymous":
            raise HTTPException(status_code=401, detail="未授权访问")
        return {"user_id": 1, "is_admin": role == "admin"}

    def require_admin():
        user = require_auth()
        if not user["is_admin"]:
            raise HTTPException(status_code=403, detail="需要管理员权限")
        return user

    app = FastAPI()
    app.include_router(create_local_llm_router(require_auth, require_admin, manager))
    return TestClient(app), manager


@pytest.mark.parametrize("method,path,json_body", [
    ("get", "/api/local-llm/status", None),
    ("post", "/api/local-llm/chat", {
        "messages": [{"role": "user", "content": "你好"}]
    }),
    ("post", "/api/local-llm/load-model", {"model_path": "D:/models/demo"}),
    ("post", "/api/local-llm/unload-model", None),
])
def test_anonymous_user_cannot_access_any_endpoint(method, path, json_body):
    client, _ = make_client("anonymous")
    response = client.request(method, path, json=json_body)
    assert response.status_code == 401


def test_normal_user_can_get_status_and_chat():
    client, _ = make_client("user")
    assert client.get("/api/local-llm/status").status_code == 200
    response = client.post("/api/local-llm/chat", json={
        "messages": [{"role": "user", "content": "你好"}]
    })
    assert response.status_code == 200
    assert response.json() == {"reply": "模型回复"}


@pytest.mark.parametrize("path,json_body", [
    ("/api/local-llm/load-model", {"model_path": "D:/models/demo"}),
    ("/api/local-llm/unload-model", None),
])
def test_normal_user_cannot_manage_model(path, json_body):
    client, _ = make_client("user")
    assert client.post(path, json=json_body).status_code == 403


def test_admin_can_load_and_unload():
    client, _ = make_client("admin")
    loaded = client.post("/api/local-llm/load-model", json={
        "model_path": "D:/models/demo"
    })
    assert loaded.status_code == 200
    assert loaded.json()["model_name"] == "demo"
    assert client.post("/api/local-llm/unload-model").json() == {"status": "success"}
```

在同一文件增加参数化错误映射测试：

```python
@pytest.mark.parametrize("path,payload,error,status_code", [
    ("/api/local-llm/load-model", {"model_path": "D:/models/demo"},
     ModelPathError("模型目录不存在"), 400),
    ("/api/local-llm/chat", {"messages": [{"role": "user", "content": "你好"}]},
     ModelNotLoadedError("尚未加载模型"), 409),
    ("/api/local-llm/load-model", {"model_path": "D:/models/demo"},
     ModelLoadError("CUDA 显存不足"), 507),
    ("/api/local-llm/chat", {"messages": [{"role": "user", "content": "你好"}]},
     GenerationError("CUDA 显存不足"), 507),
    ("/api/local-llm/load-model", {"model_path": "D:/models/demo"},
     ModelLoadError("模型加载失败"), 500),
    ("/api/local-llm/chat", {"messages": [{"role": "user", "content": "你好"}]},
     GenerationError("生成失败"), 500),
])
def test_domain_errors_are_mapped(path, payload, error, status_code):
    client, manager = make_client("admin")
    manager.error = error
    response = client.post(path, json=payload)
    assert response.status_code == status_code
    assert response.json()["detail"] == str(error)


def test_schema_validation_rejects_out_of_range_values():
    client, _ = make_client("user")
    response = client.post("/api/local-llm/chat", json={
        "messages": [{"role": "user", "content": "你好"}],
        "temperature": 3,
        "max_new_tokens": 0,
        "top_p": 0,
    })
    assert response.status_code == 422
```

此参数表确保 `ModelPathError` 和 `ModelLoadError` 只通过加载端点验证，`ModelNotLoadedError` 和 `GenerationError` 只通过聊天端点验证。

- [ ] **Step 2: 运行测试确认路由模块缺失**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_local_llm_api.py -q
```

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'local_llm.router'`。

- [ ] **Step 3: 实现路由工厂**

用 `apply_patch` 创建 `local_llm/router.py`。实现以下完整路由形态：

```python
from typing import Any, Callable, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .model_manager import (
    GenerationError,
    GenerationInputError,
    ModelLoadError,
    ModelManager,
    ModelManagerError,
    ModelNotLoadedError,
    ModelPathError,
)


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class LoadModelRequest(BaseModel):
    model_path: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1)
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_new_tokens: int = Field(default=512, ge=1, le=4096)
    top_p: float = Field(default=0.9, gt=0, le=1)


DEFAULT_MODEL_MANAGER = ModelManager()


def _http_error(exc: ModelManagerError) -> HTTPException:
    if isinstance(exc, (ModelPathError, GenerationInputError)):
        status_code = 400
    elif isinstance(exc, ModelNotLoadedError):
        status_code = 409
    elif "显存不足" in str(exc) or "out of memory" in str(exc).lower():
        status_code = 507
    else:
        status_code = 500
    return HTTPException(status_code=status_code, detail=str(exc))


def create_local_llm_router(
    require_auth: Callable[..., Any],
    require_admin: Callable[..., Any],
    manager: ModelManager | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api/local-llm", tags=["本地模型"])
    active_manager = manager or DEFAULT_MODEL_MANAGER

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
```

不要添加请求正文日志，不要让路由模块导入 `reply_server.py`。

- [ ] **Step 4: 运行路由测试**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_local_llm_api.py -q
```

Expected: PASS，覆盖 401、403、400、409、422、500、507 和成功响应。

- [ ] **Step 5: 联合运行本地模型测试**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_local_llm_manager.py tests/test_local_llm_api.py -q
```

Expected: PASS。

- [ ] **Step 6: 检查并提交 Task 2**

Run:

```powershell
git diff --check -- local_llm/router.py tests/test_local_llm_api.py
git add -- local_llm/router.py tests/test_local_llm_api.py
git diff --cached --name-status
git commit -m "feat: add authenticated local LLM routes"
```

Expected staged paths: 只包含 `local_llm/router.py` 和 `tests/test_local_llm_api.py`。

---

### Task 3: 注册路由并执行回归验证

**Files:**
- Modify: `reply_server.py:1-35`
- Modify: `reply_server.py:389-418`
- Test: `tests/test_local_llm_registration.py`

**Interfaces:**
- Consumes: Task 2 的 `create_local_llm_router()`，以及 `reply_server.py` 现有的 `require_auth`、`require_admin` 和 `app`。
- Produces: 主应用中的四个 `/api/local-llm/*` 路由。

- [ ] **Step 1: 写主应用路由注册失败测试**

用 `apply_patch` 创建 `tests/test_local_llm_registration.py`：

```python
def test_reply_server_registers_local_llm_routes():
    from reply_server import app

    paths = {route.path for route in app.routes}
    assert {
        "/api/local-llm/load-model",
        "/api/local-llm/status",
        "/api/local-llm/chat",
        "/api/local-llm/unload-model",
    } <= paths
```

- [ ] **Step 2: 运行测试确认四个路由尚未注册**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_local_llm_registration.py -q
```

Expected: FAIL，断言显示四个 `/api/local-llm/*` 路径缺失。若导入主应用暴露的是与本任务无关的既有环境错误，先记录并改用下面的进程级路由检查作为验收，不修改无关业务代码。

- [ ] **Step 3: 在主 FastAPI 应用注册路由**

用 `apply_patch` 在 `reply_server.py` 的其他项目导入附近增加：

```python
from local_llm.router import create_local_llm_router
```

在 `app = FastAPI(...)` 创建完成后、CORS 中间件配置前增加：

```python
app.include_router(
    create_local_llm_router(
        require_auth=require_auth,
        require_admin=require_admin,
    )
)
logger.info("✅ 已注册本地模型 API 路由: /api/local-llm")
```

不要改动 `reply_server.py` 中相邻的用户代码；应用补丁前后分别查看目标上下文和局部 diff。

- [ ] **Step 4: 运行注册测试和进程级路由检查**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_local_llm_registration.py -q
.\.venv\Scripts\python.exe -c "from reply_server import app; expected={'/api/local-llm/load-model','/api/local-llm/status','/api/local-llm/chat','/api/local-llm/unload-model'}; actual={r.path for r in app.routes}; assert expected <= actual; print('local LLM routes registered')"
```

Expected: 测试 PASS，命令输出 `local LLM routes registered`。

- [ ] **Step 5: 运行本地模型相关测试**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_local_llm_manager.py tests/test_local_llm_api.py tests/test_local_llm_registration.py -q
```

Expected: PASS。

- [ ] **Step 6: 运行原项目完整回归测试**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: 相比 Task 1 记录的基线没有新增失败；若基线全绿，则此处也必须全绿。

- [ ] **Step 7: 检查范围与敏感日志**

Run:

```powershell
git diff --check -- reply_server.py tests/test_local_llm_registration.py
git diff --name-only
rg -n "messages|content" local_llm
```

Expected:

- 本任务新增或修改的文件只来自 File Map。
- `rg` 只命中请求字段、校验和向模型传递消息的代码，不存在记录消息正文的日志语句。
- `git diff --check` 无输出并返回 0。

- [ ] **Step 8: 检查并提交 Task 3**

Run:

```powershell
git add -- tests/test_local_llm_registration.py
git add -p -- reply_server.py
git diff --cached --name-status
git diff --cached --check
git diff --cached -- reply_server.py
git commit -m "feat: register local LLM API"
```

Expected staged paths: 只包含 `reply_server.py` 和 `tests/test_local_llm_registration.py`，其中 `reply_server.py` 的暂存 diff 只能包含本任务的导入和路由注册。由于该文件已有用户修改，必须在交互式暂存中拒绝所有无关 hunk；如果本任务 hunk 与用户 hunk 重叠而无法安全拆分，则取消本次提交并报告，不得把用户的其他修改带入提交。

## Final Verification

完成三个任务后，执行：

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_local_llm_manager.py tests/test_local_llm_api.py tests/test_local_llm_registration.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -c "from reply_server import app; print(sorted(r.path for r in app.routes if r.path.startswith('/api/local-llm')))"
git status --short --branch
git log -4 --oneline
```

最终报告必须列出：新增接口、权限矩阵、测试通过数、未安装模型依赖时的行为、真实大模型尚未加载验证的限制，以及仍属于用户的原有未提交文件。不得在没有真实输出的情况下声称测试通过或模型已成功加载。
