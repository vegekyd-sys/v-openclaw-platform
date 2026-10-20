// Contract freeze (design §2, WP0): the literals other packages inline must not drift.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import * as C from "../core/contracts.js";
import { createFakeBridge, deriveRoute } from "./fixtures/fake-bridge.mjs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const OWNER = "ou_0123456789abcdef0123456789abcdef";
const GROUP = "oc_0123456789abcdef0123456789abcdef";
const GROUP_KEY = `agent:makaron:feishu:group:${GROUP}`;
const DM_KEY = `agent:makaron:feishu:direct:${OWNER}`;

function startRequest(over = {}) {
  const id = over.id ?? C.newSendId(1_760_000_000_000, Buffer.from("0102030405", "hex"));
  const kind = over.kind ?? "request";
  const attempt = over.attempt ?? 0;
  const chainId = C.newChainId(1_760_000_000_000, Buffer.from("a1a2a3a4a5", "hex"));
  const route = over.route ?? { channel: "feishu", accountId: "default", to: `chat:${GROUP}`, chatId: GROUP, chatType: "group", humans: "owner_only", label: "任务群 a" };
  return {
    route, sessionKey: GROUP_KEY, agentId: "makaron", kind, id, attempt,
    ...C.startIds({ channel: route.channel, kind, id, attempt }),
    anchorMessageId: "om_anchor_1",
    promptText: "请把 v2.3 的上线通知写好",
    channelPromptContext: "[会话协作 #7F3A] …",
    provenance: { kind: "inter_session", sourceSessionKey: DM_KEY, sourceChannel: "feishu", sourceTool: "sessions_send", originSessionId: C.originSessionIdFor({ chainId, depth: 1, kind, id }) },
    sender: { id: OWNER, name: "「Tianyi 私聊」的 V（会话协作）", isOwnerIdentity: true },
    routePeerId: OWNER,
    askUserAnswererId: OWNER,
    ...over.extra,
  };
}

test("contracts: globalThis seams are registry symbols with the design's keys", () => {
  assert.equal(C.BRIDGES, Symbol.for("openclaw.v.interSessionInboundBridges"));
  assert.equal(C.DEFERRED_MEMORY_FLUSH, Symbol.for("openclaw.v.deferredMemoryFlush"));
  assert.equal(C.SESSIONS_SEND_ACCEPTED, Symbol.for("openclaw.v.sessionsSendAccepted"));
  assert.equal(C.TASK_REGISTRY_BRIDGE, Symbol.for("openclaw.v.taskRegistryBridge"));
  for (const [name, key] of Object.entries(C.SYMBOL_KEYS)) assert.equal(Symbol.keyFor({ bridges: C.BRIDGES, deferredMemoryFlush: C.DEFERRED_MEMORY_FLUSH, sessionsSendAccepted: C.SESSIONS_SEND_ACCEPTED, taskRegistryBridge: C.TASK_REGISTRY_BRIDGE }[name]), key);
  assert.deepEqual(Object.values(C.MARKERS).sort(), [
    "v-dingtalk-inter-session-bridge-v1", "v-experience-session-kind-v1", "v-feishu-inter-session-bridge-v1",
    "v-inter-session-exclusive-v1", "v-sessions-send-relay-tools-v1", "v-sessions-send-relay-v3",
    "v-task-bridge-extra-sources-v1", "v-telegram-inter-session-bridge-v1", "v-wecom-inter-session-bridge-v1",
  ]);
});

