// workboard-sweep-bounded A/B on copies of V's Workboard and session data (see lab/workboard-sweep-bounded.md).
//
// Data (read-only export from V, kept outside the repository; FIXTURE_DIR on the VLab host):
//   workboard.sqlite   V's Workboard database (.backup)
//   <agent>.sqlite     session_nodes / session_windows / session_participants /
//                      session_transcript_index_state / session_progress_cards of five agents
//   state.sqlite       subagent_runs
//   meta.txt           export_at_ms (the clock both arms run at)
//
// The plan installs the release files into the candidate dist. V's bytes are rebuilt here from the
// release files (unpatch, sha256 = the plan's `before`) and loaded side by side under other names.
//
// Part W, Workboard: the native lifecycle region of each arm's extensions/workboard/index.js (the
// prior harness's technique) with each arm's WorkboardStore over its own copy of V's database. Every
// scenario runs on both arms with the same session snapshots and clock; the resulting cards (new event
// ids excluded) must be identical, as must the number of lifecycle syncs that changed a card.
// Part S, sessions.list: V's listSessionsFromStoreAsync over the whole store vs the release's
// listSessionLifecycleRowsFromStore over the bounded store, compared on the fields the sweep and the
// active-run flags read.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { Session } from "node:inspector/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { FILES, sha256 } from "../patch-workboard-sweep-bounded.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/wsb-20261026";
const WORK_DIR = process.env.WORK_DIR ?? path.join(FIXTURE_DIR, `run-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const PARTS = (process.env.PARTS ?? "W,S").split(",");
const REPEAT = Number(process.env.REPEAT ?? 3);
const AGENTS = ["makaron", "v-codex", "xiaoai", "dealclaw", "short-v"];
const REL = "lab/release-files/workboard-sweep-bounded";
const out = {};
const log = (key, value) => {
  out[key] = value;
  console.error(`[${new Date(realNow()).toISOString()}] ${key}: ${JSON.stringify(value)}`);
};
const realNow = Date.now.bind(Date);
const meta = Object.fromEntries(fs.readFileSync(path.join(FIXTURE_DIR, "meta.txt"), "utf8").trim().split("\n").map((line) => line.split("=")));
const EXPORT_AT = Number(meta.export_at_ms);
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const round = (ms) => Math.round(ms * 10) / 10;
let rngState = 0x2f6e2b1;
const rng = () => { rngState = (rngState * 1103515245 + 12345) >>> 0; return rngState / 2 ** 32; };
const pick = (values, n) => { const copy = [...values]; const picked = []; while (picked.length < n && copy.length) picked.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]); return picked; };

// ---- state directory (private) ----
fs.mkdirSync(WORK_DIR, { recursive: true });
if (process.env.KEEP_WORK !== "1") process.on("exit", () => fs.rmSync(WORK_DIR, { recursive: true, force: true }));
const stateDir = path.join(WORK_DIR, "state");
const agentDb = (agentId) => path.join(stateDir, "agents", agentId, "agent", "openclaw-agent.sqlite");
for (const agentId of AGENTS) fs.mkdirSync(path.dirname(agentDb(agentId)), { recursive: true });
{
  const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
  config.session = { ...config.session, maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  for (const id of AGENTS) assert(config.agents?.entries?.[id], `${id} is a configured agent`);
  fs.writeFileSync(path.join(stateDir, "openclaw.json"), JSON.stringify(config, null, 2));
}
process.env.OPENCLAW_STATE_DIR = stateDir;
process.env.OPENCLAW_CONFIG_PATH = path.join(stateDir, "openclaw.json");
process.env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT = stateDir;
process.env.OPENCLAW_HOME = WORK_DIR;

// ---- both arms ----
const plan = JSON.parse(fs.readFileSync("lab/workboard-sweep-bounded.plan.json", "utf8"));
const released = {};
const vBytes = {};
for (const [name, before, , unpatch] of FILES) {
  const file = plan.files.find((f) => f.target === `openclaw/dist/${name}`);
  released[name] = fs.readFileSync(path.join(REL, name), "utf8");
  assert.equal(sha256(released[name]), file.after, `release bytes ${name}`);
  assert.equal(sha256(fs.readFileSync(path.join(DIST, name), "utf8")), file.after, `candidate dist carries the release ${name}`);
  vBytes[name] = unpatch(released[name]);
  assert.equal(sha256(vBytes[name]), before, `V bytes ${name}`);
}
const copies = [];
const place = (name, source) => {
  const file = path.join(DIST, name);
  fs.writeFileSync(file, source);
  copies.push(file);
  return pathToFileURL(file).href;
};
process.on("exit", () => { for (const file of copies) fs.rmSync(file, { force: true }); });

const inspector = new Session();
inspector.connect();
async function measure(fn) {
  global.gc?.();
  await inspector.post("HeapProfiler.startSampling", { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const t = performance.now();
  let value;
  try { value = await fn(); } finally {
    var ms = performance.now() - t;
    var { profile } = await inspector.post("HeapProfiler.stopSampling");
  }
  return { value, ms: round(ms), allocatedMB: round(profile.samples.reduce((sum, s) => sum + s.size, 0) / 1e6) };
}
// Longest stretch the event loop was blocked while fn ran (10 ms ticks).
async function blocked(fn) {
  let previous = performance.now(), max = 0;
  const timer = setInterval(() => { const now = performance.now(); max = Math.max(max, now - previous - 10); previous = now; }, 10);
  await new Promise((resolve) => setTimeout(resolve, 15));
  previous = performance.now();
  try { return { value: await fn(), maxBlockedMs: () => round(max) }; } finally { await new Promise((resolve) => setTimeout(resolve, 15)); clearInterval(timer); }
}

// ---- Part W: Workboard lifecycle reconciliation ----
async function partW() {
  const vSqlite = "sqlite-store-CH-caj1l.WSBV.js";
  const vRuntime = "runtime-api-1CCazqtv.WSBV.js";
  const vRuntimeSource = vBytes["runtime-api-1CCazqtv.js"].replaceAll('"./sqlite-store-CH-caj1l.js"', `"./${vSqlite}"`);
  assert.notEqual(vRuntimeSource, vBytes["runtime-api-1CCazqtv.js"]);
  const arms = {
    before: { sql: await import(place(vSqlite, vBytes["sqlite-store-CH-caj1l.js"])), api: await import(place(vRuntime, vRuntimeSource)), plugin: vBytes["extensions/workboard/index.js"] },
    after: { sql: await import(pathToFileURL(path.join(DIST, "sqlite-store-CH-caj1l.js")).href), api: await import(pathToFileURL(path.join(DIST, "runtime-api-1CCazqtv.js")).href), plugin: released["extensions/workboard/index.js"] },
  };
  const timers = {};
  for (const [name, arm] of Object.entries(arms)) {
    const start = arm.plugin.indexOf("//#region extensions/workboard/src/lifecycle-sync.ts");
    const end = arm.plugin.indexOf("//#endregion", start);
    const deps = {
      resolveGlobalSingleton: (_key, create) => create(),
      isRecord: (x) => !!x && typeof x === "object" && !Array.isArray(x),
      cardSessionKey: arm.api.c, cardRunId: arm.api.s, workboardCardSessionLookupKey: arm.api.a, workboardCardMatchesLifecycleLink: arm.api.i,
      isWorkboardWorktreeCleanupCandidate: arm.api.u, cleanupWorkboardCardWorktree: arm.api.l,
      setTimeout: (fn, ms) => { assert.equal(ms, 60000); timers[name]?.(fn); return { unref() {} }; },
      clearTimeout: () => {},
    };
    arm.lifecycle = new Function(...Object.keys(deps), `${arm.plugin.slice(start, end)}\nreturn { createWorkboardLifecycleService };`)(...Object.values(deps));
  }

  // V's sessions, as readWorkboardLifecycleSessions normalizes them (no active runs in an export).
  const sessions = [];
  for (const agentId of AGENTS) {
    const db = new DatabaseSync(path.join(FIXTURE_DIR, `${agentId}.sqlite`), { readOnly: true });
    for (const row of db.prepare("SELECT session_key AS key, updated_at AS updatedAt, json_extract(entry_json, '$.status') AS status, json_extract(entry_json, '$.abortedLastRun') AS aborted FROM session_nodes").all()) {
      const status = ["running", "done", "failed", "killed", "timeout"].includes(row.status) ? row.status : void 0;
      sessions.push({ key: row.key, updatedAt: row.updatedAt, ...status ? { status } : {}, hasActiveRun: false, ...row.aborted === 1 ? { abortedLastRun: true } : {} });
    }
    db.close();
  }
  const source = new DatabaseSync(path.join(FIXTURE_DIR, "workboard.sqlite"), { readOnly: true });
  // Ids of every child row V's database has; rows a sweep writes (events, comments, notifications) get fresh UUIDs.
  const originalIds = new Set();
  for (const { name } of source.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'workboard_%'").all()) {
    if (source.prepare(`PRAGMA table_info(${name})`).all().some((c) => c.name === "id")) for (const row of source.prepare(`SELECT id FROM ${name}`).all()) originalIds.add(row.id);
  }
  const linked = source.prepare("SELECT id, coalesce(nullif(session_key, ''), nullif(execution_session_key, '')) AS sessionKey, status FROM workboard_cards WHERE NOT (typeof(archived_at) = 'integer' AND archived_at <> 0) AND coalesce(nullif(session_key, ''), nullif(execution_session_key, '')) IS NOT NULL").all();
  const cardCounts = source.prepare("SELECT count(*) AS total, sum(NOT (typeof(archived_at) = 'integer' AND archived_at <> 0)) AS unarchived FROM workboard_cards").get();
  source.close();
  const sessionByKey = new Map(sessions.map((s) => [s.key, s]));
  const linkedWithSession = linked.filter((card) => sessionByKey.has(card.sessionKey));
  log("W.data", { cards: cardCounts, linkedUnarchived: linked.length, linkedWithSession: linkedWithSession.length, sessions: sessions.length, exportAt: EXPORT_AT });

  // Session snapshots: V's, and V's with linked sessions moved to every lifecycle observation.
  const perturb = (seed, n) => {
    rngState = seed;
    const changed = new Map();
    for (const card of pick(linkedWithSession, n)) {
      const base = sessionByKey.get(card.sessionKey);
      const roll = rng();
      const at = EXPORT_AT - Math.floor(rng() * 120000);
      changed.set(base.key, roll < 0.18 ? { ...base, status: "running", hasActiveRun: true, updatedAt: at }
        : roll < 0.36 ? { ...base, status: "running", hasActiveRun: false, updatedAt: EXPORT_AT - 40 * 60000 }
        : roll < 0.54 ? { ...base, status: "failed", updatedAt: at }
        : roll < 0.72 ? { ...base, status: "done", updatedAt: at }
        : roll < 0.86 ? { ...base, abortedLastRun: true, updatedAt: at }
        : { key: base.key, updatedAt: at, hasActiveRun: false });
    }
    const dropped = new Set(pick([...sessionByKey.keys()].filter((k) => !changed.has(k)), 40));
    return sessions.filter((s) => !dropped.has(s.key)).map((s) => changed.get(s.key) ?? s);
  };
  const recent = (snapshot, n, seed) => { rngState = seed; return pick(snapshot.filter((s) => linkedWithSession.some((c) => c.sessionKey === s.key)), n).map((s) => ({ ...s, updatedAt: EXPORT_AT - 5000 })); };

  const open = (name, file) => {
    const stores = arms[name].sql.t({ dbPath: file });
    const core = new arms[name].api.r(stores.cards, stores);
    const counts = { entries: 0, get: 0, links: 0, sweepLinks: 0, states: 0, transitions: 0, syncs: 0, changes: 0 };
    const wrap = (target, method, key) => {
      if (typeof target[method] !== "function") return;
      const real = target[method].bind(target);
      target[method] = (...args) => { counts[key] += 1; return real(...args); };
    };
    wrap(stores.cards, "entries", "entries");
    wrap(stores.cards, "listLifecycleStates", "states");
    wrap(stores.cards, "listLifecycleLinks", "links");
    wrap(stores.cards, "listLifecycleSweepLinks", "sweepLinks");
    wrap(stores.cards, "lifecycleStatusTransition", "transitions");
    wrap(core, "get", "get");
    const sync = core.syncLifecycle.bind(core);
    core.syncLifecycle = async (...args) => { counts.syncs += 1; const result = await sync(...args); if (result) counts.changes += 1; return result; };
    return { stores, core, counts };
  };
  // Prepared launches V has none of today: some proven by an active run, some never accepted.
  const prepare = (file, snapshotKeys) => {
    const db = new DatabaseSync(file);
    const rows = db.prepare("SELECT id, session_key, run_id, execution_session_key, execution_run_id, automation_json FROM workboard_cards WHERE NOT (typeof(archived_at) = 'integer' AND archived_at <> 0) AND status IN ('ready', 'todo') AND session_key IS NOT NULL AND run_id IS NOT NULL AND session_key = execution_session_key AND run_id = execution_run_id ORDER BY id LIMIT 8").all();
    for (const [i, row] of rows.entries()) {
      const automation = { ...JSON.parse(row.automation_json ?? "{}"), launch: { phase: "prepared", requestedSessionKey: row.session_key, provisionalRunId: row.run_id, preparedAt: EXPORT_AT - 60000 } };
      db.prepare("UPDATE workboard_cards SET automation_json = ? WHERE id = ?").run(JSON.stringify(automation), row.id);
      if (i % 2 === 0) snapshotKeys.add(row.session_key);
    }
    db.close();
    return rows.length;
  };

  // The narrow reads against the full ones, on every V card, on the fields the sweep reads.
  {
    const file = path.join(WORK_DIR, "wb-projection.sqlite");
    fs.copyFileSync(path.join(FIXTURE_DIR, "workboard.sqlite"), file);
    const { stores, core } = open("after", file);
    const auto = (a) => a && typeof a === "object" && !Array.isArray(a) ? Object.fromEntries(["boardId", "launch", "workspace"].filter((k) => k in a).map((k) => [k, a[k]])) : a;
    const linkView = (l) => ({ id: l.id, agentId: l.agentId, sessionKey: l.sessionKey, runId: l.runId, execution: l.execution, archivedAt: l.metadata?.archivedAt, automation: auto(l.metadata?.automation) });
    const t1 = performance.now();
    const full = await stores.cards.listLifecycleLinks();
    const t2 = performance.now();
    const narrow = await stores.cards.listLifecycleSweepLinks();
    const t3 = performance.now();
    assert.deepEqual(narrow.map(linkView), full.map(linkView), "sweep links differ from lifecycle links");
    const stateView = (c) => ({ id: c.id, status: c.status, position: c.position, createdAt: c.createdAt, updatedAt: c.updatedAt, startedAt: c.startedAt, agentId: c.agentId, sessionKey: c.sessionKey, runId: c.runId, execution: c.execution,
      archivedAt: c.metadata?.archivedAt, claim: c.metadata?.claim, stale: c.metadata?.stale, lifecycleStatusSourceUpdatedAt: c.metadata?.lifecycleStatusSourceUpdatedAt, automation: auto(c.metadata?.automation) });
    const t4 = performance.now();
    const cards = (await core.list()).filter((c) => !c.metadata?.archivedAt);
    const t5 = performance.now();
    const states = await core.listLifecycleStates();
    const t6 = performance.now();
    assert.deepEqual(states.map(stateView), cards.map(stateView), "lifecycle states differ from cards");
    log("W.projection", { links: full.length, states: states.length, linksMs: round(t2 - t1), sweepLinksMs: round(t3 - t2), listMs: round(t5 - t4), statesMs: round(t6 - t5) });
    stores.close();
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
  }

  // One service per scenario; `sweeps` lists the session snapshot each reconcile reads (the first is full).
  async function run(name, file, sweeps) {
    const handle = open(name, file);
    const warnings = [];
    let next;
    const service = arms[name].lifecycle.createWorkboardLifecycleService({
      store: handle.core,
      readSessions: async (options) => {
        const snapshot = sweeps[calls.length];
        calls.push(options);
        return { sessions: snapshot, complete: !options.activeMinutes && snapshot.length < 1e4, listed: true };
      },
      now: () => EXPORT_AT,
    });
    const calls = [];
    const perSweep = [];
    Date.now = () => EXPORT_AT;
    try {
      for (let i = 0; i < sweeps.length; i += 1) {
        const before = { ...handle.counts };
        const done = new Promise((resolve) => { timers[name] = (fn) => { next = fn; resolve(); }; });
        const watched = await blocked(async () => {
          const t = performance.now();
          if (i === 0) { service.start({ logger: { warn: (m) => warnings.push(m) } }); service.onGatewayStart(); } else next();
          await done;
          return performance.now() - t;
        });
        perSweep.push({ ms: round(watched.value), maxBlockedMs: watched.maxBlockedMs(), ...Object.fromEntries(Object.entries(handle.counts).map(([k, v]) => [k, v - before[k]])) });
      }
      service.stop();
      assert.deepEqual(warnings, [], `${name}: lifecycle service warned`);
      assert.equal(calls[0].activeMinutes, void 0, "first sweep is full");
      for (const options of calls.slice(1)) assert.equal(options.activeMinutes, 1, "later sweeps are partial");
      const cards = await handle.core.list();
      const strip = (value) => Array.isArray(value) ? value.map(strip) : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).filter(([k, v]) => !(k === "id" && typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/u.test(v) && !originalIds.has(v))).map(([k, v]) => [k, strip(v)]))
        : value;
      const stripped = strip(cards);
      return { perSweep, fingerprint: digest(stripped), cards: cards.length, stripped };
    } finally {
      Date.now = realNow;
      handle.stores.close();
    }
  }
  const steady = sessions;
  const scenarios = [
    { name: "V snapshot: full, then 3 settled full sweeps", sweeps: [steady, steady, steady, steady], allFull: true },
    ...[11, 23, 37].map((seed) => ({ name: `perturbed ${seed}: full, then settled`, sweeps: [perturb(seed, 600), perturb(seed, 600)], allFull: true })),
    { name: "prepared launches: full", sweeps: [steady], prepared: true },
    { name: "partial > 64 matches", sweeps: [steady, recent(perturb(47, 600), 200, 5)] },
    { name: "partial <= 64 matches", sweeps: [steady, recent(perturb(53, 600), 30, 7)] },
  ];
  const results = [];
  const only = process.env.SCENARIOS ? new RegExp(process.env.SCENARIOS, "u") : void 0;
  for (const scenario of scenarios.filter((x) => !only || only.test(x.name))) {
    const pair = {};
    for (const name of results.length % 2 ? ["after", "before"] : ["before", "after"]) {
      const file = path.join(WORK_DIR, `wb-${name}.sqlite`);
      fs.copyFileSync(path.join(FIXTURE_DIR, "workboard.sqlite"), file);
      let sweeps = scenario.sweeps;
      if (scenario.prepared) {
        const keys = new Set();
        const n = prepare(file, keys);
        // Linked sessions only (< 10,000 rows), so the snapshot is complete and unaccepted launches fail.
        const linkedKeys = new Set(linkedWithSession.map((c) => c.sessionKey));
        sweeps = [steady.filter((s) => linkedKeys.has(s.key) && !keys.has(s.key)).concat([...keys].map((key) => ({ key, updatedAt: EXPORT_AT, hasActiveRun: true, status: "running" })))];
        pair.prepared = n;
      }
      // Partial sweeps between full ones: the service's own cadence keys full sweeps off wall time,
      // which is frozen, so a second reconcile is partial unless forced; the all-full scenarios re-run
      // a fresh service per sweep instead.
      if (scenario.allFull) {
        const perSweep = [];
        let last;
        for (const snapshot of sweeps) { last = await run(name, file, [snapshot]); perSweep.push(...last.perSweep); }
        pair[name] = { ...last, perSweep };
      } else pair[name] = await run(name, file, sweeps);
      for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
    }
    if (pair.after.fingerprint !== pair.before.fingerprint) {
      const byId = new Map(pair.before.stripped.map((c) => [c.id, c]));
      const differing = pair.after.stripped.filter((c) => JSON.stringify(c) !== JSON.stringify(byId.get(c.id)));
      const keys = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
      log(`W.${scenario.name}.diff`, { count: differing.length, orderSame: JSON.stringify(pair.after.stripped.map((c) => c.id)) === JSON.stringify(pair.before.stripped.map((c) => c.id)),
        cards: differing.slice(0, 3).map((c) => { const b = byId.get(c.id); return { id: c.id, fields: keys(c, b), metadata: keys(c.metadata, b?.metadata) }; }) });
    }
    for (const arm of ["before", "after"]) delete pair[arm].stripped;
    assert.equal(pair.after.fingerprint, pair.before.fingerprint, `${scenario.name}: cards differ`);
    assert.deepEqual(pair.after.perSweep.map((s) => s.changes), pair.before.perSweep.map((s) => s.changes), `${scenario.name}: changed-card counts differ`);
    results.push({ scenario: scenario.name, cards: pair.after.cards, prepared: pair.prepared, before: pair.before.perSweep, after: pair.after.perSweep });
    log(`W.${scenario.name}`, results.at(-1));
  }
  return results;
}

// ---- Part S: sessions.list rows for the sweep ----
async function partS() {
  const { g: openOpenClawAgentDatabase, a: closeOpenClawAgentDatabases } = await import(pathToFileURL(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js")).href);
  const { i: openOpenClawStateDatabase } = await import(pathToFileURL(path.join(DIST, "openclaw-state-db-Bh3Bq87y.js")).href);
  const t0 = performance.now();
  for (const agentId of AGENTS) openOpenClawAgentDatabase({ agentId });
  closeOpenClawAgentDatabases();
  const counts = {};
  for (const agentId of AGENTS) {
    const db = new DatabaseSync(agentDb(agentId));
    db.exec("PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 30000;");
    db.exec(`ATTACH '${path.join(FIXTURE_DIR, `${agentId}.sqlite`)}' AS v`);
    const copy = (table) => {
      const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
      const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
      const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
      db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
      return db.prepare(`SELECT count(*) AS n FROM main.${table}`).get().n;
    };
    db.exec("BEGIN");
    counts[agentId] = Object.fromEntries(["session_nodes", "session_windows", "session_participants", "session_transcript_index_state", "session_progress_cards"].map((table) => [table, copy(table)]));
    db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key)");
    db.exec("UPDATE main.session_windows SET primary_conversation_id = NULL");
    db.exec("COMMIT");
    db.exec("DETACH v");
    db.close();
  }
  {
    openOpenClawStateDatabase();
    const db = new DatabaseSync(path.join(stateDir, "state", "openclaw.sqlite"));
    db.exec(`PRAGMA busy_timeout = 30000; ATTACH '${path.join(FIXTURE_DIR, "state.sqlite")}' AS v`);
    const cols = db.prepare("PRAGMA main.table_info(subagent_runs)").all().map((c) => c.name);
    const src = new Set(db.prepare("PRAGMA v.table_info(subagent_runs)").all().map((c) => c.name));
    const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
    db.exec(`DELETE FROM main.subagent_runs; INSERT INTO main.subagent_runs (${shared}) SELECT ${shared} FROM v.subagent_runs`);
    counts.subagent_runs = db.prepare("SELECT count(*) AS n FROM main.subagent_runs").get().n;
    db.exec("DETACH v");
    db.close();
  }
  log("S.fixture", { counts, ms: Math.round(performance.now() - t0) });

  const { n: getRuntimeConfig } = await import(pathToFileURL(path.join(DIST, "io.runtime-CKu7Rw0j.js")).href);
  const cfg = getRuntimeConfig();
  const { n: loadCombined } = await import(pathToFileURL(path.join(DIST, "combined-store-gateway-BwDhjbIt.js")).href);
  const before = await import(place("session-utils-list-BUP03AzS.WSBV.js", vBytes["session-utils-list-BUP03AzS.js"]));
  const after = await import(pathToFileURL(path.join(DIST, "session-utils-list-BUP03AzS.js")).href);
  assert.equal(typeof before.listSessionLifecycleRowsFromStore, "undefined");
  const SWEEP = { limit: 1e4, configuredAgentsOnly: true, lifecycleOnly: true, includeGlobal: false, includeUnknown: false };
  // What readWorkboardLifecycleSessions and the active-run flags read from a row.
  const project = (s) => JSON.stringify([s.key, s.updatedAt ?? null, s.status ?? null, s.abortedLastRun === true, s.sessionId ?? null, s.agentId ?? null]);
  // On V the whole-store entry cache never lasts a minute (any write from another connection moves
  // data_version), so each measured call follows a write from another connection.
  const tick = () => { for (const agentId of AGENTS) { const db = new DatabaseSync(agentDb(agentId)); db.exec("PRAGMA busy_timeout = 30000; CREATE TABLE IF NOT EXISTS wsb_tick (n INTEGER); INSERT INTO wsb_tick VALUES (1)"); db.close(); } };
  const load = (match) => loadCombined(cfg, { configuredAgentsOnly: true, projection: "list", ...match ? { match } : {} });
  const rowsArgs = (loaded, opts) => ({ cfg, durableStorePath: loaded.durableStorePath, storePath: loaded.storePath, store: loaded.store, modelCatalog: new Map(), opts });
  const cases = [{ name: "full sweep" }, ...[1, 2, 3, 5, 10, 30, 60, 180, 600, 1440, 10080, 43200].map((m) => ({ name: `activeMinutes ${m}`, activeMinutes: m })), { name: "activeMinutes 2, clock +90 s", activeMinutes: 2, offset: 90000 }];
  const results = [];
  for (const c of cases) {
    Date.now = () => EXPORT_AT + (c.offset ?? 0);
    try {
      const opts = { ...SWEEP, ...c.activeMinutes ? { activeMinutes: c.activeMinutes } : {} };
      const runs = { before: [], after: [] };
      let a, b;
      for (let i = 0; i < REPEAT; i += 1) for (const name of i % 2 ? ["after", "before"] : ["before", "after"]) {
        tick();
        const m = await measure(async () => {
          if (name === "before") { const loaded = load(); return (await before.n(rowsArgs(loaded, opts))).sessions; }
          const since = c.activeMinutes ? Date.now() - (Math.max(1, Math.floor(c.activeMinutes)) + 1) * 6e4 : void 0;
          const loaded = load(since === void 0 ? void 0 : { updatedSince: since });
          return after.listSessionLifecycleRowsFromStore(rowsArgs(loaded, opts)).sessions;
        });
        runs[name].push({ ms: m.ms, allocatedMB: m.allocatedMB });
        if (name === "before") a = m.value.map(project); else b = m.value.map(project);
      }
      assert.deepEqual(b, a, `${c.name}: rows differ`);
      const med = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
      results.push({ case: c.name, rows: a.length, withStatus: a.filter((r) => JSON.parse(r)[2] !== null).length,
        before: { msMedian: med(runs.before.map((r) => r.ms)), allocatedMB: med(runs.before.map((r) => r.allocatedMB)) },
        after: { msMedian: med(runs.after.map((r) => r.ms)), allocatedMB: med(runs.after.map((r) => r.allocatedMB)) } });
      log(`S.${c.name}`, results.at(-1));
    } finally { Date.now = realNow; }
  }
  return results;
}

try {
  if (PARTS.includes("W")) out.W = await partW();
  if (PARTS.includes("S")) out.S = await partS();
  console.log(JSON.stringify({ ok: true, ...out }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: String(error?.stack ?? error).slice(0, 4000), ...out }));
  process.exitCode = 1;
}
