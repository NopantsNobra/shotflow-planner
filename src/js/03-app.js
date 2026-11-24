/* ================= 看板 ================= */
let boardQueryTimer=null;
/* 搜索输入走防抖 + 局部重绘（只刷新表格区），输入框不重建，焦点不丢 */
function setBoardQuery(v){
  view.boardQuery=v;
  clearTimeout(boardQueryTimer);
  boardQueryTimer=setTimeout(refreshBoardGrid,160);
}
/* 看板列区（空状态 + 六列看板）：renderBoard 全量绘与 setBoardQuery 局部刷新共用 */
function boardGridHtml(all,ps,t){
  let g='';
  if(!ps.length){ g+='<div class="card board-empty" style="text-align:center;padding:56px 24px"><p class="muted">'+(all.length?'没有匹配的策划案，换个关键词或切换筛选。':'还没有策划案。点击右上角「新建策划案」，从一缕灵感开始。')+'</p></div>'; }
  g+='<div class="board">'+STATUSES.map((s,i)=>{
    const col=ps.filter(p=>p.status===s);
    return '<section class="bcol"><div class="bcol-head"><span class="dot st-'+i+'"></span><h3>'+s+'</h3><span class="count">'+col.length+'</span></div>'
      + (col.length ? col.map(p=>projectCardHtml(p,i,t)).join('') : '<div class="bempty">暂无项目</div>')
      +'</section>';
  }).join('')+'</div>';
  return g;
}
/* 看板项目卡（含拍摄倒计时）：与项目页头部共用 shootCountdown 文案 */
function projectCardHtml(p,i,t){
  const total=p.shots.length, done=p.shots.filter(x=>x.done).length;
  const pct=total?Math.round(done/total*100):0;
  const openT=p.todos.filter(x=>!x.done).length;
  const overdue=p.todos.filter(x=>!x.done&&x.due&&x.due<t).length;
  const cd=shootCountdown(p,t);
  return '<article class="pcard st-'+i+'" onclick="openProject('+jstr(p.id)+')">'
    +'<div class="pname">'+demoBadge(p)+esc(p.name)+'</div>'
    +'<div class="pmeta">'+esc(p.client||'个人项目')+' · '+(p.shootDate?'拍摄 '+esc(p.shootDate)+cd.text:'未定拍摄日')+'</div>'
    +'<div class="pmeta">分镜 '+done+' / '+total+(openT?' · 待办 '+openT:'')+'</div>'
    +'<div class="pbar"><i style="width:'+pct+'%"></i></div>'
    +'<div class="pfoot"><span class="pct">'+pct+'% 完成</span>'+(overdue?'<span class="tag red">逾期 '+overdue+'</span>':'')+'</div>'
    +'</article>';
}
/* 拍摄倒计时文案（看板卡 / 项目页头部共用；活动阶段才有意义） */
function shootCountdown(p,t){
  if(!p.shootDate||!isActiveStatus(p)) return {diff:0,text:''};
  const diff=Math.round((new Date(p.shootDate)-new Date(t))/864e5);
  return {diff:diff,text:diff>0?' · '+diff+' 天后':(diff===0?' · 今天':'')};
}
function renderBoard(){
  const all=loadP();
  const q=(view.boardQuery||'').trim().toLowerCase();
  const ps=all.filter(p=>matchBoardScope(p,view.boardScope)&&searchHit(p,q));
  let h='<header class="masthead"><div class="brand"><span class="eyebrow">Stillmark · 摄影策划</span><h1>瞬刻摄影工作台</h1><span class="tagline">定格一瞬，刻下永恒。</span></div><div class="sp"></div>'
    +'<div class="mast-actions">'
    +'<button class="btn btn-ghost btn-sm" id="installBtn" style="display:none" onclick="installApp()">安装到桌面</button>'
    +favoritesButton()
    +'<button class="btn btn-ghost btn-sm" onclick="openSettings()">⚙ 设置</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'importFile\').click()">导入</button>'
    +'<button class="btn btn-danger btn-sm" onclick="clearAll()">清空</button>'
    +'<button class="btn btn-primary" onclick="newProject()">新建策划案</button>'
    +'<input type="file" id="importFile" accept=".json" style="display:none" onchange="importJSON(event)"></div></header>'
    +'<div class="backup-tip" id="backupTip"><span>数据较多，建议在「⚙ 设置」中定期导出备份留档。</span></div>'
    +(storageDegraded?'<div class="backup-tip show"><span>⚠ 存储不可用（IndexedDB 未能打开）：本次会话的数据不会被保存，请及时「导出备份」，并检查浏览器隐私模式 / 存储设置。</span></div>':'');
  const t=todayStr();
  /* B5 统计口径：只读示例项目不计入顶部指标（与备份计数 backupItemCount 同口径，避免虚高） */
  const mine=all.filter(p=>!p.demo);
  const active=mine.filter(isActiveStatus).length;
  const todayShoots=mine.filter(p=>p.shootDate===t&&isActiveStatus(p)).length;
  const overdueTodos=mine.reduce((s,p)=>s+p.todos.filter(x=>!x.done&&x.due&&x.due<t).length,0);
  const totalBudget=mine.reduce((s,p)=>s+p.budget.reduce((x,b)=>x+(+b.amount||0),0),0);
  h+='<div class="metrics">'
    +statPill('M3 7h13v10H3z M16 10h3l2 2v3h-5',active,'进行中项目')
    +statPill('M12 6v6l4 2 M12 3a9 9 0 1 0 .01 0',todayShoots,'今日拍摄')
    +statPill('M9 11l3 3 8-8 M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11',overdueTodos,'逾期待办',overdueTodos>0)
    +statPill('M12 2v20 M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6','¥'+totalBudget.toLocaleString(),'总预算')
    +'</div>'
    +'<div class="toolbar"><div class="searchbox">'
    +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/></svg>'
    +'<input id="boardSearch" placeholder="搜索策划案、客户、主题、分镜或沟通记录…" value="'+esc(view.boardQuery)+'" oninput="setBoardQuery(this.value)">'
    +'</div><div class="seg">'+['全部','进行中','已归档'].map(s=>'<button class="'+(view.boardScope===s?'on':'')+'" onclick="view.boardScope=\''+s+'\';renderBoard()">'+s+'</button>').join('')+'</div></div>'
    +'<div id="boardGrid">'+boardGridHtml(all,ps,t)+'</div>';
  document.getElementById('app').innerHTML=h;
  const count=backupItemCount(all);
  document.getElementById('backupTip').classList.toggle('show',count>=30);
  if(deferredPrompt) document.getElementById('installBtn').style.display='';
}
/* 搜索 / 筛选变化时只重绘 #boardGrid，头部、指标条与搜索框保持不动 */
function refreshBoardGrid(){
  const host=document.getElementById('boardGrid'); if(!host) return;
  const all=loadP();
  const q=(view.boardQuery||'').trim().toLowerCase();
  const ps=all.filter(p=>matchBoardScope(p,view.boardScope)&&searchHit(p,q));
  host.innerHTML=boardGridHtml(all,ps,todayStr());
}
function statPill(icon,num,lbl,warn){
  return '<div class="metric'+(warn?' warn':'')+'"><div class="mi"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="'+icon+'"/></svg></div><div><div class="mv">'+num+'</div><div class="ml">'+lbl+'</div></div></div>';
}
/* ================= 已收藏视图（独立 mode，不是第 8 页签） ================= */
function openFavorites(){ view=freshView({mode:'favorites'}); renderFavorites(); }
function renderFavorites(){
  const all=loadP(), entries=collectFavorites(all);
  let h='<header class="masthead"><div class="brand"><span class="eyebrow">Stillmark · 收藏夹</span><h1>★ 已收藏</h1>'
    +'<span class="tagline">按项目与模块分组 · 共 '+entries.length+' 条</span></div><div class="sp"></div>'
    +'<div class="mast-actions"><button class="btn btn-ghost btn-sm" onclick="view=freshView();renderBoard()">返回看板</button>'
    +favoritesButton()+'</div></header>';
  if(!entries.length){
    h+='<div class="card" style="text-align:center;padding:56px 24px"><p class="muted">还没有收藏。在情绪板、分镜、日程、清单、预算或协作条目上点 ☆ 即可收藏。</p></div>';
  } else {
    all.forEach(p=>{
      const list=entries.filter(e=>e.pid===p.id); if(!list.length) return;
      h+='<div class="card"><h2>'+demoBadge(p)+esc(p.name)+' <span class="muted" style="font-weight:400">· '+list.length+' 条</span></h2>';
      FAV_KINDS.forEach(type=>{
        const rows=list.filter(e=>e.type===type); if(!rows.length) return;
        h+='<div style="margin-bottom:12px"><div class="muted" style="margin-bottom:4px">'+FAV_ICON[type]+' '+FAV_META[type]+'</div>';
        rows.forEach(e=>{
          h+='<div class="row" style="padding:7px 2px;border-bottom:1px dashed var(--line)">'
            +'<span>'+FAV_ICON[e.type]+'</span>'
            +'<span class="grow">'+esc(e.summary||'（无摘要）')+'</span>'
            +'<span class="muted">'+esc(e.module)+'</span>'
            +'<button class="btn btn-ghost btn-sm" onclick="jumpToFav('+jstr(e.type)+','+jstr(e.pid)+','+jstr(e.id)+')">定位 ›</button></div>';
        });
        h+='</div>';
      });
      h+='</div>';
    });
  }
  document.getElementById('app').innerHTML=h;
}
async function jumpToFav(type,pid,id){
  const p=loadP().find(x=>x.id===pid); if(!p) return;
  const item=(p[type]||[]).find(x=>x.id===id);
  const date=type==='schedule'?((item&&item.date)||p.shootDate||todayStr()):null;
  view=freshView({mode:'project',pid:pid,tab:FAV_TAB[type]||'shots'});
  if(date) schedDate=date;
  const now=Date.now();
  view.focusRef={type:type,id:id,at:now,until:now+3000};
  await cacheProjectImages(p);
  renderProject();
  highlightFav(view.focusRef);
}
function highlightFav(ref){
  if(!ref) return;
  const at=ref.at;
  const locate=()=>{
    if(!view.focusRef||view.focusRef.at!==at) return;
    const el=[...document.querySelectorAll('[data-fid]')].find(x=>x.dataset.fid===ref.id);
    if(el){ el.classList.add('fav-focus','focus-highlight'); el.scrollIntoView({behavior:'auto',block:'nearest'}); }
  };
  locate();
  /* renderProject 内异步页签（如分镜）可能晚一帧才落 DOM，双 rAF 后二次定位 */
  requestAnimationFrame(()=>requestAnimationFrame(locate));
  setTimeout(()=>{
    if(!view.focusRef||view.focusRef.at!==at) return;
    document.querySelectorAll('[data-fid]').forEach(el=>{
      if(el.dataset.fid===ref.id) el.classList.remove('fav-focus','focus-highlight');
    });
    view.focusRef=null;
  },3000);
}
function toggleFav(type,id){
  updateCur(p=>{ const it=(p[type]||[]).find(x=>x.id===id); if(it) it.fav=!isFav(it); });
  if(view.mode==='favorites') renderFavorites();
  else if(view.mode==='project') renderProject();
}

/* ================= v10.8.0 收藏引用浮窗 ================= */
/* 只展示与当前页签相关的收藏类型；concept 页无收藏条目，按钮不显示。
   跨项目收藏一并列出并标注来源项目，便于把别的案子的精选直接引用过来。 */
function openFavPicker(){
  if(view.mode!=='project'){ toast('请先打开一个策划案'); return; }
  const types=favTypesForTab(view.tab);
  if(!types.length){ toast('当前页面没有可引用的收藏'); return; }
  renderFavPicker();
  document.getElementById('favPickerModal').classList.add('show');
}
function closeFavPicker(){ document.getElementById('favPickerModal').classList.remove('show'); }
function renderFavPicker(){
  const types=favTypesForTab(view.tab);
  const entries=collectFavorites(loadP()).filter(e=>types.indexOf(e.type)>=0);
  const tabName=TABS.filter(t=>t[0]===view.tab).map(t=>t[1])[0]||'当前页面';
  document.getElementById('favPickerTitle').textContent='打开收藏 · '+tabName+'（'+entries.length+'）';
  let h='<p class="muted" style="margin:0 0 12px;font-size:12px">仅列出与「'+esc(tabName)+'」相关的收藏；引用后时间顺延 '+COPY_SHIFT_MIN+' 分钟，追加到当前策划案。</p>';
  if(!entries.length){
    h+='<div style="text-align:center;padding:32px 12px"><p class="muted">当前页面暂无相关收藏。在条目上点 ☆ 收藏后即可在此引用。</p></div>';
  } else {
    const all=loadP();
    h+='<div style="max-height:52vh;overflow:auto">'+entries.map(e=>{
      const src=all.find(p=>p.id===e.pid);
      const same=src&&src.id===view.pid;
      return '<div class="row" style="padding:9px 2px;border-bottom:1px dashed var(--line)">'
        +'<span>'+FAV_ICON[e.type]+'</span>'
        +'<span class="grow" style="min-width:0"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(e.summary||'（无摘要）')+'</span>'
          +'<span class="muted" style="font-size:11px">'+esc(e.module)+' · '+esc(src?src.name:'来源已删除')+(same?' · 本案':'')+'</span></span>'
        +'<button class="btn btn-ghost btn-sm" onclick="referenceFav('+jstr(e.type)+','+jstr(e.pid)+','+jstr(e.id)+')">引用收藏 ›</button></div>';
    }).join('')+'</div>';
  }
  document.getElementById('favPickerBody').innerHTML=h;
}
/* 引用收藏：从源项目取原始条目 → 深拷贝（JSON 往返，条目均为纯数据）→ 新 id / fav / done 重置
   → 时间字段 +5 分钟 → 追加到当前项目同类数组。列表与浮窗即时刷新，浮窗保持打开可连续引用。 */