test("contracts: gateway methods, scopes and the plugin-absent regex", () => {
  assert.deepEqual({ ...C.METHODS }, { send: "vrelay.send", wait: "vrelay.wait", get: "vrelay.get", list: "vrelay.list", cancel: "vrelay.cancel" });
  assert.deepEqual({ ...C.METHOD_SCOPES }, {
    "vrelay.send": "operator.write", "vrelay.wait": "operator.write", "vrelay.get": "operator.read",
    "vrelay.list": "operator.read", "vrelay.cancel": "operator.admin",
  });
  assert.deepEqual([...C.SEND_CALL_SCOPES], ["operator.write"]);
  // None of the names falls into a reserved core namespace (exec.approvals., config., wizard., update.).
  for (const m of Object.values(C.METHODS)) assert(!/^(exec\.approvals|config|wizard|update)\./u.test(m), m);
  assert.equal(C.RELAY_FALLBACK_RE.source, "unknown method: vrelay\\.send|missing scope: operator\\.admin");
  assert.match("unknown method: vrelay.send", C.RELAY_FALLBACK_RE);
  assert.match("missing scope: operator.admin", C.RELAY_FALLBACK_RE);
  assert.doesNotMatch("unknown method: vrelay.wait", C.RELAY_FALLBACK_RE);
  assert.doesNotMatch("gateway timeout after 20000ms", C.RELAY_FALLBACK_RE);
  assert.equal(C.TIMEOUTS.waitSliceMaxMs, 55_000);
  assert.equal(C.TIMEOUTS.inlineMaxMs, 300_000);
  assert.equal(C.TIMEOUTS.sendRpcMs, 20_000);
  assert.equal(C.TIMEOUTS.absentCacheMs, 60_000);
  assert.equal(C.inlineTimeoutMsFor(0), 0);
  assert.equal(C.inlineTimeoutMsFor(120), 120_000);
  assert.equal(C.inlineTimeoutMsFor(3600), 300_000);
});

test("contracts: default limits are the §3.10 configSchema values", () => {
  assert.deepEqual({ ...C.DEFAULT_LIMITS }, {
    maxDepth: 2, maxFanoutPerRun: 5, maxChainMembers: 8, maxSendsPerChain: 24, maxPerPair: 6,
    maxSendsPerMinute: 8, chainIdleTtlMs: 21600000, chainHardTtlMs: 86400000,
    maxWakeRoundsPerSend: 4, queueTimeoutMs: 21600000, runTimeoutMs: 43200000,
    inlineMaxMs: 300000, maxConcurrentRequestTurns: 4, maxQueuePerTarget: 10,
    sharedVisibleChars: 200,
  });
  assert.equal(C.DEFAULT_LIMITS.inlineMaxMs, C.TIMEOUTS.inlineMaxMs);
  assert.deepEqual(Object.keys(C.CONFIG_SCHEMA.properties.limits.properties).sort(), Object.keys(C.DEFAULT_LIMITS).sort());
  assert.deepEqual(C.CONFIG_SCHEMA.properties.role.enum, ["gateway", "worker-guard"]);
  const cfg = C.resolvePluginConfig({ limits: { maxDepth: 3, bogus: 1, maxPerPair: -1 }, role: "nope" });
  assert.equal(cfg.role, "gateway");
  assert.equal(cfg.limits.maxDepth, 3);
  assert.equal(cfg.limits.maxPerPair, 6);
  assert.equal(Object.hasOwn(cfg.limits, "bogus"), false);
  assert.equal(cfg.ownerName, "Tianyi");
  assert.equal(C.resolvePluginConfig({ role: "worker-guard" }).role, "worker-guard");
});

