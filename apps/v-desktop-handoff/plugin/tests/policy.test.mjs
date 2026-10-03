import assert from "node:assert/strict";
import { test } from "node:test";
import { decideToolCall } from "../core/policy.js";
import { isControlAnywhereActor, isTrustedDirectSession, resolveOwnerActor, resolveTrustedActor } from "../core/identity.js";
import { deliverPrivately } from "../core/deliver.js";
import { HandoffAdminClient } from "../core/admin-client.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("policy: nothing is blocked while nobody controls the desktop", () => {
  assert.equal(decideToolCall({ toolName: "browser", params: { action: "act" }, controlActive: false }), undefined);
  assert.equal(decideToolCall({ toolName: "exec", params: {}, controlActive: true }), undefined);
});

test("policy: while a human controls, browser writes are blocked and reads allowed", () => {
  for (const action of ["act", "open", "navigate", "close", "focus", "stop", "upload", undefined]) {
    const decision = decideToolCall({ toolName: "browser", params: { action }, controlActive: true });
    assert.equal(decision?.block, true, `${action} must be blocked`);
    assert.match(decision.blockReason, /handoff/u);
  }
  for (const action of ["status", "tabs", "snapshot", "screenshot"]) {
    assert.equal(decideToolCall({ toolName: "browser", params: { action }, controlActive: true }), undefined, `${action} stays allowed`);
  }
  assert.equal(decideToolCall({ toolName: "computer", params: { action: "left_click" }, controlActive: true }).block, true);
  assert.equal(decideToolCall({ toolName: "computer", params: { action: "screenshot" }, controlActive: true }), undefined);
});

test("identity: channel sender wins, CLI falls back to the configured actor, direct detection", () => {
  assert.equal(resolveTrustedActor({ requesterSenderId: "ou_1", messageChannel: "feishu" }), "feishu:ou_1");
  assert.equal(resolveTrustedActor({ requesterSenderId: "ou_1", messageChannel: "feishu" }, { principalAliases: { "feishu:ou_1": "tianyi" } }), "tianyi");
  assert.equal(resolveTrustedActor({ oneShotCliRun: true }), null);
  assert.equal(resolveTrustedActor({ oneShotCliRun: true }, { cliActorUserId: "cli:tianyi" }), "cli:tianyi");
  assert.equal(isTrustedDirectSession({ sessionKey: "agent:makaron:feishu:direct:ou_1" }), true);
  assert.equal(isTrustedDirectSession({ sessionKey: "agent:makaron:feishu:group:oc_1" }), false);
  assert.equal(isTrustedDirectSession({ oneShotCliRun: true, sessionKey: "agent:makaron:feishu:direct:x" }), false);
  assert.equal(isTrustedDirectSession({ oneShotCliRun: true }, { trustCliAsDirect: true }), true);
});

test("identity: harness runtimes without requesterSenderId fall back to the Gateway-verified owner", () => {
  const cfg = { commands: { ownerAllowFrom: ["feishu:ou_owner", "telegram:123"] } };
  const dm = { senderIsOwner: true, messageChannel: "feishu", config: cfg, deliveryContext: { channel: "feishu", to: "user:ou_owner" } };
  const group = { senderIsOwner: true, messageChannel: "feishu", config: cfg, deliveryContext: { channel: "feishu", to: "chat:oc_room" } };
  assert.equal(resolveTrustedActor(dm), "feishu:ou_owner");
  assert.equal(resolveTrustedActor(group), "feishu:ou_owner", "single owner on the channel is unambiguous in a group");
  assert.equal(resolveTrustedActor({ ...dm, requesterSenderId: "ou_other" }), "feishu:ou_other", "channel sender still wins");
  assert.equal(resolveTrustedActor({ ...dm, senderIsOwner: false }), null, "non-owners never get a derived identity");
  assert.equal(resolveTrustedActor({ ...dm, senderIsOwner: undefined }), null);
  assert.equal(resolveTrustedActor({ ...dm, config: undefined, runtimeConfig: cfg }), "feishu:ou_owner", "runtimeConfig is accepted");
  assert.equal(resolveTrustedActor({ ...dm, messageChannel: "telegram" }), "telegram:123");
  const two = { commands: { ownerAllowFrom: ["feishu:ou_a", "feishu:ou_b"] } };
  assert.equal(resolveOwnerActor({ ...dm, config: two, deliveryContext: { to: "user:ou_b" } }), "feishu:ou_b", "DM peer picks among several owners");
  assert.equal(resolveOwnerActor({ ...group, config: two }), null, "ambiguous owners in a group are refused");
  assert.equal(resolveOwnerActor({ ...dm, config: two, deliveryContext: { to: "user:ou_stranger" } }), null, "DM with a non-owner peer is refused");
  assert.equal(resolveOwnerActor({ ...dm, config: { commands: {} } }), null);
  assert.equal(resolveOwnerActor({ ...dm, messageChannel: undefined }), null);
});

