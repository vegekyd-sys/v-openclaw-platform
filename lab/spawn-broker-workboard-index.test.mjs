import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FILES } from './build-spawn-broker-workboard-index.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const plan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/spawn-broker-workboard-index.plan.json'), 'utf8'));
const sourceMap = JSON.parse(fs.readFileSync(path.join(repo, 'release/source-map.json'), 'utf8'));

test('the release files are the plan, and the source map names their fork commits', () => {
  assert.deepEqual(plan.files.map((f) => path.basename(f.source)), FILES.map(([name]) => name));
  for (const file of plan.files) {
    assert.equal(sha256(fs.readFileSync(path.join(repo, file.source))), file.after, file.source);
    const entry = sourceMap.entries.find((e) => e.layer === 'core' && e.path === path.basename(file.source) && e.sha256 === file.after);
    assert.match(entry?.source ?? '', /^versa:[0-9a-f]{7,40}$/, file.source);
  }
});

test('the shipped helper is the tested lab helper', () => {
  assert.equal(
    fs.readFileSync(path.join(repo, 'lab/release-files/spawn-broker-workboard-index/v-spawn-broker.mjs'), 'utf8'),
    fs.readFileSync(path.join(repo, 'lab/spawn-broker/v-spawn-broker.mjs'), 'utf8'),
  );
});

test("the Workboard store is V's bytes plus the index patch only", () => {
  const [, before, patch, origin] = FILES.find(([name]) => name === 'sqlite-store-CH-caj1l.js');
  const original = fs.readFileSync(path.join(repo, origin, 'sqlite-store-CH-caj1l.js'), 'utf8');
  assert.equal(sha256(original), before);
  assert.equal(patch(original), fs.readFileSync(path.join(repo, 'lab/release-files/spawn-broker-workboard-index/sqlite-store-CH-caj1l.js'), 'utf8'));
});

test("the supervisor differs from V's bytes only by the broker import and the relay spawn", () => {
  const patched = fs.readFileSync(path.join(repo, 'lab/release-files/spawn-broker-workboard-index/supervisor-BuLJGQyc.js'), 'utf8');
  // Undo the patch textually; the result must be exactly V's checksum.
  const restored = patched
    .replace('import { spawnViaBroker } from "./v-spawn-broker.mjs"; // v-spawn-broker-v1\n', '')
    .replace(`		// v-spawn-broker-v1: fork from a small helper, not from the Gateway
		const child = (useWindowsJobAnchor ? null : await spawnViaBroker(process.execPath, resolveRuntimeWorkerArgv(workerUrl), {
			stdio,
			env: process.env
		})) ?? spawn(`, '		const child = spawn(');
  assert.equal(sha256(restored), FILES[0][1]);
});
