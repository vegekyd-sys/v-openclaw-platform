import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createGptLiveConsultContinuationRegistry } from "./gpt-live-consult-continuation.mjs";
import { createGptLiveConsultProgressObserver } from "./gpt-live-consult-progress.mjs";
import { bindGptLiveBackendCallControl, buildGptLiveBackendCallControlQuestion, patchGptLiveBackendCallControlTalk,
  patchGptLiveBackendCallControlHarness } from "./patch-gpt-live-backend-call-control.mjs";
import { patchGptLiveConsultProgressTalk, patchGptLiveConsultProgressHarness } from "./gpt-live-consult-progress.mjs";
import { patchGptLiveContinuationTalk, patchGptLiveContinuationHarness } from "./patch-gpt-live-consult-continuation.mjs";
import { patchGptLiveNativeConfirmationTalk } from "./patch-gpt-live-native-confirmation.mjs";
import { patchGptLiveCallLifecycleTalk } from "./patch-gpt-live-call-lifecycle.mjs";
import { patchGptLiveCallTerminalEmbedded } from "./patch-gpt-live-call-terminal.mjs";

const tool = { type: "function", function: { name: "openclaw_end_call", description: "End only a clearly requested call.",
  parameters: { type: "object", properties: {}, additionalProperties: false } } };
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const talkBefore = read("../release/captured/v2026.9.1-db91.6-memory-search-fast-20261002/dist/talk-DkFuKRod.js");
const talkSource = patchGptLiveCallLifecycleTalk(patchGptLiveNativeConfirmationTalk(
  patchGptLiveContinuationTalk(patchGptLiveConsultProgressTalk(talkBefore))));
const harnessBefore = read("../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/realtime-session-harness-CEO5kVAJ.js");
const harnessSource = patchGptLiveContinuationHarness(patchGptLiveConsultProgressHarness(harnessBefore));

// Exact completeEmbeddedRun slice from the actual shared runtime, read only on
// 2026-10-04. Full source SHA256: 128a61c9e10a47d501ad425345f9f05a88c9dc66b665e32f979d12e29675cd67.
// Only the new host projection is patched into this real function. Unrelated
// auth/logging helpers are supplied at their boundaries. No native event is made.
const actualTerminalSource = read("./fixtures/gpt-live-call-lifecycle/embedded-agent-complete-run-20261004.js");
assert.equal(createHash("sha256").update(actualTerminalSource).digest("hex"),
  "e107149d6f9049f1f25d5c5f2a00ed137453dac49a419ebe68ceed5e8c3cf84b");
// The classifier and attempt-to-public projection execute unchanged from the
// actual shared runtime captured read only on 2026-10-04T05:59:19.301817Z.
// Captured source: openclaw/dist/agent-run-terminal-outcome-CyRezSup.js.
const actualOutcomeSource = read("./fixtures/gpt-live-call-lifecycle/agent-run-terminal-outcome-20261004.js");
assert.equal(createHash("sha256").update(actualOutcomeSource).digest("hex"),
  "0e0a0e74edae9a340ead66228a0ecf467dd9899471b670cb6961c155deee11ce");
const actualOutcomeFunction = (name, end) => {
  const from = actualOutcomeSource.indexOf(`function ${name}(`);
  assert(from >= 0); const to = actualOutcomeSource.indexOf(end, from); assert(to > from);
  return actualOutcomeSource.slice(from, to);
};
const actualAttemptFailureSource = actualOutcomeFunction("getAgentRunAttemptFailure", "function withAgentRunAttemptFailure(");
const actualAttemptProjectionSource = actualOutcomeFunction("projectAgentRunAttemptTerminal", "const AGENT_RUN_TERMINAL_CLASSIFICATION");
const outcomeFrom = actualOutcomeSource.indexOf("const AGENT_RUN_TERMINAL_CLASSIFICATION = {");
const outcomeTo = actualOutcomeSource.indexOf("/** Shared grace window", outcomeFrom);
assert(outcomeFrom >= 0 && outcomeTo > outcomeFrom);
const actualClassificationSource = actualOutcomeSource.slice(outcomeFrom, outcomeTo);
// These liveness and final-timeout/abort helpers execute unchanged from the
// captured native Candidate builtin. No successful state is stubbed into core.
const actualBuiltinSource = read("./fixtures/gpt-live-voice-tool-order/builtin-openclaw-zQV8Wwjr.js");
assert.equal(createHash("sha256").update(actualBuiltinSource).digest("hex"),
  "f121be943b9694cbc73a00529a38235df4f6ebdb652208fa103c44b7a8ca0e80");
