// Candidate test for /neon: Gemini 4 Neon on the Antigravity CLI harness (apps/v-antigravity),
// the way /vcc runs Claude Code.
//
// Runtime: V's dist plus lab/release-files/v-identity-line (the account endpoint rejects
// OpenClaw's default opening sentence with a fake 429, on the agy path too). Config: the shared
// VLab config changed exactly as scripts/gemini-neon-alias.mjs changes V, with VLab's agy
// (AGY_BIN) and its own login (AGY_HOME, Tianyi's account). The plugin is loaded from a copy in
// this candidate's state dir.
//
// Turns through the real reply pipeline (chat.send; alias directive on its own first):
//   /neon: plain x3, memory_search (an OpenClaw tool over MCP; the candidate has no memory index,
//   so the call itself is what is checked), shell (hostname), image
//   attachment, a steer while a 25 s command runs, then a plain turn on the same live process;
//   /deepseek (vlab-worker): plain x3 as the first-text baseline.
// PASS: every /neon turn ends final on antigravity/gemini-4-neon; memory_search ran through MCP;
// the image is named; the steered word is in the same reply as the main answer.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { plan } from "../../scripts/gemini-neon-alias.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const AGY_BIN = process.env.AGY_BIN ?? "/opt/agy-lab/bin/agy";
const AGY_HOME = process.env.AGY_HOME ?? "/var/lib/agy-lab/home";
const PLAIN_REPEATS = Number(process.env.PLAIN_REPEATS ?? 3);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");

// ---- the plugin, as V installs it ----
const pluginDir = path.join(stateDir, "extensions", "v-antigravity");
fs.cpSync(path.resolve("apps/v-antigravity/plugin"), pluginDir, { recursive: true });

function mergeSet(config, dotted, value) {
  const keys = dotted.split(".");
  let node = config;
  for (const k of keys.slice(0, -1)) node = node[k] ??= {};
  const merge = (a, b) => {
    if (Array.isArray(b) || b === null || typeof b !== "object" || a === null || typeof a !== "object" || Array.isArray(a)) return structuredClone(b);
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = merge(a[k], v);
    return out;
  };
  node[keys.at(-1)] = merge(node[keys.at(-1)], value);
}
function configure(config) {
  for (const s of plan(config, { pluginDir, agyBin: AGY_BIN, agyHome: AGY_HOME }).sets) mergeSet(config, s.path, s.value);
  config.plugins.entries["v-antigravity"].config.runRoot = path.join(AGY_HOME, `openclaw-runs-${process.pid}`);
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  return config;
}
const config = configure(JSON.parse(fs.readFileSync(configPath, "utf8")));
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
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)));
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

function png(rgb, size = 96) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3).map((_, i) => rgb[i % 3])]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
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
  if (e.event === "agent" && p.stream === "tool") {
    const name = p.data?.name ?? p.data?.toolName ?? p.data?.tool?.name;
    if (name) (r.toolNames ??= new Set()).add(name);
    if ((r.toolRaw ??= []).length < 2) r.toolRaw.push(JSON.stringify(p.data ?? {}).slice(0, 200));
  }
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

