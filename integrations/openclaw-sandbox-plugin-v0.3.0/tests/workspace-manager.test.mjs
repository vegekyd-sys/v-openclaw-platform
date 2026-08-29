import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CapacityGate } from "../src/capacity.mjs";
import { WorkspaceManager, openshellWorkspaceName } from "../src/workspace-manager.mjs";
import { WorkspaceStore } from "../src/workspace-store.mjs";

test("concurrent opens with one idempotency key create one workspace and one Sandbox", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const store = new WorkspaceStore(state);
    const manager = new WorkspaceManager({ store, provider, capacity: new CapacityGate(1) });
    await manager.init();
    const input = openInput(project, "same-open", "session-same-open");

    const results = await Promise.all(
      Array.from({ length: 16 }, () => manager.open(structuredClone(input))),
    );
    const workspaceId = results[0].workspace.id;
    const active = await waitForWorkspace(manager, workspaceId, "active");

    assert.equal(new Set(results.map(({ workspace }) => workspace.id)).size, 1);
    assert.equal(results.filter(({ existing }) => !existing).length, 1);
    assert.equal((await store.list()).length, 1);
    assert.equal(provider.created.length, 1);
    await manager.cancel(active.id, actor(active));
  });
});

test("workspace capacity queues the second open until finish releases the first", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const manager = new WorkspaceManager({
      store: new WorkspaceStore(state),
      provider,
      capacity: new CapacityGate(1),
    });
    await manager.init();

    const first = await manager.open(openInput(project, "one", "session-one"));
    const second = await manager.open(openInput(project, "two", "session-two"));
    const firstActive = await waitForWorkspace(manager, first.workspace.id, "active");
    await waitFor(() => manager.health(), (health) => health.opening === 1);

    assert.equal(provider.created.length, 1);
    assert.equal((await manager.get(second.workspace.id)).status, "queued");

    const finished = await manager.finish(first.workspace.id, {}, actor(firstActive));
    assert.equal(finished.workspace.status, "completed");
    assert.equal(provider.deleted.includes(firstActive.sandboxName), true);

    const secondActive = await waitForWorkspace(manager, second.workspace.id, "active");
    assert.equal(provider.created.length, 2);
    await manager.cancel(second.workspace.id, actor(secondActive));
  });
});

test("workspace operations reject a different owner, session, or fencing token", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const manager = new WorkspaceManager({
      store: new WorkspaceStore(state),
      provider,
      capacity: new CapacityGate(1),
    });
    await manager.init();
    const opened = await manager.open(openInput(project, "auth", "session-auth"));
    const active = await waitForWorkspace(manager, opened.workspace.id, "active");
    const valid = actor(active);

    await assert.rejects(
      manager.exec(active.id, execInput(["node", "test.mjs"], "auth-owner"), { ...valid, owner: "ou-other" }),
      /another owner or Agent Session/,
    );
    await assert.rejects(
      manager.exec(active.id, execInput(["node", "test.mjs"], "auth-session"), { ...valid, session: "session-other" }),
      /another owner or Agent Session/,
    );
    await assert.rejects(
      manager.exec(active.id, execInput(["node", "test.mjs"], "auth-token"), { ...valid, fencingToken: "stale-token" }),
      /another owner or Agent Session/,
    );
    assert.equal(provider.startCalls, 0);

    const result = await manager.exec(active.id, execInput(["node", "test.mjs"], "auth-valid"), valid);
    assert.equal(result.operation.status, "running");
    assert.equal(provider.startCalls, 1);
    await manager.cancel(active.id, valid);
  });
});

