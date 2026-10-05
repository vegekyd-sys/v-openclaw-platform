import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { RelayDispatcher } from "../core/dispatcher.js";
import { activeRelay, decideSend, resolveTrustedActor } from "../core/policy.js";
import { agentForFeishuGroup, feishuReceiverForSession, labelForSession, parseSessionKey, resolveTarget } from "../core/sessions.js";
import { RelayStore } from "../core/store.js";
import { lastAssistantText, threadCard, threadEntries } from "../core/text.js";

const OWNER = "feishu:ou_owner";
const DM = "agent:makaron:feishu:direct:ou_owner";
const GROUP_A = "agent:makaron:feishu:group:oc_a";
const GROUP_B = "agent:makaron:feishu:group:oc_b";

function tmpStore() {
  return new RelayStore(fs.mkdtempSync(path.join(os.tmpdir(), "relay-test-")));
}

function record(over = {}) {
  return { id: "r_1", chainId: "r_1", status: "queued", createdAt: 1, from: { sessionKey: DM, label: "Tianyi 的私聊" }, to: { sessionKey: GROUP_A, label: "A 群" }, message: "do x", ...over };
}

test("policy: anyone may start a relay (the receiving V decides); nobody relays to itself", () => {
  const base = { records: [], sessionKey: DM, targetSessionKey: GROUP_A };
  assert.deepEqual(decideSend({ ...base, actor: OWNER }), { allow: true, chainId: null, via: "person" });
  assert.deepEqual(decideSend({ ...base, actor: "feishu:ou_colleague" }), { allow: true, chainId: null, via: "person" });
  assert.deepEqual(decideSend({ ...base, actor: null }), { allow: true, chainId: null, via: "agent" });
  assert.equal(decideSend({ ...base, actor: OWNER, targetSessionKey: DM }).allow, false);
});

test("policy: a conversation executing a relayed request cannot relay further, even for the owner", () => {
  const records = [record({ status: "running" })];
  const d = decideSend({ records, sessionKey: GROUP_A, targetSessionKey: GROUP_B, actor: OWNER });
  assert.equal(d.allow, false);
  assert.match(d.reason, /Tianyi 的私聊/u);
});

test("policy: the origin woken by a result may keep relaying in the same chain, up to the cap", () => {
  const records = [record({ status: "replying" })];
  assert.deepEqual(decideSend({ records, sessionKey: DM, targetSessionKey: GROUP_B, actor: null }), { allow: true, chainId: "r_1", via: "reply" });
  const full = Array.from({ length: 3 }, (_, i) => record({ id: `r_${i}`, status: i === 2 ? "replying" : "done" }));
  assert.equal(decideSend({ records: full, sessionKey: DM, targetSessionKey: GROUP_B, actor: null, maxChain: 3 }).allow, false);
  assert.equal(activeRelay([record({ status: "done" })], DM), null);
});

test("identity: sender id from the channel, owner bit, and the test-only key fallback", () => {
  assert.equal(resolveTrustedActor({ requesterSenderId: "ou_owner", messageChannel: "feishu" }), OWNER);
  const cfg = { commands: { ownerAllowFrom: [OWNER] } };
  assert.equal(resolveTrustedActor({ senderIsOwner: true, messageChannel: "feishu", config: cfg, deliveryContext: { to: "chat:oc_a" } }), OWNER);
  assert.equal(resolveTrustedActor({ sessionKey: DM }), null);
  assert.equal(resolveTrustedActor({ sessionKey: DM }, { sessionKeyActorFallback: true }), OWNER);
  assert.equal(resolveTrustedActor({ sessionKey: GROUP_A }, { sessionKeyActorFallback: true }), null);
});

test("sessions: keys, receivers, bindings and target resolution", async () => {
  assert.deepEqual(parseSessionKey(GROUP_A), { agentId: "makaron", channel: "feishu", kind: "group", peerId: "oc_a" });
  assert.deepEqual(feishuReceiverForSession(DM), { receiveIdType: "open_id", receiveId: "ou_owner" });
  assert.deepEqual(feishuReceiverForSession(GROUP_A), { receiveIdType: "chat_id", receiveId: "oc_a" });
  assert.equal(feishuReceiverForSession("agent:makaron:explicit:x"), null);
  const cfg = { agents: { list: [{ id: "makaron", default: true }, { id: "v-codex" }] }, bindings: [{ agentId: "v-codex", match: { channel: "feishu", peer: { kind: "group", id: "oc_codex" } } }] };
  assert.equal(agentForFeishuGroup(cfg, "oc_codex"), "v-codex");
  assert.equal(agentForFeishuGroup(cfg, "oc_other"), "makaron");
  const feishu = {
    listChats: async () => [{ chatId: "oc_x1", name: "竞品调研" }, { chatId: "oc_x2", name: "VLab 压测 01" }, { chatId: "oc_x3", name: "VLab 压测 02" }],
    chatName: async (id) => ({ oc_codex: "Codex 群" })[id] ?? null,
  };
  assert.deepEqual(await resolveTarget("竞品调研", { cfg, feishu }), { sessionKey: "agent:makaron:feishu:group:oc_x1", label: "竞品调研" });
  const ambiguous = await resolveTarget("压测", { cfg, feishu });
  assert.match(ambiguous.error, /More than one/u);
  assert.equal(ambiguous.candidates.length, 2);
  assert.deepEqual(await resolveTarget("oc_codex", { cfg, feishu }), { sessionKey: "agent:v-codex:feishu:group:oc_codex", label: "Codex 群" });
  assert.match((await resolveTarget("不存在", { cfg, feishu })).error, /not in a group/u);
  assert.equal(await labelForSession(DM, { owners: [OWNER] }), "Tianyi 的私聊");
});

