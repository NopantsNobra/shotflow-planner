/* ================= 文档输出 ================= */
/* 现场一页纸：时间线 + 地点 + 器材 + 沟通要点，天气与联系电话留白现场填写 */
function callSheetHtml(p){
  const date=p.shootDate||todayStr();
  const items=dayItems(p,date);
  const sun=sunTimes(date,p.lat,p.lng,projectTimeZone(p));
  /* v10：机位 / 光线列仅在有值时才出现（避免空列占版面） */
  const anyPos=items.some(x=>x._t==='shot'&&x.position);
  const anyLight=items.some(x=>x._t==='shot'&&x.light);
  const cols=4+(anyPos?1:0)+(anyLight?1:0);
  const rows=items.length?items.map(x=>{
    const sc=p.scenes.find(s=>s.id===x.sceneId);
    const time=x._t==='shot'?(x._time||'—'):((x.start||'—')+(x.end?' – '+x.end:''));
    const name=x._t==='shot'?x.name:(x.type+' · '+x.title);
    return '<tr><td style="white-space:nowrap">'+esc(time)+'</td><td>'+esc(name)+'</td><td>'+esc(sc?sc.name:(x._t==='shot'?'—':''))+'</td><td>'+(x._t==='shot'?((+x.duration||0)+' 分钟'):'—')+'</td>'
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
  const sun=sunTimes(p.shootDate,p.lat,p.lng,projectTimeZone(p));
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
          +'<td>'+esc(sc?sc.name:'—')+'</td><td class="nw">'+(+s.duration||0)+' 分钟</td>'
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
  document.getElementById('docBody').replaceChildren();
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
  const sun=sunTimes(p.shootDate,p.lat,p.lng,projectTimeZone(p));
  const html='<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'
    +'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'sha256-'+PROPOSAL_SCRIPT_HASH+'\'; script-src-attr \'none\'; style-src \'unsafe-inline\'; img-src data: blob:; object-src \'none\'; base-uri \'none\'; form-action \'none\'">'
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
  a.download='摄影提案_'+safeFilename(p.name)+'.html'; a.click();
  toast('提案文件已生成，微信可直接发送给客户');
}

/* ================= 备份 / 恢复 / 清空 ================= */
/* 导出文件名清洗（A5）：只剥跨平台非法字符，不再套 esc()（esc 会把 & 变成 &amp; 混进文件名） */
function safeFilename(s){ return String(s==null?'':s).replace(/[\\/:*?"<>|\r\n]/g,'').trim().slice(0,80)||'未命名'; }
function downloadData(data,filename){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
  a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),60000);
}
function collectImages(ps){
  const ids=new Set();
  ps.forEach(p=>{
    (p.mood||[]).filter(m=>m.type==='image'&&m.content&&!String(m.content).startsWith('shisei:')).forEach(m=>ids.add(m.content));
    (p.refs||[]).forEach(r=>{ if(r&&r.key&&!String(r.key).startsWith('shisei:')) ids.add(r.key); });  // v10.4：参考图库也随备份导出
    (p.shots||[]).forEach(s=>(s.refIds||[]).forEach(r=>{ if(!String(r||'').startsWith('shisei:')) ids.add(r); }));
  });
  return ids;
}
async function imagesFor(ps){
  const out=Object.create(null), missing=[];
  for(const id of collectImages(ps)){
    const v=(Object.prototype.hasOwnProperty.call(imgCache,id)&&imgCache[id])||await idb.get(id);
    if(v) out[id]=v; else missing.push(id);
  }
  if(missing.length) throw new Error('缺失 '+missing.length+' 张引用图片');
  return out;
}
async function exportSelectedAssets(){
  try{
    const selected=[...document.querySelectorAll('.asset-select:checked')].map(el=>JSON.parse(el.dataset.entry));
    const assets=buildAssetProjects(loadP(),selected);
    if(!assets.length){toast('请先选择要导出的收藏');return;}
    const images=await imagesFor(assets),poseMap=new Map();
    const poseKey=async key=>{
      if(!String(key||'').startsWith('shisei:'))return key;
      if(poseMap.has(key))return poseMap.get(key);
      const data=await ensureShiseiImage(key);
      if(!validBackupImage(data))throw Error('姿势参考未缓存，请先加载后重试');
      const next=uid();images[next]=data;poseMap.set(key,next);return next;
    };
    for(const p of assets){
      for(const r of p.refs)r.key=await poseKey(r.key);
      for(const m of p.mood)if(m.type==='image')m.content=await poseKey(m.content);
      for(const s of p.shots)s.refIds=await Promise.all((s.refIds||[]).map(poseKey));
    }
    downloadData({app:'stillmark',version:4,type:'assets',assetVersion:1,exportedAt:new Date().toISOString(),assets,images},'Stillmark_素材包_'+todayStr()+'.json');
    toast('素材包已导出 · '+selected.length+' 条');
  }catch(e){toast('素材包未完成：'+String(e.message||e),6000);}
}
async function exportJSON(){
  const projects=JSON.parse(JSON.stringify(loadP()));
  try{
    const data={app:'stillmark',version:4,exportedAt:new Date().toISOString(),projects,images:await imagesFor(projects)};
    downloadData(data,'瞬刻摄影工作台备份_'+todayStr()+'.json'); toast('完整备份已导出');
  }catch(e){ toast('备份未完成：'+String(e.message||e)+'，请勿清空原数据',6000); }
}
async function exportProject(pid){
  const original=loadP().find(x=>x.id===pid); if(!original) return;
  const p=JSON.parse(JSON.stringify(original));
  try{
    downloadData({app:'stillmark',version:4,type:'project',exportedAt:new Date().toISOString(),project:p,images:await imagesFor([p])},
      '策划案_'+safeFilename(p.name)+'_'+todayStr()+'.json');
    toast('单项目备份已导出');
  }catch(e){ toast('备份未完成：'+String(e.message||e),6000); }
}
/* 只接收本应用导出的栅格图片或精确匹配内置示例模板的 SVG；不接收 URL/任意 SVG。 */
function validBackupImage(v){
  if(typeof v!=='string') return false;
  if(/^data:image\/(jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)) return true;
  const prefix='data:image/svg+xml;charset=utf-8,';
  if(!v.startsWith(prefix)) return false;
  try{
    const svg=decodeURIComponent(v.slice(prefix.length));
    const m=svg.match(/<rect width="640" height="420" fill="(#[0-9a-fA-F]{3,6})"\/><circle cx="486" cy="106" r="62" fill="(#[0-9a-fA-F]{3,6})"/);
    const label=svg.match(/<text x="34" y="72" font-size="32" font-family="sans-serif" fill="#[0-9a-fA-F]{3,6}">([^<]*)<\/text><\/svg>$/);
    return !!(m&&label&&slugPreview(label[1],[m[2],m[1]])===v);
  }catch{ return false; }
}
/* 重映射依赖图片键，保留同包内共享关系，绝不引用本机同名键。 */
function remapBackupImages(projects,images,mkId){
  const source=images&&typeof images==='object'&&!Array.isArray(images)?images:{};
  const mapping=Object.create(null), payload=Object.create(null);
  for(const key of collectImages(projects)){
    if(!Object.prototype.hasOwnProperty.call(source,key)||!validBackupImage(source[key])) throw new Error('图片依赖缺失或格式不合法');
    const id=mkId();
    if(Object.prototype.hasOwnProperty.call(payload,id)) throw new Error('图片键重复');
    mapping[key]=id; payload[id]=source[key];
  }
  const remap=k=>Object.prototype.hasOwnProperty.call(mapping,k)?mapping[k]:k;
  projects.forEach(p=>{
    (p.mood||[]).filter(m=>m.type==='image').forEach(m=>{m.content=remap(m.content);});
    (p.refs||[]).forEach(r=>{r.key=remap(r.key);});
    (p.shots||[]).forEach(s=>{s.refIds=(s.refIds||[]).map(remap);});
  });
  return payload;
}
let pendingImport=null;
function importJSON(e){
  const f=e.target.files[0]; if(!f) return;
  const rd=new FileReader();
  rd.onload=ev=>{
    let d;
    try{ d=JSON.parse(ev.target.result); }catch{ toast('文件格式不正确，导入失败'); e.target.value=''; return; }
    const isAssets=d&&d.type==='assets';
    const list=d&&typeof d==='object'?(isAssets?d.assets:d.project?[d.project]:d.projects):null;
    if(isAssets&&(d.app!=='stillmark'||d.assetVersion!==1)){toast('不支持的素材包版本');return;}
    if(!Array.isArray(list)||!list.length||list.some(p=>!p||typeof p!=='object'||Array.isArray(p))){ toast('文件中没有合法的策划案'); e.target.value=''; return; }
    if(d.version!=null&&(!Number.isInteger(d.version)||d.version<1||d.version>4)){ toast('不支持的备份版本'); e.target.value=''; return; }
    pendingImport=d;
    const names=list.slice(0,3).map(p=>p.name||'未命名').join('、')+(list.length>3?' 等':'');
    if(isAssets){
      askConfirm('导入素材包？','将新增 '+list.length+' 组收藏素材，保留原有项目与收藏。',applyImport);
    } else if(d.type==='project'||d.project){
      askConfirm('导入为新的策划案？','将新增 1 个策划案「'+(list[0].name||'未命名')+'」，不会覆盖现有数据。',applyImport);
    } else {
      askConfirm('导入将覆盖全部数据？','文件含 '+list.length+' 个策划案：'+names+'。此操作会替换当前全部数据，不可撤销；建议先导出备份。',applyImport);
    }
  };
  rd.readAsText(f); e.target.value='';
}
async function applyImport(){
  const d=pendingImport; pendingImport=null; if(!d) return;
  if(persistConflict||persistClearing||!idb.ready()){ toast('当前无法安全导入，请先备份并刷新'); return; }
  let locked=false;
  const app=document.getElementById('app');
  try{
    const assets=d.type==='assets';
    const single=!assets&&(d.type==='project'||!!d.project);
    const raw=assets?d.assets:single?[d.project]:d.projects;
    if(!Array.isArray(raw)||!raw.length) throw new Error('文件中没有合法项目');
    const imported=raw.map(p=>sanitizeProject(p));
    if(imported.some(p=>!p)) throw new Error('文件中有非法项目');
    imported.forEach(p=>{migrate(p);p.v3=1;if(assets){p.assetPack=true;p.demo=false;}});
    if(single) imported[0].name+='（导入）';
    const images=remapBackupImages(imported,d.images,uid);
    if(app) app.inert=true;
    if(persistTimer||pendingPersist) await flushPersist(); else await persistChain;
    if(persistConflict||persistFailed) throw new Error('现有数据尚未保存');
    persistClearing=true; locked=true;
    const generation=persistGeneration;
    const arr=single||assets?JSON.parse(JSON.stringify(loadP())).concat(imported):imported;
    const ok=await idb.importProjects(arr,persistExpected,images);
    if(!ok){markPersistConflict();return;}
    persistExpected=JSON.stringify(arr);
    Object.keys(images).forEach(k=>{imgCache[k]=images[k];});
    if(generation!==persistGeneration){markPersistConflict();return;}
    projectsCache=arr; pendingPersist=false; persistFailed=false; notifyProjectChange();
    if(assets){view=freshView({mode:'favorites'});renderFavorites();toast('已导入 '+imported.length+' 组素材');}
    else {view=freshView();renderBoard();toast('导入成功，共 '+arr.filter(p=>!p.assetPack).length+' 个策划案');}
  }catch(err){ toast('导入失败：'+String(err.message||err)+'，原项目未被覆盖',6000); }
  finally{ if(locked) persistClearing=false; if(app) app.inert=false; }
}
let confirmCb=null;
function askConfirm(t,d,cb){ document.getElementById('confirmTitle').textContent=t; document.getElementById('confirmDesc').textContent=d; confirmCb=cb; document.getElementById('confirmModal').classList.add('show'); }
function closeConfirm(){ document.getElementById('confirmModal').classList.remove('show'); confirmCb=null; }
document.getElementById('confirmOk').onclick=()=>{ const cb=confirmCb; closeConfirm(); if(cb) cb(); };
function clearAll(){
  askConfirm('清空全部数据？','不可恢复！将删除所有策划案与图片，建议先导出备份。姿势图库缓存不受影响，可在情绪板 → 素材来源中单独清除。',async()=>{
    if(persistConflict||persistClearing||!idb.ready()){ toast('当前无法安全清空，请先导出备份并刷新'); return; }
    if(persistTimer||pendingPersist) await flushPersist();
    else await persistChain;
    if(persistConflict||persistFailed){ toast('仍有未保存数据，请先导出备份'); return; }
    const generation=persistGeneration;
    persistClearing=true;
    try{
      if(!await idb.clearProjects(persistExpected)){ markPersistConflict(); return; }
      persistExpected=JSON.stringify(null);
      if(generation!==persistGeneration){ markPersistConflict(); return; }
      try{ localStorage.removeItem(LS_PROJ); localStorage.removeItem(LS_DEMO_V9); localStorage.removeItem(LS_SEED); }catch{}
      Object.keys(imgCache).forEach(k=>delete imgCache[k]);
      projectsCache=[]; pendingPersist=false; notifyProjectChange();
      view=freshView(); renderBoard(); toast('已清空');
    }catch{ toast('清空失败，原数据未被确认删除，请导出备份'); }
    finally{ persistClearing=false; }
  });
}

/* ===== AI 契约层 v1：默认停用，无内置网络适配器、无隐式写入 ===== */
function aiTaskRegistry(){
  const text=n=>({type:'string',maxLength:n});
  const arr=(items,maxItems)=>({type:'array',items,maxItems});
  const obj=properties=>({type:'object',properties,additionalProperties:false,required:Object.keys(properties)});
  const short=text(200),long=text(2000);
  const shot=obj({name:short,note:long,sceneId:short});
  const tasks={
    analyzeReference:{cap:'vision',fields:[],schema:obj({observations:arr(short,12),uncertainties:arr(short,8)})},
    suggestTags:{cap:'text',fields:['text','tags'],schema:obj({tags:arr(text(60),20)})},
    generateShots:{cap:'text',fields:['concept','scenes'],schema:obj({shots:arr(shot,30)})},
    generateProject:{cap:'text',fields:['concept','scenes'],schema:obj({theme:short,style:short,shots:arr(shot,30)})},
    suggestEquipment:{cap:'text',fields:['shots','items'],schema:obj({suggestions:arr(short,20),missing:arr(short,20)})},
    reviewPlan:{cap:'text',fields:['concept','shots','schedule','items'],schema:obj({issues:arr(obj({message:long,referenceId:short}),30)})},
    generateProposal:{cap:'text',fields:['concept','shots'],schema:obj({draft:text(6000)})},
    compareImages:{cap:'vision',fields:[],schema:obj({differences:arr(short,12),suggestions:arr(short,12)})},
    searchAssets:{cap:'embedding',fields:['assets'],schema:obj({matches:arr(obj({id:short,reason:short}),30)})},
    generateImage:{cap:'imageGeneration',fields:[],schema:obj({images:arr(text(8000000),4)})}
  };
  for(const task of Object.values(tasks))task.promptVersion=1;
  return tasks;
}
function aiTask(taskId){
  const tasks=aiTaskRegistry();
  if(!Object.prototype.hasOwnProperty.call(tasks,taskId))throw Error('AI_TASK_UNKNOWN');
  return tasks[taskId];
}
function aiValidate(schema,value){
  if(schema.type==='string'){
    if(typeof value!=='string'||value.length>schema.maxLength)throw Error('AI_SCHEMA_INVALID');
    return value;
  }
  if(schema.type==='array'){
    if(!Array.isArray(value)||value.length>schema.maxItems)throw Error('AI_SCHEMA_INVALID');
    return value.map(v=>aiValidate(schema.items,v));
  }
  if(schema.type==='object'){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('AI_SCHEMA_INVALID');
    const keys=Object.keys(schema.properties);
    if(Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.prototype.hasOwnProperty.call(value,k)))throw Error('AI_SCHEMA_INVALID');
    return Object.fromEntries(keys.map(k=>[k,aiValidate(schema.properties[k],value[k])]));
  }
  throw Error('AI_SCHEMA_UNKNOWN');
}
function aiContext(taskId,input){
  const task=aiTask(taskId),src=input||{},p=src.project||{},ctx={};
  const str=(v,max=1000)=>typeof v==='string'?v.slice(0,max):'';
  const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,str((v||{})[k])]));
  const rows=(v,keys)=>(Array.isArray(v)?v:[]).slice(0,200).map(x=>pick(x,keys));
  for(const field of task.fields){
    if(field==='concept')ctx.concept=pick(p.concept,['theme','style','usage']);
    if(field==='scenes')ctx.scenes=rows(p.scenes,['id','name','note']);
    if(field==='shots')ctx.shots=rows(p.shots,['id','name','sceneId','date','slot','note']);
    if(field==='schedule')ctx.schedule=rows(p.schedule,['id','title','date','start','end']);
    if(field==='items')ctx.items=rows(p.items,['name','kind','note']);
    if(field==='text')ctx.text=str(src.text,4000);
    if(field==='tags')ctx.tags=(Array.isArray(src.tags)?src.tags:[]).slice(0,100).map(x=>str(x,60));
    if(field==='assets')ctx.assets=rows(src.assets,['id','name','text']);
  }
  const images=(Array.isArray(src.images)?src.images:[]);
  if(images.length>6||images.some(v=>typeof v!=='string'||v.length>8000000||!/^data:image\/(jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)))throw Error('AI_IMAGE_INVALID');
  if(taskId==='analyzeReference'&&images.length<1||taskId==='compareImages'&&images.length!==2)throw Error('AI_IMAGE_COUNT');
  if(images.length&&['suggestEquipment','reviewPlan','searchAssets','generateProposal'].includes(taskId))throw Error('AI_IMAGE_NOT_NEEDED');
  return {context:ctx,images:images.slice(),instruction:str(src.instruction,4000)};
}
function aiValidateReferences(taskId,data,context){
  const ids=rows=>new Set((rows||[]).map(x=>x.id).filter(Boolean));
  if(taskId==='generateShots'||taskId==='generateProject'){
    const allowed=ids(context.scenes);
    if(data.shots.some(s=>s.sceneId&&!allowed.has(s.sceneId)))throw Error('AI_REFERENCE_INVALID');
  }
  if(taskId==='reviewPlan'){
    const allowed=new Set([...ids(context.shots),...ids(context.schedule)]);
    if(data.issues.some(x=>x.referenceId&&!allowed.has(x.referenceId)))throw Error('AI_REFERENCE_INVALID');
  }
  if(taskId==='searchAssets'){
    const allowed=ids(context.assets);
    if(data.matches.some(x=>!allowed.has(x.id)))throw Error('AI_REFERENCE_INVALID');
  }
  if(taskId==='generateImage'&&data.images.some(v=>!/^data:image\/(jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)))throw Error('AI_IMAGE_INVALID');
  return data;
}
function aiProjectToken(p){return p?JSON.stringify(p):null;}
function aiCandidateIsCurrent(candidate,project){
  return !!candidate&&candidate.projectId===(project&&project.id||null)&&candidate.projectToken===aiProjectToken(project)&&!(project&&project.demo);
}
function createAiService(options){
  const enabled=!!(options&&options.enabled===true),providers=new Map();
  function register(provider){
    if(!provider||typeof provider.id!=='string'||!provider.id.trim()||typeof provider.generate!=='function')return false;
    providers.set(provider.id,provider);return true;
  }
  function prepare(taskId,input){
    const task=aiTask(taskId),payload=aiContext(taskId,input);
    return {taskId,promptVersion:task.promptVersion,capability:task.cap,requiresVision:payload.images.length>0,context:payload.context,images:payload.images,instruction:payload.instruction,outputSchema:task.schema};
  }
  async function run(taskId,input,opts){
    if(!enabled)throw Error('AI_DISABLED');
    const o=opts||{},p=input&&input.project;
    if(p&&p.demo)throw Error('AI_READ_ONLY');
    if(o.confirmUpload!==true)throw Error('AI_UPLOAD_NOT_CONFIRMED');
    const req=prepare(taskId,input),provider=providers.get(o.provider);
    if(!provider)throw Error('AI_PROVIDER_MISSING');
    const caps=provider.capabilities||{};
    if(caps[req.capability]!==true||req.requiresVision&&caps.vision!==true)throw Error('AI_CAPABILITY_MISSING');
    const projectId=p&&p.id||null,projectToken=aiProjectToken(p);
    const signal=o.signal;
    if(signal&&signal.aborted)throw Error('AI_CANCELLED');
    const response=await provider.generate({...req,model:typeof o.model==='string'?o.model.slice(0,200):'',maxOutputTokens:Math.max(64,Math.min(8192,Number(o.maxOutputTokens)||2048))},signal);
    if(signal&&signal.aborted)throw Error('AI_CANCELLED');
    const data=aiValidateReferences(taskId,aiValidate(req.outputSchema,response&&response.data),req.context);
    return {taskId,projectId,projectToken,data,provider:provider.id,promptVersion:req.promptVersion};
  }
  return Object.freeze({register,prepare,run});
}
/* 生产服务恒关闭；未来接入必须另行实现上传确认、取消/超时及业务白名单应用。 */
const ai=createAiService({enabled:false});

