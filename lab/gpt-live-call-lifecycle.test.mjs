import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { GPT_LIVE_CALL_INSTRUCTIONS } from "./gpt-live-h5/instructions.mjs";
import { createGptLiveCallLifecycle, createGptLiveEndCallClientTool, parseGptLiveEndCallDelegation, resolveGptLiveCallInstructions,
  createGptLiveCallLifecycleRuntimeSource } from "./gpt-live-call-lifecycle.mjs";
import { patchGptLiveCallLifecycleController, patchGptLiveCallLifecycleBroker, patchGptLiveCallLifecycleTalk,
  GPT_LIVE_CALL_BROKER_BEFORE } from "./patch-gpt-live-call-lifecycle.mjs";
import { patchGptLiveNativeProgress } from "./patch-gpt-live-native-progress.mjs";
import { patchGptLiveConsultProgressTalk } from "./gpt-live-consult-progress.mjs";
import { patchGptLiveContinuationTalk } from "./patch-gpt-live-consult-continuation.mjs";
import { patchGptLiveNativeConfirmationTalk } from "./patch-gpt-live-native-confirmation.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const controllerBefore = read("fixtures/gpt-live-native-progress/realtime-quicksilver-delegation-controller-B0yPpiHp.js");
const controllerSource = patchGptLiveCallLifecycleController(patchGptLiveNativeProgress(controllerBefore));
const brokerBefore = read("fixtures/gpt-live-call-lifecycle/realtime-quicksilver-session-B3HKftDE.js");
const brokerSource = patchGptLiveCallLifecycleBroker(brokerBefore);
const wire = read("fixtures/gpt-live-call-lifecycle/realtime-quicksilver-wire-C2tdaxFV.js");
const bridge = read("fixtures/gpt-live-call-lifecycle/realtime-quicksilver-bridge-BlvG9Zkq.js");
const talkBefore = read("../release/captured/v2026.9.1-db91.6-memory-search-fast-20261002/dist/talk-DkFuKRod.js");
const talkSource = patchGptLiveCallLifecycleTalk(patchGptLiveNativeConfirmationTalk(patchGptLiveContinuationTalk(patchGptLiveConsultProgressTalk(talkBefore))));
const endPrompt = '{"name":"openclaw_end_call","arguments":{}}';

// Execute the actual native parser for well-formed provider frames. Imported
// schemas are an accepting boundary for these controlled, valid test inputs;
// event classification and delegation target/text extraction are real code.
const parseSource = wire.slice(wire.indexOf("function parseOpenAIQuicksilverEvent("), wire.indexOf("function chunkOpenAIQuicksilverAppendText("));
const schema = { safeParse: (data) => ({ success: true, data }) };
const parseNative = new Function("eventEnvelopeSchema", "sessionStartedSchema", "transcriptAddedSchema", "turnDoneSchema", "outputAudioDeltaSchema", "delegationSchema", "readQuicksilverErrorMessage", "isFatalQuicksilverAuthError", parseSource + "return parseOpenAIQuicksilverEvent;")
  (schema, schema, schema, schema, schema, schema, (v) => v.error?.message ?? "error", () => false);
const chunkSource = wire.slice(wire.indexOf("function chunkOpenAIQuicksilverAppendText("), wire.indexOf("/** Bound completed delegation output"));
const chunkNative = new Function("Buffer", "OPENAI_QUICKSILVER_APPEND_MAX_BYTES", chunkSource + "return chunkOpenAIQuicksilverAppendText;")(Buffer, 500);
const Controller = new Function("createHash", "randomUUID", "createGptLiveCallLifecycle", "createGptLiveEndCallClientTool", "toErrorObject", "formatErrorMessage", "rawDataToString", "buildOpenAIQuicksilverDelegationPrompt", "parseOpenAIQuicksilverEvent", "boundOpenAIQuicksilverDelegationResult", "chunkOpenAIQuicksilverAppendText", "boundOpenAIQuicksilverContextItems",
  controllerSource.replace(/^import[^\n]*\n/gmu, "").replace(/export \{ OpenAIQuicksilverDelegationController as t \};\s*$/u, "") + "return OpenAIQuicksilverDelegationController;")
  (createHash, randomUUID, createGptLiveCallLifecycle, createGptLiveEndCallClientTool, (v) => v instanceof Error ? v : new Error(String(v)), (v) => v.message, String, ({ input }) => input, parseNative, (v) => v, chunkNative, (v) => v);

