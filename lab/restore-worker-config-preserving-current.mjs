// Restore the accepted VLab Worker route while retaining config added after the
// native execution experiment. This script is VLab-only and never contacts V.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chownSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { workerExecutionConfig } from './native-execution-config.mjs';

const owner = '01a07b32-72be-7fe0-85d4-00680ea01f4e';
const labs = '/srv/vlab-production-mirror/labs';
const base = labs + '/instances/db91-parity';
const unit = 'openclaw-vlab-production-mirror-v8.service';
const evidenceId = process.env.VLAB_WORKER_RESTORE_ID ?? 'system-agent-flash-20260911';
assert(/^[a-z0-9][a-z0-9-]{0,80}$/.test(evidenceId), 'Invalid Worker restore evidence id');
const evidenceDir = labs + '/control/' + evidenceId;
const originalPath = labs + '/control/native-execution-rollout-20260911/original-config.json';
const currentReleasePath = labs + '/shared-workflow/current.json';
const pendingPath = labs + '/shared-workflow/pending.json';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 60000 }).trim();
const pid = () => Number(run('systemctl', ['show', unit, '-p', 'MainPID', '--value']));
const read = (path) => JSON.parse(readFileSync(path));

assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(process.getuid(), 0);
assert.equal(read(labs + '/control/integration.json').owner, owner);
assert(!existsSync(pendingPath), 'Unresolved deployment journal');
const beforePid = pid();
assert(beforePid > 1, 'Shared VLab Gateway is not running');
const env = Object.fromEntries(readFileSync(`/proc/${beforePid}/environ`, 'utf8').split('\0').filter(Boolean).map((value) => {
  const at = value.indexOf('=');
  return [value.slice(0, at), value.slice(at + 1)];
}));
assert(env.OPENCLAW_CONFIG_PATH?.startsWith(base + '/state/'));
const configPath = env.OPENCLAW_CONFIG_PATH;
const beforeBytes = readFileSync(configPath);
const originalBytes = readFileSync(originalPath);
const before = JSON.parse(beforeBytes);
const original = JSON.parse(originalBytes);
const next = workerExecutionConfig(before, original, base);
const nextBytes = Buffer.from(JSON.stringify(next, null, 2) + '\n');
const beforeSha = sha256(beforeBytes);
const afterSha = sha256(nextBytes);
assert.notEqual(beforeSha, afterSha);

Object.assign(process.env, env);
const token = before.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, key) => {
  assert(env[key], `Missing Gateway token environment ${key}`);
  return env[key];
});
const { GatewayClient } = await import(base + '/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
let client;
async function connect() {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Gateway connect deadline')), 20000);
    client = new GatewayClient({
      url: 'ws://127.0.0.1:24993', token, deviceIdentity: null,
      clientName: 'cli', mode: 'cli', scopes: ['operator.read', 'operator.write', 'operator.admin'],
      onHelloOk() { clearTimeout(timer); resolve(); },
      onConnectError(error) { clearTimeout(timer); reject(error); },
    });
    client.start();
  });
}
const call = (method, params = {}) => client.request(method, params, { timeoutMs: 30000 });
function replace(path, bytes) {
  const stat = statSync(path);
  const temp = path + '.system-agent-flash-worker-restore-tmp';
  writeFileSync(temp, bytes, { flag: 'wx', mode: stat.mode });
  chmodSync(temp, stat.mode);
  chownSync(temp, stat.uid, stat.gid);
  renameSync(temp, path);
}
async function waitReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const health = JSON.parse(run('curl', ['-fsS', '--max-time', '5', 'http://127.0.0.1:24993/healthz']));
      if (health.ok === true) return;
    } catch {}
    await sleep(2000);
  }
  throw new Error('Gateway readiness deadline');
}

mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
const backupPath = evidenceDir + '/before-worker-restore.json';
const receiptPath = evidenceDir + '/worker-restore.json';
assert(!existsSync(backupPath) && !existsSync(receiptPath), 'Worker restore already attempted');
copyFileSync(configPath, backupPath);
chmodSync(backupPath, 0o600);
writeFileSync(evidenceDir + '/worker-restore-plan.json', JSON.stringify({
  owner, configPath, beforeSha, afterSha, release: read(currentReleasePath),
  preservedChannels: Object.keys(before.channels ?? {}), at: new Date().toISOString(),
}, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

await connect();
let stopped = false;
let switched = false;
let suspensionId;
try {
  const held = await call('gateway.suspend.prepare', {
    requestId: 'system-agent-flash-worker-restore-' + Date.now(),
    drain: true,
    terminalPolicy: 'preserve',
  });
  assert(held.suspensionId, 'Native suspension was not acquired');
  suspensionId = held.suspensionId;
  const deadline = Date.now() + 45000;
  let ready = false;
  while (Date.now() < deadline) {
    const status = await call('gateway.suspend.status', { suspensionId: held.suspensionId });
    if (status.status === 'ready' && status.expiresAtMs > Date.now()) {
      ready = true;
      break;
    }
    await sleep(1000);
  }
  assert(ready, 'Shared VLab did not drain');
  assert.equal(read(labs + '/control/integration.json').owner, owner);
  assert(!existsSync(pendingPath));
  assert.equal(pid(), beforePid, 'Gateway changed during drain');
  assert.equal(sha256(readFileSync(configPath)), beforeSha, 'Config drift during drain');
  run('systemctl', ['stop', unit]);
  stopped = true;
  assert.equal(pid(), 0);
  replace(configPath, nextBytes);
  switched = true;
  run('systemctl', ['start', unit]);
  stopped = false;
  client.stop();
  await waitReady(240000);
  await connect();
  const workers = await call('vlab.workers.status');
  assert.equal(workers.pending, 0);
  assert(workers.workers.length > 0 && workers.workers.every((worker) => worker.ready && !worker.activeCount && !worker.queued));
  assert.equal(sha256(readFileSync(configPath)), afterSha);
  const receipt = {
    owner, beforePid, afterPid: pid(), beforeSha, afterSha,
    workerCount: workers.workers.length, statePreserved: true,
    preservedChannels: Object.keys(next.channels ?? {}), at: new Date().toISOString(),
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(receipt));
} catch (error) {
  if (!switched && suspensionId && pid() === beforePid) {
    await call('gateway.suspend.resume', { suspensionId }).catch(() => {});
  }
  client?.stop();
  if (stopped) run('systemctl', ['start', unit]);
  if (switched) {
    run('systemctl', ['stop', unit]);
    replace(configPath, beforeBytes);
    run('systemctl', ['start', unit]);
    await waitReady(240000);
  }
  throw error;
} finally {
  client?.stop();
}
