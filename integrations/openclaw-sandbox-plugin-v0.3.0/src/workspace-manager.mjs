import { createHash } from "node:crypto";
import { CapacityGate } from "./capacity.mjs";
import { OpenShellProvider } from "./openshell-provider.mjs";
import {
  resolveAllowedProject,
  validateActor,
  validateWorkspaceExecInput,
  validateWorkspaceFileInput,
  validateWorkspaceFinishInput,
  validateWorkspaceOpenInput,
} from "./validation.mjs";
import { WorkspaceStore } from "./workspace-store.mjs";

const TERMINAL = new Set(["completed", "failed", "cancelled", "expired"]);
const OPERATION_TERMINAL = new Set(["completed", "failed", "cancelled", "timed_out"]);

export class WorkspaceManager {
  constructor({
    store = new WorkspaceStore(),
    provider = new OpenShellProvider(),
    capacity = new CapacityGate(),
  } = {}) {
    this.store = store;
    this.provider = provider;
    this.capacity = capacity;
    this.queue = [];
    this.opening = new Map();
    this.active = new Set();
    this.locks = new Map();
    this.openLocks = new Map();
  }

  async init() {
    await this.store.init();
    const managed = new Set((await this.provider.listManaged()).map((entry) => entry.name));
    for (const workspace of await this.store.list()) {
      if (workspace.status === "queued") this.queue.push(workspace.id);
      else if (workspace.status === "opening") {
        if (workspace.sandboxName && managed.has(workspace.sandboxName)) {
          try { await this.provider.delete(workspace.sandboxName); } catch { /* prune retries */ }
        }
        workspace.status = "queued";
        workspace.phase = "recovering";
        workspace.recoveredAfterRestart = true;
        await this.store.put(workspace);
        this.queue.push(workspace.id);
      } else if (workspace.status === "active" || workspace.status === "finishing") {
        if (isExpired(workspace)) {
          await this.expire(workspace);
        } else if (workspace.sandboxName && managed.has(workspace.sandboxName)) {
          if (workspace.status === "finishing") {
            workspace.status = "active";
            workspace.phase = "recovered_after_finish_interrupt";
            workspace.recoveredAfterRestart = true;
            await this.store.put(workspace);
            await this.store.audit("workspace.finish_recovered", workspace);
          }
          this.active.add(workspace.id);
          this.capacity.reserve(capacityKey(workspace.id));
        } else {
          workspace.status = "failed";
          workspace.phase = "lost_after_restart";
          workspace.error = "managed Sandbox is missing after Broker restart";
          workspace.finishedAt = new Date().toISOString();
          await this.store.put(workspace);
          await this.store.audit("workspace.failed", workspace, { error: workspace.error });
        }
      }
    }
    queueMicrotask(() => this.pump());
  }

  async open(raw) {
    const input = validateWorkspaceOpenInput(raw);
    input.projectPath = await resolveAllowedProject(input.projectPath);
    const scope = createHash("sha256").update(`${input.owner}\0${input.session}\0${input.projectPath}`).digest("hex");
    const previous = this.openLocks.get(scope) ?? Promise.resolve();
    const current = previous.then(async () => {
      const activeWorkspace = (await this.store.list()).find((workspace) =>
        !TERMINAL.has(workspace.status) &&
        workspace.input.owner === input.owner &&
        workspace.input.session === input.session &&
        workspace.input.projectPath === input.projectPath
      );
      if (activeWorkspace) return { workspace: activeWorkspace, existing: true };
      const result = await this.store.create(input);
      if (!result.existing) this.queue.push(result.workspace.id);
      queueMicrotask(() => this.pump());
      return result;
    });
    const guarded = current.catch(() => {});
    this.openLocks.set(scope, guarded);
    try { return await current; } finally { if (this.openLocks.get(scope) === guarded) this.openLocks.delete(scope); }
  }

  get(id) { return this.store.get(id); }
  list() { return this.store.list(); }

  async status(id, actor) {
    return this.withWorkspaceLock(id, actor, async (workspace) => {
      if (workspace.status === "active") await this.refreshOperations(workspace);
      return { workspace: publicWorkspace(workspace) };
    });
  }

  async exec(id, raw, actor) {
    const input = validateWorkspaceExecInput(raw);
    return this.withWorkspaceLock(id, actor, async (workspace) => {
      await this.requireActive(workspace);
      if (input.action === "start") return this.startOperation(workspace, input);
      if (input.action === "status") return this.statusOperation(workspace, input);
      return this.cancelOperation(workspace, input);
    });
  }

