#!/usr/bin/env node
// Candidate check for sessions.list lifecycleOnly on a private Gateway (OpenClaw 2026.9.1).
//
// Starts the candidate runtime's Gateway on its own state copy (channels and cron off), then:
//   1. calls sessions.list with the Workboard sweep's parameters with and without lifecycleOnly
//      and requires the fields the sweep reads (key, updatedAt, status, hasActiveRun,
//      abortedLastRun) to match row for row; reports both timings;
//   2. waits for two Workboard lifecycle sweeps (the first is a full sweep) and requires no
//      "workboard lifecycle sync failed" / "recovery failed" lines, so the plugin's
//      lifecycleOnly request passes the closed sessions.list schema.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && configPath && process.env.OPENCLAW_STATE_DIR, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const ROUNDS = Number(process.env.ROUNDS ?? 5);
const SWEEP_WAIT_MS = Number(process.env.SWEEP_WAIT_MS ?? 140_000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");

for (const [file, marker] of [["src-B9mb84px.js", "lifecycleOnly: Type.Optional"], ["sessions-read-C6mAMxyQ.js", "const lifecycleOnly ="], ["extensions/workboard/index.js", "lifecycleOnly: true"]]) {
  assert(fs.readFileSync(path.join(dist, file), "utf8").includes(marker), `${file} is not the patched release file`);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins?.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

const lines = [];
let gateway;
function startGateway() {
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], {
    env: { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [gateway.stdout, gateway.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); });
  }
}
startGateway();

// Shared VLab installs some plugins (Codex) under its own state/npm, which a private state copy
// lacks; the Gateway then refuses to start. This test does not exercise them, so disable each
// missing one and start again.
const disabledPlugins = [];
function disableMissingPlugins() {
  const missing = new Set();
  for (const { line } of lines) for (const m of line.matchAll(/missing configured plugin "([^"]+)"/gu)) missing.add(m[1]);
  const fresh = [...missing].filter((id) => !disabledPlugins.includes(id));
  if (fresh.length === 0) return false;
  for (const id of fresh) {
    (config.plugins.entries[id] ??= {}).enabled = false;
    disabledPlugins.push(id);
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return true;
}

let client;
async function connect() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (disableMissingPlugins()) { startGateway(); continue; }
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

const SWEEP_PARAMS = { limit: 10_000, configuredAgentsOnly: true, includeGlobal: false, includeUnknown: false };
const project = (session) => JSON.stringify([session.key, session.updatedAt ?? null, session.status ?? null, session.hasActiveRun ?? null, session.abortedLastRun === true]);
const result = { rounds: [], disabledPlugins };
try {
  await connect();
  const startedAt = Date.now();
  for (let i = 0; i < ROUNDS; i += 1) {
    let t = performance.now();
    const full = await client.request("sessions.list", SWEEP_PARAMS);
    const fullMs = Math.round(performance.now() - t);
    t = performance.now();
    const light = await client.request("sessions.list", { ...SWEEP_PARAMS, lifecycleOnly: true });
    const lightMs = Math.round(performance.now() - t);
    const a = full.sessions.map(project).sort();
    const b = light.sessions.map(project).sort();
    assert.deepEqual(b, a, `round ${i}: lifecycle fields differ`);
    assert(light.sessions.every((session) => session.sharingRole === undefined), "lifecycleOnly rows carry no sharing role");
    result.rounds.push({ sessions: full.sessions.length, fullMs, lightMs, withSharingRole: full.sessions.filter((s) => s.sharingRole !== undefined).length });
  }
  await sleep(Math.max(0, SWEEP_WAIT_MS - (Date.now() - startedAt)));
  const failures = lines.filter((l) => /workboard lifecycle (sync|recovery) failed|invalid sessions\.list params|unexpected property/iu.test(l.line)).map((l) => redact(l.line).slice(0, 400));
  result.workboardFailures = failures;
  result.workboardLines = lines.filter((l) => /workboard/iu.test(l.line)).length;
  assert.deepEqual(failures, [], "Workboard lifecycle sweep failed");
  console.log(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  console.log(JSON.stringify({ ok: false, error: String(error?.message ?? error).slice(0, 2000), ...result }));
  process.exitCode = 1;
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
