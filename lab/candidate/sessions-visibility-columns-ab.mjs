// sessions-visibility-columns A/B: sessions.list visibilityRowsOnly from promoted columns (B) against the list
// projection (A: V's bytes; B0: release files with OPENCLAW_V_SESSIONS_VISIBILITY_COLUMNS=0), on a V-scale
// makaron store. See lab/release-files/sessions-visibility-columns/README.md.
//
// Fixture (private copy, nothing from V): the shared VLab makaron schema and metadata inflated to V's node count
// by lab/candidate/v-scale-session-fixture.mjs (cloned subagent rows with V-sized entry JSON), plus edge rows
// written by OpenClaw's own writer (V's bytes): pinned, archived, spawned children with an explicit and an
// implicit parentSessionKey, parent-only and parent != spawner lineage, last-interaction, equal timestamps,
// a cron run key, and rows of a second agent. The state database (subagent runs, which decide a
// row's spawnedBy) is the shared VLab one's consistent copy.
//
// Each measurement is a fresh child process calling the sessions.read handlers directly (in-process dispatch,
// as a tool running inside the Gateway does). Equivalence: every sessions.list response (all fields but ts) of
// a request matrix, and for the sessions_search tool the sequence of agent/session keys it sends to
// sessions.search (its visible candidate set; sessions.search is stubbed) for requesters x visibility modes.
// In every arm, after the first listing has validated the database, one row is rewritten raw (entry_valid
// becomes 0) and restored at the end, so the JSON path for unsettled rows is compared as well.
// Timing: the event-loop block of one visibility listing (what sessions_search sends: archived "all",
// visibilityRowsOnly, once without and once with agentId), warm (second call in the process) and cold (this
// database file dropped from the page cache with dd oflag=nocache before the first call).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const REL = "lab/release-files/sessions-visibility-columns";
const VBYTES = "release/captured/remote-node-stable-20261111/dist";
const DB_REL = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const dbPath = path.join(stateDir, DB_REL);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const role = process.argv[2] ?? "parent";
for (const [name, dir] of [["TMPDIR", "svc-tmp"], ["XDG_CACHE_HOME", "svc-cache"]]) {
  const target = path.join(path.dirname(stateDir), dir);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  process.env[name] = target;
}
const log = (key, value) => console.log(`[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`);
const RAW_KEY = "agent:makaron:svc-raw";
const TOOLS = "openclaw-tools-BODVdJQD.js";

if (role === "parent") await parent();
else await child(JSON.parse(process.argv[3]));

