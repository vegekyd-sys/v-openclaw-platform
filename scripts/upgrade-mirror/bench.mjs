// Runtime-agnostic concurrency benchmark for the shared VLab Gateway.
// Same script runs against 9.1 (baseline) and 9.4 (candidate): it discovers the
// running core from /proc/<pid>/cmdline, samples the `health` RPC every 2s for
// event-loop delay, fires N concurrent chat.send turns on makaron with a unique
// marker, verifies each reply body and persistence, and writes one JSON receipt.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { runtimeMode } from "./runtime-mode.mjs";

const [owner, countArg, label, outDir, modelArg] = process.argv.slice(2);
const count = Number(countArg);
assert.equal(os.hostname(), "VM-0-4-ubuntu");
assert(owner && /^[\w-]+$/.test(owner), "owner");
assert(Number.isInteger(count) && count >= 1 && count <= 45, "count 1..45");
assert(label && /^[a-z0-9-]+$/.test(label), "label");
assert(outDir && fs.existsSync(outDir), "outDir must exist");
const model = modelArg || "deepseek/deepseek-v4-flash";

const control = "/srv/vlab-production-mirror/labs/control";
const unit = process.env.VERSA_UNIT ?? "versa-mirror95-gateway.service";
const run = (cmd, args, timeout = 10_000) => execFileSync(cmd, args, { encoding: "utf8", timeout }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
// The rehearsal instance is independent of the shared integration lease.
const guard = () => {};
guard();

const pid = Number(run("systemctl", ["show", unit, "-p", "MainPID", "--value"]));
assert(pid > 1, "gateway not running");
const restartsBefore = Number(run("systemctl", ["show", unit, "-p", "NRestarts", "--value"]));
const argv = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
const entry = argv.find((v) => v.endsWith("/openclaw/dist/index.js"));
assert(entry, "cannot find openclaw entry in cmdline");
const core = entry.slice(0, -"/dist/index.js".length);
const version = JSON.parse(fs.readFileSync(`${core}/package.json`, "utf8")).version;
const nodeBin = argv[0];
const env = Object.fromEntries(
  fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter((e) => e.includes("="))
    .map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]),
);
Object.assign(process.env, env);
const config = readJson(env.OPENCLAW_CONFIG_PATH);
assert.equal(config.gateway.port, Number(process.env.VERSA_PORT ?? 25096));
const mode = runtimeMode(config);
const workerSettings = mode === "worker" ? config.plugins.entries["vlab-agent-worker-isolation"].config : undefined;

const controlGroup = run("systemctl", ["show", unit, "-p", "ControlGroup", "--value"]);
const cgroup = `/sys/fs/cgroup${controlGroup}`;
const num = (p) => Number(fs.readFileSync(p, "utf8").trim());
const readResources = () => ({
  atMs: Date.now(),
  memoryCurrent: num(`${cgroup}/memory.current`),
  memoryPeak: num(`${cgroup}/memory.peak`),
  loadavg: fs.readFileSync("/proc/loadavg", "utf8").trim(),
});

const { GatewayClient } = await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
const rows = [];
const byRunId = new Map();
const health = [];
const workerSamples = [];
let client;
let saved = false;
let peakActive = 0;
let peakWorkers = 0;
const before = readResources();
const startedAt = Date.now();

