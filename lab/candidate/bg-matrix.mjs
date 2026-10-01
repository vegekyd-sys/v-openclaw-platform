// Candidate test: which OpenClaw-native background mechanisms work on which
// harness. The goal is one set of tools every harness can use: the Gateway owns
// the background work and wakes the session when it is done.
//
// Harnesses (V aliases): worker = default deepseek-v4-flash on vlab-worker,
// codex = /vds (deepseek-flash on the Codex app-server), claude-cli = /vcc
// (claude-opus-5-5 on Claude Code 2.1.280, with V's
// CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1). /vcodex shares the Codex harness
// with /vds; it is left out because a candidate must not refresh the shared
// ChatGPT OAuth token.
//
// Mechanisms:
//   spawn  sessions_spawn + sessions_yield (background subagent)
//   exec   exec background / gateway_exec, woken by notifyOnExit
//   stream automations stream schedule (Monitor-like)
//   at     automations one-shot wakeup in the current session
//
// Each background job prints A*B for random A, B; the product never appears in
// the prompt. A cell passes only when an assistant message containing the
// product shows up in the ORIGINAL session after the first turn returned, with
// nobody sending another message. Where the product shows up anywhere else
// (e.g. an isolated heartbeat session) is recorded, not counted.
//
// Config parity with V: cron enabled (V default; shared VLab turns it off),
// heartbeat untouched (every 0m, isolatedSession, target none). Channels are
// cleared so the private Gateway cannot take shared Feishu events, so this run
// does not show Feishu delivery.
//
// BGM_HARNESSES=worker,codex,claude-cli  BGM_MECHANISMS=spawn,exec,stream,at

import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
assert.notEqual(path.resolve(stateDir), path.resolve(process.env.VLAB_SHARED_STATE_DIR ?? ""), "state must be the candidate copy");

const HARNESSES = {
  worker: { model: "deepseek/deepseek-v4-flash", runtime: "vlab-worker" },
  codex: { model: "deepseek/deepseek-flash", runtime: "codex" },
  "claude-cli": { model: "anthropic/claude-opus-5-5", runtime: "claude-cli" },
};
const harnesses = (process.env.BGM_HARNESSES ?? Object.keys(HARNESSES).join(",")).split(",").filter(Boolean);
const mechanisms = (process.env.BGM_MECHANISMS ?? "spawn,exec,stream,at").split(",").filter(Boolean);
const claudeVersion = "2.1.280"; // production V
const SWITCH = "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS";

const RUN = `BGM${Date.now().toString(36)}`;
const RUN_STARTED = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
for (const dir of ["tmp", "cache", "claude-cli"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });

// ---- production Claude Code, private to this run ----
const cliDir = path.join(scratch, "claude-cli");
let cliBin = null;
if (harnesses.includes("claude-cli")) {
  const npm = path.join(path.dirname(process.execPath), "npm");
  const install = spawnSync(npm, ["install", "--prefix", cliDir, "--no-audit", "--no-fund", `@anthropic-ai/claude-code@${claudeVersion}`],
    { encoding: "utf8", env: { ...process.env, npm_config_cache: path.join(scratch, "cache", "npm") }, timeout: 600_000 });
  assert.equal(install.status, 0, `claude-code install failed: ${redact(install.stderr).slice(-600)}`);
  cliBin = path.join(cliDir, "node_modules", ".bin");
}
const env = {
  ...process.env,
  PATH: cliBin ? `${cliBin}:${process.env.PATH}` : process.env.PATH,
  DISABLE_AUTOUPDATER: "1",
  TMPDIR: path.join(scratch, "tmp"),
  XDG_CACHE_HOME: path.join(scratch, "cache"),
  OPENCLAW_PATH_BOOTSTRAPPED: "1",
  // the shared npm cache has root-owned entries; plugin repair needs its own
  npm_config_cache: path.join(scratch, "cache", "npm"),
  [SWITCH]: "1", // V's Gateway drop-in
};
if (cliBin) {
  const version = execFileSync(path.join(cliBin, "claude"), ["--version"], { env, encoding: "utf8" }).trim();
  assert(version.startsWith(claudeVersion), `expected Claude Code ${claudeVersion}, got ${version}`);
  const auth = JSON.parse(execFileSync(path.join(cliBin, "claude"), ["auth", "status", "--json"], { env, encoding: "utf8" }));
  assert.equal(auth.loggedIn, true, "claude is not logged in");
}

