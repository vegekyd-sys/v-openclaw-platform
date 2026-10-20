// Engine (§2.b–§5): phases, FIFO, the global cap, batches, W(S) continuation, background
// collection, inline claim / expiry / revert, transports, cancel, list/get, task rows.
import assert from "node:assert/strict";
import { test } from "node:test";

import { TASK_REGISTRY_BRIDGE, messageSidFor, runIdFor, validateStartRequest } from "../core/contracts.js";
import { forbiddenText } from "../core/copy.js";
import { createTaskSource } from "../core/tasks.js";
import { DM, OWNER, ROOM, X, createWorld, sendParams, sleep, waitFor } from "./fixtures/harness.mjs";

const ok = (text, extra = {}) => ({ status: "ok", finals: text ? [{ text }] : [], visibleReplySent: Boolean(text), finalCount: text ? 1 : 0, ...extra });
const phasesOf = (rec) => rec.history.map((h) => h.phase).filter((p, i, a) => i === 0 || a[i - 1] !== p);
const startOf = (w, kind, id) => w.starts(kind).find((c) => c.args.id === id);
const awaitStart = (w, kind, id, what) => waitFor(() => startOf(w, kind, id), { what: what ?? `${kind} start ${id}` });

test("engine: async single send walks every phase once and is handed back once", async () => {
  const w = await createWorld();
  try {
    const r = await w.send(DM, X, "请把 v2.3 的上线通知写好", { runId: "rA" });
    assert.equal(r.status, "accepted");
    assert.match(r.code, /^[0-9A-HJKMNP-TV-Z]{4}$/u);
    assert.equal(r.runId, runIdFor("request", r.sendId, 0));
    assert.deepEqual(r.delivery, { status: "pending", mode: "announce" });
    assert.match(r.note, /^已交给「一个群聊」\(#[0-9A-Z]{4}\)，对方聊天里能看到这条请求，正在处理。/u);
    // Batch stays open until the requester's run ends: no time window decides it.
    await waitFor(() => w.rec(r.sendId).phase === "result_ready", { what: "result_ready" });
    await sleep(60);
    assert.equal(w.batchOf(r.sendId).phase, "open");
    assert.equal(w.starts("wake").length, 0);
    w.endRun("rA", DM);
    await waitFor(() => w.rec(r.sendId).phase === "handed_back", { what: "handed_back" });
    await waitFor(() => w.batchOf(r.sendId).wake.endedAt, { what: "wake end" });
    assert.deepEqual(phasesOf(w.rec(r.sendId)), ["accepted", "posting", "posted", "queued", "starting", "running", "target_done", "result_ready", "handed_back"]);
    assert.equal(w.batchOf(r.sendId).phase, "woken");
    const posts = w.posts();
    assert.equal(posts.length, 2);
    assert.equal(posts[0].text, `📨 来自「Tianyi 私聊」的请求 #${r.code}\n—\n请把 v2.3 的上线通知写好`);
    assert.equal(posts[1].text, `↩️「一个群聊」交回了 #${r.code} 的结果`);
    const req = startOf(w, "request", r.sendId).args;
    assert(validateStartRequest(req).ok);
    assert.equal(req.anchorMessageId, posts[0].messageId);
    assert.equal(req.sender.id, OWNER);
    assert.equal(req.sender.isOwnerIdentity, true);
    assert.equal(req.promptText, "请把 v2.3 的上线通知写好", "the model gets the full text, no header");
    assert.match(req.channelPromptContext, /^\[会话协作 #/u);
    assert.equal(w.starts("wake").length, 1);
    const wake = w.starts("wake")[0].args;
    assert.match(wake.promptText, /最终回复：\n   done s_/u);
    assert.equal(wake.anchorMessageId, posts[1].messageId);
    // The runs it created are in the ledger with their roles.
    assert.equal((await w.ledger.getRun("rA")).role, "root");
    assert.equal((await w.ledger.getRun(req.runId)).role, "request");
    assert.equal((await w.ledger.getRun(wake.runId)).role, "wake");
  } finally { await w.close(); }
});

test("engine: idempotency key and in-flight content dedupe; finished sends never match", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const p = sendParams(DM, X, "同一件事", { runId: "rA", toolCallId: "tc-1" });
    const a = await w.engine.send(p);
    const again = await w.engine.send(p);
    assert.equal(again.sendId, a.sendId);
    assert.equal(again.deduped, true);
    assert.doesNotMatch(again.note, /同样的请求/u, "a retried call gets the normal note");
    const sameText = await w.send(DM, X, "同一件事", { runId: "rA", toolCallId: "tc-2" });
    assert.equal(sameText.sendId, a.sendId);
    assert.equal(sameText.note, `同样的请求 #${a.code} 已在进行，结果会自动回来；不要重复发送。`);
    const other = await w.send(DM, X, "另一件事", { runId: "rA", toolCallId: "tc-3" });
    assert.notEqual(other.sendId, a.sendId);
    assert.equal(other.queuePosition, 0, "not started yet only because the first is running");
    // Finish everything; afterwards the same text is a new send.
    for (const id of [a.sendId, other.sendId]) {
      const s = await awaitStart(w, "request", id);
      w.fake.finishRun(s.args.runId, ok("好"));
    }
    w.endRun("rA", DM);
    const b = await waitFor(() => w.batchOf(a.sendId).phase === "woken" && w.batchOf(a.sendId));
    w.fake.finishRun(b.wake.runId, ok("汇报"));
    await waitFor(() => w.rec(a.sendId).phase === "handed_back");
    const fresh = await w.send(DM, X, "同一件事", { runId: "rB", toolCallId: "tc-4" });
    assert.notEqual(fresh.sendId, a.sendId);
    assert.equal(fresh.deduped, undefined);
  } finally { await w.close(); }
});

test("engine: policy refusals reach the tool as forbidden with the §7.5 text", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const s = await w.send(DM, X, "交给 X", { runId: "rA" });
    const xStart = await awaitStart(w, "request", s.sendId);
    const xRun = xStart.args.runId;
    const back = await w.send(X, DM, "我做完了", { runId: xRun });
    assert.equal(back.status, "forbidden");
    assert.equal(back.code, "REPLY_TO_REQUESTER");
    assert.equal(back.error, forbiddenText("REPLY_TO_REQUESTER", { to: "Tianyi 私聊" }));
    const ask = await w.send(X, DM, "要哪个版本？", { runId: xRun, mode: "inline", timeoutMs: 120_000 });
    assert.equal(ask.status, "accepted");
    assert.equal(w.rec(ask.sendId).edge, "ask");
    assert.equal(w.rec(ask.sendId).kind, "ask");
    // The ask turn is a leaf.
    const askStart = await awaitStart(w, "ask", ask.sendId);
    const leaf = await w.send(DM, ROOM(1), "再转出去", { runId: askStart.args.runId });
    assert.equal(leaf.code, "LEAF");
    assert.match(askStart.args.channelPromptContext, /^\[会话协作·提问 #/u);
    assert.match(w.posts().find((p) => p.text.startsWith("❓")).text, /^❓「一个群聊」问 #/u);
    // Depth: X (1) → room (2) → another room is refused.
    const room = await w.send(X, ROOM(1), "房间 1", { runId: xRun });
    const roomStart = await awaitStart(w, "request", room.sendId);
    assert.match(w.posts().find((p) => p.text.includes(`#${room.code}`)).text, /\n经「一个群聊」转来 · 源头「Tianyi 私聊」\n/u);
    const deeper = await w.send(ROOM(1), ROOM(2), "继续往下", { runId: roomStart.args.runId });
    assert.equal(deeper.code, "DEPTH");
    // No record was written for refusals.
    assert.equal(w.ledger.sendsWhere((r) => r.message.text === "继续往下").length, 0);
  } finally { await w.close(); }
});

test("engine: route problems at accept — CHAT_GONE errors without a record; a refused anchor post closes the send", async () => {
  const w = await createWorld({ bridge: { post: [{ fail: "NOT_MEMBER" }] } });
  try {
    w.fake.setRoute(ROOM(9), { ok: false, code: "CHAT_GONE", reason: "dissolved" });
    const gone = await w.send(DM, ROOM(9), "hi", { runId: "rA" });
    assert.deepEqual([gone.status, gone.code], ["error", "CHAT_GONE"]);
    assert.equal(w.ledger.sends.size, 0);
    const notMember = await w.send(DM, X, "hi", { runId: "rA" });
    assert.deepEqual([notMember.status, notMember.code], ["error", "NOT_MEMBER"]);
    assert.equal(notMember.error, "发不到「一个群聊」的聊天：机器人不在这个聊天里");
    const closed = w.ledger.sendsWhere(() => true)[0];
    assert.equal(closed.phase, "skipped");
    assert.equal(w.ledger.getBatch(closed.batchId)?.members.length ?? 0, 0);
    w.endRun("rA", DM);
    await sleep(60);
    assert.equal(w.starts().length, 0, "nothing starts and nothing wakes for a refused send");
  } finally { await w.close(); }
});

test("engine: a transient anchor failure is retried with the same idempotency key", async () => {
  const w = await createWorld({ bridge: { post: [{ fail: "CHANNEL_DOWN", transient: true }, { fail: "CHANNEL_DOWN", transient: true }] } });
  try {
    const r = await w.send(DM, X, "hi", { runId: "rA" });
    assert.equal(r.status, "accepted");
    await waitFor(() => w.rec(r.sendId).phase === "result_ready");
    const keys = w.fake.callsOf("post").map((c) => c.args.idempotencyKey);
    assert.equal(keys.length, 3);
    assert.equal(new Set(keys).size, 1);
    assert.equal(w.rec(r.sendId).request.postAttempts, 3);
  } finally { await w.close(); }
});

test("engine: BUSY — zero visible output, attempt+1 with fresh ids, backoff, then it runs", async () => {
  const w = await createWorld({ bridge: { start: [{ status: "busy", reason: "active_run" }, { status: "busy", reason: "pending_queue" }] } });
  try {
    const r = await w.send(DM, X, "忙的时候来", { runId: "rA" });
    await waitFor(() => w.rec(r.sendId).phase === "result_ready", { what: "result after busy" });
    const starts = w.starts("request");
    assert.equal(starts.length, 3);
    assert.deepEqual(starts.map((s) => s.args.attempt), [0, 1, 2]);
    assert.deepEqual(starts.map((s) => s.args.runId), [0, 1, 2].map((n) => runIdFor("request", r.sendId, n)));
    assert.deepEqual(starts.map((s) => s.args.messageSid), [0, 1, 2].map((n) => messageSidFor("request", r.sendId, n)));
    assert.equal(w.posts().length, 1, "only the anchor; BUSY attempts post nothing");
    assert.equal(w.fake.visible.filter((v) => v.kind === "edit").length, 0);
    assert(starts[1].at - starts[0].at >= 15, "backed off");
    assert.equal(w.rec(r.sendId).targetRun.runId, runIdFor("request", r.sendId, 2));
  } finally { await w.close(); }
});

test("engine: a lifecycle end on the target cuts a BUSY backoff short", async () => {
  const w = await createWorld({ bridge: { start: [{ status: "busy", reason: "active_run" }] }, timing: { busyBackoffMs: [5_000] } });
  try {
    const r = await w.send(DM, X, "忙", { runId: "rA" });
    await waitFor(() => w.rec(r.sendId).attempt === 1, { what: "busy recorded" });
    await sleep(40);
    assert.equal(w.starts("request").length, 1, "waiting out the 5 s backoff");
    w.endRun("human-run", X);
    await waitFor(() => w.starts("request").length === 2, { timeoutMs: 1000, what: "restart after lifecycle end" });
    assert.equal(w.starts("request")[1].args.attempt, 1);
  } finally { await w.close(); }
});

test("engine: a busy target at accept shows ⏳ in the anchor, which is edited away when the turn starts; lifecycle end pumps", async () => {
  const w = await createWorld({ timing: { idleRecheckMs: 5_000 } });
  try {
    w.busy.add(X);
    const r = await w.send(DM, X, "排队的事", { runId: "rA" });
    assert.equal(r.waitingBehindActiveRun, true);
    assert.match(r.note, /它正在忙（前面还有 1 件）/u);
    assert.equal(w.posts()[0].text.split("\n").at(-1), "⏳ 这里正在处理别的事，处理完就开始这条（前面还有 1 件）");
    await sleep(50);
    assert.equal(w.starts().length, 0, "pre-check holds it while the target is busy");
    w.busy.delete(X);
    w.endRun("human-run-1", X); // the human's turn ends: the target's pump runs after the debounce
    await waitFor(() => w.starts("request").length === 1, { timeoutMs: 1000, what: "start after lifecycle end" });
    const edit = await waitFor(() => w.fake.visible.find((v) => v.kind === "edit"));
    assert.equal(edit.text, `📨 来自「Tianyi 私聊」的请求 #${r.code}\n—\n排队的事`);
  } finally { await w.close(); }
});

test("engine: per-target FIFO by class — ask before wake/collect before request, FIFO within a class", async () => {
  const w = await createWorld({ bridge: { holdRuns: true }, timing: { idleRecheckMs: 5_000 } });
  try {
    // X serves A's request; while it is busy, two requests and an ask from rooms queue up.
    const s = await w.send(DM, X, "交给 X", { runId: "rA" });
    const xStart = await awaitStart(w, "request", s.sendId);
    const r1 = await w.send(X, ROOM(1), "r1", { runId: xStart.args.runId });
    const r1s = await awaitStart(w, "request", r1.sendId);
    w.busy.add(X);
    const q1 = await w.send(ROOM(2), X, "排队 1", { runId: "h2" });
    const q2 = await w.send(ROOM(3), X, "排队 2", { runId: "h3" });
    const ask = await w.send(ROOM(1), X, "X 你要哪个？", { runId: r1s.args.runId, mode: "inline", timeoutMs: 120_000 });
    assert.equal(w.rec(ask.sendId).kind, "ask");
    w.fake.finishRun(xStart.args.runId, ok("已交给房间"));
    w.busy.delete(X);
    w.endRun("anything", X);
    const order = [];
    for (const want of [["ask", ask.sendId], ["request", q1.sendId], ["request", q2.sendId]]) {
      const st = await awaitStart(w, want[0], want[1]);
      order.push(st.args.id);
      w.fake.finishRun(st.args.runId, ok("答"));
    }
    assert.deepEqual(order, [ask.sendId, q1.sendId, q2.sendId]);
    const startedAt = (id) => w.fake.callsOf("start").find((c) => c.args.id === id).at;
    assert(startedAt(ask.sendId) <= startedAt(q1.sendId) && startedAt(q1.sendId) <= startedAt(q2.sendId));
  } finally { await w.close(); }
});

test("engine: global cap of 4 request turns — the 5th of a fan-out waits visibly, starts when a slot frees", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const sends = [];
    for (let i = 1; i <= 5; i += 1) {
      sends.push(await w.send(DM, ROOM(i), `任务 ${i}`, { runId: "rA" }));
      await sleep(15);
    }
    await waitFor(() => w.starts("request").length === 4, { what: "4 started" });
    await sleep(60);
    assert.equal(w.starts("request").length, 4);
    const fifthAnchor = w.posts().find((p) => p.text.includes(`#${sends[4].code}`));
    assert.match(fifthAnchor.text, /\n⏳ 这里正在处理别的事，处理完就开始这条（前面还有 \d 件）$/u);
    w.fake.finishRun(w.starts("request")[0].args.runId, ok("1 好了"));
    await awaitStart(w, "request", sends[4].sendId, "5th after a slot frees");
    // asks are not limited by the cap
    const ask = await w.send(ROOM(1), ROOM(2), "顺便问", { runId: w.starts("request")[0].args.runId, mode: "inline", timeoutMs: 60_000 });
    assert.equal(ask.status, "accepted");
  } finally { await w.close(); }
});

test("engine: one wake for a batch of three; it waits for the slowest member; failures are listed", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const sends = [];
    for (let i = 1; i <= 3; i += 1) sends.push(await w.send(DM, ROOM(i), `任务 ${i}`, { runId: "rA" }));
    assert.equal(new Set(sends.map((s) => w.rec(s.sendId).batchId)).size, 1);
    w.endRun("rA", DM);
    const st = await Promise.all(sends.map((s) => awaitStart(w, "request", s.sendId)));
    w.fake.finishRun(st[0].args.runId, ok("一号完成"));
    w.fake.finishRun(st[1].args.runId, { status: "error", finals: [], visibleReplySent: false, finalCount: 0, error: "model overloaded" });
    await sleep(60);
    assert.equal(w.starts("wake").length, 0, "the batch waits for the slowest member");
    w.fake.finishRun(st[2].args.runId, { status: "aborted", finals: [], visibleReplySent: false, finalCount: 0 });
    const wake = await waitFor(() => w.starts("wake")[0]);
    assert.equal(w.starts("wake").length, 1);
    const handback = w.posts().at(-1).text;
    assert.equal(handback, "↩️ 3 件都有结果了：「一个群聊」✅ ·「一个群聊」⚠️ ·「一个群聊」⏹");
    assert.match(wake.args.promptText, /交出的 3 件事都有了结果/u);
    assert.match(wake.args.promptText, /2\.「一个群聊」#\w+ ⚠️ 处理时出错：model overloaded。对方聊天里可能已经发过部分内容/u);
    assert.match(wake.args.promptText, /3\.「一个群聊」#\w+ ⏹ 在对方聊天里被中止。/u);
    await waitFor(() => sends.every((s) => w.rec(s.sendId).phase === "handed_back"), { what: "members handed back" });
    assert.equal(w.rec(sends[1].sendId).failure.class, "started_failed");
    assert.equal(w.rec(sends[2].sendId).failure.class, "aborted");
  } finally { await w.close(); }
});

test("engine: a send without a requester runId is its own sealed batch (batch.unkeyed), never a time window", async () => {
  const w = await createWorld();
  try {
    const a = await w.engine.send({ ...sendParams(DM, ROOM(1), "一", { toolCallId: "u1" }), requester: { ...sendParams(DM, ROOM(1), "一").requester, runId: null } });
    const b = await w.engine.send({ ...sendParams(DM, ROOM(2), "二", { toolCallId: "u2" }), requester: { ...sendParams(DM, ROOM(2), "二").requester, runId: null } });
    assert.notEqual(w.rec(a.sendId).batchId, w.rec(b.sendId).batchId);
    await waitFor(() => w.starts("wake").length === 2, { what: "two wakes" });
    assert(w.logs.some(([lvl, m]) => lvl === "warn" && /batch\.unkeyed/u.test(m)));
  } finally { await w.close(); }
});

test("engine: W(S) continuation A → X → 3 rooms — A gets X's summary, not 「已开工」; one wake each", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const s = await w.send(DM, X, "让 X 开三个房间分别做 a/b/c", { runId: "rA" });
    w.endRun("rA", DM);
    const xStart = await awaitStart(w, "request", s.sendId);
    const rooms = [];
    for (let i = 1; i <= 3; i += 1) rooms.push(await w.send(X, ROOM(i), `做 ${i}`, { runId: xStart.args.runId }));
    assert(rooms.every((r) => r.status === "accepted"));
    assert(rooms.every((r) => w.rec(r.sendId).depth === 2 && w.rec(r.sendId).parentSendId === s.sendId));
    w.fake.finishRun(xStart.args.runId, ok("三个群已开工"));
    await waitFor(() => w.rec(s.sendId).phase === "awaiting_children", { what: "awaiting_children" });
    const roomStarts = await Promise.all(rooms.map((r) => awaitStart(w, "request", r.sendId)));
    assert.match(roomStarts[0].args.channelPromptContext, /不能再把活转给新的会话/u);
    roomStarts.forEach((st, i) => w.fake.finishRun(st.args.runId, ok(`房间 ${i + 1} 的结果`)));
    const xWake = await waitFor(() => w.starts("wake").find((c) => c.args.sessionKey === X));
    assert.match(xWake.args.channelPromptContext, /你在为「Tianyi 私聊」的请求 #\w+ 做这件事，本轮最终回复会作为结果交回它：写完整，绝不能 NO_REPLY。/u);
    assert.match(xWake.args.promptText, /房间 1 的结果[\s\S]*房间 2 的结果[\s\S]*房间 3 的结果/u);
    await waitFor(() => w.rec(s.sendId).wakeRounds === 1, { what: "wake round counted" });
    w.fake.finishRun(xWake.args.runId, ok("汇总：a/b/c 都做完了"));
    const aWake = await waitFor(() => w.starts("wake").find((c) => c.args.sessionKey === DM));
    assert.match(aWake.args.promptText, /汇总：a\/b\/c 都做完了/u);
    assert.doesNotMatch(aWake.args.promptText, /三个群已开工/u);
    assert.equal(w.starts("wake").filter((c) => c.args.sessionKey === X).length, 1);
    assert.equal(w.starts("wake").filter((c) => c.args.sessionKey === DM).length, 1);
    assert.equal(w.rec(s.sendId).result.fromRunId, xWake.args.runId);
  } finally { await w.close(); }
});

