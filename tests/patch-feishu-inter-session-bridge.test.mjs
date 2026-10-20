// WP4: the Feishu inbound bridge for cross-session collaboration (docs/inter-session/design.md §2.a, §3.6).
//
// Part 1 pins the generated monitor to V's exact bytes plus this patch (anchors, marker, V's
// other markers, the contract literals). Part 2 runs the real generated monitor in-process with
// every import stubbed (tests/fixtures/feishu-monitor-harness.mjs): monitorSingleAccount
// registers the bridge, and start() goes through the per-chat queue into handleFeishuMessage and
// the reply dispatcher, with a fake core in place of `inbound.run`.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

import * as C from "../apps/v-session-relay/plugin/core/contracts.js";
import {
  CONTRACT_LITERALS,
  FILE,
  GENERATED,
  INLINE,
  MARKER,
  SOURCE,
  buildEdits,
  inlineBridgeModule,
  patchFeishuInterSessionBridge,
} from "../lab/release-files/feishu-inter-session-bridge/patch.mjs";
import { createFeishuHarness } from "./fixtures/feishu-monitor-harness.mjs";

const VBYTES = JSON.parse(fs.readFileSync(new URL("./fixtures/inter-session-v-bytes.json", import.meta.url), "utf8"));
const capture = fs.readFileSync(SOURCE, "utf8");
const generated = fs.readFileSync(GENERATED, "utf8");
const count = (haystack, needle) => haystack.split(needle).length - 1;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const gate = () => { let release; const promise = new Promise((r) => { release = r; }); return { promise, release }; };
const REG = () => globalThis[C.BRIDGES];

// ================================================================ Part 1: the generated file

test("the committed file is exactly the patch of the bytes V runs", () => {
  const entry = VBYTES.files.find((f) => f.file === FILE && f.component === "feishu");
  assert.ok(entry, "monitor listed in tests/fixtures/inter-session-v-bytes.json");
  assert.equal(new URL(`../${entry.captured}`, import.meta.url).pathname, SOURCE.pathname, "patched from the capture V runs");
  assert.equal(createHash("sha256").update(fs.readFileSync(SOURCE)).digest("hex"), entry.sha256, "capture bytes are V's (verified on V 2026-10-20)");
  assert.equal(patchFeishuInterSessionBridge(capture), generated);
  execFileSync(process.execPath, ["--check", GENERATED.pathname]);
  execFileSync(process.execPath, ["--check", INLINE.pathname]);
});

test("every anchor occurs exactly once in V's bytes; the marker once in the output", () => {
  for (const [name, anchor] of buildEdits()) assert.equal(count(capture, anchor), 1, `anchor "${name}"`);
  assert.equal(count(capture, MARKER), 0);
  assert.equal(count(generated, MARKER), 1);
});

test("V's own markers all survive, unchanged in number", () => {
  const markers = new Set(capture.match(/\bv-[a-z0-9]+(?:-[a-z0-9]+)*-v\d+\b/gu));
  assert.ok(markers.size >= 8, [...markers].join(" "));
  for (const marker of markers) assert.equal(count(generated, marker), count(capture, marker), marker);
});

test("a patched or changed file is refused", () => {
  assert.throws(() => patchFeishuInterSessionBridge(generated), /already patched/u);
  assert.throws(() => patchFeishuInterSessionBridge(capture.replace("async function monitorSingleAccount(params) {\n", "async function monitorSingleAccount(p) {\n")), /expected exactly one anchor for "bridge module", found 0/u);
  assert.throws(() => inlineBridgeModule(`${fs.readFileSync(INLINE, "utf8")}\nexport {};\n`), /imports\/exports/u);
});

