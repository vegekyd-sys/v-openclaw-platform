import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { MeetingBridge, newRecord } from "../core/bridge.js";
import { LarkCliError, createLarkCli } from "../core/lark.js";
import { Manager, createTurnRunner } from "../core/manager.js";
import { Store } from "../core/store.js";

const MID = "7709354683467238405";
const GROUP = { channel: "feishu", to: "oc_test_group", accountId: "default" };
const SELF = "ou_self_bot";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 2_000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("condition not reached");
    await sleep(5);
  }
};

let seq = 0;
const speech = (text, { who = "Tianyi", endMs = Date.now() - 1_000 } = {}) => ({
  event_id: `e${++seq}`, event_type: "transcript_received", event_time: new Date(endMs - 2_000).toISOString(),
  payload: { transcript_received_items: [{ text, speaker: { id: "ou_user", user_name: who }, start_time_ms: new Date(endMs - 2_000).toISOString(), end_time_ms: new Date(endMs).toISOString() }] },
});
const chat = (content, { id = "ou_user", name = "Tianyi", userType = 1, messageId = `m${++seq}` } = {}) => ({
  event_id: `e${++seq}`, event_type: "chat_received", event_time: new Date().toISOString(),
  payload: { chat_received_items: [{ content, message_id: messageId, operator: { id, user_name: name, user_type: userType }, send_time: new Date().toISOString() }] },
});

function world({ replies = [], turnDelayMs = 0, events = [] } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vmb-"));
  const w = {
    tmp,
    queue: [...events],
    sent: [], reacts: [], group: [], turns: [], left: 0, joinErrors: [],
    store: new Store(path.join(tmp, "store")),
    lark: {
      async join() {
        const err = w.joinErrors.shift();
        if (err) throw err;
        return { meetingId: MID };
      },
      async events() { const batch = w.queue.splice(0); return { events: batch, pageToken: `p${seq}` }; },
      async sendText(_mid, text) { const id = `sent${w.sent.length}`; w.sent.push(text); return { messageId: id }; },
      async react(_mid, emoji) { w.reacts.push(emoji); },
      async leave() { w.left += 1; },
      async screenshot(_mid, { cwd, output }) { return { path: path.join(cwd, output) }; },
    },
    async runTurn({ message }) {
      w.turns.push(message);
      if (turnDelayMs) await sleep(turnDelayMs);
      const next = replies.length ? replies.shift() : "NO_REPLY";
      return typeof next === "function" ? next(message) : { status: "ok", text: next };
    },
    async postGroup(delivery, text) { w.group.push({ to: delivery.to, text }); },
  };
  return w;
}

function bridgeFor(w, timing = {}) {
  const r = newRecord({ meetingNumber: "434878659", meetingId: MID, sessionKey: "agent:makaron:feishu:group:oc_test_group", delivery: GROUP, transcriptDir: path.join(w.tmp, "meeting") });
  return new MeetingBridge(r, { lark: w.lark, runTurn: (p) => w.runTurn(p), postGroup: (d, t) => w.postGroup(d, t), store: w.store, timing: { pollMs: 10, progressReactMs: 0, stillWorkingMs: 0, ...timing } });
}

test("subtitles reach V as one turn; the reply goes to the meeting and, prefixed, to the group", async () => {
  const w = world({ replies: ["听得到，我只能打字。"], events: [speech("AV，你听得到吗？")] });
  await w.store.init();
  const b = bridgeFor(w);
  void b.start();
  await until(() => w.group.length === 1);
  assert.match(w.turns[0], /meeting_id=7709354683467238405/u);
  assert.match(w.turns[0], /Tianyi：AV，你听得到吗？/u);
  assert.deepEqual(w.sent, ["听得到，我只能打字。"]);
  assert.deepEqual(w.group, [{ to: "oc_test_group", text: "【会中】听得到，我只能打字。" }]);
  const lag = b.r.stats.lagMs[0];
  assert(lag >= 900 && lag < 5_000, `subtitle lag recorded from end_time to fetch: ${lag}`);
  await b.end("test");
});

