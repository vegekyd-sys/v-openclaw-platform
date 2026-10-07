// Candidate probe: /vds first text and thread reuse, V's codex plugin bytes vs the
// v-codex-firsttext-v1 patch. Isolated Gateway on the candidate config copy; never
// touches shared VLab. /vds is configured exactly as on V (shared VLab has no /vds).
//
// A slow user-prompt transcript write is the failure condition on V (big private
// sessions, seconds per write). The candidate has no big session, so it delays that
// write by FT_MIRROR_DELAY_MS in its own copy only (diagnostic hunk, never shipped).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, "../..");
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
const DELAY_MS = Number(process.env.FT_MIRROR_DELAY_MS ?? 6000);
const TURNS = Number(process.env.FT_TURNS ?? 4);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha = (f) => spawnSync("sha256sum", [f], { encoding: "utf8" }).stdout.slice(0, 16);

function readSecretsEnv() {
  const env = {};
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/gu, "");
  }
  return env;
}

// ---- env ----
const secrets = readSecretsEnv();
const config0 = JSON.parse(fs.readFileSync(configPath, "utf8"));
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing from shared secrets.env");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const tmpDir = path.join(scratch, "tmp");
const cacheDir = path.join(scratch, "cache");
for (const d of [tmpDir, cacheDir]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const env = {
  ...process.env, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, OPENCLAW_GATEWAY_PORT: String(config0.gateway?.port),
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
  FT_MIRROR_DELAY_MS: String(DELAY_MS),
};
assert(env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT === undefined || env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT.startsWith(stateDir), "integrity root must stay inside candidate state");

// ---- codex plugin: V's exact bytes ----
const npmProjects = path.join(stateDir, "npm", "projects");
let codexProject = fs.existsSync(npmProjects) && fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
if (!codexProject) {
  const install = spawnSync(process.execPath, [`${runtime}/openclaw/dist/index.js`, "plugins", "install", "@openclaw/codex@2026.9.1", "--pin", "--force", "--accept-capabilities", "--acknowledge-install-policy-warning"], { env: { ...env, OPENCLAW_DEBUG: "1" }, encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  console.log(JSON.stringify({ codexInstall: install.status, out: redact((install.stdout || "") + (install.stderr || "")).split("\n").filter(Boolean).slice(-25) }));
  codexProject = fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
}
assert(codexProject, "codex plugin not found");
const codexRoot = path.join(npmProjects, codexProject, "node_modules", "@openclaw", "codex");
const codexDist = path.join(codexRoot, "dist");
// ---- config: V's /vds ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const keep = new Set(["vlab-agent-worker-isolation", "deepseek", "openai", "codex"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
const dsModels = config.models.providers.deepseek.models;
const flashShape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) {
  if (!dsModels.some((m) => m.id === id)) dsModels.push({ id, name, ...flashShape });
}
const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
config.agents.defaults.models[VDS_REF] = vdsEntry;
config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS_REF]: vdsEntry };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(VDS_REF)) allow.push(VDS_REF);
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };

const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const CODEX_HOME = path.join(config.agents.entries.makaron.agentDir, "codex-home");
fs.mkdirSync(CODEX_HOME, { recursive: true, mode: 0o700 });
const tomlPath = path.join(CODEX_HOME, "config.toml");
const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });

const V_FILES = {
  "harness-DXVZ5II5.js": "lab/release-files/background-work-20261002/vlab-codex-parity/harness-DXVZ5II5.js",
  "run-attempt-D1hJO4fX.js": "lab/release-files/background-work-20261002/vlab-codex-parity/run-attempt-D1hJO4fX.js",
  "thread-lifecycle-DAcEJ_Om.js": "lab/release-files/background-work-20261002/codex-native-subagent/thread-lifecycle-DAcEJ_Om.js",
};
function installVBytes() {
  for (const [name, rel] of Object.entries(V_FILES)) {
    assert(fs.existsSync(path.join(codexDist, name)), `${name} missing from installed codex dist`);
    fs.copyFileSync(path.join(repoRoot, rel), path.join(codexDist, name));
  }
}

