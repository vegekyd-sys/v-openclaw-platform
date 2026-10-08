// v-memory-indexer's write lock holds and index results, upstream writes vs short writes.
//
// V 2026-10-08: the indexer re-wrote memory/2026-10-08.md (200-320 chunks) after every
// append, in one IMMEDIATE transaction per file, and held the makaron agent database
// write lock for up to 10.1 s; a Feishu reply waiting on that lock failed at 5 s.
//
// Runs against a private copy of an agent database and workspace (never shared state),
// in one process, because opening a 7 GB copy runs a 7-minute integrity pass:
//   OPENCLAW_DIST=<dist> OPENCLAW_CONFIG_PATH=<private config> OPENCLAW_STATE_DIR=<private state> \
//   BENCH_FILE=memory/log.md BENCH_ROUNDS=6 EQ_FILE=memory/2026-08-20.md \
//   EQ_QUESTIONS=<questions.json> BENCH_MODES=upstream,short:50 BENCH_OUT=<json> \
//   node memory-indexer-lock-hold.bench.mjs
//
// Files are indexed through the manager's own indexFiles, the path a sync takes for each
// changed file (embeddings from the cache, new chunks from the configured provider).
//
// 1. Equivalence. EQ_FILE goes v0 -> v1 -> v2 with upstream writes (L1, L2), then
//    v2 -> v1 -> v2 with short writes (S1, S2). v1 appends entries; v2 rewrites a line
//    near the top in place, drops the last entries and appends others, so it keeps chunk
//    ids, adds and drops some. Write
//    timestamps and file mtimes are fixed, so the states must match row for row: every
//    memory index table is hashed after each step (FTS rows without their rowid, vector
//    rows with their blob) and compared, L1/S1 except the embedding cache, which at S1
//    also holds v2's chunks. The index revision must advance by the same amount. Then each
//    question (V's memory bench) is searched with maxResults 5 in state L2 and in state
//    S2 at the same frozen time (temporal decay reads the clock), the query embedding
//    memoized so both use the same vector, and the lists compared.
// 2. Lock holds. BENCH_ROUNDS rounds; in each, for every mode in BENCH_MODES ("upstream",
//    "short:<budget ms>"), append one entry to BENCH_FILE (as the daily memory file grows
//    on V) and index it. Even rounds first drop the database from the page cache (cold),
//    odd rounds do not (warm). Recorded per write: every write transaction in this process, BEGIN
//    IMMEDIATE to COMMIT end, and the waits of a Gateway-style writer in a second process
//    that takes the write lock every 50 ms (busy timeout 30 s).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync, StatementSync } from "node:sqlite";

const dist = process.env.OPENCLAW_DIST;
const state = process.env.OPENCLAW_STATE_DIR;
if (!dist || !state || !process.env.OPENCLAW_CONFIG_PATH) throw new Error("OPENCLAW_DIST, OPENCLAW_STATE_DIR and OPENCLAW_CONFIG_PATH are required");
const benchFile = process.env.BENCH_FILE ?? "memory/log.md";
const rounds = Number(process.env.BENCH_ROUNDS ?? 6);
const eqFile = process.env.EQ_FILE ?? "memory/2026-08-20.md";
const questions = process.env.EQ_QUESTIONS ? JSON.parse(fs.readFileSync(process.env.EQ_QUESTIONS, "utf8")) : [];
const log = (event) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));

// Write transactions of this process: BEGIN IMMEDIATE to the end of COMMIT. (OpenClaw's
// "slow SQLite transaction hold" log stops before COMMIT.)
const txs = [];
let txStarted = null;
let txStatements = null;
const origExec = DatabaseSync.prototype.exec;
DatabaseSync.prototype.exec = function (sql) {
  const head = String(sql).trimStart().slice(0, 16).toUpperCase();
  if (head.startsWith("BEGIN IMMEDIATE")) {
    const result = origExec.call(this, sql);
    txStarted = performance.now();
    txStatements = new Map();
    return result;
  }
  if (txStarted !== null && (head.startsWith("COMMIT") || head.startsWith("ROLLBACK"))) {
    const commitStarted = performance.now();
    try {
      return origExec.call(this, sql);
    } finally {
      const end = performance.now();
      const tx = { at: Date.now(), holdMs: commitStarted - txStarted, withCommitMs: end - txStarted };
      if (tx.withCommitMs > 150) tx.slowest = [...txStatements].map(([sql, t]) => ({ sql, n: t.n, ms: Math.round(t.ms) })).sort((a, b) => b.ms - a.ms).slice(0, 3);
      txs.push(tx);
      txStarted = null;
    }
  }
  return origExec.call(this, sql);
};

