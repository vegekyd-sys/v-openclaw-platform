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
// - a memory file is written in short transactions (see installShortWrites), and every
//   file write whose longest transaction is slow is logged;
// - only chunks that changed are written (see "Unchanged chunks" below).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// A sync that touches changed files also updates memory-core's plugin state (recall
// bookkeeping). Inside the Gateway or CLI the plugin host supplies that store when it
// registers memory-core; here we hand it the same store the host would:
// createPluginStateKeyedStore("memory-core", …). The chunk name is hashed per build,
// so find the function by name and refuse to run if it is not exactly one match.
async function findDistFunction(dist, filePattern, name) {
  const found = new Set();
  for (const file of fs.readdirSync(dist).filter((entry) => filePattern.test(entry))) {
    const mod = await import(path.join(dist, file));
    for (const value of Object.values(mod)) if (typeof value === "function" && value.name === name) found.add(value);
  }
  if (found.size !== 1) throw new Error(`expected one ${name} in ${dist}, found ${found.size}`);
  return [...found][0];
}

export async function configurePluginState(dist, configureMemoryCoreDreamingState) {
  const createPluginStateKeyedStore = await findDistFunction(dist, /^plugin-state-store-[\w-]+\.js$/u, "createPluginStateKeyedStore");
  configureMemoryCoreDreamingState((options) => createPluginStateKeyedStore("memory-core", options));
}

// The bindings memory-core's manager-runtime.js imports, by their source names (chunk
// file names and export letters are hashed per build).
export async function managerRuntimeImports(dist, names) {
  const file = path.join(dist, "extensions/memory-core/manager-runtime.js");
  const source = fs.readFileSync(file, "utf8");
  const found = {};
  for (const [, specifiers, from] of source.matchAll(/^import \{([^}]*)\} from "([^"]+)";$/gmu)) {
    for (const specifier of specifiers.split(",")) {
      const [exported, local = exported] = specifier.trim().split(/\s+as\s+/u);
      if (names.includes(local)) found[local] = { from: path.resolve(path.dirname(file), from), exported };
    }
  }
  const missing = names.filter((name) => !found[name]);
  if (missing.length) throw new Error(`manager-runtime.js does not import ${missing.join(", ")}`);
  const bindings = {};
  for (const [name, { from, exported }] of Object.entries(found)) bindings[name] = (await import(from))[exported];
  return bindings;
}

// The upstream methods the short writes reproduce, as of OpenClaw 2026.9.1-db91.6. When
// an upgrade changes any of them, the short writes stay off and upstream writes run.
const REPRODUCED_METHODS = ["writeChunks", "clearIndexedFileData", "deleteVectorRowsForSource", "upsertFileRecord", "deleteFileRecord", "assertMemoryFileSnapshot", "markVectorRebuildRequired"];
export const REPRODUCED_FINGERPRINT = "edbe60cabf3a7b74a3538dd1f6233a759debcde6f98466479af9b34be7775730";

