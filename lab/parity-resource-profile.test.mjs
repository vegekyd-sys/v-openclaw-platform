import test from 'node:test';
import assert from 'node:assert/strict';
import {parityResources, parityName, parityOwner, patchController} from './parity-resource-profile.mjs';
const m={name:parityName,owner:parityOwner,root:'/srv/vlab-production-mirror/labs/instances/db91-parity'};
test('resource exception requires exact owned instance and lease',()=>{
  assert.deepEqual(parityResources(m,{owner:parityOwner}),['MemoryHigh=10G','MemoryMax=12G','CPUQuota=400%']);
  for(const field of ['name','owner','root'])assert.throws(()=>parityResources({...m,[field]:'other'},{owner:parityOwner}));
  assert.throws(()=>parityResources(m,{owner:'other'}));
});
test('controller patch fails closed on version drift or second application',()=>{
  const fixture="import {privateProviderPath} from './private-provider.mjs';\n'MemoryHigh=2G','MemoryMax=3G','CPUQuota=100%','TasksMax=256'\nNODE,'--max-old-space-size=1536',";
  const result=patchController(fixture);
  assert(result.includes(": ['MemoryHigh=2G','MemoryMax=3G','CPUQuota=100%']"));
  assert.throws(()=>patchController(result));assert.throws(()=>patchController('changed'));
});
