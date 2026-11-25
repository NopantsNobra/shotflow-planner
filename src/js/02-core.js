/* ================= 状态 ================= */
/* 工作空间只是显示偏好，所有模式共用同一项目与备份结构。 */
function workspaceModules(mode,custom){
  const all=['concept','mood','shots','schedule','stuff','budget','notes','proposal','callsheet','manual','shootday'];
  if(mode==='casual') return ['concept','mood','shots','stuff','shootday'];
  if(mode==='portrait') return ['concept','mood','shots','schedule','stuff','proposal','callsheet','manual','shootday'];
  if(mode==='custom'&&Array.isArray(custom)) return all.filter(x=>x==='shots'||custom.includes(x));
  return all;
}
function freshView(patch){
  const d={mode:'board',pid:null,tab:'shots',shotFilter:'',boardQuery:'',boardScope:'全部',boardPackMode:false,boardPackIds:[],
    moodFilter:[],moodFilterMode:'any',shotDraft:{},poseCat:null,posePage:0,editingShotId:null,editingShotEditId:null,replaceIdx:-1,
    allowDemoWrite:false,editingNodeId:null,editingStuffId:null,editingStuffKey:null,
    editingTodoId:null,editingNoteId:null,refViewer:null,focusRef:null,lastShift:null,newDay:false,moodRefPicker:false,batchMode:false,batchShots:[]};
  return Object.assign(d,patch||{});
}
let view=freshView();
const cur=()=>loadP().find(p=>p.id===view.pid);
function updateCur(fn){
  const a=loadP(), p=a.find(x=>x.id===view.pid);
  if(!p) return;
  /* v9 唯一写守卫：示例项目只读，所有写路径统一经此处 */
  if(p.demo&&!view.allowDemoWrite){ toast('示例项目只读，请点「复制为我的项目」后再修改'); return; }
  fn(p); p.updatedAt=Date.now(); saveP(a);
}

/* ===== 素材标签纯函数层：只依赖内置对象，可被逻辑测试直接抽取 ===== */
function tagKey(s){
  return String(s==null?'':s).normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');
}
function dedupeTags(list){
  if(!Array.isArray(list)) return [];
  const seen=new Set(), out=[];
  list.forEach(v=>{
    const t=String(v==null?'':v).trim(), k=tagKey(t);
    if(!k||seen.has(k)) return;
    seen.add(k); out.push(t);
  });
  return out;
}
function parseTagsInput(str){
  return dedupeTags(String(str==null?'':str).split(/[,，;；]+/));
}
function mergeVocab(vocab,list){
  return dedupeTags([...(Array.isArray(vocab)?vocab:[]),...(Array.isArray(list)?list:[])]);
}
function migrateTags(p){
  if(!p||typeof p!=='object') return p;
  p.mood=Array.isArray(p.mood)?p.mood:[];
  p.tagVocab=dedupeTags(p.tagVocab);
  p.mood.forEach(m=>{
    if(!m||typeof m!=='object') return;
    m.tags=dedupeTags(Array.isArray(m.tags)?m.tags:(m.tag?[m.tag]:[]));
  });
  p.tagVocab=mergeVocab(p.tagVocab,p.mood.flatMap(m=>(m&&m.tags)||[]));
  return p;
}
function tagsForDisplay(m){
  if(!m||typeof m!=='object') return [];
  return Array.isArray(m.tags)&&m.tags.length?m.tags:(m.tag?[m.tag]:[]);
}
function matchByTags(item,filter,mode){
  const keys=dedupeTags(Array.isArray(filter)?filter.map(tagKey):[]);
  if(!keys.length) return true;
  const tags=tagsForDisplay(item).map(tagKey);
  return mode==='all'?keys.every(k=>tags.includes(k)):keys.some(k=>tags.includes(k));
}
function renameTag(p,from,to){
  if(!p||typeof p!=='object') return p;
  const next=String(to==null?'':to).trim(), fk=tagKey(from);
  if(!fk||!tagKey(next)) return p;
  p.mood=Array.isArray(p.mood)?p.mood:[];
  p.mood.forEach(m=>{
    if(!m||typeof m!=='object') return;
    m.tags=dedupeTags(tagsForDisplay(m).map(t=>tagKey(t)===fk?next:t));
    m.tag=m.tags[0]||'';
  });
  const vocab=Array.isArray(p.tagVocab)?p.tagVocab:[];
  p.tagVocab=mergeVocab(vocab.map(t=>tagKey(t)===fk?next:t),[next]);
  return p;
}
function removeTag(p,tag){
  if(!p||typeof p!=='object') return p;
  const k=tagKey(tag); if(!k) return p;
  p.mood=Array.isArray(p.mood)?p.mood:[];
  p.mood.forEach(m=>{
    if(!m||typeof m!=='object') return;
    m.tags=dedupeTags(tagsForDisplay(m).filter(t=>tagKey(t)!==k));
    if(tagKey(m.tag)===k) m.tag='';
  });
  const vocab=Array.isArray(p.tagVocab)?p.tagVocab:[];
  p.tagVocab=dedupeTags(vocab.filter(t=>tagKey(t)!==k));
  return p;
}

/* ===== 姿势图库纯函数层：只做 catalog 映射、diff 与游标计算，不碰 DOM/idb ===== */
function shiseiItemKey(e){
  if(e&&e.key) return String(e.key);
  return 'shisei:'+String((e&&e.pid)||'')+':'+String((e&&e.view)||'');
}
function parseCatalog(raw){
  const list=Array.isArray(raw)?raw:(Array.isArray(raw&&raw.items)?raw.items:[]);
  const views=['front','diag','side','above','below'], out=[];
  (list||[]).forEach(e=>{
    if(!e||!e.id) return;
    views.forEach(v=>{
      const file=(e.views&&e.views[v])||(e.maps&&e.maps[v]);
      if(!file) return;
      out.push({pid:String(e.id),cat:String(e.class_cn||e.class_en||'未分类'),view:v,
        zh:String(e.name_cn||e.name_en||e.id),en:String(e.name_en||e.name_cn||''),ja:String(e.name_jp||''),
        url:'images/line/w300/'+String(file).replace(/^\/+/,'')});
    });
  });
  return out;
}
function shiseiEntrySame(a,b){
  return String((a&&a.cat)||'')===String((b&&b.cat)||'')
    &&String((a&&a.zh)||'')===String((b&&b.zh)||'')
    &&String((a&&a.en)||'')===String((b&&b.en)||'')
    &&String((a&&a.ja)||'')===String((b&&b.ja)||'')
    &&String((a&&a.url)||'')===String((b&&b.url)||'');
}
function diffCatalog(localEntries,remoteEntries){
  const local=Array.isArray(localEntries)?localEntries:[], remote=Array.isArray(remoteEntries)?remoteEntries:[];
  const lm=new Map(local.map(e=>[shiseiItemKey(e),e])), rm=new Map(remote.map(e=>[shiseiItemKey(e),e]));
  const toAdd=[],toUpdate=[];
  remote.forEach(e=>{ const k=shiseiItemKey(e), old=lm.get(k);
    if(!old) toAdd.push(e);
    else if(!shiseiEntrySame(old,e)) toUpdate.push(e);
  });
  const toRemove=[];
  local.forEach(e=>{ const k=shiseiItemKey(e); if(!rm.has(k)) toRemove.push(k); });
  return {toAdd,toUpdate,toRemove};
}
function nextPendingBatch(meta,batch){
  const size=Math.max(1,Math.trunc(+batch||0)||1);
  const pending=(meta&&Array.isArray(meta.pending))?meta.pending:[];
  const cursor=Math.max(0,Math.trunc((meta&&meta.cursor)||0));
  const items=pending.slice(cursor,cursor+size).map(x=>typeof x==='string'?{key:x}:x);
  const next=cursor+items.length;
  return {items,cursor:next,done:next>=pending.length};
}
function mergeShiseiMeta(meta,patch){
  const base=(meta&&typeof meta==='object')?meta:{};
  return Object.assign({},base,(patch&&typeof patch==='object')?patch:{});
}