// Upstream writes one memory file in one IMMEDIATE transaction: delete the file's FTS rows
// by path (an unindexed FTS column, so a scan of the whole FTS table), its vector rows and
// chunk rows, then insert every chunk into five tables and upsert the embedding cache. On
// V the daily memory file has 200-320 chunks and is re-written after every append; that
// transaction held the makaron agent database write lock for up to 10.1 s (2026-10-08),
// and a Gateway reply waiting for the lock failed at 5 s.
//
// The short writes produce the same rows with the same statements, split up:
// - the rows to delete are found first, outside any write transaction, and each
//   transaction's deletes are read just before it, so their pages are not read cold
//   while the lock is held;
// - writes run in transactions that commit after WRITE_BUDGET_MS (default 50) of work,
//   with a WRITE_PAUSE_MS (default 150) pause between them, longer than SQLite's busy
//   handler sleeps (at most 100 ms), so a waiting Gateway writer gets the lock;
// - order: each new chunk replaces its old row of the same id, then chunks the file no
//   longer has are deleted, then the embedding cache, and last the file record. Until
//   the file record is written the index still records the old file hash, so a write
//   that stops part way is redone in full by the next sync; on an error the file record
//   is removed so that the next sync re-indexes the file from scratch.
// memory_search may meanwhile see the file part old, part new, never neither.
// Session sources (not indexed on V) keep the upstream write.
//
// Unchanged chunks (2026-10-21). A chunk id hashes source, path, start and end line,
// content hash and model, so a chunk whose id the file already has is already indexed
// with exactly these rows. Upstream still deletes and re-inserts every chunk of the file.
// sqlite-vec never reuses a deleted slot, so each rewrite of an append-only file (the
// daily log, log.md: hundreds of chunks, rewritten after every append, 31 times a day)
// left hundreds of empty slots that every KNN query still scans: on V 65,792 slots held
// 42,309 live vectors (64%). Now an unchanged chunk keeps its rows; the write only
// refreshes its recall metadata and provenance and repairs a missing vector or FTS row
// (or extra FTS rows). New and changed chunks are written as before, and so is the
// embedding cache for them. Search does not read chunk updated_at (temporal decay uses
// the path date or the file mtime). DIFF_WRITES=0 restores whole-file rewrites.
// More steps than a transaction runs within its budget (warm: about 5 chunks per 50 ms).
const PREFETCH_STEPS = 32;

