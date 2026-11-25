/* 部署副本同步：把仓库根目录的「真源」文件单向同步到 shotflow-app/，
   消除 README 要求的「改完手动 cp」带来的两端漂移风险。
   用法：
     node scripts/sync-app.mjs          同步（覆盖 shotflow-app/ 下对应文件）
     node scripts/sync-app.mjs --check  仅校验一致性，不一致时以待同步清单退出码 1（供 CI 使用）
   真源文件清单（与 README「文件夹结构」一致）：
     shotflow.html / shotflow-manifest.json / shotflow-sw.js / icon-192.png / icon-512.png */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'shotflow-app');
const FILES = [
  'shotflow.html',
  'shotflow-manifest.json',
  'shotflow-sw.js',
  'icon-192.png',
  'icon-512.png',
  'docs/agent-guide.md',
  'schemas/project-pack-v1.schema.json',
  'schemas/asset-archive-manifest-v1.schema.json',
  'schemas/asset-archive-data-v1.schema.json',
  'examples/agent-shot.json',
  'examples/agent-project.json'
];
const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(TARGET)) {
  if (checkOnly) {
    console.error(`[sync] 校验失败：目标目录不存在 ${TARGET}`);
    process.exit(1);
  }
  fs.mkdirSync(TARGET, { recursive: true });
}

/**
 * 对比两个文件的内容（Buffer 逐字节比较），返回是否一致。
 * 不存在或读取失败均视为不一致。
 */
function same(a, b) {
  try {
    const ba = fs.readFileSync(a);
    const bb = fs.readFileSync(b);
    return ba.length === bb.length && ba.equals(bb);
  } catch {
    return false;
  }
}

const drift = [];
for (const name of FILES) {
  const src = path.join(ROOT, name);
  const dst = path.join(TARGET, name);
  if (!fs.existsSync(src)) {
    console.error(`[sync] 真源缺失：${name}`);
    process.exit(1);
  }
  if (checkOnly) {
    if (!same(src, dst)) drift.push(name);
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

if (checkOnly) {
  if (drift.length) {
    console.error(`[sync] 检查失败：shotflow-app/ 与真源不一致 → ${drift.join(', ')}`);
    console.error('[sync] 修复：运行 node scripts/sync-app.mjs');
    process.exit(1);
  }
  console.log(`[sync] 检查通过：shotflow-app/ 与真源完全一致（${FILES.length} 个文件）`);
} else {
  console.log(`[sync] 已同步 ${FILES.length} 个文件到 shotflow-app/`);
}
