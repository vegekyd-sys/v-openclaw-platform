// Candidate: does a Workboard card worker start with V's workspace context?
//
// One real Gateway, one real Workboard card for makaron, dispatched the way Night Shift dispatches
// (workboard.cards.dispatchWithOptions). The card asks the worker to answer, without any tool but
// workboard_complete, two things only the injected workspace files hold: the title of AGENTS.md
// High-Priority Rule 5 and the first heading of SOUL.md.
//
// WFC_MODEL=vds (default)  makaron's primary model is /vds (Codex + DeepSeek Flash), as on V
//                          since 2026-11-09 12:23. The card thread's rollout shows what Codex got.
// WFC_MODEL=pi             DeepSeek Flash on the PI harness in a Worker child (the pre-12:23 path).
// The plan decides the bytes: workboard-full-context-on.plan.json overlays the two patched dist
// files, -off runs V's bytes as the control.
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
const modelKind = process.env.WFC_MODEL === "pi" ? "pi" : "vds";
const VDS = "deepseek/vds-deepseek-flash";
const PI = "deepseek/deepseek-flash";
const MODEL = modelKind === "pi" ? PI : VDS;
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dist = path.join(runtime, "openclaw", "dist");
const summary = { startedAt: new Date().toISOString(), modelKind, model: MODEL, notes: [] };
const secrets = new Set();
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of secrets) if (v) out = out.replaceAll(v, "[redacted]");
  return out;
};
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const MARKER = "v-workboard-full-context-v1";
summary.patched = {
  runtimeApi: fs.readFileSync(path.join(dist, "runtime-api-1CCazqtv.js"), "utf8").includes(MARKER),
  workspace: fs.readFileSync(path.join(dist, "workspace-BFk42BX6.js"), "utf8").includes(MARKER),
};

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
const shortTmp = `/tmp/.wfc-${process.pid}`;
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
// The session transcript as the Gateway holds it (PI harness: tool calls and results).
async function transcriptText(sessionKey) {
  for (const [method, params] of [["chat.history", { sessionKey, limit: 200 }], ["sessions.get", { key: sessionKey, includeMessages: true }]]) {
    try { return JSON.stringify(await client.request(method, params, { timeoutMs: 30_000 })); } catch (error) { summary.notes.push(`${method}: ${String(error?.message ?? error).slice(0, 160)}`); }
  }
  return "";
}

