// Small production-only load test. Dedicated sessions, deliver:false, no tools.
import assert from 'node:assert/strict';
import crypto, {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {newRelease, releaseId} from './db91-process-global-writer-production-plan.mjs';

assert.equal(os.hostname(), 'VM-8-2-ubuntu');
assert.equal(process.getuid(), 0);

const unit = 'openclaw-gateway.service';
const root = '/home/openclaw/.openclaw';
const outputDirectory = `${root}/backups/${releaseId}`;
const run = (command, args, options = {}) => execFileSync(command, args, {
  encoding: 'utf8', timeout: 30_000, ...options,
}).trim();
const gatewayPid = Number(run('systemctl', ['show', unit, '-p', 'MainPID', '--value']));
assert(gatewayPid > 1);
const environment = Object.fromEntries(fs.readFileSync(`/proc/${gatewayPid}/environ`, 'utf8').split('\0').filter(Boolean).map((entry) => {
  const index = entry.indexOf('=');
  return [entry.slice(0, index), entry.slice(index + 1)];
}));
Object.assign(process.env, environment);
assert.equal(environment.V_RELEASE_VERSION, releaseId);
const configPath = environment.OPENCLAW_CONFIG_PATH ?? `${root}/openclaw.json`;
const configBytes = fs.readFileSync(configPath);
const config = JSON.parse(configBytes);
const configSha256 = crypto.createHash('sha256').update(configBytes).digest('hex');
const token = config.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, key) => {
  assert(environment[key]);
  return environment[key];
});
const cgroup = `/sys/fs/cgroup${run('systemctl', ['show', unit, '-p', 'ControlGroup', '--value'])}`;
const counters = (file) => Object.fromEntries(fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => {
  const [key, value] = line.split(/\s+/);
  return [key, Number(value)];
}));
const resources = () => ({
  at: Date.now(),
  memoryCurrent: Number(fs.readFileSync(`${cgroup}/memory.current`, 'utf8')),
  memorySwapCurrent: Number(fs.readFileSync(`${cgroup}/memory.swap.current`, 'utf8')),
  memoryEvents: counters(`${cgroup}/memory.events`),
});
const text = (message) => typeof message?.content === 'string'
  ? message.content
  : (message?.content ?? []).filter((part) => part?.type === 'text').map((part) => part.text).join('\n');
const quantile = (values, q) => {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))];
};

const stamp = Date.now();
const output = `${outputDirectory}/process-global-writer-stress-${stamp}.json`;
const report = {
  version: 1,
  releaseId,
  gatewayPid,
  configSha256,
  startedAt: new Date(stamp).toISOString(),
  cohorts: [],
  health: [],
  resources: [],
  completed: false,
};
const persist = () => fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, {mode: 0o600});
persist();

const {GatewayClient} = await import(`${newRelease}/core/dist/plugin-sdk/gateway-runtime.js`);
const tracked = new Map();
let client;
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Gateway connection deadline')), 20_000);
  client = new GatewayClient({
    url: 'ws://127.0.0.1:22793', token, deviceIdentity: null, clientName: 'cli', mode: 'cli',
    caps: ['tool-events'], scopes: ['operator.read', 'operator.write', 'operator.admin'],
    onHelloOk: () => { clearTimeout(timer); resolve(); },
    onConnectError: (error) => { clearTimeout(timer); reject(error); },
    onEvent: (event) => {
      const job = tracked.get(event.payload?.runId);
      if (!job) return;
      if (event.event === 'agent' && event.payload.stream === 'assistant' && event.payload.data?.text?.trim()) {
        job.firstTextMs ??= Date.now() - job.startedAt;
      }
      if (event.event === 'chat' && ['final', 'error', 'aborted'].includes(event.payload.state)) {
        job.terminalState = event.payload.state;
        job.finalMs = Date.now() - job.startedAt;
        job.resolveTerminal(event.payload);
      }
    },
  });
  client.start();
});
const call = (method, params = {}, timeoutMs = 30_000) => client.request(method, params, {timeoutMs});
const compactStatus = async () => {
  const status = await call('vlab.workers.status');
  return {
    minWorkers: status.minWorkers,
    maxWorkers: status.maxWorkers,
    sessionsPerWorker: status.sessionsPerWorker,
    workers: status.workers.length,
    readyWorkers: status.workers.filter((worker) => worker.ready).length,
    active: status.workers.reduce((sum, worker) => sum + worker.activeCount, 0),
    queued: status.workers.reduce((sum, worker) => sum + (worker.queued ?? 0), 0),
    pending: status.pending,
  };
};
const assertIdle = async () => {
  const status = await compactStatus();
  assert.equal(status.pending, 0);
  assert.equal(status.active, 0);
  assert.equal(status.queued, 0);
  assert.equal(status.minWorkers, 5);
  assert.equal(status.maxWorkers, 15);
  assert.equal(status.sessionsPerWorker, 3);
  assert(status.readyWorkers >= 5);
  return status;
};

