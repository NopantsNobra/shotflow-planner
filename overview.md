# 瞬刻摄影工作台 · Stillmark 功能索引（开发视角）

## 版本
- 当前：v3（`shotflow.html`，单文件全内联零依赖，node --check 通过）
- 历史：v1 `photo-planner.html`（表单版）、v2（分镜中枢 + 看板 + 拍摄日模式）

## v3 数据模型
```
project = {
  id,name,client,status,shootDate,location,lat,lng,v3,createdAt,updatedAt,
  concept:{theme,style,audience,usage,note},
  mood:[{id,type:'text|color|image',content,tag}],     // image 的 content 是 IndexedDB key
  scenes:[{id,name,note,done}],
  shots:[{id,name,date,slot,duration,sceneId,refIds:[],note,done,ord}],  // ord=拖拽排序
  schedule:[{id,type,title,start,end,note,date,done}], // 流程节点
  items:[{id,kind:'服装道具|器材',name,note,done}],
  budget:[{id,item,cat,amount,paid}],
  notes:[{id,kind,content,ts}],
  todos:[{id,title,owner,due,done}]
}
```
存储：localStorage `wb_sf_projects`；图片 IndexedDB 库 `shotflow` / store `images`。
迁移：loadP() 检测无 v3 标记 → migrate()（refId→refIds、补 duration/ord/新数组）→ 保存。

## 关键实现
- 拖拽排序：Pointer Events + setPointerCapture，.drag-handle 触发；persistOrder 落 ord 并继承邻组日期
- 日落算法：NOAA 近似（eqtime/decl/HA），+ 时区偏移转本地时间；goldenStart=日落-75min
- 拍摄日模式：schedule 节点 + shots 按时间合并；currentId = 今天未完成中最后不超过当前时间的
- 提案文件：buildProposalHTML → Blob 下载，图片 base64 内嵌（imgCache）
- PWA：manifest id=shotflow-planner；SW cache v3；updatefound → toast 提示刷新
- 部署原则：源码一律相对路径，不写任何平台访问码

## 部署
- 流程：改源文件 → cp 到 shotflow-app/ → 部署 shotflow-app/（静态站点，入口 shotflow.html）
- 若托管平台要求 sharecode 一类访问参数，在部署侧注入；不入库
