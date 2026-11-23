# 瞬刻摄影工作台 · Stillmark 功能索引（开发视角）

## 版本
- 当前：v10.6.0（`shotflow.html` 由 `src/` 构建产出的单文件、全内联零依赖；104 项逻辑测试 + 7 项 E2E + perf 压测门禁通过）
- 历史：v9（收藏 / 只读示例 / 多图 / 行内编辑）、v7（姿势图库）、v6（素材标签）、v5（提案封面）、v4（IndexedDB/导入确认/时间级联）、v1 `legacy/photo-planner.html`（表单版，已归档）、v2（分镜中枢 + 看板 + 拍摄日模式）

## v3 + v9 + v10 数据模型
```
project = {
  id,name,client,studio,status:'灵感期|策划中|待拍摄|后期中|已交付|已归档',shootDate,location,lat,lng,v3,
  demo:boolean,               // v9：只读示例标记；唯一写守卫在 updateCur()
  v9?:number,                 // v9：示例注入幂等标记（cloneDemo 删除）
  createdAt,updatedAt,
  concept:{theme,model,style,audience,usage,note},
  mood:[{id,type:'text|color|image',content,tag,tags:string[],autoTags?:string[],fav:boolean}], // image 的 content 是 IndexedDB key（v10.4 起仅存「精选图」）
  refs:[{id,key,name,tags:string[],createdAt,fav}], // v10.4：参考图库元数据；二进制仍在 IndexedDB images store
  tagVocab:[string],
  scenes:[{id,name,note,done,fav}],
  dayInit:[ISODate],          // v10：已完成默认项初始化的日期（集合/收工不重复补，删了不复活）
  shootDates:[ISODate],       // v10：拍摄日清单（升序去重）；shootDate 恒 = shootDates[0] || ''，供看板倒计时 / 通告单复用
  shots:[{id,name,date,slot,duration,sceneId,refIds:[≤3],position,light,note,done,ord,fav}],
  schedule:[{id,type,title,start,end,note,date,done,fav,auto?:'call'|'wrap'}],  // v10：slot 由排程引擎派生并物化
  items:[{id,kind:'服装道具|器材',name,note,done,fav}],
  budget:[{id,item,cat,amount,paid,fav}],
  notes:[{id,kind,content,ts,fav}],
  todos:[{id,title,owner,due,done,fav}]
}
```
`slot` 不再由用户输入：`rescheduleDay` 把 `planDay` 的计算结果写回，读取方（`dayItems`/时间轴/通告单/拍摄日）零改动。`auto:'call'` 是集合（时间仍可改，决定分镜链起点），`auto:'wrap'` 是收工（时间由引擎计算，UI 只读）。

八类条目统一 `fav:boolean`（`migrateFav` 幂等补齐，默认 false）；`view` 为纯会话状态（含 allowDemoWrite / 五个行内编辑指针 / refViewer / focusRef），不持久化、不导出。
存储（v4）：项目主数据 IndexedDB 库 `shotflow` / store `projects`（key `all`）；图片同库 store `images`。loadP() 同步读内存缓存 projectsCache，saveP() 200ms 合并写入 IDB。
存储（v7）：新增 `shisei_meta`（key-value）与 `shisei_images`（w300 缩略图 dataURL）；仅供空闲同步与分镜引用，不进项目 JSON / 导出备份。
迁移：initData() 先读 IDB；无则读旧 localStorage `wb_sf_projects` → migrate()（refId→refIds、补 duration/ord/新数组）→ 写 IDB → 清理旧 key。

