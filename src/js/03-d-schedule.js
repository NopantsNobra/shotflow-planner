/* ---- 日程（时间与流程安排） ---- */
const NODE_TYPES=['集合','化妆造型','拍摄','转场','休息','收工','其他'];
const NODE_COLORS=['gray','purple','accent','blue','green','ink','gray'];
let schedDate=null;
function nodeTag(t){ const i=NODE_TYPES.indexOf(t); return '<span class="tag '+(NODE_COLORS[i]||'gray')+'">'+esc(t)+'</span>'; }

/* 进入某日期时自愈：补集合/收工 + 重排。demo 只读直接跳过；dayInit 已含且无 drift 时提前返回，
   避免「渲染 → 写盘 → 重绘」的循环（设计 §7.9）。 */
function autoSyncDay(date){
  const p=cur(); if(!p||!date||p.demo) return;
  if(shootDatesOf(p).indexOf(date)<0) return;   // 未登记的日期（只是查看）不补默认项、不写盘
  const inited=Array.isArray(p.dayInit)&&p.dayInit.indexOf(date)>=0;
  // 已初始化日期的查看操作不得覆盖用户的计划或刚撤销的排程。
  if(inited) return;
  updateCur(function(pp){ applyDay(pp,date,null); });
}

/* 重排结果统一提示；被顺延的节点记进 view.lastShift，时间轴上临时显示「已顺延」（30 秒或下次重排清除） */
function toastResched(plan,allDays){
  if(!plan) return;
  const ids=(plan.nodeShifts||[]).map(function(x){return x.id;});
  view.lastShift=ids.length?{date:plan.date,ids:ids,ts:Date.now()}:null;
  if(plan.capHit){ toast('排期已跨越 7 天，请检查分镜时长'); return; }
  if(plan.overflow){ toast('当天排期超时，未能安排的分镜保留原日期；请调整或确认整体重排',6000); return; }
  const parts=[];
  parts.push((allDays?'已整体重排 '+allDays+' 个拍摄日':'已重排当天分镜')+'（'+plan.shiftedCount+' 条后移）');
  if(ids.length) parts.push(ids.length+' 项日程已顺延');
  if(plan.movedShots) parts.push('已自动跨日 '+plan.movedShots+' 条分镜');
  if(plan.addedDates&&plan.addedDates.length) parts.push('已自动增加拍摄日 '+plan.addedDates.map(mmdd).join('、'));
  toast(parts.join('，'));
}
function shiftedFlag(id){
  const s=view.lastShift;
  if(!s||!s.ids||s.ids.indexOf(id)<0) return '';
  if(Date.now()-(s.ts||0)>30000) return '';
  return ' <span class="tag blue">已顺延</span>';
}

