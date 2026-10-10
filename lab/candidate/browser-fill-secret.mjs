// Candidate test for apps/v-browser-fill: a real Agent turn logs in to a test site with a
// password it never sees.
//
// Setup: the shared VLab config on V's route, with the plugin loaded in the Gateway and
// the Worker config. HARNESS=worker: makaron -> deepseek-flash on vlab-worker (the tool
// runs in the Worker). HARNESS=claude-cli: makaron -> claude-opus-5-5 on claude-cli (/vcc;
// the tool runs in the Gateway behind the loopback MCP). A local test site at
// http://fill.localhost:<port>/login records what its form receives.
//
// The turn: the Agent opens the page, asks for LOGIN_FILLTEST_PASSWORD with the native
// `secrets` tool, this driver answers the pending credential question exactly the way the
// Feishu card / one-time link do (question.resolve with the masked answer), the Agent
// calls browser_fill_secret with the password field's ref and clicks 登录.
// PASS: the site received exactly the stored password; the store row (including soft-
// deleted rows) and the <state>/secrets/store mirror are gone; neither the transcript nor
// the Gateway/Worker output contains the value; the tool ran in the expected process.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const HARNESS = process.env.HARNESS ?? "worker";
const NAME = "LOGIN_FILLTEST_PASSWORD";
const SITE = "fill.localhost";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const value = `Fill-${randomBytes(9).toString("base64url")}-密`;

// ---- the plugin, as V installs it: plugin dir + typebox link ----
const pluginSrc = path.resolve("apps/v-browser-fill/plugin");
const pluginDir = path.join(stateDir, "plugins", "v-browser-fill");
fs.cpSync(pluginSrc, pluginDir, { recursive: true, filter: (p) => !p.includes(`${path.sep}tests`) });
fs.mkdirSync(path.join(pluginDir, "node_modules"), { recursive: true });
fs.symlinkSync(path.join(runtime, "openclaw", "node_modules", "typebox"), path.join(pluginDir, "node_modules", "typebox"));

