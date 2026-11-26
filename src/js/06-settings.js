/* ================= 设置弹窗（v10.6.0）：版本信息 / 模块配置 / 数据备份 / 反馈 ================= */
/* 硬约束：本文件顶层只允许 function 声明，禁止顶层 let/const——构建拼接顺序在 05-boot.js 之后，
   boot 段有立即执行的启动代码，顶层 let/const 会因 TDZ 崩溃；所需常量集中在 01-data.js
   （APP_VERSION / MODULE_VERSIONS / FB_KEY_A / FB_KEY_B——反馈表单 access key，双层混淆，明文只在运行时还原）。
   隔离纪律：不占用 view.mode、不触碰渲染主循环（openSettings/closeSettings 只切换弹窗 class +
   填充弹窗内容）；FB-1——反馈表单输入不挂任何全局重绘，提交时直接读 DOM。 */

/* ---------- 纯函数（供逻辑测试抽取，函数体内禁 document/window/parseInt/isNaN/Boolean(...)） ---------- */
/* 反馈类型显示名：Bug → Bug、功能建议 → 建议、其他 → 其他（未知值回退「其他」） */
function feedbackTypeLabel(t){
  return t==='bug'?'Bug':(t==='idea'?'建议':'其他');
}
/* 反馈环境信息（纯函数）：只读字段全部经参数传入，浏览器侧由 collectFeedbackEnv() 采集。
   仅版本 / 浏览器环境 / 数据规模计数，不含任何策划案内容 */
function buildFeedbackEnv(e){
  const d=e||{};
  const ver=String(d.version||APP_VERSION);
  const sw=String(d.swCache||MODULE_VERSIONS.swCache);
  const db=d.dbVersion==null?MODULE_VERSIONS.dbSchema:d.dbVersion;
  const scr=(d.screenW&&d.screenH)?(d.screenW+'×'+d.screenH):'未知';
  const dpr=d.dpr==null?1:d.dpr;
  const state='IndexedDB '+(d.idbOk===false?'不可用':'可用')
    +' / 剪贴板 API '+(d.clipboardOk?'可用':'不可用')
    +' / '+(d.online===false?'离线':'在线');
  const pc=typeof d.projectCount==='number'?d.projectCount:0;
  return '版本：v'+ver+'（SW 缓存 '+sw+' / 数据结构 '+db+'）'
    +'\n环境：'+String(d.userAgent||'')
    +'\n平台：'+String(d.platform||'')+' · 语言 '+String(d.language||'')+' · 屏幕 '+scr+'（devicePixelRatio '+dpr+'）'
    +'\n状态：'+state
    +'\n项目数：'+pc;
}
/* 反馈表单 access key 还原（纯函数）：双层混淆解码，明文只在本函数返回值中出现，
   调用方不得打印到 console、不得写入 DOM。失败/异常一律返回空串。
   注意：密文含 '='（CS 索引 64 的合法密文字符），base64 阶段按通用 padding 处理。 */
function fbDecodeKey(){
  const CS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const s = FB_KEY_A + FB_KEY_B.split('').reverse().join('');
  let b1 = '';
  for (let i = 0; i < s.length; i++){
    const idx = CS.indexOf(s.charAt(i));
    if (idx < 0) return '';
    b1 += CS.charAt(((idx - 11 + 65) * 23) % 65);
  }
  const out = [];
  for (let i = 0; i < b1.length; i += 4){
    const g = [];
    for (let k = 0; k < 4; k++){ const c = b1.charAt(i+k) || '='; const ci = CS.indexOf(c); g.push(ci < 0 ? 0 : ci); }
    out.push((g[0] << 2) | (g[1] >> 4));
    if (g[2] !== 64 && i + 2 < b1.length) out.push(((g[1] & 15) << 4) | (g[2] >> 2));
    if (g[3] !== 64 && i + 3 < b1.length) out.push(((g[2] & 3) << 6) | g[3]);
  }
  try{ return String.fromCharCode.apply(null, out); }catch{ return ''; }
}
/* 反馈提交负载（纯函数）：Web3Forms 页面内 POST 用。access_key 由 fbDecodeKey() 运行时还原，
   只在请求体中出现，不打印、不落 DOM。message 超过 20000 字符时截断并追加提示（保护请求体积）；
   复制反馈内容为失败兜底通道。key 解码失败返回 null（调用方只 toast）。 */
