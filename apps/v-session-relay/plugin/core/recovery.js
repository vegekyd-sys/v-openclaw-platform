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

/** The run the core's restart recovery registered for `sourceRunId` on this session (entry claim), or null. */
function claimedRecoveryRun(engine, { sessionKey, agentId, sourceRunId }) {
  if (!sourceRunId) return null;
  const entry = engine.routes.entryOf(sessionKey, agentId, { fresh: true });
  return entry?.restartRecoveryDeliverySourceRunId === sourceRunId && entry.restartRecoveryDeliveryRunId ? entry.restartRecoveryDeliveryRunId : null;
}

/** Wait up to `ms` for a core recovery run on `sessionKey` (an entry claim or a lifecycle event). */
async function observeRecoveryRun(engine, { sessionKey, agentId, sourceRunId, since, ms }) {
  const deadline = engine.now() + ms;
  const step = Math.max(20, Math.min(1_000, ms / 4));
  for (;;) {
    const claimed = claimedRecoveryRun(engine, { sessionKey, agentId, sourceRunId });
    if (claimed) return { runId: claimed, claimed: true };
    const ev = (engine.sessionEvents.get(sessionKey) ?? []).find((e) => e.at >= since && e.runId && !engine.ourRuns.has(e.runId) && !String(e.runId).startsWith("v-a2a-"));
    if (ev) return { runId: ev.runId, claimed: false };
    if (engine.now() >= deadline) return null;
    await sleep(step);
  }
}

/** True once `runId` shows life within `ms`: the session is busy, or the run was seen on the lifecycle stream. */
async function runShowsLife(engine, { sessionKey, runId, ms }) {
  const deadline = engine.now() + ms;
  const step = Math.max(20, Math.min(1_000, ms / 4));
  for (;;) {
    if (engine.endedRuns.has(runId) || (engine.sessionEvents.get(sessionKey) ?? []).some((e) => e.runId === runId) || engine._precheckBusy(sessionKey)) return true;
    if (engine.now() >= deadline) return false;
    await sleep(step);
  }
}

/**
 * Who finishes a turn that was in flight at the restart (§6.3): the core's restart recovery run,
 * followed to its end, or nobody. `{ runId }` to follow; otherwise `{ wedge }`:
 *   - a claim on the entry that nothing runs within the observation window is the wedge of memory
 *     v-restart-recovery-wedge (status running + restartRecoveryDeliveryRunId + no process);
 *   - with no claim, the session is watched for a recovery run first (the core may claim it only
 *     after this recovery looked), and only a session still "running" with no active run is wedged.
 */
async function findRecoveryRun(engine, { sessionKey, agentId, sourceRunId }) {
  const since = engine.startedAt ?? engine.now();
  const ms = engine.timing.recoveryObserveMs;
  const seen = await observeRecoveryRun(engine, { sessionKey, agentId, sourceRunId, since, ms });
  if (seen && (!seen.claimed || await runShowsLife(engine, { sessionKey, runId: seen.runId, ms }))) return { runId: seen.runId, claimed: seen.claimed };
  if (seen?.claimed) return { wedge: true };
  const entry = engine.routes.entryOf(sessionKey, agentId, { fresh: true });
  return { wedge: entry?.status === "running" && !engine._precheckBusy(sessionKey) };
}

/** The core's recovery run continues one of our turns: its own sends belong to the same request (§2.d). */
async function adoptRecoveryRun(engine, run) {
  if (!run?.runId || await engine.ledger.getRun(run.runId)) return;
  await engine.ledger.putRun({ leaf: false, batchId: null, ...run, createdAt: engine.now() });
}

const turnRunRecord = (rec, role, runId) => ({
  runId, sessionKey: rec.target.sessionKey, role, chainId: rec.chainId, depth: rec.depth,
  leaf: role === "ask", servesSendId: rec.sendId, batchId: null,
});

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
  const found = await findRecoveryRun(engine, { sessionKey: target, agentId: rec.target.agentId, sourceRunId: rec.targetRun.runId });
  if (!found.runId) {
    report.interrupted += 1;
    if (found.wedge) await engine._fail(sendId, { class: "interrupted", code: "restart_wedge", reason: reasonText("restart_wedge") }, { note: "wedge" });
    else await engine._fail(sendId, { class: "interrupted", code: "restart", reason: reasonText("restart") }, { note: "interrupted" });
    return;
  }
  const recoveryRunId = found.runId;
  if (found.claimed) await adoptRecoveryRun(engine, turnRunRecord(rec, rec.kind === "ask" ? "ask" : "request", recoveryRunId));
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

