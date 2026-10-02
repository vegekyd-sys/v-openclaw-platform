import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createGptLiveConsultContinuationRegistry } from "./gpt-live-consult-continuation.mjs";
import { createGptLiveConsultProgressObserver, patchGptLiveConsultProgressHarness, patchGptLiveConsultProgressTalk } from "./gpt-live-consult-progress.mjs";
import * as patches from "./patch-gpt-live-consult-continuation.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const fixtureRoot = new URL("./fixtures/gpt-live-continuation/", import.meta.url);
const registrySource = readFileSync(new URL("subagent-registry-C24yr_PF.js", fixtureRoot), "utf8");
const wakeSource = readFileSync(new URL("subagent-announce.requester-settle-wake-B2NSziIo.js", fixtureRoot), "utf8");
const deliverySource = readFileSync(new URL("subagent-announce-delivery-Dosep7Zr.js", fixtureRoot), "utf8");
const sdkSource = readFileSync(new URL("plugin-sdk/agent-harness-task-runtime.js", fixtureRoot), "utf8");
const execute = (source, start, end, deps) => {
  const from = source.indexOf(start); const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `captured ${start} boundary drifted`);
  const name = start.match(/function ([\w$]+)/)[1];
  return new Function("deps", `with (deps) { ${source.slice(from, to)}; return ${name}; }`)(deps);
};

function setup({ generation = 1, delegationGeneration = 1 } = {}) {
  const listeners = new Map(); const progress = []; const runs = new Map(); const cleanups = [];
  const caller = new AbortController(); let current = true; let liveGeneration = generation; let rotate;
  const registry = createGptLiveConsultContinuationRegistry({
    subscribeRun: (runId, callback) => { listeners.set(runId, callback); return () => listeners.delete(runId); },
    createProgressObserver: createGptLiveConsultProgressObserver,
    getLifecycleGeneration: () => liveGeneration,
    isLifecycleCurrent: (value) => value === liveGeneration,
    onLifecycleRotation: (callback) => { rotate = callback; },
  });
  const context = { identity: { delegationItemId: "delegate-a", delegationGeneration }, ownerConnId: "conn", voiceSessionId: "voice",
    ownerGeneration: "transport-generation", isCurrent: () => current };
  const params = { continuationContext: context, runId: "parent-a", sessionId: "canonical-a", sessionKey: "agent:makaron:voice", agentId: "makaron",
    abortSignal: caller.signal, timeoutMs: 60000, onProgress: (value) => progress.push(value),
    collectVisibleText: (payloads) => payloads.filter((item) => !item.isReasoning && !item.isCommentary && !item.isError).map((item) => item.text ?? "").join("\n\n"),
    runRegistration: { cleanup: () => cleanups.push("initial") },
    onResumeRunStarted: ({ runId }) => ({ cleanup: () => cleanups.push(runId) }) };
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
  const emit = (runId, text, extra = {}) => listeners.get(runId)?.({ runId, lifecycleGeneration: generation, stream: "assistant", data: { text }, ...extra });
  const wake = (entry = runs.get("child-a")) => registry.resolveWake({ requesterSessionKey: params.sessionKey, requesterAgentId: "makaron",
    batchRunIds: entry.requesterSettleWake.batchRunIds, rearmGeneration: entry.requesterSettleWake.rearmGeneration });
  return { registry, owner, params, caller, progress, runs, attach, settleTurn, emit, wake, listeners, cleanups,
    replaceOwner: () => { current = false; }, rotate: () => { liveGeneration++; rotate(); } };
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
  assert.deepEqual(await pending, { text: "7264 / 2026-10-02 / 20:10:59 / UTC+08:00" });
  assert.equal(f.listeners.size, 0); assert.deepEqual(f.cleanups.sort(), ["initial", "parent-resumed-a"]);
});

