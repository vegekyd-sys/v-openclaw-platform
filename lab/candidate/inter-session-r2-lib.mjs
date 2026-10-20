// Shared harness of the R2 inter-session candidates (docs/inter-session/design.md §10.5, WP13):
// lab/candidate/inter-session-{telegram,dingtalk,wecom,cross-channel}.mjs.
//
// What every one of them runs: V's bytes with the whole inter-session release laid over them by the
// plan's `files` (each with V's `before` sha256: core R1 + R2, the Feishu, Telegram, DingTalk and
// WeCom bridges, the three v-experience copies), the v-session-relay 2.0 plugin from the worktree
// (support inputs), V's workspace with the §8.5/§8.6 drafts (inter-session-workspace.mjs), the VLab
// Worker pool, and real DeepSeek model turns. Channels are the loopback fakes of this directory;
// Feishu (cross-channel only) is the VLab app in loopback-webhook mode with real outbound.
//
// Candidate-only harness changes (never part of the release, recorded in the summary):
//   - the trusted-runtime gate of the plugin loader lets the relocated channel plugins open their
//     ingress queue (as every channel candidate here does);
//   - DingTalk's hosts point at the fake open platform (inter-session-dingtalk.mjs);
//   - VSR_TEST_START_DELAY_MS (an engine test hook) widens the precheck→start window so a person's
//     message can land in it and the core admission guard answers BUSY (F3).
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as contracts from "../../apps/v-session-relay/plugin/core/contracts.js";

export { contracts };
export const SECRETS_FILE = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
export const SHARED_RUNTIME = "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime";
export const AGENT = "makaron";
export const MODELS = Object.freeze({ worker: "deepseek/deepseek-flash", vds: "deepseek/vds-deepseek-flash" });
export const RUNTIME_OF = Object.freeze({ worker: "vlab-worker", vds: "codex" });
export const PLUGIN_DIR = "apps/v-session-relay/plugin";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

const FEISHU_DIST = "npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist";
export const FEISHU_PLUGIN = FEISHU_DIST.replace(/\/dist$/u, "");
export const DINGTALK_PROJECT = "npm/projects/dingtalk-real-ai-dingtalk-connector-aa54111b45__openclaw-generation__g-7ae9583359ddbec0";
export const DINGTALK_PLUGIN = `${DINGTALK_PROJECT}/node_modules/@dingtalk-real-ai/dingtalk-connector`;
export const WECOM_PLUGIN = "extensions/wecom-openclaw-plugin";
const M = contracts.MARKERS;
/** Every runtime file the plans lay over V's bytes, with the marker it must carry. */
export const OVERLAY = Object.freeze([
  ["openclaw/dist/sessions-spawn-tool-1FQMTkIo.js", M.sessionsSendRelay],
  ["openclaw/dist/openclaw-tools-BODVdJQD.js", M.sessionsSendRelayTools],
  ["openclaw/dist/get-reply-CqW1y05D.js", M.interSessionExclusive],
  ["openclaw/dist/agent-runner.runtime-CAdsMsQt.js", M.interSessionExclusive],
  ["openclaw/dist/dispatch-from-config-DOJq_7CI.js", M.interSessionExclusive],
  ["openclaw/dist/task-registry-activity-DSlVVJwD.js", M.taskBridgeExtraSources],
  ["openclaw/dist/v-experience.js", M.experienceSessionKind],
  ["openclaw/dist/telegram-ingress-drain-factory-DJM2Jqrc.js", M.telegramBridge],
  ["openclaw/dist/bot-message-DC6p8sB3.js", M.telegramBridge],
  [`${FEISHU_DIST}/monitor.account-WFdlCDhR.js`, M.feishuBridge],
  [`${DINGTALK_PLUGIN}/dist/connection-DCvu-l09.mjs`, M.dingtalkBridge],
  [`${DINGTALK_PLUGIN}/dist/message-handler-BUoLSylZ.mjs`, M.dingtalkBridge],
  [`${DINGTALK_PLUGIN}/dist/v-experience.mjs`, M.experienceSessionKind],
  [`${WECOM_PLUGIN}/dist/src/monitor.js`, M.wecomBridge],
  [`${WECOM_PLUGIN}/dist/src/v-experience.mjs`, M.experienceSessionKind],
].map(([target, marker]) => Object.freeze({ target, marker })));

// ---------------------------------------------------------------- run context

