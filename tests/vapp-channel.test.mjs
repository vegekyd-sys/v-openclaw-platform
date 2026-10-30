import assert from "node:assert/strict";
import test from "node:test";
import { createVapp, resolveUser } from "../apps/v-experience/app/core/vapp.js";
import * as vx from "../apps/v-experience/v-experience.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cfg = { channels: { vapp: { defaultUser: "tianyi", users: { tianyi: { name: "天懿", devices: ["dev-phone"] }, xinyi: { name: "馨仪", devices: ["dev-xinyi"] } } } } };
const phone = { connId: "c1", connect: { device: { id: "dev-phone" } } };
const QUESTION_LISTENERS = Symbol.for("openclaw.questionChannelRequestedListeners");
const askId = (n) => `ask_${String(n).repeat(32).slice(0, 32)}`;

/** A vapp with a fake Gateway: `script(replyOptions, deliver)` plays one turn. */
function harness(script) {
  const events = [];
  const resolved = [];
  const context = { broadcastToConnIds: (event, payload, connIds) => events.push({ event, payload, connIds: [...connIds] }) };
  const vapp = createVapp({
    vx,
    getConfig: () => cfg,
    updateMs: 0,
    call: async (method, params) => {
      if (method === "question.resolve") { resolved.push(params); return { ok: true }; }
      throw new Error(`unexpected ${method}`);
    },
    inbound: {
      resolveRoute: ({ peer }) => ({
        route: { agentId: "makaron", dmScope: "per-channel-peer", sessionKey: `agent:makaron:vapp:direct:${peer.id}` },
        buildEnvelope: ({ body }) => body,
      }),
      buildContext: (params) => params,
      dispatch: async ({ replyOptions, delivery, ctxPayload }) => script({ replyOptions, deliver: delivery.deliver, ctxPayload }),
      saveMedia: async () => ({ path: "/tmp/in.png", contentType: "image/png" }),
      toMediaFacts: async (list) => list,
    },
  });
  const cards = () => events.filter((e) => e.event === "plugin.vapp.card").map((e) => e.payload);
  return { vapp, events, cards, resolved, context };
}

const markdown = (card) => card.body.elements.filter((e) => e.tag === "markdown").map((e) => e.content);

test("devices map to V users; unknown devices fall back to the default user", () => {
  assert.equal(resolveUser(cfg, { connect: { device: { id: "dev-xinyi" } } }).id, "xinyi");
  assert.equal(resolveUser(cfg, { connect: { device: { id: "dev-xinyi" } } }).owner, false);
  assert.deepEqual(resolveUser(cfg, { connect: { device: { id: "other" } } }).id, "tianyi");
  assert.equal(resolveUser({ channels: { vapp: { users: {} } } }, phone), undefined, "no default user: nobody");
  assert.equal(resolveUser({ channels: { vapp: { enabled: false, defaultUser: "tianyi" } } }, phone), undefined);
});

test("a turn streams one card in place and finishes with only the answer", async () => {
  let ctx;
  const h = harness(async ({ replyOptions, deliver, ctxPayload }) => {
    ctx = ctxPayload;
    replyOptions.onPlanUpdate({ phase: "update", steps: [{ step: "查记录", status: "in_progress" }] });
    replyOptions.onToolStart({ name: "exec", phase: "start" });
    await sleep(5);
    replyOptions.onPartialReply({ text: "共 7 次" });
    await sleep(5);
    await deliver({ text: "共 7 次停顿。" }, { kind: "final" });
  });
  const hello = await h.vapp.hello({ client: phone, context: h.context });
  assert.equal(hello.sessionKey, "agent:makaron:vapp:direct:tianyi");
  const sent = await h.vapp.send({ params: { text: "统计一下停顿", clientMessageId: "m1" }, client: phone, context: h.context });
  assert.equal(sent.messageId, "m1");
  await sleep(30);

  assert.equal(ctx.sender.id, "tianyi");
  assert.equal(ctx.access.commands.authorized, true, "the owner may run commands");
  const cards = h.cards();
  assert.ok(cards.every((c) => c.cardId === cards[0].cardId), "one card per reply");
  assert.ok(cards.every((c, i) => i === 0 || c.seq > cards[i - 1].seq), "seq orders the rewrites");
  assert.deepEqual(markdown(cards[0].card), ["💭 正在思考"]);
  assert.ok(cards.some((c) => markdown(c.card).some((m) => /▶️ \*\*查记录\*\*/.test(m))), "the plan shows while working");
  const last = cards.at(-1);
  assert.equal(last.final, true);
  assert.deepEqual(markdown(last.card), ["共 7 次停顿。"]);
  assert.ok(h.events.every((e) => e.connIds.join() === "c1"), "only the user's own connection");
});

