/* ================= 文档输出 ================= */
/* 现场一页纸：时间线 + 地点 + 器材 + 沟通要点，天气与联系电话留白现场填写 */
function callSheetHtml(p){
  const date=p.shootDate||todayStr();
  const items=dayItems(p,date);
  const sun=sunTimes(date,p.lat,p.lng);
  /* v10：机位 / 光线列仅在有值时才出现（避免空列占版面） */
  const anyPos=items.some(x=>x._t==='shot'&&x.position);
  const anyLight=items.some(x=>x._t==='shot'&&x.light);
  const cols=4+(anyPos?1:0)+(anyLight?1:0);
  const rows=items.length?items.map(x=>{
    const sc=p.scenes.find(s=>s.id===x.sceneId);
    const time=x._t==='shot'?(x._time||'—'):((x.start||'—')+(x.end?' – '+x.end:''));
    const name=x._t==='shot'?x.name:(x.type+' · '+x.title);
    return '<tr><td style="white-space:nowrap">'+esc(time)+'</td><td>'+esc(name)+'</td><td>'+esc(sc?sc.name:(x._t==='shot'?'—':''))+'</td><td>'+(x._t==='shot'?(x.duration+' 分钟'):'—')+'</td>'
      +(anyPos?'<td>'+esc(x._t==='shot'?(x.position||'—'):'—')+'</td>':'')
      +(anyLight?'<td>'+esc(x._t==='shot'?(x.light||'—'):'—')+'</td>':'')
      +'</tr>';
  }).join(''):'<tr><td colspan="'+cols+'">（未安排分镜或流程）</td></tr>';
  const scenes=p.scenes.map(s=>'<li>'+esc(s.name)+(s.note?'：'+esc(s.note):'')+'</li>').join('')||'<li>待定</li>';
  const kit=p.items.map(i=>'<li>'+esc(i.kind)+' · '+esc(i.name)+(i.note?'（'+esc(i.note)+'）':'')+'</li>').join('')||'<li>无</li>';
  const notes=[...(p.notes||[])].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,3).map(n=>'<li>['+esc(n.kind)+'] '+esc(n.content)+'</li>').join('')||'<li>无</li>';
  return '<h1>拍摄通告单</h1>'
    +'<p class="doc-sub">'+esc(p.name)+' · '+date+' · '+esc(p.location||'地点待定')+'</p>'
    +'<p style="text-align:center;font-size:12px;color:#746c5f">CALL SHEET｜瞬刻摄影工作台 · Stillmark｜定格一瞬，刻下永恒。</p>'
    +'<h2>当日时间线</h2><table><tr><th>时间</th><th>事项</th><th>场景</th><th>时长</th>'
    +(anyPos?'<th>机位</th>':'')+(anyLight?'<th>光线</th>':'')+'</tr>'+rows+'</table>'
    +(sun?'<p class="muted">日照参考：日出 '+sun.sunrise+' · 黄金时刻 '+sun.goldenStart+' · 日落 '+sun.sunset+'（近似值）</p>':'')
    +'<h2>联系方式与天气（现场填写）</h2><table>'
    +'<tr><th>客户联系人</th><td>＿＿＿＿＿＿　电话：＿＿＿＿＿＿＿＿＿＿＿</td></tr>'
    +'<tr><th>场地联系人</th><td>＿＿＿＿＿＿　电话：＿＿＿＿＿＿＿＿＿＿＿</td></tr>'
    +'<tr><th>天气 / 光线</th><td>＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</td></tr></table>'
    +'<h2>地点</h2><ul>'+scenes+'</ul>'
    +'<h2>器材 / 服装 / 道具</h2><ul>'+kit+'</ul>'
    +'<h2>沟通要点</h2><ul>'+notes+'</ul>'
    +(p.concept&&p.concept.note?'<p class="muted">创意备注：'+esc(p.concept.note)+'</p>':'');
}
async function openDoc(kind){
  const p=cur(); if(!p) return;
  await ensureShiseiRefs(p);
  /* 提案才提供「导出 HTML 文件」（原独立按钮已移入此处），通告单 / 手册走打印 */
  const exBtn=document.getElementById('docExportBtn');
  if(exBtn) exBtn.style.display=(kind==='proposal')?'':'none';
  if(kind==='callsheet'){
    document.getElementById('docBody').innerHTML=callSheetHtml(p);
    document.getElementById('docModal').classList.add('show');
    return;
  }
  const c=p.concept;
  const moodColors=p.mood.filter(m=>m.type==='color'), moodTexts=p.mood.filter(m=>m.type==='text'), moodImgs=p.mood.filter(m=>m.type==='image');
  const total=p.budget.reduce((s,b)=>s+(+b.amount||0),0);
  const sun=sunTimes(p.shootDate,p.lat,p.lng);
  const li=(arr,fn,cols)=>arr.length?arr.map(fn).join(''):'<tr><td colspan="'+(cols||4)+'" style="color:#999">（未填写）</td></tr>';
  /* v10：执行手册分镜表按需追加「机位」「光线」两列 */
  const anyPos=p.shots.some(s=>s.position), anyLight=p.shots.some(s=>s.light);
  let h=(kind==='proposal'
      ? coverHtml(p)
      : '<h1>'+esc(c.theme||p.name)+'</h1><p class="doc-sub">拍摄执行手册 · '+esc(p.name)+' · '+todayStr()+'</p>')
    +'<h2>一、主题概念</h2><dl class="kv">'
    +'<dt>拍摄主题</dt><dd>'+esc(c.theme||'—')+'</dd><dt>风格调性</dt><dd>'+esc(c.style||'—')+'</dd>'
    +'<dt>目标受众</dt><dd>'+esc(c.audience||'—')+'</dd><dt>成片用途</dt><dd>'+esc(c.usage||'—')+'</dd>'
    +'<dt>创意阐述</dt><dd>'+esc(c.note||'—')+'</dd></dl>'
    +'<h2>二、情绪板</h2>'
    +(moodColors.length?'<p>'+moodColors.map(m=>'<span class="swatch" style="background:'+esc(safeColor(m.content))+'"></span>').join('')+'</p>':'')
    +(moodImgs.length?'<p>'+moodImgs.map(m=>'<img src="'+esc(imgCache[m.content]||'')+'">').join('')+'</p>':'')
    +(moodTexts.length?'<ul>'+moodTexts.map(m=>'<li>'+esc(m.content)+(kind==='manual'?tagsForDisplay(m).map(t=>' <b>#'+esc(t)+'</b>').join(''):'')+'</li>').join('')+'</ul>':'');
  if(kind==='proposal'){
    h+='<h2>三、拍摄安排</h2><dl class="kv"><dt>拍摄日期</dt><dd>'+esc(p.shootDate||'待定')+'</dd>'
      +'<dt>拍摄地点</dt><dd>'+esc(p.location||'待定')+'</dd></dl>'
      +(sun?'<p class="muted">当日日照参考：日出 '+sun.sunrise+' · 黄金时刻 '+sun.goldenStart+' · 日落 '+sun.sunset+'</p>':'')
      +'<h2>四、报价</h2><table><tr><th>项目</th><th>金额</th></tr>'
      +'<tr><td>拍摄服务套餐（'+esc(p.name)+'）</td><td>¥'+total.toLocaleString()+'</td></tr></table>'
      +'<p class="muted" style="margin-top:6px">* 报价基于成本核算，最终价格以双方确认合同为准。</p>';
  } else {
    /* v10.3：执行手册分镜表按需追加「参考图」列——取每条分镜挂的参考图（我的素材 + 姿势图库，已由
       ensureShiseiRefs / cacheProjectImages 预载到 imgCache），图文对照便于现场直接执行；
       shisei 引用未同步到本机时给占位提示，不静默丢列 */
    const shotRefs=s=>(s.refIds||[]);
    const refCell=s=>shotRefs(s).length
      ?shotRefs(s).map(r=>imgCache[r]
        ?'<img class="shot-ref" src="'+esc(imgCache[r])+'" title="参考图">'
        :(String(r||'').startsWith('shisei:')?'<span class="shot-ref shot-ref-miss">图库未同步</span>':'')).join('')
      :'—';
    const anyRefs=p.shots.some(s=>shotRefs(s).length);
    h+='<h2>三、分镜头清单</h2><table><tr><th>时间</th><th>分镜</th>'+(anyRefs?'<th>参考图</th>':'')+'<th>场景</th><th>时长</th>'
      +(anyPos?'<th>机位</th>':'')+(anyLight?'<th>光线</th>':'')+'<th>备注</th></tr>'
      +li([...p.shots].sort((a,b)=>shotSortKey(a)<shotSortKey(b)?-1:1),
        s=>{const sc=p.scenes.find(x=>x.id===s.sceneId);return '<tr><td class="nw">'+esc(s.date||'')+' '+esc(s.slot||'')+'</td><td>'+esc(s.name)+'</td>'
          +(anyRefs?'<td class="ref-cell">'+refCell(s)+'</td>':'')
          +'<td>'+esc(sc?sc.name:'—')+'</td><td class="nw">'+s.duration+' 分钟</td>'
          +(anyPos?'<td>'+esc(s.position||'—')+'</td>':'')
          +(anyLight?'<td>'+esc(s.light||'—')+'</td>':'')
          +'<td>'+esc(s.note||'—')+'</td></tr>';},6+(anyRefs?1:0)+(anyPos?1:0)+(anyLight?1:0))
      +(anyRefs?'<p class="muted" style="margin:6px 0 14px">分镜参考图随手册打印 / 存为 PDF 一并输出；「图库未同步」的姿势参考需回应用端同步姿势图库后重新打开。</p>':'')+'</table>'
      +'<h2>四、拍摄日流程</h2><table><tr><th>时间</th><th>环节</th><th>内容</th><th>备注</th></tr>'
      +li([...p.schedule].sort((a,b)=>(a.start||'99')<(b.start||'99')?-1:1),
        n=>'<tr><td>'+esc(n.start||'')+(n.end?' – '+esc(n.end):'')+'</td><td>'+esc(n.type)+'</td><td>'+esc(n.title)+'</td><td>'+esc(n.note||'—')+'</td></tr>',4)+'</table>'
      +(sun?'<p class="muted">当日日照：日出 '+sun.sunrise+' · 黄金 '+sun.goldenStart+' · 日落 '+sun.sunset+'</p>':'')
      +'<h2>五、场景选址</h2><table><tr><th>地点</th><th>备注</th></tr>'
      +li(p.scenes,s=>'<tr><td>'+esc(s.name)+'</td><td>'+esc(s.note||'—')+'</td></tr>',2)+'</table>'
      +'<h2>六、服装造型道具 / 器材</h2><table><tr><th>类别</th><th>物品</th><th>备注</th></tr>'
      +li(p.items,s=>'<tr><td>'+esc(s.kind)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.note||'—')+'</td></tr>',3)+'</table>'
      +'<h2>七、待办事项</h2><table><tr><th>事项</th><th>负责人</th><th>截止</th><th>状态</th></tr>'
      +li(p.todos,x=>'<tr><td>'+esc(x.title)+'</td><td>'+esc(x.owner||'—')+'</td><td>'+esc(x.due||'—')+'</td><td>'+(x.done?'已完成':'待办')+'</td></tr>')
      +'</table>'
      +'<h2>八、预算明细</h2><table><tr><th>项目</th><th>类别</th><th>金额</th><th>状态</th></tr>'
      +li(p.budget,b=>'<tr><td>'+esc(b.item)+'</td><td>'+esc(b.cat)+'</td><td>¥'+(+b.amount).toLocaleString()+'</td><td>'+(b.paid?'已支付':'待支付')+'</td></tr>')
      +'</table><p style="text-align:right;margin-top:8px"><b>总预算：¥'+total.toLocaleString()+'</b></p>';
  }
  document.getElementById('docBody').innerHTML=h;
  document.getElementById('docModal').classList.add('show');
  fitCovers();
}
function closeDoc(){
  document.getElementById('docModal').classList.remove('show');
  const exBtn=document.getElementById('docExportBtn'); if(exBtn) exBtn.style.display='none';
}

