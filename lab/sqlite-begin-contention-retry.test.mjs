import test from 'node:test';
import assert from 'node:assert/strict';
import {withSqliteBeginContentionRetry, withSqliteBeginContentionRetrySync} from './release-files/sqlite-begin-contention-retry.mjs';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const busy = () => Object.assign(new Error('locked'), {code: 'ERR_SQLITE_ERROR', errcode: 5});
const db = () => ({isOpen: true, isTransaction: false});
test('BEGIN contention yields, retries the transaction edge, calls mutation once', async () => {
  let starts = 0, mutations = 0; const waits = [], database = db();
  const result = await withSqliteBeginContentionRetry({database, run: fn => {if (++starts < 4) throw busy(); return fn(database);}, operation: () => {mutations++; return 42;}}, {sleep: async ms => waits.push(ms)});
  assert.equal(result, 42); assert.equal(starts, 4); assert.equal(mutations, 1); assert.deepEqual(waits, [10, 20, 40]);
});
for (const stage of ['callback', 'commit', 'publication']) test('never repeats a ' + stage + ' failure, even when it looks like SQLITE_BUSY', async () => {
  let mutations = 0, starts = 0; const error = busy();
  await assert.rejects(withSqliteBeginContentionRetry({database: db(), run: fn => {starts++; fn(db()); throw error;}, operation: () => {mutations++; if (stage === 'callback') throw error;}}, {sleep: async () => assert.fail('must not wait')}), e => e === error);
  assert.equal(starts, 1); assert.equal(mutations, 1);
});
for (const reason of ['corruption', 'schema', 'snapshot', 'untyped-message', 'closed', 'nested']) test('fail closed: ' + reason, async () => {
  const database = db(); const error = reason === 'corruption' ? Object.assign(new Error('corrupt'), {errcode: 11}) : ['closed', 'nested'].includes(reason) ? busy() : new Error(reason === 'untyped-message' ? 'database is locked' : reason);
  if (reason === 'closed') database.isOpen = false; if (reason === 'nested') database.isTransaction = true;
  let starts = 0;
  await assert.rejects(withSqliteBeginContentionRetry({database, run: () => {starts++; throw error;}, operation: () => assert.fail('mutation')}, {sleep: async () => assert.fail('wait')}), e => e === error); assert.equal(starts, 1);
});
test('finite deadline and attempt cap preserve original error', async () => {
  let clock = 0, starts = 0; const error = busy();
  await assert.rejects(withSqliteBeginContentionRetry({database: db(), run: () => {starts++; throw error;}, operation() {}}, {now: () => clock, sleep: async ms => {clock += ms;}, maxWaitMs: 50}), e => e === error);
  assert.equal(clock, 50); assert.equal(starts, 4);
  starts = 0;
  await assert.rejects(withSqliteBeginContentionRetry({database: db(), run: () => {starts++; throw error;}, operation() {}}, {now: () => 0, sleep: async () => {}}), e => e === error); assert.equal(starts, 32);
});
test('default retry budget survives one native five-second busy timeout', async () => {
  let clock = 0, starts = 0, mutations = 0; const database = db();
  const result = await withSqliteBeginContentionRetry({database, run: fn => {
    starts++;
    if (starts === 1) {clock += 5001; throw busy();}
    return fn(database);
  }, operation: () => {mutations++; return 42;}}, {now: () => clock, sleep: async ms => {clock += ms;}});
  assert.equal(result, 42); assert.equal(starts, 2); assert.equal(mutations, 1);
});
test('a handle closed during wait is never used for another transaction', async () => {
  const database = db(); let starts = 0;
  const error = busy();
  await assert.rejects(withSqliteBeginContentionRetry({database, run: () => {starts++; throw error;}, operation() {}}, {sleep: async () => {database.isOpen = false;}}), e => e === error); assert.equal(starts, 1);
});
test('sync session admission retries only the BEGIN edge and mutates once', () => {
  let starts = 0, mutations = 0; const waits = [], database = db();
  const result = withSqliteBeginContentionRetrySync({database, run: fn => {if (++starts < 4) throw busy(); return fn(database);}, operation: () => {mutations++; return 42;}}, {sleep: ms => waits.push(ms)});
  assert.equal(result, 42); assert.equal(starts, 4); assert.equal(mutations, 1); assert.deepEqual(waits, [10, 20, 40]);
});
test('sync session admission never retries after entering the mutation', () => {
  let starts = 0, mutations = 0; const error = busy();
  assert.throws(() => withSqliteBeginContentionRetrySync({database: db(), run: fn => {starts++; fn(db()); throw error;}, operation: () => {mutations++;}}, {sleep: () => assert.fail('must not wait')}), e => e === error);
  assert.equal(starts, 1); assert.equal(mutations, 1);
});
test('sync session admission has a finite deadline and preserves the original error', () => {
  let clock = 0, starts = 0; const error = busy();
  assert.throws(() => withSqliteBeginContentionRetrySync({database: db(), run: () => {starts++; throw error;}, operation() {}}, {now: () => clock, sleep: ms => {clock += ms;}, maxWaitMs: 50}), e => e === error);
  assert.equal(clock, 50); assert.equal(starts, 4);
});
test('real SQLite cross-process lock: async retry preserves both writes without blocking timers', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'vlab-begin-retry-'));
  const filename = path.join(directory, 'fixture.sqlite');
  const database = new DatabaseSync(filename);
  // Minimal generated fixture, never a copied VLab database. DELETE journal
  // avoids depending on the host development Node's WAL runtime version.
  database.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=0; CREATE TABLE result (id INTEGER PRIMARY KEY, value TEXT)');
  let child;
  try {
    child = spawn(process.execPath, ['--input-type=module', '-e', `import {DatabaseSync} from 'node:sqlite'; const db = new DatabaseSync(${JSON.stringify(filename)}); db.exec("BEGIN IMMEDIATE; INSERT INTO result VALUES (1, 'other-process')"); process.stdout.write('LOCKED\\n'); setTimeout(() => {db.exec('COMMIT'); db.close();}, 220);`], {stdio: ['ignore', 'pipe', 'pipe']});
    let stderr = ''; child.stderr.on('data', chunk => stderr += chunk);
    const finished = new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(stderr)));});
    await new Promise((resolve, reject) => {child.stdout.once('data', resolve); child.once('error', reject);});
    let attempts = 0, mutations = 0, timerRan = false;
    const timer = setTimeout(() => {timerRan = true;}, 30);
    await withSqliteBeginContentionRetry({database, run: fn => {
      attempts++; database.exec('BEGIN IMMEDIATE');
      try {const value = fn(database); database.exec('COMMIT'); return value;} catch (error) {database.exec('ROLLBACK'); throw error;}
    }, operation: db => {mutations++; db.exec("INSERT INTO result VALUES (2, 'prepared-patch')");}});
    clearTimeout(timer); await finished;
    assert(attempts > 1); assert.equal(mutations, 1); assert.equal(timerRan, true);
    assert.deepEqual(database.prepare('SELECT value FROM result ORDER BY id').all().map(r => r.value), ['other-process', 'prepared-patch']);
  } finally {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    database.close(); rmSync(directory, {recursive: true});
  }
});
test('real SQLite cross-process lock: sync session admission survives one busy-timeout window', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'vlab-sync-begin-retry-'));
  const filename = path.join(directory, 'fixture.sqlite');
  const database = new DatabaseSync(filename);
  database.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=50; CREATE TABLE result (id INTEGER PRIMARY KEY, value TEXT)');
  let child;
  try {
    child = spawn(process.execPath, ['--input-type=module', '-e', `import {DatabaseSync} from 'node:sqlite'; const db = new DatabaseSync(${JSON.stringify(filename)}); db.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE; INSERT INTO result VALUES (1, 'other-process')"); process.stdout.write('LOCKED\\n'); setTimeout(() => {db.exec('COMMIT'); db.close();}, 220);`], {stdio: ['ignore', 'pipe', 'pipe']});
    let stderr = ''; child.stderr.on('data', chunk => stderr += chunk);
    const finished = new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(stderr)));});
    await new Promise((resolve, reject) => {child.stdout.once('data', resolve); child.once('error', reject);});
    let attempts = 0, mutations = 0;
    withSqliteBeginContentionRetrySync({database, run: fn => {
      attempts++; database.exec('BEGIN IMMEDIATE');
      try {const value = fn(database); database.exec('COMMIT'); return value;} catch (error) {database.exec('ROLLBACK'); throw error;}
    }, operation: target => {mutations++; target.exec("INSERT INTO result VALUES (2, 'session-admission')");}}, {maxWaitMs: 1000});
    await finished;
    assert(attempts > 1); assert.equal(mutations, 1);
    assert.deepEqual(database.prepare('SELECT value FROM result ORDER BY id').all().map(row => row.value), ['other-process', 'session-admission']);
  } finally {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    database.close(); rmSync(directory, {recursive: true});
  }
});
