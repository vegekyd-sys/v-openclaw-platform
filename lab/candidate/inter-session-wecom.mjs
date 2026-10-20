// R2 candidate, WeCom (docs/inter-session/design.md §10.5): sessions_send between WeCom chats end
// to end, on V's bytes + the whole inter-session release (plan `files`; the WeCom plugin in this
// runtime is V's, byte for byte), the v-session-relay 2.0 plugin, V's workspace, the Worker pool and
// real DeepSeek turns, against the loopback fake robot socket (lab/candidate/wecom-fake-aibot.mjs;
// nothing reaches WeCom).
//
// Requesters are WeCom DMs: candowner (worker) for F2, F3, F3q, C, F5, candvds (vds) for F1; the target
// is the group GA (worker). F3 makes the target busy with an agent run (the core guard answers BUSY);
// F3q with a person's message, which WeCom's per-chat queue runs first while the request waits.
// WeCom extras (§10.5): nothing ever answers a synthetic req_id (aibot_respond_msg to a req_id the
// robot never pushed is 846605 on WeCom); an inter-session turn opens no stream and its final is one
// proactive markdown message; the anchor carries the WeCom line (no process view there).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

import {
  AGENT, BAD_LOG_RE, Gateway, MODELS, WECOM_PLUGIN, allowRelocatedPlugins, applyWorkspace, createRpc, createRun, finish, freeBytes, ledgerOf,
  runScenario, sendEvidence, sessionKeys, sleep, verifyOverlay, writeConfig,
} from "./inter-session-r2-lib.mjs";
import { C, F1, F2, F3, F5, helpers } from "./inter-session-r2-scenarios.mjs";
import { createFakeWeComAibot } from "./wecom-fake-aibot.mjs";

const ctx = createRun("wecom");
const { tag: TAG, check, evidence } = ctx;
const CHATS = { dm: "candowner", dv: "candvds", ga: "wrGrpRoomA0isr2" };
const START_DELAY_MS = Number(process.env.ISR2_START_DELAY_MS ?? 6000);
const SCENARIOS = (process.env.ISR2_SCENARIOS ?? "F1,F2,F3,F3q,C,F5").split(",").map((s) => s.trim()).filter(Boolean);
const WECOM_LINE = "（企业微信里看不到处理过程，做完会发结果）";

const ledger = ledgerOf(ctx);
const pluginDir = path.join(ctx.runtime, WECOM_PLUGIN);
const { WebSocketServer } = createRequire(path.join(pluginDir, "node_modules", "noop.js"))("ws");
const fake = createFakeWeComAibot({ WebSocketServer });
let gw;
let rpc;
const userOf = (chat) => (chat === CHATS.ga ? CHATS.dm : chat);

function items(chat, since = 0) {
  const out = [];
  for (const m of fake.proactive) if (m.at >= since && m.chatId === chat) out.push({ id: String(m.reqId ?? ""), at: m.at, kind: m.passive ? "passive" : "proactive", msgtype: m.msgtype, text: String(m.text ?? ""), history: [{ at: m.at, op: "send", text: m.text }] });
  for (const st of fake.streams()) if (st.createdAt >= since && st.chatId === chat) out.push({ id: String(st.id), at: st.createdAt, kind: "stream", text: st.content, history: st.history.map((x) => ({ at: x.at, op: x.finish ? "finish" : "stream", text: x.content })) });
  return out.sort((a, b) => a.at - b.at);
}
/** Every write towards a chat in [from, to]: replies (stream or not, any req_id), proactive sends, card updates, uploads. */
function writes(chat, from, to) {
  const out = [];
  for (const a of fake.respondAttempts) if (a.at >= from && a.at <= to && (a.chatId === chat || a.chatId === null)) out.push({ at: a.at, what: `aibot_respond_msg${a.chatId === null ? " (unknown req_id)" : ""}`, itemId: a.streamId ?? a.reqId });
  for (const f of fake.frames) if (f.at >= from && f.at <= to && f.cmd === "aibot_send_msg" && f.body?.chatid === chat) out.push({ at: f.at, what: "aibot_send_msg", itemId: f.reqId });
  for (const u of fake.cardUpdates) if (u.at >= from && u.at <= to && u.chatId === chat) out.push({ at: u.at, what: "aibot_respond_update_msg", itemId: u.reqId });
  return out;
}

