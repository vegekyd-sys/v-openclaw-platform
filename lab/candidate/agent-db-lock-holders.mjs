// Candidate reproduction: who holds the makaron Agent DB writer on V, and does
// the fix stop it. Three modes (MODE):
//
// maint-bug    V's configuration drift, scaled down. V's Gateway config keeps
//              session.maintenance maxEntries 6000 / maxDiskBytes 32gb, but the
//              Worker config copy has maxEntries 2000 and no maxDiskBytes (default
//              10 GiB) while the makaron database is 11 GB. Here the Gateway keeps
//              V's values and the Worker gets maxEntries MAINT_MAX_ENTRIES and
//              maxDiskBytes MAINT_DISK below the copied data, so each Worker prunes
//              sessions, runs ANALYZE and the disk sweep inside the writer lock.
//              The failure path must be triggered: sessions deleted by a Worker
//              and Worker maintenance holds observed.
// maint-fixed  Same data, Worker session.maintenance.mode = "warn": no Worker
//              deletes a session and no Worker maintenance hold appears.
// talk         V's realtime voice configuration (non-secret parts); v-speaker's
//              talk.client.create parameters against a large copied session and a
//              new one. Reports every writer hold with its call stack and the RPC
//              duration: on V each create holds the writer 1.2-2 s.
//
// Holds come from a probe added to logSlowTransactionHold in this run's private
// runtime copy (threshold HOLD_PROBE_MS). Sessions are copied row by row from the
// shared VLab mirror into a fresh private database; nothing is written to shared
// state.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const MODE = process.env.MODE ?? "maint-bug";
assert(["maint-bug", "maint-fixed", "talk"].includes(MODE), `bad MODE ${MODE}`);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);
const HOLD_PROBE_MS = Number(process.env.HOLD_PROBE_MS ?? 100);
const MAINT_SESSIONS = Number(process.env.MAINT_SESSIONS ?? 160);
const MAINT_MAX_ENTRIES = Number(process.env.MAINT_MAX_ENTRIES ?? 100);
const MAINT_DISK = process.env.MAINT_DISK ?? "5mb";
const TALK_BIG_SESSION = process.env.TALK_BIG_SESSION ?? "fbf5d45f-0183-4afc-9f08-5728740a9390";
const MODEL = "deepseek/deepseek-flash";
// talk mode profiles the Gateway main thread to see what runs inside the writer transaction
const PROFILE_DIR = MODE === "talk" ? path.join(process.env.VLAB_CANDIDATE_DATA ?? stateDir, "cpu-profile") : null;
if (PROFILE_DIR) fs.mkdirSync(PROFILE_DIR, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");

// ---- hold probe in the private runtime copy ----
{
  const marker = "function logSlowTransactionHold(params) {";
  const name = fs.readdirSync(dist).find((f) => /^node-sqlite-.*\.js$/u.test(f) && fs.readFileSync(path.join(dist, f), "utf8").includes(marker));
  assert(name, "logSlowTransactionHold not found");
  const file = path.join(dist, name);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(marker, `${marker}
	if (params.elapsedMs >= ${HOLD_PROBE_MS}) console.error("[hold-probe] " + JSON.stringify({ ms: params.elapsedMs, op: params.options?.operationLabel ?? null, db: params.options?.databaseLabel ?? null, pid: process.pid, stack: String(new Error().stack).split("\\n").slice(2, 18).map((s) => s.trim().replace(/^at /u, "").replace(/\\(file:[^)]*\\/dist\\//u, "(")).join(" < ") }));`));
}