async function runCohort(count) {
  const cohort = {count, startedAt: Date.now(), rows: []};
  report.cohorts.push(cohort);
  for (let index = 0; index < count; index += 1) {
    cohort.rows.push({
      index,
      marker: `DB91_PROD_${count}_${index}_${stamp}_${randomUUID().replaceAll('-', '')}`,
      runId: randomUUID(),
      sessionKey: `agent:makaron:explicit:db91-prod-writer-${stamp}-${count}-${index}`,
    });
  }
  await Promise.all(cohort.rows.map(async (job) => {
    job.startedAt = Date.now();
    const terminal = new Promise((resolve) => { job.resolveTerminal = resolve; });
    tracked.set(job.runId, job);
    try {
      const response = await call('chat.send', {
        agentId: 'makaron',
        sessionKey: job.sessionKey,
        message: `这是 OpenClaw 9.1 DB writer 小型压测。不要调用工具，只回复 ${job.marker}`,
        thinking: 'low',
        deliver: false,
        idempotencyKey: job.runId,
        timeoutMs: 180_000,
      }, 190_000);
      assert.equal(response.runId, job.runId);
      const event = await Promise.race([
        terminal,
        sleep(180_000).then(() => { throw new Error('Terminal event deadline'); }),
      ]);
      assert.equal(event.state, 'final');
      const deadline = Date.now() + 20_000;
      let history;
      do {
        history = await call('chat.history', {agentId: 'makaron', sessionKey: job.sessionKey, limit: 10});
        const last = history.messages?.filter((message) => message.role === 'assistant').at(-1);
        if (history.sessionInfo?.hasActiveRun === false && text(last).includes(job.marker)) break;
        await sleep(500);
      } while (Date.now() < deadline);
      const last = history.messages?.filter((message) => message.role === 'assistant').at(-1);
      job.persisted = history.sessionInfo?.hasActiveRun === false && text(last).includes(job.marker);
      assert(job.persisted, 'Final reply was not persisted');
      job.model = last.model;
    } catch (error) {
      job.error = String(error?.message ?? error).slice(0, 300);
    } finally {
      delete job.resolveTerminal;
      tracked.delete(job.runId);
      persist();
    }
  }));
  cohort.finishedAt = Date.now();
  cohort.statusAfter = await assertIdle();
  const firstText = cohort.rows.map((row) => row.firstTextMs);
  cohort.firstTextMs = {
    median: quantile(firstText, 0.5),
    p95: quantile(firstText, 0.95),
    max: quantile(firstText, 1),
  };
  assert(cohort.rows.every((row) => row.persisted && !row.error));
  persist();
}

let sampling = true;
let sampler;
try {
  report.statusBefore = await assertIdle();
  report.resourceBefore = resources();
  sampler = (async () => {
    while (sampling) {
      const at = Date.now();
      try {
        const health = await call('health', {}, 5_000);
        report.health.push({at, latencyMs: Date.now() - at, eventLoop: health.eventLoop});
      } catch (error) {
        report.health.push({at, latencyMs: Date.now() - at, error: String(error?.message ?? error).slice(0, 200)});
      }
      const sample = resources();
      report.resources.push(sample);
      if (sample.memoryCurrent >= 32 * 1024 ** 3) {
        report.safetyStop = 'memoryCurrent reached 32 GiB';
        sampling = false;
        for (const job of tracked.values()) await call('chat.abort', {sessionKey: job.sessionKey, runId: job.runId}).catch(() => {});
        break;
      }
      persist();
      await sleep(500);
    }
  })();
  await runCohort(5);
  assert(!report.safetyStop);
  await runCohort(10);
  assert(!report.safetyStop);
  sampling = false;
  await sampler;
  report.resourceAfter = resources();
  report.statusAfter = await assertIdle();
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(configPath)).digest('hex'), configSha256);
  assert.equal(Number(run('systemctl', ['show', unit, '-p', 'MainPID', '--value'])), gatewayPid);
  const journal = run('journalctl', ['-u', unit, '--since', new Date(stamp - 1_000).toISOString(), '--no-pager', '-o', 'cat'], {maxBuffer: 64 * 1024 ** 2});
  report.journal = {
    databaseLocked: (journal.match(/database is locked|SQLITE_BUSY/gi) ?? []).length,
    coordinatorTimeout: (journal.match(/coordinator.*timed out|process writer.*timeout/gi) ?? []).length,
    cleanupFailure: (journal.match(/cleanup.*fail/gi) ?? []).length,
    livenessDelayed: (journal.match(/liveness (?:warning|heartbeat delayed)/gi) ?? []).length,
  };
  const p50 = report.health.map((sample) => sample.eventLoop?.delayP50Ms);
  const p99 = report.health.map((sample) => sample.eventLoop?.delayP99Ms);
  report.eventLoop = {
    healthErrors: report.health.filter((sample) => sample.error).length,
    p50Median: quantile(p50, 0.5),
    p50P95: quantile(p50, 0.95),
    p99Median: quantile(p99, 0.5),
    p99P95: quantile(p99, 0.95),
    p99Max: quantile(p99, 1),
  };
  report.memory = {
    start: report.resourceBefore.memoryCurrent,
    end: report.resourceAfter.memoryCurrent,
    peak: Math.max(...report.resources.map((sample) => sample.memoryCurrent), report.resourceBefore.memoryCurrent, report.resourceAfter.memoryCurrent),
    growth: report.resourceAfter.memoryCurrent - report.resourceBefore.memoryCurrent,
  };
  assert.equal(report.journal.databaseLocked, 0);
  assert.equal(report.journal.coordinatorTimeout, 0);
  assert.equal(report.journal.cleanupFailure, 0);
  assert.equal(report.resourceAfter.memoryEvents.oom_kill, report.resourceBefore.memoryEvents.oom_kill);
  report.completed = true;
} catch (error) {
  report.error = String(error?.stack ?? error).slice(0, 2_400);
  throw error;
} finally {
  sampling = false;
  if (sampler) await sampler;
  report.finishedAt = new Date().toISOString();
  persist();
  for (const job of tracked.values()) await call('chat.abort', {sessionKey: job.sessionKey, runId: job.runId}).catch(() => {});
  client.stop();
}

console.log(JSON.stringify({
  output,
  completed: report.completed,
  cohorts: report.cohorts.map((cohort) => ({count: cohort.count, firstTextMs: cohort.firstTextMs})),
  eventLoop: report.eventLoop,
  memory: report.memory,
  journal: report.journal,
}, null, 2));
