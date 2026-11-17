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
const ctx = vm.createContext({ console, Date, Math, String, Number, Array, Object, JSON, RegExp });
for (const n of ['addMin', 'toMin', 'fmtMin', 'dayItems', 'cascadeShift', 'migrate']) vm.runInContext(fn(n), ctx);
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

const migrated = vm.runInContext(`migrate({name:'x',shots:[{id:'s',refId:'img1'}],budget:[]})`, ctx);
check('迁移 refId → refIds', JSON.stringify(migrated.shots[0].refIds) === '["img1"]');
check('迁移补 duration', migrated.shots[0].duration === 20);

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
