// Candidate smoke for the Telegram inter-session bridge (WP6; docs/inter-session/design.md §3.7).
// Not the R2 matrix (WP13): one private Gateway, real Telegram channel code, real model turns.
//
//   - The plan installs lab/release-files/telegram-inter-session-bridge/generated/* over this
//     runtime's chunks (plan `before` = V's sha256), so the Gateway runs V's bytes + the bridge.
//   - Telegram runs against the loopback fake Bot API (lab/candidate/telegram-fake-bot-api.mjs):
//     fake token, no real bot, nothing reaches Telegram.
//   - A candidate-only plugin (isc-tg-smoke) drives the registered bridge in-process through one
//     Gateway method (resolveRoute / post / start / done), the way plugin 2.0 will.
//   - get-reply gets candidate-only instrumentation at the admission site (G:3584): a log line of
//     what arrives there, and the §3.3 exclusive-admission guard (WP1 is not merged yet) so a BUSY
//     attempt can be exercised end to end on the real Telegram dispatch code.
//
// Scenarios: dm (started, preset runId, finals, ctx fields at G), group (label, started), busy (a
// second request while the first runs a 30 s exec: busy, nothing visible; retried after: started),
// gated (a peer the access rules refuse: rejected GATED, no pairing message), mismatch (a session of
// another agent: rejected ROUTE_MISMATCH, nothing runs).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as contracts from "../../apps/v-session-relay/plugin/core/contracts.js";
import { createFakeTelegramBotApi, FAKE_BOT_TOKEN } from "./telegram-fake-bot-api.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const MODEL = process.env.TG_MODEL ?? "deepseek/deepseek-v4-flash";
const SCENARIOS = (process.env.ISC_TG_SCENARIOS ?? "dm,group,busy,gated,mismatch").split(",").map((s) => s.trim()).filter(Boolean);
const TURN_MS = Number(process.env.ISC_TG_TURN_MS ?? 240_000);
const OWNER = "70000001";
const STRANGER = "70000099";
const GROUP = "-1009990000001";
const GROUP_TITLE = "VLab 测试｜TG 房间";
const AGENT = "makaron";
const LOG = path.join(data, "isc-tg-smoke.jsonl");
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const since = () => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const secrets = new Set();
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]").replace(/bot\d+:[\w-]+/gu, "bot[redacted]");
  for (const v of secrets) if (v && v.length >= 8) out = out.replaceAll(v, "[redacted]");
  return out;
};
const summary = { startedAt: new Date().toISOString(), model: MODEL, scenarios: {}, steps: [], failures: [] };
const step = (name, extra = {}) => { summary.steps.push({ at: since(), name, ...extra }); console.error(`[${since()}] ${name} ${redact(JSON.stringify(extra))}`); };
const check = (scenario, ok, what, detail) => {
  (summary.scenarios[scenario] ??= { checks: [] }).checks.push({ ok: Boolean(ok), what, ...(detail === undefined ? {} : { detail }) });
  if (!ok) summary.failures.push(`${scenario}: ${what}`);
};
function readSecret(name) {
  if (!fs.existsSync(SECRETS)) return undefined;
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
}
const readLog = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : []);

// ---------------------------------------------------------------- bytes: V + the bridge (installed by plan.files)
const dist = path.join(runtime, "openclaw", "dist");
const fixture = JSON.parse(fs.readFileSync(new URL("../../tests/fixtures/inter-session-v-bytes.json", import.meta.url), "utf8"));
const MARKER = contracts.MARKERS.telegramBridge;
for (const file of ["telegram-ingress-drain-factory-DJM2Jqrc.js", "bot-message-DC6p8sB3.js"]) {
  assert(fs.readFileSync(path.join(dist, file), "utf8").includes(MARKER), `${file}: the bridge patch is not installed`);
}
const G = path.join(dist, "get-reply-CqW1y05D.js");
assert.equal(sha256(fs.readFileSync(G)), fixture.files.find((f) => f.file === "get-reply-CqW1y05D.js").sha256, "get-reply does not start from V's bytes");