test("the literals the monitor carries are the contract's", () => {
  const inline = fs.readFileSync(INLINE, "utf8");
  assert.equal(CONTRACT_LITERALS.bridgesSymbolKey, C.SYMBOL_KEYS.bridges);
  assert.ok(inline.includes(`Symbol.for("${C.SYMBOL_KEYS.bridges}")`));
  assert.deepEqual({ ...CONTRACT_LITERALS.caps }, { ...C.CHANNEL_CAPS.feishu });
  const capsLiteral = /const V_INTER_SESSION_CAPS = Object\.freeze\((\{[^}]+\})\);/u.exec(inline)[1];
  assert.deepEqual(Function(`return (${capsLiteral});`)(), { ...C.CHANNEL_CAPS.feishu });
  assert.deepEqual([...CONTRACT_LITERALS.kinds], [...C.START_KINDS]);
  assert.ok(inline.includes(`const V_INTER_SESSION_KINDS = ${JSON.stringify([...C.START_KINDS]).replaceAll(",", ", ")};`));
  assert.deepEqual([...CONTRACT_LITERALS.busyReasons], [...C.BUSY_REASONS]);
  assert.ok(inline.includes(`const V_INTER_SESSION_BUSY_REASONS = ${JSON.stringify([...C.BUSY_REASONS]).replaceAll(",", ", ")};`));
  assert.ok(C.RESTART_WEDGE_RE.test(CONTRACT_LITERALS.restartWedgeSource));
  assert.ok(inline.includes(`const V_INTER_SESSION_RESTART_WEDGE_RE = ${C.RESTART_WEDGE_RE.toString()};`));
  assert.ok(inline.includes(`const V_INTER_SESSION_ID_PREFIX = "${C.V_A2A_PREFIX}";`));
  assert.ok(inline.includes(`const V_INTER_SESSION_SID_PREFIX = "${C.V_A2A_SID_PREFIX}";`));
  for (const code of CONTRACT_LITERALS.startRejectCodes) assert.ok(C.START_REJECT_CODES.includes(code), code);
  for (const code of new Set(inline.match(/code: "([A-Z_]+)"/gu).map((m) => m.slice(7, -1)))) {
    assert.ok([...C.START_REJECT_CODES, ...C.ROUTE_ERROR_CODES, ...C.BRIDGE_ERROR_CODES].includes(code), `unknown code ${code}`);
  }
  for (const code of CONTRACT_LITERALS.bridgeErrorCodes) assert.ok(C.BRIDGE_ERROR_CODES.includes(code));
  for (const code of CONTRACT_LITERALS.routeErrorCodes) assert.ok(C.ROUTE_ERROR_CODES.includes(code));
});

