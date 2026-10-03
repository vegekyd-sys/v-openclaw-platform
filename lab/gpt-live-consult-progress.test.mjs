import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  patchGptLiveConsultProgressHarness,
  patchGptLiveConsultProgressTalk,
} from "./gpt-live-consult-progress.mjs";

const root = new URL("../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/", import.meta.url);
const harnessSource = readFileSync(new URL("realtime-session-harness-CEO5kVAJ.js", root), "utf8");
const talkSource = readFileSync(new URL("talk-DkFuKRod.js", root), "utf8");
const builtinSource = readFileSync(new URL("builtin-openclaw-zQV8Wwjr.js", root), "utf8");
const nativeProjectionSource = readFileSync(new URL("./release-files/background-work-20261002/vlab-codex-parity/run-attempt-D1hJO4fX.js", import.meta.url), "utf8");
const patchedHarness = patchGptLiveConsultProgressHarness(harnessSource);
const patchedTalk = patchGptLiveConsultProgressTalk(talkSource);
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

function executeFunction(source, startAnchor, endAnchor, dependencies) {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start);
  assert(start >= 0 && end > start, `${startAnchor} was not found`);
  const functionSource = source.slice(start, end);
  const name = startAnchor.match(/function (\w+)/)[1];
  return new Function("dependencies", `with (dependencies) { ${functionSource}; return ${name}; }`)(dependencies);
}

