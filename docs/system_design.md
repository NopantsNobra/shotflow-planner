# 瞬刻摄影工作台 Stillmark · v10 实现设计与任务分解

- 基线：HEAD `97eba10`（v9）· `shotflow.html` 2588 行 · `tests/logic.test.mjs` 59 项
- 本文所有行号均指 **基线 `97eba10` 的实际行号**（已逐处核对，非推算）
- 硬约束：时间模型按主理人「已定模型」落地，本文只做可执行规格化；**不改模型**
- 交付物：本文件 + `docs/sequence-diagram.mermaid` + `docs/class-diagram.mermaid`

**先看第 7 节「待明确事项」——我发现了 4 处会直接导致实现失败或测试红掉的冲突，均已给出不违背模型的解法。**

---

## 1. 实现方案总述

### 1.1 单文件三层如何组织

`shotflow.html` 已是「样式 → 纯函数层 → 状态/写守卫 → 渲染层 → 启动」的单文件结构。v10 严格沿用，新增内容归位：

| 层 | 位置（基线行号） | v10 新增内容 |
|---|---|---|
| 常量层 | 404-411（`TAG_SUGGESTIONS`）之后 | `POSITION_OPTS`、`LIGHT_OPTS` |
| 常量层 | 1711-1712（`NODE_TYPES`/`NODE_COLORS`）不变 | — |
| **纯函数层（新）** | **1749（`fmtMin`）之后插入一整块「v10 排程引擎」** | `DAY_BASE/COLLECT_START/COLLECT_MIN/WRAP_MIN/SHOT_DEFAULT_MIN`、`pinOf`、`planDay`、`dayDefaults`、`ensureDayDefaults`、`rescheduleDay`、`applyDay` |
| 纯函数层（旧，不改） | 1746-1791：`addMin`/`toMin`/`fmtMin`/`dayItems`/`cascadeShift` | 一行不动（测试依赖） |
| 状态层 | 546-552 `freshView` / 555-561 `updateCur` / 685-690 `clearInlineEditState` | 追加 `editingShotEditId`（**不能复用 `editingShotId`**，见 §7.2） |
| 渲染层 | 1469-1550 分镜、1715-1827 日程、2011-2058 拍摄日、2071-2151 文档 | 见 §2 文件清单 |

为什么插在 `fmtMin` 之后而不是文件末尾：`dayItems`/`cascadeShift`/`timelineHtml` 都在 1750+，把「分钟换算 → 排程引擎 → 既有消费方」排成一条阅读线，工程师改动时不易漏改。

### 1.2 为什么选「物化 slot」而非「纯派生」

- 消费 `slot` 的地方共 **8 处**（`shotSortKey` 1468、分镜列表元信息 1543、`renderSchedule` 1719、`dayItems` 1753-1754、`renderShootDay` 2034-2037、`callSheetHtml` 2077、`openDoc` 2132、`cascadeShift` 1784）。纯派生 = 这 8 处全部要改成「先调 planDay 再取」——`dayItems` 签名要变（它被 5 处调用）、`renderShootDay` 的 `_time` 语义要变、导出/Call Sheet 要串行重算。
- 物化 = 8 处**零改动**，只需在 9 个写入口调 `rescheduleDay`。改动面从「8 个读取点」收敛到「9 个写入点」，且写入点全部集中在 `updateCur` 回调内，天然受 demo 只读守卫保护。
- 代价：数据的 `slot` 与 `ord/duration/schedule` 之间出现一次「派生 → 写回」的耦合，任何漏掉的写入口会让时间轴短暂不一致。**§4 的 9 条调用链就是这张漏改清单**，任务分解（§5）按它做验收。

### 1.3 对既有 59 项测试的兼容策略（逐条核对）

`tests/logic.test.mjs` 的 `fn(name)` 抽取器要求被测函数**只依赖 ctx 白名单**：`console, Date, Math, String, Number, Array, Object, JSON, RegExp, Set, encodeURIComponent`。
**注意：ctx 里没有 `parseInt`、`parseFloat`、`isNaN`、`Boolean`。** → 新增纯函数内一律用 `+x` / `Math.round` / `Number(x)`，**禁止 `parseInt`**（现有代码 1650 行 `parseInt` 在 `addShot` 里，那是渲染层，不受影响）。

| 测试行 | 断言 | 与 v10 模型的关系 | 结论 |
|---|---|---|---|
| 27-29 | `toMin/fmtMin/addMin` | 不动 | ✅ 通过 |
| 40-45 | `dayItems` 合并 4 条 / 排序 `a,b,c,n` / `b._conflict` / `c` 不冲突 / `n._end=1035` | `dayItems` **一行不改**；`planDay` **不得**在 `dayItems` 内部被调用（否则递归 + 副作用） | ✅ 通过 |
| 47-53 | `cascadeShift(P,...,'a',60)` → `moved===4`、冲突归零 | `cascadeShift` **整函数保留原样**。v10 后 UI 不再调用它（`sdPostpone` 改写为整日顺延），函数变为「仅测试 + 备用」 | ✅ 通过（保持函数存在即可） |
| **65-67** | `migrate({shots:[{id:'s',refId:'img1'}]})` → **`duration === 20`** | ❌ **与「duration 缺省改 10」直接冲突** | ⚠️ **migrate 保持 20**，见 §7.1 |
| 70-96 | 标签纯函数 | 不动 | ✅ 通过 |
| 142-152 | `initData` 迁移旧 localStorage → `refIds` | `migrate` 追加字段不影响 `refIds`；`migrate` **禁止**调用 `ensureDayDefaults`（需 `uid`） | ✅ 通过 |
| **160-164** | `clearInlineEditState(v)` 后 **`v.editingShotId === 'keep'`** | ❌ **与「clearInlineEditState 增加 editingShotId 清理」直接冲突** | ⚠️ **不清 `editingShotId`，改用新指针**，见 §7.2 |
| 165-172 | `migrateFav` 八数组 / demo 默认 / 幂等 | `dayInit` 加在 `migrate` 里，**不加进 `migrateFav` 的 kinds** | ✅ 通过 |
| 216-244 | `demoSpecs` 五项、`buildDemoProject` 各页签非空、`sched>=2`、`shots>=2`、`fav>=1`、`refs===3` | 示例新增「集合 + 收工」只会让 `sched` 变大（断言是 `>=`）；`favIndex` 只用于 mood/shots/notes，不碰 schedule | ✅ 通过（需保住 855 行 `refIds=imgs.slice(0,3)` 不动） |

**结论：59 项可以做到一行不改。** 前提是遵守三条纪律：
1. `migrate` 的 `duration` 兜底继续写 20；
2. `clearInlineEditState` 不清 `editingShotId`；
3. `dayItems` / `cascadeShift` / `addMin` / `toMin` / `fmtMin` 一行不动。

新测试**追加在第 245 行之后、第 246 行 `console.log('RESULT ...')` 之前**，通过独立的 `vm.runInContext(fn(n), ctx)` 循环注入新函数 + 一行常量注入，从而 **1-245 行零改动**。

---

## 2. 精确文件清单

### 2.1 `shotflow.html`（唯一源码文件）

