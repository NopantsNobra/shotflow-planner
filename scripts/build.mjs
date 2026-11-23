/* P3 构建脚本：把 src/ 多文件源码拼接回自包含单文件 shotflow.html（双击即用，零运行时依赖）。
   用法：node scripts/build.mjs
   拼接与版本注入逻辑在 scripts/assemble.mjs（与 verify-build.mjs 共享）；
   产物一致性由 scripts/verify-build.mjs 校验。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleHtml, jsSegmentCount } from './assemble.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shotflow.html');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const out = assembleHtml(pkg.version);
fs.writeFileSync(OUT, out);
console.log(
  `[build] 已生成 ${path.relative(ROOT, OUT)}（${out.split('\n').length} 行，JS 段 ${jsSegmentCount()} 个，APP_VERSION=${pkg.version}）`
);