function buildFeedbackPayload(type,title,body,envText){
  const key=fbDecodeKey();
  if(!key||key.length!==36) return null;
  const prefix='['+feedbackTypeLabel(type)+'] '+String(title==null?'':title);
  let msg=String(body==null?'':body)+'\n\n---\n'+String(envText==null?'':envText);
  if(msg.length>20000) msg=msg.slice(0,20000)+'…（描述过长已截断）';
  return {access_key:key,subject:prefix,from_name:'瞬刻摄影工作台',message:msg};
}

/* ---------- 打开 / 关闭 ---------- */
function openSettings(){
  renderSettings();
  document.getElementById('settingsModal').classList.add('show');
}
function closeSettings(){
  document.getElementById('settingsModal').classList.remove('show');
}

/* ---------- 渲染（只写 #settingsBody，不触碰页面 DOM） ---------- */
function renderSettings(){
  const host=document.getElementById('settingsBody'); if(!host) return;
  host.innerHTML=settingsVersionHtml()+settingsConfigHtml()+settingsDataHtml()+settingsDeployHtml()+settingsFeedbackHtml();
  const env=document.getElementById('fbEnvPreview');
  if(env) env.textContent=buildFeedbackEnv(collectFeedbackEnv());
  renderSettingsShisei();
}

/* ① 版本信息（只读）：R1 应用版本 / R2 SW 缓存 / R3 IndexedDB schema / R4 数据规模 / R5 模块版本表 */
function settingsVersionHtml(){
  const dbVer=(idb.db&&idb.db.version)?idb.db.version:MODULE_VERSIONS.dbSchema;
  const imgN=Object.keys(imgCache).length;
  const rows=[['shell.html（页面骨架）',MODULE_VERSIONS.shell],['styles.css（样式）',MODULE_VERSIONS.styles],
    ['01-data.js（数据层）',MODULE_VERSIONS.data],['02-core.js（核心纯函数）',MODULE_VERSIONS.core],
    ['03-*.js（六个业务域）',MODULE_VERSIONS.app],['04-output.js（输出与后台）',MODULE_VERSIONS.output],
    ['05-boot.js（启动）',MODULE_VERSIONS.boot],['06-settings.js（设置与反馈）',MODULE_VERSIONS.settings]];
  return '<div class="card"><h2>版本信息</h2>'
    +'<div class="settings-ver">v'+esc(APP_VERSION)+'</div>'
    +'<dl class="settings-kv">'
    +'<dt>Service Worker 缓存</dt><dd>'+esc(MODULE_VERSIONS.swCache)+'</dd>'
    +'<dt>数据结构（IndexedDB）</dt><dd>'+dbVer+'</dd>'
    +'<dt>数据规模</dt><dd>'+loadP().length+' 个策划案 · '+imgN+' 张已载图片</dd>'
    +'<dt>保存状态</dt><dd>'+esc(persistConflict?'存储冲突 · 请备份':persistFailed?'保存失败 · '+(persistLastError||'未知原因'):pendingPersist?'待保存':idb.ready()?'已保存':'存储不可用')+'</dd>'
    +'</dl>'
    +'<details class="src-panel"><summary>各代码模块最后实质变更</summary>'
    +'<dl class="settings-kv" style="margin-top:8px">'+rows.map(r=>'<dt>'+r[0]+'</dt><dd>'+esc(r[1])+'</dd>').join('')
    +'<dt>Service Worker 缓存</dt><dd>'+esc(MODULE_VERSIONS.swCache)+'</dd></dl>'
    +'<p class="muted" style="margin-top:8px">模块版本自 '+esc(MODULE_VERSIONS.since)+' 源码模块化起记录；拆分前的单文件历史无法按模块归因。</p>'
    +'</details></div>';
}

/* ② 模块配置：C1 姿势图库同步开关 + C2 立即同步/清除 + J3 PWA 安装（状态行异步填充，见 renderSettingsShisei） */
function settingsConfigHtml(){
  return '<div class="card"><h2>模块配置</h2>'
    +'<div id="settingsShiseiBox"><p class="muted">正在读取姿势图库状态…</p></div>'
    +'<div class="src-sync"><div><b>安装到桌面</b> <span class="muted">把工作台作为应用安装，离线也能打开</span></div>'
    +'<div class="row" style="margin-top:6px">'
    +(deferredPrompt
      ?'<button class="btn btn-ghost btn-sm" onclick="installApp()">安装到桌面</button>'
      :'<span class="muted">已安装或当前浏览器不支持安装</span>')
    +'</div></div>'
    +'</div>';
}
/* 姿势图库状态行（设置弹窗自备渲染，不共享情绪板的 #shiseiSyncBox，避免重复 id）：
   renderShiseiSyncStatus() 开头对不存在的 box 安全空转，故直接复用既有开关/同步函数后在此自刷新 */
