import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as vx from "../apps/v-experience/v-experience.mjs";
import { patchReplyChunk, patchDingtalkConnector, MARKER } from "../apps/v-experience/dingtalk/patch.mjs";

const PROGRESS = Symbol.for("openclaw.v.progressCardChangedListeners");
const BRIDGE = Symbol.for("openclaw.v.taskRegistryBridge");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ASK = "ask_" + "a".repeat(32);

test("work view: progress card plan, tool line, commentary; answer stays on top", () => {
  globalThis[PROGRESS] = new Set();
  let changes = 0;
  const view = vx.createWorkView({ sessionKey: "agent:makaron:dingtalk:direct:U1", onChange: () => changes++ });
  assert.equal(view.compose("你好"), "你好", "no work, no rule");
  for (const fn of globalThis[PROGRESS]) fn({ sessionKey: "AGENT:makaron:dingtalk:direct:u1", card: { steps: [
    { step: "查资料", status: "completed" }, { step: "写*草稿*", status: "in_progress" }, { step: "检查", status: "pending" },
  ] } });
  for (const fn of globalThis[PROGRESS]) fn({ sessionKey: "agent:other", card: { steps: [{ step: "别人的", status: "pending" }] } });
  assert.equal(view.toolStart({ name: "mcp__openclaw__progress_card", phase: "start" }), false, "progress_card is not a visible tool");
  view.compose("草稿如下");
  view.toolStart({ name: "exec", phase: "start" });
  view.itemEvent({ kind: "preamble", itemId: "i1", progressText: "先查一下资料" });
  const md = view.compose("草稿如下");
  assert.match(md, /^草稿如下\n\n---\n\n💬 先查一下资料\n\n✅ 查资料\n▶️ \*\*写\\\*草稿\\\*\*\*（进行中）\n◻️ 检查\n\n⚙️ 正在运行命令$/u);
  assert.doesNotMatch(md, /别人的/u);
  assert(changes >= 3);
  view.questionPending(true);
  assert.match(view.markdown(), /❓ 等你回答上面的问题$/u);
  view.dispose();
  assert.equal(globalThis[PROGRESS].size, 0, "unsubscribed");
});

test("ask prompt and chat answers", () => {
  const record = { id: ASK, status: "pending", questions: [{ questionId: "q1", question: "周末做什么？", multiSelect: true, options: [{ label: "爬山" }, { label: "看电影" }, { label: "读书" }] }] };
  assert(vx.isRenderableAsk(record));
  assert(vx.needsStagedAsk(record));
  const prompt = vx.askPromptMarkdown(record);
  assert.match(prompt, /\*\*周末做什么？\*\*（可多选）\n1\. 爬山\n2\. 看电影\n3\. 读书/u);
  assert.match(prompt, /「1、3」/u);
  assert.deepEqual(vx.readAskChatAnswers(record, "1、3").answers.q1, ["爬山", "读书"]);
  assert.deepEqual(vx.readAskChatAnswers(record, "随便").answers.q1, ["随便"]);
  const two = { id: ASK, questions: [
    { questionId: "a", question: "颜色？", options: [{ label: "红" }, { label: "蓝" }] },
    { questionId: "b", question: "尺寸？", options: [] },
  ] };
  const r = vx.readAskChatAnswers(two, "1. 蓝\n2. 大号");
  assert.deepEqual([r.answers.a, r.answers.b, r.remaining.length], [["蓝"], ["大号"], 0]);
  assert.match(vx.askPromptMarkdown(two), /请按题号逐行回复/u);
});

test("ask runtime stages choices per person and resolves once", async () => {
  const record = { id: ASK, status: "pending", questions: [{ questionId: "q1", question: "周末？", multiSelect: true, options: [{ label: "爬山" }, { label: "读书" }] }] };
  const resolved = [];
  const rt = vx.createAskRuntime({ getQuestion: async () => record, resolve: async (...args) => { resolved.push(args); } });
  assert.equal((await rt.confirm(ASK, "u1", "x")).kind, "incomplete");
  await rt.choose(ASK, "u1", 0, 0);
  await rt.choose(ASK, "u1", 0, 1);
  await rt.choose(ASK, "u1", 0, 0);
  await rt.choose(ASK, "u2", 0, 0);
  const done = await rt.confirm(ASK, "u1", "dingtalk:u1");
  assert.equal(done.kind, "answered");
  assert.deepEqual(JSON.parse(JSON.stringify(resolved)), [[ASK, { answers: { q1: ["读书"] } }, "dingtalk:u1"]]);
  assert.equal((await rt.confirm(ASK, "u2", "x")).kind, "closed");
});

