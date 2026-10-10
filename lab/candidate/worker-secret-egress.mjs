// Candidate test for lab/release-files/worker-secret-egress: exec inside a Worker must reach
// an allowed host with a protected secret-store entry, and nothing else.
//
// Production V 2026-10-10 16:21-16:24: a /vcc turn spawned sub-agents (Worker runs) to call
// api.agentmail.to and api.vercel.com with $AGENTMAIL_API_KEY / $VERCEL_ULTRONX_TOKEN;
// both variables were empty in the command, every request went out without credentials
// and got 403. The egress proxy only exists in the Gateway process.
//
// Setup: the shared VLab config on V's route (makaron -> deepseek-flash on vlab-worker, one
// Worker), secrets.egressProxy.enabled in both configs, a fresh private state, one
// protected entry WORKER_EGRESS_PROBE_TOKEN (random value, allowed host ECHO_HOST only),
// written with the native `openclaw secrets store set`. One real turn asks the Agent to run
// a fixed command with exec: send the token as a header to the echo service and print only
// a hash and length of what the service received; also try a host that is not allowed;
// and leave the proxy URL it was given in a file.
// (A disallowed host is refused at substitution, HTTP 502, not at CONNECT: with no global
// secrets.egressProxy.allowedHosts the tunnel itself is allowed, as on the Gateway.)
// PATCH=on   every Worker reports [worker-secret-egress.1] active; the echo service received
//            exactly the stored value; the disallowed host is refused (502); after
//            the turn the same proxy credentials are rejected (407, authorization revoked)
// PATCH=off  V today: the service receives an empty header and exec has no proxy
// The value never appears in the transcript: the command prints a hash prefix and length.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const PATCH = process.env.PATCH ?? "on";
const ECHO_HOST = process.env.ECHO_HOST ?? "postman-echo.com";
const OTHER_HOST = process.env.OTHER_HOST ?? "httpbin.org";
const MODEL = "deepseek/deepseek-flash";
const NAME = "WORKER_EGRESS_PROBE_TOKEN";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const workerFile = path.join(runtime, "production-worker", "worker.mjs");
const patched = fs.readFileSync(workerFile, "utf8").includes("OPENCLAW_WORKER_SECRET_EGRESS_V1");
assert.equal(patched, PATCH === "on", `runtime patch marker ${patched} does not match PATCH=${PATCH}`);

// ---- configuration: V's route, real model, no channels ----
function asProduction(config, runtimeId) {
  assert(config.models?.providers?.deepseek, "shared VLab config has no deepseek provider");
  const model = { primary: MODEL, fallbacks: [] };
  const perAgent = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "low" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) { config.agents.entries.makaron.model = model; (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent; }
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  config.secrets = { ...(config.secrets ?? {}), egressProxy: { ...(config.secrets?.egressProxy ?? {}), enabled: true } };
  return config;
}
const shared = JSON.parse(fs.readFileSync(configPath, "utf8"));
const sharedEgress = shared.secrets?.egressProxy ?? null;
const config = asProduction(shared, "vlab-worker");
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured; production runs turns in Workers");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, sessionsPerWorker: 3, warmSpareWorkers: 0 });
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