| # | 函数 / 区块 | 基线行号 | 性质 | 具体改动 |
|---|---|---|---|---|
| 1 | CSS `.tag.red …` 之后 | 47 后 | 新增 | `.auto-pill` 自动徽标、`.new-scene` 新建场景行内条、`.shot .inline-edit{margin:0}` |
| 2 | CSS `.sd-shot .sd-meta` 之后 | 274 后 | 新增 | `.sd-tag`（深色卡片上的「分镜」标签） |
| 3 | `TAG_SUGGESTIONS` 之后 | 411 后 | 新增 | `const POSITION_OPTS=[...]`、`const LIGHT_OPTS=[...]` |
| 4 | `freshView` | 546-552 | 微调 | 增加 `editingShotEditId:null` |
| 5 | `updateCur` | 555-561 | **不改** | 复用 demo 只读守卫（所有重排都经它） |
| 6 | `clearInlineEditState` | 685-690 | 微调 | 增加 `v.editingShotEditId=null`（**不得**加 `editingShotId`） |
| 7 | `buildDemoProject` | 849-860、873 后 | 重写片段 | 分镜去掉硬编码 `slot`；节点改为显式「集合(`auto:'call'`) + 业务节点 + 收工(`auto:'wrap'`)」；`p.dayInit=[day]`；`migrate(p)` 后调 `rescheduleDay(p,day)` |
| 8 | `migrate` | 880-895 | 微调 | `p.dayInit=p.dayInit\|\|[]`；`s.position=s.position\|\|''`、`s.light=s.light\|\|''`；`duration` 兜底**仍为 20** |
| 9 | `seed` | 962-973 | 微调 | 节点加 `auto:'call'` / `auto:'wrap'`，`dayInit:[t]` |
| 10 | `renderShots` 表单 | 1515-1522 | 重写 | 删 `s_slot`；`s_dur` 默认 10；`s_scene` 加 `__new` + 「管理」；新增 `s_pos`/`s_light` 下拉；`s_note` 占位改「补充描述…」 |
| 11 | `renderShots` 新建场景条 | 1522 后 | 新增 | `D.scene==='__new'` 时渲染 `#new_scene_name` + 添加/取消 |
| 12 | `renderShots` 列表行 | 1538-1545 | 重写 | 行内编辑态分支（`esh_*`）、`editBtn('Shot',id)`、元信息追加 `· 机位 · 光线` |
| 13 | `pickShotScene` / `addSceneInline` / `cancelSceneInline` | 1554 后 | 新增 | 三个小函数 |
| 14 | `addShot` | 1644-1653 | 重写 | 去 `slot`、加 `position`/`light`、`duration` 默认 10、`applyDay(p,d)`、toast |
| 15 | `persistOrder` | 1693-1706 | 微调 | 捕获改期前后两个 date，各自 `applyDay` |
| 16 | `saveShotEdit` / `cancelShotEdit` | 1708 后 | 新增 | 见 §3.2 |
| 17 | `delShot` | 1708 | 重写 | 先取 `s.date` → 删 → `applyDay(p,date)` |
| 18 | **「v10 排程引擎」整块** | **1749 后插入** | 新增 | 5 常量 + `pinOf`/`planDay`/`dayDefaults`/`ensureDayDefaults`/`rescheduleDay`/`applyDay`/`autoSyncDay`/`toastResched` |
| 19 | `renderSchedule` | 1715-1745 | 微调 | 进入日期先 `autoSyncDay(schedDate)`；删死变量 1718-1719；表单默认时间改 `10:00`/`10:30` |
| 20 | `dayItems` | 1750-1764 | **不改** | — |
| 21 | `cascadeShift` | 1766-1791 | **不改** | 仅加注释「v10 起 UI 不再调用」 |
| 22 | `timelineHtml` | 1792-1827 | 微调 | 分镜行加 `<span class="tag">分镜</span>`（1803 行）；收工节点加 `.auto-pill` 且编辑态 `type`/`start`/`end` 全部 `disabled`（1810-1813） |
| 23 | `saveNodeEdit` | 1828-1835 | 微调 | 保存后 `applyDay(p,schedDate)` + toast；`auto` 节点忽略 `type/start/end` 提交 |
| 24 | `addNode` | 1836-1840 | 微调 | 同上（`applyDay` + toast） |
| 25 | `delNode` | 1842 | 重写 | 取 `n.date` → 删 → `applyDay` |
| 26 | `renderShootDay` | 2042-2048 | 微调 | 分镜名前置 `.sd-tag` 分镜标签；顺延按钮文案改「整日顺延 1 小时」 |
| 27 | `sdPostpone` | 2062-2067 | 重写 | 整日节点 +60 → `applyDay`；无节点时 toast 提示 |
| 28 | `callSheetHtml` | 2075-2087 | 微调 | 分镜行追加机位/光线列（有值才出列）；表头同步 |
| 29 | `openDoc`（执行手册分镜表） | 2130-2132 | 微调 | 追加「机位」「光线」两列；`li(...,5)` → `li(...,5/7)` 动态 |
| 30 | Esc 优先级链 | 2560-2567 | 微调 | `cancelInlineEdit()` 之后插入 `if(cancelShotEdit()) return;` |

### 2.2 其它文件

| 文件 | 改动 |
|---|---|
| `tests/logic.test.mjs` | 仅在 245/246 行之间**追加** v10 测试块（12 项）；1-245 行零改动 |
| `shotflow-sw.js` | `const CACHE='shotflow-v9'` → `'shotflow-v10'`（第 1 行） |
| `README.md` | §六 迭代记录追加 v10 行；§七 已知限制追加「旧项目首开分镜时间会整体重排到 10:00 起」 |
| `docs/system_design.md` / `docs/*.mermaid` | 本文件与两张图（覆盖 v9 版本） |

### 2.3 新增 DOM id

`#s_pos`、`#s_light`、`#new_scene_name`、`#esh_name`、`#esh_dur`、`#esh_scene`、`#esh_pos`、`#esh_light`、`#esh_note`

> 前缀用 `esh_` 而不是 `es_`：`es_name`/`es_note` 已被**清单页行内编辑**（1852-1853、`saveStuffEdit` 1870）占用，两个模块虽然不同页签但同名 id 会在 `gv()` 上产生串味风险。见 §7.3。

---

## 3. 数据结构与接口

### 3.1 类型定义（TS-like）

```ts
type HHMM    = string;   // 'HH:MM'
type Minutes = number;   // 自 00:00 起的分钟数；可能 > 1440（溢出，仅用于判定）
type ISODate = string;   // 'YYYY-MM-DD'

interface Shot {
  id: string; name: string; date: ISODate;
  slot: HHMM;              // v10：派生 + 物化写回；不再由用户输入
  duration: number;        // 分钟；新增默认 10，历史数据兜底 20
  sceneId: string; refIds: string[];
  note: string;
  position: string;        // 新增：机位，POSITION_OPTS 之一或 ''
  light: string;           // 新增：光线，LIGHT_OPTS 之一或 ''
  done: boolean; ord: number; fav: boolean;
}

interface ScheduleNode {
  id: string; type: string; title: string;
  start: HHMM; end: HHMM; note: string; date: ISODate;
  done: boolean; fav: boolean;
  auto?: 'call' | 'wrap';  // 新增：集合='call'、收工='wrap'
}

interface Project {
  /* v9 既有：mood shots schedule scenes items budget notes todos concept tagVocab demo v9 ... */
  dayInit: ISODate[];      // 新增：已完成默认项初始化的日期（幂等 + 删除后不复活）
}

interface PlanShot  { id: string; start: Minutes; end: Minutes; duration: number }
interface PlanNode  { id: string; start: Minutes; end: Minutes; auto: 'call' | 'wrap' | null }
interface DayPlan {
  date: ISODate; base: Minutes;
  shots: PlanShot[]; nodes: PlanNode[];
  wrap: { start: Minutes; end: Minutes };
  overflow: boolean;       // 任一 end > 1440
  shiftedCount: number;    // 因锚点避让而后移的分镜条数（相对"无锚点顺序链"）
  nodeShifts: { id: string; from: Minutes; to: Minutes }[];  // anchor 之后被链式顺延的节点
}

interface NodeDefault {    // dayDefaults 的返回元素（纯描述，不含 id，id 由 ensureDayDefaults 生成）
  kind: 'call' | 'wrap' | 'adopt';
  type?: string; title?: string; start?: HHMM; end?: HHMM; note?: string;
  auto?: 'call' | 'wrap';
  id?: string;             // kind==='adopt' 时指向既有集合/收工节点
}
```

