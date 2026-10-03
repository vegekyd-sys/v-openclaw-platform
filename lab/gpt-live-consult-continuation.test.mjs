import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createGptLiveConsultContinuationRegistry } from "./gpt-live-consult-continuation.mjs";
import { createGptLiveConsultProgressObserver, patchGptLiveConsultProgressHarness, patchGptLiveConsultProgressTalk } from "./gpt-live-consult-progress.mjs";
import * as patches from "./patch-gpt-live-consult-continuation.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));

function setupTwoHarnessChildren() {
  const f = setup(); const scope = {};
  const sessions = new Map([["child-session-a", "child-canonical-a"], ["child-session-b", "child-canonical-b"]]);
  f.registry.bindHarnessSpawns({ scope, requesterSessionKey: f.params.sessionKey, requesterSessionId: f.params.sessionId,
    requesterTurnRunId: f.params.runId, requesterYielded: true,
    acceptedSessionSpawns: [{ runId: "child-a", childSessionKey: "child-session-a" }, { runId: "child-b", childSessionKey: "child-session-b" }],
    getChildSessionId: (key) => sessions.get(key) });
  f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const complete = (runId) => f.registry.resolveHarnessCompletion({ scope, requesterSessionKey: f.params.sessionKey,
    requesterSessionId: f.params.sessionId, requesterTurnRunId: f.params.runId, childRunId: runId,
    childSessionKey: runId === "child-a" ? "child-session-a" : "child-session-b",
    childSessionId: runId === "child-a" ? "child-canonical-a" : "child-canonical-b" });
  return { ...f, sessions, complete };
}

test("minting a later child completion revokes the owner if an already-completed child identity changed", async () => {
  const f = setupTwoHarnessChildren();
  const first = f.complete("child-a"); first.onAccepted({ runId: "parent-resumed" });
  f.sessions.set("child-session-a", "replacement-a");
  assert.throws(() => f.complete("child-b"), /accepted child identity changed/);
  await assert.rejects(f.owner.wait(), /accepted child identity changed/);
  assert.equal(first.signal.aborted, true); assert.equal(f.listeners.size, 0);
  first.finish({ meta: {}, payloads: [{ text: "Late final must never pass." }] });
  assert.equal(f.owner.isCurrent(), false); assert.equal(f.cancellations.length, 0);
});

test("an already-minted multi-child token rechecks every accepted child before parent final", async () => {
  const f = setupTwoHarnessChildren();
  f.complete("child-a").onAccepted({ runId: "parent-resumed" });
  const last = f.complete("child-b"); last.onAccepted({ runId: "parent-resumed" });
  f.sessions.set("child-session-a", "replacement-a");
  last.finish({ meta: {}, payloads: [{ text: "Late final must never pass." }] });
  await assert.rejects(f.owner.wait(), /accepted child identity changed/);
  assert.equal(last.signal.aborted, true); assert.equal(f.listeners.size, 0); assert.equal(f.owner.isCurrent(), false);
});

test("accepted multi-child token rechecks all identities before dispatch and accepted resume", async () => {
  for (const phase of ["assertCurrent", "onAccepted"]) {
    const f = setupTwoHarnessChildren(); f.complete("child-a").onAccepted({ runId: "parent-resumed" });
    const token = f.complete("child-b"); f.sessions.set("child-session-a", "replacement-a");
    assert.throws(() => phase === "assertCurrent" ? token.assertCurrent({ sessionKey: f.params.sessionKey, sessionId: f.params.sessionId }) :
      token.onAccepted({ runId: "parent-resumed" }), /accepted child identity changed/);
    await assert.rejects(f.owner.wait(), /accepted child identity changed/);
    assert.equal(token.signal.aborted, true); assert.equal(f.listeners.size, 0);
  }
});

test("unchanged multi-child identities still return the one causal parent final", async () => {
  const f = setupTwoHarnessChildren(); f.complete("child-a").onAccepted({ runId: "parent-resumed" });
  const token = f.complete("child-b"); token.onAccepted({ runId: "parent-resumed" });
  token.finish({ meta: {}, payloads: [{ text: "Both accepted children verified; same parent final." }] });
  assert.equal((await f.owner.wait()).text, "Both accepted children verified; same parent final.");
  assert.equal(f.listeners.size, 0);
});
const fixtureRoot = new URL("./fixtures/gpt-live-continuation/", import.meta.url);
const registrySource = readFileSync(new URL("subagent-registry-C24yr_PF.js", fixtureRoot), "utf8");
const wakeSource = readFileSync(new URL("subagent-announce.requester-settle-wake-B2NSziIo.js", fixtureRoot), "utf8");
const deliverySource = readFileSync(new URL("subagent-announce-delivery-Dosep7Zr.js", fixtureRoot), "utf8");
const sdkSource = readFileSync(new URL("plugin-sdk/agent-harness-task-runtime.js", fixtureRoot), "utf8");
const controlSource = readFileSync(new URL("agent-run-control-BeeIeTBf.js", fixtureRoot), "utf8");
const execute = (source, start, end, deps) => {
  const from = source.indexOf(start); const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `captured ${start} boundary drifted`);
  const name = start.match(/function ([\w$]+)/)[1];
  return new Function("deps", `with (deps) { ${source.slice(from, to)}; return ${name}; }`)(deps);
};

function setup({ generation = 1, delegationGeneration = 1 } = {}) {
  const listeners = new Map(); const progress = []; const runs = new Map(); const cleanups = [];
  const cancellations = []; const resumeExecutions = [];
  const caller = new AbortController(); let current = true; let liveGeneration = generation; let rotate;
  const registry = createGptLiveConsultContinuationRegistry({
    subscribeRun: (runId, callback) => { listeners.set(runId, callback); return () => listeners.delete(runId); },
    createProgressObserver: createGptLiveConsultProgressObserver,
    getLifecycleGeneration: () => liveGeneration,
    isLifecycleCurrent: (value) => value === liveGeneration,
    onLifecycleRotation: (callback) => { rotate = callback; },
  });
  const context = { identity: { delegationItemId: "delegate-a", delegationGeneration }, ownerConnId: "conn", voiceSessionId: "voice",
    ownerGeneration: "transport-generation", isCurrent: () => current, onCanceled: (event) => cancellations.push(event) };
  const params = { continuationContext: context, runId: "parent-a", sessionId: "canonical-a", sessionKey: "agent:makaron:voice", agentId: "makaron",
    abortSignal: caller.signal, timeoutMs: 60000, onProgress: (value) => progress.push(value),
    collectVisibleText: (payloads) => payloads.filter((item) => !item.isReasoning && !item.isCommentary && !item.isError).map((item) => item.text ?? "").join("\n\n"),
    runRegistration: { cleanup: () => cleanups.push("initial") },
    onResumeRunStarted: ({ runId }) => ({ cleanup: () => cleanups.push(runId) }),
    onResumeExecutionStarted: (event) => resumeExecutions.push(event) };
  const owner = registry.createOwner(params);
  const attach = (runId = "child-a", parentRunId = "parent-a") => {
    const entry = { runId, taskRunId: runId, childSessionKey: `agent:makaron:${runId}`, requesterSessionKey: params.sessionKey, requesterAgentId: "makaron",
      requesterTurnRunId: parentRunId, requesterTurnYielded: true, expectsCompletionMessage: true, generation: 1,
      execution: { lifecycleGeneration: generation, status: "running" }, delivery: { status: "pending" } };
    runs.set(runId, entry);
    registry.attachAcceptedChild({ entry, getCurrentEntry: (id) => runs.get(id) });
    return entry;
  };
  const settle = execute(patches.patchGptLiveContinuationRegistry(registrySource), "function settleRequesterTurnAfterSessionSpawns$1", "//#endregion", {
    bindGptLiveConsultYieldBatch: registry.bindYieldBatch,
  });
  const settleTurn = (parentRunId = "parent-a", entries = [...runs.values()], persistOrThrow = () => {}) => settle({
    requesterSessionKey: params.sessionKey, requesterAgentId: "makaron", requesterTurnRunId: parentRunId, requesterYielded: true,
    acceptedSessionSpawns: entries.map((entry) => ({ runId: entry.taskRunId, childSessionKey: entry.childSessionKey })), runs, persistOrThrow, schedule: () => {},
  });
  const emit = (runId, text, extra = {}) => listeners.get(runId)?.({ runId, lifecycleGeneration: generation, stream: "item", data: { kind: "preamble", phase: "end", itemId: `${runId}-public`, progressText: text }, ...extra });
  const wake = (entry = runs.get("child-a")) => {
    // A real registry wake is scheduled only after this batch's children ended.
    for (const id of entry.requesterSettleWake.batchRunIds) {
      const child = runs.get(id); child.execution = { ...child.execution, status: "terminal", endedAt: Date.now() };
    }
    return registry.resolveWake({ requesterSessionKey: params.sessionKey, requesterAgentId: "makaron",
      batchRunIds: entry.requesterSettleWake.batchRunIds, rearmGeneration: entry.requesterSettleWake.rearmGeneration });
  };
  return { registry, owner, params, caller, progress, runs, attach, settleTurn, emit, wake, listeners, cleanups, cancellations, resumeExecutions,
    replaceOwner: () => { current = false; }, rotate: () => { liveGeneration++; rotate(); } };
}

