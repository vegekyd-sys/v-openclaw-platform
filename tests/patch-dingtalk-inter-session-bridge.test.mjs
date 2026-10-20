// DingTalk inbound bridge for sessions_send (docs/inter-session/design.md §3.8, WP7).
//
// 1. The release files are exactly the patch of the bytes V runs (captured 2026-10-20 and
//    verified on V), every anchor occurs once, the marker once, V's own marker stays.
// 2. The literals the dist patch inlines equal apps/v-session-relay/plugin/core/contracts.js.
// 3. Functional: both generated chunks are loaded in a sandbox with recording stubs for the
//    connector's other chunks and a fake core dispatch that behaves like the WP1 exclusive
//    admission guard. The bridge the connection registers is driven through the contract
//    (resolveRoute / post / start) and the results are checked against the contract validators:
//    BUSY leaves nothing at all, the AI card waits for the run, nothing uses a sessionWebhook,
//    finals come back, a person's message still takes the original path.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as contracts from "../apps/v-session-relay/plugin/core/contracts.js";
import {
  ANCHORS, CAPTURE_DIR, CONNECTION_FILE, EXPERIENCE_MARKER, MARKER, MESSAGE_HANDLER_FILE, MESSAGING_CHUNK, RELEASE_DIR,
  buildRelease, patchConnectionChunk, patchMessageHandlerChunk, writeRelease,
} from "../apps/v-experience/dingtalk/patch-inter-session.mjs";
import { createFakeDingTalkOpenApi } from "../lab/candidate/dingtalk-fake-open-api.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const count = (haystack, needle) => haystack.split(needle).length - 1;
const CAPTURED = { connection: read(path.join(CAPTURE_DIR, CONNECTION_FILE)), handler: read(path.join(CAPTURE_DIR, MESSAGE_HANDLER_FILE)) };
const GENERATED = { connection: read(path.join(RELEASE_DIR, CONNECTION_FILE)), handler: read(path.join(RELEASE_DIR, MESSAGE_HANDLER_FILE)) };

// ---------------------------------------------------------------- 1. bytes

test("the release files are the patch of the bytes V runs", () => {
  const fixture = JSON.parse(read("tests/fixtures/inter-session-v-bytes.json"));
  for (const [key, file] of [["connection", CONNECTION_FILE], ["handler", MESSAGE_HANDLER_FILE]]) {
    const entry = fixture.files.find((f) => f.component === "dingtalk" && f.file === path.basename(file));
    assert(entry, `${file} is in the V bytes fixture`);
    assert.equal(sha256(CAPTURED[key]), entry.sha256, `${file}: the capture is what V runs`);
    assert.deepEqual(entry.workPackages, ["WP7"]);
  }
  assert.equal(patchConnectionChunk(CAPTURED.connection), GENERATED.connection);
  assert.equal(patchMessageHandlerChunk(CAPTURED.handler), GENERATED.handler);
  for (const file of [CONNECTION_FILE, MESSAGE_HANDLER_FILE]) execFileSync(process.execPath, ["--check", path.join(REPO, RELEASE_DIR, file)]);
  const manifest = JSON.parse(read(path.join(RELEASE_DIR, "manifest.json")));
  assert.deepEqual(manifest, buildRelease().manifest);
  assert.equal(manifest.marker, MARKER);
  assert.deepEqual(manifest.files.map((f) => [f.path, f.before, f.after]), [
    [CONNECTION_FILE, sha256(CAPTURED.connection), sha256(GENERATED.connection)],
    [MESSAGE_HANDLER_FILE, sha256(CAPTURED.handler), sha256(GENERATED.handler)],
  ]);
  assert.deepEqual(writeRelease({ check: true }).stale, [], "committed release files are current");
});

test("every anchor occurs once in V's bytes; marker once; V's v-experience marker kept", () => {
  for (const { name, anchor } of ANCHORS.connection) assert.equal(count(CAPTURED.connection, anchor), 1, `connection anchor ${name}`);
  for (const { name, anchor } of ANCHORS.messageHandler) assert.equal(count(CAPTURED.handler, anchor), 1, `message-handler anchor ${name}`);
  for (const text of Object.values(GENERATED)) {
    assert.equal(count(text, MARKER), 1);
    assert(text.includes(EXPERIENCE_MARKER), "stacks on V's v-experience-dingtalk-v1");
  }
  assert.throws(() => patchConnectionChunk(GENERATED.connection), /already patched/u);
  assert.throws(() => patchMessageHandlerChunk(GENERATED.handler), /already patched/u);
  assert.throws(() => patchMessageHandlerChunk(CAPTURED.handler.replace("\tconst asyncMode = config.asyncMode === true;\n", "")), /anchor "no-async-mode" expected exactly once, found 0/u);
  const npmOriginal = read("apps/v-experience/dingtalk/baseline/message-handler-BUoLSylZ.mjs");
  assert.throws(() => patchMessageHandlerChunk(npmOriginal), /not V's bytes/u, "never the npm original");
  assert.match(read(path.join(CAPTURE_DIR, "dist", MESSAGING_CHUNK)), /export \{ sendTextMessage as a, [^}]*sendProactive as i, [^}]*sendMessage as r, [^}]*sendMarkdownMessage as t \};/u, "messaging chunk exports the names the patch imports");
});