### 3.2 函数签名表

| 函数 | 入参 | 返回 | 副作用 | 依赖 | vm 可抽取 |
|---|---|---|---|---|---|
| `pinOf(n, defMin?)` | 节点 | `{start:Minutes,end:Minutes}` | 无 | `toMin`/`addMin` | ✅ |
| `planDay(p,date,anchorId?)` | 项目 | `DayPlan` | **无** | `toMin`/`addMin`/`Math` | ✅ |
| `dayDefaults(p,date)` | 项目 | `NodeDefault[]` | **无** | `addMin` | ✅ |
| `ensureDayDefaults(p,date,mkId?)` | 项目 | `number`（新增条数） | 改 `p.schedule`/`p.dayInit` | `dayDefaults`/`uid` | ✅（传 `mkId`） |
| `rescheduleDay(p,date,anchorId?)` | 项目 | `DayPlan` | 写 `shot.slot`、`wrap.start/end`、被顺延节点 `start/end` | `planDay`/`fmtMin` | ✅ |
| `applyDay(p,date,anchorId?)` | 项目 | `DayPlan` | = ensure + reschedule | 上述 | ✅ |
| `autoSyncDay(date)` | date | `void` | 必要时 `updateCur` | `cur`/`updateCur`/`planDay` | ❌ 渲染层 |
| `toastResched(plan)` | DayPlan | `void` | toast | `toast` | ❌ 渲染层 |
| `saveShotEdit(id)` | id | `void` | 写 + 重排 + 重绘 | `gv`/`updateCur` | ❌ 渲染层 |
| `cancelShotEdit()` | — | `boolean` | 清指针 + 重绘 | — | ❌ 渲染层 |
| `addSceneInline()` / `cancelSceneInline()` / `pickShotScene(v)` | — | `void` | 写 / 重绘 | `gv`/`updateCur` | ❌ 渲染层 |

### 3.3 `planDay` 完整实现（逐行可核对）

```js
/* ===== v10 排程引擎 ===== */
const DAY_BASE='10:00';        // 分镜链起点
const COLLECT_START='09:30';   // 默认集合开始
const COLLECT_MIN=30;          // 集合/缺省节点时长
const WRAP_MIN=15;             // 收工固定时长
const SHOT_DEFAULT_MIN=10;     // 分镜默认时长

function pinOf(n,defMin){
  const st=toMin(n.start);
  let en=toMin(n.end||addMin(n.start,defMin||COLLECT_MIN));
  if(en<=st) en=st+(defMin||COLLECT_MIN);
  return {start:st,end:en};
}

function planDay(p,date,anchorId){
  // ① 当天分镜，按 ord 升序；ES2019 排序稳定 → ord 相同沿用数组顺序（与列表显示一致）
  const shotsIn=(p.shots||[]).filter(s=>s.date===date).slice()
    .sort((a,b)=>((a.ord||0)-(b.ord||0)));
  // ② 当天节点（无 start 的历史脏数据跳过）；集合/收工用 auto 或 type 双条件判定（老数据无 auto）
  const nodesIn=(p.schedule||[]).filter(n=>(n.date||date)===date&&n.start);
  const callN=nodesIn.filter(n=>n.auto==='call'||n.type==='集合')[0]||null;
  const wrapN=nodesIn.filter(n=>n.auto==='wrap'||n.type==='收工')[0]||null;
  const callR=callN?pinOf(callN):null;
  // ③ pos = 排除集合与收工后的其余节点；anchor 之后按 start 升序链式顺延（anchor 自身与前序不动）
  const pos=nodesIn.filter(n=>n!==callN&&n!==wrapN)
    .map(n=>{const r=pinOf(n);return {id:n.id,start:r.start,end:r.end,dur:r.end-r.start};})
    .sort((a,b)=>a.start-b.start||a.end-b.end);
  const nodeShifts=[];
  const aIdx=anchorId?pos.findIndex(x=>x.id===anchorId):-1;
  if(aIdx>=0){
    let prevEnd=-1;
    pos.forEach((it,i)=>{
      if(i>aIdx&&it.start<prevEnd){
        nodeShifts.push({id:it.id,from:it.start,to:prevEnd});
        it.end=prevEnd+it.dur; it.start=prevEnd;
      }
      if(it.end>prevEnd) prevEnd=it.end;
    });
  }
  const pins=pos.map(it=>({id:it.id,start:it.start,end:it.end}));
  // ④ 起点：10:00，但集合若被改晚则以集合结束为准
  const base=Math.max(toMin(DAY_BASE),callR?callR.end:0);
  let cursor=base, ideal=base, shiftedCount=0;
  const shots=[];
  shotsIn.forEach(s=>{
    const dur=Math.max(5,Math.round(+s.duration||0)||SHOT_DEFAULT_MIN);   // 禁止 parseInt（ctx 无此全局）
    for(let guard=0;guard<50;guard++){                                    // ⑤ 遇锚点跳到锚点结束，上限 50 次
      const hit=pins.find(pn=>pn.start<cursor+dur&&pn.end>cursor);
      if(!hit) break;
      cursor=hit.end;
    }
    if(cursor>ideal) shiftedCount++;    // 与"无锚点顺序链"相比后移了，计一次
    shots.push({id:s.id,start:cursor,end:cursor+dur,duration:dur});
    cursor+=dur; ideal+=dur;
  });
  // ⑥ 收工 = max(所有 pin.end, 所有 shot.end, 集合.end, base)，再 +15
  let wrapStart=base;
  pins.forEach(pn=>{if(pn.end>wrapStart)wrapStart=pn.end;});
  shots.forEach(r=>{if(r.end>wrapStart)wrapStart=r.end;});
  if(callR&&callR.end>wrapStart) wrapStart=callR.end;
  const wrap={start:wrapStart,end:wrapStart+WRAP_MIN};
  // ⑦ 溢出判定
  let overflow=false;
  shots.forEach(r=>{if(r.end>1440)overflow=true;});
  pins.forEach(pn=>{if(pn.end>1440)overflow=true;});
  if(wrap.end>1440) overflow=true;
  // ⑧ 节点视图（含集合/收工，供 UI 与测试使用）
  const nodes=[];
  if(callR) nodes.push({id:callN.id,start:callR.start,end:callR.end,auto:'call'});
  pins.forEach(pn=>nodes.push({id:pn.id,start:pn.start,end:pn.end,auto:null}));
  if(wrapN) nodes.push({id:wrapN.id,start:wrap.start,end:wrap.end,auto:'wrap'});
  return {date:date,base:base,shots:shots,nodes:nodes,wrap:wrap,
          overflow:overflow,shiftedCount:shiftedCount,nodeShifts:nodeShifts};
}

function dayDefaults(p,date){
  const out=[];
  if(!p||!date) return out;
  if(Array.isArray(p.dayInit)&&p.dayInit.indexOf(date)>=0) return out;   // 已初始化 → 幂等退出
  const nodes=(p.schedule||[]).filter(n=>(n.date||date)===date);
  const call=nodes.filter(n=>n.auto==='call'||n.type==='集合')[0];
  const wrap=nodes.filter(n=>n.auto==='wrap'||n.type==='收工')[0];
  if(!call) out.push({kind:'call',type:'集合',title:'集合',auto:'call',
    start:COLLECT_START,end:addMin(COLLECT_START,COLLECT_MIN),note:'器材清点与出发'});
  else if(!call.auto) out.push({kind:'adopt',id:call.id,auto:'call'});   // 老数据「集合」升级为自动节点
  if(!wrap) out.push({kind:'wrap',type:'收工',title:'收工',auto:'wrap',
    start:DAY_BASE,end:addMin(DAY_BASE,WRAP_MIN),note:''});
  else if(!wrap.auto) out.push({kind:'adopt',id:wrap.id,auto:'wrap'});   // 老数据「收工」升级，时间交给 planDay 接管
  return out;
}

function ensureDayDefaults(p,date,mkId){
  mkId=mkId||uid;
  p.dayInit=Array.isArray(p.dayInit)?p.dayInit:[];
  p.schedule=Array.isArray(p.schedule)?p.schedule:[];
  let added=0;
  dayDefaults(p,date).forEach(function(d){
    if(d.kind==='adopt'){
      const n=p.schedule.filter(x=>x.id===d.id)[0];
      if(n) n.auto=d.auto||'wrap';
      return;
    }
    p.schedule.push({id:mkId(),type:d.type,title:d.title,start:d.start,end:d.end,
      note:d.note||'',date:date,done:false,fav:false,auto:d.auto});
    added++;
  });
  if(p.dayInit.indexOf(date)<0) p.dayInit.push(date);
  return added;
}

function rescheduleDay(p,date,anchorId){
  const plan=planDay(p,date,anchorId);
  (p.shots||[]).forEach(function(s){
    if(s.date!==date) return;
    const r=plan.shots.filter(x=>x.id===s.id)[0];
    if(r) s.slot=fmtMin(r.start);          // 唯一真源仍是 shot.slot
  });
  (p.schedule||[]).forEach(function(n){
    if((n.date||date)!==date||!n.start) return;
    if(n.auto==='wrap'){ n.start=fmtMin(plan.wrap.start); n.end=fmtMin(plan.wrap.end); return; }
    const r=plan.nodes.filter(x=>x.id===n.id)[0];
    if(r&&n.auto!=='call'){                // 位置节点（含被顺延的）写回；集合时间永远来自用户输入
      const rs=fmtMin(r.start), re=fmtMin(r.end);
      if(rs!==n.start) n.start=rs;
      if(re!==n.end) n.end=re;
    }
  });
  return plan;
}

function applyDay(p,date,anchorId){ ensureDayDefaults(p,date); return rescheduleDay(p,date,anchorId); }
```

