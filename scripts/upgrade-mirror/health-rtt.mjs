// External Gateway health prober (run as root, outside the Gateway process):
//   node health-rtt.mjs <label> <minutes> <outDir> [intervalSeconds=30]
// Every interval: a fresh WS connection (handshake) + one `health` RPC, both
// timed, 60 s budget each. A frozen main thread shows up as a handshake or RPC
// that takes > 5 s / > 30 s or times out. Writes JSONL + a summary line.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const [label, minutesArg, outDir, intervalArg] = process.argv.slice(2);
const minutes = Number(minutesArg), intervalS = Number(intervalArg ?? 30);
if (!/^[a-z0-9-]+$/.test(label ?? "") || !(minutes > 0) || !fs.existsSync(outDir ?? "")) throw new Error("usage");
const UNIT = "versa-mirror95-gateway.service";
const out = `${outDir}/health-${label}.jsonl`;
const log = (o) => fs.appendFileSync(out, JSON.stringify(o) + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mainPid = () => Number(execFileSync("systemctl", ["show", UNIT, "-p", "MainPID", "--value"], { encoding: "utf8" }).trim());
function target(pid) {
  const argv = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
  const core = argv.find((v) => v.endsWith("/openclaw/dist/index.js")).slice(0, -"/dist/index.js".length);
  const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter((e) => e.includes("=")).map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]));
  const config = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"));
  return { core, port: config.gateway.port, token: config.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, k) => env[k]) };
}
const startPid = mainPid();
const t = target(startPid);
const { GatewayClient } = await import(`${t.core}/dist/plugin-sdk/gateway-runtime.js`);
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, j) => setTimeout(() => j(new Error(`${what} timeout ${ms}ms`)), ms))]);
async function probe() {
  const t0 = performance.now();
  let client, connectMs, rpcMs, error, ok = false;
  try {
    await withTimeout(new Promise((resolve, reject) => {
      client = new GatewayClient({ url: `ws://127.0.0.1:${t.port}`, token: t.token, deviceIdentity: null, clientName: "cli", mode: "cli",
        caps: [], scopes: ["operator.read"], onEvent() {}, onHelloOk: resolve, onConnectError: reject });
      client.start();
    }), 60_000, "connect");
    connectMs = Math.round(performance.now() - t0);
    const t1 = performance.now();
    const r = await client.request("health", {}, { timeoutMs: 60_000 });
    rpcMs = Math.round(performance.now() - t1);
    ok = r?.ok !== false;
  } catch (e) { error = String(e?.message ?? e).slice(0, 160); }
  finally { try { client?.stop(); } catch {} }
  const totalMs = Math.round(performance.now() - t0);
  return { at: new Date().toISOString(), ok, connectMs, rpcMs, totalMs, error, pid: mainPid() };
}
const endAt = Date.now() + minutes * 60_000;
const rows = [];
log({ event: "start", label, pid: startPid, minutes, intervalS });
while (Date.now() < endAt) {
  const started = Date.now();
  const row = await probe();
  rows.push(row); log(row);
  await sleep(Math.max(0, started + intervalS * 1000 - Date.now()));
}
const tot = rows.map((r) => r.totalMs).sort((a, b) => a - b);
const pct = (p) => tot[Math.min(tot.length - 1, Math.floor((p / 100) * tot.length))];
const summary = { event: "summary", label, n: rows.length, failed: rows.filter((r) => !r.ok).length,
  over5s: rows.filter((r) => r.totalMs > 5000).length, over30s: rows.filter((r) => r.totalMs > 30000).length,
  p50: pct(50), p90: pct(90), p99: pct(99), max: tot.at(-1),
  rpcMax: Math.max(...rows.map((r) => r.rpcMs ?? 0)), connectMax: Math.max(...rows.map((r) => r.connectMs ?? 0)),
  pidChanged: rows.some((r) => r.pid !== startPid), errors: rows.filter((r) => r.error).map((r) => `${r.at} ${r.error}`).slice(0, 20) };
log(summary); console.log(JSON.stringify(summary));
process.exit(0);