/** A collect turn that was (or may have been) running at the restart: followed or reported, never re-run. */
async function recoverCollect(engine, sendId, report) {
  const rec = engine.ledger.getSend(sendId);
  if (!rec || rec.phase !== "awaiting_background") return;
  const target = rec.target.sessionKey;
  const found = await findRecoveryRun(engine, { sessionKey: target, agentId: rec.target.agentId, sourceRunId: rec.collect?.runId });
  if (!found.runId) {
    report.interrupted += 1;
    const code = found.wedge ? "restart_wedge" : "restart";
    await engine._fail(sendId, { class: "interrupted", code, reason: reasonText(code) }, { note: found.wedge ? "wedge" : "interrupted" });
    return;
  }
  if (found.claimed) await adoptRecoveryRun(engine, turnRunRecord(rec, "collect", found.runId));
  await engine._updateSend(sendId, (d) => { d.collect = { ...(d.collect ?? {}), recoveryRunId: found.runId }; }, { note: `following core recovery run ${found.runId}` });
  const status = await runEndStatus(engine, found.runId);
  if (!status) {
    await engine._fail(sendId, { class: "timeout", code: "timeout", reason: reasonText("timeout", { h: Math.round(engine.limits.runTimeoutMs / 3600_000) }) });
    return;
  }
  const text = await engine._transcriptReply(target, "collect", rec.sendId).catch(() => null);
  const ro = { status, finals: text ? [{ text }] : [], visibleReplySent: Boolean(text), finalCount: text ? 1 : 0, ...(status !== "ok" ? { error: status } : {}) };
  await engine._onSendTurnEnd(sendId, found.runId, ro, "collect", "transcript");
}

/**
 * A collect turn is in doubt when it was admitted (startedAt) and never seen ending, or when its
 * start was under way: then the transcript decides (no `:col:` tag → it never started). The tag
 * does not carry the round, so an earlier round's tag counts as "may have started" (never re-run).
 */
async function collectInDoubt(engine, rec) {
  const c = rec.collect;
  if (!c?.runId || c.endedAt) return false;
  if (c.startedAt) return true;
  const tagged = await engine._transcriptHasTag(rec.target.sessionKey, "collect", rec.sendId).catch(() => null);
  return tagged !== false;
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
      if (await collectInDoubt(engine, rec)) { await recoverCollect(engine, sendId, report); return; }
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
  const found = await findRecoveryRun(engine, { sessionKey: key, agentId: b.requester.agentId, sourceRunId: b.wake.runId });
  const recoveryRunId = found.runId ?? null;
  if (found.claimed) {
    await adoptRecoveryRun(engine, { runId: recoveryRunId, sessionKey: key, role: "wake", chainId: b.chainId, depth: b.depth, leaf: false, servesSendId: b.servesSendId ?? null, batchId: b.batchId });
  }
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
  const collecting = (r) => r.phase === "awaiting_background" && r.collect?.runId && !r.collect.endedAt;
  const uncertain = ledger.sendsWhere((r) => r.phase === "starting" || r.phase === "running" || collecting(r));
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
    // A core recovery run that already claimed one of our turns may send before this recovery
    // reaches its record: register it now so its sends join the same request (§2.d), not a new chain.
    for (const r of uncertain) {
      const role = r.phase === "awaiting_background" ? "collect" : r.kind === "ask" ? "ask" : "request";
      const sourceRunId = role === "collect" ? r.collect?.runId : r.targetRun?.runId;
      const claimed = claimedRecoveryRun(engine, { sessionKey: r.target.sessionKey, agentId: r.target.agentId, sourceRunId });
      if (claimed) await adoptRecoveryRun(engine, turnRunRecord(r, role, claimed)).catch(() => {});
    }
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
      const locked = r.phase === "starting" || r.phase === "running" || collecting(r);
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
