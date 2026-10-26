// R2 candidate, DingTalk (docs/inter-session/design.md §10.5): sessions_send between DingTalk
// chats end to end, on V's bytes + the whole inter-session release (plan `files`; the connector
// project in this runtime is V's, byte for byte), the v-session-relay 2.0 plugin, V's workspace, the
// Worker pool and real DeepSeek turns, against the loopback fake open platform
// (lab/candidate/dingtalk-fake-open-api.mjs; nothing reaches DingTalk).
//
// candowner writes in his DingTalk DM (the requester); targets are two DingTalk groups:
//   GA (worker): F2, F3, X403, C, F5      GV (vds): F1
// DingTalk extras (§10.5): the AI card is created only after onAgentRunStart (F2; F3 BUSY makes
// none), a 403 on AI card creation falls back to a proactive robot message (X403), no inter-session
// turn ever posts to a session webhook (WEBHOOK), no Invalid URL / ECONNREFUSED in the log.
//
// Harness: the Stream endpoint comes from config (`endpoint`); the connector's other hosts are
// pointed at the fake in its non-bridge chunks and in dingtalk-stream (the bridge chunks
// connection-DCvu-l09.mjs / message-handler-BUoLSylZ.mjs stay byte-equal to the release).
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import {
  AGENT, BAD_LOG_RE, DINGTALK_PLUGIN, DINGTALK_PROJECT, Gateway, MODELS, allowRelocatedPlugins, applyWorkspace, contracts, createRpc, createRun,
  finish, freeBytes, historyAt, ledgerOf, rawMessages, runScenario, sendEvidence, sessionKeys, sha256, sleep, verifyOverlay, waitSend, writeConfig,
} from "./inter-session-r2-lib.mjs";
import { C, F1, F2, F3, F5, helpers } from "./inter-session-r2-scenarios.mjs";
import { createFakeDingTalkOpenApi } from "./dingtalk-fake-open-api.mjs";

const ctx = createRun("dingtalk");
const { tag: TAG, check, evidence } = ctx;
const USER = "candowner";
const CHATS = {
  dm: { user: USER, cid: `cidDirect${USER}` },
  ga: { cid: "cidGrpRoomA0isr2", title: "VLab 测试｜钉钉房间 A" },
  gv: { cid: "cidGrpRoomV0isr2", title: "VLab 测试｜钉钉房间 V" },
};
const START_DELAY_MS = Number(process.env.ISR2_START_DELAY_MS ?? 6000);
const SCENARIOS = (process.env.ISR2_SCENARIOS ?? "F1,F2,F3,X403,C,F5").split(",").map((s) => s.trim()).filter(Boolean);
const BRIDGE_FILES = ["connection-DCvu-l09.mjs", "message-handler-BUoLSylZ.mjs", "v-experience.mjs"];

const ledger = ledgerOf(ctx);
const pluginDir = path.join(ctx.runtime, DINGTALK_PLUGIN);
const { WebSocketServer } = createRequire(path.join(ctx.runtime, DINGTALK_PROJECT, "node_modules", "noop.js"))("ws");
const fake = createFakeDingTalkOpenApi({ WebSocketServer });
let gw;
let rpc;