const ad = {
  name: "wecom", bridgeKey: "wecom:default", streaming: false, replyAnchor: false,
  keys: {}, chats: CHATS,
  person(chat, text) {
    const r = fake.sendUserText({ userId: userOf(chat), text, group: chat === CHATS.ga, ...(chat === CHATS.ga ? { chatId: chat } : {}) });
    return { at: r.at, id: r.reqId };
  },
  items, writes,
  anchorId: (m) => String(m.id),
  extra: {
    F1: async (env, info) => finalMarkdown(env, info, info.targetReplies),
    F2: async (env, info) => finalMarkdown(env, info, info.targetFinal),
    F3: async (env, { id, rec }) => {
      const run = { from: rec.targetRun.startedAt - 500, to: (rec.targetRun.endedAt ?? Date.now()) + 3000 };
      const streams = items(CHATS.ga, run.from).filter((m) => m.kind === "stream" && m.at <= run.to);
      check(id, streams.length === 0, "the request turn (after BUSY) opened no stream either", streams);
    },
  },
};

/** The inter-session final: one proactive markdown message with the answer; no stream; anchor with the WeCom line. */
function finalMarkdown(env, { id, rec, anchor }, finals) {
  const run = { from: rec.targetRun.startedAt - 500, to: (rec.targetRun.endedAt ?? Date.now()) + 3000 };
  const chat = rec.target.route?.chatId ?? CHATS.ga;
  const streams = items(chat, run.from).filter((m) => m.kind === "stream" && m.at <= run.to);
  const proactive = finals.filter((m) => m.kind === "proactive");
  check(id, proactive.length === 1 && proactive[0].msgtype === "markdown", "the answer went out as one proactive markdown message", finals.map((m) => ({ kind: m.kind, msgtype: m.msgtype, text: m.text.slice(0, 80) })));
  check(id, streams.length === 0, "the inter-session turn opened no stream (WeCom cannot stream it)", streams);
  check(id, anchor?.[0] && anchor[0].msgtype === "markdown" && anchor[0].text.includes(WECOM_LINE), "the anchor is markdown and says there is no process view", anchor?.[0]?.text);
  const unknown = fake.respondsToUnknownReqIds();
  check(id, unknown.length === 0 && !fake.respondAttempts.some((a) => String(a.reqId).startsWith("v-a2a")), "no aibot_respond_msg to a synthetic or unknown req_id", unknown);
}

