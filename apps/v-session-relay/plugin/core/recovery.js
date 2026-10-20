// Restart recovery (design §6.3). Runs in the background after the engine starts; vrelay.send
// keeps working meanwhile. Targets whose turn may still be in flight carry a recoveryLock so the
// pump does not start anything there until their record is settled.
//
// Four layers keep a wake from running twice (§6.4): (1) the ledger CAS to `waking` before the
// bridge is called; (2) `wake.startedAt` (phase woken) or the transcript tag; (3) the core's
// MessageSid dedupe; (4) the Feishu post uuid for the hand-back anchor.
//
// Nothing is re-run once it may have started: a target turn that was running is followed
// through the core's own restart recovery, or reported as interrupted.

import { RESTART_WEDGE_RE, feishuPostUuid } from "./contracts.js";
import { reasonText, summaryInterruptedNote } from "./copy.js";
import { isBatchTerminal, isSendTerminal } from "./ledger.js";
import { formatForChannel } from "./visible.js";

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, Math.max(0, ms)); t.unref?.(); });

/** Wait up to `ms` for a core recovery run on `sessionKey` (an entry claim or a lifecycle event). */
async function observeRecoveryRun(engine, { sessionKey, agentId, sourceRunId, since, ms }) {
  const deadline = engine.now() + ms;
  const step = Math.max(20, Math.min(1_000, ms / 4));
  for (;;) {
    const entry = engine.routes.entryOf(sessionKey, agentId, { fresh: true });
    if (sourceRunId && entry?.restartRecoveryDeliverySourceRunId === sourceRunId && entry.restartRecoveryDeliveryRunId) {
      return entry.restartRecoveryDeliveryRunId;
    }
    const ev = (engine.sessionEvents.get(sessionKey) ?? []).find((e) => e.at >= since && e.runId && !engine.ourRuns.has(e.runId) && !String(e.runId).startsWith("v-a2a-"));
    if (ev) return ev.runId;
    if (engine.now() >= deadline) return null;
    await sleep(step);
  }
}

async function runEndStatus(engine, runId) {
  const waits = [engine._waitRunEnd(runId, engine.limits.runTimeoutMs)];
  if (typeof engine.agent?.waitRun === "function") waits.push(engine.agent.waitRun(runId).then((o) => o?.status ?? null).catch(() => null));
  return Promise.race(waits);
}

/** A target turn that was (or may have been) running when the Gateway went down. */
async function recoverRunning(engine, sendId, report) {
  let rec = engine.ledger.getSend(sendId);
  if (!rec) return;
  if (rec.phase === "starting") {
    rec = await engine._updateSend(sendId, (d) => { d.phase = "running"; }, { from: ["starting"], note: "recovered: request reached the transcript" });
    if (!rec) return;
  }
  const target = rec.target.sessionKey;
  const since = engine.startedAt ?? engine.now();
  const entry = engine.routes.entryOf(target, rec.target.agentId, { fresh: true });
  let recoveryRunId = null;
  if (entry?.restartRecoveryDeliverySourceRunId && entry.restartRecoveryDeliverySourceRunId === rec.targetRun.runId && entry.restartRecoveryDeliveryRunId) {
    recoveryRunId = entry.restartRecoveryDeliveryRunId;
  } else if (entry?.status === "running" && !engine._precheckBusy(target)) {
    report.interrupted += 1;
    await engine._fail(sendId, { class: "interrupted", code: "restart_wedge", reason: reasonText("restart_wedge") }, { note: "wedge" });
    return;
  } else {
    recoveryRunId = await observeRecoveryRun(engine, { sessionKey: target, agentId: rec.target.agentId, sourceRunId: rec.targetRun.runId, since, ms: engine.timing.recoveryObserveMs });
  }
  if (!recoveryRunId) {
    report.interrupted += 1;
    await engine._fail(sendId, { class: "interrupted", code: "restart", reason: reasonText("restart") }, { note: "interrupted" });
    return;
  }
  await engine._updateSend(sendId, (d) => { d.targetRun.recoveryRunId = recoveryRunId; }, { note: `following core recovery run ${recoveryRunId}` });
  const status = await runEndStatus(engine, recoveryRunId);
  if (!status) {
    await engine._fail(sendId, { class: "timeout", code: "timeout", reason: reasonText("timeout", { h: Math.round(engine.limits.runTimeoutMs / 3600_000) }) });
    return;
  }
  const text = await engine._transcriptReply(target, rec.kind, rec.sendId).catch(() => null);
  const ro = { status, finals: text ? [{ text }] : [], visibleReplySent: Boolean(text), finalCount: text ? 1 : 0, ...(status !== "ok" ? { error: status } : {}) };
  await engine._onSendTurnEnd(sendId, recoveryRunId, ro, "target", "transcript");
}

