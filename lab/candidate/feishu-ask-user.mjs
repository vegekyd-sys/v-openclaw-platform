import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { patchFeishuAskUser } from "../release-files/feishu-ask-user/patch.mjs";
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime);
const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const plugin = cfg.plugins.load.paths.find(p => p.endsWith("/@openclaw/feishu"));
assert(plugin?.startsWith(runtime), "must only patch private candidate runtime");
const dist = path.join(plugin, "dist");
const monitor = fs.readdirSync(dist).find(n => /^monitor\.account-.*\.js$/.test(n));
const file = path.join(dist, monitor);
const original = fs.readFileSync(file, "utf8");
const patched = patchFeishuAskUser(original);
fs.writeFileSync(file, patched);
assert.equal(spawnSync(process.execPath, ["--check", file]).status, 0);
const helpers = ["card.mjs", "chat.mjs", "runtime.mjs"].map(n => fs.readFileSync(new URL(`../release-files/feishu-ask-user/${n}`, import.meta.url), "utf8")).join("\n");
const { createFeishuAskRuntime, buildFeishuAskCard } = await import(`data:text/javascript;base64,${Buffer.from(helpers).toString("base64")}`);
const core = path.join(runtime, "openclaw/dist");
const managerFile = fs.readdirSync(core).find(n => /^question-manager-.*\.js$/.test(n));
const exports = await import(pathToFileURL(path.join(core, managerFile)));
const Manager = Object.values(exports).find(v => typeof v === "function" && v.prototype?.waitAnswer && v.prototype?.request);
assert(Manager, "real runtime QuestionManager required");
const manager = new Manager();
let onFinalize, sent = 0;
const adapter = createFeishuAskRuntime({
  send: async () => { sent++; return { messageId: "om_candidate" }; }, patch: async () => {}, register: p => { onFinalize = p.finalize; }, route: () => ({ to: "oc_candidate" }),
  call: async (m, cfg, p) => m === "question.get" ? { question: manager.get(p.id) } : p.cancel ? manager.cancel(p.id, p.resolvedBy) : manager.resolve(p.id, p.answers, p.resolvedBy),
});
const params = { cfg, accountId: "default" };
const record = manager.request({ id: "ask_" + "c".repeat(32), timeoutMs: 60000, sessionKey: "agent:makaron:feishu:group:oc_candidate",
  questions: [{ questionId: "scope", header: "范围", question: "请选择范围", options: [{ label: "原图" }, { label: "重画" }], isOther: true },
    { questionId: "effects", header: "效果", question: "请选择效果", multiSelect: true, options: [{ label: "灯串" }, { label: "鲸鱼" }], isOther: true }],
  onResolved: e => { void onFinalize?.(e.status === "answered" ? "Answered" : "Cancelled"); },
});
const wait = manager.waitAnswer(record.id, 3000);
await adapter.requested(record, params);
await adapter.payload({ channelData: { askUser: { questionId: record.id } } }, params);
const response = await adapter.submit({ operator: { open_id: "ou_candidate" }, context: { open_message_id: "om_candidate" }, action: { name: `v_ask_submit_${record.id}`, form_value: { choice_0: "0", choice_1: ["0", "1"], other_1: "增强" } } }, params);
assert.equal(response.toast.type, "success");
const answer = await wait;
assert.equal(answer.status, "answered");
assert.deepEqual(answer.answers.answers, { scope: ["原图"], effects: ["灯串", "鲸鱼", "增强"] });
assert.equal(sent, 1);
// Validate the exact card JSON with Feishu CardKit; create an unshared entity,
// never send a message or attach the synthetic question to a real session.
const feishu = cfg.channels.feishu;
const account = { ...feishu, ...feishu.accounts?.default };
let cardValidation = "unavailable: credentials use secret references";
if (typeof account.appId === "string" && typeof account.appSecret === "string") {
  const auth = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: account.appId, app_secret: account.appSecret }), signal: AbortSignal.timeout(15000) }).then(r => r.json());
  assert.equal(auth.code, 0, "Feishu auth failed (credentials redacted)");
  const res = await fetch("https://open.feishu.cn/open-apis/cardkit/v1/cards", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.tenant_access_token}` }, body: JSON.stringify({ type: "card_json", data: JSON.stringify(buildFeishuAskCard(record)) }), signal: AbortSignal.timeout(15000) }).then(r => r.json());
  assert.equal(res.code, 0, `CardKit validation failed: ${JSON.stringify({ code: res.code, msg: res.msg })}`);
  assert(res.data?.card_id);
  cardValidation = "accepted by Feishu CardKit (unshared)";
}
console.log(JSON.stringify({ ok: true, checks: ["live bundle patch and syntax", "actual QuestionManager wait -> answered", "multi-question/multi-select/custom answer", "lifecycle-payload dedup"], cardValidation }));