test("NO_REPLY sends nothing anywhere", async () => {
  const w = world({ replies: ["NO_REPLY"], events: [speech("我们开始吧")] });
  await w.store.init();
  const b = bridgeFor(w);
  void b.start();
  await until(() => b.r.stats.turns === 1);
  assert.equal(w.sent.length, 0);
  assert.equal(w.group.length, 0);
  assert.equal(b.r.stats.silent, 1);
  await b.end("test");
});

test("V's own chat echo is dropped (no second transcript line, never a turn) and teaches selfId", async () => {
  const w = world({ replies: ["收到"], events: [speech("V 在吗")] });
  await w.store.init();
  const b = bridgeFor(w);
  void b.start();
  await until(() => w.sent.length === 1);
  w.queue.push(chat("收到", { id: SELF, name: "V - Makaron", userType: 10, messageId: "sent0" }));
  w.queue.push(chat("另一个机器人的通知", { id: "ou_other_bot", name: "Bot", userType: 10 }));
  await until(() => b.r.selfId === SELF);
  await sleep(40);
  assert.equal(w.turns.length, 1, "neither the echo nor another bot starts a turn");
  const transcript = fs.readFileSync(path.join(w.tmp, "meeting", "transcript.md"), "utf8");
  assert.equal(transcript.match(/收到/gu).length, 1, transcript);
  assert.match(transcript, /Bot：\[聊天\] 另一个机器人的通知/u);
  await b.end("test");
});

test("lines that arrive while V is answering go out together in the next turn", async () => {
  const w = world({ turnDelayMs: 80, events: [speech("第一句")] });
  await w.store.init();
  const b = bridgeFor(w);
  void b.start();
  await until(() => w.turns.length === 1);
  w.queue.push(speech("第二句"));
  await sleep(20);
  w.queue.push(speech("第三句"));
  await until(() => w.turns.length === 2, 3_000);
  assert.match(w.turns[1], /第二句[\s\S]*第三句/u);
  assert.doesNotMatch(w.turns[1], /第一句/u);
  await b.end("test");
});

test("a slow turn shows progress: reaction first, then a short line, unless V already spoke", async () => {
  // Wide gaps between the timers so a loaded CI runner cannot reorder them.
  const timing = { progressReactMs: 50, stillWorkingMs: 400 };
  const w = world({ turnDelayMs: 1_200, replies: ["结论在这"], events: [speech("帮我查一下 PR")] });
  await w.store.init();
  const b = bridgeFor(w, timing);
  void b.start();
  await until(() => w.group.length === 1, 10_000);
  assert.deepEqual(w.reacts, ["OnIt"]);
  assert.deepEqual(w.sent, ["还在弄，马上好。", "结论在这"]);
  assert.equal(w.group.length, 1, "the progress line is not mirrored to the group");

  const w2 = world({ events: [speech("帮我查一下")] });
  await w2.store.init();
  const b2 = bridgeFor(w2, timing);
  w2.runTurn = async ({ message }) => {
    w2.turns.push(message);
    await b2.say("我去翻一下最近合入的 PR");
    await sleep(700);
    return { status: "ok", text: "NO_REPLY" };
  };
  void b2.start();
  await until(() => b2.r.stats.silent === 1, 10_000);
  assert.deepEqual(w2.reacts, []);
  assert.deepEqual(w2.sent, ["我去翻一下最近合入的 PR"]);
  assert.equal(w2.group[0].text, "【会中】我去翻一下最近合入的 PR");
  await Promise.all([b.end("test"), b2.end("test")]);
});

