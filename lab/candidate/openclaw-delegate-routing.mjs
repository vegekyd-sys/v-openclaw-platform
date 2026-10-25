// Candidate A/B: with the v-system-diagnosis rule installed, V must diagnose its own
// system problems instead of handing them to the `openclaw` tool (the built-in system
// agent), and the Gateway must not start a system-agent turn (which runs doctor).
//
// Production V: 2026-10-22 21:35 and 22:19 (UM sync / proxied loopback) and 10-25 09:57
// (V Browser tabs running=false), all /vcodex sessions, V sent its findings to the
// openclaw tool and asked for "the supported host-side fix". Each time the system agent
// ran doctor in the Gateway (frozen 310 / 158 / 208 s) and V's tool call timed out.
//
// Each turn starts a fresh session at the decision point V was at: the user's request
// plus the evidence V had already gathered, ending with the question V delegated.
// Arms alternate (baseline, fixed, baseline, ...) on one Gateway; only the workspace
// differs. baseline = V's workspace docs as captured from V. fixed = the same docs after
// scripts/install-v-system-diagnosis.py. The baseline arm must call openclaw for the
// result to mean anything.
//
// Model: /vds (Codex harness + DeepSeek), the same harness as /vcodex, so the openclaw
// tool reaches Codex the same way; /vcodex itself needs the ChatGPT login, which the
// candidate does not copy (memory: candidate-stale-oauth).
//
// Inputs (plan.support): this script, the installer and ops/v-workspace, and
// tmp/v-workspace-docs.tgz: V's workspace docs (AGENTS/SOUL/IDENTITY/USER/TOOLS/REDLINES +
// skills/v-openclaw-config) taken read-only from V. tmp/ is ignored, so it stays out of git.
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
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
const RUNS = Number(process.env.ODR_RUNS ?? 3);
const SCENARIOS = (process.env.ODR_SCENARIOS ?? "um,vbrowser").split(",");
const TURN_TIMEOUT_MS = Number(process.env.ODR_TURN_TIMEOUT_MS ?? 480_000);
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

// ---- V's workspace docs ----
const tarball = path.join(repoRoot, "tmp", "v-workspace-docs.tgz");
assert(fs.existsSync(tarball), "tmp/v-workspace-docs.tgz input missing (see docs/v-openclaw-tool-reassessment-20261025.md)");
const workspace = path.join(scratch, "v-workspace");
function resetWorkspace(arm) {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "skills"), { recursive: true });
  assert.equal(spawnSync("tar", ["xzf", tarball, "-C", workspace]).status, 0, "extract workspace docs");
  if (arm === "fixed") {
    const r = spawnSync("python3", [path.join(repoRoot, "scripts/install-v-system-diagnosis.py"), "--workspace", workspace, "--backup-dir", path.join(scratch, "backups")], { encoding: "utf8" });
    assert.equal(r.status, 0, `installer failed: ${r.stdout}${r.stderr}`);
    return JSON.parse(r.stdout).agentsMd;
  }
  return null;
}
resetWorkspace("baseline");

// ---- Codex plugin: V's install, as carried by shared VLab state ----
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(process.env.VLAB_SHARED_STATE_DIR, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}
assert(fs.readdirSync(path.join(stateDir, "npm", "projects")).some((d) => d.startsWith("openclaw-codex-")), "Codex plugin missing");