test("inter-session requests never take the steer lane, and the guards sit where the design puts them", () => {
  assert.equal(count(generated, ":active-run"), count(capture, ":active-run"), "no new active-run lane use");
  const dispatchEntry = generated.slice(generated.indexOf("vFeishuInterSessionDispatch.set(accountId"), generated.indexOf("const dispatchFeishuMessage = async"));
  assert.match(dispatchEntry, /enqueue\(`feishu:\$\{accountId\}:\$\{event\.message\.chat_id\?\.trim\(\) \|\| "unknown"\}`/u);
  assert.doesNotMatch(dispatchEntry, /active-run|:control|:btw|activeRunDispatch/u);
  const handler = generated.slice(generated.indexOf("async function handleFeishuMessage(params) {"), generated.indexOf("//#region extensions/feishu/src/card-action-state.ts"));
  const at = (needle) => { const i = handler.indexOf(needle); assert.ok(i >= 0, needle); return i; };
  assert.ok(at('interSession.reject("ROUTE_MISMATCH"') < at("const ensured = await ensureConfiguredBindingRouteReady({"));
  assert.ok(at('interSession.reject("ROUTE_MISMATCH"') < at("const ctxPayload = await buildCtxPayloadForAgent(route.agentId"));
  assert.ok(at("if (interSession?.busy) return interSession.complete({ dispatchResult });") < at('await ensureNoVisibleReplyFallback("dispatch-complete-no-visible-reply")'));
  assert.match(handler, /if \(turnAdoptionLifecycle \|\| params\.askUserAnswerOnly \|\| interSession\) throw err;/u);
  const dispatcher = generated.slice(generated.indexOf("function createFeishuReplyDispatcher(params) {"), generated.indexOf("//#region extensions/feishu/src/synthetic-event-target.ts"));
  assert.match(dispatcher, /onReplyStart: async \(\) => \{\n\t+if \(params\.vInterSession && !vInterSessionRunStarted\) return;/u);
  assert.match(dispatcher, /if \(params\.vInterSession \|\| !\(account\.config\.typingIndicator \?\? true\)\) return;/u);
  assert.match(generated, /const V_TASK_STATUS_KIND_ORDER = \["子 agent", "会话请求", "后台命令"/u);
});

// ================================================================ Part 2: the real monitor, run

const OWNER = "ou_0a11ce00";
const PEER = "ou_0b0b0b00";
const GROUP = "oc_7a5c0001";
const GROUP_KEY = `agent:makaron:feishu:group:${GROUP}`;
const DM_KEY = `agent:makaron:feishu:direct:${PEER}`;
const SEND_ID = C.newSendId(1_760_000_000_000, Buffer.from("0102030405", "hex"));
const SEND_ID_2 = C.newSendId(1_760_000_000_001, Buffer.from("0a0b0c0d0e", "hex"));
const CHAIN_ID = C.newChainId(1_760_000_000_000, Buffer.from("1112131415", "hex"));
const PROMPT = "请整理三份竞品资料，做完在群里给出最终结果。";

function startRequest(route, overrides = {}) {
  const kind = overrides.kind ?? "request";
  const id = overrides.id ?? SEND_ID;
  const attempt = overrides.attempt ?? 0;
  const req = {
    route,
    sessionKey: route.chatType === "group" ? GROUP_KEY : DM_KEY,
    agentId: "makaron",
    kind,
    id,
    attempt,
    ...C.startIds({ channel: "feishu", kind, id, attempt }),
    anchorMessageId: "om_anchor_1",
    promptText: PROMPT,
    channelPromptContext: "[会话协作 #7F3A] 这条请求来自「Tianyi 私聊」里的 V。",
    provenance: {
      kind: "inter_session",
      sourceSessionKey: `agent:makaron:feishu:direct:${OWNER}`,
      sourceChannel: "feishu",
      sourceTool: "sessions_send",
      originSessionId: C.originSessionIdFor({ chainId: CHAIN_ID, depth: 1, kind, id }),
    },
    sender: { id: OWNER, name: "「Tianyi 私聊」的 V（会话协作）", isOwnerIdentity: true },
    routePeerId: route.chatType === "direct" ? route.peerId : OWNER,
    askUserAnswererId: OWNER,
    ...overrides.fields,
  };
  const check = C.validateStartRequest(req);
  assert.ok(check.ok, check.errors.join("; "));
  return req;
}

/** A fake core turn: optional pre-admission reply start, run start, deliveries, terminal outcome. */
function coreRun({ finals = [{ text: "三份资料已整理好。", mediaUrls: ["/tmp/report.png"] }], terminal = "completed", preReplyStart = true, hold } = {}) {
  return async (turn) => {
    if (preReplyStart) await turn.dispatcherOptions.onReplyStart?.();
    turn.replyOptions.onAgentRunStart?.(turn.replyOptions.runId ?? "run-without-preset");
    if (hold) await hold;
    for (const payload of finals) {
      const info = { kind: "final" };
      const result = await turn.delivery.deliver(payload, info);
      turn.delivery.onDelivered?.(payload, info, result);
    }
    if (terminal) turn.replyOptions.onAgentRunTerminalOutcome?.(terminal);
    await turn.dispatcherOptions.onIdle?.();
    turn.dispatcherOptions.onCleanup?.();
    return { dispatched: true, dispatchResult: { queuedFinal: finals.length > 0, counts: { final: finals.length, block: 0, tool: 0 } } };
  };
}

/** The core admission guard (WP1) saying BUSY: reply start may already have been offered, then onBusy. */
function coreBusy(reason = "active_run") {
  return async (turn) => {
    await turn.dispatcherOptions.onReplyStart?.();
    turn.replyOptions.vInterSession.onBusy({ reason, activeSessionId: "sess-1" });
    await turn.dispatcherOptions.onIdle?.();
    turn.dispatcherOptions.onCleanup?.();
    // eligibility deliberately left on: the Feishu side must stay silent by itself too (§3.6 item 10)
    return { dispatched: true, dispatchResult: { queuedFinal: false, counts: { final: 0 }, noVisibleReplyFallbackEligible: true, deliberateSilentTerminalReply: true } };
  };
}

async function withMonitor(options, body) {
  const h = createFeishuHarness({ source: generated, ...options });
  h.chats.set(GROUP, { code: 0, data: { name: "任务群 a", owner_id: OWNER, user_count: "1" } });
  const listened = [];
  const listener = (key, bridge) => listened.push([key, bridge]);
  REG()?.listeners.add(listener);
  await h.startMonitor();
  const reg = REG();
  reg.listeners.add(listener);
  const bridge = reg.bridges.get("feishu:default");
  try {
    await body({ h, bridge, listened });
  } finally {
    await h.stopMonitor();
    reg.listeners.delete(listener);
  }
  return { h, bridge, listened };
}

test("run: monitorSingleAccount registers a valid bridge and removes it when the account stops", async () => {
  const { bridge, listened } = await withMonitor({}, async ({ bridge: b }) => {
    assert.ok(b, "registered as feishu:default");
    const valid = C.validateBridge(b);
    assert.ok(valid.ok, valid.errors.join("; "));
    assert.deepEqual({ ...b.caps }, { ...C.CHANNEL_CAPS.feishu });
    assert.equal(REG().v, 1);
  });
  assert.equal(REG().bridges.has("feishu:default"), false, "unregistered in finally");
  assert.deepEqual(listened.at(-1), ["feishu:default", null], "listeners told the bridge is gone");
  const route = (await bridge.resolveRoute({ sessionKey: DM_KEY, agentId: "makaron", ownerIds: [OWNER] })).route;
  const late = await bridge.start(startRequest(route));
  assert.deepEqual({ status: late.status, code: late.code }, { status: "rejected", code: "CHANNEL_DOWN" });
});

test("run: resolveRoute derives Feishu chats from keys, asks getChatInfo for groups, honours delivery.to", async () => {
  await withMonitor({}, async ({ h, bridge }) => {
    const owned = await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [OWNER] });
    assert.deepEqual(owned, { ok: true, route: { channel: "feishu", accountId: "default", to: `chat:${GROUP}`, chatId: GROUP, chatType: "group", humans: "owner_only", label: "任务群 a" } });
    assert.ok(C.validateRoute(owned.route).ok);
    await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [OWNER] });
    assert.equal(h.api.filter((c) => c.method === "im.chat.get").length, 1, "chat info cached");

    h.chats.set("oc_5a7e0002", { code: 0, data: { owner_id: OWNER, user_count: "3" } });
    h.chats.set("oc_5a7e0003", { code: 0, data: { owner_id: "ou_0e1e0000", user_count: "1" } });
    h.chats.set("oc_5a7e0004", { code: 232009, msg: "Your request specifies a chat which has already been dissolved." });
    h.chats.set("oc_5a7e0005", { throw: Object.assign(new Error("Request failed with status code 500"), { response: { status: 500, data: {} } }) });
    const humans = async (chat) => (await bridge.resolveRoute({ sessionKey: `agent:makaron:feishu:group:${chat}`, agentId: "makaron", ownerIds: [OWNER] }));
    assert.equal((await humans("oc_5a7e0002")).route.humans, "shared", "user_count is a string; Number() it");
    assert.equal((await humans("oc_5a7e0003")).route.humans, "single_peer");
    assert.deepEqual(await humans("oc_5a7e0004"), { ok: false, code: "CHAT_GONE", reason: "Your request specifies a chat which has already been dissolved." });
    assert.equal((await humans("oc_5a7e0009")).code, "NOT_MEMBER", "bot not in the chat (232011)");
    assert.equal((await humans("oc_5a7e0005")).route.humans, "unknown", "a transient chat.get failure is not a routing failure");

    assert.equal((await bridge.resolveRoute({ sessionKey: DM_KEY, agentId: "makaron", ownerIds: [OWNER] })).route.humans, "single_peer");
    const ownerDm = await bridge.resolveRoute({ sessionKey: `agent:makaron:feishu:direct:${OWNER}`, agentId: "makaron", ownerIds: [OWNER] });
    assert.deepEqual(ownerDm.route, { channel: "feishu", accountId: "default", to: `user:${OWNER}`, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" });
    const viaDelivery = await bridge.resolveRoute({ sessionKey: "agent:makaron:main", agentId: "makaron", ownerIds: [], delivery: { channel: "feishu", to: `user:${PEER}`, accountId: "default" } });
    assert.equal(viaDelivery.route.to, `user:${PEER}`, "delivery.to is used when the key names no chat");
    const wins = await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [], delivery: { to: `user:${PEER}` } });
    assert.equal(wins.route.chatType, "direct", "a stored delivery.to wins over the key");
    assert.equal((await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [], delivery: { to: `chat:${GROUP}`, accountId: "v-codex" } })).code, "NO_ROUTE");
    assert.equal((await bridge.resolveRoute({ sessionKey: "agent:makaron:telegram:direct:123", agentId: "makaron", ownerIds: [] })).code, "NO_ROUTE");
    assert.equal((await bridge.resolveRoute({ sessionKey: `agent:makaron:feishu:other:group:${GROUP}`, agentId: "makaron", ownerIds: [] })).code, "NO_ROUTE", "per-account key of another account");
    assert.equal((await bridge.resolveRoute({ sessionKey: `agent:makaron:feishu:default:group:${GROUP}`, agentId: "makaron", ownerIds: [OWNER] })).route.chatId, GROUP);
  });
});

