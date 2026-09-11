import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {restoreDemandExpansion,restoreColdConfigSharing} from './cold-start-pipeline-contract.mjs';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const source=read('../experiments/agent-worker-isolation-v1/worker-pool.mjs');
const release=read('./release-files/production-worker-worker-pool.mjs');
test('pool admission, ownership, cancellation and event contracts otherwise unchanged',()=>{
  assert.equal(hash(restoreDemandExpansion(source)),'7967e68a1cf410402fe114f79bb71efb053edf806870a35537b12ca177793d41');
  assert.equal(hash(restoreDemandExpansion(release)),'b079b955078ec12dcc201978d72eceb08e4acd425aeffe922b045410740d3fc6');
});
test('tested demand methods match release artifact byte for byte',()=>{
  const methods=s=>s.slice(s.indexOf('  startingWorkerCount() {'),s.indexOf('  async ensureMinimumWorkers() {'));
  assert.equal(methods(source),methods(release));
});
test('native command retains the reviewed post-cold-sharing readiness surface',()=>{
  assert.equal(hash(restoreColdConfigSharing(read('./release-files/agent-command-DPfawBbr.js'))),'7b47ea5a0baed065803d0fd29ad219f367ba17476d88460169256c2373527292');
});