function referenceFav(type,pid,itemId){
  const p=cur(); if(!p){ toast('请先打开一个策划案'); return; }
  if(favTypesForTab(view.tab).indexOf(type)<0){ toast('该收藏不属于当前页面'); return; }
  const src=loadP().find(x=>x.id===pid);
  const it=src&&(Array.isArray(src[type])?src[type]:[]).find(x=>x.id===itemId);
  if(!it){ toast('收藏条目已不存在'); renderFavPicker(); return; }
  let added=false;
  updateCur(pp=>{
    if(!Array.isArray(pp[type])) pp[type]=[];
    const clone=shiftTimeFields(JSON.parse(JSON.stringify(it)),COPY_SHIFT_MIN);
    clone.id=uid(); clone.fav=false;
    if('done' in clone) clone.done=false;
    if(type==='shots'&&!('ord' in clone)) clone.ord=pp.shots.length;
    pp[type].push(clone);
    added=true;
  });
  if(!added) return;
  toast('已引用「'+favSummary(type,it)+'」，时间顺延 '+COPY_SHIFT_MIN+' 分钟');
  renderProject();
  if(document.getElementById('favPickerModal').classList.contains('show')) renderFavPicker();
}
function newProject(){
  /* 用应用内弹窗替代原生 prompt：风格统一，Enter 直接创建，Esc 取消 */
  const box=document.getElementById('nameModal');
  const input=document.getElementById('nameInput');
  if(!box||!input){ return; }
  input.value='';
  box.classList.add('show');
  setTimeout(()=>{ input.focus(); },50);
}
function closeNameModal(){ document.getElementById('nameModal').classList.remove('show'); }
function confirmNewProject(){
  const input=document.getElementById('nameInput');
  const name=(input&&input.value||'').trim()||'未命名拍摄项目';
  closeNameModal();
  const a=loadP();
  a.push(migrate({id:uid(),v3:1,name:name,client:'',status:'灵感期',shootDate:'',location:'',lat:'',lng:'',createdAt:Date.now(),updatedAt:Date.now()}));
  saveP(a); openProject(a[a.length-1].id);
  toast('已创建「'+name+'」');
}
async function openProject(pid){ view=freshView({mode:'project',pid:pid,tab:'shots'}); schedDate=null; await cacheProjectImages(cur()); renderProject(); }

/* ================= 项目页 ================= */
const TABS=[['concept','概念','策划'],['mood','情绪板','策划'],['shots','分镜','执行'],['schedule','日程','执行'],['stuff','清单','执行'],['budget','预算','落地'],['notes','协作','落地']];
function renderProject(){
  const p=cur(); if(!p){view.mode='board';renderBoard();return;}
  const t=todayStr();
  const cd0=shootCountdown(p,t);          // 与看板卡片同一来源，避免两处文案漂移
  let cd='';
  if(p.shootDate&&cd0.diff>0) cd='<span class="tag blue">还有 '+cd0.diff+' 天</span> ';
  else if(p.shootDate&&cd0.diff===0) cd='<span class="tag red">今天拍摄</span> ';
  const openTodos=p.todos.filter(x=>!x.done).length;
  const dis=p.demo?' disabled':'';
  let h='<div class="phead">'
    +'<button class="crumb" onclick="view.mode=\'board\';renderBoard()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>返回看板</button>'
    +'<div class="phead-row"><div><h1>'+demoBadge(p)+esc(p.name)+'</h1>'
    +'<div class="pchips"><span class="tag '+STATUS_TAG[STATUSES.indexOf(p.status)]+'">'+esc(p.status)+'</span>'+cd
    +(openTodos?'<button class="tag purple" style="border:none;cursor:pointer;font-family:inherit" onclick="view.tab=\'notes\';renderProject()">待办 '+openTodos+'</button>':'')
    +(p.shootDate?'<span class="muted" style="font-size:12px">拍摄日 '+esc(p.shootDate)+'</span>':'')
    +'</div></div>'
    +'<div class="pactions">'
    +'<button class="btn btn-ghost btn-sm" onclick="exportProject('+jstr(p.id)+')">导出此案</button>'
    +(p.demo?'<button class="btn btn-primary" onclick="copyDemoToMine('+jstr(p.id)+')">复制为我的项目</button>'
            :'<button class="btn btn-primary" onclick="openShootDay()">进入拍摄日模式</button>')
    +favoritesButton()
    +'</div></div></div>'
    +'<div class="metacard"><div class="mgrid">'
    +'<div class="fld"><label>客户</label><input value="'+esc(p.client)+'" onchange="setP(\'client\',this.value)"'+dis+'></div>'
    +'<div class="fld"><label>工作室署名 · 封面落款</label><input value="'+esc(p.studio||'')+'" onchange="setP(\'studio\',this.value)" placeholder="如：瞬刻摄影工作室"'+dis+'></div>'
    +'<div class="fld"><label>项目阶段</label><select onchange="setP(\'status\',this.value)"'+dis+'>'+STATUSES.map(s=>'<option '+(p.status===s?'selected':'')+'>'+s+'</option>').join('')+'</select></div>'
    +'<div class="fld"><label>Day 1 · 首个拍摄日</label><input type="date" id="p_shootdate" value="'+esc(p.shootDate)+'" onchange="setShootDate(this.value)"'+dis+'></div>'
    +'<div class="fld"><label>拍摄地点</label><input value="'+esc(p.location||'')+'" onchange="setP(\'location\',this.value)" placeholder="如：南京 · 老门东"'+dis+'></div>'
    /* 经纬度合并为一格（消除第三行单列空洞）；标签中文化并说明用途。
       width:0 + flex:1 让 flexbox 完全接管宽度，避免 input intrinsic 尺寸把 grid 列 min-content 撑爆（移动端溢出） */
    +'<div class="fld"><label>经纬度 · 用于估算日落</label><div class="row" style="gap:8px;flex-wrap:nowrap">'
      +'<input id="p_lat" style="min-width:0;width:0;flex:1" value="'+esc(p.lat==null?'':p.lat)+'" onchange="setP(\'lat\',this.value)" placeholder="纬度 32.06"'+dis+'>'
      +'<input id="p_lng" style="min-width:0;width:0;flex:1" value="'+esc(p.lng==null?'':p.lng)+'" onchange="setP(\'lng\',this.value)" placeholder="经度 118.78"'+dis+'></div></div>'
    +'</div><div class="cityrow">'
    +CITIES.map(c=>'<button class="chip" title="'+c[0]+'（'+c[1]+', '+c[2]+'）" onclick="setLL(\''+c[1]+'\',\''+c[2]+'\')"'+dis+'>'+c[0]+'</button>').join('')
    /* 城市下拉：全部省会/直辖市/港澳/主要二线（按大区分组）+ 自定义地点；回显当前坐标匹配项 */
    +(function(){
      const m=cityMatch(p);
      const sel=m?m[0]:((String(p.lat==null?'':p.lat).trim()!==''||String(p.lng==null?'':p.lng).trim()!=='')?'__custom':'');
      return '<select id="cityPick" style="max-width:150px;height:34px;font-size:12.5px;padding:4px 8px" onchange="pickCity(this.value)" title="选择城市自动填入坐标，或选自定义地点后手输经纬度"'+dis+'>'
        +'<option value="" disabled hidden>'+(m?'城市 ▾':'选择城市…')+'</option>'
        +CITY_GROUPS.map(g=>'<optgroup label="'+g[0]+'">'+g[1].map(c=>'<option value="'+c[0]+'" '+(sel===c[0]?'selected':'')+'>'+c[0]+' '+c[1]+'</option>').join('')+'</optgroup>').join('')
        +'<option value="__custom" '+(sel==='__custom'?'selected':'')+'>自定义地点 · 手输经纬度</option>'
        +'</select>';
    })()
    +'<span class="muted" style="margin-left:4px">常用城市一键填入；更多城市从下拉选择；任意坐标均会按 NOAA 近似算法计算日出日落</span></div></div>'
    +'<div class="ptabs">'
    +TABS.reduce(function(segs,tb){                 /* 按 TABS 顺序聚成分组段：组词眉题在上，组内页签在下 */
      let g=segs[segs.length-1];
      if(!g||g.name!==tb[2]){ g={name:tb[2],tabs:[]}; segs.push(g); }
      g.tabs.push(tb); return segs;
    },[]).map(g=>
      '<div class="tab-seg'+(g.tabs.some(t=>t[0]===view.tab)?' on':'')+'">'
      +'<span class="tab-group">'+g.name+'</span>'
      +'<div class="tab-row">'
      +g.tabs.map(tb=>'<button class="ptab '+(view.tab===tb[0]?'active':'')+'" onclick="view.tab=\''+tb[0]+'\';renderProject()">'+tb[1]+'</button>').join('')
      +'</div></div>').join('')
    +'</div>'
    +'<div class="subbar">'
    /* v10.8.1：分镜页与日程页的入口移到各自的「添加分镜 / 添加环节」按钮旁；
       其余可收藏页签仍在 subbar 保留入口，避免丢失「所有收藏页可打开」的能力。 */
    +(favTypesForTab(view.tab).length&&view.tab!=='shots'&&view.tab!=='schedule'?'<button class="btn btn-ghost btn-sm" id="openFavBtn" title="打开与当前页面相关的收藏并引用" onclick="openFavPicker()">☆ 打开收藏</button>':'')
    +'<span class="muted" style="font-size:10px;letter-spacing:.14em">文档输出 ▸</span>'
    +'<button class="btn btn-ghost btn-sm" onclick="openDoc(\'proposal\')">客户提案</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="openDoc(\'callsheet\')">拍摄通告单</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="openDoc(\'manual\')">执行手册</button></div>'
    +'<div id="tabBody"></div>';
  document.getElementById('app').innerHTML=h;
  ({concept:renderConcept,mood:renderMood,shots:renderShots,schedule:renderSchedule,stuff:renderStuff,budget:renderBudget,notes:renderNotes})[view.tab](p);
}
function setP(k,v){ updateCur(p=>p[k]=v); }
function setLL(lat,lng){ updateCur(p=>{p.lat=lat;p.lng=lng;}); renderProject(); }
function fld(l,id,v,ph){return '<div class="fld"><label>'+l+'</label><input id="'+id+'" value="'+esc(v)+'" placeholder="'+ph+'"></div>';}
function gv(id){return document.getElementById(id).value;}
/* v9 行内编辑：同一时刻只开一行 */
function beginInlineEdit(kind,id,key){
  clearInlineEditState(view);
  if(kind==='Shot'){ view.editingShotEditId=id; view.editingShotId=null; view.replaceIdx=-1; }  // v10：分镜文字行内编辑，同时退出参考图选图态
  else if(kind==='Node') view.editingNodeId=id;
  else if(kind==='Stuff'){ view.editingStuffId=id; view.editingStuffKey=key||''; }
  else if(kind==='Todo') view.editingTodoId=id;
  else if(kind==='Note') view.editingNoteId=id;
  renderProject();
}
function cancelInlineEdit(){
  const has=!!(view.editingNodeId||view.editingStuffId||view.editingTodoId||view.editingNoteId);
  if(!has) return false;
  clearInlineEditState(view); renderProject(); return true;
}
function editBtn(kind,id,key){
  return '<button class="rowbtn" title="编辑" onclick="beginInlineEdit(\''+kind+'\','+jstr(id)+(key?','+jstr(key):'')+')">✎编辑</button>';
}
function favBtn(type,it){
  return '<button class="rowbtn'+(isFav(it)?' on':'')+'" title="收藏/取消收藏" onclick="toggleFav(\''+type+'\','+jstr(it.id)+')">'+(isFav(it)?'★':'☆')+'</button>';
}

/* ---- 概念 ---- */
function renderConcept(p){
  const c=p.concept;
  document.getElementById('tabBody').innerHTML='<div class="card"><h2>主题概念</h2><div class="form-grid">'
    +fld('拍摄主题','ct',c.theme,'如：城市漫游者')+fld('出镜模特','cm',c.model||'','如：模特姓名')
    +fld('风格调性','cs',c.style,'如：胶片感 / 暖调')
    +fld('目标受众','ca',c.audience,'')
    +'<div class="full"></div>'
    +fld('成片用途','cu',c.usage,'')+'<div class="full"></div>'
    +'<div class="fld full"><label>创意阐述</label><textarea id="cn" rows="3">'+esc(c.note)+'</textarea></div></div></div>';
  if(p.demo){
    ['ct','cm','cs','ca','cu','cn'].forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled=true; });
    return;
  }
  const save=()=>updateCur(pp=>pp.concept={theme:gv('ct'),model:gv('cm'),style:gv('cs'),audience:gv('ca'),usage:gv('cu'),note:gv('cn')});
  ['ct','cm','cs','ca','cu','cn'].forEach(id=>document.getElementById(id).addEventListener('input',save));
}