test("run: post sends plain text with the contract uuid, replies under an anchor, and classifies failures", async () => {
  await withMonitor({}, async ({ h, bridge }) => {
    const route = (await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [OWNER] })).route;
    const uuid = C.feishuPostUuid("request", SEND_ID, "anchor");
    assert.ok(uuid.length <= 50);
    assert.deepEqual(await bridge.post({ route, text: "📨 来自「Tianyi 私聊」的请求 #7F3A", idempotencyKey: uuid }), { messageId: "om_test_1" });
    const create = h.api.find((c) => c.method === "im.message.create").req;
    assert.deepEqual(create, { params: { receive_id_type: "chat_id" }, data: { receive_id: GROUP, msg_type: "text", content: JSON.stringify({ text: "📨 来自「Tianyi 私聊」的请求 #7F3A" }), uuid } });

    await bridge.post({ route, text: "⚠️ #7F3A 没有开始", idempotencyKey: C.feishuPostUuid("request", SEND_ID, "not-started"), replyToMessageId: "om_anchor_1" });
    const reply = h.api.find((c) => c.method === "im.message.reply").req;
    assert.equal(reply.path.message_id, "om_anchor_1");
    assert.equal(reply.data.msg_type, "text");

    await bridge.post({ route, text: "long key", idempotencyKey: "x".repeat(80) });
    const hashed = h.api.filter((c) => c.method === "im.message.create").at(-1).req.data.uuid;
    assert.match(hashed, /^vax[0-9a-f]{40}$/u);

    h.clientFailures.push({ method: "reply", error: Object.assign(new Error("withdrawn"), { response: { status: 400, data: { code: 230011, msg: "The message is recalled." } } }) });
    await bridge.post({ route, text: "fallback", idempotencyKey: "k-1", replyToMessageId: "om_gone" });
    assert.equal(h.api.at(-1).method, "im.message.create", "a withdrawn anchor falls back to a plain message");

    const failWith = async (error) => {
      h.clientFailures.push({ method: "create", error });
      return await bridge.post({ route, text: "x", idempotencyKey: "k" }).then(() => assert.fail("must throw"), (e) => e);
    };
    const notMember = await failWith(Object.assign(new Error("Request failed"), { response: { status: 400, data: { code: 230002, msg: "Bot/User can NOT be out of the chat." } } }));
    assert.ok(C.isBridgeError(notMember));
    assert.deepEqual([notMember.code, notMember.transient], ["NOT_MEMBER", false]);
    const limited = await failWith(Object.assign(new Error("Request failed with status code 429"), { response: { status: 429, data: {} } }));
    assert.deepEqual([limited.code, limited.transient], ["CHANNEL_DOWN", true]);
    const net = await failWith(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));
    assert.deepEqual([net.code, net.transient], ["CHANNEL_DOWN", true]);
    const other = await failWith(Object.assign(new Error("bad"), { response: { status: 400, data: { code: 230001, msg: "invalid param" } } }));
    assert.deepEqual([other.code, other.transient], ["POST_FAILED", false]);

    await bridge.edit({ route, messageId: "om_test_1", text: "📨 … #7F3A（已开始）" });
    assert.deepEqual(h.api.at(-1), { method: "im.message.update", req: { path: { message_id: "om_test_1" }, data: { msg_type: "text", content: JSON.stringify({ text: "📨 … #7F3A（已开始）" }) } } });
    h.clientFailures.push({ method: "update", error: new Error("edit window closed") });
    await bridge.edit({ route, messageId: "om_test_1", text: "x" }); // failure ignored
  });
});

