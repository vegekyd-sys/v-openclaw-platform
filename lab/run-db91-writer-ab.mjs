// Shared-VLab-only A/B runner. It never delivers messages outside the Gateway.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

const [owner, variant, roundsArg = '2', concurrencyArg = '15'] = process.argv.slice(2);
const rounds = Number(roundsArg);
const concurrency = Number(concurrencyArg);
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert(owner && /^[\w-]+$/.test(owner), 'integration lease owner is required');
assert(['baseline', 'candidate'].includes(variant), 'variant must be baseline or candidate');
assert(Number.isInteger(rounds) && rounds >= 1 && rounds <= 4);
assert(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 15);

const unit = 'openclaw-vlab-production-mirror-v8.service';
const base = '/srv/vlab-production-mirror/labs/instances/db91-parity';
const control = '/srv/vlab-production-mirror/labs/control';
const expectedRelease = variant === 'baseline'
  ? 'db91-global-write-admission-v3'
  : 'db91-process-global-writer-v1';
const run = (bin, args) => execFileSync(bin, args, {encoding: 'utf8', timeout: 20_000}).trim();
const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const gatewayPid = () => Number(run('systemctl', ['show', unit, '-p', 'MainPID', '--value']));
function guard(pid) {
  assert.equal(readJson(control + '/integration.json').owner, owner, 'integration lease changed');
  assert.equal(gatewayPid(), pid, 'Gateway restarted during A/B case');
  assert(!fs.existsSync('/srv/vlab-production-mirror/labs/shared-workflow/pending.json'), 'pending VLab deployment');
  const disk = fs.statfsSync(base);
  assert(disk.bavail * disk.bsize >= 3 * 1024 ** 3, 'data-disk reserve below 3 GiB');
}

const pid = gatewayPid();
assert(pid > 1);
guard(pid);
const release = readJson('/srv/vlab-production-mirror/labs/shared-workflow/current.json').release;
assert.equal(release, expectedRelease, `unexpected ${variant} release`);
const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(value => value.includes('=')).map(value => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]));
Object.assign(process.env, env);
const configBytes = fs.readFileSync(env.OPENCLAW_CONFIG_PATH);
const config = JSON.parse(configBytes);
assert.equal(config.gateway.port, 24993);
const workerConfigPath = config.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath;
const workerConfigSha256 = sha256(fs.readFileSync(workerConfigPath));
const modelSpec = config.agents.entries.makaron.model ?? config.agents.defaults.model;
const model = typeof modelSpec === 'string' ? modelSpec : modelSpec.primary;
assert.equal(typeof model, 'string');
const cgroup = '/sys/fs/cgroup' + run('systemctl', ['show', unit, '-p', 'ControlGroup', '--value']);
const pageSize = 4096;

function processStat(processPid) {
  try {
    const status = fs.readFileSync(`/proc/${processPid}/status`, 'utf8');
    return {
      pid: processPid,
      rss: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) * 1024,
      rssAnon: Number(status.match(/^RssAnon:\s+(\d+)/m)?.[1] ?? 0) * 1024,
      swap: Number(status.match(/^VmSwap:\s+(\d+)/m)?.[1] ?? 0) * 1024,
    };
  } catch {
    return undefined;
  }
}

function sampleResources() {
  guard(pid);
  const children = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number);
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
  const sample = {
    at: Date.now(),
    memoryCurrent: Number(fs.readFileSync(cgroup + '/memory.current')),
    memorySwapCurrent: Number(fs.readFileSync(cgroup + '/memory.swap.current')),
    gatewayRss: Number(stat[21]) * pageSize,
    processes: [pid, ...children].map(processStat).filter(Boolean),
  };
  assert(sample.memoryCurrent < 12.5 * 1024 ** 3, 'VLab memory safety stop');
  return sample;
}

const {GatewayClient} = await import(base + '/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
let client;
const terminalWaiters = new Map();
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Gateway connection deadline')), 20_000);
  client = new GatewayClient({
    url: 'ws://127.0.0.1:24993',
    token: config.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, key) => env[key]),
    deviceIdentity: null,
    clientName: 'cli',
    mode: 'cli',
    caps: ['tool-events'],
    scopes: ['operator.read', 'operator.write', 'operator.admin'],
    onEvent(event) {
      if (event.event !== 'chat' || !['final', 'error', 'aborted'].includes(event.payload?.state)) return;
      terminalWaiters.get(event.payload.runId)?.(event.payload);
    },
    onHelloOk() { clearTimeout(timer); resolve(); },
    onConnectError(error) { clearTimeout(timer); reject(error); },
  });
  client.start();
});
const call = (method, params = {}, timeoutMs = 20_000) => client.request(method, params, {timeoutMs});
async function assertIdle() {
  const status = await call('vlab.workers.status');
  assert(!status.pending && status.workers.every(worker => !worker.activeCount && !worker.queued && !worker.detachedTaskCount), 'shared VLab is busy');
}

const rows = [];
const health = [];
const resources = [];
const runtimeErrors = [];
let sampling = true;
let startedAt;
let failure;
const sampler = (async () => {
  while (sampling) {
    const at = Date.now();
    try {
      const state = await call('health', {}, 5_000);
      if (startedAt) health.push({at, latencyMs: Date.now() - at, eventLoop: state.eventLoop});
    } catch (error) {
      if (startedAt) health.push({at, latencyMs: Date.now() - at, error: String(error.message).slice(0, 200)});
    }
    try {
      const resourceSample = sampleResources();
      if (startedAt) resources.push(resourceSample);
    } catch (error) {
      failure ??= {name: error.name, message: String(error.message).slice(0, 300)};
      sampling = false;
      break;
    }
    await sleep(250);
  }
})();

