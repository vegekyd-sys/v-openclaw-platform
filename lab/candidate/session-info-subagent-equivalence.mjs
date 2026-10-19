// Row equivalence for session-info-subagent-index, in one process: V's session-utils-list chunk and
// the release chunk are both loaded from the candidate dist, so they share one subagent registry
// module (persisted snapshot cache and in-memory SubagentRunMap). Every round overlays random
// in-memory runs (running, queued, recently ended, long ended, several generations of one child,
// grandchild chains, runs controlled by another session) on a persisted registry of V's runs, then
// builds each selected row with both chunks and compares the JSON.
//
// Persisted runs: SUBAGENT_FIXTURE (V's subagent_runs) cut to PERSISTED rows, most of them requested
// by agent:makaron:main, written into a private copy of the shared state database. Store entries:
// agent:makaron:main from MAIN_FIXTURE and the runs' child sessions from CHILD_FIXTURE.
// Single-row entry points compared: buildGatewaySessionRow without a row context (sessions.describe,
// Control UI preview), buildGatewaySessionInfo (chat.history) and the single-row snapshot shape
// (store-child index + row), with the same `now`.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import zlib from "node:zlib";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateDir = fs.realpathSync(process.env.OPENCLAW_STATE_DIR);
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && stateDir && sharedState && configPath, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const CHUNK = "session-utils-list-BUP03AzS.js";
const V_CHUNK_SHA = "353e0f211194c77e233f071c4080e107bda00b5f14fbb991c1ff102834628e79";
const RELEASE_FILE = path.resolve("lab/release-files/session-info-subagent-index", CHUNK);
const PERSISTED = Number(process.env.PERSISTED ?? 600);
const ROUNDS = Number(process.env.ROUNDS ?? 300);
const MAIN = "agent:makaron:main";
const sha = (value) => createHash("sha256").update(value).digest("hex");
let seed = Number(process.env.SEED ?? 20261020);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (items) => items[Math.floor(rand() * items.length)];
const findInput = (name) => {
  for (const stack = ["."]; stack.length; ) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === name) return p;
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) stack.push(p);
    }
  }
};
const readFixture = (name) => JSON.parse(zlib.gunzipSync(fs.readFileSync(findInput(name) ?? assert.fail(`${name} missing`))).toString("utf8"));

