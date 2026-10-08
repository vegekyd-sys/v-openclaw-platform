// scripts/v-memory-indexer.mjs short writes against upstream's own writeChunks code.
//
// The upstream methods and helpers are lifted verbatim from the manager-runtime.js that
// V runs (release/captured/<latest release>), put in a module beside stub imports, and run
// against an in-memory SQLite database with the memory index schema (the sqlite-vec table
// is a plain table here). Each case writes the same file versions once with upstream's
// one-transaction write and once with the short writes, and compares every table.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexer = await import(pathToFileURL(path.join(repo, "scripts/v-memory-indexer.mjs")));
const latestRelease = /^## (\S+)$/mu.exec(fs.readFileSync(path.join(repo, "CHANGELOG.md"), "utf8"))[1];
const upstreamFile = path.join(repo, "release/captured", latestRelease, "dist/extensions/memory-core/manager-runtime.js");
const upstream = fs.readFileSync(upstreamFile, "utf8");

const METHODS = ["writeChunks", "clearIndexedFileData", "deleteVectorRowsForSource", "upsertFileRecord", "deleteFileRecord", "assertMemoryFileSnapshot", "markVectorRebuildRequired", "markFailedFullReindexRetry"];
const FUNCTIONS = ["memoryTableExists", "markMemoryVectorRebuildRequired", "upsertMemoryEmbeddingCache", "deleteMemoryFtsRows", "replaceMemoryVectorRow"];
function lift(kind, name) {
  const pattern = kind === "method" ? `^\\t((?:async )?${name}\\([^\\n]*\\{\\n[\\s\\S]*?\\n\\t\\})$` : `^(function ${name}\\([^\\n]*\\{\\n[\\s\\S]*?\\n\\})$`;
  const found = [...upstream.matchAll(new RegExp(pattern, "gmu"))];
  assert.equal(found.length, 1, `${kind} ${name} in ${upstreamFile}`);
  return found[0][1];
}

test("the reproduced upstream methods are the ones V runs", () => {
  const fingerprint = crypto.createHash("sha256").update(METHODS.slice(0, 7).map((name) => lift("method", name)).join("\n")).digest("hex");
  assert.equal(fingerprint, indexer.REPRODUCED_FINGERPRINT, `memory write methods changed in ${latestRelease}: re-verify the short writes, then update REPRODUCED_FINGERPRINT`);
});

// A dist directory holding upstream's code with stub imports.
const dist = fs.mkdtempSync(path.join(os.tmpdir(), "v-memory-indexer-"));
const runtime = path.join(dist, "extensions/memory-core/manager-runtime.js");
fs.mkdirSync(path.dirname(runtime), { recursive: true });
fs.writeFileSync(path.join(dist, "stubs.js"), `import crypto from "node:crypto";
import fs from "node:fs/promises";
export const transactions = [];
export const hashText = (text) => crypto.createHash("sha256").update(text).digest("hex");
export async function buildFileEntry(absPath) { return { hash: hashText(await fs.readFile(absPath, "utf8")) }; }
export async function withMemoryWorkspaceLock(_dir, task) { return await task(); }
export function runSqliteImmediateTransactionSync(db, operation, options) {
  db.exec("BEGIN IMMEDIATE");
  transactions.push(options?.operationLabel ?? null);
  try { const result = operation(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export const vectorToBlob = (embedding) => Buffer.from(new Float32Array(embedding).buffer);
export const MEMORY_INDEX_FTS_TABLE = "memory_index_chunks_fts";
export const MEMORY_INDEX_VECTOR_TABLE = "memory_index_chunks_vec";
export const MEMORY_EMBEDDING_CACHE_TABLE = "memory_embedding_cache";
export const MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE = "memory_index_chunk_recall_metadata";
export const MEMORY_INDEX_CHUNK_PROVENANCE_TABLE = "memory_index_chunk_provenance";
export const MEMORY_INDEX_META_TABLE = "memory_index_meta";
`);
fs.writeFileSync(runtime, `import { buildFileEntry, withMemoryWorkspaceLock, runSqliteImmediateTransactionSync, hashText, vectorToBlob, MEMORY_INDEX_FTS_TABLE, MEMORY_INDEX_VECTOR_TABLE, MEMORY_EMBEDDING_CACHE_TABLE, MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE, MEMORY_INDEX_CHUNK_PROVENANCE_TABLE, MEMORY_INDEX_META_TABLE } from "../../stubs.js";
const VECTOR_REBUILD_META_KEY = "memory_vector_rebuild_v1";
const VECTOR_TABLE$1 = MEMORY_INDEX_VECTOR_TABLE;
const VECTOR_TABLE$2 = MEMORY_INDEX_VECTOR_TABLE;
const FTS_TABLE$2 = MEMORY_INDEX_FTS_TABLE;
const EMBEDDING_CACHE_TABLE = MEMORY_EMBEDDING_CACHE_TABLE;
const log$5 = { warn() {} };
const expectDefined = (value) => value;
const hasMemorySessionTombstone = () => false;
const logMemoryVectorDegradedWrite = (params) => params.warningShown;
${FUNCTIONS.map((name) => lift("function", name)).join("\n")}
export class MemoryIndexManager {
${METHODS.map((name) => "\t" + lift("method", name)).join("\n")}
}
`);
const { MemoryIndexManager } = await import(pathToFileURL(runtime));
const stubs = await import(pathToFileURL(path.join(dist, "stubs.js")));
const upstreamWrite = MemoryIndexManager.prototype.writeChunks;
// One install per transaction budget: 0 commits after every write step, 1000 never splits.
const shortWrites = {};
for (const budgetMs of [0, 1000]) {
  const Short = class extends MemoryIndexManager {};
  assert.equal(await indexer.installShortWrites(dist, Short, { log() {}, budgetMs, pauseMs: 0, slowMs: 0 }), true);
  shortWrites[budgetMs] = Short.prototype.writeChunks;
}
let budgetMs = 0;

