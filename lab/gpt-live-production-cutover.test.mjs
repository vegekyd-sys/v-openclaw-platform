import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  artifactIdentity, digest, execStartIdentity, assertArtifactBinding, assertHashes, assertServiceIdentity,
  assertSameGateway, assertRtcIdentity, summarizeWorkers, idleSnapshot, assertIdle, remoteSource, parseArgs, shellQuote,
} from './gpt-live-production-cutover.mjs';
import { acquireIdleFence } from './shared/lifecycle.mjs';

const rawArtifact = () => ({ branch: 'dev', sourceCommit: 'a'.repeat(40), files: Array.from({ length: 22 }, (_, i) => ({
  target: (i === 21 ? 'production-worker/' : 'openclaw/dist/') + `fixture-${i}.mjs`,
  before: i === 0 ? null : 'b'.repeat(64), after: digest('fixture ' + i), content: Buffer.from('fixture ' + i).toString('base64'),
})) });
const artifact = () => artifactIdentity(Buffer.from(JSON.stringify(rawArtifact())));
const gateway = () => ({ unit: 'openclaw-gateway.service', pid: 400, invocation: 'c'.repeat(32), core: '/opt/release/core',
  node: '/opt/node/bin/node', uid: 977, gid: 972, configPath: '/home/openclaw/.openclaw/openclaw.json',
  configSha: 'd'.repeat(64), execStartSha: 'e'.repeat(64), stopPolicySha: 'f'.repeat(64) });
const workers = () => ({ pending: 0, workers: [{ ready: true, activeCount: 0, queued: 0, detachedTaskCount: 0 }] });
const binding = value => ({ schema: 'gpt-live-production-cutover-v1', ...value });

test('ExecStart identity excludes systemd runtime PID/timestamps but binds the configured executable and args', () => {
  const command = extra => `{ path=/opt/node/bin/node ; argv[]=/opt/node/bin/node /opt/release/core/dist/index.js gateway ; ignore_errors=no ; ${extra} }`;
  const before = command('start_time=[old] ; stop_time=[n/a] ; pid=400 ; code=(null) ; status=0/0');
  const after = command('start_time=[new] ; stop_time=[n/a] ; pid=900 ; code=(null) ; status=0/0');
  assert.equal(execStartIdentity(before), execStartIdentity(after));
  assert.notEqual(execStartIdentity(before), execStartIdentity(after.replace('/opt/release/core', '/opt/other/core')));
  assert.throws(() => execStartIdentity('missing command fields'));
  assert.throws(() => execStartIdentity(before + ' ; ' + after));
});

test('canonical artifact freezes all 22 targets, content hashes, and raw artifact identity without retaining bytes', () => {
  const value = artifact(); assert.equal(value.files.length, 22); assert.equal(value.sourceCommit, 'a'.repeat(40));
  assert(!JSON.stringify(value).includes('content')); assertArtifactBinding(binding(value), value);
  const altered = { ...value, artifactSha: '0'.repeat(64) }; assert.throws(() => assertArtifactBinding(binding(value), altered), /artifact changed/u);
  assert.throws(() => assertArtifactBinding({ ...binding(value), files: value.files.slice(1) }, value), /mapping/u);
});

test('reject PR artifacts, partial maps, payload mismatch, duplicates, traversal, credentials, and unknown namespaces', () => {
  for (const mutate of [
    value => { value.branch = 'task'; }, value => { value.files.pop(); }, value => { value.files[0].content = Buffer.from('other').toString('base64'); },
    value => { value.files[1].target = value.files[0].target; }, value => { value.files[0].target = 'openclaw/../bad.mjs'; },
    value => { value.files[0].target = 'openclaw/auth.json'; }, value => { value.files[0].target = 'codex-host/file.mjs'; },
  ]) { const value = rawArtifact(); mutate(value); assert.throws(() => artifactIdentity(Buffer.from(JSON.stringify(value)))); }
});

test('hash side guard treats a missing before file as identity and rejects mixed/partial maps', () => {
  const value = artifact(), before = value.files.map(file => ({ target: file.target, sha: file.before }));
  assertHashes(before, value, 'before'); assert.throws(() => assertHashes(before, value, 'after'), /bytes differ/u);
  assert.throws(() => assertHashes(before.slice(1), value, 'before'), /incomplete/u);
  assert.throws(() => assertHashes(before.map((file, i) => i === 0 ? { ...file, sha: 'b'.repeat(64) } : file), value, 'before'), /bytes differ/u);
});

test('stop identity rejects PID/invocation/config/core/unit drift and unavailable UID', () => {
  const expected = gateway(); assertSameGateway(expected, gateway());
  for (const [key, value] of [['pid', 401], ['invocation', '1'.repeat(32)], ['configSha', '1'.repeat(64)], ['core', '/opt/other/core'], ['execStartSha', '1'.repeat(64)], ['stopPolicySha', '1'.repeat(64)], ['uid', undefined]])
    assert.throws(() => assertSameGateway(expected, { ...gateway(), [key]: value }));
  assert.throws(() => assertServiceIdentity({ ...gateway(), pid: 0 }));
});

test('start requires PID zero and source/config continuity, then permits only process identity replacement', () => {
  const stopped = { ...gateway(), pid: 0, invocation: '' };
  assertSameGateway(stopped, stopped, { running: false });
  assert.throws(() => assertSameGateway(stopped, gateway(), { running: false }));
  assertSameGateway(stopped, { ...gateway(), pid: 900, invocation: '9'.repeat(32) }, { sameProcess: false });
  assert.throws(() => assertSameGateway(stopped, { ...gateway(), configSha: '9'.repeat(64) }, { sameProcess: false }));
});

