// Functional acceptance for the deployed VLab-only System Agent candidate.
// It creates one dedicated OpenClaw session and declines the restart proposal.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const owner = '01a07b32-72be-7fe0-85d4-00680ea01f4e';
const labs = '/srv/vlab-production-mirror/labs';
const base = labs + '/instances/db91-parity';
const unit = 'openclaw-vlab-production-mirror-v8.service';
const releaseId = 'system-agent-flash-20260911-v2';
const targetSha = '11a127d159f836d09941eaf0abd760535d336d91c7a51ebee7a53fd8da5443d0';
const targetPath = base + '/runtime/openclaw/dist/inference-route-Bv_D48Z8.js';
const evidenceDir = labs + '/control/system-agent-flash-20260911';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const read = (path) => JSON.parse(readFileSync(path));
const pid = () => Number(execFileSync(
  'systemctl', ['show', unit, '-p', 'MainPID', '--value'], { encoding: 'utf8' },
).trim());

assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(process.getuid(), 0);
assert.equal(read(labs + '/control/integration.json').owner, owner);
assert(!existsSync(labs + '/shared-workflow/pending.json'));
const current = read(labs + '/shared-workflow/current.json');
assert.equal(current.release, releaseId);
assert.equal(current.accepted, false);
assert.equal(sha256(readFileSync(targetPath)), targetSha);
const gatewayPid = pid();
assert(gatewayPid > 1);
const env = Object.fromEntries(readFileSync(`/proc/${gatewayPid}/environ`, 'utf8').split('\0').filter(Boolean).map((value) => {
  const at = value.indexOf('=');
  return [value.slice(0, at), value.slice(at + 1)];
}));
assert(env.OPENCLAW_CONFIG_PATH?.startsWith(base + '/state/'));
const config = read(env.OPENCLAW_CONFIG_PATH);
assert.equal(config.gateway.port, 24993);
assert.equal(config.agents.defaults.model.primary, 'deepseek/deepseek-flash');
assert.deepEqual(config.agents.defaults.model.fallbacks, []);
assert.equal(config.agents.defaults.models['deepseek/deepseek-flash'].agentRuntime.id, 'vlab-worker');
assert.equal(config.plugins.entries['vlab-agent-worker-isolation'].enabled, true);
assert(config.plugins.load.paths.includes(base + '/runtime/production-worker'));

Object.assign(process.env, env);
const token = config.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, key) => {
  assert(env[key], `Missing Gateway token environment ${key}`);
  return env[key];
});
const { GatewayClient } = await import(base + '/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
let client;
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Gateway connect deadline')), 20000);
  client = new GatewayClient({
    url: 'ws://127.0.0.1:24993', token, deviceIdentity: null,
    clientName: 'cli', mode: 'cli', scopes: ['operator.read', 'operator.write', 'operator.admin'],
    onHelloOk() { clearTimeout(timer); resolve(); },
    onConnectError(error) { clearTimeout(timer); reject(error); },
  });
  client.start();
});
const call = (method, params = {}, timeoutMs = 240000) => client.request(method, params, { timeoutMs });
const workerSummary = (status) => ({
  pending: status.pending,
  workers: status.workers.map((worker) => ({
    pid: worker.pid, ready: worker.ready, activeCount: worker.activeCount,
    queued: worker.queued, assignedSessions: worker.assignedSessions,
  })),
  admitted: status.integration.nativeHarnessStats.admitted,
  completed: status.integration.nativeHarnessStats.completed,
  failed: status.integration.nativeHarnessStats.failed,
});

const startedAt = new Date().toISOString();
const beforeWorkers = await call('vlab.workers.status');
assert.equal(beforeWorkers.pending, 0);
assert(beforeWorkers.workers.every((worker) => worker.ready && !worker.activeCount && !worker.queued));
const verifyStarted = Date.now();
const verify = await call('openclaw.setup.verify', { agentId: 'makaron' });
const verifyMs = Date.now() - verifyStarted;
assert.equal(verify.ok, true);
assert.equal(verify.modelRef, 'deepseek/deepseek-flash');
const sessionId = 'vlab-system-agent-flash-' + Date.now();
const replyStarted = Date.now();
const benign = await call('openclaw.chat', {
  sessionId,
  reset: true,
  message: '这是 VLab 验收。请用一句中文说明你是 OpenClaw 配置助手；不要读取隐私、修改配置、调用工具或重启。',
});
const replyMs = Date.now() - replyStarted;
assert.equal(benign.sessionId, sessionId);
assert.equal(benign.action, 'none');
assert(typeof benign.reply === 'string' && /[\u3400-\u9fff]/u.test(benign.reply));
assert.equal(pid(), gatewayPid);

const restart = await call('openclaw.chat', { sessionId, message: 'restart gateway' });
assert.equal(restart.sessionId, sessionId);
assert.equal(restart.action, 'none');
assert.match(restart.reply, /(restart|重启|gateway|网关|confirm|确认|approve|批准)/i);
await sleep(2000);
assert.equal(pid(), gatewayPid, 'Restart ran before approval');
const decline = await call('openclaw.chat', { sessionId, message: 'no' });
assert.equal(decline.sessionId, sessionId);
assert.equal(decline.action, 'none');
await sleep(2000);
assert.equal(pid(), gatewayPid, 'Declining the proposal restarted Gateway');

const afterWorkers = await call('vlab.workers.status');
assert.equal(afterWorkers.pending, 0);
assert(afterWorkers.workers.every((worker) => worker.ready && !worker.activeCount && !worker.queued));
assert.equal(afterWorkers.integration.nativeHarnessStats.admitted, beforeWorkers.integration.nativeHarnessStats.admitted,
  'System Agent unexpectedly entered the Worker harness');
assert.equal(afterWorkers.integration.nativeHarnessStats.failed, beforeWorkers.integration.nativeHarnessStats.failed);
const receipt = {
  releaseId, targetSha, startedAt, finishedAt: new Date().toISOString(),
  gatewayPid, verify: { ok: verify.ok, modelRef: verify.modelRef, latencyMs: verify.latencyMs, wallMs: verifyMs },
  benign: { reply: benign.reply, action: benign.action, wallMs: replyMs },
  restart: { reply: restart.reply, action: restart.action, pidUnchanged: true },
  decline: { reply: decline.reply, action: decline.action, pidUnchanged: true },
  beforeWorkers: workerSummary(beforeWorkers),
  afterWorkers: workerSummary(afterWorkers),
};
mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
const output = evidenceDir + '/functional-acceptance-' + Date.now() + '.json';
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output, ...receipt }));
client.stop();
