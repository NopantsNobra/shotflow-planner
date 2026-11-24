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