**边界与实现约定**

| 场景 | 行为 |
|---|---|
| 分镜 `date` 为空串 | 不进任何一天的链，`slot` 保持原值（新增走表单必有日期，历史脏数据不处理） |
| 分镜 `duration` 缺失/0/NaN | `planDay` 取 10；`migrate` 对 `duration==null` 兜底 20（§7.1） |
| `duration` 极大导致 end>1440 | `overflow=true`；`rescheduleDay` 写 `fmtMin` 会 **clamp 到 23:59**（`fmtMin` 1749 行行为），由 `toastResched` 提示用户缩短或改期 |
| 集合被改晚（如 10:30） | `base=集合.end`，全链从 10:30 起（测试③） |
| 当天无分镜、无节点 | `base=600`，`wrap=600-615`；`ensureDayDefaults` 保证集合节点先落地，实际不会出现 |
| 两个节点重叠 | anchor 自身不挪动（`dayItems._conflict` 标红，沿用顺序判定）；anchor 之后的节点链式顺延；分镜在所有节点定位后避让（取较晚 end） |
| `pins` 中节点 `end<=start` | `pinOf` 兜底 `st+30`，避免死循环 |
| `ord` 并列 | 依赖 `Array.prototype.sort` 稳定性（ES2019 已保证），沿用数组顺序 → 与分镜列表显示顺序一致 |

### 3.4 渲染层新函数

```js
/* 进入某日期时自愈：无变化不写盘 */
function autoSyncDay(date){
  const p=cur(); if(!p||p.demo) return;                      // demo 只读：不补、不重排、不 toast
  const inited=Array.isArray(p.dayInit)&&p.dayInit.indexOf(date)>=0;
  const plan=planDay(p,date,null);
  const drift=p.shots.some(function(s){
    if(s.date!==date) return false;
    const r=plan.shots.filter(x=>x.id===s.id)[0];
    return !!r&&s.slot!==fmtMin(r.start);
  });
  if(inited&&!drift&&dayDefaults(p,date).length===0) return;
  updateCur(function(pp){ ensureDayDefaults(pp,date); rescheduleDay(pp,date,null); });
}

function toastResched(plan){
  if(!plan) return;
  const ids=(plan.nodeShifts||[]).map(function(x){return x.id;});
  view.lastShift=ids.length?{date:plan.date,ids:ids,ts:Date.now()}:null;   // 时间轴临时「已顺延」标记
  if(plan.overflow){ toast('排期超出当天 24:00，请缩短时长或改到另一天'); return; }
  const parts=['已重排当天分镜（'+plan.shiftedCount+' 条后移）'];
  if(ids.length) parts.push(ids.length+' 项日程已顺延');
  toast(parts.join('，'));
}

function saveShotEdit(id){
  const name=gv('esh_name').trim(); if(!name){toast('分镜内容不能为空');return;}
  const patch={name:name,
    duration:parseInt(gv('esh_dur'))||SHOT_DEFAULT_MIN,
    sceneId:gv('esh_scene'), position:gv('esh_pos')||'', light:gv('esh_light')||'',
    note:gv('esh_note').trim()};
  let plan=null;
  updateCur(function(p){
    const s=p.shots.filter(x=>x.id===id)[0]; if(!s) return;
    Object.assign(s,patch);
    plan=applyDay(p,s.date);
  });
  clearInlineEditState(view); renderProject(); toastResched(plan);
}
function cancelShotEdit(){
  if(!view.editingShotEditId) return false;
  clearInlineEditState(view); renderProject(); return true;
}
```

---

## 4. 程序调用流程

### 4.1 新增分镜（`addShot` 1644）

```
用户点「添加分镜」→ addShot()
 ├ 读 s_name/s_date/s_dur/s_scene/s_pos/s_light/s_note（gv）
 ├ updateCur(p => {                     ← demo 只读守卫在此生效
 │   sameDay = p.shots.filter(date===d)
 │   ord = max(...sameDay.ord)+1（当天无则 0）
 │   p.shots.push({slot:'', duration, position, light, ...})
 │   plan = applyDay(p,d)               ← ①ensureDayDefaults ②planDay ③写回 slot/wrap
 │ })
 ├ selRefs=[]; view.shotDraft={}
 ├ renderProject()                      ← renderShots 读回已物化的 slot
 └ toastResched(plan)
```
重排时机：**push 之后、渲染之前，同一 `updateCur` 内**（单次落盘）。

### 4.2 编辑分镜（行内，新增）

