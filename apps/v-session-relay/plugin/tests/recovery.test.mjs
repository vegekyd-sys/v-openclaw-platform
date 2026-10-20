// §6.3 restart recovery, one scenario per branch. The "crash" stops the old engine right at a
// ledger write (in process: onCrash throws, so nothing after that write happens), then a new
// engine on the same directory recovers. The fake bridge keeps its posts and Feishu uuid dedupe
// across the restart, like the real Feishu server.
import assert from "node:assert/strict";
import { test } from "node:test";

import { runIdFor } from "../core/contracts.js";
import { DM, ROOM, X, createWorld, sleep, waitFor } from "./fixtures/harness.mjs";

const crash = (at) => ({ crashAt: at, onCrash: () => { throw new Error(`simulated crash at ${at}`); } });
const ok = (text) => ({ status: "ok", finals: [{ text }], visibleReplySent: true, finalCount: 1 });
const startOf = (w, kind, id) => w.starts(kind).filter((c) => c.args.id === id);
const only = (w) => w.ledger.sendsWhere(() => true)[0];
const anchors = (w, code) => w.posts().filter((p) => p.text.startsWith("📨") && p.text.includes(`#${code}`));
const handbacks = (w) => w.posts().filter((p) => /^(↩️|⚠️「|⏹「|💬)/u.test(p.text));

async function settledOnce(w, sendId, { wakeText } = {}) {
  await waitFor(() => w.rec(sendId)?.phase === "handed_back", { what: "handed_back after recovery", timeoutMs: 4000 });
  await w.recovery;
  await sleep(40);
  const wakes = w.starts("wake").filter((c) => c.args.sessionKey === DM);
  assert.equal(wakes.length, 1, "exactly one wake");
  if (wakeText) assert.match(wakes[0].args.promptText, wakeText);
  return wakes[0];
}

test("recovery: accepted (record on disk, batch not) — anchor posted, run, one wake", async () => {
  const w = await createWorld({ ledger: crash("accepted") });
  try {
    const r = await w.send(DM, X, "崩在受理", { runId: "rA" });
    assert.deepEqual([r.status, r.code], ["error", "LEDGER"]);
    assert.equal(w.posts().length, 0);
    await w.restart();
    const rec = only(w);
    await settledOnce(w, rec.sendId, { wakeText: /done s_/u });
    assert.equal(anchors(w, rec.code).length, 1);
    assert.equal(startOf(w, "request", rec.sendId).length, 1);
  } finally { await w.close(); }
});

test("recovery: posting with the post already out — re-posted with the same uuid, Feishu dedupes, no second anchor", async () => {
  const w = await createWorld({ ledger: crash("before:posted") });
  try {
    await w.send(DM, X, "崩在发锚点之后", { runId: "rA" });
    const rec = only(w);
    assert.equal(rec.phase, "posting");
    assert.equal(anchors(w, rec.code).length, 1);
    await w.restart();
    await settledOnce(w, rec.sendId);
    const posts = w.fake.callsOf("post").filter((c) => c.args.text.startsWith("📨"));
    assert.equal(posts.length, 2);
    assert.equal(posts[0].args.idempotencyKey, posts[1].args.idempotencyKey);
    assert.equal(posts[1].outcome.deduped, true);
    assert.equal(anchors(w, rec.code).length, 1, "people see one request");
  } finally { await w.close(); }
});

test("recovery: posted / queued — queued again with attempt+1 (new runId and MessageSid)", async () => {
  const w = await createWorld({ ledger: crash("posted") });
  try {
    await w.send(DM, X, "崩在已发锚点", { runId: "rA" });
    const rec = only(w);
    await w.restart();
    await settledOnce(w, rec.sendId);
    const starts = startOf(w, "request", rec.sendId);
    assert.equal(starts.length, 1);
    assert.equal(starts[0].args.attempt, 1);
    assert.equal(starts[0].args.runId, runIdFor("request", rec.sendId, 1));
  } finally { await w.close(); }
});

test("recovery: starting without a transcript tag — never started, queued again", async () => {
  const w = await createWorld({ ledger: crash("starting") });
  try {
    await w.send(DM, X, "崩在开跑前", { runId: "rA" });
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    assert.equal(startOf(w, "request", rec.sendId).length, 0);
    await w.restart();
    await settledOnce(w, rec.sendId);
    assert.deepEqual(startOf(w, "request", rec.sendId).map((s) => s.args.attempt), [1]);
  } finally { await w.close(); }
});