/* ---- v10 多日拍摄：拍摄日清单的切换 / 新增 / 删除（全部经 updateCur，受 demo 只读守卫） ---- */
function setSchedDate(d){ if(!d) return; schedDate=d; renderSchedule(cur()); }
function toggleNewDay(){ view.newDay=!view.newDay; renderSchedule(cur()); }
function confirmNewDay(){
  const el=document.getElementById('new_day_date');
  const d=(el?el.value:'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){ toast('请选择有效日期'); return; }
  let ok=false;
  updateCur(p=>{ addShootDate(p,d); ok=true; });
  if(!ok) return;                    // demo 只读：updateCur 已提示
  view.newDay=false; schedDate=d;
  toast('已添加拍摄日 '+mmdd(d));
  renderProject();
}
/* 删除拍摄日：仅当该天无分镜、且没有用户手填的环节时允许。
   引擎自动生成的「集合 / 收工」不算用户内容，会随该日一并清掉（dayInit 同步清除，重新加入时会再生成）；用户数据一律不连带删除。 */
function removeShootDay(d){
  const p=cur(); if(!p||!d) return;
  const shotsN=(p.shots||[]).filter(s=>s.date===d).length;
  const userN=(p.schedule||[]).filter(x=>(x.date||d)===d&&!x.auto).length;
  if(shotsN+userN){ toast('该天还有 '+(shotsN+userN)+' 条安排，请先清空'); return; }
  let ok=false;
  updateCur(pp=>{
    pp.schedule=(pp.schedule||[]).filter(x=>!((x.date||d)===d&&x.auto));
    pp.shootDates=(pp.shootDates||[]).filter(x=>x!==d);
    pp.dayInit=(pp.dayInit||[]).filter(x=>x!==d);      // 同刻清掉初始化记录，重新加回来时还能补默认项
    normalizeShootDates(pp);
    ok=true;
  });
  if(!ok) return;
  const left=shootDatesOf(cur());
  schedDate=left[0]||todayStr();
  toast('已删除拍摄日 '+mmdd(d));
  renderProject();
}
/** 在日程页切换查看日期：只改 schedDate，不写 shootDates（避免「看一眼就登记」；
    某日首次产生内容时由 ensureShootDate 登记） */
function chooseSchedDate(d){ if(!d) return; schedDate=d; renderSchedule(cur()); }
/** 某日首次产生内容（新增分镜 / 新增手填环节 / 跨日拖拽）时登记为拍摄日。
    ⚠ 不要放进 renderSchedule / autoSyncDay，否则又会变成「看一眼就登记」。 */
function ensureShootDate(date){
  const p=cur(); if(!p||!date) return false;
  if(shootDatesOf(p).indexOf(date)>=0) return false;
  let ok=false;
  updateCur(pp=>{ addShootDate(pp,date); ok=true; });   // addShootDate 内部 normalize：若早于原首日则同步 p.shootDate
  return ok;
}
/** 项目信息卡「Day 1 · 首个拍摄日」：判定见 resolveShootDate（无内容则替换首日，有内容则追加为新的一天） */
function setShootDate(v){
  const p=cur(); if(!p) return;
  const d=String(v==null?'':v).trim();
  const r=resolveShootDate(p,d);
  if(r.action==='noop'){ renderProject(); return; }
  let ok=false;
  updateCur(pp=>{
    pp.shootDates=r.dates.slice();
    /* 替换分支要清掉原首日的 dayInit，避免旧日期残留自动集合/收工成为孤儿数据 */
    if(r.action==='replace'&&r.from){
      pp.dayInit=(pp.dayInit||[]).filter(x=>x!==r.from);
      /* 原首日只可能残留自动集合/收工（有分镜或手填环节时走 append 分支），一并清掉避免孤儿节点 */
      pp.schedule=(pp.schedule||[]).filter(n=>!((n.date||r.from)===r.from&&n.auto));
    }
    normalizeShootDates(pp);
    ok=true;
  });
  if(!ok) return;                                       // demo 只读：updateCur 已提示
  if(r.action==='append'){
    toast('已添加为 Day '+r.dayN+'（'+mmdd(d)+'）；Day 1 仍有 '+r.kept+' 条安排，未改动');
  } else {
    toast('已把首个拍摄日改为 '+mmdd(shootDatesOf(cur())[0]||d));
  }
  const left=shootDatesOf(cur());
  if(left.indexOf(schedDate)<0) schedDate=left[0]||todayStr();   // 原首日已被替换/移除时，视图跟着回到首日
  renderProject();
}
function dayTabsHtml(p){
  const days=shootDatesOf(p);
  const cnt=d=>(p.shots||[]).filter(s=>s.date===d).length+(p.schedule||[]).filter(n=>(n.date||d)===d).length;
  let h='<div class="day-tabs">'+days.map(function(d,i){
    return '<button class="day-tab'+(d===schedDate?' on':'')+'" '+doAttrs('set-sched-date',[d])+'>Day '+(i+1)+' · '+mmdd(d)+' '+weekdayCN(d)+'（'+cnt(d)+' 条）</button>';
  }).join('')
    +'<button class="day-tab add" '+doAttrs('toggle-new-day')+'>＋ 添加拍摄日</button>'
    +(days.length?'<button class="day-tab del" '+doAttrs('remove-shoot-day',[schedDate])+'>删除本日</button>':'')
    +'</div>';
  if(view.newDay){
    const base=days.length?days[days.length-1]:(p.shootDate||todayStr());
    h+='<div class="new-scene"><span class="muted">新拍摄日</span>'
      +'<input type="date" id="new_day_date" value="'+esc(addDays(base,1))+'">'
      +'<button class="btn btn-primary btn-sm" '+doAttrs('confirm-new-day')+'>添加并切换</button>'
      +'<button class="btn btn-ghost btn-sm" '+doAttrs('toggle-new-day')+'>取消</button></div>';
  }
  return h;
}

function renderSchedule(p){
  if(!schedDate) schedDate=p.shootDate||shootDatesOf(p)[0]||todayStr();
  autoSyncDay(schedDate);          // 首次进入某日期：补集合/收工 + 重排（有 drift 才写盘）
  const sun=sunTimes(schedDate,p.lat,p.lng,projectTimeZone(p));
  let sunHtml='';
  if(sun){
    sunHtml='<div class="sun-bar">'
      +'<div class="sun-pill">日出<b>'+sun.sunrise+'</b></div>'
      +'<div class="sun-pill">正午<b>'+sun.noon+'</b></div>'
      +'<div class="sun-pill">黄金时刻起<b>'+sun.goldenStart+'</b></div>'
      +'<div class="sun-pill">日落<b>'+sun.sunset+'</b></div>'
      +'<div class="sun-pill" style="background:#fdf3f1;border-color:#ecc;color:#8a3a2e">民用暮光≈<b>'+addMin(sun.sunset,30)+'</b></div>'
      +'</div><p class="muted" style="margin-top:-8px;margin-bottom:12px">按 NOAA 近似算法估算 · 时区 '+esc(sun.timeZone)+'（未指定时按城市或设备时区）· 仅作排期参考。</p>';
  } else {
    sunHtml='<p class="muted" style="margin-bottom:12px">填写项目信息卡里的「纬度 / 经度」（或点城市快捷键），这里会显示当日日出、黄金时刻与日落时间。</p>';
  }
  document.getElementById('tabBody').innerHTML='<div class="card"><h2>拍摄日流程 · 时间轴</h2>'
    +sunHtml
    +dayTabsHtml(p)
    +'<div class="row" style="margin-bottom:14px"><input type="date" id="sc_date" style="max-width:170px" value="'+schedDate+'" data-change="choose-sched-date">'
    +'<span class="muted">点上方 Day 切换日期；选任意日期会并入拍摄日清单。集合、收工自动生成，新增环节会顺延其后环节并重排分镜</span></div>'
    +'<div class="row" style="margin-bottom:6px">'
    +'<select id="n_type" style="max-width:120px">'+NODE_TYPES.map(t=>'<option>'+t+'</option>').join('')+'</select>'
    +'<input id="n_title" class="grow" placeholder="环节内容，如：化妆师到场妆造" '+enterAttrs('add-node')+'>'
    +'<input type="time" id="n_start" style="max-width:105px" value="10:00">'
    +'<input type="time" id="n_end" style="max-width:105px" value="10:30">'
    +'<input id="n_note" class="grow" placeholder="备注…">'
    +favPickerBtn()
    +'<button class="btn btn-primary" '+doAttrs('add-node')+'>添加环节</button></div>'
    +timelineHtml(p,schedDate)
    +'</div>';
}
function addMin(hhmm,m){ const [h,mi]=hhmm.split(':').map(Number); const t=(h*60+mi+m+1440)%1440; return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'); }
/* 时间统一模型：分镜与流程节点都派生出 start/end，冲突即前一事项未结束下一事项已开始 */
function toMin(t){ const m=/^(\d{1,2}):(\d{2})$/.exec(t||''); return m?(+m[1])*60+(+m[2]):1440; }
function fmtMin(m){ m=Math.max(0,Math.min(1439,Math.round(m))); return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }

/* ===== v10 多日拍摄：日期工具（纯函数，可被 vm 抽取；只用 Date / String / Math） ===== */
/** 日期字符串 ±n 天，正确处理月末 / 年末跨月跨年。非法输入返回空串。 */
function addDays(dateStr,n){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr==null?'':dateStr));
  if(!m) return '';
  const dt=new Date((+m[1]),((+m[2])-1),((+m[3])+(Math.round(+n||0))));
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}
/** 拍摄日清单：过滤非法 + 去重升序，并把 p.shootDate 同步为 shootDates[0]（既有消费方零改动）。 */
function normalizeShootDates(p){
  if(!p||typeof p!=='object') return [];
  const list=(Array.isArray(p.shootDates)?p.shootDates:[])
    .filter(function(d){ return /^\d{4}-\d{2}-\d{2}$/.test(String(d==null?'':d)); });
  p.shootDates=Array.from(new Set(list)).sort();
  p.shootDate=p.shootDates[0]||'';
  return p.shootDates;
}
/** 把某日加入拍摄日清单（幂等，自动排序并同步 shootDate）。 */
function addShootDate(p,d){
  if(!p||typeof p!=='object') return false;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d==null?'':d))) return false;
  p.shootDates=Array.isArray(p.shootDates)?p.shootDates.slice():[];
  if(p.shootDates.indexOf(d)<0) p.shootDates.push(d);
  normalizeShootDates(p);
  return true;
}
/** 读取拍摄日清单（渲染层用；不改数据）。 */
function shootDatesOf(p){
  const list=(Array.isArray(p&&p.shootDates)?p.shootDates:[])
    .filter(function(d){ return /^\d{4}-\d{2}-\d{2}$/.test(String(d==null?'':d)); });
  if(!list.length&&p&&p.shootDate) list.push(p.shootDate);
  return Array.from(new Set(list)).sort();
}
function mmdd(d){ const m=/^\d{4}-(\d{2})-(\d{2})$/.exec(String(d==null?'':d)); return m?(m[1]+'-'+m[2]):''; }
/** 信息卡改「首个拍摄日」的判定（纯函数，可被 vm 抽取）：
    - D 非法或已在清单 → noop
    - 原 Day 1 无内容（无分镜、无手填环节，只有自动集合/收工或完全空）→ replace（用 D 顶掉原首日）
    - 原 Day 1 有内容 → append（D 作为新的一天加入，Day 1 不动） */
