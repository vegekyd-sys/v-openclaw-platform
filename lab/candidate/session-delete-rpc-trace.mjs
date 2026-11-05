// Which code reads every session's entry_json when the sessions.delete RPC deletes a session?
//
// Shared VLab after #558 (2026-11-05): each sessions.delete of a throwaway session took ~6.5 s in the
// Gateway and raised its RSS by ~290 MB, with or without a turn in flight. VLab's makaron store holds
// 3,813 rows / 131 MB of entry_json (skillsSnapshot 41 MB, systemPromptReport 80 MB, metadata 9 MB),
// so +290 MB is the raw column of every row as two-byte strings -- not the metadata projection.
//
// A private Gateway (candidate runtime = shared VLab's current release) runs on a private makaron
// database holding every session_nodes / session_windows / participant / conversation row of shared
// VLab (no transcripts). A preload wraps node:sqlite StatementSync.all/get/iterate and logs every
// statement on session_nodes that returns >= TRACE_MIN_CHARS characters, with its JS stack. The
// Gateway's VmRSS is sampled every 250 ms around each call.
//
// Scenarios, DELETES throwaway sessions each (created offline with one transcript message):
//   rpc-archive    sessions.delete { key }                         (deleteTranscript defaults to true)
//   rpc-keep       sessions.delete { key, deleteTranscript: false } (archiveTranscript false, like cron)
// Nothing is written to shared state: the shared database is opened read-only.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const DELETES = Number(process.env.DELETES ?? 2);
const TRACE_MIN_CHARS = Number(process.env.TRACE_MIN_CHARS ?? 5_000_000);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 8_000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const workDir = process.env.VLAB_CANDIDATE_DATA ?? stateDir;

// ---- preload: trace big session_nodes reads ----
const tracer = path.join(workDir, "sql-trace-preload.mjs");
fs.writeFileSync(tracer, `
import { StatementSync } from "node:sqlite";
Error.stackTraceLimit = 60;
const MIN = ${TRACE_MIN_CHARS};
const size = (row) => { let n = 0; if (row) for (const v of Object.values(row)) if (typeof v === "string") n += v.length; return n; };
const report = (stmt, rows, chars, ms) => {
  if (chars < MIN) return;
  const stack = String(new Error().stack).split("\\n").slice(3, 45).map((s) => s.trim().replace(/^at /u, "").replace(/\\(?file:[^)]*\\/dist\\//u, "(")).join(" < ");
  process.stderr.write("[sql-trace] " + JSON.stringify({ at: Date.now(), pid: process.pid, chars, rows, ms: Math.round(ms), sql: String(stmt.sourceSQL).replace(/\\s+/gu, " ").slice(0, 240), stack }) + "\\n");
};
const watched = (stmt) => /session_nodes/u.test(String(stmt.sourceSQL));
const all = StatementSync.prototype.all;
StatementSync.prototype.all = function (...args) {
  if (!watched(this)) return all.apply(this, args);
  const t = performance.now(); const rows = all.apply(this, args);
  report(this, rows.length, rows.reduce((n, r) => n + size(r), 0), performance.now() - t); return rows;
};
const get = StatementSync.prototype.get;
StatementSync.prototype.get = function (...args) {
  if (!watched(this)) return get.apply(this, args);
  const t = performance.now(); const row = get.apply(this, args);
  report(this, row ? 1 : 0, size(row), performance.now() - t); return row;
};
const iterate = StatementSync.prototype.iterate;
StatementSync.prototype.iterate = function (...args) {
  const it = iterate.apply(this, args);
  if (!watched(this)) return it;
  const stmt = this; const t = performance.now(); let rows = 0, chars = 0, done = false;
  const finish = () => { if (!done) { done = true; report(stmt, rows, chars, performance.now() - t); } };
  return { [Symbol.iterator]() { return this; },
    next() { const r = it.next(); if (r.done) finish(); else { rows += 1; chars += size(r.value); } return r; },
    return(v) { finish(); return it.return ? it.return(v) : { done: true, value: v }; } };
};
`);

