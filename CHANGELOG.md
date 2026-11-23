# Changelog

本项目的版本迭代历史完整记录于 [README.md §六、迭代记录](README.md#六迭代记录)（v1 → v10.5.0 的完整演进）。本文件记录**工程化改造**（v10.4.2 之后），并作为后续变更的独立入口。

所有日期为 2026 年。

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
