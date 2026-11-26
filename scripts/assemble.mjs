/* 共享组装模块：src/ 多文件源码 → 自包含单文件 HTML。
   build.mjs 与 verify-build.mjs 共用本模块，消除两份重复拼接逻辑的漂移风险。
   assembleHtml(version)：
   - version 传入 package.json 的版本号时，把 src/js/01-data.js 中的 APP_VERSION 占位字面量
     '__APP_VERSION__'（含引号的完整字面量）替换为 JSON.stringify(version)；
   - version 为空值时不注入，占位符原样保留。
   与 <!--__STYLES__--> / <!--__JS__--> 同一替换层（src → 产物阶段），verify-build 用同一函数
   计算期望产物，天然一致。 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
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
  const appJs = jsFiles.map((f) => read(path.join(SRC, 'js', f))).join('');

  // 样式：把 CSS 包回 <style> 标签（原文件 14-386 行的形式）
  const styleBlock = '<style>\n' + styles + '</style>\n';
  // JS：包回 <script> 标签（原文件 440-3613 行的形式）
  const vendor = read(path.join(SRC, 'vendor', 'zip-native-2.25.0.min.js'));
  const license = read(path.join(SRC, 'vendor', 'zip-native-2.25.0.LICENSE.txt'));
  if (/<\/script/i.test(vendor + license) || license.includes('*/'))
    throw new Error('[assemble] unsafe inline ZIP library');
  // Keep the ZIP runtime and application in one CSP-hashed classic script.
  // A separate vendor <script> would be blocked by script-src 'self' with no external file.
  const js = '/*\n' + license + '\n*/\n' + vendor + '\n' + appJs;
  const jsBlock = '<script>\n' + js + '</script>\n';

  if (!shell.includes('<!--__STYLES__-->') || !shell.includes('<!--__JS__-->'))
    throw new Error('[assemble] shell.html 缺少占位符 <!--__STYLES__--> / <!--__JS__-->');

  // 用函数形式替换，避免替换字符串中的 $& / $' / $$ 被当作特殊替换模式（JS 源码含大量 '$'）
  let out = shell
    .replace('<!--__STYLES__-->', () => styleBlock.trimEnd())
    .replace('<!--__JS__-->', () => jsBlock.trimEnd())
    .replace('<!--__ZIP_VENDOR__-->', () => '');

  // 版本注入：仅替换含引号的完整字面量，函数形式避免 $ 特殊模式
  if (version) out = out.replace("'__APP_VERSION__'", () => JSON.stringify(String(version)));

  // Hash the actual classic-script bytes after all other build substitutions.
  // ⚠ 换行规范化：HTML 解析阶段会把 \r\n / \r 统一成 \n（HTML 标准预处理），浏览器对
  // script 内容算 CSP hash 时用的是规范化后的 LF 字节。本机 Windows 上 autocrlf 会把
  // 源文件 checkout 成 CRLF，若按磁盘原始字节算 hash，产物在本机/任何 CRLF 环境必然
  // 不匹配 → 整个内联脚本被 CSP 阻断 → 白屏（CI 的 LF checkout 复现不了此故障）。
  // 因此 hash 一律先归一为 LF，与浏览器行为对齐；产物文件本身的换行保持不变。
  const hash = (value) =>
    createHash('sha256').update(String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8').digest('base64');
  const fitStart = appJs.indexOf('function fitCovers(){');
  const fitEnd = appJs.indexOf('\nfunction coverHtml(', fitStart);
  if (fitStart < 0 || fitEnd <= fitStart) throw new Error('[assemble] missing proposal script boundaries');
  const fit = appJs.slice(fitStart, fitEnd).trimEnd();
  const proposal = fit + '\nwindow.addEventListener("resize",fitCovers);fitCovers();';
  if (out.split("'__PROPOSAL_SCRIPT_HASH__'").length !== 2)
    throw new Error('[assemble] expected exactly one proposal script hash placeholder');
  out = out.replace("'__PROPOSAL_SCRIPT_HASH__'", () => JSON.stringify(hash(proposal)));
  const match = out.match(/<script>([\s\S]*?)<\/script>/);
  if (!match || out.split('__APP_SCRIPT_HASH__').length !== 2)
    throw new Error('[assemble] missing CSP script or ambiguous placeholder');

  // Check quoted attributes and unquoted attributes in literal HTML tags.
  // Runtime DOM assignments such as request.onsuccess are not HTML attributes.
  const templateSource = shell + js;
  const quotedHandler = /\s(?:on[a-z]+)\s*=\s*["']/i;
  const unquotedHandler = /<[a-z][^<>]*\son[a-z]+\s*=\s*[^\s"'`=<>]+(?=[\s/>])/i;
  if (quotedHandler.test(templateSource) || unquotedHandler.test(templateSource))
    throw new Error('[assemble] inline HTML event attribute is forbidden');
  return out.replace('__APP_SCRIPT_HASH__', () => hash(match[1]));
}
