import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import { assessH5BargeInterruption, extractControlExecWitness, assessControlFinalFacts, assessControlExecPending, assessControlPendingProgress, matchesExactControlMarker } from "./gpt-live-h5-control-evidence.mjs";
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


function pendingFixture() {
  const text = "Test code confirmed: 4303.", textSha256 = createHash("sha256").update(text).digest("hex");
  return {marker:"4303",currentOwnerId:"owner-2",pcIndex:0,now:100,
    backendPublicTexts:[text],diagnostics:[
      {stage:"public-progress-received",kind:"progress",at:50,traceId:"trace",generation:2,delegationId:"owner-2",textSha256,textChars:text.length,provenance:{emittedAt:49}},
      {stage:"context-append-sent",kind:"progress",at:51,traceId:"trace",generation:2,delegationId:"owner-2",textSha256,textChars:text.length}],
    events:[{pcIndex:0,type:"turn.done",role:"user",turnId:"user",at:10,text:"请生成一个随机测试码。"},
      {pcIndex:0,type:"turn.created",role:"assistant",turnId:"ongoing",at:20,startMs:1000,endMs:1200},
      {pcIndex:0,type:"output_transcript.added",at:60,startMs:1400,endMs:1600,text:"测试码是430"},
      {pcIndex:0,type:"output_transcript.added",at:70,startMs:1600,endMs:1800,text:"3。"}],
    energyWindows:[{pcIndex:0,at:72,rms:20}]};
}
test("ongoing native assistant stream can ground control before its future turn.done", () => {
  const result = assessControlPendingProgress(pendingFixture());
  assert.equal(result.status,"observed-pending");
  assert.equal(result.association,"ongoing native output stream, final pending");
  assert.equal(result.progressTranscriptAt,70);
});
test("completed old turn and an unrelated open turn cannot supply pending control speech", () => {
  const data=pendingFixture();
  data.events[1].startMs=0;
  data.events.push({pcIndex:0,type:"turn.done",role:"assistant",turnId:"ongoing",at:40,startMs:0,endMs:1800,text:"测试码是4303。"});
  data.events.push({pcIndex:0,type:"turn.created",role:"assistant",turnId:"new",at:45,startMs:3000,endMs:3200});
  assert.notEqual(assessControlPendingProgress(data).status,"observed-pending");
});
test("late, wrong-owner, wrong-PC, initial-known or replayed prefix cannot pass pending control", () => {
  for(const alter of [
    data=>data.diagnostics.push({...data.diagnostics[1],kind:"final",at:65}),
    data=>{data.currentOwnerId="other-owner"},
    data=>{data.events[2].pcIndex=1;data.events[3].pcIndex=1},
    data=>{data.events[0].text="请读测试码4303。"},
    data=>{data.events[3].startMs=1400},
    data=>{data.energyWindows[0].at=65},
  ]){const data=pendingFixture();alter(data);assert.notEqual(assessControlPendingProgress(data).status,"observed-pending");}
});
test("running real exec with owned process handle stays pending until its own poll/date completes", () => {
  const history={messages:[
    {role:"assistant",content:[{type:"toolCall",name:"exec",id:"exec-1",arguments:{command:"sleep 45; date '+%F %T %z'"}}]},
    {role:"toolResult",toolCallId:"exec-1",content:[{type:"text",text:"Command still running (session blue-tree, pid 123)."}]},
    {role:"assistant",content:[{type:"toolCall",name:"process",id:"poll-1",arguments:{sessionId:"unrelated",action:"poll"}}]},
    {role:"toolResult",toolCallId:"poll-1",content:[{type:"text",text:"2026-10-02 20:58:48 +0800"}]},
  ]};
  assert.equal(assessControlExecPending(history).status,"running-owned-process");
  history.messages[2].content[0].arguments.sessionId="blue-tree";
  assert.equal(assessControlExecPending(history).status,"completed-or-failed");
  assert.equal(assessControlExecPending(history).pending,false);
});
test("finished or refused tool cannot count as running just because it lacks a date", () => {
  const history={messages:[{role:"assistant",content:[{type:"toolCall",name:"exec",id:"exec-1",arguments:{command:"sleep 45s && date"}}]}]};
  assert(assessControlExecPending(history).pending);
  history.messages.push({role:"toolResult",toolCallId:"exec-1",isError:true,content:[{type:"text",text:"Execution refused"}]});
  assert.equal(assessControlExecPending(history).pending,false);
});
test("actual doubled code chunks are not accepted as exact four-digit final", () => {
  assert(matchesExactControlMarker("测试码是4303。","4303"));
  assert(matchesExactControlMarker("测试码是四千三百零三。","4303"));
  assert(!matchesExactControlMarker("测试码是43034303。","4303"));
  const data={finalAppendAt:100,marker:"4303",execWitness:{fields:{year:2026,month:10,day:2,hour:21,minute:35,second:11}},
    events:[{type:"turn.done",role:"assistant",at:200,text:"测试码是43034303。2026年10月2日21时35分11秒。"}]};
  assert.equal(assessControlFinalFacts(data).status,"unproven");
});