/* ---- 情绪板 ---- */
function renderMood(p){
  document.getElementById('tabBody').innerHTML='<div class="card"><h2>情绪板</h2>'
    +'<p class="muted" style="margin-bottom:10px">图片存于本地 IndexedDB，自动压缩至 800px。图片可在分镜里引用为参考图（每条分镜最多 3 张）；文字 / 色彩 / 图片均可打多标签。</p>'
    +'<div class="row"><input id="m_text" class="grow" placeholder="文字灵感…" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addMood(\'text\');}"><input id="m_tag" style="max-width:230px" placeholder="标签：逆光, 中景, golden hour（逗号分隔）" onkeydown="if(event.key===\'Enter\'){event.preventDefault();document.getElementById(\'m_text\').focus();}">'
    +'<input type="color" id="m_color" value="#c8a97e" style="width:54px;height:44px;padding:4px">'
    +'<button class="btn btn-ghost" onclick="addMood(\'text\')">加文字</button>'
    +'<button class="btn btn-ghost" onclick="addMood(\'color\')">加色彩</button>'
    +'<button class="btn btn-primary" onclick="document.getElementById(\'m_img\').click()">上传精选图</button>'
    +'<button class="btn btn-ghost" onclick="toggleRefPicker()">'+(view.moodRefPicker?'收起参考图库':'＋ 从参考图库精选')+'</button>'
    +'<input type="file" id="m_img" accept="image/*" style="display:none" onchange="addMoodImg(event)"></div>'
    +(view.moodRefPicker?refPickerHtml(p):'')
    +'<div id="tagEditor"></div>'
    +'<div class="tag-filter"><input id="m_filter" placeholder="按标签筛选，逗号分隔…" value="'+esc(view.moodFilter.join(', '))+'" oninput="setMoodFilter(this.value)">'
    +'<div class="seg"><button class="'+(view.moodFilterMode==='any'?'on':'')+'" onclick="setMoodFilterMode(\'any\')">任一命中</button>'
    +'<button class="'+(view.moodFilterMode==='all'?'on':'')+'" onclick="setMoodFilterMode(\'all\')">全部命中</button></div>'
    +'<button class="btn btn-ghost btn-sm" onclick="clearMoodFilter()">清空筛选</button>'
    +'<span class="muted" id="moodCount"></span></div>'
    +'<div id="tagCloud" class="tag-cloud"></div>'
    +'<div id="moodGrid" class="mood-grid"></div>'
    +'<details class="src-panel"><summary>素材来源与常用标签</summary>'
    +'<p class="src-note">本工具不内置任何图片；你可自行下载用于个人创作参考。再分发图片数据本身是否允许，以各站许可为准（PoseAtlas 允许创作参考、禁止再分发图片本身）。</p>'
    +'<div class="src-list">'+MATERIAL_SOURCES.map(s=>'<div><a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.name)+'</a>'
      +'<span class="src-lic">'+esc(s.lic)+'</span><div class="muted">'+esc(s.note)+'</div></div>').join('')+'</div>'
    +'<div id="shiseiSyncBox"></div>'
    +'<div class="src-words">'+TAG_SUGGESTIONS.map(t=>'<button class="chip" onclick="addTagWord('+jstr(t)+')">+ '+esc(t)+'</button>').join('')+'</div>'
    +'</details></div>';
  renderMoodGrid(p);
  renderShiseiSyncStatus();
}
function renderMoodGrid(p){
  p=p||cur(); if(!p) return;
  const all=Array.isArray(p.mood)?p.mood:[];
  const freq=new Map(), order=new Map(); let seq=0;
  const touch=(key,label)=>{
    if(!key) return;
    if(!order.has(key)) order.set(key,seq++);
    if(!freq.has(key)) freq.set(key,{key,label,count:0});
    freq.get(key).count++;
  };
  all.forEach(m=>tagsForDisplay(m).forEach(t=>touch(tagKey(t),t)));
  (Array.isArray(p.tagVocab)?p.tagVocab:[]).forEach(t=>touch(tagKey(t),t));
  const cloud=[...freq.values()].sort((a,b)=>b.count-a.count||order.get(a.key)-order.get(b.key));
  const active=new Set(view.moodFilter.map(tagKey));
  document.getElementById('tagCloud').innerHTML=cloud.length?cloud.map(x=>
      '<span class="tagchip'+(active.has(x.key)?' on':'')+'">#'+esc(x.label)+' ×'+x.count
      +'<button title="按此标签筛选" onclick="toggleMoodFilterKey('+jstr(x.key)+')">'+(active.has(x.key)?'✓':'筛')+'</button>'
      +'<button title="重命名标签" onclick="startRenameTag('+jstr(x.label)+')">✎</button>'
      +'<button title="删除标签" onclick="delTagFromVocab('+jstr(x.label)+')">×</button></span>').join('')
    :'<span class="muted">还没有标签。可在上方输入框添加，或从下方常用词里点选。</span>';
  const filtered=all.filter(m=>matchByTags(m,view.moodFilter,view.moodFilterMode));
  const countEl=document.getElementById('moodCount'); if(countEl) countEl.textContent=filtered.length+'/'+all.length+' 张';
  const filterInput=document.getElementById('m_filter');
  const filterText=view.moodFilter.join(', ');
  if(filterInput&&filterInput.value!==filterText) filterInput.value=filterText;
  const grid=document.getElementById('moodGrid'); if(!grid) return;
  let html='';
  if(!all.length){
    html='<p class="muted" style="grid-column:1/-1">还没有素材。上传图片 / 写文字 / 取色彩时可在「标签」框输入，逗号分隔（如：逆光, 中景, 回眸）。</p>';
  } else if(!filtered.length){
    html='<p class="muted" style="grid-column:1/-1">没有命中所选标签的素材，换个标签或清空筛选。</p>';
  } else {
    html=filtered.map(m=>{
      let body='';
      if(m.type==='image') body='<img src="'+esc(imgCache[m.content]||'')+'">';
      else if(m.type==='color') body='<div class="mcolor" style="background:'+esc(safeColor(m.content))+'"></div>';
      else body='<div class="mtext">'+esc(m.content)+'</div>';
      const tags=tagsForDisplay(m);
      const chips=tags.length?tags.map(t=>'<button class="tagchip" title="编辑标签" onclick="openTagEditor('+jstr(m.id)+')">#'+esc(t)+'</button>').join(''):'<span class="muted">无标签</span>';
      const suggest=(m.autoTags&&m.autoTags.length)?'<button class="tagchip" onclick="applyAiSuggestion('+jstr(m.id)+')">采纳建议</button>':'';
      return '<div class="mood-item" data-fid="'+esc(m.id)+'">'+body+'<button class="del" onclick="delMood('+jstr(m.id)+')">×</button>'
        +'<div class="mfoot"><span class="tagchips">'+chips+'</span>'+suggest
        +'<button class="rowbtn'+(isFav(m)?' on':'')+'" title="收藏/取消收藏" onclick="toggleFav(\'mood\','+jstr(m.id)+')">'+(isFav(m)?'★':'☆')+'</button>'
        +'<button class="iconbtn" title="编辑标签" onclick="openTagEditor('+jstr(m.id)+')">✎</button></div></div>';
    }).join('');
  }
  grid.innerHTML=html;
}
function setMoodFilter(v){ view.moodFilter=dedupeTags(parseTagsInput(v).map(tagKey)); renderMoodGrid(cur()); }
function setMoodFilterMode(mode){ if(mode!=='any'&&mode!=='all') return; view.moodFilterMode=mode; renderMoodGrid(cur()); }
function toggleMoodFilterKey(key){
  const k=tagKey(key), i=view.moodFilter.findIndex(x=>tagKey(x)===k);
  if(i>=0) view.moodFilter.splice(i,1); else view.moodFilter.push(k);
  renderMoodGrid(cur());
}
function clearMoodFilter(){ view.moodFilter=[]; renderMoodGrid(cur()); }
function addTagWord(word){
  const input=document.getElementById('m_tag'); if(!input) return;
  input.value=parseTagsInput(input.value+','+word).join(', '); input.focus();
}
function openTagEditor(moodId){
  const box=document.getElementById('tagEditor'), p=cur(); if(!box||!p) return;
  const m=p.mood.find(x=>x.id===moodId); if(!m) return;
  box.innerHTML='<div class="tag-editor"><div class="row"><input id="tgEdit" class="grow" value="'+esc(tagsForDisplay(m).join(', '))+'" placeholder="标签：逆光, 中景, golden hour">'
    +'<button class="btn btn-primary btn-sm" onclick="saveTagEditor('+jstr(moodId)+')">保存</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="cancelTagEditor()">取消</button></div>'
    +'<div class="muted">用逗号 / 分号分隔；空格不拆分，便于保留「golden hour」。</div></div>';
  document.getElementById('tgEdit').focus();
}
function cancelTagEditor(){ const box=document.getElementById('tagEditor'); if(box) box.innerHTML=''; }
function saveTagEditor(moodId){
  const tags=parseTagsInput(gv('tgEdit'));
  updateCur(p=>{
    const m=p.mood.find(x=>x.id===moodId); if(!m) return;
    m.tags=tags; m.tag=tags[0]||''; p.tagVocab=mergeVocab(p.tagVocab,tags);
  });
  cancelTagEditor(); renderProject();
}
function startRenameTag(from){
  const box=document.getElementById('tagEditor'); if(!box) return;
  box.innerHTML='<div class="tag-editor"><div class="row"><input id="tgRename" class="tag-rename grow" value="'+esc(from)+'" placeholder="新标签名">'
    +'<button class="btn btn-primary btn-sm" onclick="commitRenameTag('+jstr(from)+')">确认重命名</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="cancelTagEditor()">取消</button></div>'
    +'<div class="muted">将同步更新所有素材与词表；不影响分镜里已引用的参考图。</div></div>';
  document.getElementById('tgRename').focus();
}
function commitRenameTag(from){
  const to=gv('tgRename').trim(); if(!tagKey(to)){ toast('新标签不能为空'); return; }
  const p=cur(); if(!p) return;
  const n=p.mood.filter(m=>matchByTags(m,[from],'any')).length;
  askConfirm('重命名标签？','将把 '+n+' 张素材上的 #'+from+' 改为 #'+to+'，词表同步合并同名；不影响分镜里已引用的参考图。',()=>{
    updateCur(pp=>renameTag(pp,from,to));
    view.moodFilter=view.moodFilter.map(k=>tagKey(k)===tagKey(from)?tagKey(to):k);
    cancelTagEditor(); renderProject(); toast('标签已重命名');
  });
}
function delTagFromVocab(tag){
  const p=cur(); if(!p) return;
  const n=p.mood.filter(m=>matchByTags(m,[tag],'any')).length;
  askConfirm('删除标签？','将从 '+n+' 张素材和本项目的标签词表中移除 #'+tag+'；不影响分镜里已引用的参考图。',()=>{
    updateCur(pp=>removeTag(pp,tag));
    view.moodFilter=view.moodFilter.filter(k=>tagKey(k)!==tagKey(tag));
    cancelTagEditor(); renderProject(); toast('标签已删除');
  });
}
function addMood(type){
  const p=cur();
  if(p&&p.demo){ toast('示例项目只读，请点「复制为我的项目」后再修改'); return; }
  const tags=parseTagsInput(gv('m_tag'));
  let content=type==='text'?gv('m_text').trim():safeColor(gv('m_color').value);
  if(type==='text'&&!content){toast('先写点灵感内容');return;}
  updateCur(p=>{
    p.mood.push({id:uid(),type,content,tag:tags[0]||'',tags,fav:false});
    p.tagVocab=mergeVocab(p.tagVocab,tags);
  }); renderProject();
}
/* v10.4 图片入库共享链路：压缩 → IndexedDB → 参考图库 p.refs（总是）；
   target==='mood' 时才额外精选到情绪板（仅「情绪板页上传精选图」这一显式动作）。
   压缩策略与 800px/.72 不变；tags 由调用方决定（情绪板读输入框，分镜页传空）。 */
async function ingestImageFile(f,tags,silent,target){
  if(!f) return null;
  return new Promise(res=>{
    const rd=new FileReader();
    rd.onload=ev=>{ const img=new Image();
      img.onload=async()=>{
        try{
          const c=document.createElement('canvas'); const s=Math.min(1,800/img.width);
          c.width=img.width*s; c.height=img.height*s;
          c.getContext('2d').drawImage(img,0,0,c.width,c.height);
          const imgId=uid(); const data=c.toDataURL('image/jpeg',.72);
          await idb.put(imgId,data); imgCache[imgId]=data;
          updateCur(p=>{
            p.refs=Array.isArray(p.refs)?p.refs:[];
            p.refs.push({id:uid(),key:imgId,name:(f&&f.name)||'',tags:(tags||[]).slice(),createdAt:Date.now(),fav:false});
            if(target==='mood'){
              p.mood.push({id:uid(),type:'image',content:imgId,tag:(tags&&tags[0])||'',tags:(tags||[]).slice(),fav:false});
            }
            p.tagVocab=mergeVocab(p.tagVocab,tags||[]);
          });
          res(imgId);
        }catch(err){ if(!silent) toast('图片处理失败'); res(null); }
      };
      img.onerror=()=>{ if(!silent) toast('图片读取失败'); res(null); };
      img.src=ev.target.result; };
    rd.onerror=()=>{ if(!silent) toast('图片读取失败'); res(null); };
    rd.readAsDataURL(f);
  });
}
async function addMoodImg(e){
  const p=cur();
  if(p&&p.demo){
    try{ e.target.value=''; }catch(err){}
    toast('示例项目只读，请点「复制为我的项目」后再修改'); return;
  }
  const f=e.target.files[0]; if(!f) return;
  const tags=parseTagsInput(gv('m_tag'));   // 异步前同步读取，避免压缩期间切页丢输入
  const imgId=await ingestImageFile(f,tags,false,'mood');   // 情绪板页主动上传＝精选，同时进 refs 与 mood
  e.target.value='';
  if(imgId) renderProject();
}
function delMood(id){ updateCur(p=>p.mood=p.mood.filter(m=>m.id!==id)); renderProject(); }

