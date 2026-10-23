import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { patchArchiveRetentionCutoff } from "./patch-openclaw91-archive-retention-cutoff.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(here, "..", "lab", "fixtures", "archive-retention-cutoff",
  "session-accessor.sqlite-lifecycle-state-CrB_K2kA.js");
const RELEASE = path.join(here, "..", "lab", "release-files", "archive-retention-cutoff",
  "session-accessor.sqlite-lifecycle-state-CrB_K2kA.js");

test("patch applies once to V's chunk, is idempotent and matches the release file", () => {
  const original = readFileSync(FIXTURE, "utf8");
  const { changed, source } = patchArchiveRetentionCutoff(original);
  assert.equal(changed, true);
  assert.match(source, /const retentionCutoff = now - Math\.min\(\.\.\.rules\.values\(\)\);/);
  assert.match(source, /\.where\("created_at", "<", retentionCutoff\)/);
  assert.equal((source.match(/const now = params\.nowMs \?\? Date\.now\(\);/g) ?? []).length, 1,
    "now is declared once, before the scan");
  assert.match(source, /if \(now < \(archiveRetentionIdleUntil\.get\(resolveSqliteTranscriptArchiveDirectory\(params\.scope\)\) \?\? 0\)\) return 0;/,
    "a recent empty pass skips the scan");
  assert.match(source, /if \(candidates\.length > 0\) archiveRetentionIdleUntil\.set\(archiveDirectory, now \+ ARCHIVE_RETENTION_IDLE_RECHECK_MS\);/,
    "only a pass that read candidates and removed nothing starts the idle window");
  assert.match(source, /archiveRetentionIdleUntil\.delete\(archiveDirectory\);\n\treturn await runExclusiveSqliteSessionWrite/,
    "a pass that removes rows clears the idle window");
  assert.match(source, /const ARCHIVE_RETENTION_IDLE_RECHECK_MS = 36e5;/);
  assert.equal(patchArchiveRetentionCutoff(source).changed, false);
  assert.equal(source, readFileSync(RELEASE, "utf8"));
});

test("a drifted chunk is refused instead of half-patched", () => {
  assert.throws(() => patchArchiveRetentionCutoff("/* v-archive-retention-cutoff-v1 */"), /partial or drifted/);
  assert.throws(() => patchArchiveRetentionCutoff("const unrelated = 1;"), /anchor not found/);
});

const SCHEMA = `CREATE TABLE session_transcript_archives (
  session_id TEXT NOT NULL, generation TEXT NOT NULL, session_key TEXT NOT NULL,
  reason TEXT NOT NULL, encoding TEXT NOT NULL, archive_blob BLOB NOT NULL,
  archive_sha256 TEXT NOT NULL, archive_name TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL,
  published_at INTEGER, PRIMARY KEY (session_id, generation));
CREATE INDEX idx_agent_session_transcript_archives_retention
  ON session_transcript_archives(created_at, session_id, generation);`;

const COLUMNS = "archive_name, created_at, generation, published_at, reason, session_id";
const ORDER = "ORDER BY created_at ASC, session_id ASC, generation ASC LIMIT 256";

// The removable set the function computes from a candidate batch (file existence is a per-row
// predicate applied identically to both batches, so it is modelled as a fixed set).
function removable(rows, rules, now, missingFiles) {
  return rows.filter((row) => {
    const olderThanMs = rules.get(row.reason);
    if (olderThanMs === undefined || now - row.created_at <= olderThanMs) return false;
    return missingFiles.has(row.archive_name);
  }).map((row) => `${row.session_id}/${row.generation}`);
}

test("bounded scan yields the same removable rows as the original scan", () => {
  const day = 86_400_000;
  const now = 1_792_200_000_000;
  let seed = 17;
  const rand = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
  for (let trial = 0; trial < 40; trial += 1) {
    const db = new DatabaseSync(":memory:");
    db.exec(SCHEMA);
    const insert = db.prepare(`INSERT INTO session_transcript_archives
      (session_id, generation, session_key, reason, encoding, archive_blob, archive_sha256, archive_name, created_at, published_at)
      VALUES (?, ?, 'k', ?, 'zstd', ?, ?, ?, ?, ?)`);
    const missing = new Set();
    const count = 50 + Math.floor(rand() * 400);
    for (let i = 0; i < count; i += 1) {
      const created = now - Math.floor(rand() * 30 * day);
      const name = `a${trial}-${i}.jsonl.zst`;
      if (rand() < 0.6) missing.add(name);
      insert.run(`s${i % 37}`, `g${i}`, rand() < 0.5 ? "reset" : "deleted", Buffer.alloc(16), "0".repeat(64),
        name, created, rand() < 0.9 ? created + 1000 : null);
    }
    const rules = new Map([["reset", Math.floor(rand() * 20) * day], ["deleted", Math.floor(rand() * 20) * day]]);
    const cutoff = now - Math.min(...rules.values());
    const before = db.prepare(`SELECT ${COLUMNS} FROM session_transcript_archives WHERE published_at IS NOT NULL ${ORDER}`).all();
    const after = db.prepare(`SELECT ${COLUMNS} FROM session_transcript_archives WHERE published_at IS NOT NULL AND created_at < ? ${ORDER}`).all(cutoff);
    assert.deepEqual(removable(after, rules, now, missing), removable(before, rules, now, missing), `trial ${trial}`);
    db.close();
  }
});

test("bounded scan uses the retention index as a range, so young archives are never read", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT ${COLUMNS} FROM session_transcript_archives
    WHERE published_at IS NOT NULL AND created_at < ? ${ORDER}`).all(0).map((row) => row.detail).join("\n");
  assert.match(plan, /idx_agent_session_transcript_archives_retention \(created_at<\?\)/);
  db.close();
});
