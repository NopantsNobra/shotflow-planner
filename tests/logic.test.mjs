import fs from 'node:fs';
import vm from 'node:vm';
const target = new URL('../shotflow.html', import.meta.url);
const html = fs.readFileSync(target, 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function fn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing fn ' + name);
  const start = src.slice(Math.max(0, i - 6), i) === 'async ' ? i - 6 : i;
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}' && started && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error('unbalanced fn ' + name);
}
const ctx = vm.createContext({ console, Date, Math, String, Number, Array, Object, JSON, RegExp, Set, encodeURIComponent });
/* migrateFav / collectFavorites 已复用主文件 FAV 常量（去重），vm 上下文需同步注入 */
vm.runInContext("globalThis.FAV_KINDS=['mood','shots','schedule','scenes','items','budget','notes','todos']"
  + ";globalThis.FAV_META={mood:'情绪板',shots:'分镜',schedule:'日程',scenes:'清单',items:'清单',budget:'预算',notes:'协作',todos:'协作'};", ctx);
for (const n of ['addMin', 'toMin', 'fmtMin', 'dayItems', 'cascadeShift', 'tagKey', 'dedupeTags', 'parseTagsInput', 'mergeVocab', 'migrateTags', 'tagsForDisplay', 'matchByTags', 'renameTag', 'removeTag', 'shiseiItemKey', 'shiseiEntrySame', 'parseCatalog', 'diffCatalog', 'nextPendingBatch', 'mergeShiseiMeta', 'migrate']) vm.runInContext(fn(n), ctx);
for (const n of ['freshView', 'clearInlineEditState', 'migrateFav', 'isFav', 'favCount', 'favSummary', 'summary40', 'collectFavorites', 'backupItemCount', 'matchBoardScope', 'isActiveStatus', 'parseMultiImage', 'slugPreview', 'cloneDemo', 'demoSpecs', 'buildDemoProject']) vm.runInContext(fn(n), ctx);
vm.runInContext(fn('suggestTags'), ctx);
vm.runInContext('const AI_TAGGING_ENABLED=false; const TagProviders=Object.create(null);', ctx);
vm.runInContext('globalThis.__initData = (' + fn('initData') + ')', ctx);

