// lab/release-files/restart-speed: DB91 clean-restart carry and the Worker dist resolve fast path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const release = path.join(here, 'release-files', 'restart-speed');
const BOOT = '11111111-2222-3333-4444-555555555555';

// The carry module imports ./db91-integrity-gate.mjs; give it V's gate bytes in a private dist.
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-speed-dist-'));
fs.copyFileSync(path.join(here, 'release-files', 'db91-shrink-reuse', 'db91-integrity-gate.mjs'), path.join(dist, 'db91-integrity-gate.mjs'));
fs.copyFileSync(path.join(release, 'dist', 'db91-restart-carry.mjs'), path.join(dist, 'db91-restart-carry.mjs'));
const gate = await import(pathToFileURL(path.join(dist, 'db91-integrity-gate.mjs')).href);
const carry = await import(pathToFileURL(path.join(dist, 'db91-restart-carry.mjs')).href);

function makeAgentDb(root, agentId = 'makaron') {
  const file = path.join(root, 'agents', agentId, 'agent', 'openclaw-agent.sqlite');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE schema_meta (meta_key TEXT PRIMARY KEY, role TEXT, agent_id TEXT, schema_version INTEGER); CREATE TABLE t (x); PRAGMA user_version = 19;");
  db.prepare("INSERT INTO schema_meta VALUES ('primary', 'agent', ?, 19)").run(agentId);
  db.prepare('INSERT INTO t VALUES (?)').run('a'.repeat(5000));
  db.close();
  return {kind: 'agent', label: 'OpenClaw agent database', path: file};
}

// One Gateway lifecycle as the bootstrap creates it: a private epoch directory under base.
function lifecycle(base, {bootId = BOOT, exitCode = 0, now = Date.now()} = {}) {
  const epoch = randomUUID();
  const directory = path.join(base, epoch);
  fs.mkdirSync(directory, {mode: 0o700});
  const env = {OPENCLAW_DB91_INTEGRITY_EPOCH: epoch, OPENCLAW_DB91_INTEGRITY_DIR: directory};
  let onExit;
  const {previousEpoch} = carry.beginLifecycle({base, epoch, directory, bootId, now, onExit: handler => {onExit = handler;}});
  return {epoch, directory, env, previousEpoch, exit: () => onExit(exitCode)};
}

// A full check completed inside a lifecycle, recorded the way the native verifier records it.
function verify(target, env, now = Date.now()) {
  const db = new DatabaseSync(target.path, {readOnly: true});
  try {
    const ticket = gate.beginVerification(db, target.path, 'makaron', {env});
    assert.equal(gate.recordSuccessfulVerification(db, target.path, 'makaron', {env, ticket, now}), true);
  } finally {db.close();}
}
function reusable(target, env) {
  const db = new DatabaseSync(target.path, {readOnly: true});
  try {return gate.readReusableVerification(db, target.path, 'makaron', {env});} finally {db.close();}
}
function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'restart-speed-state-')));
  const base = path.join(root, '.db91-integrity');
  fs.mkdirSync(base, {mode: 0o700});
  return {root, base, target: makeAgentDb(root)};
}

test('a clean restart on the same boot carries the receipt without refreshing it', () => {
  const {base, target} = setup();
  const checkedAt = Date.now() - 3_600_000;
  const first = lifecycle(base);
  verify(target, first.env, checkedAt);
  first.exit();
  const second = lifecycle(base);
  assert.equal(second.previousEpoch, first.epoch);
  const result = carry.carryVerifications({base, previousEpoch: second.previousEpoch, targets: [target], env: second.env, bootId: BOOT});
  assert.deepEqual([...result.carried], [target.path]);
  assert.equal(reusable(target, second.env), true, 'the new lifecycle reuses the carried check');
  const receipt = JSON.parse(fs.readFileSync(fs.readdirSync(second.directory).filter((f) => /^[a-f0-9]{64}\.json$/.test(f)).map((f) => path.join(second.directory, f))[0], 'utf8'));
  assert.equal(receipt.checkedAt, checkedAt, 'age keeps counting from the real full check');
  assert.equal(receipt.epoch, second.epoch);
  assert.equal(receipt.carriedFrom, first.epoch);
});

