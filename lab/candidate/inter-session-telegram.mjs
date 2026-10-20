// R2 candidate, Telegram (docs/inter-session/design.md §10.5): sessions_send between Telegram chats
// end to end, on V's bytes + the whole inter-session release (plan `files`), the v-session-relay
// 2.0 plugin, V's workspace, the Worker pool and real DeepSeek turns, against the loopback fake Bot
// API (lab/candidate/telegram-fake-bot-api.mjs; nothing reaches Telegram).
//
// The owner writes in his Telegram DM (the requester); the targets are two Telegram groups:
//   GA  worker harness: F2, F3, F5 and the control group;
//   GV  vds harness (Codex app-server + DeepSeek): F1.
//
//   F1  inline: the DM asks GV with timeoutSeconds=120 → 📨 anchor in GV, GV answers there, the tool
//       result carries the answer, no hand-back in the DM.
//   F2  async, the target works 75 s: the requester ends its turn within 60 s of acceptance and
//       never sleeps or polls; anchor + streamed draft in GA; exactly one ↩️ and one wake reply.
//   F3  BUSY at the core guard: VSR_TEST_START_DELAY_MS holds the start after the plugin's idle
//       precheck while a person's message starts a turn in GA → the attempt is BUSY with no
//       sendMessage / edit / delete / reaction in GA; it starts after the person's turn (attempt ≥ 1).
//   C   control group: the ledger's DISABLED file → sessions_send runs the old v2 path: no anchor,
//       no ledger record (the request is invisible in the target chat).
//   F5  kill -9 of the Gateway (and its Workers) while GA's turn runs → after the restart GA shows
//       the restart note replying to the anchor, or a recovery turn; the DM gets exactly one
//       hand-back and one wake; GA still answers a person afterwards.
import fs from "node:fs";

import {
  AGENT, BAD_LOG_RE, Gateway, MODELS, allowRelocatedPlugins, applyWorkspace, batchEvidence, contracts, createRpc, createRun,
  finish, freeBytes, historyAt, ledgerOf, runScenario, sendEvidence, sessionRow, sleep, toolsBetween, transcript, verifyOverlay, waitSend, writeConfig,
} from "./inter-session-r2-lib.mjs";
import { FAKE_BOT_TOKEN, createFakeTelegramBotApi } from "./telegram-fake-bot-api.mjs";

const ctx = createRun("telegram");
const { tag: TAG, check, evidence } = ctx;
const OWNER = "70000001";
const GA = "-1009990000201";
const GV = "-1009990000202";
const GA_TITLE = "VLab 测试｜TG 房间 A";
const GV_TITLE = "VLab 测试｜TG 房间 V";
const DM_KEY = `agent:${AGENT}:telegram:direct:${OWNER}`;
const GA_KEY = `agent:${AGENT}:telegram:group:${GA}`;
const GV_KEY = `agent:${AGENT}:telegram:group:${GV}`;
const START_DELAY_MS = Number(process.env.ISR2_START_DELAY_MS ?? 6000);
const SCENARIOS = (process.env.ISR2_SCENARIOS ?? "F1,F2,F3,C,F5").split(",").map((s) => s.trim()).filter(Boolean);
const VISIBLE = new Set(["sendMessage", "editMessageText", "editMessageReplyMarkup", "editMessageMedia", "editMessageCaption", "deleteMessage", "setMessageReaction", "sendPhoto", "sendDocument", "sendMessageDraft"]);
const FAIL_TEXT = /Something went wrong|出错了|暂未收到|No response|empty response/iu;

const fake = createFakeTelegramBotApi();
const ledger = ledgerOf(ctx);
let gw;
let rpc;

