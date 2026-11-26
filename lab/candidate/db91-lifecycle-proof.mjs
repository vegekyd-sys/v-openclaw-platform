// Candidate test for the two DB91 defects of 2026-11-26 (docs/incidents/2026-11-26-gateway-tasks-max-crash-loop.md):
//
//  A. A process started by the Gateway (OpenClaw exec) that looks like `index.js gateway ...` must not start
//     a lifecycle of its own: no new epoch directory, no preflight, last-lifecycle.json untouched, so the next
//     clean restart still carries the running Gateway's checks.
//  B. After an unclean exit the preflight checks every agent database in full before admission. The first
//     open of an agent database on the Gateway main thread (memory search connection) must then not run a
//     second synchronous whole-database check, even when that lifecycle has no receipt for it. A revoked
//     database must still be checked in full.
//
// A private Gateway launched like V's unit (same flags and DB91 environment), makaron's session metadata
// as its agent database (MAKARON=meta) or a full consistent copy (MAKARON=full). The main thread's event
// loop delay is sampled inside the Gateway (--import monitor, 10 ms resolution). The memory search
// connection is opened through tools.invoke memory_search, which runs on the Gateway main thread.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const stateRoot = fs.realpathSync(stateDir);
const dist = path.join(runtime, "openclaw", "dist");
const MAKARON = process.env.MAKARON ?? "meta";
const SCENARIOS = (process.env.SCENARIOS ?? "child,crash,missing,revoked").split(",");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const data = process.env.VLAB_CANDIDATE_DATA ?? path.join(stateDir, "..");
const summary = { makaron: MAKARON, notes: [] };

// ---------------------------------------------------------------- configuration: V's routing, no channels, no cron
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins?.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, sessionsPerWorker: 3 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(sharedState, workerRel), "utf8")
    .replaceAll(sharedState, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerConfig.channels = {};
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");

// ---------------------------------------------------------------- private makaron database
const makaronPath = path.join(stateRoot, "agents", "makaron", "agent", "openclaw-agent.sqlite");
function buildMakaron() {
  if (fs.existsSync(makaronPath)) return { reused: true, bytes: fs.statSync(makaronPath).size };
  fs.mkdirSync(path.dirname(makaronPath), { recursive: true });
  const srcPath = path.join(sharedState, "agents", "makaron", "agent", "openclaw-agent.sqlite");
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  src.loadExtension(vec);
  if (MAKARON === "full") { // consistent online copy, page for page
    src.exec(`VACUUM INTO '${makaronPath.replaceAll("'", "''")}'`);
    src.close();
    const db = new DatabaseSync(makaronPath); db.exec("PRAGMA journal_mode = WAL"); db.close();
    return { full: true, bytes: fs.statSync(makaronPath).size };
  }
  const META = ["session_nodes", "session_windows", "conversations", "session_conversations", "session_participants", "session_members"];
  const dst = new DatabaseSync(makaronPath, { allowExtension: true });
  dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    if (!META.includes(t.name) && (cols.includes("session_id") || cols.includes("session_key") || cols.includes("conversation_id"))) continue;
    const list = cols.map((c) => `"${c}"`).join(",");
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of src.prepare(`SELECT ${list} FROM "${t.name}"`).iterate()) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  src.close(); dst.close();
  return { meta: true, bytes: fs.statSync(makaronPath).size };
}

