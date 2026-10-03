import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { MARKER, patchChannel, patchMonitor, readExportAliases } from "../lab/release-files/feishu-dm-approvals/patch.mjs";
import * as api from "../lab/release-files/feishu-dm-approvals/core.mjs";

const OWNER = "ou_775a78b0aaae67da5e15eeaf102e3cd9";
const cfg = { commands: { ownerAllowFrom: [`feishu:${OWNER}`, "telegram:5368086561", "feishu:not-an-open-id"] } };
const action = (decision, approvalKind = "system-agent", approvalId = "system-agent:19355cc6-d6cd-4ed4-a680-b5a598b5bdbf") =>
  ({ decision, label: decision, style: "primary", command: `/approve ${approvalId} ${decision}`, action: { type: "approval", approvalId, approvalKind, decision } });
const systemView = {
  approvalId: "system-agent:19355cc6-d6cd-4ed4-a680-b5a598b5bdbf", approvalKind: "system-agent", phase: "pending",
  title: "OpenClaw change", metadata: [], agentId: "makaron", commandText: "",
  operationSummary: 'set config browser.extraArgs to ["--profile-directory=Profile 1"]',
  actions: [action("allow-once"), action("deny")], expiresAtMs: 1_000_000 + 10 * 60_000,
};
const request = { id: systemView.approvalId, expiresAtMs: systemView.expiresAtMs,
  request: { turnSourceChannel: "feishu", sessionKey: "agent:makaron:feishu:group:oc_5f39adc387ed0946ac39ef4b4967f513" } };
const click = (value, openId = OWNER) => ({ event: { operator: { open_id: openId }, context: { open_message_id: "om_card" }, action: { tag: "button", value } } });

test("approvers are the Feishu owner entries only", () => {
  assert.deepEqual(api.resolveFeishuOwnerApprovers(cfg), [OWNER]);
  assert.deepEqual(api.resolveFeishuOwnerApprovers({}), []);
  assert.deepEqual(api.resolveFeishuOwnerApprovers({ commands: { ownerAllowFrom: ["FEISHU:user:OU_ABC", "lark:ou_abc"] } }), ["ou_abc"]);
});

test("callback value round-trips; other card actions are ignored", () => {
  const value = api.buildFeishuApprovalCallbackValue(action("deny").action);
  const parsed = api.parseFeishuApprovalCallback(click(value));
  assert.deepEqual(parsed, { kind: "decision", approvalId: systemView.approvalId, approvalKind: "system-agent", decision: "deny", senderId: OWNER, messageId: "om_card" });
  assert.equal(api.parseFeishuApprovalCallback(click({ a: "v_secret_entry" })), undefined);
  assert.equal(api.parseFeishuApprovalCallback(click(JSON.stringify(value))).kind, "decision");
  assert.equal(api.parseFeishuApprovalCallback(click({ ...value, d: "allow-forever" })).kind, "invalid");
  assert.equal(api.parseFeishuApprovalCallback(click({ ...value, id: "bad id with spaces" })).kind, "invalid");
});

test("pending system change card shows the change, source and decision buttons", () => {
  const card = api.buildFeishuApprovalPendingCard({ request, view: systemView, nowMs: 1_000_000, reviewUrl: "https://v.example/approve/x" });
  const json = JSON.stringify(card);
  assert.equal(card.header.title.content, "需要你审批：OpenClaw 改动");
  assert.match(json, /browser\.extraArgs/);
  assert.match(json, /来自飞书群聊/);
  assert.match(json, /10 分钟内有效/);
  const buttons = card.body.elements.find((e) => e.tag === "column_set").columns.map((c) => c.elements[0]);
  assert.deepEqual(buttons.map((b) => b.text.content), ["批准", "拒绝"]);
  assert.deepEqual(buttons.map((b) => b.behaviors[0].value.d), ["allow-once", "deny"]);
  assert.match(json, /Control UI/);
});

