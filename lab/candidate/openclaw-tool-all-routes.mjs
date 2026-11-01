// Candidate: take the `openclaw` tool (the built-in system agent) away from every makaron route
// with `agents.entries.makaron.tools.deny: ["openclaw"]`, while Codex keeps its native tool
// surface thanks to lab/release-files/openclaw-tool-safe-deny (core selection module: a deny of
// `openclaw` no longer marks plugin-harness runs "tool policy restricted").
//
// Starting point is V since 2026-10-26 02:58: plugins.entries.codex.config.codexDynamicToolsExclude
// = ["openclaw"] (PR #479), so Codex turns already lack openclaw and Worker / Gateway-embedded
// turns still have it. Without the patch the same deny turns Codex's native surface off
// (gateway_exec/gateway_process replaced by read/edit/write/exec/process; candidate-bee8efea).
//
// Routes, one fresh session each per phase, all replying to the same one-line prompt:
//   vds       /vds: Codex harness + DeepSeek (same harness as /vcodex)
//   worker    makaron's default model on the vlab-worker harness
//   embedded  deepseek/deepseek-v4-pro pinned to agentRuntime "openclaw" (in the Gateway)
//   vcc       /vcc: claude-cli. Not in the plan: shared VLab's Claude login is refused ("Your
//             organization has disabled Claude subscription access for Claude Code", candidate-8d6d58e0).
// Phases:
//   before    V's selection-BC0YSSFq.js bytes, no deny
//   patched   Gateway restarted on the patched module, still no deny: nothing may change
//   hot       `openclaw config patch` adds the deny to the running Gateway
//   restart   the Gateway stopped and started again on that config
// Pass: patched = before on every route; in hot and restart, vds is identical to before and
// worker / embedded / vcc lost exactly openclaw; every turn replies; the deny applies hot.
// OC_ROUTES=vds,worker,embedded,vcc picks routes (default all four).
//
// /vcodex needs the ChatGPT login (memory: candidate-stale-oauth); /vds runs the same Codex
// harness code.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
const PATCH = path.join(repoRoot, "config/v-makaron-deny-openclaw-tool.json");
const V_SELECTION = path.join(repoRoot, "release/captured/v2026.9.1-db91.6-sessions-search-20261026/dist/selection-BC0YSSFq.js");
const PATCHED_SELECTION = path.join(repoRoot, "lab/release-files/openclaw-tool-safe-deny/dist/selection-BC0YSSFq.js");
const V_SELECTION_SHA = "5a0c1a19c69b2c7993405bab62e42268d899eec4e5b70ad889cc6f088cf69ccf";
const PATCHED_SELECTION_SHA = "b55b53525a4e668c4c242090893d6f8cb4de0ac96899b444f0dd85cf3f8bdaa4";
const DENY_PATH = "agents.entries.makaron.tools.deny";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
const EMBEDDED_REF = "deepseek/deepseek-v4-pro";
const dist = `${runtime}/openclaw/dist`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const strip = (l) => l.replace(/\x1b\[[0-9;]*m/gu, "");

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

// ---- Codex plugin: shared VLab's copy of V's install ----
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(process.env.VLAB_SHARED_STATE_DIR, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}
// ---- core module under test: start from V's bytes (the candidate baseline may differ) ----
const selectionFile = path.join(dist, "selection-BC0YSSFq.js");
const baselineSelectionSha = sha(selectionFile);
assert.equal(sha(V_SELECTION), V_SELECTION_SHA, "V selection input is not V's bytes");
assert.equal(sha(PATCHED_SELECTION), PATCHED_SELECTION_SHA, "patched selection input is not the release bytes");
fs.copyFileSync(V_SELECTION, selectionFile);

// ---- config: shared VLab's, V's reload setting, V's /vds, V's Codex exclude (#479) ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const sharedReload = config.gateway?.reload;
delete config.gateway.reload; // V leaves it unset (hybrid); shared VLab has mode=off
assert.equal(config.agents.entries.makaron.tools?.deny, undefined, "candidate config already denies something for makaron");
const shape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"], ["deepseek-v4-pro", "DeepSeek V4 Pro"]]) if (!config.models.providers.deepseek.models.some((m) => m.id === id)) config.models.providers.deepseek.models.push({ id, name, ...shape });
const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
config.agents.defaults.models[VDS_REF] = vdsEntry;
config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS_REF]: vdsEntry, [EMBEDDED_REF]: { agentRuntime: { id: "openclaw" } } };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow)) for (const ref of [VDS_REF, EMBEDDED_REF]) if (!allow.includes(ref)) allow.push(ref);
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), codexDynamicToolsExclude: ["openclaw"], appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
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
        let c;
        const timer = setTimeout(() => { c?.stop(); reject(new Error("connect deadline")); }, 30_000);
        c = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"], scopes: ["operator.read", "operator.write", "operator.admin"],
          onEvent(e) { const p = e.payload; const r = runs.get(p?.runId); if (r && e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 300)); } },
          onHelloOk() { clearTimeout(timer); resolve(c); }, onConnectError(e) { clearTimeout(timer); c.stop(); reject(e); } });
        // A client that missed its hello keeps reconnecting in the background and keeps this
        // process alive after the run (candidate-8678fdfe never exited): stop it on any failure.
        c.start();
      });
      return;
    } catch (error) {
      if (attempt >= 36) throw error;
      await sleep(5000);
    }
  }
}
async function boot() {
  startGateway();
  await waitPort();
  await connect();
}
async function shutdown() {
  client?.stop?.();
  await stopGateway();
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
// The tools OpenClaw handed the run and the harness it ran on, as recorded on the session.
function runRecord(sessionKey) {
  const db = new DatabaseSync(path.join(config.agents.entries.makaron.agentDir, "openclaw-agent.sqlite"), { readOnly: true });
  try {
    const row = db.prepare("select n.entry_json as entry, w.agent_harness_id as harness from session_nodes n left join session_windows w on w.session_id = n.current_session_id where n.session_key = ?").get(sessionKey);
    const report = row && JSON.parse(row.entry)?.systemPromptReport;
    return { harness: row?.harness ?? null, model: report && `${report.provider}/${report.model}`, tools: report?.tools?.entries?.map((t) => t.name) ?? null };
  } finally {
    db.close();
  }
}
async function turn(label, route) {
  const key = `agent:makaron:explicit:oc-routes-${label}-${route}-${Date.now().toString(36)}`;
  if (route === "vds") assert.equal((await send(key, "/vds", 60_000)).terminal, "final", `${label}: /vds`);
  if (route === "embedded") await client.request("sessions.patch", { key, agentId: "makaron", model: EMBEDDED_REF }, { timeoutMs: 30_000 });
  if (route === "vcc") assert.equal((await send(key, "/vcc", 60_000)).terminal, "final", `${label}: /vcc`);
  const r = await send(key, "这是一次自动化测试。不要调用任何工具，只回复一行：收到。");
  const hist = await client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: 20 }, { timeoutMs: 15_000 });
  const last = [...(hist?.messages ?? [])].reverse().find((m) => m.role === "assistant");
  const reply = typeof last?.content === "string" ? last.content : (last?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { label, route, key, terminal: r.terminal, error: r.error, reply: redact(reply).slice(0, 200), ...runRecord(key) };
}
const ROUTES = (process.env.OC_ROUTES ?? "vds,worker,embedded,vcc").split(",");
assert(ROUTES.every((r) => ["vds", "worker", "embedded", "vcc"].includes(r)));
const DENIED_ROUTES = ROUTES.filter((r) => r !== "vds");
async function routes(label) {
  const out = {};
  for (const route of ROUTES) out[route] = await turn(label, route);
  return out;
}
async function patchHot() {
  const mark = lines.length;
  const pid = gateway.pid;
  const at = Date.now();
  const r = spawnSync(process.execPath, [`${dist}/index.js`, "config", "patch", "--file", PATCH], { env, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `config patch failed: ${r.stderr}`);
  let applied = null, derived = null;
  for (let i = 0; i < 90 && (applied === null || derived === null); i += 1) {
    await sleep(1000);
    if (applied === null && lines.slice(mark).some((l) => /config hot reload applied/u.test(l.line))) applied = Date.now() - at;
    if (derived === null && JSON.stringify(JSON.parse(fs.readFileSync(workerPlugin.workerConfigPath, "utf8")).agents?.entries?.makaron?.tools?.deny) === '["openclaw"]') derived = Date.now() - at;
  }
  await sleep(8000);
  const log = lines.slice(mark).map((l) => strip(l.line));
  return {
    cli: redact(r.stdout).trim().slice(-200), hotReloadAppliedMs: applied, workerConfigDerivedMs: derived, samePid: gateway.exitCode === null && gateway.pid === pid,
    pluginReloadLines: log.filter((l) => /duplicate plugin id|restarting .* account|plugins? (re)?load/iu.test(l)).length,
    log: log.filter((l) => /\[reload\]|restart|Worker config derivation|generation/iu.test(l)).map((l) => redact(l).slice(0, 220)).slice(0, 20),
  };
}

const summary = { startedAt: new Date().toISOString(), sharedReload, reload: "unset (default hybrid)", baselineSelectionSha };
try {
  await boot();
  summary.lookup = await client.request("config.schema.lookup", { path: DENY_PATH }, { timeoutMs: 30_000 }).then((r) => JSON.stringify(r).match(/"reloadKind":"[^"]*"/gu)).catch((e) => String(e?.message ?? e));
  summary.before = await routes("before");
  await shutdown();
  fs.copyFileSync(PATCHED_SELECTION, selectionFile);
  assert.equal(sha(selectionFile), PATCHED_SELECTION_SHA);
  await boot();
  summary.patched = await routes("patched");
  summary.hotPatch = await patchHot();
  summary.hot = await routes("hot");
  await shutdown();
  await boot();
  summary.restart = await routes("restart");
  summary.gatewayStarts = gatewayStarts;
} finally {
  await shutdown();
}

const minus = (x, y) => x.filter((t) => !y.includes(t));
const diff = (from, to) => Object.fromEntries(ROUTES.map((r) => [r, { removed: minus(from[r].tools ?? [], to[r].tools ?? []), added: minus(to[r].tools ?? [], from[r].tools ?? []) }]));
summary.diff = { patched: diff(summary.before, summary.patched), hot: diff(summary.before, summary.hot), restart: diff(summary.before, summary.restart) };
// Also keep the summary in the candidate's data directory: the runner's stdout dies with the client's ssh.
fs.writeFileSync(path.join(scratch, "oc-routes-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ summary }, null, 2));
const none = { removed: [], added: [] };
for (const phase of ["before", "patched", "hot", "restart"]) for (const r of ROUTES) {
  const t = summary[phase][r];
  assert.equal(t.terminal, "final", `${t.label}/${r} did not finish: ${t.error ?? ""}`);
  assert(t.reply.includes("收到"), `${t.label}/${r} reply: ${t.reply}`);
  assert(Array.isArray(t.tools) && t.tools.length > 0, `${t.label}/${r}: no tool list recorded`);
}
const HARNESS = { vds: "codex", worker: "vlab-worker", embedded: "openclaw", vcc: "claude-cli" };
for (const r of ROUTES) if (r !== "vcc") assert.equal(summary.before[r].harness, HARNESS[r], `${r} did not run on the ${HARNESS[r]} harness`);
if (ROUTES.includes("vds")) assert(!summary.before.vds.tools.includes("openclaw") && summary.before.vds.tools.includes("gateway_exec"), "before: vds is not V's current shape (#479 exclude, native surface on)");
for (const r of DENIED_ROUTES) assert(summary.before[r].tools.includes("openclaw"), `before: ${r} had no openclaw tool, so the test measures nothing`);
for (const r of ROUTES) assert.deepEqual(summary.diff.patched[r], none, `patched: ${r} changed without any deny`);
for (const phase of ["hot", "restart"]) {
  if (ROUTES.includes("vds")) assert.deepEqual(summary.diff[phase].vds, none, `${phase}: Codex tool list changed`);
  for (const r of DENIED_ROUTES) assert.deepEqual(summary.diff[phase][r], { removed: ["openclaw"], added: [] }, `${phase}: ${r} must lose exactly openclaw`);
}
assert(summary.hotPatch.samePid && summary.hotPatch.hotReloadAppliedMs !== null, "deny did not apply hot");
assert(summary.hotPatch.workerConfigDerivedMs !== null, "Worker config never picked up the deny");
process.exit(0);
