// restart-time: where a Gateway start spends its time once the subagent registry is V-sized.
//
// Production V, 2026-11-28 23:41 (v-self-restart 20261128-234136-899e), offsets from systemd Start:
// "startup outcomes" +90.6 s, "[gateway] ready" +157.8 s with the main thread silent in between
// (liveness overdue 46.5 s, heap 6.57 GiB at ready), then a second 62 s main-thread block
// (ELU 1, cpuCoreRatio 1.0) before cron started at +243.7 s. Feishu's WebSocket was up at +67.6 s
// but nothing it received could run until +242 s.
//
// V, read-only, 2026-11-29 00:1x CST: subagent_runs 33,729 rows / 404 MB payload JSON; 33,723 are
// terminal with cleanupCompletedAt set, 33,677 of them cleanup=keep, spawnMode=run, no archiveAtMs,
// delivery not_required (30,987 plugin:workboard, 2,405 plugin:v-meeting-bridge). Every child key
// has a session_nodes row; a 300-key sample averaged 103.5 KB of entry JSON.
//
// This runs a private Gateway on the candidate runtime (V's bytes unless the plan replaces files),
// on a private makaron store inflated to V's size (lab/candidate/v-scale-session-fixture.mjs) and a
// private state database whose subagent_runs table holds RUNS terminal "keep" rows shaped like V's
// Workboard rows, each pointing at one of the inflated child sessions. The main thread is
// CPU-profiled from boot; a cheap RPC every second measures the event loop from outside, /proc
// gives RSS, and the profile is aggregated per startup segment and per stall.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildVScaleSessionDatabase } from "./v-scale-session-fixture.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const RUNS = Number(process.env.RUNS ?? 33700);
const TARGET_ROWS = Number(process.env.TARGET_ROWS ?? RUNS + 200);
const TARGET_ENTRY_BYTES = Number(process.env.TARGET_ENTRY_BYTES ?? 103000);
const TASK_BYTES = Number(process.env.TASK_BYTES ?? 6000);
const WINDOW_SECONDS = Number(process.env.WINDOW_SECONDS ?? 420);
const WORKERS = Number(process.env.WORKERS ?? 2);
const HEAP_MB = Number(process.env.HEAP_MB ?? 12288);
const PROFILE = process.env.PROFILE !== "0";
const LABEL = process.env.LABEL ?? "run";
// CODEX=1 keeps the Codex plugin (the shared VLab npm install, linked read-only) and inflates its
// thread-binding namespace to V's size: 15,171 active rows of ~31 KB (V 2026-11-29, 447 MB).
const CODEX = process.env.CODEX === "1";
const BINDINGS = Number(process.env.BINDINGS ?? 15171);
const BINDING_BYTES = Number(process.env.BINDING_BYTES ?? 31000);
const CRON = process.env.CRON === "1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/gu, "");
const dist = path.join(runtime, "openclaw", "dist");
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });

// ---- configuration: V's routing, closed model port, no channels ----
const dead = await freePort();
const MODEL = "deepseek/deepseek-flash";
function asProduction(config, runtimeId) {
  const deepseek = config.models?.providers?.deepseek;
  assert(deepseek, "shared VLab config has no deepseek provider");
  deepseek.baseUrl = `http://127.0.0.1:${dead}/v1`;
  const model = { primary: MODEL, fallbacks: [] };
  const perAgent = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) { config.agents.entries.makaron.model = model; (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent; }
  config.channels = {};
  if (!CODEX && config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.session = { ...(config.session ?? {}), maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  if (!CRON) config.cron = { ...(config.cron ?? {}), enabled: false };
  return config;
}
const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured");
Object.assign(workerPlugin, { minWorkers: WORKERS, maxWorkers: WORKERS, sessionsPerWorker: 1, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = asProduction(JSON.parse(fs
  .readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), "openclaw");
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- fixtures ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const agentDbPath = path.join(stateDir, dbRel);
const stateDbPath = path.join(stateDir, "state", "openclaw.sqlite");

function seedSubagentRuns() {
  assert(fs.existsSync(stateDbPath), `state database missing at ${stateDbPath} (add state/openclaw.sqlite to the plan's databases)`);
  const agentDb = new DatabaseSync(agentDbPath, { readOnly: true });
  const children = agentDb.prepare("SELECT session_key, current_session_id FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:%' AND entry_valid = 1 ORDER BY rowid DESC LIMIT ?").all(RUNS);
  agentDb.close();
  assert(children.length >= Math.min(RUNS, 1000), `only ${children.length} child sessions to point runs at`);
  const db = new DatabaseSync(stateDbPath);
  db.exec("PRAGMA busy_timeout = 30000");
  const before = db.prepare("SELECT count(*) n FROM subagent_runs").get().n;
  const ins = db.prepare("INSERT INTO subagent_runs (run_id, child_session_key, controller_session_key, requester_session_key, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)");
  const filler = "w".repeat(TASK_BYTES);
  const now = Date.now();
  db.exec("BEGIN");
  children.forEach((child, i) => {
    const runId = `workboard:${randomUUID()}:${randomUUID().slice(0, 18)}`;
    const createdAt = now - 3 * 86400e3 - i * 60e3;
    const startedAt = createdAt + 300;
    const endedAt = startedAt + 600e3;
    const payload = {
      runId, taskRunId: runId, childSessionKey: child.session_key,
      controllerSessionKey: "agent:makaron:main", requesterSessionKey: "agent:makaron:main",
      requesterDisplayKey: "main", requesterAgentId: "makaron",
      task: filler, cleanup: "keep", expectsCompletionMessage: false, spawnMode: "run",
      label: i % 13 === 0 ? "plugin:v-meeting-bridge" : "plugin:workboard",
      runTimeoutSeconds: 0, swarmLaunchPending: false, generation: 2, createdAt,
      execution: { status: "terminal", startedAt, lifecycleGeneration: randomUUID(), endedAt, outcome: { status: "ok", startedAt, endedAt, elapsedMs: endedAt - startedAt } },
      completion: { required: false, terminalReply: { disposition: "message", text: "done ".repeat(120) }, resultText: "done ".repeat(120), capturedAt: endedAt },
      delivery: { status: "not_required" },
      sessionStartedAt: createdAt, accumulatedRuntimeMs: 0, cleanupHandled: true, endedReason: "subagent-complete",
      endedHookEmittedAt: endedAt + 300, browserCleanupDispatchedAt: endedAt + 350, cleanupCompletedAt: endedAt + 500,
    };
    ins.run(runId, child.session_key, "agent:makaron:main", "agent:makaron:main", createdAt, JSON.stringify(payload));
  });
  db.exec("COMMIT");
  const after = db.prepare("SELECT count(*) n, sum(length(payload_json)) b FROM subagent_runs").get();
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  return { before, rows: after.n, payloadMb: Math.round(after.b / 1048576) };
}

function seedCodexBindings() {
  const npm = path.join(stateDir, "npm");
  if (!fs.existsSync(npm)) fs.symlinkSync(path.join(sharedState, "npm"), npm);
  const db = new DatabaseSync(stateDbPath);
  db.exec("PRAGMA busy_timeout = 30000");
  const template = db.prepare("SELECT entry_key, value_json FROM plugin_state_entries WHERE plugin_id = 'codex' AND namespace = 'app-server-thread-bindings' ORDER BY length(value_json) DESC LIMIT 1").get();
  assert(template, "no Codex binding row to use as a template");
  const value = JSON.parse(template.value_json);
  assert(value?.binding, "unexpected Codex binding shape");
  const pad = Math.max(0, BINDING_BYTES - template.value_json.length);
  value.binding.appServerRuntimeFingerprint = `${value.binding.appServerRuntimeFingerprint ?? ""}${"f".repeat(pad)}`;
  const before = db.prepare("SELECT count(*) n FROM plugin_state_entries WHERE plugin_id = 'codex' AND namespace = 'app-server-thread-bindings'").get().n;
  const ins = db.prepare("INSERT OR IGNORE INTO plugin_state_entries (plugin_id, namespace, entry_key, value_json, created_at, expires_at) VALUES ('codex', 'app-server-thread-bindings', ?, ?, ?, NULL)");
  const now = Date.now();
  db.exec("BEGIN");
  for (let i = before; i < BINDINGS; i += 1) {
    const row = { ...value, sessionId: randomUUID(), binding: { ...value.binding, threadId: randomUUID(), clientId: randomUUID() } };
    ins.run(`session-key:makaron:${randomUUID().replaceAll("-", "")}${String(i).padStart(11, "0")}`, JSON.stringify(row), now - (BINDINGS - i) * 60e3);
  }
  db.exec("COMMIT");
  const after = db.prepare("SELECT count(*) n, sum(length(value_json)) b FROM plugin_state_entries WHERE plugin_id = 'codex' AND namespace = 'app-server-thread-bindings'").get();
  db.close();
  return { before, rows: after.n, mb: Math.round(after.b / 1048576) };
}

// ---- private Gateway, profiled from boot ----
const inspectPort = await freePort();
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_FIRSTTEXT_WORKER_PHASES: "1" };
const lines = [];
let gateway, client;
const marks = {};
const MARKS = [
  ["config", /\[gateway\] loading configuration/u],
  ["starting", /\[gateway\] starting\.\.\./u],
  ["http", /\[gateway\] starting HTTP server/u],
  ["listening", /http server listening/u],
  ["poolReady", /"stage":"pool-ready"/u],
  ["outcomes", /startup outcomes/u],
  ["ready", /\[gateway\] ready/u],
];
function startGateway({ inspect }) {
  for (const k of Object.keys(marks)) delete marks[k];
  marks.spawn = Date.now();
  const args = ["--experimental-async-context-frame"];
  if (inspect) args.push(`--inspect=127.0.0.1:${inspectPort}`);
  args.push(`--max-old-space-size=${HEAP_MB}`, `${dist}/index.js`, "gateway", "--port", String(port));
  gateway = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const raw of chunk.split(/\r?\n/u).filter(Boolean)) {
        const line = stripAnsi(raw);
        const at = Date.now();
        lines.push({ at, line });
        for (const [k, re] of MARKS) if (!marks[k] && re.test(line)) marks[k] = at;
      }
      if (lines.length > 100_000) lines.splice(0, lines.length - 100_000);
    });
  }
}
async function attachProfiler() {
  for (let i = 0; i < 400; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${inspectPort}/json/list`)).json();
      if (list[0]?.webSocketDebuggerUrl) {
        const ws = new WebSocket(list[0].webSocketDebuggerUrl);
        ws.onerror = () => {};
        let id = 0; const pending = new Map();
        const send = (method, params = {}) => new Promise((resolve, reject) => { const i2 = ++id; pending.set(i2, { resolve, reject }); ws.send(JSON.stringify({ id: i2, method, params })); });
        ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
        await new Promise((r) => (ws.onopen = r));
        await send("Profiler.enable");
        await send("Profiler.setSamplingInterval", { interval: 2000 });
        const startedWall = Date.now();
        await send("Profiler.start");
        return { startedWall, stop: async () => { const { profile } = await send("Profiler.stop"); ws.close(); return profile; } };
      }
    } catch { /* not up yet */ }
    await sleep(25);
  }
  throw new Error("Gateway inspector did not come up");
}
async function connectClient(deadlineMs = 1_200_000) {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + deadlineMs;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
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
    } catch (error) { lastError = error; client?.stop(); await sleep(500); }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}
async function stopGateway() {
  client?.stop();
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  for (let i = 0; i < 120 && gateway.exitCode === null; i += 1) await sleep(500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  await sleep(1_000);
}
const rssMb = () => { try { return Math.round(Number(fs.readFileSync(`/proc/${gateway.pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/u)[1]) / 1024); } catch { return null; } };

