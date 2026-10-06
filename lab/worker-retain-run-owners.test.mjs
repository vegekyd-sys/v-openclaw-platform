import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { patchPreparedModelRuntimeChunk } from './patch-worker-retain-run-owners.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const name = 'prepared-model-runtime-C1N_aVhw.js';
const base = read(`./release-files/openclaw-9.1-base/${name}`);
const released = read(`./release-files/worker-retain-run-owners/${name}`);
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('release file is the openclaw@2026.9.1 chunk V runs with only this change', () => {
  const upstream = JSON.parse(read('../release/captured/base/openclaw@2026.9.1.json')).files[`./${name}`];
  assert.equal(sha(base), upstream);
  assert.equal(patchPreparedModelRuntimeChunk(base), released);
  assert.throws(() => patchPreparedModelRuntimeChunk(released), /already patched/);
});

test('the Gateway keeps its retention; only the Worker adds one, through the same bounded retention', () => {
  assert.match(released, /\n\telse if \(provenance === "run" && context\.getGatewayLifecycleActive\(\)\) context\.retainedGatewayRunOwners\.retain\(key, owner, context\.owners\);\n\telse if \(provenance === "run" && workerRetainsRunOwners\(\)\) retainWorkerRunOwner\(key, owner, context\);\n/);
  assert.match(released, /const retainedGatewayRunOwners = new PreparedModelRuntimeOwnerRetention\(8\);/);
  // config publication still clears it
  assert.equal(released.split('retainedGatewayRunOwners.clear(owners);').length - 1, base.split('retainedGatewayRunOwners.clear(owners);').length - 1);
  // the Worker marker is the native attempt bridge the Worker installs before loading OpenClaw
  const worker = read('./release-files/worker-prewarm-v/worker.mjs');
  assert.match(worker, /globalThis\[NATIVE_ATTEMPT_BRIDGE\] = nativeAttemptBridge;/);
  assert.match(read('../release/captured/v2026.9.1-db91.6-workboard-incremental-sweep-20261006.worker/dist/native-attempt-bridge.mjs'),
    /NATIVE_ATTEMPT_BRIDGE = Symbol\.for\("versa\.vlab\.native-attempt-91-v1"\)/);
  assert.match(released, /globalThis\[Symbol\.for\("versa\.vlab\.native-attempt-91-v1"\)\] !== void 0/);
});

// Run the added helpers against fakes.
function helpers(env = {}) {
  const start = released.indexOf('function workerRetainsRunOwners()');
  const end = released.indexOf('function throwIfLeaseAdmissionAborted(');
  assert.ok(start > 0 && end > start);
  const retained = [];
  const make = new Function('globalThis', 'process', 'preparedModelRuntimeConfigsMatch', 'Date',
    `${released.slice(start, end)}; return { workerRetainsRunOwners, workerRetainedRunOwnerReusable, retainWorkerRunOwner };`);
  let now = 1_000;
  const g = { [Symbol.for('versa.vlab.native-attempt-91-v1')]: {} };
  const api = make(g, { env }, (left, right) => left === right, { now: () => now });
  return { ...api, g, retained, advance: (ms) => { now += ms; },
    context: { owners: new Map(), retainedGatewayRunOwners: { retain: (key, owner) => retained.push([key, owner]) } } };
}

test('an idle retained owner is reused for the same config within the age bound, and rebuilt otherwise', () => {
  const h = helpers();
  const config = {};
  const owner = { snapshot: {}, input: { config } };
  assert.equal(h.workerRetainedRunOwnerReusable(owner, { config }), false, 'never retained');
  h.retainWorkerRunOwner('k', owner, h.context);
  assert.deepEqual(h.retained, [['k', owner]]);
  assert.equal(h.workerRetainedRunOwnerReusable(owner, { config }), true);
  assert.equal(h.workerRetainedRunOwnerReusable(owner, { config: {} }), false, 'config changed');
  h.advance(299_999);
  // retaining again does not refresh the age of the same snapshot
  h.retainWorkerRunOwner('k', owner, h.context);
  assert.equal(h.workerRetainedRunOwnerReusable(owner, { config }), true);
  h.advance(1);
  assert.equal(h.workerRetainedRunOwnerReusable(owner, { config }), false, 'older than the bound');
  // a rebuilt owner snapshot starts a new age
  owner.snapshot = {};
  h.retainWorkerRunOwner('k', owner, h.context);
  assert.equal(h.workerRetainedRunOwnerReusable(owner, { config }), true);
});

test('only the Worker retains, and both switches work', () => {
  assert.equal(helpers().workerRetainsRunOwners(), true);
  assert.equal(helpers({ OPENCLAW_WORKER_RETAIN_RUN_OWNERS: '0' }).workerRetainsRunOwners(), false);
  const gateway = helpers(); delete gateway.g[Symbol.for('versa.vlab.native-attempt-91-v1')];
  assert.equal(gateway.workerRetainsRunOwners(), false);
  const ttl0 = helpers({ OPENCLAW_WORKER_RETAIN_RUN_OWNERS_TTL_MS: '0' });
  const owner = { snapshot: {}, input: { config: {} } };
  ttl0.retainWorkerRunOwner('k', owner, ttl0.context);
  assert.equal(ttl0.workerRetainedRunOwnerReusable(owner, { config: owner.input.config }), false);
});

test('the reuse guard runs only for idle Worker run owners, before the existing reuse decision', () => {
  const guard = '\t\tif (!staleDynamicOwner && provenance === "run" && existing?.provenance === "run" && !existing.pending && (existing.leaseCount ?? 0) === 0 && workerRetainsRunOwners() && !workerRetainedRunOwnerReusable(existing, input)) staleDynamicOwner = true;\n';
  const at = released.indexOf(guard);
  assert.ok(at > 0);
  assert.ok(at < released.indexOf('if (existing && !staleDynamicOwner && !ownerGenerationChanged) snapshot = await racePromiseWithAbortSignal(context.prepareSnapshot(input)'));
});