test('idle snapshot pages every native session and catches a late active run without retaining keys', async () => {
  const calls = [];
  const snapshot = await idleSnapshot(async (method, args) => {
    calls.push({ method, args });
    if (method === 'health') return { ok: true };
    if (method === 'vlab.workers.status') return workers();
    if (!args.offset) return { sessions: [{ key: 'private session' }], hasMore: true, nextOffset: 500 };
    return { sessions: [{ key: 'another private session', hasActiveRun: true }], hasMore: false };
  });
  assert.equal(snapshot.activeSessions, 1); assert.throws(() => assertIdle(snapshot), /active or queued/u);
  assert.equal(calls.at(-1).args.offset, 500); assert(!JSON.stringify(snapshot).includes('private'));
});

test('session pagination and Worker health fail closed instead of concluding idle from missing state', async () => {
  const base = async method => method === 'health' ? { ok: true } : workers();
  await assert.rejects(idleSnapshot(async (method, args) => method === 'sessions.list' ? { sessions: [], hasMore: true, nextOffset: args.offset } : base(method)), /advance/u);
  await assert.rejects(idleSnapshot(async method => method === 'sessions.list' ? { sessions: [] } : base(method)), /pagination/u);
  assert.throws(() => summarizeWorkers({ ok: true }, { pending: 0, workers: [] }), /readiness/u);
  assert.throws(() => summarizeWorkers({ ok: true }, { pending: 0, workers: [{ activeCount: 0 }] }), /activity/u);
  const idle = { ...summarizeWorkers({ ok: true }, workers()), activeSessions: 0 }; assertIdle(idle);
  for (const key of ['pending', 'workerActive', 'queued', 'detached', 'activeSessions']) assert.throws(() => assertIdle({ ...idle, [key]: 1 }));
  assert.throws(() => assertIdle({ ...idle, workersReady: false }));
  assert.throws(() => assertIdle({ ...idle, eventLoopDegraded: true }));
});

test('native drain timeout resumes admission and never gives the caller a stop-ready fence', async () => {
  const seen = []; let now = 0;
  const call = async (method, args) => {
    seen.push({ method, args });
    if (method === 'vlab.workers.status') return workers();
    if (method === 'gateway.suspend.prepare') return { suspensionId: 'private fence' };
    if (method === 'gateway.suspend.status') return { status: 'draining', expiresAtMs: 100000, activeCount: 1 };
    return {};
  };
  await assert.rejects(acquireIdleFence(call, 'test', { now: () => now, timeoutMs: 45000, sleep: async () => { now += 45000; } }), /deferred/u);
  assert.equal(seen.at(-1).method, 'gateway.suspend.resume');
  assert(!seen.some(item => item.method.includes('stop')));
});

test('native ready must have over five seconds admission validity; missing ready never passes', async () => {
  for (const status of [{ status: 'ready', expiresAtMs: 5000 }, { status: 'running', expiresAtMs: 99999 }]) {
    let resumed = false;
    await assert.rejects(acquireIdleFence(async method => {
      if (method === 'vlab.workers.status') return workers();
      if (method === 'gateway.suspend.prepare') return { suspensionId: 'id' };
      if (method === 'gateway.suspend.status') return status;
      resumed = true; return {};
    }, 'test', { now: () => 0 })); assert(resumed);
  }
  assert.equal((await acquireIdleFence(async method => method === 'vlab.workers.status' ? workers()
    : method === 'gateway.suspend.prepare' ? { suspensionId: 'id' } : { status: 'ready', expiresAtMs: 6000 }, 'test', { now: () => 0 })).suspensionId, 'id');
});

test('RTC restore identity tolerates lifecycle state changes but rejects changed command/unit bytes', () => {
  const expected = { unit: 'openclaw-rtc-h5.service', activeState: 'active', loadState: 'loaded', execStartSha: 'a', definitionSha: 'b' };
  assertRtcIdentity(expected, { ...expected, activeState: 'inactive', pid: 0 });
  assert.throws(() => assertRtcIdentity(expected, { ...expected, execStartSha: 'other' }));
  assert.throws(() => assertRtcIdentity(expected, { ...expected, definitionSha: 'other' }));
});

test('CLI requires explicit prior private receipt and generated remote module passes syntax without execution', () => {
  assert.equal(parseArgs(['inspect', '--artifact', 'a.json', '--output', 'i.json']).command, 'inspect');
  assert.throws(() => parseArgs(['stop', '--artifact', 'a.json', '--output', 's.json']));
  assert.throws(() => parseArgs(['inspect', '--artifact', 'a.json', '--expected', 'i.json', '--output', 's.json']));
  assert.throws(() => parseArgs(['start', '--artifact', 'a.json', '--expected', 's.json', '--output', 'r.json', '--output', 'other.json']));
  const source = remoteSource(); execFileSync(process.execPath, ['--check', '--input-type=module'], { input: source });
  assert(source.includes(acquireIdleFence.toString()));
  assert(source.includes("['stop', '--no-block', GATEWAY_UNIT]")); assert(source.includes("['start', '--no-block', RTC_UNIT]"));
  assert(!source.includes('process.kill(') && !source.includes("run('kill'")); assert(!source.includes("['restart'"));
  const bootstrap = "const quoted='node:child_process'; const literal='$(unused)`unused`';";
  assert.equal(execFileSync('/bin/sh', ['-c', 'printf %s ' + shellQuote(bootstrap)]).toString(), bootstrap);
});
