// The Gateway's durable ledger (design §2.c): one JSON file per send, batch, chain and run.
//
//   <dir>/sends/<sendId>.json  batches/<batchId>.json  chains/<chainId>.json  runs/<sha1(runId)>.json
//   <dir>/archive/<YYYYMMDD>/…  <dir>/LOCK  <dir>/DISABLED
//
// Single writer: only the Gateway process's engine writes. Every record has its own promise
// chain; a write is tmp file → fsync → rename → directory fsync (best effort), all async.
// Updates are compare-and-set on the in-memory copy (one event loop, so the check and the swap
// are atomic); the caller awaits the disk write before any side effect ("先落盘，后产生副作用").
// A failed write puts the previous record back and throws.
//
// Crash injection (tests, candidate F6): VSR_CRASH_AT=<phase> exits the process right after the
// first send or batch record with that phase reaches disk; VSR_CRASH_AT=before:<phase> exits just
// before that record is written (the side effect that precedes it has already happened).

import fs from "node:fs/promises";
import path from "node:path";

import { BATCH_TERMINAL_PHASES, SEND_TERMINAL_PHASES, runRecordName } from "./contracts.js";

export const ARCHIVE_AFTER_MS = 24 * 3600_000;
export const ARCHIVE_KEEP_MS = 7 * 24 * 3600_000;
export const RUNS_KEEP_MS = 7 * 24 * 3600_000;
export const HISTORY_MAX = 30;
export const CRASH_EXIT_CODE = 86;

const KINDS = Object.freeze({
  sends: { dir: "sends", idKey: "sendId" },
  batches: { dir: "batches", idKey: "batchId" },
  chains: { dir: "chains", idKey: "chainId" },
});
const RUN_CACHE_MAX = 5000;

export class LedgerLockedError extends Error {
  constructor(lock) {
    super(`v-session-relay ledger is locked by pid ${lock?.pid} (started ${lock?.startedAt ? new Date(lock.startedAt).toISOString() : "?"})`);
    this.name = "LedgerLockedError";
    this.code = "LEDGER_LOCKED";
    this.lock = lock;
  }
}

function defaultIsPidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err?.code === "EPERM"; }
}