// ---- config: no channels, no cron, one Worker, V's session maintenance ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
config.session = { ...(config.session ?? {}), maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(sharedState, workerRel), "utf8")
    .replaceAll(sharedState, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerConfig.channels = {};
  workerConfig.session = config.session;
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- private makaron database: every session row, no transcripts ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
fs.mkdirSync(path.dirname(dstPath), { recursive: true });
const FULL_TABLES = ["session_nodes", "session_windows", "conversations", "session_conversations", "session_participants", "session_members", "session_transcript_index_state", "session_progress_cards"];
function buildPrivateDatabase() {
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(dstPath, { allowExtension: true });
  src.loadExtension(vec);
  dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  const copied = {};
  // Session tables in full; other tables only when they carry no per-session data (schema
  // ownership, settings): transcripts, trajectories and memory stay out.
  const columnsOf = (name) => src.prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name);
  const metadataTable = (t) => !/^(memory_|transcript_|trajectory_|standing_intents_fts)/u.test(t.name)
    && !columnsOf(t.name).some((c) => ["session_id", "session_key", "conversation_id"].includes(c));
  for (const t of tables.filter((t) => FULL_TABLES.includes(t.name) || metadataTable(t))) {
    const cols = columnsOf(t.name);
    const list = cols.map((c) => `"${c}"`).join(",");
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    let n = 0;
    for (const r of src.prepare(`SELECT ${list} FROM "${t.name}"`).iterate()) { ins.run(...cols.map((c) => r[c])); n += 1; }
    dst.exec("COMMIT");
    copied[t.name] = n;
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  const size = dst.prepare("SELECT count(*) AS rows, sum(length(entry_json)) AS chars FROM session_nodes").get();
  dst.exec("PRAGMA journal_mode = WAL");
  src.close();
  dst.close();
  return { copied, entryJson: size };
}

// ---- throwaway sessions, created offline through OpenClaw's own accessors ----
const keys = Object.fromEntries(["rpc-archive", "rpc-keep"].map((s) => [s, Array.from({ length: DELETES }, (_, i) => `agent:makaron:explicit:sdel-trace-${s}-${i}`)]));
const SEED_SRC = `
const path = require("node:path");
(async () => {
  const [dist, storePath, keysJson] = process.argv.slice(1);
  const { _: replaceSessionEntry } = await import(path.join(dist, "session-accessor.sqlite-entry-BlklNPKQ.js"));
  const { _t: appendTranscriptMessage } = await import(path.join(dist, "session-accessor-K0XuW6ln.js"));
  for (const sessionKey of JSON.parse(keysJson)) {
    const sessionId = "sdel-trace-" + sessionKey.split(":").pop();
    await replaceSessionEntry({ sessionKey, storePath }, { sessionId, updatedAt: Date.now() });
    await appendTranscriptMessage({ sessionId, sessionKey, storePath }, { message: { role: "user", content: "sdel trace " + sessionId } });
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
`;

// ---- managed npm plugins (codex etc.) as installed on shared VLab; the private state has none ----
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(sharedState, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}
const cacheDir = path.join(workDir, "cache");
fs.mkdirSync(cacheDir, { recursive: true });

// ---- private Gateway ----
const env = { ...process.env, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"), OPENCLAW_GATEWAY_PORT: String(port), NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${tracer}`.trim() };
const lines = [];
let gateway, gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    let rest = "";
    s.on("data", (chunk) => {
      const parts = (rest + chunk).split(/\r?\n/u);
      rest = parts.pop();
      for (const line of parts.filter(Boolean)) lines.push({ at: Date.now(), line });
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
const rssMiB = () => {
  try { return Math.round(Number(fs.readFileSync(`/proc/${gateway.pid}/status`, "utf8").match(/^VmRSS:\s+(\d+)/mu)[1]) / 1024); } catch { return null; }
};
const traces = (from, to) => lines.filter((l) => l.at >= from && l.at <= to && l.line.includes("[sql-trace]")).map((l) => {
  try { return JSON.parse(l.line.slice(l.line.indexOf("{"))); } catch { return null; }
}).filter(Boolean);

const out = { fixture: buildPrivateDatabase() };
const storePath = path.join(stateDir, "agents", "makaron", "sessions", "sessions.json");
const seeded = spawnSync(process.execPath, ["-e", SEED_SRC, dist, storePath, JSON.stringify(Object.values(keys).flat())], { env: process.env, encoding: "utf8" });
assert.equal(seeded.status, 0, `seed failed: ${redact(seeded.stderr).slice(0, 1500)}`);
console.error(`[sdel-trace] fixture ${JSON.stringify(out.fixture)}`);

startGateway();
try {
  await connectGateway();
  // Let startup work (projections, caches, maintenance) settle before measuring.
  await sleep(Number(process.env.WARM_MS ?? 60_000));
  out.idleTraces = traces(0, Date.now()).map((t) => ({ chars: t.chars, ms: t.ms, sql: t.sql.slice(0, 120), stack: t.stack.split(" < ").slice(0, 6).join(" < ") }));
  out.calls = [];
  for (const [scenario, list] of Object.entries(keys)) {
    for (const key of list) {
      const samples = [];
      const sampler = setInterval(() => samples.push(rssMiB()), 250);
      await sleep(2_000);
      const before = Math.max(...samples.filter((v) => v != null));
      const t0 = Date.now();
      let ok = true, err, res;
      try {
        res = await client.request("sessions.delete", scenario === "rpc-keep" ? { key, deleteTranscript: false } : { key }, { timeoutMs: 120_000 });
      } catch (e) { ok = false; err = redact(String(e?.message ?? e)).slice(0, 200); }
      const rpcMs = Date.now() - t0;
      await sleep(SETTLE_MS);
      clearInterval(sampler);
      const after = samples.slice(8).filter((v) => v != null);
      const reads = traces(t0, Date.now());
      const call = { scenario, key: key.split(":").pop(), ok, err, deleted: res?.deleted, rpcMs, rssBeforeMiB: before, rssPeakMiB: Math.max(...after), rssGrowthMiB: Math.max(...after) - before,
        bigReads: reads.map((t) => ({ chars: t.chars, rows: t.rows, ms: t.ms, sql: t.sql, stack: t.stack })) };
      out.calls.push(call);
      console.error(`[sdel-trace] ${scenario} ${call.key} ok=${ok} rpc=${rpcMs}ms rss +${call.rssGrowthMiB} MiB, big reads ${reads.length}: ${reads.map((t) => `${t.chars}c/${t.ms}ms`).join(", ")}`);
      for (const t of reads) console.error(`[sdel-trace]   ${t.sql.slice(0, 160)}\n[sdel-trace]   at ${t.stack.split(" < ").slice(0, 40).join(" < ")}`);
    }
  }
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(5_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
console.log(JSON.stringify(out));
assert(out.calls.every((c) => c.ok && c.deleted), "every throwaway session must be deleted");