async function recoverSend(engine, sendId, report) {
  const rec = engine.ledger.getSend(sendId);
  if (!rec || isSendTerminal(rec)) return;
  report.sends += 1;
  switch (rec.phase) {
    case "accepted":
    case "posting":
      report.reposted += 1;
      await engine._postAnchor(sendId); // same uuid: Feishu dedupes, other channels repeat the #code
      return;
    case "posted":
    case "queued": {
      const next = await engine._updateSend(sendId, (d) => { d.phase = "queued"; d.attempt += 1; }, { from: ["posted", "queued"], note: "recovered: queued again" });
      if (next) { report.requeued += 1; engine._makeReady(next); }
      return;
    }
    case "starting": {
      const tagged = await engine._transcriptHasTag(rec.target.sessionKey, rec.kind, rec.sendId).catch(() => null);
      if (tagged === false) {
        const next = await engine._updateSend(sendId, (d) => { d.phase = "queued"; d.attempt += 1; }, { from: ["starting"], note: "recovered: never started" });
        if (next) { report.requeued += 1; engine._makeReady(next); }
        return;
      }
      // Tagged, or the transcript cannot be read: it may have started, so never re-run it.
      await recoverRunning(engine, sendId, report);
      return;
    }
    case "running":
      await recoverRunning(engine, sendId, report);
      return;
    case "target_done":
      await engine._evaluate(sendId);
      return;
    case "awaiting_children": {
      const children = engine.ledger.batchesWhere((b) => b.servesSendId === sendId);
      const open = children.some((b) => !isBatchTerminal(b) || (b.phase === "woken" && !b.wake?.endedAt));
      if (!open) await engine._evaluate(sendId);
      return;
    }
    case "awaiting_background":
      engine._armBackground(sendId, 0);
      return;
    case "result_ready":
    case "failure_ready":
      await engine._onSettled(rec);
      return;
    default:
  }
}

/** A wake that was admitted but never seen ending (§6.3 "waking … 汇总被打断"). */
async function recoverInterruptedWake(engine, batchId, report) {
  const b = engine.ledger.getBatch(batchId);
  if (!b || b.wake?.endedAt) return;
  const key = b.requester.sessionKey;
  const recoveryRunId = await observeRecoveryRun(engine, { sessionKey: key, agentId: b.requester.agentId, sourceRunId: b.wake.runId, since: engine.startedAt ?? engine.now(), ms: engine.timing.recoveryObserveMs });
  let status = null;
  let text = null;
  if (recoveryRunId) {
    status = await runEndStatus(engine, recoveryRunId);
    text = await engine._transcriptReply(key, "wake", batchId).catch(() => null);
  } else {
    report.interrupted += 1;
    const side = { transport: b.wake.transport ?? "agent", bridgeKey: b.requester.route ? `${b.requester.route.channel}:${b.requester.route.accountId}` : null, route: b.requester.route };
    const codes = b.members.map((id) => engine.ledger.getSend(id)?.code).filter(Boolean);
    if (side.route) {
      try {
        await engine._postTo(side, {
          text: formatForChannel(side.route.channel, [summaryInterruptedNote({ code: codes.join(" #") || batchId })]),
          idempotencyKey: feishuPostUuid("wake", batchId, "interrupted"),
          ...(b.wake.handbackMessageId && b.wake.handbackMessageId !== "posted" ? { replyToMessageId: b.wake.handbackMessageId } : {}),
        });
      } catch (err) {
        engine.logger?.warn?.(`v-session-relay: summary note for ${batchId} not posted: ${err?.message ?? err}`);
      }
    }
  }
  await engine.ledger.updateBatch(batchId, (d) => { d.wake.endedAt = engine.now(); d.wake.status = status ?? "interrupted"; });
  if (!b.servesSendId) return;
  const s = engine.ledger.getSend(b.servesSendId);
  if (!s || s.phase !== "awaiting_children") return;
  if (status === "ok") {
    await engine._updateSend(s.sendId, (d) => { d.pending = { text: text ?? "", media: [], noReply: !text, status: "ok", source: "transcript", fromRunId: recoveryRunId }; });
    await engine._evaluate(s.sendId);
  } else {
    const failure = RESTART_WEDGE_RE.test(String(status ?? ""))
      ? { class: "interrupted", code: "restart_wedge", reason: reasonText("restart_wedge") }
      : { class: "interrupted", code: "restart", reason: reasonText("restart") };
    await engine._fail(s.sendId, failure);
  }
}

