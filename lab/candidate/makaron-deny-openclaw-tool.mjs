// Candidate: `agents.entries.makaron.tools.deny: ["openclaw"]` (config/v-makaron-deny-openclaw-tool.json)
// must take the `openclaw` tool (the built-in system agent) away from makaron's runs and nothing else,
// applied with the official `openclaw config patch` to a running Gateway.
//
// Production V 2026-10-22 21:35 / 22:19 and 10-25 09:57: /vcodex sessions handed V's own
// diagnosis to the openclaw tool; each time the system agent ran doctor in the Gateway
// (frozen 310 / 158 / 208 s) and no answer reached V.
//
// Phases, all on candidate copies of shared VLab's config with V's reload setting (unset = hybrid):
//   before   no deny: a /vds turn (Codex harness: openclaw reaches Codex as a dynamic tool, as on
//            /vcodex) and a turn on makaron's default Worker route; record each run's tool list.
//   control  hot `openclaw config patch` of the same path to a tool that does not exist, to see
//            what a hot reload of agents.entries.makaron.tools does by itself.
//   hot      hot patch with config/v-makaron-deny-openclaw-tool.json.
//   restart  the Gateway stopped and started again on that config.
// candidate-32079ec3 showed the hot path removing openclaw but also reshaping Codex's tool list
// (gateway_exec/gateway_process replaced by read/edit/write/exec/process); control and restart
// tell whether that comes from the hot reload or from the deny.
// Pass (asserted): after restart each route's list is exactly the before list minus openclaw, all
// turns reply, and the hot patch reports no restart and reaches the derived Worker config.
//
// /vds instead of /vcodex: /vcodex needs the ChatGPT login, which candidates do not copy
// (memory: candidate-stale-oauth). The tool policy is resolved per agent before the harness.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, "../..");
// DENY_VARIANT=agent (default): agents.entries.makaron.tools.deny; codex: the Codex plugin's own
// codexDynamicToolsExclude, which only reaches Codex app-server turns.
const VARIANT = process.env.DENY_VARIANT ?? "agent";
assert(["agent", "codex"].includes(VARIANT));
const PATCH = path.join(repoRoot, VARIANT === "agent" ? "config/v-makaron-deny-openclaw-tool.json" : "config/v-codex-exclude-openclaw-tool.json");
const DENY_PATH = VARIANT === "agent" ? "agents.entries.makaron.tools.deny" : "plugins.entries.codex.config.codexDynamicToolsExclude";
const readDeny = (c) => VARIANT === "agent" ? c.agents?.entries?.makaron?.tools?.deny : c.plugins?.entries?.codex?.config?.codexDynamicToolsExclude;
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
const dist = `${runtime}/openclaw/dist`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");

const secrets = Object.fromEntries(fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u).map((l) => l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/gu, "")]));
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const tmpDir = path.join(scratch, "tmp");
const cacheDir = path.join(scratch, "cache");
for (const d of [tmpDir, cacheDir]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const config0 = JSON.parse(fs.readFileSync(configPath, "utf8"));
const env = {
  ...process.env, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, OPENCLAW_GATEWAY_PORT: String(config0.gateway?.port),
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
};

// ---- Codex plugin: V's install, as carried by shared VLab state ----
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(process.env.VLAB_SHARED_STATE_DIR, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}

// ---- config: shared VLab's, plus V's /vds; no channels or cron ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
// Shared VLab sets gateway.reload.mode=off; V leaves it unset, i.e. the default "hybrid".
// With "off" (candidate-df1a38f0) only the Worker picked the deny up; Codex runs in the
// Gateway kept the old tool list until a restart.
const sharedReload = config.gateway?.reload;
if (process.env.DENY_RELOAD_MODE === "shared") { /* keep shared VLab's setting */ } else delete config.gateway.reload;
assert.equal(config.agents.entries.makaron.tools?.deny, undefined, "candidate config already denies something for makaron");
const shape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) if (!config.models.providers.deepseek.models.some((m) => m.id === id)) config.models.providers.deepseek.models.push({ id, name, ...shape });
const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
config.agents.defaults.models[VDS_REF] = vdsEntry;
config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS_REF]: vdsEntry };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(VDS_REF)) allow.push(VDS_REF);
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin?.workerConfigPath, "Worker plugin config missing: the Worker route cannot be checked");
{
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith(".."), "candidate Worker config escaped state");
  const text = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, rel), "utf8").replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir).replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, text, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
