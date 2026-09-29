import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { patchFeishuAskUser } from "../lab/release-files/feishu-ask-user/patch.mjs";
const root = new URL("../lab/release-files/feishu-ask-user/", import.meta.url);
const source = ["card.mjs", "runtime.mjs", "stream.mjs"].map(n => readFileSync(new URL(n, root), "utf8")).join("\n");
export const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
export const record = (questions) => ({ id: "ask_" + "a".repeat(32), status: "pending", sessionKey: "agent:makaron:feishu:group:oc_test", expiresAtMs: Date.now() + 60000,
  questions: questions ?? [{ questionId: "scope", header: "范围", question: "如何重做？", options: [{ label: "重做动态", description: "保持原图" }, { label: "重新绘制" }], isOther: true }] });
export const event = (r, form, messageId = "om_test") => ({ event: { operator: { open_id: "ou_test" }, context: { open_message_id: messageId }, action: { tag: "button", name: `v_ask_submit_${r.id}`, form_value: form } } });
function harness(overrides = {}) {
  const sent = [], calls = [], patches = [], finalizers = [];
  const r = record();
  const deps = { send: async p => { sent.push(p); return { messageId: "om_test" }; }, patch: async p => patches.push(p), register: p => finalizers.push(p), route: () => ({ to: "oc_test" }),
    call: async (m, cfg, p) => { calls.push({ m, p }); return { question: r }; }, ...overrides };
  return { r, sent, calls, patches, finalizers, runtime: api.createFeishuAskRuntime(deps), params: { cfg: {}, accountId: "default" } };
}
test("render complete single/multi/custom forms without default answers; hide terminal controls", () => {
  const r = record(); r.questions.push({ ...r.questions[0], questionId: "multi", multiSelect: true });
  const c = api.buildFeishuAskCard(r);
  const form = c.body.elements.find(e => e.tag === "form");
  const fields = form.elements[0].elements;
  assert(!JSON.stringify(c).includes("select_static"));
  assert.equal(c.body.elements.filter(e => e.tag === "interactive_container").length, 4);
  assert.equal(fields.filter(f => f.tag === "input").length, 2);
  assert.equal(form.elements.at(-1).behaviors, undefined);
  assert(!JSON.stringify(c).includes("initial_option"));
  for (const state of ["answered", "expired", "cancelled"]) assert(!JSON.stringify(api.buildFeishuAskCard(r, state)).includes('"tag":"form"'));
});
test("single-choice button resolves immediately without a submit step", async () => {
  const h = harness(); await h.runtime.requested(h.r, h.params);
  const button = h.sent[0].card.body.elements.filter(e => e.tag === "interactive_container")[1];
  const e = event(h.r, {}); e.event.action = { tag: "button", value: button.behaviors[0].value };
  assert.equal((await h.runtime.submit(e, h.params)).toast.type, "success");
  assert.deepEqual({ ...h.calls[0].p.answers.answers }, { scope: ["重新绘制"] });
});
test("multi-select buttons toggle per sender and only resolve after confirmation", async () => {
  const h = harness(); h.r.questions[0].multiSelect = true; await h.runtime.requested(h.r, h.params);
  const click = async (index, operator = "ou_test") => {
    const e = event(h.r, {}); e.event.operator.open_id = operator;
    e.event.action = { tag: "button", value: { a: api.V_ASK_ACTION, q: h.r.id, qi: 0, oi: index } };
    return h.runtime.submit(e, h.params);
  };
  await click(0); await click(1); const toggle = await click(0);
  assert.equal(toggle.toast.type, "info");
  assert.equal(h.calls.length, 0);
  await click(0, "ou_other");
  assert.equal((await h.runtime.submit(event(h.r, {}), h.params)).toast.type, "success");
  assert.deepEqual({ ...h.calls[0].p.answers.answers }, { scope: ["重新绘制"] });
});
test("answers map to authoritative labels and accept custom overrides / multi-select", () => {
  const r = record();
  assert.deepEqual({ ...api.readFeishuAskAnswers(r, { choice_0: "1" }).answers }, { scope: ["重新绘制"] });
  assert.deepEqual({ ...api.readFeishuAskAnswers(r, { choice_0: "1", other_0: "新的做法" }).answers }, { scope: ["新的做法"] });
  r.questions[0].multiSelect = true;
  assert.deepEqual({ ...api.readFeishuAskAnswers(r, { choice_0: ["0", "1", "0"], other_0: "补充" }).answers }, { scope: ["重做动态", "重新绘制", "补充"] });
});
test("reject empty, injected options, forbidden other and missing questions", () => {
  const r = record();
  for (const form of [{}, { choice_0: "99" }, { choice_0: ["0", "1"] }, { choice_0: {} }, { other_0: "x".repeat(1001) }]) assert.throws(() => api.readFeishuAskAnswers(r, form));
  r.questions[0].isOther = false;
  assert.throws(() => api.readFeishuAskAnswers(r, { other_0: "custom" }));
  r.questions.push({ ...r.questions[0], questionId: "second" });
  assert.throws(() => api.readFeishuAskAnswers(r, { choice_0: "0" }));
});
test("secret requests and unrelated callbacks stay on their original path", () => {
  const r = record(); r.questions[0].isSecret = true;
  assert.equal(api.isFeishuAskQuestion(r), false);
  assert.equal(api.parseFeishuAskSubmission({ action: { value: { a: "v.secret_entry.submit" } } }), undefined);
  assert.equal(api.parseFeishuAskSubmission({ action: { name: "v_ask_submit_forged" } }).invalid, true);
});
test("lifecycle + payload race sends one card and answer bypasses queued chat", async () => {
  const h = harness();
  await Promise.all([h.runtime.requested(h.r, h.params), h.runtime.payload({ channelData: { askUser: { questionId: h.r.id } } }, h.params)]);
  assert.equal(h.sent.length, 1);
  const result = await h.runtime.submit(event(h.r, { choice_0: "1" }), h.params);
  assert.equal(result.toast.type, "success");
  const resolution = h.calls.find(c => c.m === "question.resolve");
  assert.equal(resolution.p.id, h.r.id);
  assert.deepEqual({ ...resolution.p.answers.answers }, { scope: ["重新绘制"] });
  assert.equal(resolution.p.resolvedBy, "feishu:ou_test");
  await h.runtime.submit(event(h.r, { choice_0: "0" }), h.params);
  assert.equal(h.calls.filter(c => c.m === "question.resolve").length, 1);
});
test("reject wrong message/account without privileged resolve", async () => {
  const h = harness(); await h.runtime.requested(h.r, h.params);
  assert.equal((await h.runtime.submit(event(h.r, { choice_0: "0" }, "om_other"), h.params)).toast.type, "error");
  assert.equal((await h.runtime.submit(event(h.r, { choice_0: "0" }), { ...h.params, accountId: "other" })).toast.type, "error");
  assert.equal(h.calls.length, 0);
});
test("failed delivery cancels invisible wait", async () => {
  const h = harness({ send: async () => { throw new Error("network"); } });
  await h.runtime.requested(h.r, h.params);
  assert.equal(h.calls[0].m, "question.resolve"); assert.equal(h.calls[0].p.cancel, true);
});
test("expired/cancelled delivery disables submission", async () => {
  const h = harness(); await h.runtime.requested(h.r, h.params);
  await h.finalizers[0].finalize("Expired");
  assert.equal(h.patches.length, 1);
  assert.equal((await h.runtime.submit(event(h.r, { choice_0: "0" }), h.params)).toast.type, "info");
  assert.equal(h.calls.length, 0);
});
test("concurrent submissions resolve once; transient failure permits retry", async () => {
  let release, count = 0;
  const h = harness({ call: async () => { count++; await new Promise(r => { release = r; }); if (count === 1) throw new Error("offline"); } });
  await h.runtime.requested(h.r, h.params);
  const first = h.runtime.submit(event(h.r, { choice_0: "0" }), h.params);
  assert.equal((await h.runtime.submit(event(h.r, { choice_0: "1" }), h.params)).toast.type, "info");
  release(); assert.equal((await first).toast.type, "error");
  const retry = h.runtime.submit(event(h.r, { choice_0: "1" }), h.params); release();
  assert.equal((await retry).toast.type, "success"); assert.equal(count, 2);
});
test("shape-gated patch preserves secret path, is idempotent, and rejects drift", () => {
  const original = readFileSync(new URL("../lab/release-files/feishu-secret-entry-runtime-v2/monitor.account-WFdlCDhR.js", import.meta.url), "utf8");
  const patched = patchFeishuAskUser(original);
  assert.equal(patchFeishuAskUser(patched), patched);
  assert(patched.includes("vSecretEntryHandleSubmission"));
  assert.throws(() => patchFeishuAskUser(original.replace('"card.action.trigger": async (data) => {', "changed")));
});