const SCHEMA = `
CREATE TABLE memory_index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE memory_index_state (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL) STRICT;
INSERT INTO memory_index_state VALUES (1, 0);
CREATE TABLE memory_index_sources (id INTEGER PRIMARY KEY, path TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'memory', hash TEXT NOT NULL, mtime REAL NOT NULL, size INTEGER NOT NULL, UNIQUE (path, source)) STRICT;
CREATE TABLE memory_index_chunks (id TEXT PRIMARY KEY, path TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'memory', start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, hash TEXT NOT NULL, model TEXT NOT NULL, text TEXT NOT NULL, embedding TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX idx_memory_index_chunks_path_source ON memory_index_chunks(path, source);
CREATE TABLE memory_index_chunk_recall_metadata (chunk_id TEXT PRIMARY KEY, importance INTEGER, triggers TEXT, project_key TEXT, FOREIGN KEY (chunk_id) REFERENCES memory_index_chunks(id) ON DELETE CASCADE) STRICT;
CREATE TABLE memory_index_chunk_provenance (chunk_id TEXT PRIMARY KEY, origin_class TEXT NOT NULL, session_kind TEXT NOT NULL, observed_at INTEGER NOT NULL, supersedes_key TEXT, FOREIGN KEY (chunk_id) REFERENCES memory_index_chunks(id) ON DELETE CASCADE) STRICT;
CREATE TABLE memory_embedding_cache (provider TEXT NOT NULL, model TEXT NOT NULL, provider_key TEXT NOT NULL, hash TEXT NOT NULL, embedding TEXT NOT NULL, dims INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (provider, model, provider_key, hash)) STRICT;
CREATE VIRTUAL TABLE memory_index_chunks_fts USING fts5(text, id UNINDEXED, path UNINDEXED, source UNINDEXED, model UNINDEXED, start_line UNINDEXED, end_line UNINDEXED, tokenize='trigram case_sensitive 0');
CREATE VIRTUAL TABLE memory_index_paths_fts USING fts5(path, source UNINDEXED);
CREATE TABLE memory_index_chunks_vec (id TEXT PRIMARY KEY, embedding BLOB);
CREATE TRIGGER memory_index_sources_revision_after_insert AFTER INSERT ON memory_index_sources BEGIN UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER memory_index_sources_revision_after_update AFTER UPDATE ON memory_index_sources BEGIN UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER memory_index_sources_revision_after_delete AFTER DELETE ON memory_index_sources BEGIN UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER memory_index_chunks_revision_after_insert AFTER INSERT ON memory_index_chunks BEGIN UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER memory_index_chunks_revision_after_update AFTER UPDATE ON memory_index_chunks BEGIN UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER memory_index_chunks_revision_after_delete AFTER DELETE ON memory_index_chunks BEGIN UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER memory_index_paths_fts_after_insert AFTER INSERT ON memory_index_sources BEGIN INSERT INTO memory_index_paths_fts (rowid, path, source) VALUES (NEW.id, NEW.path, NEW.source); END;
CREATE TRIGGER memory_index_paths_fts_after_update AFTER UPDATE OF id, path, source ON memory_index_sources BEGIN DELETE FROM memory_index_paths_fts WHERE rowid = OLD.id; INSERT INTO memory_index_paths_fts (rowid, path, source) VALUES (NEW.id, NEW.path, NEW.source); END;
CREATE TRIGGER memory_index_paths_fts_after_delete AFTER DELETE ON memory_index_sources BEGIN DELETE FROM memory_index_paths_fts WHERE rowid = OLD.id; END;
`;
const DUMP = {
  memory_index_state: "SELECT * FROM memory_index_state",
  memory_index_meta: "SELECT * FROM memory_index_meta ORDER BY key",
  memory_index_sources: "SELECT * FROM memory_index_sources ORDER BY id",
  memory_index_chunks: "SELECT * FROM memory_index_chunks ORDER BY id",
  memory_index_chunk_recall_metadata: "SELECT * FROM memory_index_chunk_recall_metadata ORDER BY chunk_id",
  memory_index_chunk_provenance: "SELECT * FROM memory_index_chunk_provenance ORDER BY chunk_id",
  memory_embedding_cache: "SELECT * FROM memory_embedding_cache ORDER BY hash",
  memory_index_chunks_fts: "SELECT id, path, source, model, start_line, end_line, text FROM memory_index_chunks_fts ORDER BY id, path, start_line",
  fts_match: "SELECT id FROM memory_index_chunks_fts WHERE memory_index_chunks_fts MATCH 'line' ORDER BY id",
  memory_index_paths_fts: "SELECT rowid, path, source FROM memory_index_paths_fts ORDER BY rowid",
  memory_index_chunks_vec: "SELECT id, hex(embedding) AS e FROM memory_index_chunks_vec ORDER BY id",
};
const dump = (db) => Object.fromEntries(Object.entries(DUMP).map(([name, sql]) => [name, db.prepare(sql).all().map((row) => ({ ...row }))]));

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "v-memory-indexer-ws-"));
function makeManager({ foreignKeys, vector = true, cache = true }) {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"};`);
  db.exec(SCHEMA);
  const manager = new MemoryIndexManager();
  Object.assign(manager, {
    db,
    agentId: "test",
    workspaceDir: workspace,
    settings: { multimodal: {} },
    fts: { enabled: true, available: true },
    vector: { enabled: vector, available: vector ? true : null },
    cache: { enabled: cache },
    database: {},
    provider: { model: "test-model" },
  });
  return manager;
}
// A file version as the indexer prepares it: chunks of `lines`, embeddings of `dims`.
function version(name, lines, mtimeMs) {
  const absPath = path.join(workspace, name.replaceAll("/", "_"));
  const text = lines.join("\n");
  fs.writeFileSync(absPath, text);
  const chunks = [];
  for (let start = 0; start < lines.length; start += 3) {
    const body = lines.slice(start, start + 3).join("\n");
    chunks.push({ startLine: start + 1, endLine: Math.min(lines.length, start + 3), hash: stubs.hashText(body), text: body, importance: start % 2 ? 5 : null, triggers: null, projectKey: start % 4 ? null : "p", provenance: { originClass: "owner", sessionKind: "unknown", observedAt: Math.floor(mtimeMs) } });
  }
  const embeddings = chunks.map((chunk) => Array.from({ length: 4 }, (_, i) => parseInt(chunk.hash.slice(i * 2, i * 2 + 2), 16) / 255));
  return { item: { entry: { path: name, absPath, hash: stubs.hashText(text), mtimeMs, size: text.length }, source: "memory", chunks }, embeddings };
}
const generation = { provider: { id: "test", model: "test-model" }, providerKey: "k" };
async function write(manager, how, { item, embeddings }, vectorReady = true) {
  const realNow = Date.now;
  Date.now = () => 1_760_000_000_000;
  try {
    await (how === "short" ? shortWrites[budgetMs] : upstreamWrite).call(manager, item, generation, embeddings, vectorReady);
  } finally {
    Date.now = realNow;
  }
}

