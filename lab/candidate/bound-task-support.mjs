// Private candidate setup. Adapted from the accepted inter-session harness; mock Feishu only.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FakeFeishu } from "./feishu-fake-open-api.mjs";

// Synthetic candidate identities; never connected to a real Feishu account.
export const OWNER='ou_00000000000000000000000000000002', AGENT='makaron';
export const DM_CHAT='oc_00000000000000000000000000000002', GROUP_B='oc_00000000000000000000000000000003';
export const TENANT_KEY='candidate', CHAT_NAMES={[DM_CHAT]:'Candidate DM',[GROUP_B]:'Candidate group'};
const HARNESS_MODELS={worker:'deepseek/deepseek-flash',vds:'deepseek/vds-deepseek-flash'};
const RUNTIME_OF={worker:'vlab-worker',vds:'codex'};
const STEER_ENV={}, SECRETS_ENV='/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env';
const LEDGER_SUBDIR='feishu-task-presentation';
export const groupKey=id=>`agent:${AGENT}:feishu:group:${id}`;
export const dmKey=()=>`agent:${AGENT}:feishu:direct:${OWNER}`;
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

export async function prepareCandidate(opts = {}) {
  const harness = opts.harness ?? "worker";
  const envMode = opts.envMode ?? "v";
  const pluginMode = "absent";
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

  // This candidate has no live Feishu mode.
  const platformMode = "mock";
  // ---- Feishu: loopback webhook inbound
  const feishu = config.channels?.feishu;
  assert(feishu && typeof feishu.appId === "string" && typeof feishu.appSecret === "string", "VLab Feishu app credentials are not plain strings");
  addSecret(feishu.appSecret);
  let fake = null;
  if (platformMode === "mock") {
    fake = await new FakeFeishu({directory: path.join(data, "fake-feishu"), owner: OWNER, dmChat: DM_CHAT, chats: CHAT_NAMES}).start();
    opts.registerCleanup?.(async()=>{fake.server.closeAllConnections();await fake.close();});
    Object.assign(feishu, {appId: "cli_0000000000000000", appSecret: "isc-mock-not-a-credential", domain: fake.url, resolveSenderNames: false});
    delete feishu.accounts;
    notes.push("mock Feishu: loopback API, synthetic app credentials, real platform hosts blocked");
  }
  const webhook = { port: await freePort(), path: "/candidate/inter-session", token: `isc-${crypto.randomBytes(12).toString("hex")}`, key: crypto.randomBytes(16).toString("hex") };
  addSecret(webhook.token); addSecret(webhook.key);
  Object.assign(feishu, { enabled: true, connectionMode: "webhook", webhookHost: "127.0.0.1", webhookPort: webhook.port, webhookPath: webhook.path, verificationToken: webhook.token, encryptKey: webhook.key });
  const feishuDir = config.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu"));
  assert(feishuDir?.startsWith(runtime), "Feishu plugin must come from this private runtime");
  Object.assign(feishu,{dmPolicy:'open',allowFrom:['*'],groupPolicy:'open',groupAllowFrom:['*'],requireMention:false});
  config.channels = { feishu };
  config.cron = { ...(config.cron ?? {}), enabled: false };
  config.agents.defaults.heartbeat = { ...(config.agents.defaults.heartbeat ?? {}), every: "0m" };
  config.commands = { ...(config.commands ?? {}), ownerAllowFrom: [`feishu:${OWNER}`] };
  config.bindings = [{ agentId: AGENT, match: { channel: "feishu" } }];
  config.session={...(config.session??{}),agentToAgent:{...(config.session?.agentToAgent??{}),maxPingPongTurns:0}};
  config.tools={...(config.tools??{}),sessions:{...(config.tools?.sessions??{}),visibility:'all'}};
  if (config.tools?.web?.search) delete config.tools.web.search; // its provider plugin is not loaded here
  if (config.tools?.web?.fetch) delete config.tools.web.fetch;

  // ---- plugins: what the scenarios need, nothing that talks to shared services
  const keep = new Set(["feishu", "deepseek", "vlab-agent-worker-isolation", "codex", "openai"]);
  config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
  if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
  config.plugins.load.paths = config.plugins.load.paths.filter((p) => p.endsWith("/@openclaw/feishu") || p.includes("deepseek-provider") || p.endsWith("/production-worker"));
  const ledgerDir = path.join(stateDir, LEDGER_SUBDIR);
  // Select the already configured harness; never install a provider or alter shared config.
  const model=HARNESS_MODELS[harness],ds=config.models?.providers?.deepseek;
  const allow=config.agents.defaults.modelPolicy?.allow;
  if(Array.isArray(allow)&&!allow.includes(model))allow.push(model);
  const makaron=config.agents.entries[AGENT];
  makaron.model={...(makaron.model??{}),primary:model,fallbacks:[]};
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
  {
    const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
    if (!fs.existsSync(path.join(stateDir, "npm"))) assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
    const codexHome = path.join(makaron.agentDir, "codex-home");
    fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
    const tomlPath = path.join(codexHome, "config.toml");
    const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
    if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
    notes.push("private managed npm copied; DeepSeek provider in codex-home");
  }

  // ---- candidate-only allowance (as every Feishu candidate): the relocated Feishu plugin has no
  // official install record, so the trusted-runtime gate would refuse its ingress queue.
  const allowance = {};
  {
    const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
    const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
    assert(loaderFile, "trusted-runtime gate not found");
    const before = fs.readFileSync(loaderFile, "utf8");
    fs.writeFileSync(loaderFile, before.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && !["feishu","bound-task-candidate"].includes(pluginId)')));
    allowance.loader = { file: path.basename(loaderFile), before: sha256(before), after: sha256(fs.readFileSync(loaderFile)) };
  }

  const workspace = null;
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
    const shimDir=path.join(data,'no-live-cli');fs.mkdirSync(shimDir,{recursive:true});
    for(const name of ['lark-cli','lark'])fs.writeFileSync(path.join(shimDir,name),'#!/bin/sh\necho "Candidate: platform CLI disabled" >&2\nexit 126\n',{mode:0o700});
    env.PATH=shimDir+path.delimiter+env.PATH;

    // Never inherit a direct platform credential from the host's service environment.
    for (const key of Object.keys(env)) if (/^(FEISHU|LARK)_.*(SECRET|TOKEN|APP_ID|KEY)$/u.test(key)) delete env[key];

  }
  for (const k of Object.keys(STEER_ENV)) delete env[k];
  if (envMode === "v") Object.assign(env, STEER_ENV);
  if (!env.DEEPSEEK_API_KEY) env.DEEPSEEK_API_KEY = readSecretsEnv("DEEPSEEK_API_KEY");
  assert(env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY is not available");
  addSecret(env.DEEPSEEK_API_KEY);
  config.plugins.load.paths.push(path.join(runtime,'extensions','bound-task-candidate'));
  config.plugins.entries['bound-task-candidate']={enabled:true};
  if(Array.isArray(config.plugins.allow))config.plugins.allow.push('bound-task-candidate');
  fs.writeFileSync(configPath,JSON.stringify(config,null,2),{mode:0o600});
  env.V_FEISHU_TASK_PRESENTATION='1';
  for (const [k, v] of Object.entries(opts.extraEnv ?? {})) env[k] = String(v);

  return new Candidate({ runtime, configPath, stateDir, data, dist, config, port, gatewayToken, feishu, webhook, env, ledgerDir, harness, envMode, pluginMode, model, notes, allowance, workspace, shortTmp, fake, platformMode });
}

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
        for (const line of chunk.split(/\r?\n/u).filter(Boolean)) {this.lines.push({ at: Date.now(), boot, line });fs.appendFileSync(path.join(this.data,"gateway-log.jsonl"),JSON.stringify({boot,line:redact(line)})+"\n");}
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
        onEvent:e=>this.onEvent?.(e), onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); },
      });
      this.client.start();
    });
  }

  async rpc(method, params, timeoutMs = 30_000) {
    if (!this.client) await this.resetClient();
    return this.client.request(method, params, { timeoutMs });
  }

  async inject({ chatId, chatType, sender = OWNER, text, messageId, mentionBot = false }) {
    this.eventSeq += 1;
    const id = messageId ?? `om_isce2e_${Date.now().toString(36)}_${this.eventSeq}_${crypto.randomBytes(3).toString("hex")}`;
    const mentions = [];
    let content = text;
    if (mentionBot) {
      const bot = this.fake.bot;
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


}
