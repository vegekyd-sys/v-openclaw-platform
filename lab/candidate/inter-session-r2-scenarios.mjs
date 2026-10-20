// The §10.5 scenarios of the R2 candidates, written once against a channel adapter
// (lab/candidate/inter-session-{telegram,dingtalk,wecom}.mjs supply one each).
//
// Adapter:
//   name, bridgeKey, streaming (bool), replyAnchor (bool)
//   keys: { dm, ga, gv }      session keys: the requester DM (worker), target GA (worker), target GV (vds)
//   chats: { dm, ga, gv }     the fake platform's chat ids
//   person(chat, text) -> { at, id }                    a person's message (the owner)
//   items(chat, since) -> [{ id, at, kind, text, history:[{at, op, text}], replyTo, deleted }]
//                                                        what the bot made visible in that chat
//   writes(chat, from, to) -> [{ at, what, itemId }]    every visible write (send, edit, card stream,
//                                                        reaction, delete, webhook post …) with the item it touches
//   anchorId(item) -> string                            the id post() returned for an anchor item
//   extra?.{F1,F2,F3,F5}(env, s, info)                  channel checks
//
// env: { ctx, gw, rpc, ledger, ad, startDelayMs }
import {
  BAD_LOG_RE, batchEvidence, contracts, historyAt, rawMessages, runScenario, sendEvidence, sessionRow, sleep, toolsBetween, transcript, waitSend,
} from "./inter-session-r2-lib.mjs";