/* ===== v9 纯函数层：可由逻辑测试直接抽取，不依赖 DOM / idb / view ===== */
function clearInlineEditState(v){
  if(!v||typeof v!=='object') return v;
  v.editingNodeId=null; v.editingStuffId=null; v.editingStuffKey=null;
  v.editingTodoId=null; v.editingNoteId=null;
  v.editingShotEditId=null;                 // v10 分镜行内编辑指针（editingShotId 属参考图选图态，不得在此清理）
  return v;
}
function migrateFav(p){
  if(!p||typeof p!=='object') return p;
  FAV_KINDS.forEach(k=>{                   // 与收藏视图同源，避免两份清单漂移
    p[k]=Array.isArray(p[k])?p[k]:[];
    p[k].forEach(it=>{ if(it&&typeof it==='object') it.fav=(it.fav===true); });
  });
  p.demo=(p.demo===true);
  return p;
}
/* v10.8.0：复制分镜 / 引用收藏共用的「时间算术」——对条目的时分字段统一 +5 分钟。
   只动 HH:MM 字段（slot / start / end），日期字段（date / due / shootDate / ts）不动：
   复制与引用是「同一天再排一条」，顺延的是时刻而非拍摄日；跨日仍由排程引擎决定。
   纯函数、不依赖 view/document，可被逻辑测试直接抽取。 */
const COPY_SHIFT_MIN=10;
const TIME_FIELDS=['slot','start','end'];
function shiftTimeFields(src,minutes){
  const n=Math.round(minutes==null?COPY_SHIFT_MIN:Number(minutes));
  const out=JSON.parse(JSON.stringify(src)), times=[];
  if(!Number.isFinite(n)) return out;
  TIME_FIELDS.forEach(k=>{
    const m=/^(\d{1,2}):(\d{2})$/.exec(out[k]||'');
    if(!m||+m[1]>23||+m[2]>59) return;
    const total=+m[1]*60+ +m[2]+n;
    times.push({k,day:Math.floor(total/1440),minute:((total%1440)+1440)%1440});
  });
  if(!times.length) return out;
  const carry=times[0].day;
  // 单日环节不能用 23:xx–00:xx 表示；跨越午夜的区间保留原时间，交由用户明确拆分。
  if(times.some(x=>x.day!==carry)) return out;
  if(carry){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(out.date||'')) return out;
    const date=new Date(out.date+'T00:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==out.date) return out;
    date.setUTCDate(date.getUTCDate()+carry);
    out.date=date.toISOString().slice(0,10);
  }
  times.forEach(x=>{out[x.k]=String(Math.floor(x.minute/60)).padStart(2,'0')+':'+String(x.minute%60).padStart(2,'0');});
  return out;
}
/* 当前页签 → 允许的收藏类型（stuff 覆盖 scenes+items；notes 覆盖 notes+todos；
   concept 无收藏条目）。浮窗只列这些类型，避免「引用到无关页面」。 */
const FAV_TYPES_BY_TAB={mood:['mood'],shots:['shots'],schedule:['schedule'],
  stuff:['scenes','items'],budget:['budget'],notes:['notes','todos']};
function favTypesForTab(tab){ return FAV_TYPES_BY_TAB[tab]||[]; }
function isFav(it){ return !!(it&&it.fav===true); }
function favCount(list){
  if(!Array.isArray(list)) return 0;
  return list.reduce((n,it)=>n+(isFav(it)?1:0),0);
}
function favSummary(type,it){
  if(!it) return '';
  if(type==='mood') return it.type==='image'?'图片':String(it.content==null?'':it.content);
  if(type==='shots') return String(it.name==null?'':it.name);
  if(type==='schedule') return String(it.title==null?'':it.title);
  if(type==='scenes'||type==='items') return String(it.name==null?'':it.name);
  if(type==='budget') return String(it.item==null?'':it.item);
  if(type==='notes') return String(it.content==null?'':it.content);
  if(type==='todos') return String(it.title==null?'':it.title);
  return '';
}
function summary40(s){
  const t=String(s==null?'':s).replace(/\s+/g,' ').trim();
  return t.length>40?t.slice(0,40)+'…':t;
}
function collectFavorites(projects){
  const out=[];
  (Array.isArray(projects)?projects:[]).forEach(p=>{
    if(!p||typeof p!=='object') return;
    FAV_KINDS.forEach(type=>{              // 类型与文案统一取 FAV_KINDS / FAV_META，不再各存一份
      (Array.isArray(p[type])?p[type]:[]).forEach(it=>{
        if(!isFav(it)) return;
        out.push({type:type,pid:String(p.id==null?'':p.id),id:String(it.id==null?'':it.id),
          summary:summary40(favSummary(type,it)),module:FAV_META[type]||'其它',
          date:type==='schedule'?String(it.date||''):''});
      });
    });
  });
  return out;
}
/* 轻量资产包只复制选中收藏及其直接依赖，不复制客户、预算之外的项目背景等字段。 */
/* Portable v5 project-pack uses entries, not projects: older readers must fail closed,
   never treat a selective transfer as a destructive full restore. */
