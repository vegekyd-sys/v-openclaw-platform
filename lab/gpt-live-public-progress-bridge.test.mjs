import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createGptLiveConsultProgressObserver } from "./gpt-live-consult-progress.mjs";
import { patchGptLivePublicProgressBridge } from "./gpt-live-public-progress-bridge.mjs";
import {
  a as parseAssistantTextSignature,
  n as extractAssistantTextForPhase,
  s as resolveAssistantMessagePhase,
} from "./fixtures/gpt-live-public-progress/chat-message-content-Dws_XUEQ.js";

const capture = new URL("../release/captured/v2026.9.1-db91.6-memory-search-guards-20261002.worker/dist/gateway-public-stream.mjs", import.meta.url);
const source = readFileSync(capture, "utf8");
const builtinSource = readFileSync(new URL("../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/builtin-openclaw-zQV8Wwjr.js", import.meta.url), "utf8");
const before = (await import(capture.href)).publishWorkerPublicStream;
const after = (await import(`data:text/javascript;base64,${Buffer.from(patchGptLivePublicProgressBridge(source)).toString("base64")}`)).publishWorkerPublicStream;
const owner = { runId: "accepted-child-run", sessionKey: "bound-child-session", agentId: "agent", lifecycleGeneration: "current-generation" };

function executeFunction(startAnchor, endAnchor, dependencies) {
  const start = builtinSource.indexOf(startAnchor);
  const end = builtinSource.indexOf(endAnchor, start);
  assert(start >= 0 && end > start, `${startAnchor} source is missing`);
  const name = startAnchor.match(/function (\w+)/)[1];
  return new Function("dependencies", `with (dependencies) { ${builtinSource.slice(start, end)}; return ${name}; }`)(dependencies);
}

function createDelivery(emit) {
  const createReplyDelivery = executeFunction("function createReplyDelivery", "//#endregion", {
    randomUUID: () => "captured-builtin-stream",
    emitAgentEvent: emit,
    runBestEffortCallback: options => { options.callback(); options.onSuccess?.(); },
    isStreamAppend: ({ data, finalMessage }) => !finalMessage && !data.replace && !data.mediaUrls?.length && !data.managedMediaUrls?.length,
    mergeStreamAppend: (previous, next) => ({ ...next, delta: previous.delta + next.delta }),
  });
  return createReplyDelivery({ params: { runId: owner.runId }, state: { assistantTexts: [], assistantMessageIndex: 0, assistantMessageStartIndex: 0 }, log: {} });
}

function createMessageEnd(delivery) {
  const normalizeOptionalString = value => typeof value === "string" && value.trim() ? value.trim() : undefined;
  const isSubscribeTranscriptOnlyOpenClawAssistantMessage = executeFunction("function isSubscribeTranscriptOnlyOpenClawAssistantMessage", "const RESPONSES_API_IDS", { normalizeOptionalString });
  const resolveAssistantStreamItemId = executeFunction("function resolveAssistantStreamItemId", "function resolveAssistantStreamContentIndex", { parseAssistantTextSignature });
  const emitAssistantCommentaryStreamData = executeFunction("function emitAssistantCommentaryStreamData", "function emitReasoningEnd", {
    isResponsesApiAssistantMessage: message => message.api === "openai-responses",
    extractAssistantCommentaryText: message => extractAssistantTextForPhase(message, { phase: "commentary" }) ?? "",
    resolveAssistantStreamItemId,
  });
  const handleMessageEnd = executeFunction("function handleMessageEnd", "//#endregion", {
    isSubscribeTranscriptOnlyOpenClawAssistantMessage,
    resolveAssistantMessagePhase,
    shouldSuppressDeterministicApprovalOutput: () => false,
    hasMessageToolOnlySourceDelivery: () => false,
    emitReasoningEnd: () => {},
    appendRawStream: () => {}, // Diagnostic sink is not a source of public text.
    emitAssistantCommentaryStreamData,
  });
  const context = {
    state: { assistantTurnCount: 0, includeReasoning: false },
    params: { runId: owner.runId, session: { id: "bound-session" } },
    noteLastAssistant() {},
    emitAssistantStreamData: delivery.emitAssistantStreamData,
  };
  return message => handleMessageEnd(context, { message });
}

test("actual frozen phase resolver fixtures retain their exact source hashes", () => {
  assert.equal(createHash("sha256").update(source).digest("hex"), "5440eadbfe1e6bf40824bd389e9cd3fb87326cc3c75b1a158cfe107799300fdf");
  const root = new URL("./fixtures/gpt-live-public-progress/", import.meta.url);
  for (const row of JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"))) {
    const bytes = readFileSync(new URL(row.path, root));
    assert.equal(bytes.length, row.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256);
  }
});

test("captured Worker drops public preambles; the patch preserves only their public projection and Gateway identity", () => {
  const event = { runId: "untrusted-run", sessionKey: "untrusted-session", lifecycleGeneration: "old", seq: 999,
    stream: "item", data: { kind: "preamble", phase: "update", itemId: "public-item", title: "Preamble", progressText: "阶段事实已核对。", rawThinking: "PRIVATE_THOUGHT", toolResult: "PRIVATE_TOOL" } };
  const received = [];
  assert.equal(before(owner, "onAgentEvent", [event], value => received.push(value)), 0);
  assert.equal(after(owner, "onAgentEvent", [event], value => received.push(value)), 1);
  assert.deepEqual(received, [{ ...owner, stream: "item", data: { kind: "preamble", phase: "update", itemId: "public-item", title: "Preamble", progressText: "阶段事实已核对。" } }]);
  assert.equal(event.data.rawThinking, "PRIVATE_THOUGHT", "projection must not mutate the original callback");
});