function nativeFixture({ enabled = true, onToolEvent, adopted = true, runAgentConsult } = {}) {
  const order = [], errors = [], calls = [], abort = new AbortController();
  let currentLease = adopted;
  const socket = { readyState: 1, fail: false, send(value) {
    if (this.fail) throw new Error("socket send failed");
    order.push({ kind: "frame", ...JSON.parse(value) });
  } };
  const controller = new Controller({ signal: abort.signal, getSocket: () => socket, logger: { warn() {} },
    callLifecycle: enabled, isCallCurrent: () => currentLease,
    onCallLifecycleEvent: (event) => { order.push({ kind: "tool", ...event }); onToolEvent?.(event); },
    onError: (error) => errors.push(error), onFatalError: (error) => errors.push(error),
    runAgentConsult: (params) => { calls.push(params); return runAgentConsult ? runAgentConsult(params) : new Promise(() => {}); } });
  const frame = (event) => controller.handleFrame(JSON.stringify(event), false);
  const start = () => frame({ type: "session.started", session: {} });
  const end = (id = "native-end-1", origin = "actual-user-turn") => frame({ type: "delegation.created", item: { type: "delegation", target: "client", id, ...(origin ? { user_bidi_turn_id: origin } : {}), content: [{ type: "input_text", text: endPrompt }] } });
  return { controller, abort, socket, order, errors, calls, frame, start, end, legacyEnd: (id = "native-end-1", origin = "actual-user-turn") => controller.callLifecycle.handleDelegation(id, endPrompt, origin),
    setCurrentLease: value => { currentLease = value; } };
}

test("captured broker/wire/bridge bytes pin the supported native protocol", () => {
  assert.equal(sha(brokerBefore), GPT_LIVE_CALL_BROKER_BEFORE);
  assert.equal(sha(wire), "ef27bc83998b3e3356a34f60266a1797027979139c196f6b87023c5ab95521a1");
  assert.equal(sha(bridge), "450f4f9fe74150873f9ebfe15f9d926651d7453d2be12de6ec04f15dc3368715");
  assert.match(bridge, /triggerGreeting\(instructions\) \{\s*this\.sendContext\("session.context.append", void 0, instructions \?\? "Greet the user briefly\.", "speakable"\)/u);
});

test("historical direct JSON parser accepts only its complete exact contract", () => {
  assert.equal(parseGptLiveEndCallDelegation(endPrompt), true);
  for (const value of ["就聊到这", "please hang up", "```json\n" + endPrompt + "\n```", "prefix " + endPrompt,
    '{"name":"openclaw_end_call","arguments":{"voiceSessionId":"other"}}',
    '{"name":"openclaw_end_call","arguments":{},"session":"other"}',
    '{"name":"openclaw_end_call","arguments":[]}', '{"name":"openclaw_agent_consult","arguments":{}}']) {
    assert.equal(parseGptLiveEndCallDelegation(value), false, value);
  }
});

test("exact native client profile uses the new code contract and leaves all neighboring profiles unchanged", () => {
  const profile = { providerId: "openai", model: "gpt-live-1-codex", transport: "webrtc", brain: "agent-consult", capabilities: { handlesAgentConsult: true, supportsToolCalls: false } };
  assert.equal(resolveGptLiveCallInstructions("old conflicting config", profile), GPT_LIVE_CALL_INSTRUCTIONS);
  for (const changed of [{ providerId: "bytedance" }, { model: "gpt-realtime" }, { transport: "gateway-relay" }, { brain: "none" }, { capabilities: { handlesAgentConsult: true, supportsToolCalls: true } }]) {
    assert.equal(resolveGptLiveCallInstructions("unchanged", { ...profile, ...changed }), "unchanged");
  }
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /End-call host tool/u);
});

test("natural end intent has action priority while explicit keep, stop-speaking and discussion retain the call", () => {
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /^Call-action priority:/u);
  assert(GPT_LIVE_CALL_INSTRUCTIONS.indexOf("Call-action priority:") < GPT_LIVE_CALL_INSTRUCTIONS.indexOf("简单旁聊、语速调整"));
  const priority = GPT_LIVE_CALL_INSTRUCTIONS.split("\n\n")[0];
  assert.match(priority, /先实际发起 native client delegation/u);
  assert.match(priority, /后台真实调用 openclaw_end_call/u);
  assert.match(priority, /只有收到主机对当前真实结束请求的接受上下文后才简短告别/u);
  assert.match(priority, /不生成虚构 JSON 或伪造调用/u);
  const examples = GPT_LIVE_CALL_INSTRUCTIONS.split("\n\n")[1];
  assert.match(examples, /今天就先这样，谢谢你，拜拜。.*实际委派并执行结束工具/u);
  assert.match(examples, /我不是说拜拜，先别挂，我还要问。.*保留通话，不调用结束工具/u);
  assert.match(examples, /先停下播音.*保留通话和当前后台任务/u);
  assert.match(examples, /挂断功能应该怎么实现.*讨论功能，不结束当前通话/u);
  assert.match(examples, /不能仅凭某个词触发结束/u);
  for (const policy of ["End-call host tool:", "Consult goal policy:", "Task continuation policy:", "Final source policy:", "Scope fidelity policy:"]) {
    assert(GPT_LIVE_CALL_INSTRUCTIONS.includes(policy), policy);
  }
});

