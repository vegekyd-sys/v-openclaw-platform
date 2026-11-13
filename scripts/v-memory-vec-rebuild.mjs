// Rebuild an agent database's sqlite-vec memory table without its empty slots.
//
// sqlite-vec (vec0, chunk_size=64) never reuses the slot of a deleted vector, and every
// KNN query scans every slot. On V (2026-10-20) memory_index_chunks_vec had 65,792 slots
// for 42,309 vectors: a third of each scan was empty space. This copies the live vectors,
// bit for bit, into a fresh vec0 table with the same definition and swaps it in. No
// embeddings are recomputed.
//
//   node v-memory-vec-rebuild.mjs --db <agent.sqlite> --extension <vec0.so>           report (+ KNN scan ms)
//   node v-memory-vec-rebuild.mjs --db … --extension … --backup <file> --apply         rebuild
//   node v-memory-vec-rebuild.mjs --db … --extension … --backup <file> --restore       roll back
//   node v-memory-vec-rebuild.mjs --db … --extension … --prune-cache                    drop cache rows no chunk uses
//
// Run it only while nothing else opens the database (Gateway, workers, v-memory-indexer
// stopped): the rebuild is one write transaction. --apply first copies the table's four
// shadow tables into --backup (a separate SQLite file); --restore puts them back.
// memory_index_chunks.embedding holds every vector as JSON as well.
// Before and after, 20 stored vectors are used as KNN queries; the top 10 ids and
// distances must be identical before COMMIT, or the transaction rolls back.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const TABLE = "memory_index_chunks_vec";
const SHADOWS = ["info", "chunks", "rowids", "vector_chunks00"].map((s) => `${TABLE}_${s}`);

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument ${a}`);
    const key = a.slice(2);
    if (["apply", "restore", "prune-cache"].includes(key)) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

export function open(dbPath, extension) {
  const db = new DatabaseSync(dbPath, { allowExtension: true });
  db.loadExtension(extension);
  db.exec("PRAGMA busy_timeout = 0");
  return db;
}

export function stats(db) {
  const row = db.prepare(`SELECT count(*) AS chunks, coalesce(sum(size), 0) AS slots FROM ${TABLE}_chunks`).get();
  const vectors = db.prepare(`SELECT count(*) AS n FROM ${TABLE}_rowids`).get().n;
  const definition = db.prepare("SELECT sql FROM sqlite_schema WHERE name = ?").get(TABLE)?.sql;
  return { blocks: row.chunks, slots: row.slots, vectors, live: row.slots ? +(vectors / row.slots).toFixed(3) : 1, definition };
}

// Top-10 neighbours of 20 stored vectors, chosen by id so the same probes run before and after.
export function knnProbe(db, probes) {
  const ids = probes ?? db.prepare(`SELECT id FROM ${TABLE}_rowids ORDER BY id LIMIT 20 OFFSET (SELECT count(*) / 3 FROM ${TABLE}_rowids)`).all().map((r) => r.id);
  const vector = db.prepare(`SELECT embedding FROM ${TABLE} WHERE id = ?`);
  const knn = db.prepare(`SELECT id, distance FROM ${TABLE} WHERE embedding MATCH ? AND k = 10 ORDER BY distance`);
  return { ids, results: ids.map((id) => JSON.stringify(knn.all(vector.get(id).embedding).map((r) => [r.id, r.distance]))) };
}

// Median time of 5 KNN queries (top 10) with stored vectors: the scan memory_search pays.
export function scanMs(db, n = 5) {
  const ids = db.prepare(`SELECT id FROM ${TABLE}_rowids ORDER BY random() LIMIT ?`).all(n).map((r) => r.id);
  const vector = db.prepare(`SELECT embedding FROM ${TABLE} WHERE id = ?`);
  const knn = db.prepare(`SELECT id FROM ${TABLE} WHERE embedding MATCH ? AND k = 10`);
  const times = ids.map((id) => { const v = vector.get(id).embedding; const s = performance.now(); knn.all(v); return performance.now() - s; });
  return Math.round(times.sort((x, y) => x - y)[times.length >> 1]);
}

export function backup(db, file) {
  if (fs.existsSync(file)) throw new Error(`${file} exists; refusing to overwrite a backup`);
  db.prepare("ATTACH DATABASE ? AS bak").run(file);
  try {
    // vector_chunks00 declares a column named rowid, which hides the real rowid that
    // sqlite-vec opens the vector blob by; keep the real one too.
    for (const t of SHADOWS) db.exec(`CREATE TABLE bak."${t}" AS SELECT _rowid_ AS real_rowid_, * FROM main."${t}"`);
    db.prepare("CREATE TABLE bak.vec_definition AS SELECT sql FROM main.sqlite_schema WHERE name = ?").run(TABLE);
  } finally {
    db.exec("DETACH DATABASE bak");
  }
}

// One IMMEDIATE transaction: live vectors into a plain staging table (rowid order), the
// vec0 table dropped and created again from its own definition, vectors copied back,
// staging dropped. vec0 is not renamed: sqlite-vec renames the virtual table but not its
// shadow tables (rehearsal 2026-10-21). Counts and the KNN probes are checked before
// COMMIT; any difference rolls the transaction back and the database is unchanged.
export function rebuild(db, probe) {
  const definition = db.prepare("SELECT sql FROM sqlite_schema WHERE name = ?").get(TABLE).sql;
  const staging = `${TABLE}_rebuild_staging`;
  const t = {};
  let s = performance.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const vectors = db.prepare(`SELECT count(*) AS n FROM ${TABLE}_rowids`).get().n;
    db.exec(`CREATE TABLE ${staging} (seq INTEGER PRIMARY KEY, id TEXT NOT NULL, embedding BLOB NOT NULL)`);
    db.exec(`INSERT INTO ${staging}(id, embedding) SELECT r.id, v.embedding FROM ${TABLE}_rowids r JOIN ${TABLE} v ON v.id = r.id ORDER BY r.rowid`);
    t.stageMs = Math.round(performance.now() - s);
    s = performance.now();
    db.exec(`DROP TABLE ${TABLE}`);
    db.exec(definition);
    db.exec(`INSERT INTO ${TABLE}(id, embedding) SELECT id, embedding FROM ${staging} ORDER BY seq`);
    db.exec(`DROP TABLE ${staging}`);
    t.reloadMs = Math.round(performance.now() - s);
    s = performance.now();
    const after = stats(db);
    const check = probe ? knnProbe(db, probe.ids) : null;
    t.checkMs = Math.round(performance.now() - s);
    if (after.vectors !== vectors) throw new Error(`vector count ${after.vectors} != ${vectors}`);
    if (check && !check.results.every((r, i) => r === probe.results[i])) throw new Error("KNN answers differ after the rebuild");
    s = performance.now();
    db.exec("COMMIT");
    t.commitMs = Math.round(performance.now() - s);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return t;
}

// memory_embedding_cache rows whose hash no current chunk of the same model has. The
// cache only saves embedding calls when old content comes back; it is capped at 50,000
// rows (oldest updated_at evicted), so unused rows crowd out used ones. Freed pages go
// to the freelist; a VACUUM (doctor compact) afterwards returns them to the disk.
export function pruneCache(db) {
  const before = db.prepare("SELECT count(*) AS n FROM memory_embedding_cache").get().n;
  const freeBefore = db.prepare("PRAGMA freelist_count").get().freelist_count;
  let s = performance.now();
  // The hashes in use, indexed: a correlated NOT EXISTS against memory_index_chunks has no
  // index on hash and took 17 min for 15k rows in the rehearsal.
  db.exec("CREATE TEMP TABLE keep_hash (hash TEXT NOT NULL, model TEXT NOT NULL, PRIMARY KEY (hash, model)) WITHOUT ROWID");
  db.exec("INSERT OR IGNORE INTO temp.keep_hash SELECT hash, model FROM memory_index_chunks");
  const keepMs = Math.round(performance.now() - s);
  s = performance.now();
  db.exec("BEGIN IMMEDIATE");
  let deleted;
  try {
    deleted = db.prepare("DELETE FROM memory_embedding_cache AS c WHERE NOT EXISTS (SELECT 1 FROM temp.keep_hash k WHERE k.hash = c.hash AND k.model = c.model)").run().changes;
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const pageSize = db.prepare("PRAGMA page_size").get().page_size;
  const freed = db.prepare("PRAGMA freelist_count").get().freelist_count - freeBefore;
  db.exec("DROP TABLE temp.keep_hash");
  return { cacheRows: before, deleted, keepMs, deleteMs: Math.round(performance.now() - s), freedMB: Math.round((freed * pageSize) / 1048576) };
}

export function restore(db, file) {
  db.prepare("ATTACH DATABASE ? AS bak").run(file);
  try {
    const definition = db.prepare("SELECT sql FROM bak.vec_definition").get().sql;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = ?").get(TABLE)) db.exec(`DROP TABLE ${TABLE}`);
      db.exec(definition);
      for (const t of SHADOWS) {
        const columns = db.prepare(`SELECT name FROM pragma_table_info(?) ORDER BY cid`).all(t).map((c) => `"${c.name}"`).join(", ");
        db.exec(`DELETE FROM main."${t}"`);
        db.exec(`INSERT INTO main."${t}"(_rowid_, ${columns}) SELECT real_rowid_, ${columns} FROM bak."${t}" ORDER BY real_rowid_`);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.exec("DETACH DATABASE bak");
  }
}

async function main() {
  const a = args(process.argv.slice(2));
  if (!a.db || !a.extension) throw new Error("--db and --extension are required");
  const db = open(a.db, a.extension);
  const report = { before: stats(db) };
  if (!a.apply && !a.restore && !a["prune-cache"]) report.scanMs = scanMs(db);
  if (a["prune-cache"]) {
    report.pruneCache = pruneCache(db);
  } else if (a.restore) {
    if (!a.backup) throw new Error("--restore needs --backup");
    const s = performance.now();
    restore(db, a.backup);
    report.restoreMs = Math.round(performance.now() - s);
    report.after = stats(db);
  } else if (a.apply) {
    if (!a.backup) throw new Error("--apply needs --backup");
    const probe = knnProbe(db);
    let s = performance.now();
    backup(db, a.backup);
    report.backupMs = Math.round(performance.now() - s);
    report.backupBytes = fs.statSync(a.backup).size;
    s = performance.now();
    try {
      report.rebuild = rebuild(db, probe);
      report.knnIdentical = true;
    } catch (error) {
      report.rolledBack = String(error?.message ?? error);
    }
    report.rebuildMs = Math.round(performance.now() - s);
    report.after = stats(db);
    s = performance.now();
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    report.checkpointMs = Math.round(performance.now() - s);
  }
  db.close();
  console.log(JSON.stringify(report, null, 2));
  if (report.rolledBack) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
