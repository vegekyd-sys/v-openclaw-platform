import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { RelayDispatcher } from "../core/dispatcher.js";
import { recordFromSend, resultRunId, targetRunIdOf, toolResultJson } from "../core/native.js";
import { describeRequester, guardSend } from "../core/policy.js";
import { feishuReceiverForSession, labelForSession, parseSessionKey } from "../core/sessions.js";
import { RelayStore } from "../core/store.js";
import { TurnMarkers, interSessionSource } from "../core/turns.js";
import { lastAssistantText, requestGuidance, resultGuidance, threadCard, threadEntries } from "../core/text.js";

const OWNER = "feishu:ou_owner";
const DM = "agent:makaron:feishu:direct:ou_owner";
const GROUP_A = "agent:makaron:feishu:group:oc_a";

function tmpStore() {
  return new RelayStore(fs.mkdtempSync(path.join(os.tmpdir(), "relay-test-")));
}

function record(over = {}) {
  return {
    id: "r_1", chainId: "r_1", status: "running", runId: "run_t1", createdAt: 1,
    from: { sessionKey: DM, label: "Tianyi 的私聊", name: "V" }, to: { sessionKey: GROUP_A, label: "A 群", name: "V" },
    message: "do x", ...over,
  };
}

// The panel sits in a centred column: body > column_set > column > collapsible_panel.
const panelOf = (card) => card.body.elements[0].columns[0].elements[0];
const isThreadCard = (card) => card.body.elements[0].tag === "column_set";
const sendResult = (data) => ({ content: [{ type: "text", text: JSON.stringify(data) }] });

test("native: reads sessions_send results and turns accepted sends into records", () => {
  assert.deepEqual(toolResultJson(sendResult({ runId: "x", status: "accepted" })), { runId: "x", status: "accepted" });
  assert.equal(toolResultJson({ content: [{ type: "text", text: "not json" }] }), null);
  assert.equal(resultRunId("run_t1"), "sessions-send-result:run_t1");
  assert.equal(targetRunIdOf("sessions-send-result:run_t1"), "run_t1");
  assert.equal(targetRunIdOf("run_t1"), null);

  const ctx = { sessionKey: DM, runId: "run_dm1" };
  const accepted = recordFromSend({ id: "r_9", params: { sessionKey: GROUP_A, message: "写公告" }, result: sendResult({ runId: "run_t9", status: "accepted", sessionKey: GROUP_A, targetDisposition: "queued" }), ctx, records: [], requester: "Tianyi", now: 5 });
  assert.equal(accepted.status, "running");
  assert.equal(accepted.chainId, "r_9");
  assert.equal(accepted.via, "person");
  assert.equal(accepted.requester, "Tianyi");
  assert.equal(accepted.fromRunId, "run_dm1");
  assert.deepEqual([accepted.from.sessionKey, accepted.to.sessionKey, accepted.message], [DM, GROUP_A, "写公告"]);

  const inline = recordFromSend({ id: "r_8", params: { sessionKey: GROUP_A, message: "q" }, result: sendResult({ runId: "run_t8", status: "ok", sessionKey: GROUP_A, reply: "a" }), ctx, records: [], requester: null });
  assert.deepEqual([inline.status, inline.reply, inline.via], ["done", "a", "agent"]);

  for (const bad of [{ status: "error", runId: "x" }, { status: "forbidden" }, { status: "accepted", runId: "x", sessionKey: DM }]) {
    assert.equal(recordFromSend({ id: "r_7", params: {}, result: sendResult(bad), ctx, records: [] }), null, JSON.stringify(bad));
  }
});

test("native: a send from the woken requester, or again in the same turn, stays in the same thread", () => {
  const first = record({ id: "r_1", chainId: "r_1", runId: "run_t1", status: "replying", requester: "Tianyi" });
  const woken = recordFromSend({ id: "r_2", params: { sessionKey: GROUP_A, message: "20%" }, result: sendResult({ runId: "run_t2", status: "accepted", sessionKey: GROUP_A }), ctx: { sessionKey: DM, runId: "sessions-send-result:run_t1" }, records: [first], requester: null });
  assert.deepEqual([woken.chainId, woken.via, woken.requester], ["r_1", "reply", "Tianyi"]);
  const prior = record({ id: "r_3", chainId: "r_3", fromRunId: "run_dm", status: "done" });
  const again = recordFromSend({ id: "r_4", params: { sessionKey: GROUP_A, message: "and" }, result: sendResult({ runId: "run_t4", status: "ok", sessionKey: GROUP_A, reply: "ok" }), ctx: { sessionKey: DM, runId: "run_dm" }, records: [prior], requester: null });
  assert.equal(again.chainId, "r_3");
});