function actualCancel(f, active = new Map()) {
  const control = execute(controlSource, "async function controlRealtimeVoiceAgentRun", "//#endregion", {
    resolveRealtimeVoiceAgentControlIntent: ({ mode }) => ({ mode }),
    buildRealtimeVoiceAgentCancelProviderResult: (message) => ({ cancelled: true, message }),
  });
  const original = readFileSync(new URL("../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/talk-DkFuKRod.js", import.meta.url), "utf8");
  const patched = patches.patchGptLiveContinuationTalk(patchGptLiveConsultProgressTalk(original));
  const helper = execute(patched, "async function cancelOwnedGptLiveVoiceConsult", "function resolveOwnedActiveTalkRunTarget", {
    resolveGptLiveVoiceConsultControl: f.registry.resolveOwnedControl,
    controlRealtimeVoiceAgentRun: control,
  });
  const controlRuntime = { resolveActiveEmbeddedRunOwnerByRunId: (id) => active.get(id), getDiagnosticSessionActivitySnapshot: () => undefined };
  const params = { mode: "cancel", text: "Cancel this task", ownerConnId: "conn",
    sessionTarget: { canonicalKey: f.params.sessionKey, agentId: "makaron" }, controlRuntime };
  return { helper, control, patched, params, run: (extra = {}) => helper({ ...params, ...extra }) };
}

function actualControl(f, active = new Map(), queue = async (sessionId) => ({ queued: true, sessionId })) {
  const control = execute(controlSource, "async function controlRealtimeVoiceAgentRun", "//#endregion", {
    resolveRealtimeVoiceAgentControlIntent: ({ mode }) => ({ mode }),
    buildRealtimeVoiceAgentFollowupSteeringText: execute(controlSource, "function buildRealtimeVoiceAgentFollowupSteeringText", "/** User-facing message", {}),
    formatRealtimeVoiceAgentQueueRejection: execute(controlSource, "function formatRealtimeVoiceAgentQueueRejection", "function isRealtimeVoiceAgentControlToolEvent", {}),
    formatRealtimeVoiceAgentStatus: execute(controlSource, "function formatRealtimeVoiceAgentStatus", "//#endregion", {}),
  });
  const original = readFileSync(new URL("../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/talk-DkFuKRod.js", import.meta.url), "utf8");
  const patched = patches.patchGptLiveContinuationTalk(patchGptLiveConsultProgressTalk(original));
  const helper = execute(patched, "async function controlOwnedGptLiveVoiceConsult", "function resolveOwnedActiveTalkRunTarget", {
    resolveGptLiveVoiceConsultControl: f.registry.resolveOwnedControl, controlRealtimeVoiceAgentRun: control,
  });
  const runtime = { resolveActiveEmbeddedRunOwnerByRunId: (id) => active.get(id),
    getDiagnosticSessionActivitySnapshot: () => undefined, queueEmbeddedAgentMessageWithOutcomeAsync: queue };
  const params = { mode: "steer", text: "Only use the corrected date", ownerConnId: "conn",
    sessionTarget: { canonicalKey: f.params.sessionKey, agentId: "makaron" }, controlRuntime: runtime };
  return { control, patched, run: (extra = {}) => helper({ ...params, ...extra }) };
}

function realWake(f, announce) {
  // Execute all captured wake selection/outbox helpers; replace only external runtime boundaries.
  const body = patches.patchGptLiveContinuationWake(wakeSource).split("//#region")[1].split("//#endregion")[0];
  const deps = {
    SILENT_REPLY_TOKEN: "NO_REPLY", getRuntimeConfig: () => ({}), resolveSubagentRequesterAgentId: () => "makaron",
    isCronSessionKey: () => false, listSubagentRunsForRequester: () => [...f.runs.values()], hasDescendantRunAwaitingSettle: () => false,
    hasSubagentRunEnded: (entry) => entry.execution.status === "terminal", getSubagentDepthFromSessionStore: () => 0,
    loadRequesterSessionEntry: () => ({ entry: { sessionId: "canonical-a" } }), hasUsableSessionEntry: () => true,
    dedupeLatestChildCompletionRows: (rows) => rows, filterCurrentDirectChildCompletionRows: (rows) => rows,
    getLatestSubagentRunByChildSessionKey: () => undefined, buildChildCompletionFindings: () => "Child verified date fields.",
    normalizeDeliveryContext: (value) => value, resolveAnnounceOrigin: () => undefined, normalizeMessageChannel: () => undefined,
    isDeliverableMessageChannel: () => false, buildAnnounceIdempotencyKey: (value) => value, INTERNAL_MESSAGE_CHANNEL: "internal",
    getSharedGatewayContextResolver: () => undefined, logWarn: () => {}, truncateUtf16Safe: (value, limit) => value.slice(0, limit),
    resolveGptLiveConsultRequesterWake: f.registry.resolveWake, deliverSubagentAnnouncement: announce,
  };
  const run = new Function("deps", `with(deps) { //#region${body}; return maybeWakeRequesterAfterAllChildrenSettled; }`)(deps);
  return () => run({ requesterSessionKey: f.params.sessionKey, settledEntry: f.runs.get("child-a"),
    transitionBatch: (ids, state) => ids.forEach((id) => { f.runs.get(id).requesterSettleWake = state; }), completeBatch: () => {} });
}

test("captured registry → actual wake → delivery holds yield open and returns only causal parent final, with child and resume public progress", async () => {
  const f = setup(); const child = f.attach();
  assert.equal(f.settleTurn(), true);
  f.owner.finishInitial({ meta: { yielded: true, yieldAcknowledgment: "已交给子代理继续核验。" }, payloads: [{ text: "已交办" }] });
  let finished = false; const pending = f.owner.wait().then((value) => { finished = true; return value; });
  await tick(); assert.equal(finished, false);
  f.emit("unrelated-next-run", "其他任务结果。", { sessionKey: f.params.sessionKey });
  f.emit("child-a", "核验已经得到四位码 7264。");
  f.emit("child-a", "不能转播的推理。", { data: { text: "不能转播的推理。", isReasoning: true } });
  f.emit("child-a", "内部工具。", { stream: "tool", data: { text: "内部工具。" } });
  const childFact = f.progress.find((value) => value.text.includes("7264"));
  assert.equal(childFact.provenance.runId, "child-a");
  assert.deepEqual(childFact.provenance.batchRunIds, ["child-a"]);
  assert.equal(childFact.provenance.parentRunId, "parent-a");
  assert.equal(childFact.provenance.role, "child");
  assert.equal(f.progress.some((value) => /推理|内部工具|其他任务/.test(value.text)), false);
  child.execution = { ...child.execution, status: "terminal", endedAt: Date.now() }; child.delivery.status = "delivered";
  let release;
  const runCall = execute(patches.patchGptLiveContinuationDelivery(deliverySource), "async function runAnnounceAgentCall", "async function sendSubagentAnnounceDirectly", {
    shouldPreserveUserFacingSessionStateForInputProvenance: () => true,
    getGatewayAgentResult: (response) => response.result,
    dispatchSubagentAnnounceAgent: async (_params, opts) => {
      opts.onAccepted({ status: "accepted", runId: "parent-resumed-a" }); opts.onExecutionStarted();
      f.emit("parent-resumed-a", "子代理已核验到日期 2026-10-02。还在检查时区。");
      return await new Promise((resolve) => { release = resolve; });
    },
  });
  const runWake = realWake(f, async (args) => {
    assert(args.voiceContinuation, "actual wake must carry the trusted exact-batch voice capability");
    const response = await runCall({ voiceContinuation: args.voiceContinuation, getRequesterSessionId: () => "canonical-a",
      agentParams: { sessionKey: args.targetRequesterSessionKey }, expectFinal: true, timeoutMs: 60000, isExecutionAllowed: () => true });
    assert.equal(response.status, "ok"); return { delivered: true, path: "direct" };
  });
  const waking = runWake(); await tick();
  assert.equal(finished, false);
  assert(f.progress.some((value) => value.provenance.runId === "parent-resumed-a" && value.text.includes("2026-10-02")));
  release({ status: "ok", runId: "parent-resumed-a", result: { payloads: [{ text: "7264 / 2026-10-02 / 20:10:59 / UTC+08:00" }], meta: {} } });
  assert.equal(await waking, true);
  assert.equal((await pending).text, "7264 / 2026-10-02 / 20:10:59 / UTC+08:00");
  assert.equal(f.listeners.size, 0); assert.deepEqual(f.cleanups.sort(), ["initial", "parent-resumed-a"]);
});

test("next parent yield binds another accepted batch and does not treat its acknowledgment as final", async () => {
  const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const first = f.wake(); first.onAccepted({ runId: "resume-a" });
  const secondChild = f.attach("child-b", "resume-a"); f.settleTurn("resume-a", [secondChild]);
  first.finish({ meta: { yielded: true, yieldAcknowledgment: "还在验证第二阶段。" }, payloads: [{ text: "第二阶段已交办" }] });
  let done = false; f.owner.wait().then(() => { done = true; }); await tick(); assert.equal(done, false);
  const next = f.wake(secondChild); next.onAccepted({ runId: "resume-b" }); next.finish({ meta: {}, payloads: [{ text: "两个阶段已全部验证。" }] });
  assert.equal((await f.owner.wait()).text, "两个阶段已全部验证。");
});