// Time per statement inside write transactions, reported for transactions over 150 ms.
for (const method of ["run", "get", "all"]) {
  const orig = StatementSync.prototype[method];
  StatementSync.prototype[method] = function (...args) {
    if (txStarted === null) return orig.apply(this, args);
    const t = performance.now();
    try {
      return orig.apply(this, args);
    } finally {
      const key = this.sourceSQL.replace(/\s+/g, " ").trim().slice(0, 70);
      const entry = txStatements.get(key) ?? { n: 0, ms: 0 };
      entry.n += 1;
      entry.ms += performance.now() - t;
      txStatements.set(key, entry);
    }
  };
}

const { loadConfig } = await import(path.join(dist, "plugin-sdk/config-runtime.js"));
const { MemoryIndexManager } = await import(path.join(dist, "extensions/memory-core/manager-runtime.js"));
const { configureMemoryCoreDreamingState } = await import(path.join(dist, "extensions/memory-core/api.js"));
const indexer = await import(new URL("../../scripts/v-memory-indexer.mjs", import.meta.url));
await indexer.configurePluginState(dist, configureMemoryCoreDreamingState);
const { buildFileEntry } = await indexer.managerRuntimeImports(dist, ["buildFileEntry"]);

const proto = MemoryIndexManager.prototype;
const upstreamWrite = proto.writeChunks;
const writes = [];
// Lock-hold modes: "upstream", or "short:<budget ms>" (pause WRITE_PAUSE_MS, default 150).
const modes = (process.env.BENCH_MODES ?? "upstream,short:50").split(",");
const pauseMs = Number(process.env.WRITE_PAUSE_MS || 150);
const writers = { upstream: upstreamWrite };
for (const m of new Set(["short:50", ...modes.filter((m) => m.startsWith("short:"))])) {
  const Short = class extends MemoryIndexManager {};
  const budgetMs = Number(m.slice("short:".length));
  assert.equal(await indexer.installShortWrites(dist, Short, { log: (e) => (e.event === "slow-write" ? writes.push({ mode: m, ...e }) : log(e)), slowMs: 0, budgetMs, pauseMs }), true, "short writes did not install");
  writers[m] = Short.prototype.writeChunks;
}
let mode = "upstream";
let fixedNow = null;
proto.writeChunks = async function (...args) {
  const realNow = Date.now;
  if (fixedNow !== null) Date.now = () => fixedNow;
  try {
    return await writers[mode].apply(this, args);
  } finally {
    Date.now = realNow;
  }
};
const queryVectors = new Map();
const upstreamEmbedQuery = proto.embedQueryWithRetry;
proto.embedQueryWithRetry = async function (text, ...rest) {
  if (!queryVectors.has(text)) queryVectors.set(text, await upstreamEmbedQuery.call(this, text, ...rest));
  return queryVectors.get(text);
};

