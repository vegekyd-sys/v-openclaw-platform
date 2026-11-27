// Candidate test for /neon: Gemini 4 Neon on the account bridge, run by the PI harness
// (Gateway vlab-worker -> Worker openclaw).
//
// Runtime: V's dist plus lab/release-files/v-identity-line (the system prompt opens as V; the
// account endpoint rejects OpenClaw's default opening sentence with a fake 429).
// Setup: the shared VLab config, changed exactly as scripts/gemini-neon-alias.mjs changes V
// (same plan, applied with config-set merge semantics to both the Gateway and the Worker
// config). The bridge itself is apps/gemini-account-bridge running on V; this test reaches it
// over a loopback SSH tunnel (BRIDGE_URL), whose V end the test bridge admits by peer uid.
//
// Turns, all through the real reply pipeline (chat.send, alias directive on its own first):
//   plain x3, exec tool, image attachment, view_image tool result -- for /neon and, as the
//   same-harness baseline, /deepseek (deepseek/deepseek-flash on vlab-worker).
// Failure: /neondown points at a local stand-in that answers 503, then at a closed port;
// we record the terminal state, the error the user sees, the time, and how many requests the
// stand-in received (retries), and whether a fallback model answered.
// PASS: every /neon turn ends final on gemini-4-neon via gemini-account; exec ran and its
// output is in the reply; both image turns name the colour; failures end without hanging.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { plan } from "../../scripts/gemini-neon-alias.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://127.0.0.1:25990/v1beta";
const PLAIN_REPEATS = Number(process.env.PLAIN_REPEATS ?? 3);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");

// ---- the change under test, applied like `openclaw config set --merge` ----
function mergeSet(config, dotted, value) {
  const keys = dotted.split(".");
  let node = config;
  for (const k of keys.slice(0, -1)) node = node[k] ??= {};
  const last = keys.at(-1);
  const merge = (a, b) => {
    if (Array.isArray(b) || b === null || typeof b !== "object" || a === null || typeof a !== "object" || Array.isArray(a)) return structuredClone(b);
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = merge(a[k], v);
    return out;
  };
  node[last] = merge(node[last], value);
}
function stand(port) { return `http://127.0.0.1:${port}/v1beta`; }
function configure(config, { downUrl }) {
  for (const s of plan(config, { baseUrl: BRIDGE_URL }).sets) mergeSet(config, s.path, s.value);
  // failure probe: same row on a provider whose base URL we control
  const runtimeId = config.agents.defaults.models["deepseek/deepseek-flash"].agentRuntime.id;
  config.models.providers["gemini-account-down"] = { ...structuredClone(config.models.providers["gemini-account"]), baseUrl: downUrl };
  config.agents.defaults.modelPolicy.allow.push("gemini-account-down/*");
  for (const map of [config.agents.defaults.models, config.agents.entries.makaron.models]) {
    map["gemini-account-down/gemini-4-neon"] = { alias: "neondown", agentRuntime: { id: runtimeId }, params: { thinking: "medium" } };
  }
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  return config;
}

// ---- 503 stand-in (switchable to a closed port by stopping it) ----
const downHits = [];
const down = http.createServer((req, res) => {
  downHits.push({ at: Date.now(), url: req.url });
  req.resume();
  res.writeHead(503, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { code: 503, message: "upstream unavailable (stand-in)", status: "UNAVAILABLE" } }));
});
await new Promise((resolve) => down.listen(0, "127.0.0.1", resolve));
const downPort = down.address().port;

const config = configure(JSON.parse(fs.readFileSync(configPath, "utf8")), { downUrl: stand(downPort) });
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
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), { downUrl: stand(downPort) });
assert.equal(workerConfig.agents.defaults.models["gemini-account/gemini-4-neon"].agentRuntime.id, "openclaw", "Worker config must run the alias on the embedded runtime");
assert.equal(config.agents.defaults.models["gemini-account/gemini-4-neon"].agentRuntime.id, "vlab-worker", "Gateway config must hand the alias to the Worker");
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- images ----
function png(rgb, size = 96) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3).map((_, i) => rgb[i % 3])]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const workspace = config.agents.entries?.makaron?.workspace ?? config.agents.defaults?.workspace;
assert(workspace, "makaron workspace is not configured");
const greenPath = path.join(workspace, "tmp", `neon-green-${Date.now()}.png`);
fs.mkdirSync(path.dirname(greenPath), { recursive: true });
fs.writeFileSync(greenPath, png([0, 160, 0]));
const blue = png([0, 0, 220]).toString("base64");

// ---- private Gateway ----
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) };
const lines = [];
let gateway, client;
const runs = new Map();
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
function onEvent(e) {
  const p = e.payload;
  const r = runs.get(p?.runId);
  if (!r) return;
  if (e.event === "agent" && p.stream === "assistant" && typeof p.data?.text === "string" && p.data.text.trim() && !r.firstTextAt) r.firstTextAt = Date.now();
  if (e.event === "agent" && p.stream === "tool") r.tools = (r.tools ?? 0) + 1;
  if (e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) {
    r.terminal = p.state; r.endAt = Date.now();
    if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 300));
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
          scopes: ["operator.admin", "operator.read", "operator.write"], onEvent,
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