test("sessionWebhook sends are gone from a sessions_send turn's code paths", () => {
  const handler = GENERATED.handler;
  const dispatcher = handler.slice(handler.indexOf("function createDingtalkReplyDispatcher(params) {"), handler.indexOf("//#region src/core/message-handler.ts"));
  // The dispatcher's first statement shadows the three webhook senders.
  assert.match(dispatcher, /^function createDingtalkReplyDispatcher\(params\) \{\n\t\/\/ [^\n]*\n\tconst vInter = params\.vInterSession;\n\tconst \{ sendMessage, sendMarkdownMessage, sendTextMessage \} = vInterReplySenders\(vInter\);\n/u);
  // Every other sessionWebhook use in the dispatcher goes through those names, or is the actionCard post that returns early.
  const webhookLines = dispatcher.split("\n").filter((l) => /sessionWebhook/u.test(l) && !/^\t*\/\//u.test(l));
  for (const line of webhookLines) assert.match(line, /const \{ cfg, agentId, conversationId, senderId, isDirect, accountId, sessionWebhook|await (sendMessage|sendMarkdownMessage|sendTextMessage)\(account\.config, sessionWebhook|dingtalkHttp\.post\(sessionWebhook, \{ msgtype: "actionCard"/u, line);
  assert.match(dispatcher, /const vSendCard = async \(card\) => \{\n\t\tif \(vInter\) \{\n\t\t\tawait vInterProactive\(/u);
  const internal = handler.slice(handler.indexOf("async function handleDingTalkMessageInternal(params, prepared) {"), handler.indexOf("async function handleDingTalkMessage(params) {"));
  assert.match(internal, /SDK dispatch 失败: \$\{err\.message\}`\);\n\t\tif \(params\.vInterSession\) throw err;\n\t\ttry \{\n\t\t\tconst token = await getAccessToken\(config\);/u, "the error reply through the sessionWebhook is never reached");
  const entry = handler.slice(handler.indexOf("async function handleDingTalkMessage(params) {"));
  assert.match(entry, /^async function handleDingTalkMessage\(params\) \{\n\tif \(params\.vInterSession\) return handleDingTalkMessageInternal\(params, vInterPrepared\(params\)\);\n\tconst prepared = await prepareDingTalkMessage\(params\);/u, "no prepare, no question interception (and its webhook notice)");
});

// ---------------------------------------------------------------- 2. literals

test("inlined literals equal contracts.js", () => {
  const c = GENERATED.connection;
  assert.equal(MARKER, contracts.MARKERS.dingtalkBridge);
  assert(c.includes(`const V_INTER_BRIDGES = Symbol.for(${JSON.stringify(contracts.SYMBOL_KEYS.bridges)});`));
  assert(c.includes('const V_INTER_CHANNEL = "dingtalk";') && contracts.CHANNELS.includes("dingtalk"));
  const caps = JSON.parse(/const V_INTER_CAPS = Object\.freeze\((\{[^}]*\})\);/u.exec(c)[1].replace(/(\w+):/gu, '"$1":'));
  assert.deepEqual(caps, { ...contracts.CHANNEL_CAPS.dingtalk });
  assert.deepEqual(JSON.parse(/const V_INTER_BUSY_REASONS = (\[[^\]]*\]);/u.exec(c)[1]), [...contracts.BUSY_REASONS]);
  assert(c.includes(`const V_INTER_RESTART_WEDGE_RE = /${contracts.RESTART_WEDGE_RE.source}/u;`));
  assert(c.includes("globalThis[V_INTER_BRIDGES] ??= { v: 1, bridges: new Map(), listeners: new Set() };"), "registry shape of contracts.getBridgeRegistry");
  for (const [, code] of c.matchAll(/reject\("([A-Z_]+)"/gu)) assert(contracts.START_REJECT_CODES.includes(code), code);
  for (const [, code] of c.matchAll(/vInterBridgeError\("([A-Z_]+)"/gu)) assert(contracts.BRIDGE_ERROR_CODES.includes(code), code);
  // The core V runs reads ctx.ChannelPromptContext only as string[] (a string is dropped silently, and
  // the target model would never see the request's context), so the patch passes [channelPromptContext].
  const corePrelude = read("release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist/history-image-prune-Dg0CDQ4a.js");
  assert.match(corePrelude, /function appendChannelPromptContext\(base, channelPromptContext\) \{\n\tif \(!Array\.isArray\(channelPromptContext\) \|\| channelPromptContext\.length === 0\) return base;/u);
  assert(GENERATED.handler.includes("ChannelPromptContext: typeof vReq.channelPromptContext === \"string\" && vReq.channelPromptContext.trim() ? [vReq.channelPromptContext] : void 0,"));
  // The account id normalizer behaves like contracts.normalizeAccountId (= the core's).
  const fnSrc = c.slice(c.indexOf("function vInterAccountId(value) {"), c.indexOf("\n}\n", c.indexOf("function vInterAccountId(value) {")) + 3);
  const vInterAccountId = new Function(`${fnSrc}; return vInterAccountId;`)();
  for (const input of ["", "  ", "__default__", "Default", "default", "dingtalk-account", " Foo Bar ", "__proto__", "constructor", "a".repeat(70), "中文", "x.y", undefined, null]) {
    assert.equal(vInterAccountId(input), contracts.normalizeAccountId(input), JSON.stringify(input));
  }
});

// ---------------------------------------------------------------- 3. functional sandbox

const PROGRESS_LISTENERS = Symbol.for("openclaw.v.progressCardChangedListeners");
const QUESTION_LISTENERS = Symbol.for("openclaw.questionChannelRequestedListeners");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, what) {
  for (let i = 0; i < 200; i += 1) {
    const value = check();
    if (value) return value;
    await sleep(10);
  }
  assert.fail(`timed out waiting for ${what}`);
}

function hookModule(exports) {
  return Object.entries(exports).map(([name, hook]) => `export const ${name} = (...args) => globalThis.__vdt.call(${JSON.stringify(hook)}, args);`).join("\n") + "\n";
}

function buildSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dingtalk-inter-session-"));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  w("connection-DCvu-l09.mjs", GENERATED.connection);
  w("message-handler-BUoLSylZ.mjs", GENERATED.handler);
  w("v-experience.mjs", read(path.join(CAPTURE_DIR, "dist/v-experience.mjs")));
  w("session-CS6KnVQ8.mjs", read(path.join(CAPTURE_DIR, "dist/session-CS6KnVQ8.mjs")));
  w("utils-legacy-CRYCK3kF.mjs", hookModule({ r: "checkAndMarkDingtalkMessage", a: "getOapiAccessToken1", i: "getAccessToken", n: "addEmotionReply", s: "recallEmotionReply" }) + 'export const t = "https://api.dingtalk.test";\n');
  w(MESSAGING_CHUNK, hookModule({ i: "sendProactive", a: "webhookSendText", r: "webhookSendMessage", t: "webhookSendMarkdown" }));
  const logger = "export const createLoggerFromConfig = () => ({ info() {}, warn() {}, error() {}, debug() {} });\n";
  w("logger-BmJkQkm1.mjs", logger);
  w("logger-mZ9OSbmD.mjs", `${logger}export const n = createLoggerFromConfig;\n`);
  w("accounts-Dkl7e4kk.mjs", hookModule({ d: "normalizeDingtalkAccountId", i: "resolveDingtalkAccount" }));
  w("runtime-C81EKBS1.mjs", 'export const r = "dingtalk-connector";\nexport const t = () => globalThis.__vdt.core;\n');
  w("http-client-8_Hh4c4N.mjs", 'export const t = { post: (...args) => globalThis.__vdt.call("httpPost", args), get: (...args) => globalThis.__vdt.call("httpGet", args), put: (...args) => globalThis.__vdt.call("httpPut", args) };\n');
  w("token-xUW84QQ8.mjs", hookModule({ i: "getOapiAccessToken" }));
  w("card-CVsxDMw1.mjs", hookModule({ i: "streamAICard", n: "finishAICard", r: "isQpsLimitError", t: "createAICardForTarget" }));
  w("utils-D0ALDrCn.mjs", hookModule({ n: "groupChatLacksVisibleRepliesAutomatic", r: "pickEmptyReplyFallbackText", t: "emptyGroupReplyLogHint" }));
  w("media-nyjwj7nU.mjs", `${hookModule({ n: "uploadMediaToDingTalk" })}export const t = { processRawMediaPaths: (...args) => globalThis.__vdt.call("processRawMediaPaths", args) };\n`);
  w("chunk-upload-aMOJxVgv.mjs", "export {};\n");
  w("common-jKYMZkAB.mjs", [
    "export const i = /\\[\\[vdt-video:(.*?)\\]\\]/g;", "export const n = /\\[\\[vdt-file:(.*?)\\]\\]/g;", "export const t = /\\[\\[vdt-audio:(.*?)\\]\\]/g;",
    "export const r = /!\\[([^\\]]*)\\]\\((\\/vdt-never\\/[^)]*)\\)/g;", "export const o = (p) => p;", "export const s = async () => null;",
    "export const a = { FILE_MARKER_PATTERN: n, VIDEO_MARKER_PATTERN: i, AUDIO_MARKER_PATTERN: t };", "",
  ].join("\n"));
  w("game-xiyou-c3iooNRR.mjs", 'export const isGamificationCommand = (text) => String(text).trim().startsWith("/西游");\nexport const GamificationEngine = { getInstanceForUser: () => ({ isEnabled: () => false, handleCommand: () => { globalThis.__vdt.call("gamificationCommand", []); return "游戏"; }, onDwsCommandResult: () => null }) };\n');
  w("node_modules/dingtalk-stream/package.json", JSON.stringify({ name: "dingtalk-stream", type: "module", main: "index.mjs" }));
  w("node_modules/dingtalk-stream/index.mjs", `export const TOPIC_ROBOT = "/v1.0/im/bot/messages/get";
export class DWClient {
  constructor(opts) { this.opts = opts; this.listeners = new Map(); this.socket = null; globalThis.__vdt.clients.push(this); }
  registerCallbackListener(topic, fn) { this.listeners.set(topic, fn); return this; }
  async connect() { this.socket = { readyState: 1, on() {}, once() {}, removeListener() {}, removeAllListeners() {}, ping() {} }; }
  async disconnect() { if (this.socket) this.socket.readyState = 3; }
  socketCallBackResponse(id, body) { globalThis.__vdt.call("ack", [id, body]); }
  on() { return this; }
}
`);
  w("node_modules/openclaw/package.json", JSON.stringify({ name: "openclaw", type: "module", exports: { "./plugin-sdk/*": "./plugin-sdk/*.mjs" } }));
  w("node_modules/openclaw/plugin-sdk/agent-scope-runtime.mjs", "export const resolveAgentConfig = () => ({});\n");
  w("node_modules/openclaw/plugin-sdk/channel-outbound.mjs", "export const createReplyPrefixOptions = () => ({ onModelSelected() {} });\nexport const formatChannelProgressDraftLineForEntry = () => \"\";\n");
  w("node_modules/openclaw/plugin-sdk/gateway-runtime.mjs", 'export const callGatewayFromCli = (...args) => globalThis.__vdt.call("gateway", args);\n');
  return dir;
}

/**
 * A fake of the core's dispatchReplyWithBufferedBlockDispatcher: typing starts (onReplyStart),
 * then the WP1 guard: BUSY calls vInterSession.onBusy and returns nothing; otherwise the run
 * starts with replyOptions.runId, streams, delivers its finals and reports its outcome.
 */
function createCore(state) {
  return {
    channel: {
      text: { resolveTextChunkLimit: () => 4000, resolveChunkMode: () => "length", chunkTextWithMode: (text) => [text] },
      reply: {
        resolveEnvelopeFormatOptions: () => ({}),
        formatAgentEnvelope: ({ body }) => body,
        dispatchReplyFromConfig: () => {},
        dispatchReplyWithBufferedBlockDispatcher: async (p) => {
          const scenario = state.scenario;
          state.dispatches.push(p);
          state.events.push("dispatch");
          const { ctx, dispatcherOptions: d, replyOptions: r } = p;
          d.onReplyStart?.();
          await scenario.beforeGuard?.(p);
          const vInter = r.vInterSession ?? ctx.VInterSession;
          if (scenario.busy && vInter?.exclusive === true) {
            // The guard returns before typing starts, so (as in 9.1's typing controller, whose cleanup
            // calls onCleanup only once typing is active) the dispatcher gets no onCleanup; the
            // buffered dispatcher's finally still marks it idle.
            vInter.onBusy?.({ reason: scenario.busy, activeSessionId: "active-1" });
            await d.onIdle?.();
            return { queuedFinal: false, counts: { tool: 0, block: 0, final: 0 } };
          }
          if (scenario.throwBeforeStart) throw new Error(scenario.throwBeforeStart);
          if (scenario.noRun) {
            await d.onIdle?.();
            return { queuedFinal: false, counts: { tool: 0, block: 0, final: 0 } };
          }
          if (scenario.failBeforeRunStart) {
            // executeAgentTurn failed before its harness accepted the turn: no onAgentRunStart, an
            // error final, terminal outcome "failed" (agent-runner executeAgentTurn).
            for (const payload of scenario.finals ?? []) await d.deliver(payload, { kind: "final" });
            r.onAgentRunTerminalOutcome?.("failed");
            await d.onIdle?.();
            return { queuedFinal: true, counts: { tool: 0, block: 0, final: (scenario.finals ?? []).length } };
          }
          const runId = r.runId ?? "generated-run-id";
          state.events.push(`runStart:${runId}`);
          r.onAgentRunStart?.(runId);
          await sleep(5);
          await r.onPartialReply?.({ text: "partial answer" });
          await scenario.duringRun?.(p);
          for (const payload of scenario.finals ?? [{ text: "final answer" }]) await d.deliver(payload, { kind: "final" });
          if (scenario.terminal !== null) r.onAgentRunTerminalOutcome?.(scenario.terminal ?? "completed");
          if (scenario.throwAfterStart) throw new Error(scenario.throwAfterStart);
          d.onCleanup?.();
          await d.onIdle?.();
          return { queuedFinal: true, counts: { tool: 0, block: 0, final: 1 } };
        },
      },
      // The connector's own rule would authorize commands (open DM policy): CommandAuthorized must still be false.
      commands: { shouldComputeCommandAuthorized: () => true, resolveCommandAuthorizedFromAuthorizers: () => true },
      routing: {
        resolveAgentRoute: () => ({ agentId: "makaron", matchedBy: "default" }),
        buildAgentSessionKey: ({ peer }) => `agent:makaron:dingtalk-connector:${peer.kind}:${String(peer.id).toLowerCase()}`,
      },
    },
    agent: { resolveAgentWorkspaceDir: () => state.workspace },
  };
}

function createState(dir) {
  const state = {
    calls: [], events: [], dispatches: [], clients: [], scenario: {}, workspace: path.join(dir, "workspace"),
    accountConfig: { clientId: "dingcandidate01", clientSecret: "candidate-secret-1", streaming: true, dmPolicy: "open", groupPolicy: "open" },
    impl: {},
  };
  let n = 0;
  const defaults = {
    checkAndMarkDingtalkMessage: () => false,
    getOapiAccessToken1: async () => "oapi-token",
    getOapiAccessToken: async () => "oapi-token",
    getAccessToken: async () => "api-token",
    addEmotionReply: async () => {},
    recallEmotionReply: async () => {},
    sendProactive: async () => ({ ok: true, processQueryKey: `pqk-${++n}`, usedAICard: false }),
    webhookSendText: async () => ({ errcode: 0 }),
    webhookSendMessage: async () => ({ errcode: 0 }),
    webhookSendMarkdown: async () => ({ errcode: 0 }),
    normalizeDingtalkAccountId: (id) => (String(id ?? "").trim().toLowerCase() === "default" || !String(id ?? "").trim() ? "__default__" : String(id).trim()),
    resolveDingtalkAccount: ({ accountId }) => ({ accountId: accountId ?? "__default__", config: state.accountConfig }),
    createAICardForTarget: async (config, target) => ({ cardInstanceId: `card-${++n}`, target }),
    streamAICard: async () => {},
    finishAICard: async () => {},
    isQpsLimitError: () => false,
    groupChatLacksVisibleRepliesAutomatic: () => true,
    pickEmptyReplyFallbackText: () => "（这一轮没有文字回复）",
    emptyGroupReplyLogHint: () => "hint",
    uploadMediaToDingTalk: async () => null,
    processRawMediaPaths: async (text) => text,
    httpPost: async () => ({ data: {} }),
    httpGet: async () => ({ data: {} }),
    httpPut: async () => ({ data: {} }),
    gateway: async () => ({}),
    ack: () => {},
    gamificationCommand: () => {},
  };
  state.call = (name, args) => {
    state.calls.push({ name, args });
    state.events.push(name);
    const fn = state.impl[name] ?? defaults[name];
    if (!fn) throw new Error(`no stub for ${name}`);
    return fn(...args);
  };
  state.core = createCore(state);
  state.named = (name) => state.calls.filter((c) => c.name === name);
  state.reset = (scenario = {}) => { state.calls.length = 0; state.events.length = 0; state.dispatches.length = 0; state.scenario = scenario; state.impl = {}; };
  return state;
}

const VISIBLE = ["createAICardForTarget", "streamAICard", "finishAICard", "sendProactive", "webhookSendText", "webhookSendMessage", "webhookSendMarkdown", "addEmotionReply", "recallEmotionReply", "httpPost", "httpPut"];
const WEBHOOK = ["webhookSendText", "webhookSendMessage", "webhookSendMarkdown"];

test("functional: the DingTalk bridge through the generated chunks", async (t) => {
  const dir = buildSandbox();
  const state = createState(dir);
  globalThis.__vdt = state;
  globalThis[PROGRESS_LISTENERS] = new Set();
  globalThis[QUESTION_LISTENERS] = new Set();
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = (...args) => { const timer = realSetInterval(...args); timer.unref?.(); return timer; };
  const processListeners = Object.fromEntries(["exit", "SIGINT", "SIGTERM"].map((e) => [e, process.listeners(e)]));
  t.after(() => {
    globalThis.setInterval = realSetInterval;
    for (const [event, before] of Object.entries(processListeners)) for (const l of process.listeners(event)) if (!before.includes(l)) process.removeListener(event, l);
    fs.rmSync(dir, { recursive: true, force: true });
    delete globalThis.__vdt;
  });
  const connection = await import(pathToFileURL(path.join(dir, "connection-DCvu-l09.mjs")).href);
  const handler = await import(pathToFileURL(path.join(dir, "message-handler-BUoLSylZ.mjs")).href);
  const vx = await import(pathToFileURL(path.join(dir, "v-experience.mjs")).href);

  const reg = contracts.getBridgeRegistry();
  const registryEvents = [];
  const listener = (key, bridge) => registryEvents.push([key, Boolean(bridge)]);
  reg.listeners.add(listener);
  t.after(() => reg.listeners.delete(listener));

  const abort = new AbortController();
  const account = { accountId: "__default__", clientId: "dingcandidate01", clientSecret: "candidate-secret-1", enabled: true, configured: true, config: state.accountConfig };
  const runtime = { log: () => {}, error: () => {} };
  const monitor = connection.monitorSingleAccount({ cfg: { channels: {} }, account, runtime, abortSignal: abort.signal, messageHandler: handler.handleDingTalkMessage, onStatusChange: () => {} });
  for (let i = 0; i < 100 && !reg.bridges.has("dingtalk:__default__"); i += 1) await sleep(10);
  const bridge = reg.bridges.get("dingtalk:__default__");
  const alias = reg.bridges.get("dingtalk:default");
  const client = state.clients.at(-1);
  const robot = client.listeners.get("/v1.0/im/bot/messages/get");

  await t.test("registration: one bridge per account (+ the core's \"default\" for the connector's __default__)", () => {
    assert(bridge && alias, "both keys registered");
    assert.deepEqual(contracts.validateBridge(bridge), { ok: true, errors: [] });
    assert.deepEqual(contracts.validateBridge(alias), { ok: true, errors: [] });
    assert.equal(contracts.bridgeKey(bridge.channel, bridge.accountId), "dingtalk:__default__");
    assert.equal(alias.start, bridge.start);
    assert.deepEqual(registryEvents, [["dingtalk:__default__", true], ["dingtalk:default", true]]);
    assert.equal(bridge.edit, undefined, "DingTalk cannot edit a robot message");
  });

  const CID = "cidGroupA0Bc==";
  const GROUP_KEY = `agent:makaron:dingtalk-connector:group:${CID.toLowerCase()}`;

  await t.test("resolveRoute: only the stored delivery address", async () => {
    const q = (delivery, extra = {}) => bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", delivery, ownerIds: [], ...extra });
    for (const to of [CID, `group:${CID}`, `dingtalk-connector:group:${CID}`]) {
      const r = await q({ channel: "dingtalk-connector", to, accountId: "__default__" });
      assert.equal(r.ok, true, to);
      assert.deepEqual(r.route, { channel: "dingtalk", accountId: "__default__", to: CID, chatId: CID, chatType: "group", humans: "shared" });
      assert.deepEqual(contracts.validateRoute(r.route), { ok: true, errors: [] });
    }
    const dm = await q({ channel: "dingtalk-connector", to: "staffPeer01" }, { sessionKey: "agent:makaron:dingtalk-connector:direct:staffpeer01" });
    assert.deepEqual(dm.route, { channel: "dingtalk", accountId: "__default__", to: "staffPeer01", chatId: "staffPeer01", chatType: "direct", peerId: "staffPeer01", humans: "single_peer" });
    assert.equal((await q({ to: "user:staffPeer01", accountId: "default" }, { ownerIds: ["staffPeer01"] })).route.humans, "owner_only");
    assert.equal((await q({ channel: "dingtalk-connector", accountId: "__default__" })).code, "NO_ROUTE", "no to: the lower-cased cid in the key is never used");
    assert.equal((await q(undefined)).code, "NO_ROUTE");
    assert.equal((await q({ channel: "feishu", to: "chat:oc_1" })).code, "NO_ROUTE");
    assert.equal((await q({ channel: "dingtalk-connector", to: CID, accountId: "other-bot" })).code, "NO_ROUTE");
  });

  const route = (await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", delivery: { channel: "dingtalk-connector", to: CID, accountId: "__default__" }, ownerIds: [] })).route;
  const chainId = contracts.newChainId(Date.now(), Buffer.alloc(5, 7));
  let seq = 0;
  const request = (overrides = {}) => {
    const id = contracts.newSendId(Date.now(), Buffer.from([1, 2, 3, 4, ++seq]));
    const r = overrides.route ?? route;
    const req = {
      route: r, sessionKey: overrides.sessionKey ?? GROUP_KEY, agentId: "makaron", kind: "request", id, attempt: 0,
      ...contracts.startIds({ channel: "dingtalk", kind: "request", id, attempt: 0 }),
      anchorMessageId: "pqk-anchor",
      promptText: overrides.promptText ?? "请把三份周报合成一份，交回结果。",
      channelPromptContext: "[会话协作 #7F3A] 这条请求来自「Tianyi 私聊」里的 V。",
      provenance: { kind: "inter_session", sourceSessionKey: "agent:makaron:feishu:direct:ou_abc", sourceChannel: "feishu", sourceTool: "sessions_send", originSessionId: contracts.originSessionIdFor({ chainId, depth: 1, kind: "request", id }) },
      sender: { id: contracts.syntheticSenderIdFor(chainId), name: "「Tianyi 私聊」的 V（会话协作）", isOwnerIdentity: false },
      ...r.chatType === "direct" ? { routePeerId: r.peerId } : {},
      askUserAnswererId: "staffTianyi01",
      ...overrides.extra,
    };
    assert.deepEqual(contracts.validateStartRequest(req), { ok: true, errors: [] });
    return req;
  };
  const visibleCalls = () => state.calls.filter((c) => VISIBLE.includes(c.name));

  await t.test("post: a markdown robot message, at least once, BridgeError on failure", async () => {
    state.reset();
    const text = "**📨 来自「Tianyi 私聊」的请求 #7F3A**\n—\n请把三份周报合成一份";
    const res = await bridge.post({ route, text, idempotencyKey: "k1" });
    assert.match(res.messageId, /^pqk-/u);
    const [call] = state.named("sendProactive");
    const [config, target, body, options] = call.args;
    assert.deepEqual(target, { openConversationId: CID });
    assert.equal(body, text);
    assert.deepEqual(options, { msgType: "markdown", title: "📨 来自「Tianyi 私聊」的请求 #", useAICard: false, fallbackToNormal: true });
    assert.equal(config.clientId, "dingcandidate01");
    assert.equal(config.clientSecret, "candidate-secret-1");
    const dmRoute = (await bridge.resolveRoute({ sessionKey: "k", agentId: "makaron", delivery: { to: "staffPeer01" }, ownerIds: [] })).route;
    await bridge.post({ route: dmRoute, text: "hello there", idempotencyKey: "k2" });
    assert.deepEqual(state.named("sendProactive")[1].args[1], { userId: "staffPeer01" });
    const failing = async (impl) => { state.impl.sendProactive = impl; try { await bridge.post({ route, text: "x y z w v u", idempotencyKey: "k" }); } catch (err) { return err; } finally { delete state.impl.sendProactive; } assert.fail("post must throw"); };
    const e400 = await failing(async () => ({ ok: false, error: "Request failed with status code 400" }));
    assert(contracts.isBridgeError(e400));
    assert.deepEqual([e400.code, e400.transient], ["POST_FAILED", false]);
    const e503 = await failing(async () => ({ ok: false, error: "Request failed with status code 503" }));
    assert.deepEqual([e503.code, e503.transient], ["POST_FAILED", true]);
    const thrown = await failing(async () => { throw new Error("socket hang up"); });
    assert.deepEqual([thrown.code, thrown.transient], ["CHANNEL_DOWN", true]);
    const noKey = await failing(async () => ({ ok: true }));
    assert.deepEqual([noKey.code, noKey.transient], ["POST_FAILED", false]);
    assert.equal(WEBHOOK.some((n) => state.named(n).length), false);
  });

  await t.test("self-echo: the robot's own messages and V's own anchors never become input", async () => {
    state.reset({ noRun: true });
    const anchor = "**📨 来自「X 群」的请求 #9QK2**\n—\n帮我整理一下\\*这份\\*文档";
    await bridge.post({ route, text: anchor, idempotencyKey: "echo" });
    const deliver = (data) => robot({ headers: { messageId: `stream-${data.msgId}` }, data: JSON.stringify({ conversationType: "2", conversationId: CID, chatbotUserId: "$:LWCP_v1:$bot", sessionWebhook: "http://127.0.0.1:9/robot/sendBySession", ...data }) });
    await deliver({ msgId: "e1", msgtype: "text", text: { content: "📨 来自「X 群」的请求 #9QK2\n—\n帮我整理一下*这份*文档" }, senderId: "$:LWCP_v1:$human", senderStaffId: "staffHuman" });
    await deliver({ msgId: "e2", msgtype: "text", text: { content: "随便说点什么" }, senderId: "$:LWCP_v1:$bot" });
    assert.equal(state.dispatches.length, 0, "both dropped before the handler");
    await deliver({ msgId: "e3", msgtype: "text", text: { content: "随便说点什么" }, senderId: "$:LWCP_v1:$human", senderStaffId: "staffHuman" });
    assert.equal(state.dispatches.length, 1, "a person's message is handled");
  });

  await t.test("BUSY: nothing shown, nothing written, the running turn keeps its questions", async () => {
    state.reset();
    state.accountConfig.groupPolicy = "allowlist";
    state.accountConfig.groupAllowFrom = [];
    state.accountConfig.asyncMode = true; // would post "任务已接收" before dispatch for a person's message
    const listenersBefore = globalThis[PROGRESS_LISTENERS].size;
    const humanQuestions = [];
    const unrouteHuman = vx.onQuestionRequested(GROUP_KEY, (record) => { humanQuestions.push(record.id); return true; });
    vx.trackChatQuestion({ channel: "dingtalk", chatKey: `__default__:${CID}`, record: { id: `ask_${"a".repeat(32)}`, questions: [] } });
    state.scenario = {
      busy: "active_run",
      beforeGuard: async () => {
        // The running turn's progress card and a question it asks, while our attempt is admitted.
        for (const l of globalThis[PROGRESS_LISTENERS]) l({ sessionKey: GROUP_KEY, card: { steps: [{ step: "整理", status: "in_progress" }] } });
        for (const l of globalThis[QUESTION_LISTENERS]) l({ id: `ask_${"b".repeat(32)}`, sessionKey: GROUP_KEY, status: "pending", questions: [] });
      },
    };
    const req = request();
    const outcome = await bridge.start(req);
    assert.deepEqual(outcome, { status: "busy", reason: "active_run" });
    assert.deepEqual(contracts.validateStartOutcome(outcome), { ok: true, errors: [] });
    await sleep(400); // the work view's refresh timer and the dispatcher's idle path
    assert.deepEqual(visibleCalls(), [], "no card, no message, no emotion, no webhook");
    assert.deepEqual(state.named("gateway"), []);
    assert.equal(state.named("gamificationCommand").length, 0);
    assert.deepEqual(humanQuestions, [`ask_${"b".repeat(32)}`], "the running turn's question stays with the running turn");
    assert.equal(state.dispatches.length, 1, "no prepare (allowlist would block), no question interception");
    const { ctx, replyOptions } = state.dispatches[0];
    assert.equal(ctx.SessionKey, GROUP_KEY, "route forced to the target session");
    assert.equal(replyOptions.vInterSession, ctx.VInterSession);
    assert.deepEqual(Object.keys(replyOptions.vInterSession).sort(), ["exclusive", "id", "kind", "onBusy"]);
    // No onCleanup reached the dispatcher (typing never started), yet its work view is gone: a BUSY
    // attempt retried for hours must not leave one progress-card listener per attempt.
    assert.equal(globalThis[PROGRESS_LISTENERS].size, listenersBefore, "the BUSY attempt's work view was disposed");
    unrouteHuman();
    vx.untrackChatQuestion(`ask_${"a".repeat(32)}`);
    state.accountConfig.groupPolicy = "open";
    delete state.accountConfig.asyncMode;
  });

  await t.test("the request text is never a slash command or a game command; GATED frees the dispatcher", async () => {
    for (const promptText of ["清空对话", "/西游 状态"]) {
      state.reset({ noRun: true });
      const listenersBefore = globalThis[PROGRESS_LISTENERS].size;
      const outcome = await bridge.start(request({ promptText }));
      assert.equal(outcome.code, "GATED");
      assert.equal(state.named("gamificationCommand").length, 0, promptText);
      assert.equal(state.dispatches.length, 1, `${promptText}: dispatched as the request`);
      assert(state.dispatches[0].ctx.BodyForAgent.startsWith(promptText), `${promptText}: unchanged (not normalized to /new)`);
      assert.equal(globalThis[PROGRESS_LISTENERS].size, listenersBefore, "the GATED attempt's work view was disposed");
    }
  });

  await t.test("started: the card waits for the run, the turn is the request, finals come back", async () => {
    state.reset();
    const question = { id: `ask_${"c".repeat(32)}`, sessionKey: GROUP_KEY, status: "pending", questions: [{ questionId: "q1", question: "用哪种格式？", options: [{ label: "表格" }, { label: "列表" }] }] };
    state.scenario = {
      finals: [{ text: "合成好的周报全文", mediaUrls: ["https://cdn.test/a.png"], mediaUrl: "https://cdn.test/b.png" }],
      duringRun: async () => {
        for (const l of globalThis[QUESTION_LISTENERS]) await l(question);
        // ask_user in a group: only askUserAnswererId may answer.
        assert.equal(vx.hasTrackedQuestion({ channel: "dingtalk", chatKey: `__default__:${CID}`, senderId: "someoneElse" }), false);
        assert.equal(vx.hasTrackedQuestion({ channel: "dingtalk", chatKey: `__default__:${CID}`, senderId: "staffTianyi01" }), true);
        vx.untrackChatQuestion(question.id);
      },
    };
    const req = request({ promptText: "/new 新会话 /西游 请继续" });
    const outcome = await bridge.start(req);
    assert.equal(outcome.status, "started");
    assert.equal(outcome.runId, req.runId);
    assert.deepEqual(contracts.validateStartOutcome(outcome), { ok: true, errors: [] });
    const run = await outcome.done;
    assert.deepEqual(contracts.validateRunOutcome(run), { ok: true, errors: [] });
    assert.deepEqual(run, { status: "ok", finals: [{ text: "合成好的周报全文", mediaUrls: ["https://cdn.test/a.png", "https://cdn.test/b.png"] }], visibleReplySent: true, finalCount: 1 });
    const runStart = state.events.indexOf(`runStart:${req.runId}`);
    const firstCard = state.events.indexOf("createAICardForTarget");
    assert(runStart > state.events.indexOf("dispatch") && firstCard > runStart, "onReplyStart came first, the card only after the run started");
    assert.deepEqual(state.named("createAICardForTarget")[0].args[1], { type: "group", openConversationId: CID });
    for (const name of [...WEBHOOK, "addEmotionReply", "recallEmotionReply", "sendProactive", "gamificationCommand"]) assert.equal(state.named(name).length, 0, name);
    const { ctx, replyOptions } = state.dispatches[0];
    assert.equal(replyOptions.runId, req.runId);
    assert.equal(replyOptions.vInterSession.exclusive, true);
    assert.equal(replyOptions.vInterSession.id, req.id);
    assert.equal(replyOptions.vInterSession.kind, "request");
    assert.equal(ctx.VInterSession, replyOptions.vInterSession);
    assert.deepEqual(ctx.InputProvenance, req.provenance);
    assert.deepEqual(ctx.ChannelPromptContext, [req.channelPromptContext], "9.1 reads ChannelPromptContext as string[]");
    assert.equal(ctx.CommandInterpretationSuppressed, true);
    assert.equal(ctx.CommandAuthorized, false);
    assert.equal(ctx.SenderId, req.sender.id, "chain-root rule: the synthetic sender, not the chat's last speaker");
    assert.equal(ctx.From, req.sender.id);
    assert.equal(ctx.SenderName, req.sender.name);
    assert.equal(ctx.MessageSid, req.messageSid);
    assert.deepEqual([ctx.SessionKey, ctx.To, ctx.OriginatingTo, ctx.AccountId, ctx.ChatType], [GROUP_KEY, CID, CID, "__default__", "group"]);
    assert.match(ctx.BodyForAgent, /^\/new 新会话 \/西游 请继续/u, "the request text is never turned into /new or a game command");
    assert.equal(ctx.GroupSystemPrompt, undefined);
  });

  await t.test("a failed AI card: the answer still arrives, proactively, never through a webhook", async () => {
    state.reset({ finals: [{ text: "这是答复" }] });
    state.impl.createAICardForTarget = async () => null;
    const outcome = await bridge.start(request());
    const run = await outcome.done;
    assert.equal(run.status, "ok");
    const sends = state.named("sendProactive");
    assert.equal(sends.length, 1);
    assert.deepEqual(sends[0].args.slice(1), [{ openConversationId: CID }, "这是答复", { msgType: "markdown", useAICard: false, fallbackToNormal: true }]);
    for (const name of WEBHOOK) assert.equal(state.named(name).length, 0, name);
    assert.equal(run.visibleReplySent, true);
  });

  await t.test("direct chat: the person is the card target, ask_user answers in that chat reach the question", async () => {
    state.reset();
    const dmRoute = (await bridge.resolveRoute({ sessionKey: "agent:makaron:dingtalk-connector:direct:staffpeer01", agentId: "makaron", delivery: { channel: "dingtalk-connector", to: "staffPeer01", accountId: "__default__" }, ownerIds: [] })).route;
    let release;
    const answered = new Promise((r) => { release = r; });
    const question = { id: `ask_${"d".repeat(32)}`, sessionKey: "agent:makaron:dingtalk-connector:direct:staffpeer01", status: "pending", questions: [{ questionId: "q1", question: "要不要发？", options: [{ label: "发" }, { label: "不发" }] }] };
    state.scenario = {
      duringRun: async () => {
        for (const l of globalThis[QUESTION_LISTENERS]) await l(question);
        await answered;
      },
    };
    const req = request({ route: dmRoute, sessionKey: "agent:makaron:dingtalk-connector:direct:staffpeer01" });
    const outcome = await bridge.start(req);
    assert.equal(outcome.status, "started");
    // The chat's person routes the turn (To / the card); the permission identity is the request's
    // sender, in From too: 9.1 adds a direct chat's From to the elevated sender tokens
    // (reply-elevated.ts shouldUseFromAsSenderFallback), so the peer there would lend its rights.
    const dmCtx = state.dispatches[0].ctx;
    assert.notEqual(req.sender.id, dmRoute.peerId);
    assert.deepEqual([dmCtx.SenderId, dmCtx.From, dmCtx.To, dmCtx.OriginatingTo, dmCtx.ChatType], [req.sender.id, req.sender.id, "staffPeer01", "staffPeer01", "direct"]);
    assert.deepEqual((await until(() => state.named("createAICardForTarget")[0], "the AI card")).args[1], { type: "user", userId: "staffPeer01" });
    await until(() => vx.hasTrackedQuestion({ channel: "dingtalk", chatKey: "__default__:dm:staffPeer01", senderId: "staffPeer01" }), "the question in the direct chat");
    // The person answers in the real direct chat (its own conversationId): intercepted, resolved, not a new turn.
    const dispatchesBefore = state.dispatches.length;
    await handler.handleDingTalkMessage({
      accountId: "__default__", config: state.accountConfig, cfg: {}, runtime, log: runtime.log,
      data: { msgId: "dm-answer", msgtype: "text", text: { content: "发" }, conversationType: "1", conversationId: "cidRealDirectChat==", senderStaffId: "staffPeer01", senderId: "$:LWCP_v1:$peer", senderNick: "Peer", sessionWebhook: "http://127.0.0.1:9/robot/sendBySession" },
      sessionWebhook: "http://127.0.0.1:9/robot/sendBySession",
    });
    assert.equal(state.dispatches.length, dispatchesBefore, "the answer did not start a turn");
    const resolveCall = state.named("gateway").find((c) => c.args[0] === "question.resolve");
    assert(resolveCall, "question.resolve was called");
    assert.equal(resolveCall.args[2].id, question.id);
    release();
    assert.equal((await outcome.done).status, "ok");
  });

  await t.test("outcomes: failed, aborted, error after start, wedge / gated / internal before start", async () => {
    // A run that failed before its harness accepted the turn (no onAgentRunStart, e.g. an unknown
    // model) still ran: "started" with an error outcome (started_failed), not GATED (not_started).
    state.reset({ failBeforeRunStart: true, finals: [{ text: "⚠️ 模型不可用", isError: true }] });
    const failedEarly = await bridge.start(request());
    assert.equal(failedEarly.status, "started");
    assert.deepEqual(contracts.validateStartOutcome(failedEarly), { ok: true, errors: [] });
    let early = await failedEarly.done;
    assert.deepEqual([early.status, early.error, early.finals, early.finalCount], ["error", "⚠️ 模型不可用", [], 1]);
    assert.deepEqual(contracts.validateRunOutcome(early), { ok: true, errors: [] });
    state.reset({ failBeforeRunStart: true, finals: [] });
    early = await (await bridge.start(request())).done;
    assert.deepEqual([early.status, early.error], ["error", "the agent run failed"]);
    state.reset({ terminal: "failed", finals: [{ text: "⚠️ 模型出错", isError: true }] });
    let run = await (await bridge.start(request())).done;
    assert.deepEqual([run.status, run.error, run.finals, run.finalCount], ["error", "⚠️ 模型出错", [], 1]);
    state.reset({ terminal: null, finals: [] });
    run = await (await bridge.start(request())).done;
    assert.equal(run.status, "aborted", "a run that reported neither completed nor failed was cancelled");
    state.reset({ throwAfterStart: "worker crashed" });
    run = await (await bridge.start(request())).done;
    assert.deepEqual([run.status, run.error], ["error", "worker crashed"]);
    assert.equal(state.named("webhookSendText").length + state.named("httpPost").length, 0, "no sessionWebhook error reply");
    state.reset({ throwBeforeStart: "restart recovery claim changed for agent:makaron:x" });
    assert.deepEqual(await bridge.start(request()), { status: "rejected", code: "RESTART_WEDGE", message: "restart recovery claim changed for agent:makaron:x", started: false });
    state.reset({ throwBeforeStart: "boom" });
    assert.equal((await bridge.start(request())).code, "INTERNAL");
    state.reset({ noRun: true });
    const gated = await bridge.start(request());
    assert.equal(gated.code, "GATED");
    assert.deepEqual(contracts.validateStartOutcome(gated), { ok: true, errors: [] });
    assert.deepEqual(visibleCalls().filter((c) => c.name !== "createAICardForTarget"), [], "nothing visible without a run");
    const feishuRoute = { ...route, channel: "feishu", to: "chat:oc_1", chatId: "oc_1" };
    assert.equal((await bridge.start({ ...request(), route: feishuRoute })).code, "ROUTE_MISMATCH");
  });

  await t.test("a person's message keeps the original path (webhook, emotion, no inter-session options)", async () => {
    state.reset({ finals: [{ text: "人的答复" }] });
    state.impl.createAICardForTarget = async () => null;
    await robot({ headers: { messageId: "stream-human-1" }, data: JSON.stringify({ msgId: "human-1", msgtype: "text", text: { content: "你好" }, conversationType: "2", conversationId: CID, senderStaffId: "staffHuman", senderId: "$:LWCP_v1:$human", senderNick: "H", chatbotUserId: "$:LWCP_v1:$bot", sessionWebhook: "http://127.0.0.1:9/robot/sendBySession?conversation=x" }) });
    const { ctx, replyOptions } = state.dispatches[0];
    assert.equal(replyOptions.runId, undefined);
    assert.equal(replyOptions.vInterSession, undefined);
    assert.equal(ctx.VInterSession, undefined);
    assert.equal(ctx.SenderId, "staffHuman");
    assert.equal(ctx.CommandAuthorized, true, "a person's command authorization is the connector's own rule");
    assert.equal(ctx.ChannelPromptContext, undefined);
    assert.equal(ctx.MessageSid, "human-1");
    assert.equal(state.named("addEmotionReply").length, 1);
    assert.equal(state.named("sendProactive").length, 0);
    const webhook = state.named("webhookSendMessage");
    assert.equal(webhook.length, 1);
    assert.equal(webhook[0].args[1], "http://127.0.0.1:9/robot/sendBySession?conversation=x");
  });

  await t.test("stop: both bridges removed, a held bridge refuses to start", async () => {
    abort.abort();
    await monitor;
    assert.equal(reg.bridges.has("dingtalk:__default__"), false);
    assert.equal(reg.bridges.has("dingtalk:default"), false);
    assert.deepEqual(registryEvents.slice(-2), [["dingtalk:__default__", false], ["dingtalk:default", false]]);
    assert.equal((await bridge.start(request())).code, "CHANNEL_DOWN");
  });
});

// ---------------------------------------------------------------- fake open API additions (WP13 needs them)

test("fake open API: session webhook calls are listed, routes can fail, raw callbacks", async (t) => {
  class NoWss { handleUpgrade() {} close() {} }
  const fake = createFakeDingTalkOpenApi({ WebSocketServer: NoWss });
  const port = await fake.listen();
  t.after(() => fake.close());
  const post = (p, body) => fetch(`http://127.0.0.1:${port}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const since = Date.now();
  await post("/v1.0/robot/groupMessages/send", { robotCode: "r", openConversationId: "cid1", msgKey: "sampleMarkdown", msgParam: JSON.stringify({ title: "t", text: "x" }) });
  assert.equal(fake.robotMessagesSince(since).length, 1);
  assert.equal(fake.sessionWebhookCalls().length, 0);
  fake.failRoute("POST /v1.0/card/instances", { status: 403, times: 1 });
  assert.equal((await post("/v1.0/card/instances", { outTrackId: "o1" })).status, 403);
  assert.equal((await post("/v1.0/card/instances", { outTrackId: "o2" })).status, 200, "only the next request fails");
  assert.equal(fake.calls.find((c) => c.body?.outTrackId === "o1").failed, 403);
  await post("/robot/sendBySession?conversation=c", { msgtype: "text", text: { content: "hi" } });
  assert.equal(fake.sessionWebhookCalls().length, 1);
  assert.equal(typeof fake.sendRaw({ msgtype: "text" }).msgId, "string");
});
