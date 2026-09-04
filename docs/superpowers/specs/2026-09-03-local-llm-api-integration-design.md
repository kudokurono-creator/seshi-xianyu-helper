# 本地 HuggingFace 模型 API 接入设计

日期：2026-09-03

## 目标

将 `D:\鱼哥大模型接口` 中已经验证过的本地 HuggingFace 模型加载与推理能力，作为独立后端模块接入 `D:\claude_project\闲鱼project`。接入后仍通过现有 `Start.py` 启动一个 FastAPI 服务，并复用闲鱼系统的登录会话和权限体系。

本次只接入后端 API，不增加或修改前端页面，不持久化聊天记录，也不接入现有 `AIReplyEngine` 的 OpenAI、DashScope 或 Gemini 自动回复链路。

## 接入方式

采用进程内嵌入方案：在闲鱼项目中新增 `local_llm` 包，封装单个本地模型的生命周期和推理逻辑，并通过独立 `APIRouter` 挂载到现有 `reply_server.py`。

该方案的优点是只需维护一个服务进程、一个端口和一套认证逻辑。当前 `Start.py` 使用单个 Uvicorn 进程，模型管理器因此保持全局单实例。若未来启用多个 Uvicorn worker，每个进程会各自加载一份模型，届时需要将模型能力拆分为独立服务。

## 模块边界

```text
闲鱼项目
├─ reply_server.py
├─ local_llm/
│  ├─ __init__.py
│  ├─ model_manager.py
│  └─ router.py
├─ requirements-local-llm.txt
└─ tests/
   ├─ test_local_llm_manager.py
   └─ test_local_llm_api.py
```

- `local_llm/model_manager.py`：负责模型路径校验、Tokenizer 和模型加载、设备选择、文本生成、状态查询、显存释放及错误分类。
- `local_llm/router.py`：定义请求模型、四个 API 端点、认证依赖绑定和异常到 HTTP 状态码的转换。
- `reply_server.py`：仅导入并注册本地模型路由，不放置模型实现细节。
- `requirements-local-llm.txt`：保存 PyTorch、Transformers 和 Accelerate 等可选的大体积依赖，避免普通部署被迫安装模型运行环境。

路由使用工厂函数接收现有的 `require_auth` 和 `require_admin` 依赖，从而复用 Cookie Session 认证并避免 `local_llm` 反向导入 `reply_server.py` 造成循环依赖。

## API 契约

### 加载模型

`POST /api/local-llm/load-model`

仅管理员可调用。

请求：

```json
{
  "model_path": "D:\\models\\Qwen"
}
```

成功响应包含 `status`、规范化后的 `model_path`、`model_name` 和 `device`。

模型目录必须存在，并至少包含 `config.json` 以及 HuggingFace 支持的 Safetensors 或 PyTorch 权重文件。加载新模型时，模型管理器先校验目标目录，再释放当前模型，随后加载新模型。新模型加载失败时保持未加载状态，不尝试恢复旧模型。

### 查询状态

`GET /api/local-llm/status`

任意已登录用户可调用。响应包含是否已加载、模型名称、模型路径、运行设备、CUDA 可用性，以及可获取时的 GPU 名称和显存占用。未安装可选模型依赖时，该接口仍可访问，并返回不可用原因。

### 多轮对话

`POST /api/local-llm/chat`

任意已登录用户可调用。

请求：

```json
{
  "messages": [
    {"role": "system", "content": "你是一个有帮助的助手。"},
    {"role": "user", "content": "你好"}
  ],
  "temperature": 0.7,
  "max_new_tokens": 512,
  "top_p": 0.9
}
```

角色仅允许 `system`、`user` 和 `assistant`。服务优先使用 Tokenizer 的 `apply_chat_template()`，模型未提供可用模板时使用明确的角色标签拼接回退格式。响应为一次性完整文本：

为避免已登录用户用超大输入长期占用单模型资源，请求最多包含 64 条消息；单条正文最多 16000 个字符；所有消息正文合计最多 64000 个字符。超过限制的请求由 Pydantic 校验拒绝并返回 `422`。

```json
{
  "reply": "你好，有什么可以帮助你的？"
}
```

本次不实现流式输出，也不在数据库或服务端保存对话历史。调用方每次提交生成回复所需的完整 `messages`。

### 卸载模型

`POST /api/local-llm/unload-model`

仅管理员可调用。该操作释放模型和 Tokenizer 引用、触发 Python 垃圾回收，并在 CUDA 可用时清理可回收缓存。重复卸载应保持幂等。