// Codex rollouts this run created, with what the model was given before the card text.
function cardRollouts(since, cardId, expected) {
  const files = spawnSync("bash", ["-c", `find ${JSON.stringify(path.join(codexHome, "sessions"))} -name 'rollout-*.jsonl' -newermt @${Math.floor(since / 1000) - 1} 2>/dev/null`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  const out = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    let isCard = false;
    const ctx = { cwd: null, agentsMessage: false, workspaceContextFiles: [], developerChars: 0, ruleTextIn: [], soulTextIn: [] };
    for (const line of lines.slice(0, 80)) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      const p = o.payload ?? {};
      if (o.type === "turn_context" && !ctx.cwd) ctx.cwd = p.cwd ?? null;
      if (o.type === "response_item" && p.type === "message") {
        const t = (p.content ?? []).map((c) => c?.text ?? "").join(" ");
        const where = `${p.role}:${t.slice(0, 40).replace(/\s+/gu, " ")}`;
        if (expected.rule && t.includes(expected.rule) && !t.includes(cardId)) ctx.ruleTextIn.push(where);
        if (expected.soulHeading && t.includes(expected.soulHeading) && !t.includes(cardId)) ctx.soulTextIn.push(where);
        if (t.includes(cardId)) isCard = true;
        if (p.role === "developer" && !ctx.developerChars) ctx.developerChars = t.length;
        if (t.startsWith("# AGENTS.md instructions for")) ctx.agentsMessage = true;
        if (t.includes("<openclaw_workspace_context>")) ctx.workspaceContextFiles = [...t.matchAll(/^### \S*\/([A-Z]+\.md)$/gmu)].map((m) => m[1]);
      }
    }
    if (isCard) out.push({ file: path.basename(f), ...ctx });
  }
  return out;
}
// The candidate workspace starts empty: bring in the shared VLab makaron workspace's top-level
// bootstrap files (V's, as mirrored), or stand-ins with the probe anchors when it has none.
function seedWorkspace() {
  const shared = JSON.parse(fs.readFileSync(process.env.VLAB_SHARED_CONFIG_PATH, "utf8"));
  const sharedWs = shared.agents?.entries?.makaron?.workspace;
  const copied = [];
  for (const name of ["AGENTS.md", "SOUL.md", "IDENTITY.md", "USER.md", "MEMORY.md", "TOOLS.md", "REDLINES.md", "HEARTBEAT.md"]) {
    const from = sharedWs ? path.join(sharedWs, name) : null;
    const to = path.join(workspace, name);
    if (fs.existsSync(to)) continue;
    if (from && fs.existsSync(from)) { fs.copyFileSync(from, to); copied.push(name); }
  }
  if (!fs.existsSync(path.join(workspace, "AGENTS.md"))) fs.writeFileSync(path.join(workspace, "AGENTS.md"), "# AGENTS.md\n\n## High-Priority Rules\n\n1. **Error = Report** - report failures.\n5. **Filter every recursive search** - never grep a data tree.\n");
  if (!fs.existsSync(path.join(workspace, "SOUL.md"))) fs.writeFileSync(path.join(workspace, "SOUL.md"), "# SOUL.md - Probe Identity\n\nYou are V.\n");
  summary.workspaceSeed = { sharedWorkspace: sharedWs ?? null, copied };
}
function expectedAnswers() {
  const agents = fs.readFileSync(path.join(workspace, "AGENTS.md"), "utf8");
  const soul = fs.readFileSync(path.join(workspace, "SOUL.md"), "utf8");
  const section = agents.slice(agents.indexOf("## High-Priority Rules")).split(/\n## /u)[0];
  const rules = [...section.matchAll(/^(\d+)\.\s+\*\*(.+?)\*\*/gmu)];
  const last = rules.at(-1);
  return {
    ruleNumber: last ? Number(last[1]) : null,
    rule: last?.[2]?.trim() ?? null,
    soulHeading: /^#\s+(.+)$/mu.exec(soul)?.[1]?.trim() ?? null,
  };
}

async function probeCard() {
  seedWorkspace();
  const expected = expectedAnswers();
  summary.expected = expected;
  assert(expected.rule && expected.soulHeading, `workspace files lack the probe anchors: ${JSON.stringify(expected)}`);
  const tag = crypto.randomBytes(3).toString("hex");
  const notes = [
    "Context probe (automated test). Do NOT call any tool except workboard_complete: no read, exec, memory_search or anything else.",
    "From the instructions you were started with, answer:",
    `1. The bold title of rule ${expected.ruleNumber} under "High-Priority Rules" in your workspace AGENTS.md.`,
    "2. The first top-level heading of your SOUL.md.",
    `Then call workboard_complete once with summary exactly "WFC-${tag} R5=<answer 1>; SOUL=<answer 2>" (write UNKNOWN for anything you were not given) and proof "context-probe".`,
  ].join("\n");
  const created = await client.request("workboard.cards.create", { title: `WFC context probe ${tag}`, status: "ready", priority: "urgent", agentId: "makaron", notes, maxRetries: 0 }, { timeoutMs: 30_000 });
  const card = created.card;
  summary.card = { id: card.id, boardId: card.boardId ?? null };
  const startAt = Date.now();
  const dispatched = await client.request("workboard.cards.dispatchWithOptions", { ...(card.boardId ? { boardId: card.boardId } : {}), cardIds: [card.id], maxStarts: 1 }, { timeoutMs: 60_000 });
  summary.dispatch = { started: (dispatched.started ?? []).map((s) => ({ sessionKey: s.sessionKey, runId: s.runId })), startFailures: dispatched.startFailures ?? [] };
  assert.equal(summary.dispatch.started.length, 1, `card did not start: ${JSON.stringify(dispatched).slice(0, 600)}`);
  const sessionKey = summary.dispatch.started[0].sessionKey;
  let final;
  for (let i = 0; i < 120; i += 1) {
    await sleep(5_000);
    const listed = await client.request("workboard.cards.list", { cardIds: [card.id] }, { timeoutMs: 30_000 });
    final = (listed.cards ?? listed).find?.((c) => c.id === card.id) ?? null;
    if (final && ["done", "blocked", "failed", "review"].includes(final.status)) break;
  }
  const cardText = JSON.stringify(final ?? {});
  const m = [...cardText.matchAll(new RegExp(`WFC-${tag} R5=([^;"]*); SOUL=([^"\\\\]*)`, "gu"))].filter((x) => !x[1].startsWith("<answer")).at(-1);
  summary.result = { status: final?.status ?? null, secs: Math.round((Date.now() - startAt) / 1000), answer: m ? { rule5: m[1].trim(), soul: m[2].trim() } : null };
  if (modelKind === "vds") {
    const rollouts = cardRollouts(startAt, card.id, expected);
    summary.rollouts = rollouts;
    const calls = codexToolCalls(startAt).filter((r) => rollouts.some((x) => r.file.endsWith(x.file))).flatMap((r) => r.calls);
    summary.toolCalls = calls.map((c) => `${c.name} ${redact(c.args).slice(0, 120)}`);
  } else {
    const text = await transcriptText(sessionKey);
    summary.transcriptBytes = text.length;
    summary.toolCalls = [...text.matchAll(/"(?:name|toolName)":"([a-z_]+)"/gu)].map((x) => x[1]).filter((n) => n !== "workboard_complete");
  }
  summary.readWorkspaceFiles = (summary.toolCalls ?? []).some((c) => /AGENTS\.md|SOUL\.md|\bread\b|\bexec\b|memory_/u.test(c));
}

const startedAt = Date.now();
startGateway();
try {
  await connectGateway();
  summary.gatewayReadyMs = Date.now() - startedAt;
  await probeCard();
  const ok = summary.result.answer;
  summary.knowsRule = Boolean(ok && ok.rule5.toLowerCase().includes(summary.expected.rule.toLowerCase().slice(0, 12)));
  summary.knowsSoul = Boolean(ok && ok.soul.toLowerCase().includes(summary.expected.soulHeading.toLowerCase().slice(0, 12)));
  summary.verdict = "done";
} catch (error) {
  summary.verdict = "fail";
  summary.error = redact(String(error?.stack ?? error)).slice(0, 3000);
  summary.gatewayTail = redact(lines.slice(-60).map((l) => l.line).join("\n")).slice(-6000);
  process.exitCode = 1;
} finally {
  summary.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(summary, null, 1));
  client?.stop();
  await stopChild(gateway);
  try { fs.rmSync(shortTmp, { recursive: true, force: true }); } catch { /* compile cache still being written */ }
}