test("text: one collapsed thread card per conversation, both sides inside, transcript reply extraction", () => {
  const thread = [
    record({ id: "r_1", chainId: "r_1", status: "done", createdAt: 1, reply: "缺灰度比例？", finishedAt: 2 }),
    record({ id: "r_2", chainId: "r_1", status: "running", createdAt: 3, message: "20%" }),
  ];
  assert.deepEqual(threadEntries(thread).map((e) => [e.label, e.text]), [["V · Tianyi 的私聊", "do x"], ["V · A 群", "缺灰度比例？"], ["V · Tianyi 的私聊", "20%"]]);
  const card = threadCard(thread);
  const panel = card.body.elements[0];
  assert.equal(card.body.elements.length, 1, "only one line in the chat");
  assert.equal(panel.tag, "collapsible_panel");
  assert.equal(panel.expanded, false);
  assert.equal(panel.header.title.text_align, "center");
  assert.match(panel.header.title.content, /\*\*Tianyi 的私聊\*\* ⇄ \*\*A 群\*\* · 进行中 · 3 条/u);
  assert(!panel.header.title.content.includes("\n"), "the title is one line");
  assert.match(threadCard([record({ from: { label: "一个名字特别特别长的飞书群聊" } })]).body.elements[0].header.title.content, /一个名字特别特别长…/u);
  assert.equal(panel.elements.length, 3);
  assert.match(panel.elements[1].content, /V · A 群 ·/u);
  assert.match(threadCard([{ ...thread[0] }]).body.elements[0].header.title.content, /已完成/u);
  const huge = threadCard(Array.from({ length: 40 }, (_, i) => record({ id: `r_${i}`, chainId: "r_0", status: "done", createdAt: i, reply: "长".repeat(1500), finishedAt: i })));
  assert(JSON.stringify(huge).length < 30_000 * 1.2, "card stays under Feishu's size limit");
  const messages = [
    { role: "user", content: "q", timestamp: 10 },
    { role: "assistant", content: [{ type: "text", text: "answer" }, { type: "tool_use" }], timestamp: 20 },
  ];
  assert.equal(lastAssistantText(messages), "answer");
  assert.equal(lastAssistantText(messages, { after: 30 }), null);
});