try {
  await assertIdle();
  // Equal warm-up keeps module loading and first Worker startup outside both measurements.
  const warmKey = `agent:makaron:explicit:db91-ab-warm-${variant}-${Date.now()}`;
  const warmId = randomUUID();
  await call('sessions.patch', {key: warmKey, agentId: 'makaron', model});
  await call('chat.send', {agentId: 'makaron', sessionKey: warmKey, message: 'VLab A/B 预热，只回复“预热完成”。', deliver: false, idempotencyKey: warmId, timeoutMs: 120_000}, 130_000);
  await sleep(5_000);
  await assertIdle();
  startedAt = Date.now();
  for (let round = 0; round < rounds; round += 1) {
    const batch = [];
    for (let index = 0; index < concurrency; index += 1) {
      const marker = `DB91_AB_${variant}_${round}_${index}_${startedAt}`;
      const row = {
        round,
        index,
        marker,
        id: randomUUID(),
        key: `agent:makaron:explicit:db91-ab-${variant}-${startedAt}-${round}-${index}`,
      };
      rows.push(row);
      await call('sessions.patch', {key: row.key, agentId: 'makaron', model});
      batch.push(row);
    }
    await Promise.all(batch.map(async row => {
      row.startedAt = Date.now();
      const syntheticContext = '这是无敏感信息的 VLab 合成上下文，只用于内存与并发测试。\n'.repeat(1_500);
      let resolveTerminal;
      const terminal = new Promise(resolve => { resolveTerminal = resolve; });
      terminalWaiters.set(row.id, resolveTerminal);
      try {
        await call('chat.send', {
          agentId: 'makaron',
          sessionKey: row.key,
          message: `${syntheticContext}\n只回复 ${row.marker}，不调用工具。`,
          deliver: false,
          idempotencyKey: row.id,
          timeoutMs: 180_000,
        }, 190_000);
        const event = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('terminal event deadline')), 180_000);
          terminal.then(value => { clearTimeout(timer); resolve(value); }, reject);
        });
        if (event.state !== 'final') throw new Error(`terminal state ${event.state}: ${event.errorMessage ?? ''}`);
        let history;
        const persistenceDeadline = Date.now() + 20_000;
        do {
          history = await call('chat.history', {agentId: 'makaron', sessionKey: row.key, limit: 5});
          if (history.sessionInfo?.status === 'done' && history.sessionInfo?.hasActiveRun === false && history.sessionInfo?.lastRunId === row.id) break;
          await sleep(1_000);
        } while (Date.now() < persistenceDeadline);
        const assistant = history.messages?.filter(message => message.role === 'assistant').at(-1);
        const text = assistant?.content?.filter(part => part.type === 'text').map(part => part.text).join('\n') ?? '';
        row.terminal = text.includes(row.marker) ? 'final' : 'invalid-body';
        row.persisted = history.sessionInfo?.status === 'done' && history.sessionInfo?.hasActiveRun === false && history.sessionInfo?.lastRunId === row.id;
        row.totalMs = Date.now() - row.startedAt;
      } catch (error) {
        row.terminal = 'error';
        row.error = String(error.message).slice(0, 240);
        row.totalMs = Date.now() - row.startedAt;
      } finally {
        terminalWaiters.delete(row.id);
      }
    }));
    if (failure) throw new Error(failure.message);
    await assertIdle();
  }
  // Capture whether anonymous memory returns after the same bounded cooldown.
  await sleep(30_000);
  const journal = execFileSync('journalctl', ['-u', unit, '--since', new Date(startedAt - 1_000).toISOString(), '-o', 'json', '--no-pager'], {encoding: 'utf8', maxBuffer: 64 * 1024 ** 2});
  for (const line of journal.split('\n')) {
    if (!line) continue;
    let message;
    try { message = JSON.parse(line).MESSAGE ?? ''; } catch { continue; }
    const kind = [
      'database is locked',
      'SQLite session write failed',
      'SQLite automatic session maintenance failed',
      'session transcript reconcile failed',
      'slow direct Agent DB process writer admission',
      'Worker stream acknowledgement timed out',
      'terminal session persistence failed',
      'webchat dispatch failed',
    ].find(candidate => message.includes(candidate));
    if (kind) runtimeErrors.push({kind, databaseLocked: /database is locked|SQLITE_BUSY/i.test(message)});
  }
} catch (error) {
  failure ??= {name: error.name, message: String(error.message).slice(0, 300)};
} finally {
  sampling = false;
  await sampler;
  client?.stop();
}

const result = {
  version: 1,
  variant,
  release,
  configSha256: sha256(configBytes),
  workerConfigSha256,
  model,
  rounds,
  concurrency,
  startedAt,
  finishedAt: Date.now(),
  rows,
  health,
  resources,
  runtimeErrors,
  ...(failure ? {failure} : {}),
};
const output = `${control}/db91-writer-ab-${variant}-${startedAt}.json`;
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({output, variant, release, rounds, concurrency, rows: rows.length, healthSamples: health.length, resourceSamples: resources.length, runtimeErrors: runtimeErrors.length}));
if (failure) {
  console.error(JSON.stringify({failure, output}));
  process.exitCode = 1;
}