/* v10.4：情绪板「从参考图库精选」——上传的图默认只在 refs，精选动作才会写进 mood（提案不再混入执行参考图） */
function toggleRefPicker(){ view.moodRefPicker=!view.moodRefPicker; renderProject(); }
function refPickerHtml(p){
  const refs=(p.refs||[]).slice().sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);});
  const inMood=new Set((p.mood||[]).filter(function(m){return m.type==='image';}).map(function(m){return String(m.content);}));
  if(!refs.length) return '<div class="src-panel" style="margin:10px 0"><div class="muted">参考图库还是空的。在分镜页上传的图片会存到这里，不会自动进入情绪板。</div></div>';
  return '<div class="src-panel" style="margin:10px 0">'
    +'<p class="src-note">从参考图库挑选表达整体基调的图加入情绪板；已在情绪板的图不能重复加入。</p>'
    +'<div class="ref-picker">'+refs.map(function(r){
      const key=String(r&&r.key||'');
      const has=inMood.has(key), tags=(r&&r.tags)||[];
      return '<div style="width:auto;min-width:112px;max-width:152px;border:1px solid var(--line);border-radius:9px;padding:6px;text-align:center;background:var(--surface)">'
        +(imgCache[key]?'<img src="'+esc(imgCache[key])+'" style="width:96px;height:72px;object-fit:cover;border-radius:6px;display:block;margin:0 auto 5px">'
          :'<div class="muted" style="height:72px;display:flex;align-items:center;justify-content:center">原图缺失</div>')
        +'<div class="muted" style="font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(r.name||key)+'">'+esc(r.name||'参考图')+'</div>'
        +'<div style="font-size:9.5px;color:var(--accent-ink);margin:2px 0 5px">'+esc(tags.map(function(t){return '#'+t;}).join(' ')||'—')+'</div>'
        +'<button class="btn '+(has?'btn-ghost':'btn-primary')+' btn-sm" style="width:100%" '+((has||p.demo)?'disabled':'')
          +' onclick="selectRefToMood('+jstr(r.id||key)+')">'+(has?'已在情绪板':'加入情绪板')+'</button></div>';
    }).join('')+'</div></div>';
}
function selectRefToMood(refId){
  const p=cur(); if(!p) return;
  if(p.demo){ toast('示例项目只读，请点「复制为我的项目」后再修改'); return; }
  const r=(p.refs||[]).filter(function(x){return x&&(x.id===refId||x.key===refId);})[0];
  if(!r) return;
  const key=String(r.key||'');
  if((p.mood||[]).some(function(m){return m.type==='image'&&m.content===key;})){ toast('该图已在情绪板'); return; }
  let ok=false;
  updateCur(pp=>{
    if((pp.mood||[]).some(function(m){return m.type==='image'&&m.content===key;})) return;
    pp.mood.push({id:uid(),type:'image',content:key,tag:(r.tags&&r.tags[0])||'',tags:(r.tags||[]).slice(),fav:false});
    ok=true;                       // 沿用 refs 已有 tags，不改 tagVocab
  });
  if(ok) toast('已加入情绪板');
  renderProject();
}

/* ---- 分镜（中枢） ---- */
let selRefs=[];
function shotSortKey(s){ return (s.date||'9999')+'|'+(s.ord!=null?'o'+String(s.ord).padStart(6,'0'):'s'+(s.slot||'99:99')); }
async function renderShots(p){
  if(!p) return;
  const focusSnap=snapshotFocus();          // 异步等待后重绘，恢复输入焦点（如空闲同步触发时正在打字）
  view.shotDraft=view.shotDraft||{}; const D=view.shotDraft;
  /* v10 多日拍摄：日期改为拍摄日下拉（Day N · MM-DD）+「＋ 新日期…」；默认取首个拍摄日或今天 */
  const days=shootDatesOf(p);
  const fallbackDay=p.shootDate||days[0]||todayStr();
  const curDay=(D.date!=null&&D.date!=='')?D.date:fallbackDay;
  const dayOpts=(days.indexOf(curDay)>=0?days.slice():days.concat([curDay]).sort());
  await ensureShiseiRefs(p);
  /* v10.4：分镜参考图 picker 从参考图库 p.refs 派生（不再依赖情绪板；上传图默认只进 refs） */
  const moodImgs=(p.refs||[]).map(r=>({id:r.id,type:'image',content:r.key,tags:r.tags||[],fav:!!r.fav}))
    .filter(m=>matchByTags(m,view.moodFilter,view.moodFilterMode));
  let gallery=[];
  try{ gallery=await idb.shiseiIndex(); }catch(e){ gallery=[]; }
  const cats=[...new Set(gallery.map(r=>r.cat).filter(Boolean))];
  const galleryRows=view.poseCat?gallery.filter(r=>r.cat===view.poseCat):[];
  const editing=p.shots.find(x=>x.id===view.editingShotId);
  const selRefsBar=!editing&&selRefs.length?'<div class="selrefs"><span class="muted">已选参考图（'+selRefs.length+'/3）</span>'
    +selRefs.map((key,i)=>'<span class="sr"><img src="'+esc(imgCache[key]||'')+'" alt="参考图 '+(i+1)+'"><i>'+(i+1)+'</i>'
      +'<button title="取消选择" onclick="removeSelRef('+i+')">×</button></span>').join('')
    +'<button class="btn btn-ghost btn-sm" onclick="clearSelRefs()">清空选择</button></div>':'';
  const editBar=editing?'<div class="edit-bar"><span>正在编辑「'+esc(editing.name)+'」的参考图 — '+(view.replaceIdx>=0?'点击下方图片替换第 '+(view.replaceIdx+1)+' 张，点一张即完成。':'可连续点选添加（当前 '+((editing.refIds||[]).length)+'/3 张），再点已选可取消；完成后点「完成」。')+'</span><button class="btn btn-primary btn-sm" onclick="exitShotRefEditor()">完成</button></div>':'';
  const mineHead='<div class="ref-group-head"><span>我的素材</span><div class="chips">'
    +'<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'s_img\').click()">上传图片</button>'
    +'<input type="file" id="s_img" accept="image/*" multiple style="display:none" onchange="addShotImg(event)">'
    +'<span class="muted" style="margin-left:2px">一次最多 3 张</span></div></div>';
  const mineHtml='<div class="ref-group">'+mineHead
    +(moodImgs.length?'<div class="ref-picker">'
      +moodImgs.map(m=>
        '<div class="ref-opt '+(selRefs.includes(m.content)?'on':'')+'" title="'+esc(tagsForDisplay(m).join(' / '))+'" onclick="toggleRef('+jstr(m.content)+')"><img src="'+esc(imgCache[m.content]||'')+'">'
        +(tagsForDisplay(m).length?'<span class="ref-tag">'+tagsForDisplay(m).map(t=>'#'+esc(t)).join(' ')+'</span>':'')
        +(selRefs.includes(m.content)?'<span class="ord">'+(selRefs.indexOf(m.content)+1)+'</span>':'')+'</div>').join('')
      +'<span class="muted" style="align-self:center">点击选参考图（最多 3 张）</span></div>'
      :'<p class="muted" style="margin:6px 2px">'+(view.moodFilter.length?'没有素材命中所选标签，可清空筛选或直接上传。':'还没有图片素材。可直接「上传图片」，或到情绪板 / 姿势图库获取。')+'</p>')
    +'</div>';
  const galleryHead='<div class="ref-group-head"><span>姿势图库</span><div class="chips">'
    +cats.map(c=>'<button class="chip '+(view.poseCat===c?'on':'')+'" onclick="setShiseiCat('+jstr(c)+')">'+esc(c)+'</button>').join('')
    +(gallery.length?'<span class="muted" style="margin-left:2px">'+gallery.length+' 张</span>':'')+'</div></div>';
  const galleryHtml=!gallery.length?'<div class="ref-group">'+galleryHead+'<p class="muted" style="margin:6px 2px">图库尚未同步。到下方「素材来源」开启姿势图库同步，空闲时会自动下载到本机。</p></div>'
    :!view.poseCat?'<div class="ref-group">'+galleryHead+'<p class="muted" style="margin:6px 2px">点击上方分类查看对应姿势参考图，再点一次收起。</p></div>'
    :!galleryRows.length?'<div class="ref-group">'+galleryHead+'<p class="muted" style="margin:6px 2px">该分类暂无图片。</p></div>'
    :'<div class="ref-group">'+galleryHead+'<div class="ref-picker">'+galleryRows.map(r=>
        '<div class="ref-opt '+(selRefs.includes(r.key)?'on':'')+'" data-shisei-key="'+esc(r.key)+'" title="'+esc(r.zh+' · '+r.cat)+'" onclick="toggleRef('+jstr(r.key)+')">'
        +'<img src="'+esc(imgCache[r.key]||'')+'" alt="'+esc(r.zh)+'">'
        +'<span class="ref-tag">#'+esc(r.cat)+' · '+esc(r.zh)+'</span>'
        +(selRefs.includes(r.key)?'<span class="ord">'+(selRefs.indexOf(r.key)+1)+'</span>':'')+'</div>').join('')
      +'<span class="muted" style="align-self:center">图库引用同样最多 3 张</span></div></div>';
  document.getElementById('tabBody').innerHTML=(editBar?'<div class="card" style="padding:14px 18px">'+editBar+'</div>':'')
    +'<div class="card"><h2>分镜表 · 数据中枢</h2>'
    +'<p class="muted" style="margin-bottom:12px">每条分镜可挂 1-3 张参考图（我的素材 + 姿势图库）+ 场景 + 机位 + 光线。分镜按顺序自动排入日程，无需手填时间；拖动左侧手柄排序，拖到另一日期分组会自动改期。</p>'
    +'<div class="row" style="margin-bottom:6px">'
    +'<input id="s_name" class="grow" placeholder="分镜内容，如：巷口逆光回眸（中景）" value="'+esc(D.name||'')+'" oninput="saveShotDraft(\'name\',this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addShot();}">'
    +'<select id="s_date" style="max-width:180px" onchange="pickShotDate(this.value)">'
      +dayOpts.map(function(d){
        const gi=days.indexOf(d);
        return '<option value="'+d+'" '+(curDay===d?'selected':'')+'>'+(gi>=0?'Day '+(gi+1)+' · ':'Day – · ')+mmdd(d)+'</option>';
      }).join('')
      +'<option value="__new" '+(curDay==='__new'?'selected':'')+'>＋ 新日期…</option></select>'
    +'<select id="s_dur" style="max-width:105px" onchange="saveShotDraft(\'duration\',this.value)">'+[10,15,20,30,45,60,90].map(d=>'<option value="'+d+'" '+((+D.duration||10)===d?'selected':'')+'>'+d+' 分钟</option>').join('')+'</select>'
    +'<select id="s_scene" style="max-width:150px" onchange="pickShotScene(this.value)">'
      +'<option value="">'+(p.scenes.length?'— 场景 —':'还没有场景，点「＋ 新建场景」添加')+'</option>'
      +p.scenes.map(s=>'<option value="'+esc(s.id)+'" '+(D.scene===s.id?'selected':'')+'>'+esc(s.name)+'</option>').join('')
      +'<option value="__new" '+(D.scene==='__new'?'selected':'')+'>＋ 新建场景…</option></select>'
    +'<select id="s_pos" style="max-width:108px" onchange="saveShotDraft(\'position\',this.value)"><option value="">— 机位 —</option>'+POSITION_OPTS.map(o=>'<option value="'+o+'" '+(D.position===o?'selected':'')+'>'+o+'</option>').join('')+'</select>'
    +'<select id="s_light" style="max-width:108px" onchange="saveShotDraft(\'light\',this.value)"><option value="">— 光线 —</option>'+LIGHT_OPTS.map(o=>'<option value="'+o+'" '+(D.light===o?'selected':'')+'>'+o+'</option>').join('')+'</select>'
    +'<input id="s_note" class="grow" placeholder="补充描述（姿势 / 构图 / 道具…）" value="'+esc(D.note||'')+'" oninput="saveShotDraft(\'note\',this.value)">'
    +'<button class="btn btn-ghost btn-sm" id="openFavBtn" title="打开与当前页面相关的收藏并引用" onclick="openFavPicker()">☆ 打开收藏</button>'
    +'<button class="btn btn-primary" onclick="addShot()">添加分镜</button></div>'
    +(curDay==='__new'
      ?'<div class="new-scene"><span class="muted">新拍摄日</span>'
        +'<input type="date" id="new_shot_date" value="'+esc(addDays(days[days.length-1]||p.shootDate||todayStr(),1))+'">'
        +'<button class="btn btn-primary btn-sm" onclick="confirmNewShotDate()">加入并选中</button>'
        +'<button class="btn btn-ghost btn-sm" onclick="cancelNewShotDate()">取消</button></div>'
      :'')
    +(D.scene==='__new'
      ?'<div class="new-scene"><span class="muted">新建场景</span>'
        +'<input id="new_scene_name" placeholder="场景名称，如：老门东巷口" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addSceneInline();}">'
        +'<button class="btn btn-primary btn-sm" onclick="addSceneInline()">添加并选中</button>'
        +'<button class="btn btn-ghost btn-sm" onclick="cancelSceneInline()">取消</button></div>'
      :'')
    +selRefsBar
    +(mineHtml||galleryHtml?'':'<p class="muted" style="margin-bottom:10px">还没有任何参考图来源。上传图片、到情绪板添加，或在下方「素材来源」开启姿势图库同步。</p>')
    +mineHtml+galleryHtml
    +'<div class="row" style="margin-bottom:12px"><input id="s_filter" class="grow" placeholder="搜索分镜 / 场景 / 备注…" value="'+esc(view.shotFilter)+'" oninput="setShotFilter(this.value)">'
      +'<button class="btn btn-ghost btn-sm" id="reschedAllBtn" title="对所有拍摄日统一重排一次（复制 / 调整完成后点此）" onclick="rescheduleAllDays()">↻ 重新排程</button></div>'
    +'<div id="shotListWrap">'+shotListHtml(p,days)+'</div></div>';
  galleryRows.forEach(r=>ensureShiseiImage(r.key));
  attachDrag();
  restoreFocus(focusSnap);
}
/* 分镜搜索：防抖 + 只重绘 #shotListWrap，表单与搜索框不动，焦点不丢 */
let shotFilterTimer=null;
function setShotFilter(v){
  view.shotFilter=v;
  clearTimeout(shotFilterTimer);
  shotFilterTimer=setTimeout(function(){
    const p=cur(), host=document.getElementById('shotListWrap');
    if(!p||!host) return;
    host.innerHTML=shotListHtml(p,shootDatesOf(p));
  },160);
}
/* 全量重绘前记录输入焦点（如空闲同步触发重绘时正在打字），绘完恢复 */
function snapshotFocus(){
  const a=document.activeElement;
  if(!a||!a.id||!a.closest('#tabBody')&&!a.closest('#app')) return null;
  const tag=(a.tagName||'').toLowerCase();
  if(tag!=='input'&&tag!=='textarea') return null;
  if(a.type==='file') return null;
  return {id:a.id,ss:a.selectionStart,se:a.selectionEnd};
}
function restoreFocus(snap){
  if(!snap) return;
  const el=document.getElementById(snap.id);
  if(el){ el.focus(); try{ el.setSelectionRange(snap.ss,snap.se); }catch(e){} }
}
/* 分镜列表（含分组头 / 空状态）：renderShots 全量绘与 setShotFilter 局部刷新共用 */
function shotListHtml(p,days){
  const kw=(view.shotFilter||'').trim().toLowerCase();
  const sorted=[...p.shots].sort((a,b)=>shotSortKey(a)<shotSortKey(b)?-1:1)
    .filter(s=>!kw||(s.name||'').toLowerCase().includes(kw)||(s.note||'').toLowerCase().includes(kw)||(p.scenes.find(x=>x.id===s.sceneId)||{}).name&&(p.scenes.find(x=>x.id===s.sceneId)||{}).name.toLowerCase().includes(kw));
  const shotGroups=[];
  sorted.forEach(function(s){
    const d=s.date||'';
    let g=shotGroups[shotGroups.length-1];
    if(!g||g.date!==d){ g={date:d,items:[]}; shotGroups.push(g); }
    g.items.push(s);
  });
  /* 性能：冲突标记若逐条调用 dayItems() 会是 O(N²)（每天全量重排一次）。
     这里按分组日期一次性计算，构建 shotId→conflict 查表，把复杂度降为 O(天数 + N)。 */
  const conflictMap={};
  shotGroups.forEach(function(g){
    dayItems(p,g.date).forEach(function(it){ if(it._conflict) conflictMap[it.id]=true; });
  });
  return (sorted.length? '<div id="shotList">'+shotGroups.map(function(g){
        const gi=days.indexOf(g.date);
        const mins=g.items.reduce(function(n,x){ return n+(+x.duration||0); },0);
        const ghead=(g.date?('Day '+(gi>=0?gi+1:'–')+' · '+mmdd(g.date)):'未定日期')
          +'（'+g.items.length+' 条 · 合计 '+mins+' 分钟）';
        return '<div class="day-group"><div class="day-head">'+esc(ghead)+'</div>'+g.items.map(function(s){
        const scene=p.scenes.find(x=>x.id===s.sceneId);
        const clash=!!conflictMap[s.id];
        const refs=s.refIds||[];
        const refHtml=refs.length? refs.map((r,ri)=>{
            const img=imgCache[r];
            const inner=img?'<img src="'+esc(img)+'">':'<div class="noref">图库原图已更新</div>';
            return '<div class="ref-thumb'+(img?'':' ghost')+'" title="点击查看大图" onclick="openRefViewer('+jstr(s.id)+','+ri+')">'+inner
              +'<button class="ref-del" title="从本分镜移除该参考图" onclick="event.stopPropagation();removeShotRef('+jstr(s.id)+','+ri+')">×</button></div>';
          }).join('')
          :'<button class="noref-add" onclick="openShotRefEditor('+jstr(s.id)+')">+ 添加参考图</button>';
        const editingThis=view.editingShotEditId===s.id;    // v10：行内编辑文字（与参考图选图态 editingShotId 正交）
        const meta=[s.date||'未定','约 '+(+s.duration||10)+' 分钟',
          scene?scene.name:'',s.position||'',s.light||'',s.note||''].filter(Boolean).join(' · ');
        const body=editingThis
          ? shotEditPanel(s,p)
          :'<div class="grow" style="min-width:150px"><div class="'+(s.done?'done-text':'')+'" style="font-weight:600">'+esc(s.name)+(clash?' <span class="tag red">时间重叠</span>':'')+'</div>'
            +'<div class="muted" style="font-size:12px;margin-top:2px">'+esc(meta)+'</div></div>';
        return '<div class="shot '+(s.done?'done':'')+(editingThis?' editing':'')+'" data-id="'+esc(s.id)+'" data-fid="'+esc(s.id)+'">'
          +'<span class="drag-handle" title="拖拽排序"><svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></svg></span>'
          +'<button class="chk '+(s.done?'on':'')+'" onclick="toggleShot('+jstr(s.id)+')">'+(s.done?'✓':'')+'</button>'
          +'<div class="refs">'+refHtml+'</div>'
          +body
          +'<button class="rowbtn'+(isFav(s)?' on':'')+'" title="收藏/取消收藏" onclick="toggleFav(\'shots\','+jstr(s.id)+')">'+(isFav(s)?'★':'☆')+'</button>'
          +'<button class="rowbtn" title="复制分镜（时间顺延 '+COPY_SHIFT_MIN+' 分钟）" onclick="copyShot('+jstr(s.id)+')">⧉复制</button>'
          +editBtn('Shot',s.id)
          +'<button class="iconbtn" title="删除分镜" onclick="delShot('+jstr(s.id)+')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>';
        }).join('')+'</div>'; }).join('')+'</div>' : '<p class="muted">'+(kw?'没有匹配的分镜。':'还没有分镜。添加第一条，把素材挂上来。')+'</p>');
}
/* v10.8.0：复制分镜——完整复制原分镜（含参考图 / 场景 / 时长 / 机位 / 光线 / 备注），
   时间字段统一 +5 分钟；新记录 id 重置、done/fav 清零、ord 紧随原分镜之后。
   刻意不调用 applyDay：slot 是本条的排程结果，若重排会被 chain 覆盖、失去「+10 分钟」语义，
   且会在用户调整中途打断编辑；用户调完后点工具区「↻ 重新排程」再一次性整体重排。
   与原分镜的时长重叠属预期（+10 分钟落在原时长内），时间轴按既有规则标「重叠」。 */
