/* ================= 启动 ================= */
(async()=>{
  try{
    document.head.insertAdjacentHTML('beforeend','<style id="cvPublicStyle">'+PUBLIC_STYLE+'</style>');
    window.addEventListener('resize',fitCovers);
    bindPersistFlush();   // P0：页面隐藏/关闭时冲刷未落盘数据
    await initData(); seed(); await ensureV9Demo(); renderBoard();
    shiseiInitReady=true; startShiseiSync();
  }catch(e){
    /* A2：任何启动异常都不允许白屏——给出可见错误与自救入口（刷新 / 检查存储设置） */
    const app=document.getElementById('app');
    if(app) app.innerHTML='<header class="masthead"><div class="brand"><span class="eyebrow">Stillmark · 摄影策划</span><h1>瞬刻摄影工作台</h1></div></header>'
      +'<div class="card" style="text-align:center;padding:56px 24px"><p>初始化时出了问题（'+esc(String((e&&e.message)||e))+'）。</p>'
      +'<p class="muted">可以先刷新重试；若反复出现，检查浏览器隐私模式 / 存储设置，或换一个浏览器打开。</p>'
      +'<button class="btn btn-primary" '+doAttrs('reload-page')+'>刷新重试</button></div>';
  }
})();
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')trimImageCache(true);
  if(document.visibilityState!=='visible'&&shiseiState.running){ shiseiState.paused=true; renderShiseiSyncStatus(); }
  else if(document.visibilityState==='visible'&&!shiseiState.running&&shiseiState.paused){ startShiseiSync(); }
});
window.addEventListener('offline',()=>{
  if(shiseiState.running){ shiseiState.paused=true; renderShiseiSyncStatus(); }
});
window.addEventListener('online',()=>{
  if(!shiseiState.running) startShiseiSync();
});