function fakeRuntime({ replies = {}, waitStatus = {} } = {}) {
  const runs = [];
  return {
    runs,
    async run(params) {
      const runId = `run_${runs.length + 1}`;
      runs.push({ ...params, runId });
      return { runId };
    },
    async waitForRun({ runId }) {
      const run = runs.find((r) => r.runId === runId);
      const status = waitStatus[runId] ?? "ok";
      if (status !== "ok") return { status, error: status === "error" ? "unknown run" : undefined };
      const text = replies[run?.sessionKey];
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

test("dispatcher: request is posted and run in the target, the result returns to the origin", async () => {
  const store = tmpStore();
  store.write(record());
  const runtime = fakeRuntime({ replies: { [GROUP_A]: "done: 3 files", [DM]: "ok, next step" } });
  const feishu = fakeFeishu();
  const d = new RelayDispatcher({ store, runtime, feishuFor: () => feishu.api, getConfig: () => ({}), logger: { info() {}, warn() {} } });
  d.tick();
  await d.idle();
  const final = store.read("r_1");
  assert.equal(final.status, "done");
  assert.equal(final.reply, "done: 3 files");
  assert.equal(runtime.runs.length, 2);
  assert.equal(runtime.runs[0].sessionKey, GROUP_A);
  assert.equal(runtime.runs[0].deliver, false, "agent-to-agent turns are not posted on their own");
  assert.match(runtime.runs[0].message, /^V · Tianyi 的私聊：/u);
  assert.equal(runtime.runs[1].sessionKey, DM);
  assert.equal(runtime.runs[1].deliver, false);
  assert.match(runtime.runs[1].message, /^V · A 群：\n\ndone: 3 files/u);
  // one thread card in each chat, sent once and then patched; then the origin's last words
  const threadCards = feishu.cards.filter((c) => c.card.body.elements[0].tag === "collapsible_panel");
  assert.deepEqual(threadCards.map((c) => c.receiver.receiveId).sort(), ["oc_a", "ou_owner"]);
  assert(feishu.patches.length >= 2);
  assert.match(feishu.patches.at(-1).card.body.elements[0].header.title.content, / · 已完成 · 2 条/u);
  const finals = feishu.cards.filter((c) => c.card.body.elements[0].tag === "markdown");
  assert.deepEqual(finals.map((c) => [c.receiver.receiveId, c.card.body.elements[0].content]), [["ou_owner", "ok, next step"]]);
  assert.deepEqual(Object.keys(final.threadCards).sort(), [DM, GROUP_A].sort());
  assert.equal(final.finalMessageId, finals.length ? "om_3" : undefined);
});

test("dispatcher: after a restart a running relay is collected from the transcript and delivered", async () => {
  const store = tmpStore();
  store.write(record({ status: "running", runId: "old_run", startedAt: Date.now() - 1000, requestCardAt: 1 }));
  const runtime = fakeRuntime({ waitStatus: { old_run: "error" }, replies: { [DM]: "continuing" } });
  const feishu = fakeFeishu();
  const d = new RelayDispatcher({ store, runtime, feishuFor: () => feishu.api, getConfig: () => ({}), logger: { info() {}, warn() {} } });
  d.tick();
  await d.idle();
  const final = store.read("r_1");
  assert.equal(final.status, "done");
  assert.equal(final.reply, "from transcript");
  assert.equal(runtime.runs.length, 1, "the target is not run again");
  assert.equal(runtime.runs[0].sessionKey, DM);
});

test("dispatcher: a failed target run tells the origin instead of going silent", async () => {
  const store = tmpStore();
  store.write(record());
  const runtime = fakeRuntime({ waitStatus: { run_1: "error" } });
  runtime.getSessionMessages = async () => ({ messages: [] });
  const feishu = fakeFeishu();
  const d = new RelayDispatcher({ store, runtime, feishuFor: () => feishu.api, getConfig: () => ({}), logger: { info() {}, warn() {} } });
  d.tick();
  await d.idle();
  const final = store.read("r_1");
  assert.equal(final.status, "failed");
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

test("sessions: agents.entries as an object keyed by id", () => {
  const cfg = { agents: { entries: { "v-codex": {}, makaron: { default: true } } } };
  assert.equal(agentForFeishuGroup(cfg, "oc_x"), "makaron");
  assert.equal(agentForFeishuGroup({ agents: { entries: { makaron: {}, other: {} } } }, "oc_x", "makaron"), "makaron");
  assert.equal(agentForFeishuGroup({}, "oc_x"), "main");
});

test("text: a follow-up in a thread tells the target it is a reply, and the origin how to answer", async () => {
  const { requestTurn, resultTurn } = await import("../core/text.js");
  const first = requestTurn({ id: "r_1", chainId: "r_1", from: { label: "私聊" }, message: "写公告" });
  assert.match(first.extraSystemPrompt, /handed this task/u);
  assert.match(requestTurn({ id: "r_1", chainId: "r_1", from: { label: "私聊" }, message: "x", requester: "Tianyi" }).extraSystemPrompt, /asked for by Tianyi \(in 「私聊」\)/u);
  assert.match(first.extraSystemPrompt, /on its own initiative/u);
  assert.match(first.extraSystemPrompt, /redlines/u);
  assert.match(first.extraSystemPrompt, /ask for it in your reply/u);
  const next = requestTurn({ id: "r_2", chainId: "r_1", from: { label: "私聊" }, message: "版本 v2.3" });
  assert.match(next.extraSystemPrompt, /is answering you/u);
  assert.match(resultTurn({ id: "r_1", chainId: "r_1", to: { label: "B 群" }, message: "写公告", reply: "版本号？" }).extraSystemPrompt, /session_relay_send with target 「B 群」/u);
});

test("dispatcher: when the woken origin answers with another relay, its own text is not posted", async () => {
  const store = tmpStore();
  store.write(record());
  const runtime = fakeRuntime({ replies: { [GROUP_A]: "缺灰度比例？", [DM]: "已回复 20%" } });
  const origRun = runtime.run.bind(runtime);
  runtime.run = async (params) => {
    const res = await origRun(params);
    if (params.sessionKey === DM && /^V · A 群：/u.test(params.message)) {
      // the origin's turn relays again within the chain
      store.write(record({ id: "r_2", chainId: "r_1", via: "reply", status: "done", createdAt: Date.now() + 1, message: "20%" }));
    }
    return res;
  };
  const feishu = fakeFeishu();
  const d = new RelayDispatcher({ store, runtime, feishuFor: () => feishu.api, getConfig: () => ({}), logger: { info() {}, warn() {} } });
  d.tick();
  await d.idle();
  assert.equal(store.read("r_1").status, "done");
  assert.equal(store.read("r_1").finalMessageId, undefined);
  assert.equal(feishu.cards.filter((c) => c.card.body.elements[0].tag === "markdown").length, 0);
});
