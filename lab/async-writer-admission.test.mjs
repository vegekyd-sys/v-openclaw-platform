import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {waitForAgentDatabaseWriterAdmission} from './release-files/async-writer-admission/agent-db-writer-admission-wait.mjs';
import {ADMISSION_MARKER, patchBuiltinChunk, patchSessionEntryChunk} from './patch-async-writer-admission.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.dirname(here);
const sha = value => createHash('sha256').update(value).digest('hex');
const base = path.join(repo, 'release/captured/v2026.9.1-db91.6-workboard-incremental-sweep-20261006/dist/session-accessor.sqlite-entry-BlklNPKQ.js');
const built = path.join(here, 'release-files/async-writer-admission/session-accessor.sqlite-entry-BlklNPKQ.js');

const acquire = (filename, {busyTimeoutMs}) => {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA busy_timeout=${busyTimeoutMs}`);
  try {
    db.exec('BEGIN EXCLUSIVE');
  } catch (error) {
    db.close();
    if ((error?.errcode & 255) === 5) return null;
    throw error;
  }
  return {release() { db.exec('ROLLBACK'); db.close(); }};
};

function tempDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-admission-'));
  return path.join(dir, 'openclaw-agent.sqlite');
}

test('release file is exactly the patched V chunk and the patch applies once', () => {
  const original = fs.readFileSync(base, 'utf8');
  assert.equal(sha(original), '6b12190ca8e975ea6c8bce6703af805e01a1ef492e83f4829a6fe0f90669d96b');
  const patched = patchSessionEntryChunk(original);
  assert.equal(fs.readFileSync(built, 'utf8'), patched);
  assert.throws(() => patchSessionEntryChunk(patched), /already patched/);
  assert.equal(patched.split('await awaitAgentDatabaseWriterAdmission(').length - 1, 2);
  // Each wait sits directly before the native retry, so the lease is never held across it.
  assert.match(patched, /await awaitAgentDatabaseWriterAdmission\(database, resolved\);\n\t\tawait withSqliteBeginContentionRetry\(\{/);
  assert.match(patched, /await awaitAgentDatabaseWriterAdmission\(owner\.database, owner\.scope\);\n\t\t\t\treturn withSqliteBeginContentionRetry\(/);
  assert.ok(patched.includes(ADMISSION_MARKER));
});

test('builtin release file awaits admission before the sync heartbeat claim', () => {
  const builtinBase = path.join(repo, 'release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist/builtin-openclaw-zQV8Wwjr.js');
  const original = fs.readFileSync(builtinBase, 'utf8');
  assert.equal(sha(original), '8445647093325217ee80f83b1fd34b5a01f2322adbb495732d576d2d40d75af1');
  const patched = patchBuiltinChunk(original);
  assert.equal(fs.readFileSync(path.join(here, 'release-files/async-writer-admission/builtin-openclaw-zQV8Wwjr.js'), 'utf8'), patched);
  assert.throws(() => patchBuiltinChunk(patched), /already patched/);
  assert.equal(patched.split('claimHeartbeatOutcomeForRun({').length - 1, 0);
  assert.match(patched, /buildHeartbeatOutcomeContext\(await claimHeartbeatOutcomeForRunAfterWriterAdmission\(\{/);
  // The wrapper still runs the unchanged sync claim, after the advisory wait.
  assert.match(patched, /\t\} catch \{\}\n\treturn claimHeartbeatOutcomeForRun\(params\);\n\}/);
  // Nothing else in the chunk changes.
  const start = patched.indexOf('import { c as heartbeatAdmissionResolveSqliteScope');
  const end = patched.indexOf('\treturn claimHeartbeatOutcomeForRun(params);\n}\n') + '\treturn claimHeartbeatOutcomeForRun(params);\n}\n'.length;
  const restored = (patched.slice(0, start) + patched.slice(end))
    .replace('await claimHeartbeatOutcomeForRunAfterWriterAdmission({', 'claimHeartbeatOutcomeForRun({');
  assert.equal(restored, original);
});

test('free lease is probed once and released', async () => {
  const databasePath = tempDatabasePath();
  let calls = 0;
  const result = await waitForAgentDatabaseWriterAdmission(databasePath, {acquire: (...args) => { calls += 1; return acquire(...args); }});
  assert.equal(result, 'free');
  assert.equal(calls, 1);
  const again = acquire(databasePath + '.session-writer-coordinator', {busyTimeoutMs: 0});
  assert.ok(again, 'probe must not keep the lease');
  again.release();
});

test('held lease is waited out on the event loop, then admitted', async () => {
  let clock = 0, attempts = 0;
  const sleeps = [];
  const result = await waitForAgentDatabaseWriterAdmission('/tmp/does-not-matter.sqlite', {
    acquire: () => (++attempts < 4 ? null : {release() {}}),
  }, {now: () => clock, sleep: async ms => { sleeps.push(ms); clock += ms; }});
  assert.equal(result, 'waited');
  assert.equal(attempts, 4);
  assert.equal(sleeps.length, 3);
  assert.ok(sleeps.every(ms => ms > 0 && ms <= 56));
});

test('gives up at the wait budget and leaves the error to the sync path', async () => {
  let clock = 0;
  const result = await waitForAgentDatabaseWriterAdmission('/tmp/x.sqlite', {acquire: () => null, maxWaitMs: 200},
    {now: () => clock, sleep: async ms => { clock += ms; }});
  assert.equal(result, 'timeout');
  assert.ok(clock >= 200 && clock < 260);
});

test('skips held, incognito, relative, unsafe and disabled cases; never throws', async () => {
  const never = () => { throw new Error('must not acquire'); };
  assert.equal(await waitForAgentDatabaseWriterAdmission('/a.sqlite', {acquire: never, isHeld: () => true}), 'skipped');
  assert.equal(await waitForAgentDatabaseWriterAdmission('/a.sqlite', {acquire: never, isIncognito: () => true}), 'skipped');
  assert.equal(await waitForAgentDatabaseWriterAdmission('rel.sqlite', {acquire: never}), 'skipped');
  const databasePath = tempDatabasePath();
  fs.symlinkSync('/dev/null', databasePath + '.session-writer-coordinator');
  assert.equal(await waitForAgentDatabaseWriterAdmission(databasePath, {acquire: never}), 'skipped');
  assert.equal(await waitForAgentDatabaseWriterAdmission('/a.sqlite', {acquire: never}), 'error');
  process.env.OPENCLAW_ASYNC_WRITER_ADMISSION = '0';
  try {
    assert.equal(await waitForAgentDatabaseWriterAdmission('/a.sqlite', {acquire: never}), 'disabled');
  } finally {
    delete process.env.OPENCLAW_ASYNC_WRITER_ADMISSION;
  }
});

test('another process holding the lease does not freeze this event loop', async () => {
  const databasePath = tempDatabasePath();
  const coordinatorPath = databasePath + '.session-writer-coordinator';
  const holdMs = 400;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import {DatabaseSync} from 'node:sqlite';
    const db = new DatabaseSync(process.argv[1]);
    db.exec('BEGIN EXCLUSIVE');
    process.stdout.write('held\\n');
    setTimeout(() => { db.exec('ROLLBACK'); db.close(); }, ${holdMs});
  `, coordinatorPath], {stdio: ['ignore', 'pipe', 'inherit']});
  const exited = new Promise(resolve => child.once('exit', resolve));
  await new Promise(resolve => child.stdout.once('data', resolve));
  let ticks = 0, maxGap = 0, last = Date.now();
  const timer = setInterval(() => { const t = Date.now(); maxGap = Math.max(maxGap, t - last); last = t; ticks += 1; }, 10);
  const started = Date.now();
  const result = await waitForAgentDatabaseWriterAdmission(databasePath, {acquire});
  const waitedMs = Date.now() - started;
  clearInterval(timer);
  await exited;
  assert.equal(result, 'waited');
  assert.ok(waitedMs >= holdMs - 100, `waited ${waitedMs}ms`);
  assert.ok(ticks >= 10, `event loop ticked ${ticks} times while waiting`);
  assert.ok(maxGap < 150, `longest event-loop gap ${maxGap}ms`);
});
