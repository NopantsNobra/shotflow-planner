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

## 提交前必做（本地全量预检）

```bash
npm run verify:build    # 交付物与源码一致
npm run verify:version  # 版本号一致（package.json 为真源）
npm run test:logic      # 逻辑测试（99 项）
npm run test:e2e        # E2E（需先 npx playwright install chromium）
npm run lint            # ESLint，须 0 error
npm run format:check    # Prettier
npm run sync:check      # 部署副本一致
```

CI 会自动跑以上全部检查，4 个 job 全绿才可合入。

## 提交规范

- **一个提交只做一件事**：职责单一、可独立构建与回滚。不要将「功能 + 重构 + 格式化 + CI 配置」混在一个提交里。
- **类型前缀**：`feat:` / `fix:` / `refactor:` / `chore:` / `ci:` / `docs:` / `test:`，如 `fix(p0): 加固 saveP 数据落盘`。
- **提交前本地全量预检**（见上），避免把仅 CI 能发现的问题推到远端再补救。
- **不要 force push 已发布的 main**；需要重写历史时先在独立分支完成并确认无下游依赖。

## 分支与 PR

- 功能开发、重构请在独立分支进行（如 `refactor/xxx` / `feat/xxx`），验证通过后合并回 `main`。
- PR 描述请说明：改动范围、验证结果、是否影响单文件交付物、是否需同步部署副本。
