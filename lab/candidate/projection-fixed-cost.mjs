// Candidate A/B for transcript-projection-fixed-cost on copies of V's own large sessions.
//
// Input: SOURCE_DB, a private SQLite file exported read-only from V's makaron agent database in
// one read transaction: every row of the sessions under test (transcript, identity, projection,
// window, node, watermark), plus every other session's window, index state and active rows, its
// newest transcript row with a placeholder body, and its FTS rows as lengths only
// (candidate_background_fts). The baseline turns those lengths into same-length filler FTS rows,
// so the whole-table scans of the reconcile (orphans, dirty sessions) read as much as on V while
// no other session's text leaves V. It never leaves VLab and is deleted after.
//
// Variants (all from the same cached runtime):
//   A  = V's bytes since #411 (lab/release-files/transcript-projection-incremental)
//   B  = A + this release (lab/transcript-projection-fixed-cost-plan.json)
//   TA, TB = A, B with candidate-only timing marks (projection-fixed-cost-instrument.mjs)
// Run alternately on fresh copies of one baseline through projection-fixed-cost-direct.mjs.
// The report compares windows and checks that every stored projection equals a full rebuild and
// that what the model sees after the same writes is identical across all runs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const scratch = process.env.VLAB_CANDIDATE_DATA ?? process.env.OPENCLAW_STATE_DIR;
assert(runtime && scratch, "candidate runtime environment is required");
const SOURCE_DB = process.env.SOURCE_DB;
assert(SOURCE_DB && fs.existsSync(SOURCE_DB), `SOURCE_DB ${SOURCE_DB} is missing`);
const SESSIONS = JSON.parse(process.env.SESSIONS);
const ROUNDS = Number(process.env.ROUNDS ?? 2);
const SCENARIOS = process.env.SCENARIOS ?? "side,rewind,branch,crossCheckpoint,sideBurst";
const VARIANTS = (process.env.VARIANTS ?? "A,B,TA,TB").split(",");
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const vPlan = JSON.parse(fs.readFileSync("lab/transcript-projection-incremental-plan.json", "utf8"));
const releasePlan = VARIANTS.some((v) => v.endsWith("B")) ? JSON.parse(fs.readFileSync("lab/transcript-projection-fixed-cost-plan.json", "utf8")) : { files: [] };
const { instrumentReconcile, instrumentWorker } = await import(path.resolve("lab/candidate/projection-fixed-cost-instrument.mjs"));

