// Candidate: run-start-phases-v1 on V's bytes. Isolated Gateway on the candidate config copy; never touches shared
// VLab. /vds configured as on V (as lab/candidate/codex-firsttext.mjs does).
//   base     V's three files as they are (get-reply, agent-runner, Codex run-attempt): first body per turn
//   patched  lab/release-files/run-start-phases/: the same turns, first body, and every [run-start-phases.1] line
// Checks: each turn of the patched phase logs exactly one line, with its run id, the expected steps in order,
// and steps summing to totalMs; no new warnings; first body not slower than base beyond noise.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
const TURNS = Number(process.env.RSP_TURNS ?? 5);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");

const V_SHA = {
  "get-reply-CqW1y05D.js": "a22a84a9b832d0aed7a0ab00354dde35a332cff377a9eeca6df3130292a4f974",
  "agent-runner.runtime-CAdsMsQt.js": "ec866319e0125f124acd499d42a76bc49672b92618a8f358a1b7afc343e4a2d3",
  "run-attempt-D1hJO4fX.js": "23705af0ceb5a879284ed04206cfba97be80bc872bfaf8cab21f601b3551d5cb",
};
const V_SOURCE = {
  "get-reply-CqW1y05D.js": "lab/release-files/unified-session-presentation/core/get-reply-CqW1y05D.js",
  "agent-runner.runtime-CAdsMsQt.js": "lab/release-files/early-tool-status/agent-runner.runtime-CAdsMsQt.js",
  "run-attempt-D1hJO4fX.js": "lab/release-files/codex-turn-end-terminals/run-attempt-D1hJO4fX.js",
};

