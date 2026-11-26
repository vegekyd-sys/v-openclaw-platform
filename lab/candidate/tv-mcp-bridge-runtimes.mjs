// Candidate test: the Xiaomi TV MCP as V configures it today (stdio, one process per
// session) versus through scripts/v-tv-mcp-bridge.mjs (one shared url server), in real
// Agent turns on one runtime per run:
//   HARNESS=worker  deepseek/deepseek-flash on vlab-worker  (V's Gateway/worker sessions)
//   HARNESS=vds     deepseek/vds-deepseek-flash on codex     (/vds, /vcodex: Codex app-server)
//   HARNESS=vcc     claude-cli                               (/vcc)
//
// Needs lab/tv-mcp-bridge-vlab-fixture.sh up (root-side bridge + baseline relay).
// Phase "baseline": mcp.servers.xiaomi-tv-remote = V's stdio entry, the command pointed at
// /run/tv-mcp-cand/stdio-baseline.py (the real stdio.py, reaching HA through the relay).
// Phase "bridge": the url entry planned for V, token via ${V_TV_MCP_TOKEN} from the state
// dir .env (as ~/.openclaw/.env on V); the same entry is written to the Worker config.
// Each phase: private Gateway, SESSIONS sessions each asked to call tv_status (read-only)
// and quote it; then counts stdio processes, their parents and the cgroup's tasks.
// PASS: every turn called tv_status and quoted the same result the TV MCP gives directly;
// bridge phase spawned no per-session process and the bridge kept one upstream.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const HARNESS = process.env.HARNESS ?? "worker";
const SESSIONS = Number(process.env.SESSIONS ?? 3);
const PHASES = (process.env.PHASES ?? "baseline,bridge").split(",");
const FIX = "/run/tv-mcp-cand";
const BRIDGE = "http://127.0.0.1:18791";
const TOOLS = ["tv_status", "tv_command", "tv_play", "tv_volume", "tv_pause", "tv_screen"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const token = fs.readFileSync(`${FIX}/token`, "utf8").trim();

const MODELS = {
  worker: { ref: "deepseek/deepseek-flash", gateway: "vlab-worker", worker: "openclaw", params: { thinking: "low" } },
  vds: { ref: "deepseek/vds-deepseek-flash", gateway: "codex", worker: "codex", params: { thinking: "low" } },
  // VLab's Claude Code predates claude-opus-5-5; CLAUDE_MODEL overrides.
  vcc: { ref: process.env.CLAUDE_MODEL ?? "anthropic/claude-opus-5", gateway: "claude-cli", worker: "claude-cli", params: { thinking: "low" } },
}[HARNESS];
assert(MODELS, `unknown HARNESS ${HARNESS}`);

const mcpEntry = (phase) => ({
  enabled: true,
  ...(phase === "baseline"
    ? { transport: "stdio", command: "/usr/bin/python3", args: ["-I", `${FIX}/stdio-baseline.py`] }
    : { transport: "streamable-http", url: `${BRIDGE}/mcp`, headers: { Authorization: "Bearer ${V_TV_MCP_TOKEN}" } }),
  connectionTimeoutMs: 10000,
  requestTimeoutMs: 15000,
  supportsParallelToolCalls: false,
  toolFilter: { include: TOOLS },
});

function configure(config, runtimeId, phase) {
  const model = { primary: MODELS.ref, fallbacks: [] };
  const existing = config.agents.defaults.models?.[MODELS.ref] ?? config.agents.entries?.makaron?.models?.[MODELS.ref] ?? {};
  const perAgent = { ...existing, alias: existing.alias ?? "tv-test", agentRuntime: { id: runtimeId }, params: { ...(existing.params ?? {}), ...MODELS.params } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODELS.ref] = perAgent;
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(MODELS.ref)) allow.push(MODELS.ref);
  if (config.agents.entries?.makaron) { config.agents.entries.makaron.model = model; (config.agents.entries.makaron.models ??= {})[MODELS.ref] = perAgent; }
  if (HARNESS !== "vds" && config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  if (config.agents.defaults.heartbeat) config.agents.defaults.heartbeat.every = "0m";
  config.mcp = { ...(config.mcp ?? {}), servers: { ...(config.mcp?.servers ?? {}), "xiaomi-tv-remote": mcpEntry(phase) } };
  return config;
}

const pristineConfig = fs.readFileSync(configPath, "utf8");
const pristine = JSON.parse(pristineConfig);
const workerPluginPristine = pristine.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPluginPristine, "worker isolation plugin is not configured");
const workerRel = path.relative(stateDir, workerPluginPristine.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerPristine = fs.readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);