test("inline delivery stays in original stream and never returns a destructive raw callback card", async () => {
  const h = harness(), inline = [];
  const unbind = h.runtime.bindStream(h.r.sessionKey, 'default', async card => {
    inline.push(card); return { messageId: 'om_stream', updateCard: async card => inline.push(card) };
  });
  await h.runtime.requested(h.r, h.params);
  assert.equal(h.sent.length, 0);
  const answer = await h.runtime.submit(event(h.r, { choice_0: '1' }, 'om_stream'), h.params);
  assert.equal(answer.toast.type, 'success'); assert.equal(answer.card, undefined);
  assert(JSON.stringify(inline.at(-1)).includes('已选择：重新绘制'));
  await h.finalizers[0].finalize('Answered');
  assert.equal(h.patches.length, 0);
  unbind();
  await h.runtime.requested({ ...h.r, id: 'ask_'+'b'.repeat(32) }, h.params);
  assert.equal(h.sent.length, 1);
});

test("ambiguous active session owners fall back without crossing replies", async () => {
  const h = harness();
  const send = async () => { throw new Error('must not pick another turn'); };
  h.runtime.bindStream(h.r.sessionKey, 'default', send);
  h.runtime.bindStream(h.r.sessionKey, 'default', async c => send(c));
  await h.runtime.requested(h.r, h.params);
  assert.equal(h.sent.length, 1);
});

