import assert from "node:assert/strict";
import test from "node:test";
import { assessH5BargeInterruption, extractControlExecWitness, assessControlFinalFacts } from "./gpt-live-h5-control-evidence.mjs";
function fixture() {
  return {
    pcIndex: 0, chatAt: 10, bargeAt: 90, finalAppendAt: 10000,
    events: [
      { type: "turn.created", role: "assistant", turnId: "count-1", at: 20, pcIndex: 0 },
      { type: "output_transcript.added", text: "一，二，三", at: 80, pcIndex: 0 },
      { type: "turn.done", role: "assistant", turnId: "count-1", text: "一，二，三", at: 180, pcIndex: 0 },
    ],
    microphoneWindows: Array.from({ length: 7 }, (_, at) => ({ at: 100 + at * 100, rms: .1, label: "barge", pcIndex: 0 })),
    remoteWindows: [{ at: 100, rms: 20, pcIndex: 0 },
      ...Array.from({ length: 6 }, (_, at) => ({ at: 200 + at * 100, rms: 0, pcIndex: 0 }))],
  };
}
test("same-window user/output overlap and a truncated counting turn support actual interruption", () => {
  const result = assessH5BargeInterruption(fixture());
  assert.equal(result.status, "observed");
  assert.equal(result.strictOverlapWindows, 2);
  assert(result.continuousQuietDurationMs >= 400);
  assert(result.countingTurnTruncatedDuringUserSpeech);
});
test("old sound and three ordinary pauses never prove a barge-in", () => {
  const data = fixture(); data.remoteWindows = [
    { at: -100, rms: 20, pcIndex: 0 },
    { at: 200, rms: 0, pcIndex: 0 }, { at: 600, rms: 0, pcIndex: 0 }, { at: 1000, rms: 0, pcIndex: 0 }];
  assert.equal(assessH5BargeInterruption(data).status, "unproven");
});
test("naturally completed counting and silence cannot pass without native interruption evidence", () => {
  const data = fixture(); data.events.at(-1).text = "一，二，三，四，五，六，七，八，九，十";
  assert.equal(assessH5BargeInterruption(data).status, "unproven");
  data.events.at(-1).turnStatus = "interrupted";
  assert.equal(assessH5BargeInterruption(data).status, "observed");
});
test("a different turn or backend final during the barge is not the targeted pause", () => {
  const data = fixture(); data.events.at(-1).turnId = "other-turn";
  assert.equal(assessH5BargeInterruption(data).status, "unproven");
  data.events.at(-1).turnId = "count-1"; data.finalAppendAt = 200;
  assert.equal(assessH5BargeInterruption(data).status, "unproven");
});


test("an unrelated native interruption cannot stand in for the actual counting turn", () => {
  const data = fixture();
  data.events.at(-1).turnId = "other-turn";
  data.events.push({ type: "turn.done", turnId: "other-turn", turnStatus: "interrupted", at: 180, pcIndex: 0 });
  assert.equal(assessH5BargeInterruption(data).status, "unproven");
});
test("a counting turn ended after user speech cannot prove it was cut off by that speech", () => {
  const data = fixture(); data.events.at(-1).at = 1800;
  assert.equal(assessH5BargeInterruption(data).status, "unproven");
});


test("late completion uses exact sleep exec output and numeric timezone, never persistence time", () => {
  const history = {messages: [
    {role: "assistant", content: [{type: "toolCall", name: "exec", id: "sleep-1", arguments: {command: "sleep 45; date '+%Y-%m-%d %H:%M:%S %z %Z'"}}]},
    {role: "toolResult", toolCallId: "sleep-1", timestamp: 1, content: [{type: "text", text: "2026-10-02 20:58:48 +0800 CST"}]},
  ]};
  const result = extractControlExecWitness(history);
  assert.equal(result.actualCommandTime, Date.UTC(2026, 9, 2, 12, 58, 48));
  assert.equal(result.execCallId, "sleep-1");
  history.messages[1].content[0].text = "Fri Oct  2 08:58:48 PM CST 2026";
  assert.equal(extractControlExecWitness(history), null, "Ambiguous zone abbreviation cannot prove UTC execution time");
});
test("async process result must belong to the real long exec session", () => {
  const history = {messages: [
    {role: "assistant", content: [{type: "toolCall", name: "exec", id: "sleep-1", arguments: {command: "sleep 45 && date '+%F %T %z'"}}]},
    {role: "toolResult", toolCallId: "sleep-1", content: [{type: "text", text: "Command still running (session quiet-tree, pid 123)."}]},
    {role: "assistant", content: [{type: "toolCall", name: "process", id: "poll-1", arguments: {sessionId: "other-session", action: "poll"}}]},
    {role: "toolResult", toolCallId: "poll-1", content: [{type: "text", text: "2026-10-02 20:58:48 +0800"}]},
  ]};
  assert.equal(extractControlExecWitness(history), null);
  history.messages[2].content[0].arguments.sessionId = "quiet-tree";
  const result = extractControlExecWitness(history);
  assert.equal(result.resultCallId, "poll-1");
  assert.equal(result.processSessionId, "quiet-tree");
});


test("retained original task requires exact real exec date and marker in native final", () => {
  const data = {finalAppendAt: 100, marker: "2773", execWitness: {fields: {year: 2026, month: 10, day: 2, hour: 20, minute: 58, second: 48}},
    events: [{type: "turn.done", role: "assistant", at: 200, text: "测试码2773，时间2026年10月2日20时58分48秒。"}]};
  assert.equal(assessControlFinalFacts(data).status, "match");
  data.events[0].text = "测试码4837，时间2026年10月2日20时58分48秒。";
  assert.equal(assessControlFinalFacts(data).status, "unproven");
  data.events[0].text = "测试码2773，时间2026年10月2日20时58分49秒。";
  assert.equal(assessControlFinalFacts(data).status, "unproven");
});
