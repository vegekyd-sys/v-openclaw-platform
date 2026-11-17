// Model-run hidden session lifecycle on a V-scale makaron store (lab/candidate/v-scale-session-fixture.mjs).
//
// `openclaw infer model run --gateway` sends `agent` with modelRun=true, which forces
// sessionEffects="internal": the Gateway creates a hidden `agent:makaron:internal-session-effects:<runId>` session
// (prepareInternalSessionEffectsSession, forked from the request's own new explicit session) and hard
// deletes it after the run (createInternalSessionEffectsCleanup → removeInternalSessionEffectsSession). Both run synchronously on the Gateway
// main thread. This harness runs exactly those two calls, with the Gateway's arguments, per arm:
//   A  the runtime as cached (V's bytes; checked against the plan's `before` when PLAN is set)
//   B  the release files from PLAN (lab/<name>.plan.json)
// Per operation: wall time and the longest main-thread block (1 ms ticker). Before every iteration another
// connection rewrites 100 other session rows (worker-style commits). COLD=1 evicts the fixture file's pages
// (posix_fadvise DONTNEED on that file only) before every create, to show the cold-cache cost.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const PLAN = process.env.PLAN ? JSON.parse(fs.readFileSync(path.resolve(process.env.PLAN), "utf8")) : { files: [] };
const sha = (v) => createHash("sha256").update(v).digest("hex");
const AGENT = "makaron";
const ITERATIONS = Number(process.env.ITERATIONS ?? 8);
const TAIL_MS = Number(process.env.TAIL_MS ?? 3000);
const dbOf = (stateDir) => path.join(stateDir, "agents", AGENT, "agent", "openclaw-agent.sqlite");

if (process.argv[2] === "child") await child(process.argv[3]);
else if (process.argv[2] === "canon") await canon(process.argv[3]);
else await parent();