function copyShot(id){
  const p=cur(); if(!p) return;
  const s=(p.shots||[]).find(x=>x.id===id); if(!s) return;
  const newId=uid();
  let ok=false;
  updateCur(pp=>{
    const idx=pp.shots.findIndex(x=>x.id===id);
    if(idx<0) return;
    const clone=shiftTimeFields(s,COPY_SHIFT_MIN);
    clone.id=newId; clone.done=false; clone.fav=false;
    clone.ord=(+s.ord||0)+1;
    /* 原 ord 之后的兄弟顺移一位，保证新分镜紧随其后且列表顺序稳定 */
    pp.shots.forEach((x,i)=>{ if(i!==idx&&(+x.ord||0)>=(+s.ord||0)+1) x.ord=(+x.ord||0)+1; });
    pp.shots.splice(idx+1,0,clone);
    ok=true;
  });
  if(!ok) return;
  toast('已复制「'+String(s.name||'分镜').slice(0,12)+'」，时间顺延 '+COPY_SHIFT_MIN+' 分钟；调整完成后点「↻ 重新排程」',6000);
  renderProject();
}
/* v10.8.1：整体重排——对每个拍摄日各跑一次 applyDay（含自动跨日），把复制 / 手动调整后的
   slot 交给排程引擎统一派生。只在用户主动点击时执行，绝不自动触发，避免打断编辑。 */
