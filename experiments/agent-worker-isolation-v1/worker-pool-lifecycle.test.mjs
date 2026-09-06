import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerPool } from "./worker-pool.mjs";

const workerPath = fileURLToPath(new URL("./fake-delayed-ready-worker.mjs", import.meta.url));
const options = (extra = {}) => ({
  minWorkers: 1, maxWorkers: 1, sessionsPerWorker: 1,
  workerPath, startupTimeoutMs: 2_000, requestTimeoutMs: 2_000,
  ...extra,
});

test("a closed pool cannot report a successful service restart", async () => {
  const pool = new WorkerPool(options());
  try {
    await pool.start();
    const first = await pool.dispatch("agent:fixture:before-reload", { kind: "ping" });
    assert.ok(first.workerPid);
    await pool.close();
    await assert.rejects(pool.start(), /closing|closed/);
    assert.equal(pool.status().started, false);
    assert.equal(pool.status().closing, true);
    assert.equal(pool.status().workers.length, 0);
  } finally { await pool.close(); }
});

test("concurrent starts both wait for the same real Worker readiness", async () => {
  const pool = new WorkerPool(options({
    workerEnv: { ...process.env, VLAB_FAKE_WORKER_READY_DELAY_MS: "100" },
  }));
  try {
    const first = pool.start();
    first.catch(() => {});
    await pool.start();
    assert.equal(pool.status().workers.filter(w => w.ready).length, 1);
    await first;
  } finally { await pool.close(); }
});

test("startup failure retires the failed pool and leaves no Worker behind", async () => {
  const pool = new WorkerPool(options({
    startupTimeoutMs: 30,
    workerEnv: { ...process.env, VLAB_FAKE_WORKER_READY_DELAY_MS: "200" },
  }));
  try {
    await assert.rejects(pool.start(), /ready|startup|timed out/);
    assert.equal(pool.status().started, false);
    assert.equal(pool.status().closing, true);
    assert.equal(pool.status().workers.length, 0);
  } finally { await pool.close(); }
});

test('all close callers join the same shutdown and closed spawn cannot resurrect children',async()=>{
  const pool=new WorkerPool(options());await pool.start();
  const first=pool.close();assert.equal(pool.close(),first);
  await first;await assert.rejects(pool.spawn(0),/closing/);
  assert.equal(pool.workers.size,0);assert.equal(pool.reapTimer,null);
});

test('stop during pool startup cannot leave a ready result or timer behind',async()=>{
  const pool=new WorkerPool(options({workerEnv:{...process.env,VLAB_FAKE_WORKER_READY_DELAY_MS:'250'}}));
  const failed=assert.rejects(pool.start(),/exited|closing/);
  await Promise.all([failed,pool.close()]);
  assert.equal(pool.workers.size,0);assert.equal(pool.reapTimer,null);
  assert.equal(pool.status().started,false);
});