test("all operations for one workspace are serialized", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider({ deferStart: true });
    const manager = new WorkspaceManager({
      store: new WorkspaceStore(state),
      provider,
      capacity: new CapacityGate(1),
    });
    await manager.init();
    const opened = await manager.open(openInput(project, "serial", "session-serial"));
    const active = await waitForWorkspace(manager, opened.workspace.id, "active");
    const valid = actor(active);

    const execution = manager.exec(active.id, execInput(["node", "long.mjs"], "serial-exec"), valid);
    await waitFor(() => provider.events, (events) => events.includes("exec:start"));
    const read = manager.files(active.id, { action: "read", path: "README.md" }, valid);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(provider.events, ["exec:start"]);

    provider.completeStart();
    await Promise.all([execution, read]);
    assert.deepEqual(provider.events, ["exec:start", "exec:end", "read"]);
    await manager.cancel(active.id, valid);
  });
});

test("a running operation can be cancelled without waiting for command completion", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const manager = new WorkspaceManager({
      store: new WorkspaceStore(state),
      provider,
      capacity: new CapacityGate(1),
    });
    await manager.init();
    const opened = await manager.open(openInput(project, "cancel-running", "session-cancel-running"));
    const active = await waitForWorkspace(manager, opened.workspace.id, "active");
    const valid = actor(active);

    const started = await manager.exec(
      active.id,
      execInput(["node", "long-running.mjs"], "cancel-running-operation"),
      valid,
    );
    assert.equal(started.operation.status, "running");

    const cancelled = await withDeadline(
      manager.exec(active.id, {
        action: "cancel",
        operationId: started.operation.operationId,
      }, valid),
      250,
    );

    assert.equal(cancelled.operation.operationId, started.operation.operationId);
    assert.equal(cancelled.operation.status, "cancelled");
    assert.equal(provider.cancelCalls, 1);
    assert.equal(provider.operation(started.operation.operationId).status, "cancelled");

    const finished = await manager.finish(active.id, {}, valid);
    assert.equal(finished.workspace.status, "completed");
  });
});

test("concurrent duplicate starts launch one durable operation", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const manager = new WorkspaceManager({
      store: new WorkspaceStore(state),
      provider,
      capacity: new CapacityGate(1),
    });
    await manager.init();
    const opened = await manager.open(openInput(project, "duplicate-start", "session-duplicate-start"));
    const active = await waitForWorkspace(manager, opened.workspace.id, "active");
    const valid = actor(active);
    const input = execInput(["npm", "test"], "same-exec-key");

    const [first, second] = await Promise.all([
      manager.exec(active.id, structuredClone(input), valid),
      manager.exec(active.id, structuredClone(input), valid),
    ]);

    assert.equal(first.operation.operationId, second.operation.operationId);
    assert.deepEqual([first.existing, second.existing].sort(), [false, true]);
    assert.equal(provider.startCalls, 1);
    assert.equal(provider.statusCalls, 1);
    assert.match(first.operation.operationId, /^vop-[a-f0-9]{24}$/);

    await manager.exec(active.id, {
      action: "cancel",
      operationId: first.operation.operationId,
    }, valid);
    await manager.finish(active.id, {}, valid);
  });
});

test("finish and cancel are terminal and delete their Sandboxes", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const manager = new WorkspaceManager({
      store: new WorkspaceStore(state),
      provider,
      capacity: new CapacityGate(2),
    });
    await manager.init();
    const finishOpen = await manager.open(openInput(project, "finish", "session-finish"));
    const cancelOpen = await manager.open(openInput(project, "cancel", "session-cancel"));
    const finishActive = await waitForWorkspace(manager, finishOpen.workspace.id, "active");
    const cancelActive = await waitForWorkspace(manager, cancelOpen.workspace.id, "active");

    const finished = await manager.finish(finishActive.id, { collect: ["result.json"] }, actor(finishActive));
    const cancelled = await manager.cancel(cancelActive.id, actor(cancelActive));

    assert.equal(finished.workspace.status, "completed");
    assert.equal(finished.result.diff.sha256, "diff-sha");
    assert.equal(cancelled.workspace.status, "cancelled");
    assert.deepEqual(
      new Set(provider.deleted),
      new Set([finishActive.sandboxName, cancelActive.sandboxName]),
    );
    assert.deepEqual(manager.health(), { queued: 0, opening: 0, active: 0 });
  });
});

