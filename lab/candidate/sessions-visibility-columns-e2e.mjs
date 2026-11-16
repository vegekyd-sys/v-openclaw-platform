// Needs PR #608's release files (branch claude/sweet-wu-5b78f9: lab/sessions-search-stall.plan.json and
// lab/release-files/sessions-search-stall/) next to this change's.
// sessions-visibility-columns end to end: one sessions_search tool call made inside the Gateway, with PR #608's
// release files alone (S) and with PR #608 plus this change (SV); V's bytes (A) once per cache state for reference.
// Derived from PR #608's lab/candidate/sessions-search-stall-ab.mjs (same fixture, child and measurement), with the
// fixture's lineage set to V's shape (66 spawned rows; lab/candidate/sessions-visibility-columns-ab.mjs) and the
// time of each Gateway method recorded. "warm" measures the second search in the process; "evicted" runs one search
// (which also runs the once-per-process canonical key check), drops this database file from the page cache
// (dd oflag=nocache on our own file only) and measures the next; "cold" drops the file before a fresh process's
// first search (that one-time check included).
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
const REL = "lab/release-files/sessions-search-stall";
const VBYTES = "release/captured/remote-node-stable-20261111/dist";
const DB_REL = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const dbPath = path.join(stateDir, DB_REL);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const role = process.argv[2] ?? "parent";
// The runner's TMPDIR / XDG_CACHE_HOME belong to the shared instance; read-only SQLite workers refuse its fallback.
for (const [name, dir] of [["TMPDIR", "sss-tmp"], ["XDG_CACHE_HOME", "sss-cache"]]) {
  const target = path.join(path.dirname(stateDir), dir);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  process.env[name] = target;
}
const log = (key, value) => console.log(`[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`);
const NEEDLE = "needleqx";
const TOOLS = "openclaw-tools-BODVdJQD.js";

if (role === "parent") await parent();
else await child(JSON.parse(process.argv[3]));

