// session-reference-index A/B on a V-scale makaron store (lab/candidate/v-scale-session-fixture.mjs).
//
// One fixture, three copies, one child process per arm:
//   A  V's bytes (the runtime as cached; must match the plan's `before`)
//   B  the release files (session-reference-index-v1)
//   C  the release files with OPENCLAW_V_SESSION_REFERENCE_INDEX=0 (rollback switch)
// Each arm runs the same operations in the same order:
//   - Gateway sessions.delete as session-reset-service issues it (archiveTranscript false,
//     deleteTranscriptWithoutArchive true, deleteDeliveryArtifacts true) for subagent sessions with
//     transcripts; two of them have a window another node references (kept and rehomed);
//   - projected lifecycle removals (applySessionEntryLifecycleMutation, the commitProjectedLifecycleMutation
//     path), whose retained windows are rehomed to referencing nodes or kept;
//   - one projected mutation removing 6 entries in a single transaction (cron.remove on V removed a
//     job's run sessions this way: a 38 s hold on 11/16 19:53);
//   - before every operation, another connection rewrites 100 other rows (worker-style commits), so
//     data_version moves and B must re-validate fingerprints inside its transactions.
// Per operation: wall time and the longest main-thread block (1 ms ticker). After the run: a digest
// of session_nodes (keys, current ids, entry JSON), session_windows ownership and per-window
// transcript counts. All three digests must be equal.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const PLAN = JSON.parse(fs.readFileSync(path.resolve("lab/session-reference-index.plan.json"), "utf8"));
const sha = (v) => createHash("sha256").update(v).digest("hex");
const AGENT = "makaron";
const dbOf = (stateDir) => path.join(stateDir, "agents", AGENT, "agent", "openclaw-agent.sqlite");

if (process.argv[2] === "child") {
  await child(process.argv[3], process.argv[4]);
} else if (process.argv[2] === "canon") {
  await canon(process.argv[3]);
} else {
  await parent();
}

async function parent() {
  const sharedState = process.env.VLAB_SHARED_STATE_DIR;
  assert(sharedState, "shared VLab state is required for the fixture templates");
  for (const file of PLAN.files) {
    assert.equal(sha(fs.readFileSync(path.join(runtime, file.target))), file.before, `runtime is not V's bytes for ${file.target}`);
    assert.equal(sha(fs.readFileSync(path.resolve(file.source))), file.after, `release file hash ${file.source}`);
  }
  const WORK = path.join(process.env.WORK_ROOT ?? "/var/tmp", `session-reference-ab-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
  const originals = new Map(PLAN.files.map((file) => [file.target, fs.readFileSync(path.join(runtime, file.target))]));
  const restore = () => { for (const [target, bytes] of originals) fs.writeFileSync(path.join(runtime, target), bytes); };
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
  // VLab's shared store can hold rows the canonical-key scan rejects (it then refuses every
  // lifecycle write); drop them from the fixture copy so all arms start from a store V would accept.
  const canonRun = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "canon", fixtureState], { env: { ...process.env, OPENCLAW_STATE_DIR: fixtureState, OPENCLAW_DB91_INTEGRITY_STATE_ROOT: fixtureState, OPENCLAW_HOME: fixtureState }, encoding: "utf8" });
  process.stderr.write(canonRun.stderr ?? "");
  assert.equal(canonRun.status, 0, "canonical cleanup failed");
  console.error(`[ref-ab] canonical cleanup: ${canonRun.stdout.trim()}`);
  const scenario = seedScenario(dbOf(fixtureState));
  console.error(`[ref-ab] fixture ${JSON.stringify(fixture)} built in ${Math.round((performance.now() - t0) / 1000)} s`);
  fs.writeFileSync(path.join(WORK, "scenario.json"), JSON.stringify(scenario));

  const arms = (process.env.ARMS ?? "A,B,C").split(",");
  const results = {};
  for (const arm of arms) {
    const state = path.join(WORK, arm);
    fs.mkdirSync(path.dirname(dbOf(state)), { recursive: true });
    fs.copyFileSync(dbOf(fixtureState), dbOf(state));
    restore();
    if (arm !== "A") for (const file of PLAN.files) fs.copyFileSync(path.resolve(file.source), path.join(runtime, file.target));
    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: state,
      OPENCLAW_DB91_INTEGRITY_STATE_ROOT: state,
      OPENCLAW_HOME: state,
      ...(arm === "C" ? { OPENCLAW_V_SESSION_REFERENCE_INDEX: "0" } : {}),
      AB_ARM: arm,
    };
    if (arm !== "C") delete env.OPENCLAW_V_SESSION_REFERENCE_INDEX;
    const run = spawnSync(process.execPath, ["--expose-gc", "--max-old-space-size=7168", new URL(import.meta.url).pathname, "child", state, path.join(WORK, "scenario.json")], { env, encoding: "utf8", maxBuffer: 64 << 20 });
    process.stderr.write(run.stderr ?? "");
    assert.equal(run.status, 0, `arm ${arm} failed`);
    results[arm] = JSON.parse(run.stdout.trim().split("\n").at(-1));
    fs.rmSync(dbOf(state), { force: true });
    for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${dbOf(state)}${suffix}`, { force: true });
  }
  restore();

  const table = Object.fromEntries(Object.entries(results).map(([arm, r]) => [arm, r.ops.map((op) => `${op.kind}:${op.wallMs}/${op.maxBlockMs}`).join(" ")]));
  console.log(JSON.stringify({ fixture, scenario: { deletes: scenario.deletes.length, removals: scenario.removals.length, batch: scenario.batch.length }, table, results }, null, 1));
  const digests = Object.fromEntries(Object.entries(results).map(([arm, r]) => [arm, r.digest]));
  for (const arm of arms.slice(1)) assert.deepEqual(digests[arm], digests[arms[0]], `arm ${arm} ended with different data than ${arms[0]}`);
  const worst = (arm, from = 0) => (results[arm] ? Math.max(...results[arm].ops.slice(from).map((op) => op.maxBlockMs)) : "n/a");
  console.log(`PASS session-reference-index: max main-thread block per operation A(V) ${worst("A")} ms, B(release) ${worst("B")} ms (after the first: ${worst("B", 1)} ms), C(switch off) ${worst("C")} ms; data identical across ${arms.join("/")}`);
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
      console.log(JSON.stringify({ removed }));
      return;
    } catch (error) {
      const key = /repair for (.+?); stop the Gateway/u.exec(String(error?.message))?.[1];
      assert(key, `unexpected canonical scan failure: ${error?.message}`);
      raw.prepare("DELETE FROM session_nodes WHERE session_key = ?").run(key);
      removed.push(key.replace(/:[^:]*$/u, ":…"));
    }
  }
  throw new Error("canonical cleanup did not converge");
}

