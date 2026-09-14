import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {
  controlledStopPolicy,
  newRelease,
  oldRelease,
  planProductionConfig,
  productionFiles,
  productionReleaseUnit,
  preservedMemoryFtsSha256,
  releaseId,
} from './db91-process-global-writer-production-plan.mjs';

assert.equal(os.hostname(), 'VM-8-2-ubuntu');
const [mode, rawPid] = process.argv.slice(2);
assert(['stage', 'stop', 'write-intent', 'cutover-live', 'apply', 'start', 'verify', 'rollback'].includes(mode));

const root = '/home/openclaw/.openclaw';
const unit = 'openclaw-gateway.service';
const backup = `${root}/backups/${releaseId}`;
const source = `${newRelease}/source`;
const permanentDropin = `/etc/systemd/system/${unit}.d/zzzzzzz-db91-writer-transaction-scope-v5.conf`;
const stopDropin = `/etc/systemd/system/${unit}.d/zzzzzzzz-db91-writer-transaction-scope-stop.conf`;
const memoryFtsTarget = 'core/dist/memory-schema-BSs9MQgq.js';
const configFiles = [
  `${root}/openclaw.json`,
  `${root}/experiments/agent-worker-isolation-v1/worker-openclaw.json`,
];
const run = (command, args, options = {}) => execFileSync(command, args, {
  encoding: 'utf8',
  timeout: 30_000,
  ...options,
}).trim();
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sha = (file) => hash(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const gatewayPid = () => Number(run('systemctl', ['show', unit, '-p', 'MainPID', '--value']));
const record = (phase, data = {}) => {
  fs.mkdirSync(backup, {recursive: true, mode: 0o700});
  const value = {at: new Date().toISOString(), phase, releaseId, ...data};
  fs.writeFileSync(`${backup}/${Date.now()}-${phase}.json`, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600, flag: 'wx'});
  console.log(JSON.stringify(value));
};
const atomic = (file, bytes) => {
  const stat = fs.statSync(file);
  const temporary = `${file}.${releaseId}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes, {mode: stat.mode & 0o777, flag: 'wx'});
  fs.chownSync(temporary, stat.uid, stat.gid);
  fs.chmodSync(temporary, stat.mode & 0o777);
  fs.renameSync(temporary, file);
};
const readLiveEnvironment = (pid) => {
  assert(pid > 1);
  const environment = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map((entry) => {
    const index = entry.indexOf('=');
    return [entry.slice(0, index), entry.slice(index + 1)];
  }));
  Object.assign(process.env, environment);
  return environment;
};
const checkCandidate = () => {
  for (const file of productionFiles) {
    assert.equal(sha(`${source}/${file.source}`), file.afterSha256, `Source artifact drift: ${file.source}`);
    assert.equal(sha(`${newRelease}/${file.target}`), file.afterSha256, `Candidate runtime drift: ${file.target}`);
  }
  assert.equal(sha(`${newRelease}/${memoryFtsTarget}`), preservedMemoryFtsSha256, 'Memory FTS fix must remain unchanged');
};

async function connect(core, config, environment) {
  const token = config.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, key) => {
    assert(environment[key], `Missing Gateway token environment ${key}`);
    return environment[key];
  });
  const {GatewayClient} = await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
  let client;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Gateway connection deadline')), 20_000);
    client = new GatewayClient({
      url: 'ws://127.0.0.1:22793',
      token,
      deviceIdentity: null,
      clientName: 'cli',
      mode: 'cli',
      caps: ['tool-events'],
      scopes: ['operator.read', 'operator.write', 'operator.admin'],
      onHelloOk: () => { clearTimeout(timer); resolve(); },
      onConnectError: (error) => { clearTimeout(timer); reject(error); },
    });
    client.start();
  });
  return client;
}

if (mode === 'write-intent') {
  const serviceUid = fs.statSync(root).uid;
  assert.equal(process.getuid(), serviceUid);
  assert(serviceUid > 0);
  const pid = Number(rawPid);
  assert.equal(gatewayPid(), pid);
  assert.equal(run('systemctl', ['show', unit, '-p', 'KillMode', '--value']), 'mixed');
  const {a: writeIntent} = await import(`${oldRelease}/core/dist/restart-intent-BYVo1227.js`);
  assert(writeIntent({
    targetPid: pid,
    reason: 'db91-writer-transaction-scope-production-cutover',
    intent: {waitMs: 5_000},
    env: process.env,
  }));
  console.log(JSON.stringify({nativeRestartIntentWritten: true, targetPid: pid, waitMs: 5_000}));
  process.exit(0);
}

assert.equal(process.getuid(), 0);

if (mode === 'stage') {
  const pid = gatewayPid();
  const environment = readLiveEnvironment(pid);
  assert.equal(environment.V_RELEASE_VERSION, 'v2026.9.1-db91.4');
  assert.equal(fs.realpathSync(source), source);
  assert.equal(run('git', ['-c', `safe.directory=${source}`, '-C', source, 'status', '--porcelain']), '');
  const sourceCommit = run('git', ['-c', `safe.directory=${source}`, '-C', source, 'rev-parse', 'HEAD']);
  assert(!fs.existsSync(`${newRelease}/core`) && !fs.existsSync(`${newRelease}/worker`), 'Candidate runtime already staged');
  assert(!fs.existsSync(backup), 'Production backup directory already exists');
  assert(!fs.existsSync(permanentDropin) && !fs.existsSync(stopDropin));
  for (const file of productionFiles) {
    const live = `${oldRelease}/${file.target}`;
    if (file.beforeSha256 === null) assert(!fs.existsSync(live), `Unexpected live file: ${file.target}`);
    else assert.equal(sha(live), file.beforeSha256, `Production baseline drift: ${file.target}`);
    assert.equal(sha(`${source}/${file.source}`), file.afterSha256, `Committed artifact drift: ${file.source}`);
  }
  assert.equal(sha(`${oldRelease}/${memoryFtsTarget}`), preservedMemoryFtsSha256, 'Live Memory FTS fix drift');
  fs.mkdirSync(backup, {mode: 0o700});
  const group = Number(run('id', ['-g', 'openclaw']));
  fs.chownSync(backup, 0, group);
  fs.chmodSync(backup, 0o750);
  // OpenClaw rejects hardlinked plugin manifests as unsafe. A normal copy is
  // required even though it costs about 524 MiB on the production data disk.
  run('cp', ['-a', `${oldRelease}/core`, `${newRelease}/core`], {timeout: 180_000});
  run('cp', ['-a', `${oldRelease}/worker`, `${newRelease}/worker`], {timeout: 60_000});
  for (const file of productionFiles) {
    const destination = `${newRelease}/${file.target}`;
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.copyFileSync(`${source}/${file.source}`, temporary, fs.constants.COPYFILE_EXCL);
    fs.chownSync(temporary, 0, 0);
    fs.chmodSync(temporary, 0o644);
    fs.renameSync(temporary, destination);
    run(process.execPath, ['--check', destination]);
    run('/usr/sbin/runuser', ['-u', 'openclaw', '--', '/usr/bin/test', '-r', destination]);
  }
  checkCandidate();
  const configs = [];
  for (const [index, file] of configFiles.entries()) {
    const before = fs.readFileSync(file);
    const after = Buffer.from(planProductionConfig(before, {expectedMinWorkers: index === 0 ? 5 : 1}));
    const beforePath = `${backup}/config-${index}.before`;
    const afterPath = `${backup}/config-${index}.after`;
    fs.writeFileSync(beforePath, before, {mode: 0o600, flag: 'wx'});
    fs.writeFileSync(afterPath, after, {mode: 0o640, flag: 'wx'});
    fs.chownSync(afterPath, 0, group);
    run('/usr/sbin/runuser', ['-u', 'openclaw', '--', process.execPath, `${newRelease}/core/openclaw.mjs`, 'config', 'validate', '--json'], {
      env: {...process.env, OPENCLAW_STATE_DIR: root, OPENCLAW_CONFIG_PATH: afterPath},
      timeout: 60_000,
    });
    configs.push({file, beforePath, afterPath, beforeSha256: hash(before), afterSha256: hash(after)});
  }
  fs.writeFileSync(`${backup}/service.before`, run('systemctl', ['cat', unit]), {mode: 0o600, flag: 'wx'});
  fs.writeFileSync(`${backup}/unit.after`, productionReleaseUnit(), {mode: 0o600, flag: 'wx'});
  const staged = {at: new Date().toISOString(), releaseId, sourceCommit, beforePid: pid, configs, files: productionFiles};
  fs.writeFileSync(`${backup}/staged.json`, `${JSON.stringify(staged, null, 2)}\n`, {mode: 0o600, flag: 'wx'});
  record('staged', {sourceCommit, beforePid: pid, files: productionFiles.length, liveRuntimeUnchanged: true});
} else if (mode === 'stop') {
  checkCandidate();
  const staged = readJson(`${backup}/staged.json`);
  const pid = gatewayPid();
  assert.equal(pid, staged.beforePid, 'Gateway restarted after staging');
  const environment = readLiveEnvironment(pid);
  const config = readJson(configFiles[0]);
  const client = await connect(`${oldRelease}/core`, config, environment);
  try {
    const workers = await client.request('vlab.workers.status', {}, {timeoutMs: 20_000});
    const active = workers.workers.reduce((sum, worker) => sum + worker.activeCount, 0);
    const queued = workers.workers.reduce((sum, worker) => sum + (worker.queued ?? 0), 0);
    fs.writeFileSync(stopDropin, controlledStopPolicy, {mode: 0o644, flag: 'wx'});
    run('systemctl', ['daemon-reload']);
    assert.equal(run('systemctl', ['show', unit, '-p', 'KillSignal', '--value']), '10');
    run('/usr/sbin/runuser', ['-u', 'openclaw', '--', process.execPath, `${source}/scripts/deploy-db91-process-global-writer-production.mjs`, 'write-intent', String(pid)], {env: process.env});
    // The already accepted db91.1 restart protocol persists active turns before
    // exit and reconnects them after start. SIGUSR1 avoids the QQBot TERM hook
    // that would otherwise exit before the native restart intent is consumed.
    record('native-stop-requested', {beforePid: pid, active, queued, pending: workers.pending, terminalPolicy: 'preserve'});
    run('systemctl', ['stop', unit], {timeout: 65_000});
    assert.equal(gatewayPid(), 0);
    record('stopped', {beforePid: pid, activeAtNativeHandoff: active});
  } finally {
    client.stop();
  }
} else if (mode === 'cutover-live') {
  checkCandidate();
  const staged = readJson(`${backup}/staged.json`);
  const pid = gatewayPid();
  const environment = readLiveEnvironment(pid);
  assert.equal(environment.V_RELEASE_VERSION, 'v2026.9.1-db91.4');
  assert(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(`${oldRelease}/core/dist/index.js`));
  if (fs.existsSync(stopDropin)) {
    assert.equal(fs.readFileSync(stopDropin, 'utf8'), controlledStopPolicy);
  } else {
    fs.writeFileSync(stopDropin, controlledStopPolicy, {mode: 0o644, flag: 'wx'});
    run('systemctl', ['daemon-reload']);
  }
  assert.equal(run('systemctl', ['show', unit, '-p', 'KillSignal', '--value']), '10');
  for (const config of staged.configs) {
    assert.equal(sha(config.file), config.beforeSha256, `Live config drift: ${config.file}`);
    assert.equal(sha(config.afterPath), config.afterSha256, `Staged config drift: ${config.afterPath}`);
  }
  run('/usr/sbin/runuser', ['-u', 'openclaw', '--', process.execPath, `${source}/scripts/deploy-db91-process-global-writer-production.mjs`, 'write-intent', String(pid)], {env: process.env});
  let applied = false;
  try {
    for (const config of staged.configs) atomic(config.file, fs.readFileSync(config.afterPath));
    fs.writeFileSync(permanentDropin, productionReleaseUnit(), {mode: 0o644, flag: 'wx'});
    fs.unlinkSync(stopDropin);
    run('systemctl', ['daemon-reload']);
    assert.equal(run('systemctl', ['show', unit, '-p', 'KillSignal', '--value']), '15');
    applied = true;
    record('live-cutover-armed', {beforePid: pid, configs: staged.configs.length, terminalPolicy: 'preserve'});
    process.kill(pid, 'SIGUSR1');
    const deadline = Date.now() + 65_000;
    let nextPid = pid;
    while (Date.now() < deadline) {
      await sleep(500);
      nextPid = gatewayPid();
      if (nextPid > 1 && nextPid !== pid) break;
    }
    assert(nextPid > 1 && nextPid !== pid, 'Gateway did not restart into the candidate release');
    record('live-cutover-restarted', {beforePid: pid, pid: nextPid});
  } catch (error) {
    if (applied && gatewayPid() === pid) {
      for (const config of staged.configs) atomic(config.file, fs.readFileSync(config.beforePath));
      if (fs.existsSync(permanentDropin)) fs.unlinkSync(permanentDropin);
      run('systemctl', ['daemon-reload']);
      record('live-cutover-arm-rolled-back', {pid, error: error.name});
    }
    throw error;
  }
} else if (mode === 'apply') {
  assert.equal(gatewayPid(), 0, 'Gateway must be stopped');
  checkCandidate();
  const staged = readJson(`${backup}/staged.json`);
  for (const config of staged.configs) {
    assert.equal(sha(config.file), config.beforeSha256, `Live config drift: ${config.file}`);
    assert.equal(sha(config.afterPath), config.afterSha256, `Staged config drift: ${config.afterPath}`);
    atomic(config.file, fs.readFileSync(config.afterPath));
  }
  fs.writeFileSync(permanentDropin, productionReleaseUnit(), {mode: 0o644, flag: 'wx'});
  if (fs.existsSync(stopDropin)) {
    assert.equal(fs.readFileSync(stopDropin, 'utf8'), controlledStopPolicy);
    fs.unlinkSync(stopDropin);
  }
  run('systemctl', ['daemon-reload']);
  record('applied', {configs: staged.configs.length, files: productionFiles.length, rollbackRetained: true});
} else if (mode === 'start') {
  assert.equal(gatewayPid(), 0, 'Gateway already running');
  assert.equal(fs.readFileSync(permanentDropin, 'utf8'), productionReleaseUnit());
  run('systemctl', ['start', unit], {timeout: 65_000});
  const pid = gatewayPid();
  assert(pid > 1);
  record('started', {pid});
} else if (mode === 'verify') {
  checkCandidate();
  const pid = gatewayPid();
  const environment = readLiveEnvironment(pid);
  assert.equal(environment.V_RELEASE_VERSION, releaseId);
  assert(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(`${newRelease}/core/dist/index.js`));
  const staged = readJson(`${backup}/staged.json`);
  for (const config of staged.configs) assert.equal(sha(config.file), config.afterSha256);
  assert.equal(run('systemctl', ['show', unit, '-p', 'KillSignal', '--value']), '15', 'Normal stop signal must be restored');
  const client = await connect(`${newRelease}/core`, readJson(configFiles[0]), environment);
  try {
    const health = await client.request('health', {}, {timeoutMs: 30_000});
    const workers = await client.request('vlab.workers.status', {}, {timeoutMs: 30_000});
    assert.equal(workers.minWorkers, 5);
    assert.equal(workers.maxWorkers, 15);
    assert.equal(workers.sessionsPerWorker, 3);
    assert(workers.workers.length >= 5 && workers.workers.filter((worker) => worker.ready).length >= 5);
    record('verified', {
      pid,
      workers: workers.workers.length,
      readyWorkers: workers.workers.filter((worker) => worker.ready).length,
      eventLoop: health.eventLoop,
      realMessageAcceptanceStillRequired: true,
    });
  } finally {
    client.stop();
  }
} else if (mode === 'rollback') {
  assert.equal(gatewayPid(), 0, 'Stop the Gateway before rollback');
  const staged = readJson(`${backup}/staged.json`);
  for (const config of staged.configs) {
    assert([config.beforeSha256, config.afterSha256].includes(sha(config.file)));
    atomic(config.file, fs.readFileSync(config.beforePath));
  }
  if (fs.existsSync(permanentDropin)) {
    assert.equal(fs.readFileSync(permanentDropin, 'utf8'), productionReleaseUnit());
    fs.unlinkSync(permanentDropin);
  }
  if (fs.existsSync(stopDropin)) {
    assert.equal(fs.readFileSync(stopDropin, 'utf8'), controlledStopPolicy);
    fs.unlinkSync(stopDropin);
  }
  run('systemctl', ['daemon-reload']);
  run('systemctl', ['start', unit], {timeout: 65_000});
  record('rolled-back', {pid: gatewayPid(), candidateRetained: true, databasesUnchanged: true});
}