test("actual native capability profile receives the identical priority contract in generated runtime only", async () => {
  const match = brokerSource.match(/const OPENAI_QUICKSILVER_CAPABILITIES = (\{[\s\S]*?\});/u);
  assert(match, "captured native broker must expose its actual capability object");
  const capabilities = new Function("return (" + match[1] + ");")();
  const profile = { providerId: "openai", model: "gpt-live-1-codex", transport: "webrtc", brain: "agent-consult", capabilities };
  const runtime = await import("data:text/javascript;base64," + Buffer.from(createGptLiveCallLifecycleRuntimeSource()).toString("base64"));
  assert.equal(resolveGptLiveCallInstructions("old config", profile), GPT_LIVE_CALL_INSTRUCTIONS);
  assert.equal(runtime.resolveGptLiveCallInstructions("old config", profile), GPT_LIVE_CALL_INSTRUCTIONS);
  assert.equal(runtime.resolveGptLiveCallInstructions("old config", { ...profile, transport: undefined }), GPT_LIVE_CALL_INSTRUCTIONS);
  for (const changed of [{ model: "gpt-realtime" }, { transport: "gateway-relay" }, { capabilities: {} },
    { capabilities: { ...capabilities, handlesAgentConsult: false } }, { capabilities: { ...capabilities, supportsToolCalls: true } }]) {
    assert.equal(runtime.resolveGptLiveCallInstructions("neighbor contract", { ...profile, ...changed }), "neighbor contract");
  }
});

test("actual controller accepts owned browser ready without a sideband started event and sends greeting once", () => {
  const f = nativeFixture({ adopted: false });
  assert.throws(() => f.controller.callLifecycle.ready(), /no longer active/u);
  assert.equal(f.order.length, 0);
  f.start();
  assert.equal(f.order.length, 0, "session.started alone cannot race browser playback readiness");
  assert.throws(() => f.controller.callLifecycle.ready(), /no longer active/u);
  f.setCurrentLease(true);
  assert.deepEqual(f.controller.callLifecycle.ready(), { ok: true, greetingRequested: true });
  assert.equal(f.order.length, 1);
  f.controller.detach();
  const withoutStarted = nativeFixture();
  assert.deepEqual(withoutStarted.controller.callLifecycle.ready(), { ok: true, greetingRequested: true });
  assert.deepEqual(withoutStarted.controller.callLifecycle.ready(), { ok: true, greetingRequested: true });
  assert.equal(withoutStarted.order.length, 1);
  assert.equal(withoutStarted.order[0].type, "session.context.append");
  assert.equal(withoutStarted.order[0].channel, "speakable");
  assert.equal(withoutStarted.order[0].content[0].type, "input_text");
  assert.equal(withoutStarted.calls.length, 0);
  withoutStarted.controller.detach();
});

test("missing broker ownership, replaced lease and closed socket cannot authorize greeting or native end", () => {
  for (const state of ["unadopted", "replaced", "closed-socket"]) {
    const f = nativeFixture({ adopted: state !== "unadopted" });
    f.start();
    if (state === "replaced") f.setCurrentLease(false);
    if (state === "closed-socket") f.socket.readyState = 3;
    assert.throws(() => f.controller.callLifecycle.ready(), /no longer active/u);
    assert.throws(() => f.legacyEnd(), /no longer active/u);
    assert.equal(f.order.length, 0);
    assert.equal(f.calls.length, 0);
    f.controller.detach();
  }
  const socket = { readyState: 1, send() { throw new Error("must not send"); } };
  const abort = new AbortController();
  const controller = new Controller({ signal: abort.signal, getSocket: () => socket, callLifecycle: true,
    logger: { warn() {} }, onCallLifecycleEvent() {}, runAgentConsult() {} });
  assert.throws(() => controller.callLifecycle.ready(), /no longer active/u, "local !stopped is insufficient ownership");
  controller.detach();
});

test("historical direct lifecycle contract does not depend on a duplicated sideband started event", () => {
  const f = nativeFixture(); f.legacyEnd();
  assert.deepEqual(f.order.map(v => v.type), ["tool.call", "tool.result", "delegation.context.append"]);
  assert.equal(f.order[0].payload.originUserTurnId, "actual-user-turn");
  assert.equal(f.order[2].delegation_item_id, "native-end-1");
  assert.equal(f.calls.length, 0);
  f.controller.detach();
});

test("a real native started observation does not request greeting before host ready", () => {
  const f = nativeFixture(); f.start();
  assert.equal(f.order.length, 0);
  assert.deepEqual(f.controller.callLifecycle.ready(), { ok: true, greetingRequested: true });
  assert.deepEqual(f.controller.callLifecycle.ready(), { ok: true, greetingRequested: true });
  assert.equal(f.order.length, 1);
  assert.equal(f.order[0].type, "session.context.append");
  assert.equal(f.order[0].channel, "speakable");
  assert.equal(f.order[0].content[0].type, "input_text");
  assert.equal(f.calls.length, 0);
  f.controller.detach();
});

test("greeting socket failure cannot claim success; retry remains possible while current", () => {
  const f = nativeFixture(); f.start(); f.socket.fail = true;
  assert.throws(() => f.controller.callLifecycle.ready(), /socket send failed/u);
  f.socket.fail = false;
  assert.equal(f.controller.callLifecycle.ready().ok, true);
  assert.equal(f.order.length, 1);
  f.controller.detach();
});

