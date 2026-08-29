import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JobManager, openshellSandboxName } from "../src/manager.mjs";
import { JobStore } from "../src/store.mjs";

test("idempotently runs a job and returns one completion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sandbox-broker-test-"));
  const project = path.join(root, "projects", "demo");
  await mkdir(project, { recursive: true });
  const provider = new FakeProvider();
  const oldRoots = process.env.VLAB_SANDBOX_PROJECT_ROOTS;
  process.env.VLAB_SANDBOX_PROJECT_ROOTS = path.join(root, "projects");
  try {
    const manager = new JobManager({ store: new JobStore(path.join(root, "state")), provider, maxConcurrent: 1 });
    await manager.init();
    const input = { owner: "u", session: "s", request: "test", idempotencyKey: "same", projectPath: project, command: ["npm", "test"] };
    const first = await manager.submit(input);
    const second = await manager.submit(input);
    assert.equal(first.job.id, second.job.id);
    assert.equal(second.existing, true);
    const completed = await waitFor(() => manager.get(first.job.id), (job) => job.status === "completed");
    assert.equal(completed.result.stdout, "ok");
    assert.equal(provider.executions, 1);
    assert.deepEqual(provider.deleted, [openshellSandboxName(first.job.id)]);
  } finally {
    if (oldRoots == null) delete process.env.VLAB_SANDBOX_PROJECT_ROOTS; else process.env.VLAB_SANDBOX_PROJECT_ROOTS = oldRoots;
    await rm(root, { recursive: true, force: true });
  }
});

test("maps audit job ids into the OpenShell 19-character name limit", () => {
  const name = openshellSandboxName("vjob-20260827161621-6d52250f");
  assert.match(name, /^vsb-[a-f0-9]{12}$/);
  assert.ok(name.length <= 19);
});

test("cancellation wins a race with provider completion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sandbox-broker-cancel-"));
  const project = path.join(root, "projects", "demo");
  await mkdir(project, { recursive: true });
  const provider = new DeferredProvider();
  const oldRoots = process.env.VLAB_SANDBOX_PROJECT_ROOTS;
  process.env.VLAB_SANDBOX_PROJECT_ROOTS = path.join(root, "projects");
  try {
    const manager = new JobManager({ store: new JobStore(path.join(root, "state")), provider, maxConcurrent: 1 });
    await manager.init();
    const { job } = await manager.submit({ owner: "u", session: "s", request: "long", idempotencyKey: "cancel", projectPath: project, command: ["node", "long.js"] });
    await waitFor(() => manager.get(job.id), (value) => value.status === "running");
    const cancellation = manager.cancel(job.id);
    provider.complete();
    await cancellation;
    await waitFor(() => manager.get(job.id), (value) => value.status === "cancelled");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal((await manager.get(job.id)).status, "cancelled");
  } finally {
    if (oldRoots == null) delete process.env.VLAB_SANDBOX_PROJECT_ROOTS; else process.env.VLAB_SANDBOX_PROJECT_ROOTS = oldRoots;
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy Job prune never deletes a persistent Workspace Sandbox", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sandbox-broker-prune-boundary-"));
  try {
    const provider = new FakeProvider();
    provider.managed = [{ name: "vsw-persistent01" }];
    const manager = new JobManager({ store: new JobStore(path.join(root, "state")), provider, maxConcurrent: 1 });
    await manager.init();
    await manager.prune();
    assert.equal(provider.deleted.includes("vsw-persistent01"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

class FakeProvider {
  constructor() { this.executions = 0; this.deleted = []; this.managed = []; }
  async execute(job, hooks) {
    this.executions += 1;
    await hooks.phase("execute");
    return { ok: true, exitCode: 0, stdout: "ok", stderr: "", artifacts: [] };
  }
  async delete(name) { this.deleted.push(name); }
  async listManaged() { return this.managed; }
}

class DeferredProvider extends FakeProvider {
  constructor() {
    super();
    this.promise = new Promise((resolve) => { this.resolve = resolve; });
  }
  complete() { this.resolve({ ok: false, exitCode: 1, stdout: "", stderr: "cancelled", artifacts: [] }); }
  async execute(job, hooks) {
    this.executions += 1;
    await hooks.phase("execute");
    const result = await this.promise;
    await hooks.phase("collect");
    return result;
  }
}

async function waitFor(read, predicate) {
  for (let index = 0; index < 100; index += 1) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition not reached");
}
