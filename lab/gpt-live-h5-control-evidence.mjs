import {parseCompleteTimestamps} from "./gpt-live-call-live-evidence.mjs";
import {publicMessageText,matchesGeneratedMarker} from "./gpt-live-h5-provenance-evidence.mjs";

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
  const markerMatches = Boolean(marker && matchesGeneratedMarker(text, marker));
  return {status: sixFieldsMatch && markerMatches ? "match" : "unproven", sixFieldsMatch, markerMatches,
    expected: expected ?? null, spoken, nativeFinalText: text, humanListeningAccepted: false};
}