test("historical direct lifecycle unit emits acceptance before supported goodbye append", () => {
  const f = nativeFixture(); f.start(); f.legacyEnd();
  assert.deepEqual(f.order.map((v) => v.type), ["tool.call", "tool.result", "delegation.context.append"]);
  assert.deepEqual(f.order[1].payload, { name: "openclaw_end_call", requestId: "native-end-1", originUserTurnId: "actual-user-turn", status: "accepted", closeAfterPlayback: true });
  assert.equal(f.order[2].delegation_item_id, "native-end-1");
  assert.equal(f.order[2].channel, "speakable");
  assert.equal(f.calls.length, 0);
  assert.equal(f.abort.signal.aborted, false);
  assert.equal(f.controller.stopped, false);
  f.legacyEnd();
  assert.equal(f.order.length, 3, "same native tool id cannot replay goodbye");
  f.controller.detach();
});

test("historical direct lifecycle unit failed goodbye keeps the call open", () => {
  const f = nativeFixture(); f.start(); f.socket.fail = true; f.legacyEnd();
  assert.deepEqual(f.order.map((v) => v.type), ["tool.call", "tool.result", "tool.error"]);
  assert.equal(f.order[2].callId, "native-end-1");
  assert.equal(f.order[2].payload.originUserTurnId, "actual-user-turn");
  assert.equal(f.errors.length, 1);
  assert.equal(f.controller.stopped, false);
  assert.equal(f.calls.length, 0);
  f.controller.detach();
});

test("historical direct lifecycle unit does not infer absent or invalid turn identity", () => {
  for (const origin of [undefined, "invalid turn identity", "observed-user-id"]) {
    const f = nativeFixture(); f.start(); f.legacyEnd("end-origin", origin ?? null);
    const events = f.order.filter(v => v.kind === "tool");
    assert.equal(events.length, 2);
    assert.equal(events[0].payload.originUserTurnId, origin === "observed-user-id" ? origin : undefined);
    assert.equal(events[1].payload.originUserTurnId, origin === "observed-user-id" ? origin : undefined);
    f.controller.detach();
  }
  assert.equal(parseGptLiveEndCallDelegation('{"name":"openclaw_end_call","arguments":{"originUserTurnId":"model-spoof"}}'), false);
});

test("detach/abort revoke lifecycle and a late old call cannot affect a new one", () => {
  for (const stop of ["detach", "abort"]) {
    const old = nativeFixture(); old.start();
    if (stop === "detach") old.controller.detach(); else old.abort.abort(new Error("closed"));
    assert.throws(() => old.controller.callLifecycle.ready(), /no longer active/u);
    old.end(); assert.equal(old.order.length, 0);
    const next = nativeFixture(); next.start(); next.controller.callLifecycle.ready(); next.legacyEnd();
    assert.equal(next.order.length, 4);
    next.controller.detach();
  }
});

test("ordinary backend delegation and neighboring native sessions keep their original consult path", async () => {
  const f = nativeFixture(); f.start();
  f.frame({ type: "delegation.created", item: { type: "delegation", target: "client", id: "backend", content: [{ type: "input_text", text: "读取当前真实时间" }] } });
  await Promise.resolve();
  assert.equal(f.calls.length, 1);
  const other = nativeFixture({ enabled: false }); other.start(); other.end();
  assert.equal(other.controller.callLifecycle, undefined);
  assert.equal(other.calls.length, 1);
  f.controller.detach(); other.controller.detach();
});

test("actual broker binds only its native exact-model lifecycle and forwards actual transcript unchanged", () => {
  const start = brokerSource.indexOf("\t\t\tconst abortController = new AbortController();", brokerSource.indexOf("const connected = await connectOpenAIQuicksilverSideband"));
  const end = brokerSource.indexOf("\t\t\tsession = activeSessionLease.adopt", start);
  assert(start > 0 && end > start);
  const construct = new Function("offer", "connected", "params", "activeSessionLease", "session", "OPENAI_QUICKSILVER_SESSION_TTL_MS", "OpenAIQuicksilverDelegationController", "runAgentConsult", brokerSource.slice(start, end) + "return delegations;");
  for (const model of ["gpt-live-1-codex", "gpt-realtime"]) {
    const bound = [], transcripts = [];
    const gatewayControl = { bindCallLifecycle: (v) => bound.push(v), onTranscript: (...v) => transcripts.push(v) };
    const controller = construct({ request: { model, gatewayControl } }, { socket: {} }, { logger: {} }, {}, undefined, 1000,
      class { constructor(options) { this.options = options; this.callLifecycle = options.callLifecycle ? {} : undefined; } }, () => {});
    assert.equal(bound.length, model === "gpt-live-1-codex" ? 1 : 0);
    controller.options.onTranscript("user", "真实确认执行", true);
    assert.deepEqual(transcripts, [["user", "真实确认执行", true]]);
  }
  const gaStart = brokerBefore.indexOf("\t\t\tif (gaSideband) {");
  const gaEnd = brokerBefore.indexOf("\t\t\tconst runAgentConsult", gaStart);
  assert(gaStart > 0 && gaEnd > gaStart);
  assert(brokerSource.includes(brokerBefore.slice(gaStart, gaEnd)), "GA sideband code remains byte-for-byte unchanged");
});

