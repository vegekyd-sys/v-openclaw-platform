import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { patchFeishuAskUser } from "../lab/release-files/feishu-ask-user/patch.mjs";
const root = new URL("../lab/release-files/feishu-ask-user/", import.meta.url);
const source = ["card.mjs", "runtime.mjs"].map(n => readFileSync(new URL(n, root), "utf8")).join("\n");
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
  const fields = c.body.elements.find(e => e.tag === "form").elements;
  assert(!JSON.stringify(c).includes("select_static"));
  assert.equal(c.body.elements.filter(e => e.tag === "button").length, 4);
  assert.equal(fields.filter(f => f.tag === "input").length, 2);
  assert.equal(fields.at(-1).behaviors, undefined);
  assert(!JSON.stringify(c).includes("initial_option"));
  for (const state of ["answered", "expired", "cancelled"]) assert(!JSON.stringify(api.buildFeishuAskCard(r, state)).includes('"tag":"form"'));
});
test("single-choice button resolves immediately without a submit step", async () => {
  const h = harness(); await h.runtime.requested(h.r, h.params);
  const button = h.sent[0].card.body.elements.filter(e => e.tag === "button")[1];
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
