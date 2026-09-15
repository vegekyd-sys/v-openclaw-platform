import assert from 'node:assert/strict';
import test from 'node:test';
import {
  feishuPeerLink,
  newFeishuPeerTarget,
  newRelease,
  oldFeishuPeerTarget,
  oldRelease,
  oldReleaseId,
  permanentDropinName,
  planProductionConfig,
  productionFiles,
  productionReleaseUnit,
  releaseId,
} from './state-db-fastpath-production-plan.mjs';

function fixture(minWorkers = 5) {
  return {
    plugins: {
      load: {paths: ['/unrelated', `${oldRelease}/worker`]},
      entries: {'vlab-agent-worker-isolation': {config: {minWorkers, maxWorkers: 15, sessionsPerWorker: 3}}},
    },
    mcp: {servers: {'voice-memory': {env: {VOICE_MEMORY_OPENCLAW_ROOT: `${oldRelease}/core`}}}},
    unrelated: {keep: true},
  };
}

test('db91.6 release changes only the two runtime pointers and keeps capacity', () => {
  const before = fixture();
  const after = JSON.parse(planProductionConfig(JSON.stringify(before)));
  assert.equal(after.plugins.load.paths[1], `${newRelease}/worker`);
  assert.equal(after.mcp.servers['voice-memory'].env.VOICE_MEMORY_OPENCLAW_ROOT, `${newRelease}/core`);
  assert.deepEqual(after.plugins.entries['vlab-agent-worker-isolation'].config, before.plugins.entries['vlab-agent-worker-isolation'].config);
  assert.deepEqual(after.unrelated, before.unrelated);
  assert.throws(() => planProductionConfig(JSON.stringify({})));
  assert.doesNotThrow(() => planProductionConfig(JSON.stringify(fixture(1)), {expectedMinWorkers: 1}));
});

test('db91.6 release is a one-file hash-guarded immutable promotion', () => {
  assert.equal(releaseId, 'v2026.9.1-db91.6');
  assert.equal(oldReleaseId, 'v2026.9.1-db91.5');
  assert.equal(productionFiles.length, 1);
  assert.equal(productionFiles[0].target, 'core/dist/exec-approvals-store-D159_AKa.js');
  assert.equal(oldFeishuPeerTarget, `${oldRelease}/core`);
  assert.equal(newFeishuPeerTarget, `${newRelease}/core`);
  assert.match(feishuPeerLink, /\/feishu\/node_modules\/openclaw$/);
  assert.match(permanentDropinName, /v6\.conf$/);
  assert(productionReleaseUnit().includes(`${newRelease}/core/dist/index.js`));
  assert(productionReleaseUnit().includes(`V_RELEASE_VERSION=${releaseId}`));
});