const chatMsgs = (chatId, since = 0) => fake.messages().filter((m) => m.chatId === String(chatId) && m.createdAt >= since);
const finalText = (m) => String(m.history.at(-1)?.text ?? m.text ?? "");
const view = (m) => ({ id: m.messageId, at: new Date(m.createdAt).toISOString().slice(11, 23), replyTo: m.replyTo ?? null, ops: m.history.map((h) => h.op).join(","), deleted: m.deleted, text: finalText(m).slice(0, 240) });
const waitMsg = (chatId, since, re, ms, label) => gw.waitFor(() => chatMsgs(chatId, since).find((m) => !m.deleted && re.test(finalText(m))), ms, label);
const visibleCalls = (chatId, from, to) => fake.calls.filter((c) => c.at >= from && c.at <= to && String(c.params?.chat_id) === String(chatId) && VISIBLE.has(c.method));
const person = (chatId, text) => { const at = Date.now(); const messageId = fake.sendUserText({ chatId, userId: OWNER, text }); return { at, messageId }; };
const settled = (id, phases, ms, label) => gw.waitFor(() => { const r = ledger.send(id); return r && phases.includes(r.phase) ? r : null; }, ms, label);
const relayLog = (since) => gw.logSince(since, /v-session-relay|inter-session|vrelay/u).slice(-40);

/** Hand-back lines (↩️ / 💬 / ⚠️ / ⏹ …#code) the bot posted in the DM since `since`. */
const handbacks = (since, code) => chatMsgs(OWNER, since).filter((m) => /^(↩️|💬|⚠️|⏹)/u.test(finalText(m)) && (!code || finalText(m).includes(`#${code}`)));
const anchors = (chatId, since, code) => chatMsgs(chatId, since).filter((m) => /^(📨|❓)/u.test(finalText(m)) && (!code || finalText(m).includes(`#${code}`)));

async function interSessionUsers(sessionKey, kind, id) {
  const t = await transcript(rpc, sessionKey);
  return t.items.filter((m) => m.role === "user" && m.provenance === "inter_session" && String(m.origin ?? "").endsWith(`:${contracts.kindAbbr(kind)}:${id}`));
}