test("stream question preserves prefix/note, appends continuation, survives closure and rejects stale question writes", async () => {
  const writes = [], textWrites = [], noteWrites = [];
  class Session {
    constructor() { this.queue = Promise.resolve(); this.closed = false; }
    async start() { this.state = { messageId:'om_inline', cardId:'card_inline', sentText:'已有正文', currentText:'已有正文' }; }
    async replaceCardContent(text) { textWrites.push(text); return true; }
    async updateNoteContent() { throw Error("closed streaming note endpoint must not run"); }
    async updateCardContent() { throw Error('streaming endpoint should not run after switch'); }
    async closeWithResult(text) { this.closed=true; await this.queue; await this.replaceCardContent(text); this.state.sentText=text; this.state=null; }
  }
  api.installFeishuAskStream(Session, async (s,state,card) => writes.push(card), async (s,state,note) => noteWrites.push(note));
  const s = new Session(); await s.start('oc', 'chat_id', { note: 'V · Makaron' });
  const transport = await s.vAskUpdate(api.buildFeishuAskCard(record()));
  assert.equal(transport.messageId,'om_inline');
  assert.equal(writes[0].config.streaming_mode,false);
  assert.equal(writes[0].body.elements[0].content,'已有正文');
  assert.equal(writes[0].body.elements.at(-1).element_id,'note');
  await s.updateNoteContent('新的模型信息');
  assert.deepEqual(noteWrites, ['新的模型信息']);
  await s.updateCardContent('已有正文\n\n继续制作');
  assert.equal(textWrites.at(-1),'继续制作');
  const closing = s.closeWithResult('已有正文\n\n已完成');
  await transport.updateCard(api.buildFeishuAskCard(record(),'answered'));
  await closing;
  assert.equal(writes.at(-1).body.elements.find(e=>e.element_id==='content').content,'已完成');
  await s.vAskUpdate(api.buildFeishuAskCard({ ...record(), id:'ask_'+'b'.repeat(32) }));
  const count=writes.length;
  await transport.updateCard(api.buildFeishuAskCard(record(),'expired'));
  assert.equal(writes.length,count);
});

test("slow CardKit repaint cannot block the native callback acknowledgement", async () => {
  const h=harness(); let release;
  h.runtime.bindStream(h.r.sessionKey,'default',async()=>({messageId:'om_stream',updateCard:()=>new Promise(r=>{release=r})}));
  await h.runtime.requested(h.r,h.params);
  const result=await h.runtime.submit(event(h.r,{choice_0:'0'},'om_stream'),h.params);
  assert.equal(result.toast.type,'success'); assert.equal(result.card,undefined);
  release();
});