/* 导出可发送的提案 HTML 文件（图片内嵌，微信可直接发） */
function exportProposalFile(){
  const p=cur(); if(!p) return;
  ensureShiseiRefs(p).then(()=>writeProposalFile(p));
}
async function writeProposalFile(p){
  const c=p.concept;
  const moodImgs=p.mood.filter(m=>m.type==='image'), moodTexts=p.mood.filter(m=>m.type==='text'), moodColors=p.mood.filter(m=>m.type==='color');
  const total=p.budget.reduce((s,b)=>s+(+b.amount||0),0);
  const sun=sunTimes(p.shootDate,p.lat,p.lng);
  const html='<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>'+esc(c.theme||p.name)+' · 摄影提案</title>'
    +'<style>body{margin:0;background:#E9E6E0}'+PUBLIC_STYLE+'</style></head><body><div class="export-page"><div class="doc">'
    +coverHtml(p)
    +'<h2>拍摄概念</h2><dl class="kv">'
    +'<dt>风格调性</dt><dd>'+esc(c.style||'—')+'</dd>'
    +'<dt>目标受众</dt><dd>'+esc(c.audience||'—')+'</dd>'
    +'<dt>成片用途</dt><dd>'+esc(c.usage||'—')+'</dd>'
    +'<dt>创意阐述</dt><dd>'+esc(c.note||'—')+'</dd></dl>'
    +'<h2>情绪参考</h2>'
    +(moodImgs.length?'<div class="imgs">'+moodImgs.map(m=>'<img src="'+esc(imgCache[m.content]||'')+'">').join('')+'</div>':'')
    +(moodColors.length?'<div>'+moodColors.map(m=>'<span class="sw" style="background:'+esc(safeColor(m.content))+'"></span>').join('')+'</div>':'')
    +(moodTexts.length?'<ul>'+moodTexts.map(m=>'<li>'+esc(m.content)+'</li>').join('')+'</ul>':'')
    +'<h2>拍摄安排</h2><dl class="kv">'
    +'<dt>拍摄日期</dt><dd>'+esc(p.shootDate||'待定')+'</dd>'
    +'<dt>拍摄地点</dt><dd>'+esc(p.location||'待定')+'</dd></dl>'
    +(sun?'<p class="muted">日照参考：日出 '+sun.sunrise+' · 黄金时刻 '+sun.goldenStart+' · 日落 '+sun.sunset+'</p>':'')
    +'<h2>服务报价</h2><table><tr><th>项目</th><th>金额</th></tr>'
    +'<tr><td>拍摄服务套餐（'+esc(p.name)+'）</td><td>¥'+total.toLocaleString()+'</td></tr></table>'
    +'<p class="muted">* 报价基于成本核算，最终价格以双方确认合同为准。</p>'
    +'<p class="ft">瞬刻摄影工作台 · Stillmark｜定格一瞬，刻下永恒。 · '+todayStr()+'</p></div></div>'
    +'<script>'+fitCovers.toString()+'\nwindow.addEventListener("resize",fitCovers);fitCovers();<\/script></body></html>';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  a.download='摄影提案_'+esc(p.name).replace(/[\\/:*?"<>|]/g,'')+'.html'; a.click();
  toast('提案文件已生成，微信可直接发送给客户');
}

/* ================= 备份 / 恢复 / 清空 ================= */
function downloadData(data,filename){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
  a.download=filename; a.click();
}
function collectImages(ps){
  const ids=new Set();
  ps.forEach(p=>{
    (p.mood||[]).filter(m=>m.type==='image').forEach(m=>ids.add(m.content));
    (p.refs||[]).forEach(r=>{ if(r&&r.key&&!String(r.key).startsWith('shisei:')) ids.add(r.key); });  // v10.4：参考图库也随备份导出
    (p.shots||[]).forEach(s=>(s.refIds||[]).forEach(r=>{ if(!String(r||'').startsWith('shisei:')) ids.add(r); }));
  });
  return ids;
}
async function imagesFor(ps){
  const out={};
  for(const id of collectImages(ps)){ const v=(imgCache[id]||await idb.get(id)); if(v) out[id]=v; }
  return out;
}
async function exportJSON(){
  const data={app:'stillmark',version:4,exportedAt:new Date().toISOString(),projects:loadP(),images:await imagesFor(loadP())};
  downloadData(data,'瞬刻摄影工作台备份_'+todayStr()+'.json');
}
async function exportProject(pid){
  const p=loadP().find(x=>x.id===pid); if(!p) return;
  downloadData({app:'stillmark',version:4,type:'project',exportedAt:new Date().toISOString(),project:p,images:await imagesFor([p])},
    '策划案_'+String(p.name||'未命名').replace(/[\\/:*?"<>|]/g,'')+'_'+todayStr()+'.json');
  toast('单项目备份已导出');
}
let pendingImport=null;
function importJSON(e){
  const f=e.target.files[0]; if(!f) return;
  const rd=new FileReader();
  rd.onload=ev=>{
    let d;
    try{ d=JSON.parse(ev.target.result); }catch(err){ toast('文件格式不正确，导入失败'); e.target.value=''; return; }
    const list=d.projects?d.projects:(d.project?[d.project]:null);
    if(!list||!list.length){ toast('文件中没有可导入的策划案'); e.target.value=''; return; }
    pendingImport=d;
    const names=list.slice(0,3).map(p=>p.name||'未命名').join('、')+(list.length>3?' 等':'');
    if(d.type==='project'||d.project){
      askConfirm('导入为新的策划案？','将新增 1 个策划案「'+(list[0].name||'未命名')+'」，不会覆盖现有数据。',applyImport);
    } else {
      askConfirm('导入将覆盖全部数据？','文件含 '+list.length+' 个策划案：'+names+'。此操作会替换当前全部数据，不可撤销；建议先导出备份。',applyImport);
    }
  };
  rd.readAsText(f); e.target.value='';
}
async function applyImport(){
  const d=pendingImport; if(!d){ return; }
  try{
    let arr;
    if(d.type==='project'||d.project){
      const p=migrate(d.project); delete p.v3; p.v3=1; p.id=uid(); p.name=(p.name||'导入的策划案')+'（导入）';
      arr=[...loadP(),p];
    } else {
      arr=d.projects.map(p=>{ migrate(p); p.v3=1; return p; });
    }
    if(d.images){ for(const k of Object.keys(d.images)){ await idb.put(k,d.images[k]); imgCache[k]=d.images[k]; } }
    saveP(arr);
    view=freshView(); renderBoard(); toast('导入成功，共 '+arr.length+' 个策划案');
  }catch(err){ toast('导入失败：数据格式或图片异常'); }
  finally{ pendingImport=null; }
}
let confirmCb=null;
function askConfirm(t,d,cb){ document.getElementById('confirmTitle').textContent=t; document.getElementById('confirmDesc').textContent=d; confirmCb=cb; document.getElementById('confirmModal').classList.add('show'); }
function closeConfirm(){ document.getElementById('confirmModal').classList.remove('show'); confirmCb=null; }
document.getElementById('confirmOk').onclick=()=>{ const cb=confirmCb; closeConfirm(); if(cb) cb(); };
function clearAll(){
  askConfirm('清空全部数据？','不可恢复！将删除所有策划案与图片，建议先导出备份。姿势图库缓存不受影响，可在情绪板 → 素材来源中单独清除。',async()=>{
    localStorage.removeItem(LS_PROJ);
    try{ localStorage.removeItem(LS_DEMO_V9); localStorage.removeItem(LS_SEED); }catch(e){}
    await idb.clearProjects();
    const keys=await idb.keys(); for(const k of keys) await idb.del(k);
    Object.keys(imgCache).forEach(k=>delete imgCache[k]);
    projectsCache=[];
    view=freshView(); renderBoard(); toast('已清空');
  });
}

/* ===== AI 打标签：接口预留（本期恒关闭，零网络请求） ===== */
function setAiConfig(k,v){
  aiConfig[k]=v;
  try{ sessionStorage.setItem('sf_ai_cfg_v1',JSON.stringify(aiConfig)); }catch(e){}
}
function registerTagProvider(name,provider){
  const n=String(name==null?'':name).trim();
  if(!n||!provider||typeof provider.suggest!=='function') return false;
  TagProviders[n]=provider; return true;
}
async function suggestTags(req,cfg){
  if(!AI_TAGGING_ENABLED) return {tags:[],source:'ai'};
  const prov=TagProviders[(cfg&&cfg.provider)||'default'];
  if(!prov) throw new Error('AI_TAGGING_PROVIDER_MISSING');
  const out=await prov.suggest(req,cfg);
  return {tags:dedupeTags(out&&out.tags),confidence:out&&out.confidence,source:'ai'};
}
async function requestAiTags(req,cfg){
  try{
    const r=await suggestTags(req,cfg);
    return r&&Array.isArray(r.tags)?r.tags:[];
  }catch(e){
    toast('AI 打标签暂不可用，已跳过（可手动添加标签）');
    return [];
  }
}
function stashAiSuggestion(moodId,tags){
  const list=dedupeTags(tags); if(!list.length) return;
  updateCur(p=>{
    const m=p.mood.find(x=>x.id===moodId); if(!m) return;
    m.autoTags=mergeVocab(m.autoTags,list);
  });
}
function applyAiSuggestion(moodId){
  const p=cur(), m=(p&&p.mood||[]).find(x=>x.id===moodId);
  if(!m||!m.autoTags||!m.autoTags.length) return;
  updateCur(pp=>{
    const mm=pp.mood.find(x=>x.id===moodId); if(!mm) return;
    mm.tags=mergeVocab(mm.tags,mm.autoTags);
    mm.tag=mm.tags[0]||'';
    pp.tagVocab=mergeVocab(pp.tagVocab,mm.tags);
    mm.autoTags=[];
  });
  renderProject(); toast('已采纳建议标签');
}

/* ===== shisei 姿势图库：空闲自动同步（零密钥，只用公开 CDN） ===== */
const SHISEI_CATALOG_URL='https://cdn.jsdelivr.net/gh/wquguru/shisei@main/data/catalog.json';
const SHISEI_CDN_BASE='https://cdn.jsdelivr.net/gh/wquguru/shisei@main/';
const SHISEI_META_KEY='catalog', SHISEI_SYNC_INTERVAL=24*60*60*1000, SHISEI_BATCH=3;
let shiseiInitReady=false;
let shiseiState={running:false,paused:false,total:0,done:0};
function shiseiSyncEnabled(){
  try{ return localStorage.getItem('wb_sf_shisei_sync')!=='0'; }catch(e){ return true; }
}
function shiseiCanStart(force){
  if(!shiseiInitReady||!shiseiSyncEnabled()||!navigator.onLine) return false;
  if(!force&&document.visibilityState!=='visible') return false;
  if(document.querySelector('.modal-mask.show')||document.getElementById('sdOverlay').classList.contains('show')) return false;
  return true;
}
function shiseiCatalogVersion(text){
  const s=String(text||''); let h=5381;
  for(let i=0;i<s.length;i++) h=(((h<<5)+h)+s.charCodeAt(i))>>>0;
  return s.length+'-'+h.toString(36);
}
function fetchShiseiWithTimeout(url,ms){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),ms);
  return fetch(url,{signal:ctrl.signal,mode:'cors'}).finally(()=>clearTimeout(timer));
}
function shiseiBlobToDataURL(blob){
  return new Promise((res,rej)=>{
    const rd=new FileReader();
    rd.onload=()=>res(String(rd.result||''));
    rd.onerror=()=>rej(rd.error||new Error('BLOB_READ_FAILED'));
    rd.readAsDataURL(blob);
  });
}
async function fetchShiseiImage(entry){
  let lastErr=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetchShiseiWithTimeout(SHISEI_CDN_BASE+String(entry.url||'').replace(/^\/+/,''),20000);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const data=await shiseiBlobToDataURL(await r.blob());
      if(!data) throw new Error('EMPTY_IMAGE');
      return data;
    }catch(e){ lastErr=e; }
  }
  throw lastErr||new Error('IMAGE_FETCH_FAILED');
}
function startShiseiSync(force){
  if(shiseiState.running) return;
  const schedule=window.requestIdleCallback?window.requestIdleCallback:cb=>setTimeout(cb,5000);
  schedule(async()=>{
    if(!shiseiCanStart(!!force)) { renderShiseiSyncStatus(); return; }
    try{
      const meta=await idb.getShiseiMeta(SHISEI_META_KEY);
      if(!force&&meta&&meta.failStreak>=3) return;
      const resumable=meta&&Array.isArray(meta.pending)&&meta.pending.length&&meta.cursor>0;
      if(!force&&meta&&meta.checkedAt&&!resumable&&Date.now()-meta.checkedAt<SHISEI_SYNC_INTERVAL) return;
      await runShiseiSync(!!force);
    }catch(e){ renderShiseiSyncStatus(); }
  });
}
async function runShiseiSync(force){
  if(shiseiState.running||(!force&&!shiseiSyncEnabled())) return;
  shiseiState={running:true,paused:false,total:0,done:0};
  renderShiseiSyncStatus();
  try{
    const r=await fetchShiseiWithTimeout(SHISEI_CATALOG_URL,15000);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const text=await r.text();
    const raw=JSON.parse(text);
    const remote=parseCatalog(raw), version=shiseiCatalogVersion(text);
    const local=await idb.shiseiIndex();
    const diff=diffCatalog(local,remote);
    for(const k of diff.toRemove){ await idb.delShiseiImg(k); if(imgCache[k]) delete imgCache[k]; }
    const remoteByKey=new Map(remote.map(e=>[shiseiItemKey(e),e]));
    let meta=await idb.getShiseiMeta(SHISEI_META_KEY);
    let pending=diff.toAdd.concat(diff.toUpdate).map(shiseiItemKey);
    let cursor=0;
    if(meta&&meta.version===version&&Array.isArray(meta.pending)&&meta.pending.length
      &&meta.pending.join('|')===pending.join('|')&&meta.cursor>0){
      pending=meta.pending; cursor=Math.min(meta.cursor,pending.length);
    }
    meta=mergeShiseiMeta(meta||{},{
      version,fetchedAt:Date.now(),checkedAt:Date.now(),total:remote.length,
      pending,cursor,failStreak:0,paused:false
    });
    await idb.putShiseiMeta(SHISEI_META_KEY,meta);
    if(!pending.length){ await finishShiseiSync(meta); return; }
    shiseiState.total=pending.length; shiseiState.done=cursor;
    while(cursor<pending.length){
      if(shiseiState.paused||!navigator.onLine||document.visibilityState!=='visible') break;
      const batch=nextPendingBatch({pending,cursor},SHISEI_BATCH);
      const results=await Promise.allSettled(batch.items.map(item=>{
        const entry=remoteByKey.get(item.key)||shiseiItemEntry(item.key,remoteByKey);
        return entry?fetchShiseiImage(entry).then(data=>{
          const rec={key:item.key,pid:entry.pid,cat:entry.cat,view:entry.view,zh:entry.zh,en:entry.en,ja:entry.ja,data,syncedAt:Date.now()};
          return idb.putShiseiImg(item.key,rec).then(()=>({ok:true,key:item.key,data}));
        }):Promise.reject(new Error('CATALOG_ENTRY_MISSING'));
      }));
      let failed=0, quotaHit=false;
      for(let i=0;i<results.length;i++){
        const item=batch.items[i], out=results[i];
        if(out.status==='fulfilled'&&out.value&&out.value.data){
          imgCache[item.key]=out.value.data;
        } else {
          failed++;
          const reason=out.reason;
          quotaHit=quotaHit||(reason&&(reason.name==='QuotaExceededError'||/quota/i.test(String(reason.message||reason.name||''))));
        }
      }
      cursor=batch.cursor;
      shiseiState.done=cursor;
      meta=mergeShiseiMeta(meta,{cursor,failStreak:(meta.failStreak||0)+failed});
      if(failed>=3) meta.paused=true;
      await idb.putShiseiMeta(SHISEI_META_KEY,meta);
      if(quotaHit) throw Object.assign(new Error('本地空间不足'),{name:'QuotaExceededError'});
      renderShiseiSyncStatus();
      if(meta.paused) break;
      await new Promise(res=>setTimeout(res,30)); // 空闲节流
    }
    if(shiseiState.paused||!navigator.onLine||document.visibilityState!=='visible'){
      await idb.putShiseiMeta(SHISEI_META_KEY,mergeShiseiMeta(meta,{paused:true,checkedAt:Date.now()}));
      shiseiState.paused=true;
    } else {
      await finishShiseiSync(meta);
    }
  }catch(e){
    let meta=await idb.getShiseiMeta(SHISEI_META_KEY);
    const failStreak=((meta&&meta.failStreak)||0)+1;
    meta=mergeShiseiMeta(meta||{},{
      failStreak,checkedAt:Date.now(),
      paused:e&&e.name==='QuotaExceededError'?true:(failStreak>=3?true:(meta&&meta.paused)||false)
    });
    await idb.putShiseiMeta(SHISEI_META_KEY,meta).catch(()=>{});
    if(e&&e.name==='QuotaExceededError') toast('本地空间不足，可在素材来源里清除姿势图库');
    shiseiState.paused=true;
  }finally{
    shiseiState.running=false;
    renderShiseiSyncStatus();
  }
}
function shiseiItemEntry(key,remoteByKey){
  const m=/^shisei:(.*):([^:]*)$/.exec(String(key||''));
  return m?remoteByKey.get(key)||null:null;
}
async function finishShiseiSync(meta){
  await idb.putShiseiMeta(SHISEI_META_KEY,mergeShiseiMeta(meta,{pending:[],cursor:0,checkedAt:Date.now(),paused:false}));
  shiseiState.paused=false;
}
async function renderShiseiSyncStatus(){
  const box=document.getElementById('shiseiSyncBox'); if(!box) return;
  let meta=null, stats={count:0,bytes:0,avg:0};
  try{ meta=await idb.getShiseiMeta(SHISEI_META_KEY); stats=await idb.shiseiImgStats(); }catch(e){}
  let stat='未同步';
  if(!shiseiSyncEnabled()) stat='已暂停';
  else if(shiseiState.running) stat=(shiseiState.paused?'已暂停':'进行中 ')+Math.min(shiseiState.done,shiseiState.total||0)+'/'+(shiseiState.total||0);
  else if(meta&&meta.paused) stat='已暂停';
  else if(meta&&meta.failStreak>=3) stat='连续失败 '+meta.failStreak+' 次';
  else if(meta&&meta.total&&stats.count) stat='已同步 '+stats.count+'/'+meta.total;
  else if(stats.count) stat='已同步 '+stats.count+' 张';
  const mb=(stats.bytes/1024/1024).toFixed(1), kb=(stats.avg/1024).toFixed(1);
  box.innerHTML='<div class="src-sync"><div><b>姿势图库同步</b> <span class="muted">'+esc(stat)+' · '+stats.count+' 张'
    +(stats.count?' · 约 '+mb+' MB（平均 '+kb+' KB）':'')+'</span></div>'
    +'<div class="row" style="margin-top:6px">'
    +'<button class="btn btn-ghost btn-sm" onclick="toggleShiseiSync()">'+(shiseiSyncEnabled()?'暂停':'恢复')+'</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="startShiseiSync(true)">立即同步</button>'
    +(stats.count?'<button class="btn btn-danger btn-sm" onclick="clearShiseiGallery()">清除图库</button>':'')
    +'</div></div>';
}
function toggleShiseiSync(){
  if(shiseiSyncEnabled()){
    try{ localStorage.setItem('wb_sf_shisei_sync','0'); }catch(e){}
    if(shiseiState.running) shiseiState.paused=true;
  } else {
    try{ localStorage.removeItem('wb_sf_shisei_sync'); }catch(e){}
    startShiseiSync(true);
  }
  renderShiseiSyncStatus();
}
function clearShiseiGallery(){
  askConfirm('清除姿势图库？','将删除本机缓存的图库缩略图与同步进度；分镜里已引用的图库图会显示为「图库原图已更新」占位，不会改动分镜数据。',async()=>{
    try{ await idb.clearShisei(); }catch(e){ toast('清除失败'); return; }
    Object.keys(imgCache).forEach(k=>{ if(String(k).startsWith('shisei:')) delete imgCache[k]; });
    shiseiState={running:false,paused:false,total:0,done:0};
    renderShiseiSyncStatus();
    if(view.mode==='project'&&view.tab==='shots') renderShots(cur());
    toast('姿势图库已清除');
  });
}
async function ensureShiseiImage(key){
  if(!String(key||'').startsWith('shisei:')) return imgCache[key]||'';
  if(imgCache[key]) return imgCache[key];
  try{
    const rec=await idb.getShiseiImg(key);
    if(rec&&rec.data){
      imgCache[key]=rec.data;
      document.querySelectorAll('[data-shisei-key]').forEach(el=>{
        if(el.dataset.shiseiKey===key){ const img=el.querySelector('img'); if(img) img.src=rec.data; }
      });
      return rec.data;
    }
  }catch(e){}
  return '';
}
async function ensureShiseiRefs(p){
  const keys=[...new Set(((p&&p.shots)||[]).flatMap(s=>s.refIds||[]).filter(k=>String(k||'').startsWith('shisei:')))];
  for(const k of keys){
    if(imgCache[k]) continue;
    try{ const rec=await idb.getShiseiImg(k); if(rec&&rec.data) imgCache[k]=rec.data; else if(imgCache[k]) delete imgCache[k]; }
    catch(e){}
  }
}

/* ================= Toast ================= */
let toastTimer=null;
function toast(msg,ms,action){
  let t=document.getElementById('toast');
  if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  /* action: {label, fn} —— toast 内联操作按钮（撤销 / 刷新等），toast 关闭即失效 */
  t.innerHTML=esc(msg)
    +(action?'<button onclick="runToastAction()">'+esc(action.label)+'</button>':'')
    +(msg==='发现新版本'&&!action?'<button onclick="location.reload()">刷新</button>':'');
  toastAction=action&&typeof action.fn==='function'?action.fn:null;
  requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ t.classList.remove('show'); toastAction=null; },ms||2800);
}
let toastAction=null;
function runToastAction(){ const fn=toastAction; toastAction=null; clearTimeout(toastTimer); document.getElementById('toast').classList.remove('show'); if(fn) fn(); }