async function main() {
  verifyOverlay(ctx);
  await applyWorkspace(ctx);
  const apiPort = await fake.listen();
  fake.setChat({ chatId: GA, title: GA_TITLE });
  fake.setChat({ chatId: GV, title: GV_TITLE });
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

  // ---- seeds: both groups have sessions with a delivery address; GV runs on vds
  {
    const t0 = Date.now();
    person(GA, `【${TAG} 准备】这是自动化测试，只回复 SEED_A_${TAG}`);
    await waitMsg(GA, t0, new RegExp(`SEED_A_${TAG}`), 300_000, "GA seed reply");
    const patched = await rpc("sessions.patch", { key: GV_KEY, agentId: AGENT, model: MODELS.vds }).then(() => "ok", (e) => `failed: ${String(e?.message ?? e).slice(0, 200)}`);
    ctx.summary.harness.gvPatch = patched;
    const t1 = Date.now();
    person(GV, `【${TAG} 准备】这是自动化测试，只回复 SEED_V_${TAG}`);
    await waitMsg(GV, t1, new RegExp(`SEED_V_${TAG}`), 420_000, "GV seed reply (vds)");
    const tv = await transcript(rpc, GV_KEY, 10);
    ctx.summary.harness.gvSeedModels = [...new Set(tv.items.filter((m) => m.role === "assistant").map((m) => m.model))];
    ctx.step("seeded", { gv: ctx.summary.harness.gvSeedModels });
  }

  // ---------------------------------------------------------------- F1 inline (target on vds)
  if (SCENARIOS.includes("F1")) await runScenario(ctx, "F1", async () => {
    const id = "F1";
    const t0 = Date.now();
    const answer = `F1_ANSWER_${TAG}`;
    person(OWNER, `【跨会话测试 ${TAG}-F1】这是自动化测试，请严格照做：调用一次 sessions_send 工具，参数 sessionKey="${GV_KEY}"，timeoutSeconds=120，message="【${TAG}-F1】这是自动化测试，请只回复 ${answer}"。拿到工具结果后，只把对方的回答原样告诉我（必须包含 ${answer}）。不要调用其他工具。`);
    const first = await waitSend(gw, ledger, t0, (r) => r.target?.sessionKey === GV_KEY, 300_000, "F1 send");
    const rec = await settled(first.sendId, ["delivered_inline", "handed_back", "cancelled", "skipped"], 420_000, "F1 settled");
    const reply = await waitMsg(OWNER, t0, new RegExp(answer), 300_000, "F1 requester reply").catch(() => null);
    await sleep(5000);
    const anchor = anchors(GV, t0, rec.code);
    const targetReplies = chatMsgs(GV, t0).filter((m) => finalText(m).includes(answer));
    const dmTools = toolsBetween((await transcript(rpc, DM_KEY)).items, t0);
    const gvUsers = await interSessionUsers(GV_KEY, "request", rec.sendId);
    const gvT = await transcript(rpc, GV_KEY, 10);
    evidence(id, "send", sendEvidence(rec));
    evidence(id, "gv", chatMsgs(GV, t0).map(view));
    evidence(id, "dm", chatMsgs(OWNER, t0).map(view));
    evidence(id, "dmTools", dmTools);
    evidence(id, "gvModels", [...new Set(gvT.items.filter((m) => m.role === "assistant").map((m) => m.model))]);
    evidence(id, "log", relayLog(t0));
    check(id, rec.mode === "inline" && rec.edge === "delegate", "inline delegate send recorded", { mode: rec.mode, edge: rec.edge });
    check(id, rec.phase === "delivered_inline", "the answer was claimed inline (delivered_inline)", rec.phase);
    check(id, rec.target.transport === "bridge" && rec.target.bridgeKey === "telegram:default", "target reached through the Telegram bridge", rec.target);
    check(id, rec.targetRun?.runId === contracts.runIdFor("request", rec.sendId, rec.attempt), "the target turn ran with the preset runId", rec.targetRun);
    check(id, String(rec.result?.text ?? "").includes(answer), "ledger result carries the answer", rec.result);
    check(id, anchor.length === 1 && String(anchor[0].messageId) === String(rec.request.messageId), "one 📨 anchor with #code in GV, the ledger's anchor id", anchor.map(view));
    check(id, targetReplies.length >= 1 && targetReplies.every((m) => m.createdAt >= (anchor[0]?.createdAt ?? Infinity)), "GV shows its answer, after the anchor", targetReplies.map(view));
    check(id, Boolean(reply), "the requester told the owner the answer (tool result reached it)", reply && view(reply));
    check(id, handbacks(t0).length === 0, "no hand-back (↩️/💬) in the DM for an inline answer", handbacks(t0).map(view));
    check(id, !ledger.batches().some((b) => b.members?.includes(rec.sendId) && b.phase === "woken"), "no wake for the inline send");
    check(id, gvUsers.length === 1, "GV transcript: exactly one inter_session user message for the request", gvUsers.length);
    check(id, dmTools.includes("sessions_send") && dmTools.every((t) => t === "sessions_send"), "the requester only called sessions_send", dmTools);
    const gvRow = await sessionRow(rpc, GV_KEY);
    const gvModelInfo = JSON.stringify(Object.fromEntries(Object.entries(gvRow ?? {}).filter(([k]) => /model|runtime|provider|harness/iu.test(k))));
    evidence(id, "gvSession", gvModelInfo);
    check(id, /vds-deepseek-flash|codex/u.test(gvModelInfo) || (ctx.summary.harness.gvSeedModels ?? []).some((m) => /vds-deepseek-flash/u.test(String(m))), "GV (the target) runs the vds harness", gvModelInfo);
  });

  // ---------------------------------------------------------------- F2 async, 75 s target (worker)
  if (SCENARIOS.includes("F2")) await runScenario(ctx, "F2", async () => {
    const id = "F2";
    const t0 = Date.now();
    const result = `F2_RESULT_${TAG}`;
    person(OWNER, `【跨会话测试 ${TAG}-F2】这是自动化测试，请严格照做：调用一次 sessions_send 工具，参数 sessionKey="${GA_KEY}"，timeoutSeconds=0，message="【${TAG}-F2】这是自动化测试：先用 exec 工具运行 sleep 75（必须等它结束），然后只回复 ${result}"。工具返回后只回复一句「已交给房间 A」，然后立刻结束本轮：不要 sleep，不要轮询，不要读对方历史。结果回来时，把对方的回复告诉我（必须包含 ${result}）。`);
    const first = await waitSend(gw, ledger, t0, (r) => r.target?.sessionKey === GA_KEY, 300_000, "F2 send");
    const rec = await settled(first.sendId, ["handed_back", "cancelled", "skipped"], 600_000, "F2 handed back");
    const batch = await gw.waitFor(() => { const b = ledger.batch(rec.batchId); return b?.phase === "woken" || b?.phase === "skipped" ? b : null; }, 300_000, "F2 batch woken");
    const hb = await gw.waitFor(() => handbacks(t0, rec.code)[0], 60_000, "F2 hand-back line");
    const wakeReply = await waitMsg(OWNER, hb.createdAt, new RegExp(result), 300_000, "F2 wake reply").catch(() => null);
    await sleep(5000);
    const dmItems = (await transcript(rpc, DM_KEY)).items;
    const toolsBeforeSeal = toolsBetween(dmItems, t0, batch.sealedAt ?? Infinity);
    const anchor = anchors(GA, t0, rec.code);
    const after = chatMsgs(GA, t0).filter((m) => m.createdAt >= (anchor[0]?.createdAt ?? 0) && !anchor.includes(m));
    const streamed = after.filter((m) => m.history.some((h) => h.op === "edit"));
    const targetFinal = after.filter((m) => finalText(m).includes(result));
    const wakeUsers = await interSessionUsers(DM_KEY, "wake", batch.batchId);
    const gaUsers = await interSessionUsers(GA_KEY, "request", rec.sendId);
    const tailMs = (batch.sealedAt ?? Infinity) - rec.createdAt;
    const dmAfterHb = chatMsgs(OWNER, hb.createdAt).filter((m) => m !== hb);
    ctx.summary.harness.requesterTailMs = { ...(ctx.summary.harness.requesterTailMs ?? {}), F2_worker: tailMs };
    evidence(id, "send", sendEvidence(rec));
    evidence(id, "batch", batchEvidence(batch));
    evidence(id, "ga", chatMsgs(GA, t0).map(view));
    evidence(id, "dm", chatMsgs(OWNER, t0).map(view));
    evidence(id, "requesterTools", toolsBeforeSeal);
    evidence(id, "requesterTailMs", tailMs);
    evidence(id, "log", relayLog(t0));
    check(id, rec.mode === "async" && rec.phase === "handed_back" && !rec.failure, "async send handed back with a result", { phase: rec.phase, failure: rec.failure });
    check(id, rec.targetRun?.runId === contracts.runIdFor("request", rec.sendId, rec.attempt) && (rec.targetRun.endedAt - rec.targetRun.startedAt) >= 70_000, "target turn: preset runId, ran ≥ 70 s (the 75 s exec)", rec.targetRun);
    check(id, tailMs < 60_000, "requester_tail_ms < 60 s (the requester ended its turn after acceptance)", tailMs);
    check(id, toolsBeforeSeal.includes("sessions_send") && !toolsBeforeSeal.some((t) => /^(exec|process|sessions_history|session_status|sessions_list|sleep)$/u.test(t)), "the requester never slept, polled or read the target", toolsBeforeSeal);
    check(id, anchor.length >= 1 && String(anchor[0].messageId) === String(rec.request.messageId) && /^📨 来自「/u.test(finalText(anchor[0])), "📨 anchor with #code in GA", anchor.map(view));
    check(id, streamed.length >= 1, "Telegram draft edits: the target's reply streamed (editMessageText on its message)", after.map(view));
    check(id, targetFinal.length >= 1 && targetFinal[0].createdAt > anchor[0].createdAt, "the target's answer follows the anchor in GA", targetFinal.map(view));
    check(id, handbacks(t0).length === 1 && /^↩️/u.test(finalText(hb)), "exactly one ↩️ hand-back in the DM", handbacks(t0).map(view));
    check(id, Boolean(wakeReply) && dmAfterHb.filter((m) => finalText(m).includes(result)).length === 1, "exactly one wake reply after the hand-back, carrying the result", dmAfterHb.map(view));
    check(id, batch.phase === "woken" && batch.wake?.runId === contracts.runIdFor("wake", batch.batchId, batch.wake.attempt ?? 0), "batch woken once with the preset wake runId", batch.wake);
    check(id, wakeUsers.length === 1, "DM transcript: exactly one wake message for the batch", wakeUsers.length);
    check(id, gaUsers.length === 1, "GA transcript: exactly one inter_session request message", gaUsers.length);
    evidence(id, "backgroundLine", chatMsgs(OWNER, t0).some((m) => m.history.some((h) => /会话请求/u.test(h.text ?? ""))));
  });

  // ---------------------------------------------------------------- F3 BUSY at the guard
  if (SCENARIOS.includes("F3")) await runScenario(ctx, "F3", async () => {
    const id = "F3";
    await gw.waitFor(() => !ledger.sends().some((r) => r.target?.sessionKey === GA_KEY && !contracts.SEND_TERMINAL_PHASES.includes(r.phase)), 300_000, "GA idle in the ledger");
    await sleep(3000);
    const t0 = Date.now();
    const result = `F3_RESULT_${TAG}`;
    const done = `PERSON_DONE_${TAG}`;
    person(OWNER, `【跨会话测试 ${TAG}-F3】这是自动化测试，请严格照做：调用一次 sessions_send 工具，参数 sessionKey="${GA_KEY}"，timeoutSeconds=0，message="【${TAG}-F3】这是自动化测试，请只回复 ${result}"。工具返回后只回复一句「已交给房间 A」，然后立刻结束本轮。结果回来时把对方的回复告诉我（必须包含 ${result}）。`);
    const first = await waitSend(gw, ledger, t0, (r) => r.target?.sessionKey === GA_KEY, 300_000, "F3 send");
    // the plugin's precheck found GA idle and holds the start for START_DELAY_MS: a person writes now
    const starting = await (async () => { for (const until = Date.now() + 120_000; Date.now() < until; await sleep(50)) { const r = ledger.send(first.sendId); if (r?.phase === "starting" || r?.phase === "running") return r; } return null; })();
    const p = person(GA, `【${TAG}-F3 真人】这是自动化测试：先用 exec 运行 sleep 20，然后只回复 ${done}`);
    ctx.step("F3: person wrote while the request was starting", { phase: starting?.phase, sinceStartingMs: starting ? Date.now() - (historyAt(starting, /^starting/u) ?? Date.now()) : null });
    const busyRec = await gw.waitFor(() => { const r = ledger.send(first.sendId); return r && (historyAt(r, /busy:/u) || ["running", "target_done", "result_ready", "handed_back"].includes(r.phase)) ? r : null; }, 120_000, "F3 busy or started");
    const rec = await settled(first.sendId, ["handed_back", "cancelled", "skipped"], 600_000, "F3 handed back");
    const hb = await gw.waitFor(() => handbacks(t0, rec.code)[0], 120_000, "F3 hand-back line");
    await waitMsg(OWNER, hb.createdAt, new RegExp(result), 300_000, "F3 wake reply").catch(() => null);
    await sleep(4000);
    const startingAt = historyAt(rec, /^starting/u);
    const busyAt = historyAt(rec, /busy:/u);
    const runningAt = historyAt(rec, /^running/u);
    const anchor = anchors(GA, t0, rec.code)[0];
    const personMsgs = new Set(chatMsgs(GA, p.at).filter((m) => finalText(m).includes(done)).map((m) => m.messageId));
    // A call belongs to the person's turn when it touches one of its messages (or the person's own message).
    const isPerson = (mid) => personMsgs.has(Number(mid)) || Number(mid) === Number(p.messageId);
    const createdBy = (c) => chatMsgs(GA, 0).find((m) => Math.abs(m.createdAt - c.at) < 200 && String(m.history[0]?.text ?? "") === String(c.params?.text ?? c.params?.caption ?? ""));
    const windowCalls = busyAt ? visibleCalls(GA, startingAt, busyAt + 1500) : [];
    const strayInWindow = windowCalls.filter((c) => (/^send/u.test(c.method) ? !isPerson(createdBy(c)?.messageId) : !isPerson(c.params?.message_id)));
    const beforeStart = chatMsgs(GA, t0).filter((m) => m !== anchor && m.createdAt < (runningAt ?? Infinity) && !personMsgs.has(m.messageId));
    const anchorReactions = fake.calls.filter((c) => c.at >= t0 && c.method === "setMessageReaction" && String(c.params?.chat_id) === GA && String(c.params?.message_id) === String(anchor?.messageId));
    const deletes = fake.calls.filter((c) => c.at >= t0 && c.method === "deleteMessage" && String(c.params?.chat_id) === GA);
    const gaItems = (await transcript(rpc, GA_KEY)).items.filter((m) => (m.at ?? 0) >= t0 - 1000);
    const reqUsers = gaItems.filter((m) => m.role === "user" && m.provenance === "inter_session" && String(m.origin ?? "").endsWith(`:req:${rec.sendId}`));
    const personIdx = gaItems.findIndex((m) => m.role === "user" && m.text.includes(`${TAG}-F3 真人`));
    const reqIdx = gaItems.findIndex((m) => reqUsers.includes(m));
    const personReply = gaItems.slice(personIdx + 1, reqIdx < 0 ? undefined : reqIdx).filter((m) => m.role === "assistant").map((m) => m.text).join(" ");
    evidence(id, "send", sendEvidence(rec));
    evidence(id, "window", { startingAt, busyAt, runningAt, personAt: p.at });
    evidence(id, "windowCalls", windowCalls.map((c) => ({ at: new Date(c.at).toISOString().slice(11, 23), method: c.method, message_id: c.params?.message_id ?? null })));
    evidence(id, "chatActionsInWindow", busyAt ? fake.calls.filter((c) => c.at >= startingAt && c.at <= busyAt + 1500 && c.method === "sendChatAction" && String(c.params?.chat_id) === GA).length : null);
    evidence(id, "ga", chatMsgs(GA, t0).map(view));
    evidence(id, "gaTranscript", gaItems.map((m) => ({ role: m.role, prov: m.provenance, origin: m.origin, text: m.text.slice(0, 120) })));
    evidence(id, "log", relayLog(t0));
    check(id, Boolean(busyAt) && /busy: (active_run|pending_queue)/u.test(rec.history.map((h) => h.note ?? "").join(" ")), "the guard answered BUSY to a started attempt (failure path triggered)", rec.history);
    check(id, Boolean(busyAt) && windowCalls.length >= 0 && strayInWindow.length === 0, "BUSY: zero sendMessage/edit/delete/reaction in GA from the attempt", strayInWindow);
    check(id, beforeStart.length === 0, "nothing of the request in GA before it actually started (no orphan draft, no fallback)", beforeStart.map(view));
    check(id, anchorReactions.length === 0 && deletes.length === 0, "no reaction on the anchor, no deleted message", { anchorReactions: anchorReactions.length, deletes: deletes.length });
    check(id, !chatMsgs(GA, t0).some((m) => FAIL_TEXT.test(finalText(m))), "no error fallback text in GA");
    check(id, rec.attempt >= 1 && rec.targetRun?.runId === contracts.runIdFor("request", rec.sendId, rec.attempt), "started on a later attempt with that attempt's preset runId", { attempt: rec.attempt, runId: rec.targetRun?.runId });
    check(id, runningAt && personMsgs.size >= 1 && [...chatMsgs(GA, t0)].filter((m) => personMsgs.has(m.messageId)).every((m) => m.history.at(-1).at <= runningAt + 2000), "the request turn started after the person's turn finished", { runningAt, person: chatMsgs(GA, t0).filter((m) => personMsgs.has(m.messageId)).map(view) });
    check(id, reqUsers.length === 1, "GA transcript: exactly one inter_session message for the request (BUSY left none)", reqUsers.length);
    check(id, personIdx >= 0 && reqIdx > personIdx && !personReply.includes(result), "the person's turn did not see the request; the request ran after it", { personIdx, reqIdx });
    check(id, rec.phase === "handed_back" && !rec.failure && String(rec.result?.text ?? "").includes(result), "result handed back", rec.result);
    check(id, handbacks(t0).length === 1, "exactly one hand-back in the DM", handbacks(t0).map(view));
  });

  // ---------------------------------------------------------------- C control group: plugin DISABLED → v2
  if (SCENARIOS.includes("C")) await runScenario(ctx, "C", async () => {
    const id = "C";
    await gw.waitFor(() => !ledger.sends().some((r) => r.target?.sessionKey === GA_KEY && !contracts.SEND_TERMINAL_PHASES.includes(r.phase)), 300_000, "GA idle in the ledger");
    ledger.disable();
    await sleep(2000);
    const t0 = Date.now();
    const answer = `CTRL_${TAG}`;
    try {
      person(OWNER, `【跨会话测试 ${TAG}-C】这是自动化测试，请严格照做：调用一次 sessions_send 工具，参数 sessionKey="${GA_KEY}"，timeoutSeconds=90，message="【${TAG}-C】这是自动化测试，请只回复 ${answer}"。拿到工具结果后，只把对方的回答原样告诉我（必须包含 ${answer}）。不要调用其他工具。`);
      const reply = await waitMsg(OWNER, t0, new RegExp(answer), 360_000, "C requester reply").catch(() => null);
      await sleep(8000);
      const gaUsers = (await transcript(rpc, GA_KEY)).items.filter((m) => (m.at ?? 0) >= t0 && m.role === "user");
      evidence(id, "ga", chatMsgs(GA, t0).map(view));
      evidence(id, "dm", chatMsgs(OWNER, t0).map(view));
      evidence(id, "gaUsers", gaUsers.map((m) => ({ prov: m.provenance, origin: m.origin, text: m.text.slice(0, 160) })));
      evidence(id, "log", gw.logSince(t0, /sessions-send|sessions_send|v-session-relay/u).slice(-20));
      check(id, ledger.sends().filter((r) => r.createdAt >= t0).length === 0, "DISABLED: the plugin recorded nothing (v2 path)");
      check(id, anchors(GA, t0).length === 0, "old behaviour reproduced: no visible request (no 📨 anchor) in the target chat", chatMsgs(GA, t0).map(view));
      check(id, gaUsers.some((m) => m.provenance === "inter_session" && !String(m.origin ?? "").startsWith("v-a2a:")), "the target still ran the request through v2 (inter_session, no v-a2a tag)", gaUsers.map((m) => m.origin));
      evidence(id, "requesterGotAnswer", Boolean(reply));
    } finally {
      ledger.enable();
    }
  });

  // ---------------------------------------------------------------- F5 kill -9 during the target turn
  if (SCENARIOS.includes("F5")) await runScenario(ctx, "F5", async () => {
    const id = "F5";
    await gw.waitFor(() => !ledger.sends().some((r) => r.target?.sessionKey === GA_KEY && !contracts.SEND_TERMINAL_PHASES.includes(r.phase)), 300_000, "GA idle in the ledger");
    await sleep(3000);
    const t0 = Date.now();
    const result = `F5_RESULT_${TAG}`;
    person(OWNER, `【跨会话测试 ${TAG}-F5】这是自动化测试，请严格照做：调用一次 sessions_send 工具，参数 sessionKey="${GA_KEY}"，timeoutSeconds=0，message="【${TAG}-F5】这是自动化测试：先用 exec 工具运行 sleep 90（必须等它结束），然后只回复 ${result}"。工具返回后只回复一句「已交给房间 A」，然后立刻结束本轮。结果回来时把结果告诉我。`);
    const first = await waitSend(gw, ledger, t0, (r) => r.target?.sessionKey === GA_KEY, 300_000, "F5 send");
    const running = await settled(first.sendId, ["running"], 300_000, "F5 target running");
    await sleep(15_000);
    const before = ledger.send(first.sendId);
    const killedAt = Date.now();
    await gw.kill9();
    rpc.reset();
    const getMeBefore = fake.callsOf("getMe").length;
    await sleep(2000);
    gw.start();
    await gw.waitFor(() => fake.callsOf("getMe").length > getMeBefore, 600_000, "Telegram getMe after restart");
    await gw.waitFor(() => gw.lines.some((l) => l.pid === gw.proc.pid && /v-session-relay 2\.0 started/u.test(l.line)), 300_000, "v-session-relay restarted");
    const restartedAt = Date.now();
    const rec = await settled(first.sendId, ["handed_back", "cancelled", "skipped"], 900_000, "F5 handed back after restart");
    const batch = await gw.waitFor(() => { const b = ledger.batch(rec.batchId); return b?.phase === "woken" || b?.phase === "skipped" ? b : null; }, 300_000, "F5 batch woken");
    await gw.waitFor(() => handbacks(t0, rec.code)[0], 120_000, "F5 hand-back line").catch(() => null);
    await sleep(20_000);
    const hbs = handbacks(t0, rec.code);
    const wakeUsers = await interSessionUsers(DM_KEY, "wake", batch.batchId);
    const anchor = anchors(GA, t0, rec.code);
    const notes = chatMsgs(GA, killedAt).filter((m) => /^⚠️/u.test(finalText(m)) && finalText(m).includes(`#${rec.code}`));
    const recovered = Boolean(rec.targetRun?.recoveryRunId) && !rec.failure;
    // wedge check: a person's message after the restart is answered
    const alive = `ALIVE_${TAG}`;
    const ta = Date.now();
    person(GA, `【${TAG}-F5 重启后】这是自动化测试，只回复 ${alive}`);
    const aliveReply = await waitMsg(GA, ta, new RegExp(alive), 420_000, "GA answers after the restart").catch(() => null);
    evidence(id, "before", sendEvidence(before));
    evidence(id, "send", sendEvidence(rec));
    evidence(id, "batch", batchEvidence(batch));
    evidence(id, "times", { killedAt, restartedAt, runningAt: historyAt(running, /^running/u) });
    evidence(id, "ga", chatMsgs(GA, t0).map(view));
    evidence(id, "dm", chatMsgs(OWNER, t0).map(view));
    evidence(id, "log", relayLog(killedAt));
    check(id, before.phase === "running", "Gateway killed while the target turn was running", before.phase);
    check(id, (notes.length === 1 && rec.failure?.class === "interrupted") !== recovered && (notes.length === 1 || recovered), "exactly one of: a restart note in GA, or a recovery turn's result", { notes: notes.map(view), failure: rec.failure, recoveryRunId: rec.targetRun?.recoveryRunId });
    if (notes.length) check(id, String(notes[0].replyTo) === String(rec.request.messageId), "the restart note replies to the anchor (anchor reply)", view(notes[0]));
    check(id, hbs.length === 1, "exactly one hand-back line for #code in the DM", hbs.map(view));
    check(id, batch.phase === "woken" && wakeUsers.length === 1, "exactly one wake turn in the DM", { phase: batch.phase, wakeUsers: wakeUsers.length });
    check(id, anchor.length >= 1, "anchor present (Telegram post is at-least-once; duplicates recorded)", anchor.length);
    evidence(id, "anchorCount", anchor.length);
    check(id, Boolean(aliveReply), "GA answers a person after the restart (not wedged)", aliveReply && view(aliveReply));
    check(id, !gw.logSince(restartedAt - 60_000, /restart recovery claim changed/u).length, "no restart-recovery wedge in the log");
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
  ctx.summary.ledger = { sends: ledger.sends().map(sendEvidence), batches: ledger.batches().map(batchEvidence) };
  try { rpc?.reset(); } catch { /* ignore */ }
  await gw?.stop();
  gw?.cleanup();
  await fake.close();
  finish(ctx);
}