// ---- runtimes that differ only in the reconcile chunks ----
const dist = path.join(runtime, "openclaw", "dist");
const runtimes = {};
const runtimeHashes = {};
for (const variant of VARIANTS) {
  const root = path.join(scratch, `runtime-${variant}`, "openclaw");
  fs.mkdirSync(root, { recursive: true });
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", dist, path.join(root, "dist")]).status, 0, `copy runtime ${variant}`);
  fs.symlinkSync(path.join(runtime, "openclaw", "node_modules"), path.join(root, "node_modules"));
  fs.copyFileSync(path.join(runtime, "openclaw", "package.json"), path.join(root, "package.json"));
  // V's bytes first (the cached runtime may predate #411), then this release on top for B
  const overlay = [...vPlan.files.map((f) => ({ ...f, want: f.after })), ...(variant.endsWith("B") ? releasePlan.files.map((f) => ({ ...f, want: f.after })) : [])];
  for (const file of overlay) {
    const target = path.join(root, "dist", file.target.replace(/^openclaw\/dist\//u, ""));
    assert.equal(sha(file.source), file.want, `${variant} source ${file.source}`);
    if (variant === VARIANTS[0]) runtimeHashes[file.target] ??= fs.existsSync(target) ? sha(target) : null;
    fs.copyFileSync(file.source, target);
  }
  if (variant.startsWith("T")) {
    const r = path.join(root, "dist", "session-transcript-reconcile-j5qhAafV.js");
    const w = path.join(root, "dist", "config", "sessions", "session-transcript-reconcile.worker.js");
    fs.writeFileSync(r, instrumentReconcile(fs.readFileSync(r, "utf8")));
    fs.writeFileSync(w, instrumentWorker(fs.readFileSync(w, "utf8")));
  }
  runtimes[variant] = path.join(root, "dist");
}
console.error(`cached runtime hashes before overlay: ${JSON.stringify(runtimeHashes)}`);

// OpenClaw checks its state database path against the candidate configuration, so every run uses
// the candidate's own state directory with a fresh copy of SOURCE_DB as the makaron database.
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(stateDir, "candidate state directory is required");
const dbDir = path.join(stateDir, "agents", "makaron", "agent");
const dbPath = path.join(dbDir, "openclaw-agent.sqlite");
function clearDatabase() {
  if (!fs.existsSync(dbDir)) return;
  for (const name of fs.readdirSync(dbDir)) if (name.startsWith("openclaw-agent.sqlite")) fs.rmSync(path.join(dbDir, name), { force: true });
}
function runDirect(variant, round) {
  fs.mkdirSync(dbDir, { recursive: true });
  clearDatabase();
  assert.equal(spawnSync("cp", ["--reflink=auto", baselineDb, dbPath]).status, 0, "copy baseline database");
  const outDir = path.join(scratch, `out-${variant}-${round}`);
  fs.mkdirSync(outDir, { recursive: true });
  const out = {};
  try {
    for (const s of SESSIONS) {
      const outPath = path.join(outDir, `${s.sessionId}.json`);
      const r = spawnSync(process.execPath, ["--max-old-space-size=8192", "lab/candidate/projection-fixed-cost-direct.mjs", runtimes[variant], s.sessionId, s.sessionKey, outPath, SCENARIOS], {
        env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 900_000 });
      if (r.status !== 0) { out[s.sessionId] = { error: `${r.status} ${r.signal ?? ""} ${r.stderr.split("\n").filter((l) => /Error|error|assert/u.test(l)).slice(0, 6).join(" | ").slice(0, 1500)} … ${r.stderr.slice(-4000)}` }; continue; }
      out[s.sessionId] = JSON.parse(fs.readFileSync(outPath, "utf8"));
    }
  } finally {
    clearDatabase();
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  return out;
}

// ---- baseline: the exported rows carry no FTS rows (a virtual table); publish a complete
// projection once with the A runtime, then every run starts from that same file ----
const baselineDb = path.join(scratch, "baseline.sqlite");
{
  fs.mkdirSync(dbDir, { recursive: true });
  clearDatabase();
  assert.equal(spawnSync("cp", ["--reflink=auto", SOURCE_DB, dbPath]).status, 0, "copy source database");
  {
    // background sessions' FTS rows: same rowids and byte lengths, filler text
    const sqlite = await import("node:sqlite");
    const db = new sqlite.DatabaseSync(dbPath);
    const t = Date.now();
    db.exec("BEGIN");
    db.exec("INSERT INTO session_transcript_fts (rowid, text, session_id, message_id, role, timestamp) SELECT id, CASE WHEN text_bytes > 0 THEN printf('%.*c', text_bytes, 'x') ELSE '' END, session_id, message_id, role, timestamp FROM candidate_background_fts ORDER BY id");
    db.exec("DROP TABLE candidate_background_fts");
    // keep the background referentially whole for the db91 integrity gate: placeholder rows for
    // the transcript rows its active rows point at, and for the nodes/conversations its windows
    // point at (none of them is read by the reconcile)
    db.exec(`INSERT INTO transcript_events (session_id, seq, event_json, created_at)
      SELECT a.session_id, a.event_seq, '{"type":"custom","customType":"candidate.background"}', 0 FROM session_transcript_active_events a
      WHERE NOT EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = a.session_id AND t.seq = a.event_seq)`);
    db.exec(`INSERT INTO session_nodes (session_key, current_session_id, entry_json, entry_valid, updated_at)
      SELECT w.session_key, max(w.session_id), '{}', 0, 0 FROM session_windows w
      WHERE NOT EXISTS (SELECT 1 FROM session_nodes n WHERE n.session_key = w.session_key) GROUP BY w.session_key`);
    db.exec(`UPDATE session_windows SET primary_conversation_id = NULL
      WHERE primary_conversation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM conversations c WHERE c.conversation_id = session_windows.primary_conversation_id)`);
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    assert.equal(violations.length, 0, `background foreign keys: ${JSON.stringify(violations.slice(0, 3))}`);
    db.exec("COMMIT");
    console.error(`background FTS rows: ${db.prepare("SELECT count(*) AS n FROM session_transcript_fts").get().n} in ${Date.now() - t} ms`);
    db.close();
  }
  for (const s of SESSIONS) {
    const r = spawnSync(process.execPath, ["--max-old-space-size=8192", "lab/candidate/projection-fixed-cost-direct.mjs", runtimes[VARIANTS[0]], s.sessionId, s.sessionKey, path.join(scratch, "baseline.json"), "baseline"], { env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 900_000 });
    assert.equal(r.status, 0, `baseline ${s.sessionId}: ${r.stderr.slice(-1500)}`);
  }
  const sqlite = await import("node:sqlite");
  const db = new sqlite.DatabaseSync(dbPath);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  fs.copyFileSync(dbPath, baselineDb);
  clearDatabase();
}

// ---- the one-session listing predicate against V's real listing, on V's whole session set ----
const predicate = await (async () => {
  const { LISTED_ONE_SQL } = await import(path.resolve("lab/patch-transcript-projection-fixed-cost.mjs"));
  const index = await import(path.join(runtimes[VARIANTS[0]], "session-transcript-index-9itOio9h.js"));
  const sqlite = await import("node:sqlite");
  const file = path.join(scratch, "predicate.sqlite");
  fs.copyFileSync(baselineDb, file);
  const db = new sqlite.DatabaseSync(file);
  try {
    // every shape the listing distinguishes, on a spread of real sessions
    const ids = db.prepare("SELECT session_id FROM session_transcript_index_state ORDER BY session_id").all().map((r) => r.session_id);
    const pick = (n) => ids[(n * 997) % ids.length];
    db.exec("PRAGMA foreign_keys = OFF");
    for (let n = 0; n < 40; n++) db.prepare("UPDATE session_transcript_index_state SET needs_rebuild = ? WHERE session_id = ?").run(1 + (n % 2), pick(n));
    for (let n = 40; n < 60; n++) db.prepare("UPDATE session_transcript_index_state SET indexed_seq = indexed_seq - 1 WHERE session_id = ?").run(pick(n));
    for (let n = 60; n < 70; n++) db.prepare("UPDATE session_transcript_index_state SET indexed_seq = indexed_seq + 5 WHERE session_id = ?").run(pick(n));
    for (let n = 70; n < 80; n++) db.prepare("UPDATE session_transcript_active_events SET context_eligible = NULL WHERE session_id = ? AND active_position = 0").run(pick(n));
    for (let n = 80; n < 90; n++) db.prepare("DELETE FROM session_transcript_index_state WHERE session_id = ?").run(pick(n));
    const listed = new Set(index.o(db));
    const one = db.prepare(LISTED_ONE_SQL);
    const windows = db.prepare("SELECT session_id FROM session_windows").all().map((r) => r.session_id);
    const mismatches = [...windows, "no-such-session"].filter((id) => (one.get(id) !== undefined) !== listed.has(id));
    return { sessions: windows.length, listed: listed.size, mismatches };
  } finally { db.close(); fs.rmSync(file, { force: true }); }
})();
console.error(`listing predicate: ${JSON.stringify(predicate)}`);
assert.equal(predicate.mismatches.length, 0, "one-session predicate differs from the native listing");
assert(predicate.listed >= 70, "the predicate check exercised too few dirty sessions");

const runs = [];
for (let round = 0; round < ROUNDS; round++) for (const variant of VARIANTS) {
  const t0 = Date.now();
  runs.push({ variant, round, results: runDirect(variant, round), secs: Math.round((Date.now() - t0) / 1000) });
  console.error(`run ${variant}${round} done in ${runs.at(-1).secs}s`);
}

// ---- report ----
const firstDiff = (a, b, at = "") => {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[key], b[key], `${at}.${key}`); if (d) return d; }
  }
  return { at, a: JSON.stringify(a)?.slice(0, 300), b: JSON.stringify(b)?.slice(0, 300) };
};
const report = { sessions: {}, viewDiffs: {} };
for (const s of SESSIONS) {
  const per = {};
  for (const run of runs) {
    const r = run.results[s.sessionId];
    const key = `${run.variant}${run.round}`;
    if (r.error) { per[key] = { error: r.error }; continue; }
    per[key] = { patched: r.patched, instrumented: r.instrumented, rows: r.rows, initial: r.initial, ...Object.fromEntries(Object.entries(r.scenarios)) };
  }
  report.sessions[s.sessionId.slice(0, 8)] = per;
  const views = runs.filter((run) => !run.results[s.sessionId].error).map((run) => ({ key: `${run.variant}${run.round}`, view: run.results[s.sessionId].view }));
  const base = views.find((v) => v.key === `${VARIANTS[0]}0`);
  report.viewDiffs[s.sessionId.slice(0, 8)] = Object.fromEntries(views.filter((v) => v !== base).map((v) => [v.key, base ? firstDiff(base.view, v.view) : "no base run"]));
  report.viewSizes ??= {};
  report.viewSizes[s.sessionId.slice(0, 8)] = base && { contextMessages: base.view.modelContext.messages.length, contextEntries: base.view.modelContext.entries, tailEvents: base.view.tail.events.length, stats: base.view.stats };
}
// compact summary: windowMs / rebuildMs / blockMaxMs per session, scenario and variant
report.summary = {};
for (const s of SESSIONS) {
  const short = s.sessionId.slice(0, 8);
  for (const scenario of SCENARIOS.split(",")) for (const variant of VARIANTS) {
    const xs = runs.filter((run) => run.variant === variant).map((run) => run.results[s.sessionId]?.scenarios?.[scenario]).filter((x) => x && !x.skipped);
    if (xs.length === 0) continue;
    ((report.summary[short] ??= {})[scenario] ??= {})[variant] = { windowMs: xs.map((x) => x.windowMs), rebuildMs: xs.map((x) => x.rebuildMs), blockMaxMs: Math.max(...xs.map((x) => x.blockMaxMs)), ...(scenario === "sideBurst" ? { firstWindowMs: xs.map((x) => x.firstWindowMs) } : {}) };
  }
}
report.predicate = predicate;
console.log(JSON.stringify(report, null, 1));

for (const s of SESSIONS) {
  const short = s.sessionId.slice(0, 8);
  for (const [key, r] of Object.entries(report.sessions[short])) {
    assert(!r.error, `${short} ${key}: ${r.error}`);
    assert.equal(r.patched, /^T?B/u.test(key), `${short} ${key} ran the wrong runtime`);
    assert.equal(r.instrumented, key.startsWith("T"), `${short} ${key} instrumentation mismatch`);
    for (const scenario of SCENARIOS.split(",")) {
      const x = r[scenario];
      if (!x || x.skipped) continue;
      assert(x.sameAsRebuild, `${short} ${key} ${scenario}: projection differs from a full rebuild`);
      assert(r.initial.sameAsRebuild, `${short} ${key}: baseline projection is not a full rebuild`);
      if (x.dirty !== 0 && x.dirty !== null) assert.equal(x.dirty, 2, `${short} ${key} ${scenario}: an append marked a plain rebuild`);
      assert(x.wait.ok, `${short} ${key} ${scenario}: projection never became readable`);
    }
  }
  for (const [key, diff] of Object.entries(report.viewDiffs[short])) assert.equal(diff, null, `${short} ${key}: model view differs from A0 at ${diff?.at}`);
}
