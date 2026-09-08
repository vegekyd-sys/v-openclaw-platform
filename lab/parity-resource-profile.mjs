import assert from 'node:assert/strict';
export const parityName = 'db91-parity';
export const parityOwner = 'codex-db91-production-equivalent-20260908';
export function patchLongRunController(source) {
  const before="{stdio:'inherit',timeout:240000}";
  assert.equal(source.split(before).length,2,'Long-run controller anchor drift');
  return source.replace(before,"{stdio:'inherit',timeout:m.name===parityName&&command==='run'?7200000:240000}");
}
export function parityResources(m, lease) {
  assert.equal(m.name, parityName);
  assert.equal(m.owner, parityOwner);
  assert.equal(m.root, '/srv/vlab-production-mirror/labs/instances/db91-parity');
  assert.equal(lease.owner, parityOwner, 'Explicit integration lease required');
  return ['MemoryHigh=10G','MemoryMax=12G','CPUQuota=400%'];
}

// Patch only the reviewed canonical controller, preserving other instance defaults.
export function patchController(source) {
  const edits = [
    ["import {privateProviderPath} from './private-provider.mjs';", "import {privateProviderPath} from './private-provider.mjs';\nimport {parityName, parityResources} from './parity-resource-profile.mjs';"],
    ["'MemoryHigh=2G','MemoryMax=3G','CPUQuota=100%','TasksMax=256'", "...(m.name===parityName ? parityResources(m,read(`${ROOT}/control/integration.json`)) : ['MemoryHigh=2G','MemoryMax=3G','CPUQuota=100%']),'TasksMax=256'"],
    ["NODE,'--max-old-space-size=1536',", "NODE,m.name===parityName?'--max-old-space-size=12288':'--max-old-space-size=1536',"],
  ];
  for (const [before, after] of edits) {
    assert.equal(source.split(before).length, 2, 'Controller changed; re-review exact anchor');
    source = source.replace(before, after);
  }
  return patchLongRunController(source);
}
