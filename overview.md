# Stillmark · 瞬刻摄影工作台：功能与技术简介

[English](overview.en.md) · [README](README.md) · [产品总纲](PRODUCT.md) · [开发路线](docs/portable-agent-roadmap.md)

当前：v10.9.3。独立摄影师和小团队的本地优先摄影策划与执行工作台，分镜为数据中枢，以已有素材生成排程、沟通文档和现场提醒，不替代创作决策。单文件、零运行时依赖，支持静态部署与 PWA。

## 设计方向

本地优先、原生可迁移、面向 Agent 开放。浏览器存储是本地真源，版本化资产包是跨设备及外部 Agent 的交换边界，正常导入器是统一的校验与写入入口。`main` 已包含严格脚本 CSP、多项目与任意分镜 ZIP 导出，以及分镜包新建/追加导入；旧 JSON 读入仍兼容。独立外部 Agent 与手机/PWA 交接验收待完成。内置模型接入继续暂停。格式和运行时限制见[资产包规范](docs/asset-pack-format.md)，操作入口见[Agent 指南](docs/agent-guide.md)。

## 产品流程

概念、情绪板、参考图、场景及清单 → 分镜 → 线性日程、现场模式与客户文档。随拍、写真、专业、自定义预设只控制显示。图片引用共享本地数据；收藏素材包支持跨设备复用。

## v3 + v9 + v10 数据模型
```
project = {
  id,name,client,studio,status:'灵感期|策划中|待拍摄|后期中|已交付|已归档',shootDate,location,lat,lng,v3,
  workspaceMode?:'casual'|'portrait'|'professional'|'custom',workspaceCustom?:string[],timeZone?:string,
  assetPack?:boolean,         // 导入收藏包，仅展示于收藏夹
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
  shots:[{id,name,date,slot,duration,sceneId,refIds:[≤3],position,light,note,done,ord,fav,mustShoot?,skipped?,deferred?}],
  schedule:[{id,type,title,start,end,note,date,done,fav,timeLocked?,auto?:'call'|'wrap'}],  // v10：slot 由排程引擎派生并物化
  items:[{id,kind:'服装道具|器材',name,note,done,fav}],
  budget:[{id,item,cat,amount,paid,fav}],
  notes:[{id,kind,content,ts,fav}],
  todos:[{id,title,owner,due,done,fav}]
}
```


## 核心实现

| 层 | 实现 |
|---|---|
| 存储 | IndexedDB v4；projects/all 存项目集合，images 存图片；内存缓存、200ms 防抖、串行写链、退避重试、页面隐藏冲刷 |
| 并发 | mergeProjectChanges 按项目 ID 三方比较；同一 readwrite 事务读、合并、写，不同项目独立修改可合并，同项目分歧拒绝；BroadcastChannel 通知；整库恢复/清空仍严格比较基线 |
| 迁移 | sanitizeProject 白名单字段、类型和长度、实体 ID 重写；migrate 兼容旧结构；备份图片键重映射，事务写入项目与图片 |
| 排程 | planDay 派生时段；applyDay 默认日内，超时保留日期；显式整体重排可跨日并支持撤销。锁定节点保留位置 |
| 日照 | sunTimes 按目标日期和 IANA 时区做 NOAA 近似；现场当前日期时间同样按项目时区 |
| 图库 | 独立 shisei_index 元数据与 shisei_images 图片载荷，v3 原子迁移；共享索引/统计缓存，分类每页 48 张，每批 6 张；冷缩略图最多 96 张且载荷字符总数不超过 8 Mi，闲置 5 分钟回收；活动项目引用保留 |
| 素材 | buildAssetProjects 与 copyAssetDependencies 保留场景及图片依赖；assetPack 收藏组不进入看板 |
| 交互 | Pointer Events 排序按真实落点修改完整项目；上下移动提供键盘替代；弹窗焦点管理、参考图原生按钮、看板键盘操作、页签/选图/完成状态局部渲染、基础 CSP 与输入转义 |
| AI | createAiService 十项任务、最小上下文、能力/输出/引用校验及候选快照；生产入口关闭，未进入第 09 批 |

## 源码与验收

src/js 按文件名顺序拼接：01-data、02-core、03-app（看板收藏）、03-b-project、03-c-shots、03-d-schedule、03-e-support、03-f-shootday、04-output、05-boot、06-settings；与 shell、CSS 合成 shotflow.html，再同步至 shotflow-app/。

verify:build 校验逐字节构建一致性；verify:version 校验版本；sync:check 检查副本；test:logic 纯函数回归；test:perf 性能门禁（2000 分镜模板）；test:e2e 三引擎矩阵；lint 检查真实拼接脚本作用域。结果以 [Actions](https://github.com/NopantsNobra/shotflow-planner/actions) 为准。

## 部署与限制

静态 HTTPS 托管，无后端；本地文件可直接打开，PWA 与存储取决于浏览器。数据库仍为集合单 key，非实时多人协作；严格脚本 CSP 已合入 `main`。剩余事项见 [backlog](docs/backlog.md)，AI 接口见 [ai-contract](docs/ai-contract.md)。历史技术细节见 [CHANGELOG](CHANGELOG.md) 与 [系统设计](docs/system_design.md)。