// ---------------------------------------------------------------- candidate-only G instrumentation
const ADMISSION = '\tconst queueAdmissionState = !pendingQueue ? "empty" : pendingQueue.items.some((item) => !item.steerPending) || pendingQueue.inFlight.size > 0 || pendingQueue.droppedCount > 0 ? "ready" : "steering";\n';
{
  let src = fs.readFileSync(G, "utf8");
  assert.equal(src.split(ADMISSION).length - 1, 1, "G admission anchor");
  src = src.replace(ADMISSION, () => `${ADMISSION}`
    + "\t// isc-tg-smoke (candidate-only): log, then the design §3.3 guard (WP1 stand-in)\n"
    + "\tconst __vI = opts?.vInterSession ?? ctx?.VInterSession;\n"
    + `\tif (__vI) try { process.getBuiltinModule("node:fs").appendFileSync(${JSON.stringify(LOG)}, JSON.stringify({ at: Date.now(), probe: "admission", sessionKey, optsRunId: opts?.runId ?? null, vInterSessionId: __vI.id ?? null, exclusive: __vI.exclusive ?? null, onBusy: typeof __vI.onBusy, sameObject: opts?.vInterSession === ctx?.VInterSession, provenanceKind: ctx?.InputProvenance?.kind ?? null, originSessionId: ctx?.InputProvenance?.originSessionId ?? null, senderId: ctx?.SenderId ?? null, senderName: ctx?.SenderName ?? null, commandAuthorized: ctx?.CommandAuthorized ?? null, commandSuppressed: ctx?.CommandInterpretationSuppressed ?? null, messageSid: ctx?.MessageSid ?? null, channelPromptContext: typeof ctx?.ChannelPromptContext, onDeliberateSilent: typeof opts?.onDeliberateSilentTerminalReply, isActive, queueAdmissionState, recoveryOwnerActive }) + "\\n"); } catch {}\n`
    + "\tif (__vI?.exclusive === true) {\n"
    + '\t\tconst __busy = recoveryOwnerActive ? "recovery_owner" : queueAdmissionState !== "empty" ? "pending_queue" : isActive ? "active_run" : void 0;\n'
    + "\t\tif (__busy) {\n"
    + "\t\t\ttry { __vI.onBusy?.({ reason: __busy, activeSessionId }); } catch {}\n"
    + "\t\t\topts?.onDeliberateSilentTerminalReply?.();\n"
    + "\t\t\ttyping.cleanup();\n"
    + '\t\t\treturn { kind: "reply", reply: void 0 };\n'
    + "\t\t}\n"
    + "\t}\n");
  fs.writeFileSync(G, src);
  const c = spawnSync(process.execPath, ["--check", G], { encoding: "utf8" });
  assert.equal(c.status, 0, `node --check get-reply: ${c.stderr}`);
}

// ---------------------------------------------------------------- candidate-only driver plugin
const pluginDir = path.join(data, "isc-tg-smoke-plugin");
fs.mkdirSync(pluginDir, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(pluginDir, "package.json"), JSON.stringify({ name: "isc-tg-smoke", version: "0.0.0", private: true, type: "module", openclaw: { extensions: ["./index.js"] } }, null, 2));
fs.writeFileSync(path.join(pluginDir, "openclaw.plugin.json"), JSON.stringify({ id: "isc-tg-smoke", name: "ISC TG smoke", description: "Candidate-only driver for the Telegram inter-session bridge.", activation: { onStartup: true }, configSchema: { type: "object", additionalProperties: false, properties: {} } }, null, 2));
fs.writeFileSync(path.join(pluginDir, "index.js"), `import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
const dones = (globalThis.__iscTgSmokeDones ??= new Map());
const registry = () => globalThis[Symbol.for(${JSON.stringify(contracts.SYMBOL_KEYS.bridges)})];
export default definePluginEntry({
  id: "isc-tg-smoke",
  name: "ISC TG smoke",
  description: "Candidate-only driver for the Telegram inter-session bridge.",
  register(api) {
    api.registerGatewayMethod("isctg.call", async ({ params }) => {
      const reg = registry();
      if (params.op === "keys") return { keys: reg ? [...reg.bridges.keys()] : [], listeners: reg ? reg.listeners.size : null };
      const bridge = reg?.bridges.get(params.key ?? "telegram:default");
      if (!bridge) return { error: "no bridge" };
      try {
        if (params.op === "describe") return { v: bridge.v, channel: bridge.channel, accountId: bridge.accountId, caps: bridge.caps, fns: ["resolveRoute", "post", "start", "edit"].map((n) => n + ":" + typeof bridge[n]) };
        if (params.op === "resolveRoute") return await bridge.resolveRoute(params.query);
        if (params.op === "post") return await bridge.post(params.post);
        if (params.op === "start") {
          const t0 = Date.now();
          const out = await bridge.start(params.req);
          if (out.status === "started") { dones.set(out.runId, out.done); return { status: out.status, runId: out.runId, done: typeof out.done?.then, ms: Date.now() - t0 }; }
          return { ...out, ms: Date.now() - t0 };
        }
        if (params.op === "done") {
          const d = dones.get(params.runId);
          if (!d) return { error: "unknown run" };
          return await Promise.race([d, new Promise((r) => setTimeout(() => r({ timeout: true }), params.timeoutMs ?? 240000))]);
        }
        return { error: "unknown op" };
      } catch (e) {
        return { thrown: { name: e?.name ?? null, code: e?.code ?? null, transient: e?.transient ?? null, message: String(e?.message ?? e) } };
      }
    }, { scope: "operator.write" });
  },
});
`);