test("expired leases are pruned and release capacity", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const store = new WorkspaceStore(state);
    const manager = new WorkspaceManager({ store, provider, capacity: new CapacityGate(1) });
    await manager.init();
    const opened = await manager.open(openInput(project, "ttl", "session-ttl"));
    const active = await waitForWorkspace(manager, opened.workspace.id, "active");

    const expired = await store.get(active.id);
    expired.expiresAt = new Date(Date.now() - 1_000).toISOString();
    await store.put(expired);
    const pruned = await manager.prune();

    assert.deepEqual(pruned.expired, [active.id]);
    assert.equal((await manager.get(active.id)).status, "expired");
    assert.equal(provider.deleted.includes(active.sandboxName), true);
    assert.equal(manager.health().active, 0);
  });
});

test("workspace prune never deletes a legacy one-shot Job Sandbox", async () => {
  await withFixture(async ({ state }) => {
    const provider = new FakeWorkspaceProvider();
    provider.managed.add("vsb-legacyjob001");
    const manager = new WorkspaceManager({
      store: new WorkspaceStore(state),
      provider,
      capacity: new CapacityGate(1),
    });
    await manager.init();
    await manager.prune();
    assert.equal(provider.deleted.includes("vsb-legacyjob001"), false);
  });
});

test("an active managed workspace is recovered after Broker restart", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const store = new WorkspaceStore(state);
    const firstManager = new WorkspaceManager({ store, provider, capacity: new CapacityGate(1) });
    await firstManager.init();
    const opened = await firstManager.open(openInput(project, "restart", "session-restart"));
    const active = await waitForWorkspace(firstManager, opened.workspace.id, "active");

    const restarted = new WorkspaceManager({
      store: new WorkspaceStore(state),
      provider,
      capacity: new CapacityGate(1),
    });
    await restarted.init();

    assert.equal(restarted.health().active, 1);
    assert.equal((await restarted.get(active.id)).status, "active");
    const result = await restarted.files(active.id, { action: "read", path: "README.md" }, actor(active));
    assert.equal(result.result.content, "demo");
    await restarted.finish(active.id, {}, actor(active));
  });
});

test("a running operation remains visible and queryable after Broker restart", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const firstManager = new WorkspaceManager({
      store: new WorkspaceStore(state),
      provider,
      capacity: new CapacityGate(1),
    });
    await firstManager.init();
    const opened = await firstManager.open(openInput(project, "operation-restart", "session-operation-restart"));
    const active = await waitForWorkspace(firstManager, opened.workspace.id, "active");
    const valid = actor(active);
    const started = await firstManager.exec(
      active.id,
      execInput(["npm", "test"], "operation-survives-restart"),
      valid,
    );

    const restarted = new WorkspaceManager({
      store: new WorkspaceStore(state),
      provider,
      capacity: new CapacityGate(1),
    });
    await restarted.init();
    const refreshed = await restarted.status(active.id, valid);

    assert.equal(restarted.health().active, 1);
    assert.deepEqual(refreshed.workspace.operations, [{
      operationId: started.operation.operationId,
      status: "running",
      startedAt: started.operation.startedAt,
      finishedAt: undefined,
      exitCode: undefined,
      timeoutSeconds: 3600,
    }]);
    assert.equal(provider.listCalls, 1);

    provider.completeOperation(started.operation.operationId, { stdout: "tests passed\n" });
    const completed = await restarted.exec(active.id, {
      action: "status",
      operationId: started.operation.operationId,
    }, valid);
    assert.equal(completed.operation.status, "completed");
    assert.equal(completed.operation.stdout, "tests passed\n");
    assert.equal(completed.operation.exitCode, 0);
    await restarted.finish(active.id, {}, valid);
  });
});