let pass = 0, fail = 0;
function check(name, cond, extra = '') { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')); }

check('toMin 15:00=900', vm.runInContext('toMin("15:00")', ctx) === 900);
check('fmtMin 960=16:00', vm.runInContext('fmtMin(960)', ctx) === '16:00');
check('addMin 23:30+60=00:30', vm.runInContext('addMin("23:30",60)', ctx) === '00:30');

const project = {
  shots: [
    { id: 'a', date: '2026-11-16', slot: '15:00', duration: 60, name: 'A', refIds: [] },
    { id: 'b', date: '2026-11-16', slot: '15:30', duration: 20, name: 'B', refIds: [] },
    { id: 'c', date: '2026-11-16', slot: '16:30', duration: 30, name: 'C', refIds: [] }
  ],
  schedule: [{ id: 'n', date: '2026-11-16', start: '16:45', end: '17:15', title: 'N', type: '转场' }]
};
vm.runInContext('globalThis.P = ' + JSON.stringify(project), ctx);
const items = vm.runInContext('dayItems(P,"2026-11-16")', ctx);
check('dayItems 合并 4 条', items.length === 4, '实际 ' + items.length);
check('排序正确', items.map(x => x.id).join(',') === 'a,b,c,n', items.map(x => x.id).join(','));
check('B 被标记重叠', items.find(x => x.id === 'b')._conflict === true);
check('C 无重叠', items.find(x => x.id === 'c')._conflict === false);
check('节点 end 有效', items.find(x => x.id === 'n')._end === 1035);

const shifted = vm.runInContext(`(() => {
  const moved = cascadeShift(P,'2026-11-16','a',60);
  return { moved, conflicts: dayItems(P,'2026-11-16').filter(x => x._conflict).length,
    times: dayItems(P,'2026-11-16').map(x => x._time).join(',') };
})()`, ctx);
check('级联顺延后冲突归零', shifted.conflicts === 0, JSON.stringify(shifted));
check('级联顺延移动 4 项', shifted.moved === 4, '实际 ' + shifted.moved);

for (const n of ['coverData', 'cvDate', 'cvNo']) vm.runInContext(fn(n), ctx);
const CD = vm.runInContext(`coverData({name:'光影手记',createdAt:'2026-08-15T10:00:00',shootDate:'2026-09-03',studio:'测试工作室',concept:{theme:'城市漫游',model:'小林'}})`, ctx);
check('封面策划名取自项目名', CD.title === '光影手记', CD.title);
check('封面主题取自概念页', CD.theme === '城市漫游', CD.theme);
check('封面模特取自概念页', CD.model === '小林', CD.model);
check('封面日期格式化', CD.date === '2026.09.03', CD.date);
check('封面编号取自创建时间', CD.no === 'NO. 2026-08', CD.no);
check('封面落款取自元数据', CD.studio === '测试工作室', CD.studio);
check('封面缺省字段不丢内容', vm.runInContext(`coverData({name:'未填日期',concept:{}}).date`, ctx) === '待定');

const migrated = vm.runInContext(`migrate({name:'x',shots:[{id:'s',refId:'img1'}],budget:[]})`, ctx);
check('迁移 refId → refIds', JSON.stringify(migrated.shots[0].refIds) === '["img1"]');
check('迁移补 duration', migrated.shots[0].duration === 20);

// v6 素材标签：归一化 / 去重 / 迁移 / 匹配 / 全局同步
check('tagKey 全半角大小写空白折叠', vm.runInContext('tagKey("  ＧＯＬＤＥＮ　ＨＯＵＲ  ")', ctx) === 'golden hour');
check('tagKey 空值返回空串', vm.runInContext('tagKey(null)+"|"+tagKey("   ")', ctx) === '|');
check('dedupeTags 保留首次显示形式', JSON.stringify(vm.runInContext('dedupeTags(["逆光"," 逆光 ","","Golden Hour","golden hour"])', ctx)) === '["逆光","Golden Hour"]');
check('dedupeTags 非数组返回空数组', JSON.stringify(vm.runInContext('dedupeTags("逆光")', ctx)) === '[]');
check('parseTagsInput 支持中英文逗号分号', JSON.stringify(vm.runInContext('parseTagsInput("逆光，中景;侧逆光；回眸")', ctx)) === '["逆光","中景","侧逆光","回眸"]');
check('parseTagsInput 不拆词内空格', JSON.stringify(vm.runInContext('parseTagsInput("golden hour, 侧 逆 光")', ctx)) === '["golden hour","侧 逆 光"]');
check('mergeVocab 不可变且去重', vm.runInContext('(()=>{const v=["逆光"];const r=mergeVocab(v,["中景","逆光"]);return JSON.stringify({v,r});})()', ctx) === '{"v":["逆光"],"r":["逆光","中景"]}');
check('migrateTags 旧 tag 补 tags 与词表', vm.runInContext('JSON.stringify(migrateTags({mood:[{id:"m",tag:"旧标签",content:"k"}],tagVocab:[]}))', ctx) === '{"mood":[{"id":"m","tag":"旧标签","content":"k","tags":["旧标签"]}],"tagVocab":["旧标签"]}');
check('migrateTags 幂等', vm.runInContext('(()=>{const p=migrateTags({mood:[{tag:"逆光"}],tagVocab:["逆光"]});const a=JSON.stringify(p);migrateTags(p);return a===JSON.stringify(p);})()', ctx));
check('tagsForDisplay 兼容旧 tag', vm.runInContext('tagsForDisplay({tag:"旧"})[0]+"|"+tagsForDisplay({tags:["新"],tag:"旧"})[0]+"|"+tagsForDisplay({tags:[]}).length', ctx) === '旧|新|0');
check('matchByTags any/all/空筛选/旧 tag', vm.runInContext('(()=>{const m={tags:["逆光","Golden Hour"]};return matchByTags(m,[],"any")&&matchByTags(m,["逆光","中景"],"any")&&!matchByTags(m,["逆光","中景"],"all")&&matchByTags(m,["golden hour"],"all")&&matchByTags({tag:"旧"},["旧"],"any");})()', ctx));
const renamed = vm.runInContext(`(() => {
  const p={mood:[{id:"m",content:"img1",tag:"侧逆光",tags:["侧逆光","中景"]},{id:"n",tag:"侧逆光"}],tagVocab:["侧逆光","中景"],shots:[{id:"s",refIds:["img1"]}]};
  renameTag(p,"侧逆光","逆光");
  return {tags:p.mood[0].tags,tag:p.mood[0].tag,vocab:p.tagVocab,content:p.mood[0].content,refs:p.shots[0].refIds};
})()`, ctx);
check('renameTag 全量同步且不改引用', JSON.stringify(renamed) === '{"tags":["逆光","中景"],"tag":"逆光","vocab":["逆光","中景"],"content":"img1","refs":["img1"]}');
const removed = vm.runInContext(`(() => {
  const p={mood:[{id:"m",content:"img1",tag:"侧逆光",tags:["侧逆光","中景"]},{id:"n",tag:"侧逆光"}],tagVocab:["侧逆光","中景"],shots:[{id:"s",refIds:["img1"]}]};
  removeTag(p,"侧逆光");
  return {tags:p.mood[0].tags,tag:p.mood[0].tag,vocab:p.tagVocab,content:p.mood[0].content,refs:p.shots[0].refIds};
})()`, ctx);
check('removeTag 全局移除且不改引用', JSON.stringify(removed) === '{"tags":["中景"],"tag":"","vocab":["中景"],"content":"img1","refs":["img1"]}');
vm.runInContext('globalThis.fetch=()=>{throw new Error("NETWORK")};globalThis.XMLHttpRequest=function(){throw new Error("NETWORK")};', ctx);
let aiOk = false;
try { const r = await vm.runInContext('suggestTags({})', ctx); aiOk = r.tags.length === 0 && r.source === 'ai'; } catch (e) { aiOk = false; }
check('suggestTags 默认关闭且零网络', aiOk);

// v7 shisei 图库：catalog 映射 / diff / 游标 / meta 合并
const parsed = vm.runInContext(`parseCatalog([
  {id:'P001',class_cn:'坐姿',name_cn:'后仰坐',name_en:'Sitting',name_jp:'座り',views:{front:'std_P001_front.webp',diag:null}},
  {id:'P002',class_en:'Standing',name_en:'Standing pose',views:{side:'std_P002_side.webp'}}
])`, ctx);
check('parseCatalog 映射真实 views 字段', parsed.length === 2
  && parsed[0].pid === 'P001' && parsed[0].view === 'front' && parsed[0].cat === '坐姿'
  && parsed[0].zh === '后仰坐' && parsed[0].en === 'Sitting' && parsed[0].ja === '座り'
  && parsed[0].url === 'images/line/w300/std_P001_front.webp');
const parsedFallback = vm.runInContext(`parseCatalog([
  {id:'U009',views:{front:'upper_U009_front.webp'}}
])`, ctx);
check('parseCatalog 缺省字段回退', parsedFallback.length === 1 && parsedFallback[0].cat === '未分类'
  && parsedFallback[0].zh === 'U009' && parsedFallback[0].en === '' && parsedFallback[0].ja === '');
const diffed = vm.runInContext(`(() => {
  const local=[
    {pid:'P001',view:'front',cat:'坐姿',zh:'旧',en:'old',ja:'',url:'images/line/w300/old.webp'},
    {pid:'P009',view:'front',cat:'躺姿',zh:'删',en:'',ja:'',url:'x'}
  ];
  const remote=[
    {pid:'P001',view:'front',cat:'坐姿',zh:'新',en:'new',ja:'',url:'images/line/w300/new.webp'},
    {pid:'P002',view:'side',cat:'站姿',zh:'加',en:'add',ja:'',url:'images/line/w300/add.webp'}
  ];
  return diffCatalog(local,remote);
})()`, ctx);
check('diffCatalog 新增变更删除', JSON.stringify(diffed) === '{"toAdd":[{"pid":"P002","view":"side","cat":"站姿","zh":"加","en":"add","ja":"","url":"images/line/w300/add.webp"}],"toUpdate":[{"pid":"P001","view":"front","cat":"坐姿","zh":"新","en":"new","ja":"","url":"images/line/w300/new.webp"}],"toRemove":["shisei:P009:front"]}');
const diffSame = vm.runInContext(`(() => {
  const remote=[{pid:'P001',view:'front',cat:'坐姿',zh:'同',en:'',ja:'',url:'u'}];
  return diffCatalog(remote,remote);
})()`, ctx);
check('diffCatalog 无变化', diffSame.toAdd.length === 0 && diffSame.toUpdate.length === 0 && diffSame.toRemove.length === 0);
const batch1 = vm.runInContext('nextPendingBatch({pending:["a","b","c"],cursor:0},2)', ctx);
check('nextPendingBatch 截断批次', JSON.stringify(batch1.items.map(x=>x.key)) === '["a","b"]' && batch1.cursor === 2 && batch1.done === false);
const batch2 = vm.runInContext('nextPendingBatch({pending:["a","b","c"],cursor:1},2)', ctx);
check('nextPendingBatch 游标推进至完成', JSON.stringify(batch2.items.map(x=>x.key)) === '["b","c"]' && batch2.cursor === 3 && batch2.done === true);
const batch3 = vm.runInContext('nextPendingBatch({pending:["a"],cursor:5},2)', ctx);
check('nextPendingBatch 游标越界安全', batch3.items.length === 0 && batch3.cursor === 5 && batch3.done === true);
const metaBase = vm.runInContext('({version:"v1",pending:["a"],failStreak:0})', ctx);
vm.runInContext('globalThis.META = ' + JSON.stringify(metaBase), ctx);
const metaMerged = vm.runInContext('mergeShiseiMeta(META,{cursor:2,version:"v2",paused:true})', ctx);
check('mergeShiseiMeta 不可变合并', metaBase.version === 'v1' && metaBase.cursor === undefined && metaBase.pending.length === 1
  && metaMerged.version === 'v2' && metaMerged.cursor === 2 && metaMerged.paused === true && metaMerged.failStreak === 0);

// 数据迁移：旧 localStorage → IndexedDB
const legacy = JSON.stringify([{ id: 'p1', name: '旧案', shots: [{ id: 's1', refId: 'img1' }], mood: [], items: [], budget: [], schedule: [], notes: [], todos: [] }]);
let captured = null;
vm.runInContext(`globalThis.localStorage = { getItem: () => LEGACY, removeItem: k => { globalThis.REMOVED = k; LEGACY = null; } };
globalThis.idb = { open: async()=>{}, getProjects: async()=>undefined, putProjects: async a => { globalThis.CAPTURE = a; } };
globalThis.LS_PROJ = 'wb_sf_projects';
globalThis.LEGACY = ${JSON.stringify(legacy)};`, ctx);
await vm.runInContext('__initData()', ctx);
captured = vm.runInContext('CAPTURE', ctx);
check('initData 迁移旧数据', Array.isArray(captured) && captured.length === 1, JSON.stringify(captured));
check('initData 转换 refId', captured?.[0]?.shots?.[0]?.refIds?.[0] === 'img1');
check('initData 清理旧 localStorage key', vm.runInContext('REMOVED', ctx) === 'wb_sf_projects');

// v9：fav / demo / 示例 / 收藏 / 筛选纯函数
const v = 'wb_v9_';
const fv = vm.runInContext('freshView({mode:"project",pid:"p1"})', ctx);
check('v9 freshView 默认与覆盖', fv.mode === 'project' && fv.pid === 'p1' && fv.boardScope === '全部'
  && fv.allowDemoWrite === false && fv.refViewer === null && fv.focusRef === null
  && fv.editingNodeId === null && fv.editingStuffKey === null);
check('v9 clearInlineEditState 五指针清空', vm.runInContext(`(() => {
  const v={editingNodeId:'n',editingStuffId:'s',editingStuffKey:'scenes',editingTodoId:'t',editingNoteId:'x',editingShotId:'keep'};
  clearInlineEditState(v);
  return !v.editingNodeId&&!v.editingStuffId&&!v.editingStuffKey&&!v.editingTodoId&&!v.editingNoteId&&v.editingShotId==='keep';
})()`, ctx));
check('v9 migrateFav 八数组/demo 默认/true 保留且幂等', vm.runInContext(`(() => {
  const a=migrateFav({shots:[{id:'a'}],demo:'true'});
  const okArrays=['mood','shots','schedule','scenes','items','budget','notes','todos'].every(k=>Array.isArray(a[k]))
    &&a.shots[0].fav===false&&a.demo===false;
  const p=migrateFav({demo:true,mood:[{id:'m',fav:true},{id:'n',fav:'true'}],v9:1});
  const before=JSON.stringify(p); migrateFav(p);
  return okArrays&&p.demo===true&&p.mood[0].fav===true&&p.mood[1].fav===false&&p.v9===1&&before===JSON.stringify(p);
})()`, ctx));
check('v9 isFav + favCount 混合数组', vm.runInContext(`(() => {
  const list=[{fav:true},{fav:false},{fav:'true'},{},null];
  return isFav(list[0])===true&&isFav(list[2])===false&&isFav(null)===false&&favCount(list)===1&&favCount(null)===0;
})()`, ctx));
check('v9 summary40 截断与空白折叠', vm.runInContext(`(() => {
  const s=summary40('  a\\n  b   ');
  const long=summary40('x'.repeat(45));
  return s==='a b'&&long.length===41&&long.slice(-1)==='…';
})()`, ctx));
check('v9 favSummary 八类映射', vm.runInContext(`(() => {
  const m={mood:favSummary('mood',{type:'text',content:'灵感'}),img:favSummary('mood',{type:'image',content:'k'}),
    shots:favSummary('shots',{name:'分镜'}),schedule:favSummary('schedule',{title:'日程'}),
    scenes:favSummary('scenes',{name:'场景'}),items:favSummary('items',{name:'物品'}),
    budget:favSummary('budget',{item:'费用'}),notes:favSummary('notes',{content:'沟通'}),
    todos:favSummary('todos',{title:'待办'})};
  return m.mood==='灵感'&&m.img==='图片'&&m.shots==='分镜'&&m.schedule==='日程'&&m.scenes==='场景'
    &&m.items==='物品'&&m.budget==='费用'&&m.notes==='沟通'&&m.todos==='待办';
})()`, ctx));
const vfav = vm.runInContext(`collectFavorites([{id:'p',name:'X',demo:true,mood:[{id:'m',type:'text',content:'灵感',fav:true},{id:'n',content:'普通'}],todos:[{id:'t',title:'待办',fav:true}]}])`, ctx);
check('v9 collectFavorites 字段与排除非 fav', vfav.length === 2
  && vfav[0].type === 'mood' && vfav[0].pid === 'p' && vfav[0].id === 'm'
  && vfav[0].module === '情绪板' && vfav[0].summary === '灵感' && vfav[0].date === ''
  && vfav[1].type === 'todos' && vfav[1].module === '协作');
check('v9 backupItemCount 排除 demo', vm.runInContext(`backupItemCount([
  {demo:false,shots:[1],mood:[1],items:[1],budget:[1,2],todos:[1],notes:[1,2,3]},
  {demo:true,shots:[1,2,3],mood:[1],items:[1],budget:[1],todos:[1],notes:[1]}
])`, ctx) === 9);
check('v9 matchBoardScope 三档', vm.runInContext(`(() => {
  const done={status:'已交付'}, arch={status:'已归档'}, live={status:'策划中'};
  return matchBoardScope(done,'全部')&&matchBoardScope(done,'已归档')&&matchBoardScope(arch,'已归档')
    &&!matchBoardScope(live,'已归档')&&matchBoardScope(live,'进行中')
    &&!matchBoardScope(done,'进行中')&&!matchBoardScope(arch,'进行中');
})()`, ctx));
check('v9 isActiveStatus 六状态', vm.runInContext(`(() => {
  const st=['灵感期','策划中','待拍摄','后期中','已交付','已归档'];
  return st.map(s=>isActiveStatus({status:s})).join(',')==='true,true,true,true,false,false';
})()`, ctx));
check('v9 parseMultiImage 伪事件过滤', vm.runInContext(`parseMultiImage({target:{files:[
  {type:'image/png'},{type:''},{type:'text/plain'},{}
]}}).length`, ctx) === 3);
const vslug = vm.runInContext(`slugPreview('<b>测试</b>',['#123456','#abcdef'])`, ctx);
check('v9 slugPreview dataURL 且零 http', vslug.startsWith('data:image/svg+xml;charset=utf-8,')
  && vslug.indexOf('http') < 0 && vslug.indexOf('%3Cb%3E') < 0);
check('v9 cloneDemo 深拷贝/删标记/新 id 与时间', vm.runInContext(`(() => {
  const p={id:'old',name:'示例',demo:true,v9:1,v3:9,concept:{theme:'原'},createdAt:1,updatedAt:2};
  const c=cloneDemo(p,'new',999); const before=JSON.stringify(p);
  c.concept.theme='改';
  return c.id==='new'&&c.name==='示例（副本）'&&c.demo===undefined&&c.v9===undefined
    &&c.v3===1&&c.createdAt===999&&c.updatedAt===999&&before===JSON.stringify(p)&&p.concept.theme==='原';
})()`, ctx));
const vdemo = vm.runInContext(`(() => {
  let n=0; const specs=demoSpecs(); const rows=specs.map(spec=>{
    const p=buildDemoProject(spec,tag=>'id_'+(n++),1780000000000);
    const kinds=['mood','shots','schedule','scenes','items','budget','notes','todos'];
    return {status:p.status,
      mood:p.mood.length,hasImg:p.mood.some(m=>m.type==='image'&&!!m.content),
      shots:p.shots.length,sched:p.schedule.length,
      stuff:p.scenes.length+p.items.length,budget:p.budget.length,
      notes:p.notes.length,todos:p.todos.length,
      concept:Object.keys(p.concept).every(k=>!!p.concept[k]),
      fav:kinds.reduce((s,k)=>s+p[k].filter(x=>x.fav===true).length,0),
      refs:p.shots[0].refIds.length,demo:p.demo===true&&p.v9===1};
  });
  return {count:specs.length,rows};
})()`, ctx);
check('v9 demoSpecs 五项且示例七页签非空/含图/含 fav', vdemo.count === 5
  && ['灵感期','策划中','后期中','已交付','已归档'].every(s => vdemo.rows.some(r => r.status === s))
  && vdemo.rows.every(r => r.status !== '待拍摄')
  && vdemo.rows.every(r =>
    r.mood >= 3 && r.hasImg && r.shots >= 2 && r.sched >= 2 && r.stuff >= 3
    && r.budget >= 2 && r.notes >= 2 && r.todos >= 2 && r.concept && r.fav >= 1 && r.demo));
check('v9 buildDemoProject 满 3 张参考图', vdemo.rows.some(r => r.refs === 3));

/* ================= v10 排程引擎（追加块：1-245 行零改动） ================= */
// 先注入常量，再抽取新纯函数；ctx 白名单无 parseInt/isNaN/Boolean，故纯函数内统一用 +x / Math.round
vm.runInContext('const DAY_BASE="10:00",COLLECT_START="09:30",COLLECT_MIN=30,WRAP_MIN=15,SHOT_DEFAULT_MIN=10;', ctx);
for (const n of ['pinOf', 'planDay', 'dayDefaults', 'ensureDayDefaults', 'rescheduleDay', 'applyDay',
  'addDays', 'applyPlanWrite', 'normalizeShootDates', 'shootDatesOf', 'resolveShootDate']) vm.runInContext(fn(n), ctx);

const D10 = '2026-11-16';
const shotRow = (id, ord, duration) => ({ id, date: D10, duration, ord });

// ① 顺序连排：3 条 10 分钟分镜从 10:00 起
vm.runInContext(`globalThis.V1=${JSON.stringify({
  shots: [shotRow('a', 0, 10), shotRow('b', 1, 10), shotRow('c', 2, 10)],
  schedule: [], dayInit: [D10]
})}`, ctx);
check('v10 ① 3 条 10 分钟连排 10:00/10:10/10:20',
  vm.runInContext(`(()=>{const r=planDay(V1,'${D10}',null);return r.shots.map(s=>fmtMin(s.start)).join(',')})()`, ctx) === '10:00,10:10,10:20');

// ② 插入 10:15-10:25 节点（anchor）：第 2 条避让到 10:25，shiftedCount=1
vm.runInContext(`globalThis.V2=${JSON.stringify({
  shots: [shotRow('a', 0, 10), shotRow('b', 1, 10)],
  schedule: [{ id: 'n1', date: D10, type: '拍摄', title: '补拍', start: '10:15', end: '10:25' }],
  dayInit: [D10]
})}`, ctx);
const V2P = vm.runInContext(`(()=>{const r=planDay(V2,'${D10}','n1');return {b:fmtMin(r.shots[1].start),shifted:r.shiftedCount,shifts:r.nodeShifts.length}})()`, ctx);
check('v10 ② 节点避让使第 2 条后移到 10:25', V2P.b === '10:25' && V2P.shifted === 1, JSON.stringify(V2P));

// ③ 集合改晚 → 分镜链起点跟着集合结束走（10:00–10:30 → 10:30；10:30–11:00 → 11:00）
vm.runInContext(`globalThis.V3=${JSON.stringify({
  shots: [shotRow('a', 0, 10)],
  schedule: [{ id: 'c1', date: D10, type: '集合', title: '集合', start: '10:00', end: '10:30', auto: 'call' }],
  dayInit: [D10]
})}`, ctx);
vm.runInContext(`globalThis.V3B=${JSON.stringify({
  shots: [shotRow('a', 0, 10)],
  schedule: [{ id: 'c1', date: D10, type: '集合', title: '集合', start: '10:30', end: '11:00', auto: 'call' }],
  dayInit: [D10]
})}`, ctx);
const V3P = vm.runInContext(`({a:fmtMin(planDay(V3,'${D10}',null).shots[0].start),b:fmtMin(planDay(V3B,'${D10}',null).shots[0].start)})`, ctx);
check('v10 ③ 集合改晚后首条分镜顺延', V3P.a === '10:30' && V3P.b === '11:00', JSON.stringify(V3P));

// ④ 收工 = 当天最晚结束 + 15 分钟
const V4P = vm.runInContext(`(()=>{const r=planDay(V2,'${D10}',null);return {ws:fmtMin(r.wrap.start),len:r.wrap.end-r.wrap.start}})()`, ctx);
check('v10 ④ 收工时间为最晚结束 +15', V4P.ws === '10:35' && V4P.len === 15, JSON.stringify(V4P));

// ⑤ 两个节点重叠 → dayItems 标红（顺序判定，节点时间不被改写）
vm.runInContext(`globalThis.V5=${JSON.stringify({
  shots: [],
  schedule: [
    { id: 'm1', date: D10, type: '拍摄', title: 'A', start: '10:00', end: '11:00' },
    { id: 'm2', date: D10, type: '转场', title: 'B', start: '10:30', end: '11:30' }
  ],
  dayInit: [D10]
})}`, ctx);
check('v10 ⑤ 节点重叠标记 _conflict',
  vm.runInContext(`dayItems(V5,'${D10}').filter(x=>x.id==='m2')[0]._conflict===true`, ctx));

// ⑥ planDay 幂等：连跑两次结果全等
check('v10 ⑥ planDay 幂等',
  vm.runInContext(`(()=>{const a=JSON.stringify(planDay(V2,'${D10}','n1'));const b=JSON.stringify(planDay(V2,'${D10}','n1'));return a===b})()`, ctx));

// ⑦ ord 互换后时间跟随新 ord
vm.runInContext(`globalThis.V7=${JSON.stringify({
  shots: [shotRow('a', 1, 10), shotRow('c', 0, 10)], schedule: [], dayInit: [D10]
})}`, ctx);
check('v10 ⑦ 分镜时间跟随 ord',
  vm.runInContext(`planDay(V7,'${D10}',null).shots.map(s=>s.id+fmtMin(s.start)).join(',')`, ctx) === 'c10:00,a10:10');

// ⑧ 单条时长改大 → 后续全部后移
vm.runInContext(`globalThis.V8=${JSON.stringify({
  shots: [shotRow('a', 0, 30), shotRow('b', 1, 10)], schedule: [], dayInit: [D10]
})}`, ctx);
check('v10 ⑧ 时长变大后后续后移',
  vm.runInContext(`planDay(V8,'${D10}',null).shots.map(s=>fmtMin(s.start)).join(',')`, ctx) === '10:00,10:30');

// ⑨ dayDefaults 幂等：dayInit 已含该日期 → 返回空数组
check('v10 ⑨ dayDefaults 已初始化时返回空',
  vm.runInContext(`dayDefaults(V1,'${D10}').length`, ctx) === 0);

// ⑩ 老数据迁移：position/light 补空串、duration 仍兜底 20；rescheduleDay 后 slot 为 10:00
const mig10 = vm.runInContext(`(()=>{
  const p=migrate({name:'x',shots:[{id:'s',refId:'img1',date:'${D10}'}],budget:[]});
  const f={pos:p.shots[0].position,light:p.shots[0].light,dur:p.shots[0].duration,dayInit:Array.isArray(p.dayInit)};
  rescheduleDay(p,'${D10}');
  f.slot=p.shots[0].slot;
  return f;
})()`, ctx);
check('v10 ⑩ 迁移补 position/light 且不破 duration=20', mig10.pos === '' && mig10.light === '' && mig10.dur === 20 && mig10.dayInit && mig10.slot === '10:00', JSON.stringify(mig10));

// ⑪ 老项目已有「集合 / 收工」但无 auto → adopt 升级，不新增重复项
const dd11 = vm.runInContext(`dayDefaults({
  shots:[],
  schedule:[{id:'c1',date:'${D10}',type:'集合',title:'集合',start:'09:30',end:'10:00'},
            {id:'w1',date:'${D10}',type:'收工',title:'收工',start:'19:00',end:'19:30'}],
  dayInit:[]
},'${D10}')`, ctx);
check('v10 ⑪ 老集合/收工升级为自动节点',
  dd11.length === 2 && dd11.every(d => d.kind === 'adopt')
  && dd11.some(d => d.id === 'w1' && d.auto === 'wrap')
  && dd11.some(d => d.id === 'c1' && d.auto === 'call'), JSON.stringify(dd11));

// ⑫ ensureDayDefaults 幂等：连续两次后集合 / 收工各恰好 1 条
const idem12 = vm.runInContext(`(()=>{
  let i=0; const mk=()=>'n'+(++i);
  const p={shots:[],schedule:[],dayInit:[]};
  ensureDayDefaults(p,'${D10}',mk);
  const first=p.schedule.length;
  ensureDayDefaults(p,'${D10}',mk);
  return {first,after:p.schedule.length,
    call:p.schedule.filter(n=>n.auto==='call').length,
    wrap:p.schedule.filter(n=>n.auto==='wrap').length};
})()`, ctx);
check('v10 ⑫ ensureDayDefaults 幂等', idem12.first === 2 && idem12.after === 2 && idem12.call === 1 && idem12.wrap === 1, JSON.stringify(idem12));

/* ================= v10 多日拍摄 / 自动跨日（8 项） ================= */
const D2 = '2026-11-18';

// ⑬ addDays 跨月 / 跨年
check('v10 ⑬ addDays 跨月跨年',
  vm.runInContext(`addDays('2026-11-18',1)+','+addDays('2026-11-30',1)+','+addDays('2026-12-31',1)`, ctx)
    === '2026-11-19,2026-12-01,2027-01-01');

// ⑭ 单日放不下 → overflowShots 非空且 toDate = 次日
vm.runInContext(`globalThis.V14=${JSON.stringify({
  shots: [{ id: 'a', date: D2, duration: 800, ord: 0 }, { id: 'b', date: D2, duration: 800, ord: 1 }],
  schedule: [], dayInit: [D2], shootDates: [D2], shootDate: D2
})}`, ctx);
const V14 = vm.runInContext(`(()=>{
  const r=planDay(V14,'${D2}',null);
  return {kept:r.shots.length, of:r.overflowShots.length, to:r.overflowShots[0].toDate,
    hard:r.overflowHard, wrap:fmtMin(r.wrap.start)};
})()`, ctx);
check('v10 ⑭ 放不下时分镜滚到次日', V14.kept === 1 && V14.of === 1 && V14.to === '2026-11-19' && V14.hard === false, JSON.stringify(V14));

// ⑮ 分镜被移走后当天收工按剩余最晚结束重算
check('v10 ⑮ 移走后收工 = 剩余最晚结束', V14.wrap === '23:20', V14.wrap);

// ⑯ migrate：有 shootDate 无 shootDates → 数组含该日；两者都无 → 空数组
const V16 = vm.runInContext(`(()=>{
  const a=migrate({name:'x',shootDate:'2026-12-05',shots:[],budget:[]});
  const b=migrate({name:'y',shots:[],budget:[]});
  return {a:a.shootDates,b:b.shootDates,sa:a.shootDate,sb:b.shootDate};
})()`, ctx);
check('v10 ⑯ migrate 补 shootDates 并同步 shootDate',
  V16.a.join(',') === '2026-12-05' && V16.b.length === 0 && V16.sa === '2026-12-05' && V16.sb === '',
  JSON.stringify(V16));

// ⑰ 多日 shootDates 保持升序去重，shootDate 恒为首日
const V17 = vm.runInContext(`(()=>{
  const p=migrate({name:'z',shootDate:'2026-12-03',shootDates:['2026-12-03','2026-12-01','2026-12-01'],shots:[],budget:[]});
  return {list:p.shootDates,first:p.shootDate};
})()`, ctx);
check('v10 ⑰ shootDates 升序去重 + shootDate=首日',
  V17.list.join(',') === '2026-12-01,2026-12-03' && V17.first === '2026-12-01', JSON.stringify(V17));

// ⑱ rescheduleDay 落地跨日：改日期 + 次日从 10:00 起 + 自动补拍摄日
const V18 = vm.runInContext(`(()=>{
  const p={shots:[{id:'a',date:'${D2}',duration:800,ord:0},{id:'b',date:'${D2}',duration:800,ord:1},
                  {id:'c',date:'2026-11-19',duration:10,ord:0}],
    schedule:[], dayInit:['${D2}'], shootDates:['${D2}'], shootDate:'${D2}'};
  const plan=rescheduleDay(p,'${D2}');
  const g=id=>p.shots.filter(x=>x.id===id)[0];
  return {aSlot:g('a').slot, bDate:g('b').date, bSlot:g('b').slot, bOrd:g('b').ord,
    cSlot:g('c').slot, cOrd:g('c').ord, refIds:g('b').refIds===undefined,
    dates:p.shootDates, first:p.shootDate, moved:plan.movedShots, added:plan.addedDates};
})()`, ctx);
check('v10 ⑱ 跨日后次日 10:00 重新起排并自动补拍摄日',
  V18.aSlot === '10:00' && V18.bDate === '2026-11-19' && V18.bSlot === '10:10'
  && V18.dates.join(',') === '2026-11-18,2026-11-19' && V18.first === '2026-11-18'
  && V18.moved === 1 && V18.added.join(',') === '2026-11-19', JSON.stringify(V18));

// ⑱b 跨日分镜的 ord 追加到次日末尾，且不动 refIds 等其它字段
check('v10 ⑱b 跨日分镜 ord 追加到次日末尾',
  V18.cOrd === 0 && V18.cSlot === '10:00' && V18.bOrd === 1 && V18.refIds === true, JSON.stringify(V18));

// ⑲ 递归上限：超长链不会死循环，命中 7 天上限并给出 capHit
const V19 = vm.runInContext(`(()=>{
  const shots=[]; for(let i=0;i<10;i++) shots.push({id:'s'+i,date:'${D2}',duration:800,ord:i});
  const p={shots:shots,schedule:[],dayInit:['${D2}'],shootDates:['${D2}'],shootDate:'${D2}'};
  const plan=rescheduleDay(p,'${D2}');
  return {capHit:plan.capHit,dates:p.shootDates.length,lastSlot:p.shots[9].slot};
})()`, ctx);
check('v10 ⑲ 跨日循环有 7 轮上限保护',
  V19.capHit === true && V19.dates <= 9 && V19.lastSlot !== '', JSON.stringify(V19));

// ⑳ 单条时长超过一整天：不跨日、原位 clamp 并置 overflow
const V20 = vm.runInContext(`(()=>{
  const p={shots:[{id:'h',date:'${D2}',duration:900,ord:0}],schedule:[],dayInit:['${D2}'],shootDates:['${D2}'],shootDate:'${D2}'};
  const plan=planDay(p,'${D2}',null);
  return {of:plan.overflowShots.length,hard:plan.overflowHard,ov:plan.overflow,slot:plan.shots.length?fmtMin(plan.shots[0].start):''};
})()`, ctx);
check('v10 ⑳ 超长分镜不跨日而标溢出', V20.of === 0 && V20.hard === true && V20.ov === true && V20.slot === '10:00', JSON.stringify(V20));

// ㉑ resolveShootDate 替换分支：原 Day 1 无内容 → 用 D 顶掉首日
const V21 = vm.runInContext(`(()=>{
  const p={shots:[],schedule:[{id:'c',date:'2026-12-01',type:'集合',start:'09:30',end:'10:00',auto:'call'}],
    dayInit:['2026-12-01'], shootDates:['2026-12-01'], shootDate:'2026-12-01'};
  const r=resolveShootDate(p,'2026-12-11');
  const same=resolveShootDate(p,'2026-12-01');
  return {action:r.action,dates:r.dates,dayN:r.dayN,from:r.from,
    sameAction:same.action,sameDates:same.dates};
})()`, ctx);
check('v10 ㉑ 无内容时改首日 → 替换（清单仍 1 天）',
  V21.action === 'replace' && V21.dates.join(',') === '2026-12-11' && V21.from === '2026-12-01'
  && V21.sameAction === 'noop' && V21.sameDates.join(',') === '2026-12-01', JSON.stringify(V21));

// ㉒ resolveShootDate 追加分支：Day 1 有分镜 → 追加为 Day N，Day 1 不动
const V22 = vm.runInContext(`(()=>{
  const p={shots:[{id:'s',date:'2026-12-01',duration:10,ord:0}],schedule:[],dayInit:['2026-12-01'],
    shootDates:['2026-12-01'],shootDate:'2026-12-01'};
  const r=resolveShootDate(p,'2026-12-11');
  const back=resolveShootDate(p,'2026-11-01');
  return {action:r.action,dates:r.dates,dayN:r.dayN,kept:r.kept,
    backAction:back.action,backDayN:back.dayN,backDates:back.dates};
})()`, ctx);
check('v10 ㉒ 有内容时改首日 → 追加为 Day N',
  V22.action === 'append' && V22.dates.join(',') === '2026-12-01,2026-12-11' && V22.dayN === 2 && V22.kept === 1
  && V22.backAction === 'append' && V22.backDayN === 1 && V22.backDates.length === 2, JSON.stringify(V22));

/* ===== v10.2 统一与去重 ===== */

// ㉓ shootCountdown：看板/项目页共用倒计时文案（未来→N 天后，今天→今天，过去/非活动→空）
vm.runInContext(fn('shootCountdown'), ctx);
const V23 = vm.runInContext(`(()=>{
  const mk=(date,status)=>({shootDate:date,status:status});
  return {
    future:shootCountdown(mk('2026-12-25','待拍摄'),'2026-11-19'),
    today:shootCountdown(mk('2026-11-19','待拍摄'),'2026-11-19'),
    past:shootCountdown(mk('2026-11-01','待拍摄'),'2026-11-19'),
    done:shootCountdown(mk('2026-12-25','已交付'),'2026-11-19')};
})()`, ctx);
check('v10.2 ㉓ 倒计时文案四态（未来/今天/过去/非活动）',
  V23.future.text === ' · 36 天后' && V23.today.text === ' · 今天' && V23.past.text === '' && V23.done.text === '', JSON.stringify(V23));

// ㉔ collectFavorites 复用注入的 FAV_META：module 文案不回归
const V24 = vm.runInContext(`(()=>{
  const p={id:'p1',mood:[{id:'m1',fav:true,content:'逆光小巷'}],shots:[{id:'s1',fav:true,name:'巷口回眸'}],schedule:[],scenes:[],items:[],budget:[],notes:[],todos:[]};
  return collectFavorites([p]);
})()`, ctx);
check('v10.2 ㉔ 收藏汇总文案取自统一 FAV_META',
  V24.length === 2 && V24[0].module === '情绪板' && V24[1].module === '分镜'
  && V24[0].summary === '逆光小巷' && V24[1].summary === '巷口回眸', JSON.stringify(V24));

/* ===== v10.3 城市选择 ===== */

// ㉕ cityMatch：±0.15° 容差匹配城市；无匹配 → null（自定义地点）；空/非法 → null
vm.runInContext(fn('cityMatch'), ctx);
const V25 = vm.runInContext(`(()=>{
  const list=[['南京',32.06,118.78],['三亚',18.25,109.51]];
  return {
    hit:cityMatch({lat:'32.06',lng:'118.78'},list),
    nearHit:cityMatch({lat:32.1,lng:118.9},list),      // 手输小偏差仍在容差内
    miss:cityMatch({lat:'31.90',lng:'117.00'},list),   // 超容差 → null
    empty:cityMatch({lat:'',lng:''},list),
    bad:cityMatch({lat:'abc',lng:'xyz'},list)};
})()`, ctx);
check('v10.3 ㉕ cityMatch 容差匹配与自定义判定',
  V25.hit && V25.hit[0] === '南京' && V25.nearHit && V25.nearHit[0] === '南京'
  && V25.miss === null && V25.empty === null && V25.bad === null, JSON.stringify(V25 && {hit:V25.hit[0],nearHit:V25.nearHit[0],miss:V25.miss,empty:V25.empty,bad:V25.bad}));

// ㉖ 全量城市清单（CITY_GROUPS）无重名、覆盖省会与原有快捷 8 城
const V26 = (() => {
  const html = fs.readFileSync(target, 'utf8');
  const mBlock = html.match(/const CITY_GROUPS=\[([\s\S]*?)\n\];/);
  if (!mBlock) return { names: [], dupe: ['BLOCK_NOT_FOUND'] };
  const names = [...mBlock[1].matchAll(/\['([^']+)',(-?[\d.]+),(-?[\d.]+)\]/g)].map(x => x[1]);
  const dupe = names.filter((n, i) => names.indexOf(n) !== i);
  const missing = ['哈尔滨','长春','沈阳','石家庄','太原','呼和浩特','济南','郑州','武汉','长沙','合肥','南昌','福州','昆明','贵阳','南宁','海口','兰州','西宁','银川','乌鲁木齐','拉萨','天津','重庆','香港','澳门']
    .filter(c => !names.includes(c));
  return { names, dupe, missing };
})();
check('v10.3 ㉖ 城市清单完整且无重名',
  V26.names.length >= 50 && V26.dupe.length === 0 && V26.missing.length === 0
  && ['北京','上海','广州','深圳','南京','杭州','成都','西安'].every(c => V26.names.includes(c)),
  'total=' + V26.names.length + ' dupe=' + V26.dupe.join(',') + ' missing=' + V26.missing.join(','));

// ㉗ v10.4.1 老数据迁移：图片全进 refs；未收藏的移出情绪板，收藏的（精选）保留
const V27 = vm.runInContext(`(()=>{
  const p=migrate({name:'x',shots:[],budget:[],mood:[
    {id:'m1',type:'image',content:'k1',tag:'a',tags:['a']},
    {id:'m2',type:'image',content:'k1',tag:'a',tags:['a']},
    {id:'m3',type:'image',content:'k2',tag:'b',tags:['b'],fav:true},
    {id:'m4',type:'text',content:'hello'}]});
  return {keys:p.refs.map(r=>r.key).join(','),ids:p.refs.map(r=>r.id).join(','),
    mood:p.mood.map(m=>m.id||m.type).join(','),tags:p.refs[0].tags.join(','),
    kept:(p.mood.filter(m=>m.type==='image')[0]||{}).content||'',
    favOk:p.refs.every(r=>r.fav===false)};
})()`, ctx);
check('v10.4.1 ㉗ 未收藏图片移出情绪板、收藏图片保留、全部进 refs',
  V27.keys === 'k1,k2' && V27.ids === 'k1,k2' && V27.mood === 'm3,m4' &&
  V27.kept === 'k2' && V27.tags === 'a' && V27.favOk, JSON.stringify(V27));

// ㉘ v10.4 幂等：已有 refs 时重复 migrate 不再补条目
const V28 = vm.runInContext(`(()=>{
  const p=migrate({name:'y',shots:[],budget:[],mood:[{type:'image',content:'k2'}],
    refs:[{id:'r1',key:'k2',name:'',tags:[],createdAt:1,fav:false}]});
  const before=JSON.stringify(p.refs);
  migrate(p);
  return {n:p.refs.length,same:before===JSON.stringify(p.refs)};
})()`, ctx);
check('v10.4 ㉘ refs 迁移幂等（不重复补）', V28.n === 1 && V28.same, JSON.stringify(V28));

console.log('RESULT pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
