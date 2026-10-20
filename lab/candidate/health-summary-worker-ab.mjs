// health-summary-worker: equivalence and main-thread cost, V's collector chunk vs the release chunk, side by
// side in one process over a copy of V's session_nodes (lab/health-summary-worker.md).
//
// Data: FIXTURE_DIR/v-sn.sqlite, a read-only export of V's session_nodes and session_participants
// (makaron agent database), kept outside the repository. The candidate dist carries the worker module.
//
// Compared: buildHealthAgentSummaries (makaron + an agent without a database) and buildHealthSessionSummary,
// as JSON with `age` (Date.now() at projection) removed. States: V's rows as exported; then rows pending
// validation (entry_valid 0), cleared rows ('{}', -1), an invalid large row (-1), newer updated_at in the
// recent window; then the worker module missing (fallback to the main thread). Cost: one summary with the
// database file's pages evicted (posix_fadvise DONTNEED) and warm; the main thread's longest stall is the
// largest gap between 5 ms timer ticks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/gwhealth";
const WORK_DIR = path.join(FIXTURE_DIR, `run-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const REPEAT = Number(process.env.REPEAT ?? 3);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const out = {};
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
fs.copyFileSync(process.env.OPENCLAW_CONFIG_PATH, path.join(stateDir, "openclaw.json"));
Object.assign(process.env, {
  OPENCLAW_STATE_DIR: stateDir,
  OPENCLAW_CONFIG_PATH: path.join(stateDir, "openclaw.json"),
  OPENCLAW_DB91_INTEGRITY_STATE_ROOT: stateDir,
  OPENCLAW_HOME: WORK_DIR,
});
const fixture = path.join(FIXTURE_DIR, "v-sn.sqlite");
const { g: openOpenClawAgentDatabase, a: closeOpenClawAgentDatabases } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
openOpenClawAgentDatabase({ agentId: "makaron" });
closeOpenClawAgentDatabases();
{
  const db = new DatabaseSync(agentDb);
  db.exec(`PRAGMA foreign_keys = OFF; ATTACH '${fixture}' AS v; BEGIN;`);
  for (const table of ["session_nodes", "session_participants"]) {
    const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
    const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
    const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
    db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
  }
  db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key); COMMIT; DETACH v; PRAGMA wal_checkpoint(TRUNCATE);");
  db.close();
}

// ---- both collector chunks ----
const NAME = "collector-DyqVHdcZ.js";
const plan = JSON.parse(fs.readFileSync("lab/health-summary-worker.plan.json", "utf8")).files;
const planFor = (name) => plan.find((f) => f.target.endsWith(`/${name}`));
const workerName = "v-health-session-summary-worker.mjs";
const workerPath = path.join(DIST, workerName);
assert.equal(sha(fs.readFileSync(workerPath)), planFor(workerName).after, "candidate dist must carry the worker module");
const baseSource = fs.readFileSync(path.join(DIST, NAME), "utf8");
assert.equal(sha(baseSource), planFor(NAME).before, "candidate collector is not V's bytes");
const releaseSource = fs.readFileSync(path.resolve("lab/release-files/health-summary-worker", NAME), "utf8");
assert.equal(sha(releaseSource), planFor(NAME).after);
const load = async (file, source) => {
  fs.writeFileSync(path.join(DIST, file), source);
  process.on("exit", () => fs.rmSync(path.join(DIST, file), { force: true }));
  return await import(path.join(DIST, file));
};
const base = await load("collector-HWBASE.js", baseSource);
const patched = await load("collector-HWPATCH.js", releaseSource);
const { o: resolveSessionStorePathCore } = await import(path.join(DIST, "paths-DDTeIhCT.js"));

const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const ordered = { defaultAgentId: "makaron", ordered: [{ id: "makaron", name: "V" }, { id: "nodb-agent" }] };
const strip = (value) => JSON.stringify(value, (k, v) => (k === "age" ? undefined : typeof v === "function" ? undefined : v));
const makaronStore = resolveSessionStorePathCore(cfg.session?.store, { agentId: "makaron" });
let compared = 0;
const mismatches = [];
async function compare(label) {
  for (const [name, call] of [
    ["agents", (m) => m.t(cfg, ordered)],
    ["single", async (m) => (await m.t(cfg, { defaultAgentId: "makaron", ordered: [{ id: "makaron" }] }))[0].sessions],
  ]) {
    const a = strip(await call(base));
    const b = strip(await call(patched));
    compared += 1;
    if (a !== b) mismatches.push({ label, name, a: a.slice(0, 400), b: b.slice(0, 400) });
  }
}
const sample = (await base.t(cfg, ordered))[0].sessions;
await compare("as exported");
{
  const db = new DatabaseSync(agentDb);
  const keys = db.prepare("SELECT session_key FROM session_nodes ORDER BY updated_at DESC LIMIT 40").all().map((r) => r.session_key);
  const old = db.prepare("SELECT session_key FROM session_nodes ORDER BY updated_at ASC LIMIT 20").all().map((r) => r.session_key);
  db.exec("BEGIN");
  for (const key of [...keys.slice(0, 3), ...old.slice(0, 5)]) db.prepare("UPDATE session_nodes SET entry_valid = 0 WHERE session_key = ?").run(key);
  for (const key of [keys[6], old[6]]) db.prepare("UPDATE session_nodes SET entry_json = '{}', entry_valid = -1 WHERE session_key = ?").run(key);
  db.prepare("UPDATE session_nodes SET entry_json = ?, entry_valid = -1 WHERE session_key = ?").run(`{"broken": ${"x".repeat(70000)}`, old[7]);
  db.prepare("UPDATE session_nodes SET entry_valid = -1 WHERE session_key = ?").run(old[7]);
  db.prepare("UPDATE session_nodes SET updated_at = ? WHERE session_key = ?").run(Date.now() + 1000, old[8]);
  db.exec("COMMIT");
  db.close();
}
await compare("pending, cleared, invalid and reordered rows");
fs.renameSync(workerPath, `${workerPath}.hidden`);
await compare("worker module missing (main-thread fallback)");
fs.renameSync(`${workerPath}.hidden`, workerPath);
await compare("worker back");
log("equivalence", { recentSample: sample.recent.map((r) => r.key.split(":").slice(0, 3).join(":")), count: sample.count, compared, mismatches: mismatches.length, sample: mismatches.slice(0, 3) });
assert.equal(mismatches.length, 0, "summaries differ");

// ---- main-thread cost, cold and warm page cache ----
const evict = () => execFileSync("python3", ["-c", `import os\nfor p in ["${agentDb}", "${agentDb}-wal"]:\n  if os.path.exists(p):\n    fd = os.open(p, os.O_RDONLY); os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED); os.close(fd)`]);
async function measure(label, fn, cold) {
  const rows = [];
  for (let i = 0; i < REPEAT; i++) {
    if (cold) evict();
    let last = performance.now();
    let maxGap = 0;
    const ticker = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
    }, 5);
    const t = performance.now();
    await fn();
    const wall = performance.now() - t;
    await new Promise((r) => setTimeout(r, 20));
    clearInterval(ticker);
    maxGap = Math.max(maxGap, performance.now() - last);
    rows.push({ wallMs: Math.round(wall), mainThreadMaxStallMs: Math.round(maxGap) });
  }
  return { label, cold, runs: rows };
}
for (const cold of [true, false]) {
  log(`cost.${cold ? "cold" : "warm"}.base`, await measure("buildHealthAgentSummaries V", () => base.t(cfg, ordered), cold));
  log(`cost.${cold ? "cold" : "warm"}.patched`, await measure("buildHealthAgentSummaries release", () => patched.t(cfg, ordered), cold));
}
console.log(JSON.stringify(out, null, 1));
process.exit(0);
