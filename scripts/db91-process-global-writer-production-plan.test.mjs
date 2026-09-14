import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  controlledStopPolicy,
  newRelease,
  oldRelease,
  planProductionConfig,
  productionFiles,
  productionReleaseUnit,
  preservedMemoryFtsSha256,
  releaseId,
} from './db91-process-global-writer-production-plan.mjs';

function fixture() {
  return {
    plugins: {
      load: {paths: ['/unrelated', `${oldRelease}/worker`]},
      entries: {
        'vlab-agent-worker-isolation': {
          config: {minWorkers: 5, maxWorkers: 15, sessionsPerWorker: 3, unrelated: 'keep'},
        },
      },
    },
    mcp: {servers: {'voice-memory': {env: {VOICE_MEMORY_OPENCLAW_ROOT: `${oldRelease}/core`}}}},
    unrelated: {keep: true},
  };
}

test('production config changes only the two release pointers and preserves five Workers', () => {
  const before = fixture();
  const after = JSON.parse(planProductionConfig(JSON.stringify(before)));
  assert.equal(after.plugins.load.paths[1], `${newRelease}/worker`);
  assert.equal(after.mcp.servers['voice-memory'].env.VOICE_MEMORY_OPENCLAW_ROOT, `${newRelease}/core`);
  assert.deepEqual(after.plugins.entries['vlab-agent-worker-isolation'].config, before.plugins.entries['vlab-agent-worker-isolation'].config);
  after.plugins.load.paths[1] = `${oldRelease}/worker`;
  after.mcp.servers['voice-memory'].env.VOICE_MEMORY_OPENCLAW_ROOT = `${oldRelease}/core`;
  assert.deepEqual(after, before);
  assert.throws(() => planProductionConfig(JSON.stringify({})));
  assert.throws(() => planProductionConfig(planProductionConfig(JSON.stringify(before))));
});

test('Worker child config preserves its independent minWorkers mirror', () => {
  const before = fixture();
  before.plugins.entries['vlab-agent-worker-isolation'].config.minWorkers = 1;
  const after = JSON.parse(planProductionConfig(JSON.stringify(before), {expectedMinWorkers: 1}));
  assert.equal(after.plugins.entries['vlab-agent-worker-isolation'].config.minWorkers, 1);
  assert.equal(after.plugins.load.paths[1], `${newRelease}/worker`);
});

test('release manifest is exact and hash guarded', () => {
  assert.equal(releaseId, 'v2026.9.1-db91.5');
  assert.equal(productionFiles.length, 7);
  assert.equal(new Set(productionFiles.map((file) => file.target)).size, productionFiles.length);
  assert.equal(productionFiles.filter((file) => file.beforeSha256 === null).length, 1);
  assert.match(preservedMemoryFtsSha256, /^[0-9a-f]{64}$/);
  for (const file of productionFiles) {
    assert.match(file.source, /^lab\/release-files\//);
    assert.match(file.target, /^core\/dist\//);
    assert.match(file.afterSha256, /^[0-9a-f]{64}$/);
    if (file.beforeSha256) assert.match(file.beforeSha256, /^[0-9a-f]{64}$/);
  }
});

test('production stage never hardlinks the live runtime', () => {
  const source = fs.readFileSync(new URL('./deploy-db91-process-global-writer-production.mjs', import.meta.url), 'utf8');
  assert(source.includes("run('cp', ['-a', `${oldRelease}/core`, `${newRelease}/core`]"));
  assert(!source.includes("run('cp', ['-al'"));
});

test('unit retains established hooks without changing stop bounds', () => {
  const unit = productionReleaseUnit();
  assert(unit.includes(`${newRelease}/core/dist/index.js`));
  assert(unit.includes(`V_RELEASE_VERSION=${releaseId}`));
  assert.equal((unit.match(/^ExecStartPre=.+$/gm) ?? []).length, 3);
  assert(!unit.includes(`${oldRelease}/core`));
  assert(!/TimeoutStop|SendSIGKILL|MemoryHigh|MemoryMax/.test(unit));
  assert.equal(controlledStopPolicy, '[Service]\nKillMode=mixed\nKillSignal=SIGUSR1\n');
});
