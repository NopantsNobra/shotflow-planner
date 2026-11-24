# Changelog

本项目的版本迭代历史完整记录于 [README.md §六、迭代记录](README.md#六迭代记录)（v1 → v10.5.0 的完整演进）。本文件记录**工程化改造**（v10.4.2 之后），并作为后续变更的独立入口。

所有日期为 2026 年。

## [v10.8.2] - 2026-11-24

收藏入口位置统一。SW 缓存 `v10-13` → `v10-14`。

### Changed
- 「☆ 打开收藏」从 subbar 移到**每个可收藏页签的主操作行**，共 6 处（情绪板「上传精选图」前 / 分镜「添加分镜」前 / 日程「添加环节」前 / 清单首分区「添加」前 / 预算「添加」前 / 协作「添加」前）；概念页无收藏条目不渲染。清单页三分区共用首个入口（覆盖 scenes + items 两类，避免重复 id）。
- 抽取 `favPickerBtn()` 作为按钮样式与 onclick 的唯一真源（`btn-ghost btn-sm`），消除 6 处字面漂移风险。

### Verification
- E2E 18 项全绿（含按钮位置 DOM 断言）；逻辑 120 项 / perf / verify:version(10.8.2) / verify:build / sync:check / lint / format:check 全绿。

## [v10.8.1] - 2026-11-24

时长与交互微调。SW 缓存 `v10-12` → `v10-13`。

### Changed
- **默认时长统一 10 分钟**：示例分镜（v9 `buildDemoProject` 与 seed 的 20/30/40）与 migrate 的历史兜底 20 全部改为 10；时长下拉保留 15/20/30/45/60/90 供手动选择。
- **错开间隔统一 10 分钟**：`COPY_SHIFT_MIN` 5 → 10，复制分镜 / 引用收藏的时分字段 +10（跨小时取模），日期字段仍不动。
- **复制后延迟重排**：`copyShot` 仍不触发 `applyDay`（避免打断编辑），toast 引导「调整完成后点 ↻ 重新排程」；分镜页工具区新增「↻ 重新排程」按钮 → `rescheduleAllDays()` 对所有拍摄日各跑一次 `applyDay`（含自动跨日），仅在用户主动点击时执行。`toastResched(plan,allDays)` 新增可选参数以显示整体重排文案。
- **打开收藏按钮位置**：分镜页移到「添加分镜」旁、日程页移到「添加环节」旁（同 `btn-ghost btn-sm` 样式、`.row` gap 10px + align-items:center）；其余可收藏页签仍在 subbar 保留入口，concept 页不显示。

### Verification
- 逻辑测试 120 项、E2E 18 项（+2：按钮位置与整体重排）、perf、verify:version(10.8.1) / verify:build / sync:check / lint / format:check 全绿。

## [v10.8.0] - 2026-11-24

交互增强三连：复制分镜、收藏引用浮窗、全局 Esc 返回看板。SW 缓存 `v10-11` → `v10-12`（确保线上用户拿到新 UI），数据 schema 不变。

### Added
- **复制分镜**：分镜列表每条在收藏按钮后新增「⧉复制」——完整复制原分镜（name/date/duration/sceneId/position/light/refIds/note），新 id、`done/fav` 清零、`ord` 紧随原分镜之后（兄弟顺移一位）；时分字段（`slot`）统一 +5 分钟。刻意不触发 `applyDay`：`slot` 是本条排程结果，重排会覆盖 +5 分钟语义；与原分镜的时长重叠是「顺延 5 分钟」的预期结果，时间轴按既有规则标「重叠」。
- **打开收藏浮窗**：6 个可收藏页签（情绪板/分镜/日程/清单/预算/协作）在 subbar 新增「☆ 打开收藏」；浮窗挂 shell（不随页签重绘销毁），按 `favTypesForTab` 只列当前页相关类型（stuff→scenes+items，notes→notes+todos），标注来源项目与「本案」；每条「引用收藏」把源条目深拷贝进当前项目同类数组，id 重置、`fav/done` 清零、时分字段 +5 分钟，列表与浮窗即时刷新，支持连续引用。点遮罩 / 关闭按钮 / Esc 均可关。
- **全局 Esc 返回看板**：优先级链扩为 收藏浮窗 → refViewer → confirm → name → deploy → settings → 行内编辑 → 文档 → 拍摄日 → 返回看板；非看板页 `view=freshView(); renderBoard()`（顺带清筛选/草稿/焦点态），看板页无操作。原 `closeDoc(); closeShootDay()` 的无条件调用改为按 show 判断，避免误触。

### Changed
- `shiftTimeFields(src,minutes)` 纯函数（时分字段 `slot/start/end` +N，跨小时取模 1440，日期字段 `date/due/shootDate/ts` 不动，不改原对象）与 `favTypesForTab(tab)` 在 `02-core.js` 定义，复制与引用共用；MODULE_VERSIONS 的 shell/core/app/output 标 `v10.8.0`。

### Verification
- 逻辑测试 120 项全绿（新增 4 项：时间平移 +5/跨小时/日期不动/不改原对象、无时分字段原样、自定义分钟、页签映射）；E2E 16 项（新增复制/引用/ESC 5 项，含浮窗关闭与看板边界）；verify:version(10.8.0) / verify:build / sync:check / lint / format:check 全绿。
- 顺带修三处测试脆弱点：设置弹窗的 SW 版本断言改为读运行期 `MODULE_VERSIONS.swCache`（不再写死，避免每次 bump SW 误报）；A3「seed 标志缺失」的 `waitForFunction(async…)` 自建 IDB 连接与 `saveP` 200ms 防抖写链交错导致本机稳定误报，改用 `expect.poll` 离散重试等待落盘（产品逻辑未动，PUT 序列已验证数据未丢）；`tests/perf.mjs` 的 vm 沙箱补注入 `COPY_SHIFT_MIN`（否则 `shotListHtml` 里新增的复制按钮提示抛 ReferenceError，perf 脚本崩溃）。

## [v10.7.2] - 2026-11-23

工程化批次：E2E 从单一 Chromium 扩为三引擎矩阵，并统一各文档的版本与门禁口径。**功能行为零变化**，SW 缓存保持 `v10-11`。

### Changed
- **E2E 浏览器矩阵**：`playwright.config.js` 定义 `chromium` / `firefox` / `webkit` 三个 project，按 `E2E_BROWSERS`（逗号分隔）筛选——本地默认只跑 Chromium，CI 跑三引擎。顶层 `use` 不再固定 `devices['Desktop Chrome']`，各 project 使用各自设备描述。
- **CI 的 `e2e` job 改矩阵**：`fail-fast: false`，每个引擎独立安装浏览器与系统依赖、独立上传失败 trace（`playwright-trace-<engine>`），单引擎失败不掩盖其余结果。
- **文档口径统一**：README / CONTRIBUTING 的 CI job 数（5 → 7）与 E2E 安装命令（含 firefox / webkit）；README 文件结构补 `docs/backlog.md`、`src/js/01..06`；CHANGELOG 中 v10.6.0 / v10.7.0 的日期按提交日期校正为 2026-11-23。

### Verification
- `npx playwright test --list`：Chromium / Firefox / WebKit 各 11 条用例、合计 33 条，矩阵配置生效。
- 逻辑测试 116 项、perf 门禁、verify:build / verify:version(10.7.2) / sync:check / lint / format:check 全绿。
- **未实测**：本机无浏览器二进制且 Playwright CDN 不可达，三引擎实跑由 CI 首次执行；WebKit 为 Playwright 的 Safari 内核构建，不等同 macOS Safari 本体。

---

## [v10.7.1] - 2026-11-23

安全与稳定性修复批次（短期路线图 P0/P1）：关闭导入文件的存储型 XSS 注入面、启动不再白屏、消除示例注入覆盖用户数据的路径。SW 缓存不变（`v10-11`）。

### Security
- **导入净化层 `sanitizeProject(p,mkId)`**（`src/js/02-core.js`，纯函数）：备份文件视为不可信输入，导入时先净化再 migrate——实体 id 全部重写为 `mkId()` 新 id（`shots.sceneId` 同步映射，图片 key 原样保留）、`status` 白名单回退「灵感期」、显示字段强转字符串并截断、数值收敛（金额 0~999999999、时长 5~1440）、日期形状 + 月/日范围校验、数组过滤非对象成员、`refIds` 收敛为字符串且不超 3 张。
- **渲染层注入面收口**：`p.id`（项目卡 / 导出按钮 onclick）、`p.status`（阶段标签文本）、`s.id`（分镜 `data-id` / 场景 `<option value>` / 勾选与删除按钮）、`it.id/x.id`（时间轴 / 拍摄日按钮）、`sd-slot` 时间文本、待办 `due`、分镜 / 通告单 / 手册时长——全部改 `jstr()/esc()` 或数值化，与既有转义纪律对齐。

### Fixed
- **启动降级（IndexedDB 不可用不再白屏）**：`initData` 与 boot IIFE 全链 try-catch（失败渲染可见错误 + 刷新入口）；`idb.*` 全部方法加降级守卫（db 未就绪时读类返回 null/[]、写类空转，可用性统一 `idb.ready()`）；`writeProjects` 在存储不可用时不进重试风暴、只提示一次；降级时**不再删除**旧 localStorage 副本（它是当时唯一持久数据）；看板新增降级提示条；存储降级时暂停姿势图库同步（同步了也存不住）。
- **`seed()` 全量覆盖路径**：幂等判定加入内容级 guard（内存已有项目/示例即跳过并补标志）+ 注入改追加（`saveP(existing.concat([demo]))`），修复「localStorage 标志缺失时 `saveP([demo])` 把 IDB 里用户项目整批覆盖」的数据丢失风险。
- **时长兑底漂移**：`dayItems/cascadeShift` 的 `+duration||20` 改 `||SHOT_DEFAULT_MIN`，与 `planDay` 同源（缺 duration 的分镜冲突检测/结束时间不再差 10 分钟）。
- **导出文件名**：新增 `safeFilename()`（只剥跨平台非法字符），替换原 `esc(p.name).replace(...)`（`&` 会变 `&amp;` 混进文件名）。
- **看板统计口径**：「进行中 / 今日拍摄 / 逾期待办 / 总预算」排除只读示例项目，与备份计数 `backupItemCount` 同口径。
- CI / CONTRIBUTING 用例数文案改防漂移表述（不再写死数字）。
- **导入净化补漏（复核发现）**：① 分镜 `slot` 原样保留——它是持久化的排程结果（导出文件带它），此前净化把未列入白名单的字段一律丢弃，导入后的项目时间轴与通告单时间会全部落到 24:00；② 缺 `id` 的成员改为各自生成新 id——原实现把空字符串当映射键，同一批导入里所有缺 id 的分镜/场景共享同一个 id，删除与勾选按 id 命中会一次命中多条。

### Added
- 逻辑测试 105 → 116 项（sanitizeProject 9 项：id 重写 / 白名单 / 垃圾过滤 / 类型收敛 / 拒绝非对象 / refIds 收敛 / 迁移兼容 / 缺 id 各生成独立 id / slot 保留；safeFilename；dayItems 时长兑底）。
- E2E 8 → 11 项：恶意备份 JSON 导入净化（id/status 双注入面）、seed 标志缺失不覆盖已有项目、IndexedDB 不可用优雅降级。

### Verification
- 逻辑测试 116 项全绿；perf 门禁（2000 分镜 < 50ms）；verify:build / verify:version(10.7.1) / sync:check / lint 0 error / format:check 全绿。

---

## [v10.7.0] - 2026-11-23

设置页收尾与反馈通道定稿：反馈改为 **Web3Forms 页面内提交**（取代 v10.6.0 的公开仓库 Issue 跳转与中间过渡的邮件方案）。SW 缓存 `v10-10` → `v10-11`。

### Changed
- **反馈通道（Web3Forms 页面内 POST）**：点「提交反馈」后页面内 `fetch` POST 到 `https://api.web3forms.com/submit`，不跳转、不拉起邮件客户端；表单服务 access key 以 `FB_KEY_A` / `FB_KEY_B` 双层混淆常量存储，`fbDecodeKey()` 仅在提交时运行时还原（源码 / 产物 / 测试 / 文档零明文；日志与 DOM 均不落 key）。
- **纯函数 `buildFeedbackPayload(type,title,body,envText)`**（替换原 URL 构造）：返回 `{access_key,subject,from_name,message}`；`message = 描述 + "\n\n---\n" + 环境信息`，超过 20000 字符截断并追加「…（描述过长已截断）」；key 还原失败返回 `null`，调用方只 toast 不泄露中间值。
- **提交三态与防重**：成功「反馈已提交，感谢！」并清空标题/描述；HTTP 非 2xx 或 `success:false` → 「提交失败，请使用「复制反馈内容」」；网络异常 → 「网络异常，请使用「复制反馈内容」」；提交期间按钮 `disabled` + 文案「提交中…」，结束恢复「提交反馈」。
- **隐私文案**：反馈内容（类型 / 标题 / 描述 + 应用版本与浏览器环境信息）通过第三方表单服务 Web3Forms 发送给维护者，不含项目数据、图片或个人信息。
- 移除 `FB_MAIL_A/B`、`fbDecodeMail()`、`buildFeedbackUrl()` 及 `window.location.href = mailto` 链路。

### Added（本轮同批 UI 增补）
- **设置页「关于与部署」分区** + 「为自己部署」说明弹窗：部署方式（纯静态单文件 / 任意静态托管 / 无后端无数据库）、开源地址、`MIT License © 2026 Stillmark-服雲`、项目用途、三句话介绍；Esc 先关弹窗再关设置页，支持点遮罩关闭。
- **全局页脚**：`#app` 之外新增 `<footer class="app-foot">`（Powered by Stillmark · 瞬刻摄影工作台 · MIT License · 开源地址），1px 分隔线 + 小号灰字居中，桌面贴底、390px 无横向溢出，页签重绘不销毁。

### Verification
- 逻辑测试 105 项全绿（`fbDecodeKey` 长度/UUID/确定性；`buildFeedbackPayload` 字段与截断）；E2E 8 项全绿（反馈 Web3Forms 成功 + 500 失败双路径、部署弹窗、全局页脚）；perf < 50ms；verify:build / verify:version(10.7.0) / sync:check / lint / format:check 全绿。
- 浏览器实测：真实网络提交 1 条内部测试反馈（结果见发布记录），无页面跳转、无 mailto、按钮状态切换正常。

---

## [v10.6.0] - 2026-11-23

首个用户可见的功能版本：新增「设置」弹窗。SW 缓存 `v10-8` → `v10-10`（跳过 `v10-9`——该号曾被已回退的 PW 版本占用，避免版本序列混淆）。

### Added
- **设置弹窗**：看板页「⚙ 设置」入口，四区聚合——①版本信息（应用版本 / SW 缓存 / IndexedDB 数据结构 / 数据规模 / 模块版本表）、②模块配置（姿势图库同步开关、立即同步、清除本机图库、PWA 安装快捷入口）、③数据与备份（导出/导入复用既有链路，导入沿用 askConfirm 覆盖确认；标签词表为项目级数据的说明文案）、④反馈（GitHub Issue 网页跳转 + 复制文本兜底，零依赖零后端，无邮件通道）。新增 `src/js/06-settings.js`（顶层仅 function 声明——拼接位于 05-boot.js 之后，避免顶层 let/const 的 TDZ 冲突；纯函数 `feedbackTypeLabel / buildFeedbackEnv / buildFeedbackUrl` 可被逻辑测试抽取）。
- **版本注入**：新增共享组装模块 `scripts/assemble.mjs`（build.mjs / verify-build.mjs 共用同一份拼接逻辑，消除两份拷贝的漂移风险），构建时把 `src/js/01-data.js` 的 `'__APP_VERSION__'` 占位字面量替换为 package.json 版本号；`verify-version.mjs` 新增 `MODULE_VERSIONS.swCache` 与两个 SW 文件 `CACHE` 的防漂移校验。
- **测试**：逻辑测试抽取反馈纯函数（99 → 104 项）；E2E 新增三用例（设置打开/版本区/Esc/关闭回归、同步开关写 localStorage、反馈 URL 前缀与超长截断）（4 → 7 项）。
- **文档**：`CONTRIBUTING.md` 关键约束补「发版同步 MODULE_VERSIONS」；设置页设计见 `docs/settings-design.md`。

### Verification
- 逻辑测试 104 项全绿；E2E 7 用例全绿；perf 门禁通过；verify:build / verify:version / sync:check / lint / format:check 全绿；设置弹窗浏览器实测（版本区数据、开关切换、confirm 叠层、反馈 URL 与剪贴板、Esc 回归）通过。

---

## [v10.5.1] - 2026-11-23

工程化改造后的性能补强，功能行为对最终用户零变化，SW 缓存保持 `v10-8`（无需触达用户）。本节将 v10.5.0 tag 之后进入 main 的工程改动从 `[Unreleased]` 归入正式版本，避免进度失配。

### Changed
- **分镜列表渲染性能**：`shotListHtml()` 原先逐条分镜调用 `dayItems(p, s.date)` 计算时间冲突，单项目多分镜时为 O(N²)（2000 分镜约 1125ms）。改为按拍摄日一次性预计算、构建 `shotId → conflict` 查表，复杂度降为 O(天数 + N)，2000 分镜约 7ms（本地实测 20–22ms，门禁上限 50ms）。

### Added
- `tests/perf.mjs` 规模压测脚本（100/500/1000/2000 项目与分镜，测看板渲染/分镜列表/排程/导入/序列化耗时与内存），含 2000 分镜 < 50ms 的性能回归门禁；`npm run test:perf`，CI 由 4 job 增至 5 job。
- `ci: 将 release/** 分支纳入 CI 触发范围`。

### Verification
- 逻辑测试 99 项全绿；E2E 4 用例全绿；perf 门禁通过（2000 分镜 20.54ms）；verify:build / verify:version / sync:check 全绿。

---

## [v10.5.0] - 2026-11-22

工程化改造发布。功能行为对最终用户零变化（构建产物与 v10.4.2 逐字节一致），但显著提升数据安全性、可测试性与可维护性。SW 缓存由 `v10-7` 升至 `v10-8`，以触达已安装的 PWA 用户。

本轮在工程资质层面完成四项加固，功能行为对最终用户零变化（构建产物与改造前逐字节一致）。

### Added
- **数据安全（P0）**：`saveP` 改为串行写链 + 固定快照 + 5 次指数退避重试；新增 `bindPersistFlush()` 在页面隐藏/关闭时冲刷未落盘数据，消除关页丢数据窗口。
- **E2E 测试（P1）**：引入 Playwright，新增 4 项浏览器端用例（核心路径 / FB-1 渲染层回归 / P2 注入 / 持久化）；配零依赖静态服务器。
- **CI 门禁（P1/P3）**：GitHub Actions 4 个 job——构建一致性、核心逻辑测试、E2E、部署副本一致性；`refactor/**` 分支推送亦触发。
- **部署副本同步（P1）**：`scripts/sync-app.mjs` 统一真源到 `shotflow-app/`，`--check` 模式逐字节校验，消除手工 `cp` 的两端漂移。
- **安全加固（P2）**：新增 `safeColor()` 白名单校验（hex/rgb/rgba/hsl，其余回退默认色），3 处颜色渲染 + 写入路径统一经它；全部 `img src` 拼接补 `esc()`。
- **源码模块化（P3）**：单文件按连续区间拆为 `src/` 多文件源码（shell + styles + js×5），`scripts/build.mjs` 构建回自包含单文件；`verify-build.mjs` 校验交付物与源码一致。
- **代码规范（P3）**：ESLint flat config + Prettier，`npm run lint` / `npm run format:check`。
- **贡献与变更文档**：`CONTRIBUTING.md`（贡献指引与提交规范）、本 `CHANGELOG.md`。
- **历史归档**：`photo-planner.html`（v1）移入 `legacy/`。

### Changed
- 逻辑测试 88 → 99 项（+P0 6 项、+P2 5 项）；E2E 0 → 4 项。
- `README.md` / `overview.md` / `docs/fix-backlog.md` 更新为当前状态，修正过时表述。

### Verification
- 逻辑测试 99 项全绿；E2E 4 用例全绿（CI 实跑）；构建产物逐字节一致；lint 0 error；format 通过；副本一致性通过。
- 远端 main 各提交 CI 均 4 job 全 success。

---

> 功能版本（v1~v10.3）的演进详见 [README.md §六、迭代记录](README.md#六迭代记录)。