async function main() {
  verifyOverlay(ctx);
  allowRelocatedPlugins(ctx, ["wecom-openclaw-plugin"]);
  await applyWorkspace(ctx);
  const wsPort = await fake.listen();
  const { port, token } = writeConfig(ctx, {
    channels: {
      wecom: {
        enabled: true, connectionMode: "websocket", botId: "candidate-bot", secret: "candidate-fake-secret",
        websocketUrl: `ws://127.0.0.1:${wsPort}`, dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"],
      },
    },
    channelPlugins: ["wecom-openclaw-plugin"],
    loadPaths: [pluginDir],
    ownerAllowFrom: ["feishu:ou_775a78b0aaae67da5e15eeaf102e3cd9", "telegram:5368086561"],
    vds: true,
  });
  gw = new Gateway(ctx, { port, env: { VSR_TEST_START_DELAY_MS: String(START_DELAY_MS) } });
  rpc = createRpc(ctx, { port, token });
  ctx.summary.harness.startDelayMs = START_DELAY_MS;
  ctx.summary.harness.freeBytesAtStart = freeBytes(ctx.data);
  gw.start();
  await gw.waitFor(() => fake.authenticated(), 600_000, "WeCom socket authentication");
  await gw.waitFor(() => gw.lines.some((l) => /v-session-relay 2\.0 started/u.test(l.line)), 300_000, "v-session-relay started");
  await sleep(4000);
  const env = { ctx, gw, rpc, ledger, ad, startDelayMs: START_DELAY_MS };
  const h = helpers(env);

  // ---- seeds: the sessions exist with a stored delivery address; candvds's DM then runs on vds
  for (const [name, re] of [["dm", "SEED_DM"], ["dv", "SEED_DV"], ["ga", "SEED_A"]]) {
    const t = Date.now();
    ad.person(CHATS[name], `【${TAG} 准备】这是自动化测试，只回复 ${re}_${TAG}`);
    await h.waitItem(CHATS[name], t, new RegExp(`${re}_${TAG}`), 300_000, `${name} seed reply`);
  }
  const keys = (await sessionKeys(rpc)).filter((k) => /wecom/u.test(k));
  ad.keys.dm = keys.find((k) => k.toLowerCase().includes(CHATS.dm.toLowerCase()));
  ad.keys.dv = keys.find((k) => k.toLowerCase().includes(CHATS.dv.toLowerCase()));
  ad.keys.ga = keys.find((k) => k.toLowerCase().includes(CHATS.ga.toLowerCase()));
  ctx.summary.harness.keys = { all: keys, ...ad.keys };
  assert(ad.keys.dm && ad.keys.dv && ad.keys.ga, `WeCom session keys not found: ${JSON.stringify(keys)}`);
  ctx.summary.harness.dvPatch = await rpc("sessions.patch", { key: ad.keys.dv, agentId: AGENT, model: MODELS.vds }).then(() => "ok", (e) => `failed: ${String(e?.message ?? e).slice(0, 200)}`);
  {
    const t = Date.now();
    ad.person(CHATS.dv, `【${TAG} 准备 vds】这是自动化测试，只回复 SEED_VDS_${TAG}`);
    await h.waitItem(CHATS.dv, t, new RegExp(`SEED_VDS_${TAG}`), 420_000, "dv vds seed reply");
  }
  ctx.step("seeded", ad.keys);

  if (SCENARIOS.includes("F1")) await F1(env, { requester: "dv", target: "ga", vdsSide: "requester" });
  if (SCENARIOS.includes("F2")) await F2(env, { target: "ga" });
  // A person's message and the request's start share WeCom's per-chat queue, so the request simply waits
  // behind the person (F3q). The core guard's BUSY needs a run the chat queue does not see (F3: an agent run).
  if (SCENARIOS.includes("F3")) await F3(env, { target: "ga", busyBy: "rpc" });
  if (SCENARIOS.includes("F3q")) await F3(env, { target: "ga", id: "F3q", expectBusy: false });
  if (SCENARIOS.includes("C")) await C(env, { target: "ga" });
  if (SCENARIOS.includes("F5")) await F5(env, {
    target: "ga",
    waitReady: async () => {
      const subs = fake.frames.filter((f) => f.cmd === "aibot_subscribe").length;
      await gw.waitFor(() => fake.frames.filter((f) => f.cmd === "aibot_subscribe").length > subs, 600_000, "WeCom re-authentication");
    },
  });

  await runScenario(ctx, "REQID", async () => {
    const id = "REQID";
    const unknown = fake.respondsToUnknownReqIds();
    evidence(id, "respondAttempts", fake.respondAttempts.length);
    evidence(id, "rejected", fake.rejectedResponds);
    check(id, ledger.sends().filter((r) => r.targetRun?.startedAt).length >= 4, "inter-session turns ran in this candidate", ledger.sends().length);
    check(id, unknown.length === 0 && fake.rejectedResponds.length === 0, "the whole run: no aibot_respond_msg to a req_id the robot never pushed (no 846605)", unknown);
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
  ctx.summary.frameCommands = [...new Set(fake.frames.map((f) => f.cmd))];
  ctx.summary.ledger = { sends: ledger.sends().map(sendEvidence), batches: ledger.batches().map((b) => ({ batchId: b.batchId, phase: b.phase, wake: b.wake })) };
  try { rpc?.reset(); } catch { /* ignore */ }
  await gw?.stop();
  gw?.cleanup();
  await fake.close();
  finish(ctx);
}
