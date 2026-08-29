import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export class WorkspaceStore {
  constructor(root = process.env.VLAB_SANDBOX_STATE_DIR ?? "/srv/vlab/state/sandbox-broker") {
    this.root = root;
    this.workspacesDir = path.join(root, "workspaces");
    this.idempotencyDir = path.join(root, "workspace-idempotency");
    this.idempotencyLocksDir = path.join(root, "workspace-idempotency-locks");
    this.auditPath = path.join(root, "audit.jsonl");
    this.writeChain = Promise.resolve();
  }

  async init() {
    await mkdir(this.workspacesDir, { recursive: true });
    await mkdir(this.idempotencyDir, { recursive: true });
    await mkdir(this.idempotencyLocksDir, { recursive: true });
  }

  async create(input) {
    await this.init();
    const keyHash = createHash("sha256").update(input.idempotencyKey).digest("hex");
    const indexPath = path.join(this.idempotencyDir, `${keyHash}.txt`);
    try {
      const existingId = (await readFile(indexPath, "utf8")).trim();
      return { workspace: await this.get(existingId), existing: true };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const lockPath = path.join(this.idempotencyLocksDir, keyHash);
    const ownsLock = await acquireLock(lockPath);
    if (!ownsLock) {
      const existingId = await waitForIndex(indexPath);
      return { workspace: await waitForRecord(() => this.get(existingId)), existing: true };
    }
    try {
      try {
        const existingId = (await readFile(indexPath, "utf8")).trim();
        return { workspace: await waitForRecord(() => this.get(existingId)), existing: true };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const id = `vws-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const workspace = {
        id,
        fencingToken: randomUUID(),
        status: "queued",
        phase: "queued",
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        attempt: 0,
        input,
      };
      await this.put(workspace);
      await writeFile(indexPath, `${id}\n`, { flag: "wx", mode: 0o600 });
      await this.audit("workspace.created", workspace);
      return { workspace, existing: false };
    } finally {
      await rm(lockPath, { recursive: true, force: true });
    }
  }

  async get(id) {
    return JSON.parse(await readFile(path.join(this.workspacesDir, `${id}.json`), "utf8"));
  }

  async put(workspace) {
    const operation = this.writeChain.then(() => this.writeNow(workspace));
    this.writeChain = operation.catch(() => {});
    return operation;
  }

  async writeNow(workspace) {
    workspace.updatedAt = new Date().toISOString();
    const target = path.join(this.workspacesDir, `${workspace.id}.json`);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(workspace, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, target);
    return workspace;
  }

  async list() {
    await this.init();
    const workspaces = [];
    for (const name of (await readdir(this.workspacesDir)).filter((value) => value.endsWith(".json"))) {
      try { workspaces.push(await this.get(name.slice(0, -5))); } catch { /* concurrently replaced */ }
    }
    return workspaces.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async audit(event, workspace, extra = {}) {
    const entry = {
      at: new Date().toISOString(),
      event,
      workspaceId: workspace.id,
      owner: workspace.input?.owner,
      session: workspace.input?.session,
      status: workspace.status,
      phase: workspace.phase,
      ...extra,
    };
    await appendFile(this.auditPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }
}

async function acquireLock(lockPath) {
  try {
    await mkdir(lockPath);
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return false;
  }
}

async function waitForIndex(indexPath) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { return (await readFile(indexPath, "utf8")).trim(); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("idempotency lock did not publish a workspace");
}

async function waitForRecord(read) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { return await read(); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("idempotency index points to a missing workspace");
}