// Run the actual patched broker's construction and adoption. The host map and
// socket are bounded stand-ins; the current-lease closure and lifecycle are the
// transformed runtime code, including its before-adoption binding order.
function adoptedBrokerFixture({ model = "gpt-live-1-codex" } = {}) {
  const from = brokerSource.indexOf("\t\t\tconst abortController = new AbortController();", brokerSource.indexOf("const connected = await connectOpenAIQuicksilverSideband"));
  const to = brokerSource.indexOf("\n\t\t\tactiveSessionLease.expireIn(session,", from);
  assert(from > 0 && to > from);
  const construct = new Function("offer", "connected", "params", "activeSessionLease", "session", "OPENAI_QUICKSILVER_SESSION_TTL_MS",
    "OpenAIQuicksilverDelegationController", "runAgentConsult", "activeSessions", "token", "lifecycleSignal", "WEBSOCKET_OPEN", "reportTerminal",
    brokerSource.slice(from, to) + "return { controller: delegations, session };");
  const activeSessions = new Map(), token = "private-broker-token", lifetime = new AbortController();
  const order = [], beforeAdoption = [], expiry = [];
  const socket = { readyState: 1, send: value => order.push(JSON.parse(value)), close() { this.readyState = 3; } };
  const gatewayControl = {
    bindCallLifecycle(value) {
      assert.throws(() => value.ready(), /no longer active/u);
      beforeAdoption.push(true);
    },
    onCallLifecycleEvent: event => order.push(event),
  };
  const lease = {
    adopt(key, wire) { const value = { token: key, ...wire }; activeSessions.set(key, value); return value; },
    expireIn: (session, ttl) => expiry.push({ session, ttl }), close() {},
  };
  const value = construct({ request: { model, gatewayControl } }, { socket }, { logger: { warn() {}, debug() {} } }, lease, undefined,
    1800000, Controller, () => new Promise(() => {}), activeSessions, token, lifetime.signal, 1, () => {});
  return { ...value, activeSessions, token, lifetime, socket, order, beforeAdoption, expiry };
}

test("actual broker adopted lease authorizes pickup without sideband session.started", () => {
  const f = adoptedBrokerFixture();
  assert.deepEqual(f.beforeAdoption, [true]);
  assert.equal(f.activeSessions.get(f.token), f.session);
  assert.equal(f.controller.options.isCallCurrent(), true);
  assert.deepEqual(f.controller.callLifecycle.ready(), { ok: true, greetingRequested: true });
  assert.deepEqual(f.controller.callLifecycle.ready(), { ok: true, greetingRequested: true });
  assert.equal(f.order.length, 1);
  assert.equal(f.order[0].type, "session.context.append");
  assert.equal(f.order[0].channel, "speakable");
  assert(!f.order.some(event => event.type === "session.started"), "no native event is manufactured");
  f.controller.detach();
});

test("actual adopted broker lease accepts host-bound backend tool receipt without requiring sideband started", () => {
  const f = adoptedBrokerFixture();
  f.controller.callLifecycle.acceptBackendTool({ nativeDelegationId: "broker-end-real", originUserTurnId: "broker-user-real",
    delegationGeneration: 1, backendRunId: "talk-realtime-consult:real:broker", backendToolCallId: "call_broker_real" });
  assert.deepEqual(f.order.map(event => event.type), ["tool.call", "tool.result", "delegation.context.append"]);
  assert.equal(f.order[0].payload.originUserTurnId, "broker-user-real");
  assert.equal(f.order[1].callId, "call_broker_real");
  assert.equal(f.order[2].delegation_item_id, "broker-end-real");
  assert.equal(f.activeSessions.get(f.token), f.session, "host acceptance does not prematurely close the broker lease");
  f.controller.detach();
});

test("actual broker lease replacement, closing, socket replacement/close and lifecycle abort revoke controls", () => {
  for (const change of ["replace-lease", "closing", "replace-socket", "close-socket", "abort-lifecycle", "dispose"]) {
    const f = adoptedBrokerFixture();
    if (change === "replace-lease") f.activeSessions.set(f.token, { ...f.session });
    if (change === "closing") f.session.closing = Promise.resolve();
    if (change === "replace-socket") f.session.socket = { readyState: 1 };
    if (change === "close-socket") f.socket.readyState = 3;
    if (change === "abort-lifecycle") f.lifetime.abort(new Error("closed"));
    if (change === "dispose") f.session.dispose();
    assert.equal(f.controller.options.isCallCurrent(), false, change);
    assert.throws(() => f.controller.callLifecycle.ready(), /no longer active/u, change);
    const afterChange = f.order.length;
    assert.throws(() => f.controller.callLifecycle.handleDelegation("real-end", endPrompt, "actual-user-turn"), /no longer active/u, change);
    assert.equal(f.order.length, afterChange, "revoked control cannot emit or send goodbye");
    f.controller.detach();
  }
});