test("contracts: vocabularies match §2 and §5", () => {
  assert.deepEqual([...C.POLICY_CODES], ["LEAF", "WAIT_CYCLE", "REPLY_TO_REQUESTER", "DEPTH", "FANOUT", "MEMBERS", "CHAIN_BUDGET", "PAIR_BUDGET", "RATE", "CHAIN_EXPIRED", "QUEUE_FULL"]);
  assert.deepEqual([...C.START_REJECT_CODES], ["NO_ROUTE", "ROUTE_MISMATCH", "GATED", "CHANNEL_DOWN", "RESTART_WEDGE", "ARCHIVED", "INTERNAL"]);
  assert.deepEqual([...C.BUSY_REASONS], ["active_run", "pending_queue", "recovery_owner"]);
  assert.deepEqual([...C.BRIDGE_ERROR_CODES], ["POST_FAILED", "CHAT_GONE", "NOT_MEMBER", "CHANNEL_DOWN"]);
  assert.deepEqual([...C.SEND_ERROR_CODES], ["NO_ROUTE", "CHAT_GONE", "NOT_MEMBER", "LEDGER", "INTERNAL"]);
  assert.deepEqual([...C.FALLBACK_REASONS], ["disabled", "unsupported_requester", "unsupported_target"]);
  assert.deepEqual([...C.WAIT_STATUSES], ["pending", "ok", "no_reply", "failed", "expired"]);
  assert.deepEqual([...C.FAILURE_CLASSES], ["not_started", "started_failed", "interrupted", "aborted", "timeout", "cancelled"]);
  assert.equal(C.SEND_PHASES.length, 15);
  for (const p of [...C.SEND_TERMINAL_PHASES, ...C.SEND_SETTLED_PHASES]) assert(C.SEND_PHASES.includes(p), p);
  for (const p of C.BATCH_TERMINAL_PHASES) assert(C.BATCH_PHASES.includes(p), p);
  assert.match("Error: restart recovery claim changed for agent:x", C.RESTART_WEDGE_RE);
  assert.deepEqual({ ...C.CHANNEL_CAPS.feishu }, { streaming: true, replyAnchor: true, idempotentPost: true, editPost: true, maxVisibleChars: 1500, askUser: true, media: true });
  assert.equal(C.CHANNEL_CAPS.telegram.maxVisibleChars, 3500);
  assert.equal(C.CHANNEL_CAPS.dingtalk.maxVisibleChars, 1500);
  assert.equal(C.CHANNEL_CAPS.wecom.streaming, false);
  assert.equal(C.CHANNEL_CAPS.wecom.maxVisibleBytes, 3800);
  for (const ch of ["telegram", "dingtalk", "wecom"]) assert.equal(C.CHANNEL_CAPS[ch].idempotentPost, false);
});

test("contracts: record ids, #codes and their formats", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const s = C.newSendId();
    assert.match(s, C.SEND_ID_RE);
    assert(!seen.has(s));
    seen.add(s);
  }
  const fixed = C.newBatchId(1_760_000_000_000, Buffer.from("deadbeef01", "hex"));
  assert.equal(fixed, `b_${(1_760_000_000_000).toString(36)}deadbeef01`);
  assert.match(C.newChainId(), C.CHAIN_ID_RE);
  assert.doesNotMatch(C.newChainId(), C.SEND_ID_RE);

  for (let i = 0; i < 500; i += 1) {
    const code = C.newCode();
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}$/u);
    assert.doesNotMatch(code, /[ILOU]/u);
  }
  // Clashes with non-terminal records grow the code to five characters.
  let calls = 0;
  const grown = C.newCode((code) => { calls += 1; return code.length === 4; });
  assert.equal(grown.length, 5);
  assert.match(grown, C.CODE_RE);
  assert.equal(calls, 9);
  assert.equal(C.CROCKFORD_ALPHABET.length, 32);
});