test("admin client: bearer from file, state cached for 2 s, errors surface", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-plugin-"));
  const tokenFile = path.join(dir, "token");
  fs.writeFileSync(tokenFile, "abc\n");
  const calls = [];
  let now = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization, method: init.method });
    if (url.endsWith("/v1/state")) {
      return { ok: true, status: 200, json: async () => ({ controlActive: true }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
  };
  const client = new HandoffAdminClient({ baseUrl: "http://h/", adminTokenFile: tokenFile, fetchImpl, now: () => now });
  assert.equal((await client.state()).controlActive, true);
  await client.state();
  assert.equal(calls.length, 1, "second read within 2 s served from cache");
  now = 3_000;
  await client.state();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, "Bearer abc");
  assert.equal(calls[0].url, "http://h/v1/state");
  await assert.rejects(client.status("h_x"), /404: not_found/u);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("owner list: only listed canonical actors may control from a group", () => {
  const config = { controlAnywhereActors: ["feishu:ou_owner"] };
  assert.equal(isControlAnywhereActor("feishu:ou_owner", config), true);
  assert.equal(isControlAnywhereActor("feishu:ou_other", config), false);
  assert.equal(isControlAnywhereActor("feishu:ou_owner", {}), false);
  assert.equal(isControlAnywhereActor(resolveTrustedActor({ requesterSenderId: "ou_owner", messageChannel: "feishu" }), config), true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-owners-"));
  const file = path.join(dir, "owners");
  assert.equal(isControlAnywhereActor("feishu:ou_late", { controlAnywhereActorsFile: file }), false, "missing file adds nobody");
  fs.writeFileSync(file, "# owners\nfeishu:ou_late   # added without restart\n\n");
  assert.equal(isControlAnywhereActor("feishu:ou_late", { controlAnywhereActorsFile: file }), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("private delivery goes through `openclaw message send` to the requester, never without a target", async () => {
  const calls = [];
  const runner = async (command, args) => { calls.push({ command, args }); return "{\"messageId\":\"m1\"}"; };
  await deliverPrivately({ channel: "feishu", target: "ou_owner", text: "link", command: "openclaw", runner });
  assert.equal(calls[0].command, "openclaw");
  assert.deepEqual(calls[0].args.slice(0, 6), ["message", "send", "--channel", "feishu", "--target", "ou_owner"]);
  await assert.rejects(deliverPrivately({ channel: "feishu", target: "", text: "x", runner }), /requester id/u);
  await deliverPrivately({ channel: "feishu", target: "ou_owner", text: "link", entry: "/rt/dist/index.js", runner });
  assert.equal(calls[1].command, process.execPath);
  assert.equal(calls[1].args[0], "/rt/dist/index.js");
});

test("card: login and payment cards carry the url behind 接管电脑 / 付款 buttons", async () => {
  const { handoffCard, inPlaceTarget } = await import("../core/card.js");
  const login = handoffCard({ reason: "需要你登录小红书", url: "https://h/x#t", openWithinMinutes: 10, sessionMinutes: 30 });
  const btn = login.presentation.blocks.find((b) => b.type === "buttons").buttons[0];
  assert.deepEqual([btn.label, btn.url], ["接管电脑", "https://h/x#t"]);
  assert.match(login.fallback, /https:\/\/h\/x#t/u, "fallback text still carries the link");
  assert.doesNotMatch(login.text, /https:/u, "card body does not repeat the raw url");
  assert.doesNotMatch(login.text, /分钟内打开/u, "steps live in the blocks, not duplicated in the body");
  const pay = handoffCard({ purpose: "payment", reason: "请确认付款", url: "https://h/p#t", openWithinMinutes: 10, sessionMinutes: 30, payment: { item: "Card Magic 年卡", amount: "129.00", currency: "CNY", merchant: "Makaron" } });
  assert.equal(pay.presentation.blocks.find((b) => b.type === "buttons").buttons[0].label, "付款");
  assert.match(pay.presentation.title, /Makaron/u);
  assert.match(pay.text, /129\.00 CNY/u);
  assert.match(pay.text, /商户：Makaron/u);
  assert.equal(pay.presentation.tone, "warning");
  assert.equal(handoffCard({ kind: "watch", url: "https://h/w", openWithinMinutes: 10, sessionMinutes: 30 }).presentation.blocks.at(-1).buttons[0].label, "观看桌面");
  assert.deepEqual(login.presentation.blocks.map((b) => b.type), ["context", "buttons"]);
  assert.deepEqual(inPlaceTarget({ messageChannel: "feishu", deliveryContext: { to: "chat:oc_1", accountId: "default" } }), { channel: "feishu", target: "chat:oc_1", accountId: "default" });
  assert.equal(inPlaceTarget({ messageChannel: "webchat", deliveryContext: { to: "x" } }), null, "no card outside card channels");
  assert.equal(inPlaceTarget({ messageChannel: "feishu" }), null, "no conversation, no card");
});

test("card delivery passes --presentation to openclaw message send", async () => {
  const calls = [];
  await deliverPrivately({ channel: "feishu", target: "user:ou_1", text: "fb", presentation: { title: "t", blocks: [] }, command: "openclaw", runner: async (cmd, args) => { calls.push(args); return "{}"; } });
  const args = calls[0];
  assert.equal(args[args.indexOf("--presentation") + 1], JSON.stringify({ title: "t", blocks: [] }));
  assert.equal(args[args.indexOf("--target") + 1], "user:ou_1");
});

test("end: the agent cannot revoke a handoff a person is connected to or controlling", async () => {
  const { refuseEnd } = await import("../core/policy.js");
  assert.match(refuseEnd({ ended: false, controlActive: true, connectedViewers: 1 }), /Refused: a person is connected to this handoff and controlling/u);
  assert.match(refuseEnd({ ended: false, controlActive: false, connectedViewers: 1 }), /Refused/u, "a connected viewer is enough");
  assert.equal(refuseEnd({ ended: false, controlActive: false, connectedViewers: 0 }), null, "unused handoff may be revoked");
  assert.equal(refuseEnd({ ended: true, controlActive: true, connectedViewers: 1 }), null, "already ended");
});

test("hand back: 接管电脑 and 交还给 V are mutually exclusive and wake V once per takeover", async () => {
  const { decideHandBack } = await import("../core/policy.js");
  assert.equal(decideHandBack(null).action, "noop");
  assert.equal(decideHandBack({ claims: 0, controlActive: false }).action, "noop", "never opened: nothing to hand back");
  assert.equal(decideHandBack({ claims: 1, controlActive: true }).action, "release");
  assert.equal(decideHandBack({ claims: 1, controlActive: true }, { alreadyHandedBack: true }).action, "release", "a new takeover is always released");
  assert.equal(decideHandBack({ claims: 1, controlActive: false }).action, "resume", "page closed or released there: V still gets woken");
  assert.equal(decideHandBack({ claims: 1, controlActive: false }, { alreadyHandedBack: true }).action, "noop", "second click does nothing");
});

test("card: control cards carry 接管电脑 + 交还给 V (callback), watch cards only the link", async () => {
  const { handoffCard } = await import("../core/card.js");
  const card = handoffCard({ reason: "登录携程", url: "https://h/x#t", openWithinMinutes: 10, sessionMinutes: 30, handoffId: "h_abc" });
  const buttons = card.presentation.blocks.find((b) => b.type === "buttons").buttons;
  assert.deepEqual(buttons.map((b) => b.label), ["接管电脑", "交还给 V"]);
  assert.equal(buttons[0].url, "https://h/x#t");
  assert.equal(buttons[1].value, "/v-handback h_abc");
  assert.equal(buttons[1].url, undefined, "交还给 V opens nothing");
  const pay = handoffCard({ purpose: "payment", url: "https://h/p", openWithinMinutes: 10, sessionMinutes: 30, handoffId: "h_p" });
  assert.deepEqual(pay.presentation.blocks.at(-1).buttons.map((b) => b.label), ["付款", "交还给 V"]);
  const watch = handoffCard({ kind: "watch", url: "https://h/w", openWithinMinutes: 10, sessionMinutes: 30, handoffId: "h_w" });
  assert.deepEqual(watch.presentation.blocks.at(-1).buttons.map((b) => b.label), ["观看桌面"]);
});

test("native card: 接管 / 我完成了 / 跳过 while pending, swaps buttons as the state changes", async () => {
  const { nativeHandoffCard, quickCommand } = await import("../core/native-card.js");
  const base = { reason: "登录携程", url: "https://h/x#t", imageKey: "img_1", handoffId: "h_1", owner: { userOpenId: "ou_me", expiresAt: 5 } };
  const buttonsOf = (card) => JSON.stringify(card).match(/"content":"(接管|我完成了|跳过|回到电脑|付款|观看)"/gu)?.map((m) => m.split('"')[3]) ?? [];
  const pending = nativeHandoffCard({ ...base, state: "pending" });
  assert.equal(pending.header.title.content, "电脑");
  assert.equal(pending.header.text_tag_list[0].text.content, "需要操作");
  assert.equal(pending.config.update_multi, true, "the card can be patched later");
  assert.ok(pending.body.elements.some((e) => e.tag === "img" && e.img_key === "img_1"));
  assert.deepEqual(buttonsOf(pending), ["接管", "我完成了", "跳过"]);
  const take = JSON.stringify(pending);
  assert.ok(take.includes('"default_url":"https://h/x#t"') && take.includes('"q":"/v-takeover h_1"'), "接管 opens the desktop and reports the takeover");
  assert.ok(take.includes('"q":"/v-handback h_1"') && take.includes('"q":"/v-skip h_1"'));
  assert.deepEqual(quickCommand("/x", { userOpenId: "ou_me", expiresAt: 5 }).c, { u: "ou_me", e: 5 }, "only the owner can press");
  const active = nativeHandoffCard({ ...base, state: "active" });
  assert.equal(active.header.text_tag_list[0].text.content, "操作中");
  assert.deepEqual(buttonsOf(active), ["我完成了", "回到电脑"], "接管 is gone once taken over");
  for (const [state, tag] of [["done", "已完成"], ["skipped", "已跳过"], ["ended", "已结束"]]) {
    const card = nativeHandoffCard({ ...base, state });
    assert.equal(card.header.text_tag_list[0].text.content, tag);
    assert.deepEqual(buttonsOf(card), [], `${state} has no buttons`);
  }
  assert.deepEqual(buttonsOf(nativeHandoffCard({ ...base, purpose: "payment", state: "pending" })).slice(0, 1), ["付款"]);
  assert.ok(!nativeHandoffCard({ ...base, imageKey: null }).body.elements.some((e) => e.tag === "img"), "no picture, no img element");
});

test("feishu api: credentials, receivers, token cache, send and patch", async () => {
  const { FeishuApi, feishuCredentials, feishuReceiver } = await import("../core/feishu-api.js");
  assert.deepEqual(feishuCredentials({ channels: { feishu: { appId: "a", appSecret: "s", domain: "feishu" } } }), { appId: "a", appSecret: "s", host: "https://open.feishu.cn" });
  assert.equal(feishuCredentials({ channels: { feishu: { appId: "a", appSecret: { source: "env" } } } }), null, "unresolved secret refs are not used");
  assert.equal(feishuCredentials({ channels: { feishu: { appId: "a", appSecret: "s", accounts: { b: { appId: "b", appSecret: "t" } } } } }, "b").appId, "b");
  assert.deepEqual(feishuReceiver("user:ou_1"), { receiveIdType: "open_id", receiveId: "ou_1" });
  assert.deepEqual(feishuReceiver("chat:oc_1"), { receiveIdType: "chat_id", receiveId: "oc_1" });
  assert.equal(feishuReceiver("webchat:x"), null);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([init.method, url.replace("https://h", "")]);
    if (url.endsWith("/tenant_access_token/internal")) return { ok: true, status: 200, json: async () => ({ code: 0, tenant_access_token: "t", expire: 7200 }) };
    if (init.method === "POST" && url.includes("/im/v1/messages")) return { ok: true, status: 200, json: async () => ({ code: 0, data: { message_id: "om_1" } }) };
    return { ok: true, status: 200, json: async () => ({ code: 0, data: {} }) };
  };
  const api = new FeishuApi({ appId: "a", appSecret: "s", host: "https://h", fetchImpl });
  assert.equal(await api.sendCard({ receiveIdType: "open_id", receiveId: "ou_1" }, { schema: "2.0" }), "om_1");
  await api.patchCard("om_1", { schema: "2.0" });
  assert.deepEqual(calls.map((c) => c.join(" ")), [
    "POST /open-apis/auth/v3/tenant_access_token/internal",
    "POST /open-apis/im/v1/messages?receive_id_type=open_id",
    "PATCH /open-apis/im/v1/messages/om_1",
  ], "token fetched once and reused");
  const failing = new FeishuApi({ appId: "a", appSecret: "s", host: "https://h", fetchImpl: async (url) => (url.endsWith("internal") ? { ok: true, json: async () => ({ code: 0, tenant_access_token: "t" }) } : { ok: true, status: 200, json: async () => ({ code: 230002, msg: "bot not in chat" }) }) });
  await assert.rejects(failing.sendCard({ receiveIdType: "chat_id", receiveId: "oc_1" }, {}), /230002 bot not in chat/u);
});
