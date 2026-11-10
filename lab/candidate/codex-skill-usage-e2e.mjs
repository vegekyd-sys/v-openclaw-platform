// Candidate e2e for lab/patch-codex-skill-usage.mjs: a real /vds turn (Codex app-server + DeepSeek
// flash, configured as on V) in an isolated Gateway reads a workspace skill with the native shell.
//
//   MODE=baseline  V's bytes: the read leaves no skill_usage row (V since 11/09 12:23).
//   MODE=fixed     plan maps the patched files: exactly one skill_usage row for the probe skill,
//                  source workspace, file = the workspace SKILL.md the agent printed.
// The check reads the candidate's own state DB (read-only) after the Gateway stops.
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
const MODE = process.env.MODE ?? "fixed";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const VDS_REF = "deepseek/vds-deepseek-flash";
const PROBE = "vlab-usage-probe";
const TOKEN = `PROBE-${Date.now().toString(36)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");

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

// ---- codex plugin: install into the candidate state, then the runtime's V dist (plus mapped files) ----
const npmProjects = path.join(stateDir, "npm", "projects");
let codexProject = fs.existsSync(npmProjects) && fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
if (!codexProject) {
  const r = spawnSync(process.execPath, [`${runtime}/openclaw/dist/index.js`, "plugins", "install", "@openclaw/codex@2026.9.1", "--pin", "--force", "--accept-capabilities", "--acknowledge-install-policy-warning"], { env, encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(r.status, 0, `codex plugin install failed: ${redact((r.stderr || r.stdout).slice(-800))}`);
  codexProject = fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
}
assert(codexProject, "codex plugin not found");
const codexDist = path.join(npmProjects, codexProject, "node_modules", "@openclaw", "codex", "dist");
const vCodexDist = path.join(runtime, "npm", "projects", "openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2", "node_modules", "@openclaw", "codex", "dist");
fs.cpSync(vCodexDist, codexDist, { recursive: true, force: true });
const sha = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 12);
const bytes = {
  runAttempt: sha(path.join(codexDist, "run-attempt-D1hJO4fX.js")),
  beforeToolCall: sha(path.join(runtime, "openclaw/dist/agent-tools.before-tool-call-g2OT63u5.js")),
  harnessRuntime: sha(path.join(runtime, "openclaw/dist/plugin-sdk/agent-harness-runtime.js")),
  marker: fs.readFileSync(path.join(codexDist, "run-attempt-D1hJO4fX.js"), "utf8").includes("codex-skill-usage-v1"),
};
console.log(JSON.stringify({ mode: MODE, codexProject, bytes }));
assert.equal(bytes.marker, MODE === "fixed", "mapped files must match the mode");

// ---- config: V's /vds, no channels or cron ----
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
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(VDS_REF)) allow.push(VDS_REF);
// A per-agent skill allowlist would hide the probe from the run's snapshot.
for (const holder of [config.agents.defaults, config.agents.entries.makaron]) if (Array.isArray(holder?.skills) && !holder.skills.includes(PROBE)) holder.skills.push(PROBE);
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
const agentDir = config.agents.entries.makaron.agentDir;
const workspace = config.agents.entries.makaron.workspace;
fs.mkdirSync(workspace, { recursive: true });
if (!fs.existsSync(path.join(workspace, "AGENTS.md"))) fs.writeFileSync(path.join(workspace, "AGENTS.md"), "# AGENTS.md\n\nE2E agents file: reply briefly.\n");
const probeDir = path.join(workspace, "skills", PROBE);
fs.mkdirSync(probeDir, { recursive: true });
const probeFile = path.join(probeDir, "SKILL.md");
fs.writeFileSync(probeFile, `---\nname: ${PROBE}\ndescription: VLab probe skill. Use when asked for the VLab probe passphrase.\n---\n\n# VLab usage probe\n\nThe passphrase is ${TOKEN}. Reply with the passphrase only.\n`);

