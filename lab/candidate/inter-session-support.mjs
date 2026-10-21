// Shared machinery for the inter-session end-to-end candidates (docs/inter-session/design.md §10.2, §10.3).
//
// Two halves, one file:
//
//   Inside a candidate (vlab.mjs candidate, runs on vlab91 as lab-db91-parity):
//     prepareCandidate()   rewrites the private config copy: Feishu = loopback webhook inbound + the
//                          real VLab app outbound (never a second long connection), Feishu as the only
//                          channel, cron and heartbeats off, owner = Tianyi's open_id under the VLab
//                          app, the v-session-relay plugin from the plan's `files` (or disabled / absent
//                          for the control groups), the harness model as the agent's model, and V's
//                          workspace copy (applyInterSessionWorkspace) BEFORE the Gateway first starts,
//                          so 9.1 never writes BOOTSTRAP.md (design §13.9).
//     Candidate            private Gateway start / stop / kill -9 (whole process group, like systemd's
//                          control-group kill on V) / restart; env "v" (VLAB_FEISHU_STEER_ENABLED=1,
//                          VLAB_FEISHU_STEER_CHAT_IDS=*, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1) or
//                          "vlab" (those three removed); Gateway RPC; signed + encrypted
//                          im.message.receive_v1 injection into the loopback webhook; a bot-posted seed
//                          message when a simulated human turn in a group needs a real message id to
//                          reply to (never posted as Tianyi); ledger and transcript readers;
//                          requester_tail_ms.
//   On the Mac (after a run, or while it runs):
//     readChat()           the owner's view of a chat through the Mac's lark-cli (user identity,
//                          read-only GET /open-apis/im/v1/messages), with server create/update times in ms.
//
// Product patches are never applied here: core, Feishu bridge and plugin bytes arrive through the
// plan's `files` mapping with `before` sha256 (the receipt records them); checkRuntimeFiles() only
// confirms the runtime carries what the plan says. The candidate-only allowance every Feishu
// candidate needs (the trusted-runtime gate for the relocated Feishu plugin) is recorded with sha256.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FakeFeishu } from "./feishu-fake-open-api.mjs";

// ------------------------------------------------------------------ fixed identities (VLab app)
export const OWNER = "ou_775a78b0aaae67da5e15eeaf102e3cd9"; // Tianyi under the VLab app (cli_aae2…)
export const OWNER_NAME = "Tianyi";
export const DM_CHAT = "oc_8f28eb6bcb3b847471693f066dac61c4"; // Tianyi ↔ V - Lab
export const GROUP_B = "oc_5afced473a29eb6f5fed3ba9966aa9ff"; // 「VLab 发布验收 B」
export const ROOMS = Object.freeze(["oc_fe63730f4bc817cd46ccd325ab990a74", "oc_c7074487c880fb9792a663750b2f22ba", "oc_a14d4ff92e03b4d52420ef20e56eaba6"]);
export const CHAT_NAMES = Object.freeze({
  [DM_CHAT]: "Tianyi 私聊", [GROUP_B]: "VLab 发布验收 B",
  [ROOMS[0]]: "VLab 测试｜房间 1", [ROOMS[1]]: "VLab 测试｜房间 2", [ROOMS[2]]: "VLab 测试｜房间 3",
});
export const SECOND_USER = "ou_isce2e00000000000000000000000b0b"; // a made-up non-owner (F4b)
export const TENANT_KEY = "13205dde5ccfd75d"; // the VLab tenant (not a secret; in every message header)
export const AGENT = "makaron";
export const dmKey = (openId = OWNER) => `agent:${AGENT}:feishu:direct:${openId}`;
export const groupKey = (chatId) => `agent:${AGENT}:feishu:group:${chatId}`;
export const HARNESS_MODELS = Object.freeze({ worker: "deepseek/deepseek-flash", vds: "deepseek/vds-deepseek-flash", vcc: "anthropic/claude-opus-5-5" }); // vcc = V's alias (claude-opus-5-5, claude-cli)
export const RUNTIME_OF = Object.freeze({ worker: "vlab-worker", vds: "codex", vcc: "claude-cli" });
export const BROKEN_MODEL = "deepseek/isc-e2e-no-such-model"; // F10: allowed by config, refused by DeepSeek
export const STEER_ENV = Object.freeze({ VLAB_FEISHU_STEER_ENABLED: "1", VLAB_FEISHU_STEER_CHAT_IDS: "*", CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1" });
export const SECRETS_ENV = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
export const LEDGER_SUBDIR = path.join("v-session-relay", "v2");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
export const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
export const newRunTag = (prefix = "ISC") => `${prefix}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

const SECRET_VALUES = new Set();
export const addSecret = (v) => { if (typeof v === "string" && v.length >= 8) SECRET_VALUES.add(v); };
export function redact(s) {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password|encrypt.?key)(["']?\s*[=:]\s*["']?)[^\s"',}]+/giu, "$1$2[redacted]");
  for (const v of SECRET_VALUES) out = out.split(v).join("[redacted]");
  return out;
}

export function readSecretsEnv(name, file = SECRETS_ENV) {
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/** Polls `fn` until it returns a truthy value; returns it, or throws after `timeoutMs`. */
export async function until(fn, { timeoutMs = 60_000, intervalMs = 1_000, label = "condition" } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s waiting for ${label}`);
    await sleep(intervalMs);
  }
}
/** Like until() but returns null instead of throwing on timeout. */
export async function maybeUntil(fn, opts) {
  try { return await until(fn, opts); } catch (e) { if (/^timed out/u.test(e.message)) return null; throw e; }
}

// ------------------------------------------------------------------ runtime bytes the plan claims
/** The runner already refused a `before` mismatch; this confirms the bytes on disk are the plan's. */
export function checkRuntimeFiles(runtime, expectations) {
  const out = expectations.map(({ target, sha }) => {
    const p = path.join(runtime, target);
    const have = fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null;
    return { target, expected: sha, actual: have, ok: have === sha };
  });
  const bad = out.filter((x) => !x.ok);
  assert.equal(bad.length, 0, `runtime bytes differ from the plan: ${JSON.stringify(bad)}`);
  return out;
}

// ------------------------------------------------------------------ candidate preparation
/**
 * opts: harness (worker|vds|vcc), envMode (v|vlab), plugin ("on" | "off" = configured with
 * enabled:false | "absent"), pluginConfig, workerGuard, workspace (default true), extraEnv, maxWorkers.
 */
