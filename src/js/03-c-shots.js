/* ---- 分镜（中枢） ---- */
let selRefs=[],shotRenderSeq=0;
function shotSortKey(s){ return (s.date||'9999')+'|'+(s.ord!=null?'o'+String(s.ord).padStart(6,'0'):'s'+(s.slot||'99:99')); }
async function renderShots(p){
  if(!p) return;
  const ticket=++shotRenderSeq,host=document.getElementById('tabBody');
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
  try{ gallery=await idb.shiseiIndex(); }catch{ gallery=[]; }
  if(ticket!==shotRenderSeq||host!==document.getElementById('tabBody')||view.mode!=='project'||view.tab!=='shots'||!cur()||cur().id!==p.id)return;
  const cats=[...new Set(gallery.map(r=>r.cat).filter(Boolean))];
  const categoryRows=view.poseCat?gallery.filter(r=>r.cat===view.poseCat):[];
  const pageSize=48,pageCount=Math.max(1,Math.ceil(categoryRows.length/pageSize));
  view.posePage=Math.max(0,Math.min(pageCount-1,view.posePage||0));
  const galleryRows=categoryRows.slice(view.posePage*pageSize,(view.posePage+1)*pageSize);
  const editing=p.shots.find(x=>x.id===view.editingShotId);
  const selRefsBar=editing?'':selectedRefsHtml();
  const editBar=editing?'<div class="edit-bar"><span>正在编辑「'+esc(editing.name)+'」的参考图 — '+(view.replaceIdx>=0?'点击下方图片替换第 '+(view.replaceIdx+1)+' 张，点一张即完成。':'可连续点选添加（当前 '+((editing.refIds||[]).length)+'/3 张），再点已选可取消；完成后点「完成」。')+'</span><button class="btn btn-primary btn-sm" '+doAttrs('exit-shot-ref-editor')+'>完成</button></div>':'';
  const mineHead='<div class="ref-group-head"><span>我的素材</span><div class="chips">'
    +'<button class="btn btn-ghost btn-sm" '+doAttrs('pick-shot-image')+'>上传图片</button>'
    +'<input type="file" id="s_img" accept="image/*" multiple style="display:none" data-change="shot-images">'
    +'<span class="muted" style="margin-left:2px">一次最多 3 张</span></div></div>';
  const mineHtml='<div class="ref-group">'+mineHead+'<div class="image-drop" data-image-drop="true">拖入或粘贴图片 · 自动存入参考图库</div>'
    +(moodImgs.length?'<div class="ref-picker">'
      +moodImgs.map(m=>
        '<button type="button" class="ref-opt '+(selRefs.includes(m.content)?'on':'')+'" data-ref-key="'+esc(m.content)+'" aria-pressed="'+selRefs.includes(m.content)+'" aria-label="'+esc('选择参考图 '+(tagsForDisplay(m).join(' / ')||m.id))+'" title="'+esc(tagsForDisplay(m).join(' / '))+'" '+doAttrs('toggle-ref',[m.content])+'><img alt="" src="'+esc(imgCache[m.content]||'')+'">'
        +(tagsForDisplay(m).length?'<span class="ref-tag">'+tagsForDisplay(m).map(t=>'#'+esc(t)).join(' ')+'</span>':'')
        +(selRefs.includes(m.content)?'<span class="ord">'+(selRefs.indexOf(m.content)+1)+'</span>':'')+'</button>').join('')
      +'<span class="muted" style="align-self:center">点击选参考图（最多 3 张）</span></div>'
      :'<p class="muted" style="margin:6px 2px">'+(view.moodFilter.length?'没有素材命中所选标签，可清空筛选或直接上传。':'还没有图片素材。可直接「上传图片」，或到情绪板 / 姿势图库获取。')+'</p>')
    +'</div>';
  const galleryHead='<div class="ref-group-head"><span>姿势图库</span><div class="chips">'
    +cats.map(c=>'<button class="chip '+(view.poseCat===c?'on':'')+'" '+doAttrs('set-pose-cat',[c])+'>'+esc(c)+'</button>').join('')
    +(gallery.length?'<span class="muted" style="margin-left:2px">'+gallery.length+' 张</span>':'')+'</div></div>';
  const galleryHtml=!gallery.length?'<div class="ref-group">'+galleryHead+'<p class="muted" style="margin:6px 2px">图库尚未同步。到下方「素材来源」开启姿势图库同步，空闲时会自动下载到本机。</p></div>'
    :!view.poseCat?'<div class="ref-group">'+galleryHead+'<p class="muted" style="margin:6px 2px">点击上方分类查看对应姿势参考图，再点一次收起。</p></div>'
    :!galleryRows.length?'<div class="ref-group">'+galleryHead+'<p class="muted" style="margin:6px 2px">该分类暂无图片。</p></div>'
    :'<div class="ref-group">'+galleryHead+'<div class="ref-picker">'+galleryRows.map(r=>
        '<button type="button" class="ref-opt '+(selRefs.includes(r.key)?'on':'')+'" data-ref-key="'+esc(r.key)+'" data-shisei-key="'+esc(r.key)+'" aria-pressed="'+selRefs.includes(r.key)+'" aria-label="'+esc('选择 '+r.zh+' · '+r.cat)+'" title="'+esc(r.zh+' · '+r.cat)+'" '+doAttrs('toggle-ref',[r.key])+'>'
        +'<img src="'+esc(imgCache[r.key]||'')+'" alt="'+esc(r.zh)+'">'
        +'<span class="ref-tag">#'+esc(r.cat)+' · '+esc(r.zh)+'</span>'
        +(selRefs.includes(r.key)?'<span class="ord">'+(selRefs.indexOf(r.key)+1)+'</span>':'')+'</button>').join('')
      +'<span class="muted" style="align-self:center">图库引用同样最多 3 张</span></div>'
      +(pageCount>1?'<div class="row"><button class="btn btn-ghost btn-sm" '+(view.posePage===0?'disabled':'')+' '+doAttrs('change-pose-page',[-1])+'>上一页</button><span class="muted">'+(view.posePage+1)+' / '+pageCount+' 页 · '+categoryRows.length+' 张</span><button class="btn btn-ghost btn-sm" '+(view.posePage===pageCount-1?'disabled':'')+' '+doAttrs('change-pose-page',[1])+'>下一页</button></div>':'')+'</div>';
  document.getElementById('tabBody').innerHTML=(editBar?'<div class="card" style="padding:14px 18px">'+editBar+'</div>':'')
    +'<div class="card"><h2>分镜表 · 数据中枢</h2>'
    +'<p class="muted" style="margin-bottom:12px">每条分镜可挂 1-3 张参考图（我的素材 + 姿势图库）+ 场景 + 机位 + 光线。分镜按顺序自动排入日程，无需手填时间；拖动左侧手柄排序，拖到另一日期分组会自动改期。</p>'
    +'<div class="row" style="margin-bottom:6px">'
    +'<input id="s_name" class="grow" placeholder="分镜内容，如：巷口逆光回眸（中景）" value="'+esc(D.name||'')+'" data-input="shot-draft" data-field="name" '+enterAttrs('add-shot')+'>'
    +'<select id="s_date" style="max-width:180px" data-change="shot-date">'
      +dayOpts.map(function(d){
        const gi=days.indexOf(d);
        return '<option value="'+d+'" '+(curDay===d?'selected':'')+'>'+(gi>=0?'Day '+(gi+1)+' · ':'Day – · ')+mmdd(d)+'</option>';
      }).join('')
      +'<option value="__new" '+(curDay==='__new'?'selected':'')+'>＋ 新日期…</option></select>'
    +'<select id="s_dur" style="max-width:105px" data-change="shot-draft" data-field="duration">'+[10,15,20,30,45,60,90].map(d=>'<option value="'+d+'" '+((+D.duration||10)===d?'selected':'')+'>'+d+' 分钟</option>').join('')+'</select>'
    +'<select id="s_scene" style="max-width:150px" data-change="shot-scene">'
      +'<option value="">'+(p.scenes.length?'— 场景 —':'还没有场景，点「＋ 新建场景」添加')+'</option>'
      +p.scenes.map(s=>'<option value="'+esc(s.id)+'" '+(D.scene===s.id?'selected':'')+'>'+esc(s.name)+'</option>').join('')
      +'<option value="__new" '+(D.scene==='__new'?'selected':'')+'>＋ 新建场景…</option></select>'
    +'<select id="s_pos" style="max-width:108px" data-change="shot-draft" data-field="position"><option value="">— 机位 —</option>'+POSITION_OPTS.map(o=>'<option value="'+o+'" '+(D.position===o?'selected':'')+'>'+o+'</option>').join('')+'</select>'
    +'<select id="s_light" style="max-width:108px" data-change="shot-draft" data-field="light"><option value="">— 光线 —</option>'+LIGHT_OPTS.map(o=>'<option value="'+o+'" '+(D.light===o?'selected':'')+'>'+o+'</option>').join('')+'</select>'
    +'<input id="s_note" class="grow" placeholder="补充描述（姿势 / 构图 / 道具…）" value="'+esc(D.note||'')+'" data-input="shot-draft" data-field="note">'
    +favPickerBtn()
    +'<button class="btn btn-primary" '+doAttrs('add-shot')+'>添加分镜</button></div>'
    +(curDay==='__new'
      ?'<div class="new-scene"><span class="muted">新拍摄日</span>'
        +'<input type="date" id="new_shot_date" value="'+esc(addDays(days[days.length-1]||p.shootDate||todayStr(),1))+'">'
        +'<button class="btn btn-primary btn-sm" '+doAttrs('confirm-new-shot-date')+'>加入并选中</button>'
        +'<button class="btn btn-ghost btn-sm" '+doAttrs('cancel-new-shot-date')+'>取消</button></div>'
      :'')
    +(D.scene==='__new'
      ?'<div class="new-scene"><span class="muted">新建场景</span>'
        +'<input id="new_scene_name" placeholder="场景名称，如：老门东巷口" '+enterAttrs('add-scene-inline')+'>'
        +'<button class="btn btn-primary btn-sm" '+doAttrs('add-scene-inline')+'>添加并选中</button>'
        +'<button class="btn btn-ghost btn-sm" '+doAttrs('cancel-scene-inline')+'>取消</button></div>'
      :'')
    +'<div id="selectedRefsBar" aria-live="polite">'+selRefsBar+'</div>'
    +(mineHtml||galleryHtml?'':'<p class="muted" style="margin-bottom:10px">还没有任何参考图来源。上传图片、到情绪板添加，或在下方「素材来源」开启姿势图库同步。</p>')
    +mineHtml+galleryHtml
    +'<div class="row" style="margin-bottom:12px"><input id="s_filter" class="grow" placeholder="搜索分镜 / 场景 / 备注…" value="'+esc(view.shotFilter)+'" data-input="shot-filter">'
      +'<button class="btn btn-ghost btn-sm" '+doAttrs('toggle-batch-mode')+'>'+(view.batchMode?'退出批量':'批量编辑')+'</button>'
      +'<button class="btn btn-ghost btn-sm" id="reschedAllBtn" title="对所有拍摄日统一重排一次（复制 / 调整完成后点此）" '+doAttrs('reschedule-all-days')+'>↻ 重新排程</button></div>'
    +(view.batchMode?batchShotControls(p):'')
    +'<div id="shotListWrap">'+shotListHtml(p,days)+'</div></div>';
  // 仅加载当前页，避免一次性启动整个分类的 IDB 读取。
  loadVisiblePoseImages(galleryRows.map(r=>r.key),p.id,view.poseCat,view.posePage);
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
    attachDrag(); // 局部重绘销毁旧 DOM 监听器，须重新绑定。
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
  if(el){ el.focus(); try{ el.setSelectionRange(snap.ss,snap.se); }catch{} }
}
/* 分镜列表（含分组头 / 空状态）：renderShots 全量绘与 setShotFilter 局部刷新共用 */
function toggleBatchMode(){view.batchMode=!view.batchMode;view.batchShots=[];renderShots(cur());}
function batchShotControls(p){
  return '<div class="batch-bar"><span id="batchCount">已选 '+view.batchShots.length+' 条</span>'
    +'<button class="btn btn-ghost btn-sm" '+doAttrs('select-visible-shots')+'>全选当前列表</button>'
    +'<select id="batchDate"><option value="">日期不变</option>'+shootDatesOf(p).map(d=>'<option value="'+esc(d)+'">'+esc(d)+'</option>').join('')+'</select>'
    +'<select id="batchDuration"><option value="">时长不变</option>'+[10,15,20,30,45,60,90].map(n=>'<option value="'+n+'">'+n+' 分钟</option>').join('')+'</select>'
    +'<select id="batchScene"><option value="">场景不变</option><option value="__none">清除场景</option>'+(p.scenes||[]).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('')+'</select>'
    +'<button class="btn btn-primary btn-sm" '+doAttrs('apply-batch-shots')+'>应用</button></div>';
}
function toggleBatchShot(id,checked){
  view.batchShots=checked?Array.from(new Set(view.batchShots.concat(id))):view.batchShots.filter(x=>x!==id);
  const el=document.getElementById('batchCount');if(el)el.textContent='已选 '+view.batchShots.length+' 条';
}
function selectVisibleShots(){
  view.batchShots=Array.from(new Set(view.batchShots.concat(Array.from(document.querySelectorAll('#shotList .shot')).map(el=>el.dataset.id))));
  renderShots(cur());
}
function applyBatchShots(){
  const p=cur();if(!p||p.demo||!view.batchShots.length){toast('请选择要修改的分镜');return;}
  const ids=new Set(view.batchShots),date=gv('batchDate'),duration=Number(gv('batchDuration')),scene=gv('batchScene');
  if(!date&&!duration&&!scene){toast('请选择要修改的字段');return;}
  updateCur(pp=>{
    const affected=new Set();
    pp.shots.forEach(s=>{
      if(!ids.has(s.id))return;
      affected.add(s.date);
      if(date){s.date=date;affected.add(date);}
      if(duration)s.duration=duration;
      if(scene)s.sceneId=scene==='__none'?'':scene;
    });
    affected.forEach(d=>{if(d)applyDay(pp,d,null);});
  });
  view.batchMode=false;view.batchShots=[];renderProject();toast('已批量更新分镜');
}
function toggleMustShoot(id){updateCur(p=>{const s=p.shots.find(x=>x.id===id);if(s)s.mustShoot=!s.mustShoot;});renderProject();}
function shotListHtml(p,days){
  const kw=(view.shotFilter||'').trim().toLowerCase();
  const sceneMap=new Map(p.scenes.map(sc=>[sc.id,sc]));
  const selected=new Set(view.batchShots||[]);
  const sorted=p.shots.filter(s=>!kw||(s.name||'').toLowerCase().includes(kw)||(s.note||'').toLowerCase().includes(kw)||(sceneMap.get(s.sceneId)?.name||'').toLowerCase().includes(kw))
    .map(s=>({s,key:shotSortKey(s)})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).map(x=>x.s);
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
        const scene=sceneMap.get(s.sceneId);
        const sid=esc(s.id);
        const clash=!!conflictMap[s.id];
        const refs=s.refIds||[];
        const refHtml=refs.length? refs.map((r,ri)=>{
            const img=imgCache[r];
            const inner=img?'<img src="'+esc(img)+'">':'<div class="noref">图库原图已更新</div>';
            return '<div class="ref-thumb'+(img?'':' ghost')+'"><button class="ref-open" aria-label="查看参考图 '+(ri+1)+'" title="点击查看大图" '+doAttrs('open-ref-viewer',[s.id,ri])+'>'+inner+'</button>'
              +'<button class="ref-del" aria-label="移除参考图 '+(ri+1)+'" title="从本分镜移除该参考图" '+doAttrs('remove-shot-ref',[s.id,ri])+'>×</button></div>';
          }).join('')
          :'<button class="noref-add" '+doAttrs('open-shot-ref-editor',[s.id])+'>+ 添加参考图</button>';
        const editingThis=view.editingShotEditId===s.id;    // v10：行内编辑文字（与参考图选图态 editingShotId 正交）
        const meta=[s.date||'未定','约 '+(+s.duration||10)+' 分钟',
          scene?scene.name:'',s.position||'',s.light||'',s.note||''].filter(Boolean).join(' · ');
        const body=editingThis
          ? shotEditPanel(s,p)
          :'<div class="grow" style="min-width:150px"><div class="'+(s.done?'done-text':'')+'" style="font-weight:600">'+esc(s.name)+(s.mustShoot?' <span class="tag blue">必拍</span>':'')+(clash?' <span class="tag red">时间重叠</span>':'')+'</div>'
            +'<div class="muted" style="font-size:12px;margin-top:2px">'+esc(meta)+'</div></div>';
        return '<div class="shot '+(s.done?'done':'')+(editingThis?' editing':'')+'" data-id="'+sid+'" data-fid="'+sid+'">'
          +(view.batchMode?'<input class="batch-check" type="checkbox" aria-label="选择分镜" '+(selected.has(s.id)?'checked':'')+' data-change="batch-shot" data-shot-id="'+sid+'">':'')
          +'<span class="drag-handle" title="拖拽排序"><svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></svg></span>'
          +'<button class="chk '+(s.done?'on':'')+'" aria-label="完成分镜" aria-pressed="'+!!s.done+'" '+doAttrs('toggle-shot',[s.id])+'>'+(s.done?'✓':'')+'</button>'
          +'<div class="refs">'+refHtml+'</div>'
          +body
          +'<button class="rowbtn'+(isFav(s)?' on':'')+'" title="收藏/取消收藏" '+doAttrs('toggle-fav',['shots',s.id])+'>'+(isFav(s)?'★':'☆')+'</button>'
          +'<button class="rowbtn" title="复制分镜（时间顺延 '+COPY_SHIFT_MIN+' 分钟）" '+doAttrs('copy-shot',[s.id])+'>⧉复制</button>'
          +'<button class="rowbtn" title="标记必拍" '+doAttrs('toggle-must-shoot',[s.id])+'>'+(s.mustShoot?'取消必拍':'必拍')+'</button>'
          +'<button class="rowbtn" title="上移分镜" aria-label="上移分镜" '+doAttrs('move-shot-by',[s.id,-1])+'>↑</button>'
          +'<button class="rowbtn" title="下移分镜" aria-label="下移分镜" '+doAttrs('move-shot-by',[s.id,1])+'>↓</button>'
          +editBtn('Shot',s.id)
          +'<button class="iconbtn" title="删除分镜" '+doAttrs('del-shot',[s.id])+'><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>';
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
    if(clone.date) addShootDate(pp,clone.date);
    pp.shots.splice(idx+1,0,clone);
    ok=true;
  });
  if(!ok) return;
  toast('已复制「'+String(s.name||'分镜').slice(0,12)+'」，时间顺延 '+COPY_SHIFT_MIN+' 分钟；调整完成后点「↻ 重新排程」',6000);
  renderProject();
}
/* v10.8.1：整体重排——对每个拍摄日各跑一次 applyDay（含自动跨日），把复制 / 手动调整后的
   slot 交给排程引擎统一派生。只在用户主动点击时执行，绝不自动触发，避免打断编辑。 */