```
editBtn('Shot',id) → beginInlineEdit('Shot',id)
 ├ clearInlineEditState(view)           ← 同刻只开一行
 └ view.editingShotEditId=id; renderProject()
        ↓ renderShots 命中 editingShotEditId → 渲染 esh_* 行内表单
用户点「保存」→ saveShotEdit(id)
 ├ 校验 name 非空
 ├ updateCur(p => { Object.assign(shot,patch); plan=applyDay(p,shot.date) })
 ├ clearInlineEditState(view)           ← 清 5 指针 + editingShotEditId（不清 editingShotId）
 ├ renderProject()
 └ toastResched(plan)                   ← 「已重排当天分镜（N 条后移）」，有节点顺延再追加「M 项日程已顺延」
```
Esc 链（2560-2567）：`refViewer → confirmModal → cancelInlineEdit() → cancelShotEdit() → closeDoc/closeShootDay`。

### 4.3 拖拽改序 / 改期（`persistOrder` 1693）

```
Pointer up → persistOrder(list, draggedId)
 ├ ids = 新 DOM 顺序
 ├ updateCur(p => {
 │   before = byId[draggedId].date          ← ★ 改期前，必须先取
 │   adopt  = 相邻项 date（末项取前一项）
 │   byId[draggedId].date = adopt
 │   逐条重排当天 ord（counters 按日期）
 │   applyDay(p, before); applyDay(p, adopt)   ← 两个日期都要重排；before===adopt 时幂等
 │ })
 └ renderProject()
```

### 4.4 插入日程节点（`addNode` 1836）

```
addNode()
 ├ 校验 title 非空
 ├ updateCur(p => {
 │   p.schedule.push({type,title,start,end,note,date:schedDate,done:false,fav:false})
 │   plan = applyDay(p,schedDate)      ← 分镜重新避让 → 后续整体后移
 │ })
 ├ renderProject()
 └ toastResched(plan)
```
冲突表现：若新节点与已有节点区间相交，`dayItems._conflict` 标红「时间重叠」，**新节点（anchor）自身时间不被改写**；anchor 之后的节点链式顺延（`nodeShifts`），分镜再整体避让 = 需求 4 的「顺延其后续日程」。

### 4.5 编辑节点（`saveNodeEdit` 1828）

```
saveNodeEdit(id)
 ├ 读 en_type/en_title/en_start/en_end/en_note
 ├ 校验 title 非空、end>start
 ├ updateCur(p => {
 │   n = p.schedule.find(id)
 │   if(n.auto) 忽略 type/start/end 提交，只取 title/note   ← 收工/集合时间由 planDay 接管
 │   Object.assign(n, patch); plan = applyDay(p,schedDate)
 │ })
 ├ clearInlineEditState(view); renderProject(); toastResched(plan)
```
集合改时间 → `base` 变化 → 全链重算（测试③）；收工时间为只读展示（`disabled`），写回永远来自 `planDay.wrap`。

### 4.6 删除节点（`delNode` 1842）

```
delNode(id) → updateCur(p => { date=n.date; p.schedule=filter(id!==); plan=applyDay(p,date) })
            → renderProject()
```
删掉集合节点：`base` 回落到 10:00；删掉收工节点：`dayInit` 已记录 → **不会自动复活**（避免删了又出现）。

### 4.7 切换日期（`renderSchedule` 1715 / `openShootDay` 2008）

```
用户改 #sc_date → schedDate=this.value; renderSchedule(cur())
renderSchedule(p)
 ├ autoSyncDay(schedDate)               ← ★ 首次进入某日期：补集合/收工 + 重排（有 drift 才写盘）
 ├ sunTimes / timelineHtml(p,schedDate) ← 读 dayItems（已物化 slot，零改动）
 └ 渲染

openShootDay() → sdDate=p.shootDate → autoSyncDay(sdDate) → renderShootDay()
```

### 4.8 拍摄日整日顺延（`sdPostpone` 2062，重写）

```
点「整日顺延 1 小时」→ sdPostpone()
 ├ nodes = schedule.filter(date===sdDate && start)
 ├ nodes.length===0 → toast('当天只有分镜，请先在日程里插入环节再整体顺延'); return
 ├ 溢出预检：任一 (end||start+30)+60 > 1440 → toast('顺延后超出当天 24:00，请先改到次日'); return
 ├ updateCur(p => {
 │   当天所有节点 start/end 各 +60（含集合；收工随后被重排覆盖）
 │   plan = applyDay(p,sdDate)          ← 分镜跟随新的 base 链
 │ })
 └ renderShootDay()
```

### 4.9 新建场景（分镜页入口，新增）

```
#s_scene 选「＋ 新建场景…」→ pickShotScene('__new')
 ├ saveShotDraft('scene','__new'); renderShots()      ← 展开行内条
 ├ 输入 #new_scene_name → addSceneInline()
 │   ├ p.scenes.push({id:uid(),name,note:'',done:false,fav:false})
 │   ├ view.shotDraft.scene=新 id                       ← 自动选中
 │   └ renderShots()
 └ 「取消」→ cancelSceneInline() → draft.scene=''
下拉旁「管理」→ view.tab='stuff'; renderProject()       ← 复用清单页场景分组的增删改
```

---

## 5. 任务列表（≤5 个，按依赖排序）

> 单文件项目无法满足「每任务 ≥3 文件」，改为「每任务 ≥3 个改动单元（函数区间 + DOM + 样式/测试）」，文件维度只有 `shotflow.html` 一列，按模块切区间，避免多人同区冲突。

### T01 排程引擎纯函数 + 常量 + 迁移/示例数据（P0）
- **改动单元**：`shotflow.html` ①411 后常量 ②1749 后「v10 排程引擎」整块 ③`migrate` 880-895 ④`buildDemoProject` 849-873 ⑤`seed` 962-973 ⑥`freshView` 546-552 / `clearInlineEditState` 685-690；`tests/logic.test.mjs` 追加 12 项
- **依赖**：无
- **验收**：`node tests/logic.test.mjs` → `pass=71 fail=0`（59+12）；`planDay` 连跑两次结果全等；`migrate` 对 `{shots:[{id:'s',refId:'img1'}]}` 仍返回 `duration===20` 且新增 `position===''`；老项目 `slot` 经 `rescheduleDay` 被覆盖为 `10:00`

### T02 分镜模块：可编辑 + 机位光线 + 场景入口（P0）
- **改动单元**：`renderShots` 表单 1515-1522 / 新建场景条 / 列表行 1538-1545；`pickShotScene`+`addSceneInline`+`cancelSceneInline`；`addShot` 1644；`saveShotEdit`+`cancelShotEdit`；`delShot` 1708；`persistOrder` 1693；`beginInlineEdit` 1244；Esc 2560；CSS `.new-scene`/`.shot .inline-edit`
- **依赖**：T01
- **验收**：表单无「时间」字段；时长默认 10；机位/光线下拉首项为 `— 机位 —`/`— 光线 —`（value 空）；列表行有「✎编辑」，行内可改 6 项且保存后 `slot` 由重排决定；选「＋ 新建场景…」可在行内建场景并自动选中；拖拽换天后两天 `slot` 都正确；新增/编辑/删除后时间轴立即变化

### T03 日程模块：集合/收工自动补 + 重排 + 冲突（P0）
- **改动单元**：`renderSchedule` 1715-1745（`autoSyncDay`、死变量清理、表单默认值）；`timelineHtml` 1792-1827（分镜标签、自动徽标、收工只读）；`addNode`/`saveNodeEdit`/`delNode`；CSS `.auto-pill`
- **依赖**：T01
- **验收**：首次进某日期自动出现「集合 09:30-10:00」「收工」两项，收工时间 = 当天最晚结束 +15；收工行有「自动」徽标且时间输入 `disabled`；插入 10:15-10:25 节点后，原本 10:10 的分镜变为 10:25 且 toast 提示 N 条后移；把集合改到 10:30 后分镜从 10:30 起；两节点重叠时该行标红「时间重叠」且节点时间不被自动改写；删掉收工后不再自动出现