// ---- private config ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
env.OPENCLAW_GATEWAY_PORT = String(port);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: true };
// BGM_HB_ISOLATED=0: run event wakes in the original session instead of a
// separate ":heartbeat" session (V: periodic heartbeat is off, every 0m)
if (process.env.BGM_HB_ISOLATED === "0") config.agents.defaults.heartbeat = { ...config.agents.defaults.heartbeat, isolatedSession: false };
if (process.env.BGM_HB_TARGET) config.agents.defaults.heartbeat = { ...config.agents.defaults.heartbeat, target: process.env.BGM_HB_TARGET };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs
    .readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerConfig.channels = {};
  workerConfig.cron = { ...(workerConfig.cron ?? {}), enabled: true };
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
const makaron = config.agents.entries.makaron;
makaron.models ??= {};
makaron.models[HARNESSES["claude-cli"].model] ??= { params: { thinking: "high" }, agentRuntime: { id: "claude-cli" } };
const allow = config.agents.defaults.modelPolicy?.allow;
for (const h of Object.values(HARNESSES)) if (Array.isArray(allow) && !allow.includes(h.model)) allow.push(h.model);
// ---- /vds: Codex harness + DeepSeek, set up as lab/candidate/vds-codex-switch.mjs does ----
// The candidate state has no installed codex plugin, and the stock plugin only
// accepts the codex/openai providers; production V runs a patched install.
let codexSetup = null;
if (harnesses.includes("codex")) {
  const codexLoadPath = (config.plugins.load?.paths ?? []).find((p) => /\/@openclaw\/codex$/u.test(p));
  if (codexLoadPath) config.plugins.load.paths = config.plugins.load.paths.filter((p) => p !== codexLoadPath);
  const codexPlugin = (config.plugins.entries.codex ??= { enabled: true });
  codexPlugin.config = {
    ...(codexPlugin.config ?? {}),
    discovery: { ...(codexPlugin.config?.discovery ?? {}), timeoutMs: 30_000 },
  };
  const codexHome = path.join(config.agents.entries.makaron.agentDir, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const tomlPath = path.join(codexHome, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
  const secrets = {};
  for (const line of fs.readFileSync("/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env", "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m) secrets[m[1]] = m[2].replace(/^["']|["']$/gu, "");
  }
  assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing from shared secrets.env");
  env.DEEPSEEK_API_KEY = secrets.DEEPSEEK_API_KEY;
  env.CODEX_HOME = codexHome;
  codexSetup = { codexHome, loadPathRemoved: Boolean(codexLoadPath) };
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
if (codexSetup) {
  const install = spawnSync(process.execPath, [`${dist}/index.js`, "plugins", "install", "@openclaw/codex@2026.9.1", "--pin", "--force", "--accept-capabilities", "--acknowledge-install-policy-warning"],
    { env, encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(install.status, 0, `codex plugin install failed: ${redact((install.stdout || "") + (install.stderr || "")).slice(-800)}`);
  const npmProjects = path.join(stateDir, "npm", "projects");
  const codexProject = fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
  assert(codexProject, "installed codex plugin not found");
  const codexDist = path.join(npmProjects, codexProject, "node_modules", "@openclaw", "codex", "dist");
  const findFile = (re, needle) => fs.readdirSync(codexDist).map((f) => path.join(codexDist, f))
    .find((f) => re.test(f) && (!needle || fs.readFileSync(f, "utf8").includes(needle)));
  const patchFile = (file, pairs) => {
    let src = fs.readFileSync(file, "utf8");
    for (const [from, to] of pairs) {
      if (src.includes(to)) continue;
      assert.equal(src.split(from).length, 2, `patch anchor must match exactly once: ${from.slice(0, 60)}`);
      src = src.replace(from, to);
    }
    fs.writeFileSync(file, src);
  };
  patchFile(findFile(/\/harness-[^/]+\.js$/u, "DEFAULT_CODEX_HARNESS_PROVIDER_IDS = "), [
    ['new Set(["codex", "openai"]);', 'new Set(["codex", "openai", "deepseek"]);'],
    ['} else if (ctx.modelProvider && provider !== "codex" && !nativeAccountOwnsUnobservedModel) return {',
      '} else if (ctx.modelProvider && provider !== "codex" && provider !== "deepseek" && !nativeAccountOwnsUnobservedModel) return {'],
    ['if (ctx.modelProvider?.requestTransportOverrides === "present") return {',
      'if (ctx.modelProvider?.requestTransportOverrides === "present" && provider !== "deepseek") return {'],
  ]);
  patchFile(findFile(/\/run-attempt-[^/]+\.js$/u), [[
    "nativeCodeModeEnabled: params.nativeToolSurfaceEnabled,",
    'nativeCodeModeEnabled: params.nativeToolSurfaceEnabled && String(params.buildAttemptParams()?.provider ?? "").trim().toLowerCase() !== "deepseek",',
  ]]);
  patchFile(findFile(/\/thread-lifecycle-[^/]+\.js$/u), [[
    'return normalizeCodexModelId(modelId) === "gpt-5.4-nano";',
    'const normalizedId = normalizeCodexModelId(modelId); return normalizedId === "gpt-5.4-nano" || normalizedId.startsWith("deepseek");',
  ]]);
  console.log(JSON.stringify({ codexSetup }));
}

// ---- diagnosis only: log what the cron caller-scope check compares ----
{
  const reject = 'respondInvalidCronParams(respond, "cron.add", "job agentId outside caller scope");';
  const cronFile = fs.readdirSync(dist).map((f) => path.join(dist, f))
    .find((f) => /\/cron-[^/]+\.js$/u.test(f) && fs.readFileSync(f, "utf8").includes(reject));
  assert(cronFile, "cron caller-scope check not found");
  const src = fs.readFileSync(cronFile, "utf8");
  const log = 'console.error("[bgm-cron-diag] " + JSON.stringify({ match: { effective: (() => { try { return resolveCronJobEffectiveAgentId(jobCreate, context.cron.getDefaultAgentId()); } catch (e) { return String(e); } })(), sessionRef: parseAgentIdFromSessionRef(jobCreate.sessionKey, callerScope?.agentId), target: parseAgentIdFromCronSessionTarget(jobCreate.sessionTarget, callerScope?.agentId) }, job: { agentId: jobCreate.agentId, sessionKey: jobCreate.sessionKey, sessionTarget: jobCreate.sessionTarget, owner: jobCreate.owner, schedule: jobCreate.schedule?.kind, payload: jobCreate.payload?.kind }, callerScope: callerScope && { agentId: callerScope.agentId, sessionKey: callerScope.sessionKey, kind: callerScope.kind }, defaultAgentId: context.cron.getDefaultAgentId() }));';
  if (!src.includes("[bgm-cron-diag]")) {
    assert.equal(src.split(reject).length, 2, "cron reject anchor must match once");
    fs.writeFileSync(cronFile, src.replace(reject, `${log} ${reject}`));
  }
}

// ---- diagnosis only: where a background exec's wake stops ----
const softPatch = (re, needle, pairs) => {
  const file = fs.readdirSync(dist).map((f) => path.join(dist, f)).find((f) => re.test(f) && fs.readFileSync(f, "utf8").includes(needle));
  if (!file) { console.log(`DIAGPATCH missing file for ${needle.slice(0, 40)}`); return; }
  let src = fs.readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    if (src.includes(to)) continue;
    if (src.split(from).length !== 2) { console.log(`DIAGPATCH anchor not unique in ${path.basename(file)}: ${from.slice(0, 50)}`); continue; }
    src = src.replace(from, to);
  }
  fs.writeFileSync(file, src);
};
softPatch(/\/bash-tools\.exec-runtime-[^/]+\.js$/u, "function maybeNotifyOnExit(session, status) {", [
  ["function maybeNotifyOnExit(session, status) {",
    'function maybeNotifyOnExit(session, status) { console.error("[bgm-exec-diag] exit " + JSON.stringify({ status, bg: session.backgrounded, notify: session.notifyOnExit, notified: session.exitNotified, polled: session.terminalPollObserved, key: session.sessionKey, code: session.exitCode, pid: process.pid }));'],
  ["\tconst eventOptions = {\n\t\tsessionKey: eventSessionKey,",
    '\tconsole.error("[bgm-exec-diag] enqueue " + JSON.stringify({ eventSessionKey, routing: eventRouting, delivery: session.notifyDeliveryContext, pid: process.pid }));\n\tconst eventOptions = {\n\t\tsessionKey: eventSessionKey,'],
]);
softPatch(/\/heartbeat-runner-[^/]+\.js$/u, "async function runHeartbeatOnce(opts) {", [
  ["async function runHeartbeatOnce(opts) {",
    'async function runHeartbeatOnce(opts) { const __r = await runHeartbeatOnce__bgm(opts); console.error("[bgm-hb-diag] result " + JSON.stringify(__r).slice(0, 600)); return __r; }\nasync function runHeartbeatOnce__bgm(opts) {'],
  ["async function runHeartbeatOnce(opts) {\n\tconst wake = await resolveHeartbeatWakeStage(opts);",
    'async function runHeartbeatOnce(opts) {\n\tconst wake = await resolveHeartbeatWakeStage(opts);\n\tconsole.error("[bgm-hb-diag] wake " + JSON.stringify({ reason: opts?.reason, source: opts?.source, sessionKey: opts?.sessionKey, agentId: opts?.agentId, kind: wake.kind, skip: wake.reason, pid: process.pid }));'],
  ["\tconst prepared = await prepareHeartbeatRunStage(wake);",
    '\tconst prepared = await prepareHeartbeatRunStage(wake);\n\tconsole.error("[bgm-hb-diag] prepared " + JSON.stringify({ kind: prepared.kind, skip: prepared.reason, runSessionKey: prepared.runSessionKey, channel: prepared.delivery?.channel, relayExec: prepared.hasRelayableExecCompletion }));'],
]);
// stream/at: test the upstream wake mechanics; the shared-management patch
// needs a signed Feishu sender and is checked separately on shared VLab
delete env.OPENCLAW_CRON_SHARED_POLICY;

// ---- Gateway ----
const lines = [];
let gateway;
let gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 40_000) lines.splice(0, lines.length - 40_000);
    });
  }
}
let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
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
    } catch (error) {
      lastError = error;
      client?.stop();
      await sleep(1_000);
    }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}