// ---------------------------------------------------------------------------------------------------
async function parent() {
  const stall = JSON.parse(fs.readFileSync("lab/sessions-search-stall.plan.json", "utf8"));
  const columns = JSON.parse(fs.readFileSync("lab/sessions-visibility-columns.plan.json", "utf8"));
  const plan = { files: [...stall.files, ...columns.files] };
  const names = plan.files.map((f) => path.basename(f.target));
  const vBytes = Object.fromEntries(names.map((name) => [name, name.startsWith("session-transcript-search") ? fs.readFileSync(path.join(REL, "v-base", name)) : fs.readFileSync(path.join(VBYTES, name))]));
  const relBytes = Object.fromEntries(plan.files.map((f) => [path.basename(f.target), fs.readFileSync(f.source)]));
  const stallNames = new Set(stall.files.map((f) => path.basename(f.target)));
  const armBytes = {
    A: vBytes,
    S: Object.fromEntries(names.map((name) => [name, stallNames.has(name) ? relBytes[name] : vBytes[name]])),
    SV: relBytes,
  };
  for (const f of plan.files) {
    const name = path.basename(f.target);
    assert.equal(sha(vBytes[name]), f.before, `V bytes: ${name}`);
    assert.equal(sha(relBytes[name]), f.after, `release bytes: ${name}`);
    assert.equal(sha(fs.readFileSync(path.join(DIST, name))), f.before, `candidate runtime is not V's bytes: ${name}`);
  }
  const setDist = (bytes) => { for (const name of names) fs.writeFileSync(path.join(DIST, name), bytes[name]); };
  process.on("exit", () => setDist(vBytes));

  // configuration: V's session visibility and maintenance, no channels or cron
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  config.session = { ...(config.session ?? {}), maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  config.tools = { ...(config.tools ?? {}), sessions: { visibility: "all" }, agentToAgent: { enabled: true, allow: ["makaron", "v-codex", "short-v", "xiaoai"] } };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

  // fixture
  const t0 = performance.now();
  const { buildVScaleSessionDatabase } = await import("./v-scale-session-fixture.mjs");
  const built = buildVScaleSessionDatabase({ runtime, srcPath: path.join(sharedState, DB_REL), dstPath: dbPath, targetRows: Number(process.env.TARGET_ROWS ?? 21800), orphanWindows: 0 });
  log("fixture.nodes", { ...built, ms: Math.round(performance.now() - t0) });
  log("fixture.v-lineage", applyVLineage(66));
  const transcripts = addTranscripts(Number(process.env.HISTORY_WINDOWS ?? 5200));
  log("fixture.transcripts", transcripts);
  setDist(vBytes);
  run("index", { arm: "A" });
  const shape = inspect();
  log("fixture.indexed", shape);
  assert.equal(shape.dirty, 0, "fixture index is not clean after reconcile");

  const results = {};
  for (const cache of (process.env.SEARCH_CACHES ?? "warm,evicted").split(",")) {
    for (const arm of ["S", "SV", "S", "SV", "A"]) {
      setDist(armBytes[arm]);
      const r = run("search", { arm, cache, query: NEEDLE });
      (results[`${arm}/${cache}`] ??= []).push(r);
    }
  }
  setDist(armBytes.S); const missS = run("search", { arm: "S", cache: "warm", query: "zzqxnomatch" });
  setDist(armBytes.SV); const missSV = run("search", { arm: "SV", cache: "warm", query: "zzqxnomatch" });
  const resultHashes = Object.fromEntries(Object.entries(results).map(([k, runs]) => [k, [...new Set(runs.map((r) => r.resultSha))]]));
  log("equivalence", { resultHashes, miss: [missS.resultSha, missSV.resultSha] });
  assert.equal(new Set(Object.values(resultHashes).flat()).size, 1, "tool results differ between arms");
  assert.equal(missS.resultSha, missSV.resultSha);
  setDist(vBytes);
  const summary = Object.fromEntries(Object.entries(results).map(([k, runs]) => [k, runs.map(({ totalMs, maxBlockMs, blocksOver100, gapsOver1s, calls, methodMs, hits }) => ({ totalMs, maxBlockMs, blocksOver100, gapsOver1s, calls, methodMs, hits }))]));
  log("summary", summary);
}

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
  const r = spawnSync(process.execPath, ["--experimental-async-context-frame", "--max-old-space-size=8192", process.argv[1], "child", JSON.stringify({ mode, ...args })], { encoding: "utf8", env: process.env, maxBuffer: 256 * 1024 * 1024 });
  const lines = `${r.stdout}`.split("\n");
  const result = lines.filter((l) => l.startsWith("RESULT ")).map((l) => JSON.parse(l.slice(7))).at(-1);
  if (r.status !== 0 || !result) {
    console.log(r.stdout.slice(-4000)); console.log(r.stderr.slice(-8000));
    throw new Error(`child ${mode} ${JSON.stringify(args)} exited ${r.status}`);
  }
  if (mode === "search") log(`search.${args.arm}.${args.cache}.${args.query}`, { ...result, results: undefined });
  return result;
}

function inspect() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const one = (sql) => Object.values(db.prepare(sql).get())[0];
  const out = {
    windows: one("SELECT count(*) FROM session_windows"),
    nodes: one("SELECT count(*) FROM session_nodes"),
    windowsWithTranscript: one("SELECT count(*) FROM session_windows w WHERE EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = w.session_id)"),
    indexState: one("SELECT count(*) FROM session_transcript_index_state"),
    ftsRows: one("SELECT count(*) FROM session_transcript_fts"),
    events: one("SELECT count(*) FROM transcript_events"),
    dirty: one(`SELECT count(*) FROM session_windows w JOIN transcript_events latest ON latest.session_id = w.session_id AND latest.seq = (SELECT c.seq FROM transcript_events c WHERE c.session_id = w.session_id ORDER BY c.seq DESC LIMIT 1) LEFT JOIN session_transcript_index_state st ON st.session_id = w.session_id WHERE coalesce(st.needs_rebuild, 1) != 0 OR latest.seq > coalesce(st.indexed_seq, -1) OR EXISTS (SELECT 1 FROM session_transcript_active_events p WHERE p.session_id = w.session_id AND p.context_eligible IS NULL)`),
    dbMb: Math.round(fs.statSync(dbPath).size / 1048576),
  };
  db.close();
  return out;
}

