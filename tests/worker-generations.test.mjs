// worker-generations.1: a replaced Worker generation drains instead of being
// killed. Runs against V's exact 0.2.11 plugin bytes with the release files of
// lab/release-files/worker-generations laid over them, using real child
// processes (the plugin's own fake Workers).
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = path.join(root, "release/captured/feishu-ask-chat-answer-20261003.worker/dist");
const overlay = path.join(root, "lab/release-files/worker-generations");
const dir = mkdtempSync(path.join(tmpdir(), "worker-generations-"));
cpSync(base, dir, { recursive: true });
for (const name of readdirSync(overlay)) {
  if (name.endsWith(".mjs")) cpSync(path.join(overlay, name), path.join(dir, name));
}
after(() => rmSync(dir, { recursive: true, force: true }));

const { WorkerPool } = await import(pathToFileURL(path.join(dir, "worker-pool.mjs")).href);
const lifecycle = await import(pathToFileURL(path.join(dir, "worker-runtime-lifecycle.mjs")).href);
const delayedWorker = path.join(dir, "fake-delayed-ready-worker.mjs");
const detachedWorker = path.join(dir, "fake-detached-event-worker.mjs");

const pools = [];
const makePool = (extra = {}) => {
  const pool = new WorkerPool({
    minWorkers: 1, maxWorkers: 1, sessionsPerWorker: 1,
    workerPath: delayedWorker, startupTimeoutMs: 5_000, requestTimeoutMs: 10_000,
    warmSpareWorkers: 0, retireGraceMs: 200,
    ...extra,
  });
  pools.push(pool);
  return pool;
};
after(async () => { await Promise.all(pools.map((pool) => pool.close())); });

const pidsOf = (pool) => pool.status().workers.map((worker) => worker.pid);
const timed = (promise) => promise.then((value) => ({ value, at: Date.now() }));

test("an admitted run finishes in the old Worker while the next generation serves new turns", async () => {
  const old = makePool();
  await old.start();
  const [oldPid] = pidsOf(old);
  const running = old.dispatch("agent:a:s1", { kind: "ping", durationMs: 600 });
  await new Promise((resolve) => setTimeout(resolve, 100));

  const next = makePool();
  const drained = old.beginDrain(next);
  await next.start();
  assert.equal(old.status().draining, true);
  assert.notEqual(pidsOf(next)[0], oldPid);

  const fresh = await next.dispatch("agent:a:s2", { kind: "ping" });
  assert.notEqual(fresh.workerPid, oldPid, "a new turn starts in the new generation");
  const finished = await running;
  assert.equal(finished.workerPid, oldPid, "the admitted run was not interrupted");
  await drained;
  assert.equal(old.status().workers.length, 0, "the old Worker exits once it is free");
  assert.equal(next.status().predecessor, null);
});

test("unassigned turns move to the successor instead of failing", async () => {
  const old = makePool();
  await old.start();
  const busy = old.dispatch("agent:a:busy", { kind: "ping", durationMs: 500 });
  // maxWorkers=1 and the only Worker is busy: this turn waits unassigned.
  const queued = old.submit("agent:a:other", { kind: "ping" });
  const { requestId } = await queued;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(old.status().pending, 1);

  const next = makePool();
  old.beginDrain(next);
  await next.start();
  const moved = await (await queued).promise;
  assert.ok(requestId.startsWith("request-"));
  assert.ok(pidsOf(next).includes(moved.workerPid), "the waiting turn ran in the new generation");
  await busy;
});

test("a Session still running in the old generation is not started twice", async () => {
  const old = makePool({ sessionsPerWorker: 2 });
  await old.start();
  const first = timed(old.dispatch("agent:a:same", { kind: "ping", durationMs: 500 }));
  await new Promise((resolve) => setTimeout(resolve, 100));

  const next = makePool({ sessionsPerWorker: 2 });
  old.beginDrain(next);
  await next.start();
  // Same transcript owner, admitted after the reload through the old handle.
  const second = timed(old.dispatch("agent:a:same", { kind: "ping" }));
  const other = timed(next.dispatch("agent:a:unrelated", { kind: "ping" }));
  const [a, b, c] = await Promise.all([first, second, other]);
  assert.ok(b.at >= a.at, "the second turn waited for the first to release the Session");
  assert.ok(c.at < a.at, "other Sessions are not held behind it");
  assert.ok(pidsOf(next).includes(b.value.workerPid));
});