export async function prepareCandidate(opts = {}) {
  const harness = opts.harness ?? "worker";
  const envMode = opts.envMode ?? "v";
  const pluginMode = opts.plugin ?? "on";
  assert(HARNESS_MODELS[harness], `unknown harness ${harness}`);
  assert(["v", "vlab"].includes(envMode), `envMode must be v or vlab, got ${envMode}`);
  const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
  const configPath = process.env.OPENCLAW_CONFIG_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR;
  const data = process.env.VLAB_CANDIDATE_DATA;
  assert(runtime && configPath && stateDir && data, "candidate runtime environment is required");
  const dist = path.join(runtime, "openclaw", "dist");
  const notes = [];
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const port = Number(config.gateway?.port);
  assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
  const gatewayToken = config.gateway?.auth?.token;
  addSecret(gatewayToken);

  // Default to a local platform. Live sends require a separate, explicit opt-in.
  const platformMode = process.env.ISC_FEISHU_MODE ?? "mock";
  assert(["mock", "live"].includes(platformMode), "ISC_FEISHU_MODE must be mock or live");
  assert(platformMode !== "live" || process.env.ISC_ALLOW_LIVE_FEISHU === "1", "live Feishu sends require ISC_ALLOW_LIVE_FEISHU=1");
  // ---- Feishu: loopback webhook inbound
  const feishu = config.channels?.feishu;
  assert(feishu && typeof feishu.appId === "string" && typeof feishu.appSecret === "string", "VLab Feishu app credentials are not plain strings");
  addSecret(feishu.appSecret);
  let fake = null;
  if (platformMode === "mock") {
    fake = await new FakeFeishu({directory: path.join(data, "fake-feishu"), owner: OWNER, dmChat: DM_CHAT, chats: CHAT_NAMES}).start();
    Object.assign(feishu, {appId: "cli_isc_mock", appSecret: "isc-mock-not-a-credential", domain: fake.url, resolveSenderNames: false});
    delete feishu.accounts;
    notes.push("mock Feishu: loopback API, synthetic app credentials, real platform hosts blocked");
  }
  const webhook = { port: await freePort(), path: "/candidate/inter-session", token: `isc-${crypto.randomBytes(12).toString("hex")}`, key: crypto.randomBytes(16).toString("hex") };
  addSecret(webhook.token); addSecret(webhook.key);
  Object.assign(feishu, { enabled: true, connectionMode: "webhook", webhookHost: "127.0.0.1", webhookPort: webhook.port, webhookPath: webhook.path, verificationToken: webhook.token, encryptKey: webhook.key });
  const feishuDir = config.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu"));
  assert(feishuDir?.startsWith(runtime), "Feishu plugin must come from this private runtime");
  config.channels = { feishu };
  config.cron = { ...(config.cron ?? {}), enabled: false };
  config.agents.defaults.heartbeat = { ...(config.agents.defaults.heartbeat ?? {}), every: "0m" };
  config.commands = { ...(config.commands ?? {}), ownerAllowFrom: [`feishu:${OWNER}`] };
  config.bindings = [{ agentId: AGENT, match: { channel: "feishu" } }];
  if (config.tools?.web?.search) delete config.tools.web.search; // its provider plugin is not loaded here
  if (config.tools?.web?.fetch) delete config.tools.web.fetch;

  // ---- plugins: what the scenarios need, nothing that talks to shared services
  const keep = new Set(["feishu", "deepseek", "vlab-agent-worker-isolation", "codex", "openai", ...(harness === "vcc" ? ["anthropic"] : [])]);
  config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
  if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
  config.plugins.load.paths = config.plugins.load.paths.filter((p) => p.endsWith("/@openclaw/feishu") || p.includes("deepseek-provider") || p.endsWith("/production-worker"));
  const pluginDir = path.join(runtime, "extensions", "v-session-relay");
  const ledgerDir = path.join(stateDir, LEDGER_SUBDIR);
  if (pluginMode !== "absent") {
    assert(fs.existsSync(path.join(pluginDir, "index.js")), "plugin 2.0 is not in this runtime: map apps/v-session-relay/plugin through the plan's files");
    config.plugins.load.paths.push(pluginDir);
    if (Array.isArray(config.plugins.allow)) config.plugins.allow.push("v-session-relay");
    config.plugins.entries["v-session-relay"] = {
      enabled: pluginMode === "on",
      config: { ownerName: OWNER_NAME, workerGuard: opts.workerGuard === true, ...(opts.pluginConfig ?? {}) },
    };
  }

  // ---- models: the harness model for the agent; F10's broken model is allowed but refused upstream
  const model = HARNESS_MODELS[harness];
  const ds = config.models?.providers?.deepseek;
  if (Array.isArray(ds?.models)) {
    const flash = ds.models.find((x) => x.id === "deepseek-flash") ?? ds.models[0];
    for (const id of ["deepseek-flash", "vds-deepseek-flash", BROKEN_MODEL.split("/")[1]]) {
      if (!ds.models.some((x) => x.id === id)) ds.models.push({ ...structuredClone(flash), id, name: id });
    }
  }
  const allow = config.agents.defaults.modelPolicy?.allow;
  for (const m of [model, BROKEN_MODEL]) if (Array.isArray(allow) && !allow.includes(m)) allow.push(m);
  const makaron = config.agents.entries[AGENT];
  // V's /vcc is anthropic/claude-opus-5-5; shared VLab's config still names claude-opus-5 (its vcc).
  // Same runtime (claude-cli) and params, V's model id.
  makaron.models ??= {};
  if (harness === "vcc" && !makaron.models[model]) {
    const src = makaron.models?.["anthropic/claude-opus-5"] ?? config.agents.defaults.models?.["anthropic/claude-opus-5"];
    assert(src, "no anthropic/claude-opus-5 entry to derive V's vcc model from");
    makaron.models[model] = structuredClone(src);
    if (config.agents.defaults.models && !config.agents.defaults.models[model]) config.agents.defaults.models[model] = structuredClone(config.agents.defaults.models["anthropic/claude-opus-5"] ?? src);
    for (const entry of [makaron.models["anthropic/claude-opus-5"], config.agents.defaults.models?.["anthropic/claude-opus-5"]]) if (entry?.alias === "vcc") delete entry.alias;
    notes.push(`vcc: ${model} derived from anthropic/claude-opus-5 (runtime ${makaron.models[model].agentRuntime?.id})`);
  }
  makaron.model = { ...(makaron.model ?? {}), primary: model, fallbacks: [] };
  makaron.models ??= {};
  const { alias: _alias, ...harnessModelEntry } = structuredClone(makaron.models[model] ?? {});
  makaron.models[BROKEN_MODEL] = harnessModelEntry;
  if (harness === "vds") delete makaron.models[BROKEN_MODEL].params?.codexAppServerRuntimeModel;
  const runtimeId = makaron.models[model]?.agentRuntime?.id ?? config.agents.defaults.models?.[model]?.agentRuntime?.id ?? ds?.agentRuntime?.id ?? null;
  if (runtimeId !== RUNTIME_OF[harness]) notes.push(`${harness}: ${model} is configured for runtime ${runtimeId}, expected ${RUNTIME_OF[harness]}`);

  // ---- worker pool (the Worker plugin derives each worker's config from this file, probe F-a)
  const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
  assert(workerPlugin, "candidate Worker plugin configuration is missing");
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: Number(opts.maxWorkers ?? 4), warmSpareWorkers: 0, gatewayConfigPath: configPath });
  {
    const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
    assert(!rel.startsWith(".."), "candidate Worker config escaped state");
    const workerConfig = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, rel), "utf8")
      .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
      .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
    workerConfig.channels = {}; // the Worker never opens channels; keep credentials out of it
    if (workerConfig.cron) workerConfig.cron.enabled = false;
    workerConfig.commands = { ...(workerConfig.commands ?? {}), ownerAllowFrom: config.commands.ownerAllowFrom };
    fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
    fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

  // ---- vds: the shared managed npm plugins (Codex with V's /vds patches) + DeepSeek in codex-home
  if (harness === "vds") {
    const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
    if (!fs.existsSync(path.join(stateDir, "npm"))) assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
    const codexHome = path.join(makaron.agentDir, "codex-home");
    fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
    const tomlPath = path.join(codexHome, "config.toml");
    const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
    if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
    notes.push("vds: shared managed npm copied; DeepSeek provider in codex-home");
  }

  // ---- candidate-only allowance (as every Feishu candidate): the relocated Feishu plugin has no
  // official install record, so the trusted-runtime gate would refuse its ingress queue.
  const allowance = {};
  if (process.env.ISC_ENABLE_SILENT_PROBE === '1') {
    const file = path.join(pluginDir, 'core', 'requests.js');
    const before = fs.readFileSync(file, 'utf8');
    const anchor = '    channelPromptContext = requestContext({ code: rec.code, from, fromKey: rec.requester.sessionKey, rootName, depth: rec.depth, maxDepth, via: from });';
    assert.equal(before.split(anchor).length, 2);
    // The product correctly tells models not to be silent. A negative transport
    // test must explicitly permit the NO_REPLY stimulus, only for its F9 target.
    const after = before.replace(anchor, anchor + `\n    if (/-F9\\b/u.test(rec.message.text)) channelPromptContext = channelPromptContext.replace("不要 NO_REPLY，不要 message.send 后 NO_REPLY", "这是沉默结果容错测试：本轮必须只回复 NO_REPLY，不附加标签或说明");`);
    fs.writeFileSync(file, after);
    allowance.silentProbe = {file:'v-session-relay/core/requests.js',before:sha256(before),after:sha256(after),purpose:'candidate-only F9 silent-output stimulus; other requests unchanged'};
  }
  if (process.env.ISC_ENABLE_ADMISSION_RACE === "1") {
    const file = path.join(dist, "agent-runner.runtime-CAdsMsQt.js");
    const before = fs.readFileSync(file, "utf8");
    const anchor = "async function runReplyAgent(params) {\n";
    assert.equal(before.split(anchor).length, 2, "candidate guard-gap seam must be unique");
    const hook = `\t// Candidate-only barrier after get-reply admission, before runReplyAgent decisions.
\tif (process.env.ISC_GUARD_GAP_FILE && params.opts?.vInterSession?.kind === "request") {
\t\tconst fs = await import("node:fs");
\t\tconst file = process.env.ISC_GUARD_GAP_FILE;
\t\tif (!fs.existsSync(file)) {
\t\t\tfs.writeFileSync(file, JSON.stringify({sessionKey: params.sessionKey, runId: params.opts?.runId}));
\t\t\tconst until = Date.now() + 60000;
\t\t\twhile (!fs.existsSync(file + ".release")) {
\t\t\t\tif (Date.now() > until) throw new Error("candidate guard-gap release timed out");
\t\t\t\tawait new Promise(r => setTimeout(r, 25));
\t\t\t}
\t\t\tfs.writeFileSync(file + ".observed", JSON.stringify({active: params.isRunActive?.() === true}));
\t\t}
\t}
`;
    const after = before.replace(anchor, anchor + hook);
    fs.writeFileSync(file, after);
    allowance.admissionRace = {file: path.basename(file), before: sha256(before), after: sha256(after), purpose: "candidate-only admission-to-run barrier"};
    const admissionFile = path.join(dist, 'get-reply-CqW1y05D.js');
    const admissionBefore = fs.readFileSync(admissionFile, 'utf8');
    const admissionAnchor = 'async function prepareReplyRunAdmission(context) {\n';
    assert.equal(admissionBefore.split(admissionAnchor).length, 2);
    const admissionHook = `\tif (process.env.ISC_FORCE_ADMISSION_BUSY === "1" && context.opts?.vInterSession?.kind === "request") {
\t\tconst fs = await import("node:fs");
\t\tconst file = process.env.VLAB_CANDIDATE_DATA + "/admission-busy-barrier";
\t\tif (!fs.existsSync(file)) {
\t\t\tfs.writeFileSync(file, "entered-admission");
\t\t\tconst until = Date.now() + 60000;
\t\t\twhile (!fs.existsSync(file + ".release")) {
\t\t\t\tif (Date.now() > until) throw new Error("candidate admission-busy barrier timed out");
\t\t\t\tawait new Promise(r => setTimeout(r, 25));
\t\t\t}
\t\t}
\t}
`;
    const admissionAfter = admissionBefore.replace(admissionAnchor, admissionAnchor + admissionHook);
    fs.writeFileSync(admissionFile, admissionAfter);
    allowance.admissionBusy = {file:path.basename(admissionFile),before:sha256(admissionBefore),after:sha256(admissionAfter),purpose:'candidate-only pre-admission active-run race'};

  }
  {
    const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
    const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
    assert(loaderFile, "trusted-runtime gate not found");
    const before = fs.readFileSync(loaderFile, "utf8");
    fs.writeFileSync(loaderFile, before.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "feishu"')));
    allowance.loader = { file: path.basename(loaderFile), before: sha256(before), after: sha256(fs.readFileSync(loaderFile)) };
  }

  // ---- V's workspace copy, before the Gateway ever starts (design §13.9)
  let workspace = null;
  if (opts.workspace !== false) {
    const { applyInterSessionWorkspace } = await import("./inter-session-workspace.mjs");
    fs.mkdirSync(makaron.workspace, { recursive: true });
    workspace = applyInterSessionWorkspace({ agent: AGENT });
  }

  // ---- Gateway environment
  const shortTmp = `/tmp/.isc-${process.pid}`;
  fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
  const cacheDir = path.join(data, "cache");
  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm") };
  if (fake) {
    env.NODE_EXTRA_CA_CERTS = fake.certFile;
    const guard = fileURLToPath(new URL("./feishu-no-live.cjs", import.meta.url));
    env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require=${guard}`.trim();
    env.ISC_BLOCKED_PLATFORM_LOG = path.join(data, 'blocked-platform.jsonl');
    // Never inherit a direct platform credential from the host's service environment.
    for (const key of Object.keys(env)) if (/^(FEISHU|LARK)_.*(SECRET|TOKEN|APP_ID|KEY)$/u.test(key)) delete env[key];
    const {prepareLarkShim} = await import("./inter-session-workspace.mjs");
    const shim = prepareLarkShim({dataDir: data, pool: ROOMS, pathEnv: env.PATH});
    Object.assign(env, shim.env);
  }
  for (const k of Object.keys(STEER_ENV)) delete env[k];
  if (envMode === "v") Object.assign(env, STEER_ENV);
  if (!env.DEEPSEEK_API_KEY) env.DEEPSEEK_API_KEY = readSecretsEnv("DEEPSEEK_API_KEY");
  assert(env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY is not available");
  addSecret(env.DEEPSEEK_API_KEY);
  for (const [k, v] of Object.entries(opts.extraEnv ?? {})) env[k] = String(v);

  return new Candidate({ runtime, configPath, stateDir, data, dist, config, port, gatewayToken, feishu, webhook, env, ledgerDir, harness, envMode, pluginMode, model, notes, allowance, workspace, shortTmp, fake, platformMode });
}

// ------------------------------------------------------------------ the private Gateway
export class Candidate {
  constructor(o) {
    Object.assign(this, o);
    this.lines = [];
    this.gateway = null;
    this.starts = 0;
    this.client = null;
    this.eventSeq = 0;
    this.tenantToken = null;
    this.botOpenId = null;
  }

  get feishuBase() {
    const d = this.feishu.domain;
    if (!d || d === "feishu") return "https://open.feishu.cn";
    if (d === "lark") return "https://open.larksuite.com";
    return String(d).replace(/\/+$/u, "");
  }

  startGateway(extraEnv = {}) {
    this.starts += 1;
    const env = { ...this.env };
    for (const [k, v] of Object.entries(extraEnv)) { if (v === null || v === undefined) delete env[k]; else env[k] = String(v); }
    const child = spawn(process.execPath, ["--max-old-space-size=4096", path.join(this.dist, "index.js"), "gateway", "--port", String(this.port)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    const boot = this.starts;
    for (const s of [child.stdout, child.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => {
        for (const line of chunk.split(/\r?\n/u).filter(Boolean)) this.lines.push({ at: Date.now(), boot, line });
        if (this.lines.length > 60_000) this.lines.splice(0, this.lines.length - 60_000);
      });
    }
    this.gateway = child;
    return child;
  }

  /** Starts the Gateway; waits for the webhook, the Feishu bridge and (plugin "on") the plugin. */
  async start({ extraEnv = {}, timeoutMs = 600_000 } = {}) {
    const mark = this.lines.length;
    const startedAt = Date.now();
    this.startGateway(extraEnv);
    const need = [/starting Webhook server on 127\.0\.0\.1/u];
    if (this.patchedBridge !== false) need.push(/inter-session bridge registered as feishu:default/u);
    if (this.pluginMode === "on") need.push(/v-session-relay 2\.0 started/u);
    const seen = new Set();
    await until(async () => {
      for (const l of this.lines.slice(mark)) for (const [i, re] of need.entries()) if (re.test(l.line)) seen.add(i);
      const g = this.gateway;
      if (g.exitCode !== null || g.signalCode) {
        const migrate = this.lines.slice(mark).some((l) => /Restart OpenClaw so state migrations run|migration inputs changed during startup convergence/u.test(l.line));
        if (migrate && this.starts < 6) { this.startGateway(extraEnv); return false; }
        throw new Error(`Gateway exited ${g.exitCode ?? g.signalCode} during start\n${redact(this.lines.slice(-60).map((l) => l.line).join("\n"))}`);
      }
      return seen.size === need.length;
    }, { timeoutMs, intervalMs: 250, label: `Gateway ready (${need.map((r) => r.source.slice(0, 30)).join(" | ")})` });
    await this.resetClient();
    return { readyMs: Date.now() - startedAt, pid: this.gateway.pid };
  }

  async stop() {
    try { this.client?.stop(); } catch { /* ignore */ }
    this.client = null;
    const g = this.gateway;
    if (!g || g.exitCode !== null || g.signalCode) return;
    try { process.kill(-g.pid, "SIGTERM"); } catch { /* gone */ }
    for (let i = 0; i < 40 && g.exitCode === null && !g.signalCode; i++) await sleep(250);
    if (g.exitCode === null && !g.signalCode) { try { process.kill(-g.pid, "SIGKILL"); } catch { /* gone */ } }
    await sleep(500);
  }

  /** kill -9 of the Gateway's whole process group (Gateway + workers), as systemd does on V. */
  async kill9() {
    try { this.client?.stop(); } catch { /* ignore */ }
    this.client = null;
    const g = this.gateway;
    const at = Date.now();
    try { process.kill(-g.pid, "SIGKILL"); } catch { /* gone */ }
    await until(() => g.exitCode !== null || g.signalCode, { timeoutMs: 15_000, intervalMs: 100, label: "Gateway gone after SIGKILL" });
    await sleep(1_000);
    return { killedAt: at, pid: g.pid, signal: g.signalCode };
  }

  /** Waits for a Gateway that exits on its own (VSR_CRASH_AT), then clears its process group. */
  async waitExit(timeoutMs) {
    const g = this.gateway;
    await until(() => g.exitCode !== null || g.signalCode, { timeoutMs, intervalMs: 250, label: "Gateway exit" });
    const at = Date.now();
    try { process.kill(-g.pid, "SIGKILL"); } catch { /* group already gone */ }
    try { this.client?.stop(); } catch { /* ignore */ }
    this.client = null;
    await sleep(1_000);
    return { exitCode: g.exitCode, signal: g.signalCode, at };
  }

  async resetClient() {
    try { this.client?.stop(); } catch { /* ignore */ }
    this.client = null;
    const { GatewayClient } = await import(path.join(this.dist, "plugin-sdk", "gateway-runtime.js"));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("gateway connect timeout")), 60_000);
      this.client = new GatewayClient({
        url: `ws://127.0.0.1:${this.port}`, token: this.gatewayToken, deviceIdentity: null, clientName: "cli", mode: "cli",
        scopes: ["operator.admin", "operator.read", "operator.write"],
        onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); },
      });
      this.client.start();
    });
  }

  async rpc(method, params, timeoutMs = 30_000) {
    if (!this.client) await this.resetClient();
    return this.client.request(method, params, { timeoutMs });
  }

  // ---------------------------------------------------------------- logs
  mark() { return this.lines.length; }
  logSince(mark, re, max = 80) {
    return this.lines.slice(mark).filter((l) => re.test(l.line)).slice(-max).map((l) => `${iso(l.at).slice(11, 23)} ${redact(l.line).slice(0, 500)}`);
  }

  // ---------------------------------------------------------------- Feishu (real VLab app; outbound only)
  async feishuApi(method, pathname, { query, body } = {}) {
    if (this.fake) return this.fake.handle(method, pathname, body ?? {}, new URLSearchParams(query));
    if (!this.tenantToken || this.tenantToken.until < Date.now()) {
      const r = await fetch(`${this.feishuBase}/open-apis/auth/v3/tenant_access_token/internal`, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ app_id: this.feishu.appId, app_secret: this.feishu.appSecret }) });
      const j = await r.json();
      assert.equal(j.code, 0, `tenant token: ${j.msg}`);
      addSecret(j.tenant_access_token);
      this.tenantToken = { value: j.tenant_access_token, until: Date.now() + (Number(j.expire ?? 7200) - 300) * 1000 };
    }
    const url = new URL(`${this.feishuBase}${pathname}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const r = await fetch(url, { method, headers: { authorization: `Bearer ${this.tenantToken.value}`, "content-type": "application/json; charset=utf-8" }, body: body ? JSON.stringify(body) : undefined });
    return r.json().catch(() => ({ code: -1, msg: `http ${r.status}` }));
  }

  async botInfo() {
    if (!this.botOpenId) {
      const j = await this.feishuApi("GET", "/open-apis/bot/v3/info");
      assert.equal(j.code, 0, `bot info: ${j.msg}`);
      this.botOpenId = j.bot?.open_id;
    }
    return this.botOpenId;
  }

  async chatInfo(chatId) {
    const j = await this.feishuApi("GET", `/open-apis/im/v1/chats/${chatId}`);
    return j.code === 0 ? { name: j.data?.name, userCount: Number(j.data?.user_count), botCount: Number(j.data?.bot_count), ownerId: j.data?.owner_id, chatMode: j.data?.chat_mode } : { error: `${j.code} ${j.msg}` };
  }

  /** A visible, bot-posted seed for a simulated human turn in a group to reply to (never as Tianyi). */
  async seedMessage(chatId, text) {
    const j = await this.feishuApi("POST", "/open-apis/im/v1/messages", { query: { receive_id_type: "chat_id" }, body: { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }), uuid: `isc-seed-${crypto.randomBytes(8).toString("hex")}` } });
    assert.equal(j.code, 0, `seed message: ${j.code} ${j.msg}`);
    return { messageId: j.data.message_id, createMs: Number(j.data.create_time) };
  }

  /**
   * One signed, AES-encrypted im.message.receive_v1 through the loopback webhook, as Feishu sends it.
   * chatType "p2p" | "group". Without messageId a made-up om_ id is used (fine in a DM: replies there
   * never quote the message).
   */
  async inject({ chatId, chatType, sender = OWNER, text, messageId, mentionBot = false }) {
    this.eventSeq += 1;
    const id = messageId ?? `om_isce2e_${Date.now().toString(36)}_${this.eventSeq}_${crypto.randomBytes(3).toString("hex")}`;
    const mentions = [];
    let content = text;
    if (mentionBot) {
      const bot = await this.botInfo();
      mentions.push({ key: "@_user_1", id: { open_id: bot }, name: "V - Lab", tenant_key: TENANT_KEY });
      content = `@_user_1 ${text}`;
    }
    const now = Date.now();
    const envelope = {
      schema: "2.0",
      header: { event_id: crypto.randomUUID().replaceAll("-", ""), token: this.webhook.token, create_time: String(now), event_type: "im.message.receive_v1", tenant_key: TENANT_KEY, app_id: this.feishu.appId },
      event: {
        sender: { sender_id: { open_id: sender }, sender_type: "user", tenant_key: TENANT_KEY },
        message: { message_id: id, chat_id: chatId, chat_type: chatType, message_type: "text", content: JSON.stringify({ text: content }), create_time: String(now), ...(mentions.length ? { mentions } : {}) },
      },
    };
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", crypto.createHash("sha256").update(this.webhook.key).digest(), iv);
    const body = JSON.stringify({ encrypt: Buffer.concat([iv, cipher.update(JSON.stringify(envelope), "utf8"), cipher.final()]).toString("base64") });
    const timestamp = String(Math.floor(now / 1000));
    const nonce = crypto.randomBytes(8).toString("hex");
    const signature = sha256(timestamp + nonce + this.webhook.key + body);
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: this.webhook.port, path: this.webhook.path, method: "POST", headers: { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "x-lark-request-timestamp": timestamp, "x-lark-request-nonce": nonce, "x-lark-signature": signature } }, (r) => {
        let out = "";
        r.setEncoding("utf8");
        r.on("data", (c) => { out += c; });
        r.on("end", () => resolve({ status: r.statusCode, body: out.slice(0, 200) }));
      });
      req.on("error", reject);
      req.end(body);
    });
    assert.equal(res.status, 200, `webhook refused the event: ${JSON.stringify(res)}`);
    return { messageId: id, at: now, chatId, chatType, sender };
  }

  /** Tianyi types in the DM. */
  dm(text) { return this.inject({ chatId: DM_CHAT, chatType: "p2p", sender: OWNER, text }); }

  /** A human types in a group: the bot first posts a visible test seed, the event quotes it. */
  async humanInGroup(chatId, { text, sender = OWNER, seedText }) {
    const seed = await this.seedMessage(chatId, seedText ?? `【测试·模拟真人消息】${text}`);
    const ev = await this.inject({ chatId, chatType: "group", sender, text, messageId: seed.messageId });
    return { ...ev, seed };
  }

  // ---------------------------------------------------------------- sessions
  async ensureSession(key, { label, model = this.model } = {}) {
    const params = { key, agentId: AGENT, ...(model ? { model } : {}), ...(label ? { label } : {}) };
    try { await this.rpc("sessions.patch", params); return { key, ok: true }; }
    catch (e) {
      if (label) { try { await this.rpc("sessions.patch", { key, agentId: AGENT, ...(model ? { model } : {}) }); return { key, ok: true, labelRefused: redact(e?.message ?? e).slice(0, 160) }; } catch { /* fall through */ } }
      return { key, ok: false, error: redact(e?.message ?? e).slice(0, 200) };
    }
  }

  async sessionEntry(key) {
    // sessions.list is a UI projection and omits canonical delivery.kind. Read the
    // private candidate's native entry rather than interpreting that omission as data loss.
    const sdk = await import(path.join(this.dist, 'plugin-sdk', 'session-store-runtime.js'));
    const entry = sdk.getSessionEntry({agentId:AGENT,sessionKey:key,env:this.env});
    if (!entry) return null;
    const selected = Object.fromEntries(['sessionId','label','subject','delivery','chatType','model','modelProvider','systemSent'].filter(k => entry[k] !== undefined).map(k => [k,entry[k]]));
    return JSON.parse(redact(JSON.stringify(selected)));
  }

  /** chat.history reduced to what the assertions read: roles, provenance, text, tool calls/results. */
  async history(sessionKey, limit = 80) {
    const res = await this.rpc("chat.history", { sessionKey, limit }).catch((e) => ({ error: e.message }));
    if (res?.error) return { error: redact(res.error) };
    return (res?.messages ?? []).flatMap(reduceMessages);
  }

  // ---------------------------------------------------------------- ledger (read-only)
  ledger() {
    const read = (sub) => {
      const dir = path.join(this.ledgerDir, sub);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => { try { return JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")); } catch { return null; } }).filter(Boolean);
    };
    return { sends: read("sends"), batches: read("batches"), chains: read("chains"), runs: read("runs"), disabled: fs.existsSync(path.join(this.ledgerDir, "DISABLED")) };
  }
  sendsWhere(pred) { return this.ledger().sends.filter(pred).sort((a, b) => a.createdAt - b.createdAt); }
  batch(batchId) { return this.ledger().batches.find((b) => b.batchId === batchId) ?? null; }
  chain(chainId) { return this.ledger().chains.find((c) => c.chainId === chainId) ?? null; }
  setDisabled(on) {
    const f = path.join(this.ledgerDir, "DISABLED");
    fs.mkdirSync(this.ledgerDir, { recursive: true });
    if (on) fs.writeFileSync(f, `candidate ${new Date().toISOString()}\n`); else fs.rmSync(f, { force: true });
  }

  /**
   * Lines of OpenClaw's JSON file logs (Gateway and Worker children) matching `re`. The console
   * line drops a log call's meta (e.g. the fallback's error text); the file log keeps it. With
   * /tmp/openclaw owned by root, 9.1 writes to <TMPDIR>/openclaw-<uid>/openclaw-<date>.log.
   */
  fileLogGrep(re, max = 20) {
    const out = [];
    const walk = (dir, depth) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory() && depth < 6 && !["node_modules", "npm", "workspace", "agents", "media"].includes(e.name)) walk(p, depth + 1);
        else if (e.isFile() && /^openclaw(?:-[a-z0-9-]+)?-\d{4}-\d{2}-\d{2}\.log$/u.test(e.name)) {
          for (const line of fs.readFileSync(p, "utf8").split("\n")) if (re.test(line)) out.push(redact(line).slice(0, 1500));
        }
      }
    };
    for (const root of new Set([this.shortTmp, this.stateDir, this.data])) walk(root, 0);
    return out.slice(-max);
  }

  async cleanup() { if (this.fake) await this.fake.close(); fs.rmSync(this.shortTmp, { recursive: true, force: true }); }
}

// ------------------------------------------------------------------ transcripts
// Text blocks, plus the text inside a tool result block: the codex harness (vds) stores a tool's
// output as a toolResult message whose content is one "toolResult" block, not a text block.
const textOfContent = (content) => (typeof content === "string" ? content : Array.isArray(content) ? content.map((b) => {
  if (b?.type === "text") return b.text;
  if (isToolResultBlock(b)) return textOfContent(b.content) || (typeof b.text === "string" ? b.text : "") || (typeof b.output === "string" ? b.output : "");
  return "";
}).filter(Boolean).join("\n") : "");
// claude-cli transcripts (9.1 cli-session-history.claude) store tool calls as "toolcall" / "tool_use"
// blocks named "mcp__openclaw__<tool>" for OpenClaw tools, and their results as "tool_result" blocks
// inside a message instead of a toolResult message.
const isToolCallBlock = (b) => ["toolcall", "tool_call", "tooluse", "tool_use"].includes(String(b?.type ?? "").toLowerCase());
const isToolResultBlock = (b) => ["toolresult", "tool_result"].includes(String(b?.type ?? "").toLowerCase());
export const toolNameOf = (name) => String(name ?? "").replace(/^mcp__openclaw__/u, "");

/** One transcript message → its reduced form, plus one toolResult entry per embedded tool_result block. */
export function reduceMessages(m) {
  const main = reduceMessage(m);
  if (!Array.isArray(m?.content) || m?.role === "toolResult") return [main];
  const names = new Map(m.content.filter(isToolCallBlock).map((b) => [b.id, toolNameOf(b.name)]));
  const extra = m.content.filter(isToolResultBlock).map((b) => ({
    role: "toolResult", at: main.at, atMs: main.atMs, toolName: toolNameOf(b.name ?? names.get(b.tool_use_id ?? b.toolUseId ?? b.toolCallId) ?? ""),
    text: redact(textOfContent(b.content) || (typeof b.text === "string" ? b.text : "")).slice(0, 800), embedded: true,
  }));
  return [main, ...extra];
}

export function reduceMessage(m) {
  const tools = Array.isArray(m?.content) ? m.content.filter(isToolCallBlock).map((b) => {
    let args = b.arguments ?? b.input ?? {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = { raw: args }; } }
    const cmd = typeof args.command === "string" ? args.command : typeof args.cmd === "string" ? args.cmd : undefined;
    const name = toolNameOf(b.name);
    return {
      name, ...(cmd ? { command: redact(cmd).slice(0, 240) } : {}),
      ...(/sessions_(send|history)|session_status/u.test(name) ? { sessionKey: args.sessionKey ?? args.label, timeoutSeconds: args.timeoutSeconds, message: redact(String(args.message ?? "")).slice(0, 400) } : {}),
      ...(args.background !== undefined ? { background: args.background } : {}),
    };
  }) : [];
  const prov = m?.provenance ?? m?.inputProvenance ?? m?.__openclaw?.inputProvenance;
  return {
    role: m?.role, at: m?.timestamp ? iso(Number(m.timestamp)) : undefined, atMs: m?.timestamp ? Number(m.timestamp) : undefined,
    ...(prov ? { provenance: { kind: prov.kind, originSessionId: prov.originSessionId, sourceSessionKey: prov.sourceSessionKey } } : {}),
    ...(m?.toolName ? { toolName: toolNameOf(m.toolName) } : {}),
    text: redact(textOfContent(m?.content)).slice(0, m?.role === "toolResult" ? 800 : 1500),
    ...(tools.length ? { tools } : {}),
    ...(Array.isArray(m?.content) && m.content.some((b) => b?.type !== "text") ? { blocks: m.content.map((b) => `${b?.type}${isToolResultBlock(b) ? `{${Object.keys(b).join(",")}}` : ""}`).slice(0, 12) } : {}),
  };
}
export const toolCalls = (hist) => (Array.isArray(hist) ? hist.flatMap((m) => (m.tools ?? []).map((t) => ({ ...t, at: m.at, atMs: m.atMs }))) : []);

export function requesterToolCalls(hist, fromMs, toMs) {
  const wake = hist.findIndex(m => m.provenance?.kind === 'inter_session' && String(m.provenance.originSessionId ?? '').includes(':wake:'));
  const initial = wake >= 0 ? hist.slice(0, wake) : hist;
  return toolCalls(initial.filter(m => m.atMs >= fromMs - 2000 && m.atMs <= toMs));
}
export const SLEEP_RE = /\bsleep\s+\d|\btimeout\s+\d{2,}|while\b[^;]*;\s*do\b[\s\S]*\bsleep\b/u;

export function interjectionProof({owner, user, userAfterResult, resultText = ''}) {
  const absorbedInResult = resultText.includes('插话已收到');
  const steered = absorbedInResult || Boolean(user && userAfterResult === false);
  return {absorbedInResult, steered, handled: Boolean(user) || Boolean(owner && absorbedInResult), nonOwnerIsolated: owner || (!absorbedInResult && userAfterResult === true)};
}

// Prove that the collected wake's result contains all three actual outputs, not a
// generic overlap with a room's text or the coordinator's earlier "started" reply.
export function summaryProof({tag, result, wakeRunId, rooms}) {
  const outputs = ['a', 'b', 'c'].map((suffix, i) => {
    const match = (rooms[i]?.result?.text ?? '').match(new RegExp(`${tag}-${suffix}\\s*=\\s*(\\d+)`, 'u'));
    return match ? {code: `${tag}-${suffix}`, value: match[1]} : null;
  });
  const carries = outputs.map(x => Boolean(x && new RegExp(`${x.code}\\s*=\\s*${x.value}(?!\\d)`, 'u').test(result?.text ?? '')));
  const answersCorrect = outputs[0]?.value === '323' && outputs[1]?.value === '667' && /^\d{10}$/u.test(outputs[2]?.value ?? '');
  return {ok: Boolean(wakeRunId) && result?.fromRunId === wakeRunId && answersCorrect && carries.every(Boolean), fromRunId: result?.fromRunId ?? null, wakeRunId, outputs, carries, answersCorrect};
}

// ------------------------------------------------------------------ requester_tail_ms (§8.7.4)
/** The batch is sealed when the requester run's lifecycle end reaches the Gateway. */
export function requesterTailMs(send, batch) {
  if (!send || !batch?.sealedAt) return null;
  return batch.sealedAt - send.createdAt;
}
export function tailStats(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const q = (p) => v[Math.min(v.length - 1, Math.round(p * (v.length - 1)))];
  return { n: v.length, min: v[0], p50: q(0.5), p90: q(0.9), max: v.at(-1), under60s: v.filter((x) => x < 60_000).length, values: v };
}

// ------------------------------------------------------------------ owner readback (Mac only)
/**
 * The owner's view of a chat: GET /open-apis/im/v1/messages as the user through the Mac's lark-cli
 * (read-only). Messages created in [startMs, endMs], server times in ms.
 */
export function readChat(chatId, startMs, endMs = Date.now() + 60_000, { larkCli = "lark-cli" } = {}) {
  const items = [];
  let pageToken = "";
  for (let page = 0; page < 40; page++) {
    const params = { container_id_type: "chat", container_id: chatId, start_time: String(Math.floor(startMs / 1000)), end_time: String(Math.ceil(endMs / 1000)), sort_type: "ByCreateTimeAsc", page_size: 50, ...(pageToken ? { page_token: pageToken } : {}) };
    const r = spawnSync(larkCli, ["api", "GET", "/open-apis/im/v1/messages", "--as", "user", "--params", JSON.stringify(params)], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    let j;
    try { j = JSON.parse(r.stdout); } catch { throw new Error(`lark-cli readback failed for ${chatId}: ${String(r.stderr).slice(0, 300)}`); }
    if (!j.ok) throw new Error(`lark-cli readback failed for ${chatId}: ${JSON.stringify(j).slice(0, 300)}`);
    for (const it of j.data?.items ?? []) items.push(normalizeMessage(it));
    if (!j.data?.has_more || !j.data?.page_token) break;
    pageToken = j.data.page_token;
  }
  return items.filter((m) => m.createMs >= startMs && m.createMs <= endMs);
}

export function normalizeMessage(it) {
  return {
    id: it.message_id, chat: it.chat_id, type: it.msg_type, createMs: Number(it.create_time), updateMs: Number(it.update_time),
    parentId: it.parent_id || null, rootId: it.root_id || null, threadId: it.thread_id || null,
    senderType: it.sender?.sender_type, senderId: it.sender?.id, deleted: Boolean(it.deleted), updated: Boolean(it.updated),
    text: messageText(it.msg_type, it.body?.content),
  };
}

/** Plain text of a text / post / interactive body as the user API returns it. */
export function messageText(type, content) {
  if (typeof content !== "string") return "";
  let c;
  try { c = JSON.parse(content); } catch { return content; }
  if (type === "text") return String(c.text ?? "");
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) { for (const y of x) walk(y); return; }
    if (!x || typeof x !== "object") return;
    for (const k of ["title", "text", "content"]) if (typeof x[k] === "string" && x[k].trim()) out.push(x[k]);
    for (const v of Object.values(x)) if (v && typeof v === "object") walk(v);
  };
  walk(c);
  return [...new Set(out)].join("\n");
}

/**
 * One readback assertion over the owner's view of a chat (see inter-session-feishu.mjs for the
 * specs it builds). kinds: message (by id: includesAll / includesAny / excludesAll), count (from/to,
 * senderType, textRe, startsWithAny; equals/min/max), replies (parentId), after (messages after an
 * anchor), orphans (interactive bot cards not replying to an allowed parent), everText (seen in a
 * watch snapshot), reactions (bot reactions left on a message). ok: true | false | null (unknown).
 */
export function evalReadbackCheck(spec, msgs, watchIndex, { readReactions = defaultReadReactions } = {}) {
  const inRange = (m) => (!Number.isFinite(spec.from) || m.createMs >= spec.from) && (!Number.isFinite(spec.to) || m.createMs <= spec.to);
  const sender = (m) => !spec.senderType || m.senderType === spec.senderType;
  const re = spec.textRe ? new RegExp(spec.textRe, "u") : null;
  const starts = (m) => !spec.startsWithAny || spec.startsWithAny.some((p) => m.text.trimStart().startsWith(p));
  const bound = (n) => (spec.equals === undefined || n === spec.equals) && (spec.min === undefined || n >= spec.min) && (spec.max === undefined || n <= spec.max);
  switch (spec.kind) {
    case "message": {
      const m = msgs.find((x) => x.id === spec.messageId);
      if (!m) return { ok: false, detail: `message ${spec.messageId} not found` };
      const ok = (spec.includesAll ?? []).every((t) => m.text.includes(t)) && (!spec.includesAny?.length || spec.includesAny.some((t) => m.text.includes(t))) && !(spec.excludesAll ?? []).some((t) => m.text.includes(t));
      return { ok, detail: { at: iso(m.createMs), updated: m.updated, text: m.text.slice(0, 300) } };
    }
    case "count": {
      const hits = msgs.filter((m) => inRange(m) && sender(m) && (!re || re.test(m.text.trimStart())) && starts(m));
      return { ok: bound(hits.length), detail: { n: hits.length, hits: hits.slice(0, 6).map((m) => `${iso(m.createMs).slice(11, 23)} ${m.type} ${m.text.slice(0, 80)}`) } };
    }
    case "replies": {
      const hits = msgs.filter((m) => m.parentId === spec.parentId && sender(m) && (!Number.isFinite(spec.createdAfter) || m.createMs > spec.createdAfter));
      return { ok: bound(hits.length), detail: { n: hits.length, hits: hits.slice(0, 4).map((m) => `${iso(m.createMs).slice(11, 23)} ${m.type} ${m.text.slice(0, 80)}`) } };
    }
    case "after": {
      const anchor = msgs.find((m) => m.id === spec.afterId);
      if (!anchor) return { ok: false, detail: `anchor ${spec.afterId} not found` };
      const ex = spec.excludeTextRe ? new RegExp(spec.excludeTextRe, "u") : null;
      const hits = msgs.filter((m) => m.createMs >= anchor.createMs && m.id !== anchor.id && sender(m) && (!spec.types || spec.types.includes(m.type)) && (!ex || !ex.test(m.text.trimStart())) && (!Number.isFinite(spec.to) || m.createMs <= spec.to));
      return { ok: bound(hits.length), detail: { n: hits.length, hits: hits.slice(0, 4).map((m) => `${iso(m.createMs).slice(11, 23)} ${m.type} ${m.text.slice(0, 80)}`) } };
    }
    case "orphans": {
      const allowed = new Set(spec.allowedParents.filter(Boolean));
      const orphans = msgs.filter((m) => inRange(m) && m.senderType === "app" && m.type === "interactive" && !allowed.has(m.parentId));
      return { ok: orphans.length === 0, detail: orphans.map((m) => `${iso(m.createMs)} ${m.id} parent=${m.parentId}`) };
    }
    case "everText": {
      const snaps = watchIndex?.get(spec.chat) ?? [];
      const seen = snaps.filter((m) => (!spec.messageId || m.id === spec.messageId) && (!Number.isFinite(spec.from) || m.createMs >= spec.from) && (!Number.isFinite(spec.to) || m.createMs <= spec.to) && (spec.includesAll ?? []).every((t) => m.text.includes(t)));
      if (!snaps.length) return { ok: null, detail: "no watch snapshots" };
      return { ok: seen.length > 0, detail: seen.slice(0, 2).map((m) => `${iso(m.seenAt)} ${m.text.slice(0, 120)}`) };
    }
    case "reactions": {
      const n = readReactions(spec.messageId);
      if (n === null) return { ok: null, detail: "reactions unreadable" };
      return { ok: n === (spec.equals ?? 0), detail: { botReactions: n } };
    }
    default: return { ok: false, detail: `unknown check kind ${spec.kind}` };
  }
}

function defaultReadReactions(messageId) {
  const r = spawnSync("lark-cli", ["api", "GET", `/open-apis/im/v1/messages/${messageId}/reactions`, "--as", "user"], { encoding: "utf8" });
  let j;
  try { j = JSON.parse(r.stdout); } catch { return null; }
  if (!j.ok) return null;
  return (j.data?.items ?? []).filter((x) => x.operator?.operator_type === "app").length;
}