test("background line follows the session's work and closes", async () => {
  let active = [{ runtime: "subagent" }, { runtime: "cli", taskKind: "exec" }];
  const listeners = new Set();
  globalThis[BRIDGE] = { listActive: () => active, listeners };
  const shown = [];
  vx.watchBackground({ channel: "test", sessionKey: "s1", show: async (line) => shown.push(line), pollMs: 20, debounceMs: 5 });
  await sleep(10);
  assert.deepEqual(shown, ["⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1"]);
  active = [{ runtime: "subagent" }];
  for (const fn of listeners) fn({ kind: "upsert", sessionKeys: ["S1"] });
  await sleep(30);
  active = [];
  await sleep(40);
  assert.deepEqual(shown, ["⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1", "⏳ 后台 1 项进行中 · 子 agent", "☑️ 后台任务已结束"]);
  assert.equal(listeners.size, 0);

  // Nothing running: nothing shown. A newer reply retires the older line.
  const quiet = [];
  vx.watchBackground({ channel: "test", sessionKey: "s2", show: async (l) => quiet.push(l), pollMs: 20 });
  assert.deepEqual(quiet, []);
  active = [{ runtime: "subagent" }];
  const retired = [];
  vx.watchBackground({ channel: "test", sessionKey: "s3", show: async () => {}, retire: async () => retired.push("old"), pollMs: 1000 });
  await sleep(5);
  const w2 = vx.watchBackground({ channel: "test", sessionKey: "s3", show: async () => {}, pollMs: 1000 });
  await sleep(5);
  assert.deepEqual(retired, ["old"]);
  w2.stop();
  delete globalThis[BRIDGE];
});

test("background line ignores the session's own foreground cli run", () => {
  const tasks = [{ runtime: "cli", childSessionKey: "Agent:A" }, { runtime: "cli", taskKind: "exec", childSessionKey: "agent:a" }];
  assert.deepEqual(vx.backgroundTasks(tasks, "agent:a").map((t) => t.taskKind), ["exec"]);
});

test("telegram staged question keyboard and callback data", () => {
  const record = { id: ASK, questions: [{ questionId: "q", question: "选？", multiSelect: true, options: [{ label: "甲" }, { label: "乙" }] }] };
  const rows = vx.telegramAskKeyboard(record, { choices: { 0: [1] } });
  assert.deepEqual(rows.flat().map((b) => b.text), ["甲", "✅ 乙", "确认"]);
  for (const b of rows.flat()) assert(Buffer.byteLength(b.callback_data) <= 64);
  assert.deepEqual(vx.parseTelegramExperienceCallback(rows[0][1].callback_data), { kind: "toggle", id: ASK, questionIndex: 0, optionIndex: 1 });
  assert.deepEqual(vx.parseTelegramExperienceCallback(rows.at(-1)[0].callback_data), { kind: "confirm", id: ASK });
  assert.equal(vx.parseTelegramExperienceCallback("tgv1:t:zz"), undefined);
});

