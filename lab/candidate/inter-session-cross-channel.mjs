// R2 candidate, cross-channel (docs/inter-session/design.md §10.5, WP13): one candidate, three
// channels. The requester is the owner's real Feishu DM with the VLab app (loopback webhook inbound,
// real outbound; no second long connection); the targets are a fake DingTalk group and the owner's
// fake Telegram DM. One turn hands two requests out (timeoutSeconds=0), each target answers in its own
// channel through its bridge, and the two results come back into the Feishu DM together: one ↩️ line
// and one wake card.
//
// What this candidate checks itself: the ledger (two sends, one batch, bridges, preset runIds, one
// wake through the Feishu bridge), the fake platforms (anchors with #code, answers), the Feishu API
// replies of what it posted. What the owner sees in the Feishu DM is read back afterwards on the Mac
// with lark-cli as the owner (docs/inter-session/e2e-e2e-r2.md), matched by RUN_TAG and time.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";

import {
  AGENT, BAD_LOG_RE, DINGTALK_PLUGIN, DINGTALK_PROJECT, FEISHU_PLUGIN, Gateway, allowRelocatedPlugins, applyWorkspace, batchEvidence, contracts,
  createRpc, createRun, finish, freeBytes, ledgerOf, runScenario, sendEvidence, sessionKeys, sha256, sleep, transcript, verifyOverlay, writeConfig,
} from "./inter-session-r2-lib.mjs";
import { createFakeDingTalkOpenApi } from "./dingtalk-fake-open-api.mjs";
import { FAKE_BOT_TOKEN, createFakeTelegramBotApi } from "./telegram-fake-bot-api.mjs";

const ctx = createRun("cross");
const { tag: TAG, check, evidence } = ctx;
const OWNER = process.env.XC_OWNER_OPEN_ID ?? "ou_775a78b0aaae67da5e15eeaf102e3cd9";
const DM_CHAT = process.env.XC_DM_CHAT ?? "oc_8f28eb6bcb3b847471693f066dac61c4";
const TG_OWNER = "70000001";
const DT_USER = "candowner";
const DT_CID = "cidGrpCross0isr2";
const DT_TITLE = `VLab 测试｜钉钉群 ${TAG}`;
const VERIFICATION_TOKEN = `isr2-${crypto.randomBytes(8).toString("hex")}`;
const ENCRYPT_KEY = `isr2-${crypto.randomBytes(12).toString("hex")}`;
const WEBHOOK_PATH = "/candidate/isr2-cross";
const BRIDGE_FILES = ["connection-DCvu-l09.mjs", "message-handler-BUoLSylZ.mjs", "v-experience.mjs"];
const DM_KEY = `agent:${AGENT}:feishu:direct:${OWNER}`;
const TG_KEY = `agent:${AGENT}:telegram:direct:${TG_OWNER}`;

const ledger = ledgerOf(ctx);
const dtPluginDir = path.join(ctx.runtime, DINGTALK_PLUGIN);
const { WebSocketServer } = createRequire(path.join(ctx.runtime, DINGTALK_PROJECT, "node_modules", "noop.js"))("ws");
const dt = createFakeDingTalkOpenApi({ WebSocketServer });
const tg = createFakeTelegramBotApi();
let gw;
let rpc;
let webhookPort;

async function freePort() {
  const s = net.createServer();
  await new Promise((resolve, reject) => { s.once("error", reject); s.listen(0, "127.0.0.1", resolve); });
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

/** One signed, encrypted im.message.receive_v1 for the owner's DM, through the loopback webhook (as Feishu sends it). */
let eventSeq = 0;
async function feishuOwnerSays(text, appId) {
  eventSeq += 1;
  const messageId = `om_isr2${TAG.toLowerCase()}${Date.now().toString(36)}${eventSeq}`;
  const envelope = {
    schema: "2.0",
    header: { event_id: crypto.randomUUID().replaceAll("-", ""), token: VERIFICATION_TOKEN, create_time: String(Date.now()), event_type: "im.message.receive_v1", tenant_key: "isr2-candidate", app_id: appId },
    event: {
      sender: { sender_id: { open_id: OWNER }, sender_type: "user", tenant_key: "isr2-candidate" },
      message: { message_id: messageId, chat_id: DM_CHAT, chat_type: "p2p", message_type: "text", content: JSON.stringify({ text }), create_time: String(Date.now()) },
    },
  };
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", crypto.createHash("sha256").update(ENCRYPT_KEY).digest(), iv);
  const body = JSON.stringify({ encrypt: Buffer.concat([iv, cipher.update(JSON.stringify(envelope), "utf8"), cipher.final()]).toString("base64") });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(8).toString("hex");
  const signature = sha256(timestamp + nonce + ENCRYPT_KEY + body);
  const res = await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: webhookPort, path: WEBHOOK_PATH, method: "POST", headers: { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "x-lark-request-timestamp": timestamp, "x-lark-request-nonce": nonce, "x-lark-signature": signature } }, (r) => {
      let out = "";
      r.setEncoding("utf8");
      r.on("data", (c) => { out += c; });
      r.on("end", () => resolve({ status: r.statusCode, body: out.slice(0, 200) }));
    });
    req.on("error", reject);
    req.end(body);
  });
  return { messageId, at: Date.now(), ...res };
}