test("policy: guards only runaway chains; who asked is described, not judged", () => {
  assert.equal(guardSend({ records: [], runId: "run_t1", requestTurn: { sourceSession: DM } }).block, true, "a turn answering a sessions_send cannot send, not even back");
  assert.equal(guardSend({ records: [], runId: "run_other", requestTurn: null }), undefined);
  const full = Array.from({ length: 3 }, (_, i) => record({ id: `r_${i}`, runId: `run_${i}`, status: "done" }));
  assert.equal(guardSend({ records: full, runId: "sessions-send-result:run_2", maxChain: 3 }).block, true);
  assert.equal(guardSend({ records: full, runId: "sessions-send-result:run_2", maxChain: 4 }), undefined);
  assert.equal(describeRequester({ senderIsOwner: true, senderId: "ou_owner", channel: "feishu" }), "Tianyi");
  assert.equal(describeRequester({ senderId: "ou_x", channel: "feishu" }), "feishu:ou_x");
  assert.equal(describeRequester(undefined), null);
});

test("turns: the inter-session envelope marks a request turn; markers work across processes", () => {
  const prompt = "[Inter-session message] sourceSession=agent:makaron:feishu:direct:ou_owner sourceChannel=feishu sourceTool=sessions_send isUser=false\nThis content was routed by OpenClaw from another session.\n写公告";
  assert.deepEqual(interSessionSource(prompt), { sourceSession: DM, sourceTool: "sessions_send" });
  assert.equal(interSessionSource("hello"), null);
  const m = new TurnMarkers(fs.mkdtempSync(path.join(os.tmpdir(), "relay-turns-")));
  m.put("request-turns", "run_t1", { sessionKey: GROUP_A, sourceSession: DM });
  assert.equal(m.get("request-turns", "run_t1").sourceSession, DM);
  assert.equal(m.get("request-turns", "run_other"), null);
  m.put("sends", "call_1", { fromSessionKey: DM, requester: "Tianyi" });
  m.put("sends", "call_2", { fromSessionKey: GROUP_A, requester: null });
  assert.equal(m.latest("sends", (v) => v.fromSessionKey === DM).requester, "Tianyi");
});

test("sessions: keys, receivers, labels", async () => {
  assert.deepEqual(parseSessionKey(GROUP_A), { agentId: "makaron", channel: "feishu", kind: "group", peerId: "oc_a" });
  assert.deepEqual(feishuReceiverForSession(DM), { receiveIdType: "open_id", receiveId: "ou_owner" });
  assert.deepEqual(feishuReceiverForSession(GROUP_A), { receiveIdType: "chat_id", receiveId: "oc_a" });
  assert.equal(feishuReceiverForSession("agent:makaron:explicit:x"), null);
  assert.equal(await labelForSession(DM, { owners: [OWNER] }), "Tianyi 的私聊");
  assert.equal(await labelForSession(GROUP_A, { feishu: { chatName: async () => "A 群" } }), "A 群");
});