const CODEX_HOME = path.join(config.agents.entries.makaron.agentDir, "codex-home");
fs.mkdirSync(CODEX_HOME, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(CODEX_HOME, "config.toml"), `[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });

// ---- Gateway ----
const lines = [];
let gateway;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) { s.setEncoding("utf8"); s.on("data", (c) => { for (const line of c.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); if (lines.length > 60000) lines.splice(0, lines.length - 60000); }); }
}
async function stopGateway() {
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((r) => gateway.once("exit", r)), sleep(20_000)]);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
async function waitPort() {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    if (await new Promise((resolve) => { const s = net.connect({ host: "127.0.0.1", port }); s.once("connect", () => { s.destroy(); resolve(true); }); s.once("error", () => resolve(false)); })) return;
    await sleep(500);
  }
  throw new Error("Gateway did not listen");
}
const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
const token = String(config.gateway?.auth?.token ?? "").replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? secrets[k] ?? "");
const runs = new Map();
let client;
async function connect() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      client = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
        const c = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"], scopes: ["operator.read", "operator.write", "operator.admin"],
          onEvent(e) { const p = e.payload; const r = runs.get(p?.runId); if (r && e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 300)); } },
          onHelloOk() { clearTimeout(timer); resolve(c); }, onConnectError(e) { clearTimeout(timer); reject(e); } });
        c.start();
      });
      return;
    } catch (error) {
      if (attempt >= 36) throw error;
      await sleep(5000);
    }
  }
}
async function send(key, message, timeoutMs = 300_000) {
  const id = randomUUID();
  const r = { id };
  runs.set(id, r);
  await client.request("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs }, { timeoutMs: 60_000 });
  const deadline = Date.now() + timeoutMs + 30_000;
  while (!r.terminal && Date.now() < deadline) await sleep(500);
  return r;
}
// The tools OpenClaw handed the run, as recorded on the session (what V's own sessions show).
function runTools(sessionKey) {
  const db = new DatabaseSync(path.join(config.agents.entries.makaron.agentDir, "openclaw-agent.sqlite"), { readOnly: true });
  try {
    const row = db.prepare("select entry_json from session_nodes where session_key = ?").get(sessionKey);
    const report = row && JSON.parse(row.entry_json)?.systemPromptReport;
    return { harnessModel: report && `${report.provider}/${report.model}`, tools: report?.tools?.entries?.map((t) => t.name) ?? null };
  } finally {
    db.close();
  }
}
async function turn(label, vds) {
  const key = `agent:makaron:explicit:deny-openclaw-${label}-${Date.now().toString(36)}`;
  if (vds) assert.equal((await send(key, "/vds", 60_000)).terminal, "final", `${label}: /vds`);
  const r = await send(key, "这是一次自动化测试。不要调用任何工具，只回复一行：收到。");
  const hist = await client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: 20 }, { timeoutMs: 15_000 });
  const last = [...(hist?.messages ?? [])].reverse().find((m) => m.role === "assistant");
  const reply = typeof last?.content === "string" ? last.content : (last?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { label, key, terminal: r.terminal, error: r.error, reply: redact(reply).slice(0, 200), ...runTools(key) };
}
const gatewayCall = (method, params) => client.request(method, params, { timeoutMs: 30_000 });

const strip = (l) => l.replace(/\x1b\[[0-9;]*m/gu, "");
async function patchHot(label, file) {
  const mark = lines.length;
  const pid = gateway.pid;
  const at = Date.now();
  const r = spawnSync(process.execPath, [`${dist}/index.js`, "config", "patch", "--file", file], { env, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `${label}: config patch failed: ${r.stderr}`);
  const want = JSON.stringify(readDeny(JSON.parse(fs.readFileSync(file, "utf8"))));
  let applied = null, derived = null;
  for (let i = 0; i < 90 && (applied === null || derived === null); i += 1) {
    await sleep(1000);
    if (applied === null && lines.slice(mark).some((l) => /config hot reload applied/u.test(l.line))) applied = Date.now() - at;
    if (derived === null && JSON.stringify(readDeny(JSON.parse(fs.readFileSync(workerPlugin.workerConfigPath, "utf8")))) === want) derived = Date.now() - at;
  }
  await sleep(8000);
  return {
    cli: redact(r.stdout).trim().slice(-200), hotReloadAppliedMs: applied, workerConfigDerivedMs: derived, samePid: gateway.exitCode === null && gateway.pid === pid,
    log: lines.slice(mark).map((l) => strip(l.line)).filter((l) => /\[reload\]|restart|Worker config derivation|generation/iu.test(l)).map((l) => redact(l).slice(0, 220)).slice(0, 20),
  };
}
const routes = async (label) => ({ vds: await turn(`${label}-vds`, true), worker: await turn(`${label}-worker`, false) });
const controlPatch = path.join(tmpDir, "control-deny.json");
fs.writeFileSync(controlPatch, JSON.stringify(VARIANT === "agent" ? { agents: { entries: { makaron: { tools: { deny: ["__no_such_tool_control__"] } } } } } : { plugins: { entries: { codex: { config: { codexDynamicToolsExclude: ["__no_such_tool_control__"] } } } } }));

const summary = { startedAt: new Date().toISOString(), variant: VARIANT, sharedReload, reload: config.gateway?.reload ?? "unset (default hybrid)" };
try {
  startGateway();
  await waitPort();
  await connect();
  summary.lookup = await gatewayCall("config.schema.lookup", { path: DENY_PATH }).then((r) => JSON.stringify(r).match(/"reloadKind":"[^"]*"/gu) ?? JSON.stringify(r).slice(0, 400)).catch((e) => ({ error: String(e?.message ?? e) }));
  summary.before = await routes("before");
  summary.controlPatch = await patchHot("control", controlPatch);
  summary.control = await routes("control");
  summary.hotPatch = await patchHot("hot", PATCH);
  summary.hot = await routes("hot");
  client.stop();
  await stopGateway();
  assert.deepEqual(readDeny(JSON.parse(fs.readFileSync(configPath, "utf8"))), ["openclaw"], "deny not in the Gateway config");
  startGateway();
  await waitPort();
  await connect();
  summary.restart = await routes("restart");
  summary.gatewayStarts = gatewayStarts;
} finally {
  client?.stop?.();
  await stopGateway();
}

const minus = (x, y) => x.filter((t) => !y.includes(t));
const diff = (from, to) => Object.fromEntries(["vds", "worker"].map((r) => [r, { removed: minus(from[r].tools ?? [], to[r].tools ?? []), added: minus(to[r].tools ?? [], from[r].tools ?? []) }]));
summary.diff = { control: diff(summary.before, summary.control), hot: diff(summary.before, summary.hot), restart: diff(summary.before, summary.restart) };
console.log(JSON.stringify({ summary }, null, 2));
for (const phase of ["before", "control", "hot", "restart"]) for (const r of ["vds", "worker"]) {
  const t = summary[phase][r];
  assert.equal(t.terminal, "final", `${t.label} did not finish: ${t.error ?? ""}`);
  assert(t.reply.includes("收到"), `${t.label} reply: ${t.reply}`);
  assert(Array.isArray(t.tools) && t.tools.length > 0, `${t.label}: no tool list recorded`);
}
for (const r of ["vds", "worker"]) assert(summary.before[r].tools.includes("openclaw"), `before: ${r} run did not have the openclaw tool, so the test measures nothing`);
// The agent deny reaches every route but also switches Codex off its native tool surface
// (candidate-bee8efea): reported, not asserted. The Codex exclude must touch nothing but openclaw on /vds.
if (VARIANT === "codex") {
  for (const phase of ["hot", "restart"]) {
    assert.deepEqual(summary.diff[phase].vds, { removed: ["openclaw"], added: [] }, `${phase}: /vds must lose exactly the openclaw tool`);
    assert.deepEqual(summary.diff[phase].worker, { removed: [], added: [] }, `${phase}: the Worker route must not change`);
  }
  assert.deepEqual(summary.diff.control.vds, { removed: [], added: [] }, "control: excluding a missing tool changed /vds");
} else {
  assert.deepEqual(summary.diff.restart.worker, { removed: ["openclaw"], added: [] }, "restart: Worker route must lose exactly the openclaw tool");
}
for (const p of [summary.controlPatch, summary.hotPatch]) {
  assert(p.samePid && p.hotReloadAppliedMs !== null, "hot patch did not apply in place");
  assert(p.workerConfigDerivedMs !== null, "Worker config never picked up the patch");
}