const cfg = loadConfig();
const manager = await MemoryIndexManager.get({ cfg, agentId: process.env.BENCH_AGENT ?? "makaron", purpose: "cli" });
const dbPath = path.resolve(manager.settings.store.databasePath);
if (!dbPath.startsWith(path.resolve(state) + path.sep)) throw new Error(`refusing to write ${dbPath}: not under ${state}`);
manager.settings.sync.onSearch = false;
await manager.ensureProviderInitialized();
const db = manager.db;
// The copy's FTS table was rebuilt with the configured tokenizer (trigram, as on V) when
// the schema was ensured; record that in the index meta as a reindex would, or searches
// see an identity mismatch and return nothing.
const meta = manager.readMeta();
if (meta && meta.ftsTokenizer !== manager.settings.store.fts.tokenizer) manager.writeMeta({ ...meta, ftsTokenizer: manager.settings.store.fts.tokenizer });
const identity = manager.refreshIndexIdentityDirty({ providerKeyKnown: true });
assert.equal(identity.status, "valid", `index identity ${JSON.stringify(identity)}`);
log({ event: "ready", dbPath, chunks: db.prepare("SELECT count(*) AS n FROM memory_index_chunks").get().n, provider: manager.provider?.id });

async function indexFile(rel) {
  const entry = await buildFileEntry(path.join(manager.workspaceDir, rel), manager.workspaceDir, manager.settings.multimodal);
  await manager.indexFiles([{ entry, source: "memory" }]);
}

// 1. Equivalence.
const TABLES = {
  memory_index_chunks: "SELECT id, path, source, start_line, end_line, hash, model, text, embedding, updated_at FROM memory_index_chunks ORDER BY id",
  memory_index_chunk_recall_metadata: "SELECT * FROM memory_index_chunk_recall_metadata ORDER BY chunk_id",
  memory_index_chunk_provenance: "SELECT * FROM memory_index_chunk_provenance ORDER BY chunk_id",
  memory_index_chunks_fts: "SELECT id, path, source, model, start_line, end_line, text FROM memory_index_chunks_fts ORDER BY id, path, start_line, text",
  memory_index_chunks_vec: "SELECT id, embedding FROM memory_index_chunks_vec ORDER BY id",
  memory_embedding_cache: "SELECT * FROM memory_embedding_cache ORDER BY provider, model, provider_key, hash",
  memory_index_sources: "SELECT * FROM memory_index_sources ORDER BY path, source",
  memory_index_paths_fts: "SELECT rowid, path, source FROM memory_index_paths_fts ORDER BY rowid",
  memory_index_meta: "SELECT * FROM memory_index_meta ORDER BY key",
};
const revision = () => db.prepare("SELECT revision FROM memory_index_state WHERE id = 1").get()?.revision;
function snapshot() {
  const tables = {};
  for (const [table, sql] of Object.entries(TABLES)) {
    const hash = crypto.createHash("sha256");
    let rows = 0;
    for (const row of db.prepare(sql).iterate()) {
      rows += 1;
      for (const value of Object.values(row)) hash.update(value instanceof Uint8Array ? Buffer.from(value) : `${typeof value}:${String(value)}`).update("\u0001");
      hash.update("\u0002");
    }
    tables[table] = { rows, sha: hash.digest("hex").slice(0, 16) };
  }
  return tables;
}
const eqTarget = path.join(manager.workspaceDir, eqFile);
const v0 = fs.readFileSync(eqTarget, "utf8");
const v1 = v0 + Array.from({ length: 12 }, (_, i) => `\n## 补充 ${i}\n\n- 等价性测试追加的第 ${i} 条记录，equivalence entry ${i}. ${"内容 ".repeat(30)}\n`).join("");
const v1lines = v1.split("\n");
// v2 rewrites a line near the top in place (same line count, so later chunks keep their
// ids), drops the last appended entries and appends new ones.
const edited = v1lines.findIndex((line, i) => i > 3 && line.trim().length > 20);
const v2 = [...v1lines.slice(0, edited), `- 原地改写的一行，rewritten in place. ${"改写 ".repeat(30)}`, ...v1lines.slice(edited + 1, -20), ...Array.from({ length: 6 }, (_, i) => `\n- v2 新增第 ${i} 条，appended in v2. ${"新增 ".repeat(30)}`)].join("\n");
const t1 = new Date(Date.UTC(2026, 9, 8, 10, 0, 0));
const t2 = new Date(Date.UTC(2026, 9, 8, 11, 0, 0));
async function step(label, content, mtime) {
  fs.writeFileSync(eqTarget, content);
  fs.utimesSync(eqTarget, mtime, mtime);
  const before = revision();
  const ids = new Set(db.prepare("SELECT id FROM memory_index_chunks WHERE path = ?").all(eqFile).map((r) => r.id));
  await indexFile(eqFile);
  const after = new Set(db.prepare("SELECT id FROM memory_index_chunks WHERE path = ?").all(eqFile).map((r) => r.id));
  const result = {
    tables: snapshot(),
    revisionDelta: revision() - before,
    ids: { kept: [...after].filter((id) => ids.has(id)).length, added: [...after].filter((id) => !ids.has(id)).length, removed: [...ids].filter((id) => !after.has(id)).length },
  };
  log({ event: "equivalence-step", label, mode, chunks: after.size, revisionDelta: result.revisionDelta, ids: result.ids });
  return result;
}
// Temporal decay scores against Date.now(), so both passes search at the same instant.
async function searchAll() {
  const results = {};
  const realNow = Date.now;
  Date.now = () => fixedNow;
  try {
    for (const { id, q } of questions) results[id] = (await manager.search(q, { maxResults: 5 })).map((h) => `${h.path}:${h.startLine}-${h.endLine}:${Number(h.score).toFixed(6)}`);
  } finally {
    Date.now = realNow;
  }
  return results;
}
fixedNow = Date.UTC(2026, 9, 8, 12, 0, 0);
mode = "upstream";
const L1 = await step("v1", v1, t1);
const L2 = await step("v2", v2, t2);
const searchL = await searchAll();
mode = "short:50";
const S1 = await step("v1", v1, t1); // v2 -> v1, the inverse change of L2
const S2 = await step("v2", v2, t2);
const searchS = await searchAll();
fixedNow = null;
const differing = (a, b, skip = []) => Object.keys(TABLES).filter((t) => !skip.includes(t) && (a.tables[t].sha !== b.tables[t].sha || a.tables[t].rows !== b.tables[t].rows));
const searchDiffering = Object.keys(searchL).filter((id) => JSON.stringify(searchL[id]) !== JSON.stringify(searchS[id]));
const equivalence = {
  file: eqFile,
  ids: L2.ids,
  tables: { L2: L2.tables, S2: S2.tables },
  tablesDifferingV1: differing(L1, S1, ["memory_embedding_cache"]),
  tablesDifferingV2: differing(L2, S2),
  revisionDelta: { L2: L2.revisionDelta, S2: S2.revisionDelta },
  questions: questions.length,
  hits: Object.values(searchL).reduce((sum, list) => sum + list.length, 0),
  searchDiffering,
};
log({ event: "equivalence", ...equivalence });
mode = "upstream";
await indexFile(eqFile); // leave the file indexed as v2 the upstream way, then restore v0
fs.writeFileSync(eqTarget, v0);
await indexFile(eqFile);

