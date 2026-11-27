# 贡献指引（CONTRIBUTING）

感谢参与 **瞬刻摄影工作台 · Stillmark**。本项目是本地优先的摄影策划 PWA，追求「零运行时依赖、双击即用、文档完备」。

## 开发前必读

- [README.md](README.md)：安装、使用、目录结构、构建与测试命令、已知限制
- [overview.md](overview.md)：开发视角的功能索引与数据模型
- [docs/system_design.md](docs/system_design.md)：架构决策、冲突解法、回归风险清单
- [CHANGELOG.md](CHANGELOG.md)：版本与工程化变更记录

## 关键约束

1. **零运行时依赖**：交付物 `shotflow.html` 必须保持自包含、可 `file://` 双击打开。不要引入需要打包器或 CDN 的运行时依赖。
2. **改源码而非交付物**：功能改动请编辑 `src/`（`src/styles.css` / `src/js/0x-*.js` / `src/shell.html`），然后运行 `npm run build` 重新生成 `shotflow.html`。直接改 `shotflow.html` 会被 `npm run verify:build` 拦截。
3. **保持测试可抽取**：纯函数层的改动不要引入 DOM/IDB 依赖，不要超出逻辑测试 ctx 白名单（`console/Date/Math/String/Number/Array/Object/JSON/RegExp/Set/encodeURIComponent`）。
4. **部署同步**：构建后运行 `npm run sync` 同步到 `shotflow-app/`，`npm run sync:check` 校验。
5. **发版同步 MODULE_VERSIONS**：bump `package.json` 版本时，同步检查 `src/js/01-data.js` 的 `MODULE_VERSIONS`（本轮实质变更过的模块行改为新版本号；SW 缓存策略变更时 bump 两个 SW 文件的 `CACHE` 并同步 `swCache` 行），`npm run verify:version` 会校验 `swCache` 与 SW 两端一致。

## 代码与注释风格

- 延续运行时代码现有紧凑写法；修改时统一本次触及区域的排版，不做无关全文件格式化。
- 函数保持单一职责，能由调用点和类型/校验表达的条件不重复防御；外部输入、存储边界和异步失败仍须显式处理。
- 注释只记录非显然的约束、原因或安全边界。删除过时版本注释、逐行复述代码的注释和已移除功能的测试/配置；历史方案应明确标成历史，不当作当前实现说明。
- 默认提示词以 `docs/agent-tasks/` 下的版本化文档为唯一正文来源；涉及用户交互、保存、复制或重置的设置项补充浏览器回归。

## 提交前必做（本地全量预检）

```bash
npm run verify:build    # 交付物与源码一致
npm run verify:version  # 版本号一致（package.json 为真源）
npm run schemas:check   # 公开 Schema 与生产定义一致
npm run capabilities:check # Agent 能力声明与代码真源一致
npm run test:logic      # 逻辑测试（数量以 RESULT 行为准）
npm run test:e2e        # E2E（默认 Chromium；需先 npx playwright install chromium）
npm run test:perf       # 规模压测 + 性能门禁（2000 分镜渲染须 < 50ms）
npm run lint            # ESLint，须 0 error
npm run format:check    # Prettier
npm run sync:check      # 部署副本一致
```

跨引擎自查：`E2E_BROWSERS=firefox npm run test:e2e`（或 `npx playwright test --project=webkit`），需先安装对应引擎。

CI 会自动跑以上全部检查：正式版本应以 7 个 job 全绿为验收门槛——构建一致性、核心逻辑、规模压测、副本同步，外加 E2E 的 Chromium / Firefox / WebKit 三个矩阵任务。

## 提交规范

- **一个提交只做一件事**：职责单一、可独立构建与回滚。不要将「功能 + 重构 + 格式化 + CI 配置」混在一个提交里。
- **类型前缀**：`feat:` / `fix:` / `refactor:` / `chore:` / `ci:` / `docs:` / `test:`，如 `fix(p0): 加固 saveP 数据落盘`。
- **提交前本地全量预检**（见上），避免把仅 CI 能发现的问题推到远端再补救。
- **不要 force push 已发布的 main**；需要重写历史时先在独立分支完成并确认无下游依赖。

## 主分支维护流程

- 经维护者授权的日常小步迭代直接提交 `main`，无需 PR；每个提交保持源码、构建产物、部署副本与测试一致。禁止强推，遇到并发变化先重新读取最新分支。
- 本地具备条件时先运行全量预检；受环境限制时明确记录，并核查远端 CI。发现回归，以独立修复提交或 revert 处理，不掩盖失败。
- 高风险迁移或大范围重构仍可使用独立分支验证。正式版本需确认 CI 及必要人工测试。