### T04 拍摄日模式 + 文档输出（P1）
- **改动单元**：`renderShootDay` 2042-2048；`sdPostpone` 2062-2067 重写；`callSheetHtml` 2075-2087；`openDoc` 2130-2132；CSS `.sd-tag`
- **依赖**：T01、T03
- **验收**：拍摄日分镜行显示「分镜」小标签；「整日顺延 1 小时」把当天全部节点 +60 且分镜重排，无节点时给提示不报错；Call Sheet 与执行手册分镜表出现机位/光线列（仅当有值时）

### T05 集成验证 + 文档与缓存版本（P1）
- **改动单元**：`shotflow-sw.js` `CACHE` 版本；`README.md` §六/§七；`docs/system_design.md` + 两张 mermaid；全量人工回归清单
- **依赖**：T02、T03、T04
- **验收**：`pass=71 fail=0`；`grep -n "s_slot" shotflow.html` 无残留（输入框已删）；旧备份导入后不乱序、无重复集合/收工；示例项目只读打开日程不弹 toast、不改时间；SW 缓存版本为 v10；README 记录「旧项目首开时间整体重排」的行为变化

### 依赖图

```
T01 ──► T02 ──┐
  └───► T03 ──┴──► T04 ──► T05
```

---

## 6. 回归风险清单（所有读 `slot` / `duration` / `schedule` 的消费点）

| # | 位置（行号） | 读取内容 | v10 影响 | 需改动？ |
|---|---|---|---|---|
| 1 | `shotSortKey` 1468 | `ord`，缺 `ord` 时退 `slot` | `ord` 始终存在 → 退路基本不走 | 否 |
| 2 | 分镜列表元信息 1543 | `s.date` / `s.slot` / `s.duration` | `slot` 已物化，恒有值 → 显示更可靠 | 是（追加机位/光线） |
| 3 | 分镜行冲突标红 1529 | `dayItems(...)._conflict` | 分镜自动避让后几乎永不冲突 | 否（保留，无害） |
| 4 | `renderSchedule` 1718-1719 | `n.start`、`s.slot` | **死变量**（结果未被使用） | 建议删（可选） |
| 5 | `dayItems` 1750-1764 | `s.slot` / `s.duration` / `n.start,end` | 语义不变 | **否（严禁改）** |
| 6 | `cascadeShift` 1766-1791 | 同上 + 写 `slot/start/end` | UI 不再调用 | **否（保留给测试）** |
| 7 | `timelineHtml` 1792-1827 | `_time` / `duration` / `start,end` | 一致 | 是（分镜标签、收工只读） |
| 8 | `renderShootDay` 2015-2055 | `_time`（分镜取 `slot`）/ `duration` / `end` | 一致；`currentId`/`overdue` 判定不变 | 是（分镜标签、按钮文案） |
| 9 | `sdPostpone` 2062 | 经 `cascadeShift` 改 `slot` | 语义反转（单条 → 整日） | 是（重写） |
| 10 | `callSheetHtml` 2075-2087 | `_time` / `duration` | 一致 | 是（机位/光线列） |
| 11 | `openDoc` 2130-2132 | `s.date+' '+s.slot` / `s.duration` | 一致（`slot` 恒有值，不再出现空时间） | 是（两列 + `li` colspan） |
| 12 | `exportJSON` 2212 / `exportProject` 2216 | 整包 `projects`/`project` | 备份含 `dayInit`/`position`/`light`/物化 `slot`；旧版本客户端无感 | 否 |
| 13 | `applyImport` 2241 / `initData` 906 / `newProject` 1180 | 经 `migrate` 补默认 | 旧备份无 `dayInit` → `[]`，首开自动补 | 否（`migrate` 已覆盖） |
| 14 | `collectFavorites` 721 / `favSummary` 706 | 仅 `name` | 无影响 | 否 |
| 15 | `backupItemCount` 736 | 数组长度 | 无影响 | 否 |
| 16 | `searchHit` 1039 | `name` / `note` | 机位/光线不进搜索 | 可选（建议加入，1 行） |
| 17 | 示例数据 `buildDemoProject` / `seed` | 硬编码 `slot`、`type` | 需显式构造自动节点 + `dayInit` | 是（T01） |
| 18 | `cloneDemo` 764 | 深拷贝整包 | 副本继承 `dayInit` → 复制后不会再补默认项 | 否 |

---

## 7. 待明确事项（**我发现的真实冲突 / 需主理人确认**）

### 7.1 【硬冲突·已给解法】`migrate` 的 `duration` 兜底只能是 20，不能是 10
`tests/logic.test.mjs:65-67`：
```js
const migrated = vm.runInContext(`migrate({name:'x',shots:[{id:'s',refId:'img1'}],budget:[]})`, ctx);
check('迁移补 duration', migrated.shots[0].duration === 20);
```
这里的 shot **完全没有 `duration` 字段**（不是「已有 20 的老数据」），所以「缺省改 10」必然让第 67 项红掉。测试一行不能改 → 无解冲突。
**解法（按此实现）**：`migrate` 保持 `if(s.duration==null) s.duration=20;`。需求 2 的「默认 10 分钟」由三处保证：① 表单 `s_dur` 默认 10（1519）；② `addShot` 落库默认 10（1650）；③ `planDay` 内部兜底 `SHOT_DEFAULT_MIN=10`。行为差异仅存在于「老项目里从未填过时长的分镜」，且 v10 起这类分镜可被行内编辑改掉——对用户可解释。README §七 需写明。

### 7.2 【硬冲突·已给解法】`view.editingShotId` 已被「参考图编辑器」占用
`editingShotId` 不是空闲指针：`openShotRefEditor` 1575-1577、`toggleRef` 1556-1568、`addShotImg` 1617-1635、`renderShots` 1481-1486 都用它表达「正在给这条分镜选参考图」——命中时会渲染 `.edit-bar` 并**隐藏 `selRefsBar`**。若用它表达「正在行内编辑文字」，点「✎编辑」会顺带进入选参考图模式。
同时 `clearInlineEditState` **不能清** `editingShotId`（`tests:160-164` 要求它保留 `'keep'`）。
**解法**：新增独立指针 `view.editingShotEditId`。
- `freshView` 加 `editingShotEditId:null`；
- `clearInlineEditState` 追加 `v.editingShotEditId=null`（该测试只检查 5 指针 + `editingShotId`，追加清理不影响，✅ 通过）；
- `beginInlineEdit('Shot',id)` 设 `editingShotEditId`；
- `cancelInlineEdit` 的 `has` 判断**不**包含它（保持返回 false），Esc 链另插 `cancelShotEdit()`。

### 7.3 【命名冲突·已给解法】`es_name` / `es_note` 已被清单页行内编辑占用
`renderStuff` 1852-1853 与 `saveStuffEdit` 1870-1872 用的是 `gv('es_name')` / `gv('es_note')`。分镜行内编辑若沿用 `es_*`，同一时刻虽只有一个页签在 DOM，但函数语义会串（未来重构极易出错）。
**解法**：分镜统一 `esh_*`（`esh_name/esh_dur/esh_scene/esh_pos/esh_light/esh_note`）。