  async files(id, raw, actor) {
    const input = validateWorkspaceFileInput(raw);
    return this.withWorkspaceLock(id, actor, async (workspace) => {
      await this.requireActive(workspace);
      workspace.phase = `files.${input.action}`;
      await this.touch(workspace);
      let result;
      if (input.action === "list") result = await this.provider.listWorkspaceFiles(workspace, input);
      else if (input.action === "read") result = await this.provider.readWorkspaceFile(workspace, input);
      else if (input.action === "write") result = await this.provider.writeWorkspaceFile(workspace, input);
      else result = await this.provider.applyWorkspacePatch(workspace, input);
      workspace.phase = "active";
      await this.touch(workspace);
      await this.store.audit(`workspace.files.${input.action}`, workspace);
      return { workspace: publicWorkspace(workspace), result };
    });
  }

  async finish(id, raw, actor) {
    const input = validateWorkspaceFinishInput(raw);
    return this.withWorkspaceLock(id, actor, async (workspace) => {
      await this.requireActive(workspace);
      await this.refreshOperations(workspace);
      if (hasRunningOperations(workspace)) {
        throw new Error("workspace still has a running operation; poll or cancel it before finish");
      }
      workspace.status = "finishing";
      workspace.phase = "collect";
      await this.store.put(workspace);
      try {
        const result = await this.provider.finishWorkspace(workspace, input);
        workspace.result = result;
        workspace.status = "completed";
        workspace.phase = "completed";
        workspace.finishedAt = new Date().toISOString();
        await this.store.put(workspace);
        await this.store.audit("workspace.completed", workspace, { diffSha256: result.diff?.sha256 });
        await this.cleanup(workspace);
        return { workspace: publicWorkspace(workspace), result };
      } catch (error) {
        workspace.status = "active";
        workspace.phase = "active";
        workspace.lastFinishError = error instanceof Error ? error.message : String(error);
        await this.touch(workspace);
        await this.store.put(workspace);
        await this.store.audit("workspace.finish_failed", workspace, { error: workspace.lastFinishError });
        throw error;
      }
    });
  }

  async cancel(id, actor) {
    return this.withWorkspaceLock(id, actor, async (workspace) => {
      if (TERMINAL.has(workspace.status)) return { workspace: publicWorkspace(workspace) };
      workspace.status = "cancelled";
      workspace.phase = "cancelled";
      workspace.finishedAt = new Date().toISOString();
      await this.store.put(workspace);
      await this.store.audit("workspace.cancelled", workspace);
      await this.cleanup(workspace);
      return { workspace: publicWorkspace(workspace) };
    });
  }

  async prune() {
    const expired = [];
    for (const workspace of await this.store.list()) {
      if (workspace.status === "active" && isExpired(workspace)) {
        await this.withWorkspaceLock(workspace.id, null, async (current) => {
          await this.refreshOperations(current);
          if (hasRunningOperations(current)) {
            await this.touch(current);
            await this.store.audit("workspace.lease_kept_for_operation", current);
            return;
          }
          await this.expire(current);
          expired.push(workspace.id);
        });
      }
    }
    const activeNames = new Set((await this.store.list()).filter((workspace) => !TERMINAL.has(workspace.status)).map((workspace) => workspace.sandboxName).filter(Boolean));
    const deleted = [];
    for (const sandbox of await this.provider.listManaged()) {
      if (!sandbox.name?.startsWith("vsw-")) continue;
      if (!activeNames.has(sandbox.name)) {
        await this.provider.delete(sandbox.name);
        deleted.push(sandbox.name);
      }
    }
    return { expired, deleted };
  }

  health() {
    return {
      queued: this.queue.length,
      opening: this.opening.size,
      active: this.active.size,
    };
  }

  async pump() {
    while (this.queue.length > 0 && this.opening.size < this.capacity.max) {
      const id = this.queue.shift();
      if (this.opening.has(id) || this.active.has(id)) continue;
      const promise = this.activate(id).finally(() => {
        this.opening.delete(id);
        queueMicrotask(() => this.pump());
      });
      this.opening.set(id, promise);
    }
  }