test("run: start → per-chat queue → handleFeishuMessage with interSession → started, finals captured", async () => {
  await withMonitor({ accountConfig: { renderMode: "raw" } }, async ({ h, bridge }) => {
    const route = (await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [OWNER] })).route;
    const req = startRequest(route);
    h.core = coreRun();
    const outcome = await bridge.start(req);
    assert.ok(C.validateStartOutcome(outcome).ok);
    assert.equal(outcome.status, "started");
    assert.equal(outcome.runId, req.runId, "the preset runId");
    const run = await outcome.done;
    assert.ok(C.validateRunOutcome(run).ok, C.validateRunOutcome(run).errors.join("; "));
    assert.deepEqual(run, { status: "ok", finals: [{ text: "三份资料已整理好。", mediaUrls: ["/tmp/report.png"] }], visibleReplySent: true, finalCount: 1 });

    assert.equal(h.turns.length, 1);
    const [turn] = h.turns;
    const ctx = turn.ctxPayload;
    assert.equal(turn.route.sessionKey, GROUP_KEY);
    assert.deepEqual(ctx.InputProvenance, req.provenance);
    assert.equal(ctx.ChannelPromptContext, req.channelPromptContext);
    assert.equal(ctx.CommandInterpretationSuppressed, true);
    assert.equal(ctx.CommandAuthorized, false, "access.commands.authorized=false");
    assert.equal(ctx.SenderId, OWNER);
    assert.equal(ctx.SenderName, req.sender.name);
    assert.equal(ctx.MessageSid, req.messageSid);
    assert.equal(ctx.GroupSystemPrompt, undefined, "nothing of the request goes into GroupSystemPrompt");
    assert.equal(ctx.VInterSession, turn.replyOptions.vInterSession, "one object for ctx and replyOptions");
    assert.deepEqual({ ...ctx.VInterSession, onBusy: typeof ctx.VInterSession.onBusy }, { exclusive: true, id: SEND_ID, kind: "request", onBusy: "function" });
    assert.equal(turn.replyOptions.runId, req.runId);
    assert.equal(turn.history.isGroup, false, "the group's pending history is not cleared by the request turn");
    assert.ok(ctx.Body.includes(`${req.sender.name}: ${PROMPT}`), ctx.Body);
    assert.ok(!ctx.Body.includes("PENDING-GROUP-HISTORY"), "pending group chatter stays out of the request prompt");
    assert.ok(ctx.Body.includes(`[message_id: ${req.syntheticMessageId}]`));

    const sent = h.visible.filter((v) => v.kind === "sendMessageFeishu");
    assert.deepEqual(sent.map((v) => [v.to, v.text, v.replyToMessageId]), [[`chat:${GROUP}`, "三份资料已整理好。", "om_anchor_1"]], "the reply hangs under the anchor");
    assert.equal(h.visible.filter((v) => v.kind === "reaction").length, 0, "no typing reaction on the anchor");
    const firsttext = h.logs.find((l) => l.startsWith("[firsttext-e2e.1] "));
    const record = JSON.parse(firsttext.slice("[firsttext-e2e.1] ".length));
    assert.equal(record.origin, "inter_session");
    assert.equal(record.attempt, 0);
    assert.equal(record.runId, req.runId);
    assert.ok(Number.isFinite(record.receivedAtMs));
  });
});