// ---------------------------------------------------------------- fake Bot API + private config
const fake = createFakeTelegramBotApi();
const apiPort = await fake.listen();
fake.setChat({ chatId: GROUP, title: GROUP_TITLE });
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const gatewayToken = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
secrets.add(gatewayToken);
config.channels = {
  telegram: {
    enabled: true,
    botToken: FAKE_BOT_TOKEN,
    apiRoot: `http://127.0.0.1:${apiPort}`,
    dmPolicy: "allowlist",
    allowFrom: [OWNER],
    groupAllowFrom: [OWNER],
    groups: { "*": { requireMention: false } },
  },
};
config.commands = { ...(config.commands ?? {}), ownerAllowFrom: [`telegram:${OWNER}`] };
config.plugins.entries = { ...(config.plugins.entries ?? {}), telegram: { ...(config.plugins.entries?.telegram ?? {}), enabled: true }, "isc-tg-smoke": { enabled: true, config: {} } };
if (Array.isArray(config.plugins.allow)) for (const id of ["telegram", "isc-tg-smoke"]) if (!config.plugins.allow.includes(id)) config.plugins.allow.push(id);
config.plugins.load = { ...(config.plugins.load ?? {}), paths: [...(config.plugins.load?.paths ?? []), pluginDir] };
config.bindings = [...(config.bindings ?? []).filter((b) => b?.match?.channel !== "telegram"), { agentId: AGENT, match: { channel: "telegram" } }];
config.cron = { ...(config.cron ?? {}), enabled: false };
if (config.plugins.entries?.codex) config.plugins.entries.codex.enabled = false;
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0, gatewayConfigPath: configPath });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
}
config.agents.defaults.model = { ...(config.agents.defaults.model ?? {}), primary: MODEL };
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
fs.mkdirSync(config.agents.entries?.[AGENT]?.workspace ?? path.join(data, "ws"), { recursive: true });

