// Reproduction of the 2026-10-19 02:20 V stall inside a real Gateway process: a Control UI opened
// agent:makaron:main; chat.history and sessions.branches.list both returned after 49.7 s and the
// main thread was held ~43 s (heap 2 -> 4.24 GiB). Standalone handler runs do not show it, so this
// starts a private Gateway on the candidate runtime with the shared VLab configuration (channels
// and cron off), an online backup of the whole shared makaron database, and V's DB91
// integrity gate, then replays the Control UI's open sequence over the Gateway WebSocket while the
// Gateway's inspector records a CPU profile.
//
// Reported per open: every RPC's latency, the longest main-thread busy stretch in the profile, the
// Gateway's own liveness/memory warnings, and the top self/total functions during the open.
// Nothing shared is written: the shared database is only read by the backup.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = fs.realpathSync(process.env.OPENCLAW_STATE_DIR);
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA;
assert(runtime && configPath && stateDir && sharedState && data, "candidate runtime environment is required");
const DIST = process.env.DIST ?? path.join(runtime, "openclaw", "dist");
const KEYS = JSON.parse(process.env.KEYS ?? '["agent:makaron:main","agent:makaron:main"]');
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 60_000);
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT ?? 1000);
const INSPECT_PORT = 9300 + (process.pid % 500);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- configuration: shared VLab, without inbound channels, cron, or extra workers ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
// The candidate runtime has no external codex plugin; the Gateway would try to npm-install it.
if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins?.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith(".."), "worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(sharedState, rel), "utf8").replaceAll(sharedState, stateDir).replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerConfig.channels = {};
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, JSON.stringify(workerConfig, null, 2), { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && token, "candidate Gateway port/token missing");

// ---- the whole makaron database (the integrity preflight refuses symlinked databases) ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const dbFile = path.join(stateDir, dbRel);
assert(!fs.existsSync(dbFile), "candidate state already has a makaron database");
let gateway;
const cleanup = () => { try { gateway?.kill("SIGKILL"); } catch {} for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbFile + suffix, { force: true }); };
process.on("exit", cleanup);
let t0 = Date.now();
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
execFileSync("sqlite3", [path.join(sharedState, dbRel), `.backup '${dbFile}'`], { stdio: "inherit" });
console.log(JSON.stringify({ backupMs: Date.now() - t0, bytes: fs.statSync(dbFile).size }));

// ---- Gateway as on V: inspector, 12 GiB heap, DB91 integrity gate ----
const lines = [];
const shortTmp = fs.mkdtempSync("/tmp/.cuo-");
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: path.join(data, "cache"), npm_config_cache: path.join(data, "cache", "npm"),
  OPENCLAW_DB91_INTEGRITY_ENABLE: "1", OPENCLAW_DB91_INTEGRITY_STATE_ROOT: stateDir };
gateway = spawn(process.execPath, ["--experimental-async-context-frame", `--inspect=127.0.0.1:${INSPECT_PORT}`, "--max-old-space-size=12288", `${DIST}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
for (const stream of [gateway.stdout, gateway.stderr]) {
  stream.setEncoding("utf8");
  let rest = "";
  stream.on("data", (chunk) => {
    const parts = (rest + chunk).split(/\r?\n/u);
    rest = parts.pop();
    for (const line of parts.filter(Boolean)) lines.push({ at: Date.now(), line });
    if (lines.length > 100_000) lines.splice(0, lines.length - 100_000);
  });
}
const { GatewayClient } = await import(`${DIST}/plugin-sdk/gateway-runtime.js`);
let client;
t0 = Date.now();
for (let deadline = Date.now() + 1_800_000; ; ) {
  assert(gateway.exitCode === null, `Gateway exited ${gateway.exitCode}\n${lines.slice(-40).map((l) => l.line).join("\n")}`);
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
      client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
        scopes: ["operator.admin", "operator.read", "operator.write"],
        onHelloOk: () => { clearTimeout(timeout); resolve(); }, onConnectError: (error) => { clearTimeout(timeout); reject(error); } });
      client.start();
    });
    break;
  } catch (error) { client?.stop(); assert(Date.now() < deadline, `Gateway not ready: ${error?.message}`); await sleep(1_000); }
}
console.log(JSON.stringify({ readyMs: Date.now() - t0 }));
await sleep(SETTLE_MS);

// ---- inspector: CPU profile of the Gateway main thread ----
const target = (await (await fetch(`http://127.0.0.1:${INSPECT_PORT}/json/list`)).json())[0];
const inspector = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { inspector.onopen = resolve; inspector.onerror = reject; });
let nextId = 1;
const pending = new Map();
inspector.onmessage = (event) => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } };
const send = (method, params = {}) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); inspector.send(JSON.stringify({ id, method, params })); });
await send("Profiler.enable");
await send("Profiler.setSamplingInterval", { interval: 1000 });

