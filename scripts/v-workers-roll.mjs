// Roll V's Worker generation through the Worker plugin's own vlab.workers.roll RPC: the plugin
// re-derives worker-openclaw.json from openclaw.json, starts a new generation and lets the old
// Workers finish their turns (drain). No Gateway restart.
//
// Needed after a hot config change the Worker config watch misses: a `models.*` hot reload makes
// the plugin register again, and that registration rewrites the Worker file without rolling, so
// the watch then finds it "already current" and running Workers keep the old values
// (lab/candidate/deepseek-budget-hot-reload.mjs, 2026-10-19).
//
// Usage (root, on V):  node v-workers-roll.mjs [reason]
import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const reason = process.argv[2] ?? "operator";
assert.equal(process.getuid(), 0, "run as root");
const core = "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core";
const configPath = "/home/openclaw/.openclaw/openclaw.json";
const { GatewayClient } = await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
const pid = Number(execFileSync("systemctl", ["show", "openclaw-gateway", "-p", "MainPID", "--value"], { encoding: "utf8" }).trim());
assert(pid > 0, "Gateway is not running");
const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter(Boolean).map((s) => { const i = s.indexOf("="); return [s.slice(0, i), s.slice(i + 1)]; }));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const token = config.gateway.auth.token.replace(/\$\{([^}]+)\}/gu, (_, k) => env[k]);
const port = config.gateway.port ?? 22793;
const client = await new Promise((resolve, reject) => {
  const c = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
    scopes: ["operator.read", "operator.write", "operator.admin"], onHelloOk: () => resolve(c), onConnectError: reject });
  c.start();
  setTimeout(() => reject(new Error("connect timeout")), 15_000);
});
try {
  const result = await client.request("vlab.workers.roll", { reason }, { timeoutMs: 600_000 });
  console.log(JSON.stringify({ at: new Date().toISOString(), reason, ...result }, null, 1));
} finally {
  client.stop();
}