test("engine: background work → awaiting_background → a collect turn gives the result", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const s = await w.send(DM, ROOM(1), "生成三张图", { runId: "rA" });
    w.endRun("rA", DM);
    const st = await awaitStart(w, "request", s.sendId);
    w.tasks.set(ROOM(1), [
      { taskId: "fg", runtime: "cli", childSessionKey: ROOM(1) }, // its own foreground run: ignored
      { taskId: "cron1", runtime: "cron", taskKind: "cron" }, // automations: ignored
      { taskId: "img", runtime: "cli", taskKind: "image_generation", childSessionKey: ROOM(1) },
    ]);
    w.fake.finishRun(st.args.runId, ok("已开始生成，稍后给你"));
    await waitFor(() => w.rec(s.sendId).phase === "awaiting_background");
    await sleep(80);
    assert.equal(w.starts("collect").length, 0);
    w.tasks.set(ROOM(1), [{ taskId: "fg", runtime: "cli", childSessionKey: ROOM(1) }]);
    for (const l of w.taskBridge.listeners) l({ kind: "updated", sessionKeys: [ROOM(1)] });
    const col = await awaitStart(w, "collect", s.sendId);
    assert.equal(col.args.runId, runIdFor("collect", s.sendId, 0));
    assert.match(col.args.channelPromptContext, /^\[会话协作 #\w+\] 你为「Tianyi 私聊」这条请求启动的后台工作都结束了。/u);
    assert.match(w.posts().at(-1).text, /^📨 #\w+ 的后台工作都结束了：请给出最终结果，会交回「Tianyi 私聊」$/u);
    w.fake.finishRun(col.args.runId, ok("三张图都好了", { finals: [{ text: "三张图都好了", mediaUrls: ["https://m/1.png"] }] }));
    const wake = await waitFor(() => w.starts("wake")[0]);
    assert.match(wake.args.promptText, /三张图都好了[\s\S]*MEDIA: https:\/\/m\/1\.png/u);
    assert.equal(w.rec(s.sendId).wakeRounds, 1);
  } finally { await w.close(); }
});

test("engine: wake + collect rounds are capped — the last output is handed back, marked incomplete", async () => {
  const w = await createWorld({ bridge: { holdRuns: true }, pluginConfig: { limits: { maxWakeRoundsPerSend: 1 } } });
  try {
    const s = await w.send(DM, ROOM(1), "一直有后台", { runId: "rA" });
    w.endRun("rA", DM);
    w.tasks.set(ROOM(1), [{ taskId: "e1", runtime: "cli", taskKind: "exec" }]);
    const st = await awaitStart(w, "request", s.sendId);
    w.fake.finishRun(st.args.runId, ok("第一轮"));
    await waitFor(() => w.rec(s.sendId).phase === "awaiting_background");
    w.tasks.delete(ROOM(1));
    const col = await awaitStart(w, "collect", s.sendId);
    w.tasks.set(ROOM(1), [{ taskId: "e2", runtime: "cli", taskKind: "exec" }]);
    w.fake.finishRun(col.args.runId, ok("第二轮"));
    const wake = await waitFor(() => w.starts("wake")[0]);
    assert.equal(w.rec(s.sendId).result.incomplete, true);
    assert.match(wake.args.promptText, /第二轮\n   （对方仍有未完成项）/u);
  } finally { await w.close(); }
});

test("engine: inline — vrelay.wait claims ok / no_reply / failed; no wake follows", async () => {
  const w = await createWorld({ bridge: { start: [{ status: "started", finals: [{ text: "下午三点" }] }, { status: "started", finals: [] }, { status: "started", runStatus: "error", error: "tool crashed" }] } });
  try {
    const one = await w.send(DM, X, "现在几点？", { runId: "rA", mode: "inline", timeoutMs: 120_000 });
    const r1 = await w.engine.wait({ sendId: one.sendId, timeoutMs: 2_000 });
    assert.equal(r1.status, "ok");
    assert.equal(r1.reply, "下午三点");
    assert.equal(r1.note, "这是「一个群聊」的回答（它的聊天里也看得到），不会再单独送回。接着做你的事，不要重复问同样的问题。");
    assert.equal(w.rec(one.sendId).phase, "delivered_inline");
    assert.equal(w.rec(one.sendId).batchId, null);
    assert.deepEqual(await w.engine.wait({ sendId: one.sendId, timeoutMs: 10 }), r1, "a lost slice can ask again");
    const two = await w.send(DM, ROOM(1), "说点什么", { runId: "rA", mode: "inline", timeoutMs: 120_000 });
    assert.equal((await w.engine.wait({ sendId: two.sendId, timeoutMs: 2_000 })).status, "no_reply");
    const three = await w.send(DM, ROOM(2), "会失败", { runId: "rA", mode: "inline", timeoutMs: 120_000 });
    const r3 = await w.engine.wait({ sendId: three.sendId, timeoutMs: 2_000 });
    assert.equal(r3.status, "failed");
    assert.deepEqual(r3.failure, { class: "started_failed", reason: "处理时出错：tool crashed" });
    assert.match(r3.note, /^「一个群聊」没能完成 #\w+：处理时出错：tool crashed。对方聊天里可能已经发过部分内容/u);
    w.endRun("rA", DM);
    await sleep(80);
    assert.equal(w.starts("wake").length, 0);
    assert.equal(w.posts().filter((p) => p.text.startsWith("↩️")).length, 0, "no hand-back anchor for inline answers");
  } finally { await w.close(); }
});

test("engine: inline past its window → expired, the send turns async and wakes the requester once", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const r = await w.send(DM, X, "慢慢回答", { runId: "rA", mode: "inline", timeoutMs: 150 });
    const pending = await w.engine.wait({ sendId: r.sendId, timeoutMs: 20 });
    assert.equal(pending.status, "pending");
    const expired = await w.engine.wait({ sendId: r.sendId, timeoutMs: 2_000 });
    assert.equal(expired.status, "expired");
    assert.match(expired.note, /^「一个群聊」还在处理（已等 \d+ 秒）。/u);
    const rec = w.rec(r.sendId);
    assert(rec.inline.expiredAt);
    assert.equal(w.ledger.getBatch(rec.batchId).phase, "open");
    w.endRun("rA", DM);
    await waitFor(() => w.ledger.getBatch(rec.batchId).phase === "sealed");
    const st = await awaitStart(w, "request", r.sendId);
    w.fake.finishRun(st.args.runId, ok("答案"));
    const wake = await waitFor(() => w.starts("wake")[0]);
    assert.match(wake.args.promptText, /答案/u);
    assert.equal((await w.engine.wait({ sendId: r.sendId, timeoutMs: 10 })).status, "expired", "never claimable after expiry");
  } finally { await w.close(); }
});

