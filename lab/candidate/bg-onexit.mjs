// Candidate test: a Gateway-owned background command (automations on-exit)
// as the cross-harness equivalent of Claude Code's Bash run_in_background.
//
// The test driver plays the part of a thin "background_run" tool: after an
// ordinary first turn it creates, through the Gateway API, an on-exit job
// bound to that session. While the command runs, a second user message is
// sent; it must be answered at once (nothing holds the session). When the
// command exits, the Gateway must start a new turn in the ORIGINAL session,
// on the session's own harness, whose reply contains the command's output
// (A*B for random A, B; the product never appears in any prompt).
//
// Harnesses (V aliases): worker = deepseek-v4-flash on vlab-worker,
// codex = /vds (deepseek-flash on the Codex app-server), claude-cli = /vcc
// (claude-opus-5-5 on Claude Code 2.1.280, with V's
// CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1).
//
// V parity: cron enabled; heartbeat untouched; the cron shared-management
// policy is kept when present (BGO_KEEP_SHARED_POLICY=0 drops it). Channels
// are cleared so the private Gateway cannot take shared Feishu events: this
// run proves the wake, not Feishu delivery.
//
// BGO_HARNESSES=worker,codex,claude-cli  BGO_SECONDS=45

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
const harnesses = (process.env.BGO_HARNESSES ?? Object.keys(HARNESSES).join(",")).split(",").filter(Boolean);
const BG_SECONDS = Number(process.env.BGO_SECONDS ?? 45);
const claudeVersion = "2.1.280"; // production V
const SWITCH = "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS";

const RUN = `BGO${Date.now().toString(36)}`;
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

// The shared-management patch governs agent-tool callers; an operator-created
// on-exit job must still work with it in place, as on V.
const sharedPolicy = env.OPENCLAW_CRON_SHARED_POLICY ?? null;
if (process.env.BGO_KEEP_SHARED_POLICY === "0") delete env.OPENCLAW_CRON_SHARED_POLICY;
console.log(JSON.stringify({ sharedPolicy, kept: Boolean(env.OPENCLAW_CRON_SHARED_POLICY) }));

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
    text: content.map(blockText).join(" ").replace(/\s+/gu, " ").slice(0, 400),
    provider: m.provider ?? m.meta?.provider ?? m.__openclaw?.provider,
    model: m.model ?? m.meta?.model ?? m.__openclaw?.model,
    at: m.timestamp ?? m.createdAt ?? m.ts,
    api: m.api,
    harness: m.harnessId ?? m.harness ?? m.agentRuntime ?? m.__openclaw?.harnessId,
    keys: Object.keys(m).join(","),
    raw: JSON.stringify(m),
  };
}
async function history(sessionKey) {
  try {
    const r = await rpc("chat.history", { agentId: "makaron", sessionKey, limit: 200 });
    return (r?.messages ?? []).map(summarize);
  } catch (error) {
    return [{ role: "error", text: String(error.message).slice(0, 200), raw: "" }];
  }
}
const digits = (s) => s.replace(/[,，\s]/gu, "");

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
        code, secs: Math.round((Date.now() - started) / 100) / 10,
        provider: agentMeta?.provider, model: agentMeta?.model,
        reply: String(meta?.result?.payloads?.[0]?.text ?? meta?.payloads?.[0]?.text ?? "").slice(0, 300),
        stderr: code === 0 ? undefined : redact(stderr).slice(-500),
      });
    });
  });
}