process.on("uncaughtException", (error) => console.error(`[restart-time] uncaught ${redact(error?.stack ?? error).slice(0, 12000)}`));
const fixture = { sessions: buildVScaleSessionDatabase({ runtime, srcPath: path.join(sharedState, dbRel), dstPath: agentDbPath, targetRows: TARGET_ROWS, targetEntryBytes: TARGET_ENTRY_BYTES, orphanWindows: 0 }) };
fixture.runs = seedSubagentRuns();
if (CODEX) fixture.codexBindings = seedCodexBindings();
console.error(`[restart-time] ${LABEL} fixture ${JSON.stringify(fixture)}`);

// warm-up boot: migrations and first-start work happen once on V too; measure a restart
{
  startGateway({ inspect: false });
  let restarted = false;
  for (;;) {
    try { await connectClient(); break; } catch (error) {
      if (!restarted && gateway.exitCode !== null && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { restarted = true; startGateway({ inspect: false }); continue; }
      throw error;
    }
  }
  for (let i = 0; i < 600 && !marks.ready; i += 1) await sleep(500);
  console.error(`[restart-time] warm-up boot ready after ${Math.round(((marks.ready ?? Date.now()) - marks.spawn) / 1000)} s`);
  await sleep(10_000);
  await stopGateway();
  lines.length = 0;
}

const samples = [];
const pings = [];
let summary;
try {
  startGateway({ inspect: PROFILE });
  const prof = PROFILE ? await attachProfiler() : null;
  const rssTimer = setInterval(() => samples.push({ at: Date.now(), rssMb: rssMb() }), 500);
  await connectClient();
  const connectedAt = Date.now();
  const end = marks.spawn + WINDOW_SECONDS * 1000;
  let inFlight = false;
  const pingTimer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    const sent = Date.now();
    client.request("voicewake.get", {}).then(() => pings.push({ sent, ms: Date.now() - sent }), () => pings.push({ sent, ms: Date.now() - sent, error: true })).finally(() => { inFlight = false; });
  }, 1000);
  while (Date.now() < end && gateway.exitCode === null) await sleep(1000);
  clearInterval(pingTimer); clearInterval(rssTimer);
  const crashed = gateway.exitCode !== null;
  const profile = crashed || !prof ? null : await prof.stop();
  const base = marks.spawn;
  const rel = (t) => (t ? Math.round((t - base) / 100) / 10 : null);
  // stalls after the client connected: a ping >= 3 s, merged when within 1.5 s
  const merged = [];
  for (const s of pings.filter((p) => p.ms >= 3000).map((p) => ({ from: p.sent, to: p.sent + p.ms })).sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1); if (last && s.from <= last.to + 1500) last.to = Math.max(last.to, s.to); else merged.push({ ...s });
  }
  const peakRss = (from, to) => Math.max(0, ...samples.filter((x) => x.at >= from && x.at <= to + 3000).map((x) => x.rssMb ?? 0));
  const segments = [
    ["boot->listening", marks.spawn, marks.listening],
    ["listening->outcomes", marks.listening, marks.outcomes],
    ["outcomes->ready", marks.outcomes, marks.ready],
    ["ready->+90s", marks.ready, marks.ready ? marks.ready + 90_000 : null],
  ].filter(([, a, b]) => a && b).map(([name, from, to]) => ({ name, from, to }));
  const windows = [...segments, ...merged.map((w, i) => ({ name: `stall${i + 1}`, ...w }))];
  let profiled = windows.map((w) => ({ name: w.name, fromS: rel(w.from), lengthS: Math.round((w.to - w.from) / 100) / 10, peakRssMb: peakRss(w.from, w.to) }));
  if (profile) {
    const byId = new Map(profile.nodes.map((n) => [n.id, n])); const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const label = (n) => `${n.callFrame.functionName || "(anon)"} ${path.basename(n.callFrame.url || "").replace(/-[A-Za-z0-9_-]{8}\.js$/u, "")}:${n.callFrame.lineNumber + 1}`;
    const generic = /^(\(root\)|\(program\)|\(anon\)|runMicrotasks|processTicksAndRejections|run|bound|next|all|fn)$/u;
    const acc = windows.map(() => ({ incl: new Map(), self: new Map(), busy: 0, gc: 0 }));
    let t = profile.startTime;
    profile.samples.forEach((sid, i) => {
      t += profile.timeDeltas[i];
      const wall = prof.startedWall + (t - profile.startTime) / 1000; const dt = (profile.timeDeltas[i + 1] ?? 2000) / 1000;
      const n = byId.get(sid); const fn = n.callFrame.functionName;
      if (fn === "(idle)") return;
      windows.forEach((w, wi) => {
        if (wall < w.from || wall > w.to) return;
        const a = acc[wi];
        if (fn === "(garbage collector)") a.gc += dt;
        a.busy += dt; a.self.set(label(n), (a.self.get(label(n)) ?? 0) + dt);
        const seen = new Set();
        for (let c = sid; c !== undefined; c = parent.get(c)) { const node = byId.get(c); if (generic.test(node.callFrame.functionName || "(anon)")) continue; const k = label(node); if (seen.has(k)) continue; seen.add(k); a.incl.set(k, (a.incl.get(k) ?? 0) + dt); }
      });
    });
    const top = (m, k) => [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map(([x, v]) => `${Math.round(v)} ${x}`);
    profiled = profiled.map((w, i) => ({ ...w, busyMs: Math.round(acc[i].busy), gcMs: Math.round(acc[i].gc), topInclusive: top(acc[i].incl, 40), topSelf: top(acc[i].self, 12) }));
  }
  const logs = lines.filter((l) => /memory pressure|liveness|slow SQLite|event loop stalled|subagent|startup outcomes|\[gateway\] ready|http server listening/u.test(l.line)).map((l) => `+${rel(l.at)}s ${redact(l.line).slice(0, 260)}`);
  summary = {
    label: LABEL, fixture, crashed, exitCode: gateway.exitCode, heapLimitMb: HEAP_MB,
    marksS: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, rel(v)])),
    clientConnectedS: rel(connectedAt),
    pings: pings.length, pingMaxMs: Math.max(0, ...pings.map((p) => p.ms)),
    peakRssMb: Math.max(0, ...samples.map((x) => x.rssMb ?? 0)),
    windows: profiled,
    gatewayLog: logs.slice(0, 60),
    lastLines: crashed ? lines.slice(-40).map((l) => redact(l.line).slice(0, 300)) : undefined,
  };
  console.log(JSON.stringify(summary, null, 1));
} finally {
  await stopGateway();
}