test("engine: inline claim and expiry race — exactly one wins (CAS)", async () => {
  const w = await createWorld();
  try {
    for (let i = 0; i < 12; i += 1) {
      const r = await w.send(DM, ROOM(i), `问 ${i}`, { runId: `rr${i}`, mode: "inline", timeoutMs: 120_000 });
      await waitFor(() => w.rec(r.sendId).phase === "result_ready");
      const order = i % 2 === 0;
      const [res] = await Promise.all(order
        ? [w.engine.wait({ sendId: r.sendId, timeoutMs: 500 }), w.engine._expireInline(r.sendId, "race")]
        : [w.engine.wait({ sendId: r.sendId, timeoutMs: 500 }).then(async (x) => x), w.engine._expireInline(r.sendId, "race")]);
      const rec = w.rec(r.sendId);
      if (res.status === "ok") {
        assert.equal(rec.phase, "delivered_inline");
        assert.equal(rec.inline.expiredAt, null);
        assert.equal(rec.batchId, null);
      } else {
        assert.equal(res.status, "expired");
        assert.equal(rec.inline.claimedAt, null);
        assert(rec.batchId);
        assert.equal(rec.phase, "result_ready");
      }
    }
  } finally { await w.close(); }
});

test("engine: a claimed inline result whose requester run then fails goes back as an async wake", async () => {
  const w = await createWorld();
  try {
    const r = await w.send(DM, X, "问一下", { runId: "rA", mode: "inline", timeoutMs: 120_000 });
    assert.equal((await w.engine.wait({ sendId: r.sendId, timeoutMs: 2_000 })).status, "ok");
    w.endRun("rA", DM, "error", { error: "worker died" });
    const wake = await waitFor(() => w.starts("wake")[0], { what: "revert wake" });
    await waitFor(() => w.rec(r.sendId).phase === "handed_back", { what: "handed back after revert" });
    const rec = w.rec(r.sendId);
    assert(rec.inline.revertedAt);
    assert.equal(rec.inline.requesterEnd, "error");
    assert.match(wake.args.promptText, new RegExp(`done ${r.sendId}`, "u"));
    // A requester that ended normally keeps the claim.
    const r2 = await w.send(DM, ROOM(1), "再问", { runId: "rB", mode: "inline", timeoutMs: 120_000 });
    await w.engine.wait({ sendId: r2.sendId, timeoutMs: 2_000 });
    w.endRun("rB", DM);
    await waitFor(() => w.rec(r2.sendId).inline.requesterEnd === "ok");
    assert.equal(w.rec(r2.sendId).phase, "delivered_inline");
    assert.equal(w.starts("wake").length, 1);
  } finally { await w.close(); }
});