test("contracts: per-attempt runId, MessageSid and synthetic ids", () => {
  const s = C.newSendId(1_760_000_000_000, Buffer.from("0102030405", "hex"));
  const b = C.newBatchId(1_760_000_000_000, Buffer.from("0102030405", "hex"));
  assert.equal(C.runIdFor("request", s, 0), `v-a2a-req-${s}-0`);
  assert.equal(C.runIdFor("ask", s, 1), `v-a2a-ask-${s}-1`);
  assert.equal(C.runIdFor("collect", s, 2), `v-a2a-col-${s}-2`);
  assert.equal(C.runIdFor("wake", b, 3), `v-a2a-wake-${b}-3`);
  assert.equal(C.runIdFor("req", s, 0), C.runIdFor("request", s, 0));
  assert.equal(C.messageSidFor("request", s, 0), `v-a2a:req:${s}:0`);
  assert.equal(C.messageSidFor("wake", b, 4), `v-a2a:wake:${b}:4`);
  assert.equal(C.syntheticMessageIdFor("feishu", "request", s, 0), `v-a2a-req-${s}-0`);
  assert.equal(C.syntheticMessageIdFor("telegram", "request", s, 0), `v-a2a:req:${s}:0`);
  assert.notEqual(C.runIdFor("request", s, 0), C.runIdFor("request", s, 1));
  assert.notEqual(C.messageSidFor("request", s, 0), C.messageSidFor("request", s, 1));
  assert.throws(() => C.runIdFor("reply", s, 0), /unknown inter-session kind/u);
  assert.throws(() => C.runIdFor("request", s, -1), /non-negative/u);
  assert.throws(() => C.runIdFor("request", "s_bad", 0), /not a send/u);
  assert.deepEqual(C.parseInterSessionRunId(`v-a2a-col-${s}-12`), { kind: "collect", abbr: "col", id: s, attempt: 12 });
  assert.deepEqual(C.parseMessageSid(`v-a2a:wake:${b}:0`), { kind: "wake", abbr: "wake", id: b, attempt: 0 });
  assert.equal(C.parseInterSessionRunId("7f6c2a8e-1111-4222-8333-444455556666"), null);
  // The v-a2a- prefix separates plugin turns from UUID and DB91_HI_* runs (worker index.mjs:11).
  assert.equal(C.isInterSessionRunId(C.runIdFor("wake", b, 0)), true);
  assert.equal(C.isInterSessionRunId("7f6c2a8e-1111-4222-8333-444455556666"), false);
  assert.equal(C.isInterSessionRunId("DB91_HI_1_abc"), false);
  assert.equal(C.isInterSessionRunId(undefined), false);
  assert.equal(C.isInterSessionMessageSid(C.messageSidFor("ask", s, 0)), true);
  assert.equal(C.isInterSessionMessageSid("om_x"), false);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  assert.doesNotMatch(C.runIdFor("request", s, 0), uuid);
});

test("contracts: Feishu post uuid, transcript tag and idempotency keys", () => {
  const s = C.newSendId(1_760_000_000_000, Buffer.from("0102030405", "hex"));
  const b = C.newBatchId(1_760_000_000_000, Buffer.from("0102030405", "hex"));
  const c = C.newChainId(1_760_000_000_000, Buffer.from("0102030405", "hex"));
  const u = C.feishuPostUuid("request", s, "anchor");
  assert.equal(u, `var${sha256(`${s}:anchor`).slice(0, 40)}`);
  assert(u.length <= 50);
  assert.equal(C.feishuPostUuid("request", s, "anchor"), u);
  assert.notEqual(C.feishuPostUuid("request", s, "failure"), u);
  assert.match(C.feishuPostUuid("wake", b, "handback"), /^vaw[0-9a-f]{40}$/u);
  assert.match(C.feishuPostUuid("ask", s, "anchor"), /^vaa/u);
  assert.match(C.feishuPostUuid("col", s, "anchor"), /^vac/u);

  const origin = C.originSessionIdFor({ chainId: c, depth: 1, kind: "request", id: s });
  assert.equal(origin, `v-a2a:${c}:1:req:${s}`);
  assert.deepEqual(C.parseOriginSessionId(origin), { chainId: c, depth: 1, kind: "request", abbr: "req", id: s });
  assert(origin.endsWith(C.originTagSuffix("request", s)));
  assert(C.originSessionIdFor({ chainId: c, depth: 0, kind: "wake", id: b }).endsWith(`:wake:${b}`));

  const base = { requesterSessionKey: DM_KEY, requesterRunId: "run-1", toolCallId: "call_1" };
  assert.equal(C.sendIdempotencyKey(base), `ss:${sha256(`${DM_KEY}|run-1|call_1`).slice(0, 32)}`);
  const now = 1_760_000_123_456;
  assert.equal(C.sendIdempotencyKey({ ...base, requesterRunId: null, now }), `ss:${sha256(`${DM_KEY}|nr:${Math.floor(now / 600000)}|call_1`).slice(0, 32)}`);
  assert.equal(C.sendContentKey({ requesterSessionKey: DM_KEY, targetSessionKey: GROUP_KEY, message: "hi" }), sha256(`${DM_KEY}|${GROUP_KEY}|hi`));
  assert.equal(C.runRecordName("v-a2a-req-x-0"), `${createHash("sha1").update("v-a2a-req-x-0").digest("hex")}.json`);
});

