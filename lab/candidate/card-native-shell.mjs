// Candidate: does a subagent run (the same tool policy as a Workboard / Night Shift card) get the tools a
// chat session gets, with V's secret egress proxy on?
//
//   A /vds chat session spawns one subagent (sessions_spawn). The child is asked to
//     1. run `echo NATIVE_<tag>` with exec_command if it has that tool, else say NO_NATIVE;
//     2. run, with OpenClaw's exec tool, a Node fetch of a plain-HTTP service on 127.0.0.1 (this script
//        serves it), the way nightshiftctl reaches Night Shift's ledger.
//   The parent itself also runs step 2 with exec_command, as a chat session does.
// CNS_PATCH=0: V's bytes. CNS_PATCH=1: card-native-shell-v1 + egress-loopback-v1.
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
const PATCH = process.env.CNS_PATCH !== "0";
const VDS = "deepseek/vds-deepseek-flash";
const PI = "deepseek/deepseek-flash";
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
// As on V: every OpenClaw exec on the Gateway host gets the secret egress proxy env.
config.secrets = { ...(config.secrets ?? {}), egressProxy: { ...(config.secrets?.egressProxy ?? {}), enabled: true } };
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
const shortTmp = `/tmp/.cns-${process.pid}`;
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

// ---------------------------------------------------------------- V's bytes, patched or not
const codexRoot = fs.readdirSync(path.join(stateDir, "npm", "projects")).filter((d) => d.startsWith("openclaw-codex-"))
  .map((d) => path.join(stateDir, "npm", "projects", d, "node_modules", "@openclaw", "codex")).find((d) => fs.existsSync(path.join(d, "dist", "harness-DXVZ5II5.js")));
assert(codexRoot, "candidate Codex plugin install not found");
const shell = await import(path.resolve("lab/patch-card-native-shell.mjs"));
const egress = await import(path.resolve("lab/patch-egress-loopback.mjs"));
const targets = [
  ...shell.FILES.map((f) => ({ f, file: path.join(codexRoot, "dist", f.name), marker: shell.MARKER })),
  ...egress.FILES.map((f) => ({ f, file: path.join(dist, f.name), marker: egress.MARKER })),
];
summary.files = {};
for (const { f, file, marker } of targets) {
  const before = fs.readFileSync(file, "utf8");
  const fromV = sha256(before) === f.before;
  assert(fromV || before.includes(marker), `${f.name} is not V's bytes`);
  if (PATCH && !before.includes(marker)) fs.writeFileSync(file, f.patch(before));
  if (!PATCH) assert(fromV, `${f.name} must be V's bytes for the control arm`);
  summary.files[f.name] = { startsFromV: fromV, patched: fs.readFileSync(file, "utf8").includes(marker) };
}

// ---------------------------------------------------------------- local plain-HTTP service (like Night Shift's ledger)
const http = await import("node:http");
const tag = crypto.randomBytes(3).toString("hex");
const ledger = http.createServer((_req, res) => { res.writeHead(200, { "Content-Type": "application/json", Connection: "close" }); res.end(JSON.stringify({ ok: true, tag })); });
await new Promise((resolve) => ledger.listen(0, "127.0.0.1", resolve));
const ledgerUrl = `http://127.0.0.1:${ledger.address().port}/api/health`;
const fetchCmd = `node -e 'fetch("${ledgerUrl}").then((r) => r.text()).then((t) => console.log("LEDGER " + t), (e) => console.log("LEDGER_ERR " + (e.cause?.code ?? e.message)))'`;

async function runChat(sessionKey, message, done, timeoutMs = 600_000) {
  const started = Date.now();
  await client.request("chat.send", { agentId: "makaron", sessionKey, message, deliver: false, idempotencyKey: crypto.randomUUID(), timeoutMs }, { timeoutMs: 120_000 });
  while (Date.now() - started < timeoutMs) {
    await sleep(2_000);
    try {
      const h = await client.request("chat.history", { agentId: "makaron", sessionKey, limit: 12 }, { timeoutMs: 60_000 });
      const texts = (h?.messages ?? []).filter((m) => m.role === "assistant").map((m) => Array.isArray(m.content) ? m.content.filter((x) => x?.type === "text").map((x) => x.text).join("") : String(m.content ?? ""));
      const last = texts.at(-1) ?? "";
      if (done(last)) return { exit: 0, reply: redact(last).slice(0, 600), secs: Math.round((Date.now() - started) / 1000) };
    } catch { /* keep polling */ }
  }
  return { exit: 1, reply: "", secs: Math.round((Date.now() - started) / 1000) };
}