const actualBuiltinFunction = (name, end, expectedSha) => {
  const from = actualBuiltinSource.indexOf(`function ${name}(`);
  assert(from >= 0); const to = actualBuiltinSource.indexOf(end, from); assert(to > from);
  const source = actualBuiltinSource.slice(from, to);
  assert.equal(createHash("sha256").update(source).digest("hex"), expectedSha);
  return source;
};
const actualLivenessSource = actualBuiltinFunction("resolveRunLivenessState", "//#endregion",
  "55deccd79d4ed7590100f51faba184416c578fa77c453d0ddf17dcf183d39536");
const actualCurrentAssistantSource = actualBuiltinFunction("resolveCurrentAttemptAssistant", "/** Uses current-attempt evidence",
  "2b11945d6a925fef005e3781f11ea35ed0039ac93d3492f1edf2c42287e5392f");
const interruptionFrom = actualBuiltinSource.indexOf("function isEmbeddedRunTerminalTimeout(");
const interruptionTo = actualBuiltinSource.indexOf("function isEmbeddedRunTerminalInterrupted(", interruptionFrom);
assert(interruptionFrom >= 0 && interruptionTo > interruptionFrom);
const actualInterruptionSource = actualBuiltinSource.slice(interruptionFrom, interruptionTo);
async function actualClientToolTerminal({ outcome = { status: "ok", reason: "completed" },
  calls = [{ name: "openclaw_end_call", params: {} }], runId = "parent",
  sessionId = "session", yielded = false, terminal = { kind: "ok" }, payloads = [],
  currentAssistant, incompleteTurnText } = {}) {
  const context = vm.createContext({ Date, JSON, randomBytes: () => Buffer.from("1234567890"),
    formatErrorMessage: String, hasYieldContinuationEvidence: () => false,
    log$3: { debug() {}, warn() {} }, markEmbeddedRunAuthProfileSuccess() {}, reportEmbeddedRunSuccessfulAuthBinding() {},
    shouldContinueInteractiveAcceptedSessionSpawns: () => false, AGENT_LANE_SUBAGENT: "subagent", YIELD_DIAGNOSTIC_TEXT: "yield diagnostic",
    resolveFinalAssistantVisibleText: () => undefined, hasAttemptTerminalState: () => true,
    copyAttemptDeliveryState: () => ({}),
  });
  vm.runInContext(actualAttemptFailureSource + actualAttemptProjectionSource + actualClassificationSource +
    actualInterruptionSource + actualCurrentAssistantSource + actualLivenessSource +
    patchGptLiveCallTerminalEmbedded(actualTerminalSource), context);
  const projected = await context.completeEmbeddedRun({
    terminalState: { outcome }, attempt: { terminal, assistantTexts: [], clientToolCalls: calls, yieldDetected: yielded,
      currentAttemptAssistant: currentAssistant }, incompleteTurnText,
    runParams: { runId, sessionId, lane: "voice", config: {} }, startedAtMs: Date.now(),
    payloadsForTerminalPath: payloads, payloadCount: payloads.length, agentMeta: { sessionId }, reportedModelRef: { provider: "test", model: "test" },
    traceAttempts: [], traceAttemptUsesFallback: () => false, contextRecoveryState: { autoCompactionCount: 0 },
    resolveReplayInvalid: () => false, setTerminalLifecycleMeta() {},
  });
  return projected.result;
}