// A short linear transcript for every window; NEEDLE in ~1 % of them. Plus historical windows.
function addTranscripts(historyWindows) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = OFF");
  const winCols = db.prepare("PRAGMA table_info(session_windows)").all().map((c) => c.name);
  const insWin = db.prepare(`INSERT INTO session_windows (${winCols.map((c) => `"${c}"`).join(",")}) VALUES (${winCols.map(() => "?").join(",")})`);
  const insEvent = db.prepare("INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)");
  const words = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu".split(" ");
  const text = (i, j) => Array.from({ length: 40 }, (_, k) => words[(i * 7 + j * 13 + k * 3) % words.length]).join(" ");
  const now = Date.now();
  db.exec("BEGIN");
  const keys = db.prepare("SELECT session_key FROM session_nodes WHERE session_key LIKE 'agent:makaron:%' ORDER BY random() LIMIT ?").all(historyWindows).map((r) => r.session_key);
  for (let i = 0; i < historyWindows && keys.length > 0; i += 1) {
    const at = now - 86400e3 - i * 1000;
    const w = { session_id: randomUUID(), session_key: keys[i % keys.length], reason: "reset", session_scope: "conversation", created_at: at, updated_at: at, session_entry_provenance: 0, acp_owned: 0 };
    insWin.run(...winCols.map((c) => w[c] ?? null));
  }
  const windows = db.prepare("SELECT w.session_id AS id, w.created_at AS at FROM session_windows w WHERE NOT EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = w.session_id)").all();
  let events = 0; let needles = 0;
  windows.forEach((w, i) => {
    const at = Number(w.at) || now;
    insEvent.run(w.id, 0, JSON.stringify({ type: "session", version: 3, id: w.id, timestamp: new Date(at).toISOString(), cwd: "/tmp" }), at);
    let parentId = null;
    for (let j = 1; j <= 6; j += 1) {
      const id = `m${j}`;
      const needle = j === 3 && i % 97 === 0;
      if (needle) needles += 1;
      insEvent.run(w.id, j, JSON.stringify({ type: "message", id, parentId, timestamp: new Date(at + j).toISOString(), message: { role: j % 2 ? "user" : "assistant", content: [{ type: "text", text: `${needle ? `${NEEDLE} ` : ""}${text(i, j)}` }], timestamp: at + j } }), at + j);
      parentId = id; events += 1;
    }
  });
  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  return { historyWindows, windowsGivenTranscripts: windows.length, events, needleSessions: needles };
}