/* 仅比较排程相关数据，撤销不触碰情绪板、预算、概念等其他信息。 */
function scheduleSnapshot(p){
  return JSON.stringify({shots:p.shots||[],schedule:p.schedule||[],shootDates:p.shootDates||[],shootDate:p.shootDate||'',dayInit:p.dayInit||[]});
}
function scheduleChanges(before,after){
  let moved=0,crossDay=0,nodes=0;
  const oldShots=new Map((before.shots||[]).map(s=>[s.id,s]));
  const oldNodes=new Map((before.schedule||[]).map(n=>[n.id,n]));
  (after.shots||[]).forEach(s=>{const b=oldShots.get(s.id);if(b&&(s.slot!==b.slot||s.date!==b.date)){moved++;if(s.date!==b.date)crossDay++;}});
  (after.schedule||[]).forEach(n=>{const b=oldNodes.get(n.id);if(!b||b.start!==n.start||b.end!==n.end)nodes++;});
  const days=(after.shootDates||[]).filter(d=>!(before.shootDates||[]).includes(d));
  return {moved,crossDay,nodes,days};
}
function rescheduleAllDays(){
  const p=cur(); if(!p) return;
  if(p.demo&&!view.allowDemoWrite){ toast('示例项目只读，请点「复制为我的项目」后再重排'); return; }
  const dates=Array.from(new Set([...(p.shootDates||[]),...(p.shots||[]).map(s=>s.date).filter(Boolean)])).sort();
  if(!dates.length){toast('还没有拍摄日，无需重排');return;}
  const before=scheduleSnapshot(p), draft=JSON.parse(JSON.stringify(p));
  let overflow=false;
  dates.forEach(d=>{const r=applyDay(draft,d,null,true);if(r&&(r.capHit||r.overflowHard||r.overflow))overflow=true;});
  const after=scheduleSnapshot(draft), changes=scheduleChanges(p,draft), pid=p.id;
  if(before===after){toast('排程已是最新');return;}
  const desc='预计调整 '+changes.moved+' 条分镜、'+changes.nodes+' 个环节；跨日 '+changes.crossDay+' 条'
    +(changes.days.length?'，新增拍摄日 '+changes.days.join('、'):'')+'。'
    +(overflow?'仍存在超时，请核对冲突。':'')+'确认后才会修改计划，可立即撤销。';
  askConfirm('确认整体重排？',desc,()=>{
    const now=cur();
    if(!now||now.id!==pid||scheduleSnapshot(now)!==before){toast('计划已变化，请重新预览');return;}
    updateCur(pp=>Object.assign(pp,JSON.parse(after)));
    renderProject();
    toast('已重排 '+dates.length+' 个拍摄日',10000,{label:'撤销',fn:()=>{
      const current=cur();
      if(!current||current.id!==pid||scheduleSnapshot(current)!==after){toast('排程已再次变化，不能覆盖新修改');return;}
      updateCur(pp=>Object.assign(pp,JSON.parse(before)));renderProject();toast('已撤销重排');
    }});
  });
}
function setShiseiCat(cat){view.poseCat=(view.poseCat===cat)?null:String(cat||null);view.posePage=0;renderShots(cur());}
function changePosePage(delta){view.posePage=Math.max(0,(view.posePage||0)+delta);renderShots(cur());}
async function loadVisiblePoseImages(keys,pid,cat,page){
  for(let i=0;i<keys.length;i+=6){
    if(view.mode!=='project'||view.tab!=='shots'||view.pid!==pid||view.poseCat!==cat||view.posePage!==page)return;
    await Promise.all(keys.slice(i,i+6).map(ensureShiseiImage));
  }
}
function selectedRefsHtml(){
  return selRefs.length?'<div class="selrefs"><span class="muted">已选参考图（'+selRefs.length+'/3）</span>'
    +selRefs.map((key,i)=>'<span class="sr"><img src="'+esc(imgCache[key]||'')+'" alt="参考图 '+(i+1)+'"><i>'+(i+1)+'</i><button aria-label="取消参考图 '+(i+1)+'" '+doAttrs('remove-sel-ref',[i])+'>×</button></span>').join('')
    +'<button class="btn btn-ghost btn-sm" '+doAttrs('clear-sel-refs')+'>清空选择</button></div>':'';
}
function refreshSelectedRefs(){
  const bar=document.getElementById('selectedRefsBar');if(!bar)return;
  bar.innerHTML=selectedRefsHtml();
  document.querySelectorAll('[data-ref-key]').forEach(el=>{
    const i=selRefs.indexOf(el.dataset.refKey);el.classList.toggle('on',i>=0);el.setAttribute('aria-pressed',String(i>=0));
    let marker=el.querySelector('.ord');
    if(i<0){if(marker)marker.remove();return;}
    if(!marker){marker=document.createElement('span');marker.className='ord';el.append(marker);}
    marker.textContent=String(i+1);
  });
}
function removeSelRef(i){if(i>=0&&i<selRefs.length){selRefs.splice(i,1);refreshSelectedRefs();}}
function clearSelRefs(){selRefs=[];refreshSelectedRefs();}
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
    +'<button class="btn btn-ghost btn-sm" '+doAttrs('cancel-shot-edit')+'>取消</button>'
    +'<button class="btn btn-primary btn-sm" '+doAttrs('save-shot-edit',[s.id])+'>保存修改</button>'
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
  refreshSelectedRefs();
  if(String(id).startsWith('shisei:')&&!imgCache[id])ensureShiseiImage(id).then(()=>{if(selRefs.includes(id))refreshSelectedRefs();});
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
    +'<button class="btn btn-ghost btn-sm" '+doAttrs('ref-nav',[-1])+'>‹ 上一张</button>'
    +'<button class="btn btn-ghost btn-sm" '+doAttrs('ref-nav',[1])+'>下一张 ›</button>'
    +(!document.getElementById('sdOverlay')?.classList.contains('show')?'<button class="btn btn-ghost btn-sm" '+doAttrs('replace-shot-ref',[shotId,idx])+'>更换这张</button>'
    +'<button class="btn btn-danger btn-sm" '+doAttrs('remove-shot-ref',[shotId,idx])+'>从分镜移除</button>':'')
    +'<button class="btn btn-ghost btn-sm" '+doAttrs('close-ref-viewer')+'>关闭</button></div>';
  document.getElementById('refViewer').classList.add('show');
  if(!img){const token=view.refViewer;const load=isSh?ensureShiseiImage(r):idb.get(r);Promise.resolve(load).then(data=>{if(data&&view.refViewer===token&&cur()?.id===p.id){imgCache[r]=data;openRefViewer(shotId,idx);}}).catch(()=>{});}
}
function refNav(delta){
  const v=view.refViewer; if(!v) return;
  const p=cur(), s=p&&p.shots.find(x=>x.id===v.shotId); if(!s||!s.refIds||!s.refIds.length){ closeRefViewer(); return; }
  openRefViewer(v.shotId,(v.ri+delta+s.refIds.length)%s.refIds.length);
}
function closeRefViewer(){ view.refViewer=null; document.getElementById('refViewer').classList.remove('show');document.getElementById('refViewerBody').replaceChildren(); }
async function addShotImg(e){
  const current=cur();
  if(current&&current.demo){
    try{ e.target.value=''; }catch{}
    toast('示例项目只读，请点「复制为我的项目」后再修改'); return;
  }
  const files=parseMultiImage(e);
  try{ e.target.value=''; }catch{}
  if(!files.length) return;
  const pid=current&&current.id,editingId=view.editingShotId, rIdx=view.replaceIdx;
  const okIds=[], failN=[];
  for(const f of files){
    if(!cur()||cur().id!==pid)break;
    const id=await ingestImageFile(f,[],true);
    if(id) okIds.push(id); else failN.push(1);
  }
  if(!cur()||cur().id!==pid||view.tab!=='shots')return;
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
  selRefs=[]; view.shotDraft={date:d,duration:dur,scene:sc==='__new'?'':sc,position:pos,light}; if(view.editingShotEditId) view.editingShotEditId=null;
  toastResched(plan); renderProject();
  // 连续输入时保持拍摄日/场景/时长，不要求重复选择。
  const pid=cur()&&cur().id;
  requestAnimationFrame(()=>{const el=document.getElementById('s_name');if(el&&cur()&&cur().id===pid)el.focus();});
}