function seedScenario(file) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 30000;");
  const subagents = db.prepare("SELECT session_key, current_session_id FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:%' AND current_session_id IN (SELECT session_id FROM session_windows) ORDER BY session_key LIMIT 18").all();
  assert.equal(subagents.length, 18, "not enough subagent rows with windows in the fixture");
  const deletes = subagents.slice(0, 8);
  const removals = subagents.slice(8, 12);
  const batch = subagents.slice(12, 18);
  const insEvent = db.prepare("INSERT OR IGNORE INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)");
  const insWindow = db.prepare("INSERT INTO session_windows (session_id, session_key, reason, created_at, updated_at) VALUES (?, ?, 'reset', ?, ?)");
  const insNode = db.prepare("INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at, entry_valid) VALUES (?, ?, ?, ?, 1)");
  const now = Date.now();
  const transcript = (sessionId, n = 20) => {
    insEvent.run(sessionId, 0, JSON.stringify({ type: "session", version: 3, id: sessionId }), now - 86400e3);
    for (let seq = 1; seq < n; seq += 1) insEvent.run(sessionId, seq, JSON.stringify({ type: "message", id: `m${seq}`, message: { role: seq % 2 ? "user" : "assistant", content: [{ type: "text", text: "y".repeat(800) }] } }), now - 86400e3 + seq);
  };
  const survivor = (entryExtra) => {
    const sessionKey = `agent:makaron:subagent:${randomUUID()}`;
    const sessionId = randomUUID();
    const updatedAt = now - 3600e3;
    insNode.run(sessionKey, sessionId, JSON.stringify({ sessionId, updatedAt, label: "ab-survivor", ...entryExtra }), updatedAt);
    insWindow.run(sessionId, sessionKey, updatedAt, updatedAt);
    return sessionKey;
  };
  db.exec("BEGIN");
  const referenced = [];
  for (const [i, row] of deletes.entries()) {
    transcript(row.current_session_id);
    // a historical window per deletion; two of them are referenced by another node
    const historical = randomUUID();
    insWindow.run(historical, row.session_key, now - 2 * 86400e3, now - 2 * 86400e3);
    transcript(historical, 10);
    if (i < 2) referenced.push({ sessionKey: row.session_key, window: historical, by: survivor({ previousSessionId: historical }) });
  }
  for (const [i, row] of removals.entries()) {
    transcript(row.current_session_id);
    const historical = randomUUID();
    insWindow.run(historical, row.session_key, now - 2 * 86400e3, now - 2 * 86400e3);
    transcript(historical, 10);
    if (i < 2) referenced.push({ sessionKey: row.session_key, window: historical, by: survivor({ usageFamilySessionIds: [historical] }) });
  }
  for (const [i, row] of batch.entries()) {
    transcript(row.current_session_id, 5);
    const historical = randomUUID();
    insWindow.run(historical, row.session_key, now - 2 * 86400e3, now - 2 * 86400e3);
    transcript(historical, 5);
    if (i === 0) referenced.push({ sessionKey: row.session_key, window: historical, by: survivor({ previousSessionId: historical }) });
  }
  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  return { deletes: deletes.map((r) => r.session_key), removals: removals.map((r) => r.session_key), batch: batch.map((r) => r.session_key), referenced };
}