// ---- maintenance markers in the private runtime copy: who decides, who deletes ----
{
  const file = path.join(dist, fs.readdirSync(dist).find((f) => /^session-history-eviction-.*\.js$/u.test(f)));
  let src = fs.readFileSync(file, "utf8");
  const put = (marker, insert) => { assert(src.includes(marker), `maintenance marker not found: ${marker}`); src = src.replace(marker, `${marker}${insert}`); };
  put("const entryCount = readSessionEntryCount(database);",
    ` console.error("[maint-probe] entry-maintenance " + JSON.stringify({ pid: process.pid, entryCount, maxEntries: maintenance.maxEntries, mode: maintenance.mode, pruneAfterMs: maintenance.pruneAfterMs }));`);
  put("\tif (isCurrent()) await refreshSqliteSessionPlannerStatisticsBestEffort(scope, deletedEntries, { isCurrent });",
    `\n\tconsole.error("[maint-probe] entries-deleted " + JSON.stringify({ pid: process.pid, deletedEntries, ...committedCounts }));`);
  put("\tconst completion = runExclusiveSqliteSessionWrite(scope, async () => {",
    `\n\t\tconsole.error("[maint-probe] analyze " + JSON.stringify({ pid: process.pid, deletedEntries }));`);
  put("\tstate.running = true;",
    ` console.error("[maint-probe] disk-sweep " + JSON.stringify({ pid: process.pid, maxDiskBytes: maintenance.maxDiskBytes, highWaterBytes: maintenance.highWaterBytes }));`);
  fs.writeFileSync(file, src);
}

// ---- sessions to copy ----
const sharedDbPath = path.join(sharedState, "agents", "makaron", "agent", "openclaw-agent.sqlite");
let sessionIds;
{
  const db = new DatabaseSync(sharedDbPath, { readOnly: true });
  if (MODE === "talk") sessionIds = [TALK_BIG_SESSION];
  else sessionIds = db.prepare(`SELECT w.session_id FROM session_windows w JOIN session_nodes n ON n.current_session_id = w.session_id
    WHERE n.session_key LIKE 'agent:makaron:%' AND n.session_key NOT LIKE '%:cron:%'
      AND (SELECT count(*) FROM transcript_events e WHERE e.session_id = w.session_id) BETWEEN 3 AND 40
    ORDER BY w.updated_at DESC LIMIT ?`).all(MAINT_SESSIONS).map((r) => r.session_id);
  db.close();
  assert(sessionIds.length > 0, "no sessions selected");
}

// ---- production V's model entry and compaction model, on both config copies ----
// Same fields as V's models.providers.deepseek.models[id=deepseek-flash] (2026-09-29).
const flashEntry = {
  id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000000, maxTokens: 384000, api: "openai-completions",
  compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" },
};
function asProduction(config, runtimeId) {
  const deepseek = config.models?.providers?.deepseek;
  assert(deepseek, "shared VLab config has no deepseek provider");
  deepseek.models = (deepseek.models ?? []).filter((m) => m.id !== flashEntry.id).concat([flashEntry]);
  const model = { primary: MODEL, fallbacks: [] };
  // V's per-agent entry: the Gateway hands the turn to vlab-worker, the Worker runs it on openclaw.
  // Without it the shared VLab config routes the model to the codex harness.
  const perAgent = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) {
    config.agents.entries.makaron.model = model;
    (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent;
  }
  config.agents.defaults.compaction = { ...(config.agents.defaults.compaction ?? {}), model: MODEL };
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
  return config;
}

const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured; production runs turns in Workers");
Object.assign(workerPlugin, { minWorkers: CONCURRENCY, maxWorkers: CONCURRENCY, warmSpareWorkers: 0 });
// session maintenance as on V: the Gateway copy keeps V's values, the Worker copy drifts (or is fixed)
config.session = { ...(config.session ?? {}), maintenance: { mode: "enforce", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "32gb" } };
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = asProduction(JSON.parse(fs
  .readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), "openclaw");
workerConfig.channels = {};
workerConfig.session = { ...(workerConfig.session ?? {}), maintenance: MODE === "maint-fixed"
  ? { mode: "warn", pruneAfter: "14d", maxEntries: MAINT_MAX_ENTRIES, resetArchiveRetention: "14d", maxDiskBytes: MAINT_DISK }
  : { mode: "enforce", pruneAfter: "14d", maxEntries: MAINT_MAX_ENTRIES, resetArchiveRetention: "14d", maxDiskBytes: MAINT_DISK } };