// Candidate-only diagnostics: delay the prompt write, and log turn start, prompt-write
// done and the first answer delta the projector receives.
function applyDiagnostics() {
  const file = path.join(codexDist, "run-attempt-D1hJO4fX.js");
  let src = fs.readFileSync(file, "utf8");
  const hunks = [
    ["\tconst promptMirrorPromise = mirrorPromptAtTurnStartBestEffort({\n",
      "\tconst promptMirrorPromise = (async (ftArgs) => {\n"
      + "\t\tconsole.error(`[ft-probe] mirrorStart run=${params.runId} at=${Date.now()}`);\n"
      + "\t\tawait new Promise((r) => setTimeout(r, Number(process.env.FT_MIRROR_DELAY_MS || 0)));\n"
      + "\t\tconst ftResult = await mirrorPromptAtTurnStartBestEffort(ftArgs);\n"
      + "\t\tconsole.error(`[ft-probe] mirrorDone run=${params.runId} at=${Date.now()}`);\n"
      + "\t\treturn ftResult;\n"
      + "\t})({\n"],
    ["\t\t\tcase \"item/agentMessage/delta\":\n\t\t\t\tawait this.assistantProjection.handleAssistantDelta(params);\n",
      "\t\t\tcase \"item/agentMessage/delta\":\n"
      + "\t\t\t\tif (!this.ftFirstDelta) { this.ftFirstDelta = true; console.error(`[ft-probe] firstDelta run=${this.params.runId} at=${Date.now()}`); }\n"
      + "\t\t\t\tawait this.assistantProjection.handleAssistantDelta(params);\n"],
  ];
  for (const [from, to] of hunks) {
    if (src.includes(to)) continue;
    assert.equal(src.split(from).length, 2, `diagnostic anchor must match once: ${from.slice(0, 60)}`);
    src = src.replace(from, to);
  }
  fs.writeFileSync(file, src);
}

