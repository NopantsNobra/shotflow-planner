# 瞬刻摄影工作台 · Stillmark 功能索引（开发视角）

## 版本
- 当前：v8（`shotflow.html`，单文件全内联零依赖，44 项逻辑/导出测试通过）
- 历史：v4（IndexedDB/导入确认/时间级联）、v1 `photo-planner.html`（表单版）、v2（分镜中枢 + 看板 + 拍摄日模式）

## v3 数据模型
```
project = {
  id,name,client,studio,status,shootDate,location,lat,lng,v3,createdAt,updatedAt,
  concept:{theme,model,style,audience,usage,note},
  mood:[{id,type:'text|color|image',content,tag,tags:string[],autoTags?:string[]}], // tag 只读兼容；image 的 content 是 IndexedDB key
  tagVocab:[string],                                  // 项目级标签词表，首次出现顺序
  scenes:[{id,name,note,done}],
  shots:[{id,name,date,slot,duration,sceneId,refIds:[],note,done,ord}],  // ord=拖拽排序
  schedule:[{id,type,title,start,end,note,date,done}], // 流程节点
  items:[{id,kind:'服装道具|器材',name,note,done}],
  budget:[{id,item,cat,amount,paid}],
  notes:[{id,kind,content,ts}],
  todos:[{id,title,owner,due,done}]
}
```
存储（v4）：项目主数据 IndexedDB 库 `shotflow` / store `projects`（key `all`）；图片同库 store `images`。loadP() 同步读内存缓存 projectsCache，saveP() 200ms 合并写入 IDB。
存储（v7）：新增 `shisei_meta`（key-value）与 `shisei_images`（w300 缩略图 dataURL）；仅供空闲同步与分镜引用，不进项目 JSON / 导出备份。
迁移：initData() 先读 IDB；无则读旧 localStorage `wb_sf_projects` → migrate()（refId→refIds、补 duration/ord/新数组）→ 写 IDB → 清理旧 key。

## 关键实现
- 拖拽排序：Pointer Events + setPointerCapture，.drag-handle 触发；persistOrder 落 ord 并继承邻组日期
- 日落算法：NOAA 近似（eqtime/decl/HA），+ 时区偏移转本地时间；goldenStart=日落-75min
- 拍摄日模式：schedule 节点 + shots 按时间合并；currentId = 今天未完成中最后不超过当前时间的
- 时间统一模型：dayItems() 派生 `_start/_end/_time/_conflict`；cascadeShift() 级联顺延并保证后项不早于前项结束，超出当天 24:00 返回 -1
- 看板检索：boardQuery + boardScope（全部/进行中/已归档），匹配项目名/客户/地点/主题/调性/分镜/沟通记录
- 备份：exportJSON() 全量；exportProject() 单案；importJSON() → askConfirm 二次确认 → applyImport()（单案追加，全量覆盖）
- 文档：openDoc('proposal'|'manual'|'callsheet')，Call Sheet 为 A4 一页纸，天气/联系电话留白
- 提案封面（v5）：`coverData()` 从项目名/概念页/元数据取值 → `coverHtml()` 生成 1080×1620 画廊扉页（双层菱形暗纹 + 天头/地脚细线 + 三栏规格表）；`fitCovers()` 按容器宽度缩放并自动收缩过长文字。弹窗预览与「发送提案文件」共用同一套 `PUBLIC_STYLE`，导出文件内嵌样式与缩放脚本，离线/微信可用
- 标签体系（v6）：`tagKey` NFKC/大小写/空白归一化 → `dedupeTags` 保留首次显示形式 → `migrateTags` 幂等补齐 `tags/tagVocab` → `matchByTags` any|all 筛选（情绪板与分镜 ref picker 共用）→ `renameTag`/`removeTag` 全局同步且不触碰 `refIds`；写路径仍同步只读兼容字段 `tag`
- AI 接口预留（v6）：`suggestTags` 恒关闭、注册表 `TagProviders` 默认空、零网络请求；失败降级 toast，建议先落 `autoTags` 并经用户确认后由 `applyAiSuggestion` 合并；`aiConfig`（含 apiKey）只在内存与 `sessionStorage`，不进项目 JSON / IndexedDB / 导出
- 姿势图库同步（v7）：`parseCatalog` 映射 `data/catalog.json` 的 `id/class_cn/name_*/views` 到 `images/line/w300/{file}`；`diffCatalog` 以远端为准；`nextPendingBatch`/`mergeShiseiMeta` 管理游标与不可变 meta；`startShiseiSync` 仅在可见 / 联网 / 空闲 / 距上次检查 ≥24h 时经 jsDelivr 拉取，并发 ≤3、超时重试，隐藏 / 离线暂停；shisei 分类词不写入 `tagVocab`，导出排除图库
- 分镜交互（v8）：表单草稿 `view.shotDraft` 六字段 oninput 写入 + 重绘回填（选图 / 分类切换 / 同步钩子不再清空输入）；姿势图库 `view.poseCat` 折叠（点分类展开、再点收起，默认收起）；`view.editingShotId/replaceIdx` 分镜参考图编辑态（灯箱 `openRefViewer` 看大图、`removeShotRef` 移除、更换进入选图态、占位图禁看大图可移除）；分镜页 `addShotImg` 经共享 `ingestImageFile(f,tags)` 入库（解耦情绪板 `#m_tag` 依赖）；页签分组块化并随激活组强调
- 测试：`tests/logic.test.mjs`（node 直接运行，44 项：时间逻辑/迁移/封面字段映射/标签纯函数/AI 零网络桩/图库纯函数）；`verify_export` 另验导出 HTML 完整性与文件名
- PWA：manifest id=shotflow-planner；SW cache v5；updatefound → toast 提示刷新
- 部署原则：源码一律相对路径，不写任何平台访问码

## 文件结构
- `shotflow.html` / `shotflow-app/shotflow.html`：源文件与部署副本（同一份内容）
- `tests/logic.test.mjs`：44 项核心逻辑测试（node 直接运行）
- `docs/`：设计文档（`system_design.md` / `class-diagram.mermaid` / `sequence-diagram.mermaid`）
- `shotflow-manifest.json` / `shotflow-sw.js` / `icon-*.png`：PWA 资源

## 部署
- 流程：改源文件 → cp 到 shotflow-app/ → 部署 shotflow-app/（静态站点，入口 shotflow.html）
- 若托管平台要求 sharecode 一类访问参数，在部署侧注入；不入库