test("actual broker preserves native expiry handling and rejects controls after an aborted lease", () => {
  const f = adoptedBrokerFixture();
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  f.controller.handleFrame(JSON.stringify({ type: "session.started", session: { expires_at: expiresAt } }), false);
  assert.equal(f.expiry.length, 1);
  assert.equal(f.expiry[0].session, f.session);
  assert(f.expiry[0].ttl > 0 && f.expiry[0].ttl <= 60000);
  assert.equal(f.order.length, 0, "an observed event does not itself authorize pickup");
  f.controller.callLifecycle.ready();
  assert.equal(f.order[0].type, "session.context.append");
  f.controller.detach();
});

// Execute the whole actual transformed owner. DOM/RTC/agent operations are not
// involved; only host boundaries are faked to inspect ownership and emissions.
function talkFixture() {
  const from = talkSource.indexOf("function createTalkClientGatewayControlOwner(params) {");
  const to = talkSource.indexOf("async function closeTalkClientGatewayControlSession", from);
  const construct = new Function("randomUUID", "owners", "pendingOwners", "createRealtimeControlQueue", "createRealtimeVoiceSessionHarness", "createTalkRealtimeRunControlOwner", "registerTalkConnectionCleanup", "formatErrorMessage", talkSource.slice(from, to) + "return createTalkClientGatewayControlOwner;");
  const owners = new Map(), pendingOwners = new Set(), emitted = [], targets = { agentId: "agent", sessionKey: "canonical", canonicalKey: "canonical", storePath: "/private/store" };
  const factory = construct(randomUUID, owners, pendingOwners, () => ({ seal() {}, flush: async () => {} }),
    () => ({ emit: (v) => emitted.push(v), ensureTurn: () => "harness-turn", close() {} }),
    () => ({ close: async () => {} }), () => {}, (v) => v.message);
  const owner = factory({ connId: "conn", voiceSessionId: "voice", sessionTarget: targets,
    context: { logGateway: { warn() {} } }, assertConnectionOpen() {}, flushTranscript: async () => {}, closeLogicalSession: async () => {} });
  owner.activate();
  return { owner, owners, emitted, targets };
}

test("actual Talk owner publishes end evidence on the exact voice and rejects replaced/closed ownership", async () => {
  const f = talkFixture(); let ready = 0, closed = 0;
  f.owner.control.bindCallLifecycle({ ready: () => (++ready, { ok: true }), close: () => closed++ });
  assert.equal(f.owner.requestCallReady().ok, true);
  f.owner.control.onCallLifecycleEvent({ type: "tool.result", callId: "end-id", payload: { name: "openclaw_end_call", requestId: "end-id", closeAfterPlayback: true } });
  assert.deepEqual(f.emitted[0], { type: "tool.result", callId: "end-id", turnId: "harness-turn", payload: { name: "openclaw_end_call", requestId: "end-id", closeAfterPlayback: true, voiceSessionId: "voice" }, final: true });
  f.owners.set("voice", {});
  assert.throws(() => f.owner.requestCallReady(), /not active/u);
  assert.throws(() => f.owner.control.onCallLifecycleEvent({ type: "tool.result", payload: { name: "openclaw_end_call" } }), /not active/u);
  assert.equal(ready, 1);
  await f.owner.close(); assert.equal(closed, 1);
  assert.throws(() => f.owner.requestCallReady(), /closed/u);
});

test("actual existing Talk tool route requires exact connection/canonical voice ownership and ready args", async () => {
  const start = talkSource.indexOf('\t"talk.client.toolCall": async (request) => {');
  const body = start + '\t"talk.client.toolCall": async (request) => {'.length;
  const end = talkSource.indexOf("\t\tconst config = request.context.getRuntimeConfig();", body);
  assert(start > 0 && end > body);
  const f = talkFixture(); let ready = 0;
  f.owner.control.bindCallLifecycle({ ready: () => (++ready, { ok: true }), close() {} });
  const handler = new Function("owners", "assertValidParams", "validateTalkClientToolCallParams", "requirePreparedTalkSessionTarget", "normalizeOptionalString", "errorShape", "ErrorCodes", "formatErrorMessage", "return async(request)=>{" + talkSource.slice(body, end) + 'return "ordinary-path";};')
    (f.owners, () => true, {}, (v) => { if (!v) throw new Error("missing target"); return v; }, (v) => typeof v === "string" ? v.trim() : undefined, (code, message) => ({ code, message }), { INVALID_REQUEST: "invalid" }, (v) => v.message);
  const base = { params: { name: "openclaw_live_call_control", voiceSessionId: "voice", callId: "host-ready-1", args: { action: "ready" } }, client: { connId: "conn" }, sessionMutationAuthorization: { talkSessionTarget: f.targets, assertCurrent() {} } };
  const invoke = async (request) => { let result; await handler({ ...request, respond: (...v) => { result = v; } }); return result; };
  assert.equal((await invoke(base))[0], true);
  for (const request of [{ ...base, client: { connId: "other" } }, { ...base, params: { ...base.params, voiceSessionId: "other" } },
    { ...base, sessionMutationAuthorization: { ...base.sessionMutationAuthorization, talkSessionTarget: { ...f.targets, canonicalKey: "other" } } },
    { ...base, sessionMutationAuthorization: undefined }, { ...base, params: { ...base.params, args: { action: "ready", extra: true } } },
    { ...base, sessionMutationAuthorization: { ...base.sessionMutationAuthorization, assertCurrent() { throw new Error("revoked"); } } }]) {
    assert.equal((await invoke(request))[0], false);
  }
  assert.equal(ready, 1);
  assert.equal(await handler({ ...base, params: { name: "openclaw_agent_consult" }, respond() {} }), "ordinary-path");
  await f.owner.close();
});