  async activate(id) {
    const key = capacityKey(id);
    await this.capacity.acquire(key);
    let workspace = await this.store.get(id);
    if (workspace.status !== "queued") {
      this.capacity.release(key);
      return;
    }
    workspace.status = "opening";
    workspace.phase = "create";
    workspace.attempt += 1;
    workspace.sandboxName = openshellWorkspaceName(id);
    workspace.startedAt = new Date().toISOString();
    await this.store.put(workspace);
    await this.store.audit("workspace.opening", workspace);
    try {
      const sandbox = await this.provider.createWorkspace(workspace, {
        phase: async (phase, patch = {}) => {
          workspace = { ...(await this.store.get(id)), ...patch, phase };
          await this.store.put(workspace);
        },
      });
      workspace = await this.store.get(id);
      workspace.sandbox = sandbox;
      workspace.status = "active";
      workspace.phase = "active";
      workspace.lastActivityAt = new Date().toISOString();
      workspace.expiresAt = new Date(Date.now() + workspace.input.leaseSeconds * 1000).toISOString();
      await this.store.put(workspace);
      await this.store.audit("workspace.active", workspace);
      this.active.add(id);
    } catch (error) {
      workspace = await this.store.get(id);
      workspace.status = "failed";
      workspace.phase = "failed";
      workspace.error = error instanceof Error ? error.message : String(error);
      workspace.finishedAt = new Date().toISOString();
      await this.store.put(workspace);
      await this.store.audit("workspace.failed", workspace, { error: workspace.error });
      try { if (workspace.sandboxName) await this.provider.delete(workspace.sandboxName); } catch { /* prune retries */ }
      this.capacity.release(key);
    }
  }

  async touch(workspace) {
    const now = Date.now();
    workspace.lastActivityAt = new Date(now).toISOString();
    workspace.expiresAt = new Date(now + workspace.input.leaseSeconds * 1000).toISOString();
    await this.store.put(workspace);
  }

  async startOperation(workspace, input) {
    workspace.operations ??= {};
    const existing = Object.values(workspace.operations).find((operation) => operation.idempotencyKey === input.idempotencyKey);
    if (existing) {
      const result = await this.provider.statusWorkspaceExec(workspace, {
        operationId: existing.id,
        maxBytes: 200_000,
      });
      updateOperation(workspace, existing.id, result);
      await this.touch(workspace);
      return { workspace: publicWorkspace(workspace), operation: publicOperation(result), existing: true };
    }

    const operationId = workspaceOperationId(workspace.id, input.idempotencyKey);
    workspace.operations[operationId] = {
      id: operationId,
      idempotencyKey: input.idempotencyKey,
      status: "starting",
      createdAt: new Date().toISOString(),
      timeoutSeconds: input.timeoutSeconds,
    };
    workspace.phase = "operation.start";
    await this.touch(workspace);
    try {
      const result = await this.provider.startWorkspaceExec(workspace, { ...input, operationId });
      updateOperation(workspace, operationId, result);
      workspace.phase = "active";
      await this.touch(workspace);
      await this.store.audit("workspace.operation.started", workspace, { operationId });
      return { workspace: publicWorkspace(workspace), operation: publicOperation(result), existing: false };
    } catch (error) {
      workspace.operations[operationId].status = "failed";
      workspace.operations[operationId].error = error instanceof Error ? error.message : String(error);
      workspace.operations[operationId].finishedAt = new Date().toISOString();
      workspace.phase = "active";
      await this.touch(workspace);
      await this.store.audit("workspace.operation.start_failed", workspace, { operationId, error: workspace.operations[operationId].error });
      throw error;
    }
  }

  async statusOperation(workspace, input) {
    requireOperation(workspace, input.operationId);
    const result = await this.provider.statusWorkspaceExec(workspace, input);
    updateOperation(workspace, input.operationId, result);
    await this.touch(workspace);
    await this.store.audit("workspace.operation.status", workspace, { operationId: input.operationId, operationStatus: result.status });
    return { workspace: publicWorkspace(workspace), operation: publicOperation(result) };
  }

  async cancelOperation(workspace, input) {
    requireOperation(workspace, input.operationId);
    const result = await this.provider.cancelWorkspaceExec(workspace, input);
    updateOperation(workspace, input.operationId, result);
    await this.touch(workspace);
    await this.store.audit("workspace.operation.cancel", workspace, { operationId: input.operationId, operationStatus: result.status });
    return { workspace: publicWorkspace(workspace), operation: publicOperation(result) };
  }

  async refreshOperations(workspace) {
    const operations = Object.values(workspace.operations ?? {});
    if (!operations.some((operation) => !OPERATION_TERMINAL.has(operation.status))) return;
    const current = await this.provider.listWorkspaceExecs(workspace);
    for (const operation of current) {
      if (workspace.operations?.[operation.operationId]) updateOperation(workspace, operation.operationId, operation);
    }
    await this.store.put(workspace);
  }

  async cleanup(workspace) {
    try {
      if (workspace.sandboxName) await this.provider.delete(workspace.sandboxName);
    } finally {
      this.active.delete(workspace.id);
      this.capacity.release(capacityKey(workspace.id));
      queueMicrotask(() => this.pump());
    }
  }