test("next parent yield binds another accepted batch and does not treat its acknowledgment as final", async () => {
  const f = setup(); f.attach(); f.settleTurn(); f.owner.finishInitial({ meta: { yielded: true }, payloads: [] });
  const first = f.wake(); first.onAccepted({ runId: "resume-a" });
  const secondChild = f.attach("child-b", "resume-a"); f.settleTurn("resume-a", [secondChild]);
  first.finish({ meta: { yielded: true, yieldAcknowledgment: "还在验证第二阶段。" }, payloads: [{ text: "第二阶段已交办" }] });
  let done = false; f.owner.wait().then(() => { done = true; }); await tick(); assert.equal(done, false);
  const next = f.wake(secondChild); next.onAccepted({ runId: "resume-b" }); next.finish({ meta: {}, payloads: [{ text: "两个阶段已全部验证。" }] });
  assert.deepEqual(await f.owner.wait(), { text: "两个阶段已全部验证。" });
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
  assert.deepEqual(await f.owner.wait(), { text: "4928 / 2026 / 10 / 2 / 20 / 43 / 43" });
  assert.equal(f.progress.some((value) => value.text.includes("PRIVATE")), false);
});

test("actual patched harness releases turn admission after yield while keeping voice promise and caller cancellation alive", async () => {
  for (const cancel of [false, true]) {
    const caller = new AbortController(); const scope = {}; const context = { identity: { delegationItemId: "d", delegationGeneration: 1 },
      ownerConnId: "conn", voiceSessionId: "voice", ownerGeneration: "transport", isCurrent: () => true };
    const observations = { release: 0, cleanup: 0 }; let rootRunId; const registry = createGptLiveConsultContinuationRegistry({
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
          registry.bindHarnessSpawns({ scope, requesterSessionKey: params.sessionKey, requesterSessionId: params.sessionId, requesterTurnRunId: params.runId,
            requesterYielded: true, acceptedSessionSpawns: [{ runId: "child", childSessionKey: "agent:makaron:child" }], getChildSessionId: () => "child-session" });
          return { payloads: [{ text: "已交办" }], meta: { yielded: true } };
        } },
    });
    await tick(); assert.equal(observations.release, 1); assert.equal(observations.cleanup, 0);
    const token = registry.resolveHarnessCompletion({ scope, requesterSessionKey: "agent:makaron:voice", requesterSessionId: "canonical",
      requesterTurnRunId: rootRunId, childRunId: "child", childSessionKey: "agent:makaron:child", childSessionId: "child-session" });
    if (cancel) {
      caller.abort(new Error("close after yielded admission released"));
      await assert.rejects(pending, /close after yielded admission released/); assert.equal(token.signal.aborted, true);
    } else {
      token.onAccepted({ runId: "resumed" }); token.finish({ meta: {}, payloads: [{ text: "真正最终结果。" }] });
      assert.deepEqual(await pending, { text: "真正最终结果。" });
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
  assert.equal(f.progress.length, 0); assert.equal(f.wake(), undefined);
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
  assert.deepEqual(await f.owner.wait(), { text: "唯一结果。" });
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
  observer.onPartialReply({ text: "等待的事实尚未完整", itemId: "public-item", emittedAt: 1, secret: "private" });
  assert.equal(emitted.length, 0);
  observer.onPartialReply({ text: "等待的事实尚未完整。第二句还没", itemId: "public-item", emittedAt: 1, secret: "private" });
  observer.onPartialReply({ text: "等待的事实尚未完整。第二句还没结束。", itemId: "public-item" });
  const after = Date.now();
  assert.deepEqual(emitted.map((value) => value.provenance.sequence), [1, 2]);
  for (const { provenance } of emitted) {
    assert(provenance.emittedAt >= before && provenance.emittedAt <= after);
    assert.equal(provenance.runId, "real-parent-run"); assert.equal(provenance.itemId, "public-item");
    assert.deepEqual(Object.keys(provenance).sort(), ["emittedAt", "itemId", "runId", "sequence", "source"]);
  }
});

test("captured byte checks, strict patch drift checks and idempotent transforms cover all continuation runtime files", () => {
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
