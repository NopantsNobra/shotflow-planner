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
  if(document.visibilityState!=='visible'&&shiseiState.running){ shiseiState.paused=true; renderShiseiSyncStatus(); }
  else if(document.visibilityState==='visible'&&!shiseiState.running&&shiseiState.paused){ startShiseiSync(); }
});
window.addEventListener('offline',()=>{
  if(shiseiState.running){ shiseiState.paused=true; renderShiseiSyncStatus(); }
});
window.addEventListener('online',()=>{
  if(!shiseiState.running) startShiseiSync();
});