  async expire(workspace) {
    if (workspace.status !== "active" && workspace.status !== "finishing") return workspace;
    workspace.status = "expired";
    workspace.phase = "expired";
    workspace.finishedAt = new Date().toISOString();
    await this.store.put(workspace);
    await this.store.audit("workspace.expired", workspace);
    await this.cleanup(workspace);
    return workspace;
  }

  async requireActive(workspace) {
    if (workspace.status !== "active") throw new Error(`workspace is ${workspace.status}, not active`);
    if (isExpired(workspace)) {
      await this.expire(workspace);
      throw new Error("workspace lease expired");
    }
  }

  async withWorkspaceLock(id, actor, operation) {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const current = previous.then(async () => {
      const workspace = await this.store.get(id);
      if (actor) authorize(workspace, validateActor(actor));
      return operation(workspace);
    });
    const guarded = current.catch(() => {});
    this.locks.set(id, guarded);
    try { return await current; } finally { if (this.locks.get(id) === guarded) this.locks.delete(id); }
  }
}

export function openshellWorkspaceName(workspaceId) {
  return `vsw-${createHash("sha256").update(workspaceId).digest("hex").slice(0, 12)}`;
}

export function publicWorkspace(workspace) {
  return {
    id: workspace.id,
    status: workspace.status,
    phase: workspace.phase,
    createdAt: workspace.createdAt,
    startedAt: workspace.startedAt,
    updatedAt: workspace.updatedAt,
    lastActivityAt: workspace.lastActivityAt,
    expiresAt: workspace.expiresAt,
    finishedAt: workspace.finishedAt,
    attempt: workspace.attempt,
    sandbox: workspace.sandbox ? {
      provider: workspace.sandbox.provider,
      cpu: workspace.sandbox.cpu,
      memory: workspace.sandbox.memory,
      networkProfile: workspace.sandbox.networkProfile,
      baseFingerprint: workspace.sandbox.baseFingerprint,
      totalMs: workspace.sandbox.totalMs,
    } : undefined,
    fencingToken: workspace.fencingToken,
    error: workspace.error,
    operations: Object.values(workspace.operations ?? {}).map((operation) => ({
      operationId: operation.id,
      status: operation.status,
      startedAt: operation.startedAt,
      finishedAt: operation.finishedAt,
      exitCode: operation.exitCode,
      timeoutSeconds: operation.timeoutSeconds,
    })),
  };
}

function authorize(workspace, actor) {
  if (
    workspace.input.owner !== actor.owner ||
    workspace.input.session !== actor.session ||
    workspace.fencingToken !== actor.fencingToken
  ) {
    const error = new Error("workspace belongs to another owner or Agent Session");
    error.code = "EACCES";
    throw error;
  }
}

function isExpired(workspace) {
  return Boolean(workspace.expiresAt && Date.parse(workspace.expiresAt) <= Date.now());
}

function capacityKey(id) { return `workspace:${id}`; }

function workspaceOperationId(workspaceId, idempotencyKey) {
  const digest = createHash("sha256").update(`${workspaceId}\0${idempotencyKey}`).digest("hex").slice(0, 24);
  return `vop-${digest}`;
}

function requireOperation(workspace, operationId) {
  const operation = workspace.operations?.[operationId];
  if (!operation) throw new Error("operation does not belong to this workspace");
  return operation;
}

function updateOperation(workspace, operationId, result) {
  const previous = requireOperation(workspace, operationId);
  workspace.operations[operationId] = {
    ...previous,
    status: result.status,
    startedAt: result.startedAt ?? previous.startedAt,
    finishedAt: result.finishedAt ?? previous.finishedAt,
    updatedAt: result.updatedAt ?? new Date().toISOString(),
    exitCode: result.exitCode,
    timeoutSeconds: result.timeoutSeconds ?? previous.timeoutSeconds,
  };
}

function hasRunningOperations(workspace) {
  return Object.values(workspace.operations ?? {}).some((operation) => !OPERATION_TERMINAL.has(operation.status));
}

function publicOperation(operation) {
  return {
    operationId: operation.operationId,
    status: operation.status,
    createdAt: operation.createdAt,
    startedAt: operation.startedAt,
    finishedAt: operation.finishedAt,
    updatedAt: operation.updatedAt,
    exitCode: operation.exitCode,
    timeoutSeconds: operation.timeoutSeconds,
    stdout: operation.stdout,
    stderr: operation.stderr,
    stdoutBytes: operation.stdoutBytes,
    stderrBytes: operation.stderrBytes,
    stdoutTruncated: operation.stdoutTruncated,
    stderrTruncated: operation.stderrTruncated,
  };
}