function summarize(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const label = (node) => `${node.callFrame.functionName || "(anon)"} ${path.basename(node.callFrame.url || "")}:${node.callFrame.lineNumber + 1}`;
  const self = new Map(), total = new Map();
  let busy = 0, longest = 0, longestEndUs = 0, clock = profile.startTime;
  profile.samples.forEach((id, i) => {
    const us = profile.timeDeltas[i] ?? 0;
    clock += us;
    const node = byId.get(id);
    const idle = node.callFrame.functionName === "(idle)";
    busy = idle ? 0 : busy + us;
    if (busy > longest) { longest = busy; longestEndUs = clock; }
    if (idle) return;
    self.set(label(node), (self.get(label(node)) ?? 0) + us);
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const l = label(byId.get(cur));
      if (!seen.has(l)) { seen.add(l); total.set(l, (total.get(l) ?? 0) + us); }
    }
  });
  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, us]) => `${Math.round(us / 1000)}ms ${name}`);
  return { longestBusyMs: Math.round(longest / 1000), longestBusyEndsMsAfterStart: Math.round((longestEndUs - profile.startTime) / 1000), self: top(self, 25), total: top(total, 45).filter((l) => !/\(root\)|\(program\)|processTicksAndRejections|runMicrotasks/u.test(l)) };
}

async function timed(method, params) {
  const started = Date.now();
  try {
    const result = await client.request(method, params, { timeoutMs: 600_000 });
    return { method, ms: Date.now() - started, ok: true, bytes: JSON.stringify(result ?? null).length };
  } catch (error) {
    return { method, ms: Date.now() - started, ok: false, error: String(error?.message ?? error).slice(0, 160) };
  }
}

for (const [index, sessionKey] of KEYS.entries()) {
  const at = Date.now();
  await send("Profiler.start");
  // The Control UI's own order on V (conn 5691098d): shell requests first, then history+branches.
  const shell = await Promise.all([
    timed("skills.status", {}), timed("sessions.list", { agentId: "makaron", limit: 100, includeLastMessage: true }), timed("question.list", {}),
    timed("chat.metadata", { sessionKey }), timed("config.get", {}), timed("sessions.messages.subscribe", { key: sessionKey }),
    timed("tools.effective", { sessionKey }), timed("config.get", {}),
  ]);
  const open = await Promise.all([timed("chat.history", { sessionKey, limit: HISTORY_LIMIT }), timed("sessions.branches.list", { sessionKey })]);
  const { profile } = (await send("Profiler.stop")).result;
  const warnings = lines.filter((l) => l.at >= at && /liveness heartbeat delayed|memory pressure|slow OpenClaw agent database|slow SQLite|db91-integrity/u.test(l.line)).map((l) => l.line.slice(0, 260));
  console.log(JSON.stringify({ open: index, sessionKey, shell, history: open[0], branches: open[1], warnings, profile: summarize(profile) }, null, 1));
  await sleep(5_000);
}
inspector.close();
client.stop();
gateway.kill("SIGTERM");
await sleep(3_000);