function fixture({ callControl = true, hostCurrent = true, receiptOverride } = {}) {
  const listeners = new Map(); const accepted = []; const cleanups = []; const progress = [];
  let current = true;
  const context = { identity: { delegationItemId: "item_native", delegationGeneration: 1 }, ownerConnId: "conn",
    voiceSessionId: "voice", ownerGeneration: "native-session", isCurrent: () => current };
  const receipt = (proof) => Object.freeze({ source: "backend_model_client_tool", status: "accepted", closeAfterPlayback: true,
    nativeDelegationId: "item_native", originUserTurnId: "user_original", delegationGeneration: 1,
    requestId: "item_native", callId: proof.backendToolCallId, ...proof });
  if (callControl) context.callControl = bindGptLiveBackendCallControl({ continuationIdentity: context.identity,
    assertCurrent: () => assert(current), callControl: {
      nativeDelegationId: "item_native", originUserTurnId: "user_original", delegationGeneration: 1,
      userTurnText: "今天先这样，请你挂掉电话。", tool, isCurrent: () => hostCurrent,
      accept: proof => { accepted.push(proof); return receiptOverride ? receiptOverride(proof) : receipt(proof); },
    } });
  const registry = createGptLiveConsultContinuationRegistry({ subscribeRun: (id, cb) => {
    listeners.set(id, cb); return () => listeners.delete(id);
  }, createProgressObserver: createGptLiveConsultProgressObserver, getLifecycleGeneration: () => 1,
  isLifecycleCurrent: generation => generation === 1 });
  const owner = registry.createOwner({ continuationContext: context, runId: "parent", sessionKey: "agent:makaron:voice",
    sessionId: "session", agentId: "makaron", timeoutMs: 30000, onProgress: p => progress.push(p),
    runRegistration: { cleanup: () => cleanups.push("initial") }, collectVisibleText: payloads => payloads.map(p => p.text ?? "").join("") });
  const emit = (data, fields = {}) => listeners.get(fields.runId ?? "parent")?.({ runId: "parent", sessionKey: "agent:makaron:voice",
    sessionId: "session", agentId: "makaron", lifecycleGeneration: 1, stream: "tool", data, ...fields });
  const start = (fields = {}) => emit({ phase: "start", name: "openclaw_end_call", toolCallId: "call_actual", args: {}, ...fields });
  const result = (fields = {}, envelope = {}) => emit({ phase: "result", name: "openclaw_end_call", toolCallId: "call_actual",
    isError: false, result: { details: { status: "pending", tool: "openclaw_end_call", message: "Tool execution delegated to client" },
      content: [{ type: "text", text: '{"status":"pending","tool":"openclaw_end_call","message":"Tool execution delegated to client"}' }], terminate: true }, ...fields }, envelope);
  const finish = () => owner.finishInitial({ meta: {}, payloads: [{ text: "Ordinary result" }] });
  const cleanup = async () => { if (owner.isCurrent()) owner.abort(new Error("test cleanup")); await owner.wait().catch(() => {}); };
  return { registry, owner, context, accepted, cleanups, listeners, progress, emit, start, result, finish, cleanup,
    stale: () => { hostCurrent = false; }, rotate: () => { current = false; } };
}

test("patch uses the existing actual consult pipeline and rejects drift, without Worker callbacks in schema", () => {
  const talk = talkSource; const harness = harnessSource;
  const afterTalk = patchGptLiveBackendCallControlTalk(talk);
  const afterHarness = patchGptLiveBackendCallControlHarness(harness);
  assert.equal(patchGptLiveBackendCallControlTalk(afterTalk), afterTalk);
  assert.equal(patchGptLiveBackendCallControlHarness(afterHarness), afterHarness);
  assert.throws(() => patchGptLiveBackendCallControlTalk(talk.replace("callerInputAcceptedAt })", "wrong })")), /exactly once/);
  assert.throws(() => patchGptLiveBackendCallControlHarness(harness.replace("toolsAllow: params.toolsAllow", "toolsAllow: changed")), /exactly once/);
  assert(afterTalk.indexOf("await params.flushTranscript()") < afterTalk.indexOf("const boundCallControl"));
  assert.match(afterTalk, /question: buildGptLiveBackendCallControlQuestion\(prompt, boundCallControl\)/);
  assert.match(afterHarness, /clientTools: \[params\.continuationContext\.callControl\.tool\]/);
  assert.doesNotMatch(afterHarness, /clientTools: \[params\.continuationContext\.callControl\]/);
});

