// Candidate A/B for transcript-projection-checkpoint on copies of V's own large sessions.
//
// Input: SOURCE_DB, a private SQLite file with the rows of the sessions under test exported
// read-only from V's makaron agent database (all transcript, identity, projection, window and
// node rows of those sessions; no other sessions). It never leaves VLab and is deleted after.
//
// A = the candidate runtime with V's bytes for the two changed chunks (fixtures),
// B = the same runtime with the release files. Both run in this one candidate, alternating
// A,B,A,B on fresh copies of SOURCE_DB, through projection-checkpoint-direct.mjs (real modules,
// real rows, no model). The report compares per session and scenario: main-thread stall, rewrite
// time, whether the projection went dirty, what a reader sees right after, the rebuild window,
// and whether the stored projection equals a full rebuild. Then it diffs what the model would see
// after the same writes (model context, transcript tail, stats) between A and B field by field.
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
const SCENARIOS = process.env.SCENARIOS ?? "annotation,display,forced";
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const plan = JSON.parse(fs.readFileSync("lab/transcript-projection-checkpoint-plan.json", "utf8"));

// ---- two runtimes that differ only in the two chunks ----
const dist = path.join(runtime, "openclaw", "dist");
const runtimes = {};
for (const variant of ["A", "B"]) {
  const root = path.join(scratch, `runtime-${variant}`, "openclaw");
  fs.mkdirSync(root, { recursive: true });
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", dist, path.join(root, "dist")]).status, 0, `copy runtime ${variant}`);
  fs.symlinkSync(path.join(runtime, "openclaw", "node_modules"), path.join(root, "node_modules"));
  fs.copyFileSync(path.join(runtime, "openclaw", "package.json"), path.join(root, "package.json"));
  for (const file of plan.files) {
    const name = path.basename(file.source);
    const target = path.join(root, "dist", name);
    if (variant === "A") {
      // the cached runtime must hold V's bytes; a shared VLab release that differs here invalidates the comparison
      assert.equal(sha(path.join(dist, name)), file.before, `candidate runtime ${name} is not V's bytes`);
    } else fs.copyFileSync(file.source, target);
    assert.equal(sha(target), variant === "A" ? file.before : file.after, `${variant} ${name}`);
  }
  runtimes[variant] = path.join(root, "dist");
}

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
      const r = spawnSync(process.execPath, ["--max-old-space-size=8192", "lab/candidate/projection-checkpoint-direct.mjs", runtimes[variant], s.sessionId, s.sessionKey, outPath, SCENARIOS], {
        env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 900_000 });
      if (r.status !== 0) { out[s.sessionId] = { error: `${r.status} ${r.signal ?? ""} ${r.stderr.split("\n").filter((l) => /Error|error|assert/u.test(l)).slice(0, 6).join(" | ").slice(0, 1500)} … ${r.stderr.slice(-600)}` }; continue; }
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
  for (const s of SESSIONS) {
    const r = spawnSync(process.execPath, ["--max-old-space-size=8192", "lab/candidate/projection-checkpoint-direct.mjs", runtimes.A, s.sessionId, s.sessionKey, path.join(scratch, "baseline.json"), "baseline"], { env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 900_000 });
    assert.equal(r.status, 0, `baseline ${s.sessionId}: ${r.stderr.slice(-1500)}`);
  }
  const sqlite = await import("node:sqlite");
  const db = new sqlite.DatabaseSync(dbPath);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  fs.copyFileSync(dbPath, baselineDb);
  clearDatabase();
}

const runs = [];
for (let round = 0; round < ROUNDS; round++) for (const variant of ["A", "B"]) {
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
    per[key] = { patched: r.patched, rows: r.rows, initial: r.initial, ...Object.fromEntries(Object.entries(r.scenarios)) };
  }
  report.sessions[s.sessionId.slice(0, 8)] = per;
  const views = runs.filter((run) => !run.results[s.sessionId].error).map((run) => ({ key: `${run.variant}${run.round}`, view: run.results[s.sessionId].view }));
  const base = views.find((v) => v.key === "A0");
  report.viewDiffs[s.sessionId.slice(0, 8)] = Object.fromEntries(views.filter((v) => v !== base).map((v) => [v.key, base ? firstDiff(base.view, v.view) : "no A0"]));
  report.viewSizes ??= {};
  report.viewSizes[s.sessionId.slice(0, 8)] = base && { contextMessages: base.view.modelContext.messages.length, contextEntries: base.view.modelContext.entries, tailEvents: base.view.tail.events.length, stats: base.view.stats };
}
console.log(JSON.stringify(report, null, 1));

for (const s of SESSIONS) {
  const short = s.sessionId.slice(0, 8);
  for (const [key, r] of Object.entries(report.sessions[short])) {
    assert(!r.error, `${short} ${key}: ${r.error}`);
    assert.equal(r.patched, key.startsWith("B"), `${short} ${key} ran the wrong runtime`);
    for (const scenario of SCENARIOS.split(",")) {
      const x = r[scenario];
      if (!x || x.skipped) continue;
      assert(x.sameAsRebuild, `${short} ${key} ${scenario}: projection differs from a full rebuild`);
      assert(r.initial.sameAsRebuild, `${short} ${key}: baseline projection is not a full rebuild`);
      if (key.startsWith("B") && scenario !== "forced") {
        assert.equal(x.dirty, false, `${short} ${key} ${scenario}: B left the projection dirty`);
        assert(x.reader.ok, `${short} ${key} ${scenario}: B reader failed`);
      }
    }
  }
  for (const [key, diff] of Object.entries(report.viewDiffs[short])) assert.equal(diff, null, `${short} ${key}: model view differs from A0 at ${diff?.at}`);
}
