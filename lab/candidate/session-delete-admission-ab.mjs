// session-delete-admission-exact-read-v1 A/B on a copy of V's session tables.
//
// Data (read-only export from V, kept outside the repository; FIXTURE_DIR on the VLab host):
//   v-sessions.sqlite   all of V's session_nodes / session_windows / session_participants /
//                       session_transcript_index_state / session_progress_cards rows (makaron agent)
// A makaron agent database is created by OpenClaw itself (schema, triggers) and filled from the export.
//
// Each arm runs in its own process on its own copy of that database, with the arm's bytes written to
// the candidate dist (V's bytes = base, release files = patched; every file in the plan),
// so the whole module graph (deleteSessionEntryLifecycle -> preflight fence) runs the arm's code.
//
// Per arm, with work admissions in flight (real V session keys plus two synthetic admitted sessions):
//   delete     the real cron cleanup path: deleteSessionEntryLifecycle({ archiveTranscript: false })
//              on REPEAT temporary cron run sessions; wall time (its heavy reads are synchronous; the
//              loop-delay field reads 0 and is not evidence of anything), and peak
//              RSS growth (VmHWM reset before each call) per deletion
//   fence      collectAdmissionProtectedSessionIds alone: time, peak RSS growth, the protected set
//   protected  deleting an admitted session (by key) and a session whose old generation is admitted
//              (by id) must be refused, and both must keep their entry and every window
// The parent compares the arms: same protected set, same refusals, same final session tables.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const CHUNK = "session-history-eviction-d5aiCsHS.js";
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/sdel";
const WORK_DIR = process.env.WORK_DIR ?? path.join(FIXTURE_DIR, `run-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const REPEAT = Number(process.env.REPEAT ?? 5);
const REAL_ADMISSIONS = Number(process.env.REAL_ADMISSIONS ?? 8);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const MiB = (bytes) => Math.round(bytes / 1048576);
const self = fileURLToPath(import.meta.url);

function vmKb(field) {
  const match = fs.readFileSync("/proc/self/status", "utf8").match(new RegExp(`^${field}:\\s+(\\d+) kB`, "mu"));
  return Number(match[1]) * 1024;
}
// Peak RSS of a synchronous-heavy call: reset VmHWM (clear_refs 5), run, read the new high-water mark.
async function measure(fn) {
  global.gc?.();
  global.gc?.();
  fs.writeFileSync("/proc/self/clear_refs", "5");
  const rssBefore = vmKb("VmRSS");
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const t = performance.now();
  let value;
  let error;
  try {
    value = await fn();
  } catch (err) {
    error = err;
  }
  const ms = performance.now() - t;
  delay.disable();
  const peak = vmKb("VmHWM");
  return { ms: Math.round(ms), loopBlockMaxMs: Math.round(delay.max / 1e6), rssBeforeMiB: MiB(rssBefore), peakGrowthMiB: MiB(peak - rssBefore), value, error };
}

function stateDirFor(arm) {
  return path.join(WORK_DIR, arm, "state");
}
function agentDbFor(arm) {
  return path.join(stateDirFor(arm), "agents", "makaron", "agent", "openclaw-agent.sqlite");
}
function configure(stateDir) {
  process.env.OPENCLAW_STATE_DIR = stateDir;
  process.env.OPENCLAW_CONFIG_PATH = path.join(stateDir, "openclaw.json");
  process.env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT = stateDir;
  process.env.OPENCLAW_HOME = path.dirname(stateDir);
}

if (!process.env.SDEL_ARM) {
  // ---------------- parent: fixture, arms, comparison ----------------
  const out = {};
  const log = (key, value) => {
    out[key] = value;
    console.error(`[${new Date().toISOString()}] ${key}: ${JSON.stringify(value).slice(0, 4000)}`);
  };
  // Every patched file: V's bytes for the base arm, the release file for the patched arm.
  const planFiles = JSON.parse(fs.readFileSync("lab/session-delete-admission.plan.json", "utf8")).files;
  const files = planFiles.map((f) => {
    const name = path.basename(f.target);
    const vBytes = fs.readFileSync(path.join(DIST, name));
    assert.equal(sha(vBytes), f.before, `${name}: candidate runtime is not V's bytes`);
    return { name, base: vBytes, patched: fs.readFileSync(f.source) };
  });
  const install = (arm) => {
    for (const f of files) fs.writeFileSync(path.join(DIST, f.name), f[arm]);
    return sha(JSON.stringify(files.map((f) => [f.name, sha(f[arm])])));
  };
  const restore = () => install("base");
  const KEEP = process.env.KEEP_WORK === "1";
  process.on("exit", () => {
    restore();
    if (!KEEP) fs.rmSync(WORK_DIR, { recursive: true, force: true });
  });

  // Fixture: an OpenClaw-created makaron database filled from V's export, built once under "fixture".
  const fixtureState = stateDirFor("fixture");
  const fixtureDb = agentDbFor("fixture");
  fs.mkdirSync(path.dirname(fixtureDb), { recursive: true });
  const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
  // V's session.maintenance (warn): VLab's own enforce/maxEntries would prune the copied store.
  config.session = { ...config.session, maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  const configText = JSON.stringify(config, null, 2);
  fs.writeFileSync(path.join(fixtureState, "openclaw.json"), configText);
  configure(fixtureState);
  {
    const t = performance.now();
    const { g: openOpenClawAgentDatabase, a: closeOpenClawAgentDatabases } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
    openOpenClawAgentDatabase({ agentId: "makaron" });
    closeOpenClawAgentDatabases();
    const db = new DatabaseSync(fixtureDb);
    db.exec("PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 30000;");
    db.exec(`ATTACH '${path.join(FIXTURE_DIR, "v-sessions.sqlite")}' AS v`);
    const copy = (table) => {
      const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
      const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
      const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
      db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
      return db.prepare(`SELECT count(*) AS n FROM main.${table}`).get().n;
    };
    db.exec("BEGIN");
    const counts = {};
    for (const table of ["session_nodes", "session_windows", "session_participants", "session_transcript_index_state", "session_progress_cards"]) counts[table] = copy(table);
    db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key)");
    db.exec("UPDATE main.session_windows SET primary_conversation_id = NULL");
    db.exec("COMMIT");
    const fk = db.prepare("PRAGMA foreign_key_check").all();
    if (fk.length) throw new Error(`fixture foreign keys: ${JSON.stringify(fk.slice(0, 5))}`);
    const size = db.prepare("SELECT count(*) AS rows, sum(length(entry_json)) AS chars, sum(entry_json GLOB '*[^ -~]*') AS nonAscii FROM session_nodes").get();
    db.exec("DETACH v; PRAGMA wal_checkpoint(TRUNCATE);");
    db.close();
    log("fixture", { counts, entryJson: size, bytes: fs.statSync(fixtureDb).size, ms: Math.round(performance.now() - t) });
  }

  const results = {};
  for (const arm of ARM_ORDER()) {
    const armState = stateDirFor(arm);
    const armDb = agentDbFor(arm);
    fs.rmSync(path.join(WORK_DIR, arm), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(armDb), { recursive: true });
    fs.writeFileSync(path.join(armState, "openclaw.json"), configText);
    fs.copyFileSync(fixtureDb, armDb, fs.constants.COPYFILE_FICLONE);
    const expect = install(arm);
    const child = spawnSync(process.execPath, ["--expose-gc", "--max-old-space-size=8192", self], {
      env: { ...process.env, SDEL_ARM: arm, SDEL_EXPECT_SHA: expect, SDEL_FILES: files.map((f) => f.name).join(",") },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    restore();
    process.stderr.write(child.stderr.split("\n").filter((l) => !/ExperimentalWarning|--trace-warnings/u.test(l)).join("\n"));
    assert.equal(child.status, 0, `${arm} arm failed`);
    results[arm] = JSON.parse(child.stdout.trim().split("\n").at(-1));
    log(arm, results[arm]);
    if (!KEEP) fs.rmSync(path.join(WORK_DIR, arm), { recursive: true, force: true });
  }

  // Equivalence between arms.
  const { base, patched } = results;
  if (!base || !patched) {
    console.log(JSON.stringify(out));
    process.exit(0);
  }
  assert.deepEqual(patched.fence.protectedSet, base.fence.protectedSet, "protected set differs");
  assert.deepEqual(patched.protected, base.protected, "refusals or surviving rows differ");
  assert.equal(patched.finalTables, base.finalTables, "final session tables differ");
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const summary = {};
  for (const arm of ["base", "patched"]) {
    const d = results[arm].deletes;
    summary[arm] = {
      deleteMsMedian: median(d.map((x) => x.ms)),
      deleteMsMax: Math.max(...d.map((x) => x.ms)),
      loopBlockMaxMs: Math.max(...d.map((x) => x.loopBlockMaxMs)),
      peakGrowthMiBMedian: median(d.map((x) => x.peakGrowthMiB)),
      peakGrowthMiBMax: Math.max(...d.map((x) => x.peakGrowthMiB)),
      fenceMs: results[arm].fence.ms,
      fencePeakGrowthMiB: results[arm].fence.peakGrowthMiB,
    };
  }
  log("summary", { ...summary, protectedSetSize: base.fence.protectedSet.length, protectedSetEqual: true, refusalsEqual: true, finalTablesEqual: true });
  console.log(JSON.stringify(out));
} else {
  // ---------------- child: one arm ----------------
  const arm = process.env.SDEL_ARM;
  assert.equal(sha(JSON.stringify(process.env.SDEL_FILES.split(",").map((name) => [name, sha(fs.readFileSync(path.join(DIST, name)))]))), process.env.SDEL_EXPECT_SHA, `${arm}: dist bytes`);
  const stateDir = stateDirFor(arm);
  configure(stateDir);
  const storePath = path.join(stateDir, "agents", "makaron", "sessions", "sessions.json");
  const imp = (name) => import(path.join(DIST, name));
  const { n: deleteSessionEntryLifecycle, r: resetSessionEntryLifecycle } = await imp("session-accessor.sqlite-lifecycle-dtL0ZEAl.js");
  const { _: replaceSessionEntry, d: loadSessionEntry } = await imp("session-accessor.sqlite-entry-BlklNPKQ.js");
  const { _t: appendTranscriptMessage } = await imp("session-accessor-K0XuW6ln.js");
  const { n: beginSessionWorkAdmission } = await imp("session-lifecycle-admission-siUq03Jk.js");
  const { t: collectAdmissionProtectedSessionIds } = await imp(CHUNK);
  const { g: openOpenClawAgentDatabase } = await imp("openclaw-agent-db-CUTe8BX6.js");
  const database = () => openOpenClawAgentDatabase({ agentId: "makaron" });
  const raw = new DatabaseSync(agentDbFor(arm), { readOnly: true });
  const windowsOf = (key) => raw.prepare("SELECT session_id FROM session_windows WHERE session_key = ? ORDER BY session_id").all(key).map((r) => r.session_id);

  const seed = async (sessionKey, ids) => {
    for (const [index, sessionId] of ids.entries()) {
      if (index === 0) await replaceSessionEntry({ sessionKey, storePath }, { sessionId, updatedAt: Date.now() });
      else await resetSessionEntryLifecycle({ storePath, target: { canonicalKey: sessionKey, storeKeys: [sessionKey] }, buildNextEntry: () => ({ sessionId, updatedAt: Date.now() }) });
      await appendTranscriptMessage({ sessionId, sessionKey, storePath }, { message: { role: "user", content: `sdel ${sessionId}` } });
    }
  };
  const P = "agent:makaron:cron:sdel-ab-admitted:run:p";
  const Q = "agent:makaron:cron:sdel-ab-admitted:run:q";
  await seed(P, ["sdel-p-old", "sdel-p-live"]);
  await seed(Q, ["sdel-q-old", "sdel-q-live"]);
  const targets = Array.from({ length: REPEAT }, (_, i) => `agent:makaron:cron:sdel-ab-target:run:${i}`);
  for (const key of targets) await seed(key, [`sdel-target-${key.at(-1)}`]);
  // Real in-flight work: the most recently updated real sessions, admitted by key.
  const realKeys = raw.prepare("SELECT session_key FROM session_nodes WHERE session_key NOT LIKE '%sdel-ab%' ORDER BY updated_at DESC LIMIT ?").all(REAL_ADMISSIONS).map((r) => r.session_key);
  const admission = await beginSessionWorkAdmission({ scope: storePath, identities: [...realKeys, P, "sdel-q-old"], assertAllowed: () => {} });
  const result = { arm, realAdmissions: realKeys.length };
  try {
    // fence alone
    const fence = await measure(() => collectAdmissionProtectedSessionIds({ database: database(), storePath }));
    const protectedSet = [...fence.value].sort();
    for (const id of ["sdel-p-old", "sdel-p-live", "sdel-q-old"]) assert(protectedSet.includes(id), `${id} must be protected`);
    result.fence = { ms: fence.ms, loopBlockMaxMs: fence.loopBlockMaxMs, peakGrowthMiB: fence.peakGrowthMiB, protectedSet, protectedSetSize: protectedSet.length };
    console.error(`[${arm}] fence ${fence.ms} ms, +${fence.peakGrowthMiB} MiB, ${protectedSet.length} ids`);

    // protected deletions must be refused and keep everything
    result.protected = {};
    for (const [key, label] of [[P, "admittedKey"], [Q, "admittedOldGeneration"]]) {
      const attempt = await measure(() => deleteSessionEntryLifecycle({ archiveTranscript: true, storePath, target: { canonicalKey: key, storeKeys: [key] } }));
      result.protected[label] = {
        refused: attempt.error ? String(attempt.error.message).replace(/\s+/gu, " ").slice(0, 200) : null,
        entrySessionId: loadSessionEntry({ sessionKey: key, storePath })?.sessionId ?? null,
        windows: windowsOf(key),
      };
      assert(attempt.error && /in flight/u.test(attempt.error.message), `${label}: deletion must be refused, got ${attempt.error?.message ?? "deleted"}`);
    }

    // the real cron cleanup deletion of unrelated temporary run sessions
    result.deletes = [];
    for (const key of targets) {
      const m = await measure(() => deleteSessionEntryLifecycle({ archiveTranscript: false, storePath, target: { canonicalKey: key, storeKeys: [key] } }));
      if (m.error) throw m.error;
      assert.equal(m.value?.deleted, true, `${key} not deleted`);
      assert.equal(loadSessionEntry({ sessionKey: key, storePath }), undefined);
      result.deletes.push({ ms: m.ms, loopBlockMaxMs: m.loopBlockMaxMs, rssBeforeMiB: m.rssBeforeMiB, peakGrowthMiB: m.peakGrowthMiB });
      console.error(`[${arm}] delete ${m.ms} ms, block ${m.loopBlockMaxMs} ms, +${m.peakGrowthMiB} MiB`);
    }
    // admitted sessions untouched after all deletions
    for (const key of [P, Q, ...realKeys.slice(0, 3)]) assert(loadSessionEntry({ sessionKey: key, storePath }), `${key} lost`);
  } finally {
    admission.release();
  }
  // Optional: what the rest of a deletion costs (the two metadata-projection scans), patched arm only.
  if (process.env.COMPONENTS === "1") {
    const { u: readReferencedSessionIds } = await imp("session-accessor.sqlite-lifecycle-state-CrB_K2kA.js");
    const referenced = await measure(() => readReferencedSessionIds(database(), new Set([targets[0]])).size);
    const survivors = await measure(() => raw.prepare("SELECT current_session_id, json_remove(entry_json, '$.skillsSnapshot', '$.systemPromptReport') AS entry_json, session_key FROM session_nodes WHERE session_key != ? ORDER BY session_key").all(targets[0]).length);
    const prefilter = await measure(() => raw.prepare("SELECT session_key FROM session_nodes WHERE session_key != ? AND (current_session_id = ? OR instr(entry_json, ?) > 0) ORDER BY session_key").all(targets[0], "sdel-target-0", "sdel-target-0").length);
    result.components = Object.fromEntries(Object.entries({ readReferencedSessionIds: referenced, survivingNodesScan: survivors, survivingNodesInstrPrefilter: prefilter }).map(([k, m]) => [k, { ms: m.ms, peakGrowthMiB: m.peakGrowthMiB, rows: m.value }]));
    console.error(`[${arm}] components ${JSON.stringify(result.components)}`);
  }
  // Final tables minus volatile timestamps, for cross-arm comparison.
  const nodes = raw.prepare("SELECT session_key, current_session_id FROM session_nodes ORDER BY session_key").all();
  const windows = raw.prepare("SELECT session_id, session_key FROM session_windows ORDER BY session_id").all();
  result.finalTables = sha(JSON.stringify([nodes, windows]));
  result.finalCounts = { nodes: nodes.length, windows: windows.length };
  console.log(JSON.stringify(result));
}

function ARM_ORDER() {
  return (process.env.ARMS ?? "base,patched").split(",");
}