## 权限与安全

- 四个接口全部使用闲鱼系统现有的 HttpOnly Cookie Session；匿名请求返回 `401`。
- 加载和卸载需要管理员权限；已登录的普通用户调用时返回 `403`。
- 状态查询和对话允许任意已登录用户调用。
- 不提供远程模型下载、模型目录浏览或文件上传能力，管理员必须提交服务器本机的明确目录。
- 不在日志中记录用户的 `messages` 正文。
- 底层 HuggingFace、CUDA 或自定义模型代码的异常文本不直接返回客户端；客户端只接收稳定的中文错误，避免泄露路径、环境信息或消息内容。
- 为兼容需要自定义模型代码的 HuggingFace 模型，加载时保留 `trust_remote_code=True`。管理员必须只加载可信目录，因为加载此类模型可能执行目录中的 Python 代码。

## 生命周期与并发

模型管理器是进程内全局单实例，同一时刻只保存一个模型和 Tokenizer。加载、推理和卸载共享互斥锁：

- 同时到达的对话请求串行执行，避免并发生成耗尽显存。
- 加载或卸载会等待正在进行的生成结束。
- 生成期间新的加载、卸载和生成请求等待锁释放。
- 模型相关端点使用同步处理函数，由 FastAPI 在线程池中运行，避免阻塞主事件循环。

## 错误处理

模型模块定义明确的领域异常，路由层统一映射为中文 HTTP 错误：

- `400 Bad Request`：模型路径为空、目录不存在、模型文件不完整，或通过 JSON Schema 后仍不满足模型管理器的语义约束。
- `401 Unauthorized`：没有有效的闲鱼登录会话。
- `403 Forbidden`：普通用户尝试加载或卸载模型。
- `409 Conflict`：尚未加载模型时请求对话。
- `422 Unprocessable Entity`：请求体缺少字段、字段类型错误或数值超出 API Schema 的允许范围。
- `507 Insufficient Storage`：模型加载或生成阶段发生 CUDA 显存不足。
- `500 Internal Server Error`：其他模型加载或文本生成失败；响应使用稳定的通用错误文本，不附带底层异常详情。

错误响应不得包含用户对话正文、Cookie、凭证或其他敏感信息。服务日志可以记录异常类型和便于排错的模型加载信息，但不得记录聊天内容。

## 依赖与部署

新增的 `requirements-local-llm.txt` 包含与源项目验证版本一致的模型依赖范围：

```text
torch>=2.2
transformers>=4.51,<6
accelerate>=1.0,<2
```

使用本地模型功能前，由部署者在闲鱼项目使用的同一 Python 环境中额外安装该文件。若依赖未安装或因 DLL、版本不兼容等原因无法导入，闲鱼系统其他功能仍可启动；模型加载接口返回清晰的依赖缺失错误，状态接口报告模型功能不可用。

不在本次改动中调整 Docker 镜像、自动下载 CUDA 运行时或自动选择特定 PyTorch CUDA wheel。

## 测试与验收

模型管理单元测试覆盖：

- 空路径、不存在目录、缺少配置和缺少权重文件。
- 分片索引格式、全部引用分片存在性以及禁止引用模型目录外文件。
- CPU 与 CUDA 设备选择。
- Tokenizer 或模型加载失败后的状态清理。
- 聊天模板与回退模板。
- 只解码新生成的 Token。
- 非法消息角色、空消息、未加载模型和生成异常。
- 显存不足错误分类。
- 重复卸载的幂等性。
- 并发生成严格串行执行。
- 可选依赖因缺失 DLL 或包不兼容而导入失败时，包和主服务仍可启动。

API 测试使用替身模型管理器，不实际加载大模型，覆盖：

- 匿名访问四个接口均被拒绝。
- 普通用户可以查询状态和对话，但不能加载或卸载。
- 管理员可以调用全部接口。
- 请求参数校验、正常响应和领域异常到 HTTP 状态码的映射。

完成后运行本地模型新增测试和闲鱼项目已有测试。验收标准为：四个接口符合权限和响应契约，原有测试无回归，前端、数据库与现有 AI 自动回复行为均未改变。

## 明确不在本次范围内

- 独立 Web Chat Playground 或任何前端改动。
- 将本地模型配置加入账号 AI 回复设置。
- 修改 `AIReplyEngine` 或闲鱼自动回复调用链。
- 对话记录持久化、流式生成、模型列表扫描或模型文件上传。
- 同时加载多个模型、模型量化配置、LoRA 动态挂载或跨进程调度。
