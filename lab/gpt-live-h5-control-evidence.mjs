import {parseCompleteTimestamps} from "./gpt-live-call-live-evidence.mjs";
import {createHash} from "node:crypto";
import {publicMessageText,matchesGeneratedMarker,assessH5PendingProgress} from "./gpt-live-h5-provenance-evidence.mjs";

// Link the real date result to the requested sleep+date exec, including an
// exec-owned process session. Persisted history time never supplies execution
// time; an explicit numeric timezone in the actual tool output does.
export function extractControlExecWitness(history = {}, seconds = 45) {
  const messages = history.messages ?? [];
  const calls = messages.flatMap(message => (Array.isArray(message.content) ? message.content : [])
    .filter(part => part.type === "toolCall"));
  const resultFor = call => messages.find(message => message.role === "toolResult" &&
    (message.toolCallId ?? message.tool_call_id) === call.id);
  for (const exec of calls.filter(call => call.name === "exec" &&
      new RegExp("\\bsleep\\s+" + seconds + "\\b", "u").test(call.arguments?.command ?? "") &&
      /\bdate\b/u.test(call.arguments?.command ?? ""))) {
    const initial = resultFor(exec), initialText = publicMessageText(initial);
    const sessionId = initial?.details?.sessionId ??
      /(?:session ID\s+|\(session\s+)([a-zA-Z0-9_-]+)/iu.exec(initialText)?.[1] ?? null;
    const candidates = [{call: exec, result: initial}];
    if (sessionId) for (const followup of calls.filter(call => call.name === "process" &&
        (call.arguments?.sessionId ?? call.arguments?.session_id) === sessionId)) {
      candidates.push({call: followup, result: resultFor(followup)});
    }
    for (const candidate of candidates) {
      const text = publicMessageText(candidate.result), times = parseCompleteTimestamps(text);
      const offset = /([+-])(\d{2}):?(\d{2})\b/u.exec(text);
      if (times.length !== 1 || !offset || Number(offset[2]) > 23 || Number(offset[3]) > 59) continue;
      const fields = times[0], offsetMinutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "-" ? -1 : 1);
      return {command: exec.arguments.command, execCallId: exec.id, resultCallId: candidate.call.id,
        processSessionId: sessionId, resultText: text, fields, offsetMinutes,
        actualCommandTime: Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second) - offsetMinutes * 60000};
    }
  }
  return null;
}

// Acoustic and native-event gates for the synthetic slow-count/barge case.
// Recent sound followed by ordinary sentence pauses is insufficient.
export function assessH5BargeInterruption({ events = [], remoteWindows = [], microphoneWindows = [],
  chatAt, bargeAt, pcIndex = 0, finalAppendAt = null }) {
  const input = microphoneWindows.filter((window) => window.label === "barge" && window.pcIndex === pcIndex && window.rms > .005);
  const firstInput = input[0];
  if (!firstInput) return { status: "missing", reason: "No actual barge microphone PCM" };
  const remote = remoteWindows.filter((window) => window.pcIndex === pcIndex).sort((a, b) => a.at - b.at);
  const overlap = input.filter((mic) => mic.at <= firstInput.at + 500 && remote.some((out) =>
    out.rms > 2 && Math.abs(out.at - mic.at) <= 100));
  let current = [], quietRun = [];
  for (const out of remote.filter((window) => window.at >= firstInput.at && window.at <= firstInput.at + 3000)) {
    const micIsSpeaking = input.some((mic) => Math.abs(mic.at - out.at) <= 100);
    if (out.rms <= 2 && micIsSpeaking && (!current.length || out.at - current.at(-1).at <= 160)) {
      current.push(out);
      if (current.length > quietRun.length) quietRun = [...current];
    } else current = [];
  }
  const created = events.filter((event) => event.pcIndex === pcIndex && event.type === "turn.created" &&
    event.role === "assistant" && event.at >= chatAt && event.at <= bargeAt).at(-1);
  const done = created && events.find((event) => event.pcIndex === pcIndex && event.type === "turn.done" &&
    event.role === "assistant" && event.turnId === created.turnId &&
    event.at >= firstInput.at && event.at <= firstInput.at + 3000 &&
    input.some((mic) => Math.abs(mic.at - event.at) <= 100));
  const explicit = created && events.find((event) => event.pcIndex === pcIndex && event.turnId === created.turnId &&
    event.at >= firstInput.at && event.at <= firstInput.at + 3000 &&
    (/interrupt|cancel|barge/iu.test(event.type ?? "") ||
      /interrupt|cancel|barge/iu.test(event.turnStatus ?? "") ||
      /interrupt|cancel|barge/iu.test(event.interruptReason ?? "")));
  const countingPrefix = created && events.filter((event) => event.pcIndex === pcIndex &&
    event.type === "output_transcript.added" && event.at >= created.at && event.at <= bargeAt)
    .map((event) => event.text).join("");
  const countStarted = /(?:一[、，,\s]*二|1[、，,\s]*2)/u.test(countingPrefix ?? "");
  const countedTen = /(?:九[、，,\s]*十|9[、，,\s]*10|(?:^|[、，,\s])(?:十|10)(?:$|[。.!！、，,\s]))/u.test(done?.text ?? "");
  const truncatedCountingTurn = Boolean(done && countStarted && !countedTen);
  const continuousQuiet = quietRun.length >= 5 && quietRun.at(-1).at - quietRun[0].at >= 400;
  const pending = finalAppendAt === null || finalAppendAt > firstInput.at + 3000;
  const proved = overlap.length > 0 && continuousQuiet && pending && Boolean(explicit || truncatedCountingTurn);
  return {
    status: proved ? "observed" : "unproven",
    firstUserPcmAt: firstInput.at, strictOverlapWindows: overlap.length,
    continuousQuietWindows: quietRun.length,
    continuousQuietDurationMs: quietRun.length ? quietRun.at(-1).at - quietRun[0].at : 0,
    explicitNativeInterruption: explicit ? { type: explicit.type, at: explicit.at, turnStatus: explicit.turnStatus, interruptReason: explicit.interruptReason } : null,
    countingTurnId: created?.turnId ?? null, countingPrefix: countingPrefix ?? "",
    countingTurnDoneAt: done?.at ?? null, countingTurnText: done?.text ?? "",
    countingTurnTruncatedDuringUserSpeech: truncatedCountingTurn,
    originalBackendStillPendingDuringInterruption: pending,
    humanListeningAccepted: false,
  };
}


