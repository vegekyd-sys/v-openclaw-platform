// startup-heap-spike: what holds the Gateway main thread in the first minutes after a start.
//
// Production V, 2026-11-12/13: every Gateway start is followed by two main-thread stalls of 35-50 s,
// the first 52-59 s after "http server listening", the second ~346 s after the first began; the heap
// reaches 7.6-8.4 GB in each (12 GB limit; 11/11 it crashed three times). The only log line is a
// "slow SQLite session write" whose critical section spans the stall. V's makaron session_nodes
// holds 20,920 rows and 1.85 GB of entry JSON (skillsSnapshot ~55 KB + systemPromptReport ~32 KB a
// row; 18,638 of them subagent sessions).
//
// This runs a private Gateway on the candidate runtime (V's bytes unless the plan replaces files)
// with V's routing (vlab-worker), a closed model port and no channels, on a private copy of the
// shared VLab session metadata inflated to V's size: the five real subagent rows are the templates,
// cloned with fresh keys/ids and their skills list grown to V's ~300 entries. The Gateway main
// thread is CPU-profiled from boot for WINDOW_SECONDS; a `health` RPC every second measures the
// event loop from outside, /proc gives RSS, and the profile is aggregated over every stall.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { buildVScaleSessionDatabase } from "./v-scale-session-fixture.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const TARGET_ROWS = Number(process.env.TARGET_ROWS ?? 20900);
const TARGET_ENTRY_BYTES = Number(process.env.TARGET_ENTRY_BYTES ?? 92000);
const WINDOW_SECONDS = Number(process.env.WINDOW_SECONDS ?? 540);
const WORKERS = Number(process.env.WORKERS ?? 2);
const HEAP_MB = Number(process.env.HEAP_MB ?? 7168);
const CRON = process.env.CRON === "1";
const LABEL = process.env.LABEL ?? "run";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
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
  // the candidate state has no npm-installed Codex plugin; V's Codex session catalog is never called (11/12-13 logs)
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  // V's session maintenance (warn): VLab's own enforce/2000 would start deleting the inflated store
  config.session = { ...(config.session ?? {}), maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  return config;
}
const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
if (!CRON) config.cron = { ...(config.cron ?? {}), enabled: false };
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

// ---- private makaron database: V-scale session store (lab/candidate/v-scale-session-fixture.mjs) ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
const buildPrivateDatabase = () => buildVScaleSessionDatabase({ runtime, srcPath, dstPath, targetRows: TARGET_ROWS, targetEntryBytes: TARGET_ENTRY_BYTES, orphanWindows: Number(process.env.ORPHAN_WINDOWS ?? 4700) });

// ---- private Gateway, profiled from boot ----
const inspectPort = await freePort();
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_FIRSTTEXT_WORKER_PHASES: "1" };
const lines = [];
let gateway, client;
const t0 = { spawn: 0, listening: 0 };
function startGateway() {
  t0.spawn = Date.now();
  gateway = spawn(process.execPath, ["--experimental-async-context-frame", `--inspect=127.0.0.1:${inspectPort}`, `--max-old-space-size=${HEAP_MB}`, `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) {
        lines.push({ at: Date.now(), line });
        if (!t0.listening && /http server listening/u.test(line)) t0.listening = Date.now();
      }
      if (lines.length > 100_000) lines.splice(0, lines.length - 100_000);
    });
  }
}
async function attachProfiler() {
  for (let i = 0; i < 200; i += 1) {
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
    await sleep(50);
  }
  throw new Error("Gateway inspector did not come up");
}
async function connectClient() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
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
    } catch (error) { lastError = error; client?.stop(); await sleep(1_000); }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}
async function stopGateway() {
  client?.stop();
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  for (let i = 0; i < 60 && gateway.exitCode === null; i += 1) await sleep(500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  await sleep(1_000);
}
const rssMb = () => { try { return Math.round(Number(fs.readFileSync(`/proc/${gateway.pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/u)[1]) / 1024); } catch { return null; } };
const heapLine = /heap=([\d.]+) ([GM])iB/u;

