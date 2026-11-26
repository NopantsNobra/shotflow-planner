/* Export the public JSON Schemas from the runtime wire-contract definitions. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'src/js/02-schemas.js'), 'utf8');
const OUTPUTS = [
  ['portablePackSchema', 'schemas/project-pack-v1.schema.json'],
  ['assetArchiveManifestSchema', 'schemas/asset-archive-manifest-v1.schema.json'],
  ['assetArchiveDataSchema', 'schemas/asset-archive-data-v1.schema.json']
];
const checkOnly = process.argv.includes('--check');
const context = vm.createContext({ Number });
vm.runInContext(SOURCE, context, { filename: 'src/js/02-schemas.js' });

let drift = false;
for (const [name, file] of OUTPUTS) {
  const schema = vm.runInContext(`${name}()`, context);
  const expected = `${JSON.stringify(schema, null, 2)}\n`;
  const target = path.join(ROOT, file);
  if (checkOnly) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) {
      console.error(`[schema] 生成文件与运行时契约不一致：${file}`);
      drift = true;
    }
  } else {
    fs.writeFileSync(target, expected);
    console.log(`[schema] 已更新 ${file}`);
  }
}

if (drift) {
  console.error('[schema] 请运行 npm run schemas:export 并提交生成结果');
  process.exitCode = 1;
}
