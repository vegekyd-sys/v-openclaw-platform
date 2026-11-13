import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FILES, MARKER, NEW_FILES } from './patch-usage-offload.mjs';
import { OUTPUT_DIR, PLAN } from './build-usage-offload.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('plan replaces three V files by their before-bytes and adds the two worker files', () => {
  assert.deepEqual(
    plan.files.map((f) => f.target),
    [...FILES, ...NEW_FILES].map((f) => `${f.target}/${f.name}`),
  );
  assert.deepEqual(plan.files.slice(0, FILES.length).map((f) => f.before), FILES.map((f) => f.before));
  assert(plan.files.slice(FILES.length).every((f) => !('before' in f)));
});

test('release files carry the marker, parse, and refuse a second patch', () => {
  for (const file of FILES) {
    const out = read(file.name);
    assert(out.includes(MARKER), file.name);
    assert.throws(() => file.patch(out), /already patched/u);
    assert.notEqual(sha(out), file.before);
  }
  for (const file of NEW_FILES) assert.equal(read(file.name), file.content);
  for (const name of [...FILES, ...NEW_FILES].map((f) => f.name)) {
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${name}: ${r.stderr}`);
  }
});

test('handlers and /usage cost import the readers from the offload module', () => {
  const usage = read('usage-C3nh9kcO.js');
  assert.match(usage, /import \{ callUsageOffloadRpc, discoverAllSessions, isUsageOffloadEnabled, loadCostUsageSummaryFromCache, loadSessionCostSummariesFromCache, loadSessionLogs, loadSessionUsageTimeSeries \} from "\.\/usage-offload-v1\.js";/u);
  assert.match(usage, /const usageHandlersInProcess = \{\n/u);
  assert.match(usage, /const usageHandlers = offloadUsageRpcHandlers\(usageHandlersInProcess\);/u);
  assert.match(usage, /export \{ usageHandlers as t, usageHandlersInProcess \};$/mu);
  assert.doesNotMatch(read('usage-C3nh9kcO.js'), /o as loadCostUsageSummaryFromCache/u);
  assert.match(read('commands-session-cost.runtime-C4rqe689.js'), /import \{ loadCostUsageSummary, loadSessionCostSummary \} from "\.\/usage-offload-v1\.js";/u);
});

test('refresh budget and report window follow their switches', () => {
  const src = read('session-cost-usage-C_mE_GAE.js');
  const start = src.indexOf('const USAGE_REFRESH_DEFAULT_MAX_BYTES');
  const end = src.indexOf('const USAGE_COST_ROLLUP_VERSION');
  const make = (env) => new Function('process', 'performance', `${src.slice(start, end)}\nreturn { isUsageCostWindowEnabled, resolveUsageRefreshBudget, isUsageRefreshBudgetSpent };`)({ env }, { now: () => 1000 });
  const on = make({});
  assert.equal(on.isUsageCostWindowEnabled(), true);
  assert.deepEqual(on.resolveUsageRefreshBudget(), { maxBytes: 1024 ** 3, maxMs: 300000 });
  const budget = on.resolveUsageRefreshBudget();
  assert.equal(on.isUsageRefreshBudgetSpent({ budget, scannedFiles: 0, scannedBytes: 5 * 1024 ** 3, startedAt: 0 }), false, 'the first transcript always runs');
  assert.equal(on.isUsageRefreshBudgetSpent({ budget, scannedFiles: 1, scannedBytes: 1024 ** 3, startedAt: 999 }), true);
  assert.equal(on.isUsageRefreshBudgetSpent({ budget, scannedFiles: 1, scannedBytes: 1, startedAt: 1000 - 300000 }), true);
  assert.equal(on.isUsageRefreshBudgetSpent({ budget, scannedFiles: 3, scannedBytes: 10, startedAt: 999 }), false);
  const off = make({ OPENCLAW_USAGE_COST_WINDOW: '0', OPENCLAW_USAGE_REFRESH_MAX_BYTES: '0', OPENCLAW_USAGE_REFRESH_MAX_MS: '0' });
  assert.equal(off.isUsageCostWindowEnabled(), false);
  assert.deepEqual(off.resolveUsageRefreshBudget(), { maxBytes: undefined, maxMs: undefined });
});

// Run the real offload module and worker against stub readers in a temporary dist.
function stubDist(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-offload-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of NEW_FILES) fs.writeFileSync(path.join(dir, file.name), read(file.name));
  fs.writeFileSync(path.join(dir, 'subsystem-bfHYmnCE.js'), 'export const t = () => ({ warn() {}, info() {} });\n');
  const reader = (name) => `async (params) => {
    if (params?.crash) process.exit(7);
    if (params?.fail) throw new Error("reader failed");
    return { name: ${JSON.stringify(name)}, pid: process.pid, child: process.env.OPENCLAW_USAGE_OFFLOAD_CHILD ?? null, execArgv: process.execArgv, endIsInfinity: params?.endMs === Infinity, params };
  }`;
  fs.writeFileSync(path.join(dir, 'session-cost-usage-C_mE_GAE.js'), `
const a = ${reader('loadCostUsageSummary')}, i = ${reader('loadSessionUsageTimeSeries')}, n = ${reader('loadSessionCostSummary')},
  o = ${reader('loadCostUsageSummaryFromCache')}, r = ${reader('loadSessionLogs')}, s = ${reader('loadSessionCostSummariesFromCache')},
  t = ${reader('discoverAllSessions')};
const isCostUsageRefreshQueueIdle = () => true;
export { a, i, n, o, r, s, t, isCostUsageRefreshQueueIdle };
`);
  fs.writeFileSync(path.join(dir, 'usage-C3nh9kcO.js'), `
const usageHandlersInProcess = {
  "usage.cost": async ({ params, context, client, respond }) => respond(true, { params, config: context.getRuntimeConfig(), scopes: client.connect.scopes, pid: process.pid })
};
export { usageHandlersInProcess };
`);
  return dir;
}

function runScenario(t, script, env = {}) {
  const dir = stubDist(t);
  const file = path.join(dir, 'scenario.mjs');
  fs.writeFileSync(file, `import * as m from ${JSON.stringify(pathToFileURL(path.join(dir, 'usage-offload-v1.js')).href)};\n${script}`);
  const r = spawnSync(process.execPath, ['--inspect=127.0.0.1:0', '--max-old-space-size=256', file], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, OPENCLAW_USAGE_OFFLOAD: '', OPENCLAW_USAGE_OFFLOAD_CHILD: '', ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('readers answer from the worker process with the Gateway flags it needs', (t) => {
  const out = runScenario(t, `
const value = await m.loadCostUsageSummaryFromCache({ agentId: "makaron", startMs: 1, endMs: Infinity, config: { a: 1, fn: () => 1 } });
const again = await m.loadSessionLogs({ agentId: "makaron" });
let failed = null;
try { await m.discoverAllSessions({ fail: true }); } catch (error) { failed = error.message; }
console.log(JSON.stringify({ value, again, failed, self: process.pid }));
`);
  assert.equal(out.value.name, 'loadCostUsageSummaryFromCache');
  assert.notEqual(out.value.pid, out.self);
  assert.equal(out.value.child, '1');
  assert.equal(out.value.endIsInfinity, true);
  assert(!out.value.execArgv.some((arg) => arg.startsWith('--inspect')), out.value.execArgv.join(' '));
  assert(out.value.execArgv.includes('--max-old-space-size=4096'));
  assert.deepEqual(out.value.params.config, { a: 1 });
  assert.equal(out.again.pid, out.value.pid, 'one worker serves later calls');
  assert.equal(out.failed, 'reader failed');
});

test('a dead worker fails its calls and the next call starts a new one; idle workers exit', (t) => {
  const out = runScenario(t, `
const first = await m.loadSessionLogs({});
let crashed = null;
try { await m.loadSessionLogs({ crash: true }); } catch (error) { crashed = error.message; }
const second = await m.loadSessionLogs({});
await new Promise((resolve) => setTimeout(resolve, 600));
let alive = true;
try { process.kill(second.pid, 0); } catch { alive = false; }
console.log(JSON.stringify({ first: first.pid, second: second.pid, crashed, alive }));
`, { OPENCLAW_USAGE_OFFLOAD_IDLE_MS: '100' });
  assert.match(out.crashed, /usage worker exited before answering/u);
  assert.notEqual(out.second, out.first);
  assert.equal(out.alive, false, 'idle worker exited after shutdown');
});

test('a whole usage RPC runs in the worker and only its reply comes back', (t) => {
  const out = runScenario(t, `
const reply = await m.callUsageOffloadRpc("usage.cost", { agentId: "makaron", days: 1 }, { agents: {}, fn: () => 1 });
let unknown = null;
try { await m.callUsageOffloadRpc("usage.nope", {}, {}); } catch (error) { unknown = error.message; }
console.log(JSON.stringify({ reply, unknown, self: process.pid }));
`);
  assert.equal(out.reply.ok, true);
  assert.deepEqual(out.reply.payload.params, { agentId: 'makaron', days: 1 });
  assert.deepEqual(out.reply.payload.config, { agents: {} });
  assert.deepEqual(out.reply.payload.scopes, ['operator.admin']);
  assert.notEqual(out.reply.payload.pid, out.self);
  assert.match(out.unknown, /unknown usage rpc usage\.nope/u);
});

test('OPENCLAW_USAGE_OFFLOAD=0 runs readers in-process', (t) => {
  const out = runScenario(t, `
const value = await m.loadCostUsageSummary({ agentId: "makaron" });
console.log(JSON.stringify({ value, self: process.pid, enabled: m.isUsageOffloadEnabled() }));
`, { OPENCLAW_USAGE_OFFLOAD: '0' });
  assert.equal(out.enabled, false);
  assert.equal(out.value.pid, out.self);
});