if (MODE === "talk") {
  // V's talk.realtime minus instructions and secrets; the openai provider uses VLab's own OpenAI auth
  const talk = { realtime: { provider: "openai", mode: "realtime", brain: "agent-consult", consultRouting: "provider-direct", transport: "webrtc",
    providers: { openai: { model: "gpt-live-1-codex", voice: "sol", speakerVoice: "sol" } } } };
  config.talk = talk; workerConfig.talk = talk;
}
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- private makaron database holding only the chosen sessions ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
fs.mkdirSync(path.dirname(dstPath), { recursive: true });
function buildPrivateDatabase() {
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(dstPath, { allowExtension: true });
  src.loadExtension(vec);
  dst.loadExtension(vec);
  // Tables are copied in schema order, not dependency order; check keys once at the end.
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);

  const keys = new Set();
  for (const id of sessionIds) {
    const row = src.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(id);
    assert(row, `session ${id} is not in the shared VLab mirror`);
    keys.add(row.session_key);
  }
  const ids = new Set(sessionIds);
  const convs = new Set();
  for (const id of ids) {
    for (const r of src.prepare("SELECT conversation_id FROM session_conversations WHERE session_id = ?").all(id)) convs.add(r.conversation_id);
    const w = src.prepare("SELECT primary_conversation_id FROM session_windows WHERE session_id = ?").get(id);
    if (w?.primary_conversation_id) convs.add(w.primary_conversation_id);
  }
  const copied = {};
  const inList = (col, set) => `"${col}" IN (${[...set].map(() => "?").join(",")})`;
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    let where = "", args = [];
    // talk mode: every session's metadata (V-sized entry volume), transcripts only for the target
    if (MODE === "talk" && ["session_nodes", "session_windows", "conversations", "session_conversations", "session_participants", "session_members"].includes(t.name)) { where = ""; args = []; }
    else if (cols.includes("session_id")) { where = inList("session_id", ids); args = [...ids]; }
    else if (cols.includes("session_key")) { where = inList("session_key", keys); args = [...keys]; }
    else if (cols.includes("conversation_id")) {
      if (!convs.size) continue;
      where = inList("conversation_id", convs); args = [...convs];
    }
    const list = cols.map((c) => `"${c}"`).join(",");
    const rows = src.prepare(`SELECT ${list} FROM "${t.name}"${where ? ` WHERE ${where}` : ""}`).all(...args);
    if (!rows.length) continue;
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of rows) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
    copied[t.name] = rows.length;
  }
  const dangling = dst.prepare("PRAGMA foreign_key_check").all();
  if (MODE !== "talk") assert.equal(dangling.length, 0, `copied rows reference missing parents: ${JSON.stringify(dangling.slice(0, 5))}`);
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  src.close();
  dst.close();
  return { keys: [...keys], copied };
}


const count = (sql, ...a) => { const d = new DatabaseSync(dstPath, { readOnly: true }); try { return d.prepare(sql).get(...a).n; } finally { d.close(); } };
// ---- private Gateway ----
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) };
const lines = [];
let gateway, gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", ...(PROFILE_DIR ? ["--cpu-prof", `--cpu-prof-dir=${PROFILE_DIR}`, "--cpu-prof-interval=500"] : []), `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 40_000) lines.splice(0, lines.length - 40_000);
    });
  }
}
let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
        });
        client.start();
      });
      return;
    } catch (error) { lastError = error; client?.stop(); await sleep(1_000); }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}

const holdsSince = (t0) => lines.filter((l) => l.at >= t0 && l.line.includes("[hold-probe]")).map((l) => {
  const role = /^\[vlab-worker:\d+\]/u.test(l.line) ? "worker" : "gateway";
  try { return { role, ...JSON.parse(l.line.slice(l.line.indexOf("{"))) }; } catch { return null; }
}).filter(Boolean);
const site = (h) => h.stack.split(" < ").filter((f) => !/node-sqlite-|runSqlite[A-Za-z]*TransactionSync|withAgentDbProcessWriter|agent-db-process-coordinator|runWithSqliteBusyTimeout/u.test(f)).slice(0, 5).join(" < ");
const summarize = (holds) => {
  const g = {};
  for (const h of holds) (g[`${h.role} | ${h.op ?? "-"} | ${site(h)}`] ??= []).push(h.ms);
  return Object.entries(g).map(([k, v]) => ({ site: k, n: v.length, totalMs: v.reduce((a, b) => a + b, 0), maxMs: Math.max(...v) })).sort((a, b) => b.totalMs - a.totalMs).slice(0, 20);
};
const MAINT_SITE = /sessions\.planner\.analyze|history-eviction|enforceSessionHistory|pruneAllSessionTranscriptArchives|reclaimSqliteFreePages|SessionEntryMaintenance|pruneSessionEntries|capSessionEntries|deleteMaterializedSessionStatePlans/u;

