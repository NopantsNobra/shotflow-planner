import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts/deploy-inject.mjs');
const sources = ['shotflow.html', 'shotflow-manifest.json', 'shotflow-sw.js'];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shotflow-deploy-inject-'));

function fixture(name) {
  const cwd = path.join(tempRoot, name);
  const app = path.join(cwd, 'shotflow-app');
  fs.mkdirSync(app, { recursive: true });
  for (const file of sources) fs.copyFileSync(path.join(root, 'shotflow-app', file), path.join(app, file));
  return { cwd, app };
}

try {
  const { cwd, app } = fixture('encoded');
  const token = "x');alert(1);//";
  const result = spawnSync(process.execPath, [script, token], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const html = fs.readFileSync(path.join(app, 'shotflow.html'), 'utf8');
  const encoded = encodeURIComponent(token).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  assert.ok(html.includes('?sharecode=' + encoded), 'sharecode must be encoded as one URL component');
  const body = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(body, 'injected page must retain its app script');
  const actualHash = crypto.createHash('sha256').update(body.replace(/\r\n/g, '\n').replace(/\r/g, '\n')).digest('base64');
  const declaredHash = html.match(/script-src 'sha256-([^']+)'/)?.[1];
  assert.equal(actualHash, declaredHash, 'CSP hash must match the injected script');
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(app, 'shotflow-manifest.json'), 'utf8')));

  const broken = fixture('atomic');
  const htmlPath = path.join(broken.app, 'shotflow.html');
  const manifestPath = path.join(broken.app, 'shotflow-manifest.json');
  const originalHtml = fs.readFileSync(htmlPath, 'utf8');
  fs.writeFileSync(manifestPath, '{}');
  const failed = spawnSync(process.execPath, [script, 'safe-token'], { cwd: broken.cwd, encoding: 'utf8' });
  assert.notEqual(failed.status, 0, 'missing deployment anchors must fail');
  assert.equal(fs.readFileSync(htmlPath, 'utf8'), originalHtml, 'validation failure must not partially write the HTML');

  console.log('PASS deploy injection encodes sharecode, preserves CSP hash and validates before writing');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