async function turn(sessionKey, message, { attachments, limitMs = 300_000 } = {}) {
  const runId = randomUUID();
  const r = { sentAt: Date.now() };
  runs.set(runId, r);
  await client.request("chat.send", { agentId: "makaron", sessionKey, deliver: false, timeoutMs: limitMs, idempotencyKey: runId, message, ...(attachments ? { attachments } : {}) });
  const until = Date.now() + limitMs + 30_000;
  while (!r.terminal && Date.now() < until) await sleep(200);
  const history = await client.request("chat.history", { sessionKey, limit: 6 }).catch(() => null);
  const msgs = history?.messages ?? [];
  const last = [...msgs].reverse().find((m) => m.role === "assistant");
  const text = (Array.isArray(last?.content) ? last.content.filter((b) => b.type === "text").map((b) => b.text).join("") : String(last?.content ?? "")).trim();
  const toolCalls = msgs.flatMap((m) => (Array.isArray(m.content) ? m.content : []).filter((b) => b.type === "toolCall" || b.type === "tool_use").map((b) => b.name));
  const logs = r.terminal === "final" ? undefined : lines
    .filter((l) => l.at >= r.sentAt && /error|fail|gemini|ssrf|blocked|refus|denied|google|status \d{3}/iu.test(l.line))
    .slice(-25).map((l) => redact(l.line.replace(/\x1b\[[0-9;]*m/gu, "")).slice(0, 400));
  return {
    terminal: r.terminal ?? "timeout", error: r.error, logs, firstTextMs: r.firstTextAt ? r.firstTextAt - r.sentAt : null,
    totalMs: (r.endAt ?? Date.now()) - r.sentAt, provider: last?.provider, model: last?.model, text: text.slice(0, 160), toolCalls,
  };
}

const results = { neon: {}, deepseek: {}, failure: {}, identityPatched: null };
try {
  startGateway();
  await connectGateway();
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !lines.some((l) => l.line.includes("[worker-runtime-prewarm.3]"))) await sleep(500);
  const stamp = Date.now();
  results.identityPatched = fs.readFileSync(path.join(dist, "system-prompt-params-B645JcX8.js"), "utf8").includes("v-identity-line-v1");
  for (const name of (process.env.ARMS ?? "neon,deepseek").split(",")) {
    const alias = name;
    const key = `agent:makaron:explicit:neon-cand-${name}-${stamp}`;
    const out = results[name];
    out.directive = await turn(key, `/${alias}`);
    out.plain = [];
    for (let i = 0; i < PLAIN_REPEATS; i += 1) out.plain.push(await turn(key, `（平台自动化测试）只回复这一串，不要别的：PLAIN_OK_${i}`));
    if (process.env.PROBE_ONLY) { console.log(JSON.stringify({ identityPatched: results.identityPatched, probe: out.plain }, null, 1)); process.exit(0); }
    out.exec = await turn(key, "（平台自动化测试）用 exec 工具运行 `hostname`，然后只回复：TOOL=<命令输出>");
    out.attachment = await turn(key, "（平台自动化测试）附件这张图整体是什么颜色？只回答一个中文颜色词。", {
      attachments: [{ type: "image", mimeType: "image/png", fileName: "neon-blue.png", content: blue }],
    });
    out.viewImage = await turn(key, `（平台自动化测试）用 view_image 工具查看 ${greenPath} ，这张图整体是什么颜色？只回答一个中文颜色词。`);
    console.log(JSON.stringify({ [name]: out }, null, 1));
  }
  // failure: 503, then a closed port
  const fkey = `agent:makaron:explicit:neon-cand-down-${stamp}`;
  results.failure.directive = await turn(fkey, "/neondown");
  const before503 = downHits.length;
  results.failure.upstream503 = { ...(await turn(fkey, "（平台自动化测试）只回复：DOWN_OK", { limitMs: 240_000 })), standInRequests: downHits.length - before503 };
  await new Promise((resolve) => down.close(resolve));
  results.failure.refused = await turn(fkey, "（平台自动化测试）只回复：DOWN_OK_2", { limitMs: 240_000 });
  console.log(JSON.stringify({ failure: results.failure }, null, 1));

  const n = results.neon;
  for (const t of [...n.plain, n.exec, n.attachment, n.viewImage]) {
    assert.equal(t.terminal, "final", `neon turn ended ${t.terminal}: ${t.error}`);
    assert.equal(t.model, "gemini-4-neon", `neon turn served by ${t.provider}/${t.model}`);
    assert.equal(t.provider, "gemini-account");
  }
  assert(n.exec.toolCalls.includes("exec"), "neon did not call exec");
  assert(/TOOL=\S+/u.test(n.exec.text), `neon exec reply lacks the output: ${n.exec.text}`);
  assert(/蓝/u.test(n.attachment.text), `neon misread the attached image: ${n.attachment.text}`);
  assert(n.viewImage.toolCalls.includes("view_image") && /绿/u.test(n.viewImage.text), `neon view_image turn: ${JSON.stringify(n.viewImage)}`);
  for (const t of [results.failure.upstream503, results.failure.refused]) assert.notEqual(t.terminal, "timeout", "a failed bridge must not hang the turn");
  console.log("PASS neon on the account bridge: plain, exec, attachment and view_image turns on gemini-4-neon via vlab-worker");
} finally {
  // the Worker logs to the rolling file log, not to the Gateway's stdout
  try {
    const dir = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("openclaw")).map((d) => path.join(os.tmpdir(), d));
    for (const d of dir) for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".log") && Date.now() - fs.statSync(path.join(d, x)).mtimeMs < 3_600_000 && fs.statSync(path.join(d, x)).size < 400e6)) {
      const text = fs.readFileSync(path.join(d, f), "utf8").split("\n").filter((l) => /gemini-account|google-generative|ssrf|blocked/iu.test(l));
      if (text.length) console.log(JSON.stringify({ fileLog: path.join(d, f), lines: text.slice(-30).map((l) => redact(l).slice(0, 500)) }, null, 1));
    }
  } catch (error) { console.log(`file log scan failed: ${error.message}`); }
  console.log(JSON.stringify({ summary: results }));
  await stopGateway();
  down.close();
  fs.rmSync(greenPath, { force: true });
}