async function main() {
  verifyOverlay(ctx);
  // DingTalk hosts → fake (non-bridge chunks only), as inter-session-dingtalk.mjs.
  const dtPort = await dt.listen();
  const dtBase = `http://127.0.0.1:${dtPort}`;
  const dist = path.join(dtPluginDir, "dist");
  for (const file of [...fs.readdirSync(dist).filter((f) => f.endsWith(".mjs") && !BRIDGE_FILES.includes(f)).map((f) => path.join(dist, f)), ...["constants.mjs", "constants.cjs"].map((f) => path.join(ctx.runtime, DINGTALK_PROJECT, "node_modules", "dingtalk-stream", "dist", f))]) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    const next = src.replaceAll("https://api.dingtalk.com", dtBase).replaceAll("https://oapi.dingtalk.com", dtBase);
    if (next !== src) fs.writeFileSync(file, next);
  }
  ctx.summary.harnessPatches = [{ what: "DingTalk hosts → loopback fake (non-bridge chunks + dingtalk-stream)" }];
  allowRelocatedPlugins(ctx, ["feishu", "dingtalk-connector"]);
  await applyWorkspace(ctx);
  const tgPort = await tg.listen();
  webhookPort = await freePort();
  const shared = JSON.parse(fs.readFileSync(ctx.configPath, "utf8")).channels?.feishu ?? {};
  assert(typeof shared.appId === "string" && /^cli_/u.test(shared.appId) && typeof shared.appSecret === "string" && !shared.appSecret.includes("${"), "the VLab Feishu app credentials are not plain strings");
  ctx.secrets.add(shared.appSecret);
  ctx.summary.harness.feishu = { appId: shared.appId, renderMode: shared.renderMode ?? null, streaming: shared.streaming ?? null, connectionMode: "webhook (loopback inbound, real outbound)" };
  const feishuDir = path.join(ctx.runtime, FEISHU_PLUGIN);
  const { port, token } = writeConfig(ctx, {
    channels: {
      feishu: { ...shared, connectionMode: "webhook", webhookHost: "127.0.0.1", webhookPort, webhookPath: WEBHOOK_PATH, verificationToken: VERIFICATION_TOKEN, encryptKey: ENCRYPT_KEY },
      "dingtalk-connector": {
        enabled: true, clientId: "dingcandidate", clientSecret: "candidate-fake-secret", endpoint: dtBase,
        dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"], requireMention: true,
        groupReplyMode: "aicard", typingIndicator: true, separateSessionByConversation: true, groupSessionScope: "group", resolveSenderNames: false, enableMediaUpload: false,
      },
      telegram: { enabled: true, botToken: FAKE_BOT_TOKEN, apiRoot: `http://127.0.0.1:${tgPort}`, dmPolicy: "allowlist", allowFrom: [TG_OWNER], groupAllowFrom: [TG_OWNER] },
    },
    channelPlugins: ["feishu", "dingtalk-connector", "telegram"],
    loadPaths: [feishuDir, dtPluginDir],
    ownerAllowFrom: [`feishu:${OWNER}`, `telegram:${TG_OWNER}`],
    vds: false,
  });
  ctx.secrets.add(FAKE_BOT_TOKEN);
  gw = new Gateway(ctx, { port });
  rpc = createRpc(ctx, { port, token });
  ctx.summary.harness.freeBytesAtStart = freeBytes(ctx.data);
  gw.start();
  await gw.waitFor(() => gw.lines.some((l) => /starting Webhook server on 127\.0\.0\.1/u.test(l.line)), 600_000, "Feishu webhook start");
  await gw.waitFor(() => dt.connected() && tg.calls.some((c) => c.method === "getMe"), 300_000, "DingTalk Stream + Telegram polling");
  await gw.waitFor(() => gw.lines.some((l) => /v-session-relay 2\.0 started/u.test(l.line)), 300_000, "v-session-relay started");
  await sleep(4000);

  // ---- seeds: the two targets have sessions with a delivery address
  {
    const t = Date.now();
    dt.sendUserText({ userId: DT_USER, text: `【${TAG} 准备】这是自动化测试，只回复 SEED_DT_${TAG}`, group: true, conversationId: DT_CID, conversationTitle: DT_TITLE });
    await gw.waitFor(() => dt.cards().some((c) => c.createdAt >= t && String(c.content).includes(`SEED_DT_${TAG}`)) || dt.robotMessages.some((m) => m.at >= t && JSON.stringify(m.msgParam).includes(`SEED_DT_${TAG}`)), 300_000, "DingTalk seed");
    const t2 = Date.now();
    tg.sendUserText({ chatId: TG_OWNER, userId: TG_OWNER, text: `【${TAG} 准备】这是自动化测试，只回复 SEED_TG_${TAG}` });
    await gw.waitFor(() => tg.messages().some((m) => m.createdAt >= t2 && m.chatId === TG_OWNER && String(m.history.at(-1)?.text ?? "").includes(`SEED_TG_${TAG}`)), 300_000, "Telegram seed");
  }
  const keys = await sessionKeys(rpc);
  const DT_KEY = keys.find((k) => /dingtalk/u.test(k) && k.toLowerCase().includes(DT_CID.toLowerCase()));
  assert(DT_KEY, `DingTalk group key not found: ${JSON.stringify(keys)}`);
  ctx.summary.harness.keys = { dm: DM_KEY, dingtalk: DT_KEY, telegram: TG_KEY };

  await runScenario(ctx, "XC", async () => {
    const id = "XC";
    const t0 = Date.now();
    const dtToken = `XD_DT_${TAG}`;
    const tgToken = `XD_TG_${TAG}`;
    const ev = await feishuOwnerSays(`【跨渠道测试 ${TAG}】这是自动化测试，请严格照做：在这一轮里调用两次 sessions_send，都设 timeoutSeconds=0：第一次 sessionKey="${DT_KEY}"，message="【${TAG}-钉钉】这是自动化测试，请只回复 ${dtToken}"；第二次 sessionKey="${TG_KEY}"，message="【${TAG}-Telegram】这是自动化测试，请只回复 ${tgToken}"。两次都返回后只回复一句「${TAG} 已交给钉钉群和 Telegram」，然后立刻结束本轮：不要 sleep，不要轮询。结果回来时，用一条消息把两边的回复都告诉我（必须包含 ${dtToken} 和 ${tgToken}，并带上 ${TAG}）。`, shared.appId);
    ctx.summary.feishuInbound = { messageId: ev.messageId, status: ev.status, at: new Date(ev.at).toISOString() };
    check(id, ev.status === 200, "the owner's message reached the Feishu webhook", ev);
    const sends = await gw.waitFor(() => { const s = ledger.sends().filter((r) => r.createdAt >= t0 && r.requester?.sessionKey === DM_KEY); return s.length >= 2 ? s : null; }, 300_000, "two sends from the Feishu DM");
    const dtSend = sends.find((r) => r.target.sessionKey === DT_KEY);
    const tgSend = sends.find((r) => r.target.sessionKey === TG_KEY);
    const done = await gw.waitFor(() => { const all = [dtSend, tgSend].map((r) => r && ledger.send(r.sendId)); return all.every((r) => r && contracts.SEND_TERMINAL_PHASES.includes(r.phase)) ? all : null; }, 600_000, "both sends handed back");
    const [dtRec, tgRec] = done;
    const batch = await gw.waitFor(() => { const b = ledger.batch(dtRec.batchId); return b?.phase === "woken" || b?.phase === "skipped" ? b : null; }, 300_000, "batch woken");
    await sleep(45_000); // the wake card streams and settles in the real chat
    const dtAnchor = dt.robotMessages.filter((m) => m.at >= t0 && m.openConversationId === DT_CID && JSON.stringify(m.msgParam).includes(`#${dtRec.code}`));
    const dtAnswer = dt.cards().filter((c) => c.createdAt >= t0 && c.delivered?.openSpaceId === `dtv1.card//IM_GROUP.${DT_CID}` && String(c.content).includes(dtToken));
    const tgMsgs = tg.messages().filter((m) => m.createdAt >= t0 && m.chatId === TG_OWNER);
    const tgAnchor = tgMsgs.filter((m) => /^📨/u.test(String(m.history.at(-1)?.text ?? "")) && String(m.history.at(-1)?.text).includes(`#${tgRec.code}`));
    const tgAnswer = tgMsgs.filter((m) => !m.deleted && String(m.history.at(-1)?.text ?? "").includes(tgToken));
    const wakeUsers = (await transcript(rpc, DM_KEY)).items.filter((m) => m.provenance === "inter_session" && String(m.origin ?? "").endsWith(`:wake:${batch.batchId}`));
    const dmTranscript = (await transcript(rpc, DM_KEY)).items.filter((m) => (m.at ?? 0) >= t0);
    const wakeReply = dmTranscript.filter((m) => m.role === "assistant" && !m.provenance && m.text.includes(dtToken) && m.text.includes(tgToken));
    evidence(id, "sends", [dtRec, tgRec].map(sendEvidence));
    evidence(id, "batch", batchEvidence(batch));
    evidence(id, "dingtalk", { anchor: dtAnchor.map((m) => ({ at: m.at, text: JSON.stringify(m.msgParam).slice(0, 200) })), answer: dtAnswer.map((c) => ({ at: c.createdAt, content: String(c.content).slice(0, 200) })) });
    evidence(id, "telegram", tgMsgs.map((m) => ({ id: m.messageId, at: m.createdAt, ops: m.history.map((x) => x.op).join(","), text: String(m.history.at(-1)?.text ?? "").slice(0, 160) })));
    evidence(id, "dmTranscript", dmTranscript.map((m) => ({ role: m.role, at: m.at, prov: m.provenance, origin: m.origin, text: m.text.slice(0, 200) })));
    evidence(id, "feishuLog", gw.logSince(t0, /feishu\[|inter-session|im\.message|card/iu).slice(-40));
    evidence(id, "relayLog", gw.logSince(t0, /v-session-relay|vrelay/u).slice(-20));
    ctx.summary.readback = { dmChat: DM_CHAT, from: new Date(t0 - 5000).toISOString(), handbackMessageId: batch.wake?.handbackMessageId ?? null, codes: [dtRec.code, tgRec.code], tokens: [dtToken, tgToken], tag: TAG, dtTitle: DT_TITLE };
    check(id, sends.length === 2 && dtSend && tgSend && dtRec.batchId === tgRec.batchId, "two sends from one turn of the Feishu DM, one batch", sends.map((r) => r.target.sessionKey));
    check(id, dtRec.principal?.channel === "feishu" && dtRec.principal?.isOwner === true, "the chain's root is the Feishu owner", dtRec.principal);
    check(id, dtRec.target.transport === "bridge" && dtRec.target.bridgeKey === "dingtalk:default" && tgRec.target.transport === "bridge" && tgRec.target.bridgeKey === "telegram:default", "each target reached through its own channel's bridge", [dtRec.target.bridgeKey, tgRec.target.bridgeKey]);
    for (const [name, r, tokenX] of [["DingTalk", dtRec, dtToken], ["Telegram", tgRec, tgToken]]) {
      check(id, r.phase === "handed_back" && !r.failure && String(r.result?.text ?? "").includes(tokenX), `${name}: result handed back`, { phase: r.phase, result: r.result, failure: r.failure });
      check(id, r.targetRun?.runId === contracts.runIdFor("request", r.sendId, r.attempt), `${name}: the target turn ran with the preset runId`, r.targetRun);
    }
    check(id, dtAnchor.length >= 1 && String(dtAnchor[0].processQueryKey) === String(dtRec.request.messageId), "DingTalk group shows the 📨 anchor (#code)", dtAnchor.length);
    check(id, dtAnswer.length >= 1, "DingTalk group shows the answer in an AI card", dtAnswer.length);
    check(id, tgAnchor.length >= 1 && String(tgAnchor[0].messageId) === String(tgRec.request.messageId), "Telegram DM shows the 📨 anchor (#code)", tgAnchor.length);
    check(id, tgAnswer.length >= 1, "Telegram DM shows the answer", tgAnswer.length);
    check(id, batch.phase === "woken" && batch.wake?.transport === "bridge" && batch.wake?.runId === contracts.runIdFor("wake", batch.batchId, batch.wake.attempt ?? 0) && /^om_/u.test(String(batch.wake?.handbackMessageId ?? "")), "the batch woke the Feishu DM once through the Feishu bridge (↩️ posted, preset wake runId)", batch.wake);
    check(id, wakeUsers.length === 1, "Feishu DM transcript: exactly one wake message", wakeUsers.length);
    check(id, wakeReply.length === 1, "the wake turn reported both results once", dmTranscript.filter((m) => m.role === "assistant").map((m) => m.text.slice(0, 120)));
    check(id, (batch.sealedAt ?? Infinity) - Math.min(dtRec.createdAt, tgRec.createdAt) < 60_000, "requester_tail_ms < 60 s", (batch.sealedAt ?? 0) - Math.min(dtRec.createdAt, tgRec.createdAt));
    check(id, dt.sessionWebhookCalls().filter((c) => c.at >= dtRec.targetRun.startedAt - 500 && c.at <= (dtRec.targetRun.endedAt ?? Date.now()) + 3000).length === 0, "DingTalk: no session-webhook request from the inter-session turn");
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
  ctx.summary.ledger = { sends: ledger.sends().map(sendEvidence), batches: ledger.batches().map(batchEvidence) };
  try { rpc?.reset(); } catch { /* ignore */ }
  await gw?.stop();
  gw?.cleanup();
  await dt.close();
  await tg.close();
  finish(ctx);
}
