// R2 candidate, Telegram (docs/inter-session/design.md §10.5): sessions_send between Telegram chats
// end to end, on V's bytes + the whole inter-session release (plan `files`), the v-session-relay
// 2.0 plugin, V's workspace, the Worker pool and real DeepSeek turns, against the loopback fake Bot
// API (lab/candidate/telegram-fake-bot-api.mjs; nothing reaches Telegram).
//
// The owner writes in his Telegram DM (the requester); the targets are two Telegram groups:
//   GA  worker harness: F2, F3, C (control group), F5;      GV  vds harness (Codex + DeepSeek): F1.
// Scenarios: lab/candidate/inter-session-r2-scenarios.mjs. Telegram extras: the target's progress
// draft changes while it works (edits) with the same shape as a person's turn in the same chat (a
// baseline turn in the seed), and the restart note replies to the anchor (F5).
import {
  AGENT, BAD_LOG_RE, Gateway, MODELS, applyWorkspace, createRpc, createRun, finish, freeBytes, ledgerOf, sendEvidence, sleep, transcript, verifyOverlay, writeConfig,
} from "./inter-session-r2-lib.mjs";
import { C, F1, F2, F2_TASK, F3, F5, helpers } from "./inter-session-r2-scenarios.mjs";
import { FAKE_BOT_TOKEN, createFakeTelegramBotApi } from "./telegram-fake-bot-api.mjs";

const ctx = createRun("telegram");
const { tag: TAG, check, evidence } = ctx;
const OWNER = "70000001";
const CHATS = { dm: OWNER, ga: "-1009990000201", gv: "-1009990000202" };
const TITLES = { ga: "VLab 测试｜TG 房间 A", gv: "VLab 测试｜TG 房间 V" };
const START_DELAY_MS = Number(process.env.ISR2_START_DELAY_MS ?? 6000);
const SCENARIOS = (process.env.ISR2_SCENARIOS ?? "F1,F2,F3,C,F5").split(",").map((s) => s.trim()).filter(Boolean);
const VISIBLE = new Set(["sendMessage", "editMessageText", "editMessageReplyMarkup", "editMessageMedia", "editMessageCaption", "deleteMessage", "setMessageReaction", "sendPhoto", "sendDocument", "sendMessageDraft", "sendAnimation", "sendVideo"]);

const fake = createFakeTelegramBotApi();
const ledger = ledgerOf(ctx);
let gw;
let rpc;
let baseline = null;

const finalText = (m) => String(m.history.at(-1)?.text ?? m.text ?? "");
function items(chatId, since = 0) {
  return fake.messages().filter((m) => m.chatId === String(chatId) && m.createdAt >= since).map((m) => ({
    id: String(m.messageId), at: m.createdAt, kind: "message", text: m.deleted ? String(m.history.findLast((x) => x.op !== "delete")?.text ?? m.text ?? "") : finalText(m),
    history: m.history.map((x) => ({ at: x.at, op: x.op, text: x.text })), replyTo: m.replyTo ?? null, deleted: m.deleted,
  }));
}
function writes(chatId, from, to) {
  const all = fake.messages().filter((m) => m.chatId === String(chatId));
  return fake.calls.filter((c) => c.at >= from && c.at <= to && String(c.params?.chat_id) === String(chatId) && VISIBLE.has(c.method)).map((c) => {
    const created = /^send/u.test(c.method) ? all.find((m) => Math.abs(m.createdAt - c.at) < 200 && String(m.history[0]?.text ?? "") === String(c.params?.text ?? c.params?.caption ?? "")) : null;
    return { at: c.at, what: c.method, itemId: String(created?.messageId ?? c.params?.message_id ?? "") || null };
  });
}
const opsShape = (m) => [...new Set(m.history.map((x) => x.op))].join(",");

const ad = {
  name: "telegram", bridgeKey: "telegram:default", streaming: true, replyAnchor: true,
  keys: { dm: `agent:${AGENT}:telegram:direct:${OWNER}`, ga: `agent:${AGENT}:telegram:group:${CHATS.ga}`, gv: `agent:${AGENT}:telegram:group:${CHATS.gv}` },
  chats: CHATS,
  person(chatId, text) { const at = Date.now(); const id = fake.sendUserText({ chatId, userId: OWNER, text }); return { at, id: String(id) }; },
  items, writes,
  anchorId: (m) => String(m.id),
  extra: {
    F2: async (env, { id, after, targetFinal }) => {
      const finalIds = new Set(targetFinal.map((m) => m.id));
      const drafts = after.filter((m) => !finalIds.has(m.id) && m.history.some((x) => x.op === "edit"));
      evidence(id, "draftShape", { target: after.map((m) => opsShape(m)), baseline });
      check(id, drafts.length >= 1, "Telegram draft edits: the target's progress draft changed while it worked (editMessageText)", after.map((m) => ({ id: m.id, ops: opsShape(m), text: m.text.slice(0, 60) })));
      check(id, baseline && JSON.stringify(after.map(opsShape)) === JSON.stringify(baseline), "the same draft sequence as a person's two-tool turn in this chat (baseline)", { target: after.map(opsShape), baseline });
    },
  },
};