function resolveShootDate(p,D){
  const dates=shootDatesOf(p), d=String(D==null?'':D).trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return {action:'noop',dates:dates,dayN:0,kept:0,from:''};
  if(dates.indexOf(d)>=0) return {action:'noop',dates:dates,dayN:dates.indexOf(d)+1,kept:0,from:''};
  const first=dates[0]||'';
  const shotsN=first?(p.shots||[]).filter(function(s){return s.date===first;}).length:0;
  const userN=first?(p.schedule||[]).filter(function(n){return (n.date||first)===first&&!n.auto;}).length:0;
  const free=(!first)||(shotsN+userN===0);
  const next=Array.from(new Set(free?[d].concat(dates.slice(1)):dates.concat([d]))).sort();
  return {action:free?'replace':'append',dates:next,dayN:next.indexOf(d)+1,kept:shotsN+userN,from:first};
}
function weekdayCN(d){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d==null?'':d)); if(!m) return '';
  const dt=new Date(+m[1],(+m[2])-1,+m[3]);
  return '周'+'日一二三四五六'.charAt(dt.getDay());
}

/* ===================== v10 排程引擎（纯函数层） =====================
   模型要点：
   1. 分镜时间不再由用户输入，而是由 planDay 顺序派生（起点 = max(10:00, 集合结束)），
      派生结果物化写回 shot.slot —— dayItems / 时间轴 / 通告单 / 拍摄日只读 slot，零改动。
   2. 集合（auto:'call'）与收工（auto:'wrap'）是自动节点：集合时间由用户改（影响链起点），
      收工时间永远由 planDay 计算 = 当天最晚结束 + 15 分钟。
   3. 其余节点是用户显式输入的位置，**不自动改写**；只有「本轮插入/编辑的节点」之后的节点，
      在传入 anchorId 时按 start 升序链式顺延（start 不早于前一项 end，时长不变）。
   4. 分镜在所有节点位置确定之后才排，因此分镜之间永不重叠。
   ⚠ 本区块会被 tests/logic.test.mjs 用 fn() 抽取进 vm 执行：
      只能依赖 toMin/addMin/fmtMin/Math/数组等 ctx 白名单内建，禁止 parseInt/isNaN/Boolean/document/view。 */