test("an interrupted opening is cleaned and requeued after Broker restart", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const store = new WorkspaceStore(state);
    const { workspace } = await store.create(openInput(project, "opening-restart", "session-opening-restart"));
    workspace.status = "opening";
    workspace.phase = "upload";
    workspace.attempt = 1;
    workspace.sandboxName = openshellWorkspaceName(workspace.id);
    await store.put(workspace);
    provider.managed.add(workspace.sandboxName);

    const restarted = new WorkspaceManager({ store, provider, capacity: new CapacityGate(1) });
    await restarted.init();
    const recovered = await waitForWorkspace(restarted, workspace.id, "active");

    assert.equal(recovered.recoveredAfterRestart, true);
    assert.equal(recovered.attempt, 2);
    assert.equal(provider.deleted.filter((name) => name === workspace.sandboxName).length, 1);
    assert.equal(provider.created.length, 1);
    await restarted.cancel(recovered.id, actor(recovered));
  });
});

test("an interrupted finish is restored to an active reviewable workspace", async () => {
  await withFixture(async ({ project, state }) => {
    const provider = new FakeWorkspaceProvider();
    const store = new WorkspaceStore(state);
    const { workspace } = await store.create(openInput(project, "finish-restart", "session-finish-restart"));
    workspace.status = "finishing";
    workspace.phase = "collect";
    workspace.sandboxName = openshellWorkspaceName(workspace.id);
    workspace.sandbox = { baseFingerprint: `base-${workspace.id}` };
    workspace.expiresAt = new Date(Date.now() + 60_000).toISOString();
    await store.put(workspace);
    provider.managed.add(workspace.sandboxName);

    const restarted = new WorkspaceManager({ store, provider, capacity: new CapacityGate(1) });
    await restarted.init();
    const recovered = await restarted.get(workspace.id);

    assert.equal(recovered.status, "active");
    assert.equal(recovered.phase, "recovered_after_finish_interrupt");
    assert.equal(restarted.health().active, 1);
    await restarted.cancel(recovered.id, actor(recovered));
  });
});

class FakeWorkspaceProvider {
  constructor({ deferStart = false } = {}) {
    this.deferStart = deferStart;
    this.created = [];
    this.deleted = [];
    this.managed = new Set();
    this.operations = new Map();
    this.startCalls = 0;
    this.statusCalls = 0;
    this.cancelCalls = 0;
    this.listCalls = 0;
    this.events = [];
    this.pendingStart = null;
  }

  async listManaged() {
    return [...this.managed].map((name) => ({ name }));
  }

  async createWorkspace(workspace, hooks) {
    await hooks.phase("upload");
    this.created.push(workspace.id);
    this.managed.add(workspace.sandboxName);
    return {
      name: workspace.sandboxName,
      provider: "fake",
      cpu: workspace.input.cpu,
      memory: workspace.input.memory,
      networkProfile: workspace.input.networkProfile,
      baseFingerprint: `base-${workspace.id}`,
      totalMs: 1,
    };
  }

  async startWorkspaceExec(workspace, input) {
    this.startCalls += 1;
    this.events.push("exec:start");
    if (this.deferStart) {
      await new Promise((resolve) => { this.pendingStart = resolve; });
    }
    this.events.push("exec:end");
    const now = new Date().toISOString();
    const operation = {
      operationId: input.operationId,
      workspaceId: workspace.id,
      status: "running",
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      timeoutSeconds: input.timeoutSeconds,
      stdout: "",
      stderr: "",
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
    };
    this.operations.set(input.operationId, operation);
    return publicFakeOperation(operation);
  }

  async statusWorkspaceExec(workspace, input) {
    this.statusCalls += 1;
    return publicFakeOperation(this.requireOperation(workspace, input.operationId));
  }

  async cancelWorkspaceExec(workspace, input) {
    this.cancelCalls += 1;
    const operation = this.requireOperation(workspace, input.operationId);
    if (!new Set(["completed", "failed", "cancelled", "timed_out"]).has(operation.status)) {
      operation.status = "cancelled";
      operation.exitCode = 143;
      operation.finishedAt = new Date().toISOString();
      operation.updatedAt = operation.finishedAt;
    }
    return publicFakeOperation(operation);
  }

