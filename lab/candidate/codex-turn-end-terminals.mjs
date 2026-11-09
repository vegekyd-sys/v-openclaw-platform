// Candidate: real /vds turns against v-codex-turn-end-terminals-v1 and the agent-shell sidecar.
//
//   turn 1  exec_command `sleep <n>` with a short yield_time_ms, then reply at once: Codex keeps
//           the sleep in a native background terminal. Patched: it is gone once the turn ends.
//           Control (CTT_PATCH=0, V's bytes): it is still running.
//   turn 2  gateway_exec (OpenClaw exec) `sleep <m>` in the background: OpenClaw keeps background
//           exec across turns on purpose (completion wake); it must keep running.
// While both run, scripts/v-agent-shell-cgroup.py watches the candidate unit; both sleeps must be
// in agent-shell, the Gateway and the Codex app-server must not.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const PATCH = process.env.CTT_PATCH !== "0";
const VDS = "deepseek/vds-deepseek-flash";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dist = path.join(runtime, "openclaw", "dist");
const summary = { startedAt: new Date().toISOString(), patched: PATCH, notes: [] };
const secrets = new Set();
const redact = (s) => { let out = String(s); for (const v of secrets) if (v) out = out.replaceAll(v, "[redacted]"); return out; };
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const MODEL = VDS;