// a refused reconnect (inspector or Gateway socket) must not end the measurement
process.on("uncaughtException", (error) => console.error(`[startup-heap-spike] uncaught ${redact(error?.stack ?? error).slice(0, 12000)}`));
const built = buildPrivateDatabase();
console.error(`[startup-heap-spike] ${LABEL} fixture ${JSON.stringify(built)}`);
// warm-up boot: the first start on a new state directory runs migrations and may ask for a restart;
// production restarts a Gateway whose state already exists
{
  startGateway();
  let restarted = false;
  for (;;) {
    try { await connectClient(); break; } catch (error) {
      if (!restarted && gateway.exitCode !== null && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { restarted = true; startGateway(); continue; }
      throw error;
    }
  }
  console.error(`[startup-heap-spike] warm-up boot ready after ${Math.round((Date.now() - t0.spawn) / 1000)} s`);
  await stopGateway();
  lines.length = 0; t0.listening = 0;
}
const samples = []; // { at, rssMb }
const pings = []; // { sent, ms }
let summary;
try {
  startGateway();
  const prof = await attachProfiler();
  const rssTimer = setInterval(() => samples.push({ at: Date.now(), rssMb: rssMb() }), 500);
  await connectClient();
  const connectedAt = Date.now();
  const end = t0.spawn + WINDOW_SECONDS * 1000;
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
  const profile = crashed ? null : await prof.stop();
  const base = t0.listening || connectedAt;
  // stalls: a ping that took >= 3 s, or a gap >= 3 s between consecutive pings
  const stalls = [];
  for (const p of pings) if (p.ms >= 3000) stalls.push({ from: p.sent, to: p.sent + p.ms });
  const merged = [];
  for (const s of stalls.sort((a, b) => a.from - b.from)) { const last = merged.at(-1); if (last && s.from <= last.to + 1500) last.to = Math.max(last.to, s.to); else merged.push({ ...s }); }
  const peakRss = (from, to) => Math.max(0, ...samples.filter((x) => x.at >= from && x.at <= to + 3000).map((x) => x.rssMb ?? 0));
  let profiled = [];
  if (profile) {
    const byId = new Map(profile.nodes.map((n) => [n.id, n])); const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const label = (n) => `${n.callFrame.functionName || "(anon)"} ${path.basename(n.callFrame.url || "").replace(/-[A-Za-z0-9_-]{8}\.js$/u, "")}:${n.callFrame.lineNumber + 1}`;
    const generic = /^(\(root\)|\(program\)|\(anon\)|runMicrotasks|processTicksAndRejections|run|bound|next|all|fn)$/u;
    profiled = merged.map((w) => ({ ...w, incl: new Map(), self: new Map(), busy: 0, gc: 0 }));
    let t = profile.startTime;
    profile.samples.forEach((sid, i) => {
      t += profile.timeDeltas[i];
      const wall = prof.startedWall + (t - profile.startTime) / 1000; const dt = (profile.timeDeltas[i + 1] ?? 2000) / 1000;
      const w = profiled.find((x) => wall >= x.from - 2000 && wall <= x.to); if (!w) return;
      const n = byId.get(sid); const fn = n.callFrame.functionName;
      if (fn === "(idle)") return;
      if (fn === "(garbage collector)") w.gc += dt;
      w.busy += dt; w.self.set(label(n), (w.self.get(label(n)) ?? 0) + dt);
      const seen = new Set();
      for (let c = sid; c !== undefined; c = parent.get(c)) { const node = byId.get(c); if (generic.test(node.callFrame.functionName || "(anon)")) continue; const k = label(node); if (seen.has(k)) continue; seen.add(k); w.incl.set(k, (w.incl.get(k) ?? 0) + dt); }
    });
    const top = (m, k) => [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map(([x, v]) => `${Math.round(v)} ${x}`);
    profiled = profiled.map((w) => ({ startAfterListenS: Math.round((w.from - base) / 100) / 10, lengthS: Math.round((w.to - w.from) / 100) / 10, peakRssMb: peakRss(w.from, w.to), busyMs: Math.round(w.busy), gcMs: Math.round(w.gc), topInclusive: top(w.incl, 45), topSelf: top(w.self, 15) }));
  }
  const heapLogs = lines.filter((l) => /memory pressure|liveness heartbeat delayed|slow SQLite session write|event loop stalled/u.test(l.line)).map((l) => `+${Math.round((l.at - base) / 1000)}s ${redact(l.line.replace(/\x1b\[[0-9;]*m/gu, "")).slice(0, 260)}`);
  summary = {
    label: LABEL, fixture: built, crashed, exitCode: gateway.exitCode, heapLimitMb: HEAP_MB, cron: CRON,
    listeningAfterSpawnS: t0.listening ? Math.round((t0.listening - t0.spawn) / 1000) : null,
    pings: pings.length, pingP50Ms: pings.map((p) => p.ms).sort((a, b) => a - b)[Math.floor(pings.length / 2)] ?? null, pingMaxMs: Math.max(0, ...pings.map((p) => p.ms)),
    peakRssMb: Math.max(0, ...samples.map((x) => x.rssMb ?? 0)), baselineRssMb: samples.filter((x) => x.at > base && x.at < base + 30_000).map((x) => x.rssMb).sort((a, b) => a - b)[0] ?? null,
    stalls: profiled.length ? profiled : merged.map((w) => ({ startAfterListenS: Math.round((w.from - base) / 1000), lengthS: Math.round((w.to - w.from) / 1000), peakRssMb: peakRss(w.from, w.to) })),
    gatewayLog: heapLogs.slice(0, 40),
    lastLines: crashed ? lines.slice(-40).map((l) => redact(l.line).slice(0, 300)) : undefined,
  };
  console.log(JSON.stringify(summary, null, 1));
} finally {
  await stopGateway();
}