## 关键实现
- **工程加固（P0/P2，2026-11-21）**：① `saveP` 改为串行写链（`persistChain`）+ 固定快照 + 5 次指数退避重试（200→3200ms 封顶 10s）+ `bindPersistFlush()` 在 `visibilitychange→hidden`/`pagehide` 冲刷未落盘数据，消除关页丢数据窗口；② 新增 `safeColor(v)` 纯函数（hex/rgb/rgba/hsl 白名单，其余回退 `#c8a97e`），情绪板色块、执行手册、提案导出三处颜色渲染及 `addMood('color')` 写入路径统一经它，关闭 CSS 注入面；③ 全部 `img src` 拼接统一 `esc()`；④ 测试扩至 99 项（P0 6 项 + P2 5 项），Playwright E2E 3 用例 + GitHub Actions CI（logic/sync-check/e2e 三 job）+ `scripts/sync-app.mjs` 一键同步部署副本
- **规模性能（压测验证）**：`shotListHtml` 按拍摄日批量预计算 `dayItems` 冲突标记（原先逐条调用是 O(N²)，2000 分镜 ~1125ms → ~7ms）；`tests/perf.mjs` 覆盖看板/分镜/排程/导入/序列化四场景，含 2000 分镜 < 50ms 回归门禁。2000 项目 JSON ~4MB、序列化 ~10ms、反序列化 ~15ms、看板模板 ~4ms，均线性无拐点。
- 拖拽排序：Pointer Events + setPointerCapture，.drag-handle 触发；persistOrder 落 ord 并继承邻组日期
- 日落算法：NOAA 近似（eqtime/decl/HA），+ 时区偏移转本地时间；goldenStart=日落-75min
- 拍摄日模式：schedule 节点 + shots 按时间合并；currentId = 今天未完成中最后不超过当前时间的
- 时间统一模型：dayItems() 派生 `_start/_end/_time/_conflict`；cascadeShift() 保留原实现仅供测试（v10 起 UI 不再调用），超出当天 24:00 返回 -1
- 排程引擎（v10）：`planDay(p,date,anchorId)` 纯函数——分镜按 `ord` 稳定升序从 `max(10:00, 集合结束)` 顺序排、遇节点区间跳到其结束（上限 50 次防死循环）、`shiftedCount` 记录相对「无节点链」后移条数、`wrap = 最晚结束 + 15`、`overflow` 标记超过 1440；`anchorId` 命中时 anchor 之后的节点按 start 升序链式顺延（`nodeShifts`），anchor 自身与前序节点位置不变（重叠只标红 `_conflict`）。`dayDefaults`/`ensureDayDefaults`（幂等 + `dayInit`）/`rescheduleDay`（物化 slot、收工、被顺延节点）/`applyDay` = 补 + 排
- 重排写入口（9 个，全部在同一个 `updateCur` 回调内 mutate → ensure → reschedule，单次落盘、自动受 demo 只读守卫）：addShot / saveShotEdit / delShot / persistOrder（改天两天都排）/ addNode（anchor=新节点）/ saveNodeEdit（anchor=被编辑节点）/ delNode / autoSyncDay / sdPostpone
- 多日拍摄（v10）：`shootDates` 为真源，`normalizeShootDates` 过滤非法+去重升序并同步 `shootDate`；登记只在「该日首次有内容」时发生——`ensureShootDate(date)` 的三个调用点是 `addShot` / `addNode` / `persistOrder`（跨日拖拽），`chooseSchedDate`（切 tab / 顶部日期框）**只切查看不登记**，也不放进 `renderSchedule`/`autoSyncDay`；信息卡「Day 1 · 首个拍摄日」由纯函数 `resolveShootDate(p,D)` 判定 —— `noop`（已存在/非法）/ `replace`（原 Day 1 无分镜且无手填环节 → 顶掉首日并清其 `dayInit`）/ `append`（有内容 → 追加为 Day N 并 toast 提示 Day 1 未改动）；日程页 `dayTabsHtml` 渲染 Day tab（带条数）+ 添加（默认 `addDays(最后一天,1)`）/ 删除（`removeShootDay`：有分镜或手填环节则拒绝，仅清引擎生成的集合/收工与 `dayInit`）；分镜表单 `#s_date` 为拍摄日下拉（`pickShotDate` / `confirmNewShotDate`），列表按日期分组（`day-head` 带条数·合计分钟）；拖到未登记日期时 `persistOrder` 会 `addShootDate` 自动登记
- 自动跨日（v10）：`addDays(dateStr,n)` 本地日期构造、处理跨月跨年；`planDay` 返回 `overflowShots:[{id,toDate}]`（某条 `start+duration>1440` 时该条及其后全部滚走），单条 >14h 或 `noRoll` 时改为 `overflowHard` 原位 clamp；`rescheduleDay` 用最多 7 轮 `for` 循环（不递归）：移入次日时 `ord=max(ord)+1` 追加末尾、次日自动入 `shootDates`、次日从 `max(10:00,集合结束)` 起排；7 轮后仍溢出 → `capHit` + 兜底 clamp 写回（toast「排期已跨越 7 天」）
- 渲染期自愈（v10）：`renderSchedule`/`renderShootDay` 进入某日期先 `autoSyncDay`——demo 直接跳过、`dayInit` 已含且无 drift 时提前返回，避免「渲染 → 写盘 → 重绘」循环；被顺延节点用 `view.lastShift` 临时标「已顺延」（30 秒或下次重排清除）
- 看板检索：boardQuery + boardScope（全部/进行中/已归档），匹配项目名/客户/地点/主题/调性/分镜/沟通记录
- 备份：exportJSON() 全量；exportProject() 单案；importJSON() → askConfirm 二次确认 → applyImport()（单案追加，全量覆盖）
- 文档：openDoc('proposal'|'manual'|'callsheet')，拍摄通告单（Call Sheet）为 A4 一页纸，天气/联系电话留白
- 提案封面（v5）：`coverData()` 从项目名/概念页/元数据取值 → `coverHtml()` 生成 1080×1620 画廊扉页（双层菱形暗纹 + 天头/地脚细线 + 三栏规格表）；`fitCovers()` 按容器宽度缩放并自动收缩过长文字。弹窗预览与「发送提案文件」共用同一套 `PUBLIC_STYLE`，导出文件内嵌样式与缩放脚本，离线/微信可用
- 标签体系（v6）：`tagKey` NFKC/大小写/空白归一化 → `dedupeTags` 保留首次显示形式 → `migrateTags` 幂等补齐 `tags/tagVocab` → `matchByTags` any|all 筛选（情绪板与分镜 ref picker 共用）→ `renameTag`/`removeTag` 全局同步且不触碰 `refIds`；写路径仍同步只读兼容字段 `tag`
- AI 接口预留（v6）：`suggestTags` 恒关闭、注册表 `TagProviders` 默认空、零网络请求；失败降级 toast，建议先落 `autoTags` 并经用户确认后由 `applyAiSuggestion` 合并；`aiConfig`（含 apiKey）只在内存与 `sessionStorage`，不进项目 JSON / IndexedDB / 导出
- 姿势图库同步（v7）：`parseCatalog` 映射 `data/catalog.json` 的 `id/class_cn/name_*/views` 到 `images/line/w300/{file}`；`diffCatalog` 以远端为准；`nextPendingBatch`/`mergeShiseiMeta` 管理游标与不可变 meta；`startShiseiSync` 仅在可见 / 联网 / 空闲 / 距上次检查 ≥24h 时经 jsDelivr 拉取，并发 ≤3、超时重试，隐藏 / 离线暂停；shisei 分类词不写入 `tagVocab`，导出排除图库
- 图片归档（v10.4）：`ingestImageFile(f,tags,silent,target)` 压缩入库后**总是**写 `p.refs`，只有 `target==='mood'`（情绪板页「上传精选图」）才额外写 `p.mood`；分镜页 `addShotImg` 默认 `'ref'`；分镜 ref picker 从 `p.refs` 派生；情绪板 `toggleRefPicker`/`selectRefToMood` 提供显式精选（已在 mood 则按钮禁用，`updateCur` 单点只读守卫）；`cacheProjectImages` 预载 mood image + refs.key + shots.refIds（去重、跳过 shisei），`collectImages` 导出同样含 refs.key；`migrate` 把历史 mood 图片全部转入 refs（按 key 去重、幂等、vm 安全用 key 作迁移条目 id）；v10.4.1 起未收藏的从 mood 移出，仅 `fav:true` 与示例图保留，提案只渲染精选图
- 文档图片尺寸（v10.4）：`.doc .shot-ref/ .shot-ref-miss` 56→112px + `max-width:none` 覆盖 `.doc img{max-width:110px}`，`.doc .ref-cell{white-space:normal}`，`@media screen and (max-width:768px)` 降到 84px（打印保持 112），表格其余列结构与 `li()` 列数不变
- 分镜交互（v8）：表单草稿 `view.shotDraft` 六字段 oninput 写入 + 重绘回填（选图 / 分类切换 / 同步钩子不再清空输入）；姿势图库 `view.poseCat` 折叠（点分类展开、再点收起，默认收起）；`view.editingShotId/replaceIdx` 分镜参考图编辑态（灯箱 `openRefViewer` 看大图、`removeShotRef` 移除、更换进入选图态、占位图禁看大图可移除）；分镜页 `addShotImg` 经共享 `ingestImageFile(f,tags)` 入库（解耦情绪板 `#m_tag` 依赖）；页签分组块化并随激活组强调
- 示例注入（v9）：`ensureV9Demo()` 独立于 `seed()`，`wb_sf_demo_v9` + 项目 `v9:1` 双 guard；只追加 5 个完整示例（灵感期 / 策划中 / 后期中 / 已交付 / 已归档），待拍摄沿用旧「城市漫游者」，最终共 6 个示例；并给旧项目补 demo / 一张图 / 一条 fav；`slugPreview` 生成内联 SVG dataURL，`imgCache` 预热 + `idb.put` 落库，离线可见
- 示例只读与复制（v9）：唯一写守卫在 `updateCur()`（`p.demo && !view.allowDemoWrite` → toast + return；分镜多图上传 / 情绪板文字 / 情绪板上传三个入口另各做一次提前提示，避免重复 toast）；渲染层只做角标 / 按钮显隐 / disabled；`cloneDemo` 删 demo/v9、新 id、名字加「（副本）」、图片 key 共享，`copyDemoToMine` 是唯一逃生阀
- 多图与灯箱（v9）：`parseMultiImage` 取文件 → `for...of await ingestImageFile` 顺序入库、单张失败跳过；新增态补 `selRefs` 到 3、替换态只改 `refIds[i]`、其余仅入参考图库（v10.4 起不再进情绪板）；一次汇总 toast + 一次 `renderShots`；灯箱 `refNav(±1)` 环形切换、`shisei:` 占位禁大图但可换可删
- 行内编辑与收藏定位（v9）：`beginInlineEdit` 先清五个指针，只开一行；保存白名单不动 done/date/ts/fav/kind；`collectFavorites` 按项目 → 模块分组，`jumpToFav` 设 `schedDate`/`focusRef`，高亮 3 秒后按 id 复核清除；Esc 优先级 refViewer → confirmModal → 行内编辑 → 其它弹窗
- 看板筛选（v9）：`matchBoardScope`/`isActiveStatus` 单一真源，「已归档」= 已交付 + 已归档；备份提醒 `backupItemCount` 排除 demo
- 测试：`tests/logic.test.mjs`（node 直接运行，99 项：在上述 88 项基础上新增 P0 持久化加固 6 项（退避/串行/冲刷）+ P2 safeColor 白名单 5 项（合法值/注入回退/边界）；原有 88 项含 v10.4 refs 迁移去重/幂等 2 项、多日/跨日 10 项、时间逻辑/迁移/封面字段映射/标签纯函数/AI 零网络桩/图库纯函数/v9 fav/demo/示例完整性、v10 排程引擎 12 项）；`tests/e2e/app.spec.js` 4 项 Playwright 用例（核心路径/渲染层回归/P2 注入/持久化）；`verify_export` 另验导出 HTML 完整性与文件名
- PWA：manifest id=shotflow-planner；SW cache v10-5；updatefound → toast 提示刷新
- 部署原则：源码一律相对路径，不写任何平台访问码

