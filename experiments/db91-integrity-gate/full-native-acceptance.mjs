import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const exec = promisify(execFile);
const root = '/srv/vlab-production-mirror/labs/instances/db91-fix/tmp/full-native-v1';
const core = '/srv/vlab-production-mirror/labs/instances/db91-fix/runtime/openclaw';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(process.env.OPENCLAW_CONFIG_PATH, '/srv/vlab-production-mirror/labs/instances/db91-fix/state/openclaw.json');
const manifest = JSON.parse(fs.readFileSync(root + '/source-manifest.json'));
assert.equal(manifest.bytes, 2523619328); assert(manifest.originalUnchanged);
assert(!fs.existsSync(root + '/report.json'));
const env = {...process.env, HOME: root + '/home', OPENCLAW_STATE_DIR: root + '/state', OPENCLAW_CONFIG_PATH: root + '/state/openclaw.json', OPENCLAW_DB91_INTEGRITY_ENABLE: '0'};
delete env.OPENCLAW_DB91_INTEGRITY_DIR; delete env.OPENCLAW_DB91_INTEGRITY_EPOCH;
const client = fileURLToPath(new URL('./full-native-client.mjs', import.meta.url));
async function open() {const r = await exec(process.execPath, ['--max-old-space-size=384', client, core, root], {env, timeout: 180000, maxBuffer: 1024 * 1024}); return JSON.parse(r.stdout.trim().split('\n').at(-1));}
// Serialize first native open: any original-version convergence must complete
// before comparison. The snapshot and original are never mutated by the gate.
const initial = await open();
const nativeCold = await Promise.all([open(), open()]);
env.OPENCLAW_DB91_INTEGRITY_DIR = root + '/gate'; env.OPENCLAW_DB91_INTEGRITY_EPOCH = randomUUID();
const dist = path.join(core, 'dist');
const {runPreflight} = await import(pathToFileURL(path.join(dist, 'db91-integrity-bootstrap.mjs')).href);
const gate = await import(pathToFileURL(path.join(dist, 'db91-integrity-gate.mjs')).href);
const filename = root + '/state/agents/makaron/agent/openclaw-agent.sqlite';
const targets = [{kind: 'agent', label: 'complete VLab makaron snapshot', path: filename}];
const at = performance.now();
const results = await runPreflight(path.join(dist, 'state/openclaw-database-verify.worker.js'), targets, {env, timeoutMs: 180000});
assert(results[0].db91Verification);
const preflightMs = performance.now() - at;
const reused = [];
for (let wave = 0; wave < 3; wave++) reused.push(...await Promise.all([open(), open()]));
for (const r of reused) {assert.equal(r.stats.full, 0); assert(r.stats.reused >= 1); assert.deepEqual(r.counts, initial.counts); assert.equal(r.tableCount, initial.tableCount);}
gate.invalidateVerification(filename, {env, reason: 'complete-snapshot-revalidation-test'});
const revalidated = await open(); assert.equal(revalidated.stats.full, 1); assert.deepEqual(revalidated.counts, initial.counts);
const report = {at: new Date().toISOString(), completeVLabSnapshot: true, syntheticRowsAdded: false, originalSourceUntouched: true, schemaOwnerPreserved: true, maxConcurrentClients: 2, source: manifest, initial, nativeCold, preflightMs, reused, revalidated, limitations: 'OS page cache not cleared; two actual cold opens per wave, not 100-way capacity; no private row values emitted'};
fs.writeFileSync(root + '/report.json', JSON.stringify(report, null, 2), {mode: 0o600});
console.log(JSON.stringify(report, null, 2));