// ---------------------------------------------------------------- what the chats show
const inChat = (name, { openConversationId, userIds, openSpaceId, conversationId } = {}) => {
  const c = CHATS[name];
  if (openSpaceId !== undefined) return c.user ? openSpaceId === `dtv1.card//IM_ROBOT.${c.user}` : openSpaceId === `dtv1.card//IM_GROUP.${c.cid}`;
  if (c.user && Array.isArray(userIds)) return userIds.includes(c.user);
  if (openConversationId !== undefined) return openConversationId === c.cid;
  if (conversationId !== undefined) return conversationId === c.cid;
  return false;
};
const robotText = (m) => String(m.msgParam?.text ?? m.msgParam?.content ?? m.msgParam?.title ?? JSON.stringify(m.msgParam ?? {}));
function items(name, since = 0) {
  const out = [];
  for (const m of fake.robotMessages) if (m.at >= since && inChat(name, m)) out.push({ id: m.processQueryKey, at: m.at, kind: "robot", text: robotText(m), history: [{ at: m.at, op: "send", text: robotText(m) }] });
  for (const c of fake.cards()) {
    if (c.createdAt < since) continue;
    const space = c.delivered?.openSpaceId;
    if (space ? !inChat(name, { openSpaceId: space }) : false) continue;
    out.push({ id: c.outTrackId, at: c.createdAt, kind: space ? "card" : "card-undelivered", text: String(c.content ?? ""), status: c.status, history: c.history.map((x) => ({ at: x.at, op: x.op, text: x.content })) });
  }
  fake.webhookMessages.forEach((m, i) => { if (m.at >= since && inChat(name, { conversationId: m.conversationId })) out.push({ id: `webhook-${i}`, at: m.at, kind: "webhook", text: String(m.text ?? ""), history: [{ at: m.at, op: "webhook", text: m.text }] }); });
  return out.sort((a, b) => a.at - b.at);
}
/** Every visible write in a chat in [from, to]: card create/stream/update/deliver, robot sends, webhook posts, emotions. */
function writes(name, from, to) {
  const out = [];
  const cardChat = new Map(fake.cards().map((c) => [c.outTrackId, c.delivered?.openSpaceId]));
  for (const call of fake.calls) {
    if (call.at < from || call.at > to || call.method === "WS") continue;
    const b = call.body ?? {};
    if (/\/v1\.0\/card\/(instances|streaming)/u.test(call.path)) {
      const space = b.openSpaceId ?? cardChat.get(b.outTrackId);
      if (!space || inChat(name, { openSpaceId: space })) out.push({ at: call.at, what: `${call.method} ${call.path}`, itemId: b.outTrackId ?? null });
    } else if (/robot\/(groupMessages|oToMessages)/u.test(call.path)) {
      if (inChat(name, b)) out.push({ at: call.at, what: call.path, itemId: fake.robotMessages.find((m) => Math.abs(m.at - call.at) < 300 && m.msgKey === b.msgKey && inChat(name, m))?.processQueryKey ?? null });
    } else if (/emotion/u.test(call.path)) {
      if (inChat(name, { conversationId: b.openConversationId })) out.push({ at: call.at, what: call.path, itemId: b.openMsgId ?? null });
    }
  }
  fake.webhookMessages.forEach((m, i) => { if (m.at >= from && m.at <= to && inChat(name, { conversationId: m.conversationId })) out.push({ at: m.at, what: "sessionWebhook", itemId: `webhook-${i}` }); });
  return out;
}

const ad = {
  // V's connector account is "__default__" (the bridge also answers to "dingtalk:default").
  name: "dingtalk", bridgeKey: "dingtalk:__default__", streaming: true, replyAnchor: false,
  keys: {}, chats: { dm: "dm", ga: "ga", gv: "gv" },
  person(name, text) {
    const c = CHATS[name];
    const r = fake.sendUserText({ userId: USER, text, group: !c.user, conversationId: c.cid, ...(c.title ? { conversationTitle: c.title } : {}) });
    return { at: r.at, id: r.msgId };
  },
  items, writes,
  anchorId: (m) => String(m.id),
  extra: {
    F1: async (env, { id, t0, rec }) => noPlaceholder(env, id, t0, rec, ["dm", "gv"]),
    F3: async (env, { id, t0, rec }) => noPlaceholder(env, id, t0, rec, ["dm"]),
    F2: async (env, { id, t0, rec, targetFinal }) => {
      await noPlaceholder(env, id, t0, rec, ["dm", "ga"]);
      const startingAt = historyAt(rec, /^starting/u);
      const card = targetFinal.find((m) => m.kind === "card");
      check(id, Boolean(card), "the target answered in an AI card", targetFinal.map((m) => ({ kind: m.kind, text: m.text.slice(0, 80) })));
      check(id, card && card.at >= startingAt + START_DELAY_MS - 300, "the AI card was created after the bridge started the turn (onAgentRunStart), not before", { cardAt: card?.at, startCallAt: startingAt + START_DELAY_MS });
      check(id, card && card.history.filter((x) => x.op === "stream" || x.op === "update").length >= 2, "the AI card streamed (several updates)", card?.history?.map((x) => x.op));
    },
  },
};