test("contracts: account ids normalize like core normalizeAccountId", () => {
  assert.equal(C.normalizeAccountId(undefined), "default");
  assert.equal(C.normalizeAccountId(""), "default");
  assert.equal(C.normalizeAccountId("  Main "), "main");
  assert.equal(C.normalizeAccountId("v-codex"), "v-codex");
  assert.equal(C.normalizeAccountId("My Bot!"), "my-bot");
  assert.equal(C.normalizeAccountId("__proto__"), "default");
  assert.equal(C.normalizeAccountId("constructor"), "default");
  assert.equal(C.normalizeAccountId("!!!"), "default");
  assert.equal(C.bridgeKey("feishu", undefined), "feishu:default");
  assert.equal(C.bridgeKey("telegram", "Default"), "telegram:default");
});

test("contracts: the bridge registry is one object, listeners hear register and unregister", () => {
  const host = {};
  const reg = C.getBridgeRegistry(host);
  assert.equal(C.getBridgeRegistry(host), reg);
  assert.equal(host[C.BRIDGES], reg);
  assert.equal(reg.v, 1);
  const heard = [];
  reg.listeners.add((key, bridge) => heard.push([key, bridge ? bridge.channel : null]));
  reg.listeners.add(() => { throw new Error("a broken listener"); });
  const a = createFakeBridge({ channel: "feishu" });
  const b = createFakeBridge({ channel: "feishu" });
  assert.equal(C.registerBridge(a, reg), "feishu:default");
  assert.equal(reg.bridges.get("feishu:default"), a);
  C.registerBridge(b, reg); // a reconnect replaces the bridge
  assert.equal(C.unregisterBridge(a, reg), false, "a stale bridge never removes its successor");
  assert.equal(reg.bridges.get("feishu:default"), b);
  assert.equal(b.unregister(reg), true);
  assert.equal(reg.bridges.size, 0);
  assert.deepEqual(heard, [["feishu:default", "feishu"], ["feishu:default", "feishu"], ["feishu:default", null]]);
});

test("contracts: validateBridge accepts the four channel shapes and names what is wrong", () => {
  for (const channel of C.CHANNELS) {
    const v = C.validateBridge(createFakeBridge({ channel }));
    assert.equal(v.ok, true, `${channel}: ${v.errors.join("; ")}`);
  }
  assert.equal(typeof createFakeBridge({ channel: "telegram" }).edit, "undefined");
  const bad = { v: 2, channel: "slack", accountId: "Main", caps: { streaming: "yes", editPost: true, maxVisibleChars: 0 }, post() {} };
  const v = C.validateBridge(bad);
  assert.equal(v.ok, false);
  for (const needle of ["v must be 1", "channel must be", "accountId must be normalized", "caps.streaming", "caps.maxVisibleChars", "caps.editPost requires edit()", "resolveRoute must be a function", "start must be a function"]) {
    assert(v.errors.some((e) => e.includes(needle)), `missing error: ${needle} in ${v.errors.join(" | ")}`);
  }
  assert.equal(C.validateBridge(null).ok, false);
});

