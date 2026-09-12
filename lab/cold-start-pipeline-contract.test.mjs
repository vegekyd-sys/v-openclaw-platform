import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {restoreDemandExpansion,restoreColdConfigSharing} from './cold-start-pipeline-contract.mjs';
import {restoreWorkerLoadSpread} from './worker-load-spread-contract.mjs';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const source=read('../experiments/agent-worker-isolation-v1/worker-pool.mjs');
const release=read('./release-files/production-worker-worker-pool.mjs');
test('pool admission, ownership, cancellation and event contracts stay pinned to the spawn-containment candidate',()=>{
  assert.equal(hash(restoreWorkerLoadSpread(restoreDemandExpansion(source))),'08d8bc19c9b06a408053414e3acbaa275dd37424cad7e189604de908cea10aff');
  assert.equal(hash(restoreWorkerLoadSpread(restoreDemandExpansion(release))),'12c738a181fa9b95ec76eaa7a363c8ba266d72442cba82c8695a627099205412');
});
test('tested demand methods match release artifact byte for byte',()=>{
  const methods=s=>s.slice(s.indexOf('  startingWorkerCount() {'),s.indexOf('  async ensureMinimumWorkers() {'));
  assert.equal(methods(source),methods(release));
});
test('tested Session load-spread methods match release artifact byte for byte',()=>{
  const methods=s=>s.slice(s.indexOf('  compareSessionWorkerLoad(left, right) {'),s.indexOf('\n  async pump() {'));
  assert.ok(methods(source).includes('selectSessionWorker(key)'));
  assert.equal(methods(source),methods(release));
});
test('native command retains the reviewed post-cold-sharing readiness surface',()=>{
  assert.equal(hash(restoreColdConfigSharing(read('./release-files/agent-command-DPfawBbr.js'))),'7b47ea5a0baed065803d0fd29ad219f367ba17476d88460169256c2373527292');
});