### 7.4 【模型细节·已给解法】`dayDefaults` 仅按 `auto` 判断会与老项目的 `type==='集合'/'收工'` 节点重复
模型原文是「无 `auto==='call'` 则给集合」。但 `seed`（969/972 行）和所有 v9 及更早用户的日程里，`type==='集合'` / `type==='收工'` 的节点**没有 `auto` 字段**。按原文判断 → 首开每天多出「集合」「收工」两条重复项，用户一天有两个收工。
**解法**（已写进 §3.3 代码）：
- 判定条件改为 `auto===X || type===X`（任一命中即视为已有）；
- 对「有 `type==='收工'` 但无 `auto`」的老节点，`dayDefaults` 返回 `{kind:'adopt',id}`，由 `ensureDayDefaults` 补 `auto='wrap'` —— 即把老收工"升级"为自动节点，其时间此后由 `planDay` 接管。这正好落在需求 3「收工时间自动计算」的语义上。
- 若主理人坚持不接管老收工节点的时间（尊重历史手填 19:00），替代方案：`adopt` 后不写回时间（`rescheduleDay` 跳过无 `auto` 的节点），代价是需求 3 对该项目失效。

### 7.5 【已裁决·已落地】需求 4「顺延其后续日程」：以 anchor 链式顺延落地（覆盖本节原建议）
需求 4 原文：「新增或插入日程后，**自动重算并顺延其后续日程**」。模型 C 原文是「不做节点之间的自动挪动」，与需求字面冲突。
**主理人裁决（实现以此为准，本节原「只标红不顺延」的建议作废）**：
1. 本轮刚插入 / 刚编辑的节点是 **anchor**：位置永不自动改变（尊重用户显式输入）；若与前一项重叠，仅由 `dayItems._conflict` 标红「时间重叠」。
2. anchor 之后的节点按 `start` 升序**链式顺延**：`start < 前一项 end` 时顺延到 `前一项 end`，`end` 同步后移（保持原时长），并记入 `planDay(...).nodeShifts`。
3. 分镜在所有节点位置**确定之后**才排，因此分镜之间永不重叠。
4. 实现方式：`planDay(p,date,anchorId)` 接收 anchorId（可为 null），`rescheduleDay` / `applyDay` 透传；被顺延节点在**同一个 `updateCur` 回调**内物化写回，`view.lastShift` 让时间轴临时显示「已顺延」（30 秒或下次重排清除）。
5. toast：`已重排当天分镜（N 条后移）`，若发生节点顺延再追加 `，M 项日程已顺延`。

### 7.6 【语义澄清】`shiftedCount` 的定义（建议按此，与你原文略有不同）
你写「N 取 `planDay(...).shiftedCount`」，用于 toast「已重排当天分镜（N 条后移）」。若定义为「相对编辑前」，则 `planDay` 必须接收旧状态 → **破坏「`planDay` 幂等」（测试⑥）**。
**定义**：`shiftedCount` = 「因锚点避让而晚于**无锚点顺序链**的分镜条数」（纯由输入决定，跑两次相等）。toast 文案按主理人裁决为「已重排当天分镜（N 条后移）」，语义仍然准确。

### 7.7 【细节】`ord` 并列的 tie-break：用数组顺序而非 `id`
模型写「`ord` 相同按 `id` 稳定排序」。但分镜列表显示用的是 `shotSortKey`（`ord` 主键 + `Array.sort` 稳定性 → 并列时沿用**数组顺序**）。若 `planDay` 用 `id` 排序，时间轴顺序会与列表顺序不一致（用户看到的第 1 条在时间轴上排第 3）。
**解法**：`planDay` 只按 `ord` 排序，并列时依赖稳定排序沿用数组顺序（`migrate` 后所有历史分镜 `ord=0`，全部走这条路）。已在 §3.3 代码中体现。

### 7.8 【细节】`fmtMin` 会把 >1440 的分钟数 clamp 成 `23:59`
`fmtMin`（1749）`Math.max(0,Math.min(1439,...))`。溢出的分镜写回后会变成 23:59，且相邻两条溢出分镜会重叠。不新增格式化函数（避免动到被测函数），改为：`planDay.overflow=true` → `toastResched` 明确提示；README 记录该限制。
附带一处**已知不一致**（不修，因为修 `dayItems` 会破测试）：`dayItems` 1753 行对缺失 `duration` 仍兜底 20，而 `planDay` 兜底 10。实践中所有项目都会经过 `migrate`（`initData` 913/916、`newProject` 1183、`applyImport` 2246/2249、`buildDemoProject` 873），`duration` 恒有值，该分歧不可达；但若人工构造脏数据，会出现「时间轴显示 20 分钟、排期按 10 分钟算」的偏差。

### 7.9 【健壮性】`renderSchedule` 进入即写盘需要 drift 判断，且 demo 必须跳过
若 `renderSchedule` 无条件 `updateCur(ensureDayDefaults+reschedule)`：① 每次切页签都落盘；② demo 项目会每进一次日程弹一次「示例项目只读」toast。已按 §3.4 `autoSyncDay` 处理（`p.demo` 直接 return + `inited && !drift` 提前 return）。
副作用：旧项目**首次**进入某日期会发生一次「时间整体跳到 10:00 起」的可见变化——这是需求要求的行为变化，需在 README §七 明确写出，避免用户误判为数据损坏。

---

## 附：新增测试清单（追加到 `tests/logic.test.mjs` 第 245/246 行之间）

```js
/* ================= v10 排程引擎 ================= */
for (const n of ['pinOf','planDay','dayDefaults','ensureDayDefaults','rescheduleDay','applyDay'])
  vm.runInContext(fn(n), ctx);
vm.runInContext('const DAY_BASE="10:00",COLLECT_START="09:30",COLLECT_MIN=30,WRAP_MIN=15,SHOT_DEFAULT_MIN=10;', ctx);
```

| # | 断言 | 期望 |
|---|---|---|
| ① | 3 条 10 分钟分镜连排 | `10:00 / 10:10 / 10:20` |
| ② | 插入 10:15-10:25 节点后第 2 条 | `10:25`，`shiftedCount===1` |
| ③ | 集合改到 10:30 | 首条 `10:30` |
| ④ | 收工 | `= 最后 end`、`+15` |
| ⑤ | 两节点重叠 | `dayItems._conflict` 为 true |
| ⑥ | `planDay` 幂等 | 连跑两次 `JSON.stringify` 全等 |
| ⑦ | `ord` 互换后 | 时间跟随新 `ord` |
| ⑧ | `duration` 改大 | 后续全部后移 |
| ⑨ | `dayDefaults` 幂等 | `dayInit` 已含 → 返回 `[]` |
| ⑩ | 老数据迁移 | `position===''`、`light===''`、`duration===20`；`rescheduleDay` 后 `slot==='10:00'` |
| ⑪ | 老项目已有 `type='收工'` 无 `auto` | `dayDefaults` 返回 `[{kind:'adopt'}]`，不新增收工 |
| ⑫ | `ensureDayDefaults` 幂等 | 连续两次调用后当天「集合」「收工」各恰好 1 条 |

预计总数 **59 + 12 = 71**（若 ①-④ 合并计数则按实际条数为准，不得少于 10 项）。

---

## 8. 追加需求：多日拍摄与自动跨日（并入 v10，不另开版本）

> 主理人在实现途中追加，规则以本节为准；上文（尤其 §3 的 `planDay` 契约）已同步更新。

### 8.1 数据与真源