test("contracts: validateStartRequest enforces ids, provenance and sender rules", () => {
  const good = startRequest();
  assert.deepEqual(C.validateStartRequest(good), { ok: true, errors: [] });
  const wake = startRequest({ kind: "wake", id: C.newBatchId() });
  assert.equal(C.validateStartRequest(wake).ok, true, C.validateStartRequest(wake).errors.join("; "));
  const tg = startRequest({ route: { channel: "telegram", accountId: "default", to: "5368086561", chatId: "5368086561", chatType: "direct", peerId: "5368086561", humans: "owner_only" }, extra: { routePeerId: "5368086561" } });
  assert.equal(tg.syntheticMessageId, tg.messageSid);
  assert.equal(C.validateStartRequest(tg).ok, true, C.validateStartRequest(tg).errors.join("; "));

  const cases = [
    [{ runId: good.runId.replace(/-0$/u, "-1") }, "runId must be"],
    [{ messageSid: "a2a:x" }, "messageSid must be"],
    [{ syntheticMessageId: "om_123" }, "syntheticMessageId must be"],
    [{ kind: "reply" }, "kind must be"],
    [{ attempt: -1 }, "attempt must be"],
    [{ id: C.newBatchId() }, "id must be a sendId"],
    [{ promptText: "" }, "promptText"],
    [{ channelPromptContext: undefined }, "channelPromptContext"],
    [{ GroupSystemPrompt: "x" }, "never GroupSystemPrompt"],
    [{ anchorMessageId: undefined }, "anchorMessageId"],
    [{ provenance: { ...good.provenance, depth: 1 } }, "not one of the 5 schema fields"],
    [{ provenance: { ...good.provenance, kind: "external_user" } }, "provenance.kind"],
    [{ provenance: { ...good.provenance, originSessionId: "a2a:c:1" } }, "originSessionId must be"],
    [{ provenance: { ...good.provenance, originSessionId: C.originSessionIdFor({ chainId: C.newChainId(), depth: 1, kind: "ask", id: good.id }) } }, "must name this kind and id"],
    [{ sender: { id: "v-a2a:c_x", name: "x", isOwnerIdentity: true } }, "synthetic sender is never the owner"],
    [{ sender: { id: OWNER, name: "x" } }, "isOwnerIdentity"],
    [{ askUserAnswererId: "v-a2a:c_x" }, "real person"],
    [{ route: { ...good.route, chatType: "dm" } }, "chatType"],
    [{ route: { ...good.route, humans: "everyone" } }, "humans"],
  ];
  for (const [patch, needle] of cases) {
    const v = C.validateStartRequest({ ...good, ...patch });
    assert.equal(v.ok, false, `expected failure for ${JSON.stringify(Object.keys(patch))}`);
    assert(v.errors.some((e) => e.includes(needle)), `missing "${needle}" in ${v.errors.join(" | ")}`);
  }
  // A direct chat's synthetic event must come from the real peer.
  const dm = startRequest({ route: { channel: "feishu", accountId: "default", to: `user:${OWNER}`, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" }, extra: { routePeerId: "ou_someoneelse" } });
  assert(C.validateStartRequest(dm).errors.some((e) => e.includes("routePeerId of a direct chat")));
});

test("contracts: start outcome, run outcome and vrelay.send params validators", () => {
  assert.equal(C.validateStartOutcome({ status: "started", runId: "v-a2a-req-x-0", done: Promise.resolve() }).ok, true);
  assert.equal(C.validateStartOutcome({ status: "busy", reason: "pending_queue" }).ok, true);
  assert.equal(C.validateStartOutcome({ status: "busy", reason: "tired" }).ok, false);
  assert.equal(C.validateStartOutcome({ status: "rejected", code: "GATED", message: "", started: false }).ok, true);
  assert.equal(C.validateStartOutcome({ status: "rejected", code: "NOPE", message: "", started: false }).ok, false);
  assert.equal(C.validateRunOutcome({ status: "ok", finals: [{ text: "x", mediaUrls: ["/tmp/a.png"] }], visibleReplySent: true, finalCount: 1 }).ok, true);
  assert.equal(C.validateRunOutcome({ status: "done", finals: {}, visibleReplySent: 1, finalCount: -1 }).errors.length, 4);

  const params = {
    v: 1,
    idempotencyKey: C.sendIdempotencyKey({ requesterSessionKey: DM_KEY, requesterRunId: "r1", toolCallId: "call_1" }),
    toolCallId: "call_1",
    requester: { sessionKey: DM_KEY, replySessionKey: DM_KEY, agentId: "makaron", runId: "r1", channel: "feishu", accountId: "default", to: `user:${OWNER}`, threadId: null, senderId: OWNER, senderIsOwner: true },
    target: { sessionKey: GROUP_KEY, agentId: "makaron", displayKey: GROUP_KEY, created: false },
    message: "做一下 a",
    mode: "async",
    inlineTimeoutMs: 0,
  };
  assert.deepEqual(C.validateSendParams(params), { ok: true, errors: [] });
  assert.equal(C.validateSendParams({ ...params, mode: "inline", inlineTimeoutMs: C.inlineTimeoutMsFor(120) }).ok, true);
  assert.equal(C.validateSendParams({ ...params, mode: "inline", inlineTimeoutMs: 400_000 }).ok, false);
  assert.equal(C.validateSendParams({ ...params, inlineTimeoutMs: 5 }).ok, false);
  assert.equal(C.validateSendParams({ ...params, idempotencyKey: "abc" }).ok, false);
  assert.equal(C.validateSendParams({ ...params, requester: { ...params.requester, runId: undefined } }).ok, false, "absent fields are null, never undefined");
});

test("fake bridge: routes, idempotent posts, injected post failures and the call log", async () => {
  const bridge = createFakeBridge({ channel: "feishu", post: [{ fail: "CHANNEL_DOWN", transient: true }] });
  const routed = await bridge.resolveRoute({ sessionKey: GROUP_KEY, agentId: "makaron", ownerIds: [OWNER] });
  assert.equal(routed.ok, true);
  assert.deepEqual(routed.route, { channel: "feishu", accountId: "default", to: `chat:${GROUP}`, chatId: GROUP, chatType: "group", humans: "unknown" });
  const dm = await bridge.resolveRoute({ sessionKey: DM_KEY, agentId: "makaron", ownerIds: [OWNER] });
  assert.equal(dm.route.humans, "owner_only");
  assert.equal(dm.route.to, `user:${OWNER}`);
  assert.deepEqual(deriveRoute("agent:makaron:dingtalk:group:cidabc", { channel: "dingtalk", ownerIds: [] }), { ok: false, code: "NO_ROUTE", reason: "dingtalk needs a stored delivery address" });
  assert.equal(deriveRoute("agent:makaron:dingtalk:group:cidabc", { channel: "dingtalk", delivery: { to: "cidAbC" } }).route.to, "cidAbC");

  const post = { route: routed.route, text: "📨 来自「Tianyi 私聊」的请求 #7F3A", idempotencyKey: C.feishuPostUuid("request", C.newSendId(), "anchor") };
  await assert.rejects(bridge.post(post), (err) => C.isBridgeError(err) && err.code === "CHANNEL_DOWN" && err.transient === true);
  const first = await bridge.post(post);
  const again = await bridge.post(post);
  assert.equal(again.messageId, first.messageId);
  assert.equal(again.deduped, true);
  assert.equal(bridge.visible.length, 1, "a deduped post is not a second visible message");
  assert.deepEqual(bridge.callsOf("post").map((c) => c.outcome.error?.code ?? (c.outcome.deduped ? "deduped" : "posted")), ["CHANNEL_DOWN", "posted", "deduped"]);

  // Non-idempotent channels post again (at-least-once, same #code).
  const tg = createFakeBridge({ channel: "telegram" });
  const tgRoute = (await tg.resolveRoute({ sessionKey: "agent:makaron:telegram:direct:5368086561", agentId: "makaron", ownerIds: ["5368086561"] })).route;
  await tg.post({ route: tgRoute, text: "x", idempotencyKey: "k" });
  await tg.post({ route: tgRoute, text: "x", idempotencyKey: "k" });
  assert.equal(tg.visible.length, 2);

  await bridge.edit({ route: routed.route, messageId: first.messageId, text: "edited" });
  assert.equal(bridge.visible.at(-1).kind, "edit");
  assert.throws(() => new C.BridgeError("NOPE"), /unknown BridgeError code/u);
});

test("fake bridge: busy and rejected starts leave nothing visible; started runs resolve done", async () => {
  const bridge = createFakeBridge({
    channel: "feishu",
    start: [
      { status: "busy", reason: "active_run" },
      { status: "rejected", code: "ROUTE_MISMATCH", message: "route said another session" },
      { status: "started", finals: [{ text: "结果 A" }], runMs: 20 },
      { status: "started", runId: "8a1e0c6e-1111-4222-8333-444455556666", finals: [] },
      { throw: "restart recovery claim changed" },
    ],
    startDelayMs: 5,
  });
  const base = startRequest();
  const at = (attempt) => startRequest({ id: base.id, attempt });
  const busy = await bridge.start(at(0));
  assert.deepEqual(busy, { status: "busy", reason: "active_run" });
  const rejected = await bridge.start(at(1));
  assert.equal(rejected.code, "ROUTE_MISMATCH");
  assert.equal(rejected.started, false);
  assert.equal(bridge.visible.length, 0, "BUSY and rejected produce zero visible output");

  const t0 = Date.now();
  const started = await bridge.start(at(2));
  assert.equal(started.status, "started");
  assert.equal(started.runId, C.runIdFor("request", base.id, 2), "preset runId honoured");
  const run = await started.done;
  assert(Date.now() - t0 >= 20);
  assert.deepEqual(run, { status: "ok", finals: [{ text: "结果 A" }], visibleReplySent: true, finalCount: 1 });
  assert.equal(C.validateRunOutcome(run).ok, true);

  // A harness that ignores the preset runId reports its own (A2 fallback: ledger uses the actual one).
  const other = await bridge.start(at(3));
  assert.equal(other.runId, "8a1e0c6e-1111-4222-8333-444455556666");
  assert.deepEqual(await other.done, { status: "ok", finals: [], visibleReplySent: false, finalCount: 0 });

  await assert.rejects(bridge.start(at(4)), (err) => C.RESTART_WEDGE_RE.test(err.message));
  assert.deepEqual(bridge.callsOf("start").map((c) => c.args.attempt), [0, 1, 2, 3, 4]);
  assert.equal(bridge.callsOf("start")[2].outcome.done, "[promise]");

  // Malformed requests are a programming error unless the test asks for a rejection.
  await assert.rejects(bridge.start({ ...at(5), runId: "v-a2a-req-wrong-5" }), /invalid StartRequest/u);
  const lenient = createFakeBridge({ onInvalid: "reject" });
  const r = await lenient.start({ ...at(5), runId: "v-a2a-req-wrong-5" });
  assert.equal(r.code, "INTERNAL");
});

test("fake bridge: held runs finish or fail on demand", async () => {
  const bridge = createFakeBridge({ holdRuns: true });
  const req = startRequest();
  const started = await bridge.start(req);
  let settled = false;
  started.done.then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(settled, false);
  assert.equal(bridge.finishRun(started.runId, { status: "aborted", finals: [], visibleReplySent: false, finalCount: 0, error: "stopped" }), true);
  assert.equal((await started.done).status, "aborted");
  assert.equal(bridge.finishRun(started.runId), false, "a run finishes once");

  const second = await bridge.start(startRequest({ id: req.id, attempt: 1 }));
  bridge.failRun(second.runId, new Error("transport lost"));
  await assert.rejects(second.done, /transport lost/u);
});
