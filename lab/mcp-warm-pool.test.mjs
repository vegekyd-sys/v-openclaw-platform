import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WARM_POOL_MARKER, patchMcpWarmPool } from './patch-mcp-warm-pool.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const original = read('release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist/agents/agent-bundle-mcp-runtime.js');
const release = read('lab/release-files/mcp-warm-pool/agents/agent-bundle-mcp-runtime.js');

test('release is V\'s captured runtime through the patch, and the patch is idempotent', () => {
  assert.equal(sha(original), '7971447cf4e11d0fcc8e4b0c729085101bbc45c77a8f1ede1eb5f6c343769354');
  assert.equal(patchMcpWarmPool(original), release);
  assert.equal(patchMcpWarmPool(release), release);
  assert.equal(release.split(WARM_POOL_MARKER).length, 2);
  // requester-scoped runtimes and connection overrides never use a spare
  assert.match(release, /const warmKey = !override && params\.requesterScope === void 0 \? bundleMcpWarmPoolKey\(/);
  // a new session without a spare is built exactly as before
  assert.match(release, /const client = warmSpare \? warmSpare\.client : new Client\(\{\n\t+name: "openclaw-bundle-mcp",/);
  assert.match(release, /connected: Boolean\(warmSpare\),/);
});

// ---- the pool region, compiled against fakes ----
function poolRegion() {
  const from = release.indexOf(WARM_POOL_MARKER);
  const to = release.indexOf('function createSessionMcpRuntime(params) {');
  assert(from > 0 && to > from);
  return release.slice(from, to);
}
class FakeChild {
  constructor() { this.refs = 0; this.stdin = this.mkStream(); this.stdout = this.mkStream(); this.stderr = this.mkStream(); }
  mkStream() { return { ref: () => { this.refs += 1; }, unref: () => { this.refs -= 1; } }; }
  ref() { this.refs += 1; }
  unref() { this.refs -= 1; }
}
function harness() {
  const connects = [];
  const disposed = [];
  const warnings = [];
  let pid = 100;
  class Client {
    constructor(info, options) { this.info = info; this.options = options; }
  }
  const connectMcpClient = ({ client, transport, timeoutMs }) => new Promise((resolve, reject) => {
    transport.process = new FakeChild();
    transport.pid = ++pid;
    connects.push({ client, transport, timeoutMs, resolve, reject });
  });
  const api = new Function('Client', 'createHash', 'buildMcpClientOptions', 'createMcpJsonSchemaValidator', 'connectMcpClient', 'disposeBundleMcpSession', 'logWarn', 'redactMcpDiagnosticError',
    `${poolRegion()}\nreturn { bundleMcpWarmPoolSize, bundleMcpWarmPoolKey, takeBundleMcpWarmSpare, sweepBundleMcpWarmPools, bundleMcpWarmPoolStateForTest, closeBundleMcpWarmPoolsForTest };`)(
    Client, createHash, (apps) => ({ capabilities: apps ? { apps: true } : {} }), () => ({}), connectMcpClient,
    async (session) => { disposed.push(session); }, (message) => warnings.push(message), (error) => String(error?.message ?? error));
  return { api, connects, disposed, warnings };
}
const launch = (env = { A: '1' }) => ({ transportType: 'stdio', connectionTimeoutMs: 30000, transport: { serverParams: { command: 'node', args: ['server.mjs'], env, cwd: '/w', stderr: 'pipe' } }, detachStderr: () => {} });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('pool size and key: default 2, switch off, only stdio, key covers the launch', () => {
  const saved = process.env.OPENCLAW_BUNDLE_MCP_WARM_POOL;
  try {
    const { api } = harness();
    delete process.env.OPENCLAW_BUNDLE_MCP_WARM_POOL;
    assert.equal(api.bundleMcpWarmPoolSize(), 2);
    process.env.OPENCLAW_BUNDLE_MCP_WARM_POOL = '4';
    assert.equal(api.bundleMcpWarmPoolSize(), 4);
    process.env.OPENCLAW_BUNDLE_MCP_WARM_POOL = '99';
    assert.equal(api.bundleMcpWarmPoolSize(), 2);
    process.env.OPENCLAW_BUNDLE_MCP_WARM_POOL = '0';
    assert.equal(api.bundleMcpWarmPoolSize(), 0);
    assert.equal(api.bundleMcpWarmPoolKey('voice-memory', launch(), false), undefined);
    delete process.env.OPENCLAW_BUNDLE_MCP_WARM_POOL;
    const key = api.bundleMcpWarmPoolKey('voice-memory', launch(), false);
    assert.match(key, /^[0-9a-f]{64}$/);
    assert.equal(api.bundleMcpWarmPoolKey('voice-memory', launch(), false), key);
    assert.notEqual(api.bundleMcpWarmPoolKey('voice-memory', launch({ A: '2' }), false), key);
    assert.notEqual(api.bundleMcpWarmPoolKey('other', launch(), false), key);
    assert.notEqual(api.bundleMcpWarmPoolKey('voice-memory', launch(), true), key);
    assert.equal(api.bundleMcpWarmPoolKey('remote', { ...launch(), transportType: 'streamable-http' }, false), undefined);
  } finally {
    if (saved === undefined) delete process.env.OPENCLAW_BUNDLE_MCP_WARM_POOL;
    else process.env.OPENCLAW_BUNDLE_MCP_WARM_POOL = saved;
  }
});

test('first use misses and refills; later uses get distinct connected spares; each use refills', async () => {
  const { api, connects } = harness();
  const key = api.bundleMcpWarmPoolKey('voice-memory', launch(), false);
  let resolves = 0;
  const resolveTransport = () => { resolves += 1; return launch(); };
  assert.equal(api.takeBundleMcpWarmSpare(key, 'voice-memory', false, resolveTransport), undefined);
  await tick();
  assert.equal(connects.length, 2);
  assert.equal(resolves, 2);
  assert.equal(connects[0].timeoutMs, 30000);
  assert.equal(connects[0].client.info.name, 'openclaw-bundle-mcp');
  assert.equal(connects[0].client.options.listChanged.tools.autoRefresh, false);
  // still connecting: not handed out
  assert.equal(api.takeBundleMcpWarmSpare(key, 'voice-memory', false, resolveTransport), undefined);
  for (const c of connects) c.resolve();
  await tick();
  assert.deepEqual(api.bundleMcpWarmPoolStateForTest(), [{ serverName: 'voice-memory', spares: 2, connected: 2, failures: 0 }]);
  // idle spares are unref'd so they never hold the process open
  assert.equal(connects[0].transport.process.refs, -4);
  const a = api.takeBundleMcpWarmSpare(key, 'voice-memory', false, resolveTransport);
  const b = api.takeBundleMcpWarmSpare(key, 'voice-memory', false, resolveTransport);
  assert(a && b && a !== b && a.client !== b.client && a.transport.pid !== b.transport.pid);
  assert.equal(a.connected, true);
  assert.equal(a.transport.process.refs, 0, 'adopted spare is ref\'d again');
  // adopting rewires list-changed to the adopting runtime
  let changed = 0;
  a.handlers.onChanged = () => { changed += 1; };
  a.client.options.listChanged.tools.onChanged();
  assert.equal(changed, 1);
  await tick();
  assert.equal(connects.length, 4, 'refilled back to 2');
  api.closeBundleMcpWarmPoolsForTest();
});

test('a spare that closes before adoption is dropped, never handed out', async () => {
  const { api, connects } = harness();
  const key = api.bundleMcpWarmPoolKey('voice-memory', launch(), false);
  api.takeBundleMcpWarmSpare(key, 'voice-memory', false, () => launch());
  await tick();
  for (const c of connects) c.resolve();
  await tick();
  connects[0].client.onclose();
  connects[1].client.onclose();
  assert.equal(api.takeBundleMcpWarmSpare(key, 'voice-memory', false, () => launch()), undefined);
  api.closeBundleMcpWarmPoolsForTest();
});

test('start failures stop refilling after 3, and runtimes fall back to their own start', async () => {
  const { api, connects, warnings, disposed } = harness();
  const key = api.bundleMcpWarmPoolKey('voice-memory', launch(), false);
  api.takeBundleMcpWarmSpare(key, 'voice-memory', false, () => launch());
  await tick();
  for (const c of connects.splice(0)) c.reject(new Error('spawn ENOENT'));
  await tick();
  api.takeBundleMcpWarmSpare(key, 'voice-memory', false, () => launch());
  await tick();
  for (const c of connects.splice(0)) c.reject(new Error('spawn ENOENT'));
  await tick();
  assert.equal(api.bundleMcpWarmPoolStateForTest()[0].failures >= 3, true);
  assert.equal(api.takeBundleMcpWarmSpare(key, 'voice-memory', false, () => launch()), undefined);
  await tick();
  assert.equal(connects.length, 0, 'no more spawns');
  assert(warnings.every((w) => w.includes('warm spare for server "voice-memory" failed to start')));
  assert(disposed.length >= 3);
  api.closeBundleMcpWarmPoolsForTest();
});

test('a launch that resolves differently from its key stops the pool for that key', async () => {
  const { api, connects } = harness();
  const key = api.bundleMcpWarmPoolKey('voice-memory', launch(), false);
  api.takeBundleMcpWarmSpare(key, 'voice-memory', false, () => launch({ A: 'changed' }));
  await tick();
  assert.equal(connects.length, 0);
  api.closeBundleMcpWarmPoolsForTest();
});

test('keys unused for 10 minutes have their spares closed', async () => {
  const { api, connects, disposed } = harness();
  const key = api.bundleMcpWarmPoolKey('voice-memory', launch(), false);
  api.takeBundleMcpWarmSpare(key, 'voice-memory', false, () => launch());
  await tick();
  for (const c of connects) c.resolve();
  await tick();
  api.sweepBundleMcpWarmPools(Date.now() + 599_000);
  assert.equal(api.bundleMcpWarmPoolStateForTest().length, 1);
  api.sweepBundleMcpWarmPools(Date.now() + 601_000);
  assert.equal(api.bundleMcpWarmPoolStateForTest().length, 0);
  assert.equal(disposed.length, 2);
});