async function recoverBatch(engine, batchId, report) {
  const b = engine.ledger.getBatch(batchId);
  if (!b) return;
  report.batches += 1;
  switch (b.phase) {
    case "open":
      // Every run from before the restart is gone; its batch is complete.
      await engine._sealBatch(batchId);
      return;
    case "sealed":
      await engine._checkBatch(batchId);
      return;
    case "ready":
      engine._enqueueWake(b);
      return;
    case "waking": {
      const tagged = await engine._transcriptHasTag(b.requester.sessionKey, "wake", batchId).catch(() => null);
      if (tagged === false) {
        const next = await engine.ledger.updateBatch(batchId, (d) => { d.phase = "ready"; d.wake.attempt += 1; }, { from: ["waking"] });
        if (next) { report.rewoken += 1; engine._enqueueWake(next); }
        return;
      }
      // Admitted before the restart (or unknowable): it counts as woken; never wake twice.
      await engine.ledger.updateBatch(batchId, (d) => { d.phase = "woken"; d.wake.recoveredAt = engine.now(); }, { from: ["waking"] });
      for (const id of b.members) {
        await engine._updateSend(id, (d) => { if (d.phase !== "result_ready" && d.phase !== "failure_ready") return false; d.phase = "handed_back"; return undefined; });
      }
      await recoverInterruptedWake(engine, batchId, report);
      return;
    }
    default:
  }
}