test('a crash, a reboot or a non-zero exit never carries', () => {
  for (const [name, options, after] of [
    ['crash (no exit handler ran)', {}, () => {}],
    ['non-zero exit', {exitCode: 1}, (l) => l.exit()],
  ]) {
    const {base, target} = setup();
    const first = lifecycle(base, options);
    verify(target, first.env);
    after(first);
    const second = lifecycle(base);
    const result = carry.carryVerifications({base, previousEpoch: second.previousEpoch, targets: [target], env: second.env, bootId: BOOT});
    assert.equal(result.carried.size, 0, name);
    assert.equal(result.reasons['*'], 'previous-exit-not-clean', name);
    assert.equal(reusable(target, second.env), false, name);
  }
  const {base, target} = setup();
  const first = lifecycle(base, {bootId: '99999999-2222-3333-4444-555555555555'});
  verify(target, first.env);
  first.exit();
  const second = lifecycle(base);
  const result = carry.carryVerifications({base, previousEpoch: second.previousEpoch, targets: [target], env: second.env, bootId: BOOT});
  assert.equal(result.reasons['*'], 'host-rebooted');
  assert.equal(carry.carryVerifications({base, previousEpoch: second.previousEpoch, targets: [target], env: second.env, bootId: null}).reasons['*'], 'boot-id-unavailable');
});

test('revocation, expiry and file replacement in the previous lifecycle block the carry', () => {
  const cases = {
    'no-receipt': (target, env) => gate.invalidateVerification(target.path, {env}),
    'receipt-revoked-or-foreign': (target, env) => { // revocation landed, receipt delete raced
      const receipt = fs.readdirSync(env.OPENCLAW_DB91_INTEGRITY_DIR).find((f) => /^[a-f0-9]{64}\.json$/.test(f));
      const saved = fs.readFileSync(path.join(env.OPENCLAW_DB91_INTEGRITY_DIR, receipt));
      gate.invalidateVerification(target.path, {env});
      fs.writeFileSync(path.join(env.OPENCLAW_DB91_INTEGRITY_DIR, receipt), saved, {mode: 0o600});
    },
    'receipt-expired': (target, env) => { // last full check older than the lifecycle limit
      const file = path.join(env.OPENCLAW_DB91_INTEGRITY_DIR, fs.readdirSync(env.OPENCLAW_DB91_INTEGRITY_DIR).find((f) => /^[a-f0-9]{64}\.json$/.test(f)));
      fs.writeFileSync(file, JSON.stringify({...JSON.parse(fs.readFileSync(file, 'utf8')), checkedAt: Date.now() - gate.MAX_AGE_MS - 60_000}), {mode: 0o600});
      assert.equal(reusable(target, env), false);
    },
    'identity-changed': (target) => { // replaced file: new inode and birth time
      const copy = target.path + '.copy';
      fs.copyFileSync(target.path, copy);
      fs.renameSync(copy, target.path);
    },
  };
  for (const [reason, mutate] of Object.entries(cases)) {
    const {base, target} = setup();
    const first = lifecycle(base);
    verify(target, first.env);
    mutate(target, first.env);
    first.exit();
    const second = lifecycle(base);
    const result = carry.carryVerifications({base, previousEpoch: second.previousEpoch, targets: [target], env: second.env, bootId: BOOT});
    assert.equal(result.carried.size, 0, reason);
    assert.equal(result.reasons[target.path], reason);
  }
});

test('a global revocation followed by a fresh full check is still reusable, as within the lifecycle', () => {
  const {base, target} = setup();
  const first = lifecycle(base);
  verify(target, first.env);
  gate.invalidateAllVerifications({env: first.env});
  assert.equal(reusable(target, first.env), false);
  verify(target, first.env);
  assert.equal(reusable(target, first.env), true);
  first.exit();
  const second = lifecycle(base);
  const result = carry.carryVerifications({base, previousEpoch: second.previousEpoch, targets: [target], env: second.env, bootId: BOOT});
  assert.deepEqual([...result.carried], [target.path]);
});

test('carry has a kill switch and a schema change is a different identity', () => {
  const {base, target} = setup();
  const first = lifecycle(base);
  verify(target, first.env);
  first.exit();
  const second = lifecycle(base);
  assert.equal(carry.carryVerifications({base, previousEpoch: second.previousEpoch, targets: [target], env: {...second.env, OPENCLAW_DB91_RESTART_CARRY: '0'}, bootId: BOOT}).reasons['*'], 'disabled');
  const db = new DatabaseSync(target.path);
  db.exec('CREATE TABLE added (y)');
  db.close();
  const result = carry.carryVerifications({base, previousEpoch: second.previousEpoch, targets: [target], env: second.env, bootId: BOOT});
  assert.equal(result.reasons[target.path], 'identity-changed');
});

