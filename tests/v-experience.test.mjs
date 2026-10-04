import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as vx from "../apps/v-experience/v-experience.mjs";
import { patchReplyChunk, patchRuntimeChunk, patchDingtalkConnector, MARKER } from "../apps/v-experience/dingtalk/patch.mjs";

const PROGRESS = Symbol.for("openclaw.v.progressCardChangedListeners");
const BRIDGE = Symbol.for("openclaw.v.taskRegistryBridge");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ASK = "ask_" + "a".repeat(32);

test("work view: Feishu layout — commentary, tool line, plan; final keeps only the answer", () => {
  globalThis[PROGRESS] = new Set();
  let changes = 0;
  const view = vx.createWorkView({ sessionKey: "agent:makaron:dingtalk:direct:U1", onChange: () => changes++, formatTool: (name) => name === "exec" ? "🛠️ Exec" : "" });
  assert.equal(view.compose(""), "", "nothing yet");
  for (const fn of globalThis[PROGRESS]) fn({ sessionKey: "AGENT:makaron:dingtalk:direct:u1", card: { steps: [
    { step: "查资料", status: "completed" }, { step: "写*草稿*", status: "in_progress" }, { step: "检查", status: "pending" },
  ] } });
  for (const fn of globalThis[PROGRESS]) fn({ sessionKey: "agent:other", card: { steps: [{ step: "别人的", status: "pending" }] } });
  assert.equal(view.toolStart({ name: "mcp__openclaw__progress_card", phase: "start" }), false, "progress_card is not a visible tool");
  view.itemEvent({ kind: "preamble", itemId: "i1", progressText: "先查一下资料。" });
  view.itemEvent({ kind: "preamble", itemId: "i2", progressText: "资料够了，开始写。" });
  view.toolStart({ name: "exec", phase: "start" });
  assert.equal(view.compose(""), "先查一下资料。\n\n资料够了，开始写。\n\n🛠️ Exec\n\n---\n\n☑️ 查资料\n▶️ **写\\*草稿\\***　进行中\n◻️ 检查");
  assert.doesNotMatch(view.compose(""), /别人的/u);
  const writing = view.compose("草稿如下");
  assert.match(writing, /^草稿如下\n\n---\n\n☑️ 查资料/u, "the answer replaces the commentary and ends the tool line");
  assert.equal(view.finalText("草稿如下"), "草稿如下");
  assert(changes >= 4);
  view.dispose();
  assert.equal(globalThis[PROGRESS].size, 0, "unsubscribed");
});