// ---- Gateway ----
const lines = [];
let gateway;
function startGateway() {
  lines.length = 0;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => { lines.push(...chunk.split(/\r?\n/u).filter(Boolean).map((l) => `${Date.now()} ${l}`)); if (lines.length > 20000) lines.splice(0, lines.length - 20000); });
  }
}
async function stopGateway() {
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((r) => gateway.once("exit", r)), sleep(20_000)]);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
async function waitPort(timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).join("\n"))}`);
    const ok = await new Promise((resolve) => {
      const sock = net.connect({ host: "127.0.0.1", port });
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => resolve(false));
    });
    if (ok) return;
    await sleep(500);
  }
  throw new Error("Gateway did not listen");
}

const { GatewayClient } = await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
const token = String(config.gateway?.auth?.token ?? "").replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? secrets[k] ?? "");
async function connect(onEvent) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
    const client = new GatewayClient({
      url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"],
      scopes: ["operator.read", "operator.write", "operator.admin"], onEvent,
      onHelloOk() { clearTimeout(timer); resolve(client); },
      onConnectError(e) { clearTimeout(timer); reject(e); },
    });
    client.start();
  });
}

const PROMPTS = [
  "Without using any tools, write about 350 words on why sourdough bread rises. Start with the word ALPHA.",
  "Without using any tools, write about 350 words on how tides work. Start with the word BRAVO. End by naming the first topic I asked about.",
  "Without using any tools, write about 350 words on how bees navigate. Start with the word CHARLIE. End by listing the first word of each of your previous answers.",
  "Without using any tools, write about 350 words on why the sky is blue. Start with the word DELTA. End by listing every topic so far.",
  "Without using any tools, write about 350 words on how glaciers move. Start with the word ECHO.",
];

async function runPhase(label) {
  const runs = new Map();
  const client = await connect((e) => {
    const p = e.payload;
    const r = runs.get(p?.runId);
    if (!r) return;
    const at = Date.now();
    if (e.event === "agent" && p.stream === "assistant" && String(p.data?.text ?? p.data?.delta ?? "").trim() && !r.firstBodyAt) r.firstBodyAt = at;
    if (e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; r.endAt = at; if (p.state !== "final") r.error = redact(JSON.stringify(p).slice(0, 400)); }
  });
  const call = (method, params) => client.request(method, params, { timeoutMs: 30_000 });
  const key = `agent:makaron:explicit:vlab-dev-codex-ft-${label}-${Date.now().toString(36)}`;
  await call("sessions.messages.subscribe", { agentId: "makaron", key });
  const phaseStart = Date.now();
  const rows = [];
  const send = async (message) => {
    const id = randomUUID();
    const r = { id, message: message.slice(0, 40), sentAt: Date.now() };
    runs.set(id, r);
    await call("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 300_000 });
    const deadline = Date.now() + 320_000;
    while (!r.terminal && Date.now() < deadline) await sleep(250);
    return r;
  };
  const sw = await send("/vds");
  console.log(JSON.stringify({ phase: label, switch: sw.terminal }));
  for (const prompt of PROMPTS.slice(0, TURNS)) {
    const markLine = lines.length;
    const r = await send(prompt);
    const probe = (name) => lines.slice(markLine).find((l) => l.includes(`[ft-probe] ${name} run=${r.id}`));
    const at = (l) => (l ? Number(l.match(/at=(\d+)/u)?.[1]) : undefined);
    const window = lines.slice(markLine);
    rows.push({
      phase: label, turn: r.message, terminal: r.terminal, error: r.error,
      firstBodyMs: r.firstBodyAt ? r.firstBodyAt - r.sentAt : null,
      totalMs: r.endAt ? r.endAt - r.sentAt : null,
      mirrorDoneMs: at(probe("mirrorDone")) ? at(probe("mirrorDone")) - r.sentAt : null,
      projectorFirstDeltaMs: at(probe("firstDelta")) ? at(probe("firstDelta")) - r.sentAt : null,
      prebindOverflow: window.filter((l) => /pre-bind notification buffer exceeded/u.test(l)).length,
      replays: window.filter((l) => /client_closed_before_turn_completed|replay/u.test(l)).length,
      transient: window.filter((l) => /starting transient thread/u.test(l)).length,
    });
    console.log(JSON.stringify(rows.at(-1)));
  }
  const h = await call("chat.history", { agentId: "makaron", sessionKey: key, limit: 40 });
  const msgs = (h.messages ?? []).filter((m) => m.role === "user" || m.role === "assistant");
  const text = (m) => (typeof m.content === "string" ? m.content : (m.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
  const order = msgs.map((m) => `${m.role[0]}:${text(m).trim().slice(0, 14).replace(/\s+/gu, " ")}`);
  console.log(JSON.stringify({ phase: label, transcriptOrder: order }));
  client.stop?.();
  return { key, phaseStart, rows, order };
}

function rollouts(sinceMs) {
  const files = spawnSync("bash", ["-c", `find ${CODEX_HOME}/sessions -name 'rollout-*.jsonl' -newermt @${Math.floor(sinceMs / 1000)} 2>/dev/null | sort`], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  return files.map((f) => {
    let model = "", turns = 0;
    const usage = [];
    for (const line of fs.readFileSync(f, "utf8").split("\n").filter(Boolean)) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      const p = e.payload ?? {};
      if (e.type === "turn_context") model = p.model;
      if (e.type === "event_msg" && p.type === "task_started") turns += 1;
      if (e.type === "event_msg" && p.type === "token_count" && p.info?.last_token_usage) usage.push([p.info.last_token_usage.input_tokens, p.info.last_token_usage.cached_input_tokens]);
    }
    return { rollout: path.basename(f).slice(-41, -6), model, turns, usage };
  });
}

try {
  const results = {};
  for (const label of ["vbytes", "patched"]) {
    installVBytes();
    if (label === "patched") {
      const r = spawnSync(process.execPath, [path.join(repoRoot, "lab/release-files/codex-firsttext/patch-codex-firsttext.mjs"), "--codex", codexRoot], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
    }
    console.log(JSON.stringify({ phase: label, runAttempt: sha(path.join(codexDist, "run-attempt-D1hJO4fX.js")), threadLifecycle: sha(path.join(codexDist, "thread-lifecycle-DAcEJ_Om.js")) }));
    applyDiagnostics();
    startGateway();
    await waitPort();
    await sleep(3000);
    results[label] = await runPhase(label);
    console.log(JSON.stringify({ phase: label, rollouts: rollouts(results[label].phaseStart) }));
    const errs = lines.filter((l) => /\b(error|warn)\b/iu.test(l) && /codex/iu.test(l)).slice(-15).map((l) => redact(l).slice(0, 300));
    console.log(JSON.stringify({ phase: label, codexWarnings: errs }));
    await stopGateway();
  }
} catch (error) {
  console.error(redact(error instanceof Error ? error.stack : String(error)));
  console.error(redact(lines.slice(-80).join("\n")));
  process.exitCode = 1;
} finally {
  await stopGateway();
}
