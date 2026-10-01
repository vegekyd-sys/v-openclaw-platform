// Health + worker probe against whatever core the mirror Gateway runs.
// Exit 0 only when health.ok and no plugin errors, plus by runtime mode
// (runtime-mode.mjs): worker mode = worker plugin loaded and pool started;
// no-worker mode (9.6, agent turns in-process) = worker plugin absent and
// versa-runtime-providers loaded. vlab.workers.status is only asked in worker mode.
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { probeFailures, runtimeMode } from "./runtime-mode.mjs";

const unit = process.env.VERSA_UNIT ?? "versa-mirror95-gateway.service";
const strict = process.argv[2] !== "--loose";
const run = (c, a) => execFileSync(c, a, { encoding: "utf8", timeout: 10_000 }).trim();
const pid = Number(run("systemctl", ["show", unit, "-p", "MainPID", "--value"]));
assert(pid > 1, "gateway not running");
const argv = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
const entry = argv.find((v) => v.endsWith("/openclaw/dist/index.js"));
const core = entry.slice(0, -"/dist/index.js".length);
const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter((e) => e.includes("="))
  .map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]));
Object.assign(process.env, env);
const config = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"));
const mode = runtimeMode(config);
const { GatewayClient } = await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
let client;
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Gateway connect deadline")), 20_000);
  client = new GatewayClient({
    url: `ws://127.0.0.1:${config.gateway.port}`, token: config.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, k) => env[k]),
    deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"],
    scopes: ["operator.read", "operator.write", "operator.admin"], onEvent() {},
    onHelloOk() { clearTimeout(timer); resolve(); }, onConnectError(e) { clearTimeout(timer); reject(e); },
  });
  client.start();
});
try {
  const health = await client.request("health", {}, { timeoutMs: 30_000 });
  let workers = null;
  if (mode === "worker") {
    try { workers = await client.request("vlab.workers.status", {}, { timeoutMs: 30_000 }); } catch (e) { workers = { error: String(e?.message ?? e) }; }
  }
  const version = JSON.parse(fs.readFileSync(`${core}/package.json`, "utf8")).version;
  const out = { pid, core, version, ok: health.ok, eventLoop: health.eventLoop, plugins: { loaded: health.plugins?.loaded?.length, errors: health.plugins?.errors ?? [], unavailable: health.plugins?.unavailable ?? [] }, channels: Object.fromEntries(Object.entries(health.channels ?? {}).map(([k, v]) => [k, { running: v?.running, connected: v?.connected, lastError: v?.lastError ?? null }])), mode, workers: !workers || workers.error ? workers : { started: workers.started, pending: workers.pending, count: workers.workers?.length, active: workers.workers?.reduce((s, w) => s + (w.activeCount ?? 0), 0) } };
  console.log(JSON.stringify(out));
  if (strict) {
    const failures = probeFailures({ mode, health, workers });
    assert.deepEqual(failures, [], `${mode} probe failed: ${failures.join("; ")}`);
  }
} finally {
  client?.stop();
}