const base = Array.from({ length: 40 }, (_, i) => `line ${i} 记忆内容 ${"x".repeat(i % 7)}`);
const v2lines = [...base.slice(0, 4), "inserted line", ...base.slice(4, 20), ...base.slice(26), "appended 1", "appended 2"];
const other = version("memory/other.md", ["other a", "other b", "other c", "other d"], 500);

for (const foreignKeys of [true, false]) {
  for (const budget of [0, 1000]) {
    test(`short writes leave upstream's rows (foreign keys ${foreignKeys ? "on" : "off"}, ${budget ? "one" : "one op per"} transaction)`, async () => {
      budgetMs = budget;
      const states = {};
      for (const how of ["upstream", "short"]) {
        const manager = makeManager({ foreignKeys });
        await write(manager, "upstream", other);
        await write(manager, "upstream", version("memory/day.md", base, 1000));
        // Orphan FTS rows of the path: one with the id a new chunk will use, one with no chunk.
        const v2 = version("memory/day.md", v2lines, 2000);
        const reused = stubs.hashText(`memory:memory/day.md:${v2.item.chunks[3].startLine}:${v2.item.chunks[3].endLine}:${v2.item.chunks[3].hash}:test-model`);
        for (const id of [reused, "no-chunk"]) manager.db.prepare("INSERT INTO memory_index_chunks_fts (text, id, path, source, model, start_line, end_line) VALUES ('orphan line', ?, 'memory/day.md', 'memory', 'm', 1, 1)").run(id);
        stubs.transactions.length = 0;
        await write(manager, how, v2);
        const transactions = stubs.transactions.length;
        await write(manager, how, version("memory/day.md", base, 3000)); // shrink back
        states[how] = { rows: dump(manager.db), transactions };
      }
      assert.deepEqual(states.short.rows, states.upstream.rows);
      assert.equal(states.upstream.transactions, 1);
      assert(states.short.transactions >= (budget ? 1 : 10), `short writes used ${states.short.transactions} transactions`);
    });
  }
}