test("recovery: starting with the tag in the transcript — it ran; not re-run; reported interrupted on both sides", async () => {
  const w = await createWorld({ ledger: crash("before:running"), bridge: { holdRuns: true } });
  try {
    await w.send(DM, X, "开跑了但没记下", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    await waitFor(() => startOf(w, "request", rec.sendId).length === 1 && w.ledger.dead);
    await w.restart();
    const wake = await settledOnce(w, rec.sendId, { wakeText: /⚠️ V 重启打断了处理。V 重启打断了处理。对方保留了自己的上下文，可以对「一个群聊」再发一句「接着把 #\w+ 做完」。/u });
    assert.equal(startOf(w, "request", rec.sendId).length, 1, "never re-run");
    assert.equal(w.rec(rec.sendId).failure.class, "interrupted");
    assert(w.posts().some((p) => p.text === `⚠️ #${rec.code} 做到一半 V 重启了，没做完。已告诉「Tianyi 私聊」。`));
    assert.equal(handbacks(w).at(-1).text, `⚠️「一个群聊」没能完成 #${rec.code}：V 重启打断了处理`);
    assert(wake);
  } finally { await w.close(); }
});

test("recovery: running with a core restart-recovery run — follow it and take its reply from the transcript", async () => {
  const w = await createWorld({ ledger: crash("running"), bridge: { holdRuns: true } });
  try {
    await w.send(DM, X, "跑到一半", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    const runId = startOf(w, "request", rec.sendId)[0].args.runId;
    w.entries.set(X, { restartRecoveryDeliverySourceRunId: runId, restartRecoveryDeliveryRunId: "core-recovery-1" });
    w.busy.add(X); // the core's recovery run is live on X
    await w.restart();
    await waitFor(() => w.rec(rec.sendId).targetRun.recoveryRunId === "core-recovery-1", { what: "following the core run" });
    // Its sends belong to the request it continues (§2.d), not to a new chain.
    const adopted = await w.ledger.getRun("core-recovery-1");
    assert.deepEqual([adopted.role, adopted.servesSendId, adopted.chainId], ["request", rec.sendId, rec.chainId]);
    w.transcripts.get(X).push({ role: "assistant", content: [{ type: "text", text: "恢复后的完整答复" }] });
    w.busy.delete(X);
    w.endRun("core-recovery-1", X);
    await settledOnce(w, rec.sendId, { wakeText: /恢复后的完整答复/u });
    assert.equal(w.rec(rec.sendId).result.source, "transcript");
    assert.equal(startOf(w, "request", rec.sendId).length, 1);
  } finally { await w.close(); }
});

test("recovery: the core's recovery run answers after its own resume message — that answer is handed back (e2e-r2 F5)", async () => {
  // Telegram candidate 2026-10-20 (docs/inter-session/e2e-e2e-r2.md F5): the core resumed the killed turn
  // with "Your previous turn was interrupted by a gateway restart…" (provenance internal_system /
  // main_session_restart_recovery), the recovery run answered in the target chat, and the requester was
  // told "没有文字结果" because the reply search stopped at that untagged user message.
  const w = await createWorld({ ledger: crash("running"), bridge: { holdRuns: true } });
  try {
    await w.send(DM, X, "跑到一半被重启", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    const runId = startOf(w, "request", rec.sendId)[0].args.runId;
    w.entries.set(X, { restartRecoveryDeliverySourceRunId: runId, restartRecoveryDeliveryRunId: "core-recovery-2" });
    w.busy.add(X);
    await w.restart();
    await waitFor(() => w.rec(rec.sendId).targetRun.recoveryRunId === "core-recovery-2", { what: "following the core run" });
    const t = w.transcripts.get(X);
    t.push({ role: "assistant", content: [{ type: "toolCall", name: "exec" }] });
    t.push({ role: "toolResult", content: [{ type: "text", text: "interrupted" }] });
    t.push({ role: "user", content: "[System] Your previous turn was interrupted by a gateway restart …", provenance: { kind: "internal_system", sourceSessionKey: X, sourceTool: "main_session_restart_recovery" } });
    t.push({ role: "assistant", content: [{ type: "text", text: "F5_RESULT 恢复回合的答复" }] });
    w.busy.delete(X);
    w.endRun("core-recovery-2", X);
    await settledOnce(w, rec.sendId, { wakeText: /F5_RESULT 恢复回合的答复/u });
    const r = w.rec(rec.sendId);
    assert.equal(r.result.source, "transcript");
    assert.equal(r.result.noReply, false, "not 没有文字结果");
    assert(!handbacks(w).some((p) => p.text.includes("没有文字结果")), "the hand-back line does not claim an empty result");
  } finally { await w.close(); }
});

test("recovery: an untagged person message after the request still ends the request's reply", async () => {
  const w = await createWorld({ ledger: crash("running"), bridge: { holdRuns: true } });
  try {
    await w.send(DM, X, "被真人插话", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    const runId = startOf(w, "request", rec.sendId)[0].args.runId;
    w.entries.set(X, { restartRecoveryDeliverySourceRunId: runId, restartRecoveryDeliveryRunId: "core-recovery-3" });
    w.busy.add(X);
    await w.restart();
    await waitFor(() => w.rec(rec.sendId).targetRun.recoveryRunId === "core-recovery-3", { what: "following the core run" });
    const t = w.transcripts.get(X);
    t.push({ role: "user", content: "真人的新问题" });
    t.push({ role: "assistant", content: [{ type: "text", text: "给真人的回答" }] });
    w.busy.delete(X);
    w.endRun("core-recovery-3", X);
    await settledOnce(w, rec.sendId);
    assert.equal(w.rec(rec.sendId).result.noReply, true, "a person's turn is never taken as the request's reply");
  } finally { await w.close(); }
});

test("recovery: running on a wedged session — interrupted (restart_wedge), wedge note, no re-queue", async () => {
  const w = await createWorld({ ledger: crash("running"), bridge: { holdRuns: true } });
  try {
    await w.send(DM, X, "楔死", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    w.entries.set(X, { status: "running" });
    await w.restart();
    await settledOnce(w, rec.sendId, { wakeText: /对方聊天可能要人工恢复，先告诉这里的人。/u });
    assert.equal(w.rec(rec.sendId).failure.code, "restart_wedge");
    assert(w.posts().some((p) => p.text === `⚠️ #${rec.code} 做到一半 V 重启了，这个聊天可能要人工恢复后才能继续。已告诉「Tianyi 私聊」。`));
  } finally { await w.close(); }
});

test("recovery: a core recovery claim that nothing runs is the wedge — reported, not followed for 12 h", async () => {
  const w = await createWorld({ ledger: crash("running"), bridge: { holdRuns: true } });
  try {
    await w.send(DM, X, "认领了却没人跑", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    const runId = startOf(w, "request", rec.sendId)[0].args.runId;
    w.entries.set(X, { status: "running", restartRecoveryDeliverySourceRunId: runId, restartRecoveryDeliveryRunId: "dead-claim-1" });
    await w.restart();
    await settledOnce(w, rec.sendId, { wakeText: /对方聊天可能要人工恢复/u });
    assert.equal(w.rec(rec.sendId).failure.code, "restart_wedge");
    assert.equal(w.rec(rec.sendId).targetRun.recoveryRunId, null);
  } finally { await w.close(); }
});

test("recovery: a session still running at first look is watched for the core's recovery run before it is called wedged", async () => {
  const w = await createWorld({ ledger: crash("running"), bridge: { holdRuns: true }, timing: { recoveryObserveMs: 400 } });
  try {
    await w.send(DM, X, "核心稍后才认领", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    const runId = startOf(w, "request", rec.sendId)[0].args.runId;
    w.entries.set(X, { status: "running" }); // looks wedged: running, no active run, no claim yet
    await w.restart();
    await sleep(60);
    // The core's restart recovery claims the turn a moment later and runs it.
    w.entries.set(X, { status: "running", restartRecoveryDeliverySourceRunId: runId, restartRecoveryDeliveryRunId: "late-claim-1" });
    w.busy.add(X);
    await waitFor(() => w.rec(rec.sendId).targetRun.recoveryRunId === "late-claim-1", { what: "following the late claim" });
    w.transcripts.get(X).push({ role: "assistant", content: [{ type: "text", text: "稍后恢复的答复" }] });
    w.busy.delete(X);
    w.endRun("late-claim-1", X);
    await settledOnce(w, rec.sendId, { wakeText: /稍后恢复的答复/u });
    assert.equal(w.rec(rec.sendId).failure, null);
  } finally { await w.close(); }
});

test("recovery: target_done — re-evaluated and handed back", async () => {
  const w = await createWorld({ ledger: crash("target_done") });
  try {
    await w.send(DM, X, "做完了没记结果", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    await w.restart();
    await settledOnce(w, rec.sendId, { wakeText: new RegExp(`done ${rec.sendId}`, "u") });
  } finally { await w.close(); }
});

test("recovery: result_ready with a sealed batch — woken once", async () => {
  const w = await createWorld({ ledger: crash("result_ready") });
  try {
    await w.send(DM, X, "结果在账本", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    await w.restart();
    await settledOnce(w, rec.sendId);
  } finally { await w.close(); }
});

test("recovery: an open batch (requester run never seen ending) is sealed and woken", async () => {
  const w = await createWorld({ ledger: crash("result_ready") });
  try {
    await w.send(DM, X, "批次还开着", { runId: "rA" });
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    assert.equal(w.ledger.getBatch(rec.batchId).phase, "open");
    await w.restart();
    await settledOnce(w, rec.sendId);
  } finally { await w.close(); }
});

test("recovery: waking without the wake tag — woken again (attempt+1), one hand-back anchor", async () => {
  const w = await createWorld({ ledger: crash("waking") });
  try {
    await w.send(DM, X, "唤醒前崩", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    await waitFor(() => w.ledger.dead);
    assert.equal(w.starts("wake").length, 0);
    await w.restart();
    const wake = await settledOnce(w, rec.sendId);
    assert.equal(wake.args.attempt, 1);
    assert.equal(handbacks(w).length, 1);
  } finally { await w.close(); }
});

test("recovery: waking with the wake tag — it was admitted: woken, never woken twice, summary note", async () => {
  const w = await createWorld({ ledger: crash("before:woken"), bridge: { holdRuns: true } });
  try {
    await w.send(DM, X, "唤醒开跑后崩", { runId: "rA" });
    w.endRun("rA", DM);
    const rec = only(w);
    const st = await waitFor(() => startOf(w, "request", rec.sendId)[0]);
    w.fake.finishRun(st.args.runId, ok("答"));
    await waitFor(() => w.starts("wake").length === 1 && w.ledger.dead);
    await w.restart();
    await waitFor(() => w.rec(rec.sendId).phase === "handed_back");
    await w.recovery;
    assert.equal(w.starts("wake").length, 1, "the admitted wake is not repeated");
    assert.equal(w.posts().filter((p) => p.text.startsWith("⚠️ V 重启打断了")).length, 1);
    assert.match(w.posts().at(-1).text, /^⚠️ V 重启打断了 #\w+ 的汇总。结果已在本对话的上下文里，发一句「继续」就能接着汇报。$/u);
    assert.equal(w.batchOf(rec.sendId).wake.status, "interrupted");
  } finally { await w.close(); }
});

test("recovery: an interrupted continuation wake fails the parent request as interrupted (A still hears once)", async () => {
  const w = await createWorld({ ledger: crash("woken"), bridge: { holdRuns: true } });
  try {
    const s = await w.send(DM, X, "让 X 派活", { runId: "rA" });
    w.endRun("rA", DM);
    const xs = await waitFor(() => startOf(w, "request", s.sendId)[0]);
    const room = await w.send(X, ROOM(1), "房间做", { runId: xs.args.runId });
    w.fake.finishRun(xs.args.runId, ok("已派"));
    const rs = await waitFor(() => startOf(w, "request", room.sendId)[0]);
    w.fake.finishRun(rs.args.runId, ok("房间结果"));
    await waitFor(() => w.starts("wake").some((c) => c.args.sessionKey === X) && w.ledger.dead, { what: "X wake then crash" });
    await w.restart();
    await waitFor(() => w.rec(s.sendId).phase === "handed_back", { what: "A handed back" });
    await w.recovery;
    assert.equal(w.rec(room.sendId).phase, "handed_back", "members of the woken batch are handed back");
    assert.equal(w.rec(s.sendId).failure.class, "interrupted");
    assert.equal(w.starts("wake").filter((c) => c.args.sessionKey === X).length, 1);
    assert.equal(w.starts("wake").filter((c) => c.args.sessionKey === DM).length, 1);
  } finally { await w.close(); }
});

test("recovery: a claimed inline result whose requester end was never seen is handed back asynchronously", async () => {
  const w = await createWorld({ ledger: crash("delivered_inline") });
  try {
    const r = await w.send(DM, X, "问", { runId: "rA", mode: "inline", timeoutMs: 120_000 });
    await w.engine.wait({ sendId: r.sendId, timeoutMs: 2_000 }).catch(() => null);
    await waitFor(() => w.ledger.dead);
    await w.restart();
    await settledOnce(w, r.sendId, { wakeText: new RegExp(`done ${r.sendId}`, "u") });
    assert(w.rec(r.sendId).inline.revertedAt);
  } finally { await w.close(); }
});

test("recovery: an inline send still waiting at restart turns async and wakes the requester", async () => {
  const w = await createWorld({ timing: { idleRecheckMs: 5_000 } });
  try {
    w.busy.add(X);
    const r = await w.send(DM, X, "等着呢", { runId: "rA", mode: "inline", timeoutMs: 120_000 });
    await w.restart();
    await w.recovery;
    assert(w.rec(r.sendId).inline.expiredAt);
    w.busy.delete(X);
    w.endRun("other", X);
    await settledOnce(w, r.sendId);
  } finally { await w.close(); }
});

test("recovery: awaiting_background is checked again and collected", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const r = await w.send(DM, ROOM(1), "后台活", { runId: "rA" });
    w.endRun("rA", DM);
    w.tasks.set(ROOM(1), [{ taskId: "e", runtime: "cli", taskKind: "exec" }]);
    const st = await waitFor(() => startOf(w, "request", r.sendId)[0]);
    w.fake.finishRun(st.args.runId, ok("后台开着"));
    await waitFor(() => w.rec(r.sendId).phase === "awaiting_background");
    await w.restart();
    w.tasks.delete(ROOM(1));
    const col = await waitFor(() => startOf(w, "collect", r.sendId)[0], { what: "collect after restart" });
    w.fake.finishRun(col.args.runId, ok("最终结果"));
    await settledOnce(w, r.sendId, { wakeText: /最终结果/u });
  } finally { await w.close(); }
});

async function collectInFlight(w) {
  const s = await w.send(DM, ROOM(1), "生成后交回", { runId: "rA" });
  w.endRun("rA", DM);
  w.tasks.set(ROOM(1), [{ taskId: "img", runtime: "cli", taskKind: "image_generation" }]);
  const st = await waitFor(() => startOf(w, "request", s.sendId)[0], { what: "request start" });
  w.fake.finishRun(st.args.runId, ok("开始生成了"));
  await waitFor(() => w.rec(s.sendId).phase === "awaiting_background" && w.engine.bgTimers.has(s.sendId), { what: "awaiting_background" });
  w.tasks.delete(ROOM(1));
  const col = await waitFor(() => startOf(w, "collect", s.sendId)[0], { what: "collect start" });
  await waitFor(() => w.rec(s.sendId).collect?.startedAt, { what: "collect admitted" });
  return { sendId: s.sendId, col };
}

test("recovery: a collect turn in flight at the restart is never re-run — no recovery run → interrupted", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const { sendId } = await collectInFlight(w);
    await w.restart(); // the Gateway (and the collect turn with it) died
    await settledOnce(w, sendId, { wakeText: /V 重启打断了处理/u });
    assert.equal(w.rec(sendId).failure.class, "interrupted");
    assert.equal(startOf(w, "collect", sendId).length, 1, "the collect turn is not started again");
  } finally { await w.close(); }
});

test("recovery: a collect turn in flight at the restart follows the core's recovery run and hands its reply back", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const { sendId, col } = await collectInFlight(w);
    w.entries.set(ROOM(1), { restartRecoveryDeliverySourceRunId: col.args.runId, restartRecoveryDeliveryRunId: "core-col-1" });
    w.busy.add(ROOM(1));
    await w.restart();
    await waitFor(() => w.rec(sendId).collect?.recoveryRunId === "core-col-1", { what: "following the core run" });
    assert.equal((await w.ledger.getRun("core-col-1")).role, "collect");
    w.transcripts.get(ROOM(1)).push({ role: "assistant", content: [{ type: "text", text: "图都好了" }] });
    w.busy.delete(ROOM(1));
    w.endRun("core-col-1", ROOM(1));
    await settledOnce(w, sendId, { wakeText: /图都好了/u });
    assert.equal(startOf(w, "collect", sendId).length, 1);
  } finally { await w.close(); }
});
