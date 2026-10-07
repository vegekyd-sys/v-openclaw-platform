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

import {presentBackendResult,LONG_RESULT_NOTICE,backendResultQuestion} from "./gpt-live-h5/result-presentation.mjs";

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

function nativeFixture({ enabled = true, onToolEvent, adopted = true, runAgentConsult, isCanceledError, onBackendResult } = {}) {
  const order = [], errors = [], calls = [], diagnostics = [], warnings = [], abort = new AbortController();
  let currentLease = adopted;
  const socket = { readyState: 1, fail: false, send(value) {
    if (this.fail) throw new Error("socket send failed");
    order.push({ kind: "frame", ...JSON.parse(value) });
  } };
  const controller = new Controller({ signal: abort.signal, getSocket: () => socket, logger: { warn: text => warnings.push(text) }, isCanceledError,
    onBackendResult, callLifecycle: enabled, isCallCurrent: () => currentLease,
    onCallLifecycleEvent: (event) => { order.push({ kind: "tool", ...event }); onToolEvent?.(event); },
    onPublicProgressDiagnostic: event => diagnostics.push(event),
    onError: (error) => errors.push(error), onFatalError: (error) => errors.push(error),
    runAgentConsult: (params) => { calls.push(params); return runAgentConsult ? runAgentConsult(params) : new Promise(() => {}); } });
  const frame = (event) => controller.handleFrame(JSON.stringify(event), false);
  const start = () => frame({ type: "session.started", session: {} });
  const end = (id = "native-end-1", origin = "actual-user-turn") => frame({ type: "delegation.created", item: { type: "delegation", target: "client", id, ...(origin ? { user_bidi_turn_id: origin } : {}), content: [{ type: "input_text", text: endPrompt }] } });
  return { controller, abort, socket, order, errors, calls, diagnostics, warnings, frame, start, end, legacyEnd: (id = "native-end-1", origin = "actual-user-turn") => controller.callLifecycle.handleDelegation(id, endPrompt, origin),
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
  const construct = new Function("backendResultQuestion", "offer", "connected", "params", "activeSessionLease", "session", "OPENAI_QUICKSILVER_SESSION_TTL_MS", "OpenAIQuicksilverDelegationController", "runAgentConsult", brokerSource.slice(start, end) + "return delegations;");
  for (const model of ["gpt-live-1-codex", "gpt-realtime"]) {
    const bound = [], transcripts = [];
    const gatewayControl = { bindCallLifecycle: (v) => bound.push(v), onTranscript: (...v) => transcripts.push(v) };
    const controller = construct(backendResultQuestion, { request: { model, gatewayControl } }, { socket: {} }, { logger: {} }, {}, undefined, 1000,
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
  const construct = new Function("backendResultQuestion", "offer", "connected", "params", "activeSessionLease", "session", "OPENAI_QUICKSILVER_SESSION_TTL_MS",
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
  const value = construct(backendResultQuestion, { request: { model, gatewayControl } }, { socket }, { logger: { warn() {}, debug() {} } }, lease, undefined,
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
  const construct = new Function("presentBackendResult", "randomUUID", "owners", "pendingOwners", "createRealtimeControlQueue", "createRealtimeVoiceSessionHarness", "createTalkRealtimeRunControlOwner", "registerTalkConnectionCleanup", "formatErrorMessage", talkSource.slice(from, to) + "return createTalkClientGatewayControlOwner;");
  const owners = new Map(), pendingOwners = new Set(), emitted = [], targets = { agentId: "agent", sessionKey: "canonical", canonicalKey: "canonical", storePath: "/private/store" };
  const factory = construct(presentBackendResult, randomUUID, owners, pendingOwners, () => ({ seal() {}, flush: async () => {} }),
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

test("accepted end call keeps genuine failed, aborted and foreign-receipt terminals visible without another spoken final", async () => {
  for (const mode of ["failed", "aborted", "foreign"]) {
    let finish, fail;
    const f = nativeFixture({ runAgentConsult: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }),
      isCanceledError: error => error.name === "AbortError" });
    f.frame({ type: "turn.created", turn: { role: "user", id: "turn_end", transcript: "今天先这样，谢谢" } });
    f.frame({ type: "turn.done", turn: { role: "user", id: "turn_end", transcript: "今天先这样，谢谢" } });
    f.frame({ type: "delegation.created", item: { type: "delegation", target: "client", id: "item_end",
      user_bidi_turn_id: "turn_end", content: [{ type: "input_text", text: "今天先这样，谢谢" }] } });
    await settleTick();
    const receipt = f.calls[0].callControl.accept({ backendRunId: "talk-realtime-consult:456:end", backendToolCallId: "call_end" });
    assert(receipt);
    if (mode === "foreign") finish({ callControl: { ...receipt, backendToolCallId: "call_foreign" } });
    else fail(Object.assign(new Error(mode === "aborted" ? "actual rejected aborted terminal" : "actual backend failure"),
      { name: mode === "aborted" ? "AbortError" : "Error" }));
    await settleTick();
    assert.equal(f.warnings.length, 1, mode);
    assert.match(f.warnings[0], /accepted end-call consult failed/);
    assert.match(f.warnings[0], mode === "foreign" ? /unowned receipt/ : /actual/);
    const diagnostic = f.diagnostics.filter(row => row.stage === "backend-call-control-terminal-rejected");
    assert.equal(diagnostic.length, 1);
    assert.equal(diagnostic[0].delegationId, "item_end");
    assert.equal(diagnostic[0].provenance.runId, receipt.backendRunId);
    assert.deepEqual(f.order.map(row => row.type), ["tool.call", "tool.result", "delegation.context.append"],
      "the controller never fabricates another native tool terminal");
    assert.doesNotMatch(JSON.stringify(f.order), /BACKEND_FINAL|BACKEND_FAILURE/);
    f.controller.detach();
  }
});

test("an exact accepted host cancellation still revokes the old end owner before a late failed callback", async () => {
  let fail;
  const f = nativeFixture({ runAgentConsult: () => new Promise((resolve, reject) => { fail = reject; }) });
  f.frame({ type: "turn.created", turn: { role: "user", id: "turn_cancel_end", transcript: "今天先这样" } });
  f.frame({ type: "turn.done", turn: { role: "user", id: "turn_cancel_end", transcript: "今天先这样" } });
  f.frame({ type: "delegation.created", item: { type: "delegation", target: "client", id: "item_cancel_end",
    user_bidi_turn_id: "turn_cancel_end", content: [{ type: "input_text", text: "今天先这样" }] } });
  await settleTick();
  const receipt = f.calls[0].callControl.accept({ backendRunId: "talk-realtime-consult:456:cancel", backendToolCallId: "call_cancel" });
  assert(receipt); const before = f.order.length;
  f.calls[0].onCanceled({ runId: receipt.backendRunId, ownerRunId: receipt.backendRunId, source: "owned_run_signal" });
  assert.equal(f.calls[0].signal.aborted, true);
  fail(new Error("actual late old-owner rejection")); await settleTick();
  assert.equal(f.order.length, before); assert.equal(f.warnings.length, 0);
  assert.equal(f.diagnostics.some(row => row.stage === "backend-call-control-terminal-rejected"), false);
  assert.equal(f.diagnostics.filter(row => row.stage === "backend-cancel-accepted").length, 1);
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

const revisionPrefix = "请先用 memory search 查家庭相关记录,再用 web search 查 OpenAI 官方 realtime API 文档,查到后用一句中文说两个结果,不要写入。";
const revisionFull = revisionPrefix + "也不要发消息";
function revisionDelegation(f,id,text,turn="turn-revision") {
  f.frame({ type: "delegation.created", item: { type: "delegation", target: "client", id,
    user_bidi_turn_id: turn, content: [{ type: "input_text", text }] } });
}
function revisionUser(f,turn,text,kind="created") {
  f.frame({ type: "turn."+kind, turn: { role: "user", id: turn, transcript: text } });
}
function revisionDelta(f,turn,delta) { f.frame({ type: "turn.delta", turn_id: turn, delta }); }

test("complete same-USER strict revision retires only the unstarted prefix and dispatches the real full native item once", async t => {
  let now=1000,finish;
  t.mock.method(Date,"now",()=>now);
  const f=nativeFixture({runAgentConsult:()=>new Promise(resolve=>{finish=resolve;})});
  revisionUser(f,"turn-revision",revisionPrefix);
  now=1100;revisionDelegation(f,"native-prefix",revisionPrefix);
  const prefixSignal=f.controller.consultController.signal;
  assert.equal(f.calls.length,0,"The completed USER barrier precedes any host dispatch");
  now=1200;revisionDelta(f,"turn-revision",revisionFull.slice(revisionPrefix.length));
  revisionDelegation(f,"native-full",revisionFull);
  assert.equal(f.controller.pendingDelegations.length,1);
  assert.equal(f.calls.length,0,"An accepted provider item is not an accepted backend run");
  now=1250;revisionUser(f,"turn-revision",revisionFull,"done");await settleTick();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].prompt,revisionFull);
  assert.deepEqual(f.calls[0].continuationIdentity,{delegationItemId:"native-full",delegationGeneration:2});
  assert.equal(f.calls[0].callControl.nativeDelegationId,"native-full");
  assert.equal(f.calls[0].callControl.userTurnText,revisionFull);
  assert.equal(f.calls[0].callerInputAcceptedAt,1200,"Retirement never borrows the completion or later caller time as acceptance");
  assert.equal(prefixSignal.aborted,false,"No host run or accepted prefix is force-aborted");
  assert.equal(f.controller.pendingDelegations.length,0);
  const proof=f.diagnostics.filter(e=>e.stage==="delegation-coalesced-before-dispatch");
  assert.equal(proof.length,1);assert.equal(proof[0].delegationId,"native-prefix");
  assert.equal(proof[0].generation,1);assert.equal(proof[0].provenance.itemId,"native-full");
  assert.equal(proof[0].provenance.emittedAt,1250);
  assert.equal(f.order.length,0,"Retirement produces no synthetic terminal, failure, grant or provider frame");
  finish({text:"已按完整只读目标查到两项结果。"});await settleTick();
  assert.equal(f.calls.length,1);
  assert.equal(f.order.filter(e=>e.type==="delegation.context.append").length,1);
  assert(f.order.every(e=>e.delegation_item_id==="native-full"));
  assert.equal(f.errors.length,0);f.controller.detach();
});

test("pre-dispatch strict revision retains every step and restriction of the complete multi-step USER", async () => {
  const first="查询家庭记忆",middle=first+"，查询官方网页",full=middle+"，再让两个子任务分别查航班和酒店，只读";
  const f=nativeFixture();revisionUser(f,"turn-revision",first);revisionDelegation(f,"first",first);
  revisionDelta(f,"turn-revision",middle.slice(first.length));revisionDelegation(f,"middle",middle);
  revisionDelta(f,"turn-revision",full.slice(middle.length));revisionDelegation(f,"full",full);
  revisionUser(f,"turn-revision",full,"done");await settleTick();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].prompt,full);
  assert.deepEqual(f.calls[0].continuationIdentity,{delegationItemId:"full",delegationGeneration:3});
  assert.deepEqual(f.diagnostics.filter(e=>e.stage==="delegation-coalesced-before-dispatch").map(e=>e.delegationId),["first","middle"]);
  assert.equal(f.order.length,0);f.controller.detach();
});

test("an already dispatched host owner survives a later full same-USER version with no cancellation or owner rewrite", async () => {
  const finish=[];
  const f=nativeFixture({runAgentConsult:()=>new Promise(resolve=>finish.push(resolve))});
  revisionUser(f,"turn-revision",revisionFull);revisionDelegation(f,"started-prefix",revisionPrefix);
  revisionUser(f,"turn-revision",revisionFull,"done");await settleTick();
  assert.equal(f.calls.length,1);const first=f.calls[0],original={...first.continuationIdentity};
  revisionDelegation(f,"later-full",revisionFull);await settleTick();
  assert.equal(f.calls.length,1);assert.deepEqual(first.continuationIdentity,original);assert.equal(first.signal.aborted,false);
  assert.equal(f.diagnostics.some(e=>e.stage==="delegation-coalesced-before-dispatch"),false);
  finish[0]({text:"原已接受工作完成"});await settleTick();
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].continuationIdentity.delegationItemId,"later-full");
  finish[1]({text:"后续工作完成"});await settleTick();f.controller.detach();
});

test("different USER, distinct same-USER goals, non-prefix changes, and incomplete raw proof retain their separate host requests", async t => {
  for(const scenario of ["new-user","distinct-goal","non-prefix","corrected-done","missing-raw-prefix","whitespace-correction"]) await t.test(scenario,async()=>{
    const finish=[],f=nativeFixture({runAgentConsult:()=>new Promise(resolve=>finish.push(resolve))});
    if(scenario!=="missing-raw-prefix")revisionUser(f,"turn-revision",revisionPrefix);
    revisionDelegation(f,"first",revisionPrefix);
    let next=revisionFull;
    if(scenario==="new-user") {
      revisionUser(f,"other-user",next);revisionDelegation(f,"second",next,"other-user");
      revisionUser(f,"turn-revision",revisionPrefix,"done");revisionUser(f,"other-user",next,"done");
    }else {
      if(scenario==="distinct-goal")next="独立查询酒店价格";
      if(scenario==="non-prefix")next="先只查官方网页，再查询家庭记忆";
      if(scenario==="whitespace-correction")next=revisionFull.replace("不要写入。","不要 写入。");
      if(!["corrected-done","missing-raw-prefix","whitespace-correction"].includes(scenario))
        revisionDelta(f,"turn-revision",next.startsWith(revisionPrefix)?next.slice(revisionPrefix.length):"，还要查询酒店");
      revisionDelegation(f,"second",next);revisionUser(f,"turn-revision",next,"done");
    }
    await settleTick();assert.equal(f.calls.length,1,scenario);
    assert.equal(f.calls[0].continuationIdentity.delegationItemId,"first",scenario);
    assert.equal(f.diagnostics.some(e=>e.stage==="delegation-coalesced-before-dispatch"),false,scenario);
    finish[0]({text:"第一工作完成"});await settleTick();assert.equal(f.calls.length,2,scenario);
    assert.equal(f.calls[1].continuationIdentity.delegationItemId,"second",scenario);
    finish[1]({text:"第二工作完成"});await settleTick();f.controller.detach();
  });
});

test("multiple full revisions are ambiguous and cannot retire an unstarted provider prefix", async () => {
  const f=nativeFixture();revisionUser(f,"turn-revision",revisionPrefix);revisionDelegation(f,"prefix",revisionPrefix);
  revisionDelta(f,"turn-revision",revisionFull.slice(revisionPrefix.length));
  revisionDelegation(f,"full-one",revisionFull);revisionDelegation(f,"full-two",revisionFull);
  revisionUser(f,"turn-revision",revisionFull,"done");await settleTick();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].continuationIdentity.delegationItemId,"prefix");
  assert.equal(f.diagnostics.some(e=>e.stage==="delegation-coalesced-before-dispatch"),false);f.controller.detach();
});