test("terminal overlay patches only the final core owner, rejects drift, and is idempotent", () => {
  const after = patchGptLiveCallTerminalEmbedded(actualTerminalSource);
  assert.equal(patchGptLiveCallTerminalEmbedded(after), after);
  assert.equal(after.split("gptLiveTerminalOutcome:").length - 1, 1);
  assert.throws(() => patchGptLiveCallTerminalEmbedded(actualTerminalSource.replace("\t\t\t\taborted: terminalAborted,", "\t\t\t\taborted: wrong,")), /exactly once/);
  assert.throws(() => patchGptLiveCallTerminalEmbedded(actualTerminalSource + actualTerminalSource), /exactly once/);
  const nextOwner = "\n//#endregion\n//#region src/agents/embedded-agent-runner/run/settled-turn-finalization.ts\n" +
    "function anotherOwner(input) { return { aborted: terminalAborted, systemPromptReport: input.attempt.systemPromptReport }; }";
  const whole = "const unrelated = true;\n" + actualTerminalSource.trimEnd() + nextOwner;
  assert(patchGptLiveCallTerminalEmbedded(whole).endsWith(nextOwner));
  assert.throws(() => patchGptLiveCallTerminalEmbedded(whole.replace("settled-turn-finalization.ts", "changed.ts")), /boundary drifted/);
});

test("captured actual classifier names success only for completed and distinguishes every rejection reason", () => {
  const context = vm.createContext({}); vm.runInContext(actualClassificationSource, context);
  for (const [reason, classification] of Object.entries({ completed: "success", hard_timeout: "timeout", timed_out: "timeout",
    superseded: "cancellation", cancelled: "cancellation", aborted: "cancellation",
    blocked: "failure", abandoned: "failure", failed: "failure" })) {
    assert.equal(context.classifyAgentRunTerminalOutcome({ reason }), classification, reason);
  }
  for (const reason of [undefined, "ok", "success", "unknown"]) assert.equal(context.classifyAgentRunTerminalOutcome({ reason }), undefined);
});

test("the actual initial question includes the complete source without weakening negation or inventing a tool call", () => {
  assert.equal(buildGptLiveBackendCallControlQuestion("unchanged", undefined), "unchanged");
  for (const userTurnText of ["今天先聊到这里，不过先别挂，我还想问你一件事。", "今天先这样，请你挂掉电话。", '他说“挂掉”；这不是我的请求。\n继续聊天。']) {
    const question = buildGptLiveBackendCallControlQuestion("native delegated paraphrase", { userTurnText, isCurrent: () => true });
    const sourceText = question.split("Original complete latest USER turn, finalized by the current voice host (JSON string):\n\n")[1].split("\n\n")[0];
    assert.equal(JSON.parse(sourceText), userTurnText);
    assert(question.includes("negated, unfinished, ambiguous"));
    assert(question.startsWith("native delegated paraphrase"));
    assert.doesNotMatch(question, /"name"\s*:\s*"openclaw_end_call"/);
  }
  assert.throws(() => buildGptLiveBackendCallControlQuestion("p", { isCurrent: () => false }), /changed before prompt/);
});

test("binding requires the exact complete host USER and native delegation identity", () => {
  assert.equal(bindGptLiveBackendCallControl({}), undefined);
  const base = { nativeDelegationId: "item_native", originUserTurnId: "user_original", delegationGeneration: 1,
    userTurnText: "完整原始 USER", tool, isCurrent: () => true, accept: () => ({}) };
  const identity = { delegationItemId: "item_native", delegationGeneration: 1 };
  for (const changed of [{ nativeDelegationId: "other" }, { delegationGeneration: 2 }, { originUserTurnId: "" },
    { userTurnText: " " }, { isCurrent: undefined }, { accept: undefined },
    { tool: { ...tool, function: { ...tool.function, name: "fake" } } }]) {
    assert.throws(() => bindGptLiveBackendCallControl({ callControl: { ...base, ...changed }, continuationIdentity: identity, assertCurrent() {} }), /Invalid host-owned/);
  }
  const bound = bindGptLiveBackendCallControl({ callControl: base, continuationIdentity: identity, assertCurrent() {} });
  assert.doesNotThrow(() => JSON.stringify(bound.tool));
  assert.equal(bound.tool.function.name, "openclaw_end_call");
  base.userTurnText = "later USER";
  assert.equal(bound.isCurrent(), false);
  assert.throws(() => bound.accept({}), /no longer current/);
});