const patchedObserver = executeFunction(patchedHarness, "function createGptLiveConsultProgressObserver", "async function consultRealtimeVoiceAgent", {});
const readConsultStringArg = executeFunction(harnessSource, "function readConsultStringArg", "//#endregion", {
  normalizeOptionalString: (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
});
const parseConsultArgs = executeFunction(harnessSource, "function parseRealtimeVoiceAgentConsultArgs", "/** Build the plain chat message", { readConsultStringArg });
const actualConsultPrompt = executeFunction(patchedHarness, "function buildRealtimeVoiceAgentConsultPrompt", "/** Collect only visible answer text", {
  parseRealtimeVoiceAgentConsultArgs: parseConsultArgs,
});

function createNativeProjection(emit) {
  const start = nativeProjectionSource.indexOf("var CodexAssistantProjection = class {");
  const end = nativeProjectionSource.indexOf("\n//#endregion", start);
  assert(start > 0 && end > start, "captured Codex assistant projector is missing");
  const readString = (value, key) => typeof value?.[key] === "string" ? value[key] : undefined;
  const NativeProjection = new Function(
    "readStringField", "readItemString", "shouldClearTerminalPresentationForNativeItem",
    `${nativeProjectionSource.slice(start, end)}; return CodexAssistantProjection;`,
  )(readString, readString, () => false);
  return new NativeProjection({ onAssistantMessageStart() {} }, emit, () => false, () => 0, () => {});
}

function createBuiltinDelivery(emit, state = { assistantTexts: [], assistantMessageIndex: 0, assistantMessageStartIndex: 0 }) {
  const createDelivery = executeFunction(builtinSource, "function createReplyDelivery", "//#endregion", {
    randomUUID: () => "builtin-stream",
    emitAgentEvent: emit,
    runBestEffortCallback: (options) => { options.callback(); options.onSuccess?.(); },
    isStreamAppend: ({ data, finalMessage }) => !finalMessage && !data.replace && !data.mediaUrls?.length && !data.managedMediaUrls?.length,
    mergeStreamAppend: (previous, next) => ({ ...next, delta: previous.delta + next.delta }),
  });
  return createDelivery({ params: { runId: "same-consult" }, state, log: {} });
}

function createHarnessRuntime({ onProgress, runEmbeddedAgent, signal = new AbortController().signal,
  args = { question: "Consult question" }, transcript = [] }) {
  // Replace only dynamic import boundaries. All patched consult and observer logic executes unchanged.
  const source = patchedHarness.replace(
    'const [{ beginSessionWorkAdmission }, { resolveSessionWorkStartError }] = await Promise.all([import("./session-lifecycle-admission-DCnoxd2o.js"), import("./lifecycle-7GS52a1a.js")]);',
    "const importedAdmission = beginSessionWorkAdmission; const importedStartError = resolveSessionWorkStartError;",
  );
  assert.notEqual(source, patchedHarness, "consult import boundary drifted");
  const observations = { cleanup: 0, releases: 0, warnings: [] };
  const dependencies = {
    createGptLiveConsultProgressObserver: patchedObserver,
    beginSessionWorkAdmission: async () => ({ run: (callback) => callback(), release: () => observations.releases++ }),
    resolveSessionWorkStartError: () => undefined,
    resolveSessionAgentId: () => "agent",
    assertRealtimeVoiceAgentConsultModelSelectionUnlocked: () => {},
    resolveRealtimeVoiceAgentDeliveryContext: () => undefined,
    resolveRealtimeVoiceAgentConsultSessionEntry: async () => ({ sessionId: "session" }),
    deliveryContextFromSession: () => undefined,
    resolveRealtimeVoiceAgentSandboxSessionKey: () => "sandbox",
    buildRealtimeVoiceAgentConsultPrompt: actualConsultPrompt,
    collectRealtimeVoiceAgentConsultVisibleText: (payloads) => payloads.map((payload) => payload.text ?? "").join(""),
    randomUUID: () => "uuid",
  };
  const consult = executeFunction(source, "async function consultRealtimeVoiceAgent", "//#endregion", dependencies);
  return {
    observations,
    run: () => consult({
      cfg: {},
      args,
      transcript,
      surface: "a browser Talk session",
      userLabel: "User",
      sessionKey: "voice:test",
      runIdPrefix: "test",
      abortSignal: signal,
      onProgress,
      logger: { warn: (message) => observations.warnings.push(message) },
      onRunStarted: () => ({ cleanup: () => observations.cleanup++ }),
      agentRuntime: {
        resolveAgentDir: () => "/tmp/agent",
        resolveAgentWorkspaceDir: () => "/tmp/workspace",
        ensureAgentWorkspace: async () => {},
        resolveAgentTimeoutMs: () => 1000,
        session: { resolveStorePath: () => "/tmp/store", getSessionEntry: () => undefined },
        runEmbeddedAgent,
      },
    }),
  };
}

test("patch applies to current captured runtime, is idempotent, and rejects partial drift", () => {
  assert.equal(patchGptLiveConsultProgressHarness(patchedHarness), patchedHarness);
  assert.equal(patchGptLiveConsultProgressTalk(patchedTalk), patchedTalk);
  assert.throws(() => patchGptLiveConsultProgressHarness(harnessSource.replace("\t\t\t\tagentDir,", "\t\t\t\tagentDir: changed,")), /anchor drifted/);
  assert.throws(() => patchGptLiveConsultProgressTalk(patchedTalk.replace("runArgs({ question: prompt }, signal, onProgress)", "runArgs({ question: prompt }, signal)")), /partial/);
});

test("captured consult owns both authorized steps; public stage delivery does not settle before the next tool and final", async () => {
  const question = "请比较 2026-10-08 去程与 2026-10-10 回程；两名成人、一名儿童；逐步查完后给含税合计，不预订。";
  const context = "完整目标：去程 + 回程 + 合计。已验证：去程 590 CNY/人。剩余：回程含税实价及全家合计；不能把单程作为整体完成。";
  const events = [];
  let releaseSecondTool;
  const secondTool = new Promise((resolve) => { releaseSecondTool = resolve; });
  let settled = false;
  const runtime = createHarnessRuntime({
    args: { question, context, responseStyle: "简短中文，保留 CNY 数字" },
    transcript: [{ role: "user", text: "查完整去回程，不要付款。" }, { role: "assistant", text: "先查去程。" }],
    onProgress: (value) => {
      events.push(["public-stage", value.text]);
      return true;
    },
    runEmbeddedAgent: async (options) => {
      assert(options.prompt.includes(`User request:\n${question}`));
      assert(options.prompt.includes(`Additional realtime context:\n${context}`));
      assert(options.prompt.includes("User: 查完整去回程，不要付款。"));
      assert.match(options.prompt, /Own the complete currently authorized user goal/);
      assert.match(options.prompt, /actually call the next required tool.*same run/);
      assert.match(options.prompt, /final-answer output only when all requested outputs have been verified/);
      assert.equal(options.runId.startsWith("test:"), true);
      options.onAgentEvent({ stream: "item", data: { kind: "preamble", phase: "end", itemId: "outbound-fact", progressText: "去程含税 590 CNY/人已核对。" } });
      events.push(["next-tool-started", options.runId]);
      const returnPrice = await secondTool;
      events.push(["next-tool-result", returnPrice]);
      return { payloads: [{ text: `去程 590 CNY/人，回程 ${returnPrice} CNY/人；三人含税合计 4140 CNY。` }] };
    },
  });
  const pending = runtime.run().then((value) => { settled = true; return value; });
  await nextTick();
  assert.equal(settled, false, "a delivered stage sentence must not complete the consult");
  assert.equal(runtime.observations.cleanup, 0);
  assert.equal(runtime.observations.releases, 0);
  assert.deepEqual(events.map(([name]) => name), ["public-stage", "next-tool-started"]);
  releaseSecondTool(790);
  assert.deepEqual(await pending, { text: "去程 590 CNY/人，回程 790 CNY/人；三人含税合计 4140 CNY。" });
  assert.deepEqual(events.map(([name]) => name), ["public-stage", "next-tool-started", "next-tool-result"]);
  assert.equal(runtime.observations.cleanup, 1);
  assert.equal(runtime.observations.releases, 1);
});

test("consult forwards complete public facts before final and leaves unfinished text for final delivery", async () => {
  const progress = [];
  let finish;
  let partial;
  let agentEvent;
  const runtime = createHarnessRuntime({
    onProgress: (payload) => progress.push(payload),
    runEmbeddedAgent: (options) => {
      partial = options.onPartialReply;
      agentEvent = options.onAgentEvent;
      assert.equal(options.onReasoningStream, undefined);
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const pending = runtime.run();
  await nextTick();
  partial({ text: "  正在查看今天的安排  " });
  partial({ text: "正在查看今天的安排" });
  partial({ text: "" });
  partial({ text: "  " });
  partial({ text: "我已经找到了" });
  partial({ text: "我已经找到了三个相关文件。后面还有" });
  partial({ text: "内部推理。", isReasoning: true });
  partial({ delta: "不是完整公开 payload" });
  assert.deepEqual(progress.map(({ text, kind }) => ({ text, kind })), [
    { text: "我已经找到了三个相关文件。", kind: "commentary" },
  ]);
  assert.match(progress[0].provenance.runId, /^test:/);
  assert.equal(progress[0].provenance.source, "reply");
  assert.equal(progress[0].provenance.sequence, 1);
  assert.equal(typeof progress[0].provenance.emittedAt, "number");
  finish({ payloads: [{ text: "最后的结果。" }] });
  assert.deepEqual(await pending, { text: "最后的结果。" });
  partial({ text: "完成后的迟到输出。" });
  agentEvent({ stream: "item", data: { kind: "preamble", phase: "update", progressText: "完成后的迟到播报。" } });
  assert.equal(progress.length, 1);
  assert.equal(runtime.observations.cleanup, 1);
  assert.equal(runtime.observations.releases, 1);
});

test("a reasoning flag cannot masquerade as a public preamble even with a visible sentence boundary", () => {
  const progress = [];
  const observer = patchedObserver({ onProgress: value => progress.push(value) });
  observer.onAgentEvent({stream:"item",data:{kind:"preamble",phase:"end",isReasoning:true,progressText:"PRIVATE_REASONING。"}});
  observer.onPartialReply({isReasoning:true,text:"PRIVATE_THOUGHT。"});
  observer.onAgentEvent({stream:"tool",data:{kind:"preamble",phase:"end",progressText:"PRIVATE_TOOL_LOG。"}});
  assert.deepEqual(progress, []);
  observer.onAgentEvent({stream:"item",data:{kind:"preamble",phase:"end",progressText:"公开核验已完成。"}});
  assert.deepEqual(progress.map(value => value.text), ["公开核验已完成。"]);
});

test("actual builtin public preamble contract reaches the observer without exposing thoughts or tools", () => {
  const progress = [];
  const observer = patchedObserver({ onProgress: (payload) => { progress.push(payload); return true; } });
  const agentEvents = [];
  let partialCalls = 0;
  const dependencies = {
    randomUUID: () => "stream-id",
    isStreamAppend: ({ data, finalMessage }) => !finalMessage && !data.replace && !data.mediaUrls?.length && !data.managedMediaUrls?.length,
    mergeStreamAppend: (previous, next) => ({ ...next, delta: previous.delta + next.delta }),
    emitAgentEvent: (event) => agentEvents.push(event),
    runBestEffortCallback: (options) => { options.callback(); options.onSuccess?.(); },
  };
  const createDelivery = executeFunction(builtinSource, "function createReplyDelivery", "//#endregion", dependencies);
  const delivery = createDelivery({
    params: {
      runId: "consult-run",
      onAgentEvent: observer.onAgentEvent,
      onPartialReply: (payload) => { partialCalls++; return observer.onPartialReply(payload); },
    },
    state: { assistantTexts: [], shouldEmitPartialReplies: true, assistantMessageIndex: 0, assistantMessageStartIndex: 0 },
    log: {},
  });
  delivery.emitAssistantStreamData({ text: "正在查找", delta: "", replace: true, phase: "commentary", itemId: "item-1" });
  delivery.emitAssistantStreamData({ text: "正在查找你今天的日程。", delta: "", replace: true, phase: "commentary", itemId: "item-1" });
  delivery.emitAssistantStreamData({ text: "正在查找你今天的日程。", delta: "", replace: true, phase: "commentary", itemId: "item-1" }, { finalMessage: true });
  assert.equal(partialCalls, 0, "public commentary uses Agent preambles, not partial replies");
  assert.deepEqual(agentEvents.map(({ stream, data }) => ({ stream, kind: data.kind, phase: data.phase, progressText: data.progressText })), [
    { stream: "item", kind: "preamble", phase: "update", progressText: "正在查找" },
    { stream: "item", kind: "preamble", phase: "update", progressText: "正在查找你今天的日程。" },
    { stream: "item", kind: "preamble", phase: "end", progressText: "正在查找你今天的日程。" },
  ]);
  assert.deepEqual(progress, [{ text: "正在查找你今天的日程。", kind: "commentary" }]);
  for (const event of [
    { stream: "reasoning", data: { kind: "preamble", phase: "update", progressText: "hidden reasoning." } },
    { stream: "item", data: { kind: "thought", phase: "update", progressText: "hidden thought." } },
    { stream: "tool", data: { kind: "preamble", phase: "update", progressText: "raw tool output." } },
    { stream: "item", data: { kind: "preamble", phase: "start", progressText: "unsupported phase." } },
    { stream: "item", data: { kind: "preamble", phase: "update", text: "wrong field." } },
  ]) assert.equal(observer.onAgentEvent(event), false);
  assert.equal(progress.length, 1);
  assert.equal(observer.onPartialReply({ text: "公开答案。" }), false, "the observer does not claim final delivery even if downstream returns true");
});

test("actual Codex deltas and builtin completion mirrors share one reply cursor despite different item identities", async () => {
  const progress = [];
  const assistantSnapshots = [];
  const observer = patchedObserver({ onProgress: (payload) => progress.push(payload) });
  // The worker globally bridges assistant Agent events to onPartialReply(event.data).
  // Keep that transport boundary simple; both event producers below execute captured code.
  const bridge = (event) => {
    observer.onAgentEvent(event);
    if (event.stream === "assistant") {
      assistantSnapshots.push({ ...event.data });
      observer.onPartialReply(event.data);
    }
  };
  const projection = createNativeProjection(bridge);
  const builtinState = { assistantTexts: [], assistantMessageIndex: 0, assistantMessageStartIndex: 0 };
  const delivery = createBuiltinDelivery(bridge, builtinState);
  const first = ["I", "'ll", " start", " waiting", " eight", " seconds", "."];
  projection.recordItemStarted({ id: "native-first", type: "agentMessage", phase: "final_answer" }, "native-first");
  for (const delta of first) await projection.handleAssistantDelta({ itemId: "native-first", delta });
  const english = "I'll start waiting eight seconds.";
  assert.equal(assistantSnapshots[0].itemId, undefined);
  assert.equal(assistantSnapshots.at(-1).text, english);
  delivery.emitAssistantStreamData({ text: english, delta: "", phase: "final_answer" }, { finalMessage: true });
  assert.equal(assistantSnapshots.at(-1).itemId, "builtin-stream:0");
  assert.equal(assistantSnapshots.at(-1).text, english);
  assert.deepEqual(progress.map(({ text }) => text), [english], "the builtin mirror must not resend the complete native fact");

  // A later distinct assistant message must still stream and suppress only its own mirror.
  const second = ["八", "秒", "等待", "完成", "。"];
  projection.recordItemStarted({ id: "native-second", type: "agentMessage", phase: "final_answer" }, "native-second");
  for (const delta of second) await projection.handleAssistantDelta({ itemId: "native-second", delta });
  builtinState.assistantMessageIndex = builtinState.assistantMessageStartIndex = 1;
  delivery.emitAssistantStreamData({ text: "八秒等待完成。", delta: "", phase: "final_answer" }, { finalMessage: true });
  assert.equal(assistantSnapshots.at(-1).itemId, "builtin-stream:1");
  assert.deepEqual(progress.map(({ text }) => text), [english, "八秒等待完成。"]);
  assert(progress.every(({ kind }) => kind === "commentary"));
});

test("actual late native commentary phase and builtin commentary mirrors do not resend a public reply across hooks", async () => {
  const progress = [];
  const events = [];
  const observer = patchedObserver({ onProgress: (payload) => progress.push(payload) });
  const bridge = (event) => {
    events.push(event);
    observer.onAgentEvent(event);
    if (event.stream === "assistant") observer.onPartialReply(event.data);
  };
  const projection = createNativeProjection(bridge);
  const delivery = createBuiltinDelivery(bridge);
  const itemId = "native-late-commentary";
  const deltas = ["I", "'ll", " run", " the", " sleep", " test", " now", "."];
  const text = "I'll run the sleep test now.";
  // The streaming item can lack a phase until item/completed identifies it as commentary.
  projection.recordItemStarted({ id: itemId, type: "agentMessage" }, itemId);
  for (const delta of deltas) await projection.handleAssistantDelta({ itemId, delta });
  projection.recordItemCompleted({ id: itemId, type: "agentMessage", phase: "commentary", text }, itemId, new Set());
  delivery.emitAssistantStreamData({ text: "I'll  run the sleep test now.\n", delta: "", replace: true, phase: "commentary", itemId: "builtin-commentary" }, { finalMessage: true });
  assert(events.some(({ stream, data }) => stream === "assistant" && data.text === text));
  assert(events.some(({ stream, data }) => stream === "item" && data.kind === "preamble" && data.itemId === itemId && data.phase === "end"));
  assert(events.some(({ stream, data }) => stream === "item" && data.kind === "preamble" && data.itemId === "builtin-commentary" && data.phase === "end"));
  assert.deepEqual(progress.map(({ text }) => text), [text], "both public completion hooks must suppress the complete streamed fact");

  // The mirrored source must advance its own cursor even when global equality suppresses it.
  delivery.emitAssistantStreamData({ text: `${text} More details.`, delta: "", replace: true, phase: "commentary", itemId: "builtin-commentary" });
  assert.equal(progress.at(-1).text, "More details.");
  delivery.emitAssistantStreamData({ text: "I'll stop the sleep test now.", delta: "", replace: true, phase: "commentary", itemId: "builtin-commentary" });
  assert.equal(progress.at(-1).text, "I'll stop the sleep test now.", "a different public correction must still reach Live");

  // Execute the builtin event contract with an explicitly marked reasoning payload.
  delivery.emitAssistantStreamData({ text: "PRIVATE_REASONING.", delta: "PRIVATE_REASONING.", isReasoning: true }, { emitPartialReply: true });
  observer.onAgentEvent({ stream: "item", data: { kind: "thought", phase: "update", progressText: "PRIVATE_THOUGHT。" } });
  observer.onAgentEvent({ stream: "reasoning", data: { kind: "preamble", phase: "update", progressText: "PRIVATE_STREAM。" } });
  assert(progress.every(({ text }) => !text.includes("PRIVATE_")));
});

test("actual native commentary updates and builtin completion/reply hooks share normalized public snapshots", async () => {
  const progress = [];
  const observer = patchedObserver({ onProgress: (payload) => progress.push(payload) });
  const bridge = (event) => {
    observer.onAgentEvent(event);
    if (event.stream === "assistant") observer.onPartialReply(event.data);
  };
  const projection = createNativeProjection(bridge);
  const delivery = createBuiltinDelivery(bridge);
  const itemId = "native-known-commentary";
  projection.recordItemStarted({ id: itemId, type: "agentMessage", phase: "commentary" }, itemId);
  for (const delta of ["正在", " 检查", " 结果。"] ) await projection.handleAssistantDelta({ itemId, delta });
  projection.recordItemCompleted({ id: itemId, type: "agentMessage", phase: "commentary", text: "正在 检查 结果。" }, itemId, new Set());
  delivery.emitAssistantStreamData({ text: "正在\n检查  结果。", delta: "", replace: true, phase: "commentary", itemId: "builtin-different-commentary" }, { finalMessage: true });
  delivery.emitAssistantStreamData({ text: "正在 检查 结果。", delta: "", phase: "final_answer" }, { finalMessage: true });
  assert.deepEqual(progress.map(({ text }) => text), ["正在 检查 结果。"]);
  // A subsequent true extension of the suppressed reply source must append only its suffix.
  observer.onPartialReply({ text: "正在 检查 结果。 已完成。" });
  assert.equal(progress.at(-1).text, "已完成。");
});

test("actual Codex date and time fragments reach Live as one complete fact before the backend finishes", async () => {
  const progress = [];
  let finish;
  let projection;
  const runtime = createHarnessRuntime({
    onProgress: (payload) => progress.push(payload),
    runEmbeddedAgent: (options) => {
      projection = createNativeProjection((event) => {
        options.onAgentEvent(event);
        if (event.stream === "assistant") options.onPartialReply(event.data);
      });
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const pending = runtime.run();
  await nextTick();
  const itemId = "native-exact-time";
  projection.recordItemStarted({ id: itemId, type: "agentMessage" }, itemId);
  const fragments = ["当前时间是 ", "202", "6", "-", "10", "-", "02", " ", "14", ":", "22", ":", "15", "，时区 ", "UTC", "+", "08", ":", "00"];
  for (const delta of fragments) {
    await projection.handleAssistantDelta({ itemId, delta });
    assert.deepEqual(progress, [], `unfinished timestamp must not be spoken after ${JSON.stringify(delta)}`);
  }
  await projection.handleAssistantDelta({ itemId, delta: "。" });
  assert.deepEqual(progress.map(({ text, kind }) => ({ text, kind })), [{ text: "当前时间是 2026-10-02 14:22:15，时区 UTC+08:00。", kind: "commentary" }]);
  // The public fact is delivered while the consult promise is still pending.
  finish({ payloads: [{ text: "后台已经完成全部检查。" }] });
  assert.deepEqual(await pending, { text: "后台已经完成全部检查。" });
});

test("actual native and builtin completion hooks confirm an English numeric sentence without guessing decimal fragments", async () => {
  const progress = [];
  const observer = patchedObserver({ onProgress: (payload) => progress.push(payload) });
  const bridge = (event) => {
    observer.onAgentEvent(event);
    if (event.stream === "assistant") observer.onPartialReply(event.data);
  };
  const projection = createNativeProjection(bridge);
  const delivery = createBuiltinDelivery(bridge);
  const itemId = "native-numeric-commentary";
  projection.recordItemStarted({ id: itemId, type: "agentMessage", phase: "commentary" }, itemId);
  for (const delta of ["The value is ", "1", ".", "2", "5", "."]) {
    await projection.handleAssistantDelta({ itemId, delta });
    assert.deepEqual(progress, [], "a decimal or a numeric final dot needs completion evidence");
  }
  const text = "The value is 1.25.";
  projection.recordItemCompleted({ id: itemId, type: "agentMessage", phase: "commentary", text }, itemId, new Set());
  assert.deepEqual(progress, [{ text, kind: "commentary" }]);
  delivery.emitAssistantStreamData({ text, delta: "", replace: true, phase: "commentary", itemId: "builtin-number-mirror" }, { finalMessage: true });
  delivery.emitAssistantStreamData({ text, delta: "", phase: "final_answer" }, { finalMessage: true });
  assert.equal(progress.length, 1, "completion and reply mirrors must share the delivered numeric fact");

  // End is not permission to speak an unfinished factual tail without a boundary.
  delivery.emitAssistantStreamData({ text: "Current time is 2026-10-02 14:22:15", delta: "", replace: true, phase: "commentary", itemId: "no-sentence-boundary" }, { finalMessage: true });
  observer.close();
  assert.equal(progress.length, 1);
});

test("sentence and blank-paragraph boundaries coalesce facts while single newlines and final tails remain buffered", () => {
  const progress = [];
  const observer = patchedObserver({ onProgress: (payload) => progress.push(payload) });
  observer.onPartialReply({ text: "The scale is 3." });
  observer.onPartialReply({ text: "The scale is 3.14" });
  assert.deepEqual(progress, []);
  observer.onPartialReply({ text: "The scale is 3.14. Next fact" });
  assert.deepEqual(progress.map(({ text }) => text), ["The scale is 3.14."]);
  observer.onPartialReply({ text: "The scale is 3.14. Next fact! Still checking" });
  assert.deepEqual(progress.map(({ text }) => text), ["The scale is 3.14.", "Next fact!"]);

  observer.onPartialReply({ text: "当前时间是\n2026-10-02 14:22:15" });
  assert.equal(progress.length, 2, "a title and single newline are not a complete public fact");
  observer.onPartialReply({ text: "当前时间是\n2026-10-02 14:22:15\n \n下一段未完成" });
  assert.equal(progress.at(-1).text, "当前时间是 2026-10-02 14:22:15");
  observer.onAgentEvent({ stream: "item", data: { kind: "preamble", phase: "update", itemId: "paragraph-mirror", progressText: "当前时间是\n2026-10-02 14:22:15\n\n下一段未完成" } });
  assert.equal(progress.length, 3, "paragraph whitespace variants must not mirror a delivered fact");
  observer.onPartialReply({ text: "完整中文问题？接着完整回答！剩余未结束" });
  assert.equal(progress.at(-1).text, "完整中文问题？接着完整回答！");
  observer.close();
  assert.equal(progress.length, 4, "close must not flush the unfinished final tail or schedule a timer");
});

test("aborted consult ignores late public partials even when its agent finishes later", async () => {
  const controller = new AbortController();
  const progress = [];
  let partial;
  let agentEvent;
  let finish;
  const runtime = createHarnessRuntime({
    signal: controller.signal,
    onProgress: (payload) => progress.push(payload),
    runEmbeddedAgent: (options) => {
      partial = options.onPartialReply;
      agentEvent = options.onAgentEvent;
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const pending = runtime.run();
  await nextTick();
  partial({ text: "已经开始。" });
  controller.abort(new Error("user changed their request"));
  partial({ text: "旧请求迟到进度。" });
  agentEvent({ stream: "item", data: { kind: "preamble", phase: "update", progressText: "旧请求迟到播报。" } });
  finish({ payloads: [{ text: "旧请求最后结果" }] });
  await pending;
  assert.deepEqual(progress.map(({ text, kind }) => ({ text, kind })), [{ text: "已经开始。", kind: "commentary" }]);
});

test("throwing, rejecting, or pending progress observers cannot delay or fail the final result", async () => {
  for (const onProgress of [
    () => { throw new Error("observer threw"); },
    () => Promise.reject(new Error("observer rejected")),
    () => new Promise(() => {}),
  ]) {
    let progressCalls = 0;
    const runtime = createHarnessRuntime({
      onProgress: (payload) => { progressCalls++; return onProgress(payload); },
      runEmbeddedAgent: async (options) => {
        options.onPartialReply({ text: "正在核对。" });
        return { payloads: [{ text: "核对完成" }] };
      },
    });
    const timer = new AbortController();
    const timeout = new Promise((_, reject) => {
      const id = setTimeout(() => reject(new Error("final reply waited for observer")), 1000);
      timer.signal.addEventListener("abort", () => clearTimeout(id), { once: true });
    });
    try { assert.deepEqual(await Promise.race([runtime.run(), timeout]), { text: "核对完成" }); }
    finally { timer.abort(); }
    await nextTick();
    assert.equal(progressCalls, 1, "the complete fact must exercise the failing or pending callback");
    assert.equal(runtime.observations.cleanup, 1);
    assert.equal(runtime.observations.releases, 1);
  }
});

function createRunner(consult) {
  const dependencies = {
    resolveTalkAgentConsultAuthority: () => ({}),
    parseRealtimeVoiceAgentConsultArgs: (args) => args,
    assertClientVoiceSessionOpen: () => {},
    authorizeClientVoiceConfirmation: () => undefined,
    createTalkClientAgentRuntime: () => ({}),
    normalizeTalkSection: () => ({}),
    runOutsideGatewayRootWorkAdmission: () => ({ run: (callback) => callback(), release: () => {} }),
    tryBeginGatewayRootWorkAdmission: () => {},
    GatewayDrainingError: class extends Error {},
    consultRealtimeVoiceAgent: consult,
    registerClientVoiceConsultRun: () => {},
    bindAuthorizedClientVoiceConfirmation: () => {},
    registerChatAbortController: () => ({ controller: new AbortController(), cleanup: () => {} }),
    REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME: "openclaw_agent_consult",
  };
  return executeFunction(patchedTalk, "function createTalkClientAgentConsultRunner", "function createTalkClientGatewayControlOwner", dependencies)({
    config: {},
    context: { logGateway: {} },
    sessionTarget: { agentId: "agent", sessionKey: "voice", canonicalKey: "agent:voice", storePath: "/tmp/store" },
    getVoiceSessionId: () => "voice-id",
    initialItems: [],
  });
}

test("Talk runArgs and runPrompt preserve the progress callback and abort signal", async () => {
  const calls = [];
  const runner = createRunner(async (options) => { calls.push(options); options.onProgress({ text: "public", kind: "commentary" }); return { text: "final" }; });
  const signal = new AbortController().signal;
  const progress = [];
  const onProgress = (payload) => progress.push(payload);
  assert.deepEqual(await runner.runArgs({ question: "first" }, signal, onProgress), { text: "final" });
  assert.deepEqual(await runner.runPrompt({ prompt: "second", signal, onProgress }), { text: "final" });
  assert.deepEqual(calls.map((call) => call.args.question), ["first", "second"]);
  assert(calls.every((call) => call.abortSignal === signal && call.onProgress === onProgress));
  assert.equal(progress.length, 2);
});

test("actual Talk consult transport preserves the full authorized goal and context rather than extracting the first step", async () => {
  const calls = [];
  const runner = createRunner(async (options) => { calls.push(options); return { text: "真实已结束结果，原样保留" }; });
  const signal = new AbortController().signal;
  const question = "比较 2026-10-08 上海到台北去程 + 2026-10-10 回程 + 十月八至十日酒店，2 成人 / 1 儿童。";
  const context = "已授权整体目标：机票和酒店的具体实价；去程已验证 590 CNY；剩余回程与酒店，不付款或预订。";
  const args = { question, context, responseStyle: "中文，保留精确数字、日期和币种", confirmationId: "server-issued" };
  assert.deepEqual(await runner.runArgs(args, signal), { text: "真实已结束结果，原样保留" });
  assert.deepEqual(calls[0].args, args);
  const nativePrompt = `${question}\n\nContext:\n${context}\n\n剩余步骤：核对回程、核对酒店、合并结果。`;
  await runner.runPrompt({ prompt: nativePrompt, signal });
  assert.equal(calls[1].args.question, nativePrompt, "the native provider's complete delegation input must remain intact");
  assert(calls.every((call) => call.abortSignal === signal));
});

test("Gateway owner forwards the same native-delegation observer through the actual Talk runner", async () => {
  const progress = [];
  const onProgress = (payload) => progress.push(payload);
  const signal = new AbortController().signal;
  const calls = [];
  const runner = createRunner(async (options) => { calls.push(options); options.onProgress({ text: "native progress", kind: "commentary" }); return { text: "native final" }; });
  const owners = new Map();
  const dependencies = {
    createRealtimeControlQueue: () => ({ seal: () => {}, flush: async () => {} }),
    randomUUID: () => "uuid",
    createRealtimeVoiceSessionHarness: () => ({ close: () => {} }),
    createTalkRealtimeRunControlOwner: () => ({ close: async () => {} }),
    pendingOwners: new Set(),
    owners,
    registerTalkConnectionCleanup: () => {},
  };
  const createOwner = executeFunction(patchedTalk, "function createTalkClientGatewayControlOwner", "async function closeTalkClientGatewayControlSession", dependencies);
  const owner = createOwner({
    context: { logGateway: { warn: () => {} } },
    voiceSessionId: "voice-id",
    connId: "conn",
    runAgentConsult: runner.runArgs,
    flushTranscript: async () => {},
    closeLogicalSession: async () => {},
  });
  owner.activate();
  assert.deepEqual(await owner.runAgentConsult({ prompt: "native question", signal, onProgress }), { text: "native final" });
  assert.equal(calls[0].onProgress, onProgress);
  assert.equal(calls[0].abortSignal, signal);
  assert.deepEqual(progress, [{ text: "native progress", kind: "commentary" }]);
  await owner.close();
  await assert.rejects(owner.runAgentConsult({ prompt: "after close", signal, onProgress }), /Realtime voice session closed/);
  assert.equal(calls.length, 1);
});

test("gateway relay wrapper preserves its native observer and rejects a closed relay", async () => {
  const start = patchedTalk.indexOf("\tconst runAgentConsult = async ({ prompt, signal, onProgress }) => {");
  const end = patchedTalk.indexOf("\tconst runControl = createTalkRealtimeRunControlOwner", start);
  assert(start > 0 && end > start);
  const calls = [];
  let active = true;
  const wrapper = new Function("getActiveRelay", "consultRunner", `${patchedTalk.slice(start, end)}; return runAgentConsult;`)(
    () => active,
    { runPrompt: async (args) => { calls.push(args); return { text: "relay final" }; } },
  );
  const signal = new AbortController().signal;
  const onProgress = () => {};
  assert.deepEqual(await wrapper({ prompt: "relay question", signal, onProgress }), { text: "relay final" });
  assert.deepEqual(calls, [{ prompt: "relay question", signal, onProgress }]);
  active = false;
  await assert.rejects(wrapper({ prompt: "closed", signal, onProgress }), /gateway-relay session is closed/);
  assert.equal(calls.length, 1);
});

test("older callers without a progress observer retain their final reply", async () => {
  const runtime = createHarnessRuntime({
    runEmbeddedAgent: async (options) => {
      options.onPartialReply({ text: "public partial" });
      return { payloads: [{ text: "old caller final" }] };
    },
  });
  assert.deepEqual(await runtime.run(), { text: "old caller final" });
  const runner = createRunner(async (options) => {
    assert.equal(options.onProgress, undefined);
    return { text: "old prompt caller final" };
  });
  assert.deepEqual(await runner.runPrompt({ prompt: "question", signal: new AbortController().signal }), { text: "old prompt caller final" });
});
