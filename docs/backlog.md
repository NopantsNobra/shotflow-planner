# 未修复清单（承接 2026-11-23 全面审核）

> 只列**已知未做/未修**的工程项，按优先级排序。编号沿用审核报告（A/B/C 系列）。
> 已修复的历史问题见 `fix-backlog.md`；产品边界与不做的方向见 README §七「已知限制」。
> 基线：v10.7.1（`3763418` 之后）。

## P1 · 数据安全与并发现象

- **B2 多标签页并发写覆盖**：全部项目存于 `projects` store 单 key `'all'`，每页持内存缓存整写，last-writer-wins。
  做法：`BroadcastChannel`（降级 `storage` 事件）+ 写前 `updatedAt` 版本比对，冲突时提示「另一标签页已修改」。
  验收：双开编辑不同项目，任一页保存后另一页不覆盖且能看到提示。
- **B4 无 CSP**：`shell.html` 未设 `Content-Security-Policy`，且大量内联 `onclick`，注入面一旦回归即完全可利用。
  做法：先加不影响现有行为的指令（`object-src 'none'; base-uri 'self'; form-action 'none'`）；中期把内联 handler 迁事件委托后再收紧 `script-src`。
  注意：`file://` 打开是硬需求，CSP 必须在该场景下不阻断运行。

## P2 · 性能与可维护性

- **B3 图库索引全量游标**：`renderShots` 每次都 `idb.shiseiIndex()`（openCursor 逐条载入）+ 逐张 `ensureShiseiImage`。图库 1400 张时重绘有卡顿/内存峰值。
  做法：索引缓存 + 失效刷新（同步完成 / 清除 / 分类变更时失效）。
- **C2 E2E 覆盖偏 happy path**：多日拍摄、自动跨日、导入导出、删除撤销、拍摄日模式、拖拽排序均无 E2E。
- **C3 `03-app.js` 1787 行 / 全量重绘**：按域拆段（board/shots/schedule/shootday），构建机制已支持多段拼接。
- **C6 状态计算重复**：`renderShiseiSyncStatus` 与 `renderSettingsShisei` 各算一份，存在漂移风险，合并为单函数。
- **C4 lint warning 198 条**（0 error）：以 `no-unused-vars` 为主，噪声会掩盖新问题，分批清零。

## P3 · 体验与规模

- **B6 `sunTimes` 时区**：用当天时区偏移计算目标日期，夏令时切换前后日出日落可偏 1 小时；跨时区拍摄场景受影响。
- **B7 单 key 整存**：2000 项目约 4MB、单次保存 4–20ms 可接受；量级再涨需按项目分 key + 导出格式版本化。
- **C5 无障碍**：图标按钮靠 `title`、拖拽无键盘替代、弹窗无 focus trap / `aria-modal`。

## 决策待定（非纯工程项）

- **B1 Web3Forms access key 滥用面**：key 在客户端必然可还原，需在 Web3Forms 侧配域名/速率限制，属外部配置。
- **PoseWear 功能**：`c9fb528` 有意 revert，当前 main 不含；是否恢复未决策。
- **设计 §8 三项**：SW postMessage 运行时读 CACHE、跨项目全局词表、反馈下载为 `.md`，均为产品决策。