test("short writes with vectors unavailable mark a rebuild like upstream", async () => {
  budgetMs = 0;
  const states = {};
  for (const how of ["upstream", "short"]) {
    const manager = makeManager({ foreignKeys: true, vector: false, cache: false });
    await write(manager, "upstream", version("memory/day.md", base, 1000), false);
    manager.db.prepare("DELETE FROM memory_index_meta").run();
    await write(manager, how, version("memory/day.md", v2lines, 2000), false);
    states[how] = dump(manager.db);
  }
  assert.deepEqual(states.short, states.upstream);
  assert.equal(states.short.memory_index_meta.length, 1);
});

test("a short write that fails part way drops the file record so the next sync redoes the file", async () => {
  budgetMs = 0;
  const manager = makeManager({ foreignKeys: true });
  await write(manager, "upstream", version("memory/day.md", base, 1000));
  const v2 = version("memory/day.md", v2lines, 2000);
  v2.item.chunks[8].text = null; // NOT NULL constraint fails at the 9th chunk
  await assert.rejects(write(manager, "short", v2));
  assert.equal(manager.db.prepare("SELECT count(*) AS n FROM memory_index_sources WHERE path = 'memory/day.md'").get().n, 0);
  assert(manager.db.prepare("SELECT count(*) AS n FROM memory_index_chunks WHERE path = 'memory/day.md'").get().n > 0, "the failure happened after some transactions committed");
  // The next sync sees no record, so it writes the whole file; upstream's write clears by path.
  const fixed = makeManager({ foreignKeys: true });
  await write(fixed, "upstream", version("memory/day.md", base, 1000));
  await write(fixed, "upstream", version("memory/day.md", v2lines, 2000));
  await write(manager, "short", version("memory/day.md", v2lines, 2000));
  const rows = (m) => ({ ...dump(m.db), memory_index_state: [], memory_index_sources: m.db.prepare("SELECT path, source, hash, mtime, size FROM memory_index_sources").all().map((r) => ({ ...r })), memory_index_paths_fts: [] });
  assert.deepEqual(rows(manager), rows(fixed));
});

test("session sources keep the upstream write", async () => {
  const manager = makeManager({ foreignKeys: true });
  stubs.transactions.length = 0;
  const v = version("sessions/a.jsonl", base, 1000);
  v.item.source = "sessions";
  v.item.entry.sessionId = "s1";
  await shortWrites[0].call(manager, v.item, generation, v.embeddings, true);
  assert.deepEqual(stubs.transactions, [null]);
});

test("the indexer turns the short writes off when upstream changed", async () => {
  const seen = [];
  class Changed extends MemoryIndexManager {}
  Changed.prototype.writeChunks = async function () {};
  assert.equal(await indexer.installShortWrites(dist, Changed, { log: (e) => seen.push(e) }), false);
  assert.equal(seen[0].event, "short-writes-off");
});