async function main() {
  verifyOverlay(ctx);
  await applyWorkspace(ctx);
  const apiPort = await fake.listen();
  fake.setChat({ chatId: CHATS.ga, title: TITLES.ga });
  fake.setChat({ chatId: CHATS.gv, title: TITLES.gv });
  const { port, token } = writeConfig(ctx, {
    channels: { telegram: { enabled: true, botToken: FAKE_BOT_TOKEN, apiRoot: `http://127.0.0.1:${apiPort}`, dmPolicy: "allowlist", allowFrom: [OWNER], groupAllowFrom: [OWNER], groups: { "*": { requireMention: false } } } },
    channelPlugins: ["telegram"],
    ownerAllowFrom: [`telegram:${OWNER}`],
    vds: true,
  });
  ctx.secrets.add(FAKE_BOT_TOKEN);
  gw = new Gateway(ctx, { port, env: { VSR_TEST_START_DELAY_MS: String(START_DELAY_MS) } });
  rpc = createRpc(ctx, { port, token });
  ctx.summary.harness.startDelayMs = START_DELAY_MS;
  ctx.summary.harness.freeBytesAtStart = freeBytes(ctx.data);
  gw.start();
  await gw.waitFor(() => fake.calls.some((c) => c.method === "getMe"), 600_000, "Telegram getMe");
  await gw.waitFor(() => gw.lines.some((l) => /v-session-relay 2\.0 started/u.test(l.line)), 300_000, "v-session-relay started");
  await sleep(4000);
  ctx.step("gateway ready", { ms: Date.now() - gw.startedAt });
  const env = { ctx, gw, rpc, ledger, ad, startDelayMs: START_DELAY_MS };
  const h = helpers(env);

  // ---- seeds: both groups have sessions; GA records a person's two-tool turn (the draft baseline); GV runs on vds
  {
    const t0 = Date.now();
    ad.person(CHATS.ga, `【${TAG} 准备】这是自动化测试：${F2_TASK([5, 5], `SEED_A_${TAG}`)}`);
    const seed = await h.waitItem(CHATS.ga, t0, new RegExp(`SEED_A_${TAG}`), 300_000, "GA seed reply");
    await sleep(3000);
    baseline = items(CHATS.ga, t0).filter((m) => m.at <= seed.at).map(opsShape);
    ctx.summary.harness.draftBaseline = items(CHATS.ga, t0).map((m) => ({ ops: opsShape(m), text: m.text.slice(0, 60) }));
    ctx.summary.harness.gvPatch = await rpc("sessions.patch", { key: ad.keys.gv, agentId: AGENT, model: MODELS.vds }).then(() => "ok", (e) => `failed: ${String(e?.message ?? e).slice(0, 200)}`);
    const t1 = Date.now();
    ad.person(CHATS.gv, `【${TAG} 准备】这是自动化测试，只回复 SEED_V_${TAG}`);
    await h.waitItem(CHATS.gv, t1, new RegExp(`SEED_V_${TAG}`), 420_000, "GV seed reply (vds)");
    const tv = await transcript(rpc, ad.keys.gv, 10);
    ctx.summary.harness.gvSeedModels = [...new Set(tv.items.filter((m) => m.role === "assistant").map((m) => m.model).filter(Boolean))];
    ctx.step("seeded", { baseline, gv: ctx.summary.harness.gvSeedModels });
  }

  if (SCENARIOS.includes("F1")) await F1(env, { target: "gv" });
  if (SCENARIOS.includes("F2")) await F2(env, { target: "ga" });
  if (SCENARIOS.includes("F3")) await F3(env, { target: "ga" });
  if (SCENARIOS.includes("C")) await C(env, { target: "ga" });
  if (SCENARIOS.includes("F5")) await F5(env, {
    target: "ga",
    waitReady: async () => { const n = fake.callsOf("getMe").length; await gw.waitFor(() => fake.callsOf("getMe").length > n, 600_000, "Telegram getMe after restart"); },
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
  ctx.summary.botApiMethods = [...new Set(fake.calls.map((c) => c.method))];
  ctx.summary.botApiErrors = fake.calls.filter((c) => c.error).map((c) => `${c.method}: ${c.error}`).slice(0, 20);
  ctx.summary.ledger = { sends: ledger.sends().map(sendEvidence), batches: ledger.batches().map((b) => ({ batchId: b.batchId, phase: b.phase, wake: b.wake })) };
  try { rpc?.reset(); } catch { /* ignore */ }
  await gw?.stop();
  gw?.cleanup();
  await fake.close();
  finish(ctx);
}