function renderSettingsShisei(){return renderShiseiStatusInto('settingsShiseiBox');}
function toggleSettingsShiseiSync(){
  toggleShiseiSync();        // 复用既有开关：写 localStorage['wb_sf_shisei_sync'] / 暂停或恢复同步
  renderSettingsShisei();    // 设置弹窗内状态行自刷新
}
function runSettingsShiseiSync(){
  startShiseiSync(true);     // 复用既有立即同步（空闲调度 + 失败退避），零逻辑复制
  renderSettingsShisei();
}

/* ③ 数据与备份：J1 导出（复用 exportJSON）/ J2 导入（独立 id settingsImportFile——看板页 #importFile
   仍在 DOM，不能重 id；onchange 同样交 importJSON(event)，其按 event.target 取文件）+ J4 词表说明 */
function settingsDataHtml(){
  const needBackup=backupItemCount(loadP())>=30;
  return '<div class="card"><h2>数据与备份</h2>'
    +(needBackup?'<p class="src-note">数据较多，建议定期「导出备份」留档。</p>':'')
    +'<div class="row">'
    +'<button class="btn btn-ghost btn-sm" onclick="exportJSON()">导出备份</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'settingsImportFile\').click()">导入备份</button>'
    +'</div>'
    +'<input type="file" id="settingsImportFile" accept=".json,.zip,application/zip" style="display:none" onchange="importJSON(event)">'
    +'<p class="src-note" style="margin-top:10px">标签词表为项目级数据：在各策划案的「情绪板」页编辑（改词 / 删词入口在标签云上），不设全局词表。</p>'
    +'</div>';
}

/* ④ 关于与部署：静态单文件说明 + 「为自己部署」入口（打开 #deployModal 只读说明窗） */
function settingsDeployHtml(){
  return '<div class="card" id="deployCard"><h2>关于与部署</h2>'
    +'<p class="src-note">本应用是纯静态单文件 PWA：<code>shotflow.html</code> 由 <code>src/</code> 构建产出，'
    +'可部署到任意静态托管（GitHub Pages / Cloudflare Pages / Vercel / 自有服务器），无需后端与数据库。</p>'
    +'<div class="row"><button class="btn btn-primary btn-sm" onclick="openDeployModal()">为自己部署</button>'
    +'<a class="btn btn-ghost btn-sm" href="./docs/agent-guide.md" target="_blank" rel="noopener">外部 Agent 操作指南</a>'
    +'<a class="btn btn-ghost btn-sm" href="https://github.com/NopantsNobra/shotflow-planner/blob/refactor/portable-agent/docs/agent-guide.md" target="_blank" rel="noopener noreferrer">在线指南备用链接</a>'
    +'<span class="muted" style="font-size:11.5px">MIT License © 2026 Stillmark-服雲</span></div></div>';
}
/* 部署说明弹窗：只切换 class；Esc / 点遮罩 / 关闭按钮三种退出方式 */
function openDeployModal(){ document.getElementById('deployModal').classList.add('show'); }
function closeDeployModal(){ document.getElementById('deployModal').classList.remove('show'); }

