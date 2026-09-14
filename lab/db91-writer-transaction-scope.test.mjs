import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {patchDatabaseSource, patchHistorySource, patchScopeSource} from './build-db91-writer-transaction-scope.mjs';

const read = name => fs.readFileSync(new URL(`./release-files/${name}`, import.meta.url), 'utf8');

function runChild(code, args = []) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, ...args], {stdio: ['ignore', 'pipe', 'pipe']});
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

async function waitForFile(filename) {
  const deadline = Date.now() + 3_000;
  while (!fs.existsSync(filename)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${filename}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test('session writer queue no longer owns the process lease across arbitrary async work', () => {
  const source = read('session-accessor.sqlite-scope-BwPKGcgm.js');
  assert.match(source, /runQueuedStoreWrite\(\{/);
  assert.doesNotMatch(source, /withAgentDatabaseProcessLease|tryAcquireExclusiveSqliteCoordinator/);
  assert.doesNotMatch(source, /processQueueWaitMs|processQueueAttempts/);
});

test('the central BEGIN IMMEDIATE edge remains globally admitted with a bounded wait', () => {
  const source = read('openclaw-agent-db-CUTe8BX6.js');
  const transaction = source.slice(
    source.indexOf('function runOpenClawAgentWriteTransaction'),
    source.indexOf('\nlet unregisterExitClose', source.indexOf('function runOpenClawAgentWriteTransaction')),
  );
  assert.match(transaction, /withAgentDatabaseProcessLeaseSync\(\{/);
  assert.match(transaction, /maxWaitMs: processAdmissionTimeoutMs/);
  assert.match(transaction, /const processAdmissionTimeoutMs = transactionOptions\.busyTimeoutMs \?\? 5e3/);
  assert.ok(transaction.indexOf('withAgentDatabaseProcessLeaseSync({') < transaction.indexOf('fn: runTransaction'));
});

test('direct planner and free-page writes retain explicit process-global admission', () => {
  const source = read('session-history-eviction-d5aiCsHS.js');
  const planner = source.slice(source.indexOf('async function refreshSqliteSessionPlannerStatisticsBestEffort'), source.indexOf('function buildSessionMaintenanceBatches'));
  const reclaim = source.slice(source.indexOf('function reclaimSqliteFreePages'), source.indexOf('function hasCanonicalSessionTranscriptArchives'));
  assert.match(planner, /runOpenClawAgentWriteTransaction[\s\S]*ANALYZE main[\s\S]*sessions\.planner\.analyze/);
  assert.match(reclaim, /withAgentDatabaseProcessLeaseSync\(\{[\s\S]*fn: runMaintenance[\s\S]*maxWaitMs: 5e3/);
  assert.match(reclaim, /incremental_vacuum/);
});

test('patchers reproduce the checked-in candidate and reject drift', () => {
  const baseCommit = 'd8d4d1407ea71cb6475e3379716c3a98736ef161';
  const atBase = filename => execFileSync('git', ['show', `${baseCommit}:lab/release-files/${filename}`], {encoding: 'utf8'});
  const broadScope = atBase('session-accessor.sqlite-scope-BwPKGcgm.js');
  const broadDatabase = atBase('openclaw-agent-db-CUTe8BX6.js');
  const broadHistory = atBase('session-history-eviction-d5aiCsHS.js');
  assert.equal(patchScopeSource(broadScope), read('session-accessor.sqlite-scope-BwPKGcgm.js'));
  assert.equal(patchDatabaseSource(broadDatabase), read('openclaw-agent-db-CUTe8BX6.js'));
  assert.equal(patchHistorySource(broadHistory), read('session-history-eviction-d5aiCsHS.js'));
  assert.throws(() => patchScopeSource('drifted'), /anchor mismatch/);
  assert.throws(() => patchDatabaseSource('drifted'), /anchor mismatch/);
  assert.throws(() => patchHistorySource('drifted'), /anchor mismatch/);
});

test('reproduction: broad async ownership times out another process; transaction-only ownership completes both writes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db91-writer-scope-repro-'));
  const databasePath = path.join(dir, 'openclaw-agent.sqlite');
  const helperUrl = new URL('./release-files/agent-db-process-coordinator.mjs', import.meta.url).href;
  const acquireCode = `const acquire=(f,o)=>{const c=new DatabaseSync(f);c.exec('PRAGMA busy_timeout='+o.busyTimeoutMs);try{c.exec('BEGIN EXCLUSIVE')}catch(e){c.close();if((e.errcode&255)===5)return null;throw e}return{release(){c.exec('ROLLBACK');c.close()}}};`;
  const writeCode = `const write=()=>{const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA busy_timeout=0;BEGIN IMMEDIATE;UPDATE state SET value=value+1;COMMIT');db.close()};`;
  const broadHolderCode = `import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {withAgentDatabaseProcessLease} from ${JSON.stringify(helperUrl)};${acquireCode}${writeCode}await withAgentDatabaseProcessLease({databasePath:process.argv[1],acquire,fn:async()=>{fs.writeFileSync(process.argv[2],'ready');await new Promise(r=>setTimeout(r,250));write()}});`;
  const narrowHolderCode = `import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {withAgentDatabaseProcessLeaseSync} from ${JSON.stringify(helperUrl)};${acquireCode}${writeCode}fs.writeFileSync(process.argv[2],'ready');await new Promise(r=>setTimeout(r,250));withAgentDatabaseProcessLeaseSync({databasePath:process.argv[1],acquire,maxWaitMs:500,fn:write});`;
  const contenderCode = `import {DatabaseSync} from 'node:sqlite';import {withAgentDatabaseProcessLeaseSync} from ${JSON.stringify(helperUrl)};${acquireCode}${writeCode}const started=Date.now();try{withAgentDatabaseProcessLeaseSync({databasePath:process.argv[1],acquire,maxWaitMs:Number(process.argv[2]),fn:write});process.stdout.write(JSON.stringify({ok:true,elapsedMs:Date.now()-started}))}catch(e){process.stdout.write(JSON.stringify({ok:false,code:e.code,elapsedMs:Date.now()-started}))}`;
  const reset = () => {
    for (const suffix of ['', '-wal', '-shm', '.session-writer-coordinator', '.session-writer-coordinator-wal', '.session-writer-coordinator-shm']) try { fs.unlinkSync(databasePath + suffix); } catch {}
    const db = new DatabaseSync(databasePath);
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE state(value INTEGER); INSERT INTO state VALUES (0)');
    db.close();
  };
  try {
    reset();
    const broadReady = path.join(dir, 'broad-ready');
    const broadHolder = runChild(broadHolderCode, [databasePath, broadReady]);
    await waitForFile(broadReady);
    const broadContender = JSON.parse(await runChild(contenderCode, [databasePath, '80']).result);
    await broadHolder.result;
    assert.equal(broadContender.ok, false);
    assert.equal(broadContender.code, 'V_AGENT_DB_PROCESS_COORDINATOR_TIMEOUT');
    assert(broadContender.elapsedMs >= 70, JSON.stringify(broadContender));
    let verify = new DatabaseSync(databasePath, {readOnly: true});
    assert.equal(verify.prepare('SELECT value FROM state').get().value, 1);
    verify.close();

    reset();
    const narrowReady = path.join(dir, 'narrow-ready');
    const narrowHolder = runChild(narrowHolderCode, [databasePath, narrowReady]);
    await waitForFile(narrowReady);
    const narrowContender = JSON.parse(await runChild(contenderCode, [databasePath, '80']).result);
    await narrowHolder.result;
    assert.equal(narrowContender.ok, true);
    assert(narrowContender.elapsedMs < 80, JSON.stringify(narrowContender));
    verify = new DatabaseSync(databasePath, {readOnly: true});
    assert.equal(verify.prepare('SELECT value FROM state').get().value, 2);
    verify.close();
  } finally {
    fs.rmSync(dir, {recursive: true});
  }
});