// The connector's empty-final fallbacks (utils-D0ALDrCn.mjs): a group gets an ops hint, a direct chat a filler line.
const PLACEHOLDER = /暂未收到模型回复内容|visibleReplies|好的 👌 有其他问题随时找我/u;
const DT_LOG = /\[DingTalk\]\[(deliver|closeStreaming|startStreaming|onReplyStart|onIdle|onError|idleNudge|asyncMode|inter-session)\]|final 响应无文本|累积文本为空|默认提示文案|NO_REPLY|silent|announce|followup|lifecycle/u;
/** No empty-final fallback card or message in these chats since t0; logs and transcripts kept as evidence. */
async function noPlaceholder(env, id, t0, rec, names) {
  const hits = names.flatMap((n) => items(n, t0).filter((m) => PLACEHOLDER.test(m.text)).map((m) => ({ chat: n, kind: m.kind, at: new Date(m.at).toISOString().slice(11, 23), ops: m.history.map((x) => x.op).join(","), text: m.text.slice(0, 60) })));
  evidence(id, "dingtalkLog", env.gw.logSince(t0, DT_LOG).filter((l) => !/textLength=\d+, hasText=true|block 更新到 AI Card/u.test(l)).slice(-60));
  for (const n of names) evidence(id, `raw:${n}`, (await rawMessages(env.rpc, ad.keys[n], 14)).filter((m) => (m.at ?? 0) >= t0 - 2000));
  check(id, hits.length === 0, "no empty-reply fallback card/message (「暂未收到模型回复内容」/「好的 👌 有其他问题随时找我」) in the chats involved", hits);
}

