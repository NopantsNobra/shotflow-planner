/* 版本号一致性校验：以 package.json 的 version 为唯一真源，检查文档标注的「当前版本」与之相符，
   并检查 package-lock.json 版本同步。SW cache（shotflow-vN）是独立序列（仅在缓存策略变更时 bump），
   由 sync:check 保证根目录与 shotflow-app/ 两端一致，不在此处强制等于版本号。
   用法：node scripts/verify-version.mjs   （CI 自动执行） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const version = pkg.version;

const problems = [];

// 1. package.json 与 package-lock.json 版本一致
if (lock.version !== version) problems.push(`package-lock.json 根版本 ${lock.version} ≠ package.json ${version}`);
if (lock.packages?.['']?.version !== version)
  problems.push(`package-lock.json packages[""] 版本 ${lock.packages?.['']?.version} ≠ ${version}`);

// 2. README「**vX**（当前）」与 overview「当前：vX」标注的版本一致
const readme = read('README.md');
const overview = read('overview.md');
const readmeM = readme.match(/\*\*v([\d.]+)\*\*（当前）/);
if (!readmeM) problems.push('README.md 未找到「**vX.Y.Z**（当前）」标注');
else if (readmeM[1] !== version) problems.push(`README.md 当前版本 v${readmeM[1]} ≠ package.json ${version}`);
const overviewM = overview.match(/当前：v([\d.]+)/);
if (!overviewM) problems.push('overview.md 未找到「当前：vX.Y.Z」标注');
else if (overviewM[1] !== version) problems.push(`overview.md 当前版本 v${overviewM[1]} ≠ package.json ${version}`);

// 3. SW cache 格式合法（shotflow-vN），且两端一致由 sync:check 覆盖，此处仅校验格式
for (const p of ['shotflow-sw.js', 'shotflow-app/shotflow-sw.js']) {
  const m = read(p).match(/const CACHE\s*=\s*'shotflow-v[\d-]+'/);
  if (!m) problems.push(`${p} 的 CACHE 常量格式非法（应为 shotflow-vN 或 shotflow-vN-N）`);
}

if (problems.length) {
  console.error('[verify-version] ❌ 版本一致性失败：');
  problems.forEach((p) => console.error('  - ' + p));
  console.error('[verify-version] 真源为 package.json 的 version；请同步上述位置');
  process.exit(1);
}
console.log(`[verify-version] ✅ 版本一致（v${version}，package.json / lock / README / overview）`);