test("runtime source exports executable identical contracts; transforms are idempotent and fail on anchor drift", async () => {
  const runtime = await import("data:text/javascript;base64," + Buffer.from(createGptLiveCallLifecycleRuntimeSource()).toString("base64"));
  assert.equal(runtime.parseGptLiveEndCallDelegation(endPrompt), true);
  assert.equal(runtime.resolveGptLiveCallInstructions("old", { providerId: "other" }), "old");
  for (const [patch, source] of [[patchGptLiveCallLifecycleController, controllerSource], [patchGptLiveCallLifecycleBroker, brokerSource], [patchGptLiveCallLifecycleTalk, talkSource]]) assert.equal(patch(source), source);
  assert.throws(() => patchGptLiveCallLifecycleController(controllerBefore.replace("this.stopped = false;", "this.stopped = true;")), /exactly once/u);
  assert.throws(() => patchGptLiveCallLifecycleBroker(brokerBefore.replace("getSocket: () => connected.socket,", "getSocket: () => null,")), /exactly once/u);
});

const settleTick = () => new Promise(resolve => setImmediate(resolve));

test("backend end definition is a real zero-argument model function with no model-owned identities", () => {
  const tool = createGptLiveEndCallClientTool();
  assert.equal(tool.type, "function"); assert.equal(tool.function.name, "openclaw_end_call");
  assert.deepEqual(tool.function.parameters, { type: "object", properties: {}, additionalProperties: false });
  assert.doesNotMatch(JSON.stringify(tool.function.parameters), /session|turn|owner|runId/u);
  assert.match(GPT_LIVE_CALL_INSTRUCTIONS, /完整的用户自然原句/u);
  assert.doesNotMatch(GPT_LIVE_CALL_INSTRUCTIONS, /input_text 必须严格为/u);
});

test("host backend acceptance keeps actual model tool identity distinct from the original native item", () => {
  const f = nativeFixture();
  const proof = { nativeDelegationId: "item_real", originUserTurnId: "turn_real", delegationGeneration: 2,
    backendRunId: "talk-realtime-consult:123:real", backendToolCallId: "call_real" };
  const receipt = f.controller.callLifecycle.acceptBackendTool(proof);
  assert.equal(receipt.source, "backend_model_client_tool");
  assert.equal(receipt.callId, "call_real"); assert.equal(receipt.requestId, "item_real");
  assert.equal(receipt.delegationGeneration, 2); assert.equal(Object.isFrozen(receipt), true);
  assert.deepEqual(f.order.map(row => row.type), ["tool.call", "tool.result", "delegation.context.append"]);
  assert.equal(f.order[1].callId, "call_real"); assert.equal(f.order[1].payload.nativeDelegationId, "item_real");
  assert.equal(f.order[2].delegation_item_id, "item_real");
  assert.strictEqual(f.controller.callLifecycle.acceptBackendTool(proof), receipt);
  assert.equal(f.controller.callLifecycle.acceptBackendTool({ ...proof, backendToolCallId: "call_other" }), false);
  assert.equal(f.order.length, 3);
  for (const bad of [{ ...proof, nativeDelegationId: 123 }, { ...proof, backendToolCallId: "item_fake" },
    { ...proof, originUserTurnId: "" }, { ...proof, delegationGeneration: 0 }])
    assert.equal(f.controller.callLifecycle.acceptBackendTool(bad), false);
  f.controller.detach();
});