// 2. Lock holds.
function dropPageCache() {
  for (const f of [dbPath, `${dbPath}-wal`]) if (fs.existsSync(f)) spawnSync("python3", ["-c", "import os,sys;fd=os.open(sys.argv[1],os.O_RDONLY);os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)", f]);
}
const probeCode = `const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1]);
db.exec("PRAGMA busy_timeout = 30000");
setInterval(() => {
  const t = performance.now();
  let ok = 1;
  try { db.exec("BEGIN IMMEDIATE"); db.exec("COMMIT"); } catch { ok = 0; try { db.exec("ROLLBACK"); } catch {} }
  process.stdout.write(JSON.stringify({ at: Date.now(), ms: Math.round(performance.now() - t), ok }) + "\\n");
}, 50);`;
const probe = spawn(process.execPath, ["--no-warnings", "-e", probeCode, dbPath], { stdio: ["ignore", "pipe", "inherit"] });
const samples = [];
let buf = "";
probe.stdout.on("data", (d) => {
  buf += d;
  for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) samples.push(JSON.parse(buf.slice(0, i)));
});
await new Promise((r) => setTimeout(r, 1000));
const benchTarget = path.join(manager.workspaceDir, benchFile);
const benchOriginal = fs.readFileSync(benchTarget, "utf8");
const runs = [];
for (let round = 0; round < rounds; round++) {
  const cold = round % 2 === 0;
  for (const m of modes) {
    mode = m;
    fs.appendFileSync(benchTarget, `\n- ${new Date().toISOString()} 第 ${round} 轮 ${m}：今天整理了一条记忆，补充上下文 context for the lock hold benchmark.\n`);
    if (cold) dropPageCache();
    const firstTx = txs.length;
    const from = Date.now();
    const started = performance.now();
    await indexFile(benchFile);
    const ms = performance.now() - started;
    await new Promise((r) => setTimeout(r, 300)); // probe samples that were waiting at the end
    const mine = txs.slice(firstTx);
    const waits = samples.filter((s) => s.at >= from).map((s) => s.ms);
    runs.push({
      round,
      mode: m,
      cold,
      chunks: db.prepare("SELECT count(*) AS n FROM memory_index_chunks WHERE path = ?").get(benchFile).n,
      ms: Math.round(ms),
      transactions: mine.length,
      holdMs: mine.map((t) => Math.round(t.withCommitMs)),
      beforeCommitMs: mine.map((t) => Math.round(t.holdMs)),
      slowTransactions: mine.filter((t) => t.slowest).map((t) => ({ withCommitMs: Math.round(t.withCommitMs), beforeCommitMs: Math.round(t.holdMs), slowest: t.slowest })),
      probeMaxWaitMs: Math.max(0, ...waits),
      probeOver200ms: waits.filter((w) => w > 200).length,
    });
    log({ event: "write", ...runs.at(-1), holdMs: undefined, beforeCommitMs: undefined, slowTransactions: runs.at(-1).slowTransactions.length, maxHoldMs: Math.max(0, ...runs.at(-1).holdMs), maxBeforeCommitMs: Math.max(0, ...runs.at(-1).beforeCommitMs) });
    await new Promise((r) => setTimeout(r, 1500));
  }
}
probe.kill("SIGTERM");
fs.writeFileSync(benchTarget, benchOriginal);
mode = "upstream";
await indexFile(benchFile);
await manager.close();