function classifyTransferPackage(d){
  if(!d||typeof d!=='object'||Array.isArray(d))throw Error('文件中没有合法的策划案');
  const own=k=>Object.prototype.hasOwnProperty.call(d,k);
  let mode,list;
  if(d.type==='project-pack'){
    if(d.app!=='stillmark'||d.version!==5||d.packVersion!==1||own('projects')||own('project')||own('assets'))throw Error('不支持或存在歧义的项目包版本');
    mode='append';list=d.entries;
    if(!Array.isArray(list)||list.some(p=>p?.assetPack||p?.demo))throw Error('项目包必须包含可编辑的策划案');
  }else{
    if(d.version!=null&&(!Number.isInteger(d.version)||d.version<1||d.version>4))throw Error('不支持的备份版本');
    if(d.type==='assets'){
      if(d.app!=='stillmark'||d.assetVersion!==1||own('project')||own('projects')||own('entries'))throw Error('不支持或存在歧义的素材包版本');
      mode='assets';list=d.assets;
    }else if(d.type==='project'||(!d.type&&own('project'))){
      if(own('projects')||own('assets')||own('entries'))throw Error('备份类型存在歧义');
      mode='single';list=[d.project];
    }else if(!d.type||d.type==='backup'){
      if(own('project')||own('assets')||own('entries'))throw Error('备份类型存在歧义');
      mode='restore';list=d.projects;
    }else throw Error('不支持的资产包类型');
  }
  if(!Array.isArray(list)||!list.length||list.some(p=>!p||typeof p!=='object'||Array.isArray(p)))throw Error('文件中没有合法的策划案');
  return {mode,list};
}
function buildPortableProjects(projects,ids){
  const selected=new Set(Array.isArray(ids)?ids:[]);
  return (projects||[]).filter(p=>selected.has(p.id)&&!p.demo&&!p.assetPack).map(p=>JSON.parse(JSON.stringify(p)));
}
function buildPortableShots(project,ids){
  if(!project||project.demo||project.assetPack)return null;
  const selected=new Set(Array.isArray(ids)?ids:[]);
  const shots=(project.shots||[]).filter(s=>selected.has(s.id));
  if(!shots.length)return null;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const scenes=new Set(shots.map(s=>s.sceneId).filter(Boolean));
  const keys=new Set(shots.flatMap(s=>s.refIds||[]).filter(Boolean));
  const dates=[...new Set(shots.map(s=>s.date).filter(Boolean))].sort();
  if([...scenes].some(id=>!(project.scenes||[]).some(s=>s.id===id)))throw Error('分镜引用的场景缺失');
  const refs=[...keys].map(k=>copy((project.refs||[]).find(r=>r.key===k)||{id:k,key:k,name:'参考图',tags:[],fav:false}));
  return {id:project.id,name:project.name+'（分镜选集）',v3:1,demo:false,assetPack:false,
    status:project.status,shootDates:dates,shootDate:dates[0]||'',dayInit:[],
    workspaceMode:project.workspaceMode,workspaceCustom:copy(project.workspaceCustom||[]),timeZone:project.timeZone||'',
    concept:{},mood:[],refs,tagVocab:[...new Set(refs.flatMap(r=>r.tags||[]))],
    shots:copy(shots),scenes:copy((project.scenes||[]).filter(s=>scenes.has(s.id))),
    schedule:[],items:[],budget:[],notes:[],todos:[]};
}
function buildAssetProjects(projects,selected){
  const picks=Array.isArray(selected)?selected:[],result=[];
  const copy=x=>JSON.parse(JSON.stringify(x));
  for(const p of projects||[]){
    const own=picks.filter(e=>e.pid===p.id);
    if(!own.length)continue;
    const pack={id:p.id,name:p.name,assetPack:true,demo:false,v3:1,status:'灵感期',refs:[],concept:{},tagVocab:[],shootDates:[],dayInit:[]};
    for(const type of FAV_KINDS) pack[type]=(p[type]||[]).filter(x=>isFav(x)&&own.some(e=>e.type===type&&e.id===x.id)).map(copy);
    if(!FAV_KINDS.some(k=>pack[k].length))continue;
    const scenes=new Set(pack.shots.map(x=>x.sceneId).filter(Boolean));
    for(const scene of p.scenes||[])if(scenes.has(scene.id)&&!pack.scenes.some(x=>x.id===scene.id))pack.scenes.push({...copy(scene),fav:false,done:false});
    const keys=new Set([...pack.mood.filter(x=>x.type==='image').map(x=>x.content),...pack.shots.flatMap(x=>x.refIds||[])].filter(Boolean));
    pack.refs=[...keys].map(k=>copy((p.refs||[]).find(r=>r.key===k)||{id:k,key:k,name:'参考图',tags:[],fav:false}));
    pack.tagVocab=[...new Set([...pack.mood.flatMap(x=>x.tags||[]),...pack.refs.flatMap(x=>x.tags||[])])];
    pack.shootDates=[...new Set([...pack.shots,...pack.schedule].map(x=>x.date).filter(Boolean))].sort();pack.shootDate=pack.shootDates[0]||'';
    result.push(pack);
  }
  return result;
}
function copyAssetDependencies(target,source,type,clone,mkId){
  if(type==='shots'&&clone.sceneId&&target.id!==source.id){
    const scene=(source.scenes||[]).find(x=>x.id===clone.sceneId);
    if(scene){
      target.scenes=target.scenes||[];
      let dest=target.scenes.find(x=>x.name===scene.name);
      if(!dest){dest={...JSON.parse(JSON.stringify(scene)),id:mkId(),fav:false,done:false};target.scenes.push(dest);}
      clone.sceneId=dest.id;
    }else clone.sceneId='';
  }
  const keys=type==='shots'?(clone.refIds||[]):type==='mood'&&clone.type==='image'?[clone.content]:[];
  target.refs=target.refs||[];
  for(const key of keys.filter(Boolean))if(!target.refs.some(r=>r.key===key)){
    const ref=(source.refs||[]).find(r=>r.key===key);
    target.refs.push({...JSON.parse(JSON.stringify(ref||{key,name:'参考图',tags:[]})),id:mkId(),fav:false});
  }
  if(type==='shots'){clone.skipped=false;clone.deferred=false;}
  if('paid' in clone)clone.paid=false;
  if(type==='schedule')clone.auto=null;
  return clone;
}
function backupItemCount(projects){
  return (Array.isArray(projects)?projects:[]).reduce((n,p)=>{
    if(!p||p.demo===true) return n;
    return n+(p.shots||[]).length+(p.mood||[]).length+(p.items||[]).length
      +(p.budget||[]).length+(p.todos||[]).length+(p.notes||[]).length;
  },0);
}
function matchBoardScope(p,scope){
  if(scope==='已归档') return !!(p&&(p.status==='已交付'||p.status==='已归档'));
  if(scope==='进行中') return !!(p&&p.status!=='已交付'&&p.status!=='已归档');
  return true;
}
function isActiveStatus(p){ return matchBoardScope(p,'进行中'); }
function parseMultiImage(e){
  return Array.from((e&&e.target&&e.target.files)||[]).filter(f=>!f.type||/^image\//.test(f.type));
}
function slugPreview(label,palette){
  const clean=String(label==null?'':label).replace(/[<>&"']/g,'').slice(0,18);
  const pal=Array.isArray(palette)&&palette.length>=2?palette:['#9a6a33','#f3e9da'];
  const main=String(pal[0]||'#9a6a33').replace(/[^#0-9a-fA-F]/g,'').slice(0,7)||'#9a6a33';
  const bg=String(pal[1]||'#f3e9da').replace(/[^#0-9a-fA-F]/g,'').slice(0,7)||'#f3e9da';
  const svg='<svg xmlns="&#104;ttp://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">'
    +'<rect width="640" height="420" fill="'+bg+'"/>'
    +'<circle cx="486" cy="106" r="62" fill="'+main+'" opacity="0.30"/>'
    +'<path d="M0 330 L170 190 L320 298 L452 168 L640 318 L640 420 L0 420 Z" fill="'+main+'" opacity="0.55"/>'
    +'<text x="34" y="72" font-size="32" font-family="sans-serif" fill="'+main+'">'+clean+'</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function cloneDemo(p,newId,now){
  const c=JSON.parse(JSON.stringify(p||{}));
  delete c.demo; delete c.v9;
  c.v3=1; c.id=newId; c.name=(c.name||'示例')+'（副本）';
  c.createdAt=now; c.updatedAt=now;
  return c;
}
function demoSpecs(){
  return [
    {status:'灵感期',name:'秋日胶片 · 校园人像',theme:'秋日胶片 · 校园人像',label:'秋日胶片',
      art:[['#b4793f','#f4e6d2']],colors:[],
      moodTexts:['午后三点斜射的暖光，梧桐叶在发梢投下斑驳','关键词：胶片颗粒、松弛感、不摆拍'],
      shotNames:['林荫道回眸（中景）','图书馆窗边侧脸（特写）'],
      nodeTitles:['器材检查与底片清点','场景踩点：梧桐大道'],
      sceneNames:['校园林荫道','图书馆窗边'],itemNames:['燕麦色针织开衫','反光板（金面）','胶片机 ×2'],
      budgetItems:['场地协调费','胶片与冲洗'],
      noteTexts:['客户确认以暖调胶片为主，避免高对比','学校保安处已电话确认周末可进'],
      todoTitles:['确认拍摄当天天气','准备备用胶片'],fullRefShot:false,favType:'shots',favIndex:0},
    {status:'策划中',name:'品牌新季 · 静物广告',theme:'品牌新季 · 静物广告',label:'品牌新季',
      art:[['#8d6a45','#f2ece3'],['#6b7d6a','#eef1e9'],['#b08d63','#f7f0e5']],colors:[],
      moodTexts:['极简台面，硬光勾出器物边缘','参考色温 5200K，保留材质细节'],
      shotNames:['主视觉静物组合（特写）','倒影与水面（大特写）','包装陈列（全景）'],
      nodeTitles:['灯光与背板搭建','客户确认主视觉','产品到场与摆台'],
      sceneNames:['品牌摄影棚'],itemNames:['亚克力台面','雾面喷砂道具','产品样品 ×6'],
      budgetItems:['影棚租赁','灯光器材','造型与道具'],
      noteTexts:['客户希望画面更克制，减少装饰元素','打样图已确认，正式拍摄按此执行'],
      todoTitles:['确认产品到货时间','出灯光布景图','预约摄影师档期'],
      fullRefShot:true,favType:'mood',favIndex:0},
    {status:'后期中',name:'海边日落 · 情侣写真',theme:'海边日落 · 情侣写真',label:'海边日落',days:2,
      art:[['#c57b4c','#f9e9d7'],['#6d7f96','#e9eef3']],colors:[],
      moodTexts:['黄金时刻最后 20 分钟，逆光勾出轮廓','自然互动，避免长时间摆姿'],
      shotNames:['沙滩牵手背影（远景）','浪花边相拥（中景）'],
      nodeTitles:['抵达机位','黄金时刻拍摄','素材备份'],
      sceneNames:['西海岸沙滩','海边栈道'],itemNames:['浅色情侣装','沙滩巾'],
      budgetItems:['场地交通','精修后期'],
      noteTexts:['客户希望保留皮肤质感，不要过度磨皮','选片链接已发送，等待回复'],
      todoTitles:['完成第一轮调色','导出选片预览'],
      fullRefShot:false,favType:'notes',favIndex:0},
    {status:'已交付',name:'老城街拍 · 城市系列',theme:'老城街拍 · 城市系列',label:'老城街拍',
      art:[['#8b6b4a','#efe6d8'],['#5a6b60','#e8ece6']],colors:['#c8a97e'],
      moodTexts:['砖墙、窄巷与午后斑驳光影','纪实感优先，保留生活现场声音'],
      shotNames:['巷口自行车（中景）','窗边老人（特写）','街角早餐摊（全景）'],
      nodeTitles:['老城集合','街拍路线确认','交付复盘'],
      sceneNames:['南城老街','街角早餐摊','居民楼窗边'],itemNames:['轻便相机','备用电池'],
      budgetItems:['拍摄服务费','交通与餐饮','精修交付'],
      noteTexts:['客户已确认成片，无修改意见','交付文件已发送，等待归档确认'],
      todoTitles:['打包交付文件','归档项目素材','发送发票'],
      fullRefShot:false,favType:'shots',favIndex:0},
    {status:'已归档',name:'冬日暖阳 · 家庭纪实',theme:'冬日暖阳 · 家庭纪实',label:'冬日暖阳',
      art:[['#a97a4e','#f5ebe0'],['#7c8a76','#eef0e8']],colors:[],
      moodTexts:['上午十点的窗光，柔和地落在餐桌一角','不指挥动作，记录自然相处'],
      shotNames:['客厅互动（中景）','窗边阅读（特写）'],
      nodeTitles:['上门布光','家庭互动拍摄','素材整理'],
      sceneNames:['客户家中客厅','阳台窗边'],itemNames:['柔光伞','暖色滤片'],
      budgetItems:['上门拍摄','后期制作'],
      noteTexts:['客户对交付满意，已收到书面好评','项目资料已归档，仅保留备份'],
      todoTitles:['确认归档备份','整理客户反馈'],
      fullRefShot:false,favType:'mood',favIndex:0}
  ];
}
function buildDemoProject(spec,mkId,now){
  const s=spec||{}, stamp=Number(now)||Date.now();
  const d0=new Date(stamp);
  const fmtDay=dt=>dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  const day=fmtDay(d0);
  /* v10 多日拍摄：spec.days>1 时生成连续多天（本地日期构造，与 addDays 同语义；本函数会被 vm 单独抽取，故不引用 addDays） */
  const dayCount=Math.max(1,Math.min(7,Math.round(+s.days||0)||1));
  const days=[day];
  for(let i=1;i<dayCount;i++) days.push(fmtDay(new Date(d0.getFullYear(),d0.getMonth(),d0.getDate()+i)));
  const p={id:mkId('p'),v3:1,name:s.name||'示例策划案',client:s.label||'示例客户',
    studio:'瞬刻摄影工作室',status:s.status||'灵感期',shootDate:day,
    location:s.label||'本地',lat:32.06,lng:118.78,createdAt:stamp,updatedAt:stamp,
    demo:true,v9:1,
    concept:{theme:s.theme||'',model:'示例模特',style:'胶片感 / 自然光 / 松弛叙事',
      audience:'25-40 岁都市人群',usage:'作品集与客户交付',
      note:'这是一份只读示例，点「复制为我的项目」后即可自由编辑。'},
    mood:[],shots:[],schedule:[],scenes:[],items:[],budget:[],notes:[],todos:[],tagVocab:['示例','参考'],
    shootDates:days.slice(),dayInit:days.slice()};
  (s.art||[]).forEach((pal,i)=>{
    p.mood.push({id:mkId('im'+i),type:'image',content:mkId('img'+i),tag:'示例图',tags:['示例','参考']});
  });
  (s.moodTexts||[]).forEach((txt,i)=>{
    p.mood.push({id:mkId('mt'+i),type:'text',content:txt,tag:'调性',tags:['示例','调性']});
  });
  (s.colors||[]).forEach((color,i)=>{
    p.mood.push({id:mkId('mc'+i),type:'color',content:color,tag:'配色',tags:['示例','配色']});
  });
  const sceneIds=(s.sceneNames||[]).map((name,i)=>{
    const id=mkId('sc'+i);
    p.scenes.push({id,name,note:'示例场景：'+name,done:i===0});
    return id;
  });
  const posPool=['平视','俯拍','仰拍','过肩'],lightPool=['顺光','侧光','逆光','黄金时刻'];
  const shotNames=s.shotNames||[];
  const perDay=Math.max(1,Math.ceil(shotNames.length/days.length));   // 多日示例：分镜均分到各天
  shotNames.forEach((name,i)=>{
    /* v10：分镜不再写死时间，slot 由 rescheduleDay 从 10:00 起顺序派生 */
    p.shots.push({id:mkId('sh'+i),name:name,date:days[Math.min(days.length-1,Math.floor(i/perDay))],
      duration:10,sceneId:sceneIds[i%Math.max(1,sceneIds.length)]||'',
      position:posPool[i%posPool.length],light:lightPool[i%lightPool.length],
      refIds:[],note:'示例分镜 '+name,done:false,ord:i,fav:false});
  });
  const imgs=p.mood.filter(m=>m.type==='image').map(m=>m.content);
  if(s.fullRefShot&&p.shots.length&&imgs.length>=3) p.shots[0].refIds=imgs.slice(0,3);
  /* v10：每一天都有自己的「集合」（auto:'call'）与「收工」（auto:'wrap'），时间由 planDay 接管；
     其余环节是用户输入的位置节点，不自动改写，只在插入/编辑时把其后的节点链式顺延。业务环节只放在首日。 */
  days.forEach(function(d){
    p.schedule.push({id:mkId('ndc'),type:'集合',title:'集合 · 器材清点与出发',start:'09:30',end:'10:00',
      note:'示例流程',date:d,done:true,fav:false,auto:'call'});
  });
  (s.nodeTitles||[]).forEach((title,i)=>{
    const start=String(13+i).padStart(2,'0')+':00';
    p.schedule.push({id:mkId('nd'+i),type:i===0?'拍摄':'转场',title:title,start:start,
      end:String(13+i).padStart(2,'0')+':30',note:'示例流程',date:days[0],done:false,fav:false});
  });
  days.forEach(function(d){
    p.schedule.push({id:mkId('ndw'),type:'收工',title:'收工 · 素材备份与复盘',start:'18:00',end:'18:15',
      note:'',date:d,done:false,fav:false,auto:'wrap'});
  });
  (s.itemNames||[]).forEach((name,i)=>{
    p.items.push({id:mkId('it'+i),kind:i%2?'器材':'服装道具',name,note:'示例物资',done:false});
  });
  (s.budgetItems||[]).forEach((item,i)=>{
    p.budget.push({id:mkId('bg'+i),item,cat:'其他',amount:200+i*100,paid:i===0});
  });
  (s.noteTexts||[]).forEach((content,i)=>{
    p.notes.push({id:mkId('nt'+i),kind:i%2?'微信':'电话',content,ts:stamp-i*864e5});
  });
  (s.todoTitles||[]).forEach((title,i)=>{
    p.todos.push({id:mkId('td'+i),title,owner:'我',due:day,done:false});
  });
  migrate(p);
  /* 物化 slot / 收工时间；vm 逻辑测试里只抽取本函数，没有 rescheduleDay，用 typeof 守卫跳过 */
  if(typeof rescheduleDay==='function') days.forEach(function(d){ rescheduleDay(p,d); });
  const target=(p[({mood:'mood',shots:'shots',schedule:'schedule',scenes:'scenes',items:'items',budget:'budget',notes:'notes',todos:'todos'})[s.favType]||'shots']||[])[s.favIndex||0];
  if(target) target.fav=true;
  return p;
}

/* v3 数据迁移：旧项目补齐新字段 */
/* ===== 导入净化（纯函数层）：不可信 JSON → 安全结构（A1/C1） ===== */
/* 备份文件是不可信输入。sanitizeProject 在数据进入内存前收敛它：
   ① 实体 id 全部重写为 mkId()（默认 uid）生成的新 id，内部引用（shots.sceneId）同步映射——
      从根上消灭「恶意 id 拼进 DOM / 内联 handler」的注入面（渲染层 jstr/esc 是第二道防线）；
   ② status 收敛到 STATUSES 白名单；③ 显示字段强转字符串并截断（防类型混乱崩溃）；
   ④ 数组过滤非对象成员、数值字段收敛为安全数字；⑤ 图片 key（mood.content / refs.key / refIds）
      保持原样（要对上 IndexedDB 二进制），仅强转字符串。
   会被 tests 抽取进 vm：只用 Object/Array/String/Number/Math/RegExp，禁 parseInt/isNaN/Boolean/Map。 */
function sanitizeProject(raw,mkId){
  const gen=(typeof mkId==='function')?mkId:uid;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return null;
  const s=v=>String(v==null?'':v);
  const cut=(v,n)=>s(v).slice(0,n);
  const date=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s(v));
    return (m&&+m[2]>=1&&+m[2]<=12&&+m[3]>=1&&+m[3]<=31)?m[0]:'';};   // 形状 + 月/日范围双重校验
  const time=v=>{const m=/^(\d{1,2}):(\d{2})$/.exec(s(v));return m&&+m[1]<24&&+m[2]<60?String(+m[1]).padStart(2,'0')+':'+m[2]:'';};
  const bool=v=>v===true;
  const objs=arr=>(Array.isArray(arr)?arr:[]).filter(x=>x&&typeof x==='object');
  const strs=arr=>(Array.isArray(arr)?arr:[]).map(x=>cut(x,120)).filter(Boolean);
  const dates=arr=>(Array.isArray(arr)?arr:[]).map(s).filter(date);
  const amount=v=>Math.min(999999999,Math.max(0,+v||0));
  const ids=Object.create(null);
  /* 缺 id 的成员必须各自拿新 id：若把它们都映射到同一个空字符串键，
     同一批导入的分镜/场景会共享一个 id，删除/勾选按 id 命中的就不再是单条。 */
  const nid=old=>{const k=s(old);if(!k)return gen();if(!ids[k])ids[k]=gen();return ids[k];};
  const p={id:gen(),v3:1};
  p.name=cut(raw.name,120)||'未命名拍摄项目';
  p.client=cut(raw.client,120); p.studio=cut(raw.studio,120);
  p.status=STATUSES.indexOf(raw.status)>=0?raw.status:'灵感期';
  p.location=cut(raw.location,120); p.timeZone=cut(raw.timeZone,80);
  p.workspaceMode=['casual','portrait','professional','custom'].includes(raw.workspaceMode)?raw.workspaceMode:'professional';
  p.workspaceCustom=workspaceModules('custom',raw.workspaceCustom);
  p.lat=cut(raw.lat,32); p.lng=cut(raw.lng,32);
  p.shootDate=date(raw.shootDate);
  p.shootDates=dates(raw.shootDates); p.dayInit=dates(raw.dayInit);
  p.createdAt=(+raw.createdAt>0)?+raw.createdAt:Date.now();
  p.updatedAt=(+raw.updatedAt>0)?+raw.updatedAt:Date.now();
  p.demo=(raw.demo===true); p.assetPack=raw.assetPack===true;
  const c=(raw.concept&&typeof raw.concept==='object')?raw.concept:{};
  p.concept={theme:cut(c.theme,200),model:cut(c.model,200),style:cut(c.style,200),
    audience:cut(c.audience,200),usage:cut(c.usage,200),note:cut(c.note,4000)};
  p.tagVocab=strs(raw.tagVocab);
  p.mood=objs(raw.mood).map(x=>({id:nid(x.id),
    type:['text','color','image'].indexOf(x.type)>=0?x.type:'text',
    content:cut(x.content,x.type==='image'?200:(x.type==='color'?64:4000)),
    tag:cut(x.tag,120),tags:strs(x.tags),autoTags:strs(x.autoTags),fav:bool(x.fav)}));
  p.refs=objs(raw.refs).map(x=>({id:nid(x.id),key:cut(x.key,200),name:cut(x.name,120),
    tags:strs(x.tags),createdAt:(+x.createdAt>0)?+x.createdAt:0,fav:bool(x.fav)}));
  p.scenes=objs(raw.scenes).map(x=>({id:nid(x.id),name:cut(x.name,120),note:cut(x.note,1000),
    done:bool(x.done),fav:bool(x.fav)}));
  p.shots=objs(raw.shots).map(x=>({id:nid(x.id),name:cut(x.name,200),date:date(x.date),
    slot:time(x.slot),   /* 排程结果是持久数据（导出文件里有）：丢掉会让导入后的时间轴/通告单全部落到 24:00 */
    duration:(+x.duration>0)?Math.max(5,Math.min(1440,Math.round(+x.duration))):null,
    sceneId:ids[s(x.sceneId)]||'',
    refIds:(Array.isArray(x.refIds)?x.refIds:[]).map(y=>cut(y,200)).filter(Boolean).slice(0,3),
    position:cut(x.position,20),light:cut(x.light,20),note:cut(x.note,1000),
    done:bool(x.done),mustShoot:bool(x.mustShoot),skipped:bool(x.skipped),deferred:bool(x.deferred),ord:(+x.ord>0)?Math.round(+x.ord):0,fav:bool(x.fav)}));
  p.schedule=objs(raw.schedule).map(x=>({id:nid(x.id),type:cut(x.type,20),title:cut(x.title,200),
    start:time(x.start),end:time(x.end),note:cut(x.note,1000),date:date(x.date),
    done:bool(x.done),fav:bool(x.fav),timeLocked:bool(x.timeLocked),auto:(x.auto==='call'||x.auto==='wrap')?x.auto:null}));
  p.items=objs(raw.items).map(x=>({id:nid(x.id),kind:x.kind==='器材'?'器材':'服装道具',
    name:cut(x.name,120),note:cut(x.note,500),done:bool(x.done),fav:bool(x.fav)}));
  p.budget=objs(raw.budget).map(x=>({id:nid(x.id),item:cut(x.item,120),cat:cut(x.cat,20),
    amount:amount(x.amount),paid:bool(x.paid),fav:bool(x.fav)}));
  p.notes=objs(raw.notes).map(x=>({id:nid(x.id),kind:cut(x.kind,20),content:cut(x.content,4000),
    ts:(+x.ts>0)?+x.ts:0,fav:bool(x.fav)}));
  p.todos=objs(raw.todos).map(x=>({id:nid(x.id),title:cut(x.title,200),owner:cut(x.owner,60),
    due:date(x.due),done:bool(x.done),fav:bool(x.fav)}));
  return p;
}
function migrate(p){
  p.mood=p.mood||[]; p.scenes=p.scenes||[]; p.shots=p.shots||[]; p.items=p.items||[]; p.budget=p.budget||[];
  p.schedule=p.schedule||[]; p.notes=p.notes||[]; p.todos=p.todos||[];
  p.dayInit=Array.isArray(p.dayInit)?p.dayInit:[];        // v10：已完成默认项初始化的日期（删掉集合/收工后不复活）
  /* v10.4.1：参考图库元数据（二进制仍在 IndexedDB images store）。
     老项目升级：mood 里的图片全部转入参考图库；只有用户显式收藏过（fav:true）的
     仍留在情绪板（＝真正的精选），其余移出，避免客户提案堆满历史参考图。
     标签随条目带到 refs，图片 key 不变 → 分镜引用不丢。
     migrate 会被 tests 单独抽取进 vm，不能依赖 uid —— 迁移条目 id 直接用 key。 */
  p.refs=Array.isArray(p.refs)?p.refs.slice():[];
  const refKeys=new Set(p.refs.map(function(r){return String((r&&r.key)||'');}).filter(Boolean));
  const keptMood=[];
  (p.mood||[]).forEach(function(m){
    if(!m||m.type!=='image'||!m.content){ keptMood.push(m); return; }
    const k=String(m.content);
    if(!refKeys.has(k)){
      refKeys.add(k);
      p.refs.push({id:k,key:k,name:'',tags:(Array.isArray(m.tags)?m.tags.slice():(m.tag?[m.tag]:[])),createdAt:0,fav:false});
    }
    if(m.fav===true||p.demo===true) keptMood.push(m);   // 显式收藏 = 精选；示例项目的图本就是展示用精选，均留在情绪板
  });
  p.mood=keptMood;
  /* v10 多日拍摄：shootDates 为真源，shootDate 恒等于 shootDates[0]（看板倒计时 / 通告单等消费方零改动）。
     与 normalizeShootDates 同源逻辑，因 migrate 会被 tests 单独抽取进 vm，这里必须自包含。 */
  p.shootDates=(Array.isArray(p.shootDates)?p.shootDates:[])
    .filter(function(d){ return /^\d{4}-\d{2}-\d{2}$/.test(String(d==null?'':d)); });
  if(!p.shootDates.length&&p.shootDate) p.shootDates=[p.shootDate];
  p.shootDates=Array.from(new Set(p.shootDates)).sort();
  p.shootDate=p.shootDates[0]||'';
  p.concept=p.concept||{theme:'',style:'',audience:'',usage:'',note:'',model:''};
  if(p.concept.model===undefined) p.concept.model='';
  p.shots.forEach(s=>{
    if(s.refId!==undefined&&!s.refIds) s.refIds=s.refId?[s.refId]:[];
    s.refIds=s.refIds||[]; delete s.refId;
    if(s.duration==null) s.duration=10;                   // 历史数据兜底与新分镜默认统一 10（表单 / addShot / planDay 同源）
    if(s.ord==null) s.ord=0;
    if(s.position==null) s.position='';                   // v10：机位
    if(s.light==null) s.light='';                         // v10：光线
  });
  p.schedule.forEach(n=>{ n.done=!!n.done; });
  migrateFav(p);
  migrateTags(p);
  return p;
}
/* 内存缓存 + 异步持久化：UI 层仍同步读 loadP()，写通过 saveP() 合并后落 IndexedDB。
   P0 加固：串行化写入（避免并发事务竞态）+ 失败指数退避重试 + 页面隐藏强制 flush，
   消除「200ms 防抖窗口内关页/刷新导致末次写入丢失」与「落盘失败仅提示无重试」两个风险。 */
/* 三方合并以项目为原子：不同时修改的项目安全合并；同项目分歧、删除/编辑冲突拒绝。
   不用 updatedAt 判等，避免同毫秒写入及旧版客户端时间差。 */
function projectDataEqual(a,b){
  const first=JSON.stringify(a),second=JSON.stringify(b);
  if(first===second)return true;
  if(first===undefined||second===undefined)return false;
  // IndexedDB structured clone can reconstruct property order differently.
  // Arrays remain ordered; only object property order is irrelevant.
  const ordered=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)
    ?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
  return ordered(a)===ordered(b);
}
function mergeProjectChanges(base,local,remote){
  const index=rows=>{
    const m=new Map();
    for(const p of rows||[]){if(!p||typeof p.id!=='string'||!p.id||m.has(p.id))return null;m.set(p.id,p);}
    return m;
  };
  const b=index(base),l=index(local),r=index(remote);
  if(!b||!l||!r)return null;
  const ids=new Set([...r.keys(),...l.keys(),...b.keys()]),out=[];
  const same=projectDataEqual;
  for(const id of ids){
    const before=b.get(id),mine=l.get(id),theirs=r.get(id);
    const mc=!same(mine,before),rc=!same(theirs,before);
    if(mc&&rc&&!same(mine,theirs))return null;
    const value=mc?mine:theirs;if(value!==undefined)out.push(value);
  }
  return out;
}
let projectsCache=null, persistTimer=null;
let persistChain=Promise.resolve();      // 串行化所有落盘，保证写入顺序与最终一致性
let pendingPersist=false, persistFailed=false;
let persistExpected=null, persistConflict=false, persistGeneration=0, persistClearing=false;
let persistChannel=null,persistLastError='';
function persistErrorCode(err){
  const name=String(err&&err.name||'Error');
  const codes=['QuotaExceededError','UnknownError','InvalidStateError','TransactionInactiveError','AbortError','DataCloneError','SecurityError','VersionError','NotReadableError','ConstraintError'];
  return codes.includes(name)?name:'IDB_WRITE_ERROR';
}
function showPersistFailure(code){
  if(typeof document==='undefined'||!document.body)return;
  let tip=document.getElementById('persistFailureTip');
  if(!tip){
    tip=document.createElement('div');tip.id='persistFailureTip';tip.className='backup-tip show';
    tip.setAttribute('role','alert');tip.style.cssText='position:sticky;top:0;z-index:100;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const msg=document.createElement('span');msg.id='persistFailureMessage';
    const save=document.createElement('button');save.className='btn btn-primary btn-sm';save.textContent='导出本页备份';save.onclick=()=>exportJSON();
    const retry=document.createElement('button');retry.className='btn btn-ghost btn-sm';retry.textContent='重新尝试保存';retry.onclick=()=>flushPersist();
    tip.append(msg,save,retry);document.body.prepend(tip);
  }
  const advice=code==='QuotaExceededError'?'本地空间可能不足，请先备份。可暂停图库同步，备份成功后再考虑清除可重新下载的图库。':'请先备份，不要刷新或清除网站数据。';
  document.getElementById('persistFailureMessage').textContent='保存失败（'+code+'）。本页修改仍在内存中。'+advice;
}
function clearPersistFailure(){
  persistLastError='';
  if(typeof document!=='undefined'&&document.getElementById)document.getElementById('persistFailureTip')?.remove();
}
function notifyProjectChange(){if(persistChannel)try{persistChannel.postMessage({type:'projects-changed'});}catch{}}
function showRemoteProjectChange(){
  if(persistConflict||document.getElementById('remoteProjectTip'))return;
  const tip=document.createElement('div');tip.id='remoteProjectTip';tip.className='backup-tip show';
  tip.setAttribute('role','status');
  const msg=document.createElement('span');msg.textContent='另一标签页已保存修改。不同项目可自动合并；刷新可查看最新内容。';
  const btn=document.createElement('button');btn.className='btn btn-ghost btn-sm';btn.textContent='保存并刷新';
  btn.onclick=async()=>{await flushPersist();if(!pendingPersist&&!persistConflict&&!persistFailed)location.reload();};
  tip.append(msg,btn);document.body.prepend(tip);
}
/* 冲突不是暂时性 I/O 故障：保留当前页草稿，停止写入，避免重试覆盖另一标签页。 */
function markPersistConflict(){
  persistConflict=true; persistFailed=true; pendingPersist=true;
  if(typeof document!=='undefined'&&document.body&&!document.getElementById('persistConflictTip')){
    const tip=document.createElement('div');
    tip.id='persistConflictTip'; tip.className='backup-tip show';
    tip.setAttribute('role','alert');
    tip.style.cssText='position:sticky;top:0;z-index:100;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const message=document.createElement('span');
    message.textContent='另一标签页已修改数据，或当前存储状态无法确认。本页修改尚未保存。请先导出本页备份，再刷新；不要直接覆盖导入。';
    const btn=document.createElement('button');
    btn.className='btn btn-ghost btn-sm'; btn.textContent='导出本页备份';
    btn.addEventListener('click',()=>exportJSON());
    tip.append(message,btn); document.body.prepend(tip);
    toast('检测到存储冲突，已停止覆盖写入',6000);
  }
}
let storageDegraded=false;               // A2：IndexedDB 不可用（open 失败 / 写入无门）时置真，看板显示降级提示
const PERSIST_MAX_RETRY=5;
function loadP(){ if(!projectsCache) projectsCache=[]; return projectsCache; }
/* 退避延迟：200/400/800/1600/3200ms，上限 10s；独立纯函数便于逻辑测试直接抽取 */
function persistRetryDelay(attempt){ return Math.min(200*Math.pow(2,attempt),10000); }
/* 单次落盘（含退避重试）。snapshot 为固定快照：重试期间的新写入排在 persistChain 链尾，
   最终以最新 projectsCache 为准，不会出现旧快照覆盖新数据。 */
async function writeProjects(snapshot,attempt,generation){
  attempt=attempt||0;
  if(generation==null)generation=persistGeneration;
  if(persistConflict)return false;
  let merged;
  try{
    if(!idb.ready()){
      if(typeof idb.reopenProjects==='function')await idb.reopenProjects();
      if(!idb.ready())throw Object.assign(new Error('IDB_UNAVAILABLE'),{name:'InvalidStateError'});
    }
    if(persistConflict)return false;
    merged=await idb.mergeProjects(snapshot,persistExpected);
  }catch(err){
    const code=persistErrorCode(err);persistLastError=code;
    persistFailed=true;pendingPersist=true;
    // Gallery writes share the origin quota; yield while recovering a project write.
    if(typeof shiseiState!=='undefined'&&shiseiState.running)shiseiState.paused=true;
    const retryable=!['QuotaExceededError','SecurityError','DataCloneError','VersionError','ConstraintError'].includes(code);
    if(retryable&&attempt<PERSIST_MAX_RETRY&&!persistConflict){
      toast('保存遇到问题（'+code+'），正在重试（'+(attempt+1)+'/'+PERSIST_MAX_RETRY+'）…');
      await new Promise(res=>setTimeout(res,persistRetryDelay(attempt)));
      if(['UnknownError','InvalidStateError','TransactionInactiveError','AbortError','NotReadableError'].includes(code)&&typeof idb.reopenProjects==='function'&&!persistConflict){
        try{await idb.reopenProjects();}catch{}
      }
      return writeProjects(snapshot,attempt+1,generation);
    }
    if(code==='VersionError'){markPersistConflict();return false;}
    showPersistFailure(code);toast('保存失败，请立即导出备份！（'+code+'）',8000);
    return false;
  }
  if(merged===null){markPersistConflict();return false;}
  // Transaction has committed. UI/reconciliation errors must never enter the I/O retry path.
  persistExpected=JSON.stringify(merged);
  try{
    const current=mergeProjectChanges(snapshot,projectsCache,merged);
    if(current===null){markPersistConflict();return false;}
    const live=new Map(projectsCache.map(p=>[p.id,p]));
    projectsCache=current.map(p=>{const old=live.get(p.id);return old&&projectDataEqual(old,p)?old:p;});
    pendingPersist=generation!==persistGeneration;
    const recovered=persistFailed;persistFailed=false;storageDegraded=false;
    clearPersistFailure();
    try{notifyProjectChange();if(recovered)toast('数据已保存成功');}catch{}
    return true;
  }catch{
    persistLastError='POST_COMMIT_RECONCILIATION';markPersistConflict();return false;
  }
}
/* 立即冲刷：取消待执行的防抖定时器，把当前 projectsCache 追加到串行写链尾 */
function flushPersist(){
  clearTimeout(persistTimer); persistTimer=null;
  if(!projectsCache||persistConflict||persistClearing) return persistChain;
  // 到达队首才获取快照与基线，防止前一次合并引入的远端项目被旧快照删除。
  persistChain=persistChain.then(()=>{
    if(!pendingPersist||persistConflict||persistClearing)return !persistConflict;
    return writeProjects(JSON.parse(JSON.stringify(projectsCache)),0,persistGeneration);
  });
  return persistChain;
}
function saveP(a){
  projectsCache=a;
  persistGeneration++; pendingPersist=true;
  clearTimeout(persistTimer); persistTimer=null;
  if(persistConflict||persistClearing) return;
  persistTimer=setTimeout(()=>{ flushPersist(); },200);
}
/* 页面隐藏/关闭兜底：visibilitychange→hidden 最可靠（页面仍存活，IDB 事务有宽限期完成）；
   pagehide 再兜一层。仅在有未落盘数据时触发，避免无谓写入。 */
function bindPersistFlush(){
  if(typeof BroadcastChannel!=='undefined'){
    try{persistChannel=new BroadcastChannel('stillmark-projects-v1');persistChannel.onmessage=e=>{
      if(e.data&&e.data.type==='projects-changed')showRemoteProjectChange();
    };}catch{}
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'&&(persistTimer||pendingPersist)) flushPersist();
  });
  window.addEventListener('pagehide',()=>{ if(persistTimer||pendingPersist) flushPersist(); });
}
async function initData(){
  try{ await idb.open(); }catch{ storageDegraded=true; }   // A2：open 失败降级为会话内存模式，不阻断启动
  let arr=null, readOk=false;
  if(idb.ready()){
    try{ arr=await idb.getProjects(); readOk=true; persistExpected=JSON.stringify(arr==null?null:arr); }
    catch{ markPersistConflict(); }
  }
  let migrated=false;
  if(Array.isArray(arr)){
    migrated=arr.some(p=>!p.v3);
    projectsCache=arr.map(p=>{ migrate(p); p.v3=1; return p; });
  } else {
    try{ arr=JSON.parse(localStorage.getItem(LS_PROJ))||[]; }catch{ arr=[]; }
    projectsCache=(Array.isArray(arr)?arr:[]).map(p=>{ migrate(p); p.v3=1; return p; });
    migrated=true;
  }
  /* A2：仅在 IDB 可写时才清理旧 localStorage——否则它是当前唯一持久副本，删了就真丢了 */
  if(idb.ready()&&readOk){
    try{
      const next=JSON.stringify(projectsCache);
      const ok=next===persistExpected||await idb.putProjects(projectsCache,persistExpected);
      if(ok===false) markPersistConflict();
      else { persistExpected=next; localStorage.removeItem(LS_PROJ); }
    }catch{ /* 保留旧副本，后续保存仍使用原读取基线 */ }
  }
  return migrated;
}

/* ================= 太阳时间（NOAA 近似算法） ================= */
function validTimeZone(zone){
  if(!zone) return false;
  try{new Intl.DateTimeFormat('en',{timeZone:zone});return true;}catch{return false;}
}
function projectTimeZone(p){
  if(p&&p.timeZone&&validTimeZone(p.timeZone)) return p.timeZone;
  const city=cityMatch(p);
  return city?(city[0]==='香港'?'Asia/Hong_Kong':city[0]==='澳门'?'Asia/Macau':'Asia/Shanghai'):Intl.DateTimeFormat().resolvedOptions().timeZone;
}
function sunTimes(dateStr,lat,lng,zone){
  if(!dateStr||lat==null||lng==null||lat===''||lng==='') return null;
  const latN=parseFloat(lat), lngN=parseFloat(lng);
  if(!Number.isFinite(latN)||!Number.isFinite(lngN)||Math.abs(latN)>90||Math.abs(lngN)>180) return null;
  const d=new Date(dateStr+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==dateStr) return null;
  const N=Math.floor((d-Date.UTC(d.getUTCFullYear(),0,0))/864e5);
  const g=2*Math.PI/365*(N-1+0.5);
  const eq=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  const dec=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  const latR=latN*Math.PI/180;
  const cosHa=Math.cos(90.833*Math.PI/180)/(Math.cos(latR)*Math.cos(dec))-Math.tan(latR)*Math.tan(dec);
  if(cosHa>1||cosHa<-1) return null;
  const ha=Math.acos(cosHa)*180/Math.PI;
  let format;
  try{format=new Intl.DateTimeFormat('en-GB',{timeZone:zone||undefined,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch{return null;}
  const fmt=m=>{const parts=format.formatToParts(new Date(d.getTime()+Math.round(m)*60000));return parts.find(x=>x.type==='hour').value+':'+parts.find(x=>x.type==='minute').value;};
  const sunrise=720-4*(lngN+ha)-eq, sunset=720-4*(lngN-ha)-eq, noon=720-4*lngN-eq;
  return {sunrise:fmt(sunrise),noon:fmt(noon),sunset:fmt(sunset),goldenStart:fmt(sunset-75),goldenEnd:fmt(sunset),timeZone:format.resolvedOptions().timeZone};
}

/* ================= 预置示例 ================= */
function seed(){
  let seeded=false;
  try{ seeded=localStorage.getItem(LS_SEED)==='1'; }catch{ seeded=false; }
  if(seeded) return;
  /* A3 内容级幂等：localStorage 标志可能缺失/被清（部分清理、多标签页竞态），但内存里已有
     项目或示例时绝不注入、更不得整体替换——老实现 saveP([demo]) 会把 IDB 里的用户项目整批覆盖。 */
  const existing=loadP();
  if(existing.length){ try{ localStorage.setItem(LS_SEED,'1'); }catch{} return; }
  const t=todayStr();
  const scene1=uid(),scene2=uid();
  const demo=migrate({id:uid(),v3:1,name:'城市漫游者 · 人像写真',client:'示例客户',status:'待拍摄',shootDate:t,
    location:'南京 · 老门东片区',lat:32.06,lng:118.78,createdAt:Date.now(),updatedAt:Date.now(),demo:true,
    concept:{theme:'城市漫游者',style:'胶片感 / 暖调 / 生活流抓拍',audience:'25-35 岁都市女性',usage:'客片 20 张精修 + 作品集 + 小红书宣发',note:'突出“一个人在城市里自洽漫游”的状态。'},
    mood:[
      {id:uid(),type:'text',content:'午后四点侧逆光，尘埃在光束里浮动',tag:'光线',fav:true},
      {id:uid(),type:'color',content:'#c8a97e',tag:'主色'},
      {id:uid(),type:'color',content:'#5d6b5a',tag:'辅色'},
      {id:uid(),type:'text',content:'关键词：松弛感、胶片颗粒、不摆拍',tag:'调性'}
    ],
    scenes:[
      {id:scene1,name:'五道营胡同',note:'15:00-17:00 光线最佳，避开周末',done:true},
      {id:scene2,name:'Metal Hands 咖啡馆',note:'已沟通拍摄许可，点单即可',done:false}
    ],
    dayInit:[t],shootDates:[t],
    shots:[
      {id:uid(),name:'巷口逆光回眸（中景）',date:t,duration:10,sceneId:scene1,position:'平视',light:'侧逆光',refIds:[],note:'等一束侧逆光',done:false,ord:0},
      {id:uid(),name:'胡同行走背影（远景）',date:t,duration:10,sceneId:scene1,position:'侧背',light:'逆光',refIds:[],note:'',done:true,ord:1},
      {id:uid(),name:'咖啡馆窗边侧脸（特写）',date:t,duration:10,sceneId:scene2,position:'平视',light:'窗光',refIds:[],note:'85mm 大光圈',done:false,ord:2},
      {id:uid(),name:'天台黄昏剪影（全景）',date:t,duration:10,sceneId:'',position:'仰拍',light:'剪影',refIds:[],note:'看日落时间调整',done:false,ord:3}
    ],
    schedule:[
      {id:uid(),type:'集合',title:'地铁口集合，检查器材',start:'09:30',end:'10:00',note:'带备用电池 ×2',done:true,auto:'call'},
      {id:uid(),type:'化妆造型',title:'化妆师到场，妆造 45 分钟',start:'10:00',end:'10:45',note:'妆造在胡同口阴凉处',done:false},
      {id:uid(),type:'转场',title:'胡同 → 咖啡馆（步行 10 分钟）',start:'12:30',end:'12:40',note:'',done:false},
      {id:uid(),type:'收工',title:'复盘当日素材，确认交片时间',start:'18:00',end:'18:15',note:'',done:false,auto:'wrap'}
    ],
    items:[
      {id:uid(),kind:'服装',name:'燕麦色廓形风衣',note:'客户自备',done:true},
      {id:uid(),kind:'道具',name:'旧胶片机道具',note:'器材架第二层',done:false},
      {id:uid(),kind:'器材',name:'Sony A7M4 + 35mm F1.4',note:'主机位',done:true},
      {id:uid(),kind:'器材',name:'反光板（金面）',note:'补面光',done:false}
    ],
    budget:[
      {id:uid(),item:'化妆师',cat:'人员',amount:800,paid:true},
      {id:uid(),item:'场地低消',cat:'场地',amount:200,paid:false}
    ],
    notes:[
      {id:uid(),kind:'微信',content:'客户确认服装为燕麦色风衣，不喜欢大面积红色',ts:Date.now()-864e5*2},
      {id:uid(),kind:'电话',content:'咖啡馆确认周末可拍，建议避开 11-13 点高峰',ts:Date.now()-864e5}
    ],
    todos:[
      {id:uid(),title:'给客户发提案确认报价',owner:'我',due:todayStr(),done:false},
      {id:uid(),title:'检查 SD 卡并格式化',owner:'我',due:todayStr(),done:true},
      {id:uid(),title:'预约精修排期（交片 10 月 30 日前）',owner:'',due:'',done:false}
    ]});
  rescheduleDay(demo,t);   // 预置示例同样走排程引擎：slot 从集合结束起顺序派生，收工按最晚结束 +15
  saveP(existing.concat([demo]));          // A3：追加而非整体替换（existing 恒为空，双保险）
  try{ localStorage.setItem(LS_SEED,'1'); }catch{}
}
/* v9 示例注入：独立于 seed，双 guard 幂等；只追加新示例与给旧「城市漫游者」补三个字段 */
async function ensureV9Demo(){
  let flagged=false;
  try{ flagged=localStorage.getItem(LS_DEMO_V9)==='1'; }catch{ flagged=false; }
  const a=loadP();
  if(flagged||a.some(p=>p&&p.demo===true&&p.v9===1)) return;
  const now=Date.now(), images=[];
  const old=a.find(p=>p&&!p.demo&&String(p.name||'').indexOf('城市漫游者')===0);
  if(old){
    old.demo=true;
    const hasFav=FAV_KINDS.some(k=>(old[k]||[]).some(it=>isFav(it)));
    if(!hasFav&&old.mood.length) old.mood[0].fav=true;
    const hasImg=old.mood.some(m=>m.type==='image');
    if(!hasImg){
      const key=uid(), data=slugPreview('城市漫游者 · 示例',['#9a6a33','#f3e9da']);
      old.mood.push({id:uid(),type:'image',content:key,tag:'示例图',tags:['示例'],fav:false});
      imgCache[key]=data; images.push([key,data]);
    }
  }
  demoSpecs().forEach(spec=>{
    const p=buildDemoProject(spec,()=>uid(),now);
    a.push(p);
    (p.mood||[]).filter(m=>m.type==='image').forEach((m,i)=>{
      const pal=(spec.art||[])[i]||['#9a6a33','#f3e9da'];
      const data=slugPreview(spec.label+' '+(i+1),pal);
      imgCache[m.content]=data; images.push([m.content,data]);
    });
  });
  saveP(a);
  try{ localStorage.setItem(LS_DEMO_V9,'1'); }catch{}
  for(const [key,data] of images){
    try{ await idb.put(key,data); }catch{ /* 内存图仍在，离线可见 */ }
  }
}
function copyDemoToMine(pid){
  const p=loadP().find(x=>x.id===pid&&x.demo===true); if(!p) return;
  const copy=cloneDemo(p,uid(),Date.now());
  view.allowDemoWrite=true;
  try{ saveP([...loadP(),copy]); }finally{ view.allowDemoWrite=false; }
  openProject(copy.id);
  toast('已复制为我的项目，可自由编辑');
}

function searchHit(p,q){
  if(!q) return true;
  const text=[p.name,p.client,p.location,(p.concept||{}).theme,(p.concept||{}).style,
    ...(p.shots||[]).map(s=>s.name),...(p.notes||[]).map(n=>n.content)].join(' ').toLowerCase();
  return text.includes(q);
}
function favoritesButton(){
  const n=collectFavorites(loadP()).length;
  return '<button class="btn btn-ghost btn-sm" onclick="openFavorites()">★ 已收藏 '+n+'</button>';
}
function demoBadge(p){ return p&&p.demo===true?'<span class="badge demo">示例</span>':''; }