// ---------------------------------------------------------------------------------------------------
async function child(args) {
  process.env.OPENCLAW_STATE_DIR = stateDir;
  const imp = (name) => import(path.join(DIST, name));
  if (args.mode === "index") {
    const { n: reconcileSessionTranscriptIndexes } = await imp("session-transcript-reconcile-j5qhAafV.js");
    const t = performance.now();
    const r = await reconcileSessionTranscriptIndexes({ agentId: "makaron" });
    console.log(`RESULT ${JSON.stringify({ ...r, ms: Math.round(performance.now() - t) })}`);
    process.exit(0);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const { t: sessionReadHandlers } = await imp("sessions-read-C6mAMxyQ.js");
  // the tool chunk exports only createOpenClawTools; a side copy also exports the sessions_search factory
  const toolCopy = path.join(DIST, `openclaw-tools-BODVdJQD.SSS${process.pid}.js`);
  fs.writeFileSync(toolCopy, `${fs.readFileSync(path.join(DIST, TOOLS), "utf8")}\nexport { createSessionsSearchTool as __sssCreateSessionsSearchTool };\n`);
  process.on("exit", () => fs.rmSync(toolCopy, { force: true }));
  const { __sssCreateSessionsSearchTool: createSessionsSearchTool } = await import(toolCopy);
  const reconcile = await imp("session-transcript-reconcile-j5qhAafV.js");

  const calls = {};
  const context = { getRuntimeConfig: () => config };
  // in-process dispatch: the handler runs on this event loop and resolves without a macrotask boundary
  const methodMs = {};
  const callGatewayRaw = (request) => new Promise((resolve, reject) => {
    calls[request.method] = (calls[request.method] ?? 0) + 1;
    const handler = sessionReadHandlers[request.method];
    if (!handler) { reject(new Error(`no handler for ${request.method}`)); return; }
    Promise.resolve(handler({
      req: { type: "req", id: randomUUID(), method: request.method, params: request.params },
      params: request.params ?? {},
      client: null,
      isWebchatConnect: () => false,
      context,
      respond: (ok, payload, error) => (ok ? resolve(payload) : reject(new Error(error?.message ?? "gateway error"))),
    })).catch(reject);
  });
  const callGateway = async (request) => {
    const t = performance.now();
    try { return await callGatewayRaw(request); } finally {
      const ms = performance.now() - t;
      const m = (methodMs[request.method] ??= { total: 0, max: 0 });
      m.total = Math.round(m.total + ms); m.max = Math.max(m.max, Math.round(ms));
    }
  };
  const tool = createSessionsSearchTool({ config, agentId: "makaron", agentSessionKey: "agent:makaron:main", callGateway });

  const monitor = () => {
    let last = performance.now(); let max = 0; const gaps = [];
    const timer = setInterval(() => { const now = performance.now(); const gap = now - last; last = now; if (gap > max) max = gap; if (gap > 100) gaps.push(Math.round(gap)); }, 5);
    return { stop: () => { clearInterval(timer); const now = performance.now(); const gap = now - last; if (gap > max) max = gap; if (gap > 100) gaps.push(Math.round(gap)); return { maxBlockMs: Math.round(max), blocksOver100: gaps.length, gapsOver1s: gaps.filter((g) => g > 1000) }; } };
  };
  const evict = () => { for (const f of [dbPath, `${dbPath}-wal`]) if (fs.existsSync(f)) execFileSync("dd", [`of=${f}`, "oflag=nocache", "conv=notrunc,fdatasync", "count=0"], { stdio: "ignore" }); };
  const search = async (query) => {
    for (const k of Object.keys(calls)) delete calls[k];
    for (const k of Object.keys(methodMs)) delete methodMs[k];
    const m = monitor();
    const t = performance.now();
    const result = await tool.execute("sss", { query, limit: 25 });
    const totalMs = Math.round(performance.now() - t);
    const blocks = m.stop();
    const details = result.details ?? {};
    const results = (details.results ?? []).map(({ sessionKey, sessionId, messageId, role: r, snippet }) => ({ sessionKey, sessionId, messageId, role: r, snippet })).sort((a, b) => `${a.sessionId}${a.messageId}`.localeCompare(`${b.sessionId}${b.messageId}`));
    return { totalMs, ...blocks, calls: { ...calls }, methodMs: structuredClone(methodMs), indexing: details.indexing === true, truncated: details.truncated === true, hits: results.length, resultSha: sha(JSON.stringify(results)).slice(0, 16), status: details.status };
  };

  if (args.mode === "search") {
    if (args.cache === "cold") evict();
    else await search(args.query); // warm-up run in this process (page cache, module state, canonical key check)
    // evicted: a running Gateway (database already validated) whose pages were reclaimed
    if (args.cache === "evicted") evict();
    const r = await search(args.query);
    console.log(`RESULT ${JSON.stringify(r)}`);
    await reconcile.i({ agentId: "makaron" });
    process.exit(0);
  }

  if (args.mode === "scenario") {
    const db = new DatabaseSync(dbPath);
    const target = db.prepare("SELECT session_id FROM session_transcript_index_state ORDER BY session_id LIMIT 1 OFFSET 777").get().session_id;
    if (args.scenario === "lag") db.prepare("UPDATE session_transcript_index_state SET indexed_seq = -1 WHERE session_id = ?").run(target);
    if (args.scenario === "flagged") db.prepare("UPDATE session_transcript_index_state SET needs_rebuild = 1 WHERE session_id = ?").run(target);
    if (args.scenario === "missing") db.prepare("DELETE FROM session_transcript_index_state WHERE session_id = ?").run(target);
    db.close();
    const first = await search(NEEDLE);
    const t = performance.now();
    let cleanAfterMs;
    while (performance.now() - t < 120_000) {
      const check = new DatabaseSync(dbPath, { readOnly: true });
      const st = check.prepare("SELECT indexed_seq, needs_rebuild FROM session_transcript_index_state WHERE session_id = ?").get(target);
      const latest = check.prepare("SELECT max(seq) AS seq FROM transcript_events WHERE session_id = ?").get(target).seq;
      check.close();
      if (st && st.needs_rebuild === 0 && st.indexed_seq >= latest) { cleanAfterMs = Math.round(performance.now() - t); break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    await reconcile.i({ agentId: "makaron" });
    const second = await search(NEEDLE);
    console.log(`RESULT ${JSON.stringify({ target, firstIndexing: first.indexing, firstMaxBlockMs: first.maxBlockMs, cleanAfterMs, secondIndexing: second.indexing, secondResultSha: second.resultSha })}`);
    process.exit(0);
  }
}