// ---------------------------------------------------------------- private config
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
secrets.add(token);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const dsModels = config.models.providers.deepseek.models;
const flashShape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) {
  if (!dsModels.some((m) => m.id === id)) dsModels.push({ id, name, ...flashShape });
}
const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
config.agents.defaults.models[VDS] = vdsEntry;
config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS]: vdsEntry };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow)) for (const m of [VDS, PI]) if (!allow.includes(m)) allow.push(m);
// makaron's primary model, as on V (agents.defaults.model and the agent's own model).
for (const target of [config.agents.defaults, config.agents.entries.makaron]) target.model = { primary: MODEL, fallbacks: [] };
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));

  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
  summary.workerConfig = { path: workerRel, derived: true };
} else summary.notes.push("no vlab-agent-worker-isolation entry: PI runs in the Gateway process");
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// Codex plugin: the shared VLab install (V's bytes).
const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}
const codexHome = path.join(config.agents.entries.makaron.agentDir, "codex-home");
fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
{
  const tomlPath = path.join(codexHome, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
}
const workspace = config.agents.entries.makaron.workspace ?? path.join(data, "workspace", "makaron");
fs.mkdirSync(workspace, { recursive: true });
const runTag = crypto.randomBytes(3).toString("hex");

// ---------------------------------------------------------------- Gateway
const shortTmp = `/tmp/.ctt-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const cacheDir = path.join(data, "cache");
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm") };
const deepseekKey = secret("DEEPSEEK_API_KEY");
assert(deepseekKey, "DEEPSEEK_API_KEY missing from shared secrets.env");
env.DEEPSEEK_API_KEY = deepseekKey; secrets.add(deepseekKey);
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
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(8_000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
}
let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run|migration inputs changed/u.test(l.line))) { startGateway(); continue; }
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
function runTurn(sessionKey, model, prompt, timeoutSecs = 600) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey, "--model", model, "--message", prompt, "--json", "--timeout", String(timeoutSecs)], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });
    const kill = setTimeout(() => child.kill("SIGKILL"), (timeoutSecs + 90) * 1000);
    child.on("exit", (code) => {
      clearTimeout(kill);
      let meta;
      try { meta = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch { /* not json */ }
      resolve({
        exit: code, secs: Math.round((Date.now() - started) / 1000), startedAt: started,
        reply: redact(String(meta?.result?.payloads?.map((p) => p.text).join("\n") ?? meta?.payloads?.[0]?.text ?? "")).slice(0, 1200),
        stderr: code === 0 ? undefined : redact(stderr).slice(-800),
      });
    });
  });
}
// Codex's own transcript: every tool call and its output.
function codexToolCalls(since) {
  const out = [];
  const files = spawnSync("bash", ["-c", `find ${JSON.stringify(path.join(codexHome, "sessions"))} -name 'rollout-*.jsonl' -newermt @${Math.floor(since / 1000) - 1} 2>/dev/null`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  for (const f of files) {
    const calls = new Map();
    let fresh = false;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      const p = o.payload ?? {};
      // Only threads this turn started: an earlier session's rollout can be touched later.
      if (o.type === "session_meta") fresh = Date.parse(p.timestamp ?? o.timestamp) >= since - 1000;
      if (!fresh) continue;
      if ((p.type === "function_call" || p.type === "custom_tool_call") && p.call_id) calls.set(p.call_id, { name: p.name, args: String(p.arguments ?? p.input ?? "") });
      else if ((p.type === "function_call_output" || p.type === "custom_tool_call_output") && calls.has(p.call_id)) {
        calls.get(p.call_id).output = typeof p.output === "string" ? p.output : JSON.stringify(p.output);
      }
    }
    out.push({ file: f, calls: [...calls.values()] });
  }
  return out;
}

// ---------------------------------------------------------------- Codex plugin: V's bytes, patched or not
const codexRoot = fs.readdirSync(path.join(stateDir, "npm", "projects")).filter((d) => d.startsWith("openclaw-codex-"))
  .map((d) => path.join(stateDir, "npm", "projects", d, "node_modules", "@openclaw", "codex")).find((d) => fs.existsSync(path.join(d, "dist", "run-attempt-D1hJO4fX.js")));
assert(codexRoot, "candidate Codex plugin install not found");
const runAttempt = path.join(codexRoot, "dist", "run-attempt-D1hJO4fX.js");
const { FILES, MARKER } = await import(path.resolve("lab/patch-codex-turn-end-terminals.mjs"));
const before = fs.readFileSync(runAttempt, "utf8");
summary.codexStartsFromV = sha256(before) === FILES[0].before;
assert(summary.codexStartsFromV || before.includes(MARKER), "candidate Codex run-attempt is not V's bytes");
if (PATCH && !before.includes(MARKER)) fs.writeFileSync(runAttempt, FILES[0].patch(before));
summary.codexPatched = fs.readFileSync(runAttempt, "utf8").includes(MARKER);

// ---------------------------------------------------------------- the sidecar on this unit
const self = fs.readFileSync("/proc/self/cgroup", "utf8").trim().split("\n").find((l) => l.startsWith("0::")).slice(3);
const SERVICE = "/sys/fs/cgroup" + path.dirname(self);
const sideOut = [];
const side = spawn("python3", ["scripts/v-agent-shell-cgroup.py", "--service-cgroup", SERVICE, "--memory-high", "4G", "--interval", "0.5"], { stdio: ["ignore", "pipe", "pipe"] });
side.stdout.on("data", (c) => sideOut.push(...c.toString().split("\n").filter(Boolean)));
side.stderr.on("data", (c) => sideOut.push(...c.toString().split("\n").filter(Boolean)));
const cgroupOf = (pid) => { try { return path.basename(fs.readFileSync(`/proc/${pid}/cgroup`, "utf8").trim().split("::")[1]); } catch { return null; } };
const pidsOf = (pattern) => spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" }).stdout.split("\n").filter(Boolean).map(Number).filter((p) => p !== process.pid);
async function waitFor(fn, ms = 30_000) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(250); } return null; }

const tag = crypto.randomInt(900, 999);
const S1 = `sleep ${tag}1`, S2 = `sleep ${tag}2`;
const startedAt = Date.now();
startGateway();
try {
  await connectGateway();
  const sessionKey = `agent:makaron:explicit:ctt-${PATCH ? "on" : "off"}-${tag}`;
  await client.request("sessions.patch", { key: sessionKey, agentId: "makaron", model: MODEL }, { timeoutMs: 30_000 });
  // turn 1: native background terminal
  const t1 = runTurn(sessionKey, MODEL, `这是一次自动化测试，命令都是无害的。请用 exec_command 运行 \`ls -la\`，然后再用 exec_command 运行 \`${S1}\`，第二条把 yield_time_ms 设为 2000。第二条转入后台后不要等待、不要轮询、不要结束它，直接只回复 STARTED。`);
  const p1 = await waitFor(() => pidsOf(`^${S1}$`)[0], 240_000);
  summary.turn1 = { sleepPid: p1 ?? null };
  if (p1) {
    await sleep(1_500);
    summary.turn1.cgroupWhileRunning = cgroupOf(p1);
    const r1 = await t1;
    summary.turn1.reply = redact(r1.reply).slice(0, 200); summary.turn1.exit = r1.exit;
    await sleep(3_000);
    summary.turn1.aliveAfterTurn = pidsOf(`^${S1}$`).length > 0;
  } else { const r1 = await t1; summary.turn1.reply = redact(r1.reply).slice(0, 300); summary.turn1.exit = r1.exit; }
  summary.turn1.calls = codexToolCalls(startedAt).flatMap((r) => r.calls).map((c) => `${c.name} ${redact(c.args).slice(0, 100)}`).slice(0, 8);
  // turn 2: OpenClaw exec in the background
  const t2Start = Date.now();
  const t2 = runTurn(sessionKey, MODEL, `这是一次自动化测试。请用 gateway_exec 工具（OpenClaw 的 exec，不是 exec_command）运行 \`${S2}\`，参数 background 设为 true。启动后不要等待，直接只回复 STARTED2。`);
  const p2 = await waitFor(() => pidsOf(`^${S2}$`)[0], 240_000);
  summary.turn2 = { sleepPid: p2 ?? null };
  if (p2) { await sleep(1_500); summary.turn2.cgroupWhileRunning = cgroupOf(p2); }
  const r2 = await t2;
  summary.turn2.reply = redact(r2.reply).slice(0, 200); summary.turn2.exit = r2.exit;
  await sleep(3_000);
  summary.turn2.aliveAfterTurn = pidsOf(`^${S2}$`).length > 0;
  summary.turn2.calls = codexToolCalls(t2Start).flatMap((r) => r.calls).map((c) => `${c.name} ${redact(c.args).slice(0, 100)}`).slice(0, 6);
  // who stayed in foreground
  const appServer = pidsOf("codex.*app-server")[0];
  summary.placement = { gateway: cgroupOf(gateway.pid), codexAppServer: appServer ? cgroupOf(appServer) : null };
  summary.sidecar = sideOut.filter((l) => /moved|prepared|error/u.test(l)).slice(0, 12);
  summary.verdict = "done";
} catch (error) {
  summary.verdict = "fail";
  summary.error = redact(String(error?.stack ?? error)).slice(0, 3000);
  summary.gatewayTail = redact(lines.slice(-40).map((l) => l.line).join("\n")).slice(-4000);
  process.exitCode = 1;
} finally {
  for (const p of [...pidsOf(`^${S1}$`), ...pidsOf(`^${S2}$`)]) try { process.kill(p, "SIGTERM"); } catch {}
  side.kill("SIGTERM");
  summary.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(summary, null, 1));
  client?.stop();
  await stopChild(gateway);
  try { fs.rmSync(shortTmp, { recursive: true, force: true }); } catch {}
}