async function runCell(harness) {
  const h = HARNESSES[harness];
  const a = 1000 + Math.floor(Math.random() * 9000);
  const b = 1000 + Math.floor(Math.random() * 9000);
  const product = String(a * b);
  const sessionKey = `agent:makaron:explicit:bgo-${harness}-${Date.now()}`;
  const startedAt = Date.now();
  // /vcc etc. pin the session's model; do the same so a cron turn uses it too
  let patched = null;
  try { patched = Boolean(await rpc("sessions.patch", { key: sessionKey, model: h.model })); } catch (error) { patched = `sessions.patch: ${String(error.message).slice(0, 160)}`; }
  const turn1 = await runAgent(sessionKey, h.model, `这是一次自动化测试（${RUN}）的第一条消息。只回复「好的」。`);

  // ---- what a thin background_run tool would do: one Gateway call ----
  const command = `python3 -c "import time; time.sleep(${BG_SECONDS}); print('RESULT', ${a}*${b})"`;
  let job = null, jobError = null;
  const armedAt = Date.now();
  try {
    job = await rpc("cron.add", {
      name: `bgo-${harness}-${RUN}`,
      agentId: "makaron",
      sessionKey,
      sessionTarget: `session:${sessionKey}`,
      wakeMode: "now",
      deleteAfterRun: true,
      schedule: { kind: "on-exit", command },
      payload: { kind: "agentTurn", message: `（${RUN}）你之前在后台启动的命令已经结束，下面是它的退出码和输出。把输出里 RESULT 后面的数字原样告诉用户。` },
    });
  } catch (error) {
    jobError = String(error.message).slice(0, 400);
  }
  const jobId = job?.id ?? job?.job?.id ?? job?.jobId;
  let jobView = null;
  if (jobId) { try { const g = await rpc("cron.get", { id: jobId }); jobView = { sessionTarget: g?.sessionTarget ?? g?.job?.sessionTarget, delivery: g?.delivery ?? g?.job?.delivery, schedule: (g?.schedule ?? g?.job?.schedule)?.kind }; } catch (error) { jobView = `cron.get: ${String(error.message).slice(0, 160)}`; } }

  // ---- while it runs, the user keeps talking ----
  await sleep(8_000);
  const turn2 = await runAgent(sessionKey, h.model, `这是同一个测试（${RUN}）的第二条消息。只回复「收到」。`);
  const turn2EndedAt = Date.now();
  const base = (await history(sessionKey)).length;
  const backgroundStillRunning = turn2EndedAt - armedAt < BG_SECONDS * 1000;

  let wake = null;
  let msgs = [];
  const deadline = armedAt + BG_SECONDS * 1000 + 300_000;
  while (Date.now() < deadline) {
    await sleep(3_000);
    msgs = await history(sessionKey);
    const hit = msgs.slice(base).find((m) => m.role === "assistant" && digits(m.text).includes(product));
    if (hit) {
      const injected = msgs.slice(base).find((m) => m.role === "user");
      wake = {
        afterExitSec: Math.round((Date.now() - armedAt) / 1000 - BG_SECONDS),
        text: hit.text.slice(0, 200), provider: hit.provider, model: hit.model, api: hit.api, harness: hit.harness, keys: hit.keys,
        injected: injected?.text.slice(0, 300),
      };
      break;
    }
  }
  const all = await history(sessionKey);
  const early = all.slice(0, base).some((m) => digits(m.raw).includes(product));
  let runs = null;
  if (jobId) { try { const r = await rpc("cron.runs", { id: jobId, limit: 3 }); runs = (r?.entries ?? r?.runs ?? []).map((e) => ({ status: e.status, delivery: e.deliveryStatus ?? e.delivery?.status, error: e.error, summary: String(e.summary ?? "").slice(0, 120) })); } catch (error) { runs = `cron.runs: ${String(error.message).slice(0, 160)}`; } }
  const logs = lines.filter((l) => l.at >= startedAt && new RegExp(`${sessionKey.split(":").pop()}|cron|on-exit|exit-watch|bgm-cron-diag|codex|app-server|harness`, "iu").test(l.line))
    .map((l) => redact(l.line).replace(/\u001b\[[0-9;]*m/gu, "").slice(0, 260)).slice(-40);
  const sameHarness = !wake?.provider || !turn1.provider || wake.provider === turn1.provider;
  return {
    harness, model: h.model, sessionKey, patched,
    pass: Boolean(wake) && !early && turn2.code === 0 && backgroundStillRunning && sameHarness,
    turn1, job: { id: jobId, error: jobError, view: jobView }, turn2: { ...turn2, backgroundStillRunning },
    wake, runs, early, sameHarness,
    transcript: all.map((m) => ({ role: m.role, provider: m.provider, api: m.api, harness: m.harness, text: m.text.slice(0, 140) })).slice(-8),
    logs,
  };
}

async function cleanupAutomations() {
  try {
    const r = await rpc("cron.list", { includeDisabled: true });
    const mine = (r?.jobs ?? []).filter((jb) => String(jb.name ?? "").includes(RUN));
    for (const jb of mine) { try { await rpc("cron.remove", { id: jb.id ?? jb.jobId }); } catch {} }
    return mine.length;
  } catch (error) {
    return `cron cleanup failed: ${error.message}`;
  }
}

startGateway();
const results = [];
try {
  await connectGateway();
  await sleep(10_000);
  await Promise.all(harnesses.map(async (harness) => {
    try {
      const r = await runCell(harness);
      results.push(r);
      console.log(`CELL ${harness}: ${r.pass ? "PASS" : "FAIL"} turn2=${r.turn2.secs}s wake=${JSON.stringify(r.wake)}`);
    } catch (error) {
      results.push({ harness, pass: false, error: String(error.stack ?? error).slice(0, 600) });
      console.log(`CELL ${harness}: ERROR ${String(error.message).slice(0, 200)}`);
    }
  }));
  const left = await cleanupAutomations();
  console.log(JSON.stringify({ claudeVersion, harnesses, seconds: BG_SECONDS, sharedPolicyKept: Boolean(env.OPENCLAW_CRON_SHARED_POLICY), leftoverJobsRemoved: left, results }, null, 1));
  console.log("RESULT", JSON.stringify(Object.fromEntries(results.map((r) => [r.harness, r.pass ? "PASS" : (r.error ? "ERROR" : "FAIL")]))));
  for (const l of lines.filter((x) => /\[bgm-cron-diag\]/u.test(x.line)).slice(0, 20)) console.log("DIAG", redact(l.line).slice(0, 900));
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