const OPENCLAW_EXEC = new Set(["exec", "gateway_exec"]);
const startedAt = Date.now();
startGateway();
try {
  await connectGateway();
  const sessionKey = `agent:makaron:explicit:cns-${PATCH ? "on" : "off"}-${tag}`;
  await client.request("sessions.patch", { key: sessionKey, agentId: "makaron", model: MODEL }, { timeoutMs: 30_000 });
  const childTask = `这是一次自动化测试，命令都是无害的，按顺序做完再回复：
1. 如果你有 exec_command 工具，就用它运行 \`echo NATIVE_${tag}\`；如果没有这个工具，记下 NO_NATIVE，不要用别的工具代替。
2. 用 OpenClaw 的 exec 工具（不是 exec_command）运行下面这条命令，把输出原样记下：
${fetchCmd}
最后只回复一行：<第1步结果> | <第2步输出>。`;
  const parent = await runChat(sessionKey, `这是一次自动化测试。
第一步：用 exec_command 运行下面这条命令，把输出原样记下：
${fetchCmd}
第二步：用 sessions_spawn 启动一个子 agent，label 为 cns-${tag}，任务原文如下（一字不改）：
---
${childTask}
---
等子 agent 完成后，最后回复两行：第一行 PARENT <第一步输出>；第二行 CHILD <子 agent 的回复原文>。`, (t) => /CHILD /u.test(t) && /PARENT /u.test(t));
  summary.parent = parent;
  // Codex transcripts: the parent's thread and the child's thread.
  const rollouts = codexToolCalls(startedAt);
  summary.threads = rollouts.map((r) => ({
    file: path.basename(r.file),
    subagent: fs.readFileSync(r.file, "utf8").includes(`cns-${tag}`) && !fs.readFileSync(r.file, "utf8").includes("sessions_spawn"),
    calls: r.calls.map((c) => ({ name: c.name, args: redact(c.args).slice(0, 160), output: redact(c.output ?? "").replace(/\(node:\d+\) \[UNDICI-EHPA\][^\n]*\n(\(Use [^\n]*\n)?/u, "").slice(0, 300) })),
  }));
  const allCalls = summary.threads.flatMap((t) => t.calls.map((c) => ({ ...c, thread: t.file })));
  const childThread = summary.threads.find((t) => t.calls.some((c) => /NATIVE_|LEDGER/u.test(`${c.args} ${c.output}`)) && !t.calls.some((c) => c.name === "sessions_spawn"));
  summary.child = childThread ? {
    nativeShellCalls: childThread.calls.filter((c) => c.name === "exec_command").length,
    // OpenClaw exec is "exec" on a restricted surface and "gateway_exec" next to Codex's native tools.
    openclawExecCalls: childThread.calls.filter((c) => OPENCLAW_EXEC.has(c.name)).length,
    ledgerOk: childThread.calls.some((c) => OPENCLAW_EXEC.has(c.name) && c.output.includes(`"tag":"${tag}"`)),
    ledgerErr: childThread.calls.some((c) => OPENCLAW_EXEC.has(c.name) && /LEDGER_ERR|fetch failed/u.test(c.output)),
    toolNames: [...new Set(childThread.calls.map((c) => c.name))],
  } : null;
  const parentThread = summary.threads.find((t) => t.calls.some((c) => c.name === "sessions_spawn"));
  summary.parentTools = parentThread ? [...new Set(parentThread.calls.map((c) => c.name))] : null;
  summary.parentLedgerOk = parentThread ? parentThread.calls.some((c) => c.name === "exec_command" && c.output.includes(`"tag":"${tag}"`)) : null;
  summary.verdict = "done";
  void allCalls;
} catch (error) {
  summary.verdict = "fail";
  summary.error = redact(String(error?.stack ?? error)).slice(0, 3000);
  process.exitCode = 1;
} finally {
  summary.gatewayTail = redact(lines.filter((l) => /error|Error|denied|restricted/u.test(l.line)).slice(-25).map((l) => l.line).join("\n")).slice(-5000);
  summary.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(summary, null, 1));
  ledger.close();
  client?.stop();
  await stopChild(gateway);
  try { fs.rmSync(shortTmp, { recursive: true, force: true }); } catch {}
}