/* ===== AI 打标签：兼容旧接口（本期恒关闭，零网络请求） ===== */
function setAiConfig(k,v){
  aiConfig[k]=v;
  try{ sessionStorage.setItem('sf_ai_cfg_v1',JSON.stringify(aiConfig)); }catch{}
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
  }catch{
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
  try{ return localStorage.getItem('wb_sf_shisei_sync')!=='0'; }catch{ return true; }
}
function shiseiCanStart(force){
  if(!idb.ready()) return false;                 // A2：存储降级时不同步图库（同步了也存不住，只会空转烧流量）
  if(!shiseiInitReady||(!force&&!shiseiSyncEnabled())||!navigator.onLine) return false;
  if(document.visibilityState!=='visible'||persistFailed||persistConflict||pendingPersist||persistClearing) return false;
  if(document.getElementById('sdOverlay').classList.contains('show')) return false;
  // A deliberate one-off sync may run in Settings, but not under other dialogs.
  const dialogs=[...document.querySelectorAll('.modal-mask.show')];
  if(dialogs.some(el=>!force||el.id!=='settingsModal')) return false;
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
  const schedule=force?cb=>setTimeout(cb,0):window.requestIdleCallback?window.requestIdleCallback:cb=>setTimeout(cb,5000);
  schedule(async()=>{
    if(shiseiState.running)return;
    if(!shiseiCanStart(!!force)) {
      if(force)toast('暂时无法同步：请检查网络、存储或关闭其他弹窗');
      renderShiseiSyncStatus();return;
    }
    try{
      const meta=await idb.getShiseiMeta(SHISEI_META_KEY);
      if(!force&&meta&&meta.failStreak>=3) return;
      const resumable=meta&&Array.isArray(meta.pending)&&meta.pending.length&&meta.cursor>0;
      if(!force&&meta&&meta.checkedAt&&!resumable&&Date.now()-meta.checkedAt<SHISEI_SYNC_INTERVAL) return;
      if(!shiseiCanStart(!!force))return;
      await runShiseiSync(!!force);
    }catch{ renderShiseiSyncStatus(); }
  });
}
async function runShiseiSync(force){
  if(shiseiState.running||persistFailed||persistConflict||pendingPersist||(!force&&!shiseiSyncEnabled())) return;
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
      if(shiseiState.paused||persistFailed||persistConflict||!navigator.onLine||document.visibilityState!=='visible'){shiseiState.paused=true;break;}
      const batch=nextPendingBatch({pending,cursor},SHISEI_BATCH);
      const results=await Promise.allSettled(batch.items.map(item=>{
        const entry=remoteByKey.get(item.key)||shiseiItemEntry(item.key,remoteByKey);
        return entry?fetchShiseiImage(entry).then(data=>{
          const rec={key:item.key,pid:entry.pid,cat:entry.cat,view:entry.view,zh:entry.zh,en:entry.en,ja:entry.ja,url:entry.url,data,syncedAt:Date.now()};
          return idb.putShiseiImg(item.key,rec).then(()=>({ok:true,key:item.key,data}));
        }):Promise.reject(new Error('CATALOG_ENTRY_MISSING'));
      }));
      let failed=0, quotaHit=false;
      for(let i=0;i<results.length;i++){
        const item=batch.items[i], out=results[i];
        if(out.status==='fulfilled'&&out.value&&out.value.data){
          // 同步只落盘；缩略图进入可见页时才读取。
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
async function renderShiseiStatusInto(boxId){
  const box=document.getElementById(boxId); if(!box) return;
  let meta=null, stats={count:0,bytes:0,avg:0};
  try{ meta=await idb.getShiseiMeta(SHISEI_META_KEY); stats=await idb.shiseiImgStats(); }catch{}
  let stat='未同步';
  if(shiseiState.running) stat=(shiseiState.paused?'已暂停':'进行中 ')+Math.min(shiseiState.done,shiseiState.total||0)+'/'+(shiseiState.total||0);
  else if(!shiseiSyncEnabled()) stat='已暂停';
  else if(meta&&meta.paused) stat='已暂停';
  else if(meta&&meta.failStreak>=3) stat='连续失败 '+meta.failStreak+' 次';
  else if(meta&&meta.total&&stats.count) stat='已同步 '+stats.count+'/'+meta.total;
  else if(stats.count) stat='已同步 '+stats.count+' 张';
  const mb=(stats.bytes/1024/1024).toFixed(1), kb=(stats.avg/1024).toFixed(1);
  if(document.getElementById(boxId)!==box)return;
  box.innerHTML='<div class="src-sync"><div><b>姿势图库同步</b> <span class="muted">'+esc(stat)+' · '+stats.count+' 张'
    +(stats.count?' · 约 '+mb+' MB（平均 '+kb+' KB）':'')+'</span></div>'
    +'<div class="row" style="margin-top:6px">'
    +'<button class="btn btn-ghost btn-sm" '+doAttrs('toggle-gallery-sync')+'>'+(shiseiSyncEnabled()?'暂停':'恢复')+'</button>'
    +'<button class="btn btn-ghost btn-sm" '+doAttrs('run-gallery-sync')+'>立即同步</button>'
    +(stats.count?'<button class="btn btn-danger btn-sm" '+doAttrs('clear-gallery')+'>清除图库</button>':'')
    +'</div></div>';
}
function renderShiseiSyncStatus(){return Promise.all(['shiseiSyncBox','settingsShiseiBox'].map(renderShiseiStatusInto));}
function toggleShiseiSync(){
  if(shiseiSyncEnabled()){
    try{ localStorage.setItem('wb_sf_shisei_sync','0'); }catch{}
    if(shiseiState.running) shiseiState.paused=true;
  } else {
    try{ localStorage.removeItem('wb_sf_shisei_sync'); }catch{}
    startShiseiSync(true);
  }
  renderShiseiSyncStatus();
}
function clearShiseiGallery(){
  askConfirm('清除姿势图库？','将删除本机缓存的图库缩略图与同步进度；分镜里已引用的图库图会显示为「图库原图已更新」占位，不会改动分镜数据。',async()=>{
    if(shiseiState.running){shiseiState.paused=true;toast('正在暂停同步，请稍后再清除');return;}
    try{ localStorage.setItem('wb_sf_shisei_sync','0'); }catch{}
    try{ await idb.clearShisei(); }catch{ toast('清除失败'); return; }
    Object.keys(imgCache).forEach(k=>{ if(String(k).startsWith('shisei:')) delete imgCache[k]; });
    poseCacheAccess.clear();
    shiseiState={running:false,paused:false,total:0,done:0};
    renderShiseiSyncStatus();
    if(view.mode==='project'&&view.tab==='shots') renderShots(cur());
    toast('姿势图库已清除，同步已暂停');
  });
}
async function ensureShiseiImage(key){
  if(!String(key||'').startsWith('shisei:'))return imgCache[key]||'';
  if(imgCache[key]){poseCacheAccess.set(key,Date.now());return imgCache[key];}
  if(poseReads.has(key))return poseReads.get(key);
  const pending=(async()=>{
    try{
      const rec=await idb.getShiseiImg(key);
      if(!rec||!rec.data)return '';
      imgCache[key]=rec.data;poseCacheAccess.set(key,Date.now());
      // 同一个 key 的并发请求共享读取；只更新仍在当前 DOM 的缩略图。
      document.querySelectorAll('[data-shisei-key]').forEach(el=>{
        if(el.dataset.shiseiKey===key){const img=el.querySelector('img');if(img)img.src=rec.data;}
      });
      trimImageCache();return rec.data;
    }catch{return '';}
  })();
  poseReads.set(key,pending);
  try{return await pending;}finally{if(poseReads.get(key)===pending)poseReads.delete(key);}
}
async function ensureShiseiRefs(p){
  const keys=[...projectImageKeys(p)].filter(k=>String(k).startsWith('shisei:'));
  for(let i=0;i<keys.length;i+=6)await Promise.all(keys.slice(i,i+6).map(ensureShiseiImage));
}

/* ================= Toast ================= */
let toastTimer=null;
function toast(msg,ms,action){
  let t=document.getElementById('toast');
  if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  /* action: {label, fn} —— toast 内联操作按钮（撤销 / 刷新等），toast 关闭即失效 */
  t.innerHTML=esc(msg)
    +(action?'<button '+doAttrs('run-toast-action')+'>'+esc(action.label)+'</button>':'')
    +(msg==='发现新版本'&&!action?'<button '+doAttrs('reload-page')+'>刷新</button>':'');
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
  const shown=id=>{ const el=document.getElementById(id); return !!el&&el.classList.contains('show'); };
  /* v10.8.0 优先级：浮窗 → 各类弹窗 → 行内编辑 → 文档/拍摄日 → 返回看板。
     新加的收藏浮窗放最前，保证「先关浮窗」不误触返回看板（否则浮窗开着按 Esc 会连页一起退）。 */
  if(shown('favPickerModal')){ closeFavPicker(); return; }
  if(shown('refViewer')){ closeRefViewer(); return; }
  if(shown('confirmModal')){ closeConfirm(); return; }
  if(shown('nameModal')){ closeNameModal(); return; }
  if(shown('deployModal')){ closeDeployModal(); return; } // v10.6.x：部署说明叠在设置页之上，必须先关
  if(shown('settingsModal')){ closeSettings(); return; }   // v10.6.0：设置弹窗后开先关（位于 confirm/name 之后判断）
  if(cancelInlineEdit()) return;
  if(cancelShotEdit()) return;
  if(shown('docModal')){ closeDoc(); return; }
  if(shown('sdOverlay')){ closeShootDay(); return; }
  /* 最后兜底：非看板页（项目 / 收藏）按 Esc 返回看板；看板页本身无操作。
     用 view=freshView() 而非只改 mode，顺带清空筛选/草稿/焦点态，避免下次进项目残留。 */
  if(typeof view!=='undefined'&&view.mode!=='board'){ view=freshView(); renderBoard(); }
});