test("work view: a question inside the reply, staged, then collapsed to its record", () => {
  const view = vx.createWorkView({ sessionKey: "s-q", optionLink: (t) => `dtmd://send?c=${encodeURIComponent(t)}` });
  const record = { id: ASK, status: "pending", questions: [{ questionId: "q1", question: "周末做什么？", multiSelect: true, options: [{ label: "爬山" }, { label: "读书" }] }] };
  view.showQuestion(record, { prefix: "先问一下：" });
  assert(view.waitingForAnswer());
  const asking = view.compose("");
  assert.match(asking, /^先问一下：\n\n\*\*周末做什么？\*\*（可多选）\n▫️ \[爬山\]\(dtmd:\/\/send\?c=%E7%88%AC%E5%B1%B1\)/u);
  assert.match(asking, /选好后点 \[确认\]/u);
  view.stageQuestion({ 0: ["读书"] });
  assert.match(view.compose(""), /✅ \[读书\]/u);
  view.questionAnswered({ answers: { q1: ["读书"] } });
  assert.equal(view.waitingForAnswer(), false);
  assert.equal(view.compose("好的，安排读书。"), "先问一下：\n\n✓ 已选择：读书\n\n好的，安排读书。");
  assert.equal(view.finalText("好的，安排读书。"), "先问一下：\n\n✓ 已选择：读书\n\n好的，安排读书。");
  view.dispose();
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

test("telegram question message is HTML like the Feishu question card", () => {
  const record = { id: ASK, questions: [{ questionId: "q", question: "周末<想>做什么？", multiSelect: true, options: [{ label: "爬山" }, { label: "读书" }] }] };
  const pending = vx.telegramAskHtml(record);
  assert.match(pending, /^<b>周末&lt;想&gt;做什么？<\/b>（可多选）/u);
  assert.doesNotMatch(pending, /爬山/u, "options live on the buttons");
  assert.match(pending, /<i>选好后点「确认」/u);
  assert.match(vx.telegramAskHtml(record, "pending", { immediate: true }), /点一个选项/u);
  const described = { ...record, questions: [{ ...record.questions[0], options: [{ label: "爬山", description: "去西湖" }, { label: "读书" }] }] };
  assert.match(vx.telegramAskHtml(described), /• 爬山 — 去西湖\n• 读书/u);
  assert.equal(vx.telegramAskHtml(record, "answered", { answers: { answers: { q: ["爬山", "读书"] } } }).split("\n\n")[1], "✓ 已选择：爬山、读书");
});

test("work view closed at a question repeats only the answer record", () => {
  const view = vx.createWorkView({ sessionKey: "agent:a:wecom:direct:1" });
  const record = { id: ASK, questions: [{ questionId: "q", question: "去哪个城市？", options: [{ label: "杭州" }, { label: "苏州" }] }] };
  view.showQuestion(record, { prefix: "先问一下。" });
  assert.match(view.compose(""), /先问一下[\s\S]*去哪个城市/u);
  view.closedAtQuestion();
  assert.equal(view.finalText("按默认继续。"), "按默认继续。", "unanswered question is not shown again");
  view.questionAnswered({ answers: { q: ["苏州"] } });
  assert.equal(view.finalText("苏州不错。"), "✓ 已选择：苏州\n\n苏州不错。");
  view.dispose();
});

test("work view clears the working part for a question and keeps the plan", () => {
  const view = vx.createWorkView({ sessionKey: "agent:a:telegram:direct:1" });
  view.planUpdate({ phase: "update", steps: [{ step: "了解偏好", status: "in_progress" }, { step: "给建议", status: "pending" }] });
  view.itemEvent({ kind: "preamble", itemId: "c1", progressText: "先问一下你的偏好。" });
  view.toolStart({ name: "ask_user", phase: "start" });
  assert.match(view.compose(""), /先问一下/u);
  view.clearWorking();
  const after = view.compose("");
  assert.doesNotMatch(after, /先问一下/u);
  assert.match(after, /▶️ \*\*了解偏好\*\*/u);
  view.dispose();
});

test("dingtalk patch applies to V's connector chunk exactly once", () => {
  const baseline = fs.readFileSync(new URL("../apps/v-experience/dingtalk/baseline/message-handler-BUoLSylZ.mjs", import.meta.url), "utf8");
  const patched = patchReplyChunk(baseline);
  assert.notEqual(patched, baseline);
  assert.equal(patchReplyChunk(patched), patched, "idempotent");
  for (const needle of ["const updateInterval = 300;", "vSessionKey: sessionKey", "vWork.compose(displayContent)", "await vDeliverToolPayload(payload)", "vStartBackground(cardSnapshot, finalText)", "vWork.finalText(finalText)", "dtmd://dingtalkclient/sendMessage", "onPlanUpdate: (payload) =>", "vWork.dispose()"]) {
    assert(patched.includes(needle), needle);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vx-ding-"));
  fs.writeFileSync(path.join(dir, "message-handler-BUoLSylZ.mjs"), baseline);
  fs.copyFileSync(new URL("../apps/v-experience/dingtalk/baseline/connection-DCvu-l09.mjs", import.meta.url), path.join(dir, "connection-DCvu-l09.mjs"));
  fs.copyFileSync(new URL("../apps/v-experience/dingtalk/baseline/runtime-C81EKBS1.mjs", import.meta.url), path.join(dir, "runtime-C81EKBS1.mjs"));
  const result = patchDingtalkConnector(dir, { experienceSource: new URL("../apps/v-experience/v-experience.mjs", import.meta.url).pathname });
  assert.equal(result.changed, true);
  assert(fs.readFileSync(path.join(dir, "message-handler-BUoLSylZ.mjs"), "utf8").includes(MARKER));
  assert(fs.readFileSync(path.join(dir, "connection-DCvu-l09.mjs"), "utf8").includes("/v1.0/card/instances/callback"));
  assert(fs.existsSync(path.join(dir, "v-experience.mjs")));
  assert(fs.readFileSync(path.join(dir, "runtime-C81EKBS1.mjs"), "utf8").includes("renderPresentation:"));
  assert.equal(patchDingtalkConnector(dir, { experienceSource: new URL("../apps/v-experience/v-experience.mjs", import.meta.url).pathname }).changed, false, "second run changes nothing");
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

test("tracked multiple choice: labels toggle, 确认 submits, inline needs no acknowledgement", async () => {
  const record = { id: "ask_" + "c".repeat(32), status: "pending", expiresAtMs: Date.now() + 60_000, questions: [{ questionId: "w", question: "周末？", multiSelect: true, options: [{ label: "爬山" }, { label: "读书" }, { label: "做饭" }] }] };
  const staged = []; const answered = []; const calls = [];
  vx.trackChatQuestion({ channel: "t", chatKey: "m1", senderId: "u1", record, inline: true, onStaged: (s) => staged.push(s), onAnswered: (a) => answered.push(a) });
  const r1 = await vx.answerTrackedQuestion({ channel: "t", chatKey: "m1", senderId: "u1", text: "爬山", resolve: async (...a) => calls.push(a) });
  await vx.answerTrackedQuestion({ channel: "t", chatKey: "m1", senderId: "u1", text: "读书", resolve: async (...a) => calls.push(a) });
  assert.equal(vx.shouldSendAnswerNotice(r1), false, "inline staging is shown in the reply");
  assert.deepEqual(staged.at(-1), { 0: ["爬山", "读书"] });
  const r3 = await vx.answerTrackedQuestion({ channel: "t", chatKey: "m1", senderId: "u1", text: "确认", resolve: async (...a) => calls.push(a) });
  assert.equal(r3.answered, true);
  assert.equal(vx.shouldSendAnswerNotice(r3), false);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[record.id, { answers: { w: ["爬山", "读书"] } }, "t:chat:u1"]]);
  assert.equal(answered.length, 1);
  vx.trackChatQuestion({ channel: "t", chatKey: "m2", senderId: "u1", record: { ...record, id: "ask_" + "d".repeat(32) } });
  const r4 = await vx.answerTrackedQuestion({ channel: "t", chatKey: "m2", senderId: "u1", text: "1、3", resolve: async () => {} });
  assert.equal(r4.answered, true);
  assert.equal(vx.shouldSendAnswerNotice(r4), true, "not inline: acknowledge in chat");
});

test("DingTalk question card: one tap answers a single choice; others stage then submit; only the asker", async () => {
  const one = { id: "ask_" + "e".repeat(32), questions: [{ questionId: "c", question: "去哪？", options: [{ label: "杭州" }, { label: "苏州" }] }] };
  const data = vx.dingtalkQuestionCardData(one);
  assert.equal(data.title, "去哪？");
  assert.equal(JSON.parse(data.form_fields)[0].type, "CHECKBOX_LIST");
  const resolved = [];
  let answered;
  vx.trackDingtalkQuestionCard({ outTrackId: "vq1", record: one, asker: "u1", resolve: async (a, by) => resolved.push([a, by]), onAnswered: (a) => { answered = a; } });
  const tap = (out, user, params) => vx.handleDingtalkCardCallback({ outTrackId: out, userId: user, content: JSON.stringify({ cardPrivateData: { actionIds: ["x"], params } }) });
  const other = await tap("vq1", "u2", { name: "q0", type: "CHECKBOX_LIST", value: 1 });
  assert.equal(other.cardData.cardParamMap.err_msg, "这个问题在问别人。");
  const r = await tap("vq1", "u1", { name: "q0", type: "CHECKBOX_LIST", value: 1 });
  assert.equal(r.cardData.cardParamMap.form_status, "disabled");
  assert.equal(r.cardData.cardParamMap.button_text, "✓ 已选择：苏州");
  assert.deepEqual(JSON.parse(JSON.stringify(resolved)), [[{ answers: { c: ["苏州"] } }, "dingtalk:card:u1"]]);
  assert.deepEqual(JSON.parse(JSON.stringify(answered)), { answers: { c: ["苏州"] } });

  const multi = { id: "ask_" + "f".repeat(32), questions: [{ questionId: "w", question: "周末？", multiSelect: true, options: [{ label: "爬山" }, { label: "读书" }] }] };
  const got = [];
  vx.trackDingtalkQuestionCard({ outTrackId: "vq2", record: multi, resolve: async (a) => got.push(a) });
  const s1 = await tap("vq2", "u1", { name: "q0", type: "CHECKBOX_LIST_MULTI", value: 0 });
  assert.equal(s1.cardData.cardParamMap.form_status, "normal");
  assert.equal(JSON.parse(s1.cardData.cardParamMap.form_fields)[0].checkbox_items[0].checked, true);
  const empty = await vx.handleDingtalkCardCallback({ outTrackId: "vq2", userId: "u1", content: JSON.stringify({ cardPrivateData: { params: { submit_form_fields: [{ name: "q0", type: "CHECKBOX_LIST_MULTI", checkbox_items: [] }] } } }) });
  assert.match(empty.cardData.cardParamMap.err_msg, /请先回答/u);
  const done = await vx.handleDingtalkCardCallback({ outTrackId: "vq2", userId: "u1", content: JSON.stringify({ cardPrivateData: { params: { submit_form_fields: [{ name: "q0", type: "CHECKBOX_LIST_MULTI", checkbox_items: [{ value: 0, checked: true }, { value: 1, checked: true }] }] } } }) });
  assert.equal(done.cardData.cardParamMap.button_text, "✓ 已选择：爬山、读书");
  assert.deepEqual(JSON.parse(JSON.stringify(got)), [{ answers: { w: ["爬山", "读书"] } }]);
});

test("DingTalk and WeCom no longer mark every message as an authorized command", async () => {
  const ding = patchReplyChunk(fs.readFileSync(new URL("../apps/v-experience/dingtalk/baseline/message-handler-BUoLSylZ.mjs", import.meta.url), "utf8"));
  assert(!ding.includes("CommandAuthorized: true"));
  assert(ding.includes("CommandAuthorized: vCommandAuthorized({ core, cfg, config, senderId, text: userContent })"));
  const { patchMonitor } = await import("../apps/v-experience/wecom/patch.mjs");
  const wecom = patchMonitor(fs.readFileSync(new URL("../apps/v-experience/wecom/baseline/monitor.js", import.meta.url), "utf8"));
  assert(!wecom.includes("CommandAuthorized: true"));
  assert(wecom.includes('import { resolveWecomCommandAuthorization as vResolveCommandAuthorization } from "./shared/command-auth.js";'));
  assert.match(wecom, /CommandAuthorized: \(await vResolveCommandAuthorization\(\{[\s\S]*?rawBody: messageBody,[\s\S]*?\}\)\)\.commandAuthorized === true,/u);

  // The DingTalk helper against 9.1's command helpers.
  const helper = ding.match(/function vCommandAuthorized\([\s\S]*?\n\}\n/u)[0];
  const vCommandAuthorized = new Function(`${helper}; return vCommandAuthorized;`)();
  const core = { channel: { commands: {
    shouldComputeCommandAuthorized: (text) => /(?:^|\s)[/!][a-z]/iu.test(text),
    resolveCommandAuthorizedFromAuthorizers: ({ useAccessGroups, authorizers }) => !useAccessGroups || authorizers.some((a) => a.configured && a.allowed),
  } } };
  const cfg = { commands: {} };
  const auth = (config, senderId, text) => vCommandAuthorized({ core, cfg, config, senderId, text });
  assert.equal(auth({ dmPolicy: "open", allowFrom: ["*"] }, "u1", "你好"), false, "plain chat is not a command");
  assert.equal(auth({ dmPolicy: "open", allowFrom: ["*"] }, "u1", "/model vcc"), true);
  assert.equal(auth({}, "u1", "/model vcc"), true, "default policy is open");
  assert.equal(auth({ dmPolicy: "allowlist", allowFrom: ["u2"] }, "u1", "/model vcc"), false);
  assert.equal(auth({ dmPolicy: "allowlist", allowFrom: [12345] }, "12345", "/restart"), true);
});

// ---------------------------------------------------------- credentials by link

const SECRET_RECORD = { id: "ask_" + "9".repeat(32), status: "pending", expiresAtMs: Date.now() + 10 * 60_000, questions: [{ questionId: "secret_value", question: "V_DEMO_TOKEN", isSecret: true, options: [], secretStore: { name: "V_DEMO_TOKEN", kind: "secret", reason: "测试用", allowedHosts: ["api.example.com"] } }] };

async function withSecretService(fn) {
  const { createService } = await import("../apps/v-secret-entry/server.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vx-secret-"));
  fs.writeFileSync(path.join(dir, "admin-token"), "vx-admin-token-0123456789abcdef\n");
  const resolved = [];
  const service = createService({ bind: "127.0.0.1", publicBind: "127.0.0.1", publicPort: 0, adminPort: 0, pathPrefix: "/secret-entry", publicBaseUrl: "https://v.example.test", stateDir: path.join(dir, "state"), adminTokenFile: path.join(dir, "admin-token") }, { resolve: async (link, value) => resolved.push({ link, value }) });
  const ports = await service.listen();
  const env = { V_SECRET_ENTRY_ADMIN_URL: `http://127.0.0.1:${ports.adminPort}/`, V_SECRET_ENTRY_ADMIN_TOKEN_FILE: path.join(dir, "admin-token") };
  try { return await fn({ env, ports, service, resolved }); } finally { await service.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}

test("credential question in a direct chat: a one-time link, the question stays open", async () => {
  await withSecretService(async ({ env, ports, service, resolved }) => {
    const here = [];
    let cancelled = 0;
    const how = await vx.deliverSecretQuestion({ record: SECRET_RECORD, channel: "telegram", askerId: 70000001, direct: true, env, sendHere: async (t) => here.push(t), cancel: () => cancelled++ });
    assert.equal(how, "link");
    assert.equal(cancelled, 0, "the question is not cancelled");
    assert.equal(here.length, 1);
    assert.match(here[0], /^🔑 V 需要凭据 V_DEMO_TOKEN：请点开这个一次性链接填写，链接只能用一次、10 分钟内有效；值不会出现在聊天记录里。\nhttps:\/\/v\.example\.test\/secret-entry\/#[\w-]{40,}$/u);
    const [link] = service.registry.list();
    assert.deepEqual({ q: link.questionId, key: link.answerKey, name: link.name, reason: link.reason, hosts: link.allowedHosts, channel: link.channel, asker: link.askerId, exp: link.expiresAtMs },
      { q: SECRET_RECORD.id, key: "secret_value", name: "V_DEMO_TOKEN", reason: "测试用", hosts: ["api.example.com"], channel: "telegram", asker: "70000001", exp: SECRET_RECORD.expiresAtMs });
    const token = here[0].split("#")[1];
    const res = await fetch(`http://127.0.0.1:${ports.publicPort}/secret-entry/api/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, value: "s3cret" }) });
    assert.equal(res.status, 200);
    assert.equal(resolved[0].value, "s3cret");
    assert.equal(resolved[0].link.questionId, SECRET_RECORD.id);
    assert.match(vx.secretLinkMessage(SECRET_RECORD, { url: "https://x/secret-entry/#a_b", expiresAtMs: Date.now() + 60_000 }, { markdown: true }), /\n\n\[点这里填写\]\(https:\/\/x\/secret-entry\/#a_b\)$/u);
  });
});

test("credential question in a group: the link goes to the asker privately, or notice + cancel", async () => {
  await withSecretService(async ({ env, service }) => {
    const here = [];
    const dm = [];
    const how = await vx.deliverSecretQuestion({ record: SECRET_RECORD, channel: "dingtalk", askerId: "staff1", direct: false, markdown: true, env, sendHere: async (t) => here.push(t), sendPrivate: async (t) => dm.push(t), cancel: () => assert.fail("not cancelled") });
    assert.equal(how, "link-private");
    assert.match(dm[0], /\[点这里填写\]\(https:\/\/v\.example\.test\/secret-entry\/#/u);
    assert.deepEqual(here, ["🔑 V 需要凭据 V_DEMO_TOKEN，录入链接已私信发给你。"]);

    here.length = 0;
    let cancelled = 0;
    const other = "ask_" + "8".repeat(32);
    const failed = await vx.deliverSecretQuestion({ record: { ...SECRET_RECORD, id: other }, channel: "telegram", askerId: "70000002", direct: false, env, sendHere: async (t) => here.push(t), sendPrivate: async () => { throw new Error("403 bot can't initiate conversation"); }, cancel: () => cancelled++ });
    assert.equal(failed, "cancelled");
    assert.equal(cancelled, 1);
    assert.deepEqual(here, [vx.secretQuestionNotice(SECRET_RECORD)], "no link in the group");
    assert.equal(service.registry.list().find((l) => l.questionId === other).state, "closed", "the undelivered link is revoked");
  });
});

test("credential question without the link service: notice + cancel", async () => {
  const here = [];
  let cancelled = 0;
  let fetched = 0;
  const fetchImpl = async () => { fetched++; return new Response("{}", { status: 500 }); };
  assert.equal(await vx.deliverSecretQuestion({ record: SECRET_RECORD, channel: "wecom", askerId: "u1", direct: true, env: {}, fetchImpl, sendHere: async (t) => here.push(t), cancel: () => cancelled++ }), "cancelled");
  assert.equal(fetched, 0, "not configured: nothing fetched");
  const env = { V_SECRET_ENTRY_ADMIN_URL: "http://127.0.0.1:1", V_SECRET_ENTRY_ADMIN_TOKEN_FILE: new URL(import.meta.url).pathname };
  assert.equal(await vx.deliverSecretQuestion({ record: SECRET_RECORD, channel: "wecom", askerId: "u1", direct: true, env, fetchImpl, sendHere: async (t) => here.push(t), cancel: () => cancelled++ }), "cancelled");
  assert.equal(fetched, 1);
  assert.equal(cancelled, 2);
  assert.deepEqual(here, [vx.secretQuestionNotice(SECRET_RECORD), vx.secretQuestionNotice(SECRET_RECORD)]);
});

test("core secret-entry patch lets link channels wait for the link (on top of V's v1 builtin)", async () => {
  const { patchSecretEntryChannelsSource, CHANNELS_MARKER, LINK_CHANNELS } = await import("../lab/release-files/feishu-secret-entry/patch-openclaw91-secret-entry.mjs");
  const frozen = fs.readFileSync(new URL("../lab/release-files/feishu-secret-entry/builtin-openclaw-zQV8Wwjr.js", import.meta.url), "utf8");
  const { changed, source } = patchSecretEntryChannelsSource(frozen);
  assert.equal(changed, true);
  assert(source.includes(CHANNELS_MARKER));
  assert.deepEqual(LINK_CHANNELS, ["telegram", "dingtalk-connector", "wecom"]);
  assert(source.includes("if (!controlUiBase && !vSecretEntryInChat && !vSecretEntryByLink) throw new Error(text);"));
  assert(source.includes("const vSecretEntryInChat = vSecretEntryChannel === \"feishu\";"), "Feishu keeps its card descriptor");
  assert.equal(patchSecretEntryChannelsSource(source).changed, false, "idempotent");
  assert(source.length - frozen.length < 600, "a small change");
  assert.throws(() => patchSecretEntryChannelsSource(frozen.replaceAll("v-openclaw91-secret-entry-v1", "x")), /v1 is not applied/u);
  // The changed lines decide as intended.
  const start = source.indexOf("const vSecretEntryChannel =");
  const body = source.slice(start, source.indexOf("await ctx.params.onToolResult?.(", start));
  const decide = (channel, controlUiBase) => new Function("ctx", "binding", "controlUiBase", "controlUiAskUrl",
    `${body}; return { text, throws: !controlUiBase && !vSecretEntryInChat && !vSecretEntryByLink };`)({ params: { messageChannel: channel } }, { name: "V_DEMO", kind: "secret" }, controlUiBase, undefined);
  assert.deepEqual(decide("feishu"), { text: "🔑 V 需要凭据 V_DEMO，请在卡片里安全录入。", throws: false });
  for (const channel of ["telegram", "dingtalk-connector", "wecom", " Telegram "]) assert.equal(decide(channel).throws, false, channel);
  assert.match(decide("telegram").text, /一次性链接/u);
  assert.equal(decide("discord").throws, true, "other channels unchanged");
});

test("core secret-entry patch CLI: takes the dist argument, finds the right chunk among several, keeps v1's backup", async () => {
  const { spawnSync } = await import("node:child_process");
  const release = new URL("../lab/release-files/feishu-secret-entry/", import.meta.url).pathname;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vx-core-"));
  for (const f of ["builtin-openclaw-zQV8Wwjr.js", "dispatch-from-config-DOJq_7CI.js", "question-BdQvLMDb.js", "openclaw-tools-BODVdJQD.js"]) fs.copyFileSync(path.join(release, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, "builtin-openclaw-Other123.js"), "export const other = 1;\n");
  fs.writeFileSync(path.join(dir, "dispatch-from-config-Other123.js"), "export const other = 1;\n");
  fs.writeFileSync(path.join(dir, "builtin-openclaw-zQV8Wwjr.js.bak-v-openclaw91-secret-entry-v1"), "pristine");
  const run = () => spawnSync(process.execPath, [path.join(release, "patch-openclaw91-secret-entry.mjs"), dir], { encoding: "utf8" });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const report = JSON.parse(first.stdout);
  assert.deepEqual(report.files.map((f) => [f.file, f.changed]), [["builtin-openclaw-zQV8Wwjr.js", true], ["dispatch-from-config-DOJq_7CI.js", false], ["question-BdQvLMDb.js", false], ["openclaw-tools-BODVdJQD.js", false]]);
  assert.equal(fs.readFileSync(path.join(dir, "builtin-openclaw-zQV8Wwjr.js.bak-v-openclaw91-secret-entry-v1"), "utf8"), "pristine", "v1 backup untouched");
  assert(fs.existsSync(path.join(dir, "builtin-openclaw-zQV8Wwjr.js.bak-v-openclaw91-secret-entry-channels-v1")));
  assert(JSON.parse(run().stdout).files.every((f) => !f.changed), "second run changes nothing");
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- link cards

const HANDOFF_PRESENTATION = { title: "需要你接管 V 的电脑", tone: "info", blocks: [
  { type: "context", text: "点「接管电脑」打开 V 的电脑直接操作，做完在聊天里回复「好了」，V 接着做。10 分钟内打开有效，接管最长 30 分钟。" },
  { type: "buttons", buttons: [{ label: "接管电脑", style: "primary", url: "https://openclaw.example.test/desktop-handoff/#tok_1" }, { label: "交还给 V", value: "/v-handback h_1" }] },
] };

test("link card from a presentation: title, lines, URL buttons only", () => {
  const card = vx.linkCardFromPresentation(HANDOFF_PRESENTATION, "**需要你登录小红书**");
  assert.deepEqual(card, {
    title: "需要你接管 V 的电脑",
    lines: ["**需要你登录小红书**", HANDOFF_PRESENTATION.blocks[0].text],
    buttons: [{ label: "接管电脑", url: "https://openclaw.example.test/desktop-handoff/#tok_1" }],
  });
  assert.equal(vx.linkCardFromPresentation({ title: "t", blocks: [{ type: "buttons", buttons: [{ label: "交还给 V", value: "/v-handback h_1" }] }] }, "x"), undefined, "callbacks only: no card");
  assert.equal(vx.linkCardFromPresentation({ title: "t", blocks: [{ type: "buttons", buttons: [{ label: "x", url: "javascript:alert(1)" }] }] }), undefined, "only http(s) links");
  assert.equal(vx.linkCardFromPresentation({ title: "t", blocks: [{ type: "buttons", buttons: [{ label: "开", action: { type: "url", url: "https://a.test/" } }] }] }).buttons[0].url, "https://a.test/", "typed url action");
  assert.equal(vx.linkCardFromPresentation(undefined), undefined);
  assert.match(vx.linkCardText(card), /^需要你接管 V 的电脑\n需要你登录小红书\n[\s\S]*\n接管电脑：https:\/\/openclaw\.example\.test\/desktop-handoff\/#tok_1$/u);
});

test("link card renderers: DingTalk actionCard, WeCom text_notice, Telegram inline keyboard", () => {
  const card = vx.linkCardFromPresentation(HANDOFF_PRESENTATION, "**需要你登录小红书**");
  const url = "https://openclaw.example.test/desktop-handoff/#tok_1";
  assert.equal(vx.dingtalkOpenUrl(url), "dingtalk://dingtalkclient/page/link?url=https%3A%2F%2Fopenclaw.example.test%2Fdesktop-handoff%2F%23tok_1&pc_slide=false");
  const ac = vx.dingtalkActionCard(card);
  assert.deepEqual(Object.keys(ac), ["title", "text", "singleTitle", "singleURL"]);
  assert.equal(ac.title, "需要你接管 V 的电脑");
  assert.match(ac.text, /^### 需要你接管 V 的电脑\n\n\*\*需要你登录小红书\*\*\n\n点「接管电脑」/u);
  assert.equal(ac.singleTitle, "接管电脑");
  assert.equal(new URL(ac.singleURL).searchParams.get("url"), url);
  const two = vx.dingtalkActionCard({ title: "t", lines: [], buttons: [{ label: "a", url: "https://a.test/" }, { label: "b", url: "https://b.test/" }] });
  assert.equal(two.singleTitle, "a");
  assert.match(two.text, /\[b\]\(dingtalk:\/\/dingtalkclient\/page\/link\?url=https%3A%2F%2Fb\.test%2F&pc_slide=false\)/u);

  const tn = vx.wecomTextNotice(card, { taskId: "v_task" });
  assert.deepEqual(tn, {
    card_type: "text_notice",
    main_title: { title: "需要你接管 V 的电脑", desc: "需要你登录小红书" },
    sub_title_text: HANDOFF_PRESENTATION.blocks[0].text,
    jump_list: [{ type: 1, title: "接管电脑", url }],
    card_action: { type: 1, url },
    task_id: "v_task",
  });
  assert.match(vx.wecomTextNotice(card).task_id, /^v_\d+_[a-z0-9]+$/u, "task ids are unique per card");

  const tg = vx.telegramLinkCard(card);
  assert.equal(tg.text.split("\n\n")[0], "<b>需要你接管 V 的电脑</b>");
  assert.deepEqual(tg.options, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "接管电脑", url }]] } });
});

test("credential link card: name, reason, hosts, validity, one 填写凭据 button", () => {
  const card = vx.secretLinkCard(SECRET_RECORD, { url: "https://v.example.test/secret-entry/#tok", expiresAtMs: Date.now() + 10 * 60_000 });
  assert.deepEqual(card, {
    title: "🔑 V 需要凭据 V_DEMO_TOKEN",
    lines: ["测试用", "只用于：api.example.com", "链接只能用一次、10 分钟内有效；值不会出现在聊天记录里。"],
    buttons: [{ label: "填写凭据", url: "https://v.example.test/secret-entry/#tok" }],
  });
  const ac = vx.dingtalkActionCard(card);
  assert.equal(ac.singleTitle, "填写凭据");
  assert.equal(new URL(ac.singleURL).searchParams.get("url"), "https://v.example.test/secret-entry/#tok");
  assert.equal(new URL(ac.singleURL).searchParams.get("pc_slide"), "false");
  const tn = vx.wecomTextNotice(card);
  assert.equal(tn.main_title.desc, "测试用");
  assert.equal(tn.sub_title_text, "只用于：api.example.com\n链接只能用一次、10 分钟内有效；值不会出现在聊天记录里。");
});

test("card or text: a refused card falls back to the text", async () => {
  const sent = [];
  const logs = [];
  await vx.sendCardOrText({ card: { title: "t" }, text: "plain", sendCard: async (c) => sent.push(["card", c.title]), sendText: async (t) => sent.push(["text", t]) });
  await vx.sendCardOrText({ card: { title: "t" }, text: "plain", log: (m) => logs.push(m), sendCard: async () => { throw Object.assign(new Error("400"), { description: "Bad Request: BUTTON_URL_INVALID" }); }, sendText: async (t) => sent.push(["text", t]) });
  await vx.sendCardOrText({ card: undefined, text: "only text", sendCard: async () => assert.fail("no card"), sendText: async (t) => sent.push(["text", t]) });
  assert.deepEqual(sent, [["card", "t"], ["text", "plain"], ["text", "only text"]]);
  assert.match(logs[0], /BUTTON_URL_INVALID/u);
});

test("credential link on Telegram: a 填写凭据 button; BUTTON_URL_INVALID falls back to the text link", async () => {
  await withSecretService(async ({ env }) => {
    const before = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      const calls = [];
      const makeApi = (refuseButtons) => ({
        sendMessage: async (chatId, text, options = {}) => {
          calls.push({ chatId, text, options });
          if (refuseButtons && options.reply_markup) throw Object.assign(new Error("Call to 'sendMessage' failed! (400: Bad Request: BUTTON_URL_INVALID)"), { description: "Bad Request: BUTTON_URL_INVALID" });
          return { message_id: calls.length };
        },
      });
      const tg = vx.createTelegramExperience({ call: async () => ({}) });
      const record = (n) => ({ ...SECRET_RECORD, id: "ask_" + String(n).repeat(32) });
      assert.equal(await tg.deliverQuestion({ api: makeApi(false), chatId: 70000001, senderId: 70000001, record: record(1) }), true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].options.parse_mode, "HTML");
      assert.match(calls[0].text, /^<b>🔑 V 需要凭据 V_DEMO_TOKEN<\/b>\n\n测试用\n\n只用于：api\.example\.com/u);
      const button = calls[0].options.reply_markup.inline_keyboard[0][0];
      assert.equal(button.text, "填写凭据");
      assert.match(button.url, /^https:\/\/v\.example\.test\/secret-entry\/#[\w-]{40,}$/u);
      assert.doesNotMatch(calls[0].text, /secret-entry/u, "the link is only behind the button");
      calls.length = 0;
      assert.equal(await tg.deliverQuestion({ api: makeApi(true), chatId: 70000002, senderId: 70000002, record: record(2) }), true);
      assert.equal(calls.length, 2, "card refused, then the text link");
      assert.equal(calls[1].options.reply_markup, undefined);
      assert.match(calls[1].text, /^🔑 V 需要凭据 V_DEMO_TOKEN：请点开这个一次性链接填写[\s\S]*\nhttps:\/\/v\.example\.test\/secret-entry\/#[\w-]{40,}$/u);
      assert.deepEqual(calls[1].options.link_preview_options, { is_disabled: true });
    } finally {
      for (const [k, v] of Object.entries(before)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
});

test("dingtalk channel patch: presentation with a link button goes out as an actionCard", async () => {
  const baseline = fs.readFileSync(new URL("../apps/v-experience/dingtalk/baseline/runtime-C81EKBS1.mjs", import.meta.url), "utf8");
  const patched = patchRuntimeChunk(baseline);
  assert.equal(patchRuntimeChunk(patched), patched, "idempotent");
  assert.match(patched, /^import \{ i as vSendProactive \} from "\.\/messaging-JY5zinFJ\.mjs";$/mu);
  // The inserted adapter methods, run against stubs.
  const start = patched.indexOf("\t\trenderPresentation:");
  const snippet = patched.slice(start, patched.indexOf("\t\tchunker:", start));
  const sent = [];
  const plain = [];
  const outbound = { textChunkLimit: 2000, chunker: (t) => [t], sendText: async (ctx) => { plain.push(ctx.text); return { channel: "dingtalk-connector", messageId: "t" }; }, sendMedia: async () => assert.fail("no media") };
  const build = (sendProactive) => new Function("vExperience", "dingtalkPlugin", "vSendTextAndMedia", "resolveDingtalkAccount", "vSendProactive", "CHANNEL_ID", `return {${snippet}};`)(
    vx, { outbound },
    async ({ ctx, sendText }) => sendText({ ...ctx, text: ctx.payload.text }),
    () => ({ config: { clientId: "ding1" }, clientSecret: "s" }),
    sendProactive,
    "dingtalk-connector",
  );
  const methods = build(async (config, target, content, options) => { sent.push({ config, target, content: JSON.parse(content), options }); return { ok: true, processQueryKey: "pqk" }; });
  const rendered = methods.renderPresentation({ payload: { text: "**需要你登录小红书**" }, presentation: HANDOFF_PRESENTATION });
  assert.equal(rendered.channelData.vLinkCard.buttons.length, 1);
  assert.match(rendered.text, /接管电脑：https:/u);
  assert.equal(methods.renderPresentation({ payload: { text: "x" }, presentation: { blocks: [{ type: "text", text: "no buttons" }] } }), null, "no link: core fallback");
  const result = await methods.sendPayload({ cfg: {}, to: "staff1", payload: rendered });
  assert.deepEqual(result, { channel: "dingtalk-connector", messageId: "pqk", target: { kind: "conversation", id: "staff1" } });
  assert.deepEqual(sent[0].target, { userId: "staff1" });
  assert.deepEqual(sent[0].options, { msgType: "actionCard", useAICard: false });
  assert.equal(sent[0].content.singleTitle, "接管电脑");
  assert.equal(sent[0].config.clientSecret, "s");
  await methods.sendPayload({ cfg: {}, to: "cidGroup1", payload: rendered });
  assert.deepEqual(sent[1].target, { openConversationId: "cidGroup1" });
  await methods.sendPayload({ cfg: {}, to: "user:u1", payload: { text: "hello", channelData: { other: 1 } } });
  assert.deepEqual(plain, ["hello"], "other payloads keep the text path");
  await assert.rejects(build(async () => ({ ok: false, error: "403" })).sendPayload({ cfg: {}, to: "staff1", payload: rendered }), /403/u, "a refused card is a failed delivery (the plugin then puts the link in the reply)");
});

test("wecom channel patch: presentation with a link button goes out as a text_notice card", async () => {
  const { patchChannel, patchWeComPlugin, MARKER: WECOM_MARKER } = await import("../apps/v-experience/wecom/patch.mjs");
  const baseline = fs.readFileSync(new URL("../apps/v-experience/wecom/baseline/channel.js", import.meta.url), "utf8");
  const patched = patchChannel(baseline);
  assert(patched.includes(WECOM_MARKER));
  assert.equal(patchChannel(patched), patched, "idempotent");
  const start = patched.indexOf("        renderPresentation:");
  const snippet = patched.slice(start, patched.indexOf("        chunker:", start));
  const frames = [];
  let connected = true;
  const plain = [];
  const outbound = { textChunkLimit: 4000, chunker: (t) => [t], sendText: async (ctx) => { plain.push(ctx.text); return { channel: "wecom", messageId: "t" }; }, sendMedia: async () => assert.fail("no media") };
  const methods = new Function("vExperience", "wecomPlugin", "getWeComWebSocket", "DEFAULT_ACCOUNT_ID", "vSendTextAndMedia", "CHANNEL_ID", `return {${snippet}};`)(
    vx, { outbound },
    () => ({ get isConnected() { return connected; }, sendMessage: async (chatId, body) => { frames.push({ chatId, body }); return { headers: { req_id: "r1" } }; } }),
    "default",
    async ({ ctx, sendText }) => sendText({ ...ctx, text: ctx.payload.text }),
    "wecom",
  );
  const rendered = methods.renderPresentation({ payload: { text: "**需要你登录小红书**" }, presentation: HANDOFF_PRESENTATION });
  assert.deepEqual(await methods.sendPayload({ to: "wecom:zhangsan", payload: rendered }), { channel: "wecom", messageId: "r1", chatId: "zhangsan" });
  assert.equal(frames[0].chatId, "zhangsan");
  assert.equal(frames[0].body.msgtype, "template_card");
  assert.equal(frames[0].body.template_card.card_type, "text_notice");
  assert.equal(frames[0].body.template_card.main_title.title, "需要你接管 V 的电脑");
  assert.match(frames[0].body.template_card.card_action.url, /\/desktop-handoff\/#tok_1$/u);
  connected = false;
  await methods.sendPayload({ to: "zhangsan", payload: rendered });
  assert.match(plain[0], /^需要你接管 V 的电脑\n/u, "no robot socket: the card's text");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vx-wecom-"));
  fs.copyFileSync(new URL("../apps/v-experience/wecom/baseline/monitor.js", import.meta.url), path.join(dir, "monitor.js"));
  fs.writeFileSync(path.join(dir, "channel.js"), baseline);
  const experienceSource = new URL("../apps/v-experience/v-experience.mjs", import.meta.url).pathname;
  assert.deepEqual(patchWeComPlugin(dir, { experienceSource }).files, { "monitor.js": true, "channel.js": true });
  assert.equal(patchWeComPlugin(dir, { experienceSource }).changed, false, "second run changes nothing");
  fs.rmSync(dir, { recursive: true, force: true });
});