export async function installShortWrites(dist, MemoryIndexManager, { log, budgetMs = 50, pauseMs = 150, slowMs = 200, diffWrites = true, onWrite } = {}) {
  const proto = MemoryIndexManager.prototype;
  const fingerprint = crypto.createHash("sha256").update(REPRODUCED_METHODS.map((name) => String(proto[name])).join("\n")).digest("hex");
  if (fingerprint !== REPRODUCED_FINGERPRINT) {
    log({ event: "short-writes-off", reason: "upstream memory write methods changed", fingerprint });
    return false;
  }
  const {
    buildFileEntry,
    withMemoryWorkspaceLock,
    runSqliteImmediateTransactionSync,
    hashText,
    vectorToBlob,
    MEMORY_INDEX_FTS_TABLE: ftsTable,
    MEMORY_INDEX_VECTOR_TABLE: vectorTable,
    MEMORY_EMBEDDING_CACHE_TABLE: cacheTable,
    MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE: recallTable,
    MEMORY_INDEX_CHUNK_PROVENANCE_TABLE: provenanceTable,
  } = await managerRuntimeImports(dist, ["buildFileEntry", "withMemoryWorkspaceLock", "runSqliteImmediateTransactionSync", "hashText", "vectorToBlob", "MEMORY_INDEX_FTS_TABLE", "MEMORY_INDEX_VECTOR_TABLE", "MEMORY_EMBEDDING_CACHE_TABLE", "MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE", "MEMORY_INDEX_CHUNK_PROVENANCE_TABLE"]);

  const upstreamWriteChunks = proto.writeChunks;
  proto.writeChunks = async function (item, generation, embeddings, vectorReady) {
    if (item.source !== "memory") return await upstreamWriteChunks.call(this, item, generation, embeddings, vectorReady);
    await withMemoryWorkspaceLock(this.workspaceDir, () => writeMemoryFile(this, item, generation, embeddings, vectorReady));
  };

  async function writeMemoryFile(manager, { entry, source, chunks }, generation, embeddings, vectorReady) {
    const current = await buildFileEntry(entry.absPath, manager.workspaceDir, manager.settings.multimodal);
    manager.assertMemoryFileSnapshot(entry, current?.hash);
    const db = manager.db;
    const started = performance.now();
    const now = Date.now();
    const model = generation?.provider?.model ?? "fts-only";
    const needsVectorRebuild = !vectorReady && embeddings.some((embedding) => embedding.length > 0);
    const ftsOn = manager.fts.enabled && manager.fts.available;
    // deleteVectorRowsForSource: nothing without the table, only a rebuild marker while
    // vectors are unavailable, and a rebuild marker if a delete fails.
    const vectorTableExists = Boolean(db.prepare("SELECT 1 AS found FROM sqlite_schema WHERE type = 'table' AND name = ?").get(vectorTable));
    const deleteVectors = vectorTableExists && manager.vector.enabled && manager.vector.available === true;

    // What the file has in the index now (reads, no write lock).
    const oldIds = new Set(db.prepare("SELECT id FROM memory_index_chunks WHERE path = ? AND source = ?").all(entry.path, source).map((row) => row.id));
    const ftsRowids = new Map();
    let ftsReadable = ftsOn;
    if (ftsOn) {
      try {
        for (const row of db.prepare(`SELECT rowid, id FROM ${ftsTable} WHERE path = ? AND source = ?`).all(entry.path, source)) {
          const list = ftsRowids.get(row.id) ?? [];
          list.push(row.rowid);
          ftsRowids.set(row.id, list);
        }
      } catch {
        ftsReadable = false; // upstream ignores a failing FTS delete
      }
    }

    const deleteVector = db.prepare(`DELETE FROM ${vectorTable} WHERE id = ?`);
    const deleteFts = ftsReadable ? db.prepare(`DELETE FROM ${ftsTable} WHERE rowid = ?`) : null;
    const deleteChunk = db.prepare("DELETE FROM memory_index_chunks WHERE id = ?");
    const insertChunk = db.prepare(`INSERT INTO memory_index_chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 hash=excluded.hash,
                 model=excluded.model,
                 text=excluded.text,
                 embedding=excluded.embedding,
                 updated_at=excluded.updated_at`);
    const insertRecall = db.prepare(`INSERT INTO ${recallTable} (
                 chunk_id, importance, triggers, project_key
               ) VALUES (?, ?, ?, ?)
               ON CONFLICT(chunk_id) DO UPDATE SET
                 importance=excluded.importance,
                 triggers=excluded.triggers,
                 project_key=excluded.project_key`);
    const insertProvenance = db.prepare(`INSERT INTO ${provenanceTable} (
                 chunk_id, origin_class, session_kind, observed_at, supersedes_key
               ) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(chunk_id) DO UPDATE SET
                 origin_class=excluded.origin_class,
                 session_kind=excluded.session_kind,
                 observed_at=excluded.observed_at,
                 supersedes_key=excluded.supersedes_key`);
    const insertVector = db.prepare(`INSERT INTO ${vectorTable} (id, embedding) VALUES (?, ?)`);
    const insertFts = ftsOn ? db.prepare(`INSERT INTO ${ftsTable} (text, id, path, source, model, start_line, end_line)\n VALUES (?, ?, ?, ?, ?, ?, ?)`) : null;
    const hasVector = deleteVectors ? db.prepare(`SELECT 1 AS found FROM ${vectorTable} WHERE id = ?`) : null;

    // Deleting a row reads it first: a chunk row carries its embedding as ~60 KB of JSON in
    // overflow pages, a vector row sits in a sqlite-vec block. Cold, that is 100-300 ms per
    // delete inside the transaction, so each transaction's deletes are read beforehand.
    const readChunk = db.prepare("SELECT length(embedding) + length(text) AS n FROM memory_index_chunks WHERE id = ?");
    const readVector = deleteVectors ? db.prepare(`SELECT length(embedding) AS n FROM ${vectorTable} WHERE id = ?`) : null;
    const prefetch = (id) => {
      try {
        readChunk.get(id);
        readVector?.get(id);
      } catch {}
    };

    const removeFts = (id) => {
      if (deleteFts) for (const rowid of ftsRowids.get(id) ?? []) try { deleteFts.run(rowid); } catch {}
      ftsRowids.delete(id);
    };
    const removeIndexed = (id) => {
      if (deleteVectors) {
        try {
          deleteVector.run(id);
        } catch {
          manager.markVectorRebuildRequired();
        }
      }
      removeFts(id);
      deleteChunk.run(id);
    };

    // Write steps in order; `reads` names the chunk id whose rows the step deletes.
    const ops = [];
    if (vectorTableExists && !deleteVectors) ops.push({ run: () => manager.markVectorRebuildRequired() });
    const newIds = new Set();
    const unchangedIndexes = new Set();
    let repaired = 0;
    for (const [i, chunk] of chunks.entries()) {
      const embedding = embeddings[i] ?? [];
      const id = hashText(`${source}:${entry.path}:${chunk.startLine}:${chunk.endLine}:${chunk.hash}:${model}`);
      newIds.add(id);
      const provenance = chunk.provenance ?? { originClass: "untrusted", sessionKind: "unknown", observedAt: now };
      if (diffWrites && oldIds.has(id)) {
        // Already indexed with these rows: keep them, repair what is missing (read now,
        // outside the lock), refresh the small per-chunk metadata.
        unchangedIndexes.add(i);
        oldIds.delete(id);
        const fts = ftsRowids.get(id) ?? [];
        ftsRowids.delete(id);
        const missingVector = Boolean(vectorReady && embedding.length > 0 && hasVector && !hasVector.get(id));
        const missingFts = Boolean(insertFts && ftsReadable && fts.length === 0);
        const extraFts = deleteFts ? fts.slice(1) : [];
        if (missingVector || missingFts || extraFts.length > 0) repaired += 1;
        ops.push({ run: () => {
          insertRecall.run(id, chunk.importance, chunk.triggers, chunk.projectKey);
          insertProvenance.run(id, provenance.originClass, provenance.sessionKind, provenance.observedAt, provenance.supersedesKey ?? null);
          for (const rowid of extraFts) try { deleteFts.run(rowid); } catch {}
          if (missingFts) insertFts.run(chunk.text, id, entry.path, source, model, chunk.startLine, chunk.endLine);
          if (missingVector) insertVector.run(id, vectorToBlob(embedding));
        } });
        continue;
      }
      ops.push({ reads: oldIds.has(id) ? id : null, run: () => {
        if (oldIds.delete(id)) removeIndexed(id);
        else removeFts(id);
        insertChunk.run(id, entry.path, source, chunk.startLine, chunk.endLine, chunk.hash, model, chunk.text, JSON.stringify(embedding), now);
        insertRecall.run(id, chunk.importance, chunk.triggers, chunk.projectKey);
        insertProvenance.run(id, provenance.originClass, provenance.sessionKind, provenance.observedAt, provenance.supersedesKey ?? null);
        if (vectorReady && embedding.length > 0) {
          try {
            deleteVector.run(id);
          } catch {}
          insertVector.run(id, vectorToBlob(embedding));
        }
        if (insertFts) insertFts.run(chunk.text, id, entry.path, source, model, chunk.startLine, chunk.endLine);
      } });
    }
    // Chunks the file no longer has (the new chunks above took out the ids they reuse),
    // then FTS rows of the path that have no chunk row.
    ops.push(...[...oldIds].filter((id) => !newIds.has(id)).map((id) => ({ reads: id, run: () => removeIndexed(id) })));
    ops.push({ run: () => {
      for (const id of [...ftsRowids.keys()]) removeFts(id);
    } });
    const provider = generation?.provider ?? null;
    const providerKey = generation?.providerKey ?? null;
    if (manager.cache.enabled && provider && providerKey && chunks.length > 0) {
      const upsertCache = db.prepare(`INSERT INTO ${cacheTable} (provider, model, provider_key, hash, embedding, dims, updated_at)\n VALUES (?, ?, ?, ?, ?, ?, ?)\n ON CONFLICT(provider, model, provider_key, hash) DO UPDATE SET\n   embedding=excluded.embedding,\n   dims=excluded.dims,\n   updated_at=excluded.updated_at`);
      for (const [i, chunk] of chunks.entries()) {
        if (unchangedIndexes.has(i)) continue;
        const embedding = embeddings[i] ?? [];
        ops.push({ run: () => upsertCache.run(provider.id, provider.model, providerKey, chunk.hash, JSON.stringify(embedding), embedding.length, now) });
      }
    }
    ops.push({ run: () => {
      manager.upsertFileRecord(entry, source);
      if (needsVectorRebuild) manager.markVectorRebuildRequired();
    } });

    let next = 0;
    let transactions = 0;
    // Hold: from taking the lock (inside BEGIN IMMEDIATE) to the end of COMMIT. Waiting for
    // another writer's lock is counted apart; on V it made a 1.1 s Gateway hold look like ours.
    let longestMs = 0;
    let longestWaitMs = 0;
    try {
      while (next < ops.length) {
        if (transactions > 0) await sleep(pauseMs);
        for (let i = next; i < Math.min(ops.length, next + PREFETCH_STEPS); i++) if (ops[i].reads) prefetch(ops[i].reads);
        const txStarted = performance.now();
        let lockedAt = txStarted;
        runSqliteImmediateTransactionSync(db, () => {
          lockedAt = performance.now();
          const until = lockedAt + budgetMs;
          do ops[next++].run();
          while (next < ops.length && performance.now() < until);
        }, { operationLabel: "memory.index.write" });
        transactions += 1;
        longestMs = Math.max(longestMs, performance.now() - lockedAt);
        longestWaitMs = Math.max(longestWaitMs, lockedAt - txStarted);
      }
    } catch (error) {
      if (transactions > 0) {
        try {
          runSqliteImmediateTransactionSync(db, () => manager.deleteFileRecord(entry.path, source), { operationLabel: "memory.index.write" });
        } catch {}
      }
      throw error;
    } finally {
      const stats = { path: entry.path, chunks: chunks.length, unchanged: unchangedIndexes.size, repaired, removed: [...oldIds].filter((id) => !newIds.has(id)).length, transactions, longestMs: Math.round(longestMs), longestWaitMs: Math.round(longestWaitMs), ms: Math.round(performance.now() - started) };
      onWrite?.(stats);
      if (longestMs >= slowMs) log({ event: "slow-write", agent: manager.agentId, ...stats });
    }
  }
  return true;
}

