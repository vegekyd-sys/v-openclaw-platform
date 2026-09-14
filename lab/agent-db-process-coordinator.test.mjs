import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {isAgentDatabaseProcessLeaseHeld, withAgentDatabaseProcessLease, withAgentDatabaseProcessLeaseSync} from './release-files/agent-db-process-coordinator.mjs';

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

function runChild(code, args = []) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  return {
    child,
    result: new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
    }),
  };
}

test('waits asynchronously, reports wait, and releases exactly once', async () => {
  let clock = 0, attempts = 0, releases = 0, acquired;
  const result = await withAgentDatabaseProcessLease({
    databasePath: '/fixture/openclaw-agent.sqlite',
    acquire() {
      attempts += 1;
      return attempts < 3 ? null : {release() { releases += 1; }};
    },
    fn: async () => 42,
    onAcquired: value => { acquired = value; },
  }, {
    now: () => clock,
    sleep: async ms => { clock += ms; },
  });
  assert.equal(result, 42);
  assert.equal(attempts, 3);
  assert.equal(releases, 1);
  assert.equal(acquired.waitMs, clock);
});

test('does not replay an entered operation and preserves its error', async () => {
  const operationError = new Error('operation failed');
  let calls = 0, releases = 0;
  await assert.rejects(withAgentDatabaseProcessLease({
    databasePath: '/fixture/openclaw-agent.sqlite',
    acquire: () => ({release() { releases += 1; }}),
    fn: async () => { calls += 1; throw operationError; },
  }), error => error === operationError);
  assert.equal(calls, 1);
  assert.equal(releases, 1);
});

test('async ownership is visible to nested sync writers without reacquiring', async () => {
  let acquisitions = 0;
  await withAgentDatabaseProcessLease({
    databasePath: '/fixture/openclaw-agent.sqlite',
    acquire: () => { acquisitions += 1; return {release() {}}; },
    fn: async () => {
      assert.equal(isAgentDatabaseProcessLeaseHeld('/fixture/openclaw-agent.sqlite'), true);
      assert.equal(withAgentDatabaseProcessLeaseSync({
        databasePath: '/fixture/openclaw-agent.sqlite',
        acquire: () => assert.fail('nested writer must not reacquire'),
        fn: () => 7,
      }), 7);
    },
  });
  assert.equal(acquisitions, 1);
  assert.equal(isAgentDatabaseProcessLeaseHeld('/fixture/openclaw-agent.sqlite'), false);
});

test('sync fallback waits only before entry and releases exactly once', () => {
  let clock = 0, attempts = 0, entries = 0, releases = 0;
  const result = withAgentDatabaseProcessLeaseSync({
    databasePath: '/fixture/openclaw-agent.sqlite',
    acquire: () => ++attempts < 3 ? null : {release() { releases += 1; }},
    fn: () => { entries += 1; return 9; },
  }, {now: () => clock, sleep: ms => { clock += ms; }});
  assert.equal(result, 9);
  assert.equal(attempts, 3);
  assert.equal(entries, 1);
  assert.equal(releases, 1);
});