const DAY_BASE='10:00';        // 分镜链起点
const COLLECT_START='09:30';   // 默认集合开始
const COLLECT_MIN=30;          // 集合 / 缺省节点时长
const WRAP_MIN=15;             // 收工固定时长
const SHOT_DEFAULT_MIN=10;     // 分镜默认时长（表单与 addShot 落库同样默认 10）

/** 取节点的分钟区间；end 缺失或 <= start 时按 defMin（默认 30）兜底。 */
function pinOf(n,defMin){
  const st=toMin(n.start);
  let en=toMin(n.end||addMin(n.start,defMin||COLLECT_MIN));
  if(en<=st) en=st+(defMin||COLLECT_MIN);
  return {start:st,end:en};
}

/**
 * 计算某一天的排期。
 * @param {Object} p 项目
 * @param {string} date YYYY-MM-DD
 * @param {string|null} anchorId 本轮插入/编辑的节点 id；其后的节点会被链式顺延（null = 只读计算）
 * @param {boolean} [noRoll] 禁止自动跨日（递归到上限时的兜底，仅用于把放不下的分镜 clamp 显示）
 * @returns {{date,base,shots,nodes,wrap,overflow,overflowHard,overflowShots,shiftedCount,nodeShifts}}
 */
function planDay(p,date,anchorId,noRoll){
  // ① 当天分镜，按 ord 升序；ES2019 排序稳定 → ord 相同沿用数组顺序（与分镜列表显示一致）
  const shotsIn=(p.shots||[]).filter(s=>s.date===date).slice()
    .sort((a,b)=>((a.ord||0)-(b.ord||0)));
  // ② 当天节点（无 start 的历史脏数据跳过）；集合/收工双条件判定（老数据只有 type，没有 auto）
  const nodesIn=(p.schedule||[]).filter(n=>(n.date||date)===date&&n.start);
  const callN=nodesIn.filter(n=>n.auto==='call'||n.type==='集合')[0]||null;
  const wrapN=nodesIn.filter(n=>n.auto==='wrap'||n.type==='收工')[0]||null;
  const callR=callN?pinOf(callN):null;
  // ③ 位置节点（排除集合与收工）按 start 升序；anchor 之后的节点链式顺延，anchor 自身与前序节点不动
  const pos=nodesIn.filter(n=>n!==callN&&n!==wrapN)
    .map(n=>{const r=pinOf(n);return {id:n.id,start:r.start,end:r.end,dur:r.end-r.start,locked:n.timeLocked===true};})
    .sort((a,b)=>a.start-b.start||a.end-b.end);
  const nodeShifts=[];
  const aIdx=anchorId?pos.findIndex(x=>x.id===anchorId):-1;
  if(aIdx>=0){
    let prevEnd=-1;
    pos.forEach((it,i)=>{
      if(i>aIdx&&it.start<prevEnd&&!it.locked){
        nodeShifts.push({id:it.id,from:it.start,to:prevEnd});
        it.end=prevEnd+it.dur; it.start=prevEnd;
      }
      if(it.end>prevEnd) prevEnd=it.end;   // 前序节点与 anchor 自身只参与推进游标，位置不变
    });
  }
  const pins=pos.map(it=>({id:it.id,start:it.start,end:it.end}));
  // ④ 起点：10:00，但集合若被改晚则以集合结束为准
  const base=Math.max(toMin(DAY_BASE),callR?callR.end:0);
  let cursor=base, ideal=base, shiftedCount=0;
  const shots=[], overflowShots=[];
  let rolling=false, hardOverflow=false;
  const nextDate=addDays(date,1);
  shotsIn.forEach(s=>{
    const dur=Math.max(5,Math.round(+s.duration||0)||SHOT_DEFAULT_MIN);   // 禁止 parseInt（ctx 无此全局）
    if(rolling){ overflowShots.push({id:s.id,toDate:nextDate}); return; } // 已滚到次日：本条及其后一并滚走
    for(let guard=0;guard<50;guard++){                                    // ⑤ 遇节点区间跳到其结束，上限 50 次防死循环
      const hit=pins.filter(pn=>pn.start<cursor+dur&&pn.end>cursor)[0];
      if(!hit) break;
      cursor=hit.end;
    }
    if(cursor+dur>1440){                                                  // 排到 24:00 之后
      if(noRoll||dur>1440-toMin(DAY_BASE)){ hardOverflow=true; }          // 单条超过一整天 / 本轮禁止跨日 → 原位 clamp
      else { rolling=true; overflowShots.push({id:s.id,toDate:nextDate}); return; }  // 本条及其后全部跨到次日
    }
    if(cursor>ideal) shiftedCount++;    // 与「无节点顺序链」相比后移了，计一次
    shots.push({id:s.id,start:cursor,end:cursor+dur,duration:dur});
    cursor+=dur; ideal+=dur;
  });
  // ⑥ 收工 = max(所有位置节点 end, 所有分镜 end, 集合 end)；当天已无分镜时直接取集合结束（不被 10:00 地板顶起），再 +15
  let wrapStart=(!shots.length&&callR)?callR.end:base;
  pins.forEach(pn=>{if(pn.end>wrapStart)wrapStart=pn.end;});
  shots.forEach(r=>{if(r.end>wrapStart)wrapStart=r.end;});
  if(callR&&callR.end>wrapStart) wrapStart=callR.end;
  const wrap={start:wrapStart,end:wrapStart+WRAP_MIN};
  // ⑦ 溢出判定（fmtMin 会把 >1440 clamp 到 23:59，由调用方 toast 提示）
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
          overflow:overflow,overflowHard:hardOverflow,overflowShots:overflowShots,
          shiftedCount:shiftedCount,nodeShifts:nodeShifts};
}

