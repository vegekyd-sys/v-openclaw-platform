#!/usr/bin/env node
// Gateway lifecycle only; the canonical promoter owns runtime file installation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireIdleFence } from './shared/lifecycle.mjs';
import { suspensionReady } from './shared/files.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const GATEWAY_UNIT = 'openclaw-gateway.service';
export const RTC_UNIT = 'openclaw-rtc-h5.service';
export function execStartIdentity(value) {
  if (value === '') return digest('');
  // systemctl appends mutable process/timestamp fields to ExecStart. Hash the
  // configured command only, never print argv (it can contain credentials).
  const match = /^\{\s*path=([^;]+);\s*argv\[\]=([^;]+);\s*ignore_errors=(yes|no)\s*;/u.exec(value ?? '');
  assert(match && value.trim().endsWith('}') && !/\}\s*;\s*\{/u.test(value), 'Unit command definition is unavailable');
  return digest(JSON.stringify({ path: match[1].trim(), argv: match[2].trim(), ignoreErrors: match[3] }));
}
export function artifactIdentity(bytes) {
  const artifact = JSON.parse(bytes);
  assert(/^[a-f0-9]{40}$/u.test(artifact.sourceCommit), 'Artifact commit is unavailable');
  assert.equal(artifact.branch, 'dev', 'Use the canonical merged dev artifact');
  assert(Array.isArray(artifact.files) && artifact.files.length === 24, 'Exactly 24 canonical runtime targets are required');
  const seen = new Set();
  const files = artifact.files.map(file => {
    assert(/^(openclaw|production-worker)\/[A-Za-z0-9._/-]+$/u.test(file.target ?? '')
      && file.target.split('/').every(part => part && part !== '.' && part !== '..'), 'Unsupported runtime target');
    assert(!/(^|\/)(\.env[^/]*|\.npmrc|auth[^/]*\.json|credentials[^/]*|state|sessions|browser)(\/|$)/iu.test(file.target), 'State or credential target');
    assert(/\.(js|mjs|cjs|json|wasm|map|node|ts|md)$/u.test(file.target), 'Unsupported code extension');
    assert(!seen.has(file.target), 'Duplicate runtime target'); seen.add(file.target);
    assert(file.before === null || /^[a-f0-9]{64}$/u.test(file.before), 'Invalid before hash');
    assert(/^[a-f0-9]{64}$/u.test(file.after), 'Invalid after hash');
    const content = Buffer.from(file.content ?? '', 'base64');
    assert.equal(content.toString('base64'), file.content, 'Invalid artifact encoding');
    assert.equal(digest(content), file.after, 'Artifact bytes differ from after hash');
    return { target: file.target, before: file.before, after: file.after };
  });
  return { artifactSha: digest(bytes), sourceCommit: artifact.sourceCommit, files, filesSha: digest(JSON.stringify(files)) };
}
export function assertArtifactBinding(receipt, artifact) {
  assert.equal(receipt?.schema, 'gpt-live-production-cutover-v1', 'Unexpected cutover receipt');
  assert.equal(receipt.artifactSha, artifact.artifactSha, 'Cutover artifact changed');
  assert.equal(receipt.sourceCommit, artifact.sourceCommit, 'Cutover commit changed');
  assert.equal(receipt.filesSha, artifact.filesSha, 'Cutover file mapping changed');
  assert.equal(digest(JSON.stringify(receipt.files)), artifact.filesSha, 'Receipt mapping is unavailable');
}
export function assertHashes(observed, artifact, side) {
  assert(['before', 'after'].includes(side), 'Unknown artifact side');
  assert.equal(observed?.length, artifact.files.length, 'Runtime hash mapping is incomplete');
  for (let i = 0; i < artifact.files.length; i++) {
    assert.equal(observed[i].target, artifact.files[i].target, 'Runtime target mapping changed');
    assert.equal(observed[i].sha, artifact.files[i][side], 'Runtime bytes differ from the required artifact side');
  }
}
export function assertServiceIdentity(value, { running = true } = {}) {
  assert.equal(value?.unit, GATEWAY_UNIT, 'Unexpected Gateway service');
  assert(Number.isSafeInteger(value.pid) && (running ? value.pid > 1 : value.pid === 0), 'Gateway PID is unavailable or unexpected');
  assert(typeof value.invocation === 'string' && (!running || /^[a-f0-9]{32}$/iu.test(value.invocation)), 'Gateway invocation is unavailable');
  assert(/^\/opt\/[A-Za-z0-9._/-]+$/u.test(value.core ?? '') && !value.core.split('/').includes('..'), 'Production core identity is unavailable');
  assert(/^\/[A-Za-z0-9._/-]+$/u.test(value.node ?? ''), 'Gateway executable is unavailable');
  assert(/^\/[A-Za-z0-9._/-]+$/u.test(value.configPath ?? '') && !value.configPath.startsWith('/srv/vlab'), 'Production configuration identity is unavailable');
  for (const key of ['configSha', 'execStartSha', 'stopPolicySha']) assert(/^[a-f0-9]{64}$/u.test(value[key] ?? ''), 'Gateway configuration or unit identity is unavailable');
  for (const key of ['uid', 'gid']) assert(Number.isSafeInteger(value[key]) && value[key] >= 0, 'Gateway UID/GID is unavailable');
}
export function assertSameGateway(expected, observed, { running = true, sameProcess = true } = {}) {
  assertServiceIdentity(expected, { running: expected.pid > 0 }); assertServiceIdentity(observed, { running });
  for (const key of ['unit', 'core', 'node', 'uid', 'gid', 'configPath', 'configSha', 'execStartSha', 'stopPolicySha'])
    assert.equal(observed[key], expected[key], 'Gateway source/configuration/service identity changed');
  if (sameProcess) for (const key of ['pid', 'invocation']) assert.equal(observed[key], expected[key], 'Gateway process identity changed');
}
export function assertRtcIdentity(expected, observed) {
  assert.equal(expected?.unit, RTC_UNIT); assert.equal(observed?.unit, RTC_UNIT);
  assert(['active', 'inactive', 'failed'].includes(expected.activeState), 'RTC state is unavailable');
  assert.equal(observed.loadState, expected.loadState, 'RTC service load identity changed');
  assert.equal(observed.execStartSha, expected.execStartSha, 'RTC command identity changed');
  assert.equal(observed.definitionSha, expected.definitionSha, 'RTC unit/drop-in identity changed');
}
export function summarizeWorkers(health, workers) {
  assert.equal(typeof health?.ok, 'boolean', 'Gateway health is unavailable');
  assert(Number.isSafeInteger(workers?.pending) && workers.pending >= 0, 'Worker pending state is unavailable');
  assert(Array.isArray(workers.workers) && workers.workers.length > 0, 'Worker readiness is unavailable');
  const result = { health: health.ok, eventLoopDegraded: health.eventLoop?.degraded === true,
    pending: workers.pending, workerActive: 0, queued: 0, detached: 0, workersReady: true };
  for (const worker of workers.workers) {
    assert(typeof worker.ready === 'boolean' && Number.isSafeInteger(worker.activeCount) && worker.activeCount >= 0, 'Worker activity is unavailable');
    for (const key of ['queued', 'detachedTaskCount']) assert(worker[key] === undefined || (Number.isSafeInteger(worker[key]) && worker[key] >= 0), 'Worker queue is unavailable');
    result.workerActive += worker.activeCount; result.queued += worker.queued ?? 0;
    result.detached += worker.detachedTaskCount ?? 0; result.workersReady &&= worker.ready;
  }
  return result;
}
export async function idleSnapshot(call) {
  const result = summarizeWorkers(await call('health', {}), await call('vlab.workers.status', {}));
  let offset = 0, activeSessions = 0;
  for (let page = 0; page < 20; page++) {
    const sessions = await call('sessions.list', { limit: 500, offset });
    assert(Array.isArray(sessions?.sessions) && typeof sessions.hasMore === 'boolean', 'Session pagination is unavailable');
    // The native API marks active sessions with hasActiveRun:true; idle rows may omit it.
    for (const session of sessions.sessions) {
      assert(session && typeof session === 'object' && (session.hasActiveRun === undefined || typeof session.hasActiveRun === 'boolean'), 'Session activity is unavailable');
      if (session.hasActiveRun === true) activeSessions++;
    }
    if (!sessions.hasMore) return { ...result, activeSessions };
    assert(page < 19 && Number.isSafeInteger(sessions.nextOffset) && sessions.nextOffset > offset, 'Session pagination did not finish or advance');
    offset = sessions.nextOffset;
  }
  throw Error('Session pagination did not finish');
}
export function assertIdle(value) {
  assert(value?.health === true && value.eventLoopDegraded === false && value.workersReady === true, 'Gateway/Workers are not ready');
  for (const key of ['pending', 'workerActive', 'queued', 'detached', 'activeSessions']) assert.equal(value[key], 0, 'Gateway has active or queued work; retry without stopping');
}

async function remoteMain(req) {
  const fs = await import('node:fs'); const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 ** 2, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const hash = file => { try { return digest(fs.readFileSync(file)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const properties = unit => Object.fromEntries(run('systemctl', ['show', unit, '-p', 'MainPID,LoadState,ActiveState,SubState,InvocationID,ExecStart,FragmentPath,DropInPaths,SendSIGKILL,KillMode,KillSignal,FinalKillSignal,TimeoutStopUSec']).split('\n').filter(Boolean).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
  const stopPolicy = state => Object.fromEntries(['SendSIGKILL', 'KillMode', 'KillSignal', 'FinalKillSignal', 'TimeoutStopUSec'].map(key => [key, state[key]]));
  const rtc = () => {
    const state = properties(RTC_UNIT);
    const definition = [state.FragmentPath, ...(state.DropInPaths ?? '').split(' ').filter(Boolean)].filter(Boolean).map(file => ({ path: file, sha: hash(file) }));
    assert(definition.every(file => file.sha !== null), 'RTC unit bytes are unavailable');
    return { unit: RTC_UNIT, loadState: state.LoadState, activeState: state.ActiveState, pid: Number(state.MainPID),
      invocation: state.InvocationID, execStartSha: execStartIdentity(state.ExecStart ?? ''), definitionSha: digest(JSON.stringify(definition)) };
  };
  const observe = stopped => {
    const state = properties(GATEWAY_UNIT), pid = Number(state.MainPID);
    assert.equal(state.LoadState, 'loaded', 'Gateway unit is unavailable');
    let core, node, configPath, uid, gid, env;
    if (pid > 1) {
      env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
      const argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
      const entry = argv.find(value => value.endsWith('/dist/index.js'));
      assert(entry && argv.includes('gateway'), 'Actual Gateway entrypoint is unavailable');
      core = fs.realpathSync(path.dirname(path.dirname(entry))); node = fs.readlinkSync(`/proc/${pid}/exe`);
      configPath = env.OPENCLAW_CONFIG_PATH;
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      uid = Number(/^Uid:\s+(\d+)/mu.exec(status)?.[1]); gid = Number(/^Gid:\s+(\d+)/mu.exec(status)?.[1]);
    } else {
      assert.equal(pid, 0, 'Unexpected Gateway PID'); assert(stopped, 'Running Gateway identity is required');
      ({ core, node, configPath, uid, gid } = stopped);
    }
    const value = { unit: GATEWAY_UNIT, pid, invocation: state.InvocationID, core, node, configPath, configSha: hash(configPath), uid, gid,
      execStartSha: execStartIdentity(state.ExecStart ?? ''), stopPolicy: stopPolicy(state), stopPolicySha: digest(JSON.stringify(stopPolicy(state))) };
    assertServiceIdentity(value, { running: pid > 1 });
    // Read process state again so a restart during /proc inspection cannot pass.
    const last = properties(GATEWAY_UNIT); assert.equal(last.MainPID, String(pid)); assert.equal(last.InvocationID, state.InvocationID);
    return { value, env };
  };
  const runtimeHashes = core => req.artifact.files.map(file => {
    const root = file.target.startsWith('openclaw/') ? core : core.replace(/\/core$/u, '/worker');
    if (file.target.startsWith('production-worker/')) assert(root !== core, 'Production Worker mapping is unavailable');
    const target = path.join(root, file.target.slice(file.target.indexOf('/') + 1));
    let ancestor = target; while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    assert.equal(fs.realpathSync(ancestor), ancestor, 'Runtime file or ancestor is a symlink');
    return { target: file.target, sha: hash(target) };
  });
  const connect = async live => {
    const env = live.env; assert(env, 'Live Gateway environment is unavailable'); Object.assign(process.env, env);
    const config = read(live.value.configPath);
    assert(Number.isInteger(config.gateway?.port) && config.gateway.port > 0 && config.gateway.port < 65536, 'Gateway port is unavailable');
    assert(typeof config.gateway.auth?.token === 'string' && config.gateway.auth.token.length > 0, 'Gateway authentication is unavailable');
    const token = config.gateway.auth.token.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (_, key) => { assert(env[key], 'Gateway token reference is unavailable'); return env[key]; });
    assert(!token.includes('${'), 'Unresolved Gateway token reference');
    const { GatewayClient } = await import(live.value.core + '/dist/plugin-sdk/gateway-runtime.js');
    let client, timer;
    try {
      await new Promise((resolve, reject) => {
        timer = setTimeout(() => { client?.stop(); reject(Error('Gateway connect deadline')); }, 15000);
        client = new GatewayClient({ url: `ws://127.0.0.1:${config.gateway.port}`, token, deviceIdentity: null,
          clientName: 'cli', mode: 'cli', scopes: ['operator.read', 'operator.write', 'operator.admin'], onEvent() {},
          onHelloOk() { clearTimeout(timer); resolve(); }, onConnectError(error) { clearTimeout(timer); reject(error); } });
        client.start();
      });
      return client;
    } catch (error) { client?.stop(); throw error; } finally { clearTimeout(timer); }
  };
  let phase = 'request', client, held, stopped = false, stopRequested = false, lastIdle;
  const receipt = { schema: 'gpt-live-production-cutover-v1', command: req.command, artifactSha: req.artifact.artifactSha,
    sourceCommit: req.artifact.sourceCommit, filesSha: req.artifact.filesSha, files: req.artifact.files, at: new Date().toISOString() };
  try {
    assert.equal(process.getuid(), 0, 'Root inspection is required');
    assert(['inspect', 'stop', 'start'].includes(req.command));
    if (req.command !== 'inspect') { assertArtifactBinding(req.expected, req.artifact); assert.equal(req.expected.ok, true, 'Only a successful prior receipt authorizes a transition'); }
    phase = 'identity';
    if (req.command === 'inspect') {
      const live = observe(); receipt.gateway = live.value; receipt.rtc = rtc(); receipt.hashes = runtimeHashes(live.value.core);
      assertHashes(receipt.hashes, req.artifact, 'before');
      return { ...receipt, ok: true, phase: 'inspected', readOnly: true };
    }
    if (req.command === 'stop') {
      assert.equal(req.expected.phase, 'inspected', 'Stop requires an inspect receipt');
      const live = observe(); receipt.gateway = live.value; receipt.rtc = req.expected.rtc;
      assertSameGateway(req.expected.gateway, live.value); assertRtcIdentity(req.expected.rtc, rtc());
      assertHashes(runtimeHashes(live.value.core), req.artifact, 'before');
      phase = 'idle-snapshot'; client = await connect(live);
      const call = (method, params) => client.request(method, params, { timeoutMs: method === 'sessions.list' ? 45000 : 15000 });
      lastIdle = await idleSnapshot(call); assertIdle(lastIdle);
      phase = 'native-drain'; held = await acquireIdleFence(call, 'gpt-live-cutover-' + req.artifact.artifactSha.slice(0, 16), { timeoutMs: 45000 });
      phase = 'fenced-recheck';
      assertSameGateway(req.expected.gateway, observe().value); assertHashes(runtimeHashes(live.value.core), req.artifact, 'before');
      assertRtcIdentity(req.expected.rtc, rtc());
      assertSameGateway(req.expected.gateway, observe().value);
      const fence = await call('gateway.suspend.status', { suspensionId: held.suspensionId });
      assert.equal(suspensionReady(fence), true, 'Native drain is not ready');
      // Keep the ready/expiry check adjacent to stop; no slow inspection follows it.
      phase = 'stop'; stopRequested = true; run('systemctl', ['stop', '--no-block', GATEWAY_UNIT]);
      const deadline = Date.now() + 90000;
      for (;;) {
        const state = properties(GATEWAY_UNIT);
        if (Number(state.MainPID) === 0) break;
        assert.equal(Number(state.MainPID), live.value.pid, 'Another Gateway process appeared while stopping');
        assert.equal(state.InvocationID, live.value.invocation, 'Another Gateway invocation appeared while stopping');
        assert(Date.now() < deadline, 'Gateway stop did not finish; leave the scene intact'); await delay(500);
      }
      stopped = true; receipt.gateway = observe(live.value).value; assertSameGateway(live.value, receipt.gateway, { running: false, sameProcess: false });
      receipt.hashes = runtimeHashes(live.value.core); assertHashes(receipt.hashes, req.artifact, 'before');
      receipt.previousGateway = req.expected.gateway; receipt.rtc = req.expected.rtc; receipt.idle = lastIdle;
      receipt.fenceReady = true; receipt.fenceExpiresAtMs = fence.expiresAtMs;
      return { ...receipt, ok: true, phase: 'stopped' };
    }
    assert.equal(req.expected.phase, 'stopped', 'Start requires a stop receipt');
    assert.equal(req.expected.fenceReady, true, 'Stop receipt has no native ready confirmation'); assertIdle(req.expected.idle);
    const baseline = req.expected.gateway; const before = observe(baseline).value;
    assertSameGateway(req.expected.previousGateway, baseline, { running: false, sameProcess: false });
    assertSameGateway(baseline, before, { running: false }); assertRtcIdentity(req.expected.rtc, rtc());
    assertHashes(runtimeHashes(baseline.core), req.artifact, 'after');
    phase = 'start'; run('systemctl', ['start', '--no-block', GATEWAY_UNIT]);
    phase = 'readiness'; const deadline = Date.now() + 360000;
    let ready;
    while (Date.now() < deadline) {
        const live = observe(baseline); receipt.gateway = live.value;
      if (live.value.pid > 1) {
        assertSameGateway(baseline, live.value, { running: true, sameProcess: false });
        assert.notEqual(live.value.pid, req.expected.previousGateway.pid, 'Gateway did not get a new PID');
        assert.notEqual(live.value.invocation, req.expected.previousGateway.invocation, 'Gateway did not get a new invocation');
      }
      try {
        if (live.value.pid > 1) {
          client = await connect(live);
          const call = (method, params) => client.request(method, params, { timeoutMs: 15000 });
          const status = summarizeWorkers(await call('health', {}), await call('vlab.workers.status', {}));
          client.stop(); client = undefined;
          if (status.health && !status.eventLoopDegraded && status.workersReady) { ready = { gateway: live.value, status }; break; }
        }
      } catch { client?.stop(); client = undefined; }
      await delay(2000);
    }
    assert(ready, 'Gateway did not become ready; leave the scene intact');
    phase = 'restore-rtc'; assertRtcIdentity(req.expected.rtc, rtc());
    if (req.expected.rtc.activeState === 'active') {
      run('systemctl', ['start', '--no-block', RTC_UNIT]);
      const rtcDeadline = Date.now() + 30000;
      while (rtc().activeState !== 'active') { assert(Date.now() < rtcDeadline, 'Original RTC service did not become active'); await delay(500); }
    }
    phase = 'final-identity'; receipt.gateway = observe().value;
    assertSameGateway(ready.gateway, receipt.gateway); assertSameGateway(baseline, receipt.gateway, { sameProcess: false });
    assertHashes(receipt.hashes = runtimeHashes(baseline.core), req.artifact, 'after');
    receipt.rtc = rtc(); assertRtcIdentity(req.expected.rtc, receipt.rtc); receipt.readiness = ready.status;
    receipt.previousGateway = req.expected.previousGateway;
    return { ...receipt, ok: true, phase: 'started' };
  } catch {
    // Do not serialize a GatewayClient/systemctl error: it may contain credentials.
    return { ...receipt, ok: false, phase: 'failed', failedPhase: phase, stopped, stopRequested, idle: lastIdle ?? null,
      action: 'Inspect the private receipt and service journal; no extra kill, restart, or file changes were attempted.' };
  } finally {
    if (held && !stopRequested && client) await client.request('gateway.suspend.resume', { suspensionId: held.suspensionId }, { timeoutMs: 5000 }).catch(() => {});
    client?.stop();
  }
}

export function remoteSource() {
  return `import assert from 'node:assert/strict';\nimport {createHash} from 'node:crypto';\nimport {setTimeout as delay} from 'node:timers/promises';\nconst digest=${digest.toString()};\nconst GATEWAY_UNIT=${JSON.stringify(GATEWAY_UNIT)},RTC_UNIT=${JSON.stringify(RTC_UNIT)};\n${[execStartIdentity, assertArtifactBinding, assertHashes, assertServiceIdentity, assertSameGateway, assertRtcIdentity, summarizeWorkers, idleSnapshot, assertIdle, suspensionReady, acquireIdleFence, remoteMain].map(fn => fn.toString()).join('\n')}\nfor(const key of ['log','info','warn','error','debug'])console[key]=()=>{};\nconst input=[];for await(const chunk of process.stdin)input.push(chunk);\ntry {const result=await remoteMain(JSON.parse(Buffer.concat(input).toString()));process.stdout.write('GPT_LIVE_CUTOVER_RESULT '+JSON.stringify(result)+'\\n');}catch{process.stdout.write('GPT_LIVE_CUTOVER_RESULT '+JSON.stringify({ok:false,phase:'failed',failedPhase:'bootstrap'})+'\\n');}\n`;
}
export function parseArgs(argv) {
  const command = argv[0]; assert(['inspect', 'stop', 'start'].includes(command), 'Use inspect, stop, or start');
  const options = { command };
  for (let i = 1; i < argv.length; i += 2) {
    assert(['--artifact', '--expected', '--output'].includes(argv[i]) && argv[i + 1] && !argv[i + 1].startsWith('--'), 'Invalid cutover arguments');
    const key = argv[i].slice(2); assert(!(key in options), 'Duplicate cutover argument'); options[key] = path.resolve(argv[i + 1]);
  }
  assert(options.artifact && options.output, 'Artifact and private output path are required');
  assert(command === 'inspect' ? !options.expected : options.expected, 'Expected prior receipt is required for stop/start only');
  return options;
}
export const shellQuote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
function main(argv) {
  const options = parseArgs(argv), artifact = artifactIdentity(fs.readFileSync(options.artifact));
  const expected = options.expected ? JSON.parse(fs.readFileSync(options.expected, 'utf8')) : undefined;
  if (expected) assertArtifactBinding(expected, artifact);
  assert(!fs.existsSync(options.output), 'Output receipt already exists; do not overwrite it');
  assert(fs.statSync(path.dirname(options.output)).isDirectory(), 'Private receipt parent must exist');
  // The only network command is the configured Tailscale SSH alias v.
  const source = remoteSource();
  const payload = JSON.stringify({ command: options.command, artifact, expected });
  const bootstrap = `const a=[];for await(const c of process.stdin)a.push(c);const r=JSON.parse(Buffer.concat(a).toString());process.stdin.destroy();const {spawn}=await import('node:child_process');const p=spawn(process.execPath,['--input-type=module','-e',r.source],{stdio:['pipe','pipe','pipe']});p.stdin.end(r.payload);p.stdout.pipe(process.stdout);p.stderr.resume();await new Promise(resolve=>p.on('exit',resolve));`;
  let result;
  try {
    const output = execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'v', 'sudo', '-n', '/opt/node-v22.23.1/bin/node', '--input-type=module', '-e', shellQuote(bootstrap)],
      { input: JSON.stringify({ source, payload }), timeout: 900000, maxBuffer: 8 * 1024 ** 2, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    const line = output.split('\n').findLast(value => value.startsWith('GPT_LIVE_CUTOVER_RESULT '));
    assert(line, 'Remote receipt was not returned'); result = JSON.parse(line.slice('GPT_LIVE_CUTOVER_RESULT '.length));
  } catch { result = { schema: 'gpt-live-production-cutover-v1', ok: false, command: options.command, phase: 'failed', failedPhase: 'ssh-or-missing-receipt', artifactSha: artifact.artifactSha }; }
  fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); fs.chmodSync(options.output, 0o600);
  process.stdout.write(JSON.stringify({ ok: result.ok === true, command: options.command, receipt: options.output, phase: result.phase, failedPhase: result.failedPhase }) + '\n');
  if (!result.ok) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch { process.stderr.write('Cutover input/identity validation failed; no credentials were printed.\n'); process.exitCode = 1; }
}
