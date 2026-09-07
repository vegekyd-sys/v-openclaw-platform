import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {isGatewayServer, collectAgentTargets, runPreflight, bootstrapGatewayIntegrity} from './bootstrap.mjs';
import {readReusableVerification, beginVerification, finishVerification, publishVerificationProof, invalidateVerification, invalidateAllVerifications, assertNotRevoked} from './gate.mjs';
const exec = promisify(execFile);
const worker = fileURLToPath(new URL('./fixture-verify-worker.mjs', import.meta.url));
const opener = fileURLToPath(new URL('./fixture-open-client.mjs', import.meta.url));

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'db91-bootstrap-test-')));
  const dir = path.join(root, 'gate'); fs.mkdirSync(dir, {mode: 0o700});
  const filename = path.join(root, 'agent.sqlite');
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA user_version=19; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE schema_meta(meta_key TEXT PRIMARY KEY, role TEXT, agent_id TEXT, schema_version INTEGER); INSERT INTO schema_meta VALUES('primary','agent','lab',19); CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));");
  const env = {...process.env, OPENCLAW_DB91_INTEGRITY_DIR: dir, OPENCLAW_DB91_INTEGRITY_EPOCH: randomUUID()};
  const targets = [{kind: 'agent', label: 'synthetic only', path: filename}];
  t.after(() => {if (db.isOpen) db.close(); fs.rmSync(root, {recursive: true, force: true});});
  return {root, dir, filename, db, env, targets};
}

test('preflight is restricted to server startup, not health/status/client commands', () => {
  const argv = (...args) => ['node', '/runtime/dist/index.js', ...args];
  for (const args of [['gateway'], ['gateway', 'run'], ['gateway', '--port', '26300'], ['gateway', '--bind', 'loopback', '--port', '26300', 'run']]) assert.equal(isGatewayServer(argv(...args)), true);
  for (const args of [['gateway', 'health'], ['gateway', '--port', '26300', 'health'], ['gateway', '--json', 'status'], ['agent', '--message', 'gateway'], ['--version']]) assert.equal(isGatewayServer(argv(...args)), false);
});

test('disabled preflight does not touch state', async () => {
  assert.deepEqual(await bootstrapGatewayIntegrity({env: {}, argv: ['node', 'index', 'gateway']}), {enabled: false});
});

test('full preflight completes before five cold client processes reuse the result', async t => {
  const f = fixture(t), counter = path.join(f.root, 'checks.log');
  const env = {...f.env, DB91_TEST_COUNTER_FILE: counter};
  await runPreflight(worker, f.targets, {env, timeoutMs: 5000});
  const outputs = await Promise.all([1,2,3,4,5].map(id => exec(process.execPath, [opener, f.filename, String(id)], {env, timeout: 5000})));
  for (const output of outputs) {const stats = JSON.parse(output.stdout); assert.equal(stats.full, 0); assert.equal(stats.reused, 1);}
  assert.equal(fs.readFileSync(counter, 'utf8').trim(), 'full');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM parent').get().n, 5);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM child').get().n, 5);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
});

for (const behavior of ['crash', 'omit', 'duplicate', 'bad-exit', 'hang']) test('preflight does not admit Gateway after ' + behavior, async t => {
  const f = fixture(t);
  await assert.rejects(runPreflight(worker, f.targets, {env: {...f.env, DB91_TEST_WORKER_BEHAVIOR: behavior}, timeoutMs: behavior === 'hang' ? 100 : 5000}));
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), false);
});

test('foreign-key damage rejects startup and cannot produce reusable success', async t => {
  const f = fixture(t); f.db.exec('PRAGMA foreign_keys=OFF; INSERT INTO child VALUES(1,99)');
  await assert.rejects(runPreflight(worker, f.targets, {env: f.env, timeoutMs: 5000}), /rejected/);
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), false);
});

test('a failed sibling database prevents publishing partial preflight success', async t => {
  const f = fixture(t);
  const targets = [...f.targets, {kind: 'agent', label: 'missing', path: path.join(f.root, 'missing.sqlite')}];
  await assert.rejects(runPreflight(worker, targets, {env: f.env, timeoutMs: 5000}));
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), false);
});

test('late child proof cannot undo new invalidation', t => {
  const f = fixture(t);
  const ticket = beginVerification(f.db, f.filename, 'lab', {env: f.env});
  const proof = finishVerification(f.db, f.filename, 'lab', {env: f.env, ticket});
  invalidateVerification(f.filename, {env: f.env});
  assert.equal(publishVerificationProof(proof, f.filename, {env: f.env}), false);
  assert.throws(() => assertNotRevoked(f.filename, {env: f.env}));
});

test('exclusive maintenance revokes every cached process result', async t => {
  const f = fixture(t);
  await runPreflight(worker, f.targets, {env: f.env, timeoutMs: 5000});
  invalidateAllVerifications({env: f.env});
  assert.throws(() => assertNotRevoked(f.filename, {env: f.env}));
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), false);
  await runPreflight(worker, f.targets, {env: f.env, timeoutMs: 5000});
  assert.doesNotThrow(() => assertNotRevoked(f.filename, {env: f.env}));
});

test('target collection is explicit and never creates database files', t => {
  const f = fixture(t);
  const config = path.join(f.root, 'openclaw.json');
  fs.writeFileSync(config, JSON.stringify({agents: {entries: {lab: {agentDir: f.root}}}}));
  fs.copyFileSync(f.filename, path.join(f.root, 'openclaw-agent.sqlite'));
  const targets = collectAgentTargets(f.root, config);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].path, path.join(f.root, 'openclaw-agent.sqlite'));
});
