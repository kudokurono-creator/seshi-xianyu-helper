# 本地模型配置与测试页面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在闲鱼系统中加入本地 HuggingFace 模型配置页面和登录保护的多轮对话测试分栏。

**Architecture:** 扩展现有 local_llm 路由工厂，使用宿主传入的 db_manager 设置读写回调持久化配置；模型加载继续复用现有 ModelManager，保存配置不触发加载。React 前端通过现有 API wrapper 访问配置、状态、加载、卸载和聊天接口，App 增加管理员状态并渲染新的测试组件。

**Tech Stack:** Python 3.11+、FastAPI、Pydantic 2、SQLite system_settings、React 19、TypeScript、Vite、Tailwind、lucide-react、pytest。

**Spec:** docs/superpowers/specs/2026-09-04-local-llm-frontend-playground-design.md

## Global Constraints

- 配置键固定为 local_llm_model_path、local_llm_system_prompt、local_llm_temperature、local_llm_top_p、local_llm_max_new_tokens。
- 保存配置只写入 system_settings，不自动加载、卸载或推理。
- 加载/卸载仅管理员可用；状态/聊天允许已登录用户；匿名用户全部拒绝。
- 不修改 AIReplyEngine、账号 AI 自动回复链路，不保存聊天记录，不新增前端依赖。
- 不提交或跟踪 微调对话小数据/。

---

### Task 1: 配置 API 与后端契约

Files: local_llm/router.py、reply_server.py、tests/test_local_llm_api.py、tests/test_local_llm_registration.py。

Interfaces: 扩展 create_local_llm_router(require_auth, require_admin, manager=None, get_setting=None, set_setting=None) -> APIRouter；增加 LocalLLMConfig；增加 GET/PUT /api/local-llm/config。

- [ ] Step 1: 写失败测试。给 API 测试增加 fake settings store，断言登录用户读取缺省配置得到 model_path 空、system_prompt 为“你是一个有帮助的助手。”、temperature 0.7、top_p 0.9、max_new_tokens 512；管理员 PUT 后五个字段按字符串写入；普通用户 PUT 返回 403；temperature 2.1、top_p 0、max_new_tokens 0、8001 字符 prompt、1025 字符路径返回 422。
- [ ] Step 2: 确认红灯。运行 .venv\Scripts\python.exe -m pytest tests/test_local_llm_api.py tests/test_local_llm_registration.py -q，预期新增配置用例因配置路由与 settings 回调不存在而失败。
- [ ] Step 3: 实现最小配置接口。在 local_llm/router.py 增加字段约束、默认值和键映射。GET 通过 require_auth 读取回调，对缺失或非法持久化值回退默认值；PUT 通过 require_admin 按键调用 set_setting(key, str(value), description)，返回规范化配置；回调异常只返回 500 和“本地模型配置保存失败”。在 reply_server.py 将 db_manager.get_system_setting 和 db_manager.set_system_setting 传给路由工厂。
- [ ] Step 4: 运行聚焦测试并提交。确认新增与现有本地模型测试通过，运行 git diff --check，然后只暂存四个 Task 1 文件，提交信息为 feat: add local LLM configuration API。

### Task 2: 前端 API、类型与权限状态

Files: frontend/types.ts、frontend/services/api.ts、frontend/App.tsx、frontend/components/Sidebar.tsx。

Interfaces: 增加 LocalLLMConfig、LocalLLMStatus、LocalLLMMessage；增加 getLocalLLMConfig、updateLocalLLMConfig、getLocalLLMStatus、loadLocalLLM、unloadLocalLLM、chatWithLocalLLM；Sidebar 接收 isAdmin 可选属性。

- [ ] Step 1: 增加类型和 API helper。使用现有 get、put、post wrapper；聊天 helper 提交完整消息数组和配置中的生成参数，返回 reply 字符串。
- [ ] Step 2: 打通管理员状态和导航。在 App 从 verify 与登录响应保存 isAdmin，退出时清空；Sidebar 在现有 7 项后增加 local-llm-playground，App 将管理员状态传给侧栏和测试组件。
- [ ] Step 3: 运行 pnpm --dir frontend run build，修复类型、导入或 API 签名错误。

### Task 3: 系统与 AI 本地模型配置区

Files: frontend/components/Settings.tsx。

- [ ] Step 1: 挂载时分别加载本地配置和模型状态；增加保存配置、刷新状态、加载已保存模型、卸载模型处理器；保存不调用加载接口。
- [ ] Step 2: 增加中文本地模型区块，包含模型路径、系统提示词、温度、Top P、最大生成字数、状态摘要和管理员操作。沿用 ios-card、黄色主按钮、lucide 图标；请求期间禁用相关控件，错误和成功以内联文本呈现。
- [ ] Step 3: 运行 pnpm --dir frontend run build。

### Task 4: 本地模型测试分栏

Files: 新建 frontend/components/LocalLLMPlayground.tsx；修改 frontend/App.tsx。

Interfaces: 组件 props 为 isAdmin: boolean；会话只保存在组件内存中。

- [ ] Step 1: 挂载加载配置和状态；非空系统提示词作为首条 system 消息；发送时拒绝空白输入、追加 user 消息、提交完整会话，成功后追加 assistant 回复；清空会话后按当前提示词重新初始化。
- [ ] Step 2: 实现响应式双栏界面，提供顶部状态、配置摘要、管理员加载/卸载、消息气泡、空状态、生成中状态、错误提示、Enter 发送、Shift+Enter 换行、发送和清空按钮。普通用户不渲染加载/卸载按钮；图标按钮提供 aria-label 和 tooltip。
- [ ] Step 3: 在 App 为 local-llm-playground 渲染组件，运行 pnpm --dir frontend run build。

### Task 5: 集成验收与交付

- [ ] Step 1: 运行 .venv\Scripts\python.exe -m pytest -q、compileall local_llm reply_server.py、pip check。
- [ ] Step 2: 运行 pnpm --dir frontend run build。
- [ ] Step 3: 启动 Vite，打开 http://localhost:3000/static/，登录后检查第 8 个分栏、配置保存和手动加载、状态刷新、多轮对话、清空会话、错误提示与窄屏布局。
- [ ] Step 4: 运行 git diff --check 和 git status --short --ignored，确认微调数据目录未跟踪；只暂存前端实现文件和测试，提交信息为 feat: add local LLM frontend settings and playground。