test('times out before entering and rejects unsafe sidecars', async () => {
  let clock = 0;
  await assert.rejects(withAgentDatabaseProcessLease({
    databasePath: '/fixture/openclaw-agent.sqlite',
    maxWaitMs: 20,
    acquire: () => null,
    fn: () => assert.fail('must not enter'),
  }, {now: () => clock, sleep: async ms => { clock += ms; }}), {
    code: 'V_AGENT_DB_PROCESS_COORDINATOR_TIMEOUT',
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-db-coordinator-link-'));
  const databasePath = path.join(dir, 'openclaw-agent.sqlite');
  try {
    fs.writeFileSync(databasePath, 'fixture');
    fs.symlinkSync(databasePath, databasePath + '.session-writer-coordinator');
    await assert.rejects(withAgentDatabaseProcessLease({databasePath, acquire, fn() {}}), /Unsafe/);
  } finally {
    fs.rmSync(dir, {recursive: true});
  }
});

test('the OS releases a process lease after an owner is killed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-db-coordinator-owner-exit-'));
  const databasePath = path.join(dir, 'openclaw-agent.sqlite');
  const readyPath = path.join(dir, 'ready');
  const helperUrl = new URL('./release-files/agent-db-process-coordinator.mjs', import.meta.url).href;
  fs.writeFileSync(databasePath, 'fixture');
  const code = `import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {withAgentDatabaseProcessLease} from ${JSON.stringify(helperUrl)};const acquire=(f,o)=>{const db=new DatabaseSync(f);db.exec('PRAGMA busy_timeout='+o.busyTimeoutMs);try{db.exec('BEGIN EXCLUSIVE')}catch(e){db.close();if((e.errcode&255)===5)return null;throw e}return{release(){db.exec('ROLLBACK');db.close()}}};await withAgentDatabaseProcessLease({databasePath:process.argv[1],acquire,fn:async()=>{fs.writeFileSync(process.argv[2],'ready');await new Promise(()=>{})}});`;
  const owner = runChild(code, [databasePath, readyPath]);
  try {
    while (!fs.existsSync(readyPath)) await new Promise(resolve => setTimeout(resolve, 5));
    owner.child.kill('SIGKILL');
    await assert.rejects(owner.result);
    const result = await withAgentDatabaseProcessLease({databasePath, acquire, maxWaitMs: 1_000, fn: () => 'recovered'});
    assert.equal(result, 'recovered');
  } finally {
    if (owner.child.exitCode === null && owner.child.signalCode === null) owner.child.kill('SIGKILL');
    fs.rmSync(dir, {recursive: true});
  }
});

test('baseline process-local queues admit two processes into one SQLite writer race', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-db-process-local-repro-'));
  const databasePath = path.join(dir, 'openclaw-agent.sqlite');
  const readyPath = path.join(dir, 'holder-ready');
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE state(value INTEGER); INSERT INTO state VALUES (0)');
  db.close();
  const holderCode = `import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA busy_timeout=0;BEGIN IMMEDIATE;UPDATE state SET value=value+1');fs.writeFileSync(process.argv[2],'ready');setTimeout(()=>{db.exec('COMMIT');db.close();},350);`;
  const contenderCode = `import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA busy_timeout=80');let busy=false;try{db.exec('BEGIN IMMEDIATE;UPDATE state SET value=value+1;COMMIT')}catch(e){busy=(e.errcode&255)===5}db.close();process.stdout.write(JSON.stringify({busy}));`;
  let holder;
  try {
    holder = runChild(holderCode, [databasePath, readyPath]);
    while (!fs.existsSync(readyPath)) await new Promise(resolve => setTimeout(resolve, 5));
    const contender = runChild(contenderCode, [databasePath]);
    assert.deepEqual(JSON.parse(await contender.result), {busy: true});
    await holder.result;
  } finally {
    if (holder?.child.exitCode === null && holder.child.signalCode === null) holder.child.kill('SIGTERM');
    fs.rmSync(dir, {recursive: true});
  }
});

test('process-global admission serializes real writers without blocking timers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-db-process-global-'));
  const databasePath = path.join(dir, 'openclaw-agent.sqlite');
  const helperUrl = new URL('./release-files/agent-db-process-coordinator.mjs', import.meta.url).href;
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE state(value INTEGER); INSERT INTO state VALUES (0)');
  db.close();
  const code = `import {DatabaseSync} from 'node:sqlite';import {withAgentDatabaseProcessLease} from ${JSON.stringify(helperUrl)};const acquire=(f,o)=>{const c=new DatabaseSync(f);c.exec('PRAGMA busy_timeout='+o.busyTimeoutMs);try{c.exec('BEGIN EXCLUSIVE')}catch(e){c.close();if((e.errcode&255)===5)return null;throw e}return{release(){c.exec('ROLLBACK');c.close()}}};let ticks=0;const timer=setInterval(()=>ticks++,5);const result=await withAgentDatabaseProcessLease({databasePath:process.argv[1],acquire,fn:async()=>{const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA busy_timeout=0;BEGIN IMMEDIATE;UPDATE state SET value=value+1');await new Promise(r=>setTimeout(r,150));db.exec('COMMIT');db.close();return true}});clearInterval(timer);process.stdout.write(JSON.stringify({result,ticks}));`;
  try {
    const first = runChild(code, [databasePath]);
    const second = runChild(code, [databasePath]);
    const results = await Promise.all([first.result, second.result]);
    for (const raw of results) {
      const result = JSON.parse(raw);
      assert.equal(result.result, true);
      assert(result.ticks >= 20, `event loop stopped while waiting: ${raw}`);
    }
    const verify = new DatabaseSync(databasePath, {readOnly: true});
    assert.equal(verify.prepare('SELECT value FROM state').get().value, 2);
    verify.close();
  } finally {
    fs.rmSync(dir, {recursive: true});
  }
});