export function createRun(name) {
  const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
  const configPath = process.env.OPENCLAW_CONFIG_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR;
  assert(runtime && configPath && stateDir, "candidate runtime environment is required");
  const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
  const tag = process.env.RUN_TAG ?? `${name.toUpperCase().replace(/[^A-Z]/gu, "").slice(0, 3)}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const T0 = Date.now();
  const secrets = new Set();
  const summary = {
    name, runTag: tag, candidateId: process.env.VLAB_CANDIDATE_ID ?? null, startedAt: new Date(T0).toISOString(),
    harness: {}, scenarios: {}, steps: [], notes: [], failures: [],
  };
  const redact = (s) => {
    let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]").replace(/bot\d+:[\w-]+/gu, "bot[redacted]");
    for (const v of secrets) if (v && v.length >= 8) out = out.replaceAll(v, "[redacted]");
    return out;
  };
  const since = () => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
  const ctx = {
    name, tag, T0, runtime, configPath, stateDir, data, secrets, summary, redact, since,
    dist: path.join(runtime, "openclaw", "dist"),
    step(label, extra = {}) {
      summary.steps.push({ at: since(), step: label, ...extra });
      console.error(`[${since()}] ${label} ${redact(JSON.stringify(extra)).slice(0, 600)}`);
    },
    note(text) { summary.notes.push(text); },
    scenario(id) {
      summary.scenarios[id] ??= { verdict: "pending", checks: [], evidence: {} };
      return summary.scenarios[id];
    },
    check(id, ok, what, detail) {
      const s = ctx.scenario(id);
      s.checks.push({ ok: Boolean(ok), what, ...(detail === undefined ? {} : { detail: clipJson(detail, 1500) }) });
      if (!ok) summary.failures.push(`${id}: ${what}`);
      return Boolean(ok);
    },
    evidence(id, key, value) { ctx.scenario(id).evidence[key] = clipJson(value, 5000); },
    readSecret(key) {
      if (!fs.existsSync(SECRETS_FILE)) return undefined;
      for (const line of fs.readFileSync(SECRETS_FILE, "utf8").split(/\r?\n/u)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
        if (m?.[1] === key) { const v = m[2].replace(/^["']|["']$/gu, ""); secrets.add(v); return v; }
      }
      return undefined;
    },
  };
  return ctx;
}

export function clipJson(value, max) {
  if (value === undefined) return undefined;
  let text;
  try { text = JSON.stringify(value); } catch { text = String(value); }
  if (text === undefined) return undefined;
  if (text.length <= max) return value;
  return `${text.slice(0, max)}…(${text.length})`;
}

/** Runs one scenario: its checks decide the verdict; a throw is a failure. */
export async function runScenario(ctx, id, fn) {
  const s = ctx.scenario(id);
  const t0 = Date.now();
  ctx.step(`${id}: start`);
  try {
    await fn(s);
  } catch (error) {
    s.error = ctx.redact(error?.stack ?? error).slice(0, 2500);
    ctx.summary.failures.push(`${id}: ${String(error?.message ?? error).slice(0, 300)}`);
  }
  s.secs = Math.round((Date.now() - t0) / 1000);
  s.verdict = s.error || s.checks.some((c) => !c.ok) ? "FAIL" : s.checks.length ? "PASS" : "EMPTY";
  ctx.step(`${id}: ${s.verdict}`, { secs: s.secs, failed: s.checks.filter((c) => !c.ok).map((c) => c.what) });
  return s;
}

// ---------------------------------------------------------------- bytes

/** The plan laid the release over V's bytes: every target carries its marker (the receipt has the shas). */
export function verifyOverlay(ctx) {
  const out = [];
  for (const { target, marker } of OVERLAY) {
    const bytes = fs.readFileSync(path.join(ctx.runtime, target));
    assert(bytes.includes(marker), `${target}: marker ${marker} missing (plan files not applied?)`);
    out.push({ target: target.split("/").slice(-2).join("/"), sha256: sha256(bytes).slice(0, 16) });
  }
  ctx.summary.overlay = out;
  return out;
}

/** Candidate-only: the relocated channel plugins have no official install record here. */
export function allowRelocatedPlugins(ctx, pluginIds) {
  const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
  const loaderFile = fs.readdirSync(ctx.dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(ctx.dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
  assert(loaderFile, "trusted-runtime gate not found");
  const src = fs.readFileSync(loaderFile, "utf8");
  const cond = pluginIds.map((id) => `pluginId !== ${JSON.stringify(id)}`).join(" && ");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", `record?.trustedOfficialInstall !== true && ${cond}`)));
  ctx.summary.harnessPatches = [...(ctx.summary.harnessPatches ?? []), { file: path.basename(loaderFile), what: `trusted-runtime gate allows ${pluginIds.join(", ")}`, before: sha256(src).slice(0, 16), after: sha256(fs.readFileSync(loaderFile)).slice(0, 16) }];
}

// ---------------------------------------------------------------- workspace

/** V's workspace + the §8.5/§8.6 drafts, before the Gateway ever starts (§13.9). */
export async function applyWorkspace(ctx) {
  const mod = await import(pathToFileURL(path.resolve("lab/candidate/inter-session-workspace.mjs")).href);
  const r = mod.applyInterSessionWorkspace({ inputsDir: path.resolve(".") });
  ctx.summary.workspace = { agent: r.agent, files: r.files.length, drafts: r.drafts.map((d) => d.name), drafted: r.files.filter((f) => f.drafted).map((f) => f.path) };
  return r;
}

// ---------------------------------------------------------------- config

/**
 * The candidate's private config. `channels` replaces config.channels; `channelPlugins` are the
 * plugin ids kept/enabled for them, `loadPaths` their plugin directories (absolute). The
 * v-session-relay plugin comes from the inputs. Everything not needed here is unloaded.
 */
export function writeConfig(ctx, { channels, channelPlugins = [], loadPaths = [], ownerAllowFrom = [], vds = false, bindings, pluginConfig = {}, mutate }) {
  const config = JSON.parse(fs.readFileSync(ctx.configPath, "utf8"));
  const port = Number(config.gateway?.port);
  assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
  const token = config.gateway?.auth?.token;
  ctx.secrets.add(token);
  config.channels = channels;
  const pluginDir = path.resolve(PLUGIN_DIR);
  const keep = new Set(["deepseek", "vlab-agent-worker-isolation", "codex", "v-session-relay", ...(vds ? ["openai"] : []), ...channelPlugins]);
  config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
  for (const id of channelPlugins) config.plugins.entries[id] = { ...(config.plugins.entries[id] ?? {}), enabled: true };
  config.plugins.entries["v-session-relay"] = { enabled: true, config: { ownerName: "Tianyi", ...pluginConfig } };
  if (Array.isArray(config.plugins.allow)) config.plugins.allow = [...new Set([...config.plugins.allow.filter((id) => keep.has(id)), ...channelPlugins, "v-session-relay"])];
  config.plugins.load = {
    ...(config.plugins.load ?? {}),
    paths: [
      ...(config.plugins.load?.paths ?? []).filter((p) => p.includes("deepseek-provider") || p.endsWith("/production-worker")),
      ...loadPaths,
      pluginDir,
    ],
  };
  config.commands = { ...(config.commands ?? {}), ownerAllowFrom };
  config.bindings = bindings ?? Object.keys(channels).map((ch) => ({ agentId: AGENT, match: { channel: ch } }));
  config.cron = { ...(config.cron ?? {}), enabled: false };
  if (config.agents.defaults.heartbeat) config.agents.defaults.heartbeat.every = "0m";
  if (config.tools?.web?.search) delete config.tools.web.search; // its provider plugin is not loaded
  // DeepSeek models of both harnesses (present in the VLab config; added if missing).
  const dsModels = config.models?.providers?.deepseek?.models;
  if (Array.isArray(dsModels)) {
    const flashShape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
    for (const [id, label] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) if (!dsModels.some((x) => x.id === id)) dsModels.push({ id, name: label, ...flashShape });
  }
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow)) for (const m of Object.values(MODELS)) if (!allow.includes(m)) allow.push(m);
  config.agents.defaults.model = { ...(config.agents.defaults.model ?? {}), primary: MODELS.worker, fallbacks: [] };
  if (config.agents.entries?.[AGENT]) config.agents.entries[AGENT].model = { primary: MODELS.worker, fallbacks: [] };
  const runtimes = {};
  for (const [h, model] of Object.entries(MODELS)) {
    const entry = config.agents.entries?.[AGENT]?.models?.[model] ?? config.agents.defaults.models?.[model];
    runtimes[h] = entry?.agentRuntime?.id ?? null;
  }
  ctx.summary.harness.modelRuntimes = runtimes;
  for (const [h, rt] of Object.entries(runtimes)) if ((h === "worker" || vds) && rt !== RUNTIME_OF[h]) ctx.note(`${h}: ${MODELS[h]} is configured for runtime ${rt}, expected ${RUNTIME_OF[h]}`);
  const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
  assert(workerPlugin, "candidate Worker plugin configuration is missing");
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 3, warmSpareWorkers: 0, gatewayConfigPath: ctx.configPath });
  mutate?.(config);
  {
    const rel = path.relative(ctx.stateDir, workerPlugin.workerConfigPath);
    assert(!rel.startsWith(".."), "candidate Worker config escaped state");
    const workerConfig = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, rel), "utf8")
      .replaceAll(process.env.VLAB_SHARED_STATE_DIR, ctx.stateDir)
      .replaceAll(SHARED_RUNTIME, ctx.runtime));
    workerConfig.channels = {}; // the Worker never opens channels; keep real credentials out of it
    if (workerConfig.cron) workerConfig.cron.enabled = false;
    workerConfig.commands = { ...(workerConfig.commands ?? {}), ownerAllowFrom };
    const wAllow = workerConfig.agents?.defaults?.modelPolicy?.allow;
    if (Array.isArray(wAllow)) for (const m of Object.values(MODELS)) if (!wAllow.includes(m)) wAllow.push(m);
    fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
    fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  }
  fs.writeFileSync(ctx.configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  ctx.summary.harness.plugins = Object.keys(config.plugins.entries).sort();
  ctx.summary.harness.ownerAllowFrom = ownerAllowFrom;
  if (vds) prepareVds(ctx, config);
  return { config, port, token };
}

/** vds: the shared managed npm plugins (Codex with V's /vds patches) and a DeepSeek provider for the agent's Codex home. */
function prepareVds(ctx, config) {
  const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
  if (!fs.existsSync(path.join(ctx.stateDir, "npm"))) assert.equal(spawnSync("cp", ["-a", sharedNpm, path.join(ctx.stateDir, "npm")]).status, 0, "copy managed npm plugins");
  const codexHome = path.join(config.agents.entries[AGENT].agentDir, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const tomlPath = path.join(codexHome, "config.toml");
  const toml = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, "utf8") : "";
  if (!toml.includes("[model_providers.deepseek]")) fs.writeFileSync(tomlPath, `${toml}\n[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------- Gateway

export class Gateway {
  constructor(ctx, { port, env = {} }) {
    this.ctx = ctx;
    this.port = port;
    this.lines = [];
    this.starts = 0;
    this.proc = null;
    this.shortTmp = `/tmp/.isr2-${process.pid}`;
    fs.mkdirSync(this.shortTmp, { recursive: true, mode: 0o700 });
    const cacheDir = path.join(ctx.data, "cache");
    fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
    this.env = {
      ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: this.shortTmp, XDG_CACHE_HOME: cacheDir,
      npm_config_cache: path.join(cacheDir, "npm"), ...env,
    };
    const key = ctx.readSecret("DEEPSEEK_API_KEY");
    assert(key, "DEEPSEEK_API_KEY missing from shared secrets.env");
    this.env.DEEPSEEK_API_KEY = key;
  }

  start() {
    this.starts += 1;
    this.startedAt = Date.now();
    const p = spawn(process.execPath, ["--max-old-space-size=4096", `${this.ctx.dist}/index.js`, "gateway", "--port", String(this.port)], { env: this.env, stdio: ["ignore", "pipe", "pipe"] });
    this.proc = p;
    for (const s of [p.stdout, p.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => {
        for (const line of chunk.split(/\r?\n/u).filter(Boolean)) this.lines.push({ at: Date.now(), pid: p.pid, line });
        if (this.lines.length > 60_000) this.lines.splice(0, this.lines.length - 60_000);
      });
    }
    this.ctx.step("gateway start", { start: this.starts, pid: p.pid });
    return p;
  }

  get alive() { return Boolean(this.proc && this.proc.exitCode === null && this.proc.signalCode === null); }

  async waitFor(predicate, ms, label) {
    for (const until = Date.now() + ms; Date.now() < until; await sleep(250)) {
      const value = await predicate();
      if (value) return value;
      if (!this.alive) {
        if (this.lines.some((l) => l.pid === this.proc.pid && /Restart OpenClaw so state migrations run|migration inputs changed during startup convergence/u.test(l.line))) {
          this.ctx.step("gateway restart after startup convergence");
          this.start();
          continue;
        }
        throw new Error(`Gateway exited (${this.proc.exitCode ?? this.proc.signalCode}) while waiting for ${label}\n${this.ctx.redact(this.lines.slice(-40).map((l) => l.line).join("\n"))}`);
      }
    }
    throw new Error(`timed out waiting for ${label}`);
  }

  logSince(at, re) { return this.lines.filter((l) => l.at >= at && re.test(l.line)).map((l) => `${new Date(l.at).toISOString().slice(11, 23)} ${this.ctx.redact(l.line).slice(0, 400)}`); }

  /** Process ids below the Gateway (Workers and their children). */
  descendants() {
    if (!this.proc?.pid) return [];
    let rows;
    try { rows = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" }).trim().split("\n").map((l) => l.trim().split(/\s+/u).map(Number)); } catch { return []; }
    const out = [];
    const walk = (pid) => { for (const [c, pp] of rows) if (pp === pid) { out.push(c); walk(c); } };
    walk(this.proc.pid);
    return out;
  }

  /** kill -9 the Gateway and everything below it, the way a crash under KillMode=control-group ends. */
  async kill9() {
    const pids = [this.proc.pid, ...this.descendants()];
    for (const pid of pids) { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
    for (let i = 0; i < 40 && this.alive; i += 1) await sleep(250);
    this.ctx.step("gateway killed -9", { pids: pids.length });
    return pids;
  }

  async stop() {
    if (!this.proc) return;
    const kids = this.descendants();
    if (this.alive) {
      this.proc.kill("SIGTERM");
      for (let i = 0; i < 60 && this.alive; i += 1) await sleep(250);
      if (this.alive) this.proc.kill("SIGKILL");
    }
    for (const pid of kids) { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
  }

  cleanup() { fs.rmSync(this.shortTmp, { recursive: true, force: true }); }
}

/** A Gateway RPC client that reconnects after a restart. */
export function createRpc(ctx, { port, token }) {
  let client = null;
  const connect = async () => {
    const { GatewayClient } = await import(pathToFileURL(`${ctx.dist}/plugin-sdk/gateway-runtime.js`).href);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("gateway connect timeout")), 60_000);
      client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read", "operator.write"], onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); } });
      client.start();
    });
  };
  const rpc = async (method, params, timeoutMs = 60_000) => {
    if (!client) await connect();
    return client.request(method, params, { timeoutMs });
  };
  rpc.reset = () => { try { client?.stop?.(); } catch { /* ignore */ } client = null; };
  return rpc;
}

// ---------------------------------------------------------------- ledger and transcripts

export function ledgerOf(ctx) {
  const dir = path.join(ctx.stateDir, "v-session-relay", "v2");
  const readDir = (sub) => {
    const d = path.join(dir, sub);
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((n) => n.endsWith(".json")).map((n) => { try { return JSON.parse(fs.readFileSync(path.join(d, n), "utf8")); } catch { return null; } }).filter(Boolean);
  };
  return {
    dir,
    sends: () => readDir("sends").sort((a, b) => a.createdAt - b.createdAt),
    batches: () => readDir("batches").sort((a, b) => a.createdAt - b.createdAt),
    runs: () => readDir("runs"),
    send: (id) => readDir("sends").find((r) => r.sendId === id) ?? null,
    batch: (id) => readDir("batches").find((r) => r.batchId === id) ?? null,
    disable: () => fs.writeFileSync(path.join(dir, "DISABLED"), "candidate control group\n"),
    enable: () => fs.rmSync(path.join(dir, "DISABLED"), { force: true }),
  };
}

/** Waits for the first send matching `pred` created at or after `since`. */
export async function waitSend(gw, ledger, since, pred, ms, label) {
  return gw.waitFor(() => ledger.sends().find((r) => r.createdAt >= since && pred(r)) ?? null, ms, label);
}

/** The compact form of a send record kept as evidence. */
export function sendEvidence(rec) {
  if (!rec) return null;
  return {
    sendId: rec.sendId, code: rec.code, mode: rec.mode, edge: rec.edge, depth: rec.depth, phase: rec.phase, attempt: rec.attempt,
    requester: rec.requester?.sessionKey, requesterRun: rec.requester?.runId, target: rec.target?.sessionKey, transport: rec.target?.transport, bridgeKey: rec.target?.bridgeKey,
    route: rec.target?.route ? { chatId: rec.target.route.chatId, chatType: rec.target.route.chatType, humans: rec.target.route.humans, label: rec.target.route.label } : null,
    principal: rec.principal, anchor: rec.request?.messageId ?? null, targetRun: rec.targetRun, batchId: rec.batchId,
    result: rec.result ? { text: String(rec.result.text ?? "").slice(0, 300), media: rec.result.media, noReply: rec.result.noReply, source: rec.result.source } : null,
    failure: rec.failure, createdAt: rec.createdAt,
    history: (rec.history ?? []).map((h) => `${new Date(h.at).toISOString().slice(11, 23)} ${h.phase}${h.note ? ` (${h.note})` : ""}`),
  };
}
export function batchEvidence(b) {
  if (!b) return null;
  return { batchId: b.batchId, phase: b.phase, members: b.members, sealedAt: b.sealedAt, createdAt: b.createdAt, wake: b.wake, requester: b.requester?.sessionKey };
}
/** Time of the first ledger history entry matching `re` ("<phase> <note>"). */
export const historyAt = (rec, re) => (rec?.history ?? []).find((h) => re.test(`${h.phase} ${h.note ?? ""}`))?.at ?? null;

const blockText = (b) => (typeof b === "string" ? b : b?.type === "text" ? b.text : "");
/** chat.history of a session as [{role, at, provenance, origin, tools, text}]. */
export async function transcript(rpc, sessionKey, limit = 80) {
  let res;
  try { res = await rpc("chat.history", { sessionKey, limit }, 60_000); } catch (e) { return { error: String(e?.message ?? e).slice(0, 300), items: [] }; }
  const items = (res?.messages ?? []).map((m) => {
    const content = m.content;
    const blocks = Array.isArray(content) ? content : [];
    const tools = blocks.filter((b) => b && /tool.?(call|use)/iu.test(String(b.type))).map((b) => b.name ?? b.toolName ?? "?");
    const prov = m.provenance ?? m.inputProvenance ?? m.__openclaw?.provenance ?? null;
    return {
      role: m.role, at: Number(m.timestamp ?? 0) || null,
      provenance: prov?.kind ?? null, origin: prov?.originSessionId ?? null,
      tools, toolName: m.toolName ?? null, model: m.model ?? null, provider: m.provider ?? null,
      text: (typeof content === "string" ? content : blocks.map(blockText).join(" ")).slice(0, 1500),
    };
  });
  return { items };
}

/** Tool names called by assistant messages in [from, to). */
export function toolsBetween(items, from, to = Infinity) {
  return items.filter((m) => m.role === "assistant" && (m.at ?? 0) >= from && (m.at ?? 0) < to).flatMap((m) => m.tools);
}

/** The sessions.list row of `key` (null when absent). */
export async function sessionRow(rpc, key) {
  const res = await rpc("sessions.list", {}, 60_000).catch(() => null);
  let hit = null;
  const walk = (v) => {
    if (hit || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (v.key === key || v.sessionKey === key) { hit = v; return; }
    for (const x of Object.values(v)) if (typeof x === "object") walk(x);
  };
  walk(res);
  return hit;
}

export async function sessionKeys(rpc) {
  const res = await rpc("sessions.list", {}, 60_000).catch(() => null);
  const keys = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if ((k === "key" || k === "sessionKey") && typeof x === "string") keys.push(x);
      else if (typeof x === "object") walk(x);
    }
  };
  walk(res);
  return [...new Set(keys)];
}

/** Disk guard on the candidate host (the task stops below 4 GB free). */
export function freeBytes(dir) {
  try { const s = fs.statfsSync(dir); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}

/** Gateway log lines that must never appear (DingTalk webhook fallbacks, refused connections, wedges, crashes). */
export const BAD_LOG_RE = /Invalid URL|ECONNREFUSED|restart recovery claim changed|TypeError|ReferenceError|SyntaxError|UnhandledPromiseRejection/u;

/** Prints the summary and sets the exit code; never prints secrets. */
export function finish(ctx) {
  const s = ctx.summary;
  s.endedAt = new Date().toISOString();
  s.totalSecs = Math.round((Date.now() - ctx.T0) / 1000);
  s.verdicts = Object.fromEntries(Object.entries(s.scenarios).map(([id, x]) => [id, x.verdict]));
  s.ok = s.failures.length === 0 && Object.values(s.scenarios).every((x) => x.verdict === "PASS");
  console.log(ctx.redact(JSON.stringify(s, null, 1)));
  process.exitCode = s.ok ? 0 : 1;
}
