import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FULL_RETIREMENT_INTERVAL_MS, patchPlacementStartup, patchPlacementStore } from './patch-placement-sweep-lists.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const original = read('release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist/server-worker-placement-startup-BvPREvpr.js');
const startup = read('lab/release-files/placement-sweep-lists/server-worker-placement-startup-BvPREvpr.js');
const store = read('lab/release-files/placement-sweep-lists/placement-store-CkyLHi6x.js');
const plan = JSON.parse(read('lab/candidate/placement-sweep-lists-on.plan.json'));

function between(source, start, end) {
  const from = source.indexOf(start);
  assert(from >= 0, `missing ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert(to > from, `missing ${end}`);
  return source.slice(from, to);
}
function compile(region, names, injected, returned) {
  return new Function(...names, `${region}\nreturn { ${returned.join(', ')} };`)(...injected);
}

test('startup release is V\'s captured file through the patch, and the patch is idempotent', () => {
  assert.equal(sha(original), '8366d71a63fce504ff122e99581f4fffb0bde96613402f31478aa4e26846c781');
  assert.equal(patchPlacementStartup(original), startup);
  assert.equal(patchPlacementStartup(startup), startup);
  // every list() call stays, as the fallback for a store without the new methods, as session
  // retirement's full pass, and in the startup-only orphan cleanup
  assert.equal(original.split('placements.list()').length - 1, 7);
  assert.equal(startup.split('placements.list()').length - 1, 7);
});

test('store release is npm openclaw@2026.9.1 plus only the two read methods', () => {
  const start = store.indexOf('\t\tlistChangeSnapshot() {\n');
  const end = store.indexOf('\n\t\t}\n', store.indexOf('\t\tlistByEnvironmentIds(environmentIds) {')) + 5;
  assert(start > 0 && end > start);
  // undo the insertion: list()'s closing "}," goes back to "}"
  const base = `${store.slice(0, start - 2)}\n${store.slice(end)}`;
  assert.equal(sha(base), 'f7c7b41c8748a077448728c97dbd5d08510e9c931af40e02e2801b5072a7c24f');
  assert.equal(patchPlacementStore(base), store);
  assert.equal(patchPlacementStore(store), store);
  assert(!/\b(insertInto|updateTable|deleteFrom|write\()/u.test(store.slice(start, end)), 'new store methods must only read');
});

test('candidate plan installs exactly the two release files over V\'s bytes', () => {
  assert.deepEqual(plan.files.map((f) => [f.source, f.target, f.before]), [
    ['lab/release-files/placement-sweep-lists/placement-store-CkyLHi6x.js', 'openclaw/dist/placement-store-CkyLHi6x.js', 'f7c7b41c8748a077448728c97dbd5d08510e9c931af40e02e2801b5072a7c24f'],
    ['lab/release-files/placement-sweep-lists/server-worker-placement-startup-BvPREvpr.js', 'openclaw/dist/server-worker-placement-startup-BvPREvpr.js', '8366d71a63fce504ff122e99581f4fffb0bde96613402f31478aa4e26846c781'],
  ]);
});

// ---- a fake store with the real store's read contract ----
const STATES = ['local', 'requested', 'provisioning', 'starting', 'active', 'draining', 'reconciling', 'reclaimed', 'failed'];
function randomPlacements(rand, n, environments) {
  return Array.from({ length: n }, (_, i) => {
    const state = STATES[Math.floor(rand() * STATES.length)];
    const environmentId = state === 'local' || state === 'requested' || rand() < 0.1 ? null : environments[Math.floor(rand() * environments.length)];
    return {
      sessionId: `s-${String(Math.floor(rand() * 1e6)).padStart(6, '0')}-${i}`,
      agentId: 'makaron',
      sessionKey: `agent:makaron:k${i}`,
      state,
      environmentId,
      generation: Math.floor(rand() * 4),
      updatedAtMs: 1e12 + Math.floor(rand() * 1e6),
      activeOwnerEpoch: environmentId ? Math.floor(rand() * 3) : null,
      workspaceBaseManifestRef: environmentId ? `m-${i}` : null,
      turnClaim: rand() < 0.1 ? { owner: 'worker' } : null,
    };
  });
}
const bySession = (a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0);
function fakeStore(records, calls) {
  return {
    list() { calls.push('list'); return records.toSorted(bySession); },
    listForReconcile() { calls.push('reconcile'); return records.filter((r) => r.state !== 'local' && r.state !== 'reclaimed').toSorted((a, b) => a.updatedAtMs - b.updatedAtMs || bySession(a, b)); },
    listChangeSnapshot() { calls.push('snapshot'); return records.toSorted(bySession).map(({ sessionId, agentId, sessionKey, state, generation, updatedAtMs }) => ({ sessionId, agentId, sessionKey, state, generation, updatedAtMs })); },
    listByEnvironmentIds(ids) { calls.push('byEnvironment'); const set = new Set(ids); return records.filter((r) => r.environmentId !== null && set.has(r.environmentId)).toSorted(bySession); },
    getMany(ids) { calls.push('getMany'); const set = new Set(ids); return new Map(records.filter((r) => set.has(r.sessionId)).map((r) => [r.sessionId, r])); },
    listPendingWorkspaceResults() { return []; },
  };
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test('node retention reads only the node\'s placements and publishes the same snapshot', () => {
  const region = (src) => between(src, 'const TERMINAL_ENVIRONMENT_STATES', 'function createNodeWorkspaceRetainCoordinator(options) {');
  const names = ['listRetainedWorkerBundleHashes'];
  const stub = [({ environments, placements }) => ({ environments: environments.map((e) => e.environmentId), placements: placements.map((p) => p.sessionId) })];
  const before = compile(region(original), names, stub, ['snapshotEntriesForNode', 'snapshotBundleHashesForNode']);
  const after = compile(region(startup), names, stub, ['snapshotEntriesForNode', 'snapshotBundleHashesForNode']);
  for (let seed = 1; seed <= 200; seed += 1) {
    const rand = rng(seed);
    const environmentIds = Array.from({ length: 12 }, (_, i) => `env-${i}`);
    const records = randomPlacements(rand, 120, environmentIds);
    const environments = environmentIds.map((environmentId, i) => {
      const attached = records.filter((r) => r.environmentId === environmentId);
      return {
        environmentId,
        nodeDeviceId: `node-${i % 3}`,
        state: ['attached', 'destroyed', 'attached', 'bootstrapping'][i % 4],
        ownerEpoch: i % 3,
        createdAtMs: i,
        bootstrapReceipt: null,
        attachedSessionIds: rand() < 0.2 ? [] : rand() < 0.1 ? [`missing-${i}`] : attached.slice(0, rand() < 0.1 ? 2 : 1).map((r) => r.sessionId),
      };
    });
    for (const nodeId of ['node-0', 'node-1', 'node-2']) {
      const oldCalls = [], newCalls = [];
      const oldOptions = { environments: { list: () => environments }, placements: { ...fakeStore(records, oldCalls), getMany: undefined, listByEnvironmentIds: undefined } };
      const newOptions = { environments: { list: () => environments }, placements: fakeStore(records, newCalls) };
      assert.deepEqual(after.snapshotEntriesForNode(newOptions, nodeId), before.snapshotEntriesForNode(oldOptions, nodeId), `seed ${seed} ${nodeId} entries`);
      assert.deepEqual(after.snapshotBundleHashesForNode(newOptions, nodeId), before.snapshotBundleHashesForNode(oldOptions, nodeId), `seed ${seed} ${nodeId} bundle hashes`);
      assert(!newCalls.includes('list'), `seed ${seed}: node retention still listed every placement`);
      // a store without the new methods keeps the original reads
      const legacyCalls = [];
      const legacy = { environments: { list: () => environments }, placements: { ...fakeStore(records, legacyCalls), getMany: undefined, listByEnvironmentIds: undefined } };
      assert.deepEqual(after.snapshotEntriesForNode(legacy, nodeId), before.snapshotEntriesForNode(oldOptions, nodeId));
      assert.deepEqual(legacyCalls, ['list']);
    }
  }
});

test('placement change publishing announces the same sessions from the narrow snapshot', async () => {
  const region = (src) => between(src, 'function createGatewayWorkerPlacementChangePublisher(params) {', '//#endregion');
  for (let seed = 1; seed <= 100; seed += 1) {
    const run = async (src, withSnapshot) => {
      const records = randomPlacements(rng(seed), 60, ['env-a', 'env-b']);
      const events = [], calls = [];
      const { createGatewayWorkerPlacementChangePublisher: create } = compile(region(src), ['formatErrorMessage', 'emitSessionsChanged'], [String, (_, event) => events.push(event)], ['createGatewayWorkerPlacementChangePublisher']);
      const placements = fakeStore(records, calls);
      if (!withSnapshot) delete placements.listChangeSnapshot;
      const publish = create({ placements, getSessionChangeContext: () => ({}), warn() {} });
      const ops = rng(seed * 7);
      await publish(async () => {
        for (let i = 0; i < 6; i += 1) {
          const index = Math.floor(ops() * records.length);
          const kind = Math.floor(ops() * 4);
          if (kind === 0) records.splice(index, 1);
          else if (kind === 1) records[index] = { ...records[index], generation: records[index].generation + 1 };
          else if (kind === 2) records[index] = { ...records[index], updatedAtMs: records[index].updatedAtMs + 1 };
          else records.push({ ...records[index], sessionId: `new-${i}-${seed}` });
        }
      });
      return { events: events.toSorted((a, b) => a.sessionKey.localeCompare(b.sessionKey)), calls };
    };
    const before = await run(original, false);
    const after = await run(startup, true);
    assert.deepEqual(after.events, before.events, `seed ${seed}`);
    assert.deepEqual(after.calls, ['snapshot', 'snapshot']);
  }
});

test('session retirement: a partial pass checks only placements that can own an environment', async () => {
  const region = (src) => between(src, '//#region src/gateway/worker-environments/placement-session-retirement.ts', '//#endregion');
  const { createPlacementSessionRetirement } = compile(region(startup), ['isFailedWorkerPlacementEnvironmentGone'], [() => true], ['createPlacementSessionRetirement']);
  const records = randomPlacements(rng(3), 80, ['env-a']);
  const run = async (options) => {
    const calls = [], checked = [];
    const retirement = createPlacementSessionRetirement({
      placements: { ...fakeStore(records, calls), get: () => void 0 },
      environments: {},
      forceDestroyEnvironment: async () => {},
      createSessionEvidenceResolver: async (placements) => { checked.push(...placements.map((p) => p.sessionId)); return async () => 'present'; },
      warn() {},
    });
    await retirement.reconcile(options);
    return { calls, checked };
  };
  for (const options of [undefined, {}, { full: true }]) {
    const full = await run(options);
    assert.deepEqual(full.calls, ['list']);
    assert.deepEqual(full.checked, records.toSorted(bySession).map((r) => r.sessionId));
  }
  const partial = await run({ full: false });
  assert.deepEqual(partial.calls, ['reconcile']);
  assert.deepEqual(partial.checked.toSorted(), records.filter((r) => r.state !== 'local' && r.state !== 'reclaimed').map((r) => r.sessionId).toSorted());
});

test('the minute sweep runs a full retirement pass at startup, on identity mutations and every 10 minutes', () => {
  assert.equal(FULL_RETIREMENT_INTERVAL_MS, 600_000);
  const runtime = between(startup, '\tconst startRuntime = async (hooks) => {', '\treturn {\n\t\tdispatchService,');
  assert.match(runtime, /let lastFullRetirementAt;\n/u);
  assert.match(runtime, /const full = fullRetirement !== false;\n\t\t\treturn trackOperation\(placementReconcile, publishPlacementChanges\(async \(\) => \{\n\t\t\t\tif \(full\) lastFullRetirementAt = Date\.now\(\);\n\t\t\t\tawait sessionRetirement\.reconcile\(\{ full \}\);/u);
  // the minute timer is the only caller that passes an argument (identity mutations below)
  assert.equal(runtime.split('reconcileActivePlacements(').length - 1, 2);
  assert.match(runtime, /reconcileActivePlacements\(lastFullRetirementAt === void 0 \|\| Date\.now\(\) - lastFullRetirementAt >= WORKER_PLACEMENT_FULL_RETIREMENT_INTERVAL_MS \|\| Date\.now\(\) < lastFullRetirementAt\)\.then/u);
  // identity mutations call it with a settled value (undefined or an error): a full pass
  assert.match(runtime, /if \(!pending\) \{\n\t\t\t\t\treconcileActivePlacements\(\);/u);
  assert.match(runtime, /pending\.then\(reconcileActivePlacements, reconcileActivePlacements\)/u);
  assert.match(runtime, /lastFullRetirementAt = Date\.now\(\);\n\t\t\ttrackOperation\(placementReconcile, publishPlacementChanges\(\(\) => sessionRetirement\.reconcile\(\)\)/u);
});

test('disk-space sweep and reconcile guard read the same placements without a full list', () => {
  assert.match(startup, /const active = \(typeof params\.placements\.listForReconcile === "function" \? params\.placements\.listForReconcile\(\)\.toSorted\(/u);
  assert.match(startup, /const references = \(typeof params\.placements\.listByEnvironmentIds === "function" \? params\.placements\.listByEnvironmentIds\(\[environmentId\]\) : params\.placements\.list\(\)\)\.filter\(\(placement\) => placement\.environmentId === environmentId\);/u);
});

test('the minute sweep skips the auto-suspend publication when no profile suspends', () => {
  const idle = between(startup, 'function createWorkerPlacementIdleSweep(options) {', '//#endregion');
  const { enabledFor } = compile(`function enabledFor(options) { return ({\n${between(idle, '\tenabled() {', '\tasync sweep() {')}}).enabled(); }`, [], [], ['enabledFor']);
  const config = (profiles) => ({ getConfig: () => ({ cloudWorkers: profiles === undefined ? undefined : { profiles } }) });
  assert.equal(enabledFor(config(undefined)), false);
  assert.equal(enabledFor(config({})), false);
  assert.equal(enabledFor(config({ a: { machineClass: 'x' } })), false);
  assert.equal(enabledFor(config({ a: {}, b: { suspendAfter: '30m' } })), true);
  // sweep() keeps its own early return, so a caller that does not check enabled() is unchanged
  assert.match(idle, /async sweep\(\) \{\n\t\tconst profiles = options\.getConfig\(\)\.cloudWorkers\?\.profiles;\n\t\tif \(!profiles \|\| !Object\.values\(profiles\)\.some\(\(profile\) => profile\.suspendAfter\)\) return;/u);
  assert.match(startup, /if \(stopped \|\| placementIdleSuspend\.current \|\| placementIdleSweep\.enabled\?\.\(\) === false\) return;/u);
});