const rpc = (method, params, timeoutMs = 20_000) => client.request(method, params, { timeoutMs });

// ---- reading sessions ----
const blockText = (b) => b.text ?? b.thinking ?? (b.type ? `[${b.type}${b.name ? `:${b.name}` : ""}]` : "");
function summarize(m) {
  const content = Array.isArray(m.content) ? m.content : [{ text: String(m.content ?? "") }];
  return {
    role: m.role,
    text: content.map(blockText).join(" ").replace(/\s+/gu, " ").slice(0, 300),
    tools: content.filter((b) => /tool|call/iu.test(b.type ?? "")).map((b) => b.name ?? b.toolName).filter(Boolean),
    raw: JSON.stringify(m),
  };
}
async function history(sessionKey) {
  try {
    const r = await rpc("chat.history", { agentId: "makaron", sessionKey, limit: 200 });
    return (r?.messages ?? []).map(summarize);
  } catch (error) {
    return [{ role: "error", text: String(error.message).slice(0, 200), tools: [], raw: "" }];
  }
}
async function sessionsMentioning(needle, except) {
  const hits = [];
  try {
    const r = await rpc("sessions.list", { agentId: "makaron", limit: 300, includeLastMessage: false });
    for (const s of r?.sessions ?? []) {
      if (!s.key || s.key === except) continue;
      const msgs = await history(s.key);
      const hit = msgs.find((m) => m.raw.includes(needle));
      if (hit) hits.push({ key: s.key, role: hit.role, text: hit.text.slice(0, 160) });
    }
  } catch (error) {
    hits.push({ error: String(error.message).slice(0, 200) });
  }
  return hits;
}

