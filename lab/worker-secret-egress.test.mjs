import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { patchWorker } from './patch-worker-secret-egress.mjs';
import {
  REGISTRY_KEY,
  prepareWorkerProxyRoot,
  resolveEgressRuntimePath,
  startWorkerSecretEgress,
} from './release-files/worker-secret-egress/secret-egress-worker.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const base = read('./release-files/worker-prewarm-contention-retry/worker.mjs');
const release = read('./release-files/worker-secret-egress/worker.mjs');

test('release is V worker.mjs plus only the Worker secret egress', () => {
  assert.equal(createHash('sha256').update(base).digest('hex'), '8b466a60585f97c5b9230c9afe605a22cf9d206484c3bd680f01262f4757b2ee');
  assert.equal(patchWorker(base), release);
  assert.throws(() => patchWorker(release), /already patched/);
  // started before prewarm, which is before ready
  const start = release.indexOf('workerSecretEgress = await startWorkerSecretEgress(');
  assert(start > 0 && start < release.indexOf('let runtimePrewarm = { status: "disabled" };'));
  assert(release.indexOf('let workerSecretEgress;') < release.indexOf('process.on("message"'));
});

// A stand-in for dist/runtime-*.js: records what the native start saw and publishes a
// handle into the process registry the way 9.1 does.
function fakeRuntime(dir, calls) {
  const file = path.join(dir, 'runtime-Fake123.js');
  fs.writeFileSync(file, `
const KEY = Symbol.for("openclaw.secretEgressProxy.registry");
async function startGatewaySecretEgressProxy(params) {
  const seen = { stateDir: process.env.OPENCLAW_STATE_DIR, params };
  await new Promise((resolve) => setTimeout(resolve, 5));
  seen.stateDirAfterAwait = process.env.OPENCLAW_STATE_DIR;
  const calls = globalThis.__egressCalls;
  calls.push(["start", seen]);
  const handle = {
    proxyOrigin: "http://127.0.0.1:1",
    registerRun: (run) => { calls.push(["register", run.runId, run.instanceId]); return { HTTPS_PROXY: "http://p:t@127.0.0.1:1" }; },
    revokeRun: (run) => { calls.push(["revoke", run.runId, run.instanceId]); },
    stop: async () => { calls.push(["stop"]); },
  };
  (globalThis[KEY] ??= {}).activeProxy = handle;
  return handle;
}
export { startGatewaySecretEgressProxy };
`);
  globalThis.__egressCalls = calls;
  return file;
}

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-egress-'));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(path.join(dist, 'plugin-sdk'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'runtime-Other99.js'), 'export { somethingElse };\n');
  const calls = [];
  fakeRuntime(dist, calls);
  delete globalThis[REGISTRY_KEY];
  t.after(() => { delete globalThis[REGISTRY_KEY]; fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, dist, calls, state: path.join(dir, 'state'), agentRuntimePath: path.join(dist, 'plugin-sdk', 'agent-runtime.js') };
}
const enabled = { secrets: { egressProxy: { enabled: true, bypassHosts: ['bypass.example'] } } };

test('stays off unless the Worker config enables the proxy, and on the kill switch', async (t) => {
  const s = sandbox(t);
  for (const [config, env, status] of [
    [{}, {}, 'disabled-by-config'],
    [{ secrets: { egressProxy: { enabled: false } } }, {}, 'disabled-by-config'],
    [enabled, { OPENCLAW_WORKER_SECRET_EGRESS: '0' }, 'disabled-by-env'],
  ]) {
    const egress = await startWorkerSecretEgress({ agentRuntimePath: s.agentRuntimePath, config, env: { OPENCLAW_STATE_DIR: s.state, ...env } });
    assert.equal(egress.status, status);
    egress.revokeRun('r');
    egress.revokeAll();
  }
  assert.deepEqual(s.calls, []);
  assert.equal(globalThis[REGISTRY_KEY]?.activeProxy, undefined);
});

function withProcessStateDir(t, value) {
  const had = Object.hasOwn(process.env, 'OPENCLAW_STATE_DIR'), previous = process.env.OPENCLAW_STATE_DIR;
  if (value === undefined) delete process.env.OPENCLAW_STATE_DIR; else process.env.OPENCLAW_STATE_DIR = value;
  t.after(() => { if (had) process.env.OPENCLAW_STATE_DIR = previous; else delete process.env.OPENCLAW_STATE_DIR; });
}

