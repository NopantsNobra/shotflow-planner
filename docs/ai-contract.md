# AI 任务契约 v1（预留，非可用模型功能）

应用当前提供的是外部 Agent 任务提示词库，不是模型调用功能。设置页展示由 `docs/agent-tasks/generate-shoot-plan-v3.md` 生成的完整默认文本；用户可编辑/复制，个人版本只存于浏览器本机，不进策划案、备份和反馈。应用不会自动附加未显示的提示词，也不会自动读取项目或把文本发给模型。用户自行复制到所选 Agent 后，该 Agent 服务的数据处理仍由用户与其服务商决定。

应用没有已连接的生产模型服务，也不会自动产生模型请求。任务注册表、请求最小化、严格校验和候选快照检查仅定义未来接入边界；当前不含 provider 配置或上传入口。调用链：

1. `ai.prepare(taskId,input)` 构建实际待上传请求，仅包含任务白名单字段、用户选定图片及指令；未来 UI 必须展示真实请求范围。
2. 业务入口获得用户确认后，`ai.run(taskId,input,{provider,model,confirmUpload:true,signal})` 调用已注册适配器。
3. `aiValidate` 严格检查对象、字段、类型、数量、长度，`aiValidateReferences` 仅允许已知场景/分镜/素材 ID；结果为候选，不修改任何项目。
4. `aiCandidateIsCurrent(candidate,project)` 检查项目 ID、完整快照及只读状态。快照仅留在本地候选，不进入请求。未来业务 UI 必须确认、筛选、编辑后经现有 updateCur 等写入守卫应用，提供撤销。

## 外部 Agent 使用轨道（2026-11-26）

实际模型接入继续冻结。外部 Agent 可通过已提供的版本化资产包 Schema、操作指南和导入 UI 生成项目或分镜，不需要调用本模块或配置工作台模型密钥。两条轨道共享数据校验、用户确认、最小权限和持久化守卫，不共享隐式授权。见 [路线](portable-agent-roadmap.md) 与 [资产包容器规范](asset-pack-format.md)。外部 Agent 的正式交换载体是 ZIP，图片使用二进制条目；内置模型输入和迁移包格式彼此独立。

## 适配器契约

`{id, capabilities:{text,vision,structuredOutput,embedding,imageGeneration}, generate(request,signal):Promise<{data,usage?,warnings?}>}`。generate 为统一任务入口；embedding 与图像生成可由适配器内部调用不同协议。适配器负责超时、取消、模型协议、鉴权和结构化结果解析。运行层不接收或存储 API key，不将配置对象传给模型。凭据未来由用户明确配置在适配器内存闭包；无后台重试。

计划支持 OpenAI Responses / Chat Completions 兼容网关、Anthropic Messages、Gemini、Embedding 与图像生成；本期不承诺任一协议已连通。接入前验证 CORS、实际模型能力、费用、数据上传与取消行为。不得内置服务密钥。

## 任务

任务 ID 与 PRODUCT.md 一致，共十项；见 aiTaskRegistry 中的 schema 与上下文字段。所有 schema 只允许有限长度的文本、数组、白名单对象；图片只接受受限的栅格 data URL，禁止远程 URL、任意 SVG 和 HTML 执行。输出展示必须按文本转义。模型返回的文字不视为应用命令。

## 本期验证

使用 mock provider 测试禁用零调用、授权门、上下文最小化、严格 schema、引用合法性、项目变化后的候选失效。没有实际模型调用。具体交互、传输层、业务应用操作、连接测试和撤销留待第 09 批逐项落地。