test("engine: ROUTE_MISMATCH falls back to the agent transport; RESTART_WEDGE is interrupted, never re-queued", async () => {
  const w = await createWorld({ bridge: { start: [{ status: "rejected", code: "ROUTE_MISMATCH" }, { status: "rejected", code: "RESTART_WEDGE", message: "restart recovery claim changed" }] } });
  try {
    const a = await w.send(DM, ROOM(1), "第一件", { runId: "rA" });
    await waitFor(() => w.rec(a.sendId).phase === "result_ready", { what: "agent fallback result" });
    assert.equal(w.rec(a.sendId).target.transport, "agent");
    const agentStart = w.agent.calls.find((c) => c.method === "start");
    assert.equal(agentStart.req.attempt, 1);
    assert.equal(agentStart.principal.isOwner, true);
    assert.equal(w.rec(a.sendId).result.text, `agent done ${a.sendId}`);
    const b = await w.send(DM, ROOM(2), "第二件", { runId: "rA" });
    await waitFor(() => w.rec(b.sendId).phase === "failure_ready", { what: "wedge" });
    assert.deepEqual(w.rec(b.sendId).failure, { class: "interrupted", code: "restart_wedge", reason: "V 重启打断了处理" });
    await waitFor(() => w.posts().at(-1).text.startsWith("⚠️"), { what: "wedge note" });
    assert.equal(w.posts().at(-1).text, `⚠️ #${b.code} 做到一半 V 重启了，这个聊天可能要人工恢复后才能继续。已告诉「Tianyi 私聊」。`);
    assert.equal(w.posts().at(-1).replyToMessageId, w.rec(b.sendId).request.messageId);
    await sleep(60);
    assert.equal(w.starts("request").filter((c) => c.args.id === b.sendId).length, 1);
  } finally { await w.close(); }
});