// SPAWN=1: each turn starts a subagent, so the new session is created inside the Worker -- the way
// nightshift cards create sessions on V, and what makes the Worker run entry maintenance
const PROMPT = (i) => process.env.SPAWN === "1"
  ? `（自动化测试 maint-${i}）请调用 sessions_spawn 工具启动一个子 agent，任务是「只回复 ok」，等它完成后只回复：完成。`
  : `（自动化测试 maint-${i}）请调用 exec 工具执行 \`echo ok\` 一次，然后只回复：完成。`;
async function runTurn(i) {
  const sessionKey = `agent:makaron:feishu:direct:ou_maintprobe_${Date.now()}_${i}`;
  const started = Date.now();
  const child = spawn(process.execPath, [`${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--model", MODEL, "--message", PROMPT(i), "--json", "--timeout", "600"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (c) => { stderr += c; });
  const exit = await new Promise((resolve) => child.on("close", resolve));
  return { i, exit, secs: Math.round((Date.now() - started) / 1000), stderr: exit === 0 ? undefined : redact(stderr).slice(-300) };
}

const built = buildPrivateDatabase();
if (MODE !== "talk") {
  // make the copied sessions stale (30 days) so they are maintenance candidates, as V's old sessions are
  const d = new DatabaseSync(dstPath);
  const old = Date.now() - 30 * 86_400_000;
  d.exec("PRAGMA foreign_keys = OFF");
  d.prepare(`UPDATE session_nodes SET updated_at = ?, last_interaction_at = ?, last_activity_at = ?,
    entry_json = json_set(entry_json, '$.updatedAt', ?, '$.lastInteractionAt', ?, '$.sessionStartedAt', ?)`).run(old, old, old, old, old, old);
  d.prepare("UPDATE session_windows SET updated_at = ?, created_at = min(created_at, ?)").run(old, old);
  d.close();
}
const sessionsBefore = count("SELECT count(*) n FROM session_nodes");
startGateway();
try {
  await connectGateway();
  const t0 = Date.now();
  if (MODE === "talk") {
    const keys = [built.keys[0], `agent:makaron:feishu:group:talkprobe_new_${Date.now()}`];
    const calls = [];
    for (const sessionKey of keys) {
      for (let k = 0; k < 2; k++) {
        const started = Date.now();
        let ok = true, err, res;
        try {
          res = await client.request("talk.client.create", { sessionKey, mode: "realtime", transport: "webrtc", brain: "agent-consult", capabilities: ["voice-transcript"] });
        } catch (e) { ok = false; err = String(e?.message ?? e).slice(0, 200); }
        const ms = Date.now() - started;
        await sleep(300);
        const holds = holdsSince(started);
        calls.push({ sessionKey: sessionKey.slice(-30), ok, err, rpcMs: ms, holds: holds.map((h) => ({ role: h.role, ms: h.ms, op: h.op, site: site(h) })) });
        if (res?.voiceSessionId) { try { await client.request("talk.client.close", { sessionKey, voiceSessionId: res.voiceSessionId }); } catch {} }
        await sleep(1_000);
      }
    }
    console.log(JSON.stringify({ mode: MODE, probeMs: HOLD_PROBE_MS, calls, sampleStacks: holdsSince(t0).sort((a, b) => b.ms - a.ms).slice(0, 3) }, null, 1));
    assert(calls.some((c) => c.ok), "no talk.client.create succeeded; the scenario exercised nothing");
  } else {
    const turns = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => runTurn(i)));
    await sleep(20_000); // let fire-and-forget maintenance finish
    const holds = holdsSince(t0);
    const workerMaint = holds.filter((h) => h.role === "worker" && (MAINT_SITE.test(h.stack) || /planner\.analyze/u.test(h.op ?? "")));
    const sessionsAfter = count("SELECT count(*) n FROM session_nodes");
    const markers = lines.filter((l) => l.at >= t0 && l.line.includes("[maint-probe]")).map((l) => {
      const role = /^\[vlab-worker:\d+\]/u.test(l.line) ? "worker" : "gateway";
      const m = l.line.match(/\[maint-probe\] ([a-z-]+) (\{.*\})/u);
      return m ? { role, kind: m[1], ...JSON.parse(m[2]) } : null;
    }).filter(Boolean);
    const workerWork = markers.filter((m) => m.role === "worker" && (m.kind === "disk-sweep" || m.kind === "analyze" || (m.kind === "entries-deleted" && m.deletedEntries > 0)));
    const sweepLogs = lines.filter((l) => l.at >= t0 && /history-eviction|disk-budget|planner-statistics/u.test(l.line)).map((l) => redact(l.line).slice(0, 200)).slice(0, 10);
    console.log(JSON.stringify({ mode: MODE, copied: sessionIds.length, sessionsBefore, sessionsAfter, newSessions: CONCURRENCY, turns,
      holds: holds.length, workerMaintenanceHolds: workerMaint.length, markers: markers.slice(0, 30), workerWork: workerWork.length, bySite: summarize(holds), sweepLogs,
      sampleStacks: workerMaint.sort((a, b) => b.ms - a.ms).slice(0, 3) }, null, 1));
    assert(turns.some((t) => t.exit === 0), "no turn completed; maintenance was never kicked");
    if (MODE === "maint-bug") {
      // the failure path must be triggered, or this control proves nothing
      assert(workerWork.length > 0, `no Worker ran maintenance: ${JSON.stringify(markers.slice(0, 6))}`);
      assert(workerWork.some((m) => m.kind === "entries-deleted" || m.kind === "disk-sweep"), "Worker maintenance did not delete or sweep");
    } else {
      assert.equal(workerWork.length, 0, `Worker still ran maintenance: ${JSON.stringify(workerWork.slice(0, 3))}`);
      assert.equal(workerMaint.length, 0, `Worker still held the writer for maintenance: ${JSON.stringify(workerMaint.slice(0, 2))}`);
      assert(markers.some((m) => m.role === "worker" && m.kind === "entry-maintenance") || markers.every((m) => m.role !== "worker"), "unexpected Worker marker shape");
    }
  }
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}

// ---- where the Gateway spends time inside writer transactions (talk mode) ----
if (PROFILE_DIR) {
  const files = fs.readdirSync(PROFILE_DIR).filter((f) => f.endsWith(".cpuprofile"));
  const main = files.map((f) => path.join(PROFILE_DIR, f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  assert(main, "no Gateway CPU profile was written");
  const prof = JSON.parse(fs.readFileSync(main, "utf8"));
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = (n) => `${n.callFrame.functionName || "(anon)"} ${path.basename(n.callFrame.url || "")}:${n.callFrame.lineNumber + 1}`;
  const dt = new Map();
  prof.samples.forEach((id, i) => dt.set(i, (prof.timeDeltas[i + 1] ?? prof.timeDeltas[i] ?? 0) / 1000));
  // inclusive time of each frame that runs *inside* runSqliteTransactionSync
  const inside = new Map(); let txMs = 0;
  prof.samples.forEach((id, i) => {
    const chain = [];
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) chain.push(byId.get(cur));
    const tx = chain.findIndex((n) => n.callFrame.functionName === "runSqliteTransactionSync");
    if (tx < 0) return;
    txMs += dt.get(i);
    const seen = new Set();
    for (const n of chain.slice(0, tx)) { const k = label(n); if (seen.has(k)) continue; seen.add(k); inside.set(k, (inside.get(k) ?? 0) + dt.get(i)); }
  });
  const top = [...inside.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${Math.round(v)}ms ${k}`);
  console.log(JSON.stringify({ profile: path.basename(main), msInsideWriterTransactions: Math.round(txMs), insideTransactionInclusive: top }, null, 1));
}