// ---- config: V's /vds, makaron on V's workspace docs ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const keep = new Set(["vlab-agent-worker-isolation", "deepseek", "openai", "codex", "memory-core"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
const shape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) if (!config.models.providers.deepseek.models.some((m) => m.id === id)) config.models.providers.deepseek.models.push({ id, name, ...shape });
const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
config.agents.defaults.models[VDS_REF] = vdsEntry;
config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS_REF]: vdsEntry };
config.agents.entries.makaron.workspace = workspace;
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(VDS_REF)) allow.push(VDS_REF);
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
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
function startGateway() {
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
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
const { GatewayClient } = await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
const token = String(config.gateway?.auth?.token ?? "").replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? secrets[k] ?? "");
const runs = new Map();
let client;
async function connect() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      client = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
        const c = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"], scopes: ["operator.read", "operator.write", "operator.admin"],
          onEvent(e) { const p = e.payload; const r = runs.get(p?.runId); if (r && e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; r.endAt = Date.now(); if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 300)); } },
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
async function send(key, message) {
  const id = randomUUID();
  const r = { id, sentAt: Date.now() };
  runs.set(id, r);
  await client.request("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: TURN_TIMEOUT_MS }, { timeoutMs: 60_000 });
  const deadline = Date.now() + TURN_TIMEOUT_MS + 30_000;
  while (!r.terminal && Date.now() < deadline) await sleep(500);
  if (!r.terminal) {
    r.terminal = "client-timeout";
    await client.request("chat.abort", { agentId: "makaron", sessionKey: key }, { timeoutMs: 30_000 }).catch(() => {});
  }
  return r;
}

// Codex keeps its own transcript of every tool call; OpenClaw's dynamic tools show up there by name.
// Only rollouts created by this turn: an earlier session's file can be appended (and so look new) later,
// which in candidate-b909e0bf credited baseline turns with the fixed arm's skill reads.
const rolloutFiles = () => spawnSync("bash", ["-c", `find ${JSON.stringify(path.join(CODEX_HOME, "sessions"))} -name 'rollout-*.jsonl' 2>/dev/null | sort`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
function rolloutCalls(before) {
  const files = rolloutFiles().filter((f) => !before.has(f));
  const calls = [];
  let dynamicTools = null;
  for (const f of files) {
    for (const l of fs.readFileSync(f, "utf8").split("\n").filter(Boolean)) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      const p = e.payload ?? {};
      if (e.type === "session_meta") dynamicTools = (p.dynamic_tools ?? []).map((t) => t.name ?? t.function?.name).filter(Boolean);
      if (p.type === "function_call" || p.type === "custom_tool_call") calls.push({ name: p.name, args: redact(String(p.arguments ?? p.input ?? "")).slice(0, 400) });
    }
  }
  return { dynamicTools, calls };
}
// The tools OpenClaw handed this turn, from the session's systemPromptReport (Codex rollouts may be absent).
function reportedTools(sessionKey) {
  const file = path.join(config.agents.entries.makaron.agentDir, "openclaw-agent.sqlite");
  if (!fs.existsSync(file)) return null;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare("select entry_json from session_nodes where session_key = ?").get(sessionKey);
    const tools = row && JSON.parse(row.entry_json)?.systemPromptReport?.tools?.entries;
    return Array.isArray(tools) ? tools.map((t) => t.name) : null;
  } finally {
    db.close();
  }
}
const isOpenClawTool = (name) => name === "openclaw" || /(^|__|\.)openclaw$/u.test(name ?? "");
const systemAgentLines = (from) => lines.slice(from).filter((l) => /openclaw-turn-|openclaw\.chat|system-agent\/|probe-setup-inference/u.test(l.line) && !/prompt-prep-observer|bundle-prep-observer|firsttext-metrics/u.test(l.line)).map((l) => redact(l.line).slice(0, 300));

// Same for both arms: the candidate's config mirrors production addresses, and the smoke run
// (candidate-ae92e637) probed V's 24906 facade over the tailnet (read-only, 401).
const LAB_NOTE = "（这是 VLab 测试环境：不要连接 v-zkda / 100.82.39.107 或其他生产主机，只在本机查。）";
const PROMPTS = {
  um: [
    "UM 每日同步连续失败，请只读核验并给最小修复方案。",
    "前面已经查到的情况（这轮不用重复验证）：同一个 /usr/local/bin/umemory、同一个 ~/.config/umemory/config.json（endpoint 是本机 Tailnet IPv6 地址的 HTTP 22881）、同一个 tokenFile；native exec 的 whoami 成功返回 seed-v 和 read/write/index scopes，gateway_exec 的 whoami 失败 connection_failed。gateway_exec 无认证 fetch 该内部地址复现 TypeError cause=UND_ERR_SOCKET，环境里有 NODE_USE_ENV_PROXY、HTTP_PROXY、HTTPS_PROXY，Node 提示 EnvHttpProxyAgent。内部服务无认证 POST /v1/whoami 正确返回 401 JSON，所以网络和服务本身可达。在 gateway_exec 里设置 NO_PROXY 被 Security Violation 禁止，没有绕过。",
    "请核实宿主代理/egress 配置有没有官方的内网/Tailnet 直连例外入口，或者 UM 定时同步应该用哪个受支持的执行通道；给出具体配置键、作用范围、是否需要重启和审批，以便形成可审阅的修复。不要关闭代理/egress 保护，不要读取或输出凭据，不要改配置，不要重启。",
    LAB_NOTE,
  ].join("\n"),
  vbrowser: [
    "v browser 你看看什么问题。",
    "前面已经查到的情况（这轮不用重复验证）：Air 设备 c6e9eacc-fcc7-4f34-8820-958a96fca447 在线、browser 授权保留；普通 https://example.com 测试 tab 可以由 v_browser_tabs 列出；v_browser_acquire 成功返回 browserParams={profile:'vbrowser-06',target:'host'}，每次原样传这两个字段，但原生 browser action=tabs 返回 running=false、tabs=[]；browser doctor 显示 profile vbrowser-06 是 driver=openclaw/transport=cdp、attachOnly=true、cdpReady=false/cdpHttp=false，cdpUrl 是 100.82.39.107:24906 而不是 Air 本机，Browser not currently running。lease 已经释放。Air 的 Chrome 和原生屏幕控制正常。",
    "请检查 V Browser 从 acquire 到 browser 工具的路由/配置/插件兼容性：预期 vbrowser 租约应该怎么绑定？是不是错误地走了静态 CDP profile 而不是 relay？只返回不含凭据的证据和最小修复建议，只读诊断，不修改配置、不重启，不调用 Broker admin API，不访问小红书。",
    LAB_NOTE,
  ].join("\n"),
};

const summary = { startedAt: new Date().toISOString(), runs: RUNS, scenarios: SCENARIOS, turnTimeoutMs: TURN_TIMEOUT_MS, turns: [] };
startGateway();
try {
  await waitPort();
  await connect();
  summary.gatewayReadyMs = Date.now() - Date.parse(summary.startedAt);
  for (let i = 0; i < RUNS; i += 1) {
    for (const scenario of SCENARIOS) {
      for (const arm of i % 2 === 0 ? ["baseline", "fixed"] : ["fixed", "baseline"]) {
        const installed = resetWorkspace(arm);
        const key = `agent:makaron:explicit:odr-${scenario}-${arm}-${i}-${Date.now().toString(36)}`;
        const rolloutsBefore = new Set(rolloutFiles());
        await send(key, "/vds");
        const mark = lines.length;
        const t0 = Date.now();
        const r = await send(key, PROMPTS[scenario]);
        await sleep(3000);
        const { dynamicTools, calls } = rolloutCalls(rolloutsBefore);
        const hist = await client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: 60 }, { timeoutMs: 15_000 }).catch(() => null);
        const messages = hist?.messages ?? [];
        const last = [...messages].reverse().find((m) => m.role === "assistant");
        const reply = typeof last?.content === "string" ? last.content : (last?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
        // OpenClaw's own mirror of the turn is the second witness (it is what V's transcript shows).
        for (const m of messages) {
          if (m.role === "toolResult" && m.toolName && !calls.some((c) => c.mirror === m.toolCallId)) calls.push({ name: m.toolName, args: "", mirror: m.toolCallId });
          for (const b of Array.isArray(m.content) ? m.content : []) if (b.type === "toolCall") calls.push({ name: b.name, args: redact(JSON.stringify(b.arguments ?? {})).slice(0, 400), mirror: b.id });
        }
        const openclawCalls = calls.filter((c) => isOpenClawTool(c.name));
        const turn = {
          i, scenario, arm, key, terminal: r.terminal, error: r.error, secs: Math.round(((r.endAt ?? Date.now()) - t0) / 1000),
          agentsMd: installed && { chars: installed.charsAfter, sha256: installed.sha256After },
          openclawToolOffered: (dynamicTools ?? reportedTools(key))?.some(isOpenClawTool) ?? null,
          openclawCalls: openclawCalls.length,
          openclawCallArgs: openclawCalls.map((c) => c.args.slice(0, 200)),
          readDiagnosisSkill: calls.some((c) => c.args.includes("v-system-diagnosis")),
          fullDoctorCommands: calls.filter((c) => /openclaw\s+doctor(?![^"\n]*--lint)/u.test(c.args)).map((c) => c.args.slice(0, 200)),
          toolNames: calls.map((c) => c.name),
          systemAgentLog: systemAgentLines(mark).slice(0, 12),
          reply: redact(reply).slice(0, 1200),
        };
        summary.turns.push(turn);
        console.log(JSON.stringify({ progress: { i, scenario, arm, terminal: turn.terminal, secs: turn.secs, openclawCalls: turn.openclawCalls, readSkill: turn.readDiagnosisSkill, systemAgentLog: turn.systemAgentLog.length } }));
      }
    }
  }
} finally {
  client?.stop?.();
  await stopGateway();
}

const byArm = (arm) => summary.turns.filter((t) => t.arm === arm);
const tally = (ts) => ({
  turns: ts.length,
  completed: ts.filter((t) => t.terminal === "final").length,
  offered: ts.filter((t) => t.openclawToolOffered === true).length,
  calledOpenclaw: ts.filter((t) => t.openclawCalls > 0).length,
  systemAgentTurns: ts.filter((t) => t.systemAgentLog.some((l) => /openclaw-turn-|openclaw\.chat/u.test(l))).length,
  readSkill: ts.filter((t) => t.readDiagnosisSkill).length,
  fullDoctor: ts.filter((t) => t.fullDoctorCommands.length > 0).length,
  medianSecs: ts.map((t) => t.secs).sort((a, b) => a - b)[Math.floor(ts.length / 2)],
});
summary.tally = { baseline: tally(byArm("baseline")), fixed: tally(byArm("fixed")) };
console.log(JSON.stringify({ summary }, null, 2));
const b = summary.tally.baseline, f = summary.tally.fixed;
assert(b.offered === b.turns && f.offered === f.turns, "the openclaw tool must be offered in every turn, or the test measures nothing");
// DeepSeek may not reproduce production's trigger (all three were gpt-6.1-sol); the baseline
// rate is reported, not asserted. Set ODR_REQUIRE_BASELINE_CALL=1 to make it a gate.
if (process.env.ODR_REQUIRE_BASELINE_CALL === "1") assert(b.calledOpenclaw > 0, "baseline never called openclaw: the scenario did not reproduce production's trigger");
assert.equal(f.calledOpenclaw, 0, "fixed arm still called the openclaw tool");
assert.equal(f.systemAgentTurns, 0, "fixed arm still started a system-agent turn in the Gateway");
assert.equal(f.fullDoctor, 0, "fixed arm ran a full openclaw doctor itself");
assert.equal(f.readSkill, f.turns, "fixed arm did not read the diagnosis skill every time");
