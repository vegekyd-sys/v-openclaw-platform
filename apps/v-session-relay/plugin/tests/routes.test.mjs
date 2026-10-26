// §2.a routes, transport choice and the chain-root sender rule.
import assert from "node:assert/strict";
import { test } from "node:test";

import { newChainId, newSendId, validateRoute, validateStartRequest } from "../core/contracts.js";
import { isUnsupportedRequester, isUnsupportedTarget, ownerIdsFor, parseSessionKey } from "../core/labels.js";
import { sendStartRequest, wakeStartRequest } from "../core/requests.js";
import { createRoutes, deliveryOf, deriveRoute, senderFor } from "../core/routes.js";
import { createBridgeTransport } from "../core/transports/bridge.js";
import { createFakeBridge } from "./fixtures/fake-bridge.mjs";

const OWNER = "ou_0123456789abcdef0123456789abcdef";
const OC = "oc_0123456789abcdef0123456789abcdef";
const cfg = { commands: { ownerAllowFrom: [`feishu:${OWNER}`, "telegram:5368086561"] } };

test("routes: session keys and unsupported requesters / targets", () => {
  assert.deepEqual(parseSessionKey(`agent:makaron:feishu:group:${OC}`), { key: `agent:makaron:feishu:group:${OC}`, agentId: "makaron", kind: "channel", channel: "feishu", chatType: "group", peer: OC });
  assert.equal(parseSessionKey("agent:makaron:main").kind, "main");
  assert.equal(parseSessionKey("agent:makaron:dingtalk:dm:abc").chatType, "direct");
  assert(isUnsupportedRequester("agent:makaron:subagent:x"));
  assert(isUnsupportedRequester("agent:makaron:cron:daily"));
  assert(isUnsupportedRequester("hook:gmail"));
  assert(!isUnsupportedRequester("agent:makaron:main"));
  assert(isUnsupportedTarget("agent:makaron:feishu:group:oc_1:run:abc"));
  assert(!isUnsupportedTarget(`agent:makaron:feishu:group:${OC}`));
  assert.deepEqual(ownerIdsFor(cfg, "feishu"), [OWNER]);
  assert.deepEqual(ownerIdsFor(cfg, "dingtalk"), []);
});

test("routes: derived routes per channel (§2.a table)", () => {
  const fg = deriveRoute({ sessionKey: `agent:makaron:feishu:group:${OC}`, ownerIds: [OWNER] });
  assert.deepEqual(fg.route, { channel: "feishu", accountId: "default", to: `chat:${OC}`, chatId: OC, chatType: "group", humans: "unknown" });
  assert(validateRoute(fg.route).ok);
  const fd = deriveRoute({ sessionKey: `agent:makaron:feishu:direct:${OWNER}`, ownerIds: [OWNER] });
  assert.equal(fd.route.humans, "owner_only");
  assert.equal(fd.route.peerId, OWNER);
  assert.equal(deriveRoute({ sessionKey: "agent:makaron:feishu:group:OC_NOT_HEX" }).code, "NO_ROUTE");
  assert.equal(deriveRoute({ sessionKey: "agent:makaron:telegram:group:-1001" }).route.humans, "shared");
  assert.equal(deriveRoute({ sessionKey: "agent:makaron:dingtalk:group:cidabc" }).code, "NO_ROUTE", "DingTalk keys are lower-cased; only a stored to works");
  assert.equal(deriveRoute({ sessionKey: "agent:makaron:wecom:group:wr1" }).code, "NO_ROUTE");
  const stored = deriveRoute({ sessionKey: "agent:makaron:dingtalk:group:cidabc", delivery: { channel: "dingtalk", to: "cidAbC==", accountId: "Main" } });
  assert.deepEqual(stored.route, { channel: "dingtalk", accountId: "main", to: "cidAbC==", chatId: "cidAbC==", chatType: "group", humans: "shared" });
  assert.equal(deliveryOf({ delivery: { kind: "external", context: { channel: "feishu", to: "user:x" } } }).to, "user:x");
  assert.equal(deliveryOf({ delivery: { kind: "internal" } }), undefined);
});