test("cancel and steer through a stale handle reach the generation that owns the request", async () => {
  const old = makePool();
  await old.start();
  const next = makePool();
  old.beginDrain(next);
  await next.start();
  const blocker = next.dispatch("agent:a:block", { kind: "ping", durationMs: 400 });
  const submitted = await old.submit("agent:a:late", { kind: "ping" });
  const outcome = submitted.promise.then(() => "resolved", (error) => error.message);
  const cancelled = old.cancel(submitted.requestId);
  assert.equal(cancelled.cancelled, true);
  assert.match(await outcome, /cancel/i);
  const steer = await old.steer("request-does-not-exist", "hello");
  assert.equal(steer.steered, false);
  await blocker;
});

test("request ids stay unique across generations", async () => {
  const a = makePool();
  const b = makePool();
  await Promise.all([a.start(), b.start()]);
  const ids = new Set();
  for (const pool of [a, b, a, b]) {
    const submitted = await pool.submit(`agent:a:${ids.size}`, { kind: "ping" });
    ids.add(submitted.requestId);
    await submitted.promise;
  }
  assert.equal(ids.size, 4);
});

test("a drain that outlives its bound falls back to the hard close", async () => {
  const old = makePool({ generationDrainTimeoutMs: 200 });
  await old.start();
  const stuck = old.dispatch("agent:a:long", { kind: "ping", durationMs: 5_000 })
    .then(() => "resolved", (error) => error.message);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const drained = old.beginDrain(makePool());
  await drained;
  assert.match(await stuck, /exited|closing/);
  assert.equal(old.status().workers.length, 0);
});

