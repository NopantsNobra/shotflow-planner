/* 规模压测：ShotFlow Planner 数据层/模板层在大量项目与分镜下的性能基准。
   用法：node tests/perf.mjs
   说明：复用 logic.test.mjs 的 fn() 机制，从构建产物 shotflow.html 抽取纯函数与模板函数，
        在 Node vm 中构造真实数据结构测量耗时与内存。DOM 解析/IDB 真实写入不在本压测范围（见报告）。 */
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const html = fs.readFileSync(new URL('../shotflow.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function fn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing fn ' + name);
  const start = src.slice(Math.max(0, i - 6), i) === 'async ' ? i - 6 : i;
  let depth = 0,
    started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') {
      depth++;
      started = true;
    } else if (src[j] === '}' && started && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error('unbalanced fn ' + name);
}
const ctx = vm.createContext({
  console,
  Date,
  Math,
  String,
  Number,
  Array,
  Object,
  JSON,
  RegExp,
  Set,
  encodeURIComponent
});
vm.runInContext(
  "globalThis.FAV_KINDS=['mood','shots','schedule','scenes','items','budget','notes','todos']" +
    ";globalThis.FAV_META={mood:'情绪板',shots:'分镜',schedule:'日程',scenes:'清单',items:'清单',budget:'预算',notes:'协作',todos:'协作'};" +
    "globalThis.STATUSES=['待拍摄','拍摄中','后期中','已交付','已归档','已取消'];" +
    // esc/jstr 是 const 箭头函数，fn() 抽不到，按 shotflow.html 原样注入
    ";globalThis.esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');" +
    ";globalThis.jstr=s=>esc(JSON.stringify(String(s==null?'':s)));" +
    ";globalThis.DAY_BASE='10:00';globalThis.COLLECT_START='09:30';globalThis.COLLECT_MIN=30;globalThis.WRAP_MIN=15;globalThis.SHOT_DEFAULT_MIN=10;" +
    // v10.8.0：shotListHtml 的复制按钮提示用到 COPY_SHIFT_MIN（与源码常量同源）
    ";globalThis.COPY_SHIFT_MIN=10;" +
    ";globalThis.view={shotFilter:''};globalThis.imgCache={};",
  ctx
);
const FNS = [
  'addMin',
  'toMin',
  'fmtMin',
  'dayItems',
  'cascadeShift',
  'tagKey',
  'dedupeTags',
  'parseTagsInput',
  'mergeVocab',
  'migrateTags',
  'tagsForDisplay',
  'matchByTags',
  'renameTag',
  'removeTag',
  'migrate',
  'freshView',
  'migrateFav',
  'isFav',
  'favCount',
  'favSummary',
  'backupItemCount',
  'matchBoardScope',
  'isActiveStatus',
  'parseMultiImage',
  'slugPreview',
  'shootCountdown',
  'demoBadge',
  'projectCardHtml',
  'boardGridHtml',
  'searchHit',
  'planDay',
  'dayItems',
  'normalizeShootDates',
  'pinOf',
  'dayDefaults',
  'ensureDayDefaults',
  'rescheduleDay',
  'applyDay',
  'addDays',
  'applyPlanWrite',
  'shootDatesOf',
  'resolveShootDate',
  'shotSortKey',
  'mmdd',
  'doAttrs',
  'editBtn',
  'shotListHtml'
];
for (const n of [...new Set(FNS)]) vm.runInContext(fn(n), ctx);

// ---- 构造真实数据结构 ----
let seq = 0;
const mk = (i, shotCount) => ({
  id: 'p' + i,
  v3: 1,
  name: '压测项目 ' + i,
  client: '客户 ' + (i % 50),
  status: ['待拍摄', '拍摄中', '后期中', '已交付', '已归档', '已取消'][i % 6],
  shootDate: '2026-12-' + String((i % 28) + 1).padStart(2, '0'),
  location: '南京',
  lat: 32.06,
  lng: 118.78,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  concept: { theme: '主题 ' + i, style: '胶片', audience: '25-35', usage: '客片', note: '备注 ' + i },
  mood: [{ id: 'm' + i, type: 'text', content: '光线 ' + i, tag: '光线', fav: true }],
  scenes: [{ id: 'sc' + i, name: '场景 ' + i, note: '', done: false }],
  dayInit: ['2026-12-01'],
  shootDates: ['2026-12-01'],
  shots: Array.from({ length: shotCount }, (_, j) => ({
    id: 's' + i + '_' + j,
    name: '分镜 ' + j,
    date: '2026-12-01',
    duration: 20,
    sceneId: 'sc' + i,
    position: '平视',
    light: '侧光',
    refIds: [],
    note: '',
    done: j % 2 === 0,
    ord: j,
    slot: '10:' + String(j % 60).padStart(2, '0')
  })),
  schedule: [
    { id: 'sch' + i, type: '集合', title: '集合', start: '09:30', end: '10:00', note: '', done: false, auto: 'call' }
  ],
  items: [],
  budget: [{ id: 'b' + i, name: '套餐', amount: 1000 + i }],
  notes: [{ id: 'n' + i, text: '沟通 ' + i, done: false }],
  todos: [{ id: 't' + i, text: '待办 ' + i, done: false }],
  refs: [],
  tagVocab: []
});
const build = (n, shots) => Array.from({ length: n }, (_, i) => mk(i, shots));
const heapMB = () => Math.round((process.memoryUsage().heapUsed / 1048576) * 10) / 10;
function bench(label, fn, rounds = 5) {
  for (let i = 0; i < 2; i++) fn(); // 预热 JIT
  const times = [];
  let result;
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    result = fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  return { label, ms: Math.round(median * 100) / 100, result };
}
const fmt = (n) => n.toLocaleString('en-US');
const pad = (s, n) => String(s).padEnd(n);

