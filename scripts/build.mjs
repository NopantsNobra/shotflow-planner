/* P3 构建脚本：把 src/ 多文件源码拼接回自包含单文件 shotflow.html（双击即用，零运行时依赖）。
   用法：node scripts/build.mjs
   产物必须与重构前的单文件逐字节一致（scripts/verify-build.mjs 校验）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'shotflow.html');

const read = (p) => fs.readFileSync(p, 'utf8');
const shell = read(path.join(SRC, 'shell.html'));
const styles = read(path.join(SRC, 'styles.css'));
const jsFiles = fs
  .readdirSync(path.join(SRC, 'js'))
  .filter((f) => f.endsWith('.js'))
  .sort();
const js = jsFiles.map((f) => read(path.join(SRC, 'js', f))).join('');

// 样式：把 CSS 包回 <style> 标签（原文件 14-386 行的形式）
const styleBlock = '<style>\n' + styles + '</style>\n';
// JS：包回 <script> 标签（原文件 440-3613 行的形式）
const jsBlock = '<script>\n' + js + '</script>\n';

if (!shell.includes('<!--__STYLES__-->') || !shell.includes('<!--__JS__-->'))
  throw new Error('[build] shell.html 缺少占位符 <!--__STYLES__--> / <!--__JS__-->');

// 用函数形式替换，避免替换字符串中的 $& / $' / $$ 被当作特殊替换模式（JS 源码含大量 '$'）
const out = shell
  .replace('<!--__STYLES__-->', () => styleBlock.trimEnd())
  .replace('<!--__JS__-->', () => jsBlock.trimEnd());

fs.writeFileSync(OUT, out);
console.log(`[build] 已生成 ${path.relative(ROOT, OUT)}（${out.split('\n').length} 行，JS 段 ${jsFiles.length} 个）`);