test("engine: no bridge for the channel → agent transport posts the visible request and runs deliver:true", async () => {
  const tg = "agent:makaron:telegram:group:-1001234";
  const w = await createWorld({ entries: { [tg]: { delivery: { kind: "external", context: { channel: "telegram", to: "-1001234", accountId: "default" } } } } });
  try {
    const r = await w.send(DM, tg, "TG 上做一件事", { runId: "rA" });
    assert.equal(r.status, "accepted");
    await waitFor(() => w.rec(r.sendId).phase === "result_ready");
    const post = w.agent.visible[0];
    assert.equal(post.to, "-1001234");
    assert.match(post.text, /^📨 来自「Tianyi 私聊」的请求 #\w+\n—\nTG 上做一件事$/u);
    const start = w.agent.calls.find((c) => c.method === "start");
    assert.equal(start.req.route.channel, "telegram");
    assert.equal(start.req.messageSid, messageSidFor("request", r.sendId, 0));
    // A session with no chat (main) gets no visible request at all.
    const main = await w.send(DM, "agent:makaron:main", "主会话做", { runId: "rA" });
    await waitFor(() => w.rec(main.sendId).phase === "result_ready");
    assert.equal(w.agent.visible.length, 1);
    assert.match(main.note, /^已交给「V 主会话」\(#\w+\)，正在处理。/u);
  } finally { await w.close(); }
});

test("engine: DISABLED and unsupported sessions fall back to v2; vrelay.send validates params", async () => {
  const w = await createWorld();
  try {
    const fs = await import("node:fs");
    assert.deepEqual(await w.send(DM, "agent:makaron:subagent:abc", "x"), { status: "fallback", reason: "unsupported_target" });
    assert.deepEqual(await w.send("agent:makaron:cron:daily", X, "x"), { status: "fallback", reason: "unsupported_requester" });
    assert.deepEqual(await w.send(X, X, "x"), { status: "fallback", reason: "unsupported_target" });
    const bad = await w.engine.send({ v: 1 });
    assert.equal(bad.status, "error");
    fs.writeFileSync(`${w.dir}/DISABLED`, "");
    await sleep(1_100);
    assert.deepEqual(await w.send(DM, X, "x"), { status: "fallback", reason: "disabled" });
  } finally { await w.close(); }
});

test("engine: cancel — the target chat gets ⏹, the batch wake lists it; a late result is dropped", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const a = await w.send(DM, ROOM(1), "做 a", { runId: "rA" });
    const b = await w.send(DM, ROOM(2), "做 b", { runId: "rA" });
    w.endRun("rA", DM);
    const sa = await awaitStart(w, "request", a.sendId);
    const sb = await awaitStart(w, "request", b.sendId);
    assert.deepEqual(await w.engine.cancel({ sendId: b.sendId, reason: "Tianyi 改主意了" }), { ok: true });
    assert.equal(w.posts().at(-1).text, `⏹ #${b.code} 已撤回（Tianyi 改主意了）。`);
    assert.deepEqual(await w.engine.cancel({ sendId: b.sendId }), { ok: false, error: "already cancelled" });
    const c = await w.send(DM, ROOM(3), "做 c", { runId: "rC" });
    assert.deepEqual(await w.engine.cancel({ sendId: c.sendId, reason: `运维撤回：${"很长的理由".repeat(20)}\n第二行` }), { ok: true });
    const note = w.posts().at(-1).text;
    assert.match(note, /^⏹ #\w+ 已撤回（运维撤回：很长的理由.*…）。$/u, "one clipped line in the target chat");
    assert(note.length <= 45, note);
    w.fake.finishRun(sb.args.runId, ok("迟到的结果"));
    w.fake.finishRun(sa.args.runId, ok("a 好了"));
    const wake = await waitFor(() => w.starts("wake")[0]);
    assert.match(w.posts().find((p) => p.text.startsWith("↩️")).text, /「一个群聊」✅ ·「一个群聊」⏹/u);
    assert.doesNotMatch(wake.args.promptText, /迟到的结果/u);
    assert.equal(w.rec(b.sendId).phase, "cancelled");
  } finally { await w.close(); }
});

test("engine: a request that waits past queueTimeout is not started and says so in both chats", async () => {
  const w = await createWorld({ pluginConfig: { limits: { queueTimeoutMs: 80 } }, timing: { idleRecheckMs: 20 } });
  try {
    w.busy.add(X);
    const r = await w.send(DM, X, "等不到", { runId: "rA" });
    w.endRun("rA", DM);
    await waitFor(() => w.rec(r.sendId).phase !== "queued" && w.rec(r.sendId).phase !== "posted" && w.rec(r.sendId).phase !== "posting" && w.rec(r.sendId).phase !== "accepted", { what: "queue timeout" });
    await waitFor(() => w.starts("wake")[0]);
    assert.equal(w.rec(r.sendId).failure.class, "not_started");
    assert.equal(w.rec(r.sendId).failure.code, "queue_timeout");
    assert.ok(w.posts().some((p) => p.text === `⚠️ #${r.code} 没有开始：这里一直在忙，等了 0 小时。已告诉「Tianyi 私聊」。`));
    assert.equal(w.starts("request").length, 0);
  } finally { await w.close(); }
});

test("engine: a run whose done never resolves is closed after its lifecycle end, from the transcript", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const r = await w.send(DM, X, "桥丢了 done", { runId: "rA" });
    w.endRun("rA", DM);
    const st = await awaitStart(w, "request", r.sendId);
    await waitFor(() => w.rec(r.sendId).phase === "running");
    w.transcripts.get(X).push({ role: "assistant", content: "从 transcript 取到的答案" });
    w.endRun(st.args.runId, X);
    await waitFor(() => w.rec(r.sendId).phase === "handed_back", { what: "closed lost run" });
    assert.equal(w.rec(r.sendId).result.text, "从 transcript 取到的答案");
  } finally { await w.close(); }
});