test("item admission excludes thoughts, lifecycle, unsupported phase, reasoning, missing text and late cancellation", () => {
  const publicData = { kind: "preamble", phase: "end", progressText: "公开事实。" };
  const blocked = [
    { stream: "item", data: { ...publicData, kind: "thought" } },
    { stream: "item", data: { ...publicData, isReasoning: true } },
    { stream: "item", data: { ...publicData, isReasoning: "true" } },
    { stream: "item", data: { ...publicData, phase: "start" } },
    { stream: "item", data: { ...publicData, phase: "final" } },
    { stream: "item", data: { ...publicData, progressText: " " } },
    { stream: "item", data: { ...publicData, progressText: undefined, text: "Wrong field." } },
    { stream: "lifecycle", data: { phase: "end" } },
  ];
  const received = [];
  assert.equal(after(owner, "onAgentEvent", blocked, value => received.push(value)), 0);
  assert.equal(after(owner, "onPartialReply", [{ text: "Callback only." }], value => received.push(value)), 0);
  const abort = new AbortController();
  abort.abort();
  assert.equal(after({ ...owner, abortSignal: abort.signal }, "onAgentEvent", [{ stream: "item", data: publicData }], value => received.push(value)), 0);
  assert.deepEqual(received, []);
});

test("real signature resolver and builtin terminal commentary reach the Worker bus before the next tool finishes", () => {
  const progress = [], forwarded = [];
  const observer = createGptLiveConsultProgressObserver({ runId: owner.runId, onProgress: value => progress.push(value) });
  const delivery = createDelivery(event => after(owner, "onAgentEvent", [event], publicEvent => {
    forwarded.push(publicEvent);
    observer.onAgentEvent(publicEvent);
    if (publicEvent.stream === "assistant") observer.onPartialReply(publicEvent.data);
  }));
  const onMessageEnd = createMessageEnd(delivery);
  const message = {
    role: "assistant", api: "openai-completions", provider: "deepseek", stopReason: "toolUse",
    openclawDelivery: { textPhaseRequiresTerminal: true },
    content: [
      { type: "thinking", thinking: "PRIVATE_REASONING" },
      { type: "text", text: "第二步的校验值是 4826。后台继续运行。", textSignature: JSON.stringify({ v: 1, id: "commentary-public-terminal", phase: "commentary" }) },
      { type: "toolCall", id: "next-tool", name: "exec", arguments: { command: "PRIVATE_COMMAND" } },
    ],
  };
  assert.equal(resolveAssistantMessagePhase(message), "commentary");
  assert.equal(resolveAssistantMessagePhase({ ...message, content: [{ type: "text", text: "未分类正文。" }] }), undefined, "stopReason and terminal requirement do not manufacture a phase");
  onMessageEnd(message);
  assert.deepEqual(progress.map(value => value.text), ["第二步的校验值是 4826。后台继续运行。"]);
  assert.equal(forwarded[0].stream, "item");
  assert.equal(forwarded[0].data.phase, "end");
  assert.equal(forwarded[0].data.itemId, "commentary-public-terminal");
  assert.equal(progress[0].provenance.itemId, "commentary-public-terminal");
  assert.equal(JSON.stringify(forwarded).includes("PRIVATE_"), false);
  // The builtin's native duplicate end and the public callback mirror stay silent.
  onMessageEnd(message);
  observer.onPartialReply({ phase: "commentary", text: message.content[1].text });
  assert.equal(progress.length, 1);
  for (const phase of [undefined, "final_answer"]) delivery.emitAssistantStreamData({ text: "全部完成。", delta: "全部完成。", ...(phase ? { phase } : {}) }, { finalMessage: true });
  assert.equal(progress.length, 1, "final completion text retains its canonical final owner");
});

test("existing streams retain their data and separate concurrent Gateway routing; patch rejects partial drift", () => {
  const received = [];
  for (const id of ["a", "b"]) for (const stream of ["assistant", "tool", "reasoning"]) {
    const data = { text: `${id}-${stream}` };
    assert.equal(after({ ...owner, runId: id, sessionKey: `${id}-session` }, "onAgentEvent", [{ stream, data }], value => received.push(value)), 1);
    assert.equal(received.at(-1).data, data);
  }
  assert.equal(received.length, 6);
  for (const row of received) assert.equal(row.sessionKey, `${row.runId}-session`);
  const patched = patchGptLivePublicProgressBridge(source);
  assert.equal(patchGptLivePublicProgressBridge(patched), patched);
  assert.throws(() => patchGptLivePublicProgressBridge(source.replace("!publicStreams.has(event?.stream)", "!publicStreams.has(event.stream)")), /anchor drifted/);
  assert.throws(() => patchGptLivePublicProgressBridge(patched.replace("data: publishedData,", "data: event.data,")), /partial or ambiguous/);
});