async function parent() {
  const sharedState = process.env.VLAB_SHARED_STATE_DIR;
  assert(sharedState, "shared VLab state is required for the fixture templates");
  // V's bytes for the chunks this path loads (session-reference-index is on V since 2026-11-17)
  for (const [name, expected] of Object.entries(JSON.parse(process.env.EXPECT_SHA ?? "{}"))) {
    assert.equal(sha(fs.readFileSync(path.join(DIST, name))), expected, `runtime ${name} is not V's bytes`);
  }
  for (const file of PLAN.files) {
    if (file.before) assert.equal(sha(fs.readFileSync(path.join(runtime, file.target))), file.before, `runtime is not V's bytes for ${file.target}`);
    assert.equal(sha(fs.readFileSync(path.resolve(file.source))), file.after, `release file hash ${file.source}`);
  }
  const WORK = path.join(process.env.WORK_ROOT ?? "/var/tmp", `modelrun-session-ab-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
  const originals = new Map(PLAN.files.map((file) => [file.target, fs.existsSync(path.join(runtime, file.target)) ? fs.readFileSync(path.join(runtime, file.target)) : null]));
  const restore = () => {
    for (const [target, bytes] of originals) {
      if (bytes === null) fs.rmSync(path.join(runtime, target), { force: true });
      else fs.writeFileSync(path.join(runtime, target), bytes);
    }
  };
  process.on("exit", () => {
    restore();
    if (process.env.KEEP_WORK !== "1") fs.rmSync(WORK, { recursive: true, force: true });
  });
  const { buildVScaleSessionDatabase } = await import("./v-scale-session-fixture.mjs");
  const fixtureState = path.join(WORK, "fixture");
  const t0 = performance.now();
  const fixture = buildVScaleSessionDatabase({
    runtime,
    srcPath: path.join(sharedState, "agents", AGENT, "agent", "openclaw-agent.sqlite"),
    dstPath: dbOf(fixtureState),
    targetRows: Number(process.env.TARGET_ROWS ?? 21900),
    targetEntryBytes: Number(process.env.TARGET_ENTRY_BYTES ?? 92000),
    orphanWindows: Number(process.env.ORPHAN_WINDOWS ?? 5000),
  });
  const canonRun = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "canon", fixtureState], { env: { ...process.env, OPENCLAW_STATE_DIR: fixtureState, OPENCLAW_DB91_INTEGRITY_STATE_ROOT: fixtureState, OPENCLAW_HOME: fixtureState }, encoding: "utf8" });
  process.stderr.write(canonRun.stderr ?? "");
  assert.equal(canonRun.status, 0, "canonical cleanup failed");
  console.error(`[modelrun-ab] fixture ${JSON.stringify(fixture)} built in ${Math.round((performance.now() - t0) / 1000)} s; canonical cleanup ${canonRun.stdout.trim()}`);

  const arms = (process.env.ARMS ?? "A,B").split(",");
  const results = {};
  for (const arm of arms) {
    const state = path.join(WORK, arm);
    fs.mkdirSync(path.dirname(dbOf(state)), { recursive: true });
    fs.copyFileSync(dbOf(fixtureState), dbOf(state));
    restore();
    if (arm === "B") for (const file of PLAN.files) fs.copyFileSync(path.resolve(file.source), path.join(runtime, file.target));
    const env = { ...process.env, OPENCLAW_STATE_DIR: state, OPENCLAW_DB91_INTEGRITY_STATE_ROOT: state, OPENCLAW_HOME: state, AB_ARM: arm };
    const run = spawnSync(process.execPath, ["--expose-gc", "--max-old-space-size=7168", new URL(import.meta.url).pathname, "child", state], { env, encoding: "utf8", maxBuffer: 64 << 20 });
    process.stderr.write(run.stderr ?? "");
    assert.equal(run.status, 0, `arm ${arm} failed`);
    results[arm] = JSON.parse(run.stdout.trim().split("\n").at(-1));
    fs.rmSync(path.dirname(path.dirname(path.dirname(dbOf(state)))), { recursive: true, force: true });
  }
  restore();
  const table = Object.fromEntries(Object.entries(results).map(([arm, r]) => [arm, r.ops.map((op) => `${op.kind}:${op.wallMs}/${op.maxBlockMs}`).join(" ")]));
  console.log(JSON.stringify({ fixture, table, results }, null, 1));
  for (const arm of arms) assert.equal(results[arm].leftovers, 0, `arm ${arm} left hidden sessions or transcripts behind`);
  const worst = (arm, kind) => Math.max(...results[arm].ops.filter((op) => op.kind === kind).map((op) => op.maxBlockMs));
  console.log(`PASS modelrun-session: longest main-thread block create/remove ${arms.map((arm) => `${arm} ${worst(arm, "create")}/${worst(arm, "remove")} ms`).join(", ")}; no leftovers`);
}

async function canon(stateDir) {
  const { g: openOpenClawAgentDatabase } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
  const { p: assertCanonicalSqliteSessionKeysCurrent } = await import(path.join(DIST, "session-accessor.sqlite-transcript-state-Cz9g7S9v.js"));
  const raw = new DatabaseSync(dbOf(stateDir));
  raw.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 30000;");
  const removed = [];
  for (let i = 0; i < 200; i += 1) {
    try {
      assertCanonicalSqliteSessionKeysCurrent(openOpenClawAgentDatabase({ agentId: AGENT }));
      raw.close();
      console.log(JSON.stringify({ removed: removed.length }));
      return;
    } catch (error) {
      const key = /repair for (.+?); stop the Gateway/u.exec(String(error?.message))?.[1];
      assert(key, `unexpected canonical scan failure: ${error?.message}`);
      raw.prepare("DELETE FROM session_nodes WHERE session_key = ?").run(key);
      removed.push(key);
    }
  }
  throw new Error("canonical cleanup did not converge");
}

async function child(stateDir) {
  const file = (name) => path.join(DIST, name);
  const effects = await import(file("internal-session-effects-C8FWqbuL.js"));
  const prepareInternalSessionEffectsSession = effects.n;
  const createInternalSessionEffectsCleanup = effects.t;
  assert.equal(typeof prepareInternalSessionEffectsSession, "function");
  assert.equal(typeof createInternalSessionEffectsCleanup, "function");
  const accessor = await import(file("session-accessor-K0XuW6ln.js"));
  const appendTranscriptMessage = accessor._t;
  const { g: openOpenClawAgentDatabase } = await import(file("openclaw-agent-db-CUTe8BX6.js"));
  const { p: assertCanonicalSqliteSessionKeysCurrent } = await import(file("session-accessor.sqlite-transcript-state-Cz9g7S9v.js"));
  const storePath = path.join(stateDir, "agents", AGENT, "sessions", "sessions.json");
  // the canonical-key scan runs once per process (on V at Gateway start); take it before measuring
  assertCanonicalSqliteSessionKeysCurrent(openOpenClawAgentDatabase({ agentId: AGENT }));

  const dbFile = dbOf(stateDir);
  const other = new DatabaseSync(dbFile);
  other.exec("PRAGMA busy_timeout = 30000");
  const candidates = other.prepare("SELECT rowid AS r FROM session_nodes WHERE entry_valid = 1 ORDER BY rowid").all().map((row) => row.r);
  let workerRound = 0;
  const workerWrites = () => {
    const rows = candidates.slice((workerRound * 100) % candidates.length, ((workerRound * 100) % candidates.length) + 100);
    workerRound += 1;
    other.exec("BEGIN IMMEDIATE");
    const update = other.prepare("UPDATE session_nodes SET updated_at = updated_at + 1, entry_json = json_set(entry_json, '$.updatedAt', updated_at + 1) WHERE rowid = ?");
    const settle = other.prepare("UPDATE session_nodes SET entry_valid = 1 WHERE rowid = ?");
    for (const r of rows) {
      update.run(r);
      settle.run(r);
    }
    other.exec("COMMIT");
  };
  const evict = () => {
    if (process.env.COLD !== "1") return;
    other.exec("PRAGMA wal_checkpoint(PASSIVE)");
    const r = spawnSync("python3", ["-c", "import os,sys\nfd=os.open(sys.argv[1],os.O_RDONLY)\nos.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)\nos.close(fd)", dbFile]);
    assert.equal(r.status, 0, String(r.stderr));
  };

  const { Session } = await import("node:inspector/promises");
  const profileOps = new Set(process.env.AB_ARM === (process.env.PROFILE_ARM ?? "A") ? (process.env.PROFILE_OPS ?? "").split(",").filter(Boolean) : []);
  let opIndex = 0;
  async function profiled(fn) {
    const label = String(opIndex++);
    if (!profileOps.has(label)) return fn();
    const inspector = new Session();
    inspector.connect();
    await inspector.post("Profiler.enable");
    await inspector.post("Profiler.setSamplingInterval", { interval: 500 });
    await inspector.post("Profiler.start");
    const value = await fn();
    await new Promise((r) => setTimeout(r, TAIL_MS));
    const { profile } = await inspector.post("Profiler.stop");
    inspector.disconnect();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const self = new Map();
    const incl = new Map();
    profile.samples.forEach((id, i) => {
      const ms = (profile.timeDeltas[i] ?? 0) / 1000;
      const keyOf = (n) => `${n.callFrame.functionName || "(anon)"} ${path.basename(n.callFrame.url || "")}:${n.callFrame.lineNumber + 1}`;
      const top = byId.get(id);
      self.set(keyOf(top), (self.get(keyOf(top)) ?? 0) + ms);
      const seen = new Set();
      for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
        const k = keyOf(byId.get(cur));
        if (!seen.has(k)) incl.set(k, (incl.get(k) ?? 0) + ms);
        seen.add(k);
      }
    });
    const fmt = (m, n) => [...m].filter(([k]) => !/^\((idle|program|root)\)/u.test(k) && !k.includes("node:internal")).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => `${Math.round(ms)}ms ${k}`);
    console.error(`[modelrun-ab child ${process.env.AB_ARM}] profile op ${label} self: ${JSON.stringify(fmt(self, 12))}`);
    console.error(`[modelrun-ab child ${process.env.AB_ARM}] profile op ${label} inclusive: ${JSON.stringify(fmt(incl, 30))}`);
    return value;
  }
  async function measure(kind, fn) {
    let last = performance.now();
    let maxBlock = 0;
    let running = true;
    const tick = () => {
      const now = performance.now();
      maxBlock = Math.max(maxBlock, now - last);
      last = now;
      if (running) setTimeout(tick, 1);
    };
    setTimeout(tick, 1);
    const t = performance.now();
    let wallMs;
    const result = await profiled(async () => {
      const value = await fn();
      wallMs = Math.round(performance.now() - t);
      return value;
    });
    // deferred work the call scheduled (post-commit publications, reconcile, prewarm) runs on the
    // same main thread; keep ticking for TAIL_MS after it returns and report that block separately
    const blockDuringCall = maxBlock;
    maxBlock = 0;
    if (!profileOps.has(String(opIndex - 1))) await new Promise((r) => setTimeout(r, TAIL_MS));
    running = false;
    await new Promise((r) => setTimeout(r, 5));
    const tailBlock = Math.max(maxBlock, performance.now() - last - 5);
    return { kind, wallMs, maxBlockMs: Math.round(Math.max(blockDuringCall, tailBlock)), tailBlockMs: Math.round(tailBlock), result };
  }

  const ops = [];
  const hidden = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    workerWrites();
    evict();
    await new Promise((r) => setTimeout(r, 20));
    global.gc?.();
    const runId = randomUUID();
    const requestSessionId = `model-run-${randomUUID()}`;
    // agent-command: modelRun with internal session effects creates this cleanup up front and tracks
    // every hidden binding; it runs after the turn (createInternalSessionEffectsCleanup)
    const cleanupErrors = [];
    const cleanup = createInternalSessionEffectsCleanup({ enabled: true, agentId: AGENT, runId, storePath, onError: (error) => cleanupErrors.push(error) });
    // agent-command: source = the request's own session (CLI: agent:<id>:explicit:model-run-<uuid>)
    const created = await measure("create", () => prepareInternalSessionEffectsSession({
      agentId: AGENT,
      cwd: stateDir,
      runId,
      source: { agentId: AGENT, sessionId: requestSessionId, sessionKey: `agent:${AGENT}:explicit:${requestSessionId}`, storePath },
      storePath,
    }));
    const target = created.result;
    cleanup.track(target);
    assert(target?.sessionKey?.startsWith(`agent:${AGENT}:internal-session-effects:`), `unexpected hidden key ${target?.sessionKey}`);
    hidden.push(target.sessionId);
    // the turn: one user prompt and one reply
    for (const [role, text] of [["user", "只回复两个字：收到"], ["assistant", "收到"]]) {
      await appendTranscriptMessage({ agentId: AGENT, sessionId: target.sessionId, sessionKey: target.sessionKey, storePath }, { message: { role, content: [{ type: "text", text }], timestamp: Date.now() } });
    }
    workerWrites();
    await new Promise((r) => setTimeout(r, 20));
    const removed = await measure("remove", () => cleanup.cleanup());
    assert.deepEqual(cleanupErrors, [], `cleanup failed: ${cleanupErrors.map(String).join("; ")}`);
    ops.push({ kind: created.kind, wallMs: created.wallMs, maxBlockMs: created.maxBlockMs, tailBlockMs: created.tailBlockMs }, { kind: removed.kind, wallMs: removed.wallMs, maxBlockMs: removed.maxBlockMs, tailBlockMs: removed.tailBlockMs });
    console.error(`[modelrun-ab child ${process.env.AB_ARM}] #${i} create ${created.wallMs}/${created.maxBlockMs} (tail ${created.tailBlockMs}) ms, remove ${removed.wallMs}/${removed.maxBlockMs} (tail ${removed.tailBlockMs}) ms`);
  }
  other.close();
  const db = new DatabaseSync(dbFile, { readOnly: true });
  const ph = hidden.map(() => "?").join(",");
  const leftovers = db.prepare(`SELECT (SELECT count(*) FROM session_nodes WHERE session_key LIKE 'agent:${AGENT}:internal-session-effects:%' OR current_session_id IN (${ph})) + (SELECT count(*) FROM session_windows WHERE session_id IN (${ph})) + (SELECT count(*) FROM transcript_events WHERE session_id IN (${ph})) AS n`).get(...hidden, ...hidden, ...hidden).n;
  db.close();
  console.log(JSON.stringify({ ops, leftovers }));
}
