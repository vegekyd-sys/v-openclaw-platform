// Build an exact code-only artifact from the current shared VLab release.
// This script reads VLab code; it never writes runtime state or restarts a service.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchSystemAgentFlashNative } from './system-agent-flash-native.mjs';

const repo = '/Users/tianyicai/vlab-dev';
const target = 'openclaw/dist/inference-route-Bv_D48Z8.js';
const expectedBefore = '9d64dbf86259ecc8af74a7d55d34281b2c9253c7e91cd45fee9de1372f6b70f1';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const result = JSON.parse(execFileSync(process.execPath, [
  '/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--repo', repo, '--target', target,
], { encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 }));
const before = Buffer.from(result.content, 'base64').toString();
assert.equal(sha256(before), result.sha256, 'VLab read-code digest mismatch');
assert.equal(result.sha256, expectedBefore, 'VLab inference route drifted; review before rebuilding');

const after = patchSystemAgentFlashNative(before);
const fixture = 'lab/fixtures/system-agent-flash/inference-route-Bv_D48Z8.js';
const source = 'lab/release-files/system-agent-flash/inference-route-Bv_D48Z8.js';
writeFileSync(resolve(root, fixture), before);
writeFileSync(resolve(root, source), after);
writeFileSync(resolve(root, 'lab/system-agent-flash-native-plan.json'), `${JSON.stringify({
  baseRelease: result.current.release,
  files: [{ source, target, before: result.sha256 }],
}, null, 2)}\n`);

assert.equal(readFileSync(resolve(root, source), 'utf8'), after);
console.log(JSON.stringify({
  baseRelease: result.current.release,
  target,
  before: result.sha256,
  after: sha256(after),
}));