test('the Worker fast path returns what Node would resolve, and only inside dist', async () => {
  const {resolveDistEsmFastPathUrl, installWorkerDistEsmResolveFastPath} = await import(pathToFileURL(path.join(release, 'production-worker', 'dist-esm-resolve-fast-path.mjs')).href);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'restart-speed-resolve-')));
  const distDir = path.join(root, 'openclaw', 'dist');
  fs.mkdirSync(path.join(distDir, 'plugin-sdk'), {recursive: true});
  fs.writeFileSync(path.join(distDir, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(distDir, 'chunk-a.js'), 'export const a = 1;');
  fs.writeFileSync(path.join(distDir, 'plugin-sdk', 'agent-runtime.js'), 'export {a} from "../chunk-a.js";');
  const distRootUrl = pathToFileURL(distDir).href + '/';
  const parentUrl = pathToFileURL(path.join(distDir, 'plugin-sdk', 'agent-runtime.js')).href;
  assert.equal(resolveDistEsmFastPathUrl({specifier: '../chunk-a.js', parentUrl, conditions: ['node', 'import'], distRootUrl}), import.meta.resolve(new URL('../chunk-a.js', parentUrl).href));
  for (const [specifier, from, conditions] of [
    ['../chunk-a.js', parentUrl, ['node', 'require']],
    ['node:fs', parentUrl, ['node', 'import']],
    ['openclaw/plugin-sdk', parentUrl, ['node', 'import']],
    ['../../outside.js', parentUrl, ['node', 'import']],
    ['./x.js', pathToFileURL(path.join(root, 'elsewhere.js')).href, ['node', 'import']],
    ['./x.mjs', parentUrl, ['node', 'import']],
  ]) assert.equal(resolveDistEsmFastPathUrl({specifier, parentUrl: from, conditions, distRootUrl}), null, specifier);
  const hooks = [];
  const agentRuntimeUrl = path.join(distDir, 'plugin-sdk', 'agent-runtime.js');
  assert.equal(installWorkerDistEsmResolveFastPath(agentRuntimeUrl, {registerHooks: (h) => hooks.push(h), execArgv: ['--import', 'x'], nodeOptions: '', env: {}}), null, 'another resolver hook keeps ownership');
  assert.equal(installWorkerDistEsmResolveFastPath(agentRuntimeUrl, {registerHooks: (h) => hooks.push(h), execArgv: [], nodeOptions: '', env: {OPENCLAW_WORKER_DIST_RESOLVE_FAST_PATH: '0'}}), null, 'kill switch');
  assert.equal(installWorkerDistEsmResolveFastPath(agentRuntimeUrl, {registerHooks: (h) => hooks.push(h), execArgv: [], nodeOptions: '', env: {}}), distRootUrl);
  assert.equal(hooks.length, 1);
  const next = (specifier) => ({url: 'next:' + specifier});
  assert.deepEqual(hooks[0].resolve('../chunk-a.js', {parentURL: parentUrl, conditions: ['node', 'import']}, next), {url: pathToFileURL(path.join(distDir, 'chunk-a.js')).href, format: 'module', shortCircuit: true});
  assert.deepEqual(hooks[0].resolve('openclaw/plugin-sdk', {parentURL: parentUrl, conditions: ['node', 'import']}, next), {url: 'next:openclaw/plugin-sdk'});
});

