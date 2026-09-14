import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchDatabaseSource, patchScopeSource, patchReconcileSource} from './build-db91-process-global-writer.mjs';

const read = name => fs.readFileSync(new URL(`./release-files/${name}`, import.meta.url), 'utf8');

test('session scope retains only its per-process queue after transaction-scope repair', () => {
  const source = read('session-accessor.sqlite-scope-BwPKGcgm.js');
  const queue = source.indexOf('runQueuedStoreWrite({');
  const callback = source.indexOf('return await runCriticalSection()', queue);
  assert(queue >= 0 && callback > queue);
  assert.match(source, /localQueueWaitMs[\s\S]*criticalSectionMs/);
  assert.doesNotMatch(source, /withAgentDatabaseProcessLease|tryAcquireExclusiveSqliteCoordinator|processQueueWaitMs/);
});

test('reconcile patch holds a distinct global owner around preflight and worker lifecycle', () => {
  const source = read('session-transcript-reconcile-j5qhAafV.js');
  const wrapper = source.indexOf('async function reconcileSessionTranscriptIndexes(params)');
  const lease = source.indexOf('withAgentDatabaseProcessLease({', wrapper);
  const owner = source.indexOf('reconcileSessionTranscriptIndexesAsProcessOwner(params)', lease);
  assert(wrapper >= 0 && lease > wrapper && owner > lease);
  assert.match(source, /suffix: "\.transcript-reconcile-coordinator"/);
  assert.equal((source.match(/const runningReconciles/g) ?? []).length, 1);
});

test('central transaction gate covers synchronous writers outside the async session lane', () => {
  const source = read('openclaw-agent-db-CUTe8BX6.js');
  const transaction = source.slice(
    source.indexOf('function runOpenClawAgentWriteTransaction'),
    source.indexOf('\nlet unregisterExitClose', source.indexOf('function runOpenClawAgentWriteTransaction')),
  );
  assert.match(transaction, /isAgentDatabaseProcessLeaseHeld\(database\.path\)/);
  assert.match(transaction, /withAgentDatabaseProcessLeaseSync\(\{/);
  assert.match(transaction, /incognitoDatabases\.has\(database\)/);
  assert.equal((transaction.match(/operation\(writeDatabase\)/g) ?? []).length, 1);
});

test('patchers reject drift instead of silently producing partial coverage', () => {
  assert.throws(() => patchScopeSource('drifted'), /anchor mismatch/);
  assert.throws(() => patchReconcileSource('drifted'), /anchor mismatch/);
  assert.throws(() => patchDatabaseSource('drifted'), /anchor mismatch/);
});
