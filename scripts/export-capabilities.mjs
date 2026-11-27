/* 生成外部 Agent 可读取的能力声明。
   真源：package.json（应用版本）、src/js/02-core.js 的 assetArchiveLimits()、SW 文件与公开契约清单。
   用法：node scripts/export-capabilities.mjs [--check] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const checkOnly = process.argv.includes('--check');

const pkg = JSON.parse(read('package.json'));
const core = read('src/js/02-core.js');
const limitsMatch = core.match(/function assetArchiveLimits\(\)\{[\s\S]*?return (\{[\s\S]*?\});\s*\}/);
if (!limitsMatch) {
  console.error('[capabilities] 无法从 src/js/02-core.js 读取 assetArchiveLimits()');
  process.exit(1);
}
let limits;
try {
  limits = new Function('return ' + limitsMatch[1])();
} catch (err) {
  console.error('[capabilities] 解析上传上限失败：' + err.message);
  process.exit(1);
}
const swCache = (read('shotflow-sw.js').match(/const CACHE\s*=\s*'([^']+)'/) || [])[1];
if (!swCache) {
  console.error('[capabilities] 无法读取 SW 缓存版本');
  process.exit(1);
}

const capabilities = {
  format: 'stillmark.agent-capabilities',
  version: 1,
  appVersion: pkg.version,
  swCache,
  formats: {
    'stillmark.asset-pack': {
      containerVersion: 1,
      dataVersion: 1,
      kinds: ['projects', 'shots'],
      schemaPaths: [
        'schemas/asset-archive-manifest-v1.schema.json',
        'schemas/asset-archive-data-v1.schema.json',
        'schemas/project-pack-v1.schema.json'
      ],
      guidePath: 'docs/agent-guide.md',
      specPath: 'docs/asset-pack-format.md',
      examplePaths: [
        'examples/agent-shot-data-v1.json',
        'examples/agent-shot-with-image-v1.stillmark.zip',
        'examples/agent-project-data-v1.json',
        'examples/agent-project-v1.stillmark.zip'
      ],
      limits
    }
  },
  ui: {
    entry: 'shotflow.html',
    importAccept: ['.zip', '.stillmark.zip'],
    previewAndConfirm: true,
    validateOnly: true,
    receipt: true
  }
};

const target = path.join(ROOT, 'capabilities.json');
const text = JSON.stringify(capabilities, null, 2) + '\n';
if (checkOnly) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== text) {
    console.error('[capabilities] 漂移：capabilities.json 与代码真源不一致，请运行 npm run capabilities:export');
    process.exit(1);
  }
  console.log('[capabilities] ✅ 与代码真源一致');
} else {
  fs.writeFileSync(target, text);
  console.log('[capabilities] 已生成 capabilities.json（v' + pkg.version + '）');
}
