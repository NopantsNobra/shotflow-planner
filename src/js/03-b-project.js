/* ================= 项目页 ================= */
const TABS=[['concept','概念','策划'],['mood','情绪板','策划'],['shots','分镜','执行'],['schedule','日程','执行'],['stuff','清单','执行'],['budget','预算','落地'],['notes','协作','落地']];
function workspaceOptions(mode){
  return [['casual','随拍模式'],['portrait','写真模式'],['professional','专业模式'],['custom','自定义']].map(x=>'<option value="'+x[0]+'" '+(mode===x[0]?'selected':'')+'>'+x[1]+'</option>').join('');
}
function setWorkspaceMode(mode){
  if(!['casual','portrait','professional','custom'].includes(mode))return;
  updateCur(p=>{
    if(mode==='custom'&&!Array.isArray(p.workspaceCustom))p.workspaceCustom=workspaceModules(p.workspaceMode,p.workspaceCustom);
    p.workspaceMode=mode;
  });
  view.tab='shots';renderProject();
}
function toggleWorkspaceModule(key,enabled){
  if(key==='shots')return;
  updateCur(p=>{
    const active=workspaceModules('custom',p.workspaceCustom);
    p.workspaceCustom=workspaceModules('custom',enabled?active.concat(key):active.filter(x=>x!==key));
  });
  renderProject();
}
function workspacePanel(p,modules){
  const mode=p.workspaceMode||'professional';
  const labels=TABS.map(t=>[t[0],t[1]]).concat([['proposal','客户提案'],['callsheet','拍摄通告单'],['manual','执行手册'],['shootday','拍摄日模式']]);
  return '<div class="workspace-control"><label for="workspaceMode">策划模式</label><select id="workspaceMode" onchange="setWorkspaceMode(this.value)"'+(p.demo?' disabled':'')+'>'+workspaceOptions(mode)+'</select>'
    +(mode==='custom'?'<details open><summary>配置可见模块</summary><div class="workspace-checks">'+labels.map(x=>'<label><input type="checkbox" '+(modules.includes(x[0])?'checked':'')+(x[0]==='shots'||p.demo?' disabled':'')+' onchange="toggleWorkspaceModule('+jstr(x[0])+',this.checked)">'+x[1]+'</label>').join('')+'</div></details>':'')
    +'<span class="muted">切换仅改变显示，不删除数据。</span></div>';
}
function renderProject(){
  const p=cur(); if(!p){view.mode='board';renderBoard();return;}
  const modules=workspaceModules(p.workspaceMode,p.workspaceCustom);
  // 从收藏跳转到隐藏页时保留当前页入口；普通切换以预设为准。
  const visibleTabs=TABS.filter(t=>modules.includes(t[0])||t[0]===view.tab);
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
    +(openTodos&&modules.includes('notes')?'<button class="tag purple" style="border:none;cursor:pointer;font-family:inherit" onclick="view.tab=\'notes\';renderProject()">待办 '+openTodos+'</button>':'')
    +(p.shootDate?'<span class="muted" style="font-size:12px">拍摄日 '+esc(p.shootDate)+'</span>':'')
    +'</div></div>'
    +'<div class="pactions">'
    +'<button class="btn btn-ghost btn-sm" onclick="exportProject('+jstr(p.id)+')">导出此案</button>'
    +(p.demo?'<button class="btn btn-primary" onclick="copyDemoToMine('+jstr(p.id)+')">复制为我的项目</button>'
            :(modules.includes('shootday')?'<button class="btn btn-primary" onclick="openShootDay()">进入拍摄日模式</button>':''))
    +favoritesButton()
    +'</div></div></div>'
    +workspacePanel(p,modules)
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
    +'<div class="fld"><label>拍摄地点时区 · IANA（可选）</label><input id="p_timezone" value="'+esc(p.timeZone||'')+'" placeholder="'+esc(projectTimeZone(p))+'" onchange="setProjectTimeZone(this.value)"'+dis+'></div>'
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
    +visibleTabs.reduce(function(segs,tb){                 /* 按 TABS 顺序聚成分组段：组词眉题在上，组内页签在下 */
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
    +(modules.some(x=>['proposal','callsheet','manual'].includes(x))?'<div class="subbar">'
    +'<span class="muted" style="font-size:10px;letter-spacing:.14em">文档输出 ▸</span>'
    +[['proposal','客户提案'],['callsheet','拍摄通告单'],['manual','执行手册']].filter(x=>modules.includes(x[0])).map(x=>'<button class="btn btn-ghost btn-sm" onclick="openDoc('+jstr(x[0])+')">'+x[1]+'</button>').join('')+'</div>':'')
    +'<div id="tabBody"></div>';
  document.getElementById('app').innerHTML=h;
  ({concept:renderConcept,mood:renderMood,shots:renderShots,schedule:renderSchedule,stuff:renderStuff,budget:renderBudget,notes:renderNotes})[view.tab](p);
}
function setP(k,v){ updateCur(p=>p[k]=v); }
function setLL(lat,lng){ updateCur(p=>{p.lat=lat;p.lng=lng;p.timeZone='';p.timeZone=projectTimeZone(p);}); renderProject(); }
function setProjectTimeZone(zone){
  const z=String(zone||'').trim();
  if(z&&!validTimeZone(z)){toast('请输入有效 IANA 时区，如 Asia/Tokyo');renderProject();return;}
  updateCur(p=>{p.timeZone=z;});renderProject();
}
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
/* v10.8.2：所有可收藏页签统一在「主操作行」放打开收藏入口（紧邻各自添加按钮之前）。
   样式真源唯一（btn-ghost btn-sm），避免 6 处字面各写一份导致漂移；concept 页无收藏条目不渲染。 */
function favPickerBtn(){
  return '<button class="btn btn-ghost btn-sm" id="openFavBtn" title="打开与当前页面相关的收藏并引用" onclick="openFavPicker()">☆ 打开收藏</button>';
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
    +favPickerBtn()
    +'<button class="btn btn-primary" onclick="document.getElementById(\'m_img\').click()">上传精选图</button>'
    +'<button class="btn btn-ghost" onclick="toggleRefPicker()">'+(view.moodRefPicker?'收起参考图库':'＋ 从参考图库精选')+'</button>'
    +'<input type="file" id="m_img" accept="image/*" multiple style="display:none" onchange="addMoodImg(event)"></div>'
    +'<div class="image-drop" ondragover="allowImageDrop(event)" ondrop="dropImages(event)">拖入图片，或直接粘贴剪贴板图片</div>'
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
  const owner=cur();
  if(!f||!owner||owner.demo) return null;
  const pid=owner.id;
  return new Promise(res=>{
    const rd=new FileReader();
    rd.onload=ev=>{ const img=new Image();
      img.onload=async()=>{
        try{
          if(!cur()||cur().id!==pid||persistClearing) {res(null);return;}
          const c=document.createElement('canvas'); const s=Math.min(1,800/Math.max(img.width,img.height));
          c.width=img.width*s; c.height=img.height*s;
          c.getContext('2d').drawImage(img,0,0,c.width,c.height);
          const imgId=uid(); const data=c.toDataURL('image/jpeg',.72);
          await idb.put(imgId,data); imgCache[imgId]=data;
          if(!cur()||cur().id!==pid||persistClearing){res(null);return;}
          updateCur(p=>{
            p.refs=Array.isArray(p.refs)?p.refs:[];
            p.refs.push({id:uid(),key:imgId,name:(f&&f.name)||'',tags:(tags||[]).slice(),createdAt:Date.now(),fav:false});
            if(target==='mood'){
              p.mood.push({id:uid(),type:'image',content:imgId,tag:(tags&&tags[0])||'',tags:(tags||[]).slice(),fav:true});
            }
            p.tagVocab=mergeVocab(p.tagVocab,tags||[]);
          });
          res(imgId);
        }catch{ if(!silent) toast('图片处理失败'); res(null); }
      };
      img.onerror=()=>{ if(!silent) toast('图片读取失败'); res(null); };
      img.src=ev.target.result; };
    rd.onerror=()=>{ if(!silent) toast('图片读取失败'); res(null); };
    rd.readAsDataURL(f);
  });
}
function allowImageDrop(e){
  if(e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes('Files'))e.preventDefault();
}
function dispatchImageFiles(files){
  const p=cur();
  if(view.mode!=='project'||!p||p.demo||!['mood','shots'].includes(view.tab)||!files.length)return false;
  const e={target:{files,value:''}};
  if(view.tab==='mood')addMoodImg(e);else addShotImg(e);
  return true;
}
function dropImages(e){e.preventDefault();dispatchImageFiles(Array.from(e.dataTransfer.files||[]).filter(f=>f.type.startsWith('image/')));}
document.addEventListener('paste',e=>{
  const files=Array.from(e.clipboardData&&e.clipboardData.files||[]).filter(f=>f.type.startsWith('image/'));
  if(files.length&&dispatchImageFiles(files))e.preventDefault();
});
async function addMoodImg(e){
  const p=cur();
  const files=parseMultiImage(e);e.target.value='';
  if(!p||p.demo){toast('示例项目只读，请先复制为我的项目');return;}
  const tags=parseTagsInput(gv('m_tag')),pid=p.id;
  let count=0;
  for(const f of files){
    if(!cur()||cur().id!==pid)break;
    if(await ingestImageFile(f,tags,true,'mood'))count++;
  }
  if(cur()&&cur().id===pid){renderProject();toast('已导入 '+count+'/'+files.length+' 张精选图');}
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