test("actual Worker host SDK completion direct path binds scope + accepted child receipts before yield and returns to the same voice", async () => {
  const f = setup(); const scope = { requesterSessionKey: f.params.sessionKey }; const issuedScopes = new WeakSet([scope]);
  const childSessionKey = "agent:makaron:worker-child"; const childSessionId = "child-canonical-a";
  const entries = new Map([[f.params.sessionKey, { sessionId: f.params.sessionId }], [childSessionKey, { sessionId: childSessionId }]]);
  const patched = patches.patchGptLiveContinuationTaskSdk(sdkSource); let finish; let directArgs;
  const call = execute(patches.patchGptLiveContinuationDelivery(deliverySource), "async function runAnnounceAgentCall", "async function sendSubagentAnnounceDirectly", {
    shouldPreserveUserFacingSessionStateForInputProvenance: () => true, getGatewayAgentResult: (response) => response.result,
    dispatchSubagentAnnounceAgent: async (_params, opts) => {
      opts.onAccepted({ runId: "worker-parent-resumed" }); opts.onExecutionStarted();
      f.emit("worker-parent-resumed", "四位码 4928 已核验，现在继续处理时间字段。");
      return await new Promise((resolve) => { finish = resolve; });
    },
  });
  const deps = {
    assertAgentHarnessTaskRuntimeScope: (value) => { assert(issuedScopes.has(value), "only a host-issued scope is accepted"); return value; },
    loadRequesterSessionEntry: (key) => ({ entry: entries.get(key) }), bindGptLiveHarnessVoiceSpawns: f.registry.bindHarnessSpawns,
    resolveGptLiveHarnessVoiceCompletion: f.registry.resolveHarnessCompletion, mapHarnessCompletionStatus: () => "ok",
    AGENT_INTERNAL_EVENT_TYPE_TASK_COMPLETION: "task-completion", AGENT_HARNESS_COMPLETION_SOURCE_TOOL: "agent_harness_task",
    isInternalAnnounceRequesterSession: () => false, resolveAnnounceOrigin: () => undefined, formatAgentInternalEventsForPrompt: () => "PRIVATE task context",
    INTERNAL_MESSAGE_CHANNEL: "internal", buildAnnounceIdempotencyKey: (value) => value,
    getGatewayContextResolver: () => undefined,
    deliverSubagentAnnouncement: async (args) => {
      directArgs = args;
      await call({ voiceContinuation: args.voiceContinuation, getRequesterSessionId: () => entries.get(f.params.sessionKey).sessionId,
        agentParams: { sessionKey: args.targetRequesterSessionKey }, expectFinal: true, timeoutMs: 60000, isExecutionAllowed: () => true });
      return { delivered: true, path: "direct" };
    },
  };
  const bind = execute(patched, "function bindGptLiveAgentHarnessVoiceSpawns", "export {", deps);
  const deliver = execute(patched, "async function deliverAgentHarnessTaskCompletion", "function mapHarnessCompletionStatus", deps);
  assert.throws(() => bind({ scope: { ...scope }, acceptedSessionSpawns: [] }), /host-issued/);
  assert.equal(bind({ scope, requesterTurnRunId: "parent-a", requesterYielded: true,
    acceptedSessionSpawns: [{ runId: "worker-child-run", childSessionKey }] }), true);
  f.owner.finishInitial({ meta: { yielded: true }, payloads: [{ text: "已交办" }] });
  let resolved = false; f.owner.wait().then(() => { resolved = true; }); await tick(); assert.equal(resolved, false);
  f.emit("worker-child-run", "等待八秒后采集到秒值 43。", { sessionId: childSessionId });
  assert.equal(f.progress[0].provenance.runId, "worker-child-run"); assert.deepEqual(f.progress[0].provenance.batchRunIds, ["worker-child-run"]);
  await assert.rejects(deliver({ scope, requesterTurnRunId: "parent-a", childRunId: "different-child", childSessionKey, childSessionId,
    status: "succeeded", result: "Other result" }), /causal identity changed/);
  const pendingDelivery = deliver({ scope, requesterTurnRunId: "parent-a", childRunId: "worker-child-run", childSessionKey, childSessionId,
    status: "succeeded", result: "4928 / 2026 / 10 / 2 / 20 / 43 / 43", announceId: "host-announcement" });
  await tick(); assert.equal(resolved, false);
  assert.equal(directArgs.requireDirectDelivery, true); assert.equal(directArgs.expectsCompletionMessage, false);
  assert(f.progress.some((value) => value.provenance.runId === "worker-parent-resumed" && value.text.includes("4928")));
  finish({ status: "ok", result: { payloads: [{ text: "4928 / 2026 / 10 / 2 / 20 / 43 / 43" }], meta: {} } });
  assert.equal((await pendingDelivery).delivered, true);
  assert.equal((await f.owner.wait()).text, "4928 / 2026 / 10 / 2 / 20 / 43 / 43");
  assert.equal(f.progress.some((value) => value.text.includes("PRIVATE")), false);
  await assert.rejects(deliver({ scope, requesterTurnRunId: "parent-a", childRunId: "worker-child-run", childSessionKey, childSessionId,
    status: "succeeded", result: "duplicate final" }), /already settled/);
});

test("actual patched harness releases turn admission after yield while keeping voice promise and caller cancellation alive", async () => {
  for (const cancel of [false, true, "aborted", "error"]) {
    const caller = new AbortController(); const scope = {}; const context = { identity: { delegationItemId: "d", delegationGeneration: 1 },
      ownerConnId: "conn", voiceSessionId: "voice", ownerGeneration: "transport", isCurrent: () => true };
    const observations = { release: 0, cleanup: 0, canceled: 0 }; context.onCanceled = () => observations.canceled++;
    let rootRunId; const registry = createGptLiveConsultContinuationRegistry({
      subscribeRun: () => () => {}, createProgressObserver: createGptLiveConsultProgressObserver,
      getLifecycleGeneration: () => 1, isLifecycleCurrent: () => true,
    });
    const original = readFileSync(new URL("../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/realtime-session-harness-CEO5kVAJ.js", import.meta.url), "utf8");
    const patched = patches.patchGptLiveContinuationHarness(patchGptLiveConsultProgressHarness(original)).replace(
      'const [{ beginSessionWorkAdmission }, { resolveSessionWorkStartError }] = await Promise.all([import("./session-lifecycle-admission-DCnoxd2o.js"), import("./lifecycle-7GS52a1a.js")]);',
      "const importedAdmission = beginSessionWorkAdmission; const importedStartError = resolveSessionWorkStartError;",
    );
    const consult = execute(patched, "async function consultRealtimeVoiceAgent", "//#endregion", {
      createGptLiveConsultContinuationOwner: registry.createOwner, createGptLiveConsultProgressObserver,
      beginSessionWorkAdmission: async () => ({ run: (callback) => callback(), release: () => observations.release++ }),
      resolveSessionWorkStartError: () => undefined, resolveSessionAgentId: () => "makaron",
      assertRealtimeVoiceAgentConsultModelSelectionUnlocked: () => {}, resolveRealtimeVoiceAgentDeliveryContext: () => undefined,
      resolveRealtimeVoiceAgentConsultSessionEntry: async () => ({ sessionId: "canonical" }), deliveryContextFromSession: () => undefined,
      resolveRealtimeVoiceAgentSandboxSessionKey: () => "sandbox", buildRealtimeVoiceAgentConsultPrompt: () => "Question",
      collectRealtimeVoiceAgentConsultVisibleText: (payloads) => payloads.map((payload) => payload.text ?? "").join(""), randomUUID: () => "uuid",
    });
    const pending = consult({ cfg: {}, continuationContext: context, sessionKey: "agent:makaron:voice", runIdPrefix: "voice", abortSignal: caller.signal,
      logger: { warn() {} }, onRunStarted: () => ({ cleanup: () => observations.cleanup++ }),
      agentRuntime: { resolveAgentDir: () => "/tmp/agent", resolveAgentWorkspaceDir: () => "/tmp/workspace", ensureAgentWorkspace: async () => {},
        resolveAgentTimeoutMs: () => 60000, session: { resolveStorePath: () => "/tmp/store", getSessionEntry: () => ({ sessionId: "canonical" }) },
        runEmbeddedAgent: async (params) => {
          rootRunId = params.runId;
          if (cancel === "aborted") return { payloads: [], meta: { aborted: true } };
          if (cancel === "error") throw new Error("worker request was cancelled");
          registry.bindHarnessSpawns({ scope, requesterSessionKey: params.sessionKey, requesterSessionId: params.sessionId, requesterTurnRunId: params.runId,
            requesterYielded: true, acceptedSessionSpawns: [{ runId: "child", childSessionKey: "agent:makaron:child" }], getChildSessionId: () => "child-session" });
          return { payloads: [{ text: "已交办" }], meta: { yielded: true } };
        } },
    });
    pending.catch(() => {});
    await tick(); assert.equal(observations.release, 1);
    if (cancel === "aborted" || cancel === "error") {
      await assert.rejects(pending, cancel === "aborted" ? { name: "AbortError" } : /worker request was cancelled/);
      assert.equal(observations.canceled, cancel === "aborted" ? 1 : 0); assert.equal(observations.cleanup, 1);
      continue;
    }
    assert.equal(observations.cleanup, 0);
    const token = registry.resolveHarnessCompletion({ scope, requesterSessionKey: "agent:makaron:voice", requesterSessionId: "canonical",
      requesterTurnRunId: rootRunId, childRunId: "child", childSessionKey: "agent:makaron:child", childSessionId: "child-session" });
    if (cancel) {
      caller.abort(new Error("close after yielded admission released"));
      await assert.rejects(pending, /close after yielded admission released/); assert.equal(token.signal.aborted, true);
      assert.equal(observations.canceled, 1);
    } else {
      token.onAccepted({ runId: "resumed" }); token.finish({ meta: {}, payloads: [{ text: "真正最终结果。" }] });
      assert.equal((await pending).text, "真正最终结果。");
      assert.equal(observations.canceled, 0);
    }
    assert.equal(observations.cleanup, 1);
  }
});