/* 弹窗焦点管理：按真实层叠顺序管理焦点、Tab 循环及关闭后的焦点恢复。 */
function bindDialogAccessibility(){
  let active=null,previous=null;
  const selector='.modal-mask,.sd-overlay';
  const top=()=>Array.from(document.querySelectorAll('.modal-mask.show,.sd-overlay.show')).filter(el=>el.classList.contains('show')).sort((a,b)=>Number(getComputedStyle(a).zIndex||0)-Number(getComputedStyle(b).zIndex||0)).pop()||null;
  const controls=el=>Array.from(el.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(x=>x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden');
  const sync=()=>{
    const next=top();
    if(next===active)return;
    if(active)active.removeAttribute('aria-modal');
    if(!active&&next)previous=document.activeElement;
    active=next;
    if(next){
      next.setAttribute('role','dialog');next.setAttribute('aria-modal','true');next.tabIndex=-1;
      if(!next.hasAttribute('aria-label'))next.setAttribute('aria-label',next.querySelector('h2,h3,.doc-bar-title')?.textContent||'拍摄工作台');
      if(!next.contains(document.activeElement))(controls(next)[0]||next).focus();
    }else if(previous&&previous.isConnected){previous.focus();previous=null;}
  };
  const observer=new MutationObserver(sync);
  document.querySelectorAll(selector).forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class']}));
  document.addEventListener('keydown',e=>{
    if(e.key!=='Tab'||!active)return;
    const list=controls(active),first=list[0],last=list[list.length-1];
    if(!first){e.preventDefault();active.focus();return;}
    if(e.shiftKey&&(document.activeElement===first||!active.contains(document.activeElement))){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&(document.activeElement===last||!active.contains(document.activeElement))){e.preventDefault();first.focus();}
  });
  sync();
}
bindDialogAccessibility();

// 回收冷缩略图，不触碰当前项目引用及持久化数据。
setInterval(()=>trimImageCache(),60000);

document.addEventListener('keydown',e=>{
  const el=e.target;
  if((e.key==='Enter'||e.key===' ')&&el?.matches('[role="button"][tabindex="0"]')){
    e.preventDefault();el.click();
  }
});

/* Strict-CSP migration: static shell actions are allowlisted, never evaluated as code. */
const shellActions=Object.freeze({
  'export-proposal':()=>exportProposalFile(),'print':()=>window.print(),
  'close-doc':()=>closeDoc(),'close-settings':()=>closeSettings(),'close-deploy':()=>closeDeployModal(),
  'close-confirm':()=>closeConfirm(),'close-name':()=>closeNameModal(),'create-project':()=>confirmNewProject(),
  'close-favorites':()=>closeFavPicker(),
  'settings-backdrop':(e,el)=>{if(e.target===el)closeSettings();},
  'deploy-backdrop':(e,el)=>{if(e.target===el)closeDeployModal();},
  'favorites-backdrop':(e,el)=>{if(e.target===el)closeFavPicker();}
});
document.addEventListener('click',e=>{
  const el=e.target.closest?.('[data-shell-action]');if(!el)return;
  const action=el.dataset.shellAction;
  if(Object.prototype.hasOwnProperty.call(shellActions,action))shellActions[action](e,el);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.dataset?.shellEnter==='create-project'){e.preventDefault();shellActions['create-project'](e,e.target);}
});

/* Strict-CSP Phase 2：动态模板 action 白名单。
   设计约束（docs/strict-csp.md）：只用 action id + 转义后的 data 属性；禁止任意函数名查找、
   禁止解析可执行表达式；参数按声明类型校验后才交给业务函数。注册表集中、可审计。
   每条：{fn: 直接函数引用, argc: 参数个数, types: 每个参数类型 ['s'|'n']}。 */
const ACTIONS=Object.freeze({
  'add-stuff':{fn:(k)=>addStuff(k),argc:1,types:['s']},
  'save-stuff-edit':{fn:(k,id)=>saveStuffEdit(k,id),argc:2,types:['s','s']},
  'toggle-stuff':{fn:(k,id)=>toggleStuff(k,id),argc:2,types:['s','s']},
  'del-stuff':{fn:(k,id)=>delStuff(k,id),argc:2,types:['s','s']},
  'add-budget':{fn:()=>addBudget(),argc:0,types:[]},
  'toggle-paid':{fn:(id)=>togglePaid(id),argc:1,types:['s']},
  'del-budget':{fn:(id)=>delBudget(id),argc:1,types:['s']},
  'add-todo':{fn:()=>addTodo(),argc:0,types:[]},
  'save-todo-edit':{fn:(id)=>saveTodoEdit(id),argc:1,types:['s']},
  'toggle-todo':{fn:(id)=>toggleTodo(id),argc:1,types:['s']},
  'del-todo':{fn:(id)=>delTodo(id),argc:1,types:['s']},
  'add-note':{fn:()=>addNote(),argc:0,types:[]},
  'save-note-edit':{fn:(id)=>saveNoteEdit(id),argc:1,types:['s']},
  'del-note':{fn:(id)=>delNote(id),argc:1,types:['s']},
  'cancel-inline-edit':{fn:()=>cancelInlineEdit(),argc:0,types:[]},
  /* 公共行按钮（editBtn / favBtn），全局共用：参数带可选 key，缺省时传空串由业务层忽略 */
  'begin-inline-edit':{fn:(kind,id,key)=>beginInlineEdit(kind,id,key),argc:3,types:['s','s','optional-s']},
  'toggle-fav':{fn:(type,id)=>toggleFav(type,id),argc:2,types:['s','s']},
  'open-fav-picker':{fn:()=>openFavPicker(),argc:0,types:[]},
  'set-sched-date':{fn:(d)=>setSchedDate(d),argc:1,types:["s"]},
  'toggle-new-day':{fn:()=>toggleNewDay(),argc:0,types:[]},
  'remove-shoot-day':{fn:(d)=>removeShootDay(d),argc:1,types:["s"]},
  'confirm-new-day':{fn:()=>confirmNewDay(),argc:0,types:[]},
  'add-node':{fn:()=>addNode(),argc:0,types:[]},
  'toggle-shot':{fn:(id)=>toggleShot(id),argc:1,types:["s"]},
  'save-node-edit':{fn:(id)=>saveNodeEdit(id),argc:1,types:["s"]},
  'toggle-node':{fn:(id)=>toggleNode(id),argc:1,types:["s"]},
  'toggle-node-lock':{fn:(id)=>toggleNodeLock(id),argc:1,types:["s"]},
  'del-node':{fn:(id)=>delNode(id),argc:1,types:["s"]},
  'sd-shift':{fn:(n)=>([-1,1].includes(n)&&sdShift(n)),argc:1,types:["n"]},
  'close-shoot-day':{fn:()=>closeShootDay(),argc:0,types:[]},
  'open-ref-viewer':{fn:(id,i)=>(Number.isInteger(i)&&i>=0&&i<3&&openRefViewer(id,i)),argc:2,types:["s","n"]},
  'sd-postpone':{fn:()=>sdPostpone(),argc:0,types:[]},
  'sd-disposition':{fn:(id,kind)=>sdDisposition(id,kind),argc:2,types:["s","s"]},
  'sd-toggle':{fn:(id)=>sdToggle(id),argc:1,types:["s"]},
  'sd-toggle-node':{fn:(id)=>sdToggleNode(id),argc:1,types:["s"]},
  'open-project':{fn:(id)=>openProject(id),argc:1,types:["s"]},
  'install-app':{fn:()=>installApp(),argc:0,types:[]},
  'open-settings':{fn:()=>openSettings(),argc:0,types:[]},
  'pick-backup':{fn:(id)=>(['importFile','assetImportFile','settingsImportFile'].includes(id)&&document.getElementById(id)?.click()),argc:1,types:["s"]},
  'clear-all':{fn:()=>clearAll(),argc:0,types:[]},
  'new-project':{fn:()=>newProject(),argc:0,types:[]},
  'board-scope':{fn:(scope)=>setDelegatedBoardScope(scope),argc:1,types:["s"]},
  'return-board':{fn:()=>returnDelegatedBoard(),argc:0,types:[]},
  'toggle-all-assets':{fn:()=>toggleAllAssets(),argc:0,types:[]},
  'export-selected-assets':{fn:()=>exportSelectedAssets(),argc:0,types:[]},
  'remove-asset-pack':{fn:(id)=>removeAssetPack(id),argc:1,types:["s"]},
  'jump-to-fav':{fn:(type,pid,id)=>(FAV_KINDS.includes(type)&&jumpToFav(type,pid,id)),argc:3,types:["s","s","s"]},
  'reference-fav':{fn:(type,pid,id)=>(FAV_KINDS.includes(type)&&referenceFav(type,pid,id)),argc:3,types:["s","s","s"]},
  'open-favorites':{fn:()=>openFavorites(),argc:0,types:[]},
  'toggle-gallery-sync':{fn:()=>toggleSettingsShiseiSync(),argc:0,types:[]},
  'run-gallery-sync':{fn:()=>runSettingsShiseiSync(),argc:0,types:[]},
  'clear-gallery':{fn:()=>clearShiseiGallery(),argc:0,types:[]},
  'run-toast-action':{fn:()=>runToastAction(),argc:0,types:[]},
  'reload-page':{fn:()=>location.reload(),argc:0,types:[]},
  'export-backup':{fn:()=>exportJSON(),argc:0,types:[]},
  'open-deploy':{fn:()=>openDeployModal(),argc:0,types:[]},
  'feedback-type':{fn:(type)=>setFeedbackType(type),argc:1,types:["s"]},
  'submit-feedback':{fn:()=>submitFeedback(),argc:0,types:[]},
  'copy-feedback':{fn:()=>copyFeedbackText(),argc:0,types:[]},
  'back-project-board':{fn:()=>backProjectBoard(),argc:0,types:[]},
  'show-project-notes':{fn:()=>showProjectNotes(),argc:0,types:[]},
  'export-project':{fn:(id)=>exportProject(id),argc:1,types:["s"]},
  'copy-demo':{fn:(id)=>copyDemoToMine(id),argc:1,types:["s"]},
  'open-shoot-day':{fn:()=>openShootDay(),argc:0,types:[]},
  'set-coordinates':{fn:(lat,lng)=>setDelegatedCoordinates(lat,lng),argc:2,types:["s","s"]},
  'switch-project-tab':{fn:(tab)=>switchProjectTab(tab),argc:1,types:["s"]},
  'open-doc':{fn:(type)=>(['proposal','callsheet','manual'].includes(type)&&openDoc(type)),argc:1,types:["s"]},
  'add-mood':{fn:(type)=>(['text','color'].includes(type)&&addMood(type)),argc:1,types:["s"]},
  'focus-mood-text':{fn:()=>document.getElementById('m_text')?.focus(),argc:0,types:[]},
  'pick-mood-image':{fn:()=>document.getElementById('m_img')?.click(),argc:0,types:[]},
  'toggle-ref-picker':{fn:()=>toggleRefPicker(),argc:0,types:[]},
  'mood-filter-mode':{fn:(mode)=>setMoodFilterMode(mode),argc:1,types:["s"]},
  'clear-mood-filter':{fn:()=>clearMoodFilter(),argc:0,types:[]},
  'add-tag-word':{fn:(word)=>addTagWord(word),argc:1,types:["s"]},
  'toggle-mood-filter-key':{fn:(key)=>toggleMoodFilterKey(key),argc:1,types:["s"]},
  'start-rename-tag':{fn:(label)=>startRenameTag(label),argc:1,types:["s"]},
  'del-tag-from-vocab':{fn:(label)=>delTagFromVocab(label),argc:1,types:["s"]},
  'open-tag-editor':{fn:(id)=>openTagEditor(id),argc:1,types:["s"]},
  'apply-ai-suggestion':{fn:(id)=>applyAiSuggestion(id),argc:1,types:["s"]},
  'del-mood':{fn:(id)=>delMood(id),argc:1,types:["s"]},
  'save-tag-editor':{fn:(id)=>saveTagEditor(id),argc:1,types:["s"]},
  'cancel-tag-editor':{fn:()=>cancelTagEditor(),argc:0,types:[]},
  'commit-rename-tag':{fn:(label)=>commitRenameTag(label),argc:1,types:["s"]},
  'select-ref-to-mood':{fn:(id)=>selectRefToMood(id),argc:1,types:["s"]}
});
/* 参数必须能 JSON.parse 成声明类型；实体 id / key 额外限长，避免超长垃圾进入业务层 */
function readActionArgs(el,spec){
  const out=[];
  for(let i=0;i<spec.argc;i++){
    const raw=el.dataset['a'+i];
    if(raw==null) return null;
    let v; try{ v=JSON.parse(raw); }catch{ return null; }
    const ok=spec.types[i]==='n'?(typeof v==='number'&&isFinite(v)):(typeof v==='string'&&(spec.types[i]==='optional-s'||v.length>0)&&v.length<=120);
    if(!ok) return null;
    out.push(v);
  }
  return out;
}
document.addEventListener('click',e=>{
  const el=e.target.closest?.('[data-do]'); if(!el) return;
  const spec=ACTIONS[el.dataset.do];
  if(!spec||!Object.prototype.hasOwnProperty.call(ACTIONS,el.dataset.do)) return;
  const args=readActionArgs(el,spec); if(!args) return;
  spec.fn.apply(null,args);
});
/* Enter 提交：data-enter="actionId"，共用同一白名单；阻止默认后触发 */
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter') return;
  const el=e.target.closest?.('[data-enter]'); if(!el) return;
  const spec=ACTIONS[el.dataset.enter];
  if(!spec||!Object.prototype.hasOwnProperty.call(ACTIONS,el.dataset.enter)) return;
  const args=readActionArgs(el,spec); if(!args) return;
  e.preventDefault(); spec.fn.apply(null,args);
});