function rescheduleAllDays(){
  const p=cur(); if(!p){ return; }
  if(p.demo&&!view.allowDemoWrite){ toast('示例项目只读，请点「复制为我的项目」后再重排'); return; }
  const dates=(Array.isArray(p.shootDates)?p.shootDates.slice():[]);
  (p.shots||[]).forEach(s=>{ if(s.date&&dates.indexOf(s.date)<0) dates.push(s.date); });
  if(!dates.length){ toast('还没有拍摄日，无需重排'); return; }
  let plan=null;
  updateCur(pp=>{
    dates.forEach(d=>{ const one=applyDay(pp,d,null); if(one){ plan=plan||one; plan.shiftedCount=(plan.shiftedCount||0)+(one.shiftedCount||0); } });
  });
  if(!plan) return;
  toastResched(plan,dates.length);
  renderProject();
}
function setShiseiCat(cat){ view.poseCat=(view.poseCat===cat)?null:String(cat||null); renderShots(cur()); }
function removeSelRef(i){ if(i>=0&&i<selRefs.length){ selRefs.splice(i,1); renderShots(cur()); } }
function clearSelRefs(){ selRefs=[]; renderShots(cur()); }
function saveShotDraft(k,v){ view.shotDraft=view.shotDraft||{}; view.shotDraft[k]=v; }
/* v10 多日拍摄：分镜表单的拍摄日下拉 */
function pickShotDate(v){ saveShotDraft('date',v); renderShots(cur()); }
function confirmNewShotDate(){
  const el=document.getElementById('new_shot_date');
  const d=(el?el.value:'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){ toast('请选择有效日期'); return; }
  let ok=false;
  updateCur(p=>{ addShootDate(p,d); ok=true; });
  if(!ok) return;
  saveShotDraft('date',d);
  toast('已加入拍摄日 '+mmdd(d));
  renderShots(cur());
}
function cancelNewShotDate(){ saveShotDraft('date',''); renderShots(cur()); }
/* v10：分镜场景下拉的「＋ 新建场景…」行内入口（不写 tagVocab，与素材标签词表解耦） */
function pickShotScene(v){ saveShotDraft('scene',v); renderShots(cur()); }
function addSceneInline(){
  const el=document.getElementById('new_scene_name');
  const name=(el?el.value:'').trim();
  if(!name){ toast('场景名称不能为空'); return; }
  const id=uid();
  let ok=false;
  updateCur(p=>{ p.scenes.push({id:id,name:name,note:'',done:false,fav:false}); ok=true; });
  if(!ok) return;                       // demo 只读：updateCur 已提示
  saveShotDraft('scene',id);            // 新建后自动选中
  toast('已新建场景「'+name+'」并选中');
  renderShots(cur());
}
function cancelSceneInline(){ saveShotDraft('scene',''); renderShots(cur()); }
/* v10：分镜行内编辑（6 项，不含日期时间） */
/* 分镜行内编辑面板：分镜页与日程页共用同一套元素 id 与保存逻辑，保证两处编辑同源同步 */
function shotEditPanel(s,p){
  const dur=[10,15,20,30,45,60,90].map(d=>'<option value="'+d+'" '+((+s.duration||10)===d?'selected':'')+'>'+d+' 分钟</option>').join('');
  return '<div class="shot-edit">'
    +'<div class="se-fld"><label>分镜内容</label><input id="esh_name" value="'+esc(s.name)+'" placeholder="如：巷口逆光回眸（中景）"></div>'
    +'<div class="se-grid">'
    +'<div class="se-fld"><label>时长</label><select id="esh_dur">'+dur+'</select></div>'
    +'<div class="se-fld"><label>场景</label><select id="esh_scene"><option value="">— 未指定 —</option>'
      +(p.scenes||[]).map(x=>'<option value="'+x.id+'" '+(s.sceneId===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div>'
    +'<div class="se-fld"><label>机位</label><select id="esh_pos"><option value="">— 未指定 —</option>'
      +POSITION_OPTS.map(o=>'<option value="'+o+'" '+(s.position===o?'selected':'')+'>'+o+'</option>').join('')+'</select></div>'
    +'<div class="se-fld"><label>光线</label><select id="esh_light"><option value="">— 未指定 —</option>'
      +LIGHT_OPTS.map(o=>'<option value="'+o+'" '+(s.light===o?'selected':'')+'>'+o+'</option>').join('')+'</select></div>'
    +'</div>'
    +'<div class="se-fld"><label>备注</label><input id="esh_note" value="'+esc(s.note||'')+'" placeholder="姿势 / 构图 / 道具 / 注意事项…"></div>'
    +'<div class="se-actions">'
    +'<button class="btn btn-ghost btn-sm" onclick="cancelShotEdit()">取消</button>'
    +'<button class="btn btn-primary btn-sm" onclick="saveShotEdit('+jstr(s.id)+')">保存修改</button>'
    +'</div></div>';
}
function saveShotEdit(id){
  const el=document.getElementById('esh_name');
  const name=(el?el.value:'').trim();
  if(!name){ toast('分镜内容不能为空'); return; }
  const durEl=document.getElementById('esh_dur'), scEl=document.getElementById('esh_scene');
  const posEl=document.getElementById('esh_pos'), liEl=document.getElementById('esh_light'), ntEl=document.getElementById('esh_note');
  const patch={name:name,
    duration:parseInt(durEl?durEl.value:'',10)||SHOT_DEFAULT_MIN,
    sceneId:scEl?scEl.value:'', position:posEl?posEl.value:'', light:liEl?liEl.value:'',
    note:(ntEl?ntEl.value:'').trim()};
  let plan=null;
  updateCur(p=>{
    const s=p.shots.find(x=>x.id===id); if(!s) return;
    Object.assign(s,patch);
    plan=applyDay(p,s.date||'',null);        // 时长/内容变化后重排当天分镜
  });
  clearInlineEditState(view); toastResched(plan); renderProject();   // 先记 lastShift 再重绘，「已顺延」才能当次生效
}
function cancelShotEdit(){
  if(!view.editingShotEditId) return false;
  clearInlineEditState(view); renderProject(); return true;
}
/* 参考图选图态：新增模式用 selRefs；编辑模式 view.editingShotId 指向目标分镜，replaceIdx>=0 表示替换该位置 */
function toggleRef(id){
  if(view.editingShotId){
    /* 更换模式：点一张即替换该下标并退出；添加模式：可连续点选最多 3 张，直到点「完成」 */
    const replacing=view.replaceIdx>=0;
    let done=false, full=false, changed=false;
    updateCur(p=>{
      const s=p.shots.find(x=>x.id===view.editingShotId); if(!s){ view.editingShotId=null; view.replaceIdx=-1; return; }
      s.refIds=s.refIds||[];
      if(replacing){
        if(s.refIds[view.replaceIdx]===id){ view.editingShotId=null; view.replaceIdx=-1; return; }
        s.refIds[view.replaceIdx]=id; view.editingShotId=null; view.replaceIdx=-1; done=true; changed=true;
        return;
      }
      const i=s.refIds.indexOf(id);
      if(i>=0){ s.refIds.splice(i,1); changed=true; }
      else if(s.refIds.length>=3){ full=true; }
      else { s.refIds.push(id); changed=true; }
    });
    if(full) toast('每条分镜最多挂 3 张参考图');
    else if(changed) toast(replacing?'已更换该参考图':'已添加，可继续点选，完成后点「完成」');
    renderShots(cur());
    return;
  }
  const i=selRefs.indexOf(id);
  if(i>=0) selRefs.splice(i,1);
  else { if(selRefs.length>=3){toast('每条分镜最多选 3 张参考图');return;} selRefs.push(id); }
  renderShots(cur());
}
function openShotRefEditor(shotId){
  view.editingShotId=shotId; view.replaceIdx=-1;
  renderShots(cur()).then(()=>{ const el=document.getElementById('tabBody'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); });
}
function exitShotRefEditor(){ view.editingShotId=null; view.replaceIdx=-1; renderShots(cur()); }
function removeShotRef(shotId,idx){
  updateCur(p=>{ const s=p.shots.find(x=>x.id===shotId); if(s&&s.refIds) s.refIds.splice(idx,1); });
  closeRefViewer(); renderShots(cur()); toast('已从本分镜移除该参考图');
}
/* 参考图大图查看：点击分镜缩略图打开；支持「更换」进入选图态 */
function openRefViewer(shotId,ri){
  const p=cur(); const s=p&&p.shots.find(x=>x.id===shotId); if(!s||!s.refIds||!s.refIds[ri]) return;
  const n=s.refIds.length, idx=((ri%n)+n)%n, r=s.refIds[idx], img=imgCache[r];
  const isSh=String(r||'').startsWith('shisei:');
  view.refViewer={shotId:shotId,ri:idx};
  document.getElementById('refViewerBody').innerHTML=
    '<div class="rv-title">'+esc(s.name)+' · 第 '+(idx+1)+' / '+n+' 张</div>'
    +(img?'<img class="rv-img" src="'+esc(img)+'" alt="参考图大图">'
         :'<div class="rv-placeholder">'+(isSh?'图库原图已更新，可「更换」为其它参考图或移除。':'原图缺失，可「更换」或移除。')+'</div>')
    +'<div class="row" style="justify-content:center;margin-top:16px">'
    +'<button class="btn btn-ghost btn-sm" onclick="refNav(-1)">‹ 上一张</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="refNav(1)">下一张 ›</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="closeRefViewer();openShotRefEditor('+jstr(shotId)+');view.replaceIdx='+idx+'">更换这张</button>'
    +'<button class="btn btn-danger btn-sm" onclick="removeShotRef('+jstr(shotId)+','+idx+')">从分镜移除</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="closeRefViewer()">关闭</button></div>';
  document.getElementById('refViewer').classList.add('show');
}
function refNav(delta){
  const v=view.refViewer; if(!v) return;
  const p=cur(), s=p&&p.shots.find(x=>x.id===v.shotId); if(!s||!s.refIds||!s.refIds.length){ closeRefViewer(); return; }
  openRefViewer(v.shotId,(v.ri+delta+s.refIds.length)%s.refIds.length);
}
function closeRefViewer(){ view.refViewer=null; document.getElementById('refViewer').classList.remove('show'); }
async function addShotImg(e){
  const current=cur();
  if(current&&current.demo){
    try{ e.target.value=''; }catch(err){}
    toast('示例项目只读，请点「复制为我的项目」后再修改'); return;
  }
  const files=parseMultiImage(e);
  try{ e.target.value=''; }catch(err){}
  if(!files.length) return;
  const editingId=view.editingShotId, rIdx=view.replaceIdx;
  const okIds=[], failN=[];
  for(const f of files){
    const id=await ingestImageFile(f,[],true);
    if(id) okIds.push(id); else failN.push(1);
  }
  if(!okIds.length){ toast('本次 '+files.length+' 张图片均处理失败，可重试'); renderShots(cur()); return; }
  let hung=0;
  if(editingId){
    updateCur(p=>{
      const s=p.shots.find(x=>x.id===editingId); if(!s) return;
      s.refIds=s.refIds||[];
      if(rIdx>=0&&rIdx<s.refIds.length){ s.refIds[rIdx]=okIds[0]; hung=1; }
      else {
        const need=Math.max(0,3-s.refIds.length);
        okIds.slice(0,need).forEach(id=>{ if(!s.refIds.includes(id)){ s.refIds.push(id); hung++; } });
      }
      view.editingShotId=null; view.replaceIdx=-1;
    });
  } else {
    const need=Math.max(0,3-selRefs.length);
    okIds.slice(0,need).forEach(id=>{ if(!selRefs.includes(id)){ selRefs.push(id); hung++; } });
  }
  const only=okIds.length-hung;
  toast('已存入参考图库 '+okIds.length+' 张，挂到分镜 '+hung+' 张'+(only?'，仅入库 '+only+' 张':'')+(failN.length?'，失败 '+failN.length+' 张':''));
  renderShots(cur());
}
function addShot(){
  const name=gv('s_name').trim(); if(!name){toast('分镜内容不能为空');return;}
  const d=gv('s_date');
  if(!d||d==='__new'){ toast('请先选择或新建拍摄日'); return; }
  const dur=parseInt(gv('s_dur'),10)||SHOT_DEFAULT_MIN;
  const sc=gv('s_scene'), pos=gv('s_pos')||'', light=gv('s_light')||'', note=gv('s_note').trim();
  let plan=null;
  ensureShootDate(d);                  // 该日首次产生内容 → 登记为拍摄日（切换查看不登记）
  updateCur(p=>{
    const sameDay=p.shots.filter(x=>(x.date||'')===d);
    const ord=sameDay.length?Math.max(...sameDay.map(x=>x.ord||0))+1:0;
    p.shots.push({id:uid(),name:name,date:d,duration:dur,
      sceneId:(sc&&sc!=='__new')?sc:'',position:pos,light:light,
      refIds:[...selRefs].slice(0,3),note:note,done:false,ord:ord,fav:false});
    plan=applyDay(p,d,null);      // 落库即重排：slot 由排程引擎派生（不写死时间）
  });
  selRefs=[]; view.shotDraft={}; if(view.editingShotEditId) view.editingShotEditId=null;
  toastResched(plan); renderProject();
}

/* 拖拽排序（桌面 + 触屏，Pointer Events） */
function attachDrag(){
  const list=document.getElementById('shotList'); if(!list) return;
  list.querySelectorAll('.drag-handle').forEach(h=>{
    h.addEventListener('pointerdown',e=>{
      const dragEl=h.closest('.shot'); const startY=e.clientY; let active=false;
      h.setPointerCapture(e.pointerId);
      const move=ev=>{
        if(!active && Math.abs(ev.clientY-startY)>6){ active=true; dragEl.classList.add('dragging'); }
        if(!active) return;
        list.querySelectorAll('.shot').forEach(s=>s.classList.remove('drop-before','drop-after'));
        const t=document.elementFromPoint(ev.clientX,ev.clientY);
        const target=t&&t.closest?t.closest('.shot'):null;
        if(target&&target!==dragEl){
          const r=target.getBoundingClientRect();
          const after=(ev.clientY-r.top)>r.height/2;
          target.classList.add(after?'drop-after':'drop-before');
          dragEl._drop={el:target,after};
        } else dragEl._drop=null;
      };
      const up=()=>{
        h.removeEventListener('pointermove',move);
        h.removeEventListener('pointerup',up);
        h.removeEventListener('pointercancel',up);
        const info=dragEl._drop;
        if(active&&info){
          if(info.after) info.el.after(dragEl); else info.el.before(dragEl);
          persistOrder(list,dragEl.dataset.id);
        } else {
          list.querySelectorAll('.shot').forEach(s=>s.classList.remove('dragging','drop-before','drop-after'));
        }
      };
      h.addEventListener('pointermove',move);
      h.addEventListener('pointerup',up);
      h.addEventListener('pointercancel',up);
    });
  });
}
function persistOrder(list,draggedId){
  const ids=[...list.querySelectorAll('.shot')].map(el=>el.dataset.id);
  let adopted=null;                                               // 目标日期（跨日拖拽时才有值），回调外要用
  updateCur(p=>{
    const byId={}; p.shots.forEach(s=>byId[s.id]=s);
    const i=ids.indexOf(draggedId);
    let adopt=null;
    if(i<ids.length-1) adopt=byId[ids[i+1]].date;
    else if(i>0) adopt=byId[ids[i-1]].date;
    const before=byId[draggedId]?(byId[draggedId].date||''):'';   // 改期前必须取，改完再取就丢了
    if(adopt!=null&&adopt!=='') byId[draggedId].date=adopt;
    const counters={};
    ids.forEach(id=>{ const s=byId[id]; if(!s) return; const d=s.date||''; counters[d]=(counters[d]||0); s.ord=counters[d]++; });
    applyDay(p,before,null);                                     // 原日期重排
    applyDay(p,(adopt!=null&&adopt!=='')?adopt:before,null);      // 新日期重排（同一天时幂等）
    adopted=(adopt!=null&&adopt!=='')?adopt:null;
  });
  if(adopted) ensureShootDate(adopted);                           // 拖到未登记日期 → 该日首次有内容，登记为拍摄日
  renderProject();
}
function toggleShot(id){ updateCur(p=>{const s=p.shots.find(x=>x.id===id); if(s) s.done=!s.done;}); renderProject(); }
/* 删除分镜：立即删除（保持单击即删的习惯），toast 提供 6 秒撤销；
   撤销时按原对象放回（ord / 参考图 / 完成态原样保留），并重排当天 */
function delShot(id){
  updateCur(p=>{
    const s=p.shots.find(x=>x.id===id); if(!s) return;
    const d=s.date||'';
    p.shots=p.shots.filter(x=>x.id!==id);
    applyDay(p,d,null);      // 删除后重新紧凑排期
    toast('已删除分镜「'+summary40(s.name)+'」',6000,{label:'撤销',fn:function(){
      updateCur(pp=>{
        if(pp.shots.some(x=>x.id===s.id)) return;      // 已恢复过则不重复
        pp.shots.push(s);
        applyDay(pp,s.date||'',null);
      });
      renderProject();
    }});
  });
  renderProject();
}

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
  const plan=planDay(p,date,null);
  const inited=Array.isArray(p.dayInit)&&p.dayInit.indexOf(date)>=0;
  const drift=(p.shots||[]).some(function(s){
    if(s.date!==date) return false;
    const r=plan.shots.filter(x=>x.id===s.id)[0];
    return !!r&&s.slot!==fmtMin(r.start);
  });
  if(inited&&!drift&&dayDefaults(p,date).length===0) return;
  updateCur(function(pp){ ensureDayDefaults(pp,date); rescheduleDay(pp,date,null); });
}

/* 重排结果统一提示；被顺延的节点记进 view.lastShift，时间轴上临时显示「已顺延」（30 秒或下次重排清除） */
function toastResched(plan,allDays){
  if(!plan) return;
  const ids=(plan.nodeShifts||[]).map(function(x){return x.id;});
  view.lastShift=ids.length?{date:plan.date,ids:ids,ts:Date.now()}:null;
  if(plan.capHit){ toast('排期已跨越 7 天，请检查分镜时长'); return; }
  if(plan.overflow){ toast('排期超出当天 24:00，请缩短时长或改到另一天'); return; }
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
    return '<button class="day-tab'+(d===schedDate?' on':'')+'" onclick="setSchedDate('+jstr(d)+')">Day '+(i+1)+' · '+mmdd(d)+' '+weekdayCN(d)+'（'+cnt(d)+' 条）</button>';
  }).join('')
    +'<button class="day-tab add" onclick="toggleNewDay()">＋ 添加拍摄日</button>'
    +(days.length?'<button class="day-tab del" onclick="removeShootDay('+jstr(schedDate)+')">删除本日</button>':'')
    +'</div>';
  if(view.newDay){
    const base=days.length?days[days.length-1]:(p.shootDate||todayStr());
    h+='<div class="new-scene"><span class="muted">新拍摄日</span>'
      +'<input type="date" id="new_day_date" value="'+esc(addDays(base,1))+'">'
      +'<button class="btn btn-primary btn-sm" onclick="confirmNewDay()">添加并切换</button>'
      +'<button class="btn btn-ghost btn-sm" onclick="toggleNewDay()">取消</button></div>';
  }
  return h;
}