const TERMINAL = contracts.SEND_TERMINAL_PHASES;
export const FAIL_TEXT = /Something went wrong|出错了|暂未收到模型回复|No response|empty response|visibleReplies/iu;
const strip = (t) => String(t ?? "").replace(/^[\s*#>_`]+/u, "");

export function helpers(env) {
  const { ctx, gw, ledger, ad, rpc } = env;
  const h = {
    items: (chat, since = 0) => ad.items(chat, since),
    view: (m) => ({ id: m.id, kind: m.kind, at: new Date(m.at).toISOString().slice(11, 23), replyTo: m.replyTo ?? null, ops: (m.history ?? []).map((x) => x.op).join(","), deleted: Boolean(m.deleted), text: String(m.text ?? "").slice(0, 240) }),
    waitItem: (chat, since, re, ms, label) => gw.waitFor(() => ad.items(chat, since).find((m) => !m.deleted && re.test(String(m.text ?? ""))), ms, label),
    anchors: (chat, since, code) => ad.items(chat, since).filter((m) => /^(📨|❓)/u.test(strip(m.text)) && (!code || String(m.text).includes(`#${code}`))),
    handbacks: (since, code) => ad.items(ad.chats.dm, since).filter((m) => /^(↩️|💬|⚠️|⏹)/u.test(strip(m.text)) && (!code || String(m.text).includes(`#${code}`))),
    settled: (id, phases, ms, label) => gw.waitFor(() => { const r = ledger.send(id); return r && phases.includes(r.phase) ? r : null; }, ms, label),
    woken: (batchId, ms, label) => gw.waitFor(() => { const b = ledger.batch(batchId); return b?.phase === "woken" || b?.phase === "skipped" ? b : null; }, ms, label),
    idle: (key) => gw.waitFor(() => !ledger.sends().some((r) => r.target?.sessionKey === key && !TERMINAL.includes(r.phase)) && !ledger.batches().some((b) => b.requester?.sessionKey === key && !["woken", "skipped"].includes(b.phase)), 600_000, `${key} idle in the ledger`),
    relayLog: (since) => gw.logSince(since, /v-session-relay|inter-session|vrelay/u).slice(-40),
    async interSessionUsers(sessionKey, kind, id) {
      const t = await transcript(rpc, sessionKey);
      // chat.history projects a sessions_send message to role "assistant" ("Forwarded from …"); the provenance stays.
      return t.items.filter((m) => m.provenance === "inter_session" && String(m.origin ?? "").endsWith(`:${contracts.kindAbbr(kind)}:${id}`));
    },
    ask: (chatText) => ad.person(ad.chats.dm, chatText),
    tag: ctx.tag,
  };
  return h;
}

const asyncAsk = (tag, id, key, body, done) => `【跨会话测试 ${tag}-${id}】这是自动化测试，请严格照做：调用一次 sessions_send 工具，参数 sessionKey="${key}"，timeoutSeconds=0，message="【${tag}-${id}】这是自动化测试：${body}"。工具返回后只回复一句「已交出」，然后立刻结束本轮：不要 sleep，不要轮询，不要读对方历史。结果回来时，把对方的回复告诉我（必须包含 ${done}）。`;
const inlineAsk = (tag, id, key, answer, seconds = 120) => `【跨会话测试 ${tag}-${id}】这是自动化测试，请严格照做：调用一次 sessions_send 工具，参数 sessionKey="${key}"，timeoutSeconds=${seconds}，message="【${tag}-${id}】这是自动化测试，请只回复 ${answer}"。拿到工具结果后，只把对方的回答原样告诉我（必须包含 ${answer}）。不要调用其他工具。`;

// ---------------------------------------------------------------- F1 inline
export function F1(env, { target = "gv", requester = "dm", vdsSide = "target", id = "F1" } = {}) {
  const { ctx, gw, rpc, ledger, ad } = env;
  const h = helpers(env);
  const { check, evidence } = ctx;
  return runScenario(ctx, id, async () => {
    const key = ad.keys[target];
    const chat = ad.chats[target];
    const reqChat = ad.chats[requester];
    await h.idle(key);
    const t0 = Date.now();
    const answer = `${id}_ANSWER_${ctx.tag}`;
    ad.person(reqChat, inlineAsk(ctx.tag, id, key, answer));
    const first = await waitSend(gw, ledger, t0, (r) => r.target?.sessionKey === key, 300_000, `${id} send`);
    const rec = await h.settled(first.sendId, ["delivered_inline", "handed_back", "cancelled", "skipped"], 420_000, `${id} settled`);
    const reply = await h.waitItem(reqChat, t0, new RegExp(answer), 300_000, `${id} requester reply`).catch(() => null);
    await sleep(5000);
    const anchor = h.anchors(chat, t0, rec.code);
    const anchorIds = new Set(anchor.map((m) => m.id));
    const targetReplies = h.items(chat, t0).filter((m) => String(m.text).includes(answer) && !anchorIds.has(m.id));
    const dmTools = toolsBetween((await transcript(rpc, ad.keys[requester])).items, t0);
    const users = await h.interSessionUsers(key, "request", rec.sendId);
    const row = await sessionRow(rpc, ad.keys[vdsSide === "requester" ? requester : target]);
    const modelInfo = JSON.stringify(Object.fromEntries(Object.entries(row ?? {}).filter(([k]) => /model|runtime|provider|harness/iu.test(k))));
    evidence(id, "send", sendEvidence(rec));
    evidence(id, "target", h.items(chat, t0).map(h.view));
    evidence(id, "requesterChat", h.items(reqChat, t0).map(h.view));
    evidence(id, "dmTools", dmTools);
    evidence(id, "vdsSession", { side: vdsSide, info: modelInfo });
    evidence(id, "log", h.relayLog(t0));
    check(id, rec.mode === "inline" && rec.edge === "delegate", "inline delegate send recorded", { mode: rec.mode, edge: rec.edge });
    check(id, rec.phase === "delivered_inline", "the answer was claimed inline (delivered_inline)", rec.phase);
    check(id, rec.target.transport === "bridge" && rec.target.bridgeKey === ad.bridgeKey, `target reached through the ${ad.name} bridge`, rec.target);
    check(id, rec.targetRun?.runId === contracts.runIdFor("request", rec.sendId, rec.attempt), "the target turn ran with the preset runId", rec.targetRun);
    check(id, String(rec.result?.text ?? "").includes(answer), "ledger result carries the answer", rec.result);
    check(id, anchor.length >= 1 && ad.anchorId(anchor[0]) === String(rec.request.messageId), "📨 anchor with #code in the target chat, the ledger's anchor id", anchor.map(h.view));
    check(id, targetReplies.length >= 1 && targetReplies.every((m) => m.at >= (anchor[0]?.at ?? Infinity)), "the target shows its answer, after the anchor", targetReplies.map(h.view));
    check(id, Boolean(reply), "the requester told the owner the answer (the tool result reached it)", reply && h.view(reply));
    const reqHandbacks = h.items(reqChat, t0).filter((m) => /^(↩️|💬|⚠️|⏹)/u.test(strip(m.text)));
    check(id, reqHandbacks.length === 0, "no hand-back line in the requester chat for an inline answer", reqHandbacks.map(h.view));
    check(id, !ledger.batches().some((b) => b.members?.includes(rec.sendId) && b.phase === "woken"), "no wake for the inline send");
    check(id, users.length === 1, "target transcript: exactly one inter_session message for the request", users.length);
    check(id, dmTools.includes("sessions_send") && dmTools.every((t) => t === "sessions_send"), "the requester only called sessions_send", dmTools);
    if (vdsSide) check(id, /vds-deepseek-flash|codex/u.test(modelInfo), `the ${vdsSide} session runs the vds harness`, modelInfo);
    await ad.extra?.F1?.(env, { id, t0, rec, anchor, targetReplies });
  });
}

// ---------------------------------------------------------------- F2 async, long target
/** The F2 work: exec, read, exec, so a progress view changes while the target works (≈ the sum of the sleeps). */
export const F2_TASK = (sleeps, result) => `先用 exec 工具运行 sleep ${sleeps[0]}，再用 read 工具读取 AGENTS.md 的前 5 行，再用 exec 工具运行 sleep ${sleeps[1]}（分三次调用，每次都等它结束），然后只回复 ${result}`;
export function F2(env, { target = "ga", id = "F2", sleeps = [35, 40] } = {}) {
  const sleepSecs = sleeps.reduce((a, b) => a + b, 0);
  const { ctx, gw, rpc, ledger, ad } = env;
  const h = helpers(env);
  const { check, evidence } = ctx;
  return runScenario(ctx, id, async () => {
    const key = ad.keys[target];
    const chat = ad.chats[target];
    await h.idle(key);
    const t0 = Date.now();
    const result = `${id}_RESULT_${ctx.tag}`;
    h.ask(asyncAsk(ctx.tag, id, key, F2_TASK(sleeps, result), result));
    const first = await waitSend(gw, ledger, t0, (r) => r.target?.sessionKey === key, 300_000, `${id} send`);
    const rec = await h.settled(first.sendId, ["handed_back", "cancelled", "skipped"], 600_000, `${id} handed back`);
    const batch = await h.woken(rec.batchId, 300_000, `${id} batch woken`);
    const hb = await gw.waitFor(() => h.handbacks(t0, rec.code)[0], 90_000, `${id} hand-back line`);
    const wakeReply = await h.waitItem(ad.chats.dm, hb.at, new RegExp(result), 300_000, `${id} wake reply`).catch(() => null);
    await sleep(6000);
    const dmItems = (await transcript(rpc, ad.keys.dm)).items;
    const toolsBeforeSeal = toolsBetween(dmItems, t0, batch.sealedAt ?? Infinity);
    const anchor = h.anchors(chat, t0, rec.code);
    const anchorIds = new Set(anchor.map((m) => m.id));
    const after = h.items(chat, t0).filter((m) => m.at >= (anchor[0]?.at ?? 0) && !anchorIds.has(m.id));
    const targetFinal = after.filter((m) => String(m.text).includes(result));
    const wakeUsers = await h.interSessionUsers(ad.keys.dm, "wake", batch.batchId);
    const users = await h.interSessionUsers(key, "request", rec.sendId);
    const tailMs = (batch.sealedAt ?? Infinity) - rec.createdAt;
    const dmAfterHb = h.items(ad.chats.dm, hb.at).filter((m) => m.id !== hb.id);
    ctx.summary.harness.requesterTailMs = { ...(ctx.summary.harness.requesterTailMs ?? {}), [`${ad.name}:${id}`]: tailMs };
    const info = { id, t0, rec, batch, hb, anchor, after, targetFinal, wakeReply };
    evidence(id, "send", sendEvidence(rec));
    evidence(id, "batch", batchEvidence(batch));
    evidence(id, "target", h.items(chat, t0).map(h.view));
    evidence(id, "dm", h.items(ad.chats.dm, t0).map(h.view));
    evidence(id, "requesterTools", toolsBeforeSeal);
    evidence(id, "requesterTailMs", tailMs);
    evidence(id, "log", h.relayLog(t0));
    check(id, rec.mode === "async" && rec.phase === "handed_back" && !rec.failure, "async send handed back with a result", { phase: rec.phase, failure: rec.failure });
    check(id, rec.targetRun?.runId === contracts.runIdFor("request", rec.sendId, rec.attempt) && (rec.targetRun.endedAt - rec.targetRun.startedAt) >= (sleepSecs - 5) * 1000, `target turn: preset runId, ran ≥ ${sleepSecs - 5} s (the exec)`, rec.targetRun);
    check(id, tailMs < 60_000, "requester_tail_ms < 60 s (the requester ended its turn after acceptance)", tailMs);
    check(id, toolsBeforeSeal.includes("sessions_send") && !toolsBeforeSeal.some((t) => /^(exec|process|sessions_history|session_status|sessions_list|sleep)$/u.test(t)), "the requester never slept, polled or read the target", toolsBeforeSeal);
    check(id, anchor.length >= 1 && ad.anchorId(anchor[0]) === String(rec.request.messageId) && /^📨 来自「/u.test(strip(anchor[0].text)), "📨 anchor with #code in the target chat", anchor.map(h.view));
    check(id, targetFinal.length >= 1 && targetFinal[0].at > anchor[0].at, "the target's answer is visible in its chat, after the anchor", targetFinal.map(h.view));
    check(id, h.handbacks(t0).length === 1 && /^↩️/u.test(strip(hb.text)), "exactly one ↩️ hand-back in the DM", h.handbacks(t0).map(h.view));
    check(id, Boolean(wakeReply) && dmAfterHb.filter((m) => String(m.text).includes(result)).length === 1, "exactly one wake reply after the hand-back, carrying the result", dmAfterHb.map(h.view));
    check(id, batch.phase === "woken" && batch.wake?.runId === contracts.runIdFor("wake", batch.batchId, batch.wake.attempt ?? 0), "batch woken once with the preset wake runId", batch.wake);
    check(id, wakeUsers.length === 1, "DM transcript: exactly one wake message for the batch", wakeUsers.length);
    check(id, users.length === 1, "target transcript: exactly one inter_session request message", users.length);
    evidence(id, "backgroundLine", h.items(ad.chats.dm, t0).some((m) => (m.history ?? []).some((x) => /会话请求/u.test(x.text ?? ""))));
    await ad.extra?.F2?.(env, info);
  });
}

// ---------------------------------------------------------------- F3 BUSY at the core guard
export function F3(env, { target = "ga", id = "F3", personSleepSecs = 20 } = {}) {
  const { ctx, gw, rpc, ledger, ad } = env;
  const h = helpers(env);
  const { check, evidence } = ctx;
  return runScenario(ctx, id, async () => {
    const key = ad.keys[target];
    const chat = ad.chats[target];
    await h.idle(key);
    await sleep(3000);
    const t0 = Date.now();
    const result = `${id}_RESULT_${ctx.tag}`;
    const done = `PERSON_DONE_${ctx.tag}`;
    h.ask(asyncAsk(ctx.tag, id, key, `请只回复 ${result}`, result));
    const first = await waitSend(gw, ledger, t0, (r) => r.target?.sessionKey === key, 300_000, `${id} send`);
    // The plugin's precheck found the target idle and now holds the start for startDelayMs: a person writes.
    let starting = null;
    for (const until = Date.now() + 180_000; Date.now() < until && !starting; await sleep(40)) {
      const r = ledger.send(first.sendId);
      if (r && ["starting", "running", "target_done", "result_ready", "handed_back"].includes(r.phase)) starting = r;
    }
    const p = ad.person(chat, `【${ctx.tag}-${id} 真人】这是自动化测试：先用 exec 运行 sleep ${personSleepSecs}，然后只回复 ${done}`);
    ctx.step(`${id}: person wrote while the request was starting`, { phase: starting?.phase, msAfterStarting: starting ? p.at - (historyAt(starting, /^starting/u) ?? p.at) : null });
    const rec = await h.settled(first.sendId, ["handed_back", "cancelled", "skipped"], 600_000, `${id} handed back`);
    const hb = await gw.waitFor(() => h.handbacks(t0, rec.code)[0], 120_000, `${id} hand-back line`);
    await h.waitItem(ad.chats.dm, hb.at, new RegExp(result), 300_000, `${id} wake reply`).catch(() => null);
    await sleep(5000);
    const startingAt = historyAt(rec, /^starting/u);
    const busyAt = historyAt(rec, /busy:/u);
    const runningAt = historyAt(rec, /^running/u);
    const anchor = h.anchors(chat, t0, rec.code)[0];
    const personFinals = h.items(chat, p.at).filter((m) => String(m.text).includes(done) || (m.history ?? []).some((x) => String(x.text ?? "").includes(done)));
    const personFinalAt = Math.min(...personFinals.map((m) => m.at));
    // The person's turn's own progress draft: created after the person wrote, removed when that turn answered.
    const endOf = (m) => Math.max(m.at, ...(m.history ?? []).map((x) => x.at ?? 0));
    const finalIds = new Set(personFinals.map((m) => m.id));
    const personDrafts = h.items(chat, p.at).filter((m) => m.deleted && !finalIds.has(m.id) && Math.abs(endOf(m) - personFinalAt) <= 5000);
    const personItems = [...personFinals, ...personDrafts];
    const personIds = new Set([String(p.id), ...personItems.map((m) => String(m.id))]);
    const windowWrites = busyAt ? ad.writes(chat, startingAt, busyAt + 1500) : [];
    const stray = windowWrites.filter((w) => !personIds.has(String(w.itemId)));
    const beforeStart = h.items(chat, t0).filter((m) => m.id !== anchor?.id && m.at < (runningAt ?? Infinity) && !personIds.has(String(m.id)));
    const items = (await transcript(rpc, key)).items.filter((m) => (m.at ?? 0) >= t0 - 1000);
    const reqUsers = items.filter((m) => m.provenance === "inter_session" && String(m.origin ?? "").endsWith(`:req:${rec.sendId}`));
    const personIdx = items.findIndex((m) => m.role === "user" && m.text.includes(`${ctx.tag}-${id} 真人`));
    const reqIdx = items.findIndex((m) => reqUsers.includes(m));
    const personReply = items.slice(personIdx + 1, reqIdx < 0 ? undefined : reqIdx).filter((m) => m.role === "assistant").map((m) => m.text).join(" ");
    const personEnd = Math.max(0, ...personFinals.flatMap((m) => (m.history ?? []).map((x) => x.at)));
    const info = { id, t0, rec, startingAt, busyAt, runningAt, anchor, personItems, personIds, p };
    evidence(id, "send", sendEvidence(rec));
    evidence(id, "window", { startingAt, busyAt, runningAt, personAt: p.at, personEnd, personItems: personItems.map((m) => m.id) });
    evidence(id, "windowWrites", windowWrites.map((w) => ({ at: new Date(w.at).toISOString().slice(11, 23), what: w.what, itemId: w.itemId })));
    evidence(id, "target", h.items(chat, t0).map(h.view));
    evidence(id, "targetTranscript", items.map((m) => ({ role: m.role, prov: m.provenance, origin: m.origin, text: m.text.slice(0, 120) })));
    evidence(id, "log", h.relayLog(t0));
    check(id, Boolean(busyAt) && /busy: (active_run|pending_queue)/u.test((rec.history ?? []).map((x) => x.note ?? "").join(" ")), "the guard answered BUSY to a started attempt (the failure path ran)", rec.history);
    check(id, Boolean(busyAt) && stray.length === 0, "BUSY: zero visible writes in the target chat from the attempt (send/edit/card/reaction/delete)", stray);
    check(id, beforeStart.length === 0, "nothing of the request in the target chat before it started (no orphan card/draft/fallback)", beforeStart.map(h.view));
    check(id, !h.items(chat, t0).some((m) => FAIL_TEXT.test(String(m.text))), "no error/empty-reply fallback text in the target chat");
    check(id, rec.attempt >= 1 && rec.targetRun?.runId === contracts.runIdFor("request", rec.sendId, rec.attempt), "started on a later attempt with that attempt's preset runId", { attempt: rec.attempt, runId: rec.targetRun?.runId });
    check(id, Boolean(runningAt) && personFinals.length >= 1 && personEnd <= runningAt + 3000, "the request turn started after the person's turn had answered", { runningAt, personEnd });
    check(id, reqUsers.length === 1, "target transcript: exactly one inter_session message for the request (BUSY left none)", reqUsers.length);
    check(id, personIdx >= 0 && reqIdx > personIdx && !personReply.includes(result), "the person's turn did not see the request; the request ran after it", { personIdx, reqIdx });
    check(id, rec.phase === "handed_back" && !rec.failure && String(rec.result?.text ?? "").includes(result), "result handed back", rec.result);
    check(id, h.handbacks(t0).length === 1, "exactly one hand-back in the DM", h.handbacks(t0).map(h.view));
    await ad.extra?.F3?.(env, info);
  });
}

// ---------------------------------------------------------------- C control group: DISABLED → v2
export function C(env, { target = "ga", id = "C" } = {}) {
  const { ctx, gw, rpc, ledger, ad } = env;
  const h = helpers(env);
  const { check, evidence } = ctx;
  return runScenario(ctx, id, async () => {
    const key = ad.keys[target];
    const chat = ad.chats[target];
    await h.idle(key);
    ledger.disable();
    await sleep(2000);
    const t0 = Date.now();
    const answer = `CTRL_${ctx.tag}`;
    try {
      h.ask(inlineAsk(ctx.tag, id, key, answer, 90));
      const reply = await h.waitItem(ad.chats.dm, t0, new RegExp(answer), 360_000, `${id} requester reply`).catch(() => null);
      await sleep(8000);
      const users = (await transcript(rpc, key)).items.filter((m) => (m.at ?? 0) >= t0 && (m.role === "user" || m.provenance));
      evidence(id, "target", h.items(chat, t0).map(h.view));
      evidence(id, "dm", h.items(ad.chats.dm, t0).map(h.view));
      evidence(id, "targetUsers", users.map((m) => ({ prov: m.provenance, origin: m.origin, text: m.text.slice(0, 160) })));
      evidence(id, "log", gw.logSince(t0, /sessions-send|sessions_send|v-session-relay/u).slice(-20));
      evidence(id, "requesterGotAnswer", Boolean(reply));
      check(id, ledger.sends().filter((r) => r.createdAt >= t0).length === 0, "DISABLED: the plugin recorded nothing (v2 path)");
      check(id, h.anchors(chat, t0).length === 0, "old behaviour reproduced: no visible request (no 📨 anchor) in the target chat", h.items(chat, t0).map(h.view));
      check(id, users.some((m) => m.provenance === "inter_session" && !String(m.origin ?? "").startsWith("v-a2a:")), "the target ran the request through v2 (inter_session, no v-a2a tag)", users.map((m) => m.origin));
    } finally {
      ledger.enable();
    }
  });
}

// ---------------------------------------------------------------- F5 kill -9 during the target turn
export function F5(env, { target = "ga", id = "F5", sleepSecs = 90, waitReady }) {
  const { ctx, gw, rpc, ledger, ad } = env;
  const h = helpers(env);
  const { check, evidence } = ctx;
  return runScenario(ctx, id, async () => {
    const key = ad.keys[target];
    const chat = ad.chats[target];
    await h.idle(key);
    await sleep(3000);
    const t0 = Date.now();
    const result = `${id}_RESULT_${ctx.tag}`;
    h.ask(asyncAsk(ctx.tag, id, key, `先用 exec 工具运行 sleep ${sleepSecs}（必须等它结束），然后只回复 ${result}`, result));
    const first = await waitSend(gw, ledger, t0, (r) => r.target?.sessionKey === key, 300_000, `${id} send`);
    const running = await h.settled(first.sendId, ["running"], 300_000, `${id} target running`);
    await sleep(15_000);
    const before = ledger.send(first.sendId);
    const killedAt = Date.now();
    await gw.kill9();
    rpc.reset();
    await sleep(2000);
    gw.start();
    await waitReady();
    await gw.waitFor(() => gw.lines.some((l) => l.pid === gw.proc.pid && /v-session-relay 2\.0 started/u.test(l.line)), 300_000, "v-session-relay restarted");
    const restartedAt = Date.now();
    const settledRec = await h.settled(first.sendId, ["result_ready", "failure_ready", "handed_back", "cancelled", "skipped"], 900_000, `${id} settled after restart`);
    evidence(id, "pluginReadTarget", await rawMessages(rpc, key, 20));
    evidence(id, "settledAs", sendEvidence(settledRec));
    const rec = await h.settled(first.sendId, ["handed_back", "cancelled", "skipped"], 600_000, `${id} handed back after restart`);
    const batch = await h.woken(rec.batchId, 300_000, `${id} batch woken`);
    await gw.waitFor(() => h.handbacks(t0, rec.code)[0], 120_000, `${id} hand-back line`).catch(() => null);
    await sleep(25_000);
    const hbs = h.handbacks(t0, rec.code);
    const wakeUsers = await h.interSessionUsers(ad.keys.dm, "wake", batch.batchId);
    const anchors = h.anchors(chat, t0, rec.code);
    const notes = h.items(chat, killedAt).filter((m) => /^⚠️/u.test(strip(m.text)) && String(m.text).includes(`#${rec.code}`));
    const recovered = Boolean(rec.targetRun?.recoveryRunId) && !rec.failure;
    // A recovery turn that answered in the target chat must hand that answer back, not "no text result".
    const recoveredText = h.items(chat, killedAt).filter((m) => !m.deleted && String(m.text).includes(result));
    const alive = `ALIVE_${ctx.tag}`;
    const ta = Date.now();
    ad.person(chat, `【${ctx.tag}-${id} 重启后】这是自动化测试，只回复 ${alive}`);
    const aliveReply = await h.waitItem(chat, ta, new RegExp(alive), 420_000, "the target chat answers after the restart").catch(() => null);
    const info = { id, t0, rec, batch, notes, anchors, killedAt };
    evidence(id, "before", sendEvidence(before));
    evidence(id, "send", sendEvidence(rec));
    evidence(id, "batch", batchEvidence(batch));
    evidence(id, "times", { killedAt, restartedAt, runningAt: historyAt(running, /^running/u) });
    evidence(id, "target", h.items(chat, t0).map(h.view));
    evidence(id, "dm", h.items(ad.chats.dm, t0).map(h.view));
    evidence(id, "log", h.relayLog(killedAt));
    check(id, before.phase === "running", "the Gateway was killed while the target turn ran", before.phase);
    check(id, (notes.length === 1 && rec.failure?.class === "interrupted") !== recovered && (notes.length === 1 || recovered), "exactly one of: a restart note in the target chat, or a recovery turn's result", { notes: notes.map(h.view), failure: rec.failure, recoveryRunId: rec.targetRun?.recoveryRunId });
    if (recovered) check(id, recoveredText.length === 0 || String(rec.result?.text ?? "").includes(result), "a recovery turn's visible answer is what gets handed back (not \"no text result\")", { visible: recoveredText.map(h.view), result: rec.result });
    if (notes.length && ad.replyAnchor) check(id, String(notes[0].replyTo) === String(rec.request.messageId), "the restart note replies to the anchor", h.view(notes[0]));
    check(id, hbs.length === 1, "exactly one hand-back line for #code in the DM", hbs.map(h.view));
    check(id, batch.phase === "woken" && wakeUsers.length === 1, "exactly one wake turn in the DM", { phase: batch.phase, wakeUsers: wakeUsers.length });
    check(id, anchors.length >= 1, "the anchor is there (at-least-once outside Feishu; the count is evidence)", anchors.length);
    evidence(id, "anchorCount", anchors.length);
    check(id, Boolean(aliveReply), "the target chat answers a person after the restart (not wedged)", aliveReply && h.view(aliveReply));
    check(id, !gw.logSince(restartedAt - 60_000, /restart recovery claim changed/u).length, "no restart-recovery wedge in the log");
    await ad.extra?.F5?.(env, info);
  });
}

/** Log lines that must not appear (Invalid URL / ECONNREFUSED: DingTalk webhook fallbacks; wedges; crashes). */
export function badLog(gw, since) {
  return gw.logSince(since, BAD_LOG_RE);
}