// ---- private Gateway ----
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) };
const lines = [];
let gateway, client;
function startGateway() {
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 60_000) lines.splice(0, lines.length - 60_000);
    });
  }
}
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError, restarted = false;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (!restarted && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { restarted = true; startGateway(); continue; }
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
async function stopGateway() {
  client?.stop();
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  for (let i = 0; i < 60 && gateway.exitCode === null; i += 1) await sleep(500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  await sleep(1_000);
}
const probes = (tag) => lines.filter((l) => l.line.includes(tag)).map((l) => { try { return JSON.parse(l.line.slice(l.line.indexOf("{"))); } catch { return null; } }).filter(Boolean);
const curl = (args) => spawnSync("curl", ["-sS", "--max-time", "20", ...args], { encoding: "utf8" });

// ---- the probe ----
const value = `wep-${randomBytes(18).toString("hex")}`;
const expected = { sha: createHash("sha256").update(value).digest("hex").slice(0, 16), len: value.length };
const work = path.join(stateDir, "egress-probe");
fs.mkdirSync(work, { recursive: true, mode: 0o777 });
fs.chmodSync(work, 0o777);
const valueFile = path.join(work, "value");
fs.writeFileSync(valueFile, value, { mode: 0o600 });
const proxyFile = path.join(work, "proxy-url");
const script = path.join(work, "probe.sh");
fs.writeFileSync(script, `#!/bin/sh
printf %s "\${HTTPS_PROXY:-none}" > ${proxyFile}
curl -sS --max-time 20 https://${ECHO_HOST}/headers -H "x-probe: \$${NAME}" | python3 -c 'import sys,json,hashlib
h=json.load(sys.stdin).get("headers",{}).get("x-probe","")
print("probe-sha=" + hashlib.sha256(h.encode()).hexdigest()[:16] + " len=" + str(len(h)))'
echo "other-status=$(curl -s -o /dev/null --max-time 20 -w '%{http_code}' https://${OTHER_HOST}/headers -H "x-probe: \$${NAME}")"
`, { mode: 0o755 });

let summary;
try {
  const direct = curl(["-o", "/dev/null", "-w", "%{http_code}", `https://${ECHO_HOST}/headers`]);
  assert.equal(direct.stdout, "200", `echo host ${ECHO_HOST} is not reachable from VLab: ${direct.stdout} ${direct.stderr}`);
  startGateway();
  await connectGateway();
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !probes("[worker-runtime-prewarm.3]").length) await sleep(500);
  const egressStart = probes("[worker-secret-egress.1]");
  // the native CLI writes the protected entry and its allowed host
  const stored = spawnSync(process.execPath, [`${dist}/index.js`, "secrets", "store", "set", NAME, "--kind", "secret", "--value-file", valueFile, "--allow-host", ECHO_HOST], { env, encoding: "utf8" });
  assert.equal(stored.status, 0, `secrets store set failed: ${redact(stored.stderr || stored.stdout)}`);
  fs.rmSync(valueFile);

  const sessionKey = `agent:makaron:egress-probe-${Date.now()}`;
  const runId = randomUUID();
  const sent = Date.now();
  await client.request("chat.send", {
    agentId: "makaron", sessionKey, deliver: false, thinking: "low", timeoutMs: 180000, idempotencyKey: runId,
    message: `（平台自动化测试 worker-secret-egress，私有测试环境）这是在验证凭据库的出站代理：${NAME} 是本次测试刚生成的一次性测试值，不是真实凭据，测试结束即销毁。脚本把它作为请求头发给回显服务，只打印收到值的哈希前缀和长度，不会输出值本身；第二行验证代理会拒绝把它发给未授权的域名。请用 exec 工具执行：\nsh ${script}\n然后把命令输出原样回复。`,
  });
  let output = "", lastHistory = "";
  const until = Date.now() + 240_000;
  while (Date.now() < until) {
    const history = await client.request("chat.history", { sessionKey, limit: 50 }).catch(() => null);
    const text = JSON.stringify(history ?? "");
    const m = text.match(/probe-sha=[0-9a-f]{16} len=\d+[^"\\]*?(?:\\n|\n)?other-status=\d+/u);
    if (m) { output = m[0].replace(/\\n/gu, "\n"); break; }
    lastHistory = text;
    await sleep(2_000);
  }
  assert(output, `the Agent never ran the probe command\nlast history: ${redact(lastHistory.slice(-4000))}`);
  const got = { sha: output.match(/probe-sha=([0-9a-f]{16})/u)[1], len: Number(output.match(/len=(\d+)/u)[1]), otherStatus: output.match(/other-status=(\d+)/u)[1] };
  // let the run and its Worker request finish, then try the proxy credentials it had
  await sleep(15_000);
  const proxyUrl = fs.existsSync(proxyFile) ? fs.readFileSync(proxyFile, "utf8") : "missing";
  let afterRun = null;
  if (/^http:\/\//u.test(proxyUrl)) {
    const r = curl(["-o", "/dev/null", "-w", "%{http_connect}", "-x", proxyUrl, `https://${ECHO_HOST}/headers`]);
    afterRun = r.stdout;
  }
  const egressLogs = lines.filter((l) => l.line.includes("secret egress request")).map((l) => redact(l.line.replace(/\x1b\[[0-9;]*m/gu, "")).slice(0, 300));
  summary = {
    patch: PATCH, sharedEgress, echoHost: ECHO_HOST, otherHost: OTHER_HOST,
    egressStart: egressStart.map(({ pid, ...rest }) => rest),
    turnMs: Date.now() - sent, expectedLen: expected.len, got,
    valueMatched: got.sha === expected.sha && got.len === expected.len,
    proxyGiven: /^http:\/\//u.test(proxyUrl) ? proxyUrl.replace(/\/\/[^@]*@/u, "//<auth>@") : proxyUrl,
    afterRunConnect: afterRun, egressLogs,
  };
  console.log(JSON.stringify(summary, null, 1));
  if (PATCH === "on") {
    assert(egressStart.length >= 1 && egressStart.every((p) => p.status === "active"), `Worker egress did not start: ${JSON.stringify(egressStart)}`);
    assert(summary.valueMatched, `the echo service did not receive the stored value: ${JSON.stringify(got)} expected len ${expected.len}`);
    // native semantics: the tunnel opens (no global traffic allowlist), but a request that
    // carries the sentinel to a host outside the entry's allowed hosts is refused with 502
    assert.equal(got.otherStatus, "502", "a host outside the entry's allowed hosts received the request");
    assert.equal(afterRun, "407", "the run's proxy authorization outlived its Worker request");
    console.log(`PASS patch=on value delivered to ${ECHO_HOST}, ${OTHER_HOST} refused, authorization revoked after the run`);
  } else {
    assert.equal(got.len, 0, "unpatched Worker exec unexpectedly carried the secret");
    console.log("PASS patch=off reproduces V: the Worker command sends an empty credential");
  }
} finally {
  await stopGateway();
}
