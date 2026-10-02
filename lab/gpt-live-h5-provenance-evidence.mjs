// Read-only assessment of one synthetic H5 call. History supplies content and
// tool witnesses; only callback/native diagnostics supply emission boundaries.
import { createHash } from "node:crypto";
import { parseCompleteTimestamps } from "./gpt-live-call-live-evidence.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
export function extractGeneratedMarker(text) {
  return /(?:TASK_MARKER|任务标记|测试码)(?:\s*(?:等于|为|是|[=:：])\s*|\s+)([0-9]{4})(?![0-9])/u.exec(String(text))?.[1] ?? null;
}
export function publicMessageText(message) {
  if (typeof message?.content === "string") return message.content;
  return (Array.isArray(message?.content) ? message.content : [])
    .filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n");
}
export function parsePublicProgressDiagnostics(log) {
  const events = [];
  for (const rawLine of String(log).split(/\r?\n/u)) {
    const line = rawLine.replace(/\u001b\[[0-9;]*m/gu, "");
    const messages = [line];
    try {
      const wrapped = JSON.parse(line);
      for (const key of ["message", "msg", "0", "1"]) {
        if (typeof wrapped?.[key] === "string") messages.push(wrapped[key]);
      }
    } catch {}
    for (const message of messages) {
      const at = message.indexOf("GPT_LIVE_PUBLIC_PROGRESS ");
      if (at < 0) continue;
      try {
        const event = JSON.parse(message.slice(at + "GPT_LIVE_PUBLIC_PROGRESS ".length));
        if (event.version === 1 && Number.isSafeInteger(event.at) &&
            /^[a-f0-9]{64}$/u.test(event.textSha256 ?? "")) { events.push(event); break; }
      } catch {}
    }
  }
  return events;
}

function toolCalls(history) {
  return (history?.messages ?? []).flatMap((message) =>
    (Array.isArray(message.content) ? message.content : [])
      .filter((part) => part.type === "toolCall")
      .map((part) => ({ ...part, historyPersistedAt: message.timestamp })));
}
function toolResult(history, call) {
  return call && (history?.messages ?? []).find((message) =>
    (message.toolCallId ?? message.tool_call_id) === call.id && message.role === "toolResult");
}
function structuredResult(history, call) {
  try { return JSON.parse(publicMessageText(toolResult(history, call))); } catch { return null; }
}
const timestampEqual = (a, b) => Boolean(a && b &&
  ["year", "month", "day", "hour", "minute", "second"].every((key) => a[key] === b[key]));

export function extractH5WorkflowWitness(parentHistory, childHistories = {}) {
  const calls = toolCalls(parentHistory);
  const markerCall = calls.find((call) => call.name === "exec" &&
    /(?:TASK_MARKER|任务标记|测试码)/u.test(publicMessageText(toolResult(parentHistory, call))));
  const markerResult = publicMessageText(toolResult(parentHistory, markerCall));
  const marker = extractGeneratedMarker(markerResult);
  const spawn = calls.find((call) => call.name === "sessions_spawn");
  const spawnResult = structuredResult(parentHistory, spawn);
  const yielded = calls.find((call) => call.name === "sessions_yield" &&
    structuredResult(parentHistory, call)?.status === "yielded");
  const childKey = spawnResult?.childSessionKey ?? null;
  const child = childKey && childHistories[childKey];
  const childCalls = toolCalls(child);
  const childExec = childCalls.find((call) => call.name === "exec" &&
    /\bsleep\s+8\b/u.test(call.arguments?.command ?? "") &&
    /\bdate\b/u.test(call.arguments?.command ?? ""));
  const childResult = publicMessageText(toolResult(child, childExec));
  const times = parseCompleteTimestamps(childResult);
  const childTimestamp = times.length === 1 ? times[0] : null;
  const childFinal = (child?.messages ?? []).filter((message) =>
    message.role === "assistant" && parseCompleteTimestamps(publicMessageText(message))
      .some((time) => timestampEqual(time, childTimestamp))).at(-1);
  const parentFinal = (parentHistory?.messages ?? []).filter((message) =>
    message.role === "assistant" && marker && containsMarker(publicMessageText(message), marker) &&
    parseCompleteTimestamps(publicMessageText(message)).some((time) => timestampEqual(time, childTimestamp))).at(-1);
  return {
    marker, markerExecCommand: markerCall?.arguments?.command ?? null,
    markerGeneratedByExec: Boolean(markerCall && /(?:\/dev\/urandom|\bRANDOM\b|\bsecrets\.(?:randbelow|randbits|choice)\b|\brandom\.(?:randint|randrange|SystemRandom)\b|\bshuf\b|\bopenssl\s+rand\b|\bcrypto\.(?:randomInt|randomBytes)\b|\brandomInt\s*\()/u.test(markerCall.arguments?.command ?? "")),
    markerExecCallId: markerCall?.id ?? null, markerExecResult: markerResult,
    spawnAccepted: spawnResult?.status === "accepted", childKey,
    childRunId: spawnResult?.runId ?? null, yielded: Boolean(yielded),
    childExecCommand: childExec?.arguments?.command ?? null,
    childExecCallId: childExec?.id ?? null, childExecResult: childResult,
    childTimestamp, childFinalText: publicMessageText(childFinal),
    parentFinalText: publicMessageText(parentFinal),
    parentResumedWithResult: Boolean(parentFinal && childFinal),
    // These are content witnesses, not emission timestamps.
    backendPublicTexts: [...(parentHistory?.messages ?? []), ...(child?.messages ?? [])]
      .filter((message) => message.role === "assistant").map(publicMessageText),
  };
}

function containsMarker(text, marker) {
  const digits = { 零: "0", 〇: "0", 一: "1", 二: "2", 两: "2", 三: "3",
    四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9" };
  const normalized = String(text).replace(/[零〇一二两三四五六七八九]/gu, (digit) => digits[digit])
    .replace(/\s+/gu, "");
  if (normalized.includes(marker)) return true;
  // Native captions may render the same four-digit code as a Chinese number.
  for (const match of String(text).matchAll(/[零〇一二两三四五六七八九十百千]{4,12}/gu)) {
    let sum = 0, digit = 0;
    for (const char of match[0]) {
      if (char in digits) digit = Number(digits[char]);
      else { sum += (digit || 1) * ({ 十: 10, 百: 100, 千: 1000 }[char]); digit = 0; }
    }
    if (sum + digit === Number(marker)) return true;
  }
  return false;
}
export const matchesGeneratedMarker = containsMarker;

// Public coalescer normalizes spaces. Find an exact hash-bearing fragment in
// saved public output without treating the output's persistence time as emit.
function matchPublicFingerprint(event, publicTexts, marker) {
  if (!Number.isSafeInteger(event.textChars) || event.textChars < 1 || event.textChars > 20000) return null;
  for (const original of publicTexts) {
    for (const text of new Set([String(original), String(original).replace(/\s+/gu, " ").trim()])) {
      const bounded = text.slice(0, 20000);
      for (let at = 0; at + event.textChars <= bounded.length; at += 1) {
        const fragment = bounded.slice(at, at + event.textChars);
        if (containsMarker(fragment, marker) && hash(fragment) === event.textSha256) return fragment;
      }
    }
  }
  return null;
}

// A control action must occur while the true final is still pending. This
// returns no fabricated final boundary and does not assess final acceptance.
export function assessH5PendingProgress({ diagnostics = [], events = [], energyWindows = [],
  backendPublicTexts = [], marker, now = Date.now() }) {
  if (!/^[0-9]{4}$/u.test(marker ?? "")) return { status: "missing" };
  for (const append of diagnostics.filter((event) => event.stage === "context-append-sent" &&
    event.kind === "progress" && event.channel === "speakable")) {
    const publicText = matchPublicFingerprint(append, backendPublicTexts, marker);
    if (!publicText) continue;
    const receive = diagnostics.find((event) => event.stage === "public-progress-received" &&
      event.traceId === append.traceId && event.delegationId === append.delegationId &&
      event.generation === append.generation && event.textSha256 === append.textSha256 &&
      event.at <= append.at && Number.isSafeInteger(event.provenance?.emittedAt) &&
      event.provenance.emittedAt <= event.at);
    if (!receive || diagnostics.some((event) => event.stage === "context-append-sent" && event.kind === "final" &&
      event.traceId === append.traceId && event.delegationId === append.delegationId && event.at <= now)) continue;
    const turns = events.filter((event) => event.type === "turn.done" && event.role === "assistant");
    for (const turn of turns) {
      const parts = events.filter((event) => event.type === "output_transcript.added" && event.at >= append.at && event.at <= now &&
        Number.isFinite(event.startMs) && Number.isFinite(event.endMs) &&
        Number.isFinite(turn.startMs) && Number.isFinite(turn.endMs) &&
        event.startMs >= turn.startMs - 500 && event.endMs <= turn.endMs + 500)
        .sort((a, b) => a.startMs - b.startMs || a.at - b.at);
      let prefix = "";
      for (const part of parts) {
        prefix += part.text;
        if (!containsMarker(prefix, marker)) continue;
        const pcm = energyWindows.filter((window) => window.at >= part.at && window.at <= now && window.rms > 2);
        return { status: pcm.length ? "observed-pending" : "transcript-only", publicText,
          emittedAt: receive.provenance.emittedAt, nativeAppendSentAt: append.at,
          nativeAppendChannel: append.channel, progressTranscriptAt: part.at,
          strictNonzeroPcmWindows: pcm.length, progressPrefix: prefix, marker,
          traceId: append.traceId, delegationId: append.delegationId, generation: append.generation };
      }
    }
  }
  return { status: "missing" };
}

export function assessH5ProgressProvenance({ diagnostics = [], events = [], energyWindows = [],
  backendPublicTexts = [], marker, initialUserText = "", markerToolResultReceivedAt = null }) {
  if (!/^[0-9]{4}$/u.test(marker ?? "")) return { status: "missing", reason: "Real exec marker absent" };
  if (containsMarker(initialUserText, marker)) return { status: "invalid-fixture", reason: "Initial input contains the generated marker" };
  for (const append of diagnostics.filter((event) => event.stage === "context-append-sent" &&
    event.kind === "progress" && event.channel === "speakable")) {
    const publicText = matchPublicFingerprint(append, backendPublicTexts, marker);
    if (!publicText) continue;
    const received = diagnostics.find((event) => event.stage === "public-progress-received" &&
      event.traceId === append.traceId && event.delegationId === append.delegationId &&
      event.generation === append.generation && event.textSha256 === append.textSha256 &&
      event.at <= append.at);
    const emittedAt = received?.provenance?.emittedAt;
    if (!Number.isSafeInteger(emittedAt) || emittedAt > received.at) continue;
    const final = diagnostics.find((event) => event.stage === "context-append-sent" && event.kind === "final" &&
      event.traceId === append.traceId && event.delegationId === append.delegationId &&
      event.generation === append.generation && event.at > append.at);
    if (!final) continue;
    const turns = events.filter((event) => event.type === "turn.done" && event.role === "assistant");
    for (const turn of turns) {
      const parts = events.filter((event) => event.type === "output_transcript.added" &&
        event.at >= append.at && event.at < final.at &&
        Number.isFinite(event.startMs) && Number.isFinite(event.endMs) &&
        Number.isFinite(turn.startMs) && Number.isFinite(turn.endMs) &&
        event.startMs >= turn.startMs - 500 && event.endMs <= turn.endMs + 500)
        .sort((a, b) => a.startMs - b.startMs || a.at - b.at);
      let prefix = "";
      for (const part of parts) {
        prefix += part.text;
        if (!containsMarker(prefix, marker)) continue;
        const pcm = energyWindows.filter((window) => window.at >= part.at && window.at < final.at && window.rms > 2);
        const execTiming = Number.isSafeInteger(markerToolResultReceivedAt) && markerToolResultReceivedAt <= emittedAt;
        return {
          status: pcm.length ? "observed" : "transcript-only",
          marker, backendPublicText: publicText, publicTextSha256: append.textSha256,
          emittedAt, nativeReceivedAt: received.at, nativeAppendSentAt: append.at,
          nativeAppendChannel: append.channel,
          progressTranscriptAt: part.at, finalAppendSentAt: final.at,
          progressPrefix: prefix, assistantTurnText: turn.text, assistantTurnAt: turn.at,
          strictNonzeroPcmWindows: pcm.length,
          firstStrictPcmBeforeFinalMs: pcm.length ? final.at - pcm[0].at : null,
          prefixBeforeFinalMs: final.at - part.at,
          markerToolResultReceivedAt, actualExecTimingVerified: execTiming,
          association: "public output fingerprint + native turn start/end interval; persistence is not emission",
        };
      }
    }
  }
  return { status: "missing", reason: "No public marker emit → successful native append → early transcript/PCM chain" };
}

export function assessH5FinalAndMirrors(witness, diagnostics, events) {
  const finalSends = diagnostics.filter((event) => event.stage === "context-append-sent" && event.kind === "final");
  const progressSends = diagnostics.filter((event) => event.stage === "context-append-sent" && event.kind === "progress");
  const seen = new Set();
  let repeatedPublicAppends = 0;
  for (const event of progressSends) {
    const key = [event.traceId, event.delegationId, event.generation, event.textSha256].join(":");
    if (seen.has(key) && event.chunkIndex === 0) repeatedPublicAppends += 1;
    seen.add(key);
  }
  const afterFinal = events.filter((event) => event.type === "turn.done" && event.role === "assistant" &&
    finalSends.some((send) => event.at >= send.at));
  const transcript = afterFinal.at(-1)?.text ?? "";
  const expected = witness.childTimestamp;
  const spoken = parseCompleteTimestamps(transcript);
  const backend = parseCompleteTimestamps(witness.parentFinalText);
  const allMatch = expected && spoken.length > 0 && backend.length > 0 &&
    [...spoken, ...backend].every((time) => timestampEqual(time, expected));
  return {
    finalAppendCount: new Set(finalSends.map((event) => event.traceId + ":" + event.appendId)).size,
    repeatedPublicAppends,
    finalTimestampStatus: allMatch ? "match" : spoken.length ? "mismatch" : "manual-required",
    expected, spoken, nativeFinalText: transcript,
    finalMarkerMatches: Boolean(witness.marker && containsMarker(transcript, witness.marker)),
    humanListeningAccepted: false,
  };
}
