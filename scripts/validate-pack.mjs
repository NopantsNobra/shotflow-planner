/* 资产包目录校验器：面向外部 Agent 的可复制 JSON 诊断。
   用法：node scripts/validate-pack.mjs <已解压的资产包目录>
   校验范围：容器清单、SHA-256、字节数、引用闭包、字段形状与上限。
   完整 ZIP 字节流校验仍由应用导入器执行；本工具不替代 UI 导入确认。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
if (!dir) {
  console.log(
    JSON.stringify({ ok: false, errors: [{ code: 'USAGE', path: '$', message: '请提供已解压的资产包目录' }] }, null, 2)
  );
  process.exit(2);
}
const limits = JSON.parse(fs.readFileSync(path.join(ROOT, 'capabilities.json'), 'utf8')).formats['stillmark.asset-pack']
  .limits;
const errors = [],
  warnings = [];
const err = (code, at, message) => errors.push({ code, path: at, message });
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const abs = path.resolve(dir);
const read = (rel) => fs.readFileSync(path.join(abs, rel));
const exists = (rel) => fs.existsSync(path.join(abs, rel));

let manifest = null,
  data = null;
try {
  manifest = JSON.parse(read('manifest.json').toString('utf8'));
} catch (e) {
  err('MANIFEST_READ', 'manifest.json', e.message);
}
try {
  data = JSON.parse(read('data.json').toString('utf8'));
} catch (e) {
  err('DATA_READ', 'data.json', e.message);
}

if (manifest) {
  if (manifest.format !== 'stillmark.asset-pack') err('FORMAT', 'manifest.format', '必须是 stillmark.asset-pack');
  if (manifest.containerVersion !== 1) err('CONTAINER_VERSION', 'manifest.containerVersion', '仅支持 1');
  if (manifest.dataVersion !== 1) err('DATA_VERSION', 'manifest.dataVersion', '仅支持 1');
  if (!['projects', 'shots'].includes(manifest.kind)) err('KIND', 'manifest.kind', '仅支持 projects/shots');
  if (!Number.isFinite(Date.parse(manifest.exportedAt))) err('EXPORTED_AT', 'manifest.exportedAt', '时间不合法');
  if (!manifest.data || manifest.data.path !== 'data.json') err('DATA_PATH', 'manifest.data.path', '必须为 data.json');
  if (!Array.isArray(manifest.images)) err('IMAGES', 'manifest.images', '必须是数组');
  else if (manifest.images.length > limits.maxImageRefs) err('IMAGE_LIMIT', 'manifest.images', '超过逻辑图片引用上限');
}
if (data) {
  if (data.dataVersion !== 1) err('DATA_VERSION', 'data.dataVersion', '仅支持 1');
  if (!['projects', 'shots'].includes(data.kind)) err('KIND', 'data.kind', '仅支持 projects/shots');
  if (manifest && data.kind !== manifest.kind) err('KIND_MISMATCH', 'data.kind', '与清单 kind 不一致');
  if (!Array.isArray(data.entries) || data.entries.length < 1 || data.entries.length > 200)
    err('ENTRIES', 'data.entries', '须为 1–200 项');
}
if (manifest && data) {
  const raw = read('data.json');
  if (raw.length !== manifest.data.bytes) err('DATA_BYTES', 'manifest.data.bytes', '字节数不符');
  if (sha(raw) !== manifest.data.sha256) err('DATA_SHA256', 'manifest.data.sha256', '摘要不符');
  const keys = new Set(),
    paths = new Set();
  for (const [i, image] of (manifest.images || []).entries()) {
    const at = `manifest.images[${i}]`;
    if (!/^images\/[0-9a-f]{64}\.(jpg|png|webp|gif|avif)$/.test(image.path || ''))
      err('IMAGE_PATH', at + '.path', '路径格式不合法');
    if (paths.has(image.path)) err('DUPLICATE_PATH', at + '.path', '路径重复');
    paths.add(image.path);
    if (keys.has(image.key)) err('DUPLICATE_KEY', at + '.key', '逻辑 key 重复');
    keys.add(image.key);
    if (!exists(image.path)) {
      err('IMAGE_MISSING', image.path, '文件不存在');
      continue;
    }
    const bytes = read(image.path);
    if (bytes.length !== image.bytes) err('IMAGE_BYTES', image.path, '字节数不符');
    if (sha(bytes) !== image.sha256) err('IMAGE_SHA256', image.path, '摘要不符');
    if (bytes.length > limits.maxImageBytes) err('IMAGE_TOO_LARGE', image.path, '超过单张图片上限');
  }
  const used = new Set();
  for (const [i, p] of (data.entries || []).entries()) {
    const at = `data.entries[${i}]`;
    if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.name !== 'string' || !p.name)
      err('ENTRY_NAME', at, '缺少项目名称');
    for (const r of p.refs || []) if (r.key) used.add(String(r.key));
    for (const m of p.mood || []) if (m.type === 'image' && m.content) used.add(String(m.content));
    for (const s of p.shots || []) {
      for (const id of s.refIds || []) used.add(String(id));
      if (Array.isArray(s.refIds) && s.refIds.length > 3) err('REF_LIMIT', at + '.shots.refIds', '单镜最多 3 张参考图');
    }
  }
  for (const key of used) if (!keys.has(key)) err('UNRESOLVED_REF', 'data.entries', `图片引用 ${key} 未在清单声明`);
  const extra = fs.readdirSync(abs, { recursive: true }).filter((f) => {
    const rel = String(f);
    return rel !== 'manifest.json' && rel !== 'data.json' && rel !== 'images' && !rel.startsWith('images/');
  });
  if (extra.length) err('EXTRA_FILE', extra.join(','), '包内存在未声明条目');
  if (!used.size) warnings.push({ code: 'NO_IMAGES', path: 'data.entries', message: '包内没有图片引用' });
}

const result = {
  ok: errors.length === 0,
  errors,
  warnings,
  stats: {
    projects: data?.entries?.length || 0,
    shots: (data?.entries || []).reduce((n, p) => n + (p.shots || []).length, 0),
    images: manifest?.images?.length || 0
  }
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