async function main() {
  const dist = process.env.OPENCLAW_DIST;
  if (!dist) throw new Error("OPENCLAW_DIST is required");
  const agents = process.argv.slice(2).length ? process.argv.slice(2) : ["makaron"];
  const reconcileMs = Number(process.env.RECONCILE_MINUTES || 60) * 60_000;
  const quietMs = Number(process.env.QUIET_SECONDS || 15) * 1000;
  const slowWriteMs = Number(process.env.SLOW_WRITE_MS || 200);
  const log = (event) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));

  const { loadConfig } = await import(path.join(dist, "plugin-sdk/config-runtime.js"));
  const { MemoryIndexManager } = await import(path.join(dist, "extensions/memory-core/manager-runtime.js"));
  const { configureMemoryCoreDreamingState } = await import(path.join(dist, "extensions/memory-core/api.js"));
  await configurePluginState(dist, configureMemoryCoreDreamingState);

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

  const shortWrites = await installShortWrites(dist, MemoryIndexManager, {
    log,
    budgetMs: Number(process.env.WRITE_BUDGET_MS || 50),
    pauseMs: Number(process.env.WRITE_PAUSE_MS || 150),
    slowMs: slowWriteMs,
    diffWrites: process.env.DIFF_WRITES !== "0",
  });
  if (!shortWrites) {
    // Upstream writes: one transaction per file, so its duration is the lock hold.
    const upstreamWriteChunks = MemoryIndexManager.prototype.writeChunks;
    MemoryIndexManager.prototype.writeChunks = async function (item, ...rest) {
      const started = performance.now();
      try {
        return await upstreamWriteChunks.call(this, item, ...rest);
      } finally {
        const ms = Math.round(performance.now() - started);
        if (ms >= slowWriteMs) log({ event: "slow-write", agent: this.agentId, path: item?.entry?.path, chunks: item?.chunks?.length, transactions: 1, ms });
      }
    };
  }

  const cfg = loadConfig();
  const managers = [];
  for (const agentId of agents) {
    const manager = await MemoryIndexManager.get({ cfg, agentId });
    // The watcher re-arms its debounce timer on every event, so this is a quiet period.
    manager.settings.sync.watchDebounceMs = Math.max(manager.settings.sync.watchDebounceMs ?? 0, quietMs);
    managers.push(manager);
    log({ event: "watching", agent: agentId, workspace: manager.workspaceDir, shortWrites });
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
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