// ---------------------------------------------------------------- Gateway
for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(data, dir), { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: path.join(data, "tmp"), XDG_CACHE_HOME: path.join(data, "cache"), npm_config_cache: path.join(data, "cache", "npm") };
for (const name of ["DEEPSEEK_API_KEY"]) {
  const value = readSecret(name);
  if (value) { env[name] = value; secrets.add(value); }
}
const lines = [];
let gateway;
let starts = 0;
function startGateway() {
  starts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 20_000) lines.splice(0, lines.length - 20_000);
    });
  }
}
const waitFor = async (predicate, ms, label) => {
  for (const until = Date.now() + ms; Date.now() < until; await sleep(250)) {
    const value = await predicate();
    if (value) return value;
    if (gateway.exitCode !== null) {
      if (starts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run|migration inputs changed during startup convergence/u.test(l.line))) { step("gateway restart after startup convergence"); startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode} while waiting for ${label}\n${redact(lines.slice(-40).map((l) => l.line).join("\n"))}`);
    }
  }
  throw new Error(`timed out waiting for ${label}`);
};
let client;
async function rpc(method, params, timeoutMs = 60_000) {
  if (!client) {
    const { GatewayClient } = await import(pathToFileURL(`${dist}/plugin-sdk/gateway-runtime.js`).href);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("gateway connect timeout")), 60_000);
      client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token: gatewayToken, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read", "operator.write"], onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); } });
      client.start();
    });
  }
  return client.request(method, params, { timeoutMs });
}
const bridgeCall = (params, timeoutMs) => rpc("isctg.call", params, timeoutMs);

const chatCalls = (chatId, from, to = Infinity) => fake.calls.filter((c) => c.at >= from && c.at <= to && String(c.params?.chat_id) === String(chatId));
const VISIBLE = new Set(["sendMessage", "editMessageText", "editMessageReplyMarkup", "editMessageMedia", "editMessageCaption", "deleteMessage", "setMessageReaction", "sendPhoto", "sendDocument"]);

function startRequest(route, { sessionKey, id, kind = "request", attempt = 0, anchorMessageId = null, promptText, routePeerId }) {
  const chainId = contracts.newChainId();
  const req = {
    route, sessionKey, agentId: AGENT, kind, id, attempt, ...contracts.startIds({ channel: "telegram", kind, id, attempt }),
    anchorMessageId, promptText, channelPromptContext: "这是 VLab 候选测试里另一个会话交来的请求；照做，直接给出结果。",
    provenance: { kind: "inter_session", sourceSessionKey: `agent:${AGENT}:feishu:direct:ou_isctgsmoke`, sourceChannel: "feishu", sourceTool: "sessions_send", originSessionId: contracts.originSessionIdFor({ chainId, depth: 1, kind, id }) },
    sender: { id: OWNER, name: "「Tianyi 私聊」的 V（会话协作）", isOwnerIdentity: true },
    routePeerId: routePeerId ?? (route.chatType === "direct" ? route.peerId : OWNER),
    askUserAnswererId: OWNER,
  };
  const v = contracts.validateStartRequest(req);
  assert(v.ok, v.errors.join("; "));
  return req;
}

async function startedRun(scenario, { sessionKey, ownerIds = [OWNER], anchorText, promptText, expect, id = contracts.newSendId() }) {
  const routed = await bridgeCall({ op: "resolveRoute", query: { sessionKey, agentId: AGENT, ownerIds } });
  check(scenario, routed.ok === true && contracts.validateRoute(routed.route).ok, "resolveRoute ok", routed);
  const anchor = await bridgeCall({ op: "post", post: { route: routed.route, text: anchorText, idempotencyKey: `smoke:${id}` } });
  check(scenario, /^\d+$/u.test(anchor.messageId ?? ""), "anchor posted", anchor);
  const req = startRequest(routed.route, { sessionKey, id, anchorMessageId: anchor.messageId, promptText });
  const t0 = Date.now();
  const out = await bridgeCall({ op: "start", req }, TURN_MS);
  check(scenario, out.status === "started" && out.runId === req.runId, "started with the preset runId", out);
  const done = out.status === "started" ? await bridgeCall({ op: "done", runId: out.runId, timeoutMs: TURN_MS }, TURN_MS + 30_000) : undefined;
  check(scenario, done && contracts.validateRunOutcome(done).ok && done.status === "ok", "done ok", done);
  check(scenario, (done?.finals ?? []).some((f) => (f.text ?? "").includes(expect)), `finals carry ${expect}`, done?.finals);
  await sleep(1500);
  const calls = chatCalls(routed.route.chatId, t0);
  const replies = fake.messages().filter((m) => m.chatId === routed.route.chatId && m.createdAt >= t0 && m.history.some((h) => (h.text ?? "").includes(expect)));
  check(scenario, replies.length >= 1, "the reply is visible in the target chat", calls.map((c) => c.method));
  check(scenario, !calls.some((c) => c.method === "setMessageReaction"), "no reactions on the anchor", calls.map((c) => c.method));
  const admission = readLog().filter((l) => l.probe === "admission" && l.optsRunId === req.runId);
  check(scenario, admission.length === 1, "one admission at G for the turn", admission.length);
  const a = admission[0] ?? {};
  check(scenario, a.vInterSessionId === id && a.exclusive === true && a.onBusy === "function" && a.sameObject === true, "replyOptions.vInterSession reaches G (and is ctx.VInterSession)", a);
  check(scenario, a.provenanceKind === "inter_session" && a.originSessionId === req.provenance.originSessionId, "InputProvenance reaches G", a);
  check(scenario, a.senderId === OWNER && a.senderName === req.sender.name && a.commandAuthorized === false && a.commandSuppressed === true && a.messageSid === req.messageSid && a.channelPromptContext === "string", "ctx fields of §2.a reach G", a);
  check(scenario, a.onDeliberateSilent === "function", "onDeliberateSilentTerminalReply available at G", a);
  return { routed, anchor, req, out, done };
}

async function main() {
  startGateway();
  await waitFor(() => fake.calls.some((c) => c.method === "getMe"), 600_000, "Telegram channel start (getMe)");
  const keys = await waitFor(async () => { try { const k = await bridgeCall({ op: "keys" }); return k.keys?.includes("telegram:default") ? k : false; } catch { return false; } }, 300_000, "bridge registration");
  step("bridge registered", keys);
  const described = await bridgeCall({ op: "describe" });
  summary.bridge = described;
  check("registry", JSON.stringify(described.caps) === JSON.stringify(contracts.CHANNEL_CAPS.telegram), "caps equal contracts", described);
  const dmKey = `agent:${AGENT}:telegram:direct:${OWNER}`;

  if (SCENARIOS.includes("dm")) {
    const r = await startedRun("dm", { sessionKey: dmKey, anchorText: "📨 来自「Tianyi 私聊」的请求 #T1DM\n—\n候选测试", promptText: "这是自动化测试。只回复：ISC_TG_DM_OK", expect: "ISC_TG_DM_OK" });
    check("dm", r.routed.route?.humans === "owner_only", "owner DM is owner_only", r.routed.route);
    step("dm done", { status: r.done?.status, finals: r.done?.finals?.length });
  }
  if (SCENARIOS.includes("group")) {
    const r = await startedRun("group", { sessionKey: `agent:${AGENT}:telegram:group:${GROUP}`, anchorText: "📨 来自「Tianyi 私聊」的请求 #T1GR\n—\n候选测试", promptText: "这是自动化测试。只回复：ISC_TG_GROUP_OK", expect: "ISC_TG_GROUP_OK" });
    check("group", r.routed.route?.label === GROUP_TITLE && r.routed.route?.humans === "shared", "group label and humans", r.routed.route);
    step("group done", { status: r.done?.status });
  }
  if (SCENARIOS.includes("busy")) {
    const routed = await bridgeCall({ op: "resolveRoute", query: { sessionKey: dmKey, agentId: AGENT, ownerIds: [OWNER] } });
    const sleeper = contracts.newSendId();
    const anchorA = await bridgeCall({ op: "post", post: { route: routed.route, text: "📨 #T2A", idempotencyKey: `smoke:${sleeper}` } });
    const reqA = startRequest(routed.route, { sessionKey: dmKey, id: sleeper, anchorMessageId: anchorA.messageId, promptText: "这是自动化测试。先用 exec 工具运行 sleep 30（必须等它结束），然后只回复：ISC_TG_SLEEP_DONE" });
    const outA = await bridgeCall({ op: "start", req: reqA }, TURN_MS);
    check("busy", outA.status === "started", "first request started", outA);
    // wait until the first turn is inside its exec (the work view shows the tool), then a little more
    const execShown = await waitFor(() => fake.messages().some((m) => m.chatId === OWNER && m.messageId > Number(anchorA.messageId) && m.history.some((h) => /exec/iu.test(h.text ?? ""))), 90_000, "the first turn's exec").catch(() => false);
    summary.scenarios.busy = { ...(summary.scenarios.busy ?? { checks: [] }), execShown: Boolean(execShown) };
    await sleep(3000);
    const second = contracts.newSendId();
    const anchorB = await bridgeCall({ op: "post", post: { route: routed.route, text: "📨 #T2B", idempotencyKey: `smoke:${second}` } });
    const reqB0 = startRequest(routed.route, { sessionKey: dmKey, id: second, anchorMessageId: anchorB.messageId, promptText: "这是自动化测试。只回复：ISC_TG_AFTER_BUSY" });
    const t0 = Date.now();
    const busy = await bridgeCall({ op: "start", req: reqB0 }, TURN_MS);
    await sleep(1500);
    const window = chatCalls(OWNER, t0);
    check("busy", busy.status === "busy" && busy.reason === "active_run", "second request is BUSY while the first runs", busy);
    check("busy", !window.some((c) => VISIBLE.has(c.method)), "BUSY: no message, edit, delete or reaction in the chat", window.map((c) => c.method));
    summary.scenarios.busy.chatActionsInWindow = window.filter((c) => c.method === "sendChatAction").length;
    const doneA = await bridgeCall({ op: "done", runId: outA.runId, timeoutMs: TURN_MS }, TURN_MS + 30_000);
    check("busy", doneA.status === "ok" && doneA.finals.some((f) => (f.text ?? "").includes("ISC_TG_SLEEP_DONE")), "first request finished", doneA);
    await sleep(2000);
    const reqB1 = startRequest(routed.route, { sessionKey: dmKey, id: second, attempt: 1, anchorMessageId: anchorB.messageId, promptText: "这是自动化测试。只回复：ISC_TG_AFTER_BUSY" });
    const outB = await bridgeCall({ op: "start", req: reqB1 }, TURN_MS);
    check("busy", outB.status === "started" && outB.runId === reqB1.runId, "retry after the run ended starts (attempt 1 runId)", outB);
    const doneB = outB.status === "started" ? await bridgeCall({ op: "done", runId: outB.runId, timeoutMs: TURN_MS }, TURN_MS + 30_000) : undefined;
    check("busy", doneB?.finals?.some((f) => (f.text ?? "").includes("ISC_TG_AFTER_BUSY")), "retry finals", doneB);
    const g = readLog().filter((l) => l.probe === "admission" && l.optsRunId === reqB0.runId);
    check("busy", g.length === 1 && g[0].isActive === true, "BUSY decided at G with the session active", g);
    step("busy done", { busy, retry: outB.status });
  }
  if (SCENARIOS.includes("gated")) {
    const key = `agent:${AGENT}:telegram:direct:${STRANGER}`;
    const routed = await bridgeCall({ op: "resolveRoute", query: { sessionKey: key, agentId: AGENT, ownerIds: [OWNER] } });
    check("gated", routed.ok && routed.route.humans === "single_peer", "stranger DM routes (single_peer)", routed);
    const t0 = Date.now();
    const out = await bridgeCall({ op: "start", req: startRequest(routed.route, { sessionKey: key, id: contracts.newSendId(), promptText: "这是自动化测试。只回复：ISC_TG_GATED" }) }, TURN_MS);
    await sleep(1500);
    check("gated", out.status === "rejected" && out.code === "GATED", "rejected GATED", out);
    check("gated", chatCalls(STRANGER, t0).length === 0, "no pairing challenge or any message to the stranger", chatCalls(STRANGER, t0).map((c) => c.method));
    step("gated done", { code: out.code });
  }
  if (SCENARIOS.includes("mismatch")) {
    const key = `agent:short-v:telegram:direct:${OWNER}`;
    const routed = await bridgeCall({ op: "resolveRoute", query: { sessionKey: key, agentId: "short-v", ownerIds: [OWNER] } });
    const t0 = Date.now();
    const id = contracts.newSendId();
    const req = { ...startRequest(routed.route, { sessionKey: key, id, promptText: "这是自动化测试。只回复：ISC_TG_MISMATCH" }), agentId: "short-v" };
    const out = await bridgeCall({ op: "start", req }, TURN_MS);
    await sleep(1500);
    check("mismatch", out.status === "rejected" && out.code === "ROUTE_MISMATCH", "rejected ROUTE_MISMATCH", out);
    check("mismatch", !chatCalls(OWNER, t0).some((c) => VISIBLE.has(c.method)), "nothing visible", chatCalls(OWNER, t0).map((c) => c.method));
    check("mismatch", readLog().every((l) => l.optsRunId !== req.runId), "nothing reached get-reply");
    step("mismatch done", { code: out.code });
  }
}

try {
  await main();
} catch (error) {
  summary.failures.push(`error: ${redact(error?.stack ?? error)}`);
} finally {
  summary.botApiMethods = [...new Set(fake.calls.map((c) => c.method))];
  summary.botApiErrors = fake.calls.filter((c) => c.error).map((c) => `${c.method}: ${c.error}`).slice(0, 20);
  summary.gatewayErrors = lines.filter((l) => /inter-session|isc-tg-smoke|\bERROR\b|TypeError|ReferenceError/u.test(l.line)).slice(-30).map((l) => redact(l.line).slice(0, 300));
  try { client?.stop?.(); } catch {}
  if (gateway && gateway.exitCode === null) {
    gateway.kill("SIGTERM");
    for (let i = 0; i < 40 && gateway.exitCode === null; i += 1) await sleep(250);
    if (gateway.exitCode === null) gateway.kill("SIGKILL");
  }
  await fake.close();
  summary.ok = summary.failures.length === 0;
  console.log(redact(JSON.stringify(summary, null, 2)));
  process.exitCode = summary.ok ? 0 : 1;
}