test("actual initial-parent tool start and successful pending-client result yield a separate host terminal without text", async () => {
  const f = fixture(); f.start(); f.result();
  assert.deepEqual(f.accepted, [{ backendRunId: "parent", backendToolCallId: "call_actual" }]);
  // Not result.clientToolCalls, not assistant text: it is the host's exact original receipt.
  f.owner.finishInitial(await actualClientToolTerminal({ payloads: [{ text: "Actual terminal payload" }] }));
  const result = await f.owner.wait();
  assert.equal(result.callControl.source, "backend_model_client_tool");
  assert.equal(result.callControl.requestId, "item_native"); assert.equal(result.callControl.callId, "call_actual");
  assert.equal(Object.hasOwn(result, "text"), false); assert.equal(Object.hasOwn(result, "provenance"), false);
  assert.equal(f.listeners.size, 0); assert.deepEqual(f.cleanups, ["initial"]);
});

test("actual core client-tool-only terminal omits payloads and settles the exact observed original receipt", async () => {
  const terminal = await actualClientToolTerminal();
  assert.equal(terminal.payloads, undefined);
  assert.equal(terminal.meta.aborted, false);
  assert.equal(terminal.meta.livenessState, "working");
  assert.equal(terminal.meta.stopReason, "tool_calls");
  assert.equal(terminal.meta.pendingToolCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(terminal.meta.gptLiveTerminalOutcome)), {
    version: 1, source: "embedded_terminal_state", classification: "success", reason: "completed", runId: "parent", sessionId: "session",
  });
  assert.equal(Object.isFrozen(terminal.meta.gptLiveTerminalOutcome), true);
  assert.notEqual(terminal.meta.pendingToolCalls[0].id, "call_actual", "public random pending id is never the tool witness");
  const f = fixture(); f.start(); f.result();
  f.owner.finishInitial(terminal);
  const settled = await f.owner.wait();
  assert.equal(settled.callControl.backendRunId, "parent");
  assert.equal(settled.callControl.backendToolCallId, "call_actual");
  assert.equal(Object.hasOwn(settled, "text"), false);
  assert.equal(f.accepted.length, 1);
  assert.equal(f.listeners.size, 0); assert.deepEqual(f.cleanups, ["initial"]);
});

test("actual final timeout, compaction, cancellation, failure and unknown classification cannot settle either payload path", async () => {
  for (const [name, options, expectedLiveness] of [
    ["tool timeout", { outcome: { status: "timeout", reason: "timed_out" }, terminal: { kind: "timeout", phase: "tool_execution", source: "runtime" } }, "blocked"],
    ["hard timeout", { outcome: { status: "timeout", reason: "hard_timeout" }, terminal: { kind: "timeout", phase: "provider", source: "run_budget" } }, "blocked"],
    ["compaction timeout", { outcome: { status: "timeout", reason: "timed_out" }, terminal: { kind: "timeout", phase: "compaction", source: "runtime" } }, "paused"],
    ["compaction-owned failed terminal", { outcome: { status: "error", reason: "failed" }, terminal: { kind: "failed", source: "compaction", error: "actual failure" } }, "abandoned"],
    ["blocked reason", { outcome: { status: "error", reason: "blocked" } }, "abandoned"],
    ["abandoned reason", { outcome: { status: "error", reason: "abandoned" } }, "abandoned"],
    ["cancelled reason", { outcome: { status: "aborted", reason: "cancelled" }, terminal: { kind: "aborted", source: "external" } }, "blocked"],
    ["aborted reason", { outcome: { status: "aborted", reason: "aborted" }, terminal: { kind: "aborted", source: "runtime" } }, "blocked"],
    ["superseded reason", { outcome: { status: "aborted", reason: "superseded" }, terminal: { kind: "aborted", source: "external" } }, "blocked"],
    ["unknown reason", { outcome: { status: "ok", reason: "unknown" } }, "working"],
    ["current assistant error", { currentAssistant: { stopReason: "error" } }, "blocked"],
    ["incomplete turn", { incompleteTurnText: "actual incomplete-turn failure" }, "abandoned"],
  ]) {
    for (const payloads of [[], [{ text: "Partial output before timeout" }]]) {
      // Assistant-stop-error is an existing omitted-payload shape guard. The new
      // classification guard is tested by the actual outcome reasons above.
      if (name === "current assistant error" && payloads.length) continue;
      const terminal = await actualClientToolTerminal({ ...options, payloads });
      const expected = payloads.length && expectedLiveness === "blocked" && name !== "current assistant error" ? "working" : expectedLiveness;
      assert.equal(terminal.meta.livenessState, expected, name);
      assert.equal(terminal.meta.aborted, ["cancelled reason", "aborted reason", "superseded reason"].includes(name), name);
      if (expectedLiveness !== "abandoned") {
        assert.equal(Array.isArray(terminal.payloads), payloads.length > 0, name);
        assert.equal(terminal.meta.stopReason, "tool_calls", name);
        assert.equal(terminal.meta.pendingToolCalls[0].name, "openclaw_end_call", name);
      } else assert.equal(terminal.meta.error.kind, "incomplete_turn", name);
      const f = fixture(); f.start(); f.result(); f.owner.finishInitial(terminal);
      await assert.rejects(f.owner.wait(), /aborted|changed before its terminal/, name);
      assert.equal(f.accepted.length, 1, "acceptance remains visible; failed terminal is not success");
      assert.equal(f.listeners.size, 0, name);
    }
  }
});