## 文件结构
- `src/shell.html` + `src/styles.css` + `src/js/01-data.js`~`05-boot.js`：P3 拆分后的多文件源码（按连续区间切分，保持顺序）
- `shotflow.html`：由 `src/` 经 `scripts/build.mjs` 构建产出的自包含单文件交付物（与拆分前逐字节一致，双击即用）
- `shotflow-app/shotflow.html`：部署副本（与根目录交付物同一份内容，由 sync-app.mjs 同步）
- `scripts/build.mjs` / `verify-build.mjs` / `sync-app.mjs`：构建 / 一致性校验 / 副本同步
- `tests/logic.test.mjs`：99 项核心逻辑测试（node 直接运行，仍从构建产物抽取函数）
- `tests/e2e/app.spec.js`：4 项 Playwright E2E（含 P2 注入回归）
- `docs/`：设计文档（`system_design.md` / `class-diagram.mermaid` / `sequence-diagram.mermaid`）
- `shotflow-manifest.json` / `shotflow-sw.js` / `icon-*.png`：PWA 资源

## 部署
- 流程：改 `src/` → `npm run build` 生成 shotflow.html → `npm run sync` 同步到 shotflow-app/ → 部署 shotflow-app/（静态站点，入口 shotflow.html）
- `npm run verify:build` 保证交付物与源码一致；`npm run sync:check` 保证副本与交付物一致（CI 均自动执行）
- 若托管平台要求 sharecode 一类访问参数，在部署侧注入；不入库