test("routes: bridge when registered, agent transport otherwise, channel-less sessions have no route", async () => {
  const registry = { v: 1, bridges: new Map(), listeners: new Set() };
  const fake = createFakeBridge({ channel: "feishu", routes: { [`agent:makaron:feishu:group:${OC}`]: { channel: "feishu", accountId: "default", to: `chat:${OC}`, chatId: OC, chatType: "group", humans: "owner_only", label: "任务群 a" } } });
  fake.register(registry);
  const bt = createBridgeTransport({ registry });
  const entries = { "agent:makaron:telegram:direct:5368086561": { delivery: { kind: "external", context: { channel: "telegram", to: "5368086561", accountId: "default" } } } };
  const routes = createRoutes({ getSessionEntry: ({ sessionKey }) => entries[sessionKey], getConfig: () => cfg, bridges: bt.bridges });

  const viaBridge = await routes.resolve({ sessionKey: `agent:makaron:feishu:group:${OC}`, agentId: "makaron" });
  assert.equal(viaBridge.transport, "bridge");
  assert.equal(viaBridge.bridgeKey, "feishu:default");
  assert.equal(viaBridge.route.label, "任务群 a");
  assert.deepEqual(fake.callsOf("resolveRoute")[0].args.ownerIds, [OWNER]);
  assert.equal(routes.label({ sessionKey: `agent:makaron:feishu:group:${OC}`, route: viaBridge.route }), "任务群 a");

  const tg = await routes.resolve({ sessionKey: "agent:makaron:telegram:direct:5368086561", agentId: "makaron" });
  assert.equal(tg.transport, "agent");
  assert.equal(tg.route.humans, "owner_only");
  const main = await routes.resolve({ sessionKey: "agent:makaron:main", agentId: "makaron" });
  assert.deepEqual([main.ok, main.transport, main.route], [true, "agent", null]);
  const dt = await routes.resolve({ sessionKey: "agent:makaron:dingtalk:group:cidx", agentId: "makaron" });
  assert.deepEqual([dt.ok, dt.code], [false, "NO_ROUTE"]);

  fake.setRoute(`agent:makaron:feishu:group:oc_gone`, { ok: false, code: "CHAT_GONE", reason: "dissolved" });
  const gone = await routes.resolve({ sessionKey: "agent:makaron:feishu:group:oc_gone", agentId: "makaron" });
  assert.deepEqual([gone.ok, gone.code], [false, "CHAT_GONE"]);
  // An invalid bridge is ignored (agent transport), never trusted.
  registry.bridges.set("feishu:broken", { v: 1, channel: "feishu", accountId: "broken" });
  assert.equal(bt.get("feishu:broken"), undefined);
});

test("routes: bridge transport waits for a bridge to register (bounded)", async (t) => {
  const keepAlive = setInterval(() => {}, 1_000); // the transport's own timer is unref()'d
  t.after(() => clearInterval(keepAlive));
  const registry = { v: 1, bridges: new Map(), listeners: new Set() };
  const bt = createBridgeTransport({ registry });
  const fake = createFakeBridge({ channel: "telegram" });
  const waiting = bt.waitFor("telegram:default", 1000);
  setTimeout(() => fake.register(registry), 20);
  assert.equal(await waiting, fake);
  assert.equal(await bt.waitFor("feishu:default", 30), null);
  assert.equal(registry.listeners.size, 0);
});

