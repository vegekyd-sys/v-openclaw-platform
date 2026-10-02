import assert from "node:assert/strict";

/** Observe only public assistant replies. Provider ownership decides how to speak them. */
export function createGptLiveConsultProgressObserver({ onProgress, abortSignal, logger }) {
  let closed = false;
  let lastPublicSnapshot = "";
  let lastPublicDeliveredLength = 0;
  const previousTextBySource = new Map();
  const deliveredLengthBySource = new Map();
  const normalize = (text) => text.replace(/\s+/gu, " ").trim();
  // Keep unfinished dates, numbers and statements together. A public hook is
  // not evidence that its current token already forms a speakable fact.
  const completePrefixLength = (text, messageComplete) => {
    let boundary = 0;
    const closing = /["'\u2019\u201d\u300d\u300f\uff09)\]}]/u;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === "\n" && /^\n[\t \r]*\n/u.test(text.slice(index))) {
        boundary = index + text.slice(index).match(/^\n[\t \r]*\n/u)[0].length;
        continue;
      }
      if (!"。？！?!.".includes(character)) continue;
      if (character === ".") {
        const previous = text[index - 1] ?? "";
        const next = text[index + 1] ?? "";
        if (/\p{N}/u.test(previous) && /\p{N}/u.test(next)) continue;
        if (next && !/\s/u.test(next) && !closing.test(next) && !".?!".includes(next)) continue;
        // A trailing "1." may still become "1.25" on the next delta.
        if (!next && /\p{N}/u.test(previous) && !messageComplete) continue;
      }
      let end = index + 1;
      while (end < text.length && ("。？！?!.".includes(text[end]) || closing.test(text[end]))) end++;
      boundary = end;
      index = end - 1;
    }
    return normalize(text.slice(0, boundary)).length;
  };
  const reportFailure = (error) => {
    try {
      logger?.warn?.(`[talk] public consult progress failed: ${error instanceof Error ? error.message : String(error)}`);
    } catch {}
  };
  const observe = (source, value, messageComplete = false) => {
    if (closed || abortSignal?.aborted || typeof onProgress !== "function") return false;
    // Retain trailing paragraph whitespace until after boundary detection.
    const text = typeof value === "string" ? value.trimStart() : "";
    const previousText = previousTextBySource.get(source) ?? "";
    const publicSnapshot = normalize(text);
    if (!publicSnapshot) return false;
    const previousSnapshot = normalize(previousText);
    let deliveredLength = publicSnapshot.startsWith(previousSnapshot) ? deliveredLengthBySource.get(source) ?? 0 : 0;
    previousTextBySource.set(source, text);
    // Native public replies and builtin public preambles can reconcile the
    // same cumulative message through different hooks with different IDs.
    // Share their already delivered prefix, including a mirror followed by
    // a genuine extension. Each source still advances its own cursor.
    if (publicSnapshot.startsWith(lastPublicSnapshot)) deliveredLength = Math.max(deliveredLength, lastPublicDeliveredLength);
    deliveredLengthBySource.set(source, deliveredLength);
    lastPublicSnapshot = publicSnapshot;
    lastPublicDeliveredLength = deliveredLength;
    const completeLength = completePrefixLength(text, messageComplete);
    if (completeLength <= deliveredLength) return false;
    const progressText = publicSnapshot.slice(deliveredLength, completeLength).trim();
    deliveredLengthBySource.set(source, completeLength);
    lastPublicDeliveredLength = completeLength;
    // Late closing quotes or punctuation must not become standalone speech.
    if (!progressText || !/[\p{L}\p{N}]/u.test(progressText)) return false;
    try {
      const pending = onProgress({ text: progressText, kind: "commentary" });
      if (pending && typeof pending.then === "function") Promise.resolve(pending).catch(reportFailure);
    } catch (error) {
      reportFailure(error);
    }
    // This observes progress; it does not claim successful final reply delivery.
    return false;
  };
  return {
    onPartialReply: (payload) => {
      if (payload?.isReasoning) return false;
      // Native streaming omits itemId; builtin completion reconciliation adds
      // one for the same cumulative reply. Keep their progress cursor shared.
      return observe("reply", payload?.text);
    },
    onAgentEvent: (event) => {
      const data = event?.data;
      if (event?.stream !== "item" || data?.kind !== "preamble" || data.phase !== "update" && data.phase !== "end") return false;
      return observe(`preamble:${typeof data.itemId === "string" ? data.itemId : ""}`, data.progressText, data.phase === "end");
    },
    close: () => { closed = true; },
  };
}

const OBSERVER_MARKER = "// gpt-live-consult-progress-v1: public replies only; never reasoning.";
const OBSERVER_SOURCE = `${OBSERVER_MARKER}\n${createGptLiveConsultProgressObserver.toString()}\n`;

