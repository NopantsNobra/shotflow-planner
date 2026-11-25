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
      +'<button class="btn btn-primary" onclick="location.reload()">刷新重试</button></div>';
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
  'begin-inline-edit':{fn:(kind,id,key)=>beginInlineEdit(kind,id,key),argc:3,types:['s','s','s']},
  'toggle-fav':{fn:(type,id)=>toggleFav(type,id),argc:2,types:['s','s']},
  'open-fav-picker':{fn:()=>openFavPicker(),argc:0,types:[]}
});
/* 参数必须能 JSON.parse 成声明类型；实体 id / key 额外限长，避免超长垃圾进入业务层 */
function readActionArgs(el,spec){
  const out=[];
  for(let i=0;i<spec.argc;i++){
    const raw=el.dataset['a'+i];
    if(raw==null) return null;
    let v; try{ v=JSON.parse(raw); }catch(e){ return null; }
    const ok=spec.types[i]==='n'?(typeof v==='number'&&isFinite(v)):(typeof v==='string'&&v.length>0&&v.length<=120);
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
