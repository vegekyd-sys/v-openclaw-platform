// Telegram inter-session bridge (docs/inter-session/design.md §3.7, WP6):
// lab/release-files/telegram-inter-session-bridge/patch.mjs applied to the bytes V runs.
//
//   1. the committed generated files are exactly the patch of V's captured chunks (which still carry
//      V's own Telegram experience patch), parse, and every anchor is unique;
//   2. the literals the dist code inlines equal the frozen contracts (contracts.js);
//   3. the bridge code, evaluated as generated, works against the loopback fake Telegram Bot API and a
//      simulated core: registration, routes, posts and their errors, started / busy / rejected outcomes;
//   4. the real patched dispatch code (dispatchTelegramMessage, runTelegramDispatchTurn, deliverReply,
//      createTelegramMessageProcessor) runs with stubbed neighbours: a BUSY or never-started turn leaves
//      nothing in the chat, a started turn keeps the stock behaviour and reports its finals.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import * as contracts from "../apps/v-session-relay/plugin/core/contracts.js";
import { FAKE_BOT_TOKEN, createFakeTelegramBotApi } from "../lab/candidate/telegram-fake-bot-api.mjs";
import { vAppendChannelPromptContext, vElevatedSenderCheck } from "./fixtures/inter-session-core-probes.mjs";
import {
  ANCHORS,
  BASE_MARKER,
  DISPATCH_BLOCK_END,
  DISPATCH_BLOCK_START,
  FILES,
  INGRESS_BLOCK_END,
  INGRESS_BLOCK_START,
  INLINED,
  MARKER,
  patchTelegramDispatch,
  patchTelegramIngress,
} from "../lab/release-files/telegram-inter-session-bridge/patch.mjs";

const CAPTURE = "v2026.9.1-db91.6-subagent-index-20261020";
const captured = (file) => new URL(`../release/captured/${CAPTURE}/dist/${file}`, import.meta.url);
const generated = (file) => new URL(`../lab/release-files/telegram-inter-session-bridge/generated/${file}`, import.meta.url);
const read = (url) => fs.readFileSync(url, "utf8");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const fixture = JSON.parse(read(new URL("./fixtures/inter-session-v-bytes.json", import.meta.url)));

const V = { ingress: read(captured(FILES.ingress)), dispatch: read(captured(FILES.dispatch)) };
const OUT = { ingress: read(generated(FILES.ingress)), dispatch: read(generated(FILES.dispatch)) };
const count = (text, needle) => text.split(needle).length - 1;

function between(source, start, end) {
  const i = source.indexOf(start);
  assert(i >= 0, `missing ${JSON.stringify(start.slice(0, 60))}`);
  const j = source.indexOf(end, i + start.length);
  assert(j > i, `missing end ${JSON.stringify(end.slice(0, 60))}`);
  return source.slice(i, j + end.length);
}

// ---------------------------------------------------------------- 1. bytes

test("the committed files are exactly the patch of the bytes V runs", () => {
  for (const kind of ["ingress", "dispatch"]) {
    const entry = fixture.files.find((f) => f.file === FILES[kind] && f.workPackages.includes("WP6"));
    assert(entry, `${FILES[kind]} is an R2 target in tests/fixtures/inter-session-v-bytes.json`);
    assert.equal(entry.captured, `release/captured/${CAPTURE}/dist/${FILES[kind]}`);
    assert.equal(sha256(V[kind]), entry.sha256, `${FILES[kind]} capture is V's bytes`);
    const patched = kind === "ingress" ? patchTelegramIngress(V[kind]) : patchTelegramDispatch(V[kind]);
    assert.equal(patched, OUT[kind], `${FILES[kind]}: generated file is stale`);
    execFileSync(process.execPath, ["--check", generated(FILES[kind]).pathname]);
  }
});

test("stacked on V's Telegram experience patch; every anchor occurs exactly once; marker per insertion", () => {
  for (const kind of ["ingress", "dispatch"]) {
    assert(V[kind].includes(BASE_MARKER), `${FILES[kind]}: V's bytes carry ${BASE_MARKER}`);
    assert.equal(count(OUT[kind], BASE_MARKER), count(V[kind], BASE_MARKER), "V's own patch is untouched");
    assert.equal(count(V[kind], MARKER), 0);
    for (const [name, anchor] of Object.entries(ANCHORS[kind])) assert.equal(count(V[kind], anchor), 1, `${kind} anchor ${name}`);
    // the inserted block once, and one marker comment on every other inserted statement
    const [start, end] = kind === "ingress" ? [INGRESS_BLOCK_START, INGRESS_BLOCK_END] : [DISPATCH_BLOCK_START, DISPATCH_BLOCK_END];
    assert.equal(count(OUT[kind], `${start}\n`), 1, `${kind}: block inserted once`);
    assert.equal(count(OUT[kind], `${end}\n`), 1);
    const inline = OUT[kind].split("\n").filter((line) => line.includes(MARKER) && !line.startsWith(`// ${MARKER}`)).length;
    assert.equal(inline, { ingress: 2, dispatch: 14 }[kind], `${kind}: inline insertions`);
    assert.equal(count(OUT[kind], MARKER), inline + 2, `${kind}: no other marker`);
  }
  // the anchors that are V's own Telegram experience code (stacking proof)
  for (const name of ["helpers", "deliver-question-answerer", "turn-question-answerer", "background-line"]) assert.match(ANCHORS.dispatch[name], /vResume|vMakeRoomForQuestion|vLineMessageId/u, name);
});

test("patching twice, unstacked bytes or a changed chunk are refused", () => {
  assert.throws(() => patchTelegramIngress(OUT.ingress), /already patched/u);
  assert.throws(() => patchTelegramDispatch(OUT.dispatch), /already patched/u);
  assert.throws(() => patchTelegramIngress(V.ingress.replaceAll(BASE_MARKER, "x")), /stacks on V's Telegram experience bytes/u);
  assert.throws(() => patchTelegramDispatch(V.dispatch.replaceAll(BASE_MARKER, "x")), /stacks on V's Telegram experience bytes/u);
  for (const kind of ["ingress", "dispatch"]) {
    const fn = kind === "ingress" ? patchTelegramIngress : patchTelegramDispatch;
    for (const [name, anchor] of Object.entries(ANCHORS[kind])) {
      assert.throws(() => fn(V[kind].replace(anchor, "")), new RegExp(`anchor "${name}": expected exactly one anchor, found 0`, "u"));
      assert.throws(() => fn(V[kind] + anchor), new RegExp(`anchor "${name}": expected exactly one anchor, found 2`, "u"));
    }
  }
});

// ---------------------------------------------------------------- 2. contracts

test("the inlined literals equal the frozen contracts", () => {
  assert.equal(MARKER, contracts.MARKERS.telegramBridge);
  assert.equal(INLINED.bridgesSymbolKey, contracts.SYMBOL_KEYS.bridges);
  assert.equal(Symbol.for(INLINED.bridgesSymbolKey), contracts.BRIDGES);
  assert(contracts.CHANNELS.includes(INLINED.channel));
  assert.deepEqual({ ...INLINED.caps }, { ...contracts.CHANNEL_CAPS.telegram });
  assert.deepEqual([...INLINED.busyReasons], [...contracts.BUSY_REASONS]);
  assert.equal(new RegExp(INLINED.restartWedgeSource, "u").source, contracts.RESTART_WEDGE_RE.source);
  assert.equal(contracts.syntheticMessageIdFor("telegram", "request", "s_mgk3x1a2f9c1d2e3", 0), contracts.messageSidFor("request", "s_mgk3x1a2f9c1d2e3", 0), "Telegram's synthetic message id is the MessageSid (messageIdOverride)");
  // and the generated code carries exactly those literals
  const block = between(OUT.ingress, INGRESS_BLOCK_START, INGRESS_BLOCK_END);
  assert.match(block, new RegExp(`const V_TELEGRAM_INTER_SESSION_BRIDGES = "${contracts.SYMBOL_KEYS.bridges.replaceAll(".", "\\.")}";`, "u"));
  assert.match(block, /const V_TELEGRAM_INTER_SESSION_RESTART_WEDGE_RE = \/restart recovery claim changed\/u;/u);
  assert.match(block, /const V_TELEGRAM_INTER_SESSION_BUSY_REASONS = \["active_run", "pending_queue", "recovery_owner"\];/u);
});

// ---------------------------------------------------------------- static shape of the generated code

test("ingress: bridge registered after the pipeline exists, removed in the bot's stop wrapper", () => {
  const handlers = between(OUT.ingress, "const registerTelegramHandlers = (params) => {", "\n};\n");
  const lines = handlers.split("\n").map((l) => l.trim());
  assert.equal(lines[1], "const message = createTelegramMessagePipeline(params);");
  assert.equal(lines[2], "const authorization = createTelegramHandlerAuthorization(params);");
  assert.equal(lines[3], `vRegisterTelegramInterSessionBridge(params, message, authorization); // ${MARKER}`);
  const stop = between(OUT.ingress, "\tbot.stop = ((...args) => {", "\t});\n");
  const unregisterAt = stop.indexOf("\t\tvUnregisterTelegramInterSessionBridge(bot); //");
  assert(unregisterAt >= 0 && unregisterAt < stop.indexOf("return originalStop(...args);"), "the stop wrapper unregisters before it stops the bot");
  const block = between(OUT.ingress, INGRESS_BLOCK_START, INGRESS_BLOCK_END);
  assert.match(block, /update: \{ vInterSession: turn \}/u, "the synthetic update carries the turn and no update_id");
  assert.doesNotMatch(block, /update_id/u);
  assert.match(block, /forceWasMentioned: true,\n\t+messageIdOverride: req\.messageSid,/u);
  assert.match(block, /dmAccess: "silent"/u, "access is checked without a pairing challenge");
  assert.doesNotMatch(block, /parse_mode/u, "posts are plain text");
  assert.doesNotMatch(block, /handleUpdate|sequentialize/u, "the synthetic message bypasses the update tracker and the per-chat sequencer");
});

test("dispatch: context fields last in extra, reply options last, not-started turns stop before every fallback", () => {
  const extra = between(OUT.dispatch, "\t\textra: {\n\t\t\tBotUsername: primaryCtx.me?.username ?? void 0,", "\n\t\t}\n\t});\n");
  assert.match(extra, /TopicName: isForum && topicName \? topicName : void 0,\n\t+\.\.\.vTelegramInterSessionCtxFields\(primaryCtx\) \/\/ [^\n]+\n\t\t\}\n\t\}\);\n$/u, "spread last so it overrides SenderId / CommandAuthorized / MessageSid");
  assert.match(OUT.dispatch, /if \(isGroup && historyKey && !vTelegramInterSessionFromCtx\(primaryCtx\)\) recordTelegramGroupHistoryEntry\(/u);
  assert.match(OUT.dispatch, /const shouldSendAckReaction = !vTelegramInterSessionFromCtx\(primaryCtx\) && Boolean\(ackReaction/u, "no ack and no status reactions (the status controller needs the ack)");
  assert.match(OUT.dispatch, /const statusReactionsEnabled = canShowStatusReaction && statusReactionsConfig\?\.enabled === true && Boolean\(reactionApi\) && shouldSendAckReaction;/u);
  const turn = between(OUT.dispatch, "async function runTelegramDispatchTurn(turn) {", "\n}\n");
  assert.match(turn, /^async function runTelegramDispatchTurn\(turn\) \{\n\tconst \{ context \} = turn;\n\tif \(!vTelegramInterSessionAdmit\(context\)\) return false;/u, "route check before anything else");
  assert.match(turn, /\t+onModelSelected,\n\t+\.\.\.vTelegramInterSessionReplyOptions\(context\) \/\/ [^\n]+\n\t+\}\n\t+\}\)/u);
  const dispatch = between(OUT.dispatch, "const dispatchTelegramMessage = async (dispatchParams) => {", "\n};\n");
  const notStarted = dispatch.indexOf("if (vInterSessionTurn && !vInterSessionTurn.started) {");
  assert(notStarted > dispatch.indexOf("dispatchWasSuperseded = isDispatchSuperseded();"));
  for (const sideEffect of ["deliverFallback(", "status.finalizeInBackground(", "scheduleDmTopicLabel("]) {
    assert(dispatch.indexOf(sideEffect) > notStarted, `${sideEffect} comes after the not-started return`);
  }
  assert.doesNotMatch(OUT.dispatch, /senderId: (?:turn\.)?context\.ctxPayload\.SenderId/u, "questions go to askUserAnswererId, not to the permission identity");
});

