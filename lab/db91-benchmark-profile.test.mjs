import test from 'node:test';
import assert from 'node:assert/strict';
import {PROFILE, validateGrant, sliceUnit} from './db91-benchmark-profile.mjs';
const manifest={name:'db91-fix',owner:'codex-db91-contention-20260907',root:'/srv/vlab-production-mirror/labs/instances/db91-fix'};
const grant={profile:PROFILE,owner:manifest.owner,commit:'a'.repeat(40),createdAt:1000,until:10000};
test('C5 is scoped to exact owner and instance and expires',()=>{
  assert.equal(validateGrant(manifest,grant,2000).slice,'vlabdb91benchmark.slice');
  assert.throws(()=>validateGrant({...manifest,name:'shared'},grant,2000));
  assert.throws(()=>validateGrant({...manifest,owner:'other'},grant,2000));
  assert.throws(()=>validateGrant(manifest,grant,10000));
  assert.throws(()=>validateGrant(manifest,{...grant,until:1600000},2000));
  assert.throws(()=>validateGrant(manifest,{...grant,commit:'HEAD'},2000));
});
test('budget is on a shared parent slice, not only per-child units',()=>{
  assert.match(sliceUnit(),/CPUQuota=200%/);assert.match(sliceUnit(),/MemoryMax=6G/);
});
