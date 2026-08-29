import { OpenShellProvider } from "./openshell-provider.mjs";
import { JobStore } from "./store.mjs";
import { resolveAllowedProject, validateJobInput } from "./validation.mjs";
import { createHash } from "node:crypto";
import { CapacityGate } from "./capacity.mjs";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export class JobManager {
  constructor({
    store = new JobStore(),
    provider = new OpenShellProvider(),
    capacity = new CapacityGate(),
    maxConcurrent = capacity.max,
  } = {}) {
    this.store = store;
    this.provider = provider;
    this.maxConcurrent = maxConcurrent;
    this.capacity = capacity;
    this.queue = [];
    this.running = new Map();
    this.cancelled = new Set();
  }

  async init() {
    await this.store.init();
    for (const job of await this.store.list()) {
      if (job.status === "queued") this.queue.push(job.id);
      if (job.status === "running") {
        if (job.sandboxName) {
          try { await this.provider.delete(job.sandboxName); } catch { /* prune will retry cleanup */ }
        }
        job.status = "queued";
        job.phase = "recovering";
        job.recoveredAfterRestart = true;
        await this.store.put(job);
        this.queue.push(job.id);
      }
    }
    queueMicrotask(() => this.pump());
  }

  async submit(raw) {
    const input = validateJobInput(raw);
    input.projectPath = await resolveAllowedProject(input.projectPath);
    const { job, existing } = await this.store.create(input);
    if (!existing) this.queue.push(job.id);
    queueMicrotask(() => this.pump());
    return { job, existing };
  }

  get(id) { return this.store.get(id); }
  list() { return this.store.list(); }

  async cancel(id) {
    this.cancelled.add(id);
    const job = await this.store.get(id);
    if (TERMINAL.has(job.status)) return job;
    job.cancelRequested = true;
    job.status = "cancelled";
    job.phase = "cancelled";
    await this.store.put(job);
    await this.store.audit("job.cancelled", job);
    if (job.sandboxName) await this.provider.delete(job.sandboxName);
    return job;
  }

  async prune() {
    const jobs = await this.store.list();
    const activeNames = new Set(jobs.filter((job) => !TERMINAL.has(job.status)).map((job) => job.sandboxName).filter(Boolean));
    const deleted = [];
    for (const sandbox of await this.provider.listManaged()) {
      if (!sandbox.name?.startsWith("vsb-")) continue;
      if (!activeNames.has(sandbox.name)) {
        await this.provider.delete(sandbox.name);
        deleted.push(sandbox.name);
      }
    }
    return { deleted };
  }

  health() {
    return { ok: true, maxConcurrent: this.maxConcurrent, running: this.running.size, queued: this.queue.length };
  }

  async pump() {
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const id = this.queue.shift();
      if (this.running.has(id)) continue;
      const promise = this.runOne(id).finally(() => {
        this.running.delete(id);
        queueMicrotask(() => this.pump());
      });
      this.running.set(id, promise);
    }
  }

  async runOne(id) {
    const capacityKey = `job:${id}`;
    await this.capacity.acquire(capacityKey);
    let job = await this.store.get(id);
    try {
      if (job.cancelRequested || TERMINAL.has(job.status)) return;
      job.status = "running";
      job.phase = "starting";
      job.attempt += 1;
      job.sandboxName = openshellSandboxName(job.id);
      job.startedAt = new Date().toISOString();
      await this.store.put(job);
      await this.store.audit("job.started", job);
      const result = await this.provider.execute(job, {
        phase: async (phase, patch = {}) => {
          if (this.cancelled.has(id)) return;
          const current = await this.store.get(id);
          if (this.cancelled.has(id) || current.cancelRequested || current.status === "cancelled") return;
          job = { ...current, ...patch, phase };
          await this.store.put(job);
          await this.store.audit("job.phase", job);
        },
      });
      if (this.cancelled.has(id)) return;
      job = await this.store.get(id);
      if (job.cancelRequested || job.status === "cancelled") return;
      job.result = result;
      job.status = result.ok ? "completed" : "failed";
      job.phase = job.status;
      job.finishedAt = new Date().toISOString();
      await this.store.put(job);
      await this.store.audit(`job.${job.status}`, job, { exitCode: result.exitCode });
    } catch (error) {
      if (this.cancelled.has(id)) return;
      job = await this.store.get(id);
      if (job.status !== "cancelled") {
        job.status = "failed";
        job.phase = "failed";
        job.error = error instanceof Error ? error.message : String(error);
        job.finishedAt = new Date().toISOString();
        await this.store.put(job);
        await this.store.audit("job.failed", job, { error: job.error });
      }
    } finally {
      if (job.sandboxName) {
        try { await this.provider.delete(job.sandboxName); } catch (cleanupError) {
          job = await this.store.get(id);
          job.cleanupError = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          await this.store.put(job);
          await this.store.audit("job.cleanup_failed", job, { error: job.cleanupError });
        }
      }
      this.capacity.release(capacityKey);
    }
  }
}

export function openshellSandboxName(jobId) {
  return `vsb-${createHash("sha256").update(jobId).digest("hex").slice(0, 12)}`;
}
