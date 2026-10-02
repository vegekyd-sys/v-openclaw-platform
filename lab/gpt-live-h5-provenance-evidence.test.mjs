import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parsePublicProgressDiagnostics, extractH5WorkflowWitness,
  assessH5ProgressProvenance, assessH5FinalAndMirrors, assessH5PendingProgress } from "./gpt-live-h5-provenance-evidence.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const publicText = "真实测试码是 7231。";
function evidence() {
  const common = { traceId: "trace-1", delegationId: "delegation-1", generation: 1,
    textSha256: hash(publicText), textChars: publicText.length, kind: "progress" };
  return {
    marker: "7231", initialUserText: "请后台生成一个随机测试码，再等待子代理返回真实时间。",
    backendPublicTexts: ["准备开始。 " + publicText + " 后台正在执行。"],
    markerToolResultReceivedAt: 90,
    diagnostics: [
      { ...common, stage: "public-progress-received", at: 101, provenance: { emittedAt: 100, runId: "run-1", source: "reply", sequence: 1 } },
      { ...common, stage: "context-append-sent", at: 102, appendId: 1, chunkIndex: 0, chunkCount: 1 },
      { ...common, stage: "context-append-sent", kind: "final", at: 200, appendId: 2 },
    ],
    events: [
      { type: "output_transcript.added", at: 110, startMs: 0, endMs: 100, text: "后台测试码是 " },
      { type: "output_transcript.added", at: 120, startMs: 100, endMs: 200, text: "七二三一。" },
      { type: "turn.done", role: "assistant", at: 220, startMs: 0, endMs: 900, text: "后台测试码是七二三一。最终时间是2026年10月2日18时18分55秒。" },
    ],
    energyWindows: [{ at: 119, rms: 20 }, { at: 125, rms: 20 }, { at: 201, rms: 20 }],
  };
}

test("grounding joins actual public fingerprint, emit/send, transcript prefix and strict PCM interval", () => {
  const actual = assessH5ProgressProvenance(evidence());
  assert.equal(actual.status, "observed");
  assert.equal(actual.backendPublicText, publicText);
  assert.equal(actual.emittedAt, 100);
  assert.equal(actual.nativeAppendSentAt, 102);
  assert.equal(actual.progressTranscriptAt, 120);
  assert.equal(actual.strictNonzeroPcmWindows, 1);
  assert.equal(actual.firstStrictPcmBeforeFinalMs, 75);
  assert.equal(actual.actualExecTimingVerified, true);
  // A turn can contain progress and final; its completion need not precede final.
  assert.equal(actual.assistantTurnAt, 220);
});

test("initial instruction echo, guessed early speech and missing emit boundaries are rejected", () => {
  const echo = evidence(); echo.initialUserText += "测试码7231";
  assert.equal(assessH5ProgressProvenance(echo).status, "invalid-fixture");
  const guessed = evidence(); guessed.events[1].at = 99;
  assert.equal(assessH5ProgressProvenance(guessed).status, "missing");
  const persisted = evidence(); delete persisted.diagnostics[0].provenance;
  assert.equal(assessH5ProgressProvenance(persisted).status, "missing");
  const wrongSource = evidence(); wrongSource.backendPublicTexts = ["完全无关的后台公开内容。"];
  assert.equal(assessH5ProgressProvenance(wrongSource).status, "missing");
});

test("acknowledgment PCM before the marker prefix cannot pass acoustic acceptance", () => {
  const data = evidence(); data.energyWindows = [{ at: 105, rms: 20 }, { at: 119, rms: 20 }, { at: 201, rms: 20 }];
  assert.equal(assessH5ProgressProvenance(data).status, "transcript-only");
  assert.equal(assessH5ProgressProvenance(data).strictNonzeroPcmWindows, 0);
});

test("the public receive and successful append must retain delegation ownership", () => {
  for (const key of ["traceId", "delegationId", "generation"]) {
    const data = evidence(); data.diagnostics[1][key] = key === "generation" ? 2 : "new-owner";
    assert.equal(assessH5ProgressProvenance(data).status, "missing");
  }
  const late = evidence(); late.diagnostics[0].provenance.emittedAt = 150;
  assert.equal(assessH5ProgressProvenance(late).status, "missing");
});

test("tool-result timing is recorded separately instead of inferred from persisted history", () => {
  const data = evidence(); data.markerToolResultReceivedAt = null;
  const actual = assessH5ProgressProvenance(data);
  assert.equal(actual.status, "observed");
  assert.equal(actual.actualExecTimingVerified, false);
  assert.equal(actual.markerToolResultReceivedAt, null);
});