// ---------------------------------------------------------------- main
async function main() {
  verifyOverlay(ctx);
  const manifest = JSON.parse(fs.readFileSync("lab/release-files/dingtalk-inter-session-bridge/manifest.json", "utf8"));
  const apiPort = await fake.listen();
  const fakeBase = `http://127.0.0.1:${apiPort}`;
  // Harness: every DingTalk host of the connector (outside the bridge chunks) and of dingtalk-stream → the fake.
  const rewritten = [];
  const dist = path.join(pluginDir, "dist");
  const targets = [
    ...fs.readdirSync(dist).filter((f) => f.endsWith(".mjs") && !BRIDGE_FILES.includes(f)).map((f) => path.join(dist, f)),
    ...["constants.mjs", "constants.cjs"].map((f) => path.join(ctx.runtime, DINGTALK_PROJECT, "node_modules", "dingtalk-stream", "dist", f)),
  ];
  for (const file of targets) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    const next = src.replaceAll("https://api.dingtalk.com", fakeBase).replaceAll("https://oapi.dingtalk.com", fakeBase);
    if (next !== src) { fs.writeFileSync(file, next); rewritten.push(path.relative(ctx.runtime, file).split("/").slice(-2).join("/")); }
  }
  ctx.summary.harnessPatches = [{ what: "DingTalk hosts → loopback fake (non-bridge chunks + dingtalk-stream)", files: rewritten }];
  for (const f of manifest.files) {
    const bytes = fs.readFileSync(path.join(pluginDir, f.path));
    assert.equal(sha256(bytes), f.after, `${f.path} is the release bytes`);
    assert(!bytes.includes(fakeBase), `${f.path} was not rewritten`);
  }
  allowRelocatedPlugins(ctx, ["dingtalk-connector"]);
  await applyWorkspace(ctx);
  const { port, token } = writeConfig(ctx, {
    channels: {
      "dingtalk-connector": {
        enabled: true, clientId: "dingcandidate", clientSecret: "candidate-fake-secret", endpoint: fakeBase,
        dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"], requireMention: true,
        groupReplyMode: "aicard", typingIndicator: true, separateSessionByConversation: true, groupSessionScope: "group",
        resolveSenderNames: false, enableMediaUpload: false, debug: true,
      },
    },
    channelPlugins: ["dingtalk-connector"],
    loadPaths: [pluginDir],
    ownerAllowFrom: ["feishu:ou_775a78b0aaae67da5e15eeaf102e3cd9", "telegram:5368086561"],
    vds: true,
    mutate: (config) => { config.messages = { ...(config.messages ?? {}), groupChat: { ...(config.messages?.groupChat ?? {}), visibleReplies: "automatic" } }; },
  });
  gw = new Gateway(ctx, { port, env: { VSR_TEST_START_DELAY_MS: String(START_DELAY_MS) } });
  rpc = createRpc(ctx, { port, token });
  ctx.summary.harness.startDelayMs = START_DELAY_MS;
  ctx.summary.harness.freeBytesAtStart = freeBytes(ctx.data);
  gw.start();
  await gw.waitFor(() => fake.connected(), 600_000, "DingTalk Stream connection");
  await gw.waitFor(() => gw.lines.some((l) => /v-session-relay 2\.0 started/u.test(l.line)), 300_000, "v-session-relay started");
  await sleep(4000);
  const env = { ctx, gw, rpc, ledger, ad, startDelayMs: START_DELAY_MS };
  const h = helpers(env);

  // ---- seeds: the three sessions exist with a stored delivery address; GV then runs on vds
  for (const [name, re] of [["dm", "SEED_DM"], ["ga", "SEED_A"], ["gv", "SEED_V"]]) {
    const t = Date.now();
    ad.person(name, `【${TAG} 准备】这是自动化测试，只回复 ${re}_${TAG}`);
    await h.waitItem(name, t, new RegExp(`${re}_${TAG}`), 300_000, `${name} seed reply`);
  }
  const keys = (await sessionKeys(rpc)).filter((k) => /dingtalk/u.test(k));
  ad.keys.dm = keys.find((k) => /:direct:/u.test(k) && k.toLowerCase().includes(USER));
  ad.keys.ga = keys.find((k) => k.toLowerCase().includes(CHATS.ga.cid.toLowerCase()));
  ad.keys.gv = keys.find((k) => k.toLowerCase().includes(CHATS.gv.cid.toLowerCase()));
  ctx.summary.harness.keys = { all: keys, ...ad.keys };
  assert(ad.keys.dm && ad.keys.ga && ad.keys.gv, `DingTalk session keys not found: ${JSON.stringify(keys)}`);
  ctx.summary.harness.gvPatch = await rpc("sessions.patch", { key: ad.keys.gv, agentId: AGENT, model: MODELS.vds }).then(() => "ok", (e) => `failed: ${String(e?.message ?? e).slice(0, 200)}`);
  {
    const t = Date.now();
    ad.person("gv", `【${TAG} 准备 vds】这是自动化测试，只回复 SEED_VDS_${TAG}`);
    await h.waitItem("gv", t, new RegExp(`SEED_VDS_${TAG}`), 420_000, "gv vds seed reply");
  }
  ctx.step("seeded", ad.keys);

  if (SCENARIOS.includes("F1")) await F1(env, { target: "gv" });
  if (SCENARIOS.includes("F2")) await F2(env, { target: "ga" });
  if (SCENARIOS.includes("F3")) await F3(env, { target: "ga" });

  // ---------------------------------------------------------------- X403: AI card creation refused → proactive
  if (SCENARIOS.includes("X403")) await runScenario(ctx, "X403", async () => {
    const id = "X403";
    await h.idle(ad.keys.ga);
    const t0 = Date.now();
    const result = `X403_RESULT_${TAG}`;
    h.ask(`【跨会话测试 ${TAG}-${id}】这是自动化测试，请严格照做：调用一次 sessions_send 工具，参数 sessionKey="${ad.keys.ga}"，timeoutSeconds=0，message="【${TAG}-${id}】这是自动化测试，请只回复 ${result}"。工具返回后只回复一句「已交出」，然后立刻结束本轮。结果回来时，把对方的回复告诉我（必须包含 ${result}）。`);
    const first = await waitSend(gw, ledger, t0, (r) => r.target?.sessionKey === ad.keys.ga, 300_000, `${id} send`);
    for (const until = Date.now() + 180_000; Date.now() < until; await sleep(40)) if (["starting", "running"].includes(ledger.send(first.sendId)?.phase)) break;
    // Every AI card for this group is refused while the target turn runs (other chats' cards are not).
    const armedAt = Date.now();
    const toGroup = (b) => b?.openSpaceId === `dtv1.card//IM_GROUP.${CHATS.ga.cid}`;
    fake.failRoute("POST /v1.0/card/instances/deliver", { status: 403, times: 1000, when: toGroup });
    fake.failRoute("POST /v1.0/card/instances/createAndDeliver", { status: 403, times: 1000, when: toGroup });
    const done = await h.settled(first.sendId, ["target_done", "result_ready", "failure_ready", "handed_back", "cancelled", "skipped"], 420_000, `${id} target done`);
    await sleep(2000);
    fake.failRoute("POST /v1.0/card/instances/deliver", { times: 0 });
    fake.failRoute("POST /v1.0/card/instances/createAndDeliver", { times: 0 });
    const rec = await h.settled(first.sendId, ["handed_back", "cancelled", "skipped"], 420_000, `${id} handed back`);
    const hb = await gw.waitFor(() => h.handbacks(t0, rec.code)[0], 120_000, `${id} hand-back`);
    const wake = await h.waitItem("dm", hb.at, new RegExp(result), 300_000, `${id} wake reply`).catch(() => null);
    await sleep(4000);
    const run = { from: rec.targetRun.startedAt - 1000, to: (rec.targetRun.endedAt ?? Date.now()) + 3000 };
    const refused = fake.calls.filter((c) => c.at >= armedAt && c.failed === 403);
    const proactive = items("ga", t0).filter((m) => m.kind === "robot" && m.text.includes(result));
    const groupCards = items("ga", t0).filter((m) => m.kind === "card" && m.text.includes(result));
    const hooks = writes("ga", run.from, run.to).filter((w) => w.what === "sessionWebhook");
    evidence(id, "send", sendEvidence(rec));
    evidence(id, "refused", refused.map((c) => `${new Date(c.at).toISOString().slice(11, 23)} ${c.method} ${c.path}`));
    evidence(id, "target", items("ga", t0).map(h.view));
    evidence(id, "log", gw.logSince(t0, /card|AI ?卡|proactive|主动|fallback|降级|403/iu).slice(-25));
    check(id, done && refused.length >= 1 && refused.every((c) => c.at >= rec.targetRun.startedAt - 2000), "the target turn's AI card creation got 403 (failure path ran)", refused.length);
    check(id, proactive.length === 1 && groupCards.length === 0, "the answer reached the group once, as a proactive robot message (fallback), not as a card", items("ga", t0).map(h.view));
    check(id, hooks.length === 0, "zero session-webhook posts from the inter-session turn", hooks);
    check(id, rec.phase === "handed_back" && !rec.failure && String(rec.result?.text ?? "").includes(result), "the result was handed back", rec.result);
    check(id, h.handbacks(t0).length === 1 && Boolean(wake), "one hand-back and the wake reply in the DM", h.handbacks(t0).map(h.view));
    check(id, !gw.logSince(t0, /Invalid URL|ECONNREFUSED/u).length, "no Invalid URL / ECONNREFUSED in the log", gw.logSince(t0, /Invalid URL|ECONNREFUSED/u).slice(0, 5));
  });

  if (SCENARIOS.includes("C")) await C(env, { target: "ga" });
  if (SCENARIOS.includes("F5")) await F5(env, {
    target: "ga",
    waitReady: async () => {
      const opens = fake.calls.filter((c) => c.path === "/v1.0/gateway/connections/open").length;
      await gw.waitFor(() => fake.calls.filter((c) => c.path === "/v1.0/gateway/connections/open").length > opens && fake.connected(), 600_000, "DingTalk Stream reconnect");
    },
  });

  // ---------------------------------------------------------------- WEBHOOK: no inter-session turn ever used a session webhook
  await runScenario(ctx, "WEBHOOK", async () => {
    const id = "WEBHOOK";
    const windows = [];
    for (const r of ledger.sends()) if (r.targetRun?.startedAt) windows.push({ chat: r.target.sessionKey === ad.keys.gv ? "gv" : "ga", from: r.targetRun.startedAt - 500, to: (r.targetRun.endedAt ?? Date.now()) + 3000, what: `req ${r.code}` });
    for (const b of ledger.batches()) if (b.wake?.startedAt) windows.push({ chat: "dm", from: b.wake.startedAt - 500, to: (b.wake.endedAt ?? Date.now()) + 3000, what: `wake ${b.batchId}` });
    const hits = windows.flatMap((w) => writes(w.chat, w.from, w.to).filter((x) => x.what === "sessionWebhook").map((x) => ({ ...x, during: w.what })));
    evidence(id, "windows", windows.length);
    evidence(id, "webhookTotal", fake.sessionWebhookCalls().length);
    check(id, windows.length >= 4, "inter-session turns ran (request and wake windows)", windows.length);
    check(id, hits.length === 0, "zero session-webhook requests during inter-session turns", hits);
    const bad = gw.logSince(ctx.T0, /Invalid URL|ECONNREFUSED/u);
    check(id, bad.length === 0, "no Invalid URL / ECONNREFUSED anywhere in the log", bad.slice(0, 5));
  });
}

try {
  await main();
} catch (error) {
  ctx.summary.failures.push(`fatal: ${ctx.redact(error?.stack ?? error).slice(0, 2500)}`);
} finally {
  if (gw) {
    ctx.summary.badLog = gw.logSince(ctx.T0, BAD_LOG_RE).slice(-30);
    ctx.summary.relayErrors = gw.logSince(ctx.T0, /v-session-relay.*(error|failed|threw)|inter-session.*(error|failed)/iu).slice(-30);
  }
  ctx.summary.fakeCalls = [...new Set(fake.calls.filter((c) => c.method !== "WS").map((c) => `${c.method} ${c.path}`))];
  ctx.summary.ledger = { sends: ledger.sends().map(sendEvidence), batches: ledger.batches().map((b) => ({ batchId: b.batchId, phase: b.phase, wake: b.wake })) };
  try { rpc?.reset(); } catch { /* ignore */ }
  await gw?.stop();
  gw?.cleanup();
  await fake.close();
  finish(ctx);
}
