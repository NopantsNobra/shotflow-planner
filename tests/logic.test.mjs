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
const ctx = vm.createContext({ console, Date, Math, String, Number, Array, Object, JSON, RegExp, Set });
for (const n of ['addMin', 'toMin', 'fmtMin', 'dayItems', 'cascadeShift', 'tagKey', 'dedupeTags', 'parseTagsInput', 'mergeVocab', 'migrateTags', 'tagsForDisplay', 'matchByTags', 'renameTag', 'removeTag', 'migrate']) vm.runInContext(fn(n), ctx);
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

console.log('RESULT pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