  async listWorkspaceExecs(workspace) {
    this.listCalls += 1;
    return [...this.operations.values()]
      .filter((operation) => operation.workspaceId === workspace.id)
      .map(publicFakeOperation);
  }

  operation(operationId) {
    return this.operations.get(operationId);
  }

  completeOperation(operationId, { stdout = "ok\n", stderr = "", exitCode = 0 } = {}) {
    const operation = this.operations.get(operationId);
    assert.ok(operation, `unknown fake operation ${operationId}`);
    operation.status = exitCode === 0 ? "completed" : "failed";
    operation.exitCode = exitCode;
    operation.stdout = stdout;
    operation.stderr = stderr;
    operation.stdoutBytes = Buffer.byteLength(stdout);
    operation.stderrBytes = Buffer.byteLength(stderr);
    operation.finishedAt = new Date().toISOString();
    operation.updatedAt = operation.finishedAt;
  }

  completeStart() {
    assert.ok(this.pendingStart, "expected a deferred workspace operation start");
    const resolve = this.pendingStart;
    this.pendingStart = null;
    resolve();
  }

  requireOperation(workspace, operationId) {
    const operation = this.operations.get(operationId);
    if (!operation || operation.workspaceId !== workspace.id) throw new Error("fake operation is missing");
    return operation;
  }

  async listWorkspaceFiles() {
    this.events.push("list");
    return { files: ["README.md"], truncated: false };
  }

  async readWorkspaceFile() {
    this.events.push("read");
    return { path: "README.md", content: "demo", truncated: false };
  }

  async writeWorkspaceFile() {
    this.events.push("write");
    return { path: "README.md", sizeBytes: 4 };
  }

  async applyWorkspacePatch() {
    this.events.push("patch");
    return { applied: true, sizeBytes: 1 };
  }

  async finishWorkspace(workspace, input) {
    return {
      ok: true,
      baseFingerprint: workspace.sandbox.baseFingerprint,
      diff: { sha256: "diff-sha", sizeBytes: 4 },
      artifacts: input.collect.map((item) => ({ requestedPaths: [item] })),
    };
  }

  async delete(name) {
    this.deleted.push(name);
    this.managed.delete(name);
  }
}

function publicFakeOperation(operation) {
  const { workspaceId: _workspaceId, ...result } = operation;
  return structuredClone(result);
}

function openInput(projectPath, idempotencyKey, session) {
  return {
    owner: "ou-owner",
    session,
    request: "develop and test this project",
    idempotencyKey,
    projectPath,
    leaseSeconds: 60,
  };
}

function actor(workspace) {
  return {
    owner: workspace.input.owner,
    session: workspace.input.session,
    fencingToken: workspace.fencingToken,
  };
}

function execInput(command, idempotencyKey) {
  return { action: "start", command, idempotencyKey };
}

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sandbox-workspace-manager-"));
  const project = path.join(root, "projects", "demo");
  const state = path.join(root, "state");
  await mkdir(project, { recursive: true });
  const previousRoots = process.env.VLAB_SANDBOX_PROJECT_ROOTS;
  process.env.VLAB_SANDBOX_PROJECT_ROOTS = path.join(root, "projects");
  try {
    return await run({ root, project, state });
  } finally {
    if (previousRoots == null) delete process.env.VLAB_SANDBOX_PROJECT_ROOTS;
    else process.env.VLAB_SANDBOX_PROJECT_ROOTS = previousRoots;
    await rm(root, { recursive: true, force: true });
  }
}

function waitForWorkspace(manager, id, status) {
  return waitFor(() => manager.get(id), (workspace) => workspace.status === status);
}

async function waitFor(read, predicate) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition not reached");
}

function withDeadline(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("operation did not cancel promptly")), timeoutMs)),
  ]);
}