function pct(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function save(failure) {
  if (saved) return;
  saved = true;
  const afterPid = Number(run("systemctl", ["show", unit, "-p", "MainPID", "--value"]));
  const restartsAfter = Number(run("systemctl", ["show", unit, "-p", "NRestarts", "--value"]));
  const totals = rows.map((r) => r.totalMs).filter((v) => Number.isFinite(v));
  const firsts = rows.map((r) => r.firstTextMs).filter((v) => Number.isFinite(v));
  const delayMax = health.map((h) => h.eventLoop?.delayMaxMs).filter((v) => Number.isFinite(v));
  const delayP99 = health.map((h) => h.eventLoop?.delayP99Ms).filter((v) => Number.isFinite(v));
  const util = health.map((h) => h.eventLoop?.utilization).filter((v) => Number.isFinite(v));
  const latency = health.map((h) => h.rpcLatencyMs).filter((v) => Number.isFinite(v));
  const summary = {
    version: 2, owner, label, count, model, core, coreVersion: version, nodeBin, pid, afterPid, restartsBefore, restartsAfter,
    startedAt: new Date(startedAt).toISOString(), finishedAt: new Date().toISOString(), wallMs: Date.now() - startedAt,
    completed: !failure && rows.length === count && rows.every((r) => r.terminal === "final" && r.bodyVerified && r.persisted),
    finals: rows.filter((r) => r.terminal === "final").length,
    errors: rows.filter((r) => r.terminal && r.terminal !== "final").length,
    unfinished: rows.filter((r) => !r.terminal).length,
    totalMs: { p50: pct(totals, 50), p90: pct(totals, 90), max: pct(totals, 100), n: totals.length },
    firstTextMs: { p50: pct(firsts, 50), p90: pct(firsts, 90), max: pct(firsts, 100), n: firsts.length },
    eventLoop: {
      samples: health.length, delayMaxMs: { p50: pct(delayMax, 50), p90: pct(delayMax, 90), max: pct(delayMax, 100) },
      delayP99Ms: { p50: pct(delayP99, 50), max: pct(delayP99, 100) }, utilization: { p50: pct(util, 50), max: pct(util, 100) },
      degradedSamples: health.filter((h) => h.eventLoop?.degraded).length,
      rpcLatencyMs: { p50: pct(latency, 50), max: pct(latency, 100) }, healthErrors: health.filter((h) => h.error).length,
    },
    peakActive, peakWorkers, mode, workerSettings: workerSettings && { minWorkers: workerSettings.minWorkers, maxWorkers: workerSettings.maxWorkers, sessionsPerWorker: workerSettings.sessionsPerWorker, requestStallTimeoutMs: workerSettings.requestStallTimeoutMs },
    before, after: readResources(), rows, health, workerSamples,
    ...(failure ? { failure: String(failure?.stack ?? failure) } : {}),
  };
  const output = `${outDir}/bench-${label}-${Date.now()}.json`;
  fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx" });
  const { rows: _r, health: _h, workerSamples: _w, before: _b, after: _a, ...brief } = summary;
  console.log(JSON.stringify({ output, ...brief }));
}

const connect = () => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Gateway connect deadline")), 30_000);
  client = new GatewayClient({
    url: `ws://127.0.0.1:${config.gateway.port}`,
    token: config.gateway.auth.token.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => env[k]),
    deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"],
    scopes: ["operator.read", "operator.write", "operator.admin"],
    onHelloOk() { clearTimeout(timer); resolve(); },
    onConnectError(e) { clearTimeout(timer); reject(e); },
    onEvent(event) {
      const row = byRunId.get(event.payload?.runId);
      if (!row?.sentAtMs) return;
      if (event.event === "agent" && event.payload?.stream === "assistant" &&
          String(event.payload.data?.text ?? event.payload.data?.delta ?? "").trim() && row.firstTextMs === undefined) {
        row.firstTextMs = Date.now() - row.sentAtMs;
      }
      if (event.event === "chat" && ["final", "error", "aborted"].includes(event.payload?.state)) {
        row.terminal = event.payload.state;
        row.totalMs = Date.now() - row.sentAtMs;
        if (event.payload?.errorMessage) row.errorMessage = String(event.payload.errorMessage).slice(0, 500);
      }
    },
  });
  client.start();
});

async function sampleHealth() {
  const at = Date.now();
  try {
    const h = await client.request("health", {}, { timeoutMs: 20_000 });
    health.push({ at, rpcLatencyMs: Date.now() - at, eventLoop: h.eventLoop ?? null, ok: h.ok });
  } catch (error) {
    health.push({ at, rpcLatencyMs: Date.now() - at, error: String(error?.message ?? error).slice(0, 200) });
  }
}