test("engine: vrelay.list counts wake/collect turns as running; vrelay.get shows only the visible text", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const r = await w.send(DM, X, "secret sk-proj-abcdefghijklmnopqrstuv here", { runId: "rA" });
    w.endRun("rA", DM);
    const st = await awaitStart(w, "request", r.sendId);
    let l = w.engine.list({ active: true });
    assert.equal(l.counts.running, 1);
    assert.deepEqual(Object.keys(l.items[0]).sort(), ["ageMs", "code", "phase", "requester", "sendId", "target"]);
    w.fake.finishRun(st.args.runId, ok("好"));
    await waitFor(() => w.starts("wake")[0]);
    l = w.engine.list({ active: true });
    assert.equal(l.counts.running, 1, "the wake turn counts (v-self-restart's idle gate)");
    const g = w.engine.get({ code: r.code });
    assert.equal(g.found, true);
    assert.equal(g.record.message.visibleText, "secret ‹已隐去› here");
    assert(!("text" in g.record.message));
    assert(!("idempotencyKey" in g.record));
    assert.deepEqual(w.engine.get({ sendId: "s_nope" }), { found: false });
    assert.equal(w.engine.list({ sessionKey: "agent:makaron:feishu:group:oc_unrelated" }).items.length, 0);
  } finally { await w.close(); }
});

