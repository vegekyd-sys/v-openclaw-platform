import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export class JobStore {
  constructor(root = process.env.VLAB_SANDBOX_STATE_DIR ?? "/srv/vlab/state/sandbox-broker") {
    this.root = root;
    this.jobsDir = path.join(root, "jobs");
    this.idempotencyDir = path.join(root, "idempotency");
    this.auditPath = path.join(root, "audit.jsonl");
    this.writeChain = Promise.resolve();
  }

  async init() {
    await mkdir(this.jobsDir, { recursive: true });
    await mkdir(this.idempotencyDir, { recursive: true });
  }

  async create(input) {
    await this.init();
    const keyHash = createHash("sha256").update(input.idempotencyKey).digest("hex");
    const indexPath = path.join(this.idempotencyDir, `${keyHash}.txt`);
    try {
      const existingId = (await readFile(indexPath, "utf8")).trim();
      return { job: await this.get(existingId), existing: true };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const id = `vjob-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const job = { id, status: "queued", phase: "queued", createdAt: now, updatedAt: now, attempt: 0, input };
    await this.put(job);
    try {
      await writeFile(indexPath, `${id}\n`, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existingId = (await readFile(indexPath, "utf8")).trim();
      return { job: await this.get(existingId), existing: true };
    }
    await this.audit("job.created", job);
    return { job, existing: false };
  }

  async get(id) {
    return JSON.parse(await readFile(path.join(this.jobsDir, `${id}.json`), "utf8"));
  }

  async put(job) {
    const operation = this.writeChain.then(() => this.writeNow(job));
    this.writeChain = operation.catch(() => {});
    return operation;
  }

  async writeNow(job) {
    job.updatedAt = new Date().toISOString();
    const target = path.join(this.jobsDir, `${job.id}.json`);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(job, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, target);
    return job;
  }

  async list() {
    const { readdir } = await import("node:fs/promises");
    await this.init();
    const names = await readdir(this.jobsDir);
    const jobs = [];
    for (const name of names.filter((value) => value.endsWith(".json"))) {
      try { jobs.push(await this.get(name.slice(0, -5))); } catch { /* skip a concurrently replaced file */ }
    }
    return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async audit(event, job, extra = {}) {
    const entry = {
      at: new Date().toISOString(), event, jobId: job.id, owner: job.input?.owner,
      session: job.input?.session, status: job.status, phase: job.phase, ...extra,
    };
    await appendFile(this.auditPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }
}
