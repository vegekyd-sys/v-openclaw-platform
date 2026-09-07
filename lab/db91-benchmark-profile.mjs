// Explicit, temporary C5 exception for this owned test instance only.
import assert from 'node:assert/strict';
export const PROFILE = 'db91-project-write-c5-v1';
export const SLICE = 'vlabdb91benchmark.slice';
export function validateGrant(manifest, grant, now = Date.now()) {
  assert.equal(manifest.name, 'db91-fix');
  assert.equal(manifest.owner, 'codex-db91-contention-20260907');
  assert.equal(manifest.root, '/srv/vlab-production-mirror/labs/instances/db91-fix');
  assert.equal(grant.profile, PROFILE);
  assert.equal(grant.owner, manifest.owner);
  assert(/^[0-9a-f]{40}$/.test(grant.commit));
  assert(Number.isFinite(grant.until) && grant.until > now && grant.until <= grant.createdAt + 25 * 60000);
  return {slice: SLICE, seconds: Math.ceil((grant.until - now) / 1000) + 180};
}
export function sliceUnit() {
  return '[Unit]\nDescription=Owned DB91 C5 aggregate benchmark budget\n[Slice]\nCPUQuota=200%\nMemoryHigh=4G\nMemoryMax=6G\nTasksMax=256\n';
}