/* 拖拽排序（桌面 + 触屏，Pointer Events） */
function attachDrag(){
  const list=document.getElementById('shotList');if(!list)return;
  list.querySelectorAll('.drag-handle').forEach(h=>{
    h.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      const dragEl=h.closest('.shot'),startY=e.clientY;let active=false,drop=null;
      h.setPointerCapture(e.pointerId);
      const clear=()=>list.querySelectorAll('.shot').forEach(s=>s.classList.remove('dragging','drop-before','drop-after'));
      const move=ev=>{
        if(!active&&Math.abs(ev.clientY-startY)>6)active=true;
        if(!active)return;
        clear();dragEl.classList.add('dragging');
        const el=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.shot');
        drop=null;
        if(el&&el!==dragEl&&list.contains(el)){
          const r=el.getBoundingClientRect(),after=ev.clientY-r.top>r.height/2;
          el.classList.add(after?'drop-after':'drop-before');drop={id:el.dataset.id,after};
        }
      };
      const end=ev=>{
        h.removeEventListener('pointermove',move);h.removeEventListener('pointerup',end);h.removeEventListener('pointercancel',end);
        clear();
        if(ev.type==='pointerup'&&active&&drop)moveShotRelative(dragEl.dataset.id,drop.id,drop.after);
      };
      h.addEventListener('pointermove',move);h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);
    });
  });
}
function moveShotRelative(id,targetId,after){
  const p=cur();if(!p||p.demo||id===targetId)return;
  updateCur(pp=>{
    const shot=pp.shots.find(s=>s.id===id),target=pp.shots.find(s=>s.id===targetId);
    if(!shot||!target)return;
    const from=shot.date||'',to=target.date||'';
    // 使用完整项目而非当前筛选后的 DOM；目标日期明确取落点，隐藏分镜不会被重置。
    const rows=pp.shots.filter(s=>s.id!==id&&s.date===target.date).sort((a,b)=>(+a.ord||0)-(+b.ord||0));
    const index=rows.indexOf(target);
    rows.splice(index+(after?1:0),0,shot);
    shot.date=target.date;
    rows.forEach((s,n)=>s.ord=n);
    if(from!==to){
      pp.shots.filter(s=>s.date===from).sort((a,b)=>(+a.ord||0)-(+b.ord||0)).forEach((s,n)=>s.ord=n);
      if(to)addShootDate(pp,to);
      if(from)applyDay(pp,from,null);
    }
    if(to)applyDay(pp,to,null);
  });
  renderProject();
}
function moveShotBy(id,delta){
  const p=cur(),s=p&&p.shots.find(x=>x.id===id);if(!s||p.demo)return;
  const rows=p.shots.filter(x=>x.date===s.date).sort((a,b)=>(+a.ord||0)-(+b.ord||0));
  const target=rows[rows.indexOf(s)+delta];
  if(target)moveShotRelative(id,target.id,delta>0);else toast('已到该拍摄日的边界');
}
function toggleShot(id){
  let shot=null;updateCur(p=>{const s=p.shots.find(x=>x.id===id);if(s){s.done=!s.done;s.skipped=false;s.deferred=false;shot=s;}});
  const row=[...document.querySelectorAll('#shotList .shot')].find(el=>el.dataset.id===id);
  if(shot&&row){
    row.classList.toggle('done',shot.done);
    const btn=row.querySelector('.chk');if(btn){btn.classList.toggle('on',shot.done);btn.setAttribute('aria-pressed',String(shot.done));btn.textContent=shot.done?'✓':'';}
    const name=row.querySelector('.grow>div');if(name)name.classList.toggle('done-text',shot.done);
  }else if(shot)renderProject();
}
/* 删除分镜：立即删除（保持单击即删的习惯），toast 提供 6 秒撤销；
   撤销时按原对象放回（ord / 参考图 / 完成态原样保留），并重排当天 */
function delShot(id){
  updateCur(p=>{
    const s=p.shots.find(x=>x.id===id); if(!s) return;
    const d=s.date||'',pid=p.id;
    p.shots=p.shots.filter(x=>x.id!==id);
    applyDay(p,d,null);      // 删除后重新紧凑排期
    toast('已删除分镜「'+summary40(s.name)+'」',6000,{label:'撤销',fn:function(){
      if(!cur()||cur().id!==pid){toast('请回到原项目后再操作');return;}
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

