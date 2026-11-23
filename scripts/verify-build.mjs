/* 构建一致性校验：确认 shotflow.html 与 src/ 源码构建结果逐字节一致（CI 门禁）。
   用法：node scripts/verify-build.mjs
   不一致时说明有人直接改了 shotflow.html 而未同步改 src/，退出码 1。
   期望产物由 scripts/assemble.mjs 计算（与 build.mjs 共享同一份拼接 + 版本注入逻辑）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleHtml, jsSegmentCount } from './assemble.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shotflow.html');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const actual = fs.readFileSync(OUT, 'utf8');
const expected = assembleHtml(pkg.version);
if (actual === expected) {
  console.log(
    `[verify-build] ✅ shotflow.html 与 src/ 源码一致（${jsSegmentCount()} 个 JS 段，APP_VERSION=${pkg.version}）`
  );
} else {
  console.error('[verify-build] ❌ shotflow.html 与 src/ 源码不一致');
  console.error('[verify-build] 可能原因：直接修改了 shotflow.html 而未同步 src/');
  console.error('[verify-build] 修复：先改 src/，再运行 node scripts/build.mjs');
  process.exit(1);
}