test("exec and plugin cards render their own subject", () => {
  const exec = api.buildFeishuApprovalPendingCard({ request: { id: "e1", request: {} }, nowMs: 0, view: {
    approvalKind: "exec", phase: "pending", title: "Exec", metadata: [], commandText: "rm -rf /tmp/x", cwd: "/home/openclaw",
    warningText: "deletes files", expiresAtMs: 120_000, actions: [action("allow-once", "exec", "e1"), action("allow-always", "exec", "e1"), action("deny", "exec", "e1")] } });
  assert.equal(exec.header.title.content, "需要你审批：执行命令");
  assert.match(JSON.stringify(exec), /rm -rf \/tmp\/x/);
  assert.equal(exec.body.elements.find((e) => e.tag === "column_set").columns.length, 3);
  const plugin = api.buildFeishuApprovalPendingCard({ request: { id: "plugin:p1", request: {} }, nowMs: 0, view: {
    approvalKind: "plugin", phase: "pending", title: "Send email", description: "to boss", severity: "warning", metadata: [],
    toolName: "gmail_send", expiresAtMs: 60_000, actions: [action("allow-once", "plugin", "plugin:p1")] } });
  assert.equal(plugin.header.title.content, "需要你审批：插件操作");
  assert.match(JSON.stringify(plugin), /Send email/);
});

test("terminal cards carry no buttons and say what happened", () => {
  const states = [
    [{ phase: "resolved", decision: "allow-once", resolvedBy: `Chat approval (feishu ${OWNER})`, applicationStatus: "applied" }, "已批准：OpenClaw 改动", /改动已经写入/],
    [{ phase: "resolved", decision: "allow-once", applicationStatus: "not-applied" }, "已批准：OpenClaw 改动", /没有写入/],
    [{ phase: "resolved", decision: "deny" }, "已拒绝：OpenClaw 改动", /什么也没有执行/],
    [{ phase: "expired" }, "已过期：OpenClaw 改动", /时限/],
    [{ phase: "resolved", decision: "deny", terminalStatus: "cancelled" }, "已取消：OpenClaw 改动", /已取消/],
  ];
  for (const [patch, title, text] of states) {
    const card = api.buildFeishuApprovalTerminalCard({ request, view: { ...systemView, actions: undefined, ...patch } });
    assert.equal(card.header.title.content, title);
    assert.match(JSON.stringify(card), text);
    assert(!JSON.stringify(card).includes('"behaviors"'));
  }
  assert.match(JSON.stringify(api.buildFeishuApprovalTerminalCard({ request, view: { ...systemView, phase: "resolved", decision: "allow-once", resolvedBy: OWNER } })), new RegExp(`<at id=${OWNER}>`));
  assert(!JSON.stringify(api.buildFeishuApprovalClosedCard({ request, view: systemView })).includes('"behaviors"'));
});

function handler(resolveImpl, waitMs = 50) {
  const calls = [];
  const logs = [];
  const handle = api.createFeishuApprovalCallbackHandler({
    waitMs,
    resolve: async (params) => { calls.push(params); return await resolveImpl(params); },
    isNotFound: (error) => error?.code === "NOT_FOUND",
    log: (line) => logs.push(line),
  });
  return { calls, logs, handle };
}
const value = (decision = "allow-once") => api.buildFeishuApprovalCallbackValue(action(decision).action);

test("owner click resolves through the Gateway with the clicker as reviewer", async () => {
  const h = handler(async () => ({ applied: true }));
  const response = await h.handle(click(value()), { cfg, accountId: "default" });
  assert.deepEqual(response, { toast: { type: "success", content: "已批准。" } });
  assert.deepEqual(h.calls, [{ cfg, approvalId: systemView.approvalId, approvalKind: "system-agent", decision: "allow-once", channel: "feishu", accountId: "default", senderId: OWNER }]);
  assert.equal((await handler(async () => ({ applied: true })).handle(click(value("deny")), { cfg, accountId: "default" })).toast.content, "已拒绝。");
});

