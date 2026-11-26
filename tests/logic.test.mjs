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
/* 排程纯函数需要与运行时代码相同的常量。 */
vm.runInContext('const DAY_BASE="10:00",COLLECT_START="09:30",COLLECT_MIN=30,WRAP_MIN=15,SHOT_DEFAULT_MIN=10;', ctx);
/* sanitizeProject 依赖 STATUSES 白名单与 uid（默认 id 生成器）；测试用自增桩保证 id 可断言 */
vm.runInContext("globalThis.STATUSES=['灵感期','策划中','待拍摄','后期中','已交付','已归档'];"
  + "globalThis.__uidSeq=0;globalThis.uid=()=>'id'+(++globalThis.__uidSeq);", ctx);
for (const n of ['addMin', 'toMin', 'fmtMin', 'dayItems', 'tagKey', 'dedupeTags', 'parseTagsInput', 'mergeVocab', 'migrateTags', 'tagsForDisplay', 'matchByTags', 'renameTag', 'removeTag', 'shiseiItemKey', 'shiseiEntrySame', 'parseCatalog', 'diffCatalog', 'nextPendingBatch', 'mergeShiseiMeta', 'migrate']) vm.runInContext(fn(n), ctx);
for (const n of ['workspaceModules', 'freshView', 'clearInlineEditState', 'migrateFav', 'isFav', 'favSummary', 'summary40', 'collectFavorites', 'backupItemCount', 'matchBoardScope', 'isActiveStatus', 'parseMultiImage', 'slugPreview', 'cloneDemo', 'demoSpecs', 'buildDemoProject']) vm.runInContext(fn(n), ctx);
/* v10.8.0：复制/引用共用的时间平移 + 页签→收藏类型映射 */
vm.runInContext('const COPY_SHIFT_MIN=10;const TIME_FIELDS=["slot","start","end"];'
  + "const FAV_TYPES_BY_TAB={mood:['mood'],shots:['shots'],schedule:['schedule'],stuff:['scenes','items'],budget:['budget'],notes:['notes','todos']};", ctx);