test("text: one-line collapsed card per thread, 「V · 群名」 inside, guidance for both turns", () => {
  const thread = [
    record({ id: "r_1", chainId: "r_1", status: "done", createdAt: 1, reply: "缺灰度比例？", finishedAt: 2 }),
    record({ id: "r_2", chainId: "r_1", status: "running", createdAt: 3, message: "20%" }),
  ];
  assert.deepEqual(threadEntries(thread).map((e) => [e.label, e.text]), [["V · Tianyi 的私聊", "do x"], ["V · A 群", "缺灰度比例？"], ["V · Tianyi 的私聊", "20%"]]);
  const card = threadCard(thread);
  const panel = panelOf(card);
  assert.equal(card.body.elements.length, 1);
  assert.equal(card.body.elements[0].horizontal_align, "center");
  assert.equal(panel.header.width, "auto_when_fold");
  assert.equal(panel.expanded, false);
  assert.match(panel.header.title.content, /\*\*Tianyi 的私聊\*\* ⇄ \*\*A 群\*\* · 进行中 · 3 条/u);
  assert(!panel.header.title.content.includes("\n"), "the title is one line");
  assert.match(panelOf(threadCard([record({ status: "done", reply: "x", from: { label: "VLab 发布验收 B" } })])).header.title.content, /VLab 发布验收 B\*\*/u, "an 11-character name is not cut");
  assert.match(panelOf(threadCard([record({ status: "done", reply: "x", from: { label: "一个名字特别特别特别特别长的飞书群聊" } })])).header.title.content, /一个名字特别特别特别特别长的飞…/u);
  const huge = threadCard(Array.from({ length: 40 }, (_, i) => record({ id: `r_${i}`, chainId: "r_0", status: "done", createdAt: i, reply: "长".repeat(1500), finishedAt: i })));
  assert(JSON.stringify(huge).length < 36_000);
  assert.match(requestGuidance({ ...thread[0], requester: "Tianyi" }), /asked for by Tianyi \(in 「Tianyi 的私聊」\)/u);
  assert.match(requestGuidance(thread[0]), /on its own initiative/u);
  assert.match(requestGuidance(thread[0]), /redlines/u);
  assert.match(requestGuidance(thread[1]), /answering you/u);
  assert.match(resultGuidance(thread[0]), /sessions_send with sessionKey "agent:makaron:feishu:group:oc_a"/u);
  assert.equal(lastAssistantText([{ role: "assistant", content: [{ type: "text", text: "answer" }], timestamp: 20 }]), "answer");
  assert.equal(lastAssistantText([{ role: "assistant", content: "old", timestamp: 1 }], { after: 30 }), null);
});

function fakeRuntime({ replies = {}, waitStatus = {}, unknown = new Set() } = {}) {
  const runs = [];
  const started = new Set();
  return {
    runs,
    async run(params) {
      runs.push({ ...params, runId: params.idempotencyKey });
      started.add(params.idempotencyKey);
      return { runId: params.idempotencyKey };
    },
    async waitForRun({ runId }) {
      if (unknown.has(runId) && !started.has(runId)) return { status: "pending" };
      const status = waitStatus[runId] ?? "ok";
      if (status !== "ok") return { status, error: status === "error" ? "unknown run" : undefined };
      const text = replies[runId];
      return { status: "ok", terminalReply: text ? { disposition: "visible", text } : { disposition: "silent" } };
    },
    async getSessionMessages() {
      return { messages: [{ role: "assistant", content: "from transcript", timestamp: Date.now() + 1 }] };
    },
  };
}

function fakeFeishu() {
  const cards = [];
  const patches = [];
  return { cards, patches, api: {
    sendCard: async (receiver, card) => { cards.push({ receiver, card }); return `om_${cards.length}`; },
    patchCard: async (id, card) => { patches.push({ id, card }); },
  } };
}

const quiet = { info() {}, warn() {} };
const describe = async (key) => ({ label: key === DM ? "Tianyi 的私聊" : "A 群", name: "V" });
const fast = { wakeGraceMs: 50, sleep: async () => {} };

test("dispatcher: follows the target run, then the core's wake of the requester, then posts its closing words", async () => {
  const store = tmpStore();
  store.write(record({ from: { sessionKey: DM, label: null }, to: { sessionKey: GROUP_A, label: null } }));
  const runtime = fakeRuntime({ replies: { run_t1: "done: 3 files", "sessions-send-result:run_t1": "ok, next step" } });
  const feishu = fakeFeishu();
  const d = new RelayDispatcher({ store, runtime, feishuFor: () => feishu.api, getConfig: () => ({}), describe, logger: quiet, ...fast });
  d.started = true; // a send made while this Gateway runs: the core wakes the requester
  d.tick();
  await d.idle();
  const final = store.read("r_1");
  assert.equal(final.status, "done");
  assert.equal(final.reply, "done: 3 files");
  assert.equal(final.from.label, "Tianyi 的私聊");
  assert.equal(runtime.runs.length, 0, "the core woke the requester; the plugin ran nothing");
  const threadCards = feishu.cards.filter((c) => isThreadCard(c.card));
  assert.deepEqual(threadCards.map((c) => c.receiver.receiveId).sort(), ["oc_a", "ou_owner"]);
  assert.match(panelOf(feishu.patches.at(-1).card).header.title.content, / · 已完成 · 2 条/u);
  const finals = feishu.cards.filter((c) => c.card.body.elements[0].tag === "markdown");
  assert.deepEqual(finals.map((c) => [c.receiver.receiveId, c.card.body.elements[0].content]), [["ou_owner", "ok, next step"]]);
});