function writeConfigs(phase) {
  const config = configure(JSON.parse(pristineConfig), MODELS.gateway, phase);
  const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"].config;
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, sessionsPerWorker: 3, warmSpareWorkers: 0, gatewayConfigPath: configPath });
  const workerConfig = configure(JSON.parse(workerPristine), MODELS.worker, phase);
  workerConfig.channels = {};
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return config;
}

// The token lives where V keeps it: the state dir .env (loaded by OpenClaw on every config read).
fs.writeFileSync(path.join(stateDir, ".env"), `V_TV_MCP_TOKEN=${token}\n`, { mode: 0o600 });

// ---- vds: managed npm plugins (Codex with V's /vds patches) + DeepSeek provider in codex-home
const env = { ...process.env };
delete env.V_TV_MCP_TOKEN;
if (HARNESS === "vds") {
  const sharedNpm = path.join(sharedState, "npm");
  if (!fs.existsSync(path.join(stateDir, "npm"))) assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
  const agentDir = pristine.agents.entries?.makaron?.agentDir;
  assert(agentDir, "makaron agentDir");
  const codexHome = path.join(agentDir, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const tomlPath = path.join(codexHome, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
  if (!env.DEEPSEEK_API_KEY) {
    const line = fs.readFileSync("/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env", "utf8").split(/\r?\n/u).find((l) => /^\s*(?:export\s+)?DEEPSEEK_API_KEY=/u.test(l));
    env.DEEPSEEK_API_KEY = line?.split("=").slice(1).join("=").replace(/^['"]|['"]$/gu, "");
  }
  assert(env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY");
}

// ---- the TV MCP answered directly, for comparison (read-only)
function directStatus() {
  const input = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "cand", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "tv_status", arguments: {} } },
  ].map((m) => JSON.stringify(m)).join("\n");
  const r = spawnSync("/bin/sh", ["-c", `(printf '%s\\n' "$IN"; sleep 12) | /usr/bin/python3 -I ${FIX}/stdio-baseline.py | head -2 | tail -1`], { env: { ...process.env, IN: input }, encoding: "utf8", timeout: 20_000 });
  const reply = JSON.parse(r.stdout.trim());
  const body = JSON.parse(reply.result.content[0].text);
  return { isError: Boolean(reply.result.isError), keys: Object.keys(body).sort(), error: body.error ?? null, contract: body.response_contract ?? null };
}

// ---- measurement
// Processes and threads (kernel tasks, what TasksMax/pids.max count) in the Gateway's tree:
// Gateway, workers, Codex app-server, claude-cli and every MCP child they spawn.
const cgroupTasks = () => {
  if (!gateway?.pid) return null;
  const tree = [...gatewayTree()];
  let threads = 0;
  for (const pid of tree) { try { threads += Number(fs.readFileSync(`/proc/${pid}/status`, "utf8").match(/^Threads:\s+(\d+)/mu)[1]); } catch {} }
  return { processes: tree.length, threads };
};
function procs() {
  const out = [];
  for (const pid of fs.readdirSync("/proc").filter((p) => /^\d+$/u.test(p))) {
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ");
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      out.push({ pid: Number(pid), ppid, cmd });
    } catch {}
  }
  return out;
}
function gatewayTree(all = procs()) {
  if (!gateway?.pid) return new Set();
  const kids = new Map();
  for (const p of all) (kids.get(p.ppid) ?? kids.set(p.ppid, []).get(p.ppid)).push(p.pid);
  const tree = new Set();
  for (const stack = [gateway.pid]; stack.length;) { const pid = stack.pop(); tree.add(pid); stack.push(...(kids.get(pid) ?? [])); }
  return tree;
}
// Only this candidate's Gateway tree: other candidates may run on the host at the same time.
function stdioProcesses() {
  const all = procs();
  const byPid = new Map(all.map((p) => [p.pid, p]));
  const tree = gatewayTree(all);
  return all.filter((p) => tree.has(p.pid) && p.cmd.includes("stdio-baseline.py") && !p.cmd.startsWith("/bin/sh")).map((p) => {
    const parent = byPid.get(p.ppid)?.cmd ?? "";
    const kind = /\bcodex\b/u.test(parent) ? "codex" : /claude/u.test(parent) ? "claude-cli" : /worker/u.test(parent) ? "worker" : /gateway/u.test(parent) ? "gateway" : parent.slice(0, 60);
    return { pid: p.pid, parent: kind };
  });
}
const countBy = (xs) => xs.reduce((m, x) => ({ ...m, [x.parent]: (m[x.parent] ?? 0) + 1 }), {});
const bridgeHealth = async () => { try { return await (await fetch(`${BRIDGE}/healthz`)).json(); } catch (e) { return { error: e.message }; } };

// ---- Gateway
let gateway, client, lines = [];
function startGateway(extraEnv = {}) {
  lines = [];
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env: { ...env, ...extraEnv, OPENCLAW_GATEWAY_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push(line); if (lines.length > 80_000) lines.splice(0, lines.length - 80_000); });
  }
}
let port, gwToken;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).join("\n"))}`);
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token: gwToken, deviceIdentity: null, clientName: "cli", mode: "cli",
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

async function turn(phase, i) {
  const sessionKey = `agent:makaron:explicit:tv-mcp-${HARNESS}-${phase}-${i}-${Date.now()}`;
  const runId = randomUUID();
  const t0 = Date.now();
  await client.request("chat.send", {
    agentId: "makaron", sessionKey, deliver: false, thinking: "low", timeoutMs: 300000, idempotencyKey: runId,
    message: "（平台自动化测试，私有测试环境）请调用一次 xiaomi-tv-remote 的 tv_status 工具（只读，不要调用任何其它电视工具），" +
      "然后把工具返回的 JSON 原文用一个代码块原样贴给我，不要改写或省略字段。",
  });
  const mark = lines.length;
  const waited = await client.request("agent.wait", { runId, timeoutMs: 300_000 }).catch((e) => ({ error: String(e?.message ?? e) }));
  const history = JSON.stringify(await client.request("chat.history", { sessionKey, limit: 50 }).catch(() => ""));
  // The prompt itself names tv_status; a call is proven only by the tool's own output.
  const toolOutputs = (history.match(/unauthorized\(401\)|tv-status-v3|TV busy|TV MCP (unavailable|upstream)/gu) ?? []).length;
  return {
    sessionKey, ms: Date.now() - t0, wait: waited?.status ?? waited,
    waitError: waited?.error ?? null,
    errorLines: waited?.status === "ok" ? [] : lines.slice(mark).filter((l) => /error|fail|denied|refus/iu.test(l)).slice(-4).map((l) => redact(l).slice(0, 300)),
    calledTvStatus: toolOutputs > 0,
    toolOutputs,
    replyTail: redact(history.slice(-400)),
    quotes401: history.includes("unauthorized(401)"),
    quotesContract: history.includes("tv-status-v3"),
    mentionsUnavailable: /TV MCP unavailable|upstream (unavailable|disconnected)|unauthorized\\"|401 Unauthorized/u.test(history) && !history.includes("unauthorized(401)"),
  };
}

// Hot switch, the way V would roll out and back: Gateway running on the stdio entry, then
// scripts/v-tv-mcp-switch.mjs (what install-v-tv-mcp-bridge.sh runs on V: token check against
// the Gateway's environ, bridge self-test, current-entry assertion + archive, `openclaw config
// set` on a copy first) to the url entry, a turn in the same and in a new session, then its
// rollback to the archived entry and one more turn. Only the main config is written; the
// Worker config must follow by derivation, and the pool must live.
const HELPER = fileURLToPath(new URL("../../scripts/v-tv-mcp-switch.mjs", import.meta.url));
const archiveDir = path.join(stateDir, "tv-mcp-switch-archive");
function helper(cmd, extra = []) {
  const args = [HELPER, cmd, "--config", configPath, "--dotenv", path.join(stateDir, ".env"), "--run-as", "", "--home", "", "--state-dir", stateDir,
    "--archive-dir", archiveDir, "--url", `${BRIDGE}/mcp`, "--cli", JSON.stringify([process.execPath, `${dist}/index.js`]),
    "--gateway-pid", String(gateway.pid), "--stdio-entry", JSON.stringify(mcpEntry("baseline")), ...extra];
  const r = spawnSync(process.execPath, args, { env, encoding: "utf8", timeout: 600_000 });
  return { status: r.status, out: redact(`${r.stdout}${r.stderr}`).trim().split("\n").slice(-4).join(" | ").slice(0, 700) };
}
const leaves = (a, b, p = "") => {
  const rec = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  if ((rec(a) || a === undefined) && (rec(b) || b === undefined) && (rec(a) || rec(b))) return [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].flatMap((k) => leaves(a?.[k], b?.[k], p ? `${p}.${k}` : k));
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [p];
};
const outsideEntry = (paths) => paths.filter((x) => !x.startsWith("mcp.servers.xiaomi-tv-remote"));
const workerCfgEntry = (cfg) => {
  try { return JSON.parse(fs.readFileSync(cfg.plugins.entries["vlab-agent-worker-isolation"].config.workerConfigPath, "utf8")).mcp?.servers?.["xiaomi-tv-remote"]?.transport ?? null; } catch (e) { return `unreadable: ${e.message}`; }
};
const workersStatus = async () => {
  const s = await client.request("vlab.workers.status", {}).catch((e) => ({ error: String(e?.message ?? e) }));
  return { workers: s?.workers ?? s?.pool?.workers ?? s?.size ?? null, closing: s?.closing ?? s?.pool?.closing ?? null, generation: s?.generation ?? s?.pool?.generation ?? null, keys: Object.keys(s ?? {}).slice(0, 12) };
};
async function hotSwitch() {
  // V's order: the Gateway (and its Codex app-server) are already running when the token
  // is added to ~/.openclaw/.env. So start without it and add it right before `mcp set`.
  // HOTSWITCH_TOKEN_AT=switch (default): the token reaches .env only right before `mcp set`.
  // HOTSWITCH_TOKEN_AT=start: it is there when the Gateway starts (V after the next restart).
  const tokenAtStart = process.env.HOTSWITCH_TOKEN_AT === "start";
  const dotenv = path.join(stateDir, ".env");
  if (!tokenAtStart) fs.rmSync(dotenv, { force: true });
  fs.rmSync(archiveDir, { recursive: true, force: true });
  const config = writeConfigs("baseline");
  port = Number(config.gateway?.port); gwToken = config.gateway?.auth?.token;
  const h0 = await bridgeHealth();
  // On V the token reaches the Gateway's environment through systemd EnvironmentFile=.env.
  startGateway(tokenAtStart ? { V_TV_MCP_TOKEN: token } : {});
  await connectGateway();
  const ready = Date.now() + 240_000;
  while (Date.now() < ready && !lines.some((l) => l.includes("[worker-runtime-prewarm"))) await sleep(500);
  await sleep(5_000);
  const out = { tokenAt: tokenAtStart ? "start" : "switch", steps: [] };
  const step = async (label, extra = {}) => { const s = stdioProcesses(); const h = await bridgeHealth(); out.steps.push({ label, stdio: s.length, byParent: countBy(s), bridgeForwarded: h.forwarded - h0.forwarded, bridgeUnauthorized: (h.unauthorized ?? 0) - (h0.unauthorized ?? 0), workerConfig: workerCfgEntry(config), pool: await workersStatus(), tasks: cgroupTasks(), ...extra }); };
  const s1 = await turn("hot", 1);
  await step("stdio: session 1", { turn: s1 });
  const logMark = lines.length;
  fs.writeFileSync(dotenv, `V_TV_MCP_TOKEN=${token}\n`, { mode: 0o600 });
  const beforeBytes = fs.readFileSync(configPath, "utf8");
  if (!tokenAtStart) {
    // The Gateway started without the token: the helper must refuse and write nothing.
    out.switchRefused = helper("switch");
    out.switchRefusedUnchanged = fs.readFileSync(configPath, "utf8") === beforeBytes;
    await stopGateway();
    return out;
  }
  // Guards, on the live Gateway: dry run writes nothing; a .env token that differs from the
  // Gateway's (re-install / restore after start) is refused.
  out.plan = helper("switch", ["--dry-run"]);
  out.planUnchanged = fs.readFileSync(configPath, "utf8") === beforeBytes;
  fs.writeFileSync(dotenv, `V_TV_MCP_TOKEN=${"x".repeat(43)}\n`, { mode: 0o600 });
  out.mismatch = helper("check-token");
  fs.writeFileSync(dotenv, `V_TV_MCP_TOKEN=${token}\n`, { mode: 0o600 });
  out.switchToBridge = helper("switch");
  out.switchChangedOutside = outsideEntry(leaves(JSON.parse(beforeBytes), JSON.parse(fs.readFileSync(configPath, "utf8"))));
  out.archived = fs.existsSync(path.join(archiveDir, "latest.json")) ? JSON.parse(fs.readFileSync(path.join(archiveDir, "latest.json"), "utf8")).entry?.command : null;
  await sleep(15_000);
  out.reloadLogs = lines.slice(logMark).filter((l) => /reload|mcp|worker.*(gen|roll|config)|pool is closing|before plugin reload/iu.test(l)).slice(0, 20).map((l) => redact(l).slice(0, 240));
  await step("after mcp set url (15 s)");
  const s1b = await turn("hot", 2);
  await step("url: new session", { turn: s1b });
  // the same session as the first stdio turn
  const sameKey = s1.sessionKey;
  const runId = randomUUID();
  await client.request("chat.send", { agentId: "makaron", sessionKey: sameKey, deliver: false, thinking: "low", timeoutMs: 300000, idempotencyKey: runId, message: "再调用一次 tv_status（只读），把返回的 JSON 原样贴出来。" });
  await client.request("agent.wait", { runId, timeoutMs: 300_000 }).catch(() => null);
  const hist = JSON.stringify(await client.request("chat.history", { sessionKey: sameKey, limit: 80 }).catch(() => ""));
  await step("url: same session as stdio turn", { sameSessionQuotes: (hist.match(/unauthorized\(401\)|tv-status-v3/gu) ?? []).length });
  const mark2 = lines.length;
  const beforeBack = fs.readFileSync(configPath, "utf8");
  out.switchBack = helper("rollback");
  const backConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  out.switchBackChangedOutside = outsideEntry(leaves(JSON.parse(beforeBack), backConfig));
  out.switchBackEntryIsBaseline = JSON.stringify(backConfig.mcp.servers["xiaomi-tv-remote"]) === JSON.stringify(mcpEntry("baseline"));
  await sleep(15_000);
  out.rollbackLogs = lines.slice(mark2).filter((l) => /reload|pool is closing|before plugin reload/iu.test(l)).slice(0, 10).map((l) => redact(l).slice(0, 240));
  const s3 = await turn("hot", 3);
  await step("rolled back to stdio: new session", { turn: s3 });
  out.poolClosing = lines.filter((l) => l.includes("pool is closing")).length;
  out.pluginReload = lines.filter((l) => l.includes("before plugin reload")).length;
  await stopGateway();
  return out;
}