test("non-owner, unknown and malformed clicks never reach the Gateway", async () => {
  const h = handler(async () => ({ applied: true }));
  assert.equal((await h.handle(click(value(), "ou_someoneelse"), { cfg, accountId: "default" })).toast.type, "error");
  assert.equal((await h.handle(click(value()), { cfg: {}, accountId: "default" })).toast.type, "error");
  assert.equal((await h.handle(click({ ...value(), k: "nope" }), { cfg, accountId: "default" })).toast.content, "这张审批卡已失效。");
  assert.equal(await h.handle(click({ a: "other" }), { cfg, accountId: "default" }), undefined);
  assert.equal(h.calls.length, 0);
});

test("already handled, failed and slow resolutions return the right toast", async () => {
  const gone = handler(async () => { throw Object.assign(new Error("approval already resolved"), { gatewayCode: "APPROVAL_ALREADY_RESOLVED" }); });
  assert.equal((await gone.handle(click(value()), { cfg, accountId: "default" })).toast.type, "warning");
  const notFound = handler(async () => { throw Object.assign(new Error("x"), { code: "NOT_FOUND" }); });
  assert.equal((await notFound.handle(click(value()), { cfg, accountId: "default" })).toast.type, "warning");
  const stale = handler(async () => ({ applied: false }));
  assert.equal((await stale.handle(click(value()), { cfg, accountId: "default" })).toast.content, "这条审批已经处理过了。");
  const broken = handler(async () => { throw new Error("socket closed"); });
  assert.equal((await broken.handle(click(value()), { cfg, accountId: "default" })).toast.type, "error");
  await new Promise((r) => setImmediate(r));
  assert.match(broken.logs.join("\n"), /socket closed/);
  let release;
  let fast = false;
  const slow = handler(() => fast ? { applied: true } : new Promise((resolve) => { release = resolve; }), 20);
  assert.equal((await slow.handle(click(value()), { cfg, accountId: "default" })).toast.content, "已提交，正在处理。");
  assert.equal((await slow.handle(click(value()), { cfg, accountId: "default" })).toast.content, "正在处理，请稍候。");
  assert.equal(slow.calls.length, 1);
  release({ applied: true });
  fast = true;
  await new Promise((r) => setImmediate(r));
  assert.equal((await slow.handle(click(value()), { cfg, accountId: "default" })).toast.type, "success");
});

test("patches require exact anchors and are idempotent", () => {
  const channel = 'import x from "./a.js";\nconst p = { approvalCapability: feishuApprovalAuth, secrets: {} };\n';
  const patched = patchChannel(channel);
  assert.match(patched, /createVFeishuApprovalCapability\(feishuApprovalAuth\)/);
  assert.equal(patchChannel(patched), patched);
  assert.throws(() => patchChannel("approvalCapability: other,"), /exactly one anchor/);
  const monitor = '"card.action.trigger": async (data) => {\n\tfoo();\n}\nconst vSecretEntryUnsubscribe = vSecretEntrySubscribeRequested({ cfg, accountId, abortSignal, log });\n';
  const patchedMonitor = patchMonitor(monitor);
  assert.match(patchedMonitor, /vFeishuApprovalCardAction\(data, \{ cfg, accountId \}\)/);
  assert.match(patchedMonitor, /vFeishuApprovalRegisterContext\(\{ channelRuntime: params\.channelRuntime/);
  assert.equal(patchMonitor(patchedMonitor), patchedMonitor);
  assert.throws(() => patchMonitor(monitor + monitor), /exactly one anchor/);
  assert.deepEqual([...readExportAliases("x;\nexport { a as b, c, d as e };\n")], [["a", "b"], ["c", "c"], ["d", "e"]]);
});

test("committed release files are generated from this patch", () => {
  const dir = new URL("../lab/release-files/feishu-dm-approvals/dist/", import.meta.url);
  for (const name of ["v-feishu-approvals.js", "channel-DSYCNah8.js", "monitor.account-WFdlCDhR.js"]) {
    assert(readFileSync(new URL(name, dir), "utf8").startsWith(`// ${MARKER}\n`), name);
  }
});