// ---- scenarios ----
function job(seconds) {
  const a = 1000 + Math.floor(Math.random() * 9000);
  const b = 1000 + Math.floor(Math.random() * 9000);
  return { a, b, product: String(a * b), py: `python3 -c "import time; time.sleep(${seconds}); print('RESULT', ${a}*${b})"` };
}
const NO_TOOL = "如果你没有能做到这件事的工具，就只回复「没有这个工具」，并列出你实际可用的、名字里带 session、exec、process、cron、automation、yield 的工具名，不要用别的办法替代。";
const SCENARIOS = {
  spawn: (j) => [
    `这是一次自动化测试（${RUN}），请严格照做。`,
    `用 sessions_spawn 启动一个子会话（子 agent），子会话的任务：用前台命令执行 \`${j.py}\`，然后把输出原样汇报。`,
    "启动后立刻调用 sessions_yield 结束本轮，等子会话完成事件把你唤醒；不要自己等待、不要轮询、不要自己执行这条命令。",
    "本轮只回复「已启动」。被唤醒后，把子会话汇报的 RESULT 数字告诉我。",
    NO_TOOL,
  ].join(""),
  exec: (j) => [
    `这是一次自动化测试（${RUN}），请严格照做。`,
    `用 OpenClaw 的后台命令工具在后台执行 \`${j.py}\`：工具列表里有 gateway_exec 就必须调用 gateway_exec（background 设为 true）；否则调用 exec 并设 background:true。不要用 bash、shell、exec_command 或任何 Codex/Claude 自带的命令工具。`,
    "不要用 Claude Code 自带的 Bash，不要等待命令结束，不要轮询 process，命令结束时系统会唤醒你。",
    "本轮只回复「已启动」。被唤醒后，把输出里的 RESULT 数字告诉我。",
    NO_TOOL,
  ].join(""),
  stream: (j) => [
    `这是一次自动化测试（${RUN}），请严格照做。`,
    "用 automations 工具（旧名 cron）创建一个 stream 调度任务：",
    `command 是 ["bash","-c","sleep 20; echo RESULT $((${j.a}*${j.b})); sleep 3600"]，mode 为 line，`,
    "触发时唤醒当前这个会话（sessionTarget 用 current，payload 用 agentTurn），消息内容是「把收到的 RESULT 数字告诉用户」。",
    "本轮只回复「已创建」，不要自己计算这个数字。",
    NO_TOOL,
  ].join(""),
  at: (j) => [
    `这是一次自动化测试（${RUN}），请严格照做。`,
    "用 automations 工具（旧名 cron）创建一个一次性定时任务，40 秒后在当前这个会话唤醒你（sessionTarget 用 current，payload 用 agentTurn），",
    `唤醒消息是「计算 ${j.a} 乘以 ${j.b}，把结果告诉用户，并写明 RESULT」。`,
    "本轮只回复「已创建」，不要现在计算。",
    NO_TOOL,
  ].join(""),
};
const WAIT_MS = { spawn: 360_000, exec: 300_000, stream: 300_000, at: 300_000 };
const SECONDS = { spawn: 40, exec: 30, stream: 20, at: 40 };