test("a failed or explicitly cancelled full revision remains eligible for a real later retry", async t => {
  for(const failure of ["failure","cancel"])await t.test(failure,async()=>{
    const pending=[],f=nativeFixture({runAgentConsult:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
    revisionUser(f,"turn-revision",revisionPrefix);revisionDelegation(f,"prefix",revisionPrefix);
    revisionDelta(f,"turn-revision",revisionFull.slice(revisionPrefix.length));revisionDelegation(f,"full",revisionFull);
    revisionUser(f,"turn-revision",revisionFull,"done");await settleTick();assert.equal(f.calls.length,1);
    if(failure==="cancel")f.calls[0].onCanceled({runId:"real-cancelled-run",source:"explicit_control"});
    pending[0].reject(new Error(failure));await settleTick();
    revisionDelegation(f,"retry",revisionFull);await settleTick();
    assert.equal(f.calls.length,2);assert.equal(f.calls[1].continuationIdentity.delegationItemId,"retry");
    assert.equal(f.calls[1].signal.aborted,false);
    assert.equal(f.order.some(e=>e.delegation_item_id==="prefix"),false);
    pending[1].resolve({text:"实际重试完成"});await settleTick();f.controller.detach();
  });
});


test("long native backend result is published whole before only the short notice enters speakable wire", async () => {
  const text = "## 方案\n" + "核对后的完整事实，2028年9月，尚未核实的条件。".repeat(35), published=[];
  const f=nativeFixture({enabled:false,runAgentConsult:async()=>({text}),onBackendResult:result=>{published.push(result);return presentBackendResult(result.text).spokenText;}});
  f.start();f.frame({type:"delegation.created",item:{type:"delegation",target:"client",id:"owned-doc",content:[{type:"input_text",text:"给我完整方案"}]}});
  for(let i=0;i<8;i++)await settleTick();
  assert.deepEqual(published,[{delegationId:"owned-doc",text}]);
  const frames=f.order.filter(e=>e.type==="delegation.context.append");assert(frames.length);
  const wireText=frames.map(e=>e.content[0].text).join("");assert(wireText.includes(LONG_RESULT_NOTICE));assert(wireText.includes("2028年9月"));assert(wireText.length < text.length);
  assert.equal(f.calls.length,1);f.controller.detach();
});

test("actual Talk document publisher keeps full Markdown and rejects closed or replaced voice owner", async()=>{
  const f=talkFixture(),text="| 项目 | 日期 |\n| --- | --- |\n| 入学 | 2028-09 |";
  const summary=f.owner.control.onBackendResult({delegationId:"doc",text});assert(summary.includes("2028-09"));assert(summary.endsWith(LONG_RESULT_NOTICE));
  assert.deepEqual(f.emitted,[{type:"tool.result",callId:"doc",turnId:"harness-turn",payload:{name:"openclaw_backend_result",text,voiceSessionId:"voice"},final:true}]);
  assert.equal(f.owner.control.onBackendResult({delegationId:"short",text:"日期还没有确认。"}),undefined);
  f.owners.set("voice",{});assert.throws(()=>f.owner.control.onBackendResult({delegationId:"late",text}),/not active/);
  await f.owner.close();assert.throws(()=>f.owner.control.onBackendResult({delegationId:"closed",text}),/closed/);assert.equal(f.emitted.length,1);
});

test('late native final after detach and backend rejection cannot announce a completed document',async()=>{
 for(const failure of [false,true]){
  let finish,reject;const published=[];const f=nativeFixture({enabled:false,onBackendResult:r=>{published.push(r);return LONG_RESULT_NOTICE;},runAgentConsult:()=>new Promise((resolve,fail)=>{finish=resolve;reject=fail;})});
  f.start();f.frame({type:'delegation.created',item:{type:'delegation',target:'client',id:'old-doc',content:[{type:'input_text',text:'原任务'}]}});await settleTick();
  if(failure)reject(new Error('真实读取失败'));else{f.controller.detach();finish({text:'旧结果'.repeat(200)});}
  for(let i=0;i<8;i++)await settleTick();assert.equal(published.length,0);assert(!JSON.stringify(f.order).includes(LONG_RESULT_NOTICE));f.controller.detach();
 }
});

test('native broker adds summary output format only for document-capable host, preserving call-control and one consult',()=>{
 const line=brokerSource.split('\n').find(line=>line.includes('runAgentConsult: (params) =>'));assert(line);
 const make=new Function('offer','runAgentConsult','backendResultQuestion','return ({'+line.trim()+'});');
 for(const capable of [false,true]){
  const calls=[],signal=new AbortController().signal,control={actualUser:'完整USER原句'},input={prompt:'原始完整目标',signal,callControl:control};
  const host=make({request:{gatewayControl:capable?{onBackendResult(){}}:{}}},p=>{calls.push(p);return 'actual-answer';},backendResultQuestion);
  assert.equal(host.runAgentConsult(input),'actual-answer');assert.equal(calls.length,1);assert.strictEqual(calls[0].callControl,control);assert.strictEqual(calls[0].signal,signal);
  assert.equal(calls[0].prompt,capable?backendResultQuestion(input.prompt):input.prompt);assert.equal(input.prompt,'原始完整目标');
 }
});


test('completed predecessor is context for a queued progress question, while its authorized later action still runs',async()=>{
 const finishes=[],published=[],f=nativeFixture({enabled:false,onBackendResult:r=>{published.push(r);return presentBackendResult(r.text).spokenText;},runAgentConsult:()=>new Promise(resolve=>finishes.push(resolve))});
 f.start();revisionUser(f,'goal','写完整报告','done');revisionDelegation(f,'report','写完整报告','goal');await settleTick();
 revisionUser(f,'status','做得怎么样了','done');revisionDelegation(f,'status-query','做得怎么样了','status');
 assert.equal(f.calls.length,1);finishes[0]({text:'完整报告已经做好。'});await settleTick();
 assert.equal(f.calls.length,2);assert(f.calls[1].prompt.startsWith('做得怎么样了'));assert(f.calls[1].prompt.includes('preceding task has now ended'));
 revisionUser(f,'send','把报告发给我','done');revisionDelegation(f,'send-report','把报告发给我','send');
 finishes[1]({text:'旧问题对应的结论'});await settleTick();assert.equal(f.calls.length,3);assert(f.calls[2].prompt.startsWith('把报告发给我'));
 const old=f.order.filter(e=>e.delegation_item_id==='status-query');assert(old.length>0);assert(old.every(e=>e.channel==='commentary'&&e.content[0].text.includes('BACKEND_FINAL_CONTEXT')));
 assert(f.diagnostics.some(e=>e.delegationId==='status-query'&&e.role==='final_context'));
 finishes[2]({text:'新的发送工具实际完成'});await settleTick();
 assert(f.order.filter(e=>e.delegation_item_id==='send-report').every(e=>e.channel==='speakable'));
 assert.equal(published.length,3);f.controller.detach();
});

test('spoken summary keeps canonical caller corrections and rejects forged condition ownership',async()=>{
 for(const owner of ['real-owner','foreign-owner']){
 const f=nativeFixture({enabled:false,onBackendResult:()=> '建议先核实条件。',runAgentConsult:async()=>({text:'完整报告'.repeat(200),provenance:{source:'canonical_final',ownerRunId:'real-owner'},callerConditions:{ownerRunId:owner,sequence:1,inputs:[{sequence:1,mode:'followup',text:'改成发给我，不要重做报告'}]}})});
 f.start();revisionDelegation(f,'conditions','完成任务');for(let i=0;i<6;i++)await settleTick();
 const text=f.order.filter(e=>e.delegation_item_id==='conditions').map(e=>e.content[0].text.slice(e.content[0].text.indexOf('\n\n')+2)).join('');
 if(owner==='real-owner'){assert(text.includes('改成发给我，不要重做报告'));assert(text.includes('建议先核实条件。'));}
 else {assert(!text.includes('建议先核实条件。'));assert(f.warnings.some(e=>e.includes('ownership')));}
 f.controller.detach();
 }
});