test("a detached task keeps its Worker until it settles", async () => {
  const events = [];
  const old = makePool({
    workerPath: detachedWorker,
    onWorkerEvent: async (event) => { events.push(event.eventKind); return { ok: true }; },
  });
  await old.start();
  const [pid] = pidsOf(old);
  await old.dispatch("agent:a:media", { kind: "detached", taskId: "t1", detachedDurationMs: 400 });
  old.beginDrain(makePool({ workerPath: detachedWorker }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(pidsOf(old), [pid], "the Worker stays while its media task runs");
  await old.drainedPromise;
  assert.ok(events.includes("media_generation_completion"), "the completion was delivered");
  assert.ok(events.includes("detached_task_settled"));
});

test("a shutdown drain without a successor rejects what nobody can run", async () => {
  const old = makePool();
  await old.start();
  const busy = old.dispatch("agent:a:busy", { kind: "ping", durationMs: 300 });
  const waiting = (await old.submit("agent:a:waiting", { kind: "ping" })).promise
    .then(() => "resolved", (error) => error.message);
  old.successorWaitMs = 0;
  await old.beginDrain();
  assert.match(await waiting, /closing/);
  assert.ok((await busy).workerPid, "the running turn still finished");
  await assert.rejects(old.submit("agent:a:after", { kind: "ping" }), /closing/);
});

function serviceFixture(extra = {}) {
  const key = Symbol("worker-generations-test");
  const generations = [];
  const acquire = () => lifecycle.acquireWorkerRuntime(key, () => {
    const runtime = { pool: makePool(extra) };
    generations.push(runtime);
    return runtime;
  });
  let bound;
  const bind = (runtime) => { bound = runtime; };
  const register = () => {
    bound = acquire();
    return lifecycle.createWorkerRuntimeLifecycle({ acquire, bind });
  };
  return { key, acquire, bind, register, generations, current: () => bound,
    cleanup: () => { delete globalThis[key]; } };
}

test("a plugin reload hands over without failing a turn admitted in the gap", async () => {
  const f = serviceFixture();
  try {
    const first = f.register(), a = {}, b = {};
    await first.start(a);
    const cached = f.current();
    const running = cached.pool.dispatch("agent:a:inflight", { kind: "ping", durationMs: 500 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    // 9.1 order: stop old services, re-register, start new services.
    await first.stop(a);
    const gap = lifecycle.awaitWorkerRuntime(f.key, cached, { timeoutMs: 5_000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = f.register();
    await second.start(b);
    const admitted = await gap;
    assert.equal(admitted.generation, 2);
    assert.ok((await admitted.pool.dispatch("agent:a:new", { kind: "ping" })).workerPid);
    assert.equal((await running).workerPid !== undefined, true, "the in-flight run survived the reload");
    await f.generations[0].pool.drainedPromise;
    assert.equal(f.generations[0].pool.status().workers.length, 0);
  } finally { f.cleanup(); }
});

test("an operator roll replaces the generation and keeps service ownership", async () => {
  const f = serviceFixture();
  try {
    const service = f.register(), ctx = {};
    await service.start(ctx);
    const before = f.current();
    const oldPids = pidsOf(before.pool);
    const rolled = await lifecycle.rollWorkerRuntime(f.key, f.acquire, f.bind);
    assert.equal(rolled.generation, before.generation + 1);
    assert.equal(f.current(), rolled);
    assert.equal(lifecycle.resolveWorkerRuntime(f.key, before), rolled);
    assert.ok(pidsOf(rolled.pool).every((pid) => !oldPids.includes(pid)));
    await before.pool.drainedPromise;
    // The Gateway's later stop belongs to the rolled generation now.
    await service.stop(ctx);
    assert.equal(rolled.pool.status().draining || rolled.pool.status().closing, true);
  } finally { f.cleanup(); }
});

// The 0.2.12 lifecycle regressions, restated for drain semantics: a stop no
// longer kills, it hands over.
test("three reload generations each drain to zero Workers and never reuse a process", async () => {
  const f = serviceFixture();
  try {
    const service = f.register();
    const pids = new Set();
    for (let cycle = 1; cycle <= 3; cycle++) {
      const context = {};
      await service.start(context);
      const runtime = f.current();
      assert.equal(runtime.generation, cycle);
      const { workerPid } = await runtime.pool.dispatch("agent:a:cycle", { kind: "ping" });
      assert.ok(!pids.has(workerPid));
      pids.add(workerPid);
      await service.stop(context);
      await runtime.pool.drainedPromise;
      assert.equal(runtime.pool.status().workers.length, 0);
      assert.equal(runtime.pool.status().started, false);
    }
  } finally { f.cleanup(); }
});

test("a reload keeps both the active and the queued turn of the old generation", async () => {
  const f = serviceFixture();
  try {
    const service = f.register(), a = {}, b = {};
    await service.start(a);
    const old = f.current();
    const active = await old.pool.submit("agent:a:active", { kind: "ping", durationMs: 600 });
    const queued = await old.pool.submit("agent:a:queued", { kind: "ping" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await service.stop(a);
    // The new service registers only after the old one stopped (9.1 order).
    await new Promise((resolve) => setTimeout(resolve, 200));
    const next = f.register();
    await next.start(b);
    const [activeResult, queuedResult] = await Promise.all([active.promise, queued.promise]);
    assert.ok(pidsOf(f.current().pool).includes(queuedResult.workerPid), "the queued turn ran in the new generation");
    assert.ok(!pidsOf(f.current().pool).includes(activeResult.workerPid), "the active turn finished in the old one");
    await old.pool.drainedPromise;
    assert.equal(old.pool.pending.length, 0);
    assert.equal(old.pool.sessionOwners.size, 0);
  } finally { f.cleanup(); }
});

test("a late stop from an older owner cannot drain the current generation", async () => {
  const f = serviceFixture();
  try {
    const first = f.register(), second = f.register(), a = {}, b = {};
    await first.start(a);
    const current = f.current();
    await second.start(b);
    const [pid] = pidsOf(current.pool);
    await first.stop(a);
    assert.equal(current.pool.closing, false, "the stale owner's stop is ignored");
    assert.equal((await current.pool.dispatch("agent:a:after", { kind: "ping" })).workerPid, pid);
    await second.stop(b);
    await current.pool.drainedPromise;
    assert.equal(current.pool.status().workers.length, 0);
  } finally { f.cleanup(); }
});