async function child(stateDir, scenarioPath) {
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
  const file = (name) => path.join(DIST, name);
  const lifecycle = await import(file("session-accessor.sqlite-lifecycle-dtL0ZEAl.js"));
  const accessor = await import(file("session-accessor-K0XuW6ln.js"));
  const entryStore = await import(file("session-accessor.sqlite-entry-store-VfW3gyuj.js"));
  const { g: openOpenClawAgentDatabase } = await import(file("openclaw-agent-db-CUTe8BX6.js"));
  const deleteSessionEntryLifecycle = lifecycle.n;
  const applySessionEntryLifecycleMutation = accessor.It;
  const readExactSessionEntryRow = entryStore.l;
  assert.equal(typeof deleteSessionEntryLifecycle, "function");
  assert.equal(typeof applySessionEntryLifecycleMutation, "function");
  const storePath = path.join(stateDir, "agents", AGENT, "sessions", "sessions.json");
  const database = () => openOpenClawAgentDatabase({ agentId: AGENT });
  // the canonical-key scan runs once per connection (on V at Gateway start); take it before measuring
  const { p: assertCanonicalSqliteSessionKeysCurrent } = await import(file("session-accessor.sqlite-transcript-state-Cz9g7S9v.js"));
  assertCanonicalSqliteSessionKeysCurrent(database());
  readExactSessionEntryRow(database(), scenario.deletes[0]);

  const other = new DatabaseSync(dbOf(stateDir));
  other.exec("PRAGMA busy_timeout = 30000");
  const protectedKeys = new Set([...scenario.deletes, ...scenario.removals, ...scenario.batch, ...scenario.referenced.map((r) => r.by)]);
  const candidates = other.prepare("SELECT rowid AS r, session_key AS k FROM session_nodes WHERE entry_valid = 1 ORDER BY rowid").all().filter((row) => !protectedKeys.has(row.k)).map((row) => row.r);
  let workerRound = 0;
  const workerWrites = () => {
    const rows = candidates.slice(workerRound * 100, workerRound * 100 + 100);
    workerRound += 1;
    other.exec("BEGIN IMMEDIATE");
    // as writeSessionEntry does: write the row, then settle entry_valid (the schema trigger clears it)
    const update = other.prepare("UPDATE session_nodes SET updated_at = updated_at + 1, entry_json = json_set(entry_json, '$.updatedAt', updated_at + 1) WHERE rowid = ?");
    const settle = other.prepare("UPDATE session_nodes SET entry_valid = 1 WHERE rowid = ?");
    for (const r of rows) {
      update.run(r);
      settle.run(r);
    }
    other.exec("COMMIT");
  };

  const { Session } = await import("node:inspector/promises");
  const profileOps = new Set(process.env.AB_ARM === (process.env.PROFILE_ARM ?? "B") ? (process.env.PROFILE_OPS ?? "").split(",").filter(Boolean) : []);
  let opIndex = 0;
  async function profiled(fn) {
    const label = String(opIndex++);
    if (!profileOps.has(label)) return { value: await fn() };
    const inspector = new Session();
    inspector.connect();
    await inspector.post("Profiler.enable");
    await inspector.post("Profiler.setSamplingInterval", { interval: 500 });
    await inspector.post("Profiler.start");
    const value = await fn();
    const { profile } = await inspector.post("Profiler.stop");
    inspector.disconnect();
    // self time per function (dist file:line), top 12
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map();
    const dt = profile.timeDeltas;
    profile.samples.forEach((id, i) => {
      const n = byId.get(id);
      const f = n.callFrame;
      const key = `${f.functionName || "(anon)"} ${path.basename(f.url || "")}:${f.lineNumber + 1}`;
      self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
    });
    const top = [...self].filter(([k]) => !k.startsWith("(idle)") && !k.startsWith("(program)")).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, ms]) => `${Math.round(ms)}ms ${k}`);
    console.error(`[ref-ab child] profile op ${label}: ${JSON.stringify(top)}`);
    return { value };
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
    const result = (await profiled(fn)).value;
    const wallMs = Math.round(performance.now() - t);
    running = false;
    await new Promise((r) => setTimeout(r, 5));
    maxBlock = Math.max(maxBlock, performance.now() - last - 5);
    return { kind, wallMs, maxBlockMs: Math.round(maxBlock), result };
  }

  const ops = [];
  for (const sessionKey of scenario.deletes) {
    workerWrites();
    await new Promise((r) => setTimeout(r, 20));
    global.gc?.();
    const entry = readExactSessionEntryRow(database(), sessionKey)?.entry;
    assert(entry, `missing ${sessionKey}`);
    const op = await measure("delete", () => deleteSessionEntryLifecycle({
      agentId: AGENT,
      archiveTranscript: false,
      deleteDeliveryArtifacts: true,
      deleteTranscriptWithoutArchive: true,
      expectedEntry: entry,
      expectedSessionId: entry.sessionId,
      expectedUpdatedAt: entry.updatedAt,
      storePath,
      target: { canonicalKey: sessionKey, storeKeys: [sessionKey] },
    }));
    assert.equal(op.result.deleted, true, `delete ${sessionKey}: ${JSON.stringify(op.result).slice(0, 300)}`);
    ops.push({ kind: op.kind, wallMs: op.wallMs, maxBlockMs: op.maxBlockMs });
    console.error(`[ref-ab child] delete ${op.wallMs} ms, longest block ${op.maxBlockMs} ms`);
  }
  for (const sessionKey of scenario.removals) {
    workerWrites();
    await new Promise((r) => setTimeout(r, 20));
    global.gc?.();
    const entry = readExactSessionEntryRow(database(), sessionKey)?.entry;
    assert(entry, `missing ${sessionKey}`);
    const op = await measure("remove", () => applySessionEntryLifecycleMutation({
      agentId: AGENT,
      storePath,
      removals: [{ sessionKey, expectedEntry: entry }],
      skipMaintenance: true,
    }));
    ops.push({ kind: op.kind, wallMs: op.wallMs, maxBlockMs: op.maxBlockMs });
    console.error(`[ref-ab child] remove ${op.wallMs} ms, longest block ${op.maxBlockMs} ms`);
  }
  {
    workerWrites();
    await new Promise((r) => setTimeout(r, 20));
    global.gc?.();
    const removals = scenario.batch.map((sessionKey) => {
      const entry = readExactSessionEntryRow(database(), sessionKey)?.entry;
      assert(entry, `missing ${sessionKey}`);
      return { sessionKey, expectedEntry: entry };
    });
    const op = await measure("batch6", () => applySessionEntryLifecycleMutation({ agentId: AGENT, storePath, removals, skipMaintenance: true }));
    ops.push({ kind: op.kind, wallMs: op.wallMs, maxBlockMs: op.maxBlockMs });
    console.error(`[ref-ab child] batch of ${removals.length} removals ${op.wallMs} ms, longest block ${op.maxBlockMs} ms`);
  }
  other.close();

  // data digest
  const db = new DatabaseSync(dbOf(stateDir), { readOnly: true });
  const hash = createHash("sha256");
  let nodes = 0;
  for (const row of db.prepare("SELECT session_key, current_session_id, updated_at, entry_json FROM session_nodes ORDER BY session_key").iterate()) {
    hash.update(`${row.session_key}\u0000${row.current_session_id}\u0000${row.updated_at}\u0000${row.entry_json}\u0001`);
    nodes += 1;
  }
  const nodesDigest = hash.digest("hex");
  const windowsHash = createHash("sha256");
  let windows = 0;
  for (const row of db.prepare("SELECT w.session_id, w.session_key, (SELECT count(*) FROM transcript_events e WHERE e.session_id = w.session_id) AS events FROM session_windows w ORDER BY w.session_id").iterate()) {
    windowsHash.update(`${row.session_id}\u0000${row.session_key}\u0000${row.events}\u0001`);
    windows += 1;
  }
  const events = db.prepare("SELECT count(*) AS n FROM transcript_events").get().n;
  const referenced = scenario.referenced.map((r) => {
    const owner = db.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(r.window)?.session_key ?? null;
    return { window: r.window.slice(0, 8), owner: owner === r.by ? "survivor" : owner === r.sessionKey ? "original" : owner, events: db.prepare("SELECT count(*) AS n FROM transcript_events WHERE session_id = ?").get(r.window).n };
  });
  const targets = [...scenario.deletes, ...scenario.removals, ...scenario.batch];
  const remaining = db.prepare(`SELECT count(*) AS n FROM session_nodes WHERE session_key IN (${targets.map(() => "?").join(",")}) AND entry_valid = 1`).get(...targets).n;
  db.close();
  console.log(JSON.stringify({ ops, digest: { nodes, nodesDigest, windows, windowsDigest: windowsHash.digest("hex"), events, referenced, remainingTargets: remaining } }));
}