// claude-cli keeps its own MCP connection log per server (V: ~/.cache/claude-cli-nodejs/<cwd>/mcp-logs-xiaomi-tv-remote).
function claudeMcpLogs(sinceMs) {
  const roots = [env.HOME, env.XDG_CACHE_HOME, stateDir, process.env.VLAB_CANDIDATE_DATA, "/tmp"].filter(Boolean);
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 7) return;
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name === "mcp-logs-xiaomi-tv-remote") found.push(p); else if (!["node_modules", "npm", ".git"].includes(e.name)) walk(p, depth + 1); }
    }
  };
  for (const r of roots) walk(r, 0);
  const out = [];
  for (const d of found) for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).mtimeMs < sinceMs) continue;
    for (const l of fs.readFileSync(p, "utf8").split("\n").filter(Boolean)) { try { out.push(JSON.parse(l).debug ?? JSON.parse(l).error); } catch {} }
  }
  return out.filter(Boolean).map((l) => redact(l).slice(0, 300));
}

const direct = directStatus();
const report = { harness: HARNESS, model: MODELS.ref, sessions: SESSIONS, direct, phases: {} };
try {
  for (const phase of PHASES) {
    if (phase === "hotswitch") { report.hotswitch = await hotSwitch(); continue; }
    const phaseStart = Date.now();
    const config = writeConfigs(phase);
    port = Number(config.gateway?.port); gwToken = config.gateway?.auth?.token;
    const healthBefore = await bridgeHealth();
    startGateway();
    await connectGateway();
    const ready = Date.now() + 240_000;
    while (Date.now() < ready && !lines.some((l) => l.includes("[worker-runtime-prewarm"))) await sleep(500);
    await sleep(5_000);
    const idle = { tasks: cgroupTasks(), stdio: stdioProcesses().length };
    const turns = [];
    const samples = [];
    for (let i = 1; i <= SESSIONS; i += 1) {
      turns.push(await turn(phase, i));
      await sleep(2_000);
      const s = stdioProcesses();
      samples.push({ afterSession: i, tasks: cgroupTasks(), stdio: s.length, byParent: countBy(s) });
    }
    const healthAfter = await bridgeHealth();
    report.phases[phase] = {
      idle, samples, turns,
      perSessionStdio: (samples.at(-1).stdio - idle.stdio) / SESSIONS,
      bridge: phase === "bridge" ? { spawnsDelta: healthAfter.spawns - healthBefore.spawns, forwardedDelta: healthAfter.forwarded - healthBefore.forwarded, upstream: healthAfter.upstream } : undefined,
      claudeMcpLog: HARNESS === "vcc" ? claudeMcpLogs(phaseStart) : undefined,
      mcpLogLines: lines.filter((l) => /xiaomi-tv-remote|bundle-mcp|mcp:/iu.test(l)).slice(-8).map((l) => redact(l).slice(0, 300)),
    };
    await stopGateway();
    await sleep(3_000);
  }
} finally {
  await stopGateway();
  fs.writeFileSync(configPath, pristineConfig, { mode: 0o600 });
}
console.log(JSON.stringify(report, null, 1));
if (report.hotswitch) {
  const hs = report.hotswitch;
  if (hs.switchRefused) {
    assert.equal(hs.switchRefused.status, 3, `switch without the token in the Gateway's environment was not refused: ${hs.switchRefused.out}`);
    assert(hs.switchRefusedUnchanged, "refused switch changed the config");
    console.log(`PASS harness=${HARNESS} (switch refused: Gateway started without the token)`);
    process.exit(0);
  }
  assert.equal(hs.plan.status, 0, `dry run failed: ${hs.plan.out}`);
  assert(hs.planUnchanged, "dry run changed the config");
  assert.equal(hs.mismatch.status, 7, `token mismatch not refused: ${hs.mismatch.out}`);
  assert.equal(hs.switchToBridge.status, 0, `switch failed: ${hs.switchToBridge.out}`);
  assert.deepEqual(hs.switchChangedOutside, [], "switch changed config outside the entry");
  assert.equal(hs.archived, mcpEntry("baseline").command, "switch did not archive the stdio entry");
  assert.equal(hs.switchBack.status, 0, `rollback failed: ${hs.switchBack.out}`);
  assert.deepEqual(hs.switchBackChangedOutside, [], "rollback changed config outside the entry");
  assert(hs.switchBackEntryIsBaseline, "rollback did not restore the archived entry");
  for (const st of hs.steps.filter((x) => x.turn)) assert(st.turn.calledTvStatus && st.turn.quotes401 === Boolean(direct.error?.includes("401")), `hotswitch ${st.label}: tool result differs`);
  const url = hs.steps.find((x) => x.label === "url: new session");
  assert(url.bridgeForwarded >= 2, "after mcp set, the new session did not go through the bridge");
  assert.equal(hs.poolClosing, 0, "worker pool closed during the hot switch");
}
for (const [phase, r] of Object.entries(report.phases)) {
  // VLab has no live Claude Code login (root's expired 2026-06-16). Then the model never
  // runs, and the evidence for /vcc is Claude Code's own MCP log: it connected to this
  // phase's server and listed the tools before the turn failed on authentication.
  if (HARNESS === "vcc" && r.turns.every((t) => /OAuth|authenticat/iu.test(t.waitError ?? ""))) {
    const want = phase === "bridge" ? /connected \(transport: http\)/u : /connected \(transport: stdio\)/u;
    assert(r.claudeMcpLog.some((l) => want.test(l)), `${phase}: Claude Code did not connect (${JSON.stringify(r.claudeMcpLog.slice(0, 5))})`);
    report.vccModelUnavailable = true;
    continue;
  }
  for (const t of r.turns) {
    assert(t.calledTvStatus, `${phase}: turn did not call tv_status`);
    assert(direct.error ? t.quotes401 || !direct.error.includes("401") : t.quotesContract, `${phase}: turn did not return what the TV MCP returns directly`);
  }
}
if (report.phases.bridge) {
  assert.equal(report.phases.bridge.samples.at(-1).stdio, 0, "bridge phase spawned per-session stdio processes");
  assert.equal(report.phases.bridge.bridge.spawnsDelta <= 1, true, "bridge reconnected more than once");
  assert(report.phases.bridge.bridge.forwardedDelta >= SESSIONS, "bridge did not serve the turns");
}
console.log(`PASS harness=${HARNESS}${report.vccModelUnavailable ? " (MCP connection only: no Claude login on VLab)" : ""}`);