| 字段 | 说明 |
|---|---|
| `p.shootDates: ISODate[]` | 拍摄日清单，**升序去重**；新增/删除只能经 `addShootDate` / `removeShootDay`（后者走 `updateCur`） |
| `p.shootDate` | **恒等于 `shootDates[0] || ''`**。看板倒计时、Call Sheet、提案、拍摄日模式等既有消费方一律不改 |
| `migrate` | `shootDates = 合法值去重升序`；为空且 `shootDate` 有值 → `[shootDate]`；再回写 `shootDate = shootDates[0] || ''` |

**清单只在「该日首次有内容」时增长**：`ensureShootDate(date)` 的三个调用点是 `addShot` / `addNode` / `persistOrder`（跨日拖拽）；`chooseSchedDate`（Day tab 与顶部日期框）只切 `schedDate`，**不写 `shootDates`**；`autoSyncDay` 对未登记日期直接返回（不补集合/收工、不写盘），否则会变成「看一眼就登记 / 生成垃圾日程」。

信息卡的「Day 1 · 首个拍摄日」由纯函数 `resolveShootDate(p,D)` 判定：
| 条件 | action | 结果 |
|---|---|---|
| D 非法 / 已在清单 | `noop` | 仅重绘（输入框回显真实首日，不再静默跳回） |
| 原 Day 1 无分镜且无手填环节（只有自动集合/收工或完全空） | `replace` | 用 D 顶掉首日，并清掉原首日的 `dayInit`（避免孤儿自动节点） |
| 原 Day 1 有内容 | `append` | D 追加为新的一天，toast「已添加为 Day N（MM-DD）；Day 1 仍有 N 条安排，未改动」 |

`normalizeShootDates(p)` 是清单规范化的唯一实现（渲染层使用）；`migrate` / `rescheduleDay`（跨日分支里那 6 行）因会被 `tests/logic.test.mjs` 用 `fn()` 单独抽取进 vm（旧块里没有该函数名），各自内联同源 4 行并注释说明——**这是 vm 抽取边界造成的有意重复，不要合并**。

### 8.2 `planDay` 增补：`overflowShots`

- 逐条按 `ord` 排片；当 `cursor + duration > 1440` 时：
  - 若 `duration > 1440 - toMin(DAY_BASE)`（单条超过一整天）或调用方传 `noRoll` → `overflowHard = true`，该条原位保留（`fmtMin` 会 clamp 到 23:59），`overflow = true`；
  - 否则**该条及其后所有分镜**滚到次日，产出 `overflowShots: [{id, toDate: addDays(date,1)}]`，且不进入当天 `shots`。
- 收工仍按「当天剩余事项的最晚 end + 15」计算；当天分镜被全部移走时直接取集合结束（默认 10:00，不再被 10:00 地板顶起）。

### 8.3 `rescheduleDay`：跨日落地（**循环，不递归**）

```
rescheduleDay(p,date,anchorId)
 ├ root = planDay(p,date,anchorId)
 ├ cur=date, plan=root
 ├ for round in 0..6:                       ← 最多 7 轮，绝无递归爆栈风险
 │   ├ applyPlanWrite(p,cur,plan)           物化 slot / 收工 / 被顺延节点
 │   ├ plan.overflowShots 为空 → break
 │   ├ next = overflowShots[0].toDate
 │   ├ 移入分段镜：date = next；ord = maxOrd(次日原有) + 1 + i（保持原相对顺序，其它字段不动）
 │   ├ next 不在 shootDates → push + 去重排序（记 addedDates）→ 回写 shootDate
 │   └ cur = next；plan = planDay(p,next,null)
 └ 7 轮后仍 overflowShots → capHit=true；planDay(...,noRoll) 兜底 clamp 写回
   root 附 { addedDates, movedShots, capHit, rounds }
```

- toast（`toastResched`）：`capHit` → 「排期已跨越 7 天，请检查分镜时长」；`overflow`（hard）→ 「排期超出当天 24:00，请缩短时长或改到另一天」；否则「已重排当天分镜（N 条后移）」+「M 项日程已顺延」+「已自动跨日 K 条分镜」+「已自动增加拍摄日 MM-DD」。
- 收工：`wrapStart = max(剩余事项最晚 end, 集合 end)`；**当天已无分镜时直接取集合结束**，不再被 10:00 地板顶起。

### 8.4 渲染层新增

| 函数 | 作用 |
|---|---|
| `addDays(dateStr,n)` / `mmdd(d)` / `weekdayCN(d)` | 纯函数日期工具（`addDays` 可被 vm 抽取） |
| `shootDatesOf(p)` | 读取清单（不改数据），空时回退 `[shootDate]` |
| `dayTabsHtml(p)` | 日程页 Day tab（`Day N · MM-DD 周X（K 条）`）+「＋ 添加拍摄日」+「删除本日」+ 行内新增条 |
| `setSchedDate` / `chooseSchedDate` | 切换 tab / 任意日期查看（**只切 schedDate，不写清单**） |
| `ensureShootDate(date)` | 某日首次有内容时登记（调用点仅 `addShot` / `addNode` / `persistOrder`） |
| `toggleNewDay` / `confirmNewDay` / `removeShootDay` | 新增（默认最后一天 +1，确认后切过去）、删除（无分镜且无手填环节才允许） |
| `pickShotDate` / `confirmNewShotDate` / `cancelNewShotDate` | 分镜表单的拍摄日下拉与「＋ 新日期…」行内输入 |
| `resolveShootDate(p,D)` | 纯函数：信息卡改「Day 1 · 首个拍摄日」的判定（`noop` / `replace` / `append`，vm 可抽取） |
| `setShootDate(v)` | 走 `resolveShootDate`：无内容替换首日（清其 `dayInit`）、有内容追加为 Day N 并 toast |
| `openProject` | 进入项目时 `schedDate=null`，避免沿用上一个项目的日期 |

- 分镜列表按日期分组：`day-head` 显示 `Day N · MM-DD（K 条 · 合计 X 分钟）`，组内按 `ord`；`attachDrag` / `persistOrder` 不变（仍在 `#shotList` 内按 DOM 顺序取 id），跨日拖拽时 `persistOrder` 追加 `addShootDate(p,adopt)`。
- 删除拍摄日：`分镜数 + 非 auto 节点数 > 0` → 拒绝并提示「该天还有 N 条安排，请先清空」；否则连带清掉该日引擎生成的集合/收工并移除 `dayInit` 记录（重新加入时会再生成）。**用户数据永不连带删除。**

### 8.5 示例数据

`demoSpecs()` 的「海边日落 · 情侣写真」增加 `days:2`：`buildDemoProject` 用 `new Date(stamp + i*864e5)` 推连续日（不依赖 `addDays`，因本函数会被 vm 单独抽取），分镜按 `ceil(总数/天数)` 均分到各天，**每天各有集合（auto:'call'）与收工（auto:'wrap'）并写入 `dayInit`**，业务环节只放首日；构建末尾对每一天调 `rescheduleDay`（`typeof` 守卫）。

### 8.6 测试（71 → 82）

追加在既有 v10 测试块之后：addDays 跨月跨年 / `planDay` 溢出 `toDate` / 移走后收工重算 / `migrate` 补 `shootDates` / 升序去重且 `shootDate` 为首日 / `rescheduleDay` 跨日落地（改日期 + 次日 10:00 + 自动补拍摄日）/ 跨日 7 轮上限 `capHit` / 超长分镜不跨日而标溢出 / `resolveShootDate` 的「替换」与「追加」两条分支（含 `noop`）。