async function send(sessionKey, message, extra = {}) {
  const runId = randomUUID();
  const r = { sentAt: Date.now() };
  runs.set(runId, r);
  const ack = await client.request("chat.send", { agentId: "makaron", sessionKey, deliver: false, timeoutMs: 300_000, idempotencyKey: runId, message, ...extra });
  return { runId, r, ack };
}
async function finish(sessionKey, { r }, limitMs = 330_000) {
  const until = Date.now() + limitMs;
  while (!r.terminal && Date.now() < until) await sleep(200);
  const history = await client.request("chat.history", { sessionKey, limit: 8 }).catch(() => null);
  const msgs = history?.messages ?? [];
  const last = [...msgs].reverse().find((m) => m.role === "assistant");
  const text = (Array.isArray(last?.content) ? last.content.filter((b) => b.type === "text").map((b) => b.text).join("") : String(last?.content ?? "")).trim();
  const logs = r.terminal === "final" ? undefined : lines.filter((l) => l.at >= r.sentAt && /error|fail|antigravity|agy|cli/iu.test(l.line)).slice(-20).map((l) => redact(l.line.replace(/\x1b\[[0-9;]*m/gu, "")).slice(0, 400));
  return {
    terminal: r.terminal ?? "timeout", error: r.error, logs, firstTextMs: r.firstTextAt ? r.firstTextAt - r.sentAt : null,
    totalMs: (r.endAt ?? Date.now()) - r.sentAt, provider: last?.provider, model: last?.model, text: text.slice(0, 200), tools: [...(r.toolNames ?? [])], toolRaw: r.toolRaw,
  };
}
const turn = async (key, message, extra) => finish(key, await send(key, message, extra));

const results = { neon: {}, deepseek: {}, identityPatched: null };
try {
  results.identityPatched = fs.readFileSync(path.join(dist, "system-prompt-params-B645JcX8.js"), "utf8").includes("v-identity-line-v1");
  startGateway();
  await connectGateway();
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !lines.some((l) => l.line.includes("[worker-runtime-prewarm.3]"))) await sleep(500);
  results.pluginLoaded = lines.some((l) => /v-antigravity/u.test(l.line));
  const stamp = Date.now();

  const n = results.neon;
  const nk = `agent:makaron:explicit:neon-agy-${stamp}`;
  n.directive = await turn(nk, "/neon");
  n.plain = [];
  for (let i = 0; i < PLAIN_REPEATS; i += 1) n.plain.push(await turn(nk, `（平台自动化测试）只回复这一串，不要别的：PLAIN_OK_${i}`));
  const memStart = Date.now();
  n.memory = await turn(nk, "（平台自动化测试）请调用 OpenClaw 的 memory_search 工具搜索「Makaron」，然后只回复：MEM=<命中条数>");
  n.memory.mcpLogs = lines.filter((l) => l.at >= memStart && /mcp|memory_search|memory-search|loopback|v-antigravity\] tool/iu.test(l.line)).map((l) => redact(l.line.replace(/\x1b\[[0-9;]*m/gu, "")).slice(0, 220)).slice(-10);
  if (process.env.PROBE_ONLY) {
    n.processStarts = lines.filter((l) => /v-antigravity\]|live session start|cli exec:/u.test(l.line)).map((l) => redact(l.line.replace(/\x1b\[[0-9;]*m/gu, "")).slice(0, 260));
    console.log(JSON.stringify({ probe: n }, null, 1));
    process.exit(0);
  }
  n.shell = await turn(nk, "（平台自动化测试）运行命令 `hostname`，然后只回复：HOST=<命令输出>");
  n.image = await turn(nk, "（平台自动化测试）附件这张图整体是什么颜色？只回答一个中文颜色词。", {
    attachments: [{ type: "image", mimeType: "image/png", fileName: "neon-blue.png", content: blue }],
  });
  // steer: a 25 s command, then a steered message 10 s in, on the same session
  const main = await send(nk, "（平台自动化测试）运行命令 `sleep 25`，结束后只回复：MAIN-DONE");
  await sleep(10_000);
  let steerAck;
  try { steerAck = (await send(nk, "STEER：请在最终回复末尾加上单词 KIWI", { queueMode: "steer" })).ack; } catch (error) { steerAck = { error: String(error?.message ?? error) }; }
  n.steer = { ...(await finish(nk, main)), steerAck: steerAck && JSON.stringify(steerAck).slice(0, 300) };
  n.steerLogs = lines.filter((l) => l.at >= main.r.sentAt && /steer|inject|antigravity/iu.test(l.line)).map((l) => redact(l.line.replace(/\x1b\[[0-9;]*m/gu, "")).slice(0, 240)).slice(-15);
  n.after = await turn(nk, "（平台自动化测试）只回复：AFTER_OK");
  console.log(JSON.stringify({ neon: n }, null, 1));

  const d = results.deepseek;
  const dk = `agent:makaron:explicit:neon-agy-ds-${stamp}`;
  d.directive = await turn(dk, "/deepseek");
  d.plain = [];
  for (let i = 0; i < PLAIN_REPEATS; i += 1) d.plain.push(await turn(dk, `（平台自动化测试）只回复这一串，不要别的：PLAIN_OK_${i}`));

  for (const t of [...n.plain, n.memory, n.shell, n.image, n.steer, n.after]) {
    assert.equal(t.terminal, "final", `neon turn ended ${t.terminal}: ${t.error} ${JSON.stringify(t.logs ?? [])}`);
    assert.equal(`${t.provider}/${t.model}`, "antigravity-cli/gemini-4-neon", "neon turn served by the Antigravity CLI");
  }
  assert(n.plain.every((t, i) => t.text.includes(`PLAIN_OK_${i}`)), "plain replies");
  // VLab's candidate has no memory index, so the tool answers "index metadata is missing";
  // what is checked here is that the call went through OpenClaw's MCP.
  assert(n.memory.mcpLogs.some((l) => /tool mcp_openclaw_memory_search/u.test(l)), `memory_search never reached OpenClaw's MCP: ${JSON.stringify(n.memory.mcpLogs)}`);
  assert(/HOST=\S+/u.test(n.shell.text), `shell reply: ${n.shell.text}`);
  assert(/蓝/u.test(n.image.text), `image reply: ${n.image.text}`);
  assert(/MAIN-DONE/u.test(n.steer.text) && /KIWI/u.test(n.steer.text), `steer reply: ${n.steer.text}`);
  assert(/AFTER_OK/u.test(n.after.text), `after reply: ${n.after.text}`);
  console.log("PASS /neon on the Antigravity CLI harness");
} finally {
  console.log(JSON.stringify({ summary: results }));
  await stopGateway();
  fs.rmSync(path.join(AGY_HOME, `openclaw-runs-${process.pid}`), { recursive: true, force: true });
}