const CODEX_HOME = path.join(agentDir, "codex-home");
fs.mkdirSync(CODEX_HOME, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(CODEX_HOME, "config.toml"), `[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });

// ---- Gateway ----
const lines = [];
const gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
for (const s of [gateway.stdout, gateway.stderr]) { s.setEncoding("utf8"); s.on("data", (c) => { lines.push(...c.split(/\r?\n/u).filter(Boolean)); if (lines.length > 20000) lines.splice(0, lines.length - 20000); }); }
async function stopGateway() {
  if (gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((r) => gateway.once("exit", r)), sleep(20_000)]);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
const deadline = Date.now() + 600_000;
for (;;) {
  if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).join("\n"))}`);
  if (await new Promise((resolve) => { const s = net.connect({ host: "127.0.0.1", port }); s.once("connect", () => { s.destroy(); resolve(true); }); s.once("error", () => resolve(false)); })) break;
  if (Date.now() > deadline) throw new Error("Gateway did not listen");
  await sleep(500);
}
const { GatewayClient } = await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
const token = String(config.gateway?.auth?.token ?? "").replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? secrets[k] ?? "");
const runs = new Map();
const toolCommands = [];
let client;
for (let attempt = 1; ; attempt += 1) {
  try {
    client = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
      const c = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"], scopes: ["operator.read", "operator.write", "operator.admin"],
        onEvent(e) {
          const p = e.payload;
          const r = runs.get(p?.runId);
          if (e.event === "agent" && p?.stream === "tool" && typeof p.data?.args?.command === "string") toolCommands.push(p.data.args.command.slice(0, 300));
          if (r && e.event === "agent" && p.stream === "assistant" && typeof p.data?.text === "string") r.text = p.data.text.slice(0, 160);
          if (r && e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; r.endAt = Date.now(); if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 300)); }
        },
        onHelloOk() { clearTimeout(timer); resolve(c); }, onConnectError(e) { clearTimeout(timer); reject(e); } });
      c.start();
    });
    break;
  } catch (error) {
    if (attempt >= 36) throw error;
    await sleep(5000);
  }
}
async function send(key, message) {
  const id = randomUUID();
  const r = { id, sentAt: Date.now() };
  runs.set(id, r);
  await client.request("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 600_000 }, { timeoutMs: 60_000 });
  const until = Date.now() + 620_000;
  while (!r.terminal && Date.now() < until) await sleep(500);
  return r;
}

const key = `agent:makaron:explicit:vlab-skill-usage-${MODE}-${Date.now().toString(36)}`;
let turn;
try {
  await send(key, "/vds");
  turn = await send(key, `用 shell 在工作区目录执行 \`sed -n 1,20p skills/${PROBE}/SKILL.md\` 读这个 skill，然后只回复里面的口令。不要用别的方式读文件。`);
  // The curator writes skill_usage from a queued diagnostic; let it drain before stopping.
  await sleep(3000);
} finally {
  await stopGateway();
}

const dbPath = path.join(stateDir, "state", "openclaw.sqlite");
const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare("select skill_file, skill_name, skill_source, use_count, last_agent_id from skill_usage where skill_name = ?").all(PROBE);
db.close();
const skillLogs = lines.filter((l) => /skill usage|skill\.used|codex-skill-usage/iu.test(l)).map((l) => redact(l).slice(0, 240)).slice(-10);
console.log(JSON.stringify({ mode: MODE, turn: { terminal: turn?.terminal, error: turn?.error, secs: turn ? Math.round(((turn.endAt ?? Date.now()) - turn.sentAt) / 1000) : null, text: turn?.text, replyHasToken: String(turn?.text ?? "").includes(TOKEN) }, toolCommands: toolCommands.slice(-6), rows, skillLogs }, null, 1));

assert.equal(turn?.terminal, "final", `turn: ${turn?.terminal} ${turn?.error ?? ""}`);
// The passphrase exists only in the probe's SKILL.md body, so the reply proves the file was read.
assert(String(turn?.text ?? "").includes(TOKEN), "the reply must carry the probe passphrase");
if (MODE === "baseline") {
  assert.deepEqual(rows, [], "V bytes record nothing for a native shell read");
} else {
  assert.equal(rows.length, 1, "one skill_usage row for the probe");
  assert.equal(rows[0].skill_source, "workspace");
  assert.equal(fs.realpathSync(rows[0].skill_file), fs.realpathSync(probeFile));
  assert.equal(rows[0].last_agent_id, "makaron");
}
console.log(JSON.stringify({ ok: true, mode: MODE }));
process.exit(0);