test("run: BUSY settles busy with zero visible output (no card, no reaction, no fallback), the next attempt runs", async () => {
  await withMonitor({ accountConfig: { renderMode: "card", streaming: "partial" } }, async ({ h, bridge }) => {
    const route = (await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [OWNER] })).route;
    const apiBefore = h.api.length;
    h.core = coreBusy("active_run");
    const busy = await bridge.start(startRequest(route));
    assert.deepEqual(busy, { status: "busy", reason: "active_run" });
    for (let i = 0; i < 5; i += 1) await tick();
    assert.deepEqual(h.visible, [], "BUSY: nothing visible at all");
    const writes = h.api.slice(apiBefore).filter((c) => !["im.chat.get", "im.message.get"].includes(c.method));
    assert.deepEqual(writes, [], "BUSY: no Feishu write call (the handler only reads the group name, as for any message)");
    assert.equal(h.logs.filter((l) => l.startsWith("[firsttext-e2e.1] ")).length, 0, "no first-text record for a turn that never ran");

    // attempt 1: the card is created only once the run starts
    let visibleAtRunStart;
    h.core = async (turn) => {
      await turn.dispatcherOptions.onReplyStart?.();
      assert.deepEqual(h.visible, [], "reply start before the run creates nothing");
      turn.replyOptions.onAgentRunStart(turn.replyOptions.runId);
      for (let i = 0; i < 5; i += 1) await tick();
      visibleAtRunStart = h.visible.map((v) => v.kind);
      turn.replyOptions.onAgentRunTerminalOutcome("completed");
      return { dispatched: true, dispatchResult: { queuedFinal: false, counts: { final: 0 } } };
    };
    const started = await bridge.start(startRequest(route, { attempt: 1 }));
    assert.equal(started.status, "started");
    assert.equal(started.runId, C.runIdFor("request", SEND_ID, 1));
    await started.done;
    assert.ok(visibleAtRunStart.includes("cardkit"), `card creation starts at onAgentRunStart: ${visibleAtRunStart}`);
  });
});

test("run: without the deferral the stock dispatcher would open a card before admission (A/B)", async () => {
  const expose = ["createFeishuReplyDispatcher"];
  const params = (extra) => ({ cfg: {}, agentId: "makaron", runtime: { log() {}, error() {} }, chatId: GROUP, sendTarget: `chat:${GROUP}`, replyToMessageId: "om_anchor_1", accountId: "default", sessionKey: GROUP_KEY, messageCreateTimeMs: Date.now(), ...extra });
  const stock = createFeishuHarness({ source: capture, accountConfig: { renderMode: "card", streaming: "partial" }, expose });
  await stock.module.createFeishuReplyDispatcher(params()).dispatcherOptions.onReplyStart();
  for (let i = 0; i < 5; i += 1) await tick();
  assert.ok(stock.visible.some((v) => v.kind === "cardkit"), "stock: a card starts at reply start");
  assert.ok(stock.visible.some((v) => v.kind === "reaction"), "stock: typing reaction on the anchor");

  const patched = createFeishuHarness({ source: generated, accountConfig: { renderMode: "card", streaming: "partial" }, expose });
  const d = patched.module.createFeishuReplyDispatcher(params({ vInterSession: { noteVisible() {}, captureFinal() {} } }));
  await d.dispatcherOptions.onReplyStart();
  for (let i = 0; i < 5; i += 1) await tick();
  assert.deepEqual(patched.visible, [], "patched: nothing before the run starts");
  d.replyOptions.onAgentRunStart("v-a2a-req-x-0");
  for (let i = 0; i < 5; i += 1) await tick();
  assert.ok(patched.visible.some((v) => v.kind === "cardkit"));
  assert.ok(!patched.visible.some((v) => v.kind === "reaction"), "never a typing reaction");
});

