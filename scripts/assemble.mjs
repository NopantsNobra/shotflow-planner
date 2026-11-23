/* 共享组装模块：src/ 多文件源码 → 自包含单文件 HTML。
   build.mjs 与 verify-build.mjs 共用本模块，消除两份重复拼接逻辑的漂移风险。
   assembleHtml(version)：
   - version 传入 package.json 的版本号时，把 src/js/01-data.js 中的 APP_VERSION 占位字面量
     '__APP_VERSION__'（含引号的完整字面量）替换为 JSON.stringify(version)；
   - version 为空值时不注入，占位符原样保留。
   与 <!--__STYLES__--> / <!--__JS__--> 同一替换层（src → 产物阶段），verify-build 用同一函数
   计算期望产物，天然一致。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

export function jsSegmentCount() {
  return fs.readdirSync(path.join(SRC, 'js')).filter((f) => f.endsWith('.js')).length;
}

export function assembleHtml(version) {
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
    throw new Error('[assemble] shell.html 缺少占位符 <!--__STYLES__--> / <!--__JS__-->');

  // 用函数形式替换，避免替换字符串中的 $& / $' / $$ 被当作特殊替换模式（JS 源码含大量 '$'）
  let out = shell
    .replace('<!--__STYLES__-->', () => styleBlock.trimEnd())
    .replace('<!--__JS__-->', () => jsBlock.trimEnd());

  // 版本注入：仅替换含引号的完整字面量，函数形式避免 $ 特殊模式
  if (version) out = out.replace("'__APP_VERSION__'", () => JSON.stringify(String(version)));

  return out;
}