/* Input values come from specific controls, not executable attributes. */
const DATE_CHANGE_ACTIONS=Object.freeze({'choose-sched-date':chooseSchedDate,'sd-set-date':sdSetDate});
document.addEventListener('change',e=>{
  const el=e.target;if(!el.matches?.('input[type="date"][data-change]'))return;
  const key=el.dataset.change;
  if(!Object.prototype.hasOwnProperty.call(DATE_CHANGE_ACTIONS,key))return;
  const value=el.value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!el.validity.valid)return;
  DATE_CHANGE_ACTIONS[key](value);
});

function setDelegatedBoardScope(scope){
  if(!['全部','进行中','已归档'].includes(scope))return;
  view.boardScope=scope;renderBoard();
}
function returnDelegatedBoard(){view=freshView();renderBoard();}
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.id==='boardSearch'&&el.dataset.input==='board-query')setBoardQuery(el.value);
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.matches?.('input[type="file"][data-change="import-backup"]')&&['importFile','assetImportFile','settingsImportFile'].includes(el.id))importJSON(e);
});

function backProjectBoard(){view.mode='board';renderBoard();}
function showProjectNotes(){view.tab='notes';renderProject();}
function setDelegatedCoordinates(lat,lng){
  const a=Number(lat),b=Number(lng);if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>90||Math.abs(b)>180)return;
  setLL(lat,lng);
}
document.addEventListener('change',e=>{
  const el=e.target;if(view.mode!=='project'||el.disabled)return;
  const action=el.dataset?.change;
  if(action==='workspace-mode'&&el.id==='workspaceMode')setWorkspaceMode(el.value);
  else if(action==='workspace-module'&&el.type==='checkbox'&&workspaceModules('professional').includes(el.dataset.module))toggleWorkspaceModule(el.dataset.module,el.checked);
  else if(action==='project-field'&&['INPUT','SELECT'].includes(el.tagName)){
    const field=el.dataset.field;
    if(['client','studio','status','location','lat','lng'].includes(field)&&(field!=='status'||STATUSES.includes(el.value)))setP(field,el.value);
  }else if(action==='shoot-date'&&el.id==='p_shootdate')setShootDate(el.value);
  else if(action==='project-time-zone'&&el.id==='p_timezone')setProjectTimeZone(el.value);
  else if(action==='pick-city'&&el.id==='cityPick')pickCity(el.value);
  else if(action==='mood-images'&&el.id==='m_img'&&el.type==='file'&&view.tab==='mood')addMoodImg(e);
});
document.addEventListener('input',e=>{
  const el=e.target;if(view.mode==='project'&&view.tab==='mood'&&el.id==='m_filter'&&el.dataset.input==='mood-filter')setMoodFilter(el.value);
});
document.addEventListener('dragover',e=>{if(e.target.closest?.('[data-image-drop="true"]'))allowImageDrop(e);});
document.addEventListener('drop',e=>{if(e.target.closest?.('[data-image-drop="true"]'))dropImages(e);});
