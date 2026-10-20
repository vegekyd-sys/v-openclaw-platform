// Retiring old Night Shift subagent sessions on a copy of V's session tables
// (see lab/gateway-fullread-hotpaths.md, "Retiring old Night Shift sessions").
//
// Same fixture as gateway-fullread-ab.mjs (FIXTURE_DIR/v-sessions.sqlite, read-only export of V).
// Steps, each on the fixture copy under WORK_DIR (root disk):
//   1. whole-store read cost before (full projection, list projection with the cache invalidated)
//   2. `openclaw sessions cleanup --dry-run --json` and `--enforce --json` with V's session.maintenance
//      (mode, pruneAfter 14d, maxEntries 6000, maxDiskBytes 48gb); no Gateway listens, so --enforce runs
//      locally as it would without delegation. A probe process takes a tiny write transaction every
//      50 ms on the same database and records how long each waited (= write-lock hold seen by others).
//   3. batched retirement through the official applySessionEntryLifecycleMutation (archive transcript,
//      delete rows, FTS and index rows) of terminal Night Shift subagent sessions older than RETIRE_DAYS,
//      BATCH keys per call, PAUSE_MS between calls, with the same probe.
//   4. whole-store read cost after.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const NODE = process.execPath;
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/gwstall";
const WORK_DIR = process.env.WORK_DIR ?? path.join(FIXTURE_DIR, `retire-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const RETIRE_DAYS = Number(process.env.RETIRE_DAYS ?? 7);
const BATCH = Number(process.env.BATCH ?? 20);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 200);
const STEPS = new Set((process.env.STEPS ?? "cleanup,retire").split(","));
const out = {};
// Progress also goes to FIXTURE_DIR/<run>.log so a long run can be followed on the host.
const progressLog = path.join(FIXTURE_DIR, `${path.basename(WORK_DIR)}.progress.log`);
const log = (key, value) => {
  out[key] = value;
  const line = `[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`;
  console.error(line);
  fs.appendFileSync(progressLog, `${line}\n`);
};

const stateDir = path.join(WORK_DIR, "state");
const agentDb = path.join(stateDir, "agents", "makaron", "agent", "openclaw-agent.sqlite");
if (process.env.KEEP_WORK !== "1") process.on("exit", () => fs.rmSync(WORK_DIR, { recursive: true, force: true }));
fs.mkdirSync(path.dirname(agentDb), { recursive: true });
const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
config.session = { ...config.session, maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
fs.writeFileSync(path.join(stateDir, "openclaw.json"), JSON.stringify(config, null, 2));
Object.assign(process.env, {
  OPENCLAW_STATE_DIR: stateDir,
  OPENCLAW_CONFIG_PATH: path.join(stateDir, "openclaw.json"),
  OPENCLAW_DB91_INTEGRITY_STATE_ROOT: stateDir,
  OPENCLAW_HOME: WORK_DIR,
  OPENCLAW_GATEWAY_PORT: "1", // nothing listens: CLI cleanup must not reach any Gateway
});

const { g: openOpenClawAgentDatabase, a: closeOpenClawAgentDatabases } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
function buildAgentDatabase() {
  const t = performance.now();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(agentDb + suffix, { force: true });
  openOpenClawAgentDatabase({ agentId: "makaron" });
  closeOpenClawAgentDatabases();
  const db = new DatabaseSync(agentDb);
  db.exec(`PRAGMA foreign_keys = OFF; ATTACH '${path.join(FIXTURE_DIR, "v-sessions.sqlite")}' AS v; BEGIN;`);
  for (const table of ["session_nodes", "session_windows", "session_participants", "session_transcript_index_state", "session_progress_cards", "transcript_events", "transcript_event_identities", "session_transcript_active_events", "trajectory_runtime_events", "transcript_rewrite_watermarks"]) {
    const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
    const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
    const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
    db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
  }
  db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key)");
  // conversations are not exported; the routing link is irrelevant here and would fail the FK gate.
  db.exec("UPDATE main.session_windows SET primary_conversation_id = NULL");
  db.exec("DELETE FROM main.session_transcript_fts; INSERT INTO main.session_transcript_fts (rowid, text, session_id, message_id, role, timestamp) SELECT id, text, session_id, message_id, role, timestamp FROM v.fts_rows");
  db.exec("COMMIT; DETACH v; PRAGMA wal_checkpoint(TRUNCATE);");
  const fk = db.prepare("PRAGMA foreign_key_check").all();
  if (fk.length) throw new Error(`fixture foreign keys: ${JSON.stringify(fk.slice(0, 5))}`);
  db.close();
  return { bytes: fs.statSync(agentDb).size, ms: Math.round(performance.now() - t) };
}

// Write-lock probe: another process, tiny BEGIN IMMEDIATE transactions every 50 ms.
function startProbe(label) {
  const code = `
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(${JSON.stringify(agentDb)});
    db.exec("PRAGMA busy_timeout = 120000; CREATE TABLE IF NOT EXISTS v_lock_probe (id INTEGER PRIMARY KEY, at INTEGER)");
    const waits = [];
    let stop = false;
    process.on("message", () => { stop = true; });
    const tick = () => {
      if (stop) { db.close(); process.send(waits); return; }
      const t = performance.now();
      db.exec("BEGIN IMMEDIATE");
      const waited = performance.now() - t;
      db.prepare("INSERT OR REPLACE INTO v_lock_probe (id, at) VALUES (1, ?)").run(Date.now());
      db.exec("COMMIT");
      waits.push(Math.round(waited));
      setTimeout(tick, 50);
    };
    tick();`;
  const child = spawn(NODE, ["-e", code], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
  return async () => {
    const waits = await new Promise((resolve) => { child.once("message", resolve); child.send("stop"); });
    const sorted = [...waits].sort((a, b) => a - b);
    return { label, probes: waits.length, waitMaxMs: sorted.at(-1) ?? 0, waitP99Ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0, over1s: waits.filter((w) => w >= 1000).length, over5s: waits.filter((w) => w >= 5000).length };
  };
}

const storePath = path.join(stateDir, "agents", "makaron", "sessions", "sessions.json");
const scope = { agentId: "makaron", storePath };
async function readCosts(label) {
  const { t: listSessionEntriesCore } = await import(path.join(DIST, "session-accessor.entry-B8arwR7t.js"));
  const { a: listSessionEntriesReadOnly } = await import(path.join(DIST, "session-accessor.sqlite-entry-BlklNPKQ.js"));
  const db = new DatabaseSync(agentDb);
  const sizes = db.prepare("SELECT count(*) AS rows, sum(length(entry_json)) AS bytes FROM session_nodes").get();
  const time = (fn) => { global.gc?.(); const t = performance.now(); const n = fn(); return { n, ms: Math.round(performance.now() - t) }; };
  const full = [], list = [];
  for (let i = 0; i < 3; i++) {
    full.push(time(() => listSessionEntriesCore(scope).length));
    db.prepare("UPDATE session_nodes SET last_read_at = coalesce(last_read_at, 0) WHERE session_key = (SELECT min(session_key) FROM session_nodes)").run();
    list.push(time(() => listSessionEntriesReadOnly({ ...scope, projection: "list" }).length));
  }
  db.close();
  const med = (xs) => xs.map((x) => x.ms).sort((a, b) => a - b)[1];
  log(`reads.${label}`, { rows: sizes.rows, entryJsonMB: Math.round(sizes.bytes / 1e6), fullProjectionMs: med(full), listProjectionMs: med(list) });
}

function cli(args) {
  const t = performance.now();
  const r = spawnSync(NODE, [path.join(DIST, "index.js"), ...args], { env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 ** 2, timeout: 3 * 3600_000 });
  const ms = Math.round(performance.now() - t);
  let json;
  try { json = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch { json = undefined; }
  return { status: r.status, ms, json, stderr: r.stderr.slice(-1500) };
}

log("fixture", buildAgentDatabase());
await readCosts("before");

if (STEPS.has("cleanup")) {
  const stopDry = startProbe("dry-run");
  const dry = cli(["sessions", "cleanup", "--agent", "makaron", "--dry-run", "--json"]);
  log("cleanup.dryRun", { status: dry.status, ms: dry.ms, summary: dry.json && { beforeCount: dry.json.beforeCount, afterCount: dry.json.afterCount, pruned: dry.json.pruned, capped: dry.json.capped, missing: dry.json.missing, diskBudget: dry.json.diskBudget, wouldMutate: dry.json.wouldMutate }, lock: await stopDry(), stderr: dry.json ? undefined : dry.stderr });
  const snapshot = `${agentDb}.pre-enforce`;
  closeOpenClawAgentDatabases();
  fs.copyFileSync(agentDb, snapshot);
  const stopEnforce = startProbe("enforce");
  const enforce = cli(["sessions", "cleanup", "--agent", "makaron", "--enforce", "--json"]);
  log("cleanup.enforce", { status: enforce.status, ms: enforce.ms, summary: enforce.json && { beforeCount: enforce.json.beforeCount, afterCount: enforce.json.afterCount, pruned: enforce.json.pruned, capped: enforce.json.capped, appliedCount: enforce.json.appliedCount, diskBudget: enforce.json.diskBudget }, lock: await stopEnforce(), stderr: enforce.json ? undefined : enforce.stderr });
  await readCosts("afterOfficialCleanup");
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(agentDb + suffix, { force: true });
  fs.renameSync(snapshot, agentDb);
}

if (STEPS.has("retire")) {
  const { It: applySessionEntryLifecycleMutation } = await import(path.join(DIST, "session-accessor-K0XuW6ln.js"));
  const { a: listSessionEntriesReadOnly } = await import(path.join(DIST, "session-accessor.sqlite-entry-BlklNPKQ.js"));
  const cutoff = Date.now() - RETIRE_DAYS * 86400_000;
  const db = new DatabaseSync(agentDb, { readOnly: true });
  const withTranscript = new Set(db.prepare("SELECT DISTINCT w.session_key FROM session_windows w JOIN transcript_events e USING (session_id)").all().map((r) => r.session_key));
  const ages = db.prepare(`SELECT sum(updated_at < ?) AS d3, sum(updated_at < ?) AS d7, sum(updated_at < ?) AS d14, count(*) AS total FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:workboard-nightshift-%' AND (status IS NULL OR status <> 'running')`).get(Date.now() - 3 * 86400_000, Date.now() - 7 * 86400_000, Date.now() - 14 * 86400_000);
  db.close();
  // Candidates: terminal Night Shift subagent sessions not updated for RETIRE_DAYS, read with the
  // same list projection the Gateway uses; transcripts first so the archive cost shows early.
  const candidates = listSessionEntriesReadOnly({ ...scope, projection: "full" }).filter(({ sessionKey, entry }) => sessionKey.startsWith("agent:makaron:subagent:workboard-nightshift-") && (entry.updatedAt ?? 0) < cutoff && entry.status !== "running").sort((a, b) => Number(withTranscript.has(b.sessionKey)) - Number(withTranscript.has(a.sessionKey)));
  log("retire.plan", { retireDays: RETIRE_DAYS, ageBuckets: ages, candidates: candidates.length, withTranscriptInFixture: candidates.filter((c) => withTranscript.has(c.sessionKey)).length, batch: BATCH, pauseMs: PAUSE_MS });
  let firstError;
  const probeDb = new DatabaseSync(agentDb, { readOnly: true });
  const stillThere = (key) => Boolean(probeDb.prepare("SELECT 1 FROM session_nodes WHERE session_key = ?").get(key));
  const stop = startProbe("retire");
  const batches = [];
  const t0 = performance.now();
  for (let i = 0; i < candidates.length; i += BATCH) {
    const slice = candidates.slice(i, i + BATCH);
    const t = performance.now();
    let result, error;
    try {
      result = await applySessionEntryLifecycleMutation({
        agentId: "makaron",
        storePath,
        removals: slice.map(({ sessionKey, entry }) => ({ sessionKey, expectedEntry: entry, ...entry.sessionId ? { expectedSessionId: entry.sessionId } : {}, expectedUpdatedAt: entry.updatedAt, archiveRemovedTranscript: true })),
      });
    } catch (e) {
      // "Session deletion committed, but N transcript archive file export(s) remain pending": rows are
      // gone, the archive blobs stay in session_transcript_archives for a later publish retry.
      error = String(e?.message ?? e).slice(0, 200);
      if (!firstError) firstError = error;
    }
    batches.push({ keys: slice.length, withTranscript: slice.filter((c) => withTranscript.has(c.sessionKey)).length, removed: result?.removedEntries ?? slice.filter((c) => !stillThere(c.sessionKey)).length, archived: result?.archivedTranscriptArtifacts ?? 0, error: Boolean(error), ms: Math.round(performance.now() - t) });
    if (PAUSE_MS) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  const lock = await stop();
  const byKind = (rows) => ({ batches: rows.length, removed: rows.reduce((s, b) => s + b.removed, 0), msMedian: rows.map((b) => b.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0, msMax: Math.max(0, ...rows.map((b) => b.ms)) });
  const after = new DatabaseSync(agentDb, { readOnly: true });
  log("retire.result", {
    totalMs: Math.round(performance.now() - t0),
    withTranscripts: byKind(batches.filter((b) => b.withTranscript > 0)),
    withoutTranscripts: byKind(batches.filter((b) => b.withTranscript === 0)),
    archives: after.prepare("SELECT count(*) AS n, round(sum(length(archive_blob)) / 1e6, 1) AS mb, sum(published_at IS NULL) AS unpublished FROM session_transcript_archives").get(),
    publishErrors: after.prepare("SELECT last_publish_error AS error, count(*) AS n FROM session_transcript_archives WHERE last_publish_error IS NOT NULL GROUP BY 1 LIMIT 3").all(),
    batchesWithError: batches.filter((b) => b.error).length,
    firstError,
    remainingNightShift: after.prepare("SELECT count(*) AS n FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:workboard-nightshift-%'").get().n,
    ftsRows: after.prepare("SELECT count(*) AS n FROM session_transcript_fts_docsize").get().n,
    lock,
  });
  after.close();
  probeDb.close();
  await readCosts("afterRetire");
}

// scripts/retire-nightshift-sessions.mjs itself, against this copy (V's workboard database included).
if (STEPS.has("script")) {
  const wb = path.join(stateDir, "plugins", "workboard", "workboard.sqlite");
  fs.mkdirSync(path.dirname(wb), { recursive: true });
  fs.copyFileSync(path.join(FIXTURE_DIR, "v-workboard.sqlite"), wb);
  closeOpenClawAgentDatabases();
  const run = (extra) => {
    const t = performance.now();
    const r = spawnSync(NODE, ["scripts/retire-nightshift-sessions.mjs", "--dist", DIST, "--older-than-days", String(RETIRE_DAYS), ...extra], { env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 ** 2 });
    const events = r.stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    return { status: r.status, ms: Math.round(performance.now() - t), events, stderr: r.status ? r.stderr.slice(-1500) : undefined };
  };
  const preview = run([]);
  log("script.preview", { status: preview.status, ms: preview.ms, plan: preview.events.find((e) => e.event === "plan") });
  const stop = startProbe("script");
  const applied = run(["--apply", "--max", String(process.env.SCRIPT_MAX ?? 40), "--batch", String(BATCH), "--pause-ms", String(PAUSE_MS)]);
  const batchMs = applied.events.filter((e) => e.event === "batch").map((e) => e.ms).sort((a, b) => a - b);
  log("script.apply", { status: applied.status, ms: applied.ms, done: applied.events.find((e) => e.event === "done"), batchMsMedian: batchMs[Math.floor(batchMs.length / 2)], batchMsMax: batchMs.at(-1), lock: await stop(), stderr: applied.stderr });
}

console.log(JSON.stringify(out, null, 1));
process.exit(0);