for (const n of ['shiftTimeFields', 'favTypesForTab']) vm.runInContext(fn(n), ctx);
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
check('迁移补 duration=10', migrated.shots[0].duration === 10);

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
globalThis.idb = { ready: ()=>true, open: async()=>{}, getProjects: async()=>undefined, putProjects: async a => { globalThis.CAPTURE = a; } };
globalThis.LS_PROJ = 'wb_sf_projects';
globalThis.persistExpected=null; globalThis.persistConflict=false;
globalThis.LEGACY = ${JSON.stringify(legacy)};`, ctx);
await vm.runInContext('__initData()', ctx);
captured = vm.runInContext('CAPTURE', ctx);
check('initData 迁移旧数据', Array.isArray(captured) && captured.length === 1, JSON.stringify(captured));
check('initData 转换 refId', captured?.[0]?.shots?.[0]?.refIds?.[0] === 'img1');
check('initData 清理旧 localStorage key', vm.runInContext('REMOVED', ctx) === 'wb_sf_projects');

// v9：fav / demo / 示例 / 收藏 / 筛选纯函数
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
check('isFav 对混合数组与空值安全', vm.runInContext(`(() => {
  const list=[{fav:true},{fav:false},{fav:'true'},{},null];
  return isFav(list[0])===true&&isFav(list[2])===false&&isFav(null)===false;
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
// 排程常量已前置注入（见文件顶部）；ctx 白名单无 parseInt/isNaN/Boolean，故纯函数内统一用 +x / Math.round
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

// ⑩ 老数据迁移：position/light 补空串、duration 兜底 10（v10.8.1 统一）；rescheduleDay 后 slot 为 10:00
const mig10 = vm.runInContext(`(()=>{
  const p=migrate({name:'x',shots:[{id:'s',refId:'img1',date:'${D10}'}],budget:[]});
  const f={pos:p.shots[0].position,light:p.shots[0].light,dur:p.shots[0].duration,dayInit:Array.isArray(p.dayInit)};
  rescheduleDay(p,'${D10}');
  f.slot=p.shots[0].slot;
  return f;
})()`, ctx);
check('v10 ⑩ 迁移补 position/light 且不破 duration=10', mig10.pos === '' && mig10.light === '' && mig10.dur === 10 && mig10.dayInit && mig10.slot === '10:00', JSON.stringify(mig10));

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

/* ===== P2 安全加固：颜色值白名单校验（safeColor 纯函数） ===== */
vm.runInContext(fn('safeColor'), ctx);
check('P2 safeColor 合法 hex（3/6 位）原样保留', vm.runInContext('safeColor("#fff")+"|"+safeColor("#c8a97e")', ctx) === '#fff|#c8a97e');
check('P2 safeColor 合法 rgb/rgba/hsl 原样保留', vm.runInContext('safeColor("rgb(12, 34, 56)")+"|"+safeColor("rgba(12,34,56,0.5)")+"|"+safeColor("hsl(120, 50%, 40%)")', ctx) === 'rgb(12, 34, 56)|rgba(12,34,56,0.5)|hsl(120, 50%, 40%)');
vm.runInContext('globalThis.__inj=["red;position:fixed","url(javascript:alert(1))","#123\\" onload=\\"x","red} body{display:none"]', ctx);
check('P2 safeColor CSS 注入被回退为默认色', vm.runInContext('__inj.map(safeColor).join("|")', ctx) === '#c8a97e|#c8a97e|#c8a97e|#c8a97e');
check('P2 safeColor 空值/数字/超范围 rgb 回退', vm.runInContext('safeColor(null)+"|"+safeColor("")+"|"+safeColor(123)+"|"+safeColor("rgb(999,0,0)")+"|"+safeColor("hsl(400,50%,40%)")', ctx) === '#c8a97e|#c8a97e|#c8a97e|#c8a97e|#c8a97e');
check('P2 safeColor 边界值 255/360/100 保留', vm.runInContext('safeColor("rgb(255,0,255)")+"|"+safeColor("hsl(360,100%,100%)")', ctx) === 'rgb(255,0,255)|hsl(360,100%,100%)');

/* ===== P0 持久化加固：串行写入 / 退避重试 / 隐藏冲刷（saveP 改造） ===== */
for (const n of ['projectDataEqual', 'mergeProjectChanges', 'persistErrorCode', 'persistRetryDelay', 'writeProjects', 'flushPersist', 'saveP', 'bindPersistFlush']) vm.runInContext(fn(n), ctx);
// 公共 mock：可控成功/失败的 idb、收集提示的 toast、Promise
vm.runInContext(`
  globalThis.Promise=Promise;
  globalThis.PERSIST_MAX_RETRY=5;
  globalThis.persistChain=Promise.resolve(); globalThis.persistTimer=null;
  globalThis.pendingPersist=false; globalThis.persistFailed=false; globalThis.projectsCache=null;
  globalThis.persistExpected=null; globalThis.persistConflict=false; globalThis.persistGeneration=0; globalThis.persistClearing=false;
  globalThis.markPersistConflict=()=>{persistConflict=true;persistFailed=true;pendingPersist=true;};
  globalThis.notifyProjectChange=()=>{};globalThis.persistChannel=null;globalThis.persistLastError='';
  globalThis.showPersistFailure=()=>{};globalThis.clearPersistFailure=()=>{persistLastError='';};
  globalThis.storageDegraded=false;
  globalThis.__toasts=[]; globalThis.toast=m=>{ globalThis.__toasts.push(String(m)); };
  globalThis.__putCalls=[]; globalThis.__putFail=0;
  globalThis.idb={ ready: ()=>true, mergeProjects: async snap => {
    globalThis.__putCalls.push(snap);
    if(globalThis.__putFail>0){ globalThis.__putFail--; throw new Error('IDB_FAIL'); }
    return snap;
  }};
`, ctx);
check('P0 退避延迟 200/400/800/3200/封顶10000',
  vm.runInContext('[0,1,2,4,20].map(persistRetryDelay).join(",")', ctx) === '200,400,800,3200,10000');

// 组A：记录型 setTimeout —— 验证防抖合并 + flush 立即落盘
vm.runInContext(`globalThis.__timers=[]; globalThis.__timerId=0;
  globalThis.setTimeout=(fn2,ms)=>{ const id=++__timerId; __timers.push({id,fn:fn2,ms}); return id; };
  globalThis.clearTimeout=(id)=>{ __timers=__timers.filter(t=>t.id!==id); };`, ctx);
const VA = vm.runInContext(`(()=>{
  persistChain=Promise.resolve(); persistTimer=null; pendingPersist=false; persistFailed=false; projectsCache=null;
  __putCalls.length=0; __putFail=0; __timers=[];
  saveP([{id:'a'}]); const t1=persistTimer;
  saveP([{id:'b'}]); const t2=persistTimer;
  return {timerCount:__timers.length, t1cleared:!__timers.some(t=>t.id===t1), t2active:__timers.some(t=>t.id===t2), cache:projectsCache[0].id};
})()`, ctx);
check('P0 saveP 防抖合并：仅保留最后一个定时器且缓存为最新', VA.timerCount===1 && VA.t1cleared && VA.t2active && VA.cache==='b', JSON.stringify(VA));
const VB = await vm.runInContext(`(async()=>{
  flushPersist(); await persistChain;
  return {calls:__putCalls.length, last:__putCalls[__putCalls.length-1][0].id, pending:pendingPersist, timers:__timers.length};
})()`, ctx);
check('P0 flushPersist 立即落盘最新数据并清空定时器', VB.calls===1 && VB.last==='b' && VB.pending===false && VB.timers===0, JSON.stringify(VB));

// 组B：立即执行型 setTimeout —— 验证退避重试成功与耗尽降级
vm.runInContext(`globalThis.setTimeout=(fn2,ms)=>{ if(typeof fn2==='function') fn2(); return 0; }; globalThis.clearTimeout=()=>{};`, ctx);
const VC = await vm.runInContext(`(async()=>{
  persistChain=Promise.resolve(); pendingPersist=false; persistFailed=false; __putCalls.length=0; __toasts.length=0; __putFail=2;
  projectsCache=[{id:'retry'}];const ok=await writeProjects(JSON.parse(JSON.stringify(projectsCache)),0);
  return {ok, calls:__putCalls.length, pending:pendingPersist, failed:persistFailed, toasts:__toasts.slice()};
})()`, ctx);
check('P0 落盘失败退避重试后成功并清除失败标记', VC.ok===true && VC.calls===3 && VC.pending===false && VC.failed===false && VC.toasts.some(t=>t.indexOf('重试')>=0) && VC.toasts.some(t=>t.indexOf('已保存成功')>=0), JSON.stringify(VC));
const VD = await vm.runInContext(`(async()=>{
  persistChain=Promise.resolve(); pendingPersist=false; persistFailed=false; __putCalls.length=0; __toasts.length=0; __putFail=999;
  projectsCache=[{id:'dead'}];const ok=await writeProjects(JSON.parse(JSON.stringify(projectsCache)),0);
  return {ok, calls:__putCalls.length, pending:pendingPersist, failed:persistFailed, toasts:__toasts.slice()};
})()`, ctx);
check('P0 重试耗尽后降级提示且保留待落盘标记', VD.ok===false && VD.calls===6 && VD.pending===true && VD.failed===true && VD.toasts.some(t=>t.indexOf('导出备份')>=0), JSON.stringify(VD));

// 页面隐藏/关闭绑定验证
vm.runInContext(`globalThis.__evts=[]; globalThis.document={addEventListener:(n2,f2)=>__evts.push(n2)}; globalThis.window={addEventListener:(n2,f2)=>__evts.push(n2)};`, ctx);
vm.runInContext('bindPersistFlush()', ctx);
check('P0 页面隐藏与关闭均绑定 flush', vm.runInContext('__evts.join(",")', ctx)==='visibilitychange,pagehide');

/* ================= v10.6.0 设置页：反馈通道纯函数（追加块：上方 615 行零改动） ================= */
// 注入 01-data.js 常量（vm 上下文按需同步），再抽取设置页纯函数
vm.runInContext("globalThis.APP_VERSION='10.7.1';"
  + "globalThis.MODULE_VERSIONS={swCache:'shotflow-v10-11',dbSchema:3};", ctx);
/* FB_KEY_* 混淆常量直接从 src 抽取（测试文件零明文 access key） */
for (const c of ['FB_KEY_A', 'FB_KEY_B']) {
  const m = src.match(new RegExp('const ' + c + '\\s*=\\s*\'[^\']*\';'));
  if (!m) throw new Error('missing const ' + c);
  vm.runInContext(m[0], ctx);
}
for (const n of ['feedbackTypeLabel', 'buildFeedbackEnv', 'buildFeedbackPayload', 'fbDecodeKey']) vm.runInContext(fn(n), ctx);

// ① feedbackTypeLabel：三类型映射 + 未知值回退「其他」
check('v10.6.0 ① feedbackTypeLabel 三类型映射与回退',
  vm.runInContext("feedbackTypeLabel('bug')+'|'+feedbackTypeLabel('idea')+'|'+feedbackTypeLabel('other')+'|'+feedbackTypeLabel('x')+'|'+feedbackTypeLabel(null)", ctx)
    === 'Bug|建议|其他|其他|其他');

// ② fbDecodeKey：确定性还原，长度 36、UUID 形态、两次调用一致（零明文断言）
const VDK = vm.runInContext(`(()=>{
  const a=fbDecodeKey(), b=fbDecodeKey();
  return {len:a.length, uuid:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a), det:a===b};
})()`, ctx);
check('v10.6.0 ② fbDecodeKey 确定性还原（长度 36 / UUID 形态 / 零明文比对）',
  VDK.len === 36 && VDK.uuid && VDK.det, JSON.stringify({ len: VDK.len, uuid: VDK.uuid }));

// ③ buildFeedbackPayload：access_key / subject 前缀 / message 拼接 / from_name
const VFP = vm.runInContext(`(()=>{
  const p=buildFeedbackPayload('bug','页面崩溃','打开看板白屏','版本：v10.7.0');
  return {keyLen:p.access_key.length,
    keyUuid:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.access_key),
    subject:p.subject, from:p.from_name, msg:p.message};
})()`, ctx);
check('v10.6.0 ③ buildFeedbackPayload 字段与内容拼接',
  VFP.keyLen === 36 && VFP.keyUuid && VFP.subject === '[Bug] 页面崩溃' && VFP.from === '瞬刻摄影工作台'
  && VFP.msg.includes('打开看板白屏') && VFP.msg.includes('---') && VFP.msg.includes('版本：v10.7.0'),
  JSON.stringify({ subject: VFP.subject, from: VFP.from }));

// ④ buildFeedbackPayload：message 超过 20000 字符时截断并追加提示
const VFPlong = vm.runInContext(`(()=>{
  const p=buildFeedbackPayload('idea','超长反馈','${'长'.repeat(21000)}','env');
  return {len:p.message.length, tail:p.message.slice(-40)};
})()`, ctx);
check('v10.6.0 ④ buildFeedbackPayload 超长 message 截断',
  VFPlong.len <= 20040 && VFPlong.tail.indexOf('描述过长已截断') >= 0, 'len=' + VFPlong.len);

// ⑤ buildFeedbackEnv：五段字段齐全（版本/环境/平台/状态/项目数）
const VENV = vm.runInContext(
  `buildFeedbackEnv({version:'10.7.0',swCache:'shotflow-v10-11',dbVersion:3,userAgent:'UA/1',platform:'Win32',language:'zh-CN',screenW:2560,screenH:1440,dpr:1,clipboardOk:true,online:false,projectCount:12})`,
  ctx
);
check('v10.6.0 ⑤ buildFeedbackEnv 五段字段齐全',
  VENV.includes('版本：v10.7.0（SW 缓存 shotflow-v10-11 / 数据结构 3）')
  && VENV.includes('环境：UA/1')
  && VENV.includes('平台：Win32 · 语言 zh-CN · 屏幕 2560×1440（devicePixelRatio 1）')
  && VENV.includes('IndexedDB 可用 / 剪贴板 API 可用 / 离线')
  && VENV.includes('项目数：12'), JSON.stringify(VENV));

// ⑥ buildFeedbackEnv：空参数回退 APP_VERSION / MODULE_VERSIONS 常量与安全默认值
const VENVd = vm.runInContext('buildFeedbackEnv()', ctx);
check('v10.6.0 ⑥ buildFeedbackEnv 缺省回退常量与默认值',
  VENVd.includes('版本：v10.7.1') && VENVd.includes('SW 缓存 shotflow-v10-11')
  && VENVd.includes('数据结构 3') && VENVd.includes('在线') && VENVd.includes('项目数：0'), JSON.stringify(VENVd));

/* ================= v10.7.1 导入净化 + 一致性修复（追加块） ================= */
for (const n of ['sanitizeProject', 'safeFilename']) vm.runInContext(fn(n), ctx);

// ① sanitizeProject：恶意 id 全部重写，不留下引号/尖括号等可拼进内联 handler 的字符
const EVIL = {
  id: "x');window.__pwned=1;//", name: '恶意项目', client: '', studio: '',
  status: '策划中</span><img src=x onerror=1>', shootDate: '2026-13-99', location: '', lat: '', lng: '',
  createdAt: 'bad', updatedAt: 0,
  concept: { theme: 123, note: null },
  mood: [{ id: "m');alert(1);//", type: 'image', content: 'imgkey1', tag: '', tags: ['a'], fav: true }, null, 'junk'],
  refs: [{ id: "r');alert(1);//", key: 'imgkey1', name: '', tags: [], createdAt: 0, fav: false }],
  scenes: [{ id: "s');alert(1);//", name: '场景', note: '', done: false }],
  shots: [{ id: "sh');alert(1);//", name: '分镜', date: '', duration: 'abc', sceneId: "s');alert(1);//",
    refIds: ['imgkey1', 42], position: '', light: '', note: '', done: false, ord: 0 }],
  schedule: [{ id: "n');alert(1);//", type: '集合', title: '集合', start: '9x:99', end: '10:00', note: '', date: '2026-11-16', done: false, auto: 'call' }],
  items: [], budget: [{ id: "b',x=1,//", item: '场地', cat: '场地', amount: 'Infinity', paid: false }],
  notes: [{ id: 'nt1', kind: '电话', content: 'hi', ts: 'x', fav: false }],
  todos: [{ id: 'td1', title: '待办', owner: '', due: '2026/11/16', done: false }],
  tagVocab: ['t1', 5, null], shootDates: ['2026-11-16', 'bad'], dayInit: ['2026-11-16']
};
vm.runInContext('globalThis.EVIL=' + JSON.stringify(EVIL), ctx);
const CLEAN = vm.runInContext('sanitizeProject(EVIL)', ctx);
const allIds = [CLEAN.id, CLEAN.mood[0].id, CLEAN.refs[0].id, CLEAN.scenes[0].id, CLEAN.shots[0].id,
  CLEAN.schedule[0].id, CLEAN.budget[0].id, CLEAN.notes[0].id, CLEAN.todos[0].id, CLEAN.shots[0].sceneId];
check('v10.7.1 ① sanitizeProject 实体 id 全部重写且无注入字符',
  allIds.every(x => /^id\d+$/.test(x)) && CLEAN.shots[0].sceneId === CLEAN.scenes[0].id, allIds.join(','));
check('v10.7.1 ② sanitizeProject status 白名单回退', CLEAN.status === '灵感期', CLEAN.status);
check('v10.7.1 ③ sanitizeProject 数组过滤垃圾成员', CLEAN.mood.length === 1 && CLEAN.mood[0].content === 'imgkey1');
check('v10.7.1 ④ sanitizeProject 类型收敛（时长/时间/日期/金额/标签）',
  CLEAN.shots[0].duration === null && CLEAN.schedule[0].start === '' && CLEAN.shootDate === ''
  && CLEAN.budget[0].amount === 999999999 && CLEAN.todos[0].due === ''
  && CLEAN.tagVocab[0] === 't1' && CLEAN.shootDates.join(',') === '2026-11-16', JSON.stringify({ d: CLEAN.shots[0].duration, s: CLEAN.schedule[0].start, a: CLEAN.budget[0].amount }));
check('v10.7.1 ⑤ sanitizeProject 拒绝非对象输入',
  vm.runInContext('sanitizeProject(null) === null && sanitizeProject("x") === null && sanitizeProject([]) === null', ctx));
check('v10.7.1 ⑥ sanitizeProject refIds 收敛为字符串且不超 3 张',
  CLEAN.shots[0].refIds.join(',') === 'imgkey1,42' && CLEAN.shots[0].refIds.length <= 3);
check('v10.7.1 ⑦ 净化后迁移仍可走通（duration 兑底 10 / 字段齐全）', (() => {
  const p = vm.runInContext('sanitizeProject(EVIL)', ctx);
  vm.runInContext('globalThis.__mig=' + JSON.stringify(p), ctx);
  const m = vm.runInContext('migrate(__mig)', ctx);
  return m.shots[0].duration === 10 && Array.isArray(m.refs) && Array.isArray(m.tagVocab);
})());

// ⑧ safeFilename：只剥非法字符，不套 esc（& 不再变 &amp;）；空名回退
check('v10.7.1 ⑧ safeFilename 非法字符清洗且保留 &',
  vm.runInContext("safeFilename('提案/终稿:v2?')", ctx) === '提案终稿v2'
  && vm.runInContext("safeFilename('A&B')", ctx) === 'A&B'
  && vm.runInContext("safeFilename('  ')", ctx) === '未命名');

// ⑨ dayItems 时长兑底与 planDay 同源（缺 duration → 10 分钟，不再是 20）
const FALLBACK = vm.runInContext(`dayItems({shots:[{id:'x',date:'2026-11-16',slot:'10:00'}],schedule:[]},'2026-11-16')`, ctx);
check('v10.7.1 ⑨ dayItems 时长兑底=SHOT_DEFAULT_MIN(10)',
  FALLBACK[0]._end - FALLBACK[0]._start === 10, String(FALLBACK[0]._end - FALLBACK[0]._start));

// ⑩ 缺 id 的成员各自独立：空键若被所有成员共享，删除/勾选按 id 命中就会一次命中多条
check('v10.7.1 ⑩ sanitizeProject 缺 id 成员各自生成独立 id', (() => {
  const p = vm.runInContext(`sanitizeProject({name:'x',mood:[{type:'text',content:'a'},{type:'text',content:'b'}],shots:[{name:'s1'},{name:'s2'}]})`, ctx);
  const ids = p.mood.map(x => x.id).concat(p.shots.map(x => x.id));
  return ids.every(x => /^id\d+$/.test(x)) && new Set(ids).size === ids.length;
})());

// ⑪ slot 是持久化的排程结果（导出文件带它），净化不能丢——否则导入后时间轴/通告单时间全空
check('v10.7.1 ⑪ sanitizeProject 保留合法 slot、非法 slot 置空', (() => {
  const p = vm.runInContext(`sanitizeProject({name:'x',shots:[{id:'a',slot:'10:00'},{id:'b',slot:'9x:99'}]})`, ctx);
  return p.shots[0].slot === '10:00' && p.shots[1].slot === '';
})());

// v10.8.0 ① 时间平移：时分字段 +10（默认 COPY_SHIFT_MIN）、跨小时进位、日期字段不动、原对象不变
check('v10.8.0 ① 混合时分字段跨不同日期时保持原值，不改原对象', (() => {
  const src={slot:'10:25',start:'23:58',end:'09:07',date:'2026-11-24',due:'2026-11-25',name:'x'};
  vm.runInContext('globalThis.__t8src='+JSON.stringify(src), ctx);
  const out=vm.runInContext('shiftTimeFields(__t8src)', ctx);
  const after=vm.runInContext('__t8src', ctx);
  return out.slot==='10:25'&&out.start==='23:58'&&out.end==='09:07'
    &&out.date==='2026-11-24'&&out.due==='2026-11-25'&&out.name==='x'
    &&after.slot==='10:25';
})());
// v10.8.0 ② 无时间字段 / 空字段的条目平移后结构不变（ moods / budget 等非时分条目 ）
check('v10.8.0 ② shiftTimeFields 无时分字段条目原样返回', (() => {
  const out=vm.runInContext("shiftTimeFields({id:'m',content:'灵感',slot:''})", ctx);
  return out.id==='m'&&out.content==='灵感'&&out.slot===''&&Object.keys(out).length===3;
})());
// v10.8.0 ③ custom minutes 参数（引用可传不同顺延量）
check('v10.8.0 ③ shiftTimeFields 自定义分钟数', (() => {
  const out=vm.runInContext("shiftTimeFields({start:'08:00'},15)", ctx);
  return out.start==='08:15';
})());
// v10.8.0 ④ 页签→收藏类型映射：stuff/notes 覆盖两类，concept 与未知页为空
check('v10.8.0 ④ favTypesForTab 映射正确', (() => {
  const g=t=>vm.runInContext('favTypesForTab('+JSON.stringify(t)+')', ctx);
  return JSON.stringify(g('stuff'))==='["scenes","items"]'
    && JSON.stringify(g('notes'))==='["notes","todos"]'
    && JSON.stringify(g('shots'))==='["shots"]'
    && g('concept').length===0&&g('unknown').length===0;
})());

/* P0：快照独立于可变 UI 数据；遇到跨页冲突停止写入，不盲目重试。 */
vm.runInContext(`
  globalThis.persistConflict=false; globalThis.persistClearing=false; globalThis.persistGeneration=0;
  globalThis.pendingPersist=false; globalThis.persistFailed=false; globalThis.persistTimer=null;
  globalThis.persistChain=Promise.resolve(); globalThis.persistExpected="null";
  globalThis.setTimeout=()=>1; globalThis.clearTimeout=()=>{};
  globalThis.__putCalls=[];globalThis.idb={ready:()=>true,mergeProjects:async(s,e)=>{__putCalls.push({s,e});return s;}};
`,ctx);
const snapshotCheck=await vm.runInContext(`(async()=>{
  saveP([{id:'x',name:'first'}]); flushPersist();
  await Promise.resolve(); // 写链进入队首并固定快照后，再模拟用户编辑
  projectsCache[0].name='second'; saveP(projectsCache);
  await persistChain;
  const first=__putCalls[0].s[0].name, dirty=pendingPersist;
  await flushPersist();
  return first==='first'&&dirty&&__putCalls[1].s[0].name==='second'&&!pendingPersist
    &&__putCalls[1].e===JSON.stringify(__putCalls[0].s);
})()`,ctx);
check('P0 写入快照隔离后续编辑且更新比较基线',snapshotCheck);
const conflictCheck=await vm.runInContext(`(async()=>{
  let calls=0; idb.mergeProjects=async()=>{calls++;return null;};
  saveP([{id:'draft'}]); const ok=await flushPersist(); await flushPersist();
  return ok===false&&calls===1&&persistConflict&&pendingPersist&&projectsCache[0].id==='draft';
})()`,ctx);
check('P0 冲突停止写入、保留内存草稿',conflictCheck);

// P0 备份图片依赖：新键、共享引用、拒绝外部 URL/任意 SVG/缺失图。
for(const n of ['collectImages','validBackupImage','remapBackupImages']) vm.runInContext(fn(n),ctx);
check('P0 备份依赖重映射并拒绝缺失图片',vm.runInContext(`(()=>{
  const image='data:image/png;base64,AAAA';
  const p={mood:[{type:'image',content:'old'}],refs:[{key:'old'}],shots:[{refIds:['old','shisei:pose']}]};
  const mapped=remapBackupImages([p],{old:image},()=>'new');
  let rejected=false;try{remapBackupImages([{refs:[{key:'missing'}]}],{},()=>'x');}catch(e){rejected=true;}
  return mapped.new===image&&p.mood[0].content==='new'&&p.refs[0].key==='new'&&p.shots[0].refIds.join(',')==='new,shisei:pose'
    &&rejected&&!validBackupImage('https://example.com/a.jpg')&&!validBackupImage('data:image/svg+xml,<svg/>')
    &&validBackupImage(slugPreview('样片',['#9a6a33','#f3e9da']));
})()`,ctx));
// P0 只在显式确认后跨日；锁定节点保留时间。
check('P0 自动日内排程不改日期，溢出分镜待安排',vm.runInContext(`(()=>{
  const d='2026-11-24',p={shots:[{id:'a',date:d,duration:600,ord:0},{id:'b',date:d,duration:400,ord:1}],schedule:[],dayInit:[d],shootDates:[d]};
  const r=applyDay(p,d,null);return r.overflow&&p.shots[1].date===d&&p.shots[1].slot===''&&p.shootDates.length===1;
})()`,ctx));
check('P0 锁定节点不参与级联顺延',vm.runInContext(`(()=>{
  const d='2026-11-24',p={shots:[],schedule:[{id:'a',date:d,start:'10:00',end:'12:00'},{id:'b',date:d,start:'11:00',end:'11:30',timeLocked:true}]};
  const r=planDay(p,d,'a');return r.nodes.find(n=>n.id==='b').start===660&&!r.nodeShifts.some(n=>n.id==='b');
})()`,ctx));
check('P1 复制分镜跨年午夜正确迁移日期',vm.runInContext("JSON.stringify(shiftTimeFields({slot:'23:55',date:'2026-12-31'},10))",ctx)==='{"slot":"00:05","date":"2027-01-01"}');
check('P1 跨午夜区间保持原时间等待拆分',vm.runInContext("shiftTimeFields({start:'23:40',end:'23:55',date:'2026-12-31'},10).end",ctx)==='23:55');
vm.runInContext(fn('sunTimes'),ctx);
check('P1 日照计算指定时区且时分有效',vm.runInContext(`(()=>{
  const a=sunTimes('2026-06-21',35.68,139.69,'Asia/Tokyo'),b=sunTimes('2026-06-21',35.68,139.69,'UTC');
  const min=x=>+x.slice(0,2)*60+ +x.slice(3);
  return a&&b&&((min(a.sunrise)-min(b.sunrise)+1440)%1440)===540&&a.sunrise.slice(3)<='59'
    &&sunTimes('2026-06-21',91,0,'UTC')===null&&sunTimes('2026-02-30',30,0,'UTC')===null;
})()`,ctx));
check('策划预设只筛选显示字段，自定义始终保留分镜',vm.runInContext("workspaceModules('casual').includes('shots')&&!workspaceModules('casual').includes('budget')&&workspaceModules('professional').includes('budget')&&workspaceModules('custom',['notes','unknown']).join(',')==='shots,notes'",ctx));
vm.runInContext(fn('buildAssetProjects')+'\n'+fn('copyAssetDependencies'),ctx);
check('素材包仅选中收藏并包含直接依赖、排除客户信息',vm.runInContext(`(()=>{
  const p={id:'p',name:'A',client:'private',shots:[{id:'s',fav:true,sceneId:'c',refIds:['img']}],scenes:[{id:'c',name:'场景'},{id:'other'}],refs:[{key:'img'},{key:'unused'}]};
  const a=buildAssetProjects([p],[{pid:'p',type:'shots',id:'s'}])[0];
  return a.assetPack&&!a.client&&a.shots.length===1&&a.scenes.length===1&&a.refs.length===1&&a.refs[0].key==='img';
})()`,ctx));
check('跨项目引用素材补全场景与参考图、清理完成态',vm.runInContext(`(()=>{
  const p={id:'b',scenes:[],refs:[]},s={id:'a',scenes:[{id:'c',name:'场景'}],refs:[{key:'img'}]},c={sceneId:'c',refIds:['img'],deferred:true,skipped:true};
  let i=0;copyAssetDependencies(p,s,'shots',c,()=>String(++i));
  return c.sceneId===p.scenes[0].id&&p.refs[0].key==='img'&&!c.deferred&&!c.skipped;
})()`,ctx));
for(const n of ['aiTaskRegistry','aiTask','aiValidate','aiContext','aiValidateReferences','aiProjectToken','aiCandidateIsCurrent','createAiService'])vm.runInContext(fn(n),ctx);
check('AI 十项任务注册、上下文白名单不包含客户和密钥',vm.runInContext(`(()=>{
  const r=aiContext('generateShots',{project:{client:'secret',apiKey:'key',concept:{theme:'t',note:'private'},scenes:[{id:'s',name:'scene',client:'hidden'}]}});
  return Object.keys(aiTaskRegistry()).length===10&&!JSON.stringify(r).includes('secret')&&!JSON.stringify(r).includes('private')&&!JSON.stringify(r).includes('hidden');
})()`,ctx));
check('AI 禁用零调用、无授权拒绝、能力检查、结构校验与过期候选拒绝',await vm.runInContext(`(async()=>{
  let calls=0;const provider={id:'mock',capabilities:{text:true},generate:async()=>{calls++;return {data:{tags:['人像']}};}};
  const off=createAiService({enabled:false});off.register(provider);
  const reject=async(p,code)=>{try{await p;return false;}catch(e){return e.message===code;}};
  if(!await reject(off.run('suggestTags',{},{}),'AI_DISABLED')||calls!==0)return false;
  const on=createAiService({enabled:true});on.register(provider);
  if(!await reject(on.run('suggestTags',{},{provider:'mock'}),'AI_UPLOAD_NOT_CONFIRMED'))return false;
  const p={id:'p',name:'旧名'},opts={provider:'mock',confirmUpload:true};
  const c=await on.run('suggestTags',{project:p,text:'人像'},opts);
  if(calls!==1||c.data.tags[0]!=='人像'||!aiCandidateIsCurrent(c,p))return false;
  p.name='新名';if(aiCandidateIsCurrent(c,p))return false;
  on.register({id:'bad',capabilities:{text:true},generate:async()=>({data:{tags:['x'],extra:'bad'}})});
  return await reject(on.run('suggestTags',{},{provider:'bad',confirmUpload:true}),'AI_SCHEMA_INVALID');
})()`,ctx));
check('AI 禁止虚构场景引用和非图片 URL',vm.runInContext(`(()=>{
  try{aiValidateReferences('generateShots',{shots:[{sceneId:'fake'}]},{scenes:[]});return false;}catch(e){if(e.message!=='AI_REFERENCE_INVALID')return false;}
  try{aiContext('analyzeReference',{images:['https://example.com/a.png']});return false;}catch(e){return e.message==='AI_IMAGE_INVALID';}
})()`,ctx));
vm.runInContext(fn('mergeProjectChanges'),ctx);
check('并发不同项目合并，同项目和删除编辑冲突拒绝',vm.runInContext(`(()=>{
  const b=[{id:'a',name:'A'},{id:'b',name:'B'}],l=[{id:'a',name:'A2'},b[1]],r=[b[0],{id:'b',name:'B2'}];
  const m=mergeProjectChanges(b,l,r);
  return m.map(x=>x.name).join(',')==='A2,B2'&&mergeProjectChanges(b,l,[{id:'a',name:'A3'},b[1]])===null
    &&mergeProjectChanges(b,l,[b[1]])===null&&mergeProjectChanges(b,l.concat({id:'c'}),r).length===3;
})()`,ctx));
check('存储比较忽略对象键顺序，保留数组顺序和真实冲突',vm.runInContext(`(()=>{
  const b=[{id:'p',name:'旧',shots:[{id:'s',name:'旧'}]}],r=[{shots:[{name:'旧',id:'s'}],name:'旧',id:'p'}],l=[{...b[0],name:'新'}];
  return mergeProjectChanges(b,l,r)[0].name==='新'&&!projectDataEqual([1,2],[2,1])
    &&mergeProjectChanges(b,l,[{...r[0],name:'远端'}])===null;
})()`,ctx));
for(const n of ['classifyTransferPackage','buildPortableProjects','buildPortableShots'])vm.runInContext(fn(n),ctx);
check('项目包 v5 明确追加、旧版备份仍可识别、未知/歧义类型拒绝',vm.runInContext(`(()=>{
  const p={name:'A'},reject=d=>{try{classifyTransferPackage(d);return false;}catch{return true;}};
  const pack={app:'stillmark',version:5,type:'project-pack',packVersion:1,entries:[p]};
  return classifyTransferPackage(pack).mode==='append'&&classifyTransferPackage({version:4,projects:[p]}).mode==='restore'
    &&classifyTransferPackage({version:4,type:'project',project:p}).mode==='single'
    &&reject({...pack,projects:[p]})&&reject({...pack,version:4})&&reject({...pack,type:'unknown'})
    &&reject({...pack,entries:[{demo:true}]})&&reject({version:4,type:'unknown',projects:[p]});
})()` ,ctx));
check('任意分镜选集保留执行状态和依赖，排除无关隐私且不修改来源',vm.runInContext(`(()=>{
  const p={id:'p',name:'A',client:'private',shots:[{id:'s',fav:false,done:true,sceneId:'c',date:'2026-11-26',refIds:['img']},{id:'x'}],
    scenes:[{id:'c',name:'场景'},{id:'other'}],refs:[{key:'img',tags:['参考']},{key:'unused'}],notes:[{content:'secret'}]};
  const a=buildPortableShots(p,['s']);
  return a.shots.length===1&&a.shots[0].done&&!a.shots[0].fav&&a.scenes.length===1&&a.refs.length===1
    &&a.shootDate==='2026-11-26'&&!a.client&&a.notes.length===0&&p.shots.length===2
    &&buildPortableProjects([p,{id:'demo',demo:true}],['p','demo']).length===1;
})()`,ctx));
for(const n of ['portablePackSchema','validatePortableShape','portableImageKeys','validatePortablePack','validBackupImage'])vm.runInContext(fn(n),ctx);
const schema=JSON.parse(fs.readFileSync(new URL('../schemas/project-pack-v1.schema.json',import.meta.url),'utf8'));
check('Agent schema 与生产定义逐字段一致',JSON.stringify(schema)===vm.runInContext('JSON.stringify(portablePackSchema())',ctx));
for(const [name,file] of [['agent-shot','legacy-agent-shot-v5.json'],['agent-project','legacy-agent-project-v5.json']]){
  const example=JSON.parse(fs.readFileSync(new URL('./fixtures/'+file,import.meta.url),'utf8'));
  ctx.__pack=example;
  check('Agent 示例通过生产结构与依赖校验 '+name,vm.runInContext('validatePortablePack(__pack).projects===1',ctx));
}
ctx.__pack=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-agent-shot-v5.json',import.meta.url),'utf8'));
check('项目包拒绝缺失图片、非法场景和未知字段',vm.runInContext(`(()=>{
  const reject=d=>{try{validatePortablePack(d);return false;}catch{return true;}};
  const clone=()=>JSON.parse(JSON.stringify(__pack));
  const a=clone(),b=clone(),c=clone();a.images={};b.entries[0].shots[0].sceneId='missing';c.entries[0].apiKey='secret';
  return reject(a)&&reject(b)&&reject(c);
})()`,ctx));
for(const n of ['assetArchiveManifestSchema','assetArchiveDataSchema','assetArchiveLimits','validateArchiveManifest','validateArchiveData'])vm.runInContext(fn(n),ctx);
for(const [file,fnName] of [['asset-archive-manifest-v1','assetArchiveManifestSchema'],['asset-archive-data-v1','assetArchiveDataSchema']]){
  const schema=JSON.parse(fs.readFileSync(new URL('../schemas/'+file+'.schema.json',import.meta.url),'utf8'));
  check('ZIP 候选 schema 与生产定义一致 '+file,JSON.stringify(schema)===vm.runInContext('JSON.stringify('+fnName+'())',ctx));
}
check('ZIP 清单同一摘要支持多个逻辑键且按唯一文件计数',vm.runInContext(`(()=>{
  const digest='a'.repeat(64),image={key:'first',path:'images/'+digest+'.png',bytes:100,sha256:digest,mime:'image/png'};
  const manifest={format:'stillmark.asset-pack',containerVersion:1,dataVersion:1,kind:'projects',exportedAt:'2026-11-26T00:00:00Z',
    data:{path:'data.json',bytes:1000,sha256:'b'.repeat(64)},images:[image,{...image,key:'second'}]};
  const data={dataVersion:1,kind:'projects',entries:[{name:'A',shots:[{name:'S',refIds:['first','second']}]}]};
  const v=validateArchiveData(data,manifest);
  return v.images===2&&v.uniqueFiles===3&&v.expandedBytes===1100;
})()`,ctx));
check('ZIP 清单拒绝非法路径、重复键、摘要冲突、类型错配和超限',vm.runInContext(`(()=>{
  const digest='a'.repeat(64),image={key:'first',path:'images/'+digest+'.png',bytes:100,sha256:digest,mime:'image/png'};
  const make=()=>({format:'stillmark.asset-pack',containerVersion:1,dataVersion:1,kind:'projects',exportedAt:'2026-11-26T00:00:00Z',
    data:{path:'data.json',bytes:1000,sha256:'b'.repeat(64)},images:[{...image}]});
  const bad=(mut,limits)=>{const m=make();mut(m);try{validateArchiveManifest(m,limits);return false;}catch{return true;}};
  const badData=(data,m=make())=>{try{validateArchiveData(data,m);return false;}catch{return true;}};
  return bad(m=>m.images[0].path='../a.png')&&bad(m=>m.images.push({...image}))&&bad(m=>m.images.push({...image,key:'second',bytes:101}))
    &&bad(m=>m.containerVersion=99)&&bad(()=>{}, {...assetArchiveLimits(),maxExpandedBytes:1050})
    &&badData({dataVersion:1,kind:'shots',entries:[{name:'A',shots:[{name:'S',refIds:['first']}]}]})
    &&badData({dataVersion:1,kind:'projects',entries:[{name:'A',shots:[{name:'S',refIds:['missing']}]}]});
})()`,ctx));
vm.runInContext(fn('adaptArchiveEntryV1ToProject'),ctx);
ctx.__archiveInput={name:'外部策划',client:'不应并入的客户信息',shots:[{id:'shot-1',name:'窗边肖像',sceneId:'scene-1',refIds:['image-1'],done:true}],
  scenes:[{id:'scene-1',name:'窗边'},{id:'unused-scene',name:'无关场景'}],refs:[{id:'ref-1',key:'image-1',name:'参考图'},{id:'unused-ref',key:'unused-image'}],notes:[{id:'private',content:'不应并入'}]};
ctx.__archiveMap=new Map([['image-1','archive-image-1']]);
check('ZIP v1 适配器将外部数据收敛到当前项目并过滤追加范围',vm.runInContext(`(()=>{
  const source=JSON.stringify(__archiveInput),target={id:'target'};
  const p=adaptArchiveEntryV1ToProject(__archiveInput,{target,needed:new Set(['image-1']),imageMap:__archiveMap,createId:(()=>{let i=0;return()=>\`new-\${++i}\`;})()});
  return JSON.stringify(__archiveInput)===source&&p.name==='外部策划（导入）'&&!p.client&&!p.notes.length&&p.demo===false&&p.assetPack===false
    &&p.shots.length===1&&p.shots[0].done&&p.shots[0].refIds[0]==='archive-image-1'
    &&p.scenes.length===1&&p.scenes[0].name==='窗边'&&p.refs.length===1&&p.refs[0].key==='archive-image-1';
})()`,ctx));
vm.runInContext(fn('appendArchiveShots'),ctx);
check('分镜追加保持目标资料、原顺序与状态，只引入显式依赖且不改源对象',vm.runInContext(`(()=>{
  const target={id:'target',name:'目标',status:'策划中',client:'客户',shootDates:['2026-11-26'],shootDate:'2026-11-26',shots:[{id:'old',ord:8,done:true}],scenes:[{id:'oldscene',name:'场景'}],refs:[],notes:[{id:'note',content:'保留'}],tagVocab:['旧标签']};
  const source={name:'忽略',client:'不覆盖',notes:[{id:'secret',content:'不要'}],shots:[{id:'newshot',sceneId:'newscene',refIds:['newkey'],date:'2026-12-01',ord:2,done:true}],scenes:[{id:'newscene',name:'场景'},{id:'extra',name:'无关'}],refs:[{id:'newref',key:'newkey',tags:['新标签']},{id:'extraref',key:'extra'}]};
  const before=JSON.stringify([target,source]),out=appendArchiveShots(target,source,123);
  let rejected=false;try{appendArchiveShots(target,{...source,shots:[{id:'old'}]});}catch{rejected=true;}
  return JSON.stringify([target,source])===before&&out.id==='target'&&out.name==='目标'&&out.client==='客户'&&out.notes.length===1&&out.shots.length===2&&out.shots[0].ord===8&&out.shots[1].ord===9&&out.shots[1].done&&out.scenes.length===2&&out.refs.length===1&&out.shootDates.length===2&&out.tagVocab.includes('新标签')&&rejected;
})()`,ctx));
console.log('RESULT pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
