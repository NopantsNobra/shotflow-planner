/* ================= 启动 ================= */
(async()=>{
  document.head.insertAdjacentHTML('beforeend','<style id="cvPublicStyle">'+PUBLIC_STYLE+'</style>');
  window.addEventListener('resize',fitCovers);
  bindPersistFlush();   // P0：页面隐藏/关闭时冲刷未落盘数据
  await initData(); seed(); await ensureV9Demo(); renderBoard();
  shiseiInitReady=true; startShiseiSync();
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