// ---------------------------------------------------------------- 3. the bridge against the fake Bot API

/** The generated bridge block, evaluated in strict mode with its two module imports and a private globalThis. */
function loadBridgeBlock(fakeGlobal = {}) {
  const block = between(OUT.ingress, INGRESS_BLOCK_START, INGRESS_BLOCK_END);
  const logs = [];
  const exportsOf = new Function("globalThis", "normalizeAccountId", "logVerbose", "resolveTelegramBotHasTopicsEnabled", "resolveTelegramMessageThreadSpec", `"use strict";\n${block}\nreturn { vCreateTelegramInterSessionBridge, vCreateTelegramInterSessionTurn, vRegisterTelegramInterSessionBridge, vUnregisterTelegramInterSessionBridge, vTelegramBridgeErrorFrom, vTelegramTargetFromSessionKey, vTelegramTargetFromDelivery, vTelegramInterSessionPromptBounds };`);
  // the two chunk imports the bounds helper uses (helpers-DEd6NfQU.js): topics off; a plain thread spec
  const topicsEnabled = (me) => me?.has_topics_enabled === true;
  const threadSpecOf = (msg) => ({ id: msg?.message_thread_id, scope: msg?.chat?.type === "private" ? "dm" : "none" });
  return { ...exportsOf(fakeGlobal, contracts.normalizeAccountId, (line) => logs.push(line), topicsEnabled, threadSpecOf), logs, fakeGlobal };
}
/** The generated turn helpers of the dispatch chunk. */
function loadTurnHelpers() {
  const block = between(OUT.dispatch, DISPATCH_BLOCK_START, DISPATCH_BLOCK_END);
  return new Function(`"use strict";\n${block}\nreturn { vTelegramInterSessionFromCtx, vTelegramInterSessionOf, vTelegramInterSessionCtxFields, vTelegramInterSessionAdmit, vTelegramInterSessionReplyOptions, vTelegramInterSessionAnswerer, vTelegramInterSessionCaptureFinal };`)();
}
/** V's own buildSyntheticTextMessage from the ingress chunk. */
const buildSyntheticTextMessage = new Function(`"use strict";\n${between(OUT.ingress, "function buildSyntheticTextMessage(params) {", "\n}\n")}\nreturn buildSyntheticTextMessage;`)();
/** V's own prompt-context bound helpers from the ingress chunk (what handleInboundMessageLike passes). */
const boundHelpers = new Function("asFiniteNumber", `"use strict";\n${between(OUT.ingress, "const normalizePromptContextMinTimestampMs = ", ";\n")}\n${between(OUT.ingress, "function promptContextBoundaryOptions(timestampMs, ambientWatermark) {", "\n}\n")}\nreturn { normalizePromptContextMinTimestampMs, promptContextBoundaryOptions };`)((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));
const SESSION_STARTED_AT = 1760000000000;
const WATERMARK = { messageId: "41", timestampMs: 1760000500000 };

/** A small grammY-shaped Bot API client for the fake server (errors look like GrammyError). */
function botApi(port) {
  const call = async (method, params) => {
    const res = await fetch(`http://127.0.0.1:${port}/bot${FAKE_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params) });
    const body = await res.json();
    if (!body.ok) {
      const error = new Error(`Call to '${method}' failed! (${body.error_code}: ${body.description})`);
      Object.assign(error, { name: "GrammyError", error_code: body.error_code, description: body.description, method });
      throw error;
    }
    return body.result;
  };
  return {
    sendMessage: (chat_id, text, other = {}) => call("sendMessage", { chat_id, text, ...other }),
    getChat: (chat_id) => call("getChat", { chat_id }),
    setMessageReaction: (chat_id, message_id, reaction) => call("setMessageReaction", { chat_id, message_id, reaction }),
    sendChatAction: (chat_id, action) => call("sendChatAction", { chat_id, action }),
  };
}

const OWNER = "5368086561";
const OTHER = "70000002";
const GROUP = "-1001234567890";
const AGENT = "makaron";
const SEND_ID = "s_mgk3x1a2f9c1d2e3";
const CHAIN_ID = "c_mgk3x0z0a1b2c3d4e";

function startRequest(route, { kind = "request", id = SEND_ID, attempt = 0, sessionKey, anchorMessageId = null, sender, routePeerId, askUserAnswererId = OWNER } = {}) {
  const ids = contracts.startIds({ channel: "telegram", kind, id, attempt });
  const req = {
    route,
    sessionKey: sessionKey ?? (route.chatType === "group" ? `agent:${AGENT}:telegram:group:${route.chatId}` : `agent:${AGENT}:telegram:direct:${route.chatId}`),
    agentId: AGENT,
    kind, id, attempt, ...ids,
    anchorMessageId,
    promptText: "请把三个房间的进度汇总成一段话。",
    channelPromptContext: "这是另一个会话交来的请求。",
    provenance: { kind: "inter_session", sourceSessionKey: `agent:${AGENT}:feishu:direct:ou_0123abcd`, sourceChannel: "feishu", sourceTool: "sessions_send", originSessionId: contracts.originSessionIdFor({ chainId: CHAIN_ID, depth: 1, kind, id }) },
    sender: sender ?? { id: OWNER, name: "「Tianyi 私聊」的 V（会话协作）", isOwnerIdentity: true },
    routePeerId: routePeerId ?? (route.chatType === "direct" ? route.peerId : OWNER),
    askUserAnswererId,
  };
  const check = contracts.validateStartRequest(req);
  assert(check.ok, check.errors.join("; "));
  return req;
}

/**
 * Stands in for bot-message's processMessage + the core: builds the context the way the patched
 * dispatch chunk does (helpers from the generated file), then plays the core's §3.3 admission guard
 * (BUSY via vInterSession.onBusy) or a run (onAgentRunStart, final deliveries).
 */
function simulatedPipeline({ helpers, api }) {
  const script = [];
  const seen = [];
  const sessionCalls = [];
  return {
    seen,
    sessionCalls,
    queue: (...items) => script.push(...items),
    buildSyntheticTextMessage,
    // the pipeline's session runtime (createTelegramMessageSessionRuntime), as handleInboundMessageLike uses it
    resolveTelegramSessionState(p) {
      sessionCalls.push({ state: p });
      return { agentId: AGENT, sessionKey: `agent:${AGENT}:telegram:${p.isGroup ? "group" : "direct"}:${p.chatId}`, storePath: "/state/agents/makaron/sessions", sessionEntry: { sessionStartedAt: SESSION_STARTED_AT } };
    },
    resolvePromptContextAmbientWatermark(p) {
      sessionCalls.at(-1).watermark = p;
      return p.isGroup ? WATERMARK : undefined;
    },
    ...boundHelpers,
    async processMessageWithReplyChain(params) {
      const step = script.shift() ?? {};
      const { ctx, msg, options } = params;
      const turn = helpers.vTelegramInterSessionFromCtx(ctx);
      if (step.drop) return { kind: "skipped" };
      const routeKey = step.routeKey ?? turn.req.sessionKey; // where Telegram's own routing puts the chat
      const ctxPayload = { SessionKey: routeKey, MessageSid: options.messageIdOverride, SenderId: String(msg.from.id), CommandAuthorized: true, ...helpers.vTelegramInterSessionCtxFields(ctx) };
      const context = { primaryCtx: ctx, route: { sessionKey: routeKey }, ctxPayload, chatId: msg.chat.id };
      seen.push({ params, ctxPayload });
      if (!helpers.vTelegramInterSessionAdmit(context)) {
        helpers.vTelegramInterSessionOf(context).noteNotStarted(void 0);
        return { kind: "completed" };
      }
      const opts = { onModelSelected() {}, ...helpers.vTelegramInterSessionReplyOptions(context) };
      seen.at(-1).opts = opts;
      if (step.throwBeforeRun) throw new Error(step.throwBeforeRun);
      const guard = opts.vInterSession ?? ctxPayload.VInterSession;
      if (guard?.exclusive === true && step.busy) {
        guard.onBusy({ reason: step.busy, activeSessionId: "sess-active" });
        helpers.vTelegramInterSessionOf(context).noteNotStarted(void 0);
        return { kind: "completed" };
      }
      seen.at(-1).context = context;
      const deliverFinals = async (payloads) => {
        for (const payload of payloads ?? []) {
          helpers.vTelegramInterSessionCaptureFinal(context, payload, { kind: "final" });
          if (payload.text && typeof api.sendMessage === "function") await api.sendMessage(Number(msg.chat.id), payload.text);
        }
      };
      if (step.failBeforeRunStart) {
        // executeAgentTurn failed before its harness took the turn: no onAgentRunStart, an error
        // final, terminal outcome "failed"; dispatchTelegramMessage then takes its not-started exit
        await deliverFinals(step.finals);
        opts.onAgentRunTerminalOutcome?.("failed");
        helpers.vTelegramInterSessionOf(context).noteNotStarted(void 0, (step.finals ?? []).some((p) => p.text));
        return { kind: "completed" };
      }
      opts.onAgentRunStart(step.reportRunId ?? opts.runId);
      if (step.holdRun) await step.holdRun;
      await deliverFinals(step.finals);
      if (step.rerun) {
        // stranded-reply recovery runs the same turn once more: a second onAgentRunStart for this start
        opts.onAgentRunStart(opts.runId);
        await deliverFinals(step.rerun);
      }
      if (step.terminal) opts.onAgentRunTerminalOutcome?.(step.terminal);
      helpers.vTelegramInterSessionCaptureFinal(context, { text: "block text" }, { kind: "block" });
      helpers.vTelegramInterSessionOf(context).noteDispatchEnd({ agentRunFailed: step.agentRunFailed === true, dispatchError: void 0, visibleReplySent: step.visible ?? (step.finals ?? []).some((p) => p.text) });
      if (step.throwAfterRun) throw new Error(step.throwAfterRun);
      return { kind: "completed" };
    },
  };
}

const RUNTIME_CFG = Object.freeze({ session: { store: "/state/agents/{agentId}/sessions" } });
function allowAll(log = []) {
  return { async authorizeInboundMessage(p) { log.push(p); return { allowed: true, context: { cfg: RUNTIME_CFG, storeAllowFrom: ["5368086561"], threadSpec: { scope: "none" }, resolvedThreadId: undefined }, resolveChannelIngress: () => ({ admitted: true }) }; } };
}

async function withFakeTelegram(fn) {
  const fake = createFakeTelegramBotApi();
  const port = await fake.listen();
  try {
    return await fn(fake, botApi(port));
  } finally {
    await fake.close();
  }
}

test("bridge: one registry entry per account, shared with the plugin's contracts; stop removes only its own", () => {
  const fakeGlobal = {};
  const mod = loadBridgeBlock(fakeGlobal);
  const reg = contracts.getBridgeRegistry(fakeGlobal);
  const heard = [];
  reg.listeners.add((key, bridge) => heard.push([key, bridge === null ? null : bridge.channel]));
  reg.listeners.add(() => { throw new Error("a broken listener"); });
  const botA = { botInfo: { id: 100000001 } };
  const botB = { botInfo: { id: 100000001 } };
  const pipeline = { buildSyntheticTextMessage, processMessageWithReplyChain: async () => ({ kind: "completed" }) };
  mod.vRegisterTelegramInterSessionBridge({ accountId: "Default", bot: botA, opts: {} }, pipeline, allowAll());
  const first = reg.bridges.get("telegram:default");
  assert(first, "registered under telegram:<normalized account>");
  assert.equal(contracts.bridgeKey(first.channel, first.accountId), "telegram:default");
  const valid = contracts.validateBridge(first);
  assert(valid.ok, valid.errors.join("; "));
  assert.deepEqual({ ...first.caps }, { ...contracts.CHANNEL_CAPS.telegram });
  assert.equal(first.edit, undefined, "Telegram anchors are not edited (caps.editPost=false)");
  // a new polling cycle creates a new bot before the old one is stopped
  mod.vRegisterTelegramInterSessionBridge({ accountId: "default", bot: botB, opts: {} }, pipeline, allowAll());
  const second = reg.bridges.get("telegram:default");
  assert.notEqual(second, first);
  mod.vUnregisterTelegramInterSessionBridge(botA);
  assert.equal(reg.bridges.get("telegram:default"), second, "the old bot's stop leaves the new bridge alone");
  mod.vUnregisterTelegramInterSessionBridge(botB);
  mod.vUnregisterTelegramInterSessionBridge(botB);
  assert.equal(reg.bridges.has("telegram:default"), false);
  assert.deepEqual(heard, [["telegram:default", "telegram"], ["telegram:default", "telegram"], ["telegram:default", null]]);
  // the plugin's own registry helpers see the same entries
  mod.vRegisterTelegramInterSessionBridge({ accountId: "ops-bot", bot: botA, opts: {} }, pipeline, allowAll());
  assert.equal(contracts.unregisterBridge(reg.bridges.get("telegram:ops-bot"), reg), true);
  // registration never throws into Telegram startup
  const errors = [];
  mod.vRegisterTelegramInterSessionBridge({ accountId: "x", bot: null, opts: {}, runtime: { error: (m) => errors.push(m) } }, pipeline, allowAll());
  assert.match(errors[0] ?? "", /inter-session bridge not registered/u);
});

test("bridge: resolveRoute from the stored delivery or the session key; humans, labels, gone chats", async () => {
  await withFakeTelegram(async (fake, api) => {
    const { vCreateTelegramInterSessionBridge } = loadBridgeBlock();
    const bridge = vCreateTelegramInterSessionBridge({ accountId: "default", bot: { api, botInfo: { id: 1 } }, message: {}, authorization: allowAll(), normalizeAccountId: contracts.normalizeAccountId });
    fake.setChat({ chatId: GROUP, title: "任务群 a" });
    const owners = [OWNER];
    const dm = await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:telegram:direct:${OWNER}`, agentId: AGENT, ownerIds: owners });
    assert.deepEqual(dm, { ok: true, route: { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" } });
    const other = await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:telegram:default:direct:${OTHER}`, agentId: AGENT, ownerIds: [`telegram:${OWNER}`] });
    assert.equal(other.route.humans, "single_peer");
    assert.equal(other.route.chatId, OTHER, "per-account-channel-peer keys carry the account segment");
    const group = await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:telegram:group:${GROUP}`, agentId: AGENT, ownerIds: owners });
    assert.deepEqual(group.route, { channel: "telegram", accountId: "default", to: GROUP, chatId: GROUP, chatType: "group", humans: "shared", label: "任务群 a" });
    // the stored delivery wins over the key (main sessions, per-peer keys); topics stay with the route
    const main = await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:main`, agentId: AGENT, ownerIds: owners, delivery: { channel: "telegram", to: `telegram:${GROUP}:topic:7`, accountId: "default" } });
    assert.equal(main.route.chatId, GROUP);
    assert.equal(main.route.threadId, "7");
    for (const r of [dm, other, group, main]) assert(contracts.validateRoute(r.route).ok, JSON.stringify(r));
    assert.equal(fake.callsOf("getChat").length, 3, "getChat once per chat (cached)");
    // no address at all
    assert.deepEqual(await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:main`, agentId: AGENT, ownerIds: owners }), { ok: false, code: "NO_ROUTE", reason: "no Telegram chat id in the session's delivery address or key" });
    const elsewhere = await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:telegram:direct:${OWNER}`, agentId: AGENT, ownerIds: owners, delivery: { channel: "telegram", to: OWNER, accountId: "ops" } });
    assert.equal(elsewhere.code, "NO_ROUTE", "another account's session is not this bridge's");
    // gone chats are reported at accept time; a flaky getChat only loses the label
    fake.failNext("getChat", { status: 400, description: "Bad Request: chat not found" });
    assert.equal((await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:telegram:group:-1009`, agentId: AGENT, ownerIds: owners })).code, "CHAT_GONE");
    fake.failNext("getChat", { status: 403, description: "Forbidden: bot was kicked from the supergroup chat" });
    assert.equal((await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:telegram:group:-1008`, agentId: AGENT, ownerIds: owners })).code, "NOT_MEMBER");
    fake.failNext("getChat", { status: 502, description: "Bad Gateway" });
    const flaky = await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:telegram:group:-1007`, agentId: AGENT, ownerIds: owners });
    assert.equal(flaky.ok, true);
    assert.equal(flaky.route.label, undefined);
  });
});