export const GPT_LIVE_CONSULT_PROGRESS_HARNESS_ANCHORS = [
  {
    label: "observer entry",
    before: "async function consultRealtimeVoiceAgent(params) {",
    after: `${OBSERVER_SOURCE}async function consultRealtimeVoiceAgent(params) {`,
  },
  {
    label: "observer lifetime",
    before: "\t\t\tconst result = await params.agentRuntime.runEmbeddedAgent({\n\t\t\t\tsessionId,",
    after: "\t\t\tconst progressObserver = createGptLiveConsultProgressObserver({ onProgress: params.onProgress, abortSignal, logger: params.logger });\n\t\t\tconst result = await params.agentRuntime.runEmbeddedAgent({\n\t\t\t\tsessionId,",
  },
  {
    label: "public partial callback",
    before: "\t\t\t\tagentDir,\n\t\t\t\tabortSignal\n\t\t\t}).finally(() => runRegistration?.cleanup?.());",
    after: "\t\t\t\tagentDir,\n\t\t\t\tabortSignal,\n\t\t\t\tonPartialReply: progressObserver.onPartialReply,\n\t\t\t\tonAgentEvent: progressObserver.onAgentEvent\n\t\t\t}).finally(() => {\n\t\t\t\tprogressObserver.close();\n\t\t\t\trunRegistration?.cleanup?.();\n\t\t\t});",
  },
];

export const GPT_LIVE_CONSULT_PROGRESS_TALK_ANCHORS = [
  {
    label: "runner args callback",
    before: "\tconst runArgs = async (args, signal) => {\n\t\tconst parsedArgs = parseRealtimeVoiceAgentConsultArgs(args);",
    after: "\tconst runArgs = async (args, signal, onProgress) => {\n\t\tconst parsedArgs = parseRealtimeVoiceAgentConsultArgs(args);",
  },
  {
    label: "runner observer parameter",
    before: "\t\t\tabortSignal: signal,\n\t\t\tonRunStarted: ({ runId, sessionId, timeoutMs }) => {",
    after: "\t\t\tabortSignal: signal,\n\t\t\tonProgress,\n\t\t\tonRunStarted: ({ runId, sessionId, timeoutMs }) => {",
  },
  {
    label: "runner prompt callback",
    before: "\t\trunPrompt: async ({ prompt, signal }) => await runArgs({ question: prompt }, signal)",
    after: "\t\trunPrompt: async ({ prompt, signal, onProgress }) => await runArgs({ question: prompt }, signal, onProgress)",
  },
  {
    label: "Gateway owner callback",
    before: "\t\trunAgentConsult: async ({ prompt, signal: consultSignal = new AbortController().signal }) => {",
    after: "\t\trunAgentConsult: async ({ prompt, signal: consultSignal = new AbortController().signal, onProgress }) => {",
  },
  {
    label: "Gateway owner forward",
    before: "\t\t\treturn await params.runAgentConsult({ question: prompt }, consultSignal);",
    after: "\t\t\treturn await params.runAgentConsult({ question: prompt }, consultSignal, onProgress);",
  },
  {
    label: "relay callback",
    before: "\tconst runAgentConsult = async ({ prompt, signal }) => {\n\t\tif (!getActiveRelay()) throw new Error(\"Realtime gateway-relay session is closed\");",
    after: "\tconst runAgentConsult = async ({ prompt, signal, onProgress }) => {\n\t\tif (!getActiveRelay()) throw new Error(\"Realtime gateway-relay session is closed\");",
  },
  {
    label: "relay callback forward",
    before: "\t\treturn await consultRunner.runPrompt({\n\t\t\tprompt,\n\t\t\tsignal\n\t\t});",
    after: "\t\treturn await consultRunner.runPrompt({\n\t\t\tprompt,\n\t\t\tsignal,\n\t\t\tonProgress\n\t\t});",
  },
];

const count = (source, needle) => source.split(needle).length - 1;
function patchAnchors(source, anchors, label) {
  assert.equal(typeof source, "string", `${label} must be text`);
  const applied = anchors.map(({ after }) => count(source, after));
  if (applied.every((value) => value === 1)) return source;
  assert(applied.every((value) => value === 0), `${label} progress patch is partial or ambiguous`);
  let patched = source;
  for (const { before, after, label: anchorLabel } of anchors) {
    assert.equal(count(patched, before), 1, `${label} ${anchorLabel} anchor drifted`);
    patched = patched.replace(before, after);
  }
  return patched;
}

export function patchGptLiveConsultProgressHarness(source) {
  return patchAnchors(source, GPT_LIVE_CONSULT_PROGRESS_HARNESS_ANCHORS, "realtime harness");
}

export function patchGptLiveConsultProgressTalk(source) {
  return patchAnchors(source, GPT_LIVE_CONSULT_PROGRESS_TALK_ANCHORS, "Talk runner");
}