async function sampleWorkers() {
  if (mode !== "worker") return;
  try {
    const s = await client.request("vlab.workers.status", {}, { timeoutMs: 20_000 });
    const active = s.workers.reduce((sum, w) => sum + (w.activeCount ?? 0), 0);
    peakActive = Math.max(peakActive, active);
    peakWorkers = Math.max(peakWorkers, s.workers.length);
    if (workerSamples.length < 200) workerSamples.push({ at: Date.now(), active, workers: s.workers.length, pending: s.pending });
    for (const w of s.workers) for (const r of w.active ?? []) {
      const row = byRunId.get(r.runId);
      if (row && row.workerSlot === undefined) { row.workerSlot = w.slot; row.workerPid = w.pid; }
    }
  } catch (error) {
    if (workerSamples.length < 200) workerSamples.push({ at: Date.now(), error: String(error?.message ?? error).slice(0, 200) });
  }
}

try {
  await connect();
  await sampleHealth();
  if (mode === "worker") {
    const idle = await client.request("vlab.workers.status", {}, { timeoutMs: 20_000 });
    assert.equal(idle.pending, 0, "worker pool has pending work");
    assert(idle.workers.every((w) => !w.activeCount && !w.queued && !w.detachedTaskCount), "worker pool not idle");
  }

  const stamp = Date.now();
  for (let i = 0; i < count; i += 1) {
    const marker = `BENCH_${label.toUpperCase().replaceAll("-", "_")}_${i}`;
    const runId = crypto.randomUUID();
    const sessionKey = `agent:makaron:explicit:bench-${label}-${stamp}-${i}`;
    await client.request("sessions.patch", { key: sessionKey, agentId: "makaron", model }, { timeoutMs: 20_000 });
    await client.request("sessions.messages.subscribe", { agentId: "makaron", key: sessionKey }, { timeoutMs: 20_000 });
    const row = { index: i, runId, sessionKey, marker };
    rows.push(row);
    byRunId.set(runId, row);
  }
  guard();
  await Promise.all(rows.map(async (row) => {
    row.sentAtMs = Date.now();
    await client.request("chat.send", {
      agentId: "makaron", sessionKey: row.sessionKey,
      message: `这是共享 VLab 并发基准测试。不要调用任何工具，只回复精确文本 ${row.marker}，不要添加其他内容。`,
      deliver: false, idempotencyKey: row.runId, timeoutMs: 1_800_000,
    }, { timeoutMs: 60_000 });
    row.ackMs = Date.now() - row.sentAtMs;
  }));

  const deadline = Date.now() + 30 * 60_000;
  let nextHealth = 0;
  let nextWorkers = 0;
  while (rows.some((r) => !r.terminal) && Date.now() < deadline) {
    guard();
    assert.equal(Number(run("systemctl", ["show", unit, "-p", "MainPID", "--value"])), pid, "Gateway PID changed");
    if (Date.now() >= nextHealth) { nextHealth = Date.now() + 2_000; await sampleHealth(); }
    if (Date.now() >= nextWorkers) { nextWorkers = Date.now() + 3_000; await sampleWorkers(); }
    await sleep(250);
  }
  await sampleHealth();
  for (const row of rows) {
    if (row.terminal !== "final") continue;
    const history = await client.request("chat.history", { agentId: "makaron", sessionKey: row.sessionKey, limit: 5 }, { timeoutMs: 60_000 });
    const assistant = history.messages?.filter((m) => m.role === "assistant").at(-1);
    const body = assistant?.content?.filter((p) => p.type === "text").map((p) => p.text).join("\n").trim() ?? "";
    row.provider = assistant?.provider; row.model = assistant?.model; row.stopReason = assistant?.stopReason;
    row.bodyVerified = body === row.marker;
    row.persisted = history.sessionInfo?.status === "done" && history.sessionInfo?.lastRunId === row.runId && history.sessionInfo?.hasActiveRun === false;
  }
  save();
} catch (error) {
  save(error);
  process.exitCode = 1;
} finally {
  client?.stop();
}
