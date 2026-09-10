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
  assert.equal(hash(restoreDemandExpansion(source)),'a4a3bfd547074b5d851a0c000cb8a9ff4975e16e5d02cc8918c017aa1882b94c');
  assert.equal(hash(restoreDemandExpansion(release)),'9b471ee18ace343f60081f0f8d8f9040fa2c058444ba697aad90a7e1ecc9d046');
});
test('tested demand methods match release artifact byte for byte',()=>{
  const methods=s=>s.slice(s.indexOf('  startingWorkerCount() {'),s.indexOf('  async ensureMinimumWorkers() {'));
  assert.equal(methods(source),methods(release));
});
test('native command changes only scoped config initialization sharing',()=>{
  assert.equal(hash(restoreColdConfigSharing(read('./release-files/agent-command-DPfawBbr.js'))),'013390e6d73c91ecfd1ff625fa8c90d3dee988d350ff3948e6c32d35394fac54');
});
