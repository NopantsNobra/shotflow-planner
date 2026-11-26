/* ================= 拍摄日模式 ================= */
let sdDate=null;
function openShootDay(){ const p=cur(); sdDate=p.shootDate||todayStr(); renderShootDay(); document.getElementById('sdOverlay').classList.add('show'); }
function closeShootDay(){ document.getElementById('sdOverlay').classList.remove('show');document.getElementById('sdBody').replaceChildren(); renderProject(); }
function sdSetDate(d){ sdDate=d; renderShootDay(); }
async function renderShootDay(){
  const p=cur(); if(!p) return;
  autoSyncDay(sdDate);                 // 切到某日期时补齐集合/收工并重排（demo 只读自动跳过）
  const requestedDate=sdDate;
  await ensureShiseiRefs(p);
  if(!document.getElementById('sdOverlay').classList.contains('show')||cur()?.id!==p.id||sdDate!==requestedDate)return;
  const shots=p.shots.filter(s=>s.date===sdDate);
  const items=dayItems(p,sdDate).sort((a,b)=>Number(!!a.deferred)-Number(!!b.deferred));
  const pendingMust=shots.filter(s=>s.mustShoot&&!s.done).length;
  const skipped=shots.filter(s=>s.skipped&&!s.done).length;
  const done=items.filter(x=>x.done).length;
  const zone=projectTimeZone(p),parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const part=k=>parts.find(x=>x.type===k).value;
  const nowT=part('hour')+':'+part('minute');
  const isToday=sdDate===part('year')+'-'+part('month')+'-'+part('day');
  let currentId=null;
  if(isToday){ items.forEach(x=>{ if(!x.done&&!x.skipped&&!x.deferred&&(x._time||'00:00')<=nowT) currentId=x.id; }); if(!currentId){ const nxt=items.find(x=>!x.done&&!x.skipped&&!x.deferred)||items.find(x=>!x.done&&!x.skipped); if(nxt) currentId=nxt.id; } }
  const sun=sunTimes(sdDate,p.lat,p.lng,projectTimeZone(p));
  let h='<div class="sd-head"><h2>'+esc(p.name)+'</h2>'
    +'<button class="sd-nav" '+doAttrs('sd-shift',[-1])+' title="前一天">‹</button>'
    +'<input type="date" value="'+sdDate+'" data-change="sd-set-date" style="background:#221e18;color:#f0ebe2;border-color:#3a342b;max-width:150px">'
    +'<button class="sd-nav" '+doAttrs('sd-shift',[1])+' title="后一天">›</button>'
    +'<button class="sd-btn" '+doAttrs('close-shoot-day')+'>退出</button></div>'
    +'<div class="muted" style="color:#d7ccbb">拍摄日模式 · 完成 '+done+'/'+items.length+(skipped?' · 已跳过 '+skipped:'')+(pendingMust?' · 必拍未完成 '+pendingMust:'')+'</div>'
    +'<div class="sd-progress"><i style="width:'+(items.length?done/items.length*100:0)+'%"></i></div>';
  if(sun) h+='<div class="sd-sun"><span>日出 '+sun.sunrise+'</span><span>黄金 '+sun.goldenStart+'</span><span>日落 '+sun.sunset+'</span><span>暮光 '+addMin(sun.sunset,30)+'</span></div>';
  if(!items.length){ h+='<div class="sd-empty">这一天没有安排。<br>回日程页添加流程，或切换上方日期。</div>'; }
  else{
    let lastT='';
    items.forEach(x=>{
      const time=x._t==='shot'&&x._time?x._time+' – '+fmtMin(x._end):(x._time||'未排时');
      if(time!==lastT){ lastT=time;
        h+='<div class="sd-slot">◷ '+esc(time)+(x.id===currentId?' <span class="now">当前</span>':'')+'</div>'; }
      const overdue=isToday&&!x.done&&!x.skipped&&!x.deferred&&(x._time||'00:00')<nowT&&x.id!==currentId&&x._time;
      const cflag=x._conflict?' <span class="tag red" style="border:1px solid #a32d2d">重叠</span>':'';
      if(x._t==='shot'){
        const scene=p.scenes.find(s=>s.id===x.sceneId);
        const refs=x.refIds||[];
        h+='<div class="sd-shot '+(x.done||x.skipped?'done':'')+' '+(x.id===currentId?'now':'')+'">'
          +(refs.length?'<div class="sd-refs">'+refs.map((r,i)=>'<button class="sd-ref" aria-label="查看参考图 '+(i+1)+'" '+doAttrs('open-ref-viewer',[x.id,i])+'>'+(imgCache[r]?'<img src="'+esc(imgCache[r])+'" alt="参考图">':'<span>查看参考图</span>')+'</button>').join('')+'</div>':'')
          +'<div style="flex:1;min-width:120px"><div class="sd-name"><span class="sd-tag">分镜</span>'+esc(x.name)+(x.mustShoot?' <span class="sd-tag">必拍</span>':'')+(x.skipped?' <span class="sd-tag">已跳过</span>':x.deferred?' <span class="sd-tag">待补拍</span>':'')+cflag+'</div>'
          +'<div class="sd-meta">'+(scene?esc(scene.name)+' · ':'')+'约 '+(+x.duration||0)+' 分钟'+(x.note?' · '+esc(x.note):'')+'</div>'
          +((overdue||x._conflict)?'<button class="sd-btn" style="margin-top:8px" '+doAttrs('sd-postpone')+' title="当天所有环节与分镜整体后移 1 小时，收工随之重排">⚠ 已'+(overdue?'超时':'重叠')+' · 整日顺延 1 小时</button>':'')
          +(!x.done?'<div class="sd-actions"><button class="sd-btn" '+doAttrs('sd-disposition',[x.id,'deferred'])+'>'+(x.deferred?'取消补拍':'稍后补拍')+'</button><button class="sd-btn" '+doAttrs('sd-disposition',[x.id,'skipped'])+'>'+(x.skipped?'恢复':'跳过')+'</button></div>':'')
          +'</div>'
          +'<button class="sd-chk '+(x.done?'on':'')+'" aria-label="完成或恢复分镜" aria-pressed="'+!!x.done+'" '+doAttrs('sd-toggle',[x.id])+'>✓</button></div>';
      } else {
        h+='<div class="sd-shot node '+(x.done?'done':'')+' '+(x.id===currentId?'now':'')+'">'
          +'<div style="flex:1;min-width:120px"><div class="sd-name" style="font-size:16px">'+esc(x.title)+cflag+'</div>'
          +'<div class="sd-meta">'+esc(x.type)+(x.end?' · 至 '+esc(x.end):'')+(x.note?' · '+esc(x.note):'')+'</div></div>'
          +'<button class="sd-chk sm '+(x.done?'on':'')+'" aria-label="完成或恢复流程" aria-pressed="'+!!x.done+'" '+doAttrs('sd-toggle-node',[x.id])+'>✓</button></div>';
      }
    });
  }
  document.getElementById('sdBody').innerHTML=h;
}
function sdShift(d){ const dt=new Date(sdDate+'T12:00:00'); dt.setDate(dt.getDate()+d); sdDate=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); renderShootDay(); }
function sdToggle(id){ updateCur(p=>{const s=p.shots.find(x=>x.id===id); if(s){s.done=!s.done;s.skipped=false;s.deferred=false;}}); renderShootDay(); }
function sdDisposition(id,kind){
  if(!['skipped','deferred'].includes(kind))return;
  updateCur(p=>{const s=p.shots.find(x=>x.id===id);if(!s)return;const next=!s[kind];s.skipped=false;s.deferred=false;s.done=false;s[kind]=next;});
  renderShootDay();
}
function sdToggleNode(id){ updateCur(p=>{const n=p.schedule.find(x=>x.id===id); if(n) n.done=!n.done;}); renderShootDay(); }
/* v10：整日顺延 1 小时 —— 当天所有节点（含集合、收工）+60，随后整链重排 */
function sdPostpone(){
  const p=cur(); if(!p) return;
  const nodes=(p.schedule||[]).filter(n=>(n.date||sdDate)===sdDate&&n.start&&!n.timeLocked&&n.auto!=='wrap');
  if(!nodes.length){ toast('当天只有分镜，请先在日程里插入环节再整体顺延'); return; }
  let overflow=false;
  nodes.forEach(n=>{
    const en=toMin(n.end||addMin(n.start,COLLECT_MIN));
    if(en+60>=1440) overflow=true;
  });
  if(overflow){ toast('顺延后超出当天 24:00，请先改到次日'); return; }
  let ok=false;
  updateCur(pp=>{
    (pp.schedule||[]).forEach(n=>{
      if((n.date||sdDate)!==sdDate||!n.start||n.timeLocked||n.auto==='wrap') return;
      const st0=n.start, en0=n.end;
      n.start=addMin(st0,60);
      n.end=en0?addMin(en0,60):addMin(n.start,COLLECT_MIN);
    });
    applyDay(pp,sdDate,null);      // 分镜跟随新的 base 链，收工时间由 planDay 重算
    ok=true;
  });
  if(ok) toast('当天日程与分镜已整体顺延 1 小时');
  renderShootDay();
}