// ---------------------------------------------------------------------------------------------------
async function parent() {
  const plan = JSON.parse(fs.readFileSync("lab/sessions-visibility-columns.plan.json", "utf8"));
  const names = plan.files.map((f) => path.basename(f.target));
  const vBytes = Object.fromEntries(names.map((name) => [name, fs.readFileSync(path.join(VBYTES, name))]));
  const relBytes = Object.fromEntries(names.map((name) => [name, fs.readFileSync(path.join(REL, name))]));
  for (const f of plan.files) {
    const name = path.basename(f.target);
    assert.equal(sha(vBytes[name]), f.before, `V bytes: ${name}`);
    assert.equal(sha(relBytes[name]), f.after, `release bytes: ${name}`);
    assert.equal(sha(fs.readFileSync(path.join(DIST, name))), f.before, `candidate runtime is not V's bytes: ${name}`);
  }
  assert.equal(sha(fs.readFileSync(path.join(DIST, TOOLS))), "0b8b623310c01d8153a7f751c1f3a2042a2f3481d62499effce4f34d60ed2799", "tool chunk is not V's bytes");
  const setDist = (bytes) => { for (const name of names) fs.writeFileSync(path.join(DIST, name), bytes[name]); };
  process.on("exit", () => setDist(vBytes));

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  config.session = { ...(config.session ?? {}), maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  config.tools = { ...(config.tools ?? {}), sessions: { visibility: "all" }, agentToAgent: { enabled: true, allow: ["makaron", "v-codex", "short-v", "xiaoai"] } };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

  const t0 = performance.now();
  const { buildVScaleSessionDatabase } = await import("./v-scale-session-fixture.mjs");
  const built = buildVScaleSessionDatabase({ runtime, srcPath: path.join(sharedState, DB_REL), dstPath: dbPath, targetRows: Number(process.env.TARGET_ROWS ?? 21800), orphanWindows: 0 });
  log("fixture.nodes", { ...built, ms: Math.round(performance.now() - t0) });
  setDist(vBytes);
  const edges = run("edges", {});
  log("fixture.edges", edges);
  log("fixture.shape", inspect());

  // Two lineage shapes. As built, the cloned subagent rows keep their template's spawnedBy, so ~10,800 rows have
  // parent_session_key = spawned_by and take the JSON path (worst case). V (2026-11-16): 66 of 21,913.
  const rowsClock = Date.now();
  const equivalence = (label, order) => {
    const rows = {};
    for (const arm of order) {
      setDist(arm === "A" ? vBytes : relBytes);
      const r = run("rows", { arm, now: rowsClock });
      (rows[arm] ??= []).push(r);
      const columnRequests = r.requests.filter((q) => q.columnRequest);
      log(`${label}.rows.${arm}`, {
        requests: r.requests.length,
        cases: r.cases.length,
        prepares: r.prepares,
        columnRequestsReadingWholeStore: columnRequests.filter((q) => q.wholeStoreReads > 0).length,
        columnRequestsReadingColumns: columnRequests.filter((q) => q.columnReads > 0).length,
        otherRequestsReadingColumns: r.requests.filter((q) => !q.columnRequest && q.columnReads > 0).length,
        ms: r.ms,
      });
    }
    const diffs = [];
    const ref = rows[order[0]][0];
    for (const [arm, runs] of Object.entries(rows)) {
      for (const r of runs) {
        r.requests.forEach((q, i) => { if (q.sha !== ref.requests[i].sha) diffs.push({ arm, kind: "request", request: q.request, got: q.summary, want: ref.requests[i].summary }); });
        r.cases.forEach((c, i) => { for (const f of ["sequenceSha", "resultSha"]) if (c[f] !== ref.cases[i][f]) diffs.push({ arm, kind: "case", label: c.label, field: f }); });
      }
    }
    log(`${label}.equivalence`, {
      requests: ref.requests.length,
      cases: ref.cases.length,
      comparisons: (ref.requests.length + ref.cases.length) * (Object.values(rows).flat().length - 1),
      differences: diffs.length,
      diffs: diffs.slice(0, 10),
      rowsPerRequest: ref.requests.map((q) => q.summary.count),
      candidateKeysPerCase: Object.fromEntries(ref.cases.map((c) => [c.label, c.searchedKeys])),
    });
    assert.equal(diffs.length, 0, `${label}: sessions.list responses or search candidates differ between arms`);
    for (const r of rows.B) {
      for (const q of r.requests.filter((x) => x.columnRequest)) {
        assert.equal(q.wholeStoreReads, 0, `release arm read the whole list projection: ${JSON.stringify(q.request)}`);
        assert(q.columnReads > 0, `release arm did not read columns: ${JSON.stringify(q.request)}`);
      }
      // a sandboxed requester lists with spawnedBy, which keeps the list projection by design
      for (const c of r.cases.filter((x) => !x.label.endsWith("/sandboxed"))) assert.equal(c.wholeStoreReads, 0, `release arm: ${c.label} read the whole list projection`);
    }
    for (const r of [...(rows.A ?? []), ...(rows.B0 ?? [])]) assert.equal(r.prepares.total.columnIndexReads, 0, "list-projection arm read columns");
  };
  // timing: one visibility listing (per scope), warm and cold
  const timing = (label) => {
    const out = {};
    // warm: second call in the process. evicted: the process has validated the database (the canonical key check
    // reads every entry JSON once per process, as a Gateway does at start), then this file is dropped from the page
    // cache before each call — a running Gateway whose pages were reclaimed. cold: a fresh process on a dropped
    // file, which includes that one-time check.
    for (const cache of (process.env.TIMING_CACHES ?? "warm,evicted,cold").split(",")) {
      for (const arm of cache === "warm" ? ["A", "B"] : ["A", "B", "A", "B"]) {
        setDist(arm === "A" ? vBytes : relBytes);
        const r = run("listing", { arm, cache });
        (out[`${arm}/${cache}`] ??= []).push(r);
        log(`${label}.listing.${arm}.${cache}`, r);
      }
    }
    log(`${label}.summary`, Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.map(({ unscoped, scoped, rssMb }) => ({ unscoped, scoped, rssMb }))])));
  };

  // PHASES (default all): built-equivalence, built-timing, v-lineage
  const phases = new Set((process.env.PHASES ?? "built-equivalence,built-timing,v-lineage").split(","));
  if (phases.has("built-equivalence")) equivalence("built", ["A", "B"]);
  if (phases.has("built-timing")) timing("built");
  if (!phases.has("v-lineage") && !phases.has("v-lineage-timing")) return;
  log("v-lineage", applyVLineage(66));
  log("fixture.shape.v-lineage", inspect());
  if (phases.has("v-lineage")) equivalence("v-lineage", ["B0", "B"]);
  if (phases.has("v-lineage-profile")) { setDist(relBytes); log("v-lineage.profile", run("profile", {})); }
  if (phases.has("v-lineage") || phases.has("v-lineage-timing")) timing("v-lineage");
  setDist(vBytes);
}