/**
 * 某日期还给用户补哪些默认节点（纯描述对象，不含 id，便于幂等测试）。
 * 返回 [] 表示该日期已初始化过（p.dayInit 命中）。
 */
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

/** 落库默认节点：id 由 mkId 生成（默认 uid），并记入 dayInit。返回新增条数。 */
function ensureDayDefaults(p,date,mkId){
  mkId=mkId||uid;
  p.dayInit=Array.isArray(p.dayInit)?p.dayInit:[];
  p.schedule=Array.isArray(p.schedule)?p.schedule:[];
  if(!date) return 0;                    // 空日期（脏数据）不参与默认项初始化，避免把 '' 写进 dayInit
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

/** 物化单日计划：shot.slot、收工 start/end、被顺延节点 start/end。 */
function applyPlanWrite(p,date,plan){
  (p.shots||[]).forEach(function(s){
    if(s.date!==date) return;
    const r=plan.shots.filter(x=>x.id===s.id)[0];
    if(r) s.slot=fmtMin(r.start);          // 唯一真源仍是 shot.slot
  });
  (p.schedule||[]).forEach(function(n){
    if((n.date||date)!==date||!n.start) return;
    if(n.auto==='wrap'){ n.start=fmtMin(plan.wrap.start); n.end=fmtMin(plan.wrap.end); return; }
    const r=plan.nodes.filter(x=>x.id===n.id)[0];
    if(r&&n.auto!=='call'){                // 只写回位置节点（含被顺延的），集合时间永远是用户输入
      const rs=fmtMin(r.start), re=fmtMin(r.end);
      if(!n.timeLocked&&r.start<1440&&r.end<1440){
        if(rs!==n.start) n.start=rs;
        if(re!==n.end) n.end=re;
      }
    }
  });
}

/** 应用自动跨日：把放不下的分镜移到下一天再重排，最多 7 轮（循环实现，不递归）。
    - 移入次日的分镜 ord 追加到次日末尾（max(ord)+1 顺排），其余字段（refIds 等）不动
    - 次日不在 shootDates 则自动加入；仍排不下说明链太长 → capHit（兜底 clamp 写回，交给 toastResched 提示） */
function rescheduleDay(p,date,anchorId){
  const root=planDay(p,date,anchorId);
  if(!date) return root;                   // 空日期不写回（历史脏数据保持原样）
  const agg={addedDates:[],moved:0,capHit:false,rounds:0};
  let cur=date, plan=root, round=0;
  for(;round<7;round++){
    applyPlanWrite(p,cur,plan);
    if(!plan.overflowShots||!plan.overflowShots.length) break;
    const next=plan.overflowShots[0].toDate;
    const moving=plan.overflowShots.map(function(o){ return o.id; });
    let maxOrd=-1;
    (p.shots||[]).forEach(function(s){
      if(s.date===next&&moving.indexOf(s.id)<0) maxOrd=Math.max(maxOrd,(+s.ord||0));
    });
    plan.overflowShots.forEach(function(o,i){
      const s=(p.shots||[]).filter(x=>x.id===o.id)[0];
      if(!s) return;
      s.date=next;                          // 只改日期与 ord，refIds / duration / done 等一律不动
      s.ord=maxOrd+1+i;
      agg.moved++;
    });
    p.shootDates=Array.isArray(p.shootDates)?p.shootDates.slice():[];
    if(p.shootDates.indexOf(next)<0){       // 与 normalizeShootDates 同源逻辑，此处需自包含
      p.shootDates.push(next);
      p.shootDates=Array.from(new Set(p.shootDates)).sort();
      agg.addedDates.push(next);
    }
    p.shootDate=p.shootDates[0]||p.shootDate||'';
    cur=next; plan=planDay(p,next,null);
  }
  agg.rounds=round;
  if(plan.overflowShots&&plan.overflowShots.length){   // 7 轮仍未排完：兜底 clamp 写回 + capHit
    agg.capHit=true;
    applyPlanWrite(p,cur,planDay(p,cur,null,true));
  }
  root.addedDates=agg.addedDates;
  root.movedShots=agg.moved;
  root.capHit=agg.capHit;
  root.rounds=agg.rounds;
  return root;
}

/** 补默认节点 + 重排，一条写入口的标准收尾。anchorId 见 planDay。 */
function applyDay(p,date,anchorId,allowRoll){
  ensureDayDefaults(p,date);
  if(allowRoll===true) return rescheduleDay(p,date,anchorId);
  const plan=planDay(p,date,anchorId);
  if(!date) return plan;
  // 自动重排仅在原日内工作。未排下的分镜留在原日期且清空 slot，交给摄影师决定。
  const waiting=(plan.overflowShots||[]).map(x=>x.id);
  plan.shots=plan.shots.filter(r=>{if(r.end>1440){waiting.push(r.id);return false;}return true;});
  applyPlanWrite(p,date,plan);
  (p.shots||[]).forEach(s=>{if(s.date===date&&waiting.includes(s.id)) s.slot='';});
  if(waiting.length) plan.overflow=true;
  return plan;
}

function dayItems(p,date){
  const out=[];
  (p.shots||[]).filter(s=>s.date===date).forEach(s=>{
    const st=toMin(s.slot), dur=Math.max(5,+s.duration||SHOT_DEFAULT_MIN);
    out.push({...s,_t:'shot',_start:st,_end:st+dur,_time:s.slot||''});
  });
  (p.schedule||[]).filter(n=>(n.date||date)===date&&n.start).forEach(n=>{
    const st=toMin(n.start), raw=toMin(n.end||addMin(n.start,30));
    out.push({...n,_t:'node',_start:st,_end:raw>st?raw:st+30,_time:n.start});
  });
  out.sort((a,b)=>a._start-b._start||a._end-b._end);
  let prevEnd=-1;
  out.forEach(it=>{ it._conflict=it._start<prevEnd; if(it._end>prevEnd) prevEnd=it._end; });
  return out;
}
function timelineHtml(p,date){
  const items=dayItems(p,date);
  if(!items.length) return '<p class="muted">这一天还没有安排。添加流程环节，或在分镜表里给分镜定日期。</p>';
  const conflictN=items.filter(x=>x._conflict).length;
  let h=conflictN?'<div class="backup-tip show" style="margin-bottom:12px">检测到 '+conflictN+' 处时间重叠，后续事项与前一项未结束的时间相交。</div>':'';
  h+=items.map(it=>{
    /* 时间列统一为「起 – 止」：分镜由 slot+时长补出结束时间，与环节格式一致 */
    const time=it._t==='shot'
      ?(it._time?it._time+' – '+fmtMin(it._end):'未排时')
      :(it.start||'')+(it.end?' – '+it.end:'');
    const cflag=it._conflict?' <span class="tag red">时间重叠</span>':'';
    if(it._t==='shot'){
      const sc=p.scenes.find(x=>x.id===it.sceneId);
      const extra=[sc?sc.name:'',it.position||'',it.light||'',it.note||''].filter(Boolean).map(t=>esc(t)).join(' · ');
      const sdEditing=view.editingShotEditId===it.id;   // 日程里的分镜同样可行内编辑，保存后反写同一份 shots 数据
      return '<div class="tl-item shot-row'+(sdEditing?' editing':'')+'"><div class="tl-time">'+esc(time)+'</div><div class="tl-dot" style="background:var(--accent)"></div>'
        +(sdEditing
          ? shotEditPanel(it,p)
          : '<div class="tl-body"><div class="tl-title"><span class="tag">分镜</span> '+esc(it.name)+' <span class="muted" style="font-weight:400">· 约 '+(+it.duration||0)+' 分钟</span>'+cflag+'</div>'
            +'<div class="tl-note">'+extra+'</div></div>')
        +'<button class="chk '+(it.done?'on':'')+'" '+doAttrs('toggle-shot',[it.id])+'>'+(it.done?'✓':'')+'</button>'
        +(sdEditing?'':'<button class="rowbtn" title="编辑本分镜" '+doAttrs('begin-inline-edit',['Shot',it.id,''])+'>✎编辑</button>')
        +'</div>';
    }
    const editing=view.editingNodeId===it.id;
    const autoN=it.auto==='wrap';                // 收工时间由 planDay 计算 → 只读；集合仍可改（它决定分镜链起点）
    const autoPill=it.auto?'<span class="auto-pill">自动</span>':'';
    const body=editing
      ?'<div class="inline-edit tl-body"><div class="row">'
        +'<select id="en_type" style="max-width:110px"'+(autoN?' disabled':'')+'>'+NODE_TYPES.map(t=>'<option '+(it.type===t?'selected':'')+'>'+t+'</option>').join('')+'</select>'
        +'<input id="en_title" class="grow" value="'+esc(it.title)+'">'
        +'<input type="time" id="en_start" style="max-width:100px" value="'+esc(it.start)+'"'+(autoN?' disabled':'')+'>'
        +'<input type="time" id="en_end" style="max-width:100px" value="'+esc(it.end)+'"'+(autoN?' disabled':'')+'>'
        +'<input id="en_note" class="grow" value="'+esc(it.note||'')+'">'
        +'<button class="btn btn-primary btn-sm" '+doAttrs('save-node-edit',[it.id])+'>保存</button>'
        +'<button class="btn btn-ghost btn-sm" '+doAttrs('cancel-inline-edit')+'>取消</button></div>'
        +(autoN?'<div class="muted" style="margin-top:6px">收工时间由排程引擎接管（当天最晚结束 +15 分钟），此处只能改名称与备注。</div>':'')+'</div>'
      :'<div class="tl-body"><div class="tl-title '+(it.done?'done-text':'')+'">'+nodeTag(it.type)+' '+esc(it.title)+autoPill+(it.timeLocked?'<span class="tag blue">时间锁定</span>':'')+cflag+shiftedFlag(it.id)+'</div>'
        +(it.note?'<div class="tl-note">'+esc(it.note)+'</div>':'')+'</div>';
    return '<div class="tl-item" data-fid="'+esc(it.id)+'"><div class="tl-time">'+esc(time)+'</div><div class="tl-dot" style="background:'+(it.type==='拍摄'?'var(--accent)':'#b4b2a9')+'"></div>'
      +body
      +'<button class="chk '+(it.done?'on':'')+'" '+doAttrs('toggle-node',[it.id])+'>'+(it.done?'✓':'')+'</button>'
      +editBtn('Node',it.id)
      +favBtn('schedule',it)
      +(!it.auto?'<button class="rowbtn" title="锁定或解锁时间" '+doAttrs('toggle-node-lock',[it.id])+'>'+(it.timeLocked?'解锁':'锁时')+'</button>':'')
      +'<button class="iconbtn" '+doAttrs('del-node',[it.id])+'><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>';
  }).join('');
  return h;
}
function saveNodeEdit(id){
  const p0=cur(), n0=p0&&p0.schedule.find(x=>x.id===id);
  const title=gv('en_title').trim();
  if(!title){ toast('环节内容不能为空'); return; }
  const start=gv('en_start'), end=gv('en_end'), type=gv('en_type'), note=gv('en_note').trim();
  const locked=!!(n0&&n0.auto==='wrap');                       // 收工时间由 planDay 接管，不接受手工提交
  if(!locked&&toMin(end)<=toMin(start)){ toast('结束时间需晚于开始时间'); return; }
  let plan=null;
  updateCur(p=>{
    const n=p.schedule.find(x=>x.id===id); if(!n) return;
    if(n.auto==='wrap'){ n.title=title; n.note=note; }
    else Object.assign(n,{type,title,start,end,note});
    plan=applyDay(p,(n.date||schedDate),n.auto?null:id);        // 被编辑的节点是 anchor：位置不动，其后节点顺延
  });
  clearInlineEditState(view); toastResched(plan); renderProject();
}
function addNode(){
  const title=gv('n_title').trim(); if(!title){toast('环节内容不能为空');return;}
  const type=gv('n_type'), start=gv('n_start'), end=gv('n_end'), note=gv('n_note').trim();
  if(toMin(end)<=toMin(start)){ toast('结束时间需晚于开始时间'); return; }
  const id=uid();
  let plan=null;
  ensureShootDate(schedDate);                                     // 该日首次有手填环节 → 登记为拍摄日
  updateCur(p=>{
    p.schedule.push({id:id,type:type,title:title,start:start,end:end,note:note,date:schedDate,done:false,fav:false});
    plan=applyDay(p,schedDate,id);                                  // 新节点是 anchor：位置不动，其后节点顺延、分镜避让
  });
  toastResched(plan); renderProject();
}
function toggleNode(id){ updateCur(p=>{const n=p.schedule.find(x=>x.id===id); if(n) n.done=!n.done;}); renderProject(); }
function toggleNodeLock(id){updateCur(p=>{const n=p.schedule.find(x=>x.id===id);if(n&&!n.auto)n.timeLocked=!n.timeLocked;});renderProject();}
/* 删除日程环节：同样提供 6 秒撤销（环节删除会牵动当天顺延链，误删代价高） */
function delNode(id){
  updateCur(p=>{
    const n=p.schedule.find(x=>x.id===id); if(!n) return;
    const d=n.date||schedDate;
    p.schedule=p.schedule.filter(x=>x.id!==id);
    applyDay(p,d,null);
    toast('已删除环节「'+summary40(n.title)+'」',6000,{label:'撤销',fn:function(){
      updateCur(pp=>{
        if(pp.schedule.some(x=>x.id===n.id)) return;   // 已恢复过则不重复
        pp.schedule.push(n);
        applyDay(pp,n.date||'',null);
      });
      renderProject();
    }});
  });
  renderProject();
}