test("undefined end terminal retains working shape; both payload paths require private exact normal completion", async () => {
  for (const state of [undefined, null, "completed", "success", "idle", "blocked", "paused", "abandoned"]) {
    const terminal = await actualClientToolTerminal(); terminal.meta.livenessState = state;
    const f = fixture(); f.start(); f.result(); f.owner.finishInitial(terminal);
    await assert.rejects(f.owner.wait(), /changed before its terminal/, String(state));
  }
  for (const payloads of [[], [{ text: "Exact successful final payload" }]]) {
    const terminal = await actualClientToolTerminal({ payloads });
    const f = fixture(); f.start(); f.result(); f.owner.finishInitial(terminal);
    assert.equal((await f.owner.wait()).callControl.backendToolCallId, "call_actual");
  }
  for (const payloads of [undefined, [], [{ text: "Legacy array output is not a terminal owner" }]]) {
    for (const changed of [undefined, null, {}, { source: "model" }, { version: 2 }, { runId: "foreign" },
      { sessionId: "foreign" }, { classification: "timeout" }, { reason: "timed_out" }, { reason: "unknown" }]) {
      const terminal = await actualClientToolTerminal();
      terminal.payloads = payloads;
      terminal.meta.gptLiveTerminalOutcome = changed == null ? changed : { ...terminal.meta.gptLiveTerminalOutcome, ...changed };
      // An empty object alone is deliberately not a valid identity projection.
      if (changed && Object.keys(changed).length === 0) terminal.meta.gptLiveTerminalOutcome = changed;
      const f = fixture(); f.start(); f.result(); f.owner.finishInitial(terminal);
      await assert.rejects(f.owner.wait(), /changed before its terminal/);
    }
  }
});

test("canonical terminal metadata cannot authorize an unobserved end tool or rescue rejected or foreign owners", async () => {
  const unobserved = fixture();
  unobserved.owner.finishInitial(await actualClientToolTerminal());
  await assert.rejects(unobserved.owner.wait(), /without a successful final result/);
  assert.equal(unobserved.accepted.length, 0);
  for (const options of [{ outcome: { status: "aborted", reason: "aborted" } }, { outcome: { status: "error", reason: "failed", error: "actual failure" } },
    { runId: "foreign" }, { sessionId: "foreign" }, { yielded: true }, { calls: [{ name: "other", params: {} }] },
    { calls: [{ name: "openclaw_end_call", params: { forged: true } }] },
    { calls: [{ name: "openclaw_end_call", params: {} }, { name: "other", params: {} }] }]) {
    const f = fixture(); f.start(); f.result(); f.owner.finishInitial(await actualClientToolTerminal(options));
    await assert.rejects(f.owner.wait(), /aborted|changed before its terminal/);
  }
});