function runAgent(sessionKey, model, message) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [
      `${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
      "--model", model, "--message", message, "--json", "--timeout", "600",
    ], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });
    child.on("close", (code) => {
      let meta;
      try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch {}
      const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
      resolve({
        code, secs: Math.round((Date.now() - started) / 1000),
        provider: agentMeta?.provider, model: agentMeta?.model,
        reply: String(meta?.result?.payloads?.[0]?.text ?? meta?.payloads?.[0]?.text ?? "").slice(0, 300),
        stderr: code === 0 ? undefined : redact(stderr).slice(-500),
      });
    });
  });
}

async function runCell(harness, mechanism) {
  const h = HARNESSES[harness];
  const j = job(SECONDS[mechanism]);
  const sessionKey = `agent:makaron:explicit:bgm-${harness}-${mechanism}-${Date.now()}`;
  const startedAt = Date.now();
  const turn = await runAgent(sessionKey, h.model, SCENARIOS[mechanism](j));
  const returnedAt = Date.now();
  const first = await history(sessionKey);
  const firstTools = [...new Set(first.flatMap((m) => m.tools))];
  const firstHasProduct = first.some((m) => m.raw.includes(j.product));

  let wake = null;
  let msgs = first;
  const deadline = returnedAt + WAIT_MS[mechanism];
  while (Date.now() < deadline) {
    await sleep(5_000);
    msgs = await history(sessionKey);
    const later = msgs.slice(first.length);
    // models format numbers with thousands separators
    const hit = later.find((m) => m.role === "assistant" && m.text.replace(/[,，\s]/gu, "").includes(j.product));
    if (hit) { wake = { afterSec: Math.round((Date.now() - returnedAt) / 1000), text: hit.text.slice(0, 200) }; break; }
  }
  const later = msgs.slice(first.length);
  const elsewhere = wake ? [] : await sessionsMentioning(j.product, sessionKey);
  const logs = lines.filter((l) => l.at >= startedAt && new RegExp(`${sessionKey.split(":").pop()}|heartbeat|exec-event|notifyOnExit|Exec completed|bgm-cron-diag|bgm-exec-diag|bgm-hb-diag|worker-gateway-event|sessions_yield|announce|cron|automation|stream`, "iu").test(l.line))
    .map((l) => redact(l.line).slice(0, 260)).slice(-25);
  return {
    harness, mechanism, model: h.model, sessionKey,
    pass: Boolean(wake) && !firstHasProduct,
    firstTurn: { ...turn, tools: firstTools, sawProductEarly: firstHasProduct },
    wake,
    laterMessages: later.map((m) => ({ role: m.role, text: m.text.slice(0, 160), tools: m.tools })).slice(0, 12),
    productElsewhere: elsewhere,
    logs,
  };
}

async function cleanupAutomations() {
  try {
    const r = await rpc("cron.list", { includeDisabled: true });
    for (const jb of r?.jobs ?? []) { try { await rpc("cron.remove", { id: jb.id ?? jb.jobId }); } catch {} }
    return (r?.jobs ?? []).length;
  } catch (error) {
    return `cron cleanup failed: ${error.message}`;
  }
}

startGateway();
const results = [];
try {
  await connectGateway();
  await sleep(10_000);
  const lanes = harnesses.map(async (harness) => {
    for (const mechanism of mechanisms) {
      try {
        const r = await runCell(harness, mechanism);
        results.push(r);
        console.log(`CELL ${harness}/${mechanism}: ${r.pass ? "PASS" : "FAIL"} tools=${r.firstTurn.tools.join(",")} wake=${JSON.stringify(r.wake)} reply=${JSON.stringify(r.firstTurn.reply.slice(0, 120))}`);
      } catch (error) {
        results.push({ harness, mechanism, pass: false, error: String(error.stack ?? error).slice(0, 600) });
        console.log(`CELL ${harness}/${mechanism}: ERROR ${String(error.message).slice(0, 200)}`);
      }
    }
  });
  await Promise.all(lanes);
  const removed = await cleanupAutomations();
  console.log(JSON.stringify({ claudeVersion, harnesses, mechanisms, automationsRemoved: removed, results }, null, 1));
  const table = {};
  for (const r of results) (table[r.harness] ??= {})[r.mechanism] = r.pass ? "PASS" : (r.error ? "ERROR" : "FAIL");
  console.log("MATRIX", JSON.stringify(table));
  for (const l of lines.filter((x) => /\[bgm-(cron|exec|hb)-diag\]/u.test(x.line)).slice(0, 60)) console.log("DIAG", redact(l.line).slice(0, 900));
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  // Claude Code keeps its own transcripts in the shared HOME; leave none behind
  const root = path.join(process.env.HOME ?? "", ".claude", "projects");
  for (const dir of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const d = path.join(root, dir);
    let names = [];
    try { names = fs.readdirSync(d).filter((n) => n.endsWith(".jsonl")); } catch { continue; }
    for (const f of names) {
      const p = path.join(d, f);
      try { if (fs.statSync(p).mtimeMs >= RUN_STARTED && fs.readFileSync(p, "utf8").includes(RUN)) fs.rmSync(p); } catch {}
    }
  }
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(5_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