// Keep spawnedBy/parentSessionKey on 66 cloned subagent rows (V's count) and drop them from the rest, in the JSON
// and the promoted columns alike; entry_valid is settled to 1 as the canonical writer leaves it.
function applyVLineage(keep) {
  const db = new DatabaseSync(dbPath);
  const rows = db.prepare("SELECT session_key, entry_json FROM session_nodes WHERE spawned_by IS NOT NULL AND session_key LIKE 'agent:makaron:subagent:%' ORDER BY session_key").all();
  const update = db.prepare("UPDATE session_nodes SET entry_json = ?, spawned_by = NULL, parent_session_key = NULL WHERE session_key = ?");
  const settle = db.prepare("UPDATE session_nodes SET entry_valid = 1 WHERE session_key = ?");
  db.exec("BEGIN");
  let changed = 0;
  for (const row of rows.slice(keep)) {
    const entry = JSON.parse(row.entry_json);
    delete entry.spawnedBy;
    delete entry.parentSessionKey;
    update.run(JSON.stringify(entry), row.session_key);
    settle.run(row.session_key);
    changed += 1;
  }
  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  return { spawnedRows: rows.length, kept: Math.min(keep, rows.length), changed };
}

function run(mode, args) {
  const r = spawnSync(process.execPath, ["--experimental-async-context-frame", "--max-old-space-size=8192", process.argv[1], "child", JSON.stringify({ mode, ...args })], { encoding: "utf8", env: { ...process.env, ...(args.arm === "B0" ? { OPENCLAW_V_SESSIONS_VISIBILITY_COLUMNS: "0" } : {}) }, maxBuffer: 256 * 1024 * 1024 });
  const lines = `${r.stdout}`.split("\n");
  const result = lines.filter((l) => l.startsWith("RESULT ")).map((l) => JSON.parse(l.slice(7))).at(-1);
  if (r.status !== 0 || !result) {
    console.log(r.stdout.slice(-4000)); console.log(r.stderr.slice(-8000));
    throw new Error(`child ${mode} ${JSON.stringify(args)} exited ${r.status}`);
  }
  return result;
}