test("dingtalk patch applies to V's connector chunk exactly once", () => {
  const baseline = fs.readFileSync(new URL("../apps/v-experience/dingtalk/baseline/message-handler-BUoLSylZ.mjs", import.meta.url), "utf8");
  const patched = patchReplyChunk(baseline);
  assert.notEqual(patched, baseline);
  assert.equal(patchReplyChunk(patched), patched, "idempotent");
  for (const needle of ["vSessionKey: sessionKey", "vWork.compose(displayContent)", "await vDeliverToolPayload(payload)", "vStartBackground(cardSnapshot, finalText)", "onPlanUpdate: (payload) =>", "vWork.dispose()"]) {
    assert(patched.includes(needle), needle);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vx-ding-"));
  fs.writeFileSync(path.join(dir, "message-handler-BUoLSylZ.mjs"), baseline);
  const result = patchDingtalkConnector(dir, { experienceSource: new URL("../apps/v-experience/v-experience.mjs", import.meta.url).pathname });
  assert.equal(result.changed, true);
  assert(fs.readFileSync(path.join(dir, "message-handler-BUoLSylZ.mjs"), "utf8").includes(MARKER));
  assert(fs.existsSync(path.join(dir, "v-experience.mjs")));
});

test("wecom patch applies to V's monitor exactly once", async () => {
  const { patchMonitor, MARKER: WECOM_MARKER } = await import("../apps/v-experience/wecom/patch.mjs");
  const baseline = fs.readFileSync(new URL("../apps/v-experience/wecom/baseline/monitor.js", import.meta.url), "utf8");
  const patched = patchMonitor(baseline);
  assert(patched.includes(WECOM_MARKER));
  assert.equal(patchMonitor(patched), patched);
  for (const needle of ["onPartialReply: (payload) =>", "await vStop();", "vExperience.answerTrackedQuestion", "await vDeliverQuestion(payload)"]) assert(patched.includes(needle), needle);
});

test("tracked chat question: answer, partial answer, and ended elsewhere", async () => {
  const record = { id: "ask_" + "b".repeat(32), status: "pending", expiresAtMs: Date.now() + 60_000, questions: [
    { questionId: "a", question: "颜色？", options: [{ label: "红" }, { label: "蓝" }] },
    { questionId: "b", question: "数量？", options: [] },
  ] };
  const calls = [];
  const resolve = async (...args) => { calls.push(args); };
  assert(vx.trackChatQuestion({ channel: "t", chatKey: "c1", senderId: "u1", record }));
  assert.equal(vx.hasTrackedQuestion({ channel: "t", chatKey: "c1", senderId: "u2" }), false, "only the asker answers");
  const first = await vx.answerTrackedQuestion({ channel: "t", chatKey: "c1", senderId: "u1", text: "2", resolve });
  assert.match(first.notice, /请继续回答「数量？」/u);
  const second = await vx.answerTrackedQuestion({ channel: "t", chatKey: "c1", senderId: "u1", text: "三个", resolve });
  assert.equal(second.notice, "✓ 已收到：蓝；三个");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[record.id, { answers: { a: ["蓝"], b: ["三个"] } }, "t:chat:u1"]]);
  assert.equal(vx.hasTrackedQuestion({ channel: "t", chatKey: "c1", senderId: "u1" }), false);

  vx.trackChatQuestion({ channel: "t", chatKey: "c2", record: { ...record, questions: [record.questions[0]] } });
  const ended = await vx.answerTrackedQuestion({ channel: "t", chatKey: "c2", senderId: "u9", text: "红", resolve: async () => { const e = new Error("x"); e.details = { reason: "QUESTION_ALREADY_TERMINAL" }; throw e; } });
  assert.deepEqual(ended, { handled: false }, "a question answered elsewhere lets the message through");
});

test("work view drops the tool and question line once the answer moves on", () => {
  const view = vx.createWorkView({ sessionKey: "s-move" });
  view.compose("");
  view.toolStart({ name: "exec", phase: "start" });
  assert.match(view.compose(""), /⚙️ 正在运行命令/u);
  assert.doesNotMatch(view.compose("结果是"), /⚙️/u);
  view.questionPending(true);
  assert.match(view.compose("结果是"), /❓/u);
  assert.equal(view.compose("结果是 42"), "结果是 42");
  view.dispose();
});

test("question listener set is created before the core's lazy module", () => {
  const key = Symbol.for("openclaw.questionChannelRequestedListeners");
  delete globalThis[key];
  const got = [];
  const off = vx.onQuestionRequested("agent:a:x", (r) => got.push(r.id));
  assert(globalThis[key] instanceof Set && globalThis[key].size === 1);
  for (const fn of globalThis[key]) fn({ id: "q1", sessionKey: "AGENT:a:x", status: "pending" });
  for (const fn of globalThis[key]) fn({ id: "q2", sessionKey: "agent:b", status: "pending" });
  assert.deepEqual(got, ["q1"]);
  off();
  assert.equal(vx.claimQuestionDelivery("q9"), true);
  assert.equal(vx.claimQuestionDelivery("q9"), false);
});