export function assessControlFinalFacts({events = [], marker, execWitness, finalAppendAt}) {
  const text = events.filter(event => event.type === "turn.done" && event.role === "assistant" &&
    event.at >= finalAppendAt).at(-1)?.text ?? "";
  const spoken = parseCompleteTimestamps(text), expected = execWitness?.fields;
  const sixFieldsMatch = Boolean(expected && spoken.length && spoken.every(time =>
    ["year", "month", "day", "hour", "minute", "second"].every(key => time[key] === expected[key])));
  const markerMatches = Boolean(marker && matchesExactControlMarker(text, marker));
  return {status: sixFieldsMatch && markerMatches ? "match" : "unproven", sixFieldsMatch, markerMatches,
    expected: expected ?? null, spoken, nativeFinalText: text, humanListeningAccepted: false};
}


export function assessControlExecPending(history = {}, seconds = 45) {
  const messages = history.messages ?? [];
  const calls = messages.flatMap(message => (Array.isArray(message.content) ? message.content : [])
    .filter(part => part.type === "toolCall"));
  const resultFor = call => messages.find(message => message.role === "toolResult" &&
    (message.toolCallId ?? message.tool_call_id) === call.id);
  const exec = calls.filter(call => call.name === "exec" &&
    new RegExp("\\bsleep\\s+[\"']?" + seconds + "(?:s)?[\"']?(?=\\s|[;&|]|$)", "u").test(call.arguments?.command ?? "") &&
    /\bdate\b/u.test(call.arguments?.command ?? "")).at(-1);
  if (!exec) return {status: "missing-exec", pending: false};
  const result = resultFor(exec), text = publicMessageText(result);
  const sessionId = result?.details?.sessionId ??
    /(?:session ID\s+|\(session\s+)([a-zA-Z0-9_-]+)/iu.exec(text)?.[1] ?? null;
  const linked = sessionId ? calls.filter(call => call.name === "process" &&
    (call.arguments?.sessionId ?? call.arguments?.session_id) === sessionId) : [];
  const ownedResults = [result, ...linked.map(resultFor)].filter(Boolean);
  const completed = ownedResults.find(row => parseCompleteTimestamps(publicMessageText(row)).length ||
    /Process exited|exited with code|Session .*not found/iu.test(publicMessageText(row)) ||
    row.isError || ["exited", "completed", "failed", "cancelled", "error"].includes(row.details?.status));
  const base = {execCallId: exec.id, command: exec.arguments.command, processSessionId: sessionId,
    linkedProcessCallIds: linked.map(call => call.id)};
  if (completed) return {...base, status: "completed-or-failed", pending: false};
  if (linked.some(call => ["kill", "remove"].includes(call.arguments?.action))) return {...base, status: "termination-requested", pending: false};
  if (!result) return {...base, status: "requested-awaiting-tool-result", pending: true};
  const running = Boolean(sessionId && (result.details?.status === "running" || /still running|process running|running with session/iu.test(text)));
  return {...base, status: running ? "running-owned-process" : "unproven-tool-state", pending: running};
}

// Exact numeric tokens prevent 43034303 from counting as the four-digit 4303.
export function matchesExactControlMarker(text, marker) {
  const digits = {零:"0",〇:"0",一:"1",二:"2",两:"2",三:"3",四:"4",五:"5",六:"6",七:"7",八:"8",九:"9"};
  const normalized = String(text).replace(/[零〇一二两三四五六七八九]/gu, value => digits[value]);
  if ([...normalized.matchAll(/[0-9]+/gu)].some(match => match[0] === marker)) return true;
  for (const match of String(text).matchAll(/[零〇一二两三四五六七八九十百千]{2,12}/gu)) {
    let sum = 0, digit = 0;
    for (const char of match[0]) {
      if (char in digits) digit = Number(digits[char]);
      else {sum += (digit || 1) * ({十:10,百:100,千:1000}[char]); digit = 0;}
    }
    if (sum + digit === Number(marker) && /[十百千]/u.test(match[0])) return true;
  }
  return false;
}

export function assessControlPendingProgress({diagnostics = [], events = [], energyWindows = [],
  backendPublicTexts = [], marker, currentOwnerId, pcIndex = 0, now = Date.now()}) {
  if (!/^[0-9]{4}$/u.test(marker ?? "") || !currentOwnerId) return {status: "missing", reason: "Current owner and real generated marker required"};
  const owned = diagnostics.filter(event => event.delegationId === currentOwnerId);
  const current = owned.at(-1);
  if (!current) return {status: "missing", reason: "No current owner public diagnostic"};
  const trace = owned.filter(event => event.traceId === current.traceId && event.generation === current.generation);
  const local = events.filter(event => event.pcIndex === pcIndex);
  if (local.filter(event => event.role === "user" && event.type === "turn.done")
      .some(event => matchesExactControlMarker(event.text, marker))) return {status: "unproven", reason: "Initial user speech already contains marker"};
  if (trace.some(event => event.kind === "final" && event.stage === "context-append-sent" && event.at <= now))
    return {status: "final-already-sent"};
  const earliestAppendAt = trace.filter(event => event.kind === "progress" && event.stage === "context-append-sent").at(0)?.at ?? Infinity;
  const completed = assessH5PendingProgress({diagnostics: trace,
    events: local.filter(event => event.type !== "turn.done" || event.role !== "assistant" || event.at >= earliestAppendAt),
    energyWindows: energyWindows.filter(window => window.pcIndex === pcIndex), backendPublicTexts, marker, now});
  if (completed.status === "observed-pending" && matchesExactControlMarker(completed.progressPrefix, marker))
    return {...completed, association: "completed native progress turn, final pending"};
  const open = local.filter(event => event.type === "turn.created" && event.role === "assistant" &&
    Number.isFinite(event.startMs) && event.at <= now &&
    !local.some(end => end.type === "turn.done" && end.turnId === event.turnId && end.at <= now)).at(-1);
  if (!open) return {...completed, reason: "No attributable completed or ongoing assistant turn"};
  const following = local.filter(event => event.type === "turn.created" && event.at > open.at).at(0);
  for (const append of trace.filter(event => event.stage === "context-append-sent" && event.kind === "progress" && event.at <= now)) {
    const receive = trace.find(event => event.stage === "public-progress-received" && event.textSha256 === append.textSha256 &&
      event.at <= append.at && Number.isSafeInteger(event.provenance?.emittedAt) && event.provenance.emittedAt <= event.at);
    if (!receive || !Number.isSafeInteger(append.textChars) || append.textChars < 1 || append.textChars > 20000) continue;
    let publicText = null;
    for (const original of backendPublicTexts) {
      for (const text of new Set([String(original), String(original).replace(/\s+/gu," ").trim()])) {
        for (let at = 0; at + append.textChars <= Math.min(text.length,20000); at++) {
          const part = text.slice(at, at + append.textChars);
          if (matchesExactControlMarker(part, marker) && createHash("sha256").update(part).digest("hex") === append.textSha256) {publicText = part; break;}
        }
        if (publicText) break;
      }
      if (publicText) break;
    }
    if (!publicText) continue;
    const parts = local.filter(event => event.type === "output_transcript.added" && event.at >= append.at && event.at <= now &&
      Number.isFinite(event.startMs) && Number.isFinite(event.endMs) && event.startMs >= open.startMs &&
      event.endMs >= event.startMs && (!following || event.endMs <= following.startMs));
    let prefix = "", previousEnd = open.startMs;
    for (const part of parts) {
      if (part.startMs < previousEnd) break;
      previousEnd = part.endMs; prefix += part.text;
      if (!matchesExactControlMarker(prefix,marker)) continue;
      const pcm = energyWindows.filter(window => window.pcIndex === pcIndex && window.at >= part.at && window.at <= now && window.rms > 2);
      return {status: pcm.length ? "observed-pending" : "transcript-only", publicText, marker,
        emittedAt: receive.provenance.emittedAt, nativeAppendSentAt: append.at, progressTranscriptAt: part.at,
        strictNonzeroPcmWindows: pcm.length, progressPrefix: prefix, traceId: append.traceId,
        delegationId: append.delegationId, generation: append.generation, turnId: open.turnId,
        association: "ongoing native output stream, final pending"};
    }
  }
  return {...completed, reason: "Ongoing stream lacks exact public SHA/nonce/PCM chain"};
}