// ---------------------------------------------------------------- Gateway launched like V's unit
const elFile = path.join(data, "el.jsonl");
const monitor = path.join(data, "el-monitor.mjs");
fs.writeFileSync(monitor, `
import { monitorEventLoopDelay } from "node:perf_hooks";
import { appendFileSync } from "node:fs";
if (process.argv.includes("gateway") && !process.argv.includes("--openclaw-database-verify-child")) {
  const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
  setInterval(() => { try { appendFileSync(${JSON.stringify(elFile)}, JSON.stringify({ t: Date.now(), pid: process.pid, max: Math.round(h.max / 1e6), p99: Math.round(h.percentile(99) / 1e6) }) + "\\n"); } catch {} h.reset(); }, 1000).unref();
}
`);
const env = {
  ...process.env,
  OPENCLAW_GATEWAY_PORT: String(port),
  OPENCLAW_DB91_INTEGRITY_ENABLE: "1",
  OPENCLAW_DB91_INTEGRITY_STATE_ROOT: stateRoot,
  OPENCLAW_DB91_PROVENANCE_ENABLE: "1",
  OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE: "1",
  OPENCLAW_DB91_MAINTENANCE_ENABLE: "1",
  OPENCLAW_DB91_READ_AHEAD_ENABLE: "1",
  OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE: "1",
  OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE: "1",
  OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE: "1",
  OPENCLAW_DB91_PREFLIGHT_TIMEOUT_MS: "3600000",
  OPENCLAW_CONFIG_PATH: configPath,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(monitor).href}`.trim(),
};
for (const key of Object.keys(env)) if (/^OPENCLAW_DB91_INTEGRITY_(EPOCH|DIR)$/u.test(key)) delete env[key];
const FLAGS = ["--experimental-async-context-frame", "--max-old-space-size=12288"];
const lines = [];
let gateway;
function capture(child, tag) {
  for (const s of [child.stdout, child.stderr]) {
    s.setEncoding("utf8");
    let rest = "";
    s.on("data", (chunk) => {
      const parts = (rest + chunk).split(/\r?\n/u); rest = parts.pop();
      for (const line of parts.filter(Boolean)) lines.push({ at: Date.now(), tag, line: line.replace(/\x1b\[[0-9;]*m/gu, "") });
      if (lines.length > 100_000) lines.splice(0, lines.length - 100_000);
    });
  }
}
let GatewayClient;
async function connect(timeoutMs = 5000) {
  GatewayClient ??= (await import(`${dist}/plugin-sdk/gateway-runtime.js`)).GatewayClient;
  let client;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, timeoutMs);
    client = new GatewayClient({
      url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
      scopes: ["operator.admin", "operator.read", "operator.write"],
      onHelloOk: () => { clearTimeout(timeout); resolve(); },
      onConnectError: (error) => { clearTimeout(timeout); reject(error); },
    });
    client.start();
  });
  return client;
}
const pick = (from, re) => lines.slice(from).filter((l) => l.tag === "gw" && re.test(l.line)).map((l) => l.line);
async function start(label) {
  const from = lines.length;
  const t0 = Date.now();
  gateway = spawn(process.execPath, [...FLAGS, `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  capture(gateway, "gw");
  let restarted = false;
  while (Date.now() - t0 < 3_600_000) {
    if (gateway.exitCode !== null) {
      if (!restarted && lines.slice(from).some((l) => /Restart OpenClaw so state migrations run|migration inputs changed/u.test(l.line))) { restarted = true; return start(label); }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    if (lines.slice(from).some((l) => /\[gateway\] ready/u.test(l.line))) break;
    await sleep(250);
  }
  const ready = Date.now() - t0;
  const preflight = pick(from, /\[db91-integrity\]/u);
  return { label, readyMs: ready, pid: gateway.pid, preflight, epoch: currentEpoch(), receipts: receipts() };
}
async function stop() {
  if (!gateway || gateway.exitCode !== null) return null;
  const t = Date.now();
  gateway.kill("SIGTERM");
  for (let i = 0; i < 240 && gateway.exitCode === null; i += 1) await sleep(250);
  if (gateway.exitCode === null) { gateway.kill("SIGKILL"); await sleep(500); return { stopMs: Date.now() - t, killed: true }; }
  return { stopMs: Date.now() - t, exitCode: gateway.exitCode };
}
async function crash() { // an unclean exit: the Gateway and everything it started die at once
  const pids = spawnSync("pgrep", ["-P", String(gateway.pid)], { encoding: "utf8" }).stdout.split(/\s+/u).filter(Boolean).map(Number);
  gateway.kill("SIGKILL");
  for (const pid of pids) { try { process.kill(pid, "SIGKILL"); } catch {} }
  for (let i = 0; i < 40 && gateway.exitCode === null && gateway.signalCode === null; i += 1) await sleep(250);
  await sleep(2_000);
}
const base = path.join(stateRoot, ".db91-integrity");
function currentEpoch() { try { return JSON.parse(fs.readFileSync(path.join(base, "last-lifecycle.json"), "utf8")).epoch; } catch { return null; } }
function epochs() { try { return fs.readdirSync(base).filter((f) => /^[a-f0-9-]{36}$/u.test(f)).sort(); } catch { return []; } }
function receipts(epoch = currentEpoch()) {
  if (!epoch) return null;
  const dir = path.join(base, epoch);
  try {
    return fs.readdirSync(dir).filter((f) => /^[a-f0-9]{64}(\.revoked)?\.json$/u.test(f) || f === "admission.json").map((f) => {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (f === "admission.json") return { admission: Object.keys(r.databases ?? {}).length };
      if (f.endsWith(".revoked.json")) return { revoked: r.reason };
      return { agent: r.identity?.agentId, source: r.source, ageS: Math.round((Date.now() - r.checkedAt) / 1000) };
    });
  } catch (error) { return `unavailable: ${error.code ?? error.message}`; }
}
const makaronReceipt = (epoch = currentEpoch()) => path.join(base, epoch, `${createHashHex(makaronPath)}.json`);
function createHashHex(value) { return spawnSync(process.execPath, ["-e", `process.stdout.write(require("crypto").createHash("sha256").update(${JSON.stringify(value)}).digest("hex"))`], { encoding: "utf8" }).stdout; }
const loopDelay = (t0, t1, pid) => (fs.existsSync(elFile) ? fs.readFileSync(elFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.pid === pid && e.t >= t0 && e.t <= t1 + 1500) : []);

