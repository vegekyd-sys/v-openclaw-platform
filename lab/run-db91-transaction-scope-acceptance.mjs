// Shared-VLab-only A/B: five existing Workers, no outward delivery.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

const [owner, variant, label = `db91-scope-${variant}`] = process.argv.slice(2);
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert(owner && /^[\w-]+$/.test(owner));
assert(['baseline', 'candidate'].includes(variant));
assert(/^[a-z0-9-]+$/.test(label));

const unit = 'openclaw-vlab-production-mirror-v8.service';
const base = '/srv/vlab-production-mirror/labs/instances/db91-parity';
const control = '/srv/vlab-production-mirror/labs/control';
const run = (bin, args) => execFileSync(bin, args, {encoding: 'utf8', timeout: 20_000}).trim();
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const q = (values, fraction) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] : null;
const gatewayPid = () => Number(run('systemctl', ['show', unit, '-p', 'MainPID', '--value']));
const pid = gatewayPid();
assert(pid > 1);

function guard() {
  assert.equal(readJson(control + '/integration.json').owner, owner, 'integration lease changed');
  assert.equal(gatewayPid(), pid, 'Gateway restarted during A/B case');
  assert(!fs.existsSync('/srv/vlab-production-mirror/labs/shared-workflow/pending.json'), 'pending VLab deployment');
  const disk = fs.statfsSync(base);
  assert(disk.bavail * disk.bsize >= 3 * 1024 ** 3, 'data-disk reserve below 3 GiB');
}

guard();
const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(value => value.includes('=')).map(value => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]));
Object.assign(process.env, env);
const configBytes = fs.readFileSync(env.OPENCLAW_CONFIG_PATH);
const config = JSON.parse(configBytes);
assert.equal(config.gateway.port, 24993);
const workerConfigPath = config.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath;
const workerConfigBytes = fs.readFileSync(workerConfigPath);
const workerConfig = JSON.parse(workerConfigBytes);
const modelSpec = config.agents.entries.makaron.model ?? config.agents.defaults.model;
const model = typeof modelSpec === 'string' ? modelSpec : modelSpec.primary;
const [provider, ...modelParts] = model.split('/');
const modelName = modelParts.join('/');
assert(provider && modelName);
const agentDatabasePath = env.OPENCLAW_STATE_DIR + '/agents/makaron/agent/openclaw-agent.sqlite';
assert(fs.statSync(agentDatabasePath).isFile());
const cgroup = '/sys/fs/cgroup' + run('systemctl', ['show', unit, '-p', 'ControlGroup', '--value']);
const release = readJson('/srv/vlab-production-mirror/labs/shared-workflow/current.json');
const holderWaitMs = 4_000;

const {GatewayClient} = await import(base + '/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
const rows = [];
const byId = new Map();
const health = [];
const resources = [];
let client;
let sampling = false;
let sampler;

function sampleResources() {
  guard();
  const memoryCurrent = Number(fs.readFileSync(cgroup + '/memory.current'));
  assert(memoryCurrent < 12.5 * 1024 ** 3, 'VLab memory safety stop');
  return {at: Date.now(), memoryCurrent, memorySwapCurrent: Number(fs.readFileSync(cgroup + '/memory.swap.current'))};
}

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
      const row = byId.get(event.payload?.runId);
      if (!row?.startedAt) return;
      const now = Date.now();
      if (event.event === 'agent' && event.payload?.stream === 'assistant' && String(event.payload.data?.text ?? event.payload.data?.delta ?? '').trim() && !row.firstTextMs) row.firstTextMs = now - row.startedAt;
      if (event.event === 'chat' && ['final', 'error', 'aborted'].includes(event.payload?.state)) {
        row.terminal = event.payload.state;
        row.totalMs = now - row.startedAt;
        if (row.terminal === 'error') row.error = String(event.payload?.errorMessage ?? '').slice(0, 240);
      }
    },
    onHelloOk() { clearTimeout(timer); resolve(); },
    onConnectError(error) { clearTimeout(timer); reject(error); },
  });
  client.start();
});
const call = (method, params = {}, timeoutMs = 20_000) => client.request(method, params, {timeoutMs});
async function workerState() {
  const state = await call('vlab.workers.status');
  assert.equal(state.pending, 0);
  return state;
}
async function idle() {
  const state = await workerState();
  assert.equal(state.workers.length, 5, 'acceptance requires exactly five resident Workers');
  assert(state.workers.every(worker => !worker.activeCount && !worker.queued && !worker.detachedTaskCount), 'shared VLab is busy');
}
async function waitForTerminal(row, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (!row.terminal && Date.now() < deadline) await sleep(100);
  assert(row.terminal, `terminal deadline for ${row.id}`);
}

