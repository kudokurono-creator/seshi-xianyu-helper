# 本地模型配置与测试页面设计

日期：2026-09-04

## 目标

在闲鱼项目现有本地 HuggingFace 模型后端 API 的基础上，增加前端配置与测试入口：管理员可以在“系统与 AI”中保存本地模型参数并手动加载/卸载模型，已登录用户可以在新增的“本地模型测试”分栏中进行不落库的多轮对话测试。

本次不修改闲鱼现有 AI 自动回复链路，不把本地模型作为自动回复引擎的默认模型，也不保存聊天记录。

## 架构

继续使用现有单进程 FastAPI 服务和 React/Vite 前端。后端新增一个轻量配置子路由，配置复用现有 `system_settings` 表；模型生命周期继续由 `local_llm.ModelManager` 管理，配置保存和模型加载保持分离。

```text
系统与 AI 设置页 ──┐
                    ├─ /api/local-llm/config ── system_settings
本地模型测试页 ────┼─ /api/local-llm/status
                    ├─ /api/local-llm/load-model
                    ├─ /api/local-llm/unload-model
                    └─ /api/local-llm/chat ── ModelManager
```

## 后端接口

### 配置读取

`GET /api/local-llm/config`

需要有效登录会话。返回稳定的配置对象：

```json
{
  "model_path": "D:\\models\\Qwen",
  "system_prompt": "你是一个有帮助的助手。",
  "temperature": 0.7,
  "top_p": 0.9,
  "max_new_tokens": 512
}
```

未设置时返回默认值。响应不返回 API 密钥、Cookie 或底层异常。

### 配置保存

`PUT /api/local-llm/config`

仅管理员可调用。请求字段与读取响应相同；服务端校验：

- `model_path` 可为空，表示尚未配置模型目录；非空时限制为合理的本地路径字符串，不执行目录扫描。
- `system_prompt` 最多 8000 个字符。
- `temperature` 范围 `0` 到 `2`。
- `top_p` 范围大于 `0` 且不超过 `1`。
- `max_new_tokens` 范围 `1` 到 `4096`。

保存只写入 `system_settings`，不会自动加载、卸载或触发模型推理。

### 与现有模型接口的关系

- `POST /api/local-llm/load-model` 仍然只允许管理员调用。前端点击“加载已保存模型”时读取配置中的 `model_path` 并调用现有接口。
- `GET /api/local-llm/status` 和 `POST /api/local-llm/chat` 仍允许任意已登录用户调用。
- `POST /api/local-llm/unload-model` 仍然只允许管理员调用。
- 所有聊天内容只在请求内存中流转，不写日志、不写数据库。

## 前端页面

### “系统与 AI”中的本地模型配置区

在现有 `Settings` 页面增加独立的“本地模型”区块，包含：

- 模型目录输入框。
- 默认系统提示词文本框。
- 温度、Top P、最大生成字数输入控件。
- 保存配置按钮。
- 当前运行状态摘要：是否已加载、模型名、设备、CUDA 可用性、依赖是否可用。
- 管理员按钮：加载已保存模型、卸载模型。

保存成功只提示配置已保存；加载/卸载结果独立提示，避免用户误以为保存会自动加载。

### 新增“本地模型测试”分栏

在 `Sidebar` 当前 7 项之后新增第 8 项 `本地模型测试`，由 `App` 路由到新的 `LocalLLMPlayground` 组件。

页面布局：

- 顶部显示页面标题、当前模型名/设备和刷新状态按钮。
- 左侧窄栏显示配置摘要与管理员操作；普通用户只看到只读状态。
- 右侧为聊天区，展示 system/user/assistant 消息气泡、空状态、生成中状态和错误提示。
- 底部输入框支持 Enter 发送、Shift+Enter 换行；提供发送和清空会话按钮。
- 每次发送将当前会话完整消息数组提交到 `/api/local-llm/chat`，收到回复后追加 assistant 消息。

页面不提供模型目录浏览、上传、下载或聊天记录持久化。

## 权限与状态

前端使用 `/verify` 返回的 `is_admin` 判断是否显示管理操作；后端权限校验始终有效，前端隐藏不作为安全边界。

未登录用户继续停留在现有登录页。模型未加载、依赖缺失、路径无效、显存不足和生成失败均显示稳定的中文错误，不显示底层 traceback 或消息正文。

## 文件边界

- Modify `local_llm/router.py`：配置请求模型、配置读写路由和系统设置键映射。
- Modify `reply_server.py`：复用现有 `system_settings` 能力时只保留路由注册，不新增业务实现。
- Modify `frontend/services/api.ts`：增加本地模型配置、状态、加载、卸载、聊天 API 客户端。
- Modify `frontend/types.ts`：增加本地模型配置、状态和聊天消息类型。
- Modify `frontend/components/Settings.tsx`：增加本地模型配置区。
- Create `frontend/components/LocalLLMPlayground.tsx`：实现测试页面。
- Modify `frontend/components/Sidebar.tsx`：增加第 8 个导航项。
- Modify `frontend/App.tsx`：渲染新的分栏组件，并把登录用户管理员状态传入侧栏/页面。
- Add focused backend tests for config permissions, defaults, validation and persistence calls.
- Add frontend type/build verification;不引入新的前端依赖。

## 测试与验收

后端测试覆盖：

- 匿名用户不能读取或保存配置。
- 普通用户可读取配置但不能保存配置或管理模型。
- 管理员可以读取和保存配置，保存值按字段写入 `system_settings`。
- 缺省配置返回稳定默认值。
- 温度、Top P、最大生成字数、系统提示词长度校验返回 `422`。
- 现有四个本地模型接口和完整项目测试无回归。

前端验收：

- `pnpm run build` 成功。
- 登录后侧栏出现第 8 项“本地模型测试”。
- “系统与 AI”可加载、编辑、保存本地模型配置，并显示模型状态。
- 测试页可在模型已加载时发送多轮消息、清空会话并显示错误/加载状态。
- 普通用户看不到加载、卸载、保存按钮，但仍可查看状态和发送对话。

## 明确不在范围内

- 不自动启动或自动加载模型。
- 不接入 `AIReplyEngine` 的自动回复链路。
- 不持久化聊天记录或模型输出。
- 不新增模型下载、目录扫描、上传、量化、LoRA 或多模型管理。
- 不修改现有 7 个分栏的业务行为。