test("meeting end: the brief is written next to the transcript and posted to the group", async () => {
  const w = world({ replies: ["好的", "**结论**\n1. 跑通了"], events: [speech("V 你好")] });
  await w.store.init();
  const b = bridgeFor(w);
  w.lark.events = async () => { if (w.queue.length) return { events: w.queue.splice(0), pageToken: "p" }; throw new LarkCliError("x", { code: "MEETING_ENDED" }); };
  void b.start();
  await until(() => b.r.status === "ended", 3_000);
  assert.equal(b.r.endReason, "meeting_ended");
  assert.match(w.turns.at(-1), /会议已结束[\s\S]*transcript\.md/u);
  assert.equal(w.group.at(-1).text, "会议结束，V 的会后纪要：\n**结论**\n1. 跑通了");
  assert.match(fs.readFileSync(path.join(w.tmp, "meeting", "brief.md"), "utf8"), /跑通了/u);
  assert.equal(b.r.brief, "sent");
});

test("manager: join binds the calling session; a second meeting from the same chat is refused", async () => {
  const w = world();
  const store = await new Store(path.join(w.tmp, "store")).init();
  const m = new Manager({ store, lark: w.lark, runTurn: (p) => w.runTurn(p), postGroup: (d, t) => w.postGroup(d, t), timing: { pollMs: 10 } });
  await assert.rejects(m.start({ meetingNumber: "12345", sessionKey: "s" }), /9-digit/u);
  const res = await m.start({ meetingNumber: "434 878 659", sessionKey: "agent:makaron:feishu:group:oc_x", agentId: "makaron", delivery: GROUP, workspaceDir: w.tmp });
  assert.equal(res.status, "listening");
  assert.equal(res.meetingId, MID);
  assert.match(res.transcriptDir, /memory\/projects\/meetings\/sessions\/\d{4}-\d{2}-\d{2}_7709354683467238405$/u);
  assert.equal((await m.start({ meetingNumber: "434878659", sessionKey: "agent:makaron:feishu:group:oc_x" })).alreadyActive, true);
  await assert.rejects(m.start({ meetingNumber: "111222333", sessionKey: "agent:makaron:feishu:group:oc_x" }), /already in meeting/u);
  const said = await m.say({ sessionKey: "AGENT:makaron:feishu:group:oc_x", text: "稍等" });
  assert.equal(said.sent, true);
  const stopped = m.stop({ sessionKey: "agent:makaron:feishu:group:oc_x" });
  assert.equal(stopped.status, "ending");
  await until(() => w.left === 1);
  await m.shutdown();
});

test("manager: stop returns at once even while the bound session's turn is still running (no deadlock)", async () => {
  const w = world({ turnDelayMs: 300, events: [speech("V 你先退吧")] });
  const store = await new Store(path.join(w.tmp, "store")).init();
  const m = new Manager({ store, lark: w.lark, runTurn: (p) => w.runTurn(p), postGroup: (d, t) => w.postGroup(d, t), timing: { pollMs: 10 } });
  await m.start({ meetingNumber: "434878659", sessionKey: "sk", delivery: GROUP, workspaceDir: w.tmp });
  await until(() => w.turns.length === 1);
  const t0 = Date.now();
  m.stop({ sessionKey: "sk" });
  assert(Date.now() - t0 < 50);
  await m.shutdown();
});

test("manager: a meeting that is not ready keeps retrying, then tells the chat it gave up", async () => {
  const w = world();
  w.lark.join = async () => { throw new LarkCliError("会议未开始", { code: "NOT_READY" }); };
  const store = await new Store(path.join(w.tmp, "store")).init();
  let now = Date.now();
  const m = new Manager({ store, lark: w.lark, runTurn: (p) => w.runTurn(p), postGroup: (d, t) => w.postGroup(d, t), timing: { pollMs: 10, joinRetryMs: 5 }, now: () => now });
  const res = await m.start({ meetingNumber: "434878659", sessionKey: "sk", delivery: GROUP, waitMinutes: 1 });
  assert.equal(res.status, "joining");
  assert.match(res.lastJoinError, /未开始/u);
  now += 2 * 60_000;
  await until(() => w.group.length === 1);
  assert.match(w.group[0].text, /没能进入会议 434878659：等到超时/u);
  assert.equal(m.list().length, 0);
});