test("routes: chain-root sender rule (§2.a) never borrows the peer or the owner wrongly", () => {
  const chainId = newChainId();
  const group = { channel: "feishu", accountId: "default", to: `chat:${OC}`, chatId: OC, chatType: "group", humans: "unknown" };
  const owner = { channel: "telegram", id: "5368086561", name: "Tianyi", isOwner: true };
  const a = senderFor({ route: group, principal: owner, chainId, fromLabel: "Tianyi 私聊", cfg });
  assert.deepEqual(a, { sender: { id: OWNER, isOwnerIdentity: true, name: "「Tianyi 私聊」的 V（会话协作）" }, routePeerId: OWNER, askUserAnswererId: OWNER });
  const stranger = { channel: "feishu", id: "ou_stranger", name: "", isOwner: false };
  const b = senderFor({ route: group, principal: stranger, chainId, fromLabel: "一个私聊", cfg });
  assert.deepEqual(b.sender, { id: "ou_stranger", isOwnerIdentity: false, name: "「一个私聊」的 V（会话协作）" });
  assert.equal(b.askUserAnswererId, "ou_stranger");
  const elsewhere = { channel: "dingtalk", id: "staff1", isOwner: false };
  const c = senderFor({ route: group, principal: elsewhere, chainId, fromLabel: "钉钉群", cfg });
  assert.deepEqual(c.sender, { id: `v-a2a:${chainId}`, isOwnerIdentity: false, name: "「钉钉群」的 V（会话协作）" });
  assert.equal(c.routePeerId, OWNER, "routing only; never the permission identity");
  // DingTalk has no owner id: an owner chain from Feishu gets a synthetic, non-owner sender there.
  const dtRoute = { channel: "dingtalk", accountId: "default", to: "cid", chatId: "cid", chatType: "group", humans: "shared" };
  const d = senderFor({ route: dtRoute, principal: { channel: "feishu", id: OWNER, isOwner: true }, chainId, fromLabel: "x", cfg });
  assert.equal(d.sender.isOwnerIdentity, false);
  assert.equal(d.sender.id, `v-a2a:${chainId}`);
  assert.equal(d.askUserAnswererId, undefined);
  const dm = { channel: "feishu", accountId: "default", to: "user:ou_peer", chatId: "ou_peer", chatType: "direct", peerId: "ou_peer", humans: "single_peer" };
  assert.equal(senderFor({ route: dm, principal: owner, chainId, fromLabel: "x", cfg }).routePeerId, "ou_peer");
});

test("requests: StartRequests built for every kind pass the frozen validator", () => {
  const chainId = newChainId();
  const sendId = newSendId();
  const route = { channel: "feishu", accountId: "default", to: `chat:${OC}`, chatId: OC, chatType: "group", humans: "owner_only", label: "任务群 a" };
  const principal = { channel: "feishu", id: OWNER, name: "Tianyi", isOwner: true };
  const rec = {
    sendId, code: "7F3A", chainId, depth: 1, kind: "request", principal,
    requester: { sessionKey: `agent:makaron:feishu:direct:${OWNER}`, label: "Tianyi 私聊", channel: "feishu" },
    target: { sessionKey: `agent:makaron:feishu:group:${OC}`, agentId: "makaron", label: "任务群 a" },
    message: { text: "写上线通知" },
  };
  const identity = senderFor({ route, principal, chainId, fromLabel: "Tianyi 私聊", cfg });
  for (const kind of ["request", "ask", "collect"]) {
    const req = sendStartRequest({ rec: { ...rec, kind: kind === "collect" ? "request" : kind }, kind, attempt: 2, route, anchorMessageId: "om_1", identity, ownerName: "Tianyi", maxDepth: 2 });
    const v = validateStartRequest(req);
    assert(v.ok, `${kind}: ${v.errors.join("; ")}`);
    assert.equal(req.runId, `v-a2a-${{ request: "req", ask: "ask", collect: "col" }[kind]}-${sendId}-2`);
    assert.equal(req.provenance.originSessionId, `v-a2a:${chainId}:1:${{ request: "req", ask: "ask", collect: "col" }[kind]}:${sendId}`);
    assert(!("GroupSystemPrompt" in req));
  }
  const batch = { batchId: "b_mvgabcdef0123456789", chainId, depth: 0, createdAt: Date.now(), requester: { sessionKey: rec.requester.sessionKey, agentId: "makaron" } };
  const wakeRoute = { channel: "feishu", accountId: "default", to: `user:${OWNER}`, chatId: OWNER, chatType: "direct", peerId: OWNER, humans: "owner_only" };
  const wakeId = senderFor({ route: wakeRoute, principal, chainId, fromLabel: "任务群 a", cfg });
  const wake = wakeStartRequest({ batch, members: [{ ...rec, phase: "result_ready", result: { text: "ok" } }], attempt: 0, route: wakeRoute, anchorMessageId: "om_h", identity: wakeId, ownerName: "Tianyi", principal });
  const v = validateStartRequest(wake);
  assert(v.ok, v.errors.join("; "));
  assert.match(wake.promptText, /^\[会话协作结果\]/u);
});