test('fifteen processes complete repeated writes with no SQLITE_BUSY loss', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-db-process-global-c15-'));
  const databasePath = path.join(dir, 'openclaw-agent.sqlite');
  const helperUrl = new URL('./release-files/agent-db-process-coordinator.mjs', import.meta.url).href;
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE state(value INTEGER); INSERT INTO state VALUES (0)');
  db.close();
  const code = `import {DatabaseSync} from 'node:sqlite';import {withAgentDatabaseProcessLease} from ${JSON.stringify(helperUrl)};const acquire=(f,o)=>{const c=new DatabaseSync(f);c.exec('PRAGMA busy_timeout='+o.busyTimeoutMs);try{c.exec('BEGIN EXCLUSIVE')}catch(e){c.close();if((e.errcode&255)===5)return null;throw e}return{release(){c.exec('ROLLBACK');c.close()}}};for(let i=0;i<5;i++)await withAgentDatabaseProcessLease({databasePath:process.argv[1],acquire,fn:()=>{const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA busy_timeout=0;BEGIN IMMEDIATE;UPDATE state SET value=value+1;COMMIT');db.close()}});process.stdout.write('ok');`;
  try {
    const children = Array.from({length: 15}, () => runChild(code, [databasePath]));
    assert.deepEqual(await Promise.all(children.map(item => item.result)), Array(15).fill('ok'));
    const verify = new DatabaseSync(databasePath, {readOnly: true});
    assert.equal(verify.prepare('SELECT value FROM state').get().value, 75);
    verify.close();
  } finally {
    fs.rmSync(dir, {recursive: true});
  }
});

test('a distinct process-global reconcile lease coalesces the same dirty work', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-db-reconcile-global-'));
  const databasePath = path.join(dir, 'openclaw-agent.sqlite');
  const helperUrl = new URL('./release-files/agent-db-process-coordinator.mjs', import.meta.url).href;
  const db = new DatabaseSync(databasePath);
  db.exec('CREATE TABLE state(dirty INTEGER, reconciles INTEGER); INSERT INTO state VALUES (1,0)');
  db.close();
  const code = `import {DatabaseSync} from 'node:sqlite';import {withAgentDatabaseProcessLease} from ${JSON.stringify(helperUrl)};const acquire=(f,o)=>{const c=new DatabaseSync(f);c.exec('PRAGMA busy_timeout='+o.busyTimeoutMs);try{c.exec('BEGIN EXCLUSIVE')}catch(e){c.close();if((e.errcode&255)===5)return null;throw e}return{release(){c.exec('ROLLBACK');c.close()}}};await withAgentDatabaseProcessLease({databasePath:process.argv[1],suffix:'.transcript-reconcile-coordinator',acquire,fn:async()=>{const db=new DatabaseSync(process.argv[1]);const dirty=db.prepare('SELECT dirty FROM state').get().dirty;if(dirty){await new Promise(r=>setTimeout(r,120));db.exec('UPDATE state SET dirty=0,reconciles=reconciles+1')}db.close()}});`;
  try {
    const first = runChild(code, [databasePath]);
    const second = runChild(code, [databasePath]);
    await Promise.all([first.result, second.result]);
    const verify = new DatabaseSync(databasePath, {readOnly: true});
    assert.deepEqual({...verify.prepare('SELECT * FROM state').get()}, {dirty: 0, reconciles: 1});
    verify.close();
  } finally {
    fs.rmSync(dir, {recursive: true});
  }
});