test("run: a route that does not land on the target session is rejected before any dispatch", async () => {
  await withMonitor({ route: (peer, accountId) => ({ agentId: "makaron", accountId, sessionKey: `agent:makaron:feishu:group:${peer.id}:sender:${OWNER}`, mainSessionKey: "agent:makaron:main", matchedBy: "binding" }) }, async ({ h, bridge }) => {
    const route = (await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [OWNER] })).route;
    h.core = coreRun();
    const outcome = await bridge.start(startRequest(route));
    assert.equal(outcome.status, "rejected");
    assert.equal(outcome.code, "ROUTE_MISMATCH");
    assert.equal(outcome.started, false);
    assert.equal(h.turns.length, 0, "never reached the core");
    assert.deepEqual(h.visible, []);
  });
});

test("run: a gated request is rejected GATED and never answered with a pairing reply", async () => {
  await withMonitor({}, async ({ h, bridge }) => {
    h.dmAdmission = "pairing-required";
    const route = (await bridge.resolveRoute({ sessionKey: DM_KEY, agentId: "makaron", ownerIds: [OWNER] })).route;
    const outcome = await bridge.start(startRequest(route));
    assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: "rejected", code: "GATED" });
    assert.deepEqual(h.visible, [], "no pairing challenge posted for a synthetic message");
    // a person's message on the same path does get the pairing reply (what the guard prevents)
    await h.handlers["im.message.receive_v1"]({ sender: { sender_id: { open_id: PEER } }, message: { message_id: "om_human_pairing", chat_id: "oc_d1dec7", chat_type: "p2p", message_type: "text", content: JSON.stringify({ text: "hi" }) } });
    for (let i = 0; i < 10; i += 1) await tick();
    assert.ok(h.visible.some((v) => v.kind === "sendMessageFeishu" && /pairing/u.test(v.text)));
  });
});

test("run: failures before and after the run starts are classified", async () => {
  await withMonitor({ accountConfig: { renderMode: "raw" } }, async ({ h, bridge }) => {
    const route = (await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [OWNER] })).route;
    h.core = async () => { throw new Error("restart recovery claim changed for agent:makaron:feishu:group:oc_7a5c0001"); };
    assert.equal((await bridge.start(startRequest(route))).code, "RESTART_WEDGE");
    h.core = async () => { throw new Error("session store unavailable"); };
    const internal = await bridge.start(startRequest(route, { attempt: 1 }));
    assert.deepEqual([internal.status, internal.code], ["rejected", "INTERNAL"]);

    h.core = async (turn) => { turn.replyOptions.onAgentRunStart(turn.replyOptions.runId); throw new Error("worker crashed"); };
    const crashed = await bridge.start(startRequest(route, { attempt: 2 }));
    assert.equal(crashed.status, "started");
    assert.deepEqual(await crashed.done, { status: "error", finals: [], visibleReplySent: false, finalCount: 0, error: "worker crashed" });

    h.core = coreRun({ finals: [{ text: "⚠️ Agent failed: model unavailable", isError: true }], terminal: "failed" });
    const failed = await (await bridge.start(startRequest(route, { attempt: 3 }))).done;
    assert.equal(failed.status, "error");
    assert.deepEqual(failed.finals, [], "an error payload is not a result");
    assert.equal(failed.error, "⚠️ Agent failed: model unavailable");

    h.core = coreRun({ finals: [], terminal: null });
    const aborted = await (await bridge.start(startRequest(route, { attempt: 4 }))).done;
    assert.equal(aborted.status, "aborted", "a run that ends without a terminal outcome or output was stopped");

    h.core = coreRun({ finals: [], terminal: "completed" });
    const silent = await (await bridge.start(startRequest(route, { attempt: 5 }))).done;
    assert.deepEqual([silent.status, silent.finals.length], ["ok", 0], "NO_REPLY: ok without finals");

    const wrongAccount = await bridge.start({ ...startRequest(route, { attempt: 6 }), route: { ...route, accountId: "v-codex" } });
    assert.deepEqual([wrongAccount.status, wrongAccount.code], ["rejected", "INTERNAL"]);
  });
});