// ---- configuration ----
const MODELS = {
  worker: { ref: "deepseek/deepseek-flash", gateway: "vlab-worker", worker: "openclaw", params: { thinking: "low" } },
  "claude-cli": { ref: "anthropic/claude-opus-5-5", gateway: "claude-cli", worker: "claude-cli", params: { thinking: "low" } },
}[HARNESS];
assert(MODELS, `unknown HARNESS ${HARNESS}`);
function configure(config, runtimeId) {
  const model = { primary: MODELS.ref, fallbacks: [] };
  const perAgent = { alias: "fill-test", agentRuntime: { id: runtimeId }, params: MODELS.params };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODELS.ref] = perAgent;
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(MODELS.ref)) allow.push(MODELS.ref);
  if (config.agents.entries?.makaron) { config.agents.entries.makaron.model = model; (config.agents.entries.makaron.models ??= {})[MODELS.ref] = perAgent; }
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  config.plugins.load ??= {};
  config.plugins.load.paths = [...(config.plugins.load.paths ?? []).filter((p) => !p.includes("v-browser-fill")), pluginDir];
  config.plugins.entries["v-browser-fill"] = { enabled: true, config: { openclawDist: dist } };
  if (Array.isArray(config.plugins.allow) && !config.plugins.allow.includes("v-browser-fill")) config.plugins.allow.push("v-browser-fill");
  config.browser = { ...(config.browser ?? {}), enabled: true, defaultProfile: "openclaw", headless: true, noSandbox: true,
    ssrfPolicy: { ...(config.browser?.ssrfPolicy ?? {}), allowedHostnames: [...new Set([...(config.browser?.ssrfPolicy?.allowedHostnames ?? []), SITE])] } };
  return config;
}
const config = configure(JSON.parse(fs.readFileSync(configPath, "utf8")), MODELS.gateway);
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, sessionsPerWorker: 3, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = configure(JSON.parse(fs
  .readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), MODELS.worker);
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- the test site ----
const received = [];
const site = http.createServer((req, res) => {
  if (req.method === "GET" && req.url.startsWith("/login")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>Fill Test 登录</title><h1>Fill Test 登录</h1>
<form method="post" action="/session"><label>账号 <input name="username" value="tianyi"></label><br>
<label>密码 <input name="password" type="password" autocomplete="current-password"></label><br>
<button type="submit">登录</button></form>`);
    return;
  }
  if (req.method === "POST" && req.url === "/session") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const form = new URLSearchParams(body);
      received.push({ username: form.get("username"), password: form.get("password") ?? "" });
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><title>已登录</title><h1>登录成功：欢迎 tianyi</h1>");
    });
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
const loginUrl = `http://${SITE}:${site.address().port}/login`;

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
      if (lines.length > 80_000) lines.splice(0, lines.length - 80_000);
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
          scopes: ["operator.admin", "operator.read", "operator.write", "operator.questions"],
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
const stateDb = path.join(stateDir, "state", "openclaw.sqlite");
function storeRows() {
  if (!fs.existsSync(stateDb)) return [];
  const db = new DatabaseSync(stateDb, { readOnly: true });
  try { return db.prepare("SELECT name, kind, deleted_at_ms, allowed_hosts FROM secret_store_entries WHERE name = ?").all(NAME); } catch { return []; } finally { db.close(); }
}
const mirror = path.join(stateDir, "secrets", "store", NAME);

let summary;
try {
  startGateway();
  await connectGateway();
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !lines.some((l) => l.line.includes("[worker-runtime-prewarm.3]"))) await sleep(500);
  const sessionKey = `agent:makaron:explicit:browser-fill-${HARNESS}-${Date.now()}`;
  const runId = randomUUID();
  const sent = Date.now();
  await client.request("chat.send", {
    agentId: "makaron", sessionKey, deliver: false, thinking: "low", timeoutMs: 600000, idempotencyKey: runId,
    message: `（平台自动化测试 browser-fill，私有测试环境）请用 browser 工具打开 ${loginUrl} ，用账号 tianyi 登录。` +
      `密码你不知道，也不要向我要：按 browser_fill_secret 工具说明的两步来——先用 secrets 工具 action=request 索取名为 ${NAME} 的凭据，allowedHosts 填 ["${SITE}"]，原因写「Fill Test 登录密码」；` +
      `保存后重新 snapshot，用 browser_fill_secret 把它填进密码框，再点「登录」按钮。登录成功后把页面上的成功提示告诉我。`,
  });

  // Answer the credential card the way the Feishu card / one-time link do.
  let answered = null;
  const until = Date.now() + 480_000;
  while (Date.now() < until && !answered) {
    const listed = await client.request("question.list", {}).catch(() => null);
    const records = Array.isArray(listed) ? listed : listed?.questions ?? listed?.records ?? [];
    const record = records.find((r) => JSON.stringify(r).includes(NAME) && (r.status ?? r.state ?? "pending") === "pending");
    if (record) {
      const q = record.questions?.[0];
      const key = q?.questionId ?? q?.id ?? "secret_value";
      await client.request("question.resolve", { id: record.id, answers: { answers: { [key]: [value] } }, resolvedBy: "candidate:card-filler" }, { scopes: ["operator.questions"] });
      answered = { at: Date.now() - sent, key, shape: Object.keys(record).sort() };
    } else await sleep(1_500);
  }
  assert(answered, `the Agent never asked for ${NAME}\n${redact(lines.slice(-80).map((l) => l.line).join("\n"))}`);
  const storedRows = storeRows();
  const mirroredAfterAnswer = fs.existsSync(mirror);

  // The site receives the login, then the turn ends.
  const loginUntil = Date.now() + 300_000;
  while (Date.now() < loginUntil && received.length === 0) await sleep(1_000);
  const waited = await client.request("agent.wait", { runId, timeoutMs: 240_000 }).catch((e) => ({ error: String(e?.message ?? e) }));
  const history = JSON.stringify(await client.request("chat.history", { sessionKey, limit: 100 }).catch(() => ""));
  const logText = lines.map((l) => l.line).join("\n");
  const fillLogs = lines.filter((l) => l.line.includes("browser fill")).map((l) => l.line.replace(/\x1b\[[0-9;]*m/gu, "").slice(0, 200));
  const toolCalled = /browser_fill_secret/u.test(history);
  // what the tool told the Agent (never contains the value; checked below)
  const toolResults = [...history.matchAll(/\\"filled\\":\s*(?:true|false)[^}]{0,400}/gu)].map((m) => m[0].replace(/\\"/gu, '"').slice(0, 400));
  summary = {
    harness: HARNESS, model: MODELS.ref, answered, storedBeforeFill: storedRows.map((r) => ({ kind: r.kind, deleted: r.deleted_at_ms !== null, hosts: r.allowed_hosts })),
    mirroredAfterAnswer, loginPosts: received.map((r) => ({ username: r.username, passwordMatches: r.password === value, passwordLength: r.password.length })),
    storeRowsAfter: storeRows().length, mirrorAfter: fs.existsSync(mirror), toolCalled,
    valueInTranscript: history.includes(value), valueInLogs: logText.includes(value), fillLogs, wait: waited?.status ?? waited,
    successShown: /欢迎 tianyi/u.test(history), toolResults, turnMs: Date.now() - sent,
  };
  console.log(JSON.stringify(summary, null, 1));
  assert(toolCalled, "the Agent did not call browser_fill_secret");
  assert(received.length >= 1 && received.some((r) => r.password === value), "the site never received the stored password");
  assert.equal(summary.storeRowsAfter, 0, "the store row (live or soft-deleted) is still there");
  assert.equal(summary.mirrorAfter, false, "the plaintext mirror file is still there");
  assert.equal(summary.valueInTranscript, false, "the value reached the transcript");
  assert.equal(summary.valueInLogs, false, "the value reached Gateway/Worker output");
  assert(summary.toolResults.some((r) => /"filled": true/u.test(r) && /"removed": true/u.test(r)), "the tool did not report a filled, removed entry");
  assert(summary.successShown, "the Agent did not report the logged-in page");
  console.log(`PASS harness=${HARNESS}: logged in with a password V never saw; entry and mirror removed`);
} finally {
  await stopGateway();
  site.close();
}
