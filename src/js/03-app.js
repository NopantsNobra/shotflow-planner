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
  const selecting=!!view.boardPackMode,selected=selecting&&(view.boardPackIds||[]).includes(p.id);
  const attrs=selecting?(p.demo?'aria-disabled="true" aria-label="'+esc('示例不可打包 '+p.name)+'"':
    'role="button" tabindex="0" aria-pressed="'+selected+'" aria-label="'+esc('选择项目 '+p.name)+'" onclick="toggleBoardPackProject('+jstr(p.id)+')"'):
    'role="button" tabindex="0" aria-label="'+esc('打开项目 '+p.name)+'" onclick="openProject('+jstr(p.id)+')"';
  return '<article class="pcard st-'+i+'" '+attrs+'>'
    +(selecting?'<div class="muted" style="font-weight:600">'+(p.demo?'示例不可选':selected?'✓ 已选择':'○ 选择项目')+'</div>':'')
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
  trimImageCache(true);
  const all=loadP().filter(p=>!p.assetPack);
  const q=(view.boardQuery||'').trim().toLowerCase();
  const ps=all.filter(p=>matchBoardScope(p,view.boardScope)&&searchHit(p,q));
  let h='<header class="masthead"><div class="brand"><span class="eyebrow">Stillmark · 摄影策划</span><h1>瞬刻摄影工作台</h1><span class="tagline">定格一瞬，刻下永恒。</span></div><div class="sp"></div>'
    +'<div class="mast-actions">'
    +'<button class="btn btn-ghost btn-sm" id="installBtn" style="display:none" onclick="installApp()">安装到桌面</button>'
    +favoritesButton()
    +'<button class="btn btn-ghost btn-sm" onclick="openSettings()">⚙ 设置</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'importFile\').click()">导入</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="toggleBoardPackMode()">'+(view.boardPackMode?'退出打包':'打包项目')+'</button>'
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
    +(view.boardPackMode?'<div class="card"><div class="row"><span id="boardPackCount" class="grow">已选 '+view.boardPackIds.length+' 个项目</span><button class="btn btn-ghost btn-sm" onclick="selectVisibleBoardPacks()">全选当前列表</button><button class="btn btn-ghost btn-sm" onclick="clearBoardPackSelection()">取消全选</button><button class="btn btn-primary btn-sm" onclick="exportBoardPacks()">导出所选项目</button></div><p class="muted">项目包包含完整策划、关联图片、客户及地点信息和执行状态；仅分享给有权限的人。导入时新增项目，不覆盖已有数据。</p></div>':'')
    +'<div id="boardGrid">'+boardGridHtml(all,ps,t)+'</div>';
  document.getElementById('app').innerHTML=h;
  const count=backupItemCount(all);
  document.getElementById('backupTip').classList.toggle('show',count>=30);
  if(deferredPrompt) document.getElementById('installBtn').style.display='';
}
/* 搜索 / 筛选变化时只重绘 #boardGrid，头部、指标条与搜索框保持不动 */
function refreshBoardGrid(){
  const host=document.getElementById('boardGrid'); if(!host) return;
  const all=loadP().filter(p=>!p.assetPack);
  const q=(view.boardQuery||'').trim().toLowerCase();
  const ps=all.filter(p=>matchBoardScope(p,view.boardScope)&&searchHit(p,q));
  host.innerHTML=boardGridHtml(all,ps,todayStr());
}
function toggleBoardPackMode(){view.boardPackMode=!view.boardPackMode;view.boardPackIds=[];renderBoard();}
function refreshBoardPackSelection(){
  const count=document.getElementById('boardPackCount');if(count)count.textContent='已选 '+view.boardPackIds.length+' 个项目';
  refreshBoardGrid();
}
function toggleBoardPackProject(id){
  if(!view.boardPackMode||!loadP().some(p=>p.id===id&&!p.demo&&!p.assetPack))return;
  view.boardPackIds=view.boardPackIds.includes(id)?view.boardPackIds.filter(k=>k!==id):view.boardPackIds.concat(id);
  refreshBoardPackSelection();
}
function selectVisibleBoardPacks(){
  if(!view.boardPackMode)return;
  const q=(view.boardQuery||'').trim().toLowerCase();
  const visible=loadP().filter(p=>!p.demo&&!p.assetPack&&matchBoardScope(p,view.boardScope)&&searchHit(p,q));
  view.boardPackIds=[...new Set(view.boardPackIds.concat(visible.map(p=>p.id)))];refreshBoardPackSelection();
}
function clearBoardPackSelection(){view.boardPackIds=[];refreshBoardPackSelection();}
async function exportBoardPacks(){
  if(!view.boardPackMode)return;
  await exportPortableProjects(buildPortableProjects(loadP(),view.boardPackIds));
}
function statPill(icon,num,lbl,warn){
  return '<div class="metric'+(warn?' warn':'')+'"><div class="mi"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="'+icon+'"/></svg></div><div><div class="mv">'+num+'</div><div class="ml">'+lbl+'</div></div></div>';
}
/* ================= 已收藏视图（独立 mode，不是第 8 页签） ================= */
function openFavorites(){ view=freshView({mode:'favorites'}); renderFavorites(); }
function renderFavorites(){
  trimImageCache(true);
  const all=loadP(), entries=collectFavorites(all);
  let h='<header class="masthead"><div class="brand"><span class="eyebrow">Stillmark · 收藏夹</span><h1>★ 已收藏</h1>'
    +'<span class="tagline">按项目与模块分组 · 共 '+entries.length+' 条</span></div><div class="sp"></div>'
    +'<div class="mast-actions"><button class="btn btn-ghost btn-sm" onclick="view=freshView();renderBoard()">返回看板</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'assetImportFile\').click()">导入素材包</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="toggleAllAssets()">全选 / 取消</button>'
    +'<button class="btn btn-primary btn-sm" onclick="exportSelectedAssets()">导出所选素材</button>'
    +'<input type="file" id="assetImportFile" accept=".json" hidden onchange="importJSON(event)"></div></header>'
    +'<p class="muted">选中收藏即可打包，包含引用图片和场景。素材包导入后仅出现在收藏夹，不占项目看板；请勿分享含客户隐私或无授权的素材。</p>';
  if(!entries.length){
    h+='<div class="card" style="text-align:center;padding:56px 24px"><p class="muted">还没有收藏。在情绪板、分镜、日程、清单、预算或协作条目上点 ☆ 即可收藏。</p></div>';
  } else {
    all.forEach(p=>{
      const list=entries.filter(e=>e.pid===p.id); if(!list.length) return;
      h+='<div class="card"><h2>'+demoBadge(p)+esc(p.name)+' <span class="muted" style="font-weight:400">· '+list.length+' 条'+(p.assetPack?' · 导入素材包':'')+'</span></h2>'
        +(p.assetPack?'<button class="btn btn-ghost btn-sm" onclick="removeAssetPack('+jstr(p.id)+')">移除素材包</button>':'');
      FAV_KINDS.forEach(type=>{
        const rows=list.filter(e=>e.type===type); if(!rows.length) return;
        h+='<div style="margin-bottom:12px"><div class="muted" style="margin-bottom:4px">'+FAV_ICON[type]+' '+FAV_META[type]+'</div>';
        rows.forEach(e=>{
          h+='<div class="row" style="padding:7px 2px;border-bottom:1px dashed var(--line)">'
            +'<input type="checkbox" class="asset-select" aria-label="选择收藏" data-entry="'+esc(JSON.stringify({pid:e.pid,type:e.type,id:e.id}))+'">'
            +'<span>'+FAV_ICON[e.type]+'</span>'
            +'<span class="grow">'+esc(e.summary||'（无摘要）')+'</span>'
            +'<span class="muted">'+esc(e.module)+'</span>'
            +(p.assetPack?'':'<button class="btn btn-ghost btn-sm" onclick="jumpToFav('+jstr(e.type)+','+jstr(e.pid)+','+jstr(e.id)+')">定位 ›</button>')+'</div>';
        });
        h+='</div>';
      });
      h+='</div>';
    });
  }
  document.getElementById('app').innerHTML=h;
}
function toggleAllAssets(){
  const boxes=[...document.querySelectorAll('.asset-select')],select=boxes.some(x=>!x.checked);
  boxes.forEach(x=>{x.checked=select;});
}
function removeAssetPack(pid){
  const p=loadP().find(x=>x.id===pid&&x.assetPack);if(!p)return;
  askConfirm('移除素材包？','只移除收藏包本身，不影响已经引用到项目中的条目及图片。',()=>{
    saveP(loadP().filter(x=>x.id!==pid||!x.assetPack));renderFavorites();
  });
}
async function jumpToFav(type,pid,id){
  const p=loadP().find(x=>x.id===pid); if(!p) return;
  const item=(p[type]||[]).find(x=>x.id===id);
  const date=type==='schedule'?((item&&item.date)||p.shootDate||todayStr()):null;
  selRefs=[];view=freshView({mode:'project',pid:pid,tab:FAV_TAB[type]||'shots'});
  trimImageCache(true);
  if(date) schedDate=date;
  const now=Date.now();
  view.focusRef={type:type,id:id,at:now,until:now+3000};
  await cacheProjectImages(p);
  if(view.mode!=='project'||view.pid!==pid)return;
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
async function referenceFav(type,pid,itemId){
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
    copyAssetDependencies(pp,src,type,clone,uid);
    if(type==='shots') clone.ord=pp.shots.length;
    if((type==='shots'||type==='schedule')&&clone.date) addShootDate(pp,clone.date);
    pp[type].push(clone);
    added=true;
  });
  if(!added) return;
  toast('已引用「'+favSummary(type,it)+'」，时间顺延 '+COPY_SHIFT_MIN+' 分钟');
  await cacheProjectImages(p);
  if(cur()&&cur().id===p.id&&view.mode==='project')renderProject();
  if(document.getElementById('favPickerModal').classList.contains('show')) renderFavPicker();
}
function newProject(){
  /* 用应用内弹窗替代原生 prompt：风格统一，Enter 直接创建，Esc 取消 */
  const box=document.getElementById('nameModal');
  const input=document.getElementById('nameInput');
  if(!box||!input){ return; }
  input.value='';
  const preset=document.getElementById('newWorkspace');if(preset)preset.value='professional';
  box.classList.add('show');
  setTimeout(()=>{ input.focus(); },50);
}
function closeNameModal(){ document.getElementById('nameModal').classList.remove('show'); }
function confirmNewProject(){
  const input=document.getElementById('nameInput');
  const name=(input&&input.value||'').trim()||'未命名拍摄项目';
  const mode=(document.getElementById('newWorkspace')||{}).value||'professional';
  closeNameModal();
  const a=loadP();
  a.push(migrate({id:uid(),v3:1,name:name,client:'',status:'灵感期',shootDate:'',location:'',lat:'',lng:'',workspaceMode:mode,createdAt:Date.now(),updatedAt:Date.now()}));
  saveP(a); openProject(a[a.length-1].id);
  toast('已创建「'+name+'」');
}
async function openProject(pid){ selRefs=[];view=freshView({mode:'project',pid:pid,tab:'shots'}); schedDate=null; trimImageCache(true); await cacheProjectImages(cur()); if(view.mode==='project'&&view.pid===pid)renderProject(); }