test("metadata-only callback, error, blocked, wrong marker, absent termination and unpaired id cannot close", async () => {
  const variants = [{ result: undefined }, { isError: true }, { isError: undefined }, { toolCallId: "other_call" },
    { result: { details: { status: "blocked", tool: "openclaw_end_call" }, terminate: true } },
    { result: { details: { status: "pending", tool: "other", message: "Tool execution delegated to client" }, terminate: true } },
    { result: { details: { status: "pending", tool: "openclaw_end_call", message: "not real adapter" }, terminate: true } },
    { result: { details: { status: "pending", tool: "openclaw_end_call", message: "Tool execution delegated to client" } } }];
  for (const variant of variants) {
    const f = fixture(); f.start(); f.result(variant); assert.equal(f.accepted.length, 0);
    f.finish(); assert.equal((await f.owner.wait()).text, "Ordinary result");
  }
});

test("schema alone does not validate empty args: actual nonempty start cannot authorize host control", async () => {
  const f = fixture(); f.start({ args: { voiceSessionId: "model-fake" } }); f.result();
  assert.equal(f.accepted.length, 0); await f.cleanup();
});

test("wrong run, session or lifecycle events cannot trigger the owned tool", async () => {
  for (const envelope of [{ runId: "neighbor" }, { sessionKey: "neighbor" }, { sessionId: "neighbor" }, { lifecycleGeneration: 2 }]) {
    const f = fixture(); f.start(); f.result({}, envelope); assert.equal(f.accepted.length, 0); await f.cleanup();
  }
});

test("late new USER and closed owner revoke control even after a real start", async () => {
  for (const change of ["stale", "rotate"]) {
    const f = fixture(); f.start(); f[change](); f.result(); assert.equal(f.accepted.length, 0); await f.cleanup();
  }
});

test("duplicate result is idempotent, while false or forged host receipts are rejected", async () => {
  const f = fixture(); f.start(); f.result(); f.result(); assert.equal(f.accepted.length, 1);
  f.owner.finishInitial(await actualClientToolTerminal()); await f.owner.wait();
  for (const receiptOverride of [() => false, () => Promise.resolve({}), proof => ({ ...proof, source: "model" })]) {
    const bad = fixture({ receiptOverride }); bad.start(); bad.result();
    await assert.rejects(bad.owner.wait(), /acceptance was not confirmed/); assert.equal(bad.listeners.size, 0);
  }
});

test("host acceptance cannot turn an absent, aborted, failed or yielded backend terminal into success", async () => {
  for (const result of [undefined, {}, { meta: { aborted: true }, payloads: [] },
    { meta: { error: { message: "failed" } }, payloads: [] }, { meta: { yielded: true }, payloads: [] }]) {
    const f = fixture(); f.start(); f.result(); f.owner.finishInitial(result);
    await assert.rejects(f.owner.wait(), /aborted|changed before its terminal/);
  }
});

test("even an exact successful core projection preserves real failure, cancellation, continuation and owner rejection", async () => {
  for (const payloads of [[], [{ text: "Completed payload" }]]) {
    for (const changed of [{ aborted: true }, { error: { kind: "incomplete_turn", message: "actual failure" } },
      { yielded: true }, { continuationPending: true }, { failureSignal: { kind: "failed" } },
      { terminalToolFailure: { message: "actual failed tool" } }]) {
      const terminal = await actualClientToolTerminal({ payloads }); Object.assign(terminal.meta, changed);
      const f = fixture(); f.start(); f.result(); f.owner.finishInitial(terminal);
      await assert.rejects(f.owner.wait(), /aborted|changed before its terminal/);
      assert.equal(f.accepted.length, 1); assert.equal(f.listeners.size, 0);
    }
    const stale = fixture(); stale.start(); stale.result(); stale.stale();
    stale.owner.finishInitial(await actualClientToolTerminal({ payloads }));
    await assert.rejects(stale.owner.wait(), /changed before its terminal/);
  }
});

test("the terminal overlay does not invent a call receipt or add a call projection to ordinary Memory/Web output", async () => {
  const terminal = await actualClientToolTerminal({ calls: null, payloads: [{ text: "Ordinary successful fact" }] });
  assert.equal(terminal.meta.gptLiveTerminalOutcome, undefined);
  const f = fixture({ callControl: false }); f.owner.finishInitial(terminal);
  assert.equal((await f.owner.wait()).text, "Ordinary successful fact"); assert.equal(f.accepted.length, 0);
});