test("ask_user: its own card, a tap answers, the reply continues in a new card", async () => {
  let release;
  const record = { id: askId(1), sessionKey: "agent:makaron:vapp:direct:tianyi", status: "pending", questions: [{ questionId: "day", question: "哪天出发？", options: [{ label: "周六" }, { label: "周日" }] }] };
  const h = harness(async ({ replyOptions, deliver }) => {
    replyOptions.onPartialReply({ text: "我先问一下" });
    await sleep(5);
    for (const listener of globalThis[QUESTION_LISTENERS]) await listener(record);
    await new Promise((resolve) => { release = resolve; });
    replyOptions.onPartialReply({ text: "好的，周日出发" });
    await deliver({ text: "好的，周日出发。" }, { kind: "final" });
  });
  await h.vapp.send({ params: { text: "帮我订票" }, client: phone, context: h.context });
  await sleep(20);

  const qCard = h.cards().find((c) => c.cardId === `q:${record.id}`);
  assert.ok(qCard, "the question has its own card");
  const buttons = qCard.card.body.elements.filter((e) => e.tag === "button");
  assert.deepEqual(buttons.map((b) => b.text.content), ["周六", "周日"]);
  const waiting = h.cards().filter((c) => c.cardId.endsWith(":0")).at(-1);
  assert.match(markdown(waiting.card).join("\n"), /请在下方卡片中回答/);

  const tap = await h.vapp.action({ params: { value: buttons[1].behaviors[0].value }, client: phone, context: h.context });
  assert.deepEqual(tap, { ok: true, answered: true });
  assert.deepEqual(JSON.parse(JSON.stringify(h.resolved[0])), { id: record.id, answers: { answers: { day: ["周日"] } }, resolvedBy: "vapp:tianyi" });
  const answered = h.cards().filter((c) => c.cardId === `q:${record.id}`).at(-1);
  assert.equal(answered.card.header.template, "grey");
  assert.deepEqual(markdown(answered.card), ["✓ 已选择：周日"]);
  const frozen = h.cards().filter((c) => c.cardId.endsWith(":0")).at(-1);
  assert.deepEqual(markdown(frozen.card), ["我先问一下"], "the text before the question stays, without the waiting line");

  release();
  await sleep(20);
  const second = h.cards().filter((c) => c.cardId.endsWith(":1"));
  assert.ok(second.length, "the rest of the reply is a new card below the question");
  assert.deepEqual(markdown(second.at(-1).card), ["好的，周日出发。"]);
  assert.equal(second.at(-1).final, true);

  const again = await h.vapp.action({ params: { value: buttons[0].behaviors[0].value }, client: phone, context: h.context });
  assert.equal(again.ok, false, "an answered question takes no more taps");
});

test("ask_user: typing the answer resolves it without starting a turn", async () => {
  let turns = 0;
  let release;
  const record = { id: askId(2), sessionKey: "agent:makaron:vapp:direct:tianyi", status: "pending", questions: [{ questionId: "meal", question: "吃什么？", options: [{ label: "火锅" }, { label: "面条" }] }] };
  const h = harness(async () => {
    turns += 1;
    for (const listener of globalThis[QUESTION_LISTENERS]) await listener(record);
    await new Promise((resolve) => { release = resolve; });
  });
  await h.vapp.send({ params: { text: "晚饭" }, client: phone, context: h.context });
  await sleep(10);
  const typed = await h.vapp.send({ params: { text: "2" }, client: phone, context: h.context });
  assert.equal(typed.answeredQuestion, true);
  assert.equal(turns, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.resolved[0].answers)), { answers: { meal: ["面条"] } });
  assert.equal(h.cards().filter((c) => c.cardId === `q:${record.id}`).at(-1).card.header.template, "grey");
  release();
});

test("a turn with nothing to say removes its card; outbound sends are messages", async () => {
  const h = harness(async ({ deliver }) => { await deliver({ text: "NO_REPLY".slice(0, 0) }, { kind: "final" }); });
  await h.vapp.send({ params: { text: "嗯" }, client: phone, context: h.context });
  await sleep(10);
  assert.equal(h.cards().at(-1).removed, true);

  const out = h.vapp.deliver({ to: "vapp:tianyi", text: "成片在这里", media: [{ source: "/w/out/final.mp4" }] });
  assert.equal(out.delivered, true);
  const message = h.events.find((e) => e.event === "plugin.vapp.message").payload;
  assert.equal(message.sessionKey, "agent:makaron:vapp:direct:tianyi");
  assert.equal(message.text, "成片在这里");
  assert.deepEqual(message.media, [{ source: "/w/out/final.mp4" }]);
  assert.equal(h.vapp.deliver({ to: "xinyi", text: "hi" }).delivered, false, "no connection: not delivered");
});

test("command buttons are sent as the tapper's message", async () => {
  let body;
  const h = harness(async ({ ctxPayload }) => { body = ctxPayload.message.rawBody; });
  const tap = await h.vapp.action({ params: { value: { kind: "command", command: "/v-handback h_1a2b" } }, client: phone, context: h.context });
  assert.equal(tap.ok, true);
  await sleep(5);
  assert.equal(body, "/v-handback h_1a2b");
  const bad = await h.vapp.action({ params: { value: { kind: "command", command: "rm -rf /" } }, client: phone, context: h.context });
  assert.equal(bad.ok, false);
});