test("wrong run, wrong batch/rearm/session and hidden streams cannot attach to the current voice", async () => {
  const f = setup(); const child = f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  assert.equal(f.registry.resolveWake({ requesterSessionKey: f.params.sessionKey, requesterAgentId: "makaron", batchRunIds: ["other"], rearmGeneration: 1 }), undefined);
  assert.equal(f.registry.resolveWake({ requesterSessionKey: f.params.sessionKey, requesterAgentId: "makaron", batchRunIds: [child.runId], rearmGeneration: 2 }), undefined);
  const token = f.wake();
  token.onAccepted({ runId: "resume-a" });
  f.emit("resume-a", "错误父会话的公开输出。", { sessionId: "replacement-canonical" });
  f.emit("child-a", "Thought must not be spoken.", { stream: "thought", data: { text: "Thought must not be spoken." } });
  assert.equal(f.progress.length, 0); f.owner.abort(new Error("test cleanup")); await assert.rejects(f.owner.wait(), /test cleanup/);
  const replaced = setup(); replaced.attach(); replaced.settleTurn(); replaced.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  assert.throws(() => replaced.wake().assertCurrent({ sessionKey: replaced.params.sessionKey, sessionId: "replacement-canonical" }), /causal ownership changed/);
  await assert.rejects(replaced.owner.wait(), /causal ownership changed/);
});

test("abort after yield removes all subscriptions and prevents later completion/replay", async () => {
  const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const token = f.wake(); token.onAccepted({ runId: "resume-a" });
  f.caller.abort(new Error("explicit user cancel")); await assert.rejects(f.owner.wait(), /explicit user cancel/);
  assert.equal(token.signal.aborted, true); assert.equal(f.listeners.size, 0);
  f.emit("resume-a", "迟到结果。"); token.finish({ meta: {}, payloads: [{ text: "迟到 final" }] });
  assert.equal(f.progress.length, 0); assert.throws(() => f.wake(), /already settled|cancelled/);
});

test("canonical requester session reset after yield closes the owner before any child public output", async () => {
  const f = setup(); let originalSessionExists = true;
  f.params.isSessionCurrent = () => originalSessionExists;
  f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  originalSessionExists = false;
  f.emit("child-a", "重置父会话后的旧子任务结果。");
  await assert.rejects(f.owner.wait(), /owner changed before public progress/);
  assert.equal(f.progress.length, 0); assert.equal(f.listeners.size, 0);
});

test("owner replacement, gateway rotation and repeated accepted run are fenced", async () => {
  for (const mutate of [(f) => f.replaceOwner(), (f) => f.rotate()]) {
    const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
    const token = f.wake(); token.onAccepted({ runId: "resume-a" }); mutate(f);
    f.emit("resume-a", "旧连接迟到输出。"); await assert.rejects(f.owner.wait()); assert.equal(f.progress.length, 0);
  }
  const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const token = f.wake(); token.onAccepted({ runId: "resume-a" }); token.onAccepted({ runId: "resume-a" });
  assert.equal(f.listeners.size, 2); assert.throws(() => token.onAccepted({ runId: "different-replay" }), /different replay run/);
  token.finish({ meta: {}, payloads: [{ text: "唯一结果。" }] }); token.finish({ meta: {}, payloads: [{ text: "重复结果。" }] });
  assert.equal((await f.owner.wait()).text, "唯一结果。");
  assert.throws(() => f.registry.createOwner(f.params), /Repeated or stale/);
});

test("registry persistence rollback creates no voice wake binding; missing accepted child fails closed", async () => {
  const f = setup(); const child = f.attach();
  assert.throws(() => f.settleTurn("parent-a", [child], () => { throw new Error("sqlite persist failed"); }), /sqlite persist failed/);
  assert.equal(f.registry.resolveWake({ requesterSessionKey: f.params.sessionKey, requesterAgentId: "makaron", batchRunIds: [child.runId], rearmGeneration: 1 }), undefined);
  assert.equal(child.requesterTurnRunId, "parent-a");
  f.owner.finishInitial({ meta: { yielded: true }, payloads: [] }); await assert.rejects(f.owner.wait(), /no causally accepted/);
});

test("provenance is created at public emission, monotonic per actual run, and excludes supplied metadata", () => {
  const emitted = []; const before = Date.now();
  const observer = createGptLiveConsultProgressObserver({ runId: "real-parent-run", onProgress: (value) => emitted.push(value) });
  observer.onPartialReply({ phase: "commentary", text: "等待的事实尚未完整", itemId: "public-item", emittedAt: 1, secret: "private" });
  assert.equal(emitted.length, 0);
  observer.onPartialReply({ phase: "commentary", text: "等待的事实尚未完整。第二句还没", itemId: "public-item", emittedAt: 1, secret: "private" });
  observer.onPartialReply({ phase: "commentary", text: "等待的事实尚未完整。第二句还没结束。", itemId: "public-item" });
  const after = Date.now();
  assert.deepEqual(emitted.map((value) => value.provenance.sequence), [1, 2]);
  for (const { provenance } of emitted) {
    assert(provenance.emittedAt >= before && provenance.emittedAt <= after);
    assert.equal(provenance.runId, "real-parent-run"); assert.equal(provenance.itemId, "public-item");
    assert.deepEqual(Object.keys(provenance).sort(), ["emittedAt", "itemId", "runId", "sequence", "source"]);
  }
});

