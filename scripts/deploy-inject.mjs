/* 部署注入：给 shotflow-app/ 三个入口文件注入部署平台 sharecode，并保证严格 CSP 仍然有效。
   用法：node scripts/deploy-inject.mjs <sharecode>   （在仓库根目录执行，操作 shotflow-app/）

   背景：主 HTML 的 CSP 用 script-src 'sha256-…' 锁定内联脚本，而 SW 注册语句在主脚本内，
   注入 `register('shotflow-sw.js?sharecode=…')` 会改变主脚本字节 → 浏览器按 HTML 规范化
   （CRLF→LF）后的内容重算 hash 与声明不符 → 整个脚本被阻断（白屏只剩 footer）。
   因此注入完成后必须按同一规范化重算主脚本 hash 并更新 CSP meta。
   注意：构建侧 assemble.mjs 已做 LF 归一化；本脚本对注入后的产物再做一次同样的规范化。 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const SC = process.argv[2];
if (!SC) {
  console.error('[deploy-inject] 用法: node scripts/deploy-inject.mjs <sharecode>');
  process.exit(1);
}
const q = '?sharecode=' + SC;
const file = 'shotflow-app/shotflow.html';

let s = fs.readFileSync(file, 'utf8');
const pairs = [
  ['href="shotflow-manifest.json"', 'href="shotflow-manifest.json' + q + '"'],
  ['href="icon-192.png"', 'href="icon-192.png' + q + '"'],
  ["register('shotflow-sw.js')", "register('shotflow-sw.js" + q + "')"],
];
for (const [a, b] of pairs) {
  if (!s.includes(a)) throw new Error('[deploy-inject] 缺少注入锚点: ' + a);
  s = s.split(a).join(b);
}

// 主脚本字节已因注入改变 → 按 HTML 规范化（CRLF→LF）重算 hash 并更新 CSP meta
const m = s.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('[deploy-inject] 未找到内联主脚本');
const body = m[1].replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const h = crypto.createHash('sha256').update(body, 'utf8').digest('base64');
const before = (s.match(/script-src 'sha256-([A-Za-z0-9+/=]+)'/) || [])[1];
if (!before) throw new Error('[deploy-inject] 未找到 CSP script-src hash');
s = s.replace(
  /(Content-Security-Policy" content="[^"]*script-src 'sha256-)[A-Za-z0-9+/=]+(')/,
  (whole, p1, p2) => p1 + h + p2,
);
fs.writeFileSync(file, s);

// manifest / SW 的静态资源注入
const man = 'shotflow-app/shotflow-manifest.json';
let m1 = fs.readFileSync(man, 'utf8');
for (const [a, b] of [
  ['"start_url": "./shotflow.html"', '"start_url": "./shotflow.html' + q + '"'],
  ['"src": "icon-192.png"', '"src": "icon-192.png' + q + '"'],
  ['"src": "icon-512.png"', '"src": "icon-512.png' + q + '"'],
]) {
  if (!m1.includes(a)) throw new Error('[deploy-inject] manifest 缺少锚点: ' + a);
  m1 = m1.split(a).join(b);
}
fs.writeFileSync(man, m1);

const sw = 'shotflow-app/shotflow-sw.js';
let s1 = fs.readFileSync(sw, 'utf8');
for (const [a, b] of [
  ["'./shotflow.html'", "'./shotflow.html" + q + "'"],
  ["'./shotflow-manifest.json'", "'./shotflow-manifest.json" + q + "'"],
  ["'./icon-192.png'", "'./icon-192.png" + q + "'"],
  ["'./icon-512.png'", "'./icon-512.png" + q + "'"],
]) {
  if (!s1.includes(a)) throw new Error('[deploy-inject] sw 缺少锚点: ' + a);
  s1 = s1.split(a).join(b);
}
fs.writeFileSync(sw, s1);

console.log('[deploy-inject] 注入完成；主脚本 CSP hash:', before, '→', h);
