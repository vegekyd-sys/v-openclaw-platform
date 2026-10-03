// Keep V's memory_search index current in real time, outside the Gateway.
//
// memory_search opens a read-only "search" manager per call (2026-09-11 query
// isolation), so nothing in the Gateway watches memory files any more. This process
// opens OpenClaw's own memory manager in its default purpose, which runs the native
// watcher (inotify per directory on Linux, 1.5 s debounce) and syncs only what
// changed. It runs beside the Gateway so index writes never block the Gateway's
// event loop; memory_search sees a change as soon as the sync commits.
//
//   OPENCLAW_DIST=<gateway dist> node v-memory-indexer.mjs [agent...]   (default makaron)
//
// Environment and config are the Gateway's (see v-memory-indexer.sh). Besides the
// watcher, a reconcile sync runs every RECONCILE_MINUTES (default 60) in case an
// inotify event was lost.
//
// This process writes the same agent database the Gateway writes, and the Gateway waits
// for that write lock synchronously on its main thread (busy timeout 5 s, then retry).
// On 2026-10-02 21:16 a Librarian commit burst made one file change while it was being
// indexed; upstream then escalates the next sync to a full in-place reindex, whose final
// table publish held the write lock for 327 s and froze the Gateway for 127 s. So here:
// - no full reindex, ever: it is refused and logged (run it deliberately with the CLI);
// - a file that changes while being indexed only leaves the index dirty, and the next
//   watch event re-indexes that file incrementally;
// - watch syncs wait for QUIET_SECONDS (default 15) without file events, so a burst of
//   writes to one large file is indexed once, not once per write;
// - every file write logs its duration, so long lock holds are visible per file.
import fs from "node:fs";
import path from "node:path";

const dist = process.env.OPENCLAW_DIST;
if (!dist) throw new Error("OPENCLAW_DIST is required");
const agents = process.argv.slice(2).length ? process.argv.slice(2) : ["makaron"];
const reconcileMs = Number(process.env.RECONCILE_MINUTES || 60) * 60_000;
const quietMs = Number(process.env.QUIET_SECONDS || 15) * 1000;
const slowWriteMs = Number(process.env.SLOW_WRITE_MS || 500);
const log = (event) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));

const { loadConfig } = await import(path.join(dist, "plugin-sdk/config-runtime.js"));
const { MemoryIndexManager } = await import(path.join(dist, "extensions/memory-core/manager-runtime.js"));
const { configureMemoryCoreDreamingState } = await import(path.join(dist, "extensions/memory-core/api.js"));

// A sync that touches changed files also updates memory-core's plugin state (recall
// bookkeeping). Inside the Gateway or CLI the plugin host supplies that store when it
// registers memory-core; here we hand it the same store the host would:
// createPluginStateKeyedStore("memory-core", …). The chunk name is hashed per build,
// so find the function by name and refuse to run if it is not exactly one match.
async function findPluginStateKeyedStoreFactory() {
  const found = [];
  for (const file of fs.readdirSync(dist).filter((name) => /^plugin-state-store-[\w-]+\.js$/u.test(name))) {
    const mod = await import(path.join(dist, file));
    for (const value of Object.values(mod)) if (typeof value === "function" && value.name === "createPluginStateKeyedStore") found.push(value);
  }
  if (found.length !== 1) throw new Error(`expected one createPluginStateKeyedStore in ${dist}, found ${found.length}`);
  return found[0];
}
const createPluginStateKeyedStore = await findPluginStateKeyedStoreFactory();
configureMemoryCoreDreamingState((options) => createPluginStateKeyedStore("memory-core", options));

// One line per sync: what triggered it, how long it took, and the resulting index size.
const originalSync = MemoryIndexManager.prototype.sync;
MemoryIndexManager.prototype.sync = async function (params) {
  const started = performance.now();
  try {
    const result = await originalSync.call(this, params);
    const status = this.status();
    const memory = status.sourceCounts?.find((entry) => entry.source === "memory");
    log({ event: "sync", agent: this.agentId, reason: params?.reason, ms: Math.round(performance.now() - started), files: memory?.files, eligible: memory?.eligible, chunks: memory?.chunks, dirty: memory?.dirty });
    return result;
  } catch (error) {
    log({ event: "sync-failed", agent: this.agentId, reason: params?.reason, ms: Math.round(performance.now() - started), error: String(error?.message ?? error).slice(0, 300) });
    throw error;
  }
};

// Refuse the full in-place reindex and never schedule one after a failed memory sync.
let lastRefusalLog = 0;
MemoryIndexManager.prototype.runInPlaceReindex = async function (params) {
  if (Date.now() - lastRefusalLog > 10 * 60_000) {
    lastRefusalLog = Date.now();
    log({ event: "full-reindex-refused", agent: this.agentId, reason: params?.reason, fix: "run `openclaw memory index --force` deliberately, off-peak" });
  }
  throw new Error("v-memory-indexer does not run full reindexes");
};
const originalMarkFailed = MemoryIndexManager.prototype.markFailedFullReindexRetry;
MemoryIndexManager.prototype.markFailedFullReindexRetry = function (params) {
  if (params?.memory) this.dirty = true;
  if (params?.sessions) originalMarkFailed.call(this, { memory: false, sessions: true });
};

// Per-file write duration; writes are one SQLite IMMEDIATE transaction each.
const originalWriteChunks = MemoryIndexManager.prototype.writeChunks;
MemoryIndexManager.prototype.writeChunks = async function (item, ...rest) {
  const started = performance.now();
  try {
    return await originalWriteChunks.call(this, item, ...rest);
  } finally {
    const ms = Math.round(performance.now() - started);
    if (ms >= slowWriteMs) log({ event: "slow-write", agent: this.agentId, path: item?.entry?.path, chunks: item?.chunks?.length, ms });
  }
};

const cfg = loadConfig();
const managers = [];
for (const agentId of agents) {
  const manager = await MemoryIndexManager.get({ cfg, agentId });
  // The watcher re-arms its debounce timer on every event, so this is a quiet period.
  manager.settings.sync.watchDebounceMs = Math.max(manager.settings.sync.watchDebounceMs ?? 0, quietMs);
  managers.push(manager);
  log({ event: "watching", agent: agentId, workspace: manager.workspaceDir });
  await manager.sync({ reason: "indexer-startup" }).catch(() => {});
}

const reconcile = setInterval(() => {
  for (const manager of managers) manager.sync({ reason: "indexer-reconcile" }).catch(() => {});
}, reconcileMs);

let stopping = false;
const stop = async (signal) => {
  if (stopping) return;
  stopping = true;
  clearInterval(reconcile);
  log({ event: "stopping", signal });
  await Promise.allSettled(managers.map((manager) => manager.close()));
  process.exit(0);
};
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