test("manager: after a Gateway restart every listening meeting resumes from its page token and pending lines", async () => {
  const w = world({ replies: ["接着说"] });
  const dir = path.join(w.tmp, "store");
  const store = await new Store(dir).init();
  const r = newRecord({ meetingNumber: "434878659", meetingId: MID, sessionKey: "sk", delivery: GROUP, transcriptDir: path.join(w.tmp, "meeting") });
  r.pageToken = "p-before-restart";
  r.pending.push({ t: "12:00:00", who: "Tianyi", text: "重启前最后一句", kind: "speech" });
  await store.save(r);
  await store.save({ ...newRecord({ meetingNumber: "111222333", meetingId: "1", sessionKey: "old" }), status: "ended" });
  const tokens = [];
  w.lark.events = async (_mid, token) => { tokens.push(token); return { events: [], pageToken: token }; };
  const m = new Manager({ store: new Store(dir), lark: w.lark, runTurn: (p) => w.runTurn(p), postGroup: (d, t) => w.postGroup(d, t), timing: { pollMs: 10 } });
  assert.equal(await m.recover(), 1);
  await until(() => w.sent.length === 1);
  assert.equal(tokens[0], "p-before-restart");
  assert.match(w.turns[0], /重启前最后一句/u);
  await m.shutdown();
});

test("turn runner: run without delivery, wait in slices, visible text or silent", async () => {
  const calls = [];
  const subagent = {
    async run(p) { calls.push(p); return { runId: "r1" }; },
    waits: [{ status: "timeout" }, { status: "ok", terminalReply: { disposition: "visible", text: "答案" } }],
    async waitForRun() { return this.waits.shift(); },
  };
  const run = createTurnRunner(subagent);
  assert.deepEqual(await run({ sessionKey: "sk", message: "m", idempotencyKey: "k" }), { status: "ok", runId: "r1", text: "答案" });
  assert.equal(calls[0].deliver, false);
  assert.equal(calls[0].idempotencyKey, "k");
  subagent.waits = [{ status: "ok", terminalReply: { disposition: "silent" } }];
  assert.equal((await run({ sessionKey: "sk", message: "m" })).text, "");
});

test("lark-cli wrapper: app identity, profile, parsing and error classes", async () => {
  const seen = [];
  const outputs = [
    { code: 0, stdout: JSON.stringify({ ok: true, data: { meeting: { id: MID } } }) },
    { code: 0, stdout: JSON.stringify({ ok: true, data: { events: [{ event_id: "a" }], page_token: "pt2" } }) },
    { code: 0, stdout: JSON.stringify({ ok: true, data: { message_id: "771" } }) },
    { code: 1, stdout: "", stderr: "error 20001: meeting has ended" },
    { code: 1, stdout: "", stderr: "会议未开始" },
  ];
  const lark = createLarkCli({ profile: "vlab", exec: async (bin, args) => { seen.push([bin, args]); return outputs.shift(); } });
  assert.deepEqual(await lark.join("434878659").then((r) => r.meetingId), MID);
  assert.deepEqual(await lark.events(MID, "pt1"), { events: [{ event_id: "a" }], pageToken: "pt2" });
  assert.deepEqual(await lark.sendText(MID, "你好", "u1"), { messageId: "771" });
  await assert.rejects(lark.events(MID), (err) => err.code === "MEETING_ENDED");
  await assert.rejects(lark.join("434878659"), (err) => err.code === "NOT_READY");
  for (const [bin, args] of seen) {
    assert.equal(bin, "lark-cli");
    assert.deepEqual(args.slice(-4), ["--format", "json", "--profile", "vlab"]);
    assert(args.includes("--as") && args[args.indexOf("--as") + 1] === "bot");
  }
  assert.deepEqual(seen[1][1].slice(seen[1][1].indexOf("--page-token"), seen[1][1].indexOf("--page-token") + 2), ["--page-token", "pt1"]);
});