test("plain natural delegation waits for the exact complete USER before exposing the genuine backend end tool", async () => {
  let finish;
  const f = nativeFixture({ runAgentConsult: () => new Promise(resolve => { finish = resolve; }) });
  f.frame({ type: "turn.created", turn: { role: "user", id: "turn_actual", transcript: "今天就先" } });
  f.frame({ type: "delegation.created", item: { type: "delegation", target: "client", id: "item_actual",
    user_bidi_turn_id: "turn_actual", content: [{ type: "input_text", text: "今天就先这样，谢谢你，拜拜" }] } });
  assert.equal(f.calls.length, 0); assert.equal(f.order.length, 0, "natural text is not converted into a JSON tool");
  f.frame({ type: "turn.done", turn: { role: "user", id: "turn_actual", transcript: "今天就先这样，谢谢你，拜拜" } });
  await settleTick();
  assert.equal(f.calls.length, 1);
  const control = f.calls[0].callControl;
  assert.equal(control.userTurnText, "今天就先这样，谢谢你，拜拜");
  assert.equal(control.nativeDelegationId, "item_actual"); assert.equal(control.originUserTurnId, "turn_actual");
  assert.equal(control.tool.function.name, "openclaw_end_call"); assert.equal(control.isCurrent(), true);
  const receipt = control.accept({ backendRunId: "talk-realtime-consult:456:actual", backendToolCallId: "call_actual" });
  assert.equal(receipt.backendToolCallId, "call_actual");
  f.calls[0].onProgress({ text: "另一个普通结果。", kind: "commentary", provenance: { runId: "talk-realtime-consult:456:actual", sequence: 1 } });
  finish({ callControl: receipt }); await settleTick();
  assert.equal(f.order.filter(row => row.type === "delegation.context.append").length, 1);
  assert.doesNotMatch(JSON.stringify(f.order), /BACKEND_FINAL|BACKEND_FAILURE|另一个普通/u);
  f.controller.detach();
});

test("current full USER text remains semantic model input rather than a hangup keyword classifier", async () => {
  const f = nativeFixture();
  f.frame({ type: "turn.created", turn: { role: "user", id: "turn_keep", transcript: "先别挂" } });
  f.frame({ type: "delegation.created", item: { type: "delegation", target: "client", id: "item_keep",
    user_bidi_turn_id: "turn_keep", content: [{ type: "input_text", text: "先别挂，我还要继续说" }] } });
  f.frame({ type: "turn.done", turn: { role: "user", id: "turn_keep", transcript: "先别挂，我还要继续说" } });
  await settleTick();
  assert.equal(f.calls[0].callControl.userTurnText, "先别挂，我还要继续说");
  assert.equal(f.order.length, 0, "only an actual model tool request can ask the host to end");
  f.controller.detach();
});

test("new USER, replaced broker, closed socket and stop revoke a previously issued backend end capability", async () => {
  for (const change of ["user", "lease", "socket", "stop"]) {
    const f = nativeFixture();
    f.frame({ type: "turn.created", turn: { role: "user", id: "turn_old", transcript: "拜拜" } });
    f.frame({ type: "turn.done", turn: { role: "user", id: "turn_old", transcript: "拜拜" } });
    f.frame({ type: "delegation.created", item: { type: "delegation", target: "client", id: "item_old",
      user_bidi_turn_id: "turn_old", content: [{ type: "input_text", text: "拜拜" }] } });
    await settleTick(); const control = f.calls[0].callControl;
    if (change === "user") f.frame({ type: "turn.created", turn: { role: "user", id: "turn_new", transcript: "等等" } });
    else if (change === "lease") f.setCurrentLease(false);
    else if (change === "socket") f.socket.readyState = 3;
    else f.controller.detach();
    assert.equal(control.isCurrent(), false, change);
    assert.equal(control.accept({ backendRunId: "talk-realtime-consult:789:late", backendToolCallId: "call_late" }), false, change);
    assert.equal(f.order.length, 0, change); f.controller.detach();
  }
});

test("a new USER before original final keeps ordinary work but never exposes a stale end tool", async () => {
  const f = nativeFixture();
  f.frame({ type: "turn.created", turn: { role: "user", id: "turn_prefix", transcript: "今天" } });
  f.frame({ type: "delegation.created", item: { type: "delegation", target: "client", id: "item_prefix",
    user_bidi_turn_id: "turn_prefix", content: [{ type: "input_text", text: "今天" }] } });
  f.frame({ type: "turn.created", turn: { role: "user", id: "turn_other", transcript: "换一个话题" } });
  f.frame({ type: "turn.done", turn: { role: "user", id: "turn_prefix", transcript: "今天就先这样" } });
  await settleTick(); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].callControl, undefined);
  assert.equal(f.order.length, 0); f.controller.detach();
});

test("the active controller never promotes even an exact JSON delegation string into a host hangup", async () => {
  const f = nativeFixture();
  f.frame({ type: "turn.created", turn: { role: "user", id: "turn_json", transcript: "解释这个挂断 JSON" } });
  f.frame({ type: "turn.done", turn: { role: "user", id: "turn_json", transcript: "解释这个挂断 JSON" } });
  f.frame({ type: "delegation.created", item: { type: "delegation", target: "client", id: "item_json",
    user_bidi_turn_id: "turn_json", content: [{ type: "input_text", text: endPrompt }] } });
  await settleTick();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].prompt, endPrompt);
  assert.equal(f.calls[0].callControl.userTurnText, "解释这个挂断 JSON");
  assert.equal(f.order.length, 0);
  assert.doesNotMatch(controllerSource, /this\.callLifecycle\?\.handleDelegation/u);
  f.controller.detach();
});