test('starts the native proxy confined to this Worker and restores the state directory', async (t) => {
  const s = sandbox(t);
  withProcessStateDir(t, s.state);
  const env = process.env;
  const egress = await startWorkerSecretEgress({ agentRuntimePath: s.agentRuntimePath, config: enabled, pid: 4242 });
  assert.equal(egress.status, 'active');
  const [[, seen]] = s.calls;
  assert.equal(seen.stateDir, path.join(s.state, 'secret-egress-proxy-workers', '4242'));
  assert.equal(seen.stateDirAfterAwait, s.state, 'override must end with the synchronous start');
  assert.deepEqual(seen.params, { bypassHosts: ['bypass.example'] });
  assert.equal(env.OPENCLAW_STATE_DIR, s.state);
  assert.equal(fs.statSync(seen.stateDir).mode & 0o777, 0o700);
  // the Gateway's own proxy directory is never touched
  assert.equal(fs.existsSync(path.join(s.state, 'secret-egress-proxy')), false);
  await egress.stop();
  assert.equal(globalThis[REGISTRY_KEY].activeProxy, undefined);
  assert.equal(fs.existsSync(seen.stateDir), false);
});

test('an unset state directory stays unset after start', async (t) => {
  const s = sandbox(t);
  withProcessStateDir(t, undefined);
  const egress = await startWorkerSecretEgress({ agentRuntimePath: s.agentRuntimePath, config: enabled, env: { OPENCLAW_STATE_DIR: s.state }, pid: 4243 });
  assert.equal(Object.hasOwn(process.env, 'OPENCLAW_STATE_DIR'), false);
  assert.match(s.calls[0][1].stateDir, /secret-egress-proxy-workers\/4243$/u);
  await egress.stop();
});

test('revokes a run when its request ends and everything once no Agent request is left', async (t) => {
  const s = sandbox(t);
  const egress = await startWorkerSecretEgress({ agentRuntimePath: s.agentRuntimePath, config: enabled, env: { OPENCLAW_STATE_DIR: s.state }, pid: 4244 });
  const proxy = globalThis[REGISTRY_KEY].activeProxy;
  assert.equal(proxy, egress.proxy, 'exec must find the tracking wrapper');
  assert.deepEqual(proxy.registerRun({ runId: 'a', instanceId: '1' }, []), { HTTPS_PROXY: 'http://p:t@127.0.0.1:1' });
  proxy.registerRun({ runId: 'a', instanceId: '1' }, []);
  proxy.registerRun({ runId: 'b', instanceId: '2' }, []);
  proxy.registerRun({ runId: 'c', instanceId: '3' }, []);
  egress.revokeRun('a');
  egress.revokeRun('missing');
  assert.deepEqual(s.calls.filter((c) => c[0] === 'revoke'), [['revoke', 'a', '1']]);
  assert.equal(egress.report().activeRuns, 2);
  egress.revokeAll();
  assert.deepEqual(s.calls.filter((c) => c[0] === 'revoke').map((c) => c[1]), ['a', 'b', 'c']);
  assert.deepEqual({ ...egress.report(), ms: 0 }, { status: 'active', ms: 0, activeRuns: 0, registered: 3, revoked: 3, revokedUnmatched: 2 });
  await egress.stop();
});

test('does not replace a proxy this process already has', async (t) => {
  const s = sandbox(t);
  const existing = { registerRun() {} };
  globalThis[REGISTRY_KEY] = { activeProxy: existing };
  const egress = await startWorkerSecretEgress({ agentRuntimePath: s.agentRuntimePath, config: enabled, env: { OPENCLAW_STATE_DIR: s.state } });
  assert.equal(egress.status, 'already-active');
  assert.equal(globalThis[REGISTRY_KEY].activeProxy, existing);
  assert.deepEqual(s.calls, []);
});

test('removes directories of Workers that are gone and keeps live ones', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-egress-root-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const parent = path.join(dir, 'secret-egress-proxy-workers');
  fs.mkdirSync(path.join(parent, '2147483646'), { recursive: true });
  fs.mkdirSync(path.join(parent, String(process.ppid)), { recursive: true });
  fs.mkdirSync(path.join(parent, 'notes'), { recursive: true });
  const root = prepareWorkerProxyRoot(dir, 777001);
  assert.equal(root, path.join(parent, '777001'));
  assert.deepEqual(fs.readdirSync(parent).sort(), ['777001', String(process.ppid), 'notes'].sort());
});

test('finds the egress runtime by its export, not its hashed name', (t) => {
  const s = sandbox(t);
  assert.equal(resolveEgressRuntimePath(s.dist), path.join(s.dist, 'runtime-Fake123.js'));
  fs.copyFileSync(path.join(s.dist, 'runtime-Fake123.js'), path.join(s.dist, 'runtime-Fake456.js'));
  assert.throws(() => resolveEgressRuntimePath(s.dist), /resolve uniquely; found 2/u);
});