test("run: the request waits behind the chat's earlier messages on the same queue (FIFO with people)", async () => {
  await withMonitor({ accountConfig: { renderMode: "raw" } }, async ({ h, bridge }) => {
    const route = (await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [OWNER] })).route;
    const human = gate();
    const order = [];
    h.core = async (turn) => {
      const inter = Boolean(turn.ctxPayload.VInterSession);
      order.push(inter ? `inter:${turn.ctxPayload.VInterSession.id}` : "human");
      if (!inter) {
        await human.promise;
        return { dispatched: true, dispatchResult: { queuedFinal: false, counts: { final: 0 } } };
      }
      return await coreRun({ preReplyStart: false })(turn);
    };
    const humanDone = h.handlers["im.message.receive_v1"]({ sender: { sender_id: { open_id: PEER } }, message: { message_id: "om_human_1", chat_id: GROUP, chat_type: "group", message_type: "text", content: JSON.stringify({ text: "大家好" }) } });
    for (let i = 0; i < 20 && order.length === 0; i += 1) await tick();
    assert.deepEqual(order, ["human"]);
    assert.ok(h.turns[0].ctxPayload.Body.includes("PENDING-GROUP-HISTORY"), "a person's group message still gets the pending history");

    let settled = false;
    const first = bridge.start(startRequest(route)).then((o) => { settled = true; return o; });
    const second = bridge.start(startRequest(route, { id: SEND_ID_2 }));
    for (let i = 0; i < 20; i += 1) await tick();
    assert.deepEqual(order, ["human"], "queued behind the person's turn");
    assert.equal(settled, false);
    human.release();
    await humanDone;
    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual([a.status, b.status], ["started", "started"]);
    await Promise.all([a.done, b.done]);
    assert.deepEqual(order, ["human", `inter:${SEND_ID}`, `inter:${SEND_ID_2}`], "one at a time, in order");
  });
});

test("run: a direct-chat request routes by the person, uses the learned direct chat, and keeps ask_user with the real person", async () => {
  await withMonitor({ accountConfig: { renderMode: "raw" } }, async ({ h, bridge }) => {
    const route = (await bridge.resolveRoute({ sessionKey: DM_KEY, agentId: "makaron", ownerIds: [OWNER] })).route;
    await bridge.post({ route, text: "📨 来自「任务群 a」的请求 #9K2M", idempotencyKey: C.feishuPostUuid("request", SEND_ID, "anchor") });
    h.core = coreRun({ preReplyStart: false });
    const req = startRequest(route, { fields: { sender: { id: `v-a2a:${CHAIN_ID}`, name: "「任务群 a」的 V（会话协作）", isOwnerIdentity: false }, askUserAnswererId: OWNER } });
    const outcome = await bridge.start(req);
    assert.equal(outcome.status, "started");
    await outcome.done;
    const [turn] = h.turns;
    assert.equal(turn.route.sessionKey, DM_KEY, "routed by the peer (dmScope per-channel-peer)");
    assert.equal(turn.ctxPayload.__params.conversation.id, "oc_d1dec7", "the direct chat id learned from the anchor post");
    assert.equal(turn.ctxPayload.SenderId, `v-a2a:${CHAIN_ID}`, "a synthetic, non-owner sender for a non-owner chain");
    assert.equal(turn.ctxPayload.__params.sender.id, PEER, "routing sender stays the person");
    const sent = h.visible.filter((v) => v.kind === "sendMessageFeishu");
    assert.equal(sent.at(-1).replyToMessageId, undefined, "direct chats do not thread replies under the anchor");
  });
});

test("run: the background line calls sessions_send tasks 会话请求", () => {
  const h = createFeishuHarness({ source: generated, expose: ["feishuTaskStatusKind", "renderFeishuTaskStatusLine"] });
  assert.equal(h.module.feishuTaskStatusKind({ taskId: "v-a2a:s_x", runtime: "session", taskKind: "sessions_send" }), CONTRACT_LITERALS.sessionRequestKind);
  const line = h.module.renderFeishuTaskStatusLine([
    { runtime: "session", taskKind: "sessions_send" },
    { runtime: "session", taskKind: "sessions_send" },
    { runtime: "cli", taskKind: "exec" },
  ]);
  assert.equal(line, "⏳ 后台 3 项进行中 · 会话请求 2 · 后台命令 1");
  assert.equal(h.module.renderFeishuTaskStatusLine([{ runtime: "session", taskKind: "sessions_send" }]), "⏳ 后台 1 项进行中 · 会话请求");
});