async function readBootId() {
  try { return (await fs.readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim() || null; } catch { return null; }
}

function dateDir(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}`;
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export const isSendTerminal = (rec) => SEND_TERMINAL_PHASES.includes(rec?.phase);
export const isBatchTerminal = (b) => BATCH_TERMINAL_PHASES.includes(b?.phase);

export class Ledger {
  /** Open (create) the ledger at `dir`, take the LOCK and load sends, batches and chains. */
  static async open(dir, opts = {}) {
    const ledger = new Ledger(dir, opts);
    await ledger.#init();
    return ledger;
  }

  #chains = new Map(); // file path → tail of its write chain
  #disabledCache = { at: 0, value: false };
  #crashed = false;
  #tmpSeq = 0;
  #runOrder = [];

  constructor(dir, { now = Date.now, pid = process.pid, bootId, isPidAlive = defaultIsPidAlive, logger, crashAt = process.env.VSR_CRASH_AT, onCrash } = {}) {
    this.dir = dir;
    this.now = now;
    this.pid = pid;
    this.bootId = bootId;
    this.isPidAlive = isPidAlive;
    this.logger = logger;
    this.crashAt = crashAt || null;
    this.onCrash = onCrash ?? (() => process.exit(CRASH_EXIT_CODE));
    this.sends = new Map();
    this.batches = new Map();
    this.chains = new Map();
    this.runs = new Map();
    this.byIdempotencyKey = new Map(); // idempotencyKey → Set<sendId> (one key may carry several messages)
    this.closed = false;
  }

  get dead() { return this.#crashed || this.closed; }

  async #init() {
    for (const sub of ["sends", "batches", "runs", "chains", "archive"]) await fs.mkdir(path.join(this.dir, sub), { recursive: true });
    if (this.bootId === undefined) this.bootId = await readBootId();
    await this.#acquireLock();
    for (const kind of Object.keys(KINDS)) await this.#load(kind);
    for (const rec of this.sends.values()) this.#indexIdempotency(rec);
  }

  #indexIdempotency(rec) {
    if (!rec?.idempotencyKey) return;
    let ids = this.byIdempotencyKey.get(rec.idempotencyKey);
    if (!ids) { ids = new Set(); this.byIdempotencyKey.set(rec.idempotencyKey, ids); }
    ids.add(rec.sendId);
  }

  #unindexIdempotency(key, sendId) {
    const ids = key ? this.byIdempotencyKey.get(key) : undefined;
    if (!ids) return;
    ids.delete(sendId);
    if (ids.size === 0) this.byIdempotencyKey.delete(key);
  }

  async #acquireLock() {
    const file = path.join(this.dir, "LOCK");
    let held = null;
    try { held = JSON.parse(await fs.readFile(file, "utf8")); } catch { held = null; }
    if (held && held.pid !== this.pid && this.isPidAlive(held.pid)
      && (!held.bootId || !this.bootId || held.bootId === this.bootId)) {
      throw new LedgerLockedError(held);
    }
    await this.#atomicWrite(file, { pid: this.pid, bootId: this.bootId ?? null, startedAt: this.now() });
  }

  async #load(kind) {
    const { dir, idKey } = KINDS[kind];
    const full = path.join(this.dir, dir);
    const names = await fs.readdir(full);
    const map = this[kind];
    await mapLimit(names, 16, async (name) => {
      const file = path.join(full, name);
      if (name.endsWith(".tmp")) { await fs.rm(file, { force: true }); return; }
      if (!name.endsWith(".json")) return;
      try {
        const rec = JSON.parse(await fs.readFile(file, "utf8"));
        if (rec && typeof rec[idKey] === "string") map.set(rec[idKey], rec);
      } catch (err) {
        this.logger?.warn?.(`v-session-relay: skipping unreadable ledger file ${file}: ${err?.message ?? err}`);
      }
    });
  }

  // ------------------------------------------------------------------ writes

  async #atomicWrite(file, obj) {
    if (this.#crashed) throw new Error("ledger crashed");
    if (this.closed) throw new Error("ledger closed");
    const tmp = `${file}.${this.pid}.${(this.#tmpSeq += 1)}.tmp`;
    const fh = await fs.open(tmp, "w");
    try {
      await fh.writeFile(JSON.stringify(obj));
      await fh.sync();
    } finally {
      await fh.close();
    }
    if (this.#crashed) { await fs.rm(tmp, { force: true }); throw new Error("ledger crashed"); }
    await fs.rename(tmp, file);
    try {
      const dh = await fs.open(path.dirname(file), "r");
      try { await dh.sync(); } finally { await dh.close(); }
    } catch { /* best effort */ }
  }

  #persist(file, obj, kind) {
    const prev = this.#chains.get(file) ?? Promise.resolve();
    const p = prev.catch(() => {}).then(async () => {
      const watched = this.crashAt && (kind === "sends" || kind === "batches") && !this.#crashed;
      if (watched && this.crashAt === `before:${obj?.phase}`) this.#crash(kind, obj);
      await this.#atomicWrite(file, obj);
      if (watched && obj?.phase === this.crashAt) this.#crash(kind, obj);
    });
    this.#chains.set(file, p);
    p.then(() => { if (this.#chains.get(file) === p) this.#chains.delete(file); }, () => { if (this.#chains.get(file) === p) this.#chains.delete(file); });
    return p;
  }

  #crash(kind, obj) {
    this.#crashed = true;
    this.logger?.warn?.(`v-session-relay: VSR_CRASH_AT=${this.crashAt} reached (${kind} ${obj.sendId ?? obj.batchId})`);
    this.onCrash({ kind, record: obj });
  }

  #file(kind, id) { return path.join(this.dir, KINDS[kind].dir, `${id}.json`); }

  async #create(kind, rec) {
    const { idKey } = KINDS[kind];
    const id = rec[idKey];
    if (this[kind].has(id)) throw new Error(`${kind} ${id} exists`);
    const stamped = { ...rec, updatedAt: rec.updatedAt ?? this.now() };
    this[kind].set(id, stamped);
    if (kind === "sends") this.#indexIdempotency(stamped);
    try {
      await this.#persist(this.#file(kind, id), stamped, kind);
    } catch (err) {
      if (this[kind].get(id) === stamped) {
        this[kind].delete(id);
        if (kind === "sends") this.#unindexIdempotency(stamped.idempotencyKey, id);
      }
      throw err;
    }
    return stamped;
  }

  /**
   * Compare-and-set: when `from` is given the record must be in one of those phases. `mutate`
   * edits a deep copy (return false to give up). Resolves to the new record once it is on disk,
   * or null when the record is missing, in another phase, or `mutate` gave up.
   */
  async #update(kind, id, mutate, { from, note } = {}) {
    const cur = this[kind].get(id);
    if (!cur) return null;
    if (from && !from.includes(cur.phase)) return null;
    const draft = structuredClone(cur);
    if (mutate(draft) === false) return null;
    draft.updatedAt = this.now();
    if (kind === "sends" && (draft.phase !== cur.phase || note)) {
      draft.history = [...(draft.history ?? []), { at: draft.updatedAt, phase: draft.phase, ...(note ? { note } : {}) }].slice(-HISTORY_MAX);
    }
    this[kind].set(id, draft);
    try {
      await this.#persist(this.#file(kind, id), draft, kind);
    } catch (err) {
      if (this[kind].get(id) === draft) this[kind].set(id, cur);
      throw err;
    }
    return draft;
  }

  createSend(rec) { return this.#create("sends", { history: [{ at: rec.createdAt ?? this.now(), phase: rec.phase }], ...rec }); }
  updateSend(id, mutate, opts) { return this.#update("sends", id, mutate, opts); }
  createBatch(rec) { return this.#create("batches", rec); }
  updateBatch(id, mutate, opts) { return this.#update("batches", id, mutate, opts); }
  createChain(rec) { return this.#create("chains", rec); }
  updateChain(id, mutate, opts) { return this.#update("chains", id, mutate, opts); }

  getSend(id) { return this.sends.get(id) ?? null; }
  getBatch(id) { return this.batches.get(id) ?? null; }
  getChain(id) { return this.chains.get(id) ?? null; }

  // ------------------------------------------------------------------ runs (loaded on demand)

  #cacheRun(runId, run) {
    if (!this.runs.has(runId)) this.#runOrder.push(runId);
    this.runs.set(runId, run);
    while (this.#runOrder.length > RUN_CACHE_MAX) this.runs.delete(this.#runOrder.shift());
  }

  async getRun(runId) {
    if (!runId) return null;
    if (this.runs.has(runId)) return this.runs.get(runId);
    try {
      const run = JSON.parse(await fs.readFile(path.join(this.dir, "runs", runRecordName(runId)), "utf8"));
      const ok = run && run.runId === runId ? run : null;
      if (ok) this.#cacheRun(runId, ok);
      return ok;
    } catch {
      return null;
    }
  }

  async putRun(run) {
    const prev = this.runs.get(run.runId);
    this.#cacheRun(run.runId, run);
    try {
      await this.#persist(path.join(this.dir, "runs", runRecordName(run.runId)), run, "runs");
    } catch (err) {
      if (this.runs.get(run.runId) === run) { if (prev) this.runs.set(run.runId, prev); else this.runs.delete(run.runId); }
      throw err;
    }
    return run;
  }

  // ------------------------------------------------------------------ queries (memory only)

  /**
   * The send recorded under `key`. With `contentKey`, only a send of that same message (requester,
   * target, text): providers may reuse toolCallIds, so one key can carry two different sends and a
   * different message under a known key is a new send, never a repeat (review-core-send).
   * Without `contentKey`, the first send recorded under the key.
   */
  findByIdempotencyKey(key, contentKey) {
    const ids = key ? this.byIdempotencyKey.get(key) : undefined;
    if (!ids) return null;
    let best = null;
    for (const id of ids) {
      const rec = this.sends.get(id);
      if (!rec) continue;
      if (contentKey !== undefined && rec.contentKey && rec.contentKey !== contentKey) continue;
      if (!best || rec.createdAt < best.createdAt) best = rec;
    }
    return best;
  }

  /** An in-flight (non-terminal) send with this content key, created within `windowMs`. */
  findInFlightByContent(contentKey, windowMs) {
    const since = this.now() - windowMs;
    let best = null;
    for (const rec of this.sends.values()) {
      if (rec.contentKey !== contentKey || isSendTerminal(rec) || rec.createdAt < since) continue;
      if (!best || rec.createdAt > best.createdAt) best = rec;
    }
    return best;
  }

  codeTaken(code) {
    for (const rec of this.sends.values()) if (rec.code === code && !isSendTerminal(rec)) return true;
    return false;
  }

  sendsWhere(pred) { return [...this.sends.values()].filter(pred); }
  batchesWhere(pred) { return [...this.batches.values()].filter(pred); }

  // ------------------------------------------------------------------ switches and housekeeping

  /** True while `<dir>/DISABLED` exists (cached 1 s; async stat). */
  async isDisabled() {
    const t = this.now();
    if (t - this.#disabledCache.at < 1_000) return this.#disabledCache.value;
    let value = false;
    try { await fs.access(path.join(this.dir, "DISABLED")); value = true; } catch { value = false; }
    this.#disabledCache = { at: t, value };
    return value;
  }

  /**
   * Move records that closed more than 24 h ago to archive/<date>/, drop archives older than
   * 7 days and run records older than 7 days. `keep(kind, rec)` can hold a record back.
   */
  async sweep({ keep = () => false } = {}) {
    const t = this.now();
    let moved = 0;
    const archive = async (kind, rec, id) => {
      const day = dateDir(rec.updatedAt ?? t);
      const dst = path.join(this.dir, "archive", day, KINDS[kind].dir);
      await fs.mkdir(dst, { recursive: true });
      const src = this.#file(kind, id);
      await (this.#chains.get(src) ?? Promise.resolve()).catch(() => {});
      try { await fs.rename(src, path.join(dst, `${id}.json`)); } catch (err) { if (err?.code !== "ENOENT") throw err; }
      if (this[kind].get(id) === rec) this[kind].delete(id);
      if (kind === "sends") this.#unindexIdempotency(rec.idempotencyKey, id);
      moved += 1;
    };
    for (const rec of [...this.sends.values()]) {
      if (isSendTerminal(rec) && t - (rec.updatedAt ?? 0) > ARCHIVE_AFTER_MS && !keep("sends", rec)) await archive("sends", rec, rec.sendId);
    }
    for (const b of [...this.batches.values()]) {
      if (isBatchTerminal(b) && t - (b.updatedAt ?? 0) > ARCHIVE_AFTER_MS && !keep("batches", b)) await archive("batches", b, b.batchId);
    }
    const liveChains = new Set([...this.sends.values()].map((r) => r.chainId));
    for (const c of [...this.chains.values()]) {
      const idle = t - (c.lastActivityAt ?? c.createdAt ?? 0) > ARCHIVE_AFTER_MS;
      const expired = t > (c.hardExpiresAt ?? Infinity) || t > (c.idleExpiresAt ?? Infinity);
      if (idle && expired && !liveChains.has(c.chainId) && !keep("chains", c)) await archive("chains", c, c.chainId);
    }
    // Old archives and run records.
    try {
      for (const day of await fs.readdir(path.join(this.dir, "archive"))) {
        if (!/^\d{8}$/u.test(day)) continue;
        const dayMs = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
        if (t - dayMs > ARCHIVE_KEEP_MS + 24 * 3600_000) await fs.rm(path.join(this.dir, "archive", day), { recursive: true, force: true });
      }
    } catch { /* nothing archived yet */ }
    try {
      const runsDir = path.join(this.dir, "runs");
      for (const name of await fs.readdir(runsDir)) {
        const file = path.join(runsDir, name);
        const st = await fs.stat(file).catch(() => null);
        if (st && t - st.mtimeMs > RUNS_KEEP_MS) await fs.rm(file, { force: true });
      }
    } catch { /* ignore */ }
    return { moved };
  }

  /** Wait for every pending write. */
  async flush() {
    await Promise.allSettled([...this.#chains.values()]);
  }

  /** Release the LOCK (only if it is ours). */
  async close() {
    if (this.closed) return;
    await this.flush();
    this.closed = true;
    const file = path.join(this.dir, "LOCK");
    try {
      const held = JSON.parse(await fs.readFile(file, "utf8"));
      if (held?.pid === this.pid) await fs.rm(file, { force: true });
    } catch { /* gone */ }
  }
}