test("tasks: requester rows (queued / running) through extraSources, notified on status changes", async () => {
  const target = { [TASK_REGISTRY_BRIDGE]: { listeners: new Set() } };
  const notices = [];
  target[TASK_REGISTRY_BRIDGE].listeners.add((n) => notices.push(n));
  let tasks;
  const w = await createWorld({ bridge: { holdRuns: true }, onSendChange: (rec) => tasks?.changed(rec) });
  try {
    tasks = createTaskSource({ ledger: w.ledger, target });
    tasks.install();
    assert(target[TASK_REGISTRY_BRIDGE].extraSources.has(tasks.source));
    const r = await w.send(DM, X, "后台行", { runId: "rA" });
    const st = await awaitStart(w, "request", r.sendId);
    await waitFor(() => w.rec(r.sendId).phase === "running");
    const rows = target[TASK_REGISTRY_BRIDGE].extraSources.values().next().value(DM);
    assert.deepEqual(rows, [{ taskId: `v-a2a:${r.sendId}`, runtime: "session", taskKind: "sessions_send", label: `「一个群聊」#${r.code}`, status: "running", runId: st.args.runId, childSessionKey: X, createdAt: w.rec(r.sendId).createdAt }]);
    assert.deepEqual(tasks.source(X), []);
    await sleep(5);
    assert(notices.some((n) => n.kind === "v-a2a" && n.sessionKeys[0] === DM));
    w.fake.finishRun(st.args.runId, ok("好"));
    await waitFor(() => w.rec(r.sendId).phase === "result_ready");
    assert.deepEqual(tasks.source(DM), []);
    tasks.uninstall();
    assert.equal(target[TASK_REGISTRY_BRIDGE].extraSources.size, 0);
  } finally { await w.close(); }
});

test("engine: a second collect round gets a fresh runId, MessageSid and anchor (the core drops a repeated MessageSid)", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const s = await w.send(DM, ROOM(1), "后台要跑两轮", { runId: "rA" });
    w.endRun("rA", DM);
    w.tasks.set(ROOM(1), [{ taskId: "e1", runtime: "cli", taskKind: "exec" }]);
    const st = await awaitStart(w, "request", s.sendId);
    w.fake.finishRun(st.args.runId, ok("第一轮"));
    await waitFor(() => w.rec(s.sendId).phase === "awaiting_background" && w.engine.bgTimers.has(s.sendId), { what: "first background wait" });
    w.tasks.delete(ROOM(1));
    const col1 = await waitFor(() => w.starts("collect")[0], { what: "first collect" });
    // The first collect starts more background work.
    w.tasks.set(ROOM(1), [{ taskId: "e2", runtime: "cli", taskKind: "exec" }]);
    w.fake.finishRun(col1.args.runId, ok("第二轮已开工"));
    await waitFor(() => w.rec(s.sendId).collect?.endedAt && w.engine.bgTimers.has(s.sendId), { what: "second background wait" });
    w.tasks.delete(ROOM(1));
    const col2 = await waitFor(() => w.starts("collect")[1], { what: "second collect" });
    assert.equal(col2.args.attempt, col1.args.attempt + 1);
    assert.equal(col2.args.runId, runIdFor("collect", s.sendId, col1.args.attempt + 1));
    assert.equal(col2.args.messageSid, messageSidFor("collect", s.sendId, col1.args.attempt + 1));
    const collectAnchors = w.posts().filter((p) => /的后台工作都结束了/u.test(p.text));
    assert.equal(collectAnchors.length, 2, "each round has its own anchor");
    assert.equal(col2.args.anchorMessageId, collectAnchors[1].messageId);
    w.fake.finishRun(col2.args.runId, ok("全部完成"));
    const wake = await waitFor(() => w.starts("wake")[0]);
    assert.match(wake.args.promptText, /全部完成/u);
    assert.equal(w.rec(s.sendId).wakeRounds, 2);
  } finally { await w.close(); }
});