const stats = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  return { n: sorted.length, p50: at(0.5), p90: at(0.9), max: sorted.at(-1) ?? 0 };
};
const holds = {};
for (const m of modes) {
  for (const cold of [true, false]) {
    const rs = runs.filter((r) => r.mode === m && r.cold === cold);
    holds[`${m}-${cold ? "cold" : "warm"}`] = {
      transactionHoldMs: stats(rs.flatMap((r) => r.holdMs)),
      transactionHoldBeforeCommitMs: stats(rs.flatMap((r) => r.beforeCommitMs)),
      longestPerWriteMs: rs.map((r) => Math.max(0, ...r.holdMs)),
      transactionsPerWrite: rs.map((r) => r.transactions),
      writeMs: rs.map((r) => r.ms),
      probeMaxWaitMs: Math.max(0, ...rs.map((r) => r.probeMaxWaitMs)),
      probeOver200ms: rs.reduce((sum, r) => sum + r.probeOver200ms, 0),
    };
  }
}
const summary = { benchFile, rounds, modes, pauseMs, holds, equivalence };
console.log(JSON.stringify(summary));
if (process.env.BENCH_OUT) fs.writeFileSync(process.env.BENCH_OUT, JSON.stringify({ summary, runs, writes, searchL, searchS }, null, 1));
assert.deepEqual(equivalence.tablesDifferingV1, [], "v1 states differ");
assert.deepEqual(equivalence.tablesDifferingV2, [], "v2 states differ");
assert.equal(equivalence.revisionDelta.L2, equivalence.revisionDelta.S2, "revision advanced differently");
assert(equivalence.ids.kept > 0 && equivalence.ids.added > 0 && equivalence.ids.removed > 0, "v2 must keep, add and remove chunks");
assert(equivalence.hits >= questions.length, `searches returned ${equivalence.hits} hits`);
assert.deepEqual(searchDiffering, [], "search results differ");
process.exit(0);