/* ⑤ 反馈：类型 seg（默认 Bug）+ 标题（必填）/ 描述（选填）+ 环境信息只读预览 + 主/兜底两通道 + 隐私说明 */
function settingsFeedbackHtml(){
  const types=['bug','idea','other'];
  return '<div class="card" id="fbCard"><h2>反馈</h2>'
    +'<div class="settings-form">'
    +'<div class="seg" id="fbTypeSeg" style="align-self:flex-start">'
    +types.map((t,i)=>'<button class="'+(i===0?'on':'')+'" data-fb-type="'+t+'" onclick="setFeedbackType(\''+t+'\')">'+feedbackTypeLabel(t)+'</button>').join('')
    +'</div>'
    +'<input id="fbTitle" maxlength="80" placeholder="标题（必填，80 字内）">'
    +'<textarea id="fbBody" maxlength="4000" placeholder="描述：做了什么、期望什么、实际发生什么（选填，4000 字内）"></textarea>'
    +'<details class="src-panel"><summary>环境信息（自动生成，随反馈一并发送）</summary>'
    +'<div class="settings-env" id="fbEnvPreview"></div></details>'
    +'<div class="row">'
    +'<button class="btn btn-primary btn-sm" id="fbSubmitBtn" onclick="submitFeedback()">提交反馈</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="copyFeedbackText()">复制反馈内容</button>'
    +'</div>'
    +'<p class="muted">反馈内容（类型 / 标题 / 描述 + 应用版本与浏览器环境信息）通过第三方表单服务 Web3Forms 发送给维护者，不包含任何项目数据、图片或个人信息。</p>'
    +'</div></div>';
}
function setFeedbackType(t){
  const seg=document.getElementById('fbTypeSeg'); if(!seg) return;
  const btns=seg.querySelectorAll('button');
  for(let i=0;i<btns.length;i++){
    const b=btns[i];
    if(b.getAttribute('data-fb-type')===t) b.classList.add('on'); else b.classList.remove('on');
  }
}
function currentFeedbackType(){
  const seg=document.getElementById('fbTypeSeg');
  if(!seg) return 'bug';
  const on=seg.querySelector('button.on');
  return on?on.getAttribute('data-fb-type'):'bug';
}
/* 浏览器侧环境采集（DOM 函数，不进逻辑测试）：全部只读 API，不做全库 idb 扫描 */
function collectFeedbackEnv(){
  return {
    version:APP_VERSION, swCache:MODULE_VERSIONS.swCache,
    dbVersion:(idb.db&&idb.db.version)?idb.db.version:MODULE_VERSIONS.dbSchema,
    userAgent:navigator.userAgent, platform:navigator.platform, language:navigator.language,
    screenW:screen.width, screenH:screen.height, dpr:window.devicePixelRatio,
    idbOk:!!window.indexedDB,
    clipboardOk:!!(navigator.clipboard&&navigator.clipboard.writeText),
    online:navigator.onLine, projectCount:loadP().length
  };
}
/* 主通道：Web3Forms 页面内提交（fetch POST，不跳转、不拉起邮件客户端；失败静默降级到复制兜底） */
async function submitFeedback(){
  const title=String(gv('fbTitle')||'').trim();
  if(!title){ toast('请先填写反馈标题'); return; }
  const body=String(gv('fbBody')||'');
  const payload=buildFeedbackPayload(currentFeedbackType(),title,body,buildFeedbackEnv(collectFeedbackEnv()));
  if(!payload){ toast('反馈提交暂不可用，请使用「复制反馈内容」'); return; }
  const btn=document.getElementById('fbSubmitBtn');
  if(btn){ btn.disabled=true; btn.textContent='提交中…'; }
  try{
    const res=await fetch('https://api.web3forms.com/submit',{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify(payload)
    });
    const data=await res.json().catch(function(){ return null; });
    if(res.ok&&data&&data.success){
      toast('反馈已提交，感谢！');
      const t=document.getElementById('fbTitle'); if(t) t.value='';
      const b=document.getElementById('fbBody'); if(b) b.value='';
    } else {
      toast('提交失败，请使用「复制反馈内容」');
    }
  } catch{
    toast('网络异常，请使用「复制反馈内容」');
  } finally {
    if(btn){ btn.disabled=false; btn.textContent='提交反馈'; }
  }
}
/* 反馈纯文本（标题 + 类型 + 描述 + 环境信息），提交被拦截 / 剪贴板不可用时手动粘贴兜底 */
function feedbackPlainText(){
  const title=String((document.getElementById('fbTitle')||{}).value||'').trim();
  const body=String((document.getElementById('fbBody')||{}).value||'');
  return '['+feedbackTypeLabel(currentFeedbackType())+'] '+title+'\n\n'+body+'\n\n---\n'+buildFeedbackEnv(collectFeedbackEnv());
}
/* 兜底通道：navigator.clipboard → 隐藏 textarea + execCommand('copy') → 仍失败提示手动复制 */
function copyFeedbackText(){
  const title=String((document.getElementById('fbTitle')||{}).value||'').trim();
  if(!title){ toast('请先填写反馈标题'); return; }
  const text=feedbackPlainText();
  const done=()=>toast('已复制反馈内容，可粘贴到任意渠道发给维护者');
  const fail=()=>toast('复制失败：请在弹窗内手动选中文本复制');
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done,()=>{ if(!legacyCopy(text)) fail(); });
  } else if(legacyCopy(text)){ done(); } else { fail(); }
}
function legacyCopy(text){
  try{
    const ta=document.createElement('textarea');
    ta.value=text;
    ta.style.position='fixed'; ta.style.left='0'; ta.style.top='0'; ta.style.opacity='0';
    document.body.appendChild(ta);
    ta.select();
    const ok=document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }catch{ return false; }
}