test("a child or resumed run cannot exercise the initial-parent tool; ordinary Memory/Web final is unchanged", async () => {
  const f = fixture();
  f.owner.attachRun({ runId: "child", sessionKey: "agent:makaron:child", role: "child" });
  f.owner.attachRun({ runId: "resume", sessionKey: "agent:makaron:voice", role: "parent" });
  for (const runId of ["child", "resume"]) {
    f.emit({ phase: "start", name: "openclaw_end_call", toolCallId: "call_actual", args: {} }, { runId });
    f.result({}, { runId });
  }
  assert.equal(f.accepted.length, 0); await f.cleanup();
  const ordinary = fixture({ callControl: false });
  assert.equal(ordinary.listeners.has("parent"), false);
  ordinary.finish(); assert.equal((await ordinary.owner.wait()).text, "Ordinary result");
});

test("actual captured Worker and builtin assembly carry plain client schema into customTools without host callbacks", () => {
  const worker = read("../release/captured/v2026.9.1-db91.6-hotreload-feishu-approvals-20261003.worker/dist/index.mjs");
  const builtin = read("./fixtures/gpt-live-voice-tool-order/builtin-openclaw-zQV8Wwjr.js");
  assert.match(worker, /clientTools: params\.clientTools/);
  const first = builtin.indexOf("function prepareEmbeddedAttemptClientTools(params) {");
  const last = builtin.indexOf("\n//#endregion", first);
  assert(first >= 0 && last > first);
  let captured;
  const identity = value => value;
  const context = vm.createContext({
    resolveToolLoopDetectionConfig: () => ({}),
    toClientToolDefinitions: (tools, slots, hookContext) => {
      captured = { tools, slots, hookContext };
      return tools.map(definition => ({ name: definition.function.name, parameters: definition.function.parameters }));
    },
    collectCoreBuiltinToolNames: () => new Set(), getPluginToolMeta: () => undefined,
    getChannelAgentToolMeta: () => undefined, normalizeToolPolicyName: identity,
    isAgentToolReplaySafe: () => false, collectReplaySafeToolNames: () => new Set(),
    isCodeModeExecTool: () => false, findClientToolNameConflicts: () => [], AGENT_RESERVED_TOOL_NAMES: [],
    createToolDefinitionFromAgentTool: identity, wrapToolWithAbortSignal: identity, wrapToolDefinition: identity,
    collectSideEffectToolOwners: () => new Map(), getPluginToolSideEffectOwnerKey: () => undefined,
    addClientToolsToToolSearchCatalog: ({ tools }) => ({ tools, compacted: false }),
    splitSdkTools: ({ tools }) => ({ customTools: tools }),
    collectRegisteredToolNames: tools => tools.map(tool => tool.name), toSessionToolAllowlist: identity,
  });
  vm.runInContext(builtin.slice(first, last), context);
  const runtimeSchema = bindGptLiveBackendCallControl({ callControl: {
    nativeDelegationId: "item_native", originUserTurnId: "user", delegationGeneration: 1,
    userTurnText: "完整话语", tool, isCurrent: () => true, accept() {},
  }, continuationIdentity: { delegationItemId: "item_native", delegationGeneration: 1 }, assertCurrent() {} }).tool;
  const ordinaryTool = { name: "memory_search" };
  const assembled = context.prepareEmbeddedAttemptClientTools({ clientTools: [runtimeSchema],
    attempt: { config: {}, sessionId: "private", runId: "actual-parent" }, sessionAgentId: "makaron",
    sandboxSessionKey: "private-voice", effectiveTools: [ordinaryTool], uncompactedEffectiveTools: [ordinaryTool] });
  assert.equal(captured.tools[0], runtimeSchema);
  assert.equal(captured.hookContext.runId, "actual-parent");
  assert.deepEqual(Array.from(assembled.allCustomTools, tool => tool.name), ["memory_search", "openclaw_end_call"]);
  captured.slots.complete("call_actual", "openclaw_end_call", {});
  assert.equal(assembled.clientToolCallSlots[0].toolCallId, "call_actual");
  assert.equal(assembled.clientToolCallSlots[0].completed, true);
  assert.match(builtin, /customTools: allCustomTools/);
  assert.equal(Object.hasOwn(runtimeSchema, "accept"), false);
});
