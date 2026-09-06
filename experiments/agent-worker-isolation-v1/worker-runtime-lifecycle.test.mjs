import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerPool } from "./worker-pool.mjs";
import { acquireWorkerRuntime, createWorkerRuntimeLifecycle, resolveWorkerRuntime } from "./worker-runtime-lifecycle.mjs";

const workerPath = fileURLToPath(new URL("./fake-delayed-ready-worker.mjs", import.meta.url));
function fixture(overrides = () => ({})) {
  const key = Symbol("isolated-worker-lifecycle-test");
  const generations = [];
  const acquire = () => acquireWorkerRuntime(key, () => {
    const runtime = {
      pool: new WorkerPool({
        minWorkers: 1, maxWorkers: 1, sessionsPerWorker: 1,
        workerPath, startupTimeoutMs: 2_000, requestTimeoutMs: 3_000,
        ...overrides(generations.length),
      }),
      requests: new Map(),
    };
    generations.push(runtime);
    return runtime;
  });
  const registration = () => {
    let bound = acquire(); // registration may precede the old service teardown
    const service = createWorkerRuntimeLifecycle({ acquire, bind: r => { bound = r; } });
    return { ...service, current: () => bound };
  };
  return { key, acquire, registration, generations, async cleanup() {
    await Promise.all(generations.map(g => g.pool.close()));
    delete globalThis[key];
  } };
}
const ping = runtime => runtime.pool.dispatch("agent:fixture:reload", { kind: "ping" });

test("a cached model harness uses the active service generation only at new request admission", async () => {
  const f = fixture();
  const first = f.registration(), a = {}, b = {};
  try {
    await first.start(a);
    const cached = first.current();
    const admittedBeforeReload = resolveWorkerRuntime(f.key, cached);
    await first.stop(a);
    const second = f.registration();
    assert.throws(() => resolveWorkerRuntime(f.key, cached), /no active service/);
    assert.equal(second.current().pool.started, false);
    await second.start(b);
    const admittedAfterReload = resolveWorkerRuntime(f.key, cached);
    assert.equal(admittedAfterReload, second.current());
    assert.ok((await ping(admittedAfterReload)).workerPid);
    assert.equal(admittedBeforeReload, cached);
    await assert.rejects(ping(admittedBeforeReload), /closing/);
    await second.stop(b);
    assert.throws(() => resolveWorkerRuntime(f.key, cached), /no active service/);
  } finally { await f.cleanup(); }
});

test("cached service registration survives three stop/start generations and late old stops", async () => {
  const f = fixture();
  const service = f.registration();
  const contexts = [];
  const pids = new Set();
  try {
    for (let cycle = 1; cycle <= 3; cycle++) {
      const context = {}; contexts.push(context);
      await service.start(context);
      const runtime = service.current();
      assert.equal(runtime.generation, cycle);
      assert.equal(runtime.requests.size, 0);
      runtime.requests.set("owned", cycle);
      for (const old of contexts.slice(0, -1)) await service.stop(old);
      const result = await ping(runtime);
      assert.ok(!pids.has(result.workerPid)); pids.add(result.workerPid);
      await service.stop(context);
      assert.equal(runtime.pool.status().workers.length, 0);
      assert.equal(runtime.pool.status().started, false);
    }
  } finally { await f.cleanup(); }
});

test("registration before teardown rebinds to the fresh generation when activated", async () => {
  const f = fixture();
  const first = f.registration(), a = {};
  try {
    await first.start(a);
    const original = first.current();
    const second = f.registration(), b = {};
    assert.equal(second.current(), original);
    await first.stop(a);
    await second.start(b);
    assert.notEqual(second.current(), original);
    await first.stop(a);
    assert.ok((await ping(second.current())).workerPid);
    await assert.rejects(original.pool.dispatch("agent:fixture:stale", { kind: "ping" }), /closing/);
    await second.stop(b);
  } finally { await f.cleanup(); }
});

test("late cleanup from an older service owner cannot close the current owner's pool", async () => {
  const f = fixture();
  const first = f.registration(), second = f.registration(), a = {}, b = {};
  try {
    await first.start(a);
    const originalPid = (await ping(first.current())).workerPid;
    await second.start(b);
    await first.stop(a);
    assert.equal((await ping(second.current())).workerPid, originalPid);
    await second.stop(b);
    assert.equal(second.current().pool.status().workers.length, 0);
  } finally { await f.cleanup(); }
});

test("failed service startup closes its pool and the next activation can recover", async () => {
  const f = fixture(n => n === 0 ? {
    startupTimeoutMs: 30,
    workerEnv: { ...process.env, VLAB_FAKE_WORKER_READY_DELAY_MS: "200" },
  } : {});
  const service = f.registration();
  try {
    await assert.rejects(service.start({}), /ready|startup|timed out/);
    assert.equal(service.current().pool.status().workers.length, 0);
    await service.start({});
    assert.equal(service.current().generation, 2);
    assert.ok((await ping(service.current())).workerPid);
  } finally { await f.cleanup(); }
});

test("stop racing startup cannot leave a reaper or affect the next generation", async () => {
  const f = fixture(() => ({
    workerEnv: { ...process.env, VLAB_FAKE_WORKER_READY_DELAY_MS: "100" },
  }));
  const service = f.registration(), a = {}, b = {};
  try {
    const starting = service.start(a);
    const rejected = assert.rejects(starting, /superseded|closing|exited/);
    await new Promise(r => setTimeout(r, 10));
    const stopping = service.stop(a);
    const next = service.start(b);
    await Promise.all([rejected, stopping, next]);
    assert.equal(f.generations[0].pool.reapTimer, null);
    assert.equal(f.generations[0].pool.status().workers.length, 0);
    assert.ok((await ping(service.current())).workerPid);
    await service.stop(a);
    assert.equal(service.current().pool.closing, false);
    await service.stop(b);
  } finally { await f.cleanup(); }
});

test("shutdown settles active and queued requests; a new generation accepts new work", async () => {
  const f = fixture();
  const service = f.registration(), a = {}, b = {};
  try {
    await service.start(a);
    const old = service.current();
    const active = await old.pool.submit("agent:fixture:active", { kind: "hold", durationMs: 1_000 });
    const queued = await old.pool.submit("agent:fixture:queued", { kind: "ping" });
    const rejected = Promise.all([
      assert.rejects(active.promise, /closing|exited/),
      assert.rejects(queued.promise, /closing|exited/),
    ]);
    await service.stop(a);
    await rejected;
    await service.start(b);
    assert.equal(old.pool.pending.length, 0);
    assert.equal(old.pool.sessionOwners.size, 0);
    assert.ok((await ping(service.current())).workerPid);
    await service.stop(b);
  } finally { await f.cleanup(); }
});