test("bridge: post sends plain text through the Bot API; errors are BridgeErrors with the right code", async () => {
  await withFakeTelegram(async (fake, api) => {
    const { vCreateTelegramInterSessionBridge } = loadBridgeBlock();
    const bridge = vCreateTelegramInterSessionBridge({ accountId: "default", bot: { api, botInfo: { id: 1 } }, message: {}, authorization: allowAll(), normalizeAccountId: contracts.normalizeAccountId });
    const route = (await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:telegram:group:${GROUP}`, agentId: AGENT, ownerIds: [OWNER] })).route;
    const anchor = await bridge.post({ route, text: "📨 来自「Tianyi 私聊」的请求 #7F3A\n—\n汇总进度", idempotencyKey: "k1" });
    assert.match(anchor.messageId, /^\d+$/u);
    const sent = fake.messages().find((m) => String(m.messageId) === anchor.messageId);
    assert.equal(sent.chatId, GROUP);
    assert.equal(sent.text, "📨 来自「Tianyi 私聊」的请求 #7F3A\n—\n汇总进度");
    assert.equal(sent.parseMode, undefined, "plain text");
    const reply = await bridge.post({ route, text: "⚠️ #7F3A 没有开始", idempotencyKey: "k2", replyToMessageId: anchor.messageId });
    assert.equal(fake.messages().find((m) => String(m.messageId) === reply.messageId).replyTo, Number(anchor.messageId));
    const long = await bridge.post({ route, text: "字".repeat(5000), idempotencyKey: "k3" });
    assert.equal(fake.messages().find((m) => String(m.messageId) === long.messageId).text.length, 4096, "never over Telegram's 4096 limit");
    const topic = await bridge.post({ route: { ...route, threadId: "7" }, text: "topic", idempotencyKey: "k4" });
    assert.equal(fake.callsOf("sendMessage").at(-1).params.message_thread_id, 7);
    assert.ok(topic.messageId);
    const cases = [
      [{ status: 403, description: "Forbidden: bot was kicked from the supergroup chat" }, "NOT_MEMBER", false],
      [{ status: 403, description: "Forbidden: bot was blocked by the user" }, "NOT_MEMBER", false],
      [{ status: 400, description: "Bad Request: chat not found" }, "CHAT_GONE", false],
      [{ status: 400, description: "Bad Request: group chat was upgraded to a supergroup chat" }, "CHAT_GONE", false],
      [{ status: 429, description: "Too Many Requests: retry after 3" }, "CHANNEL_DOWN", true],
      [{ status: 500, description: "Internal Server Error" }, "CHANNEL_DOWN", true],
      [{ status: 400, description: "Bad Request: message is too long" }, "POST_FAILED", false],
    ];
    for (const [failure, code, transient] of cases) {
      fake.failNext("sendMessage", failure);
      await assert.rejects(bridge.post({ route, text: "x", idempotencyKey: "k" }), (err) => {
        assert(contracts.isBridgeError(err), `${failure.description}: ${err}`);
        assert.equal(err.code, code, failure.description);
        assert.equal(err.transient, transient, failure.description);
        return true;
      });
    }
    // a network failure (grammY HttpError has no error_code)
    const down = vCreateTelegramInterSessionBridge({ accountId: "default", bot: { api: { sendMessage: async () => { throw new Error("Network request for 'sendMessage' failed!"); } } }, message: {}, authorization: allowAll(), normalizeAccountId: contracts.normalizeAccountId });
    await assert.rejects(down.post({ route, text: "x", idempotencyKey: "k" }), (err) => err.code === "CHANNEL_DOWN" && err.transient === true);
    await assert.rejects(bridge.post({ route: { ...route, accountId: "ops" }, text: "x", idempotencyKey: "k" }), (err) => err.code === "POST_FAILED");
    await assert.rejects(bridge.post({ route, text: "  ", idempotencyKey: "k" }), (err) => err.code === "POST_FAILED");
  });
});

test("bridge: start runs one synthetic message; started, busy and rejected outcomes follow the contract", async () => {
  await withFakeTelegram(async (fake, api) => {
    const { vCreateTelegramInterSessionBridge } = loadBridgeBlock();
    const helpers = loadTurnHelpers();
    fake.setChat({ chatId: GROUP, title: "任务群 a" });
    const pipeline = simulatedPipeline({ helpers, api });
    const gates = [];
    const bot = { api, botInfo: { id: 100000001, is_bot: true, username: "v_candidate_bot" } };
    const bridge = vCreateTelegramInterSessionBridge({ accountId: "default", bot, message: pipeline, authorization: allowAll(gates), normalizeAccountId: contracts.normalizeAccountId });
    const route = (await bridge.resolveRoute({ sessionKey: `agent:${AGENT}:telegram:group:${GROUP}`, agentId: AGENT, ownerIds: [OWNER] })).route;
    const anchor = await bridge.post({ route, text: "📨 请求 #7F3A", idempotencyKey: "k" });
    const callsBefore = fake.calls.length;

    // BUSY: the core guard reports busy; nothing reaches the chat
    pipeline.queue({ busy: "active_run" });
    const busyReq = startRequest(route, { anchorMessageId: anchor.messageId });
    const busy = await bridge.start(busyReq);
    assert.deepEqual(busy, { status: "busy", reason: "active_run" });
    assert(contracts.validateStartOutcome(busy).ok);
    assert.equal(fake.calls.length, callsBefore, "BUSY: zero Bot API calls (no message, edit, reaction or chat action)");
    const seen = pipeline.seen.at(-1);
    assert.equal(seen.params.msg.message_id, Number(anchor.messageId), "the synthetic message is based on the anchor");
    assert.equal(seen.params.msg.from.id, Number(OWNER), "sent by the routing peer");
    assert.equal(seen.params.msg.from.is_bot, false);
    assert.equal(seen.params.msg.text, busyReq.promptText, "the full prompt, untrimmed");
    assert.equal(seen.params.msg.chat.title, "任务群 a");
    assert.deepEqual(Object.keys(seen.params.ctx.update), ["vInterSession"], "no update_id");
    assert.equal(seen.params.ctx.me.id, 100000001);
    assert.equal(seen.params.options.forceWasMentioned, true);
    assert.equal(seen.params.options.messageIdOverride, busyReq.messageSid);
    assert.deepEqual(seen.params.storeAllowFrom, ["5368086561"]);
    assert.equal(typeof seen.params.options.channelIngressResolvers[0], "function");
    // the prompt-context bounds of a person's message in this chat: session start and the group watermark
    assert.equal(seen.params.options.promptContextMinTimestampMs, SESSION_STARTED_AT, "no chat history from before the session started");
    assert.deepEqual(seen.params.options.promptContextAmbientWatermark, WATERMARK, "no group messages the transcript already has");
    const sessionCall = pipeline.sessionCalls.at(-1);
    assert.deepEqual({ ...sessionCall.state, threadSpec: sessionCall.state.threadSpec }, { chatId: Number(GROUP), isGroup: true, threadSpec: { scope: "none" }, botHasTopicsEnabled: false, senderId: OWNER, runtimeCfg: RUNTIME_CFG });
    assert.deepEqual(sessionCall.watermark, { chatId: Number(GROUP), isGroup: true, resolvedThreadId: undefined, sessionKey: busyReq.sessionKey, storePath: "/state/agents/makaron/sessions" });
    assert.equal(gates.at(-1).dmAccess, "silent");
    assert.equal(gates.at(-1).senderId, OWNER);
    // the context fields of §2.a
    assert.deepEqual({ ...seen.ctxPayload, VInterSession: "[object]" }, {
      SessionKey: busyReq.sessionKey,
      MessageSid: busyReq.messageSid,
      SenderId: busyReq.sender.id,
      CommandAuthorized: false,
      InputProvenance: busyReq.provenance,
      ChannelPromptContext: [busyReq.channelPromptContext], // 9.1's string[]
      CommandInterpretationSuppressed: true,
      SenderName: busyReq.sender.name,
      VInterSession: "[object]",
    });
    assert.equal(seen.ctxPayload.VInterSession, seen.opts.vInterSession, "ctx.VInterSession is the same object as replyOptions.vInterSession");
    assert.deepEqual({ ...seen.opts.vInterSession, onBusy: typeof seen.opts.vInterSession.onBusy }, { exclusive: true, id: SEND_ID, kind: "request", onBusy: "function" });
    assert.equal(seen.opts.runId, busyReq.runId);

    // retry, started: the preset runId is reported; done carries the finals
    let release;
    pipeline.queue({ holdRun: new Promise((r) => { release = r; }), finals: [{ text: "三个房间都在推进。", mediaUrls: ["/tmp/a.png"], mediaUrl: "/tmp/a.png" }, { text: "", channelData: { askUser: { questionId: "q1" } } }, { text: "补充：b 等 c。" }, { isReasoning: true, text: "思考" }] });
    const req = startRequest(route, { attempt: 1, anchorMessageId: anchor.messageId });
    const started = await bridge.start(req);
    assert.equal(started.status, "started");
    assert.equal(started.runId, "v-a2a-req-s_mgk3x1a2f9c1d2e3-1");
    assert(contracts.validateStartOutcome(started).ok);
    let settled = false;
    started.done.then(() => { settled = true; });
    await new Promise((r) => setImmediate(r));
    assert.equal(settled, false, "started resolves at run start, done at the end");
    release();
    const run = await started.done;
    assert(contracts.validateRunOutcome(run).ok, contracts.validateRunOutcome(run).errors.join("; "));
    assert.deepEqual(run, { status: "ok", finals: [{ text: "三个房间都在推进。", mediaUrls: ["/tmp/a.png"] }, { text: "补充：b 等 c。" }], visibleReplySent: true, finalCount: 2 });

    // a harness that does not take the preset runId reports its own (A2 fallback)
    pipeline.queue({ reportRunId: "8d2f9d6e-0000-4000-8000-000000000001", agentRunFailed: true });
    const own = await bridge.start(startRequest(route, { attempt: 2, anchorMessageId: anchor.messageId }));
    assert.equal(own.runId, "8d2f9d6e-0000-4000-8000-000000000001");
    assert.deepEqual(await own.done, { status: "error", finals: [], visibleReplySent: false, finalCount: 0, error: "the agent run failed" });

    // the run threw after it started: done reports the error
    pipeline.queue({ throwAfterRun: "model provider exploded" });
    const crashed = await bridge.start(startRequest(route, { attempt: 3 }));
    assert.equal((await crashed.done).error, "model provider exploded");

    // rejected outcomes
    const rejectedCases = [
      [{ throwBeforeRun: "restart recovery claim changed for agent:makaron:telegram:group" }, {}, "RESTART_WEDGE"],
      [{ throwBeforeRun: "sqlite busy" }, {}, "INTERNAL"],
      [{ drop: true }, {}, "GATED"],
      [{ routeKey: `agent:short-v:telegram:group:${GROUP}` }, {}, "ROUTE_MISMATCH"],
    ];
    let attempt = 4;
    for (const [step, overrides, code] of rejectedCases) {
      pipeline.queue(step);
      const before = fake.calls.length;
      const out = await bridge.start(startRequest(route, { attempt: attempt++, ...overrides }));
      assert.equal(out.status, "rejected", JSON.stringify(step));
      assert.equal(out.code, code, JSON.stringify(step));
      assert.equal(out.started, false);
      assert(contracts.validateStartOutcome(out).ok);
      assert.equal(fake.calls.length, before, `${code}: nothing visible`);
    }
  });
});

test("bridge: start refuses what it cannot carry, before touching the pipeline", async () => {
  const { vCreateTelegramInterSessionBridge } = loadBridgeBlock();
  const helpers = loadTurnHelpers();
  const processed = [];
  const pipeline = { buildSyntheticTextMessage, processMessageWithReplyChain: async (p) => { processed.push(p); return { kind: "completed" }; } };
  const make = (bot, authorization = allowAll()) => vCreateTelegramInterSessionBridge({ accountId: "default", bot, message: pipeline, authorization, normalizeAccountId: contracts.normalizeAccountId });
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  const req = startRequest(route);
  const ready = make({ api: {}, botInfo: { id: 1 } });
  assert.equal((await ready.start({ ...req, route: { ...route, accountId: "ops" } })).code, "ROUTE_MISMATCH");
  assert.equal((await ready.start({ ...req, route: { ...route, channel: "feishu" } })).code, "ROUTE_MISMATCH");
  assert.equal((await ready.start({ ...req, routePeerId: "v-a2a:" + CHAIN_ID })).code, "NO_ROUTE", "a synthetic id is never a Telegram user");
  // grammY's botInfo getter throws until bot.init(); without opts.botInfo the bridge waits for it
  const starting = make({ api: {}, get botInfo() { throw new Error("Bot information unavailable!"); } });
  assert.equal((await starting.start(req)).code, "CHANNEL_DOWN");
  const refused = make({ api: {}, botInfo: { id: 1 } }, { authorizeInboundMessage: async () => ({ allowed: false }) });
  assert.equal((await refused.start(req)).code, "GATED");
  const broken = make({ api: {}, botInfo: { id: 1 } }, { authorizeInboundMessage: async () => { throw new Error("restart recovery claim changed"); } });
  assert.equal((await broken.start(req)).code, "RESTART_WEDGE");
  assert.equal(processed.length, 0);
  // a direct chat without a cached chat object becomes a private chat of the peer
  const direct = make({ api: {}, botInfo: { id: 1 } });
  const pending = direct.start(req);
  await new Promise((r) => setImmediate(r));
  assert.equal(processed.length, 1);
  assert.deepEqual(processed[0].msg.chat, { id: Number(OWNER), type: "private", first_name: req.sender.name });
  assert.equal(processed[0].msg.message_id, undefined, "no anchor: no message id (the reply is not threaded)");
  assert.equal((await pending).code, "GATED", "a handler that neither started nor reported busy");
  assert.equal(helpers.vTelegramInterSessionFromCtx(processed[0].ctx).req, req);
});

test("bridge: a turn gets the prompt-context bounds of a person's message; a failed session lookup only loses them", async () => {
  const { vCreateTelegramInterSessionBridge } = loadBridgeBlock();
  const helpers = loadTurnHelpers();
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  const logs = [];
  const make = (pipeline) => vCreateTelegramInterSessionBridge({ accountId: "default", bot: { api: {}, botInfo: { id: 1 } }, message: pipeline, authorization: allowAll(), normalizeAccountId: contracts.normalizeAccountId, log: (line) => logs.push(line) });
  // a direct chat: the session start bounds the chat window; the ambient watermark is for groups only
  const dm = simulatedPipeline({ helpers, api: {} });
  dm.queue({});
  assert.equal((await make(dm).start(startRequest(route))).status, "started");
  const options = dm.seen.at(-1).params.options;
  assert.equal(options.promptContextMinTimestampMs, SESSION_STARTED_AT);
  assert.equal("promptContextAmbientWatermark" in options, false);
  assert.equal(dm.sessionCalls.at(-1).state.senderId, OWNER, "the session is looked up for the routing peer, like the message itself");
  // a chat that has no session yet: no lower bound (stock behaviour)
  const fresh = simulatedPipeline({ helpers, api: {} });
  fresh.resolveTelegramSessionState = (p) => ({ sessionKey: `agent:${AGENT}:telegram:direct:${p.chatId}`, storePath: "/s" });
  fresh.queue({});
  assert.equal((await make(fresh).start(startRequest(route, { attempt: 1 }))).status, "started");
  assert.equal("promptContextMinTimestampMs" in fresh.seen.at(-1).params.options, false);
  // the session store cannot be read: the turn still runs, without bounds, and says so in the log
  const broken = simulatedPipeline({ helpers, api: {} });
  broken.resolveTelegramSessionState = () => { throw new Error("session store unreadable"); };
  broken.queue({});
  assert.equal((await make(broken).start(startRequest(route, { attempt: 2 }))).status, "started");
  assert.equal("promptContextMinTimestampMs" in broken.seen.at(-1).params.options, false);
  assert.match(logs.join("\n"), /prompt-context bounds unavailable for chat 5368086561: session store unreadable/u);
});

test("turn helpers: no-ops for ordinary Telegram messages", () => {
  const helpers = loadTurnHelpers();
  const ordinary = { primaryCtx: { update: { update_id: 7, message: {} } }, route: { sessionKey: "k" }, ctxPayload: { SessionKey: "k", SenderId: "42" } };
  assert.equal(helpers.vTelegramInterSessionOf(ordinary), undefined);
  assert.deepEqual(helpers.vTelegramInterSessionCtxFields(ordinary.primaryCtx), {});
  assert.deepEqual(helpers.vTelegramInterSessionReplyOptions(ordinary), {});
  assert.equal(helpers.vTelegramInterSessionAdmit(ordinary), true);
  assert.equal(helpers.vTelegramInterSessionAnswerer(ordinary), "42");
  helpers.vTelegramInterSessionCaptureFinal(ordinary, { text: "x" }, { kind: "final" });
  // a look-alike object on the update is not a turn record
  assert.equal(helpers.vTelegramInterSessionFromCtx({ update: { vInterSession: { req: {} } } }), undefined);
});

// ---------------------------------------------------------------- 4. the real patched dispatch code

/**
 * Evaluates generated bot-message functions with every free identifier taken from `stubs`; an
 * identifier the code reaches that is neither stubbed nor a JS global fails the test.
 */
function loadDispatchCode(stubs, { processorOnly = false } = {}) {
  const helpers = between(OUT.dispatch, DISPATCH_BLOCK_START, DISPATCH_BLOCK_END);
  const processor = between(OUT.dispatch, "const createTelegramMessageProcessor = (deps) => {", "\n};\n");
  // processorOnly: dispatchTelegramMessage comes from the stubs (the processor's neighbour)
  const parts = processorOnly ? [helpers, processor, "const runTelegramDispatchTurn = void 0, deliverReply = void 0;"] : [
    helpers,
    between(OUT.dispatch, "//#region extensions/telegram/src/bot-message-dispatch-status.ts", "//#endregion"),
    between(OUT.dispatch, "//#region extensions/telegram/src/bot-message-dispatch-turn.ts", "//#endregion"),
    between(OUT.dispatch, "async function deliverReply(turn, payload, info) {", "\n}\n"),
    between(OUT.dispatch, "const dispatchTelegramMessage = async (dispatchParams) => {", "\n};\n"),
    processor,
  ];
  const unknown = new Set();
  const scope = new Proxy(stubs, {
    has: (target, key) => typeof key === "string" && (key in target || !(key in globalThis)),
    get: (target, key) => {
      if (key === Symbol.unscopables) return undefined;
      if (key in target) return target[key];
      unknown.add(key);
      throw new ReferenceError(`unstubbed dependency of the generated code: ${String(key)}`);
    },
  });
  const load = new Function("scope", `with (scope) {\n${parts.join("\n")}\nreturn { dispatchTelegramMessage: typeof dispatchTelegramMessage === "function" ? dispatchTelegramMessage : void 0, runTelegramDispatchTurn, deliverReply, createTelegramMessageProcessor };\n}`);
  return { ...load(scope), unknown };
}

/** Stubs for the dispatch code's neighbours; `core` plays runChannelInboundEvent (the core + §3.3 guard). */
function dispatchHarness() {
  const record = { fallbacks: [], watchBackground: 0, statusFinalize: [], typing: 0, sentMessages: [], coreTurns: [], delivered: [], errors: [], questionSenders: [], questionRoutes: [] };
  let step = {};
  const stubs = {
    // dispatchTelegramMessage
    resolveDispatchTelegramContext: ({ context }) => context,
    createFreshTelegramSessionEntryLoader: () => Object.assign(() => ({}), { clear() {} }),
    resolveMarkdownTableMode: () => "code",
    resolveTelegramReasoningLevel: () => "off",
    resolveTelegramQuoteContext: () => ({ replyQuoteByMessageId: {} }),
    getGlobalHookRunner: () => null,
    resolveChunkMode: () => "length",
    getAgentScopedMediaLocalRoots: () => [],
    createDraftState: () => ({ answerLane: { stream: null }, reasoningLane: { stream: null }, lanes: [] }),
    createProgressState: () => ({ progressCompositor: { cancel() {}, reset() {}, beginNewTurn() {} } }),
    createDeliveryState: () => ({ deliveryState: { snapshot: () => ({ delivered: record.delivered.length > 0 && step.deliveryVisible !== false, failedNonSilent: 0, skippedNonSilent: 0 }), markDelivered() {}, markNonSilentFailure() {} } }),
    createReplyState: () => ({}),
    prepareTelegramSticker: async () => {},
    waitForDraftEvents: async () => {},
    finalizePendingAnswerBlockDraft: async () => {},
    cleanupDrafts: async () => {},
    deliverFallback: async (turn, payloads) => { record.fallbacks.push(payloads.map((p) => p.text)); return { delivered: true }; },
    EMPTY_RESPONSE_FALLBACK: "No response generated. Please try again.",
    silentReplyDispatchLogger: { debug() {} },
    scheduleDmTopicLabel: () => {},
    // runTelegramDispatchTurn
    resolveChannelStreamingPreviewToolProgress: () => false,
    telegramInboundEventDelivery: { begin: () => () => {} },
    vTelegramFor: () => ({ deliverQuestion: async ({ senderId }) => { record.questionSenders.push(senderId); return false; } }),
    buildTelegramThreadParams: () => undefined,
    vExperience: { createWorkView: () => ({}), onQuestionRequested: (sessionKey, deliver) => { record.questionRoutes.push(deliver); return () => {}; }, watchBackground: () => { record.watchBackground += 1; } },
    vFormatProgressLine: () => "",
    enqueueDraftEvent: async (turn, fn) => fn(),
    vRenderWork: async () => {},
    vMakeRoomForQuestion: async () => {},
    createChannelReplyPipeline: () => ({ onModelSelected() {} }),
    TELEGRAM_CHAT_ACTION_INTERVAL_MS: 4e3,
    logTypingFailure: () => {},
    logVerbose: () => {},
    handleReplyError: () => {},
    resolveHumanDelayConfig: () => undefined,
    handleBeforeDeliverCancelled: () => {},
    handleReplySkip: () => {},
    hasFinalChannelTurnDispatch: (r) => r?.queuedFinal === true,
    readAgentRunTerminalOutcome: () => (step.agentRunFailed ? "failed" : "completed"),
    async runChannelInboundEvent(params) {
      const input = params.adapter.ingest();
      const resolved = params.adapter.resolveTurn();
      const opts = resolved.replyOptions;
      record.coreTurns.push({ input, opts, ctx: resolved.ctxPayload });
      if (step.throwBeforeRun) throw new Error(step.throwBeforeRun);
      const guard = opts?.vInterSession ?? resolved.ctxPayload?.VInterSession;
      if (guard?.exclusive === true && step.busy) {
        guard.onBusy?.({ reason: step.busy });
        return { dispatched: true, dispatchResult: { queuedFinal: false, noVisibleReplyFallbackEligible: false } };
      }
      opts?.onAgentRunStart?.(opts.runId ?? "8d2f9d6e-0000-4000-8000-00000000000a");
      for (const payload of step.finals ?? []) await resolved.delivery.deliverWithProviderMessageSending(payload, { kind: "final" });
      if (step.terminal !== null) opts?.onAgentRunTerminalOutcome?.(step.terminal ?? (step.agentRunFailed ? "failed" : "completed"));
      if (step.throwAfterRun) throw new Error(step.throwAfterRun);
      return { dispatched: true, dispatchResult: { queuedFinal: (step.finals ?? []).length > 0, noVisibleReplyFallbackEligible: !step.silent } };
    },
    // deliverReply
    vCallGateway: async () => ({}),
    normalizeDeliveryPayload: (turn, payload) => { record.delivered.push(payload); return null; },
    settleTerminalNoVisibleDelivery: async () => ({ delivered: false }),
    // createTelegramMessageProcessor
    resolveTelegramMessageTurnSettings: () => ({ historyLimit: 0, dmHistoryLimit: 0, dmPolicy: "pairing", allowFrom: [], groupAllowFrom: [], ackReactionScope: "group-mentions", replyToMode: "off", streamMode: "off", textLimit: 4096 }),
    shouldLogVerbose: () => false,
    recordTelegramMessageProcessingResult: () => {},
    telegramInboundLog: { info() {} },
    formatTelegramInboundLogLine: () => "",
    isTelegramSpooledReplayUpdate: () => false,
    danger: (text) => text,
  };
  return { stubs, record, setStep: (s) => { step = s; } };
}

function dispatchContext({ turn, sessionKey, routeKey = sessionKey, chatId = OWNER, record }) {
  return {
    primaryCtx: turn ? { update: { vInterSession: turn }, message: {} } : { update: { update_id: 9, message: {} }, message: {} },
    msg: { message_id: 1001, chat: { id: Number(chatId), type: "private" } },
    chatId: Number(chatId),
    isGroup: false,
    threadSpec: { scope: "none" },
    route: { sessionKey: routeKey, agentId: AGENT, accountId: "default" },
    ctxPayload: { SessionKey: routeKey, MessageSid: turn ? turn.req.messageSid : "1001", SenderId: OWNER, InboundEventKind: "message", RawBody: "hi" },
    statusReactionController: { setDone: async () => record.statusFinalize.push("done"), setError: async () => record.statusFinalize.push("error"), restoreInitial: async () => {}, setThinking: () => record.statusFinalize.push("thinking") },
    turn: { record: {} },
    sendTyping: async () => { record.typing += 1; },
  };
}

async function runDispatch(h, mod, { turn, sessionKey, routeKey, step }) {
  h.setStep(step);
  const context = dispatchContext({ turn, sessionKey, routeKey, record: h.record });
  // the real dispatch code takes the status controller from the context; the patch makes it null for a
  // turn (buildTelegramMessageContext's ack switch), so the turn contexts here have none
  if (turn) context.statusReactionController = null;
  const result = await mod.dispatchTelegramMessage({ context, bot: { api: { sendMessage: async (...a) => h.record.sentMessages.push(a) } }, cfg: {}, runtime: { error: (m) => h.record.errors.push(m) }, replyToMode: "off", streamMode: "off", telegramCfg: {}, telegramDeps: {}, opts: {} });
  return result;
}

test("dispatch (real code): a BUSY turn leaves nothing behind and reports busy", async () => {
  const { vCreateTelegramInterSessionTurn } = loadBridgeBlock();
  const h = dispatchHarness();
  const mod = loadDispatchCode(h.stubs);
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  const req = startRequest(route);
  const { turn, outcome } = vCreateTelegramInterSessionTurn(req);
  const result = await runDispatch(h, mod, { turn, sessionKey: req.sessionKey, step: { busy: "pending_queue", silent: false } });
  assert.deepEqual(result, { kind: "completed" });
  turn.finish(result);
  assert.deepEqual(await outcome, { status: "busy", reason: "pending_queue" });
  assert.deepEqual(h.record.fallbacks, [], "no empty-response or failure fallback (BM:4053/4055)");
  assert.equal(h.record.watchBackground, 0, "no background line");
  assert.deepEqual(h.record.statusFinalize, [], "no status reaction (BM:4068)");
  assert.deepEqual(h.record.sentMessages, []);
  const core = h.record.coreTurns[0];
  assert.equal(core.opts.runId, req.runId);
  assert.equal(core.opts.vInterSession, turn.vInter);
  assert.equal(core.input.id, req.messageSid, "the core's inbound id is the per-attempt MessageSid");
  assert.equal(core.opts.onModelSelected !== undefined, true, "stock reply options are kept");
  assert.deepEqual([...mod.unknown], []);
});

test("dispatch (real code): a started turn keeps the stock behaviour and reports finals and the end", async () => {
  const { vCreateTelegramInterSessionTurn } = loadBridgeBlock();
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  {
    const h = dispatchHarness();
    const mod = loadDispatchCode(h.stubs);
    const req = startRequest(route);
    const { turn, outcome } = vCreateTelegramInterSessionTurn(req);
    const result = await runDispatch(h, mod, { turn, sessionKey: req.sessionKey, step: { finals: [{ text: "汇总好了" }, { text: "", channelData: { askUser: { questionId: "q" } } }] } });
    turn.finish(result);
    const started = await outcome;
    assert.equal(started.status, "started");
    assert.equal(started.runId, req.runId);
    assert.deepEqual(await started.done, { status: "ok", finals: [{ text: "汇总好了" }], visibleReplySent: true, finalCount: 1 });
    assert.equal(h.record.watchBackground, 1, "a started turn shows the background line like any turn");
    assert.deepEqual(h.record.fallbacks, []);
  }
  {
    // the run failed: Telegram's own failure notice is kept (the target chat shows it like for a person)
    const h = dispatchHarness();
    const mod = loadDispatchCode(h.stubs);
    const req = startRequest(route, { attempt: 1 });
    const { turn, outcome } = vCreateTelegramInterSessionTurn(req);
    const result = await runDispatch(h, mod, { turn, sessionKey: req.sessionKey, step: { agentRunFailed: true } });
    turn.finish(result);
    const done = await (await outcome).done;
    assert.equal(done.status, "error");
    assert.deepEqual(h.record.fallbacks, [["Something went wrong while processing your request. Please try again."]]);
  }
  {
    // ordinary Telegram messages are untouched: fallbacks, status reactions and the background line as before
    const h = dispatchHarness();
    const mod = loadDispatchCode(h.stubs);
    await runDispatch(h, mod, { turn: undefined, sessionKey: `agent:${AGENT}:telegram:direct:${OWNER}`, step: { agentRunFailed: true } });
    assert.deepEqual(h.record.fallbacks, [["Something went wrong while processing your request. Please try again."]]);
    assert.deepEqual(h.record.statusFinalize, ["thinking", "error"]);
    assert.equal(h.record.watchBackground, 1);
    assert.equal(h.record.coreTurns[0].opts.runId, undefined, "no preset runId for a person's message");
    assert.equal(h.record.coreTurns[0].opts.vInterSession, undefined);
  }
});

test("dispatch (real code): a turn's ask_user questions are answered by askUserAnswererId, never by the permission identity", async () => {
  const { vCreateTelegramInterSessionTurn } = loadBridgeBlock();
  const route = { channel: "telegram", accountId: "default", to: GROUP, chatId: GROUP, chatType: "group", humans: "shared" };
  const req = startRequest(route, { sender: { id: `v-a2a:${CHAIN_ID}`, name: "「一个私聊」的 V（会话协作）", isOwnerIdentity: false }, routePeerId: OWNER, askUserAnswererId: OWNER });
  for (const turnOrNot of [true, false]) {
    const h = dispatchHarness();
    const mod = loadDispatchCode(h.stubs);
    const { turn } = vCreateTelegramInterSessionTurn(req);
    h.setStep({ finals: [{ text: "", channelData: { askUser: { questionId: "q1" } } }] });
    const context = dispatchContext({ turn: turnOrNot ? turn : undefined, sessionKey: req.sessionKey, chatId: GROUP, record: h.record });
    context.statusReactionController = null;
    context.ctxPayload.SenderId = turnOrNot ? req.sender.id : "70000005"; // what the context builder set (extra / the person)
    await mod.dispatchTelegramMessage({ context, bot: { api: { sendMessage: async () => {} } }, cfg: {}, runtime: { error() {} }, replyToMode: "off", streamMode: "off", telegramCfg: {}, telegramDeps: {}, opts: {} });
    await h.record.questionRoutes[0]({ id: "q2" });
    const expected = turnOrNot ? OWNER : "70000005";
    assert.deepEqual(h.record.questionSenders, [expected, expected], turnOrNot ? "the real person, not the synthetic permission identity" : "a person's own question stays theirs");
  }
});

test("dispatch (real code): failures before the run and misrouted turns are invisible and classified", async () => {
  const { vCreateTelegramInterSessionTurn } = loadBridgeBlock();
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  for (const [step, routeKey, code] of [
    [{ throwBeforeRun: "restart recovery claim changed" }, undefined, "RESTART_WEDGE"],
    [{ throwBeforeRun: "session init conflict" }, undefined, "INTERNAL"],
    [{}, `agent:${AGENT}:telegram:direct:${OTHER}`, "ROUTE_MISMATCH"],
  ]) {
    const h = dispatchHarness();
    const mod = loadDispatchCode(h.stubs);
    const req = startRequest(route);
    const { turn, outcome } = vCreateTelegramInterSessionTurn(req);
    const result = await runDispatch(h, mod, { turn, sessionKey: req.sessionKey, routeKey, step });
    turn.finish(result);
    const out = await outcome;
    assert.equal(out.code, code, JSON.stringify(step));
    assert.deepEqual(h.record.fallbacks, [], `${code}: no fallback message`);
    assert.equal(h.record.watchBackground, 0, `${code}: no background line`);
    if (code === "ROUTE_MISMATCH") assert.equal(h.record.coreTurns.length, 0, "nothing runs in the wrong session");
  }
});

test("processor (real code): no typing cue for a turn; the last-resort notice only after the run started", async () => {
  const { vCreateTelegramInterSessionTurn } = loadBridgeBlock();
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  for (const started of [false, true]) {
    const h = dispatchHarness();
    const req = startRequest(route);
    const { turn } = vCreateTelegramInterSessionTurn(req);
    const context = dispatchContext({ turn, sessionKey: req.sessionKey, record: h.record });
    const sent = [];
    const stubs = {
      ...h.stubs,
      buildTelegramMessageContext: async () => context,
      dispatchTelegramMessage: async () => {
        if (started) turn.onAgentRunStart(req.runId);
        throw new Error("dispatch blew up");
      },
      buildTelegramThreadParams: () => ({}),
    };
    const mod = loadDispatchCode(stubs, { processorOnly: true });
    const processMessage = mod.createTelegramMessageProcessor({ bot: { api: { sendMessage: async (...a) => sent.push(a) } }, account: { accountId: "default" }, runtime: { error() {} }, telegramDeps: {}, opts: {} });
    const result = await processMessage(context.primaryCtx, [], [], { cfg: {}, telegramCfg: {}, onDispatchStart: async () => {} }, { messageIdOverride: req.messageSid });
    assert.equal(result.kind, "failed-retryable");
    assert.equal(h.record.typing, 0, "no early typing cue");
    assert.equal(sent.length, started ? 1 : 0, started ? "a started run gets the stock notice" : "a never-started turn sends nothing");
  }
  {
    // a person's message keeps the typing cue and the notice
    const h = dispatchHarness();
    const context = dispatchContext({ turn: undefined, sessionKey: "k", record: h.record });
    const sent = [];
    const mod = loadDispatchCode({ ...h.stubs, buildTelegramMessageContext: async () => context, dispatchTelegramMessage: async () => { throw new Error("x"); }, buildTelegramThreadParams: () => ({}) }, { processorOnly: true });
    const processMessage = mod.createTelegramMessageProcessor({ bot: { api: { sendMessage: async (...a) => sent.push(a) } }, account: { accountId: "default" }, runtime: { error() {} }, telegramDeps: {}, opts: {} });
    await processMessage(context.primaryCtx, [], [], { cfg: {}, telegramCfg: {}, onDispatchStart: async () => {} }, {});
    assert.equal(h.record.typing, 1);
    assert.equal(sent.length, 1);
  }
});

// ---------------------------------------------------------------- 5. the real patched context code

/**
 * The real buildTelegramMessageContext and buildTelegramInboundContextPayload of the generated file,
 * every free identifier from `stubs` (an unstubbed one fails the test, as in loadDispatchCode).
 */
function loadContextCode(stubs) {
  const parts = [
    between(OUT.dispatch, DISPATCH_BLOCK_START, DISPATCH_BLOCK_END),
    between(OUT.dispatch, "async function buildTelegramInboundContextPayload(params) {", "\n}\n"),
    between(OUT.dispatch, "const buildTelegramMessageContext = async ({", "\n};\n"),
  ];
  const scope = new Proxy(stubs, {
    has: (target, key) => typeof key === "string" && (key in target || !(key in globalThis)),
    get: (target, key) => {
      if (key === Symbol.unscopables) return undefined;
      if (key in target) return target[key];
      throw new ReferenceError(`unstubbed dependency of the generated code: ${String(key)}`);
    },
  });
  return new Function("scope", `with (scope) {\n${parts.join("\n")}\nreturn { buildTelegramMessageContext, buildTelegramInboundContextPayload };\n}`)(scope);
}

/**
 * The two core steps that decide a turn's command authority (v2026.9.1): the channel context
 * builder (src/channels/inbound-event/context.ts: CommandTurn from `command`, then `...extra` last)
 * and the finalize every context goes through (src/auto-reply/reply/inbound-context.ts:
 * `CommandAuthorized = CommandTurn.authorized` for a text-slash or native turn).
 */
function coreInboundContext(params) {
  const command = params.command;
  const commandTurn = command ? { kind: command.kind, authorized: command.kind === "normal" ? false : (command.authorized ?? params.access?.commands?.authorized === true), body: command.body } : undefined;
  const ctx = { From: params.from, MessageSid: params.messageId, SenderId: params.sender?.id, ChatType: params.conversation?.kind, CommandAuthorized: params.access?.commands?.authorized === true, CommandTurn: commandTurn, ...params.extra };
  ctx.CommandAuthorized = ctx.CommandAuthorized === true;
  const turn = ctx.CommandTurn ?? { kind: ctx.CommandSource === "native" ? "native" : ctx.CommandSource === "text" ? "text-slash" : "normal", authorized: false };
  if (turn.kind === "native" || turn.kind === "text-slash") {
    ctx.CommandSource = turn.kind === "native" ? "native" : "text";
    ctx.CommandAuthorized = turn.authorized;
  }
  return ctx;
}

function contextHarness() {
  const record = { typing: 0, reactions: 0, queued: 0, statusControllers: 0, payloadParams: [], built: [], groupHistory: 0 };
  const sessionRuntime = {
    readSessionUpdatedAt: () => 1760000000000,
    resolveAmbientTranscriptWatermarkKey: () => "telegram:default:chat",
    readAmbientTranscriptWatermark: () => undefined,
    buildChannelInboundEventContext: (params) => { record.built.push(params); return coreInboundContext(params); },
    resolvePinnedMainDmOwnerFromAllowlist: () => null,
    resolveInboundLastRouteSessionKey: ({ sessionKey }) => sessionKey,
    recordInboundSession: () => {},
  };
  const identity = (v) => v;
  const stubs = {
    // buildTelegramMessageContext
    resolveTelegramForumFlag: async () => false,
    extractTelegramForumFlag: () => undefined,
    resolveTelegramMessageThreadSpec: () => ({ scope: "none" }),
    resolveTelegramEffectiveDmPolicy: ({ dmPolicy }) => dmPolicy,
    resolveTelegramConversationRoute: ({ chatId, isGroup }) => ({ bindingMode: { kind: "none" }, route: { agentId: AGENT, accountId: "default", sessionKey: `agent:${AGENT}:telegram:${isGroup ? "group" : "direct"}:${chatId}`, mainSessionKey: `agent:${AGENT}:main`, matchedBy: "binding.channel" } }),
    normalizeAccountId: contracts.normalizeAccountId,
    resolveDefaultTelegramAccountId: () => "default",
    logInboundDrop: () => {},
    firstDefined: (...values) => values.find((v) => v !== undefined),
    resolveTelegramDmAllow: async () => ({ effectiveAllow: { hasEntries: true, entries: [OWNER] }, allowFrom: [OWNER] }),
    expandTelegramAllowFromWithAccessGroups: async ({ allowFrom }) => allowFrom ?? [],
    normalizeAllowFrom: (list) => ({ hasEntries: Boolean(list?.length), entries: list ?? [] }),
    evaluateTelegramGroupBaseAccess: () => ({ allowed: true }),
    logVerbose: () => {},
    withTelegramApiErrorLogging: async ({ fn }) => fn(),
    buildTypingThreadParams: () => undefined,
    enforceTelegramDmAccess: async () => true,
    loadTelegramMessageContextRuntime: async () => { throw new Error("runtime is injected"); },
    resolveTelegramConversationBaseSessionKey: ({ route }) => route.sessionKey,
    shouldUseTelegramDmThreadSession: () => false,
    resolveTelegramBotHasTopicsEnabled: () => false,
    resolveThreadSessionKeys: () => null,
    deriveLastRoutePolicy: () => "main",
    buildTelegramInboundOriginTarget: (chatId) => `telegram:${chatId}`,
    // what Telegram computes for a prompt that starts with a command alias, sent by the owner (allowlisted)
    resolveTelegramInboundBody: async ({ msg }) => ({ rawBody: msg.text, bodyText: msg.text, inboundEventKind: "message", effectiveWasMentioned: true, canDetectMention: true, shouldBypassMention: false, commandAuthorized: true, hasControlCommand: msg.text.startsWith("/"), historyKey: msg.chat.type === "private" ? "" : `telegram:${msg.chat.id}`, mentionFacts: { wasMentioned: true } }),
    resolveAckReaction: () => "👀",
    resolveTelegramReactionEmoji: identity,
    shouldAckReaction: () => true,
    resolveTelegramStatusReactionEmojis: () => ({ queued: "👀", thinking: "🤔", done: "👍", error: "😱" }),
    buildTelegramStatusReactionVariants: () => new Map(),
    resolveTelegramAllowedReactions: async () => null,
    resolveTelegramReactionVariant: ({ requestedEmoji }) => requestedEmoji,
    // buildTelegramInboundContextPayload
    describeReplyTarget: () => null,
    normalizeForwardedContext: () => null,
    resolveChannelContextVisibilityMode: () => "all",
    isSenderAllowed: () => true,
    evaluateSupplementalContextVisibility: () => ({ include: true }),
    replyTargetToChainEntry: identity,
    stripReplyChainForwarded: identity,
    resolveTelegramPrimaryMedia: () => undefined,
    getTelegramTextParts: (m) => ({ text: m?.text ?? "", entities: [] }),
    renderTelegramTextEntities: identity,
    formatMediaPlaceholderText: () => "",
    formatTelegramForwardedMessageBody: ({ body }) => body,
    formatInboundMediaUnavailableText: ({ body }) => body,
    buildGroupLabel: (msg) => msg.chat.title,
    buildSenderName: (msg) => msg.from?.first_name,
    buildSenderLabel: (msg, id) => `${msg.from?.first_name} id:${id}`,
    loadTelegramMessageContextSessionRuntime: async () => sessionRuntime,
    resolveTelegramMessageContextStorePath: async () => "/state/agents/makaron/sessions",
    resolveEnvelopeFormatOptions: () => ({}),
    isTelegramChatWindowPromptContext: () => false,
    formatInboundEnvelope: ({ body }) => body,
    normalizeCommandBody: identity,
    normalizeOptionalLowercaseString: (v) => (typeof v === "string" ? v.toLowerCase() : undefined),
    createChannelHistoryWindow: () => ({ buildInboundHistory: () => [] }),
    isTelegramHistoryEntryAfterAmbientWatermark: () => true,
    selectTelegramGroupHistoryAfterLastSelf: identity,
    retainTelegramGroupHistoryPromptContext: ({ promptContext }) => promptContext,
    mergeTelegramGroupHistoryPromptContext: ({ promptContext }) => promptContext,
    resolveTelegramGroupPromptSettings: () => ({}),
    isTelegramMediaKind: () => false,
    buildTelegramGroupFrom: (chatId) => `telegram:group:${chatId}`,
    toLocationContext: () => ({}),
    buildTelegramConversationId: ({ chatId }) => String(chatId),
    resolveTelegramDirectPeerId: ({ chatId }) => String(chatId),
    buildTelegramParentPeer: () => undefined,
    resolveTelegramDirectToolPolicy: () => undefined,
    recordTelegramGroupHistoryEntry: () => { record.groupHistory += 1; },
    shouldLogVerbose: () => false,
    truncateUtf16Safe: identity,
  };
  const runtime = {
    recordChannelActivity: () => {},
    createStatusReactionController: () => { record.statusControllers += 1; return { setQueued: () => { record.queued += 1; }, setThinking() {}, setDone() {}, setError() {} }; },
  };
  const bot = { api: { setMessageReaction: async () => { record.reactions += 1; }, getChat: async () => ({}) } };
  const sendChatActionHandler = { sendChatAction: async () => { record.typing += 1; } };
  return { stubs, record, runtime, bot, sendChatActionHandler };
}

async function buildContextFor(h, mod, { turn, chat, text }) {
  const message = { message_id: 2001, date: 1760000600, chat, from: { id: Number(OWNER), is_bot: false, first_name: turn ? turn.req.sender.name : "Tianyi" }, text };
  const primaryCtx = { message, update: turn ? { vInterSession: turn } : { update_id: 9, message }, me: { id: 100000001, username: "v_candidate_bot" } };
  return await mod.buildTelegramMessageContext({
    primaryCtx, allMedia: [], storeAllowFrom: [], options: turn ? { forceWasMentioned: true, messageIdOverride: turn.req.messageSid } : {},
    bot: h.bot, cfg: { messages: { statusReactions: { enabled: true } } }, account: { accountId: "default" },
    historyLimit: 50, dmHistoryLimit: 0, groupHistories: new Map(), dmPolicy: "pairing", allowFrom: [OWNER], groupAllowFrom: [OWNER], ackReactionScope: "all",
    logger: { info() {} }, resolveGroupActivation: () => undefined, resolveGroupRequireMention: () => false,
    resolveTelegramGroupConfig: () => ({ groupConfig: undefined, topicConfig: undefined }),
    runtime: h.runtime, sessionRuntime: {}, upsertPairingRequest: async () => {}, sendChatActionHandler: h.sendChatActionHandler,
  });
}

test("context (real code): a turn's prompt is text, never an authorized command, whatever the routing peer may run", async () => {
  const { vCreateTelegramInterSessionTurn } = loadBridgeBlock();
  const group = { id: Number(GROUP), type: "supergroup", title: "任务群 a" };
  const route = { channel: "telegram", accountId: "default", to: GROUP, chatId: GROUP, chatType: "group", humans: "shared", label: "任务群 a" };
  // a non-owner chain: the permission identity is synthetic, the routing peer is the owner (§2.a)
  const req = startRequest(route, { sender: { id: `v-a2a:${CHAIN_ID}`, name: "「一个私聊」的 V（会话协作）", isOwnerIdentity: false }, routePeerId: OWNER });
  for (const prompt of ["/new 换个思路重新做", "/status", "/stop"]) {
    const h = contextHarness();
    const mod = loadContextCode(h.stubs);
    const { turn } = vCreateTelegramInterSessionTurn({ ...req, promptText: prompt });
    const context = await buildContextFor(h, mod, { turn, chat: group, text: prompt });
    const payload = h.record.built.at(-1);
    assert.equal(payload.access.commands.authorized, false, `${prompt}: no command authority from the routing peer`);
    assert.equal(payload.command, undefined, `${prompt}: not a command turn`);
    assert.equal(context.ctxPayload.CommandAuthorized, false, `${prompt}: CommandAuthorized stays false after the core's finalize`);
    assert.equal(context.ctxPayload.CommandTurn, undefined);
    assert.equal(context.ctxPayload.SenderId, req.sender.id, "the permission identity, not the routing peer");
    assert.equal(context.ctxPayload.CommandInterpretationSuppressed, true);
    assert.equal(context.ctxPayload.MessageSid, req.messageSid);
  }
  // the same text from the owner is an authorized command, as before
  const h = contextHarness();
  const mod = loadContextCode(h.stubs);
  const person = await buildContextFor(h, mod, { turn: undefined, chat: group, text: "/status" });
  assert.equal(h.record.built.at(-1).command.authorized, true);
  assert.equal(person.ctxPayload.CommandAuthorized, true);
  assert.equal(person.ctxPayload.CommandTurn.kind, "text-slash");
});

test("context (real code): the core's finalize would undo CommandAuthorized:false in extra for a slash prompt (why the source is patched)", async () => {
  const { vCreateTelegramInterSessionTurn } = loadBridgeBlock();
  const h = contextHarness();
  const mod = loadContextCode(h.stubs);
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  const { turn } = vCreateTelegramInterSessionTurn({ ...startRequest(route), promptText: "/new" });
  const message = { message_id: 2001, date: 1760000600, chat: { id: Number(OWNER), type: "private" }, from: { id: Number(OWNER), is_bot: false, first_name: "x" }, text: "/new" };
  // V's buildTelegramInboundContextPayload as the unpatched call site would call it for the turn
  const { ctxPayload } = await mod.buildTelegramInboundContextPayload({
    cfg: {}, primaryCtx: { message, update: { vInterSession: turn }, me: { username: "v_candidate_bot" } }, msg: message, allMedia: [], replyMedia: [], replyChain: [], promptContext: [],
    isGroup: false, isForum: false, chatId: Number(OWNER), senderId: OWNER, senderUsername: "", threadSpec: { scope: "none" },
    route: { agentId: AGENT, accountId: "default", sessionKey: turn.req.sessionKey, mainSessionKey: `agent:${AGENT}:main` },
    rawBody: "/new", bodyText: "/new", historyKey: "", historyLimit: 50, dmHistoryLimit: 0, groupHistories: new Map(),
    effectiveWasMentioned: true, inboundEventKind: "message", groupRequireMention: false, mentionFacts: {}, hasControlCommand: true,
    commandAuthorized: true, options: { messageIdOverride: turn.req.messageSid }, dmAllowFrom: [OWNER], sessionRuntime: {},
  });
  assert.equal(ctxPayload.CommandAuthorized, true, "extra said false, the authorized text-slash CommandTurn wins");
});

test("context (real code): a turn sends no early typing cue and no ack or status reaction; a person's message does", async () => {
  const { vCreateTelegramInterSessionTurn } = loadBridgeBlock();
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  const dm = { id: Number(OWNER), type: "private", first_name: "Tianyi" };
  {
    const h = contextHarness();
    const mod = loadContextCode(h.stubs);
    const { turn } = vCreateTelegramInterSessionTurn(startRequest(route));
    const context = await buildContextFor(h, mod, { turn, chat: dm, text: "汇总一下" });
    assert.equal(h.record.typing, 0, "no early typing cue");
    assert.equal(context.initialTypingCueSent, false);
    assert.equal(h.record.statusControllers, 0, "no status reaction controller");
    assert.equal(context.statusReactionController, null);
    assert.equal(context.ackReactionPromise, null);
    assert.equal(h.record.reactions + h.record.queued, 0, "no reaction on the anchor");
    assert.equal(h.record.groupHistory, 0);
  }
  {
    const h = contextHarness();
    const mod = loadContextCode(h.stubs);
    const context = await buildContextFor(h, mod, { turn: undefined, chat: dm, text: "汇总一下" });
    await context.ackReactionPromise;
    assert.equal(h.record.typing, 1);
    assert.equal(h.record.statusControllers, 1);
    assert.equal(h.record.queued, 1);
  }
  {
    // groups: a person's message enters the group history window, a turn's synthetic message does not
    const group = { id: Number(GROUP), type: "supergroup", title: "任务群 a" };
    const groupRoute = { channel: "telegram", accountId: "default", to: GROUP, chatId: GROUP, chatType: "group", humans: "shared" };
    const h = contextHarness();
    const mod = loadContextCode(h.stubs);
    const { turn } = vCreateTelegramInterSessionTurn(startRequest(groupRoute));
    await buildContextFor(h, mod, { turn, chat: group, text: "汇总一下" });
    assert.equal(h.record.groupHistory, 0, "a BUSY retry would otherwise add the prompt each time");
    await buildContextFor(h, mod, { turn: undefined, chat: group, text: "汇总一下" });
    assert.equal(h.record.groupHistory, 1);
  }
});

// ---------------------------------------------------------------- 6. what the target model and the core see; RunOutcome; late events

test("context (real code): the request context is 9.1's string[]; a direct-chat turn's From is the chain root while the person routes it", async () => {
  const { vCreateTelegramInterSessionTurn } = loadBridgeBlock();
  const appendChannelPromptContext = vAppendChannelPromptContext();
  const elevated = vElevatedSenderCheck();
  const dmRoute = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  const dm = { id: Number(OWNER), type: "private", first_name: "Tianyi" };
  const synthetic = `v-a2a:${CHAIN_ID}`;
  {
    // the owner's direct chat, asked by a chain whose root is not the owner
    const h = contextHarness();
    const mod = loadContextCode(h.stubs);
    const req = startRequest(dmRoute, { sender: { id: synthetic, name: "「任务群 a」的 V（会话协作）", isOwnerIdentity: false } });
    const { turn } = vCreateTelegramInterSessionTurn(req);
    const { ctxPayload } = await buildContextFor(h, mod, { turn, chat: dm, text: req.promptText });
    const built = h.record.built.at(-1);
    assert.deepEqual(ctxPayload.ChannelPromptContext, [req.channelPromptContext]);
    assert.equal(appendChannelPromptContext("BODY", req.channelPromptContext), "BODY", "V drops a bare string");
    assert.equal(appendChannelPromptContext("BODY", ctxPayload.ChannelPromptContext), `BODY\n\nContext:\n${req.channelPromptContext}`);
    assert.equal(built.sender.id, OWNER, "the person routes the turn and passes the access check");
    assert.equal(built.from, `telegram:${OWNER}`, "Telegram's own From for this chat names the person");
    assert.deepEqual([ctxPayload.SenderId, ctxPayload.From, ctxPayload.ChatType], [synthetic, `telegram:${synthetic}`, "direct"]);
    assert.equal(elevated.fromIsSender(ctxPayload), true, "in a direct chat V reads From as a sender identity");
    assert.equal(elevated.approved({ provider: "telegram", allowFrom: [`telegram:${OWNER}`], ctx: ctxPayload }), false, "the owner's elevated rights are not lent to a non-owner chain");
    assert.equal(elevated.approved({ provider: "telegram", allowFrom: [`telegram:${OWNER}`], ctx: { ...ctxPayload, From: built.from } }), true, "with the person's From they would be");
  }
  {
    // an owner chain keeps the owner's own identity; an empty context is no entry
    const h = contextHarness();
    const mod = loadContextCode(h.stubs);
    const req = { ...startRequest(dmRoute), channelPromptContext: "" };
    const { turn } = vCreateTelegramInterSessionTurn(req);
    const { ctxPayload } = await buildContextFor(h, mod, { turn, chat: dm, text: req.promptText });
    assert.deepEqual([ctxPayload.SenderId, ctxPayload.From], [OWNER, `telegram:${OWNER}`]);
    assert.equal(ctxPayload.ChannelPromptContext, undefined);
  }
  {
    // a group's From names the group, which V never reads as a sender: left as Telegram sets it
    const h = contextHarness();
    const mod = loadContextCode(h.stubs);
    const groupRoute = { channel: "telegram", accountId: "default", to: GROUP, chatId: GROUP, chatType: "group", humans: "shared" };
    const { turn } = vCreateTelegramInterSessionTurn(startRequest(groupRoute, { sender: { id: synthetic, name: "x", isOwnerIdentity: false }, routePeerId: OWNER }));
    const { ctxPayload } = await buildContextFor(h, mod, { turn, chat: { id: Number(GROUP), type: "supergroup", title: "任务群 a" }, text: "汇总" });
    assert.equal(ctxPayload.From, `telegram:group:${GROUP}`);
    assert.equal(elevated.fromIsSender(ctxPayload), false);
  }
});

test("bridge: with no terminal outcome a run is ok only with a non-error final, else aborted; error notices are never results", async () => {
  const { vCreateTelegramInterSessionBridge } = loadBridgeBlock();
  const helpers = loadTurnHelpers();
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  const pipeline = simulatedPipeline({ helpers, api: {} });
  const bridge = vCreateTelegramInterSessionBridge({ accountId: "default", bot: { api: {}, botInfo: { id: 1 } }, message: pipeline, authorization: allowAll(), normalizeAccountId: contracts.normalizeAccountId });
  let attempt = 0;
  const run = async (step) => {
    pipeline.queue(step);
    const outcome = await bridge.start(startRequest(route, { attempt: attempt++ }));
    assert.equal(outcome.status, "started", JSON.stringify(step));
    const done = await outcome.done;
    assert(contracts.validateRunOutcome(done).ok, contracts.validateRunOutcome(done).errors.join("; "));
    return done;
  };
  // stopped after some text streamed: the core reports no terminal outcome, nothing final
  assert.deepEqual(await run({ finals: [], visible: true }), { status: "aborted", finals: [], visibleReplySent: true, finalCount: 0 });
  // a stalled run's interruption notice is an error final, not a result
  assert.deepEqual(await run({ finals: [{ text: "⚠️ This turn was interrupted because it stopped making progress. Please try again.", isError: true }] }), { status: "aborted", finals: [], visibleReplySent: true, finalCount: 0, error: "⚠️ This turn was interrupted because it stopped making progress. Please try again." });
  // a non-error final without a terminal outcome: ok
  assert.equal((await run({ finals: [{ text: "结果" }] })).status, "ok");
  // completed with nothing to say (NO_REPLY): ok without finals
  assert.deepEqual(await run({ finals: [], terminal: "completed", visible: false }), { status: "ok", finals: [], visibleReplySent: false, finalCount: 0 });
  // the core reported failed: error, with its notice as the error
  assert.deepEqual(await run({ finals: [{ text: "⚠️ Agent failed: model unavailable", isError: true }], terminal: "failed" }), { status: "error", finals: [], visibleReplySent: true, finalCount: 0, error: "⚠️ Agent failed: model unavailable" });
  // a run that failed before its harness took the turn still ran: started with an error, never GATED
  pipeline.queue({ failBeforeRunStart: true, finals: [{ text: "⚠️ Unknown model", isError: true }] });
  const early = await bridge.start(startRequest(route, { attempt: attempt++ }));
  assert.deepEqual([early.status, early.runId], ["started", contracts.runIdFor("request", SEND_ID, attempt - 1)]);
  assert.deepEqual(await early.done, { status: "error", finals: [], visibleReplySent: true, finalCount: 0, error: "⚠️ Unknown model" });
});

test("bridge: events after done are not the request's; a second run start of the same start is tolerated", async () => {
  const { vCreateTelegramInterSessionBridge } = loadBridgeBlock();
  const helpers = loadTurnHelpers();
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  const pipeline = simulatedPipeline({ helpers, api: {} });
  const bridge = vCreateTelegramInterSessionBridge({ accountId: "default", bot: { api: {}, botInfo: { id: 1 } }, message: pipeline, authorization: allowAll(), normalizeAccountId: contracts.normalizeAccountId });
  pipeline.queue({ finals: [{ text: "第一份" }], rerun: [{ text: "第二份" }], terminal: "completed" });
  const req = startRequest(route);
  const outcome = await bridge.start(req);
  assert.deepEqual([outcome.status, outcome.runId], ["started", req.runId], "started once, with the first run start");
  const run = await outcome.done;
  assert.deepEqual(run, { status: "ok", finals: [{ text: "第一份" }, { text: "第二份" }], visibleReplySent: true, finalCount: 2 }, "the re-run's finals belong to the same done");
  const snapshot = structuredClone(run);
  // a followup drain that reuses this turn's options runs a person's message with them
  const { opts, context } = pipeline.seen.at(-1);
  opts.onAgentRunStart("person-followup-run");
  helpers.vTelegramInterSessionCaptureFinal(context, { text: "给真人的回复" }, { kind: "final" });
  opts.onAgentRunTerminalOutcome?.("failed");
  opts.vInterSession.onBusy({ reason: "active_run" });
  helpers.vTelegramInterSessionOf(context).noteDispatchEnd({ agentRunFailed: true, visibleReplySent: false });
  helpers.vTelegramInterSessionOf(context).finish(void 0, new Error("late"));
  assert.deepEqual(await outcome.done, snapshot);
  assert.deepEqual(run, snapshot, "the resolved outcome is never touched");
  assert.equal(opts.vInterSession.exclusive, false, "once done the seam stops asking the core for exclusive admission");
  // a BUSY attempt stays busy whatever arrives later
  pipeline.queue({ busy: "active_run" });
  const busy = await bridge.start(startRequest(route, { attempt: 1 }));
  assert.deepEqual(busy, { status: "busy", reason: "active_run" });
  const later = pipeline.seen.at(-1);
  later.opts.onAgentRunStart(later.opts.runId);
  assert.equal(helpers.vTelegramInterSessionOf(later.context ?? { primaryCtx: later.params.ctx }).started, false);
});

test("dispatch (real code): the run's terminal outcome reaches the turn; an aborted run is aborted, not ok", async () => {
  const { vCreateTelegramInterSessionTurn } = loadBridgeBlock();
  const route = { channel: "telegram", accountId: "default", to: OWNER, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  for (const [step, status] of [[{ terminal: null, finals: [] }, "aborted"], [{ finals: [] }, "ok"], [{ terminal: null, finals: [{ text: "答复" }] }, "ok"]]) {
    const h = dispatchHarness();
    const mod = loadDispatchCode(h.stubs);
    const req = startRequest(route);
    const { turn, outcome } = vCreateTelegramInterSessionTurn(req);
    const result = await runDispatch(h, mod, { turn, sessionKey: req.sessionKey, step: { ...step, silent: true } });
    assert.equal(typeof h.record.coreTurns[0].opts.onAgentRunTerminalOutcome, "function", "the core forwards the run's outcome to the turn");
    turn.finish(result);
    assert.equal((await (await outcome).done).status, status, JSON.stringify(step));
  }
  // a person's message gets no inter-session outcome callback
  const h = dispatchHarness();
  const mod = loadDispatchCode(h.stubs);
  await runDispatch(h, mod, { turn: undefined, sessionKey: `agent:${AGENT}:telegram:direct:${OWNER}`, step: {} });
  assert.equal(h.record.coreTurns[0].opts.onAgentRunTerminalOutcome, undefined);
});
