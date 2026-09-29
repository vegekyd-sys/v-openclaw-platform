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