test("engine: a refused anchor seen just before the accept deadline answers with the error, never 'accepted'", async () => {
  const w = await createWorld({ bridge: { post: [{ fail: "NOT_MEMBER" }], postDelayMs: 40 }, timing: { anchorPostMs: 60 } });
  try {
    const orig = w.engine._detach.bind(w.engine);
    w.engine._detach = async (...args) => { await sleep(120); return orig(...args); }; // closing outlasts the deadline
    const r = await w.send(DM, X, "机器人不在群里", { runId: "rA" });
    assert.deepEqual([r.status, r.code], ["error", "NOT_MEMBER"]);
    const rec = w.ledger.sendsWhere(() => true)[0];
    assert.equal(rec.phase, "skipped");
    assert.equal(w.ledger.getBatch(rec.batchId)?.members.length ?? 0, 0, "out of its batch: nothing will report it");
    w.endRun("rA", DM);
    await sleep(60);
    assert.equal(w.starts().length, 0);
  } finally { await w.close(); }
});

test("engine: a repeated call of a send refused at accept gets the same error", async () => {
  const w = await createWorld({ bridge: { post: [{ fail: "NOT_MEMBER" }] } });
  try {
    const p = sendParams(DM, X, "机器人不在群里", { runId: "rA", toolCallId: "tc-refused" });
    const first = await w.engine.send(p);
    assert.deepEqual([first.status, first.code], ["error", "NOT_MEMBER"]);
    const again = await w.engine.send(p);
    assert.deepEqual(again, first);
    assert.equal(w.starts().length, 0);
  } finally { await w.close(); }
});

test("engine: a send never joins a batch whose wake is already decided — it gets its own and is handed back", async () => {
  const w = await createWorld({ bridge: { holdRuns: true } });
  try {
    const a = await w.send(DM, ROOM(1), "异步一件", { runId: "rA" });
    const i = await w.send(DM, ROOM(2), "顺便问一句", { runId: "rA", mode: "inline", timeoutMs: 120_000 });
    const batchId = w.rec(a.sendId).batchId;
    const ia = await awaitStart(w, "request", i.sendId);
    w.fake.finishRun(ia.args.runId, ok("答案在此"));
    await waitFor(() => w.rec(i.sendId).phase === "result_ready", { what: "inline result" });
    w.endRun("rA", DM); // expires the unclaimed inline send into rA's batch…
    await waitFor(() => w.rec(i.sendId).inline.expiredAt);
    // …but suppose the batch had already moved on when that join landed (the race this guards):
    const st = await awaitStart(w, "request", a.sendId);
    w.fake.finishRun(st.args.runId, ok("一号完成"));
    const wake1 = await waitFor(() => w.starts("wake")[0], { what: "first wake" });
    assert.equal(wake1.args.id, batchId);
    const late = await w.ledger.createSend({ ...structuredClone(w.rec(i.sendId)), sendId: `${i.sendId.slice(0, -4)}beef`, idempotencyKey: "ss:late", contentKey: "late", code: "Z9Z9", batchId, phase: "result_ready" });
    const joined = await w.engine._joinBatch(late, batchId, {});
    assert.notEqual(joined, batchId, "a woken batch takes no new member");
    assert.equal(w.rec(late.sendId).batchId, joined);
    assert(!w.ledger.getBatch(batchId).members.includes(late.sendId));
    w.fake.finishRun(wake1.args.runId, ok("汇报一"));
    const wake2 = await waitFor(() => w.starts("wake").find((c) => c.args.id === joined), { what: "the late send's own wake" });
    assert.match(wake2.args.promptText, /#Z9Z9/u);
    w.fake.finishRun(wake2.args.runId, ok("汇报二"));
    await waitFor(() => w.rec(late.sendId).phase === "handed_back", { what: "late send handed back" });
  } finally { await w.close(); }
});

test("engine: the accepted result carries the target's label for the core's own notes and the poll guard", async () => {
  const w = await createWorld();
  try {
    const r = await w.send(DM, X, "给个标签", { runId: "rA" });
    assert.equal(r.label, "一个群聊");
    const again = await w.send(DM, X, "给个标签", { runId: "rA" });
    assert.equal(again.label, "一个群聊");
  } finally { await w.close(); }
});

test("engine: the claim CAS itself refuses an expired or already-claimed inline result", async () => {
  const w = await createWorld();
  try {
    const a = await w.send(DM, ROOM(1), "问 a", { runId: "rA", mode: "inline", timeoutMs: 120_000 });
    await waitFor(() => w.rec(a.sendId).phase === "result_ready");
    await w.engine._expireInline(a.sendId, "test");
    assert.equal(await w.engine._claim(a.sendId), null, "expired: the wake owns it now");
    assert.equal(w.rec(a.sendId).phase, "result_ready");
    const b = await w.send(DM, ROOM(2), "问 b", { runId: "rB", mode: "inline", timeoutMs: 120_000 });
    await waitFor(() => w.rec(b.sendId).phase === "result_ready");
    assert(await w.engine._claim(b.sendId));
    assert.equal(await w.engine._claim(b.sendId), null, "claimed once");
  } finally { await w.close(); }
});

test("engine: a slow route lookup for one chat does not hold other sends behind the accept lock", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const w = await createWorld({
    bridge: {
      async resolveRoute(q) {
        if (q.sessionKey === ROOM(9)) await gate; // Feishu getChatInfo hanging for this one group
        const [, , , chatType, peer] = q.sessionKey.split(":");
        return { ok: true, route: { channel: "feishu", accountId: "default", to: chatType === "group" ? `chat:${peer}` : `user:${peer}`, chatId: peer, chatType, ...(chatType === "direct" ? { peerId: peer, humans: "owner_only" } : { humans: "unknown" }) } };
      },
    },
  });
  try {
    const slow = w.send(DM, ROOM(9), "慢的那个", { runId: "rA" });
    await sleep(20);
    const fast = await Promise.race([w.send(DM, ROOM(1), "快的这个", { runId: "rA" }), sleep(1_000).then(() => "blocked")]);
    assert.notEqual(fast, "blocked", "the other send went through while the slow lookup hangs");
    assert.equal(fast.status, "accepted");
    release();
    assert.equal((await slow).status, "accepted");
  } finally { release(); await w.close(); }
});