function inspect() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const one = (sql) => Object.values(db.prepare(sql).get())[0];
  const out = {
    nodes: one("SELECT count(*) FROM session_nodes"),
    entryMb: Math.round(one("SELECT sum(length(entry_json)) FROM session_nodes") / 1048576),
    valid: one("SELECT count(*) FROM session_nodes WHERE entry_valid = 1"),
    spawned: one("SELECT count(*) FROM session_nodes WHERE spawned_by IS NOT NULL"),
    parent: one("SELECT count(*) FROM session_nodes WHERE parent_session_key IS NOT NULL"),
    parentEqSpawned: one("SELECT count(*) FROM session_nodes WHERE parent_session_key = spawned_by"),
    archived: one("SELECT count(*) FROM session_nodes WHERE archived_at IS NOT NULL"),
    pinned: one("SELECT count(*) FROM session_nodes WHERE pinned_at IS NOT NULL"),
    lastInteraction: one("SELECT count(*) FROM session_nodes WHERE last_interaction_at IS NOT NULL"),
    dbMb: Math.round(fs.statSync(dbPath).size / 1048576),
  };
  db.close();
  const state = path.join(stateDir, "state", "openclaw.sqlite");
  if (fs.existsSync(state)) {
    const s = new DatabaseSync(state, { readOnly: true });
    try { out.subagentRuns = Object.values(s.prepare("SELECT count(*) FROM subagent_runs").get())[0]; } catch { out.subagentRuns = null; }
    s.close();
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
async function child(args) {
  process.env.OPENCLAW_STATE_DIR = stateDir;
  const imp = (name) => import(path.join(DIST, name));
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  if (args.mode === "edges") {
    const { _: replaceSessionEntry } = await imp("session-accessor.sqlite-entry-BlklNPKQ.js");
    const now = Date.now();
    const top = new DatabaseSync(dbPath, { readOnly: true }).prepare("SELECT session_key FROM session_nodes WHERE session_key NOT LIKE '%:subagent:%' ORDER BY updated_at DESC LIMIT 2").all().map((r) => r.session_key);
    const [p1, p2] = [top[0] ?? "agent:makaron:main", top[1] ?? "agent:makaron:main"];
    const rows = [
      ["makaron", "agent:makaron:svc-pinned-old", { updatedAt: now - 40 * 86400e3, pinnedAt: now - 1000 }],
      ["makaron", "agent:makaron:svc-pinned-new", { updatedAt: now - 5000, pinnedAt: now - 2000 }],
      ["makaron", "agent:makaron:svc-archived", { updatedAt: now - 3000, archivedAt: now - 2500 }],
      ["makaron", "agent:makaron:svc-child-implicit", { updatedAt: now - 4000, spawnedBy: p1 }],
      ["makaron", "agent:makaron:svc-child-explicit", { updatedAt: now - 4100, spawnedBy: p1, parentSessionKey: p1 }],
      ["makaron", "agent:makaron:svc-child-archived", { updatedAt: now - 4200, spawnedBy: p2, parentSessionKey: p2, archivedAt: now - 4150 }],
      ["makaron", "agent:makaron:svc-parent-only", { updatedAt: now - 4300, parentSessionKey: p2 }],
      ["makaron", "agent:makaron:svc-parent-differs", { updatedAt: now - 4400, spawnedBy: p1, parentSessionKey: p2 }],
      ["makaron", "agent:makaron:svc-talked", { updatedAt: now - 6000, lastInteractionAt: now - 500 }],
      ["makaron", "agent:makaron:svc-same-ts-a", { updatedAt: now - 7000 }],
      ["makaron", "agent:makaron:svc-same-ts-b", { updatedAt: now - 7000 }],
      ["makaron", "agent:makaron:cron:svc-job:run:svc-run", { updatedAt: now - 8000 }],
      ["makaron", RAW_KEY, { updatedAt: now - 9000 }],
      ["v-codex", "agent:v-codex:svc-a", { updatedAt: now - 1500 }],
      ["v-codex", "agent:v-codex:svc-child", { updatedAt: now - 1600, spawnedBy: "agent:v-codex:svc-a" }],
      ["v-codex", "agent:v-codex:svc-archived", { updatedAt: now - 1700, archivedAt: now - 1650 }],
    ];
    const written = [];
    for (const [agentId, sessionKey, extra] of rows) {
      try {
        await replaceSessionEntry({ agentId, sessionKey }, { sessionId: randomUUID(), ...extra });
        written.push(sessionKey);
      } catch (error) {
        written.push(`${sessionKey}: ${String(error?.message ?? error).slice(0, 160)}`);
      }
    }
    console.log(`RESULT ${JSON.stringify({ parents: [p1, p2], written })}`);
    process.exit(0);
  }

  // SQL prepared by this process: whole-store list projection reads vs column reads
  const prepares = { listProjectionWholeStore: 0, listProjectionByKey: 0, columnIndexReads: 0 };
  const origPrepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function prepare(sql, ...rest) {
    if (typeof sql === "string") {
      if (/json_remove\(entry_json/u.test(sql) && /from "session_nodes"/u.test(sql)) {
        if (/"session_key" in \(/u.test(sql)) prepares.listProjectionByKey += 1; else prepares.listProjectionWholeStore += 1;
      }
      if (/INDEXED BY idx_agent_session_nodes_updated_at/u.test(sql)) prepares.columnIndexReads += 1;
    }
    return origPrepare.call(this, sql, ...rest);
  };

  const { t: sessionReadHandlers } = await imp("sessions-read-C6mAMxyQ.js");
  const context = { getRuntimeConfig: () => config };
  const call = (method, params) => new Promise((resolve, reject) => {
    Promise.resolve(sessionReadHandlers[method]({
      req: { type: "req", id: randomUUID(), method, params },
      params,
      client: null,
      isWebchatConnect: () => false,
      context,
      respond: (ok, payload, error) => (ok ? resolve(payload) : reject(new Error(error?.message ?? "gateway error"))),
    })).catch(reject);
  });
  const monitor = () => {
    let last = performance.now(); let max = 0;
    const timer = setInterval(() => { const now = performance.now(); max = Math.max(max, now - last); last = now; }, 5);
    return () => { clearInterval(timer); max = Math.max(max, performance.now() - last); return Math.round(max); };
  };

  if (args.mode === "profile") {
    // where a cold column read spends its time: the same statements, timed one by one after the file is dropped
    await call("sessions.list", { visibilityRowsOnly: true, limit: 1 }); // validated, as in a running Gateway
    const evictNow = () => { for (const f of [dbPath, `${dbPath}-wal`]) if (fs.existsSync(f)) execFileSync("dd", [`of=${f}`, "oflag=nocache", "conv=notrunc,fdatasync", "count=0"], { stdio: "ignore" }); };
    const out = {};
    for (const round of ["cold", "warm"]) {
      if (round === "cold") evictNow();
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const time = (label, fn) => { const t = performance.now(); const n = fn(); out[`${round}.${label}`] = { ms: Math.round(performance.now() - t), n }; return n; };
      time("table-header-scan", () => db.prepare("SELECT rowid AS id, session_key, entry_valid, typeof(pinned_at) AS pinned_type FROM session_nodes").all().length);
      for (const [label, col, where] of [["updated_at", "updated_at", ""], ["current_session_id", "current_session_id", ""], ["parent_session_key", "parent_session_key", " WHERE parent_session_key IS NOT NULL"], ["spawned_by", "spawned_by", " WHERE spawned_by IS NOT NULL"], ["archived_at", "archived_at", " WHERE archived_at IS NOT NULL"], ["last_interaction_at", "last_interaction_at", " WHERE last_interaction_at IS NOT NULL"]]) {
        time(`index.${label}`, () => db.prepare(`SELECT rowid AS id, ${col} AS v FROM session_nodes INDEXED BY idx_agent_session_nodes_${label}${where}`).all().length);
      }
      const special = db.prepare("SELECT session_key FROM session_nodes WHERE entry_valid != 1 OR pinned_at IS NOT NULL OR (parent_session_key IS NOT NULL AND parent_session_key = spawned_by)").all().map((r) => r.session_key);
      if (round === "cold") evictNow();
      time("special-rows-json", () => { let n = 0; const q = db.prepare("SELECT json_remove(entry_json, '$.skillsSnapshot', '$.systemPromptReport') AS e FROM session_nodes WHERE session_key = ?"); for (const k of special) { JSON.parse(q.get(k).e); n += 1; } return n; });
      db.close();
    }
    console.log(`RESULT ${JSON.stringify(out)}`);
    process.exit(0);
  }

  if (args.mode === "listing") {
    const evict = () => { for (const f of [dbPath, `${dbPath}-wal`]) if (fs.existsSync(f)) execFileSync("dd", [`of=${f}`, "oflag=nocache", "conv=notrunc,fdatasync", "count=0"], { stdio: "ignore" }); };
    const listing = async (params) => {
      const stop = monitor();
      const t = performance.now();
      const r = await call("sessions.list", params);
      return { ms: Math.round(performance.now() - t), maxBlockMs: stop(), rows: r.sessions.length };
    };
    const unscopedParams = { archived: "all", limit: 50000, visibilityRowsOnly: true };
    const scopedParams = { ...unscopedParams, agentId: "makaron" };
    if (args.cache === "cold") evict();
    else { await listing(unscopedParams); await listing(scopedParams); }
    if (args.cache === "evicted") evict();
    const unscoped = await listing(unscopedParams);
    if (args.cache === "evicted") evict();
    const scoped = await listing(scopedParams);
    console.log(`RESULT ${JSON.stringify({ unscoped, scoped, prepares, rssMb: Math.round(process.memoryUsage().rss / 1048576) })}`);
    process.exit(0);
  }

  // mode "rows": every arm lists at the same clock (activeMinutes and the subagent display window depend on it)
  if (args.now) { const fixed = args.now; Date.now = () => fixed; }
  const t0 = performance.now();
  await call("sessions.list", { visibilityRowsOnly: true, limit: 1 }); // validates the database (canonical key check)
  const raw = new DatabaseSync(dbPath);
  const original = raw.prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?").get(RAW_KEY);
  assert(original, "raw edge row is missing");
  const rawEntry = { ...JSON.parse(original.entry_json), archivedAt: Date.now() - 10, spawnedBy: "agent:makaron:main" };
  raw.prepare("UPDATE session_nodes SET entry_json = ? WHERE session_key = ?").run(JSON.stringify(rawEntry), RAW_KEY);
  assert.equal(raw.prepare("SELECT entry_valid FROM session_nodes WHERE session_key = ?").get(RAW_KEY).entry_valid, 0);
  const restore = () => {
    raw.prepare("UPDATE session_nodes SET entry_json = ? WHERE session_key = ?").run(original.entry_json, RAW_KEY);
    raw.prepare("UPDATE session_nodes SET entry_valid = 1 WHERE session_key = ?").run(RAW_KEY);
    raw.close();
  };
  const listingPrepares = { ...prepares };

  const requests = [];
  for (const agentId of [undefined, "makaron", "v-codex"]) {
    for (const archived of [undefined, false, true, "all"]) {
      for (const page of [{ limit: 50000 }, { limit: 10000, offset: 10000 }, { limit: 3 }]) {
        requests.push({ visibilityRowsOnly: true, ...(agentId ? { agentId } : {}), ...(archived !== undefined ? { archived } : {}), ...page });
      }
    }
  }
  for (const sortBy of ["updatedAt", "lastInteractionAt"]) requests.push({ visibilityRowsOnly: true, archived: "all", limit: 50000, sortBy }, { visibilityRowsOnly: true, sortBy, limit: 25 });
  requests.push(
    { visibilityRowsOnly: true, includeGlobal: true, includeUnknown: true, archived: "all", limit: 50000 },
    { visibilityRowsOnly: true, activeMinutes: 60, limit: 50000 },
    { visibilityRowsOnly: true, configuredAgentsOnly: true, archived: "all", limit: 50000 },
    // filters the columns do not carry: list projection in every arm
    { visibilityRowsOnly: true, search: "svc", limit: 100 },
    { visibilityRowsOnly: true, label: "subagent-1", limit: 100 },
  );
  const out = [];
  for (const request of requests) {
    const before = { ...prepares };
    const r = await call("sessions.list", request);
    const { ts: _ts, ...rest } = r;
    out.push({
      request,
      sha: sha(JSON.stringify(rest)),
      summary: { count: r.count, totalCount: r.totalCount, hasMore: r.hasMore, nextOffset: r.nextOffset, first: r.sessions[0] },
      columnRequest: request.search === undefined && request.label === undefined,
      wholeStoreReads: prepares.listProjectionWholeStore - before.listProjectionWholeStore,
      columnReads: prepares.columnIndexReads - before.columnIndexReads,
    });
  }
  const toolBefore = { ...prepares };

  // the sessions_search tool: what it sends to sessions.search (stubbed), per requester and visibility mode
  const toolCopy = path.join(DIST, `openclaw-tools-BODVdJQD.SVC${process.pid}.js`);
  fs.writeFileSync(toolCopy, `${fs.readFileSync(path.join(DIST, TOOLS), "utf8")}\nexport { createSessionsSearchTool as __svcCreateSessionsSearchTool };\n`);
  let createSessionsSearchTool;
  try { ({ __svcCreateSessionsSearchTool: createSessionsSearchTool } = await import(toolCopy)); } finally { fs.rmSync(toolCopy, { force: true }); }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const pick = (sql) => db.prepare(sql).get()?.session_key;
  const topSpawner = db.prepare("SELECT spawned_by AS k, count(*) n FROM session_nodes WHERE spawned_by IS NOT NULL GROUP BY spawned_by ORDER BY n DESC LIMIT 1").get()?.k;
  const requesters = [
    ["makaron:main", "agent:makaron:main"],
    ["makaron:top-spawner", topSpawner],
    ["makaron:subagent", pick("SELECT session_key FROM session_nodes WHERE spawned_by IS NOT NULL AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 1")],
    ["makaron:archived", pick("SELECT session_key FROM session_nodes WHERE archived_at IS NOT NULL ORDER BY session_key LIMIT 1")],
    ["makaron:child-explicit", "agent:makaron:svc-child-explicit"],
    ["makaron:raw", RAW_KEY],
    ["makaron:cron-run", "agent:makaron:cron:svc-job:run:svc-run"],
    ["v-codex:a", "agent:v-codex:svc-a"],
  ].filter(([, key]) => typeof key === "string");
  db.close();
  const withVisibility = (visibility) => ({ ...config, tools: { ...config.tools, sessions: { visibility } } });
  const cases = [];
  for (const [label, key] of requesters) {
    for (const visibility of ["all", "agent", "tree", "self"]) cases.push({ label: `${label}/${visibility}`, key, cfg: withVisibility(visibility) });
  }
  for (const [label, key] of requesters.slice(0, 3)) cases.push({ label: `${label}/sandboxed`, key, cfg: config, sandboxed: true });
  // The store does not change while the cases run: identical listing requests are answered once per arm.
  const toolMemo = new Map();
  const caseResults = [];
  for (const kase of cases) {
    const before = prepares.listProjectionWholeStore;
    const sequence = [];
    const callGateway = async (request) => {
      if (request.method === "sessions.search") {
        sequence.push([request.params.agentId, request.params.sessionKeys]);
        return { results: [] };
      }
      const memoKey = JSON.stringify([request.method, request.params ?? {}]);
      if (!toolMemo.has(memoKey)) toolMemo.set(memoKey, await call(request.method, request.params ?? {}));
      return structuredClone(toolMemo.get(memoKey));
    };
    const tool = createSessionsSearchTool({ config: kase.cfg, agentId: kase.key.split(":")[1], agentSessionKey: kase.key, sandboxed: kase.sandboxed === true, callGateway });
    let result;
    try { result = await tool.execute("svc", { query: "svcquery", limit: 25 }); } catch (error) { result = { threw: String(error?.message ?? error).slice(0, 300) }; }
    caseResults.push({ label: kase.label, sequenceSha: sha(JSON.stringify(sequence)), resultSha: sha(JSON.stringify(result?.details ?? result)), searchedKeys: sequence.reduce((n, [, keys]) => n + (keys?.length ?? 0), 0), wholeStoreReads: prepares.listProjectionWholeStore - before });
  }
  restore();
  const tool = { wholeStoreReads: prepares.listProjectionWholeStore - toolBefore.listProjectionWholeStore, columnReads: prepares.columnIndexReads - toolBefore.columnIndexReads, byKeyReads: prepares.listProjectionByKey - toolBefore.listProjectionByKey };
  console.log(`RESULT ${JSON.stringify({ requests: out, cases: caseResults, prepares: { firstListing: listingPrepares, tool, total: prepares }, ms: Math.round(performance.now() - t0) })}`);
  process.exit(0);
}