// ---- persisted registry: a private state database holding a cut of V's runs ----
const stateDb = path.join(stateDir, "state", "openclaw.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(stateDb + suffix, { force: true });
fs.mkdirSync(path.dirname(stateDb), { recursive: true });
execFileSync("sqlite3", [path.join(sharedState, "state", "openclaw.sqlite"), `.backup '${stateDb}'`]);
process.on("exit", () => { for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(stateDb + suffix, { force: true }); });
const runsFixture = readFixture(process.env.SUBAGENT_FIXTURE ?? "v-subagent-runs.json.gz");
const col = (name) => runsFixture.columns.indexOf(name);
const mainRows = runsFixture.rows.filter((r) => r[col("requester_session_key")] === MAIN);
const otherRows = runsFixture.rows.filter((r) => r[col("requester_session_key")] !== MAIN);
const persisted = [...mainRows.slice(0, Math.floor(PERSISTED * 0.85)), ...otherRows.slice(0, PERSISTED - Math.floor(PERSISTED * 0.85))];
{
  const db = new DatabaseSync(stateDb);
  db.exec("BEGIN IMMEDIATE; DELETE FROM subagent_runs;");
  const insert = db.prepare(`INSERT INTO subagent_runs (${runsFixture.columns.map((c) => `"${c}"`).join(",")}) VALUES (${runsFixture.columns.map(() => "?").join(",")})`);
  for (const row of persisted) insert.run(...row);
  db.exec("COMMIT");
  db.close();
}
const persistedPayloads = persisted.map((r) => JSON.parse(r[col("payload_json")]));

// ---- store entries: main + every child session the fixture knows ----
const store = {};
{
  const main = readFixture(process.env.MAIN_FIXTURE ?? "v-main.json.gz").tables.session_nodes;
  store[MAIN] = JSON.parse(main.rows[0][main.columns.indexOf("entry_json")]);
  const children = readFixture(process.env.CHILD_FIXTURE ?? "v-subagent-children.json.gz");
  for (const row of children.rows) store[row[children.columns.indexOf("session_key")]] = JSON.parse(row[children.columns.indexOf("entry_json")]);
}
const childKeys = [...new Set(persistedPayloads.map((p) => p.childSessionKey))].filter((key) => store[key]);

// ---- both chunks in one module graph ----
assert.equal(sha(fs.readFileSync(path.join(DIST, CHUNK))), V_CHUNK_SHA, "candidate runtime chunk is not V's bytes");
const patchedName = "session-utils-list-SIAPATCH.js";
fs.writeFileSync(path.join(DIST, patchedName), fs.readFileSync(RELEASE_FILE));
process.on("exit", () => fs.rmSync(path.join(DIST, patchedName), { force: true }));
const base = await import(path.join(DIST, CHUNK));
const patched = await import(path.join(DIST, patchedName));
const { w: subagentRuns } = await import(path.join(DIST, "subagent-registry.store.sqlite-hzGu4QSk.js"));
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
const storePath = path.join(stateDir, "agents", "makaron", "sessions", "sessions.json");

// ---- random in-memory overlays ----
let synthetic = 0;
function overlay(now) {
  subagentRuns.clear();
  const extraKeys = [];
  const n = Math.floor(rand() * 12);
  for (let i = 0; i < n; i++) {
    const template = structuredClone(pick(persistedPayloads));
    const kind = pick(["running", "queued", "recent", "old", "regen", "grandchild", "controlled"]);
    // Newer than the persisted row of the same child (generation ties fall back to createdAt), except
    // "old" overlays, which lose to it.
    const run = { ...template, runId: `ab-${synthetic++}`, createdAt: kind === "old" ? template.createdAt - 1 : now - 120_000, generation: (template.generation ?? 1) + (kind === "regen" ? 1 + Math.floor(rand() * 2) : 0) };
    if (kind === "grandchild") {
      run.requesterSessionKey = pick(childKeys);
      run.controllerSessionKey = run.requesterSessionKey;
      run.childSessionKey = `agent:makaron:subagent:ab-grandchild-${synthetic}`;
      store[run.childSessionKey] = { ...store[run.requesterSessionKey], spawnedBy: rand() < 0.5 ? run.requesterSessionKey : undefined };
      extraKeys.push(run.childSessionKey);
    }
    if (kind === "controlled") run.controllerSessionKey = pick([MAIN, ...childKeys.slice(0, 5)]);
    const ended = kind === "recent" ? now - 5 * 60_000 : kind === "old" ? now - 10 * 86_400_000 : undefined;
    if (kind === "running" || kind === "grandchild" || kind === "controlled") {
      run.execution = { status: "running", startedAt: now - 60_000, lifecycleGeneration: run.execution?.lifecycleGeneration };
      run.sessionStartedAt = now - 60_000; // otherwise the template's start makes the run stale
      delete run.cleanupCompletedAt; delete run.endedReason;
    } else if (kind === "queued") {
      run.execution = { status: "queued", lifecycleGeneration: run.execution?.lifecycleGeneration };
      delete run.sessionStartedAt;
      delete run.cleanupCompletedAt; delete run.endedReason;
    } else if (ended !== undefined) {
      run.execution = { ...run.execution, status: "terminal", endedAt: ended, outcome: { ...(run.execution?.outcome ?? { status: "ok" }), endedAt: ended } };
      if (rand() < 0.5) delete run.cleanupCompletedAt;
    }
    subagentRuns.set(run.runId, run);
  }
  return extraKeys;
}

const project = (row) => JSON.stringify(row, (_k, v) => (typeof v === "function" ? undefined : v));
let compared = 0, mismatches = [], baseMs = 0, patchedMs = 0, active = 0, withChildren = 0;
const timed = (fn, add) => { const t = performance.now(); const v = fn(); add(performance.now() - t); return v; };
for (let round = 0; round < ROUNDS; round++) {
  const now = Date.now();
  const extra = overlay(now);
  const keys = [...new Set([MAIN, pick(childKeys), pick(childKeys), ...extra, ...[...subagentRuns.values()].flatMap((r) => [r.childSessionKey, r.requesterSessionKey])])].filter((key) => store[key]);
  for (const key of keys) {
    const params = { cfg, storePath, store, key, entry: store[key], agentId: "makaron", now, skipTranscriptUsageFallback: true, lightweightListRow: true };
    for (const [label, call] of [
      ["row", (m) => m.s({ ...params })],
      ["info", (m) => m.i({ ...params })],
    ]) {
      const a = timed(() => project(call(base)), (ms) => { baseMs += ms; });
      const b = timed(() => project(call(patched)), (ms) => { patchedMs += ms; });
      compared += 1;
      if (a !== b && mismatches.length < 10) mismatches.push({ round, key, label, base: a.slice(0, 400), patched: b.slice(0, 400) });
      if (label === "row") {
        const row = JSON.parse(b);
        if (row.hasActiveSubagentRun) active += 1;
        if (row.childSessions?.length) withChildren += 1;
      }
    }
  }
}
console.log(JSON.stringify({ persisted: persisted.length, persistedMain: persisted.filter((r) => r[col("requester_session_key")] === MAIN).length, rounds: ROUNDS, compared, mismatches: mismatches.length, rowsWithActiveSubagentRun: active, rowsWithChildSessions: withChildren, baseMs: Math.round(baseMs), patchedMs: Math.round(patchedMs), sample: mismatches }, null, 1));
assert.equal(mismatches.length, 0, "rows differ");
assert(active > 0 && withChildren > 0, "overlays must exercise active descendants and kept child links");