function renderSchedule(p){
  if(!schedDate) schedDate=p.shootDate||shootDatesOf(p)[0]||todayStr();
  autoSyncDay(schedDate);          // 首次进入某日期：补集合/收工 + 重排（有 drift 才写盘）
  const sun=sunTimes(schedDate,p.lat,p.lng);
  let sunHtml='';
  if(sun){
    sunHtml='<div class="sun-bar">'
      +'<div class="sun-pill">日出<b>'+sun.sunrise+'</b></div>'
      +'<div class="sun-pill">正午<b>'+sun.noon+'</b></div>'
      +'<div class="sun-pill">黄金时刻起<b>'+sun.goldenStart+'</b></div>'
      +'<div class="sun-pill">日落<b>'+sun.sunset+'</b></div>'
      +'<div class="sun-pill" style="background:#fdf3f1;border-color:#ecc;color:#8a3a2e">民用暮光≈<b>'+addMin(sun.sunset,30)+'</b></div>'
      +'</div><p class="muted" style="margin-top:-8px;margin-bottom:12px">按 NOAA 近似算法 + 项目坐标估算，误差几分钟，仅作排期参考。</p>';
  } else {
    sunHtml='<p class="muted" style="margin-bottom:12px">填写项目信息卡里的「纬度 / 经度」（或点城市快捷键），这里会显示当日日出、黄金时刻与日落时间。</p>';
  }
  document.getElementById('tabBody').innerHTML='<div class="card"><h2>拍摄日流程 · 时间轴</h2>'
    +sunHtml
    +dayTabsHtml(p)
    +'<div class="row" style="margin-bottom:14px"><input type="date" id="sc_date" style="max-width:170px" value="'+schedDate+'" onchange="chooseSchedDate(this.value)">'
    +'<span class="muted">点上方 Day 切换日期；选任意日期会并入拍摄日清单。集合、收工自动生成，新增环节会顺延其后环节并重排分镜</span></div>'
    +'<div class="row" style="margin-bottom:6px">'
    +'<select id="n_type" style="max-width:120px">'+NODE_TYPES.map(t=>'<option>'+t+'</option>').join('')+'</select>'
    +'<input id="n_title" class="grow" placeholder="环节内容，如：化妆师到场妆造" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addNode();}">'
    +'<input type="time" id="n_start" style="max-width:105px" value="10:00">'
    +'<input type="time" id="n_end" style="max-width:105px" value="10:30">'
    +'<input id="n_note" class="grow" placeholder="备注…">'
    +'<button class="btn btn-ghost btn-sm" id="openFavBtn" title="打开与当前页面相关的收藏并引用" onclick="openFavPicker()">☆ 打开收藏</button>'
    +'<button class="btn btn-primary" onclick="addNode()">添加环节</button></div>'
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
      if(rs!==n.start) n.start=rs;
      if(re!==n.end) n.end=re;
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
function applyDay(p,date,anchorId){ ensureDayDefaults(p,date); return rescheduleDay(p,date,anchorId); }

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
/* 级联顺延：被点事项及其后所有事项后移，后一项不早于前一项结束
   ⚠ v10 起 UI 不再调用本函数（拍摄日「整日顺延 1 小时」改为 sdPostpone 内 +60 后重排），
     保留原实现仅供 tests/logic.test.mjs 抽取验证，勿删。 */
function cascadeShift(p,date,id,delta){
  const items=dayItems(p,date);
  const idx=items.findIndex(x=>x.id===id); if(idx<0) return 0;
  const base=items[idx]._start;
  const plan=[]; let cursor=-1;
  items.forEach(it=>{
    const dur=it._t==='shot'?Math.max(5,+it.duration||SHOT_DEFAULT_MIN):Math.max(30,it._end-it._start);
    if(it._start<base){ if(it._end>cursor) cursor=it._end; return; }
    let ns=it._start+delta;
    if(cursor>=0&&ns<cursor) ns=cursor;
    plan.push({it,ns,dur});
    cursor=ns+dur;
  });
  if(plan.some(x=>x.ns+x.dur>1440)) return -1;
  let moved=0;
  plan.forEach(({it,ns,dur})=>{
    if(it._t==='shot'){
      const s=p.shots.find(z=>z.id===it.id);
      if(s&&s.slot){ s.slot=fmtMin(ns); moved++; }
    } else {
      const n=p.schedule.find(z=>z.id===it.id);
      if(n&&n.start){ n.start=fmtMin(ns); n.end=fmtMin(ns+dur); moved++; }
    }
  });
  return moved;
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
        +'<button class="chk '+(it.done?'on':'')+'" onclick="toggleShot('+jstr(it.id)+')">'+(it.done?'✓':'')+'</button>'
        +(sdEditing?'':'<button class="rowbtn" title="编辑本分镜" onclick="beginInlineEdit(\'Shot\','+jstr(it.id)+')">✎编辑</button>')
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
        +'<button class="btn btn-primary btn-sm" onclick="saveNodeEdit('+jstr(it.id)+')">保存</button>'
        +'<button class="btn btn-ghost btn-sm" onclick="cancelInlineEdit()">取消</button></div>'
        +(autoN?'<div class="muted" style="margin-top:6px">收工时间由排程引擎接管（当天最晚结束 +15 分钟），此处只能改名称与备注。</div>':'')+'</div>'
      :'<div class="tl-body"><div class="tl-title '+(it.done?'done-text':'')+'">'+nodeTag(it.type)+' '+esc(it.title)+autoPill+cflag+shiftedFlag(it.id)+'</div>'
        +(it.note?'<div class="tl-note">'+esc(it.note)+'</div>':'')+'</div>';
    return '<div class="tl-item" data-fid="'+esc(it.id)+'"><div class="tl-time">'+esc(time)+'</div><div class="tl-dot" style="background:'+(it.type==='拍摄'?'var(--accent)':'#b4b2a9')+'"></div>'
      +body
      +'<button class="chk '+(it.done?'on':'')+'" onclick="toggleNode('+jstr(it.id)+')">'+(it.done?'✓':'')+'</button>'
      +editBtn('Node',it.id)
      +favBtn('schedule',it)
      +'<button class="iconbtn" onclick="delNode('+jstr(it.id)+')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>';
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

/* ---- 清单（场景/服化道/器材） ---- */
function renderStuff(p){
  /* 空状态分区块给出下一步引导，而不是干瘪的「暂无」 */
  const EMPTY_HINT={scenes:'还没有场景。先把候选地点记下来，分镜里可以直接引用场景。',
    items_s:'还没有服化道。列出来，拍摄前才好逐项核对。',
    items_g:'还没有器材。机位定了就写进来，避免当天缺件。'};
  const section=(title,key,arr,ph,ek)=>{
    return '<div class="card"><h2>'+title+'</h2>'
      +'<div class="row" style="margin-bottom:10px"><input id="f_'+key+'" class="grow" placeholder="'+ph+'" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addStuff(\''+key+'\');}"><input id="fn_'+key+'" class="grow" placeholder="备注…"><button class="btn btn-primary btn-sm" onclick="addStuff(\''+key+'\')">添加</button></div>'
      +(arr.length?arr.map(it=>{
        const editing=view.editingStuffId===it.id&&view.editingStuffKey===key;
        const body=editing
          ?'<div class="inline-edit grow"><div class="row"><input id="es_name" class="grow" value="'+esc(it.name)+'">'
            +'<input id="es_note" class="grow" value="'+esc(it.note||'')+'">'
            +'<button class="btn btn-primary btn-sm" onclick="saveStuffEdit(\''+key+'\','+jstr(it.id)+')">保存</button>'
            +'<button class="btn btn-ghost btn-sm" onclick="cancelInlineEdit()">取消</button></div></div>'
          :'<span class="grow '+(it.done?'done-text':'')+'">'+esc(it.name)+'</span><span class="muted">'+esc(it.note||'')+'</span>';
        return '<div class="row" style="padding:8px 0;border-bottom:1px dashed var(--line)" data-fid="'+esc(it.id)+'">'
          +'<button class="chk '+(it.done?'on':'')+'" style="width:22px;height:22px" onclick="toggleStuff(\''+key+'\','+jstr(it.id)+')">'+(it.done?'✓':'')+'</button>'
          +body
          +editBtn('Stuff',it.id,key)
          +favBtn(key==='scenes'?'scenes':'items',it)
          +'<button class="iconbtn" onclick="delStuff(\''+key+'\','+jstr(it.id)+')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>';
      }).join(''):'<p class="muted empty-hint">'+EMPTY_HINT[ek]+'</p>')+'</div>';
  };
  document.getElementById('tabBody').innerHTML=
    section('场景选址','scenes',p.scenes,'地点名称…','scenes')
    +section('服装 / 造型 / 道具','items_s',p.items.filter(i=>i.kind!=='器材'),'物品名称（可注明类别）…','items_s')
    +section('器材需求','items_g',p.items.filter(i=>i.kind==='器材'),'器材名称…','items_g');
}
function saveStuffEdit(key,id){
  const name=gv('es_name').trim(); if(!name){ toast('名称不能为空'); return; }
  const patch={name,note:gv('es_note').trim()};
  updateCur(p=>{
    const arr=key==='scenes'?p.scenes:p.items;
    const it=arr.find(x=>x.id===id); if(it) Object.assign(it,patch);
  });
  clearInlineEditState(view); renderProject();
}
function addStuff(key){
  const name=gv('f_'+key).trim(); if(!name){toast('名称不能为空');return;}
  const note=gv('fn_'+key).trim();
  updateCur(p=>{
    if(key==='scenes') p.scenes.push({id:uid(),name,note,done:false,fav:false});
    else p.items.push({id:uid(),kind:key==='items_g'?'器材':'服装道具',name,note,done:false,fav:false});
  }); renderProject();
}
function toggleStuff(key,id){ updateCur(p=>{const arr=key==='scenes'?p.scenes:p.items; const it=arr.find(x=>x.id===id); if(it) it.done=!it.done;}); renderProject(); }
function delStuff(key,id){ updateCur(p=>{ if(key==='scenes') p.scenes=p.scenes.filter(x=>x.id!==id); else p.items=p.items.filter(x=>x.id!==id);}); renderProject(); }

/* ---- 预算 ---- */
const CATS=['场地','人员','服装道具','器材','交通餐饮','后期','其他'];
function renderBudget(p){
  const total=p.budget.reduce((s,b)=>s+(+b.amount||0),0), paid=p.budget.filter(b=>b.paid).reduce((s,b)=>s+(+b.amount||0),0);
  document.getElementById('tabBody').innerHTML='<div class="card"><h2>预算管理</h2>'
    +'<div class="stat-cards">'
    +'<div class="stat-card"><div class="num amount-red">¥'+total.toLocaleString()+'</div><div class="lbl">总预算</div></div>'
    +'<div class="stat-card"><div class="num" style="color:var(--green)">¥'+paid.toLocaleString()+'</div><div class="lbl">已支付</div></div>'
    +'<div class="stat-card"><div class="num">¥'+(total-paid).toLocaleString()+'</div><div class="lbl">待支付</div></div></div>'
    +'<div class="row" style="margin-bottom:10px"><input id="b_item" class="grow" placeholder="费用项目…">'
    +'<select id="b_cat" style="max-width:120px">'+CATS.map(c=>'<option>'+c+'</option>').join('')+'</select>'
    +'<input type="number" id="b_amt" style="max-width:120px" placeholder="金额 ¥" min="0" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addBudget();}">'
    +'<button class="btn btn-primary btn-sm" onclick="addBudget()">添加</button></div>'
    +(p.budget.length?p.budget.map(b=>'<div class="brow" data-fid="'+esc(b.id)+'"><span class="grow">'+esc(b.item)+'</span><span class="tag">'+esc(b.cat)+'</span>'
      +'<span class="amount-red">¥'+(+b.amount).toLocaleString()+'</span>'
      +'<button class="tag '+(b.paid?'green':'red')+'" style="border:none;min-height:32px" onclick="togglePaid('+jstr(b.id)+')">'+(b.paid?'已支付':'待支付')+'</button>'
      +favBtn('budget',b)
      +'<button class="iconbtn" onclick="delBudget('+jstr(b.id)+')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>').join('')
      :'<p class="muted empty-hint">还没有预算条目。把场地、人员、器材等开销记进来，客户提案里的报价会自动汇总。</p>')
    +'</div>';
}
function addBudget(){
  const item=gv('b_item').trim(), amt=parseFloat(gv('b_amt'));
  if(!item||!(amt>0)){toast('请填写项目和有效金额');return;}
  updateCur(p=>p.budget.push({id:uid(),item,cat:gv('b_cat'),amount:amt,paid:false,fav:false})); renderProject();
}
function togglePaid(id){ updateCur(p=>{const b=p.budget.find(x=>x.id===id); if(b) b.paid=!b.paid;}); renderProject(); }
function delBudget(id){ updateCur(p=>p.budget=p.budget.filter(x=>x.id!==id)); renderProject(); }

/* ---- 备注与协作 ---- */
const NOTE_KINDS=['电话','微信','见面','其他'];
const NOTE_TAG={电话:'blue',微信:'green',见面:'purple',其他:'gray'};
function renderNotes(p){
  const t=todayStr();
  const open=p.todos.filter(x=>!x.done).length;
  const overdue=p.todos.filter(x=>!x.done&&x.due&&x.due<t).length;
  document.getElementById('tabBody').innerHTML=
    '<div class="card"><h2>待办事项 <span class="muted" style="font-weight:400">· 未完成 '+open+(overdue?'（<span style="color:var(--red)">逾期 '+overdue+'</span>）':'')+'</span></h2>'
    +'<div class="row" style="margin-bottom:12px"><input id="td_title" class="grow" placeholder="待办内容，如：给客户发提案确认报价" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addTodo();}">'
    +'<input id="td_owner" style="max-width:110px" placeholder="负责人">'
    +'<input type="date" id="td_due" style="max-width:150px">'
    +'<button class="btn btn-primary" onclick="addTodo()">添加</button></div>'
    +p.todos.map(x=>{
        const od=!x.done&&x.due&&x.due<t;
        const editing=view.editingTodoId===x.id;
        const body=editing
          ?'<div class="inline-edit grow"><div class="row">'
            +'<input id="et_title" class="grow" value="'+esc(x.title)+'">'
            +'<input id="et_owner" style="max-width:110px" value="'+esc(x.owner||'')+'">'
            +'<input type="date" id="et_due" style="max-width:150px" value="'+esc(x.due||'')+'">'
            +'<button class="btn btn-primary btn-sm" onclick="saveTodoEdit('+jstr(x.id)+')">保存</button>'
            +'<button class="btn btn-ghost btn-sm" onclick="cancelInlineEdit()">取消</button></div></div>'
          :'<span class="grow '+(x.done?'done-text':'')+'">'+esc(x.title)+'</span>'
            +(x.owner?'<span class="tag gray">'+esc(x.owner)+'</span>':'')
            +(x.due?'<span class="tag '+(od?'red':'gray')+'">'+(od?'逾期 ':'')+esc(x.due)+'</span>':'');
        return '<div class="row" style="padding:8px 0;border-bottom:1px dashed var(--line)" data-fid="'+esc(x.id)+'">'
          +'<button class="chk '+(x.done?'on':'')+'" onclick="toggleTodo('+jstr(x.id)+')">'+(x.done?'✓':'')+'</button>'
          +body
          +editBtn('Todo',x.id)
          +favBtn('todos',x)
          +'<button class="iconbtn" onclick="delTodo('+jstr(x.id)+')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>';
      }).join('')
    +(!p.todos.length?'<p class="muted">暂无待办。把「给客户发提案」「检查 SD 卡」这类事记进来，看板会汇总逾期项。</p>':'')
    +'</div>'
    +'<div class="card"><h2>沟通记录</h2>'
    +'<p class="muted" style="margin-bottom:10px">记录与客户、化妆师、场地等各方的沟通要点，按时间倒序排列。</p>'
    +'<div class="row" style="margin-bottom:12px">'
    +'<select id="nt_kind" style="max-width:100px">'+NOTE_KINDS.map(k=>'<option>'+k+'</option>').join('')+'</select>'
    +'<input id="nt_text" class="grow" placeholder="沟通要点…" onkeydown="if(event.key===\'Enter\')addNote()">'
    +'<button class="btn btn-primary" onclick="addNote()">记录</button></div>'
    +[...p.notes].sort((a,b)=>(b.ts||0)-(a.ts||0)).map(n=>{
        const d=new Date(n.ts||Date.now());
        const ds=(d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
        const editing=view.editingNoteId===n.id;
        const body=editing
          ?'<div class="inline-edit grow"><div class="row">'
            +'<select id="en_kind" style="max-width:100px">'+NOTE_KINDS.map(k=>'<option '+(n.kind===k?'selected':'')+'>'+k+'</option>').join('')+'</select>'
            +'<input id="en_content" class="grow" value="'+esc(n.content)+'">'
            +'<button class="btn btn-primary btn-sm" onclick="saveNoteEdit('+jstr(n.id)+')">保存</button>'
            +'<button class="btn btn-ghost btn-sm" onclick="cancelInlineEdit()">取消</button></div></div>'
          :'<span class="note-kind tag '+(NOTE_TAG[n.kind]||'gray')+'">'+esc(n.kind)+'</span>'
            +'<div class="grow" style="min-width:0">'+esc(n.content)+'</div>';
        return '<div class="note-item" data-fid="'+esc(n.id)+'">'+body
          +'<span class="note-time">'+ds+'</span>'
          +editBtn('Note',n.id)
          +favBtn('notes',n)
          +'<button class="iconbtn" onclick="delNote('+jstr(n.id)+')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>';
      }).join('')
    +(!p.notes.length?'<p class="muted empty-hint">还没有记录。客户改需求、确认档期这类信息随手记下来，翻案时有据可查。</p>':'')
    +'</div>';
}
function saveTodoEdit(id){
  const title=gv('et_title').trim(); if(!title){ toast('待办内容不能为空'); return; }
  const patch={title,owner:gv('et_owner').trim(),due:gv('et_due')};
  updateCur(p=>{ const x=p.todos.find(y=>y.id===id); if(x) Object.assign(x,patch); });
  clearInlineEditState(view); renderProject();
}
function saveNoteEdit(id){
  const content=gv('en_content').trim(); if(!content){ toast('沟通内容不能为空'); return; }
  const patch={kind:gv('en_kind'),content};
  updateCur(p=>{ const n=p.notes.find(x=>x.id===id); if(n) Object.assign(n,patch); });
  clearInlineEditState(view); renderProject();
}
function addTodo(){
  const title=gv('td_title').trim(); if(!title){toast('待办内容不能为空');return;}
  updateCur(p=>p.todos.push({id:uid(),title,owner:gv('td_owner').trim(),due:gv('td_due'),done:false,fav:false}));
  renderProject();
}
function toggleTodo(id){ updateCur(p=>{const x=p.todos.find(y=>y.id===id); if(x) x.done=!x.done;}); renderProject(); }
function delTodo(id){ updateCur(p=>p.todos=p.todos.filter(x=>x.id!==id)); renderProject(); }
function addNote(){
  const content=gv('nt_text').trim(); if(!content){toast('先写点内容');return;}
  updateCur(p=>p.notes.push({id:uid(),kind:gv('nt_kind'),content,ts:Date.now(),fav:false}));
  renderProject();
}
function delNote(id){ updateCur(p=>p.notes=p.notes.filter(n=>n.id!==id)); renderProject(); }

/* ================= 拍摄日模式 ================= */
let sdDate=null;
function openShootDay(){ const p=cur(); sdDate=p.shootDate||todayStr(); renderShootDay(); document.getElementById('sdOverlay').classList.add('show'); }
function closeShootDay(){ document.getElementById('sdOverlay').classList.remove('show'); renderProject(); }
function sdSetDate(d){ sdDate=d; renderShootDay(); }
async function renderShootDay(){
  const p=cur(); if(!p) return;
  autoSyncDay(sdDate);                 // 切到某日期时补齐集合/收工并重排（demo 只读自动跳过）
  await ensureShiseiRefs(p);
  const shots=p.shots.filter(s=>s.date===sdDate);
  const items=dayItems(p,sdDate);
  const done=items.filter(x=>x.done).length;
  const now=new Date(); const nowT=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const isToday=sdDate===todayStr();
  let currentId=null;
  if(isToday){ items.forEach(x=>{ if(!x.done&&(x._time||'00:00')<=nowT) currentId=x.id; }); if(!currentId){ const nxt=items.find(x=>!x.done); if(nxt) currentId=nxt.id; } }
  const sun=sunTimes(sdDate,p.lat,p.lng);
  let h='<div class="sd-head"><h2>'+esc(p.name)+'</h2>'
    +'<button class="sd-nav" onclick="sdShift(-1)" title="前一天">‹</button>'
    +'<input type="date" value="'+sdDate+'" onchange="sdSetDate(this.value)" style="background:#221e18;color:#f0ebe2;border-color:#3a342b;max-width:150px">'
    +'<button class="sd-nav" onclick="sdShift(1)" title="后一天">›</button>'
    +'<button class="sd-btn" onclick="closeShootDay()">退出</button></div>'
    +'<div class="muted" style="color:#a99e8c">拍摄日模式 · 完成 '+done+'/'+items.length+'</div>'
    +'<div class="sd-progress"><i style="width:'+(items.length?done/items.length*100:0)+'%"></i></div>';
  if(sun) h+='<div class="sd-sun"><span>日出 '+sun.sunrise+'</span><span>黄金 '+sun.goldenStart+'</span><span>日落 '+sun.sunset+'</span><span>暮光 '+addMin(sun.sunset,30)+'</span></div>';
  if(!items.length){ h+='<div class="sd-empty">这一天没有安排。<br>回日程页添加流程，或切换上方日期。</div>'; }
  else{
    let lastT='';
    items.forEach(x=>{
      const time=x._t==='shot'&&x._time?x._time+' – '+fmtMin(x._end):(x._time||'未排时');
      if(time!==lastT){ lastT=time;
        h+='<div class="sd-slot">◷ '+esc(time)+(x.id===currentId?' <span class="now">当前</span>':'')+'</div>'; }
      const overdue=isToday&&!x.done&&(x._time||'00:00')<nowT&&x.id!==currentId&&x._time;
      const cflag=x._conflict?' <span class="tag red" style="border:1px solid #a32d2d">重叠</span>':'';
      if(x._t==='shot'){
        const scene=p.scenes.find(s=>s.id===x.sceneId);
        const refs=(x.refIds||[]).filter(r=>imgCache[r]||String(r||'').startsWith('shisei:'));
        h+='<div class="sd-shot '+(x.done?'done':'')+' '+(x.id===currentId?'now':'')+'">'
          +(refs.length?refs.map(r=>imgCache[r]?'<img src="'+esc(imgCache[r])+'">':'<div style="width:68px;height:68px;border-radius:9px;border:1px solid #2c2822;background:#12100c;color:#a99e8c;font-size:10px;display:flex;align-items:center;justify-content:center;text-align:center;padding:4px">图库原图已更新</div>').join(''):'')
          +'<div style="flex:1;min-width:120px"><div class="sd-name"><span class="sd-tag">分镜</span>'+esc(x.name)+cflag+'</div>'
          +'<div class="sd-meta">'+(scene?esc(scene.name)+' · ':'')+'约 '+(+x.duration||0)+' 分钟'+(x.note?' · '+esc(x.note):'')+'</div>'
          +((overdue||x._conflict)?'<button class="sd-btn" style="margin-top:8px" onclick="sdPostpone()" title="当天所有环节与分镜整体后移 1 小时，收工随之重排">⚠ 已'+(overdue?'超时':'重叠')+' · 整日顺延 1 小时</button>':'')
          +'</div>'
          +'<button class="sd-chk '+(x.done?'on':'')+'" onclick="sdToggle('+jstr(x.id)+')">✓</button></div>';
      } else {
        h+='<div class="sd-shot node '+(x.done?'done':'')+' '+(x.id===currentId?'now':'')+'">'
          +'<div style="flex:1;min-width:120px"><div class="sd-name" style="font-size:16px">'+esc(x.title)+cflag+'</div>'
          +'<div class="sd-meta">'+esc(x.type)+(x.end?' · 至 '+esc(x.end):'')+(x.note?' · '+esc(x.note):'')+'</div></div>'
          +'<button class="sd-chk sm '+(x.done?'on':'')+'" onclick="sdToggleNode('+jstr(x.id)+')">✓</button></div>';
      }
    });
  }
  document.getElementById('sdBody').innerHTML=h;
}
function sdShift(d){ const dt=new Date(sdDate+'T12:00:00'); dt.setDate(dt.getDate()+d); sdDate=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); renderShootDay(); }
function sdToggle(id){ updateCur(p=>{const s=p.shots.find(x=>x.id===id); if(s) s.done=!s.done;}); renderShootDay(); }
function sdToggleNode(id){ updateCur(p=>{const n=p.schedule.find(x=>x.id===id); if(n) n.done=!n.done;}); renderShootDay(); }
/* v10：整日顺延 1 小时 —— 当天所有节点（含集合、收工）+60，随后整链重排 */
function sdPostpone(){
  const p=cur(); if(!p) return;
  const nodes=(p.schedule||[]).filter(n=>(n.date||sdDate)===sdDate&&n.start);
  if(!nodes.length){ toast('当天只有分镜，请先在日程里插入环节再整体顺延'); return; }
  let overflow=false;
  nodes.forEach(n=>{
    const en=toMin(n.end||addMin(n.start,COLLECT_MIN));
    if(en+60>1440) overflow=true;
  });
  if(overflow){ toast('顺延后超出当天 24:00，请先改到次日'); return; }
  let ok=false;
  updateCur(pp=>{
    (pp.schedule||[]).forEach(n=>{
      if((n.date||sdDate)!==sdDate||!n.start) return;
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

