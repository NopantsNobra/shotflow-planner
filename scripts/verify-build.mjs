/* 构建一致性校验：确认 shotflow.html 与 src/ 源码构建结果逐字节一致（CI 门禁）。
   用法：node scripts/verify-build.mjs
   不一致时说明有人直接改了 shotflow.html 而未同步改 src/，退出码 1。
   期望产物由 scripts/assemble.mjs 计算（与 build.mjs 共享同一份拼接 + 版本注入逻辑）。 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
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

/* Independent artifact check: do not trust assembleHtml's own hash calculation.
   Also inspect the deployed copy, since CSP is enforced on the served bytes. */
function verifyStrictCsp(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const policy = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/i)?.[1];
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!policy || !script) throw new Error(file + ': missing CSP meta or app script');

  const directives = new Map();
  for (const entry of policy.split(';').map((s) => s.trim()).filter(Boolean)) {
    const [name, ...values] = entry.split(/\s+/);
    if (directives.has(name.toLowerCase())) throw new Error(file + ': duplicate CSP directive ' + name);
    directives.set(name.toLowerCase(), values.join(' '));
  }

  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  const expectedScript = "'sha256-" + hash + "'";
  const required = {
    'default-src': "'none'",
    'script-src': expectedScript,
    'script-src-attr': "'none'",
    'object-src': "'none'",
    'base-uri': "'none'",
    'form-action': "'none'"
  };
  for (const [name, value] of Object.entries(required)) {
    if (directives.get(name) !== value) throw new Error(file + ': invalid ' + name + ' directive');
  }
  if (directives.has('script-src-elem') && directives.get('script-src-elem') !== expectedScript) {
    throw new Error(file + ': script-src-elem overrides the approved script hash');
  }

  if (html.includes('__APP_SCRIPT_HASH__') || html.includes('__PROPOSAL_SCRIPT_HASH__')) {
    throw new Error(file + ': unresolved CSP hash placeholder');
  }
  console.log('[verify-build] CSP hash verified independently: ' + file);
}

for (const file of ['shotflow.html', 'shotflow-app/shotflow.html']) verifyStrictCsp(file);