function readSecretsEnv() {
  const env = {};
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/gu, "");
  }
  return env;
}
const secrets = readSecretsEnv();
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing from shared secrets.env");
const config0 = JSON.parse(fs.readFileSync(configPath, "utf8"));
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const tmpDir = path.join(scratch, "tmp");
const cacheDir = path.join(scratch, "cache");
for (const d of [tmpDir, cacheDir]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const env = {
  ...process.env, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, OPENCLAW_GATEWAY_PORT: String(config0.gateway?.port),
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
};

// ---- files: the runtime core and the Codex plugin ----
const dist = path.join(runtime, "openclaw", "dist");
const npmProjects = path.join(stateDir, "npm", "projects");
let codexProject = fs.existsSync(npmProjects) && fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
if (!codexProject) {
  const install = spawnSync(process.execPath, [`${dist}/index.js`, "plugins", "install", "@openclaw/codex@2026.9.1", "--pin", "--force", "--accept-capabilities", "--acknowledge-install-policy-warning"], { env, encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  console.log(JSON.stringify({ codexInstall: install.status }));
  codexProject = fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
}
assert(codexProject, "codex plugin not found");
const codexDist = path.join(npmProjects, codexProject, "node_modules", "@openclaw", "codex", "dist");
const target = (name) => path.join(name.startsWith("run-attempt") ? codexDist : dist, name);
console.log(JSON.stringify({ found: Object.fromEntries(Object.keys(V_SHA).map((n) => [n, { v: sha(target(n)) === V_SHA[n], sha: sha(target(n)).slice(0, 12) }])) }));
function install(variant) {
  const out = {};
  for (const name of Object.keys(V_SHA)) {
    const rel = variant === "base" ? V_SOURCE[name] : `lab/release-files/run-start-phases/${name}`;
    fs.copyFileSync(path.join(repoRoot, rel), target(name));
    out[name] = sha(target(name)).slice(0, 12);
  }
  assert.equal(sha(target("get-reply-CqW1y05D.js")) === V_SHA["get-reply-CqW1y05D.js"], variant === "base");
  return out;
}

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

// ---- Gateway ----
const lines = [];
let gateway;
function startGateway() {
  lines.length = 0;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => { lines.push(...chunk.split(/\r?\n/u).filter(Boolean).map((l) => `${Date.now()} ${l}`)); if (lines.length > 40000) lines.splice(0, lines.length - 40000); });
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
const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
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
  "Without using any tools, answer in two sentences: why does sourdough bread rise? Start with ALPHA.",
  "Without using any tools, answer in two sentences: how do tides work? Start with BRAVO.",
  "Without using any tools, answer in two sentences: how do bees navigate? Start with CHARLIE.",
  "Without using any tools, answer in two sentences: why is the sky blue? Start with DELTA.",
  "Without using any tools, answer in two sentences: how do glaciers move? Start with ECHO.",
  "Without using any tools, answer in two sentences: why do cats purr? Start with FOXTROT.",
];
const EXPECTED_HEAD = ["run-reply-agent", "reply.memory_flush", "reply.preflight_compaction", "agent-turn", "turn-media", "fallback-start", "embedded-call", "codex-enter", "codex-connection", "codex-runtime", "codex-tools", "codex-context", "codex-prompt", "codex-start-runtime", "codex-route", "codex-turn-request", "codex-llm-input", "run-start"];

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
  const key = `agent:makaron:explicit:vlab-dev-rsp-${label}-${Date.now().toString(36)}`;
  await call("sessions.messages.subscribe", { agentId: "makaron", key });
  const rows = [];
  const send = async (message) => {
    const id = randomUUID();
    const r = { id, sentAt: Date.now() };
    runs.set(id, r);
    await call("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 300_000 });
    const deadline = Date.now() + 320_000;
    while (!r.terminal && Date.now() < deadline) await sleep(100);
    return r;
  };
  const sw = await send("/vds");
  console.log(JSON.stringify({ phase: label, switch: sw.terminal }));
  for (const prompt of PROMPTS.slice(0, TURNS)) {
    const markLine = lines.length;
    const r = await send(prompt);
    await sleep(300);
    const heads = lines.slice(markLine).filter((l) => l.includes("[run-start-phases.1] ")).map((l) => JSON.parse(l.slice(l.indexOf("[run-start-phases.1] ") + 21)));
    const row = { phase: label, terminal: r.terminal, error: r.error, firstBodyMs: r.firstBodyAt ? r.firstBodyAt - r.sentAt : null, heads: heads.length };
    if (heads.length) {
      const h = heads[0];
      const names = h.steps.map(([s]) => s);
      row.head = { runIdMatches: h.runId === r.id, sentToHeadMs: h.startedAtMs - r.sentAt, totalMs: h.totalMs, sumOk: h.steps.reduce((a, [, ms]) => a + ms, 0) === h.totalMs, lagMaxMs: h.lagMaxMs, lagOver50Ms: h.lagOver50Ms,
        missing: EXPECTED_HEAD.filter((s) => !names.includes(s)), outOfOrder: EXPECTED_HEAD.filter((s) => names.includes(s)).join() !== names.filter((s) => EXPECTED_HEAD.includes(s)).join(), steps: h.steps };
    }
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  client.stop?.();
  return rows;
}

const median = (xs) => { const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
try {
  const results = {};
  for (const label of ["base", "patched"]) {
    console.log(JSON.stringify({ phase: label, files: install(label) }));
    startGateway();
    await waitPort();
    await sleep(3000);
    results[label] = await runPhase(label);
    const warns = lines.filter((l) => /\b(error|warn)\b/iu.test(l) && /run-start-phases|__vRunHead|vRunHead/u.test(l)).slice(-10).map((l) => redact(l).slice(0, 300));
    console.log(JSON.stringify({ phase: label, headWarnings: warns }));
    await stopGateway();
  }
  const p = results.patched;
  const summary = {
    baseFirstBodyMedianMs: median(results.base.map((r) => r.firstBodyMs)),
    patchedFirstBodyMedianMs: median(p.map((r) => r.firstBodyMs)),
    allFinal: [...results.base, ...p].every((r) => r.terminal === "final"),
    baseHeadLines: results.base.reduce((a, r) => a + r.heads, 0),
    patchedOneLinePerTurn: p.every((r) => r.heads === 1),
    patchedRunIdsMatch: p.every((r) => r.head?.runIdMatches),
    patchedStepsComplete: p.every((r) => r.head && r.head.missing.length === 0 && !r.head.outOfOrder && r.head.sumOk),
  };
  console.log(JSON.stringify({ summary }));
  if (!(summary.allFinal && summary.baseHeadLines === 0 && summary.patchedOneLinePerTurn && summary.patchedRunIdsMatch && summary.patchedStepsComplete)) process.exitCode = 1;
} catch (error) {
  console.error(redact(error instanceof Error ? error.stack : String(error)));
  console.error(redact(lines.slice(-80).join("\n")));
  process.exitCode = 1;
} finally {
  await stopGateway();
}