let holder;
let startedAt;
let failure;
const runtimeErrors = [];
const sampleWhileActive = async () => {
  while (sampling) {
    const at = Date.now();
    try {
      const state = await call('health', {}, 5_000);
      const workers = await workerState();
      health.push({at, latencyMs: Date.now() - at, eventLoop: state.eventLoop, workerCount: workers.workers.length});
      resources.push(sampleResources());
      assert(workers.workers.length <= 5, 'Worker count exceeded five');
    } catch (error) {
      health.push({at, latencyMs: Date.now() - at, error: String(error.message).slice(0, 200)});
    }
    await sleep(250);
  }
};

try {
  await idle();
  const warm = {id: randomUUID(), key: `agent:makaron:explicit:${label}-warm-${Date.now()}`};
  byId.set(warm.id, warm);
  await call('sessions.patch', {key: warm.key, agentId: 'makaron', model});
  await call('sessions.messages.subscribe', {agentId: 'makaron', key: warm.key});
  warm.startedAt = Date.now();
  await call('chat.send', {agentId: 'makaron', sessionKey: warm.key, message: 'VLab 预热，只回复“预热完成”。', deliver: false, thinking: 'low', idempotencyKey: warm.id, timeoutMs: 120_000}, 130_000);
  await waitForTerminal(warm);
  assert.equal(warm.terminal, 'final');
  byId.delete(warm.id);
  await idle();

  const stamp = Date.now();
  for (let index = 0; index < 5; index += 1) {
    const row = {index, id: randomUUID(), key: `agent:makaron:explicit:${label}-${stamp}-${index}`};
    await call('sessions.patch', {key: row.key, agentId: 'makaron', model});
    await call('sessions.messages.subscribe', {agentId: 'makaron', key: row.key});
    rows.push(row);
    byId.set(row.id, row);
  }

  const readyPath = `${control}/.${label}-holder-${stamp}.ready`;
  const holderCode = `import fs from 'node:fs';import {setTimeout as sleep} from 'node:timers/promises';const {p:runExclusive}=await import(${JSON.stringify(base + '/runtime/openclaw/dist/session-accessor.sqlite-scope-BwPKGcgm.js')});const startedAt=Date.now();await runExclusive({agentId:'makaron',path:process.argv[1],sessionKey:'agent:makaron:explicit:db91-scope-holder'},async()=>{fs.writeFileSync(process.argv[2],'ready',{flag:'wx',mode:0o600});await sleep(Number(process.argv[3]))});process.stdout.write(JSON.stringify({startedAt,finishedAt:Date.now()}));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', holderCode, agentDatabasePath, readyPath, String(holderWaitMs)], {env: process.env, stdio: ['ignore', 'pipe', 'pipe']});
  let holderOut = '', holderErr = '';
  child.stdout.on('data', chunk => { holderOut += chunk; });
  child.stderr.on('data', chunk => { holderErr += chunk; });
  const holderResult = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(JSON.parse(holderOut)) : reject(new Error(`holder exit ${code}: ${holderErr.slice(-500)}`)));
  });
  holder = {child, readyPath, result: holderResult};
  const readyDeadline = Date.now() + 20_000;
  while (!fs.existsSync(readyPath) && Date.now() < readyDeadline) await sleep(20);
  assert(fs.existsSync(readyPath), `holder did not enter scope: ${holderErr.slice(-500)}`);

  startedAt = Date.now();
  sampling = true;
  sampler = sampleWhileActive();
  await Promise.all(rows.map(async row => {
    row.startedAt = Date.now();
    await call('chat.send', {
      agentId: 'makaron',
      sessionKey: row.key,
      message: `这是 VLab 五 Worker 首字验收。只回复 DB91_SCOPE_${variant}_${row.index}_${stamp}，不调用工具。`,
      deliver: false,
      thinking: 'low',
      idempotencyKey: row.id,
      timeoutMs: 120_000,
    }, 130_000);
  }));
  await Promise.all(rows.map(row => waitForTerminal(row)));
  const holderTiming = await holderResult;
  holder.timing = holderTiming;
  sampling = false;
  await sampler;

  for (const row of rows) {
    assert.equal(row.terminal, 'final');
    const history = await call('chat.history', {agentId: 'makaron', sessionKey: row.key, limit: 5});
    const assistant = history.messages?.filter(message => message.role === 'assistant').at(-1);
    const body = assistant?.content?.filter(part => part.type === 'text').map(part => part.text).join('\n') ?? '';
    row.bodyOk = body.includes(`DB91_SCOPE_${variant}_${row.index}_${stamp}`);
    row.persisted = history.sessionInfo?.status === 'done' && history.sessionInfo?.lastRunId === row.id && history.sessionInfo?.hasActiveRun === false;
    row.provider = assistant?.provider;
    row.model = assistant?.model;
    assert.equal(row.provider, provider);
    assert.equal(row.model, modelName);
    assert(row.bodyOk && row.persisted && Number.isFinite(row.firstTextMs));
  }

  const journal = execFileSync('journalctl', ['-u', unit, '--since', new Date(startedAt - 1_000).toISOString(), '-o', 'json', '--no-pager'], {encoding: 'utf8', maxBuffer: 64 * 1024 ** 2});
  for (const line of journal.split('\n')) {
    if (!line) continue;
    let message;
    try { message = JSON.parse(line).MESSAGE ?? ''; } catch { continue; }
    const kind = ['database is locked', 'Agent DB process coordinator wait exceeded', 'SQLite session write failed', 'session transcript reconcile failed', 'Worker stream acknowledgement timed out', 'terminal session persistence failed', 'webchat dispatch failed'].find(candidate => message.includes(candidate));
    if (kind) runtimeErrors.push({kind, message: message.slice(0, 300)});
  }
  await idle();
} catch (error) {
  failure = {name: error.name, message: String(error.message).slice(0, 500)};
} finally {
  sampling = false;
  if (sampler) await sampler;
  if (holder?.child.exitCode === null && holder.child.signalCode === null) holder.child.kill('SIGTERM');
  if (holder?.readyPath && fs.existsSync(holder.readyPath)) fs.unlinkSync(holder.readyPath);
  for (const row of rows) if (row.startedAt && !row.terminal) await call('chat.abort', {agentId: 'makaron', sessionKey: row.key, runId: row.id}).catch(() => {});
  client?.stop();
}

const eventLoopP50 = health.map(sample => sample.eventLoop?.delayP50Ms).filter(Number.isFinite);
const eventLoopP99 = health.map(sample => sample.eventLoop?.delayP99Ms).filter(Number.isFinite);
const firstText = rows.map(row => row.firstTextMs).filter(Number.isFinite);
const total = rows.map(row => row.totalMs).filter(Number.isFinite);
const summary = {
  variant,
  label,
  release,
  model,
  count: 5,
  holderWaitMs,
  configSha256: sha256(configBytes),
  workerConfigSha256: sha256(workerConfigBytes),
  configuredMinWorkers: config.plugins.entries['vlab-agent-worker-isolation'].config.minWorkers,
  completed: rows.filter(row => row.terminal === 'final').length,
  persisted: rows.filter(row => row.persisted).length,
  firstTextP50Ms: q(firstText, 0.5),
  firstTextP95Ms: q(firstText, 0.95),
  totalP95Ms: q(total, 0.95),
  eventLoopP50P95Ms: q(eventLoopP50, 0.95),
  eventLoopP99MedianMs: q(eventLoopP99, 0.5),
  eventLoopP99P95Ms: q(eventLoopP99, 0.95),
  eventLoopP99MaxMs: q(eventLoopP99, 1),
  healthErrors: health.filter(sample => sample.error).length,
  runtimeErrors: runtimeErrors.length,
  memoryPeak: q(resources.map(sample => sample.memoryCurrent), 1),
  memoryGrowth: resources.length > 1 ? resources.at(-1).memoryCurrent - resources[0].memoryCurrent : null,
  ...(failure ? {failure} : {}),
};
const output = `${control}/${label}-${Date.now()}.json`;
fs.writeFileSync(output, JSON.stringify({summary, rows, health, resources, runtimeErrors, holder: holder?.timing ?? null}, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({output, ...summary}));
if (failure || summary.completed !== 5 || summary.persisted !== 5 || summary.runtimeErrors !== 0 || summary.healthErrors !== 0) process.exitCode = 1;