test('Worker and Gateway compile caches use the directory of OpenClaw\'s CLI entry', async () => {
  const {openClawCompileCacheDirectory, enableWorkerCompileCache} = await import(pathToFileURL(path.join(release, 'production-worker', 'compile-cache.mjs')).href);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'restart-speed-cc-')));
  const install = path.join(root, 'openclaw');
  fs.mkdirSync(path.join(install, 'dist', 'plugin-sdk'), {recursive: true});
  fs.writeFileSync(path.join(install, 'package.json'), '{"version":"2026.9.1"}');
  fs.writeFileSync(path.join(install, 'dist', 'plugin-sdk', 'agent-runtime.js'), '');
  const stat = fs.statSync(path.join(install, 'package.json'));
  const expected = path.join(root, 'cc', 'openclaw', '2026.9.1', `${Math.trunc(stat.mtimeMs)}-${stat.size}`);
  assert.equal(openClawCompileCacheDirectory(install, {NODE_COMPILE_CACHE: path.join(root, 'cc')}), expected);
  const calls = [];
  const enable = (dir) => { calls.push(dir); return {status: 1, directory: dir}; };
  assert.equal(enableWorkerCompileCache(path.join(install, 'dist', 'plugin-sdk', 'agent-runtime.js'), {env: {NODE_COMPILE_CACHE: path.join(root, 'cc')}, enable}).status, 'enabled');
  assert.deepEqual(calls, [expected]);
  assert.equal(enableWorkerCompileCache(path.join(install, 'dist', 'plugin-sdk', 'agent-runtime.js'), {env: {NODE_DISABLE_COMPILE_CACHE: '1'}, enable}).status, 'disabled');
  assert.equal(enableWorkerCompileCache(path.join(install, 'dist', 'plugin-sdk', 'agent-runtime.js'), {env: {OPENCLAW_WORKER_COMPILE_CACHE: '0'}, enable}).status, 'disabled');
  fs.mkdirSync(path.join(install, '.git'));
  assert.equal(enableWorkerCompileCache(path.join(install, 'dist', 'plugin-sdk', 'agent-runtime.js'), {env: {}, enable}).status, 'source-checkout');
  assert.equal(enableWorkerCompileCache(path.join(root, 'missing.js'), {env: {}, enable}).status, 'error');
  assert.equal(calls.length, 1);
});

test('the Gateway entry enables the compile cache only as the main module, and changes nothing else', () => {
  const before = fs.readFileSync(path.join(here, '..', 'release', 'captured', 'codex-firsttext-20261008', 'dist', 'index.js'), 'utf8').split('\n');
  const after = fs.readFileSync(path.join(release, 'dist', 'index.js'), 'utf8').split('\n');
  const removed = before.filter((l) => !after.includes(l));
  assert.deepEqual(removed, [], 'no original line removed or changed');
  const added = after.slice(0);
  for (const l of before) added.splice(added.indexOf(l), 1);
  assert.ok(added.some((l) => l.includes('ocEnableCompileCache(ocPath.join(ocBase, "openclaw"')));
  assert.ok(added.some((l) => l.includes('ocIsMain &&')));
  assert.ok(added.every((l) => !/await import|runLegacyCliEntry|bootstrapGatewayIntegrity/.test(l)), 'no new import or control flow beyond the cache');
});

test('release files are exactly the patches applied to the bytes V runs', async () => {
  const {createHash} = await import('node:crypto');
  const sha = (v) => createHash('sha256').update(v).digest('hex');
  const files = JSON.parse(fs.readFileSync(path.join(release, 'files.json'), 'utf8'));
  for (const f of files) assert.equal(sha(fs.readFileSync(path.join(here, '..', f.source))), f.after, f.source);
  const {patchWorker} = await import('./patch-restart-speed-worker.mjs');
  const {patchAgentCommandChunk} = await import('./patch-restart-speed-agent-command.mjs');
  const {patchGatewayIndex} = await import('./patch-restart-speed-gateway-index.mjs');
  const worker = fs.readFileSync(path.join(here, 'release-files', 'worker-prewarm-contention-retry', 'worker.mjs'), 'utf8');
  assert.equal(patchWorker(worker), fs.readFileSync(path.join(release, 'production-worker', 'worker.mjs'), 'utf8'));
  assert.throws(() => patchWorker(patchWorker(worker)), /already/);
  const command = fs.readFileSync(path.join(here, 'release-files', 'worker-prewarm-session-keys', 'agent-command-DPfawBbr.js'), 'utf8');
  const patched = patchAgentCommandChunk(command);
  assert.equal(patched, fs.readFileSync(path.join(release, 'dist', 'agent-command-DPfawBbr.js'), 'utf8'));
  const added = patched.split('\n').filter((l) => !command.split('\n').includes(l));
  assert.ok(added.some((l) => l.includes('=== "await" ? await prewarmSecretsRuntimeSnapshot() : startSecretsRuntimeSnapshot()')), 'blocking step only on request');
  assert.ok(added.some((l) => l.includes('void prewarmSecretsRuntimeSnapshot().catch(() => {});')), 'started step cannot reject unhandled');
  const index = fs.readFileSync(path.join(here, '..', 'release', 'captured', 'codex-firsttext-20261008', 'dist', 'index.js'), 'utf8');
  assert.equal(patchGatewayIndex(index), fs.readFileSync(path.join(release, 'dist', 'index.js'), 'utf8'));
});