console.log('=== ShotFlow Planner 规模压测（Node vm，纯函数 + 模板层）===');
console.log(`环境: Node ${process.version}, ${process.platform}/${process.arch}\n`);

// ---- 场景 1：看板全量重绘（项目数递增，每项目 8 分镜）----
console.log('【场景 1】看板全量构建 boardGridHtml（项目数递增，每项目 8 分镜）');
console.log(pad('项目数', 8), pad('JSON体积', 12), pad('searchHit', 12), pad('boardGridHtml', 16), '堆内存');
for (const n of [100, 500, 1000, 2000]) {
  const data = build(n, 8);
  vm.runInContext('globalThis.__data=' + JSON.stringify(data), ctx);
  const sizeMB = Math.round((JSON.stringify(data).length / 1048576) * 100) / 100;
  const tSearch = bench('search', () => vm.runInContext('__data.filter(p=>searchHit(p,"客户 25")).length', ctx), 2);
  const tBoard = bench('board', () => vm.runInContext('boardGridHtml(__data,__data,"2026-11-23").length', ctx), 2);
  console.log(
    pad(fmt(n), 8),
    pad(sizeMB + ' MB', 12),
    pad(tSearch.ms + ' ms', 12),
    pad(tBoard.ms + ' ms', 16),
    heapMB() + ' MB'
  );
  vm.runInContext('delete globalThis.__data', ctx);
}

// ---- 场景 2：单项目分镜数递增的模板/排程 ----
console.log('\n【场景 2】单项目分镜数递增：dayItems / planDay / shotListHtml 全量重绘');
console.log(pad('分镜数', 8), pad('dayItems', 12), pad('planDay', 12), pad('shotListHtml', 16));
for (const shots of [100, 500, 1000, 2000]) {
  const data = [mk(0, shots)];
  vm.runInContext('globalThis.__data=' + JSON.stringify(data), ctx);
  const tDay = bench('dayItems', () => vm.runInContext('dayItems(__data[0],"2026-12-01").length', ctx));
  const tPlan = bench('planDay', () => vm.runInContext('planDay(__data[0],"2026-12-01",null).shots.length', ctx));
  const tList = bench('shotListHtml', () =>
    vm.runInContext('shotListHtml(__data[0],shootDatesOf(__data[0])).length', ctx)
  );
  console.log(pad(fmt(shots), 8), pad(tDay.ms + ' ms', 12), pad(tPlan.ms + ' ms', 12), pad(tList.ms + ' ms', 16));
  vm.runInContext('delete globalThis.__data', ctx);
}

// ---- 场景 3：migrate（导入）----
console.log('\n【场景 3】migrate 导入耗时（项目数递增）');
console.log(pad('项目数', 8), pad('migrate 全量', 14));
for (const n of [100, 500, 1000, 2000]) {
  const data = build(n, 8);
  vm.runInContext('globalThis.__data=' + JSON.stringify(data), ctx);
  const t = bench('migrate', () => vm.runInContext('__data.map(p=>migrate(p)).length', ctx), 1);
  console.log(pad(fmt(n), 8), pad(t.ms + ' ms', 14));
  vm.runInContext('delete globalThis.__data', ctx);
}

// ---- 场景 4：JSON 序列化/反序列化（saveP 落盘核心成本）----
console.log('\n【场景 4】JSON 序列化 + 反序列化（saveP 写 IDB 前的 CPU 成本）');
console.log(pad('项目数', 8), pad('序列化', 12), pad('反序列化', 12), pad('JSON体积', 12));
for (const n of [100, 500, 1000, 2000]) {
  const data = build(n, 8);
  const t1 = bench('stringify', () => JSON.stringify(data), 2);
  const json = t1.result;
  const t2 = bench('parse', () => JSON.parse(json), 2);
  console.log(
    pad(fmt(n), 8),
    pad(t1.ms + ' ms', 12),
    pad(t2.ms + ' ms', 12),
    pad(Math.round((json.length / 1048576) * 100) / 100 + ' MB', 12)
  );
}

// ---- 性能回归断言（防止 shotListHtml 重新引入 O(N²)）----
console.log('\n【性能回归门禁】');
const gateData = [mk(0, 2000)];
vm.runInContext('globalThis.__gate=' + JSON.stringify(gateData), ctx);
const gateMs = bench('gate', () => vm.runInContext('shotListHtml(__gate[0],shootDatesOf(__gate[0])).length', ctx)).ms;
const GATE_LIMIT = 50; // 2000 分镜全量渲染应 < 50ms（优化后约 7ms；优化前约 1125ms）
if (gateMs > GATE_LIMIT) {
  console.error(`❌ 性能门禁失败：shotListHtml(2000 分镜)=${gateMs}ms > ${GATE_LIMIT}ms，疑似重新引入 O(N²)`);
  process.exitCode = 1;
} else {
  console.log(`✅ shotListHtml(2000 分镜)=${gateMs}ms < ${GATE_LIMIT}ms（线性复杂度守护）`);
}
vm.runInContext('delete globalThis.__gate', ctx);

console.log('\n=== 压测完成 ===');