function historyFixture() {
  const assistant = (content, timestamp) => ({ role: "assistant", content, timestamp });
  const tool = (id, text, timestamp) => ({ role: "toolResult", toolCallId: id, content: [{ type: "text", text }], timestamp });
  const parent = { messages: [
    assistant([{ type: "toolCall", id: "marker", name: "exec", arguments: { command: "python3 -c 'import random; print(random.randint(1000, 9999))'" } }], 1),
    tool("marker", "TASK_MARKER=7231", 9999),
    assistant([{ type: "text", text: publicText }], 10000),
    assistant([{ type: "toolCall", id: "spawn", name: "sessions_spawn", arguments: { task: "sleep 8 and date" } }], 3),
    tool("spawn", '{"status":"accepted","childSessionKey":"child-1","runId":"child-run"}', 4),
    assistant([{ type: "toolCall", id: "yield", name: "sessions_yield", arguments: {} }], 5),
    tool("yield", '{"status":"yielded"}', 6),
    assistant([{ type: "text", text: "测试码7231，2026年10月2日18时18分55秒，CST。" }], 8),
  ] };
  const child = { messages: [
    assistant([{ type: "toolCall", id: "exec", name: "exec", arguments: { command: 'sleep 8; date "+%Y-%m-%d %H:%M:%S %Z %z"' } }], 6),
    tool("exec", "2026-10-02 18:18:55 CST +0800", 7),
    assistant([{ type: "text", text: "2026年10月2日18时18分55秒，CST。" }], 8),
  ] };
  return { parent, child };
}

test("workflow witness requires linked spawn/yield and real child exec and parent numeric result", () => {
  const { parent, child } = historyFixture();
  const actual = extractH5WorkflowWitness(parent, { "child-1": child });
  assert(actual.markerGeneratedByExec && actual.spawnAccepted && actual.yielded && actual.parentResumedWithResult);
  assert.equal(actual.marker, "7231");
  assert.equal(actual.childKey, "child-1");
  assert.deepEqual(actual.childTimestamp, { year: 2026, month: 10, day: 2, hour: 18, minute: 18, second: 55 });
  assert.equal("emittedAt" in actual, false);
  const incomplete = extractH5WorkflowWitness(parent);
  assert.equal(incomplete.parentResumedWithResult, false);
});

test("constant marker, incomplete child time and mismatched final remain failures", () => {
  const { parent, child } = historyFixture();
  for (const command of ["shuf -i 1000-9999 -n 1", "openssl rand -hex 2", "node -e 'console.log(crypto.randomInt(1000,10000))'"]) {
    parent.messages[0].content[0].arguments.command = command;
    assert.equal(extractH5WorkflowWitness(parent, { "child-1": child }).markerGeneratedByExec, true);
  }
  for (const command of ["date +%N", "uuidgen", "printf TASK_MARKER=7231"]) {
    parent.messages[0].content[0].arguments.command = command;
    assert.equal(extractH5WorkflowWitness(parent, { "child-1": child }).markerGeneratedByExec, false);
  }
  parent.messages[0].content[0].arguments.command = "printf TASK_MARKER=7231";
  assert.equal(extractH5WorkflowWitness(parent, { "child-1": child }).markerGeneratedByExec, false);
  child.messages[1].content[0].text = "2026-10-02 18:18";
  assert.equal(extractH5WorkflowWitness(parent, { "child-1": child }).parentResumedWithResult, false);
});

test("final numeric integrity and mirror count are independent gates", () => {
  const { parent, child } = historyFixture();
  const witness = extractH5WorkflowWitness(parent, { "child-1": child });
  const data = evidence();
  const actual = assessH5FinalAndMirrors(witness, data.diagnostics, data.events);
  assert.equal(actual.finalAppendCount, 1);
  assert.equal(actual.repeatedPublicAppends, 0);
  assert.equal(actual.finalTimestampStatus, "match");
  assert.equal(actual.finalMarkerMatches, true);
  data.diagnostics.push({ ...data.diagnostics[1], at: 160, appendId: 3 });
  assert.equal(assessH5FinalAndMirrors(witness, data.diagnostics, data.events).repeatedPublicAppends, 1);
  data.events.at(-1).text = "测试码7231，2026年10月2日18时18分54秒。";
  assert.equal(assessH5FinalAndMirrors(witness, data.diagnostics, data.events).finalTimestampStatus, "mismatch");
});

test("diagnostic parser ignores malformed/unrelated logs without accepting intention-only boundaries", () => {
  const event = { version: 1, at: 100, textSha256: hash(publicText), stage: "public-progress-received" };
  const parsed = parsePublicProgressDiagnostics("noise\n[info] GPT_LIVE_PUBLIC_PROGRESS " + JSON.stringify(event) + "\nGPT_LIVE_PUBLIC_PROGRESS bad json\n");
  assert.deepEqual(parsed, [event]);
  assert.equal(parsed.some((entry) => entry.stage === "context-append-sent"), false);
});

test("control preview requires grounded progress with PCM while the real final is still pending", () => {
  const data = evidence(); data.now = 150;
  assert.equal(assessH5PendingProgress(data).status, "observed-pending");
  data.now = 210;
  assert.equal(assessH5PendingProgress(data).status, "missing");
  data.now = 150; data.energyWindows = [];
  assert.equal(assessH5PendingProgress(data).status, "transcript-only");
});