test("actual voice prompt requires verified public stage facts before the next slow step and leaves the plain chat prompt unchanged", () => {
  const source = readFileSync(new URL("../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/realtime-session-harness-CEO5kVAJ.js", import.meta.url), "utf8");
  const patched = patches.patchGptLiveContinuationHarness(patchGptLiveConsultProgressHarness(source));
  const readConsultStringArg = execute(source, "function readConsultStringArg", "//#endregion", {
    normalizeOptionalString: (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
  });
  const parseRealtimeVoiceAgentConsultArgs = execute(source, "function parseRealtimeVoiceAgentConsultArgs", "/** Build the plain chat message", { readConsultStringArg });
  const deps = { parseRealtimeVoiceAgentConsultArgs };
  const prompt = execute(patched, "function buildRealtimeVoiceAgentConsultPrompt", "/** Collect only visible answer text", deps);
  const params = { args: { question: "先核验一个阶段，再完成后续步骤。", context: "真实上下文", responseStyle: "简短中文" },
    transcript: [{ role: "user", text: "之前的用户请求" }, { role: "assistant", text: "之前的公开回复" }], surface: "a browser Talk session", userLabel: "User" };
  const value = prompt(params);
  assert.match(value, /after receiving a real, verified intermediate result/);
  assert.match(value, /complete public assistant sentence or public preamble before starting the next slow step/);
  assert.match(value, /Distinguish a plan or request receipt from a verified fact/);
  assert.match(value, /distinguish an intermediate result from task completion/);
  assert.match(value, /Do not guess missing facts or announce success before verification/);
  assert.match(value, /include any already confirmed public stage results in the public yield acknowledgment/);
  assert.match(value, /never expose raw tool output, tool logs, or private reasoning/);
  assert.match(value, /When finished, return only the concise result/);
  assert(value.includes(params.args.question) && value.includes(params.args.context));
  assert(value.includes("User: 之前的用户请求") && value.includes("Agent: 之前的公开回复"));
  const before = execute(source, "function buildRealtimeVoiceAgentConsultChatMessage", "/** Build the delegated OpenClaw agent prompt", deps);
  const after = execute(patched, "function buildRealtimeVoiceAgentConsultChatMessage", "/** Build the delegated OpenClaw agent prompt", deps);
  assert.equal(before.toString(), after.toString(), "the non-delegated plain chat prompt must remain byte-for-byte unchanged");
  assert.equal(after(params.args), before(params.args));
  assert.throws(() => prompt({ ...params, args: {} }), /question required/);
});

test("captured exact run abort revokes Native synchronously before generic Worker error and ignores late output", async () => {
  const f = setup(); const order = [];
  f.params.continuationContext.onCanceled = (event) => { order.push("native-revoked"); f.cancellations.push(event); };
  const candidate = { sessionKey: f.params.sessionKey, sessionId: f.params.sessionId, abort: () => {
    order.push("exact-abort"); queueMicrotask(() => { order.push("worker-error"); f.owner.abort(new Error("worker request was cancelled")); }); return true;
  } };
  const cancel = actualCancel(f, new Map([["parent-a", candidate]]));
  const pending = assert.rejects(f.owner.wait(), { name: "AbortError" });
  const result = await cancel.run();
  assert.equal(result.ok, true); await pending;
  assert.deepEqual(order, ["exact-abort", "native-revoked", "worker-error"]);
  assert.equal(f.cancellations.length, 1); assert.equal(f.cancellations[0].source, "explicit_control");
  assert.equal(f.cancellations[0].delegationItemId, "delegate-a"); assert.equal(f.cancellations[0].delegationGeneration, 1);
  f.owner.onProgress({ text: "late Worker output", provenance: {} }); f.owner.finishInitial({ meta: {}, payloads: [{ text: "late final" }] });
  assert.equal(f.progress.length, 0); assert.equal(f.registry.resolveOwnedControl({ ownerConnId: "conn", sessionKey: f.params.sessionKey }), undefined);
});

test("actual Talk RPC uses the causal cancel helper before the released Harness run selector", async () => {
  const f = setup(); const cancel = actualCancel(f); const start = cancel.patched.indexOf('\t"talk.client.steer": async');
  const end = cancel.patched.indexOf('\n\t}\n};', start);
  assert(start > 0 && end > start);
  let helperCalls = 0; let legacyCalls = 0; const replies = [];
  const body = cancel.patched.slice(start, end + 3).replace('"talk.client.steer": async', 'async');
  const handler = new Function("deps", `with(deps) { return (${body.trim()}); }`)({
    assertValidParams: () => true, validateTalkClientSteerParams: {}, prepareTalkSessionTarget: () => cancel.params.sessionTarget,
    cancelOwnedGptLiveVoiceConsult: async (args) => { helperCalls++; assert.equal(args.ownerConnId, "conn"); return { ok: true, mode: "cancel" }; },
    resolveOwnedActiveTalkRunTarget: () => { legacyCalls++; throw new Error("released admission must not be selected"); },
  });
  await handler({ params: { sessionKey: f.params.sessionKey, mode: "cancel", text: "cancel" }, client: { connId: "conn" },
    context: { getRuntimeConfig: () => ({}) }, respond: (...args) => replies.push(args) });
  assert.equal(helperCalls, 1); assert.equal(legacyCalls, 0); assert.equal(replies[0][0], true);
  assert.deepEqual(replies[0][1], { ok: true, mode: "cancel" });
  f.owner.abort(new Error("test cleanup")); await assert.rejects(f.owner.wait());
});

test("post-yield cancellation targets only the accepted running child, then revokes the original wait", async () => {
  const f = setup(); const child = f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const requested = [];
  const candidate = { sessionKey: child.childSessionKey, sessionId: "child-session", abort: () => { requested.push("child-a"); return true; } };
  const cancel = actualCancel(f, new Map([["child-a", candidate]]));
  const pending = assert.rejects(f.owner.wait(), { name: "AbortError" });
  const result = await cancel.run(); assert.equal(result.ok, true); await pending;
  assert.deepEqual(requested, ["child-a"]); assert.equal(f.cancellations.length, 1);
  assert.equal(f.listeners.size, 0); assert.throws(() => f.wake(), /already settled|cancelled/);
  f.emit("child-a", "late child fact."); assert.equal(f.progress.length, 0);
});

test("resumed parent cancellation uses its accepted run instead of the still-registered original run", async () => {
  const f = setup(); const child = f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  child.execution.status = "terminal"; child.execution.endedAt = Date.now();
  const wake = f.wake(); wake.onAccepted({ runId: "resumed-parent" });
  const aborted = [];
  const cancel = actualCancel(f, new Map([["resumed-parent", { sessionKey: f.params.sessionKey, sessionId: f.params.sessionId,
    abort: () => { aborted.push("resumed-parent"); return true; } }]]));
  const pending = assert.rejects(f.owner.wait(), { name: "AbortError" });
  assert.equal((await cancel.run()).ok, true); await pending;
  assert.deepEqual(aborted, ["resumed-parent"]); assert.equal(f.cancellations.length, 1);
  assert.equal(f.cancellations[0].runId, "resumed-parent");
  assert.equal(f.cancellations[0].ownerRunId, f.params.runId);
  assert.equal(f.cancellations[0].source, "explicit_control");
  wake.finish({ meta: {}, payloads: [{ text: "late final" }] }); assert.equal(f.progress.length, 0);
});

test("captured stale-first Talk selector fails while trusted status, steer and followup use the actual resumed parent", async () => {
  const f = setup(); const child = f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  child.execution.status = "terminal"; child.execution.endedAt = Date.now();
  const wake = f.wake(); wake.onAccepted({ runId: "actual-resume" });
  const queued = [];
  const actual = { sessionKey: f.params.sessionKey, sessionId: f.params.sessionId };
  const c = actualControl(f, new Map([["actual-resume", actual]]), async (sessionId, text) => {
    queued.push({ sessionId, text }); return { queued: true, sessionId };
  });
  const entry = () => ({ agentId: "makaron", sessionKey: f.params.sessionKey, sessionId: f.params.sessionId,
    ownerConnId: "conn", controller: new AbortController(), lifecycleGeneration: 1, kind: "chat-send" });
  const registrations = new Map([["parent-a", entry()], ["actual-resume", entry()]]);
  const selector = execute(c.patched, "function resolveOwnedActiveTalkRunTarget", "//#endregion", {
    normalizeOptionalString: (text) => text?.trim(), isAgentEventLifecycleGenerationCurrent: () => true,
  });
  const stale = selector({ clientConnId: "conn", sessionTarget: { agentId: "makaron", sessionKey: f.params.sessionKey, canonicalKey: f.params.sessionKey }, context: { chatAbortControllers: registrations } });
  assert.equal(stale.runId, "parent-a", "reproduces actual Map's stale original registration before its live resume");
  const before = await c.control({ sessionKey: f.params.sessionKey, runTarget: stale, text: "Correct date", mode: "steer" }, {
    resolveActiveEmbeddedRunOwnerByRunId: (id) => id === "actual-resume" ? actual : undefined,
  });
  assert.equal(before.reason, "no_active_run"); assert.equal(queued.length, 0);
  assert.equal((await c.run()).queued, true);
  const status = await c.run({ mode: "status" }); assert.equal(status.active, true); assert.equal(status.sessionId, f.params.sessionId);
  assert.equal((await c.run({ mode: "followup", text: "After that, compare both dates" })).queued, true);
  assert.equal(queued.length, 2); assert(queued.every((input) => input.sessionId === f.params.sessionId));
  assert.match(queued[1].text, /Spoken follow-up/); assert.match(queued[1].text, /compare both dates/);
  assert.equal(f.cancellations.length, 0); wake.finish({ meta: {}, payloads: [{ text: "Corrected final." }] });
  assert.equal((await f.owner.wait()).text, "Corrected final.");
});

test("yield-gap conditions stay on the exact owner and enter the actual captured resume prompt, not any child or new task", async () => {
  const f = setupTwoHarnessChildren(); const queued = [];
  const active = new Map([['child-a', { sessionKey: 'child-session-a', sessionId: 'child-canonical-a' }],
    ['child-b', { sessionKey: 'child-session-b', sessionId: 'child-canonical-b' }]]);
  const c = actualControl(f, active, async (...args) => { queued.push(args); return { queued: true }; });
  const retained = await c.run({ text: "Change the outbound date to October 8" });
  assert.equal(retained.ok, true); assert.equal(retained.queued, true); assert.equal(retained.applied, false);
  assert.equal(retained.target, "owned_continuation_checkpoint"); assert.equal(queued.length, 0);
  await c.run({ mode: "followup", text: "Then compare the return prices" });
  const voice = f.complete("child-a"); f.complete("child-b");
  let dispatched = 0;
  const run = execute(patches.patchGptLiveContinuationDelivery(deliverySource), "async function runAnnounceAgentCall", "async function sendSubagentAnnounceDirectly", {
    shouldPreserveUserFacingSessionStateForInputProvenance: () => false, getGatewayAgentResult: (response) => response.result,
    dispatchSubagentAnnounceAgent: async (args, options) => {
      dispatched++;
      assert.equal(args.sessionKey, f.params.sessionKey); assert.match(args.message, /^Original safe child completion text\n\n/);
      assert.match(args.message, /not child results/); assert.match(args.message, /October 8/); assert.match(args.message, /return prices/);
      assert(args.message.indexOf('October 8') < args.message.indexOf('return prices'));
      options.onAccepted({ runId: "real-resumed-parent" }); options.onExecutionStarted();
      return { result: { meta: {}, payloads: [{ text: "Corrected dates and prices." }] } };
    },
  });
  await run({ voiceContinuation: voice, agentParams: { sessionKey: f.params.sessionKey, message: "Original safe child completion text" },
    getRequesterSessionId: () => f.params.sessionId, isExecutionAllowed: () => true, expectFinal: true, timeoutMs: 1000 });
  assert.equal(dispatched, 1); assert.equal(queued.length, 0); assert.equal((await f.owner.wait()).text, "Corrected dates and prices.");
  assert.deepEqual(f.resumeExecutions, [{ runId: 'real-resumed-parent', steeringConsumed: { sequence: 2, count: 2,
    textSha256: createHash('sha256').update(JSON.stringify(['Change the outbound date to October 8', 'Then compare the return prices'])).digest('hex') } }]);
});

test("accepted-to-started input snapshots consume only injected conditions and cannot silently settle a later correction", async () => {
  const f = setup(); const child = f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const c = actualControl(f); await c.run({ text: "Use October 7" });
  const voice = f.wake(); const agentParams = voice.prepareResumeInput({ sessionKey: f.params.sessionKey, message: "Child terminal facts." });
  assert.match(agentParams.message, /October 7/); voice.onAccepted({ runId: "real-resume" });
  await c.run({ text: "Correction: use October 8" }); voice.onExecutionStarted();
  assert.deepEqual(f.resumeExecutions, [{ runId: 'real-resume', steeringConsumed: { sequence: 1, count: 1,
    textSha256: createHash('sha256').update(JSON.stringify(['Use October 7'])).digest('hex') } }]);
  voice.onExecutionStarted(); assert.equal(f.resumeExecutions.length, 1, 'reentrant callback cannot report a second consumption');
  const pending = assert.rejects(f.owner.wait(), /pending user conditions/);
  voice.finish({ meta: {}, payloads: [{ text: "Old October 7 result must not pass." }] }); await pending;
  assert.equal(f.cancellations.length, 0);
});

test("resume retries preserve their input snapshot and cannot reuse another token's accepted run as consumption proof", async () => {
  const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const c = actualControl(f); const previous = f.wake(); previous.onAccepted({ runId: 'real-resume' });
  await c.run({ text: 'First retained condition' });
  const voice = f.wake(); const original = { sessionKey: f.params.sessionKey, message: 'Original child terminal facts' };
  const prepared = voice.prepareResumeInput(original);
  await c.run({ text: 'Later condition remains separate' });
  assert.equal(voice.prepareResumeInput(original), prepared);
  assert(!prepared.message.includes('Later condition'));
  assert.throws(() => voice.prepareResumeInput({ ...original, message: 'Changed child facts' }), /changed after checkpoint snapshot/);
  assert.throws(() => voice.onExecutionStarted(), /without its accepted run/);
  voice.onAccepted({ runId: 'real-resume' }); voice.onExecutionStarted();
  const pending = assert.rejects(f.owner.wait(), /pending user conditions/);
  voice.finish({ meta: {}, payloads: [{ text: 'Must not erase later condition.' }] }); await pending;
});

test("captured execution authorization rejects before pending condition consumption and a legitimate retry preserves it", async () => {
  const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  await actualControl(f).run({ text: 'Condition must survive refused execution' }); const voice = f.wake();
  let allowed = false; let starts = 0;
  const run = execute(patches.patchGptLiveContinuationDelivery(deliverySource), 'async function runAnnounceAgentCall', 'async function sendSubagentAnnounceDirectly', {
    SourceOwnerChangedError: class extends Error {}, shouldPreserveUserFacingSessionStateForInputProvenance: () => false,
    getGatewayAgentResult: (response) => response.result,
    dispatchSubagentAnnounceAgent: async (args, options) => {
      assert.match(args.message, /Condition must survive/); options.onAccepted({ runId: 'real-resume' }); options.onExecutionStarted(); starts++;
      return { result: { meta: {}, payloads: [{ text: 'Condition preserved in legitimate resumed input.' }] } };
    },
  });
  const params = { voiceContinuation: voice, agentParams: { sessionKey: f.params.sessionKey, message: 'Original child facts' },
    getRequesterSessionId: () => f.params.sessionId, isExecutionAllowed: () => allowed, timeoutMs: 1000 };
  await assert.rejects(run(params)); assert.equal(starts, 0); assert.equal(f.resumeExecutions.length, 0);
  allowed = true; await run(params);
  assert.equal(starts, 1); assert.equal((await f.owner.wait()).text, 'Condition preserved in legitimate resumed input.');
  assert.equal(f.resumeExecutions.length, 1); assert.equal(f.resumeExecutions[0].steeringConsumed.count, 1);
});

test("captured Talk forwards the actual consumed-resume callback without re-registering its accepted run", async () => {
  const f = setup(); const c = actualControl(f); const events = []; const registered = [];
  const steeringConsumed = { sequence: 2, count: 2,
    textSha256: createHash('sha256').update(JSON.stringify(['First user condition', 'Later user correction'])).digest('hex') };
  const context = { onRunStarted: (event) => events.push(event) };
  const createRunner = execute(c.patched, 'function createTalkClientAgentConsultRunner', 'function createTalkClientGatewayControlOwner', {
    parseRealtimeVoiceAgentConsultArgs: (args) => args,
    createTalkClientAgentRuntime: () => ({}), normalizeTalkSection: () => ({}),
    tryBeginGatewayRootWorkAdmission: () => undefined,
    runOutsideGatewayRootWorkAdmission: () => ({ run: (callback) => callback(), release: () => {} }),
    consultRealtimeVoiceAgent: async (params) => {
      assert.equal(params.continuationContext, context);
      params.onResumeRunStarted({ runId: 'accepted-resume', sessionId: f.params.sessionId, timeoutMs: 60000 });
      assert.deepEqual(events, [{ runId: 'accepted-resume' }]);
      params.onResumeExecutionStarted({ runId: 'accepted-resume', steeringConsumed });
      assert.deepEqual(events.at(-1), { runId: 'accepted-resume', steeringConsumed });
      return { text: 'Actual request result' };
    },
  });
  const runner = createRunner({ authority: {}, config: { talk: {} }, sessionTarget: { agentId: 'makaron', sessionKey: f.params.sessionKey,
    canonicalKey: f.params.sessionKey, storePath: '/private/store' }, getVoiceSessionId: () => 'voice', registerRun: (run) => registered.push(run),
    context: { logGateway: {} } });
  assert.deepEqual(await runner.runPrompt({ prompt: 'Original task', signal: new AbortController().signal, continuationContext: context }),
    { text: 'Actual request result' });
  assert.deepEqual(registered, [{ runId: 'accepted-resume' }]);
  assert.equal(events.length, 2); assert(!JSON.stringify(events).includes('First user condition'));
  assert.match(patches.createGptLiveContinuationRuntimeSource(), /import \{ createHash \} from "node:crypto";/);
});

test("actual Talk RPC sends noncancel controls through the trusted continuation before stale registration selection", async () => {
  const f = setup(); const child = f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  child.execution.status = 'terminal'; child.execution.endedAt = Date.now(); const voice = f.wake(); voice.onAccepted({ runId: 'active-resume' });
  const queue = [];
  const c = actualControl(f, new Map([['active-resume', { sessionKey: f.params.sessionKey, sessionId: f.params.sessionId }]]), async (sessionId, text) => {
    queue.push({ sessionId, text }); return { queued: true, sessionId };
  });
  const start = c.patched.indexOf('\t"talk.client.steer": async'); const end = c.patched.indexOf('\n\t}\n};', start);
  const body = c.patched.slice(start, end + 3).replace('"talk.client.steer": async', 'async');
  let legacy = 0; const replies = [];
  const handler = new Function('deps', `with(deps) { return (${body.trim()}); }`)({
    assertValidParams: () => true, validateTalkClientSteerParams: {}, prepareTalkSessionTarget: () => c.params?.sessionTarget ?? { canonicalKey: f.params.sessionKey, agentId: 'makaron' },
    cancelOwnedGptLiveVoiceConsult: async () => undefined,
    controlOwnedGptLiveVoiceConsult: (params) => c.run({ ...params }),
    resolveOwnedActiveTalkRunTarget: () => { legacy++; throw new Error('Must not select stale original'); },
  });
  await handler({ params: { sessionKey: f.params.sessionKey, mode: 'steer', text: 'Actually use October 8' }, client: { connId: 'conn' },
    context: { getRuntimeConfig: () => ({}) }, respond: (...args) => replies.push(args) });
  assert.equal(legacy, 0); assert.equal(queue.length, 1); assert.equal(replies[0][0], true); assert.equal(replies[0][1].queued, true);
  assert.equal(queue[0].text, 'Actually use October 8');
  voice.finish({ meta: {}, payloads: [{ text: 'Corrected final.' }] }); await f.owner.wait();
});

test("unstarted resume, rejected active steering, replaced owner and unowned neighbors do not consume or receive conditions", async () => {
  {
    const f = setup(); const c = actualControl(f, new Map([['parent-a', { sessionKey: f.params.sessionKey, sessionId: f.params.sessionId }]]),
      async (sessionId) => ({ queued: false, sessionId, reason: "not_streaming" }));
    const result = await c.run(); assert.equal(result.ok, false); assert.equal(result.queued, false); assert.equal(result.reason, "not_streaming");
    f.owner.finishInitial({ meta: {}, payloads: [{ text: "Unchanged goal." }] }); await f.owner.wait();
  }
  {
    const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
    let writes = 0; const c = actualControl(f, new Map([['unowned-neighbor', { sessionKey: f.params.sessionKey, sessionId: f.params.sessionId }]]), async () => { writes++; });
    assert.equal(await c.run({ ownerConnId: "other-connection" }), undefined);
    const retained = await c.run({ text: "Keep this exact owner's constraint" }); assert.equal(retained.applied, false); assert.equal(writes, 0);
    const voice = f.wake(); const args = voice.prepareResumeInput({ sessionKey: f.params.sessionKey, message: "Original terminal facts." });
    assert.match(args.message, /exact owner's constraint/); voice.onAccepted({ runId: "accepted-but-not-started" });
    const pending = assert.rejects(f.owner.wait(), /pending user conditions/);
    voice.finish({ meta: {}, payloads: [{ text: "Never injected." }] }); await pending;
  }
  {
    const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
    await actualControl(f).run({ text: "Old owner condition" }); const voice = f.wake(); f.replaceOwner();
    assert.throws(() => voice.prepareResumeInput({ sessionKey: f.params.sessionKey, message: "Child facts" }), /no longer current/);
    await assert.rejects(f.owner.wait());
  }
});

test("pending conditions are bounded, rejected overflow leaves accepted conditions intact, and cancellation clears the exact owner", async () => {
  const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const c = actualControl(f);
  for (let i = 0; i < 8; i++) assert.equal((await c.run({ text: `Condition ${i}` })).queued, true);
  const overflow = await c.run({ text: "Overflow must be rejected" }); assert.equal(overflow.ok, false); assert.equal(overflow.reason, "pending_input_limit");
  const voice = f.wake(); const args = voice.prepareResumeInput({ sessionKey: f.params.sessionKey, message: "Child result." });
  for (let i = 0; i < 8; i++) assert(args.message.includes(`Condition ${i}`)); assert(!args.message.includes("Overflow must be rejected"));
  const pending = assert.rejects(f.owner.wait(), { name: "AbortError" }); f.caller.abort(new Error("Cancel accepted conditions")); await pending;
  assert.throws(() => voice.onAccepted({ runId: "late-resume" }), /no longer current/);
  assert.equal(await c.run(), undefined); assert.equal(f.cancellations.length, 1);
});

test("pending condition byte limit, child identity and failed prepare retain exact owner isolation", async () => {
  {
    const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
    const c = actualControl(f); const original = '限'.repeat(2500);
    assert.equal((await c.run({ text: original })).queued, true);
    assert.equal((await c.run({ text: '限'.repeat(200) })).reason, 'pending_input_limit');
    const voice = f.wake();
    assert.throws(() => voice.prepareResumeInput({ sessionKey: 'neighbor-session', message: 'Wrong source' }), /does not own/);
    assert.throws(() => voice.prepareResumeInput({ sessionKey: f.params.sessionKey }), /no requester message/);
    const valid = voice.prepareResumeInput({ sessionKey: f.params.sessionKey, message: 'Actual child facts' });
    assert(valid.message.includes(original)); voice.onAccepted({ runId: 'valid-resume' }); voice.onExecutionStarted();
    voice.finish({ meta: {}, payloads: [{ text: 'Completed the retained exact condition.' }] }); await f.owner.wait();
  }
  {
    const f = setupTwoHarnessChildren(); await actualControl(f).run({ text: 'Belongs to original children' });
    const voice = f.complete('child-a'); f.sessions.set('child-session-b', 'replaced-child');
    assert.throws(() => voice.prepareResumeInput({ sessionKey: f.params.sessionKey, message: 'Old child findings' }), /accepted child identity changed/);
    await assert.rejects(f.owner.wait());
  }
});

test("nested child continuation preserves its own requester input and never consumes whole-task parent conditions", async () => {
  const f = setup(); const child = f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  await actualControl(f).run({ text: 'Whole-task user correction belongs only to original parent' });
  const grandchild = { runId: 'grandchild', taskRunId: 'grandchild', childSessionKey: 'grandchild-session', requesterSessionKey: child.childSessionKey,
    requesterAgentId: 'makaron', requesterTurnRunId: child.runId, requesterTurnYielded: true, generation: 1,
    execution: { lifecycleGeneration: 1, status: 'running' } };
  f.runs.set(grandchild.runId, grandchild); f.registry.attachAcceptedChild({ entry: grandchild, getCurrentEntry: (id) => f.runs.get(id) });
  f.registry.bindYieldBatch({ requesterSessionKey: child.childSessionKey, requesterAgentId: 'makaron', requesterTurnRunId: child.runId,
    batchRunIds: [grandchild.runId], rearmGeneration: 1, requesterYielded: true });
  grandchild.execution = { ...grandchild.execution, status: 'terminal', endedAt: Date.now() };
  const nested = f.registry.resolveWake({ requesterSessionKey: child.childSessionKey, requesterAgentId: 'makaron',
    batchRunIds: [grandchild.runId], rearmGeneration: 1 });
  assert.throws(() => nested.prepareResumeInput({ sessionKey: f.params.sessionKey, message: 'Cannot cross requester identity' }), /does not own its batch/);
  const original = { sessionKey: child.childSessionKey, message: 'Safe original grandchild result' };
  assert.equal(nested.prepareResumeInput(original), original);
  nested.onAccepted({ runId: 'resumed-child' }); nested.onExecutionStarted();
  assert.equal(f.resumeExecutions.length, 0);
  nested.finish({ meta: {}, payloads: [{ text: 'Child subtask completion' }] });
  const parent = f.wake(); const resumed = parent.prepareResumeInput({ sessionKey: f.params.sessionKey, message: 'Safe completed child facts' });
  assert.match(resumed.message, /Whole-task user correction/);
  parent.onAccepted({ runId: 'real-resumed-parent' }); parent.onExecutionStarted();
  assert.equal(f.resumeExecutions.length, 1); assert.equal(f.resumeExecutions[0].runId, 'real-resumed-parent');
  parent.finish({ meta: {}, payloads: [{ text: 'Original parent applied complete task correction' }] });
  assert.equal((await f.owner.wait()).text, 'Original parent applied complete task correction');
});

test("trusted control uses the actual registration signal fallback and fails closed for two current parents", async () => {
  {
    const f = setup(); const registration = new AbortController();
    f.owner.attachRun({ runId: 'registered-reply-parent', sessionKey: f.params.sessionKey, sessionId: f.params.sessionId,
      role: 'parent', registration: { abortSignal: registration.signal } });
    const actual = { sessionKey: f.params.sessionKey, sessionId: f.params.sessionId };
    const writes = [];
    const c = actualControl(f); const runtime = {
      resolveActiveEmbeddedRunOwnerByRunId: () => undefined,
      resolveActiveReplyRunOwnerForSignal: (signal) => signal === registration.signal ? actual : undefined,
      getDiagnosticSessionActivitySnapshot: () => undefined,
      queueEmbeddedAgentMessageWithOutcomeAsync: async (sessionId, text) => { writes.push({ sessionId, text }); return { queued: true, sessionId }; },
    };
    assert.equal((await c.run({ controlRuntime: runtime })).queued, true); assert.equal(writes.length, 1);
    const pending = assert.rejects(f.owner.wait()); f.owner.abort(new Error('Cleanup')); await pending;
  }
  {
    const f = setup(); f.owner.attachRun({ runId: 'second-parent', sessionKey: f.params.sessionKey, sessionId: f.params.sessionId, role: 'parent' });
    let writes = 0;
    const actual = { sessionKey: f.params.sessionKey, sessionId: f.params.sessionId };
    const c = actualControl(f, new Map([['parent-a', actual], ['second-parent', actual]]), async () => { writes++; });
    await assert.rejects(c.run(), /active parent is ambiguous/); assert.equal(writes, 0);
    const pending = assert.rejects(f.owner.wait()); f.owner.abort(new Error('Cleanup')); await pending;
  }
});

test("completed child plus pending parent wake can cancel its wait without a fabricated active backend abort", async () => {
  const f = setup(); const child = f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  child.execution.status = "terminal"; child.execution.endedAt = Date.now();
  const pending = assert.rejects(f.owner.wait(), { name: "AbortError" });
  const result = await actualCancel(f).run(); assert.equal(result.ok, true); await pending;
  assert.equal(f.cancellations.length, 1); assert.throws(() => f.wake(), /already settled|cancelled/);
});

test("rejected and unresolved exact aborts stay failed and do not revoke a valid Native delegation", async () => {
  for (const active of [new Map(), new Map([["parent-a", { sessionKey: "agent:makaron:voice", sessionId: "canonical-a", abort: () => false }]])]) {
    const f = setup(); const result = await actualCancel(f, active).run();
    assert.equal(result.ok, false); assert.equal(result.aborted, false); assert.equal(result.reason, "owned_cancel_incomplete");
    assert.equal(f.cancellations.length, 0); assert.equal(f.owner.isCurrent(), true);
    f.owner.finishInitial({ meta: {}, payloads: [{ text: "仍可正常完成。" }] }); assert.equal((await f.owner.wait()).text, "仍可正常完成。");
  }
});

test("trusted aborted results and owned signals notify once; ordinary cancellation-looking errors do not", async () => {
  for (const source of ["aborted_result", "owned_run_signal", "owner_signal"]) {
    const f = setup(); const pending = assert.rejects(f.owner.wait(), { name: "AbortError" });
    if (source === "aborted_result") f.owner.finishInitial({ meta: { aborted: true }, payloads: [] });
    else if (source === "owner_signal") f.caller.abort(new Error("actual owned signal"));
    else {
      const owned = new AbortController(); f.owner.attachRun({ runId: "owned-resume", sessionKey: f.params.sessionKey,
        sessionId: f.params.sessionId, role: "resumed", registration: { abortSignal: owned.signal } }); owned.abort();
    }
    await pending; assert.equal(f.cancellations.length, 1); assert.equal(f.cancellations[0].source, source);
  }
  for (const failure of [new Error("worker request was cancelled"), { meta: { error: "cancelled" }, payloads: [] }]) {
    const f = setup(); if (failure instanceof Error) f.owner.abort(failure); else f.owner.finishInitial(failure);
    await assert.rejects(f.owner.wait()); assert.equal(f.cancellations.length, 0);
  }
});

test("causal cancel rejects wrong connection, unowned run, ambiguous voice and replaced generation", async () => {
  const f = setup(); const cancel = actualCancel(f);
  assert.equal(await cancel.run({ ownerConnId: "other-client" }), undefined);
  assert.equal(f.registry.resolveOwnedControl({ ownerConnId: "conn", sessionKey: f.params.sessionKey, runId: "unrelated-run" }), undefined);
  assert.equal(await cancel.run({ mode: "steer" }), undefined);
  const second = f.registry.createOwner({ ...f.params, runId: "other-parent", continuationContext: { ...f.params.continuationContext, voiceSessionId: "other-voice" } });
  await assert.rejects(cancel.run(), /ambiguous/);
  second.abort(new Error("test cleanup")); await assert.rejects(second.wait());
  const nextParams = { ...f.params, runId: "new-parent", continuationContext: { ...f.params.continuationContext,
    identity: { delegationItemId: "new-delegate", delegationGeneration: 2 } } };
  assert.throws(() => f.registry.createOwner(nextParams), /still active; queue/);
  assert.equal(f.owner.isCurrent(), true); assert.equal(f.cancellations.length, 0);
  f.owner.finishInitial({ meta: {}, payloads: [{ text: "Original task survived the overlapping speech turn." }] });
  assert.equal((await f.owner.wait()).text, "Original task survived the overlapping speech turn.");
  const newer = f.registry.createOwner(nextParams);
  await assert.rejects(f.owner.cancelOwnedRuns(() => { throw new Error("must not run"); }), /no longer current/);
  newer.abort(new Error("test cleanup")); await assert.rejects(newer.wait());
});

test("cancelled Native callback recursion is exactly once and a still-running accepted child cannot be silently ignored", async () => {
  const f = setup(); f.params.continuationContext.onCanceled = (event) => { f.cancellations.push(event); f.caller.abort(); };
  const pending = assert.rejects(f.owner.wait(), { name: "AbortError" });
  assert.equal(f.owner.cancel(new Error("explicit"), "explicit_control"), true); await pending;
  assert.equal(f.cancellations.length, 1);
  const childCase = setup(); childCase.attach(); childCase.settleTurn(); childCase.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const result = await actualCancel(childCase).run(); assert.equal(result.ok, false); assert.equal(result.reason, "owned_cancel_incomplete");
  assert.equal(childCase.cancellations.length, 0);
  childCase.owner.abort(new Error("test cleanup")); await assert.rejects(childCase.owner.wait());
});

test("actual SDK late completion from a cancelled known voice scope cannot fall through to ordinary announcement", async () => {
  const f = setup(); const scope = {}; const childSessionKey = "agent:makaron:child"; const childSessionId = "canonical-child";
  f.registry.bindHarnessSpawns({ scope, requesterSessionKey: f.params.sessionKey, requesterSessionId: f.params.sessionId,
    requesterTurnRunId: "parent-a", requesterYielded: true,
    acceptedSessionSpawns: [{ runId: "child-a", childSessionKey }], getChildSessionId: () => childSessionId });
  f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const pending = assert.rejects(f.owner.wait(), { name: "AbortError" }); f.caller.abort(); await pending;
  let ordinaryAnnouncements = 0;
  const patched = patches.patchGptLiveContinuationTaskSdk(sdkSource);
  const deliver = execute(patched, "async function deliverAgentHarnessTaskCompletion", "function mapHarnessCompletionStatus", {
    assertAgentHarnessTaskRuntimeScope: (value) => value, loadRequesterSessionEntry: () => ({ entry: { sessionId: f.params.sessionId } }),
    resolveGptLiveHarnessVoiceCompletion: f.registry.resolveHarnessCompletion,
    deliverSubagentAnnouncement: () => { ordinaryAnnouncements++; },
  });
  await assert.rejects(deliver({ scope, requesterTurnRunId: "parent-a", childRunId: "child-a", childSessionKey, childSessionId,
    status: "aborted", result: "cancelled child" }), /already settled|cancelled/);
  assert.equal(ordinaryAnnouncements, 0);
  assert.equal(f.registry.resolveHarnessCompletion({ scope: {}, requesterSessionKey: "ordinary-session" }), undefined,
    "unbound nonvoice scopes retain the original SDK path");
});

test("captured byte checks, strict patch drift checks and idempotent transforms cover all continuation runtime files", () => {
  assert.equal(createHash("sha256").update(controlSource).digest("hex"), "03402763a265f7671f8dc932f1c148421ebe7a9a0c19c51cf23239a2628b993b");
  const baseline = JSON.parse(readFileSync(new URL("./gpt-live-consult-continuation-baseline.json", import.meta.url), "utf8"));
  for (const file of baseline.files) {
    const original = readFileSync(new URL(`../${file.source}`, import.meta.url), "utf8");
    assert.equal(createHash("sha256").update(original).digest("hex"), file.capturedSha256);
    const name = file.patch[0].toUpperCase() + file.patch.slice(1); const apply = patches[`patchGptLiveContinuation${name}`];
    const patched = apply(original); assert.equal(apply(patched), patched); assert.throws(() => apply("drifted source"), /anchor drifted/);
  }
  const root = new URL("../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/", import.meta.url);
  for (const [name, applyProgress] of [["Harness", patchGptLiveConsultProgressHarness], ["Talk", patchGptLiveConsultProgressTalk]]) {
    const source = readFileSync(new URL(name === "Harness" ? "realtime-session-harness-CEO5kVAJ.js" : "talk-DkFuKRod.js", root), "utf8");
    const apply = patches[`patchGptLiveContinuation${name}`]; const patched = apply(applyProgress(source)); assert.equal(apply(patched), patched);
  }
});


test("canonical final carries the actual accepted terminal parent run, never supplied result metadata", async () => {
  const initial = setup();
  initial.owner.finishInitial({ meta: { runId: "forged-run" }, payloads: [{ text: "Verified original final." }] });
  assert.deepEqual(await initial.owner.wait(), { text: "Verified original final.", provenance: {
    runId: "parent-a", ownerRunId: "parent-a", source: "canonical_final", role: "initial" } });
  const resumed = setup(); resumed.attach(); resumed.settleTurn();
  resumed.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const token = resumed.wake(); token.onAccepted({ runId: "actual-accepted-resume" });
  token.finish({ meta: { runId: "different-result-label" }, payloads: [{ text: "Verified continued final." }] });
  assert.deepEqual(await resumed.owner.wait(), { text: "Verified continued final.", provenance: {
    runId: "actual-accepted-resume", ownerRunId: "parent-a", source: "canonical_final", role: "parent" } });
});

test("unclassified or final parent text cannot trigger early progress but canonical completion remains available", async () => {
  const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const token = f.wake(); token.onAccepted({ runId: "accepted-parent" });
  for (const phase of [undefined, "final", "final_answer"]) {
    f.emit("accepted-parent", "全部完成。", { stream: "assistant", data: { text: "全部完成。", phase } });
  }
  assert.equal(f.progress.length, 0);
  f.emit("child-a", "四位码已核验为 5731。");
  assert.equal(f.progress.length, 1); assert.equal(f.progress[0].provenance.runId, "child-a");
  token.finish({ meta: {}, payloads: [{ text: "All requested facts verified; final complete." }] });
  assert.equal((await f.owner.wait()).text, "All requested facts verified; final complete.");
});


test("a nonyield parent cannot label ongoing accepted child work as a complete final or cancel that child", async () => {
  const f = setup(); const child = f.attach();
  const failure = assert.rejects(f.owner.wait(), /accepted child tasks completed/);
  f.owner.finishInitial({ meta: {}, payloads: [{ text: "Child accepted; still running." }] }); await failure;
  assert.equal(child.execution.status, "running"); assert.equal(child.killIntent, undefined);
  assert.equal(f.cancellations.length, 0); assert.equal(f.owner.isCurrent(), false);
  assert.equal(f.listeners.size, 0);
});
