/* 构建一致性校验：确认 shotflow.html 与 src/ 源码构建结果逐字节一致（CI 门禁）。
   用法：node scripts/verify-build.mjs
   不一致时说明有人直接改了 shotflow.html 而未同步改 src/，退出码 1。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shotflow.html');
const SRC = path.join(ROOT, 'src');

const read = (p) => fs.readFileSync(p, 'utf8');
const shell = read(path.join(SRC, 'shell.html'));
const styles = read(path.join(SRC, 'styles.css'));
const jsFiles = fs
  .readdirSync(path.join(SRC, 'js'))
  .filter((f) => f.endsWith('.js'))
  .sort();
const js = jsFiles.map((f) => read(path.join(SRC, 'js', f))).join('');
const styleBlock = '<style>\n' + styles + '</style>\n';
const jsBlock = '<script>\n' + js + '</script>\n';
const expected = shell
  .replace('<!--__STYLES__-->', () => styleBlock.trimEnd())
  .replace('<!--__JS__-->', () => jsBlock.trimEnd());

const actual = read(OUT);
if (actual === expected) {
  console.log(`[verify-build] ✅ shotflow.html 与 src/ 源码一致（${jsFiles.length} 个 JS 段）`);
} else {
  console.error('[verify-build] ❌ shotflow.html 与 src/ 源码不一致');
  console.error('[verify-build] 可能原因：直接修改了 shotflow.html 而未同步 src/');
  console.error('[verify-build] 修复：先改 src/，再运行 node scripts/build.mjs');
  process.exit(1);
}