/** Run §6.3 once. Resolves with a small report (counts) when everything is scheduled or settled. */
export async function recover(engine, { waitForBridges = true } = {}) {
  const { ledger, timing, logger } = engine;
  const report = { sends: 0, batches: 0, reposted: 0, requeued: 0, interrupted: 0, rewoken: 0, reverted: 0, expired: 0 };
  const uncertain = ledger.sendsWhere((r) => r.phase === "starting" || r.phase === "running");
  const lockCount = new Map();
  for (const r of uncertain) {
    engine.recoveryLock.add(r.target.sessionKey);
    lockCount.set(r.target.sessionKey, (lockCount.get(r.target.sessionKey) ?? 0) + 1);
  }
  const release = (key) => {
    const n = (lockCount.get(key) ?? 1) - 1;
    if (n > 0) { lockCount.set(key, n); return; }
    lockCount.delete(key);
    engine.recoveryLock.delete(key);
    engine._schedulePump(key, 0);
  };
  // Every run from before the restart is gone (workers die with the Gateway): remember them as
  // ended so late joins seal at once, and so their lifecycle never re-triggers a seal.
  for (const r of ledger.sendsWhere((x) => !isSendTerminal(x) && x.requester?.runId)) if (!engine.ourRuns.has(r.requester.runId)) engine._rememberEnded(r.requester.runId, "restart");
  for (const b of ledger.batchesWhere((x) => x.phase === "open" && x.requester?.runId)) engine._rememberEnded(b.requester.runId, "restart");
  try {
    if (waitForBridges) {
      const routeKey = (route) => (route?.channel ? `${route.channel}:${route.accountId ?? "default"}` : null);
      const keys = new Set([
        ...ledger.sendsWhere((r) => !isSendTerminal(r)).map((r) => r.target.bridgeKey),
        ...ledger.sendsWhere((r) => !isSendTerminal(r)).map((r) => routeKey(r.requester?.route)),
        ...ledger.batchesWhere((b) => !isBatchTerminal(b) || !b.wake?.endedAt).map((b) => (b.requester?.route ? `${b.requester.route.channel}:${b.requester.route.accountId}` : null)),
      ].filter(Boolean));
      await Promise.all([...keys].map((k) => engine.bridge.waitFor(k, timing.bridgeReadyMs)));
    }

    // Requesters from before the restart are gone: nobody will claim an inline result now.
    for (const r of ledger.sendsWhere((x) => x.mode === "inline" && !isSendTerminal(x) && !x.inline?.claimedAt && !x.inline?.expiredAt)) {
      await engine._expireInline(r.sendId, "restart");
      report.expired += 1;
    }
    // A claimed inline result whose requester run was never seen ending may not have reached anyone.
    for (const r of ledger.sendsWhere((x) => x.phase === "delivered_inline" && x.inline?.claimedAt && !x.inline?.requesterEnd)) {
      if (await engine._revertInline(r.sendId, "restart")) report.reverted += 1;
    }
    // Batch membership written on one side of a crash only.
    for (const b of ledger.batchesWhere((x) => !isBatchTerminal(x))) {
      if (b.members.some((id) => !ledger.getSend(id))) {
        await ledger.updateBatch(b.batchId, (d) => { d.members = d.members.filter((id) => ledger.getSend(id)); });
      }
    }
    // A woken batch whose members were not all marked yet (crash between the two writes).
    for (const b of ledger.batchesWhere((x) => x.phase === "woken")) {
      for (const id of b.members) {
        await engine._updateSend(id, (d) => { if (d.phase !== "result_ready" && d.phase !== "failure_ready") return false; d.phase = "handed_back"; return undefined; }, { note: "recovered: batch was woken" });
      }
    }
    for (const r of ledger.sendsWhere((x) => x.batchId && !isSendTerminal(x))) {
      const b = ledger.getBatch(r.batchId);
      if (!b) await engine._joinBatch(r, r.batchId, { create: true, ctx: { sealed: true } });
      else if (!b.members.includes(r.sendId) && !isBatchTerminal(b)) await engine._joinBatch(r, r.batchId, {});
    }

    const sends = ledger.sendsWhere((r) => !isSendTerminal(r)).sort((a, b) => a.createdAt - b.createdAt);
    const sendJobs = sends.map((r) => {
      const locked = r.phase === "starting" || r.phase === "running";
      return recoverSend(engine, r.sendId, report)
        .catch((err) => logger?.error?.(`v-session-relay: recovery of ${r.sendId} failed: ${err?.stack ?? err}`))
        .finally(() => { if (locked) release(r.target.sessionKey); });
    });
    const batchJobs = ledger.batchesWhere((b) => !isBatchTerminal(b)).map((b) => recoverBatch(engine, b.batchId, report)
      .catch((err) => logger?.error?.(`v-session-relay: recovery of ${b.batchId} failed: ${err?.stack ?? err}`)));
    const wakeJobs = ledger.batchesWhere((b) => b.phase === "woken" && b.wake?.startedAt && !b.wake?.endedAt).map((b) => recoverInterruptedWake(engine, b.batchId, report)
      .catch((err) => logger?.error?.(`v-session-relay: recovery of wake ${b.batchId} failed: ${err?.stack ?? err}`)));
    await Promise.all([...sendJobs, ...batchJobs, ...wakeJobs]);
  } finally {
    for (const key of [...lockCount.keys()]) { lockCount.set(key, 1); release(key); }
  }
  logger?.info?.(`v-session-relay: recovery done ${JSON.stringify(report)}`);
  return report;
}