// Opens makaron's memory search connection on the Gateway main thread and measures what it costs.
async function memorySearch(label) {
  const from = lines.length;
  const client = await connect();
  const t0 = Date.now();
  let response;
  try { response = await client.request("tools.invoke", { name: "memory_search", args: { query: "db91 lifecycle proof" }, agentId: "makaron", sessionKey: "agent:makaron:main" }, { timeoutMs: 3_600_000 }); }
  catch (error) { response = { error: String(error?.message ?? error).slice(0, 200) }; }
  finally { client.stop(); }
  const t1 = Date.now();
  await sleep(2_000);
  const samples = loopDelay(t0, t1, gateway.pid);
  const integrity = pick(from, /\[memory-database-preparation\].*"stage":"integrity"/u).map((l) => JSON.parse(l.slice(l.indexOf("{"))).ms);
  return {
    label, wallMs: t1 - t0, integrityMs: integrity, eventLoopMaxMs: Math.max(0, ...samples.map((s) => s.max)), samples: samples.length,
    gate: pick(from, /\[db91-integrity\]/u).slice(0, 6),
    toolOk: response?.ok ?? null, toolError: response?.error?.message ?? response?.error ?? null,
    receipts: receipts(),
  };
}

// ---------------------------------------------------------------- scenarios
console.log(JSON.stringify({ node: process.version, scenarios: SCENARIOS }));
summary.built = buildMakaron();
const results = [];
try {
  results.push(await start("warm-up (state migrations)"));
  await sleep(5_000);
  results.push({ stop: await stop() });
  results.push(await start("clean restart"));

  if (SCENARIOS.includes("child")) {
    // A. the agent's command: the unit's node flags and `index.js gateway --port <other>`, with the
    // environment every OpenClaw exec child inherits from the Gateway (DB91 lifecycle variables included).
    const parentEpoch = currentEpoch();
    const before = epochs();
    const childEnv = { ...env, OPENCLAW_DB91_INTEGRITY_EPOCH: parentEpoch, OPENCLAW_DB91_INTEGRITY_DIR: path.join(base, parentEpoch) };
    const from = lines.length;
    const child = spawn(process.execPath, [...FLAGS, `${dist}/index.js`, "gateway", "--port", String(port + 37)], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    capture(child, "child");
    for (let i = 0; i < 240 && child.exitCode === null; i += 1) await sleep(250);
    const exited = child.exitCode;
    if (child.exitCode === null) { child.kill("SIGKILL"); await sleep(500); }
    results.push({
      scenario: "child-of-gateway",
      childExit: exited, childPreflight: lines.slice(from).filter((l) => l.tag === "child" && /\[db91-integrity\]/u.test(l.line)).map((l) => l.line),
      pointerUnchanged: currentEpoch() === parentEpoch, newEpochDirs: epochs().filter((e) => !before.includes(e)).length,
      childTail: redact(lines.slice(from).filter((l) => l.tag === "child").slice(-4).map((l) => l.line).join(" | ")).slice(0, 600),
    });
    results.push({ stop: await stop() });
    results.push(await start("clean restart after the child ran"));
  }

  if (SCENARIOS.includes("crash")) {
    // B1. unclean exit -> full preflight -> first memory search connection on the main thread
    await crash();
    results.push(await start("after crash"));
    await sleep(10_000);
    results.push(await memorySearch("crash: first memory search"));
  }
  if (SCENARIOS.includes("missing")) {
    // B2. unclean exit and the lifecycle has no makaron receipt when the main thread opens it
    await crash();
    results.push(await start("after crash (receipt to be removed)"));
    await sleep(10_000);
    try { fs.unlinkSync(makaronReceipt()); results.at(-1).removed = true; } catch (error) { results.at(-1).removed = error.code; }
    results.push(await memorySearch("missing receipt: first memory search"));
  }
  if (SCENARIOS.includes("revoked")) {
    // B3. revoked (as after a verification failure or exclusive maintenance): the full check must still run
    await crash();
    results.push(await start("after crash (makaron to be revoked)"));
    await sleep(10_000);
    const gate = await import(pathToFileURL(path.join(dist, "db91-integrity-gate.mjs")).href);
    const epoch = currentEpoch();
    gate.invalidateVerification(makaronPath, { env: { OPENCLAW_DB91_INTEGRITY_EPOCH: epoch, OPENCLAW_DB91_INTEGRITY_DIR: path.join(base, epoch) }, reason: "candidate-revocation" });
    results.push(await memorySearch("revoked: first memory search"));
  }
  results.push({ stop: await stop() });
  results.push(await start("clean restart at the end"));
} catch (error) {
  summary.error = redact(error?.stack ?? error).slice(0, 2000);
} finally {
  results.push({ stop: await stop() });
}
summary.results = results;
console.log(JSON.stringify(summary, null, 1));
if (summary.error) process.exitCode = 1;