test("dispatcher: a steered send, or one from before a restart, is woken by the plugin under the core's run id", async () => {
  for (const [name, over, recovering] of [
    ["steered", { targetDisposition: "steered" }, false],
    ["restart", {}, true],
  ]) {
    const store = tmpStore();
    store.write(record(over));
    const runtime = fakeRuntime({ replies: { run_t1: "result", "sessions-send-result:run_t1": "thanks" }, unknown: new Set(["sessions-send-result:run_t1"]) });
    const d = new RelayDispatcher({ store, runtime, feishuFor: () => fakeFeishu().api, getConfig: () => ({}), describe, logger: quiet, ...fast });
    d.started = !recovering;
    d.tick();
    await d.idle();
    assert.equal(store.read("r_1").status, "done", name);
    assert.deepEqual(runtime.runs.map((r) => [r.sessionKey, r.idempotencyKey, r.message, r.deliver]), [[DM, "sessions-send-result:run_t1", "result", false]], name);
  }
});

test("dispatcher: the core's wake that never shows up is issued by the plugin", async () => {
  const store = tmpStore();
  store.write(record());
  const runtime = fakeRuntime({ replies: { run_t1: "result" }, unknown: new Set(["sessions-send-result:run_t1"]) });
  const d = new RelayDispatcher({ store, runtime, feishuFor: () => fakeFeishu().api, getConfig: () => ({}), describe, logger: quiet, ...fast });
  d.started = true;
  d.tick();
  await d.idle();
  assert.equal(runtime.runs.length, 1);
  assert.equal(store.read("r_1").wokenBy, "plugin");
});

test("dispatcher: when the woken requester sends again, its own text is not posted", async () => {
  const store = tmpStore();
  store.write(record());
  const runtime = fakeRuntime({ replies: { run_t1: "缺灰度比例？", "sessions-send-result:run_t1": "已回复 20%" } });
  const origWait = runtime.waitForRun.bind(runtime);
  runtime.waitForRun = async (p) => {
    if (p.runId === "sessions-send-result:run_t1") {
      store.write(record({ id: "r_2", chainId: "r_1", runId: "run_t2", fromRunId: "sessions-send-result:run_t1", status: "done", reply: "定稿", painted: true }));
    }
    return origWait(p);
  };
  const feishu = fakeFeishu();
  const d = new RelayDispatcher({ store, runtime, feishuFor: () => feishu.api, getConfig: () => ({}), describe, logger: quiet, ...fast });
  d.started = true;
  d.tick();
  await d.idle();
  assert.equal(store.read("r_1").status, "done");
  assert.equal(store.read("r_1").finalMessageId, undefined);
  assert.equal(feishu.cards.filter((c) => c.card.body.elements[0].tag === "markdown").length, 0);
});

test("dispatcher: a failed target run marks the thread and tells the requester", async () => {
  const store = tmpStore();
  store.write(record());
  const runtime = fakeRuntime({ waitStatus: { run_t1: "error" } });
  runtime.getSessionMessages = async () => ({ messages: [] });
  const d = new RelayDispatcher({ store, runtime, feishuFor: () => fakeFeishu().api, getConfig: () => ({}), describe, logger: quiet, ...fast });
  d.started = true;
  d.tick();
  await d.idle();
  assert.equal(store.read("r_1").status, "failed");
  assert.equal(runtime.runs.at(-1).sessionKey, DM);
  assert.match(runtime.runs.at(-1).message, /没能完成/u);
});

test("store: ids, atomic writes, listing and pruning finished records", () => {
  const store = tmpStore();
  const id = store.newId(1_000);
  assert.match(id, /^r_[0-9a-z]+$/u);
  store.write(record({ id, status: "done", createdAt: 1, updatedAt: 1 }));
  store.write(record({ id: "r_live", status: "running", createdAt: 2, updatedAt: 2 }));
  assert.equal(store.list().length, 2);
  assert.equal(store.list({ prune: true, keepMs: 10, now: 1_000_000 }).length, 1);
  assert.equal(store.read(id), null);
  assert.throws(() => store.file("../x"), /invalid relay id/u);
});