/* ================= PWA ================= */
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault(); deferredPrompt=e;
  const b=document.getElementById('installBtn'); if(b) b.style.display='';
});
window.addEventListener('appinstalled',()=>{ deferredPrompt=null; const b=document.getElementById('installBtn'); if(b) b.style.display='none'; });
function installApp(){ if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt.userChoice.then(()=>{ deferredPrompt=null; }); } }
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  navigator.serviceWorker.register('shotflow-sw.js').then(reg=>{
    reg.addEventListener('updatefound',()=>{
      const nw=reg.installing;
      if(nw) nw.addEventListener('statechange',()=>{
        if(nw.state==='installed'&&navigator.serviceWorker.controller) toast('发现新版本',8000);
      });
    });
  }).catch(()=>{});
}
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  const shown=id=>document.getElementById(id).classList.contains('show');
  if(shown('refViewer')){ closeRefViewer(); return; }
  if(shown('confirmModal')){ closeConfirm(); return; }
  if(shown('nameModal')){ closeNameModal(); return; }
  if(shown('settingsModal')){ closeSettings(); return; }   // v10.6.0：设置弹窗后开先关（位于 confirm/name 之后判断）
  if(cancelInlineEdit()) return;
  if(cancelShotEdit()) return;
  closeDoc(); closeShootDay();
});

