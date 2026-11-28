// Live candidate for Tianyi to try /neon in VLab's Feishu (2026-11-28): the same runtime, plugin,
// patch and config change as neon-antigravity.mjs, but no scripted turns, VLab's Feishu channel
// kept, cron off. The shared VLab Gateway must be stopped first (it holds the same Feishu app's
// websocket); this runs until LIVE_STOP_FILE exists or LIVE_MAX_MINUTES pass.
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
  config.channels = config.channels?.feishu ? { feishu: config.channels.feishu } : {};
  // This candidate only: Neon is makaron's default, so a message without /neon works too
  // (Codex, the usual default, is off in candidates).
  if (config.agents.entries?.makaron) config.agents.entries.makaron.model = { primary: "antigravity/gemini-4-neon", fallbacks: [] };
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


const STOP = process.env.LIVE_STOP_FILE ?? "/var/lib/agy-lab/live-stop";
const READY = process.env.LIVE_READY_FILE ?? "/var/lib/agy-lab/live-ready";
const MAX_MS = Number(process.env.LIVE_MAX_MINUTES ?? 180) * 60_000;
fs.rmSync(STOP, { force: true });
fs.rmSync(READY, { force: true });
// The candidate runner needs the shared Gateway up to start; the operator stops it (under the
// integration lease) once this is waiting, so only one process ever holds the Feishu websocket.
const sharedPort = Number(process.env.SHARED_GATEWAY_PORT ?? 24993);
const { createConnection } = await import("node:net");
const sharedUp = () => new Promise((resolve) => { const c = createConnection(sharedPort, "127.0.0.1"); c.once("connect", () => { c.destroy(); resolve(true); }); c.once("error", () => resolve(false)); });
const waitUntil = Date.now() + 15 * 60_000;
console.log(`waiting for the shared Gateway on ${sharedPort} to stop`);
fs.writeFileSync(`${READY}.waiting`, `${process.pid}\n`);
while (await sharedUp()) { if (Date.now() > waitUntil) throw new Error("shared Gateway still running; not connecting a second Feishu client"); await sleep(2_000); }
fs.rmSync(`${READY}.waiting`, { force: true });
try {
  startGateway();
  await connectGateway();
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !lines.some((l) => l.line.includes("[worker-runtime-prewarm.3]"))) await sleep(500);
  const feishu = lines.filter((l) => /feishu/iu.test(l.line) && /connect|ready|start|websocket|ws/iu.test(l.line)).slice(-5).map((l) => redact(l.line.replace(/\x1b\[[0-9;]*m/gu, "")).slice(0, 200));
  fs.writeFileSync(READY, JSON.stringify({ at: new Date().toISOString(), pid: gateway.pid, port, feishu }) + "\n");
  console.log(JSON.stringify({ ready: true, feishu }));
  const started = Date.now();
  let seen = 0;
  while (!fs.existsSync(STOP) && Date.now() - started < MAX_MS && gateway.exitCode === null) {
    await sleep(5_000);
    const fresh = lines.slice(seen).filter((l) => /v-antigravity\]|cli exec:|cli turn:|antigravity-cli/u.test(l.line)).map((l) => redact(l.line.replace(/\x1b\[[0-9;]*m/gu, "")).slice(0, 240));
    seen = lines.length;
    for (const line of fresh) console.log(line);
  }
  console.log(JSON.stringify({ stopped: fs.existsSync(STOP) ? "stop file" : gateway.exitCode !== null ? `gateway exited ${gateway.exitCode}` : "max minutes" }));
} finally {
  await stopGateway();
  fs.rmSync(READY, { force: true });
  fs.rmSync(path.join(AGY_HOME, `openclaw-runs-${process.pid}`), { recursive: true, force: true });
}
