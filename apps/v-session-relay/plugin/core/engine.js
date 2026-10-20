// The Gateway-side engine of plugin 2.0 (design §2.b–§2.d, §4–§6): accepts sends, keeps one
// FIFO per session, starts request / ask / collect / wake turns through a transport, follows
// them to the end, seals and wakes batches, continues W(S), and hands every send back exactly
// once. All durable state is in the ledger; everything here in memory can be rebuilt by
// recovery.js after a restart.
//
// Methods prefixed with `_` are internal but shared with recovery.js and the tests.

import {
  DEFERRED_MEMORY_FLUSH, RESTART_WEDGE_RE, SEND_SETTLED_PHASES, SEND_TERMINAL_PHASES, TASK_REGISTRY_BRIDGE, TIMEOUTS,
  feishuPostUuid, isBridgeError, messageSha256, newBatchId, newChainId, newCode, newSendId, parseInterSessionRunId,
  runIdFor, sendContentKey, validateSendParams, validateStartOutcome,
} from "./contracts.js";
import {
  acceptedNote, anchorHeadLines, busyLine, dedupeNote, handbackText, inlineExpiredNote, inlineFailedNote, inlineNoReplyNote,
  inlineOkNote, isQueueLine, queuedLine, reasonText, routeErrorText, targetCancelledNote, targetInterruptedNote,
  targetNotStartedNote, targetWedgedNote, truncatedLine, WECOM_LINE, collectAnchorText,
} from "./copy.js";
import { isUnsupportedRequester, isUnsupportedTarget } from "./labels.js";
import { isBatchTerminal, isSendTerminal } from "./ledger.js";
import { classify, countSend, waitEdges } from "./policy.js";
import { SessionQueue } from "./queue.js";
import { failureOfRun, memberItem, outputOf, sendStartRequest, wakeStartRequest } from "./requests.js";
import { audienceFor, formatForChannel, visibleRequestBody } from "./visible.js";

export const DEFAULT_TIMING = Object.freeze({
  pumpDebounceMs: 1_500,
  busyBackoffMs: Object.freeze([5_000, 10_000, 20_000, 40_000, 60_000]),
  idleRecheckMs: 30_000,
  backgroundPollMs: 30_000,
  queueNoteAfterMs: 30 * 60_000,
  anchorPostMs: TIMEOUTS.anchorPostMs,
  postRetryMs: Object.freeze([2_000, 10_000, 30_000]),
  sweepMs: 30_000,
  archiveEveryMs: 6 * 3600_000,
  recoveryObserveMs: 120_000,
  transcriptGapMs: 500,
  bridgeReadyMs: TIMEOUTS.bridgeReadyMs,
  lostRunGraceMs: 60_000,
});

const ACTIVE_PHASES = Object.freeze(["accepted", "posting", "posted", "queued", "starting", "running", "target_done", "awaiting_children", "awaiting_background"]);
const BACKGROUND_KINDS = new Set(["exec", "image_generation", "video_generation", "music_generation"]);
const ENDED_RUNS_MAX = 2000;
const MAX_REJECTS = 3;

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, Math.max(0, ms)); t.unref?.(); });
const lower = (s) => String(s ?? "").trim().toLowerCase();
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
const isSettled = (rec) => SEND_SETTLED_PHASES.includes(rec?.phase);

function bridgeErrorInfo(err) {
  const code = isBridgeError(err) || ["CHAT_GONE", "NOT_MEMBER", "CHANNEL_DOWN", "POST_FAILED"].includes(err?.code) ? err.code : "CHANNEL_DOWN";
  const transient = typeof err?.transient === "boolean" ? err.transient : code === "CHANNEL_DOWN" || code === "POST_FAILED";
  return { code, transient: transient && code !== "CHAT_GONE" && code !== "NOT_MEMBER" };
}

export class Engine {
  constructor({
    ledger, config, routes, bridge, agent, sdk = {}, runtime = {}, logger, now = Date.now, timing = {}, env = process.env,
    taskBridge = () => globalThis[TASK_REGISTRY_BRIDGE], flushSeam = () => globalThis[DEFERRED_MEMORY_FLUSH], onSendChange,
  }) {
    this.ledger = ledger;
    this.config = config;
    this.limits = config.limits;
    this.routes = routes;
    this.bridge = bridge;
    this.agent = agent;
    this.sdk = sdk;
    this.runtime = runtime;
    this.logger = logger;
    this.now = now;
    this.timing = { ...DEFAULT_TIMING, ...timing };
    this.env = env;
    this.taskBridge = taskBridge;
    this.flushSeam = flushSeam;
    this.onSendChange = onSendChange;

    this.queues = new Map();
    this.running = new Map(); // sessionKey → { kind, id, runId }
    this.runningRequests = 0;
    this.globalWaiting = new Set();
    this.recoveryLock = new Set();
    this.backoff = new Map(); // sessionKey → { level, until }
    this.pumpTimers = new Map();
    this.activeTurnBySession = new Map(); // our runs only (§13.3)
    this.ourRuns = new Map(); // runId → { kind, id, force }
    this.endedRuns = new Map(); // runId → { status, at }
    this.sessionEvents = new Map(); // sessionKey → [{ phase, runId, at }]
    this.runEndWaiters = new Map(); // runId → Set(resolve)
    this.waiters = new Map(); // sendId → Set(resolve)
    this.inlineTimers = new Map();
    this.bgTimers = new Map();
    this.postRetryTimers = new Map();
    this.locks = new Map();
    this.started = false;
    this.stopped = false;
    this.sweepTimer = null;
    this.lastArchiveAt = 0;
    this.taskListener = null;
  }

  // ================================================================== lifecycle

  start() {
    if (this.started) return;
    this.started = true;
    this.startedAt = this.now();
    this.sweepTimer = setInterval(() => { void this._sweep().catch((err) => this.logger?.warn?.(`v-session-relay: sweep failed: ${err?.message ?? err}`)); }, this.timing.sweepMs);
    this.sweepTimer.unref?.();
    const tb = this.taskBridge();
    if (tb?.listeners instanceof Set) {
      this.taskListener = (notice) => {
        for (const key of notice?.sessionKeys ?? []) this._backgroundCheckSession(key);
      };
      tb.listeners.add(this.taskListener);
    }
    // Re-arm inline expiry timers for loaded records.
    for (const rec of this.ledger.sends.values()) if (rec.mode === "inline" && !rec.inline?.expiredAt && !rec.inline?.claimedAt && !isSendTerminal(rec)) this._armInline(rec);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.sweepTimer);
    for (const t of [...this.pumpTimers.values(), ...this.inlineTimers.values(), ...this.bgTimers.values(), ...this.postRetryTimers.values()]) clearTimeout(t);
    this.pumpTimers.clear(); this.inlineTimers.clear(); this.bgTimers.clear(); this.postRetryTimers.clear();
    const tb = this.taskBridge();
    if (this.taskListener && tb?.listeners instanceof Set) tb.listeners.delete(this.taskListener);
    for (const set of this.waiters.values()) for (const fn of set) fn();
    this.waiters.clear();
    await this.ledger.flush();
  }

  _alive() { return this.started && !this.stopped && !this.ledger.dead; }

  async _withLock(key, fn) {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release;
    const mine = new Promise((r) => { release = r; });
    const tail = prev.then(() => mine);
    this.locks.set(key, tail);
    await prev;
    try { return await fn(); } finally {
      release();
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }

  _changed(rec) {
    if (!rec) return;
    for (const fn of this.waiters.get(rec.sendId) ?? []) fn();
    this.waiters.delete(rec.sendId);
    try { this.onSendChange?.(rec); } catch { /* listeners never break the engine */ }
  }

  async _updateSend(id, mutate, opts) {
    const rec = await this.ledger.updateSend(id, mutate, opts);
    if (rec) this._changed(rec);
    return rec;
  }

  // ================================================================== vrelay.send

  async send(params) {
    if (!this._alive()) return { status: "fallback", reason: "disabled" };
    const check = validateSendParams(params);
    if (!check.ok) return { status: "error", code: "INTERNAL", error: `vrelay.send: ${check.errors.join("; ")}` };
    if (await this.ledger.isDisabled()) return { status: "fallback", reason: "disabled" };
    const dup = this.ledger.findByIdempotencyKey(params.idempotencyKey);
    if (dup) return this._acceptedResult(dup, { deduped: true, sameCall: true });
    const req = params.requester;
    const tgt = params.target;
    if (isUnsupportedRequester(req.sessionKey)) return { status: "fallback", reason: "unsupported_requester" };
    if (tgt.sessionKey === req.sessionKey || isUnsupportedTarget(tgt.sessionKey)) return { status: "fallback", reason: "unsupported_target" };
    const contentKey = sendContentKey({ requesterSessionKey: req.sessionKey, targetSessionKey: tgt.sessionKey, message: params.message });
    const same = this.ledger.findInFlightByContent(contentKey, TIMEOUTS.contentDedupeMs);
    if (same) return this._acceptedResult(same, { deduped: true });

    let accepted;
    try {
      accepted = await this._withLock("accept", () => this._accept(params, contentKey));
    } catch (err) {
      this.logger?.error?.(`v-session-relay: vrelay.send failed: ${err?.stack ?? err}`);
      return { status: "error", code: "LEDGER", error: `会话转交没有记下来（${String(err?.message ?? err).slice(0, 80)}），这次没有发出。` };
    }
    if (accepted.status !== "accepted" || !accepted.rec) return accepted;
    const { rec, ctl } = accepted;
    if (rec.deduped) return this._acceptedResult(rec.rec, { deduped: true, sameCall: rec.sameCall });

    // Anchor: synchronous up to anchorPostMs, then in the background.
    // A ledger failure from here on leaves the send recorded; recovery finishes it after a restart.
    const posting = this._postAnchor(rec.sendId, ctl).catch((err) => {
      this.logger?.error?.(`v-session-relay: anchor flow for ${rec.sendId} failed: ${err?.message ?? err}`);
      return { ok: false, transient: true };
    });
    const outcome = await Promise.race([posting, sleep(this.timing.anchorPostMs).then(() => null)]);
    ctl.responded = true;
    if (outcome && outcome.ok === false && outcome.permanent) {
      return { status: "error", code: outcome.code, error: routeErrorText({ to: rec.target.label, reason: reasonText(outcome.code) }) };
    }
    if (rec.mode === "inline") this._armInline(this.ledger.getSend(rec.sendId) ?? rec);
    return this._acceptedResult(this.ledger.getSend(rec.sendId) ?? rec, {});
  }

  /** Requester run, chain and principal (§2.d). Never guesses by time. */
  async _requesterContext(req) {
    let runId = req.runId ?? null;
    let run = runId ? await this.ledger.getRun(runId) : null;
    if (!run && runId) run = this._reconstructRun(runId);
    if (!run && !runId) {
      const active = this.activeTurnBySession.get(req.sessionKey);
      if (active) {
        runId = active;
        run = (await this.ledger.getRun(active)) ?? this._reconstructRun(active);
      }
    }
    if (run) {
      const chain = this.ledger.getChain(run.chainId);
      if (chain) {
        const servesSend = run.servesSendId ? this.ledger.getSend(run.servesSendId) : null;
        return { run, runId, chain, servesSend, principal: chain.principal ?? servesSend?.principal ?? null };
      }
    }
    const principal = { channel: req.channel ?? null, id: req.senderId ?? null, name: req.senderIsOwner ? this.config.ownerName : "", isOwner: req.senderIsOwner === true };
    return { run: null, runId, chain: null, servesSend: null, principal, root: true };
  }

  /** A plugin runId whose run file is missing: rebuild the role from the send / batch. */
  _reconstructRun(runId) {
    const parsed = parseInterSessionRunId(runId);
    if (!parsed) return null;
    if (parsed.kind === "wake") {
      const b = this.ledger.getBatch(parsed.id);
      return b ? { runId, sessionKey: b.requester.sessionKey, role: "wake", chainId: b.chainId, depth: b.depth, leaf: false, servesSendId: b.servesSendId, batchId: b.batchId, createdAt: b.createdAt } : null;
    }
    const s = this.ledger.getSend(parsed.id);
    if (!s) return null;
    return { runId, sessionKey: s.target.sessionKey, role: parsed.kind === "ask" ? "ask" : parsed.kind, chainId: s.chainId, depth: s.depth, leaf: parsed.kind === "ask", servesSendId: s.sendId, batchId: null, createdAt: s.createdAt };
  }

  _precheckBusy(sessionKey) {
    if (this.running.has(sessionKey)) return true;
    let active;
    try { active = this.sdk.resolveActiveEmbeddedRunSessionId?.(sessionKey); } catch { active = undefined; }
    if (active === undefined || active === null || active === "") return false;
    const seam = this.flushSeam();
    if (typeof seam?.activeAfterYield === "function") {
      try { if (seam.activeAfterYield({ sessionKey }) === false) return false; } catch { /* treat as busy */ }
    }
    return true;
  }

  /** Request items accepted but not started yet, over all sessions. */
  _pendingRequestItems() {
    let n = 0;
    for (const [key, q] of this.queues) {
      const slot = this.running.get(key);
      for (const it of q.items) if (it.kind === "request" && !(slot && slot.id === it.id)) n += 1;
    }
    return n;
  }

  _queue(sessionKey) {
    let q = this.queues.get(sessionKey);
    if (!q) { q = new SessionQueue(); this.queues.set(sessionKey, q); }
    return q;
  }

  async _accept(params, contentKey) {
    // Re-check under the lock: a concurrent call may have just accepted the same send.
    const dup = this.ledger.findByIdempotencyKey(params.idempotencyKey);
    if (dup) return { status: "accepted", rec: { deduped: true, sameCall: true, rec: dup } };
    const same = this.ledger.findInFlightByContent(contentKey, TIMEOUTS.contentDedupeMs);
    if (same) return { status: "accepted", rec: { deduped: true, rec: same } };

    const now = this.now();
    const req = params.requester;
    const tgt = params.target;
    const ctx = await this._requesterContext(req);
    const hint = req.to ? { channel: req.channel, to: req.to, accountId: req.accountId, threadId: req.threadId } : undefined;
    const [tRoute, rRoute] = await Promise.all([
      this.routes.resolve({ sessionKey: tgt.sessionKey, agentId: tgt.agentId }),
      this.routes.resolve({ sessionKey: req.sessionKey, agentId: req.agentId, hint }),
    ]);
    const targetLabel = this.routes.label({ sessionKey: tgt.sessionKey, agentId: tgt.agentId, route: tRoute.route, viewerAgentId: req.agentId });
    if (!tRoute.ok) return { status: "error", code: tRoute.code, error: routeErrorText({ to: targetLabel, reason: reasonText(tRoute.code) }) };
    const requesterLabel = this.routes.label({ sessionKey: req.sessionKey, agentId: req.agentId, route: rRoute.ok ? rRoute.route : null, viewerAgentId: tgt.agentId });

    const q = this._queue(tgt.sessionKey);
    const delegatesThisRun = ctx.runId ? this.ledger.sendsWhere((s) => s.requester.runId === ctx.runId && s.edge === "delegate" && s.phase !== "cancelled" && s.phase !== "skipped").length : 0;
    const decision = classify({
      requester: { sessionKey: req.sessionKey, label: requesterLabel },
      run: ctx.run, servesSend: ctx.servesSend, chain: ctx.chain,
      target: { sessionKey: tgt.sessionKey, label: targetLabel },
      mode: params.mode, inlineTimeoutMs: params.inlineTimeoutMs,
      edges: waitEdges(this.ledger.sends.values(), now), delegatesThisRun,
      requestQueueLength: q.countKind("request"), limits: this.limits, now,
    });
    if (!decision.ok) {
      this.logger?.info?.(`v-session-relay: forbidden ${decision.code} ${req.sessionKey} -> ${tgt.sessionKey}`);
      return { status: "forbidden", code: decision.code, error: decision.text };
    }

    // ---- ids and records
    const sendId = newSendId(now);
    const code = newCode((c) => this.ledger.codeTaken(c));
    const chainId = ctx.chain?.chainId ?? newChainId(now);
    const principal = ctx.principal;
    const route = tRoute.route;
    const channel = route?.channel ?? null;
    const caps = tRoute.transport === "bridge" ? this.bridge.caps(tRoute.bridgeKey) : undefined;
    const vis = visibleRequestBody(params.message, { audience: audienceFor(route, principal), sharedChars: this.limits.sharedVisibleChars, channel, caps });
    const busyNow = this._precheckBusy(tgt.sessionKey);
    let ahead = q.aheadOf(decision.kind) + (busyNow ? 1 : 0);
    if (decision.kind === "request") {
      // The global cap on request turns (§4.3, F17): the 5th of a fan-out waits visibly too.
      const load = this.runningRequests + this._pendingRequestItems();
      if (load >= this.limits.maxConcurrentRequestTurns) ahead = Math.max(ahead, load - this.limits.maxConcurrentRequestTurns + 1);
    }
    const chainForLabels = ctx.chain ?? { members: { [req.sessionKey]: { depth: 0, parent: null, label: requesterLabel } } };
    const rootKey = Object.entries(chainForLabels.members).find(([, m]) => m.parent === null)?.[0];
    const rootLabel = ctx.chain?.root?.label ?? chainForLabels.members[rootKey]?.label ?? requesterLabel;
    const baseLines = [
      ...anchorHeadLines({ edge: decision.edge, from: requesterLabel, code, depth: decision.depth, maxDepth: this.limits.maxDepth, via: requesterLabel, root: rootLabel }),
      vis.visibleText,
      vis.trimmed ? truncatedLine({ n: vis.chars }) : null,
      channel === "wecom" ? WECOM_LINE : null,
    ];
    const lines = ahead > 0 ? [...baseLines, busyLine({ n: ahead })] : baseLines;

    let batchId = null;
    let batchIsNew = false;
    if (params.mode === "async") {
      const open = ctx.runId ? this.ledger.batchesWhere((b) => b.requester.runId === ctx.runId && b.phase === "open")[0] : null;
      if (open) batchId = open.batchId;
      else { batchId = newBatchId(now); batchIsNew = true; }
    }

    // Chain (new for a root run) and its counters.
    if (!ctx.chain) {
      await this.ledger.createChain({
        v: 2, chainId,
        root: { sessionKey: req.sessionKey, runId: ctx.runId, label: requesterLabel },
        principal,
        createdAt: now, lastActivityAt: now,
        idleExpiresAt: now + this.limits.chainIdleTtlMs, hardExpiresAt: now + this.limits.chainHardTtlMs,
        members: { [req.sessionKey]: { depth: 0, parent: null, label: requesterLabel } },
        counters: { sends: 0, pairs: {}, recent: [] },
      });
      if (ctx.runId) {
        await this.ledger.putRun({ runId: ctx.runId, sessionKey: req.sessionKey, role: "root", chainId, depth: 0, leaf: false, servesSendId: null, batchId: null, createdAt: now });
      }
    }
    await this.ledger.updateChain(chainId, (c) => {
      c.counters = countSend(c, { requesterKey: req.sessionKey, targetKey: tgt.sessionKey, now });
      c.lastActivityAt = now;
      c.idleExpiresAt = now + this.limits.chainIdleTtlMs;
      if (decision.newMember) c.members[tgt.sessionKey] = { depth: decision.depth, parent: req.sessionKey, label: targetLabel };
    });

    const rec = await this.ledger.createSend({
      v: 2, sendId, code,
      idempotencyKey: params.idempotencyKey, contentKey,
      chainId, depth: decision.depth, edge: decision.edge, kind: decision.kind,
      parentSendId: ctx.run?.servesSendId ?? null,
      batchId, mode: params.mode,
      inline: { until: params.mode === "inline" ? now + params.inlineTimeoutMs : 0, claimedAt: null, expiredAt: null },
      requester: {
        sessionKey: req.sessionKey, replySessionKey: req.replySessionKey, agentId: req.agentId,
        runId: ctx.runId, runRole: ctx.run?.role ?? (ctx.runId ? "root" : "unknown"), label: requesterLabel,
        channel: req.channel ?? null, transport: null, route: rRoute.ok ? rRoute.route : null, hint: hint ?? null,
      },
      target: {
        sessionKey: tgt.sessionKey, agentId: tgt.agentId, displayKey: tgt.displayKey, label: targetLabel,
        transport: tRoute.transport, bridgeKey: tRoute.transport === "bridge" ? tRoute.bridgeKey : null,
        route, leaf: decision.leaf, created: tgt.created,
      },
      principal,
      message: { text: params.message, chars: vis.chars, sha256: messageSha256(params.message), visibleText: vis.visibleText, trimmed: vis.trimmed, redactions: vis.redactions },
      phase: "accepted",
      request: { messageId: null, postAttempts: 0, postedAt: null, queueNoteEditedAt: null, baseText: route ? formatForChannel(channel, baseLines.filter(Boolean)) : null, text: route ? formatForChannel(channel, lines.filter(Boolean)) : null, queuedLine: ahead > 0 },
      attempt: 0,
      targetRun: { runId: null, startedAt: null, endedAt: null, status: null, error: null, recoveryRunId: null },
      children: { batchIds: [] },
      wakeRounds: 0,
      result: null, failure: null, pending: null,
      deadlines: { queueBy: now + this.limits.queueTimeoutMs, runBy: 0 },
      createdAt: now, updatedAt: now,
    });
    this._changed(rec);
    if (batchId) await this._joinBatch(rec, batchId, { create: batchIsNew, ctx });
    // Reserve the queue position now; the item becomes startable once the anchor is posted.
    q.add(rec.kind, sendId, { ready: false, at: now });
    return { status: "accepted", rec, ctl: { responded: false } };
  }

  /** Add `rec` to batch `batchId`, creating it when needed. */
  async _joinBatch(rec, batchId, { create = false, ctx = null } = {}) {
    const now = this.now();
    const runId = rec.requester.runId;
    if (create || !this.ledger.getBatch(batchId)) {
      const run = ctx?.run ?? (runId ? await this.ledger.getRun(runId) : null);
      const sealed = !runId || this.endedRuns.has(runId) || ctx?.sealed === true;
      if (!runId) this.logger?.warn?.(`v-session-relay: batch.unkeyed send ${rec.sendId} from ${rec.requester.sessionKey}`);
      await this.ledger.createBatch({
        v: 2, batchId, chainId: rec.chainId, depth: run?.depth ?? (rec.requester.runRole === "root" ? 0 : Math.max(0, rec.depth - 1)),
        requester: { sessionKey: rec.requester.sessionKey, agentId: rec.requester.agentId, runId, label: rec.requester.label, transport: null, route: null, hint: rec.requester.hint ?? null },
        servesSendId: run?.servesSendId ?? rec.parentSendId ?? null,
        members: [rec.sendId], sealed, sealedAt: sealed ? now : null,
        phase: sealed ? "sealed" : "open",
        wake: { attempt: 0, runId: null, handbackMessageId: null, startedAt: null, endedAt: null, status: null, transport: null, rejects: 0 },
        createdAt: now, updatedAt: now,
      });
      if (sealed) await this._checkBatch(batchId);
      return;
    }
    await this.ledger.updateBatch(batchId, (b) => {
      if (b.members.includes(rec.sendId)) return false;
      b.members.push(rec.sendId);
      return undefined;
    });
  }

  _acceptedResult(rec, { deduped = false, sameCall = false }) {
    const target = rec.target.sessionKey;
    const q = this._queue(target);
    // Already on its way (its own turn may have started before this answer is built).
    const self = this.running.get(target)?.id === rec.sendId || !["accepted", "posting", "posted", "queued"].includes(rec.phase);
    const pos = self ? 0 : Math.max(0, q.positionOf(rec.kind, rec.sendId));
    const waiting = self ? false : this._precheckBusy(target);
    let ahead = pos + (waiting ? 1 : 0);
    if (!self && rec.kind === "request" && this.runningRequests >= this.limits.maxConcurrentRequestTurns) ahead = Math.max(ahead, 1);
    const note = deduped && !sameCall
      ? dedupeNote({ code: rec.code })
      : acceptedNote({ to: rec.target.label, code: rec.code, ahead, visible: Boolean(rec.target.route) });
    return {
      status: "accepted",
      sendId: rec.sendId,
      code: rec.code,
      runId: runIdFor(rec.kind === "ask" ? "ask" : "request", rec.sendId, 0),
      targetDisposition: "queued",
      queuePosition: pos,
      waitingBehindActiveRun: waiting,
      delivery: { status: "pending", mode: "announce" },
      note,
      ...(deduped ? { deduped: true } : {}),
    };
  }

  // ================================================================== visible posts

  _sideOf(rec) {
    if (rec.target.transport === "bridge" && !rec.target.forceAgent && this.bridge.get(rec.target.bridgeKey)) {
      return { transport: "bridge", bridgeKey: rec.target.bridgeKey, route: rec.target.route };
    }
    return { transport: "agent", bridgeKey: null, route: rec.target.route };
  }

  async _postTo(side, { text, idempotencyKey, replyToMessageId }) {
    if (!side.route || !text) return { messageId: null, skipped: true };
    if (side.transport === "bridge" && side.bridgeKey && this.bridge.get(side.bridgeKey)) {
      return this.bridge.post(side.bridgeKey, { route: side.route, text, idempotencyKey, ...(replyToMessageId ? { replyToMessageId } : {}) });
    }
    return this.agent.post({ route: side.route, text });
  }

  /** A short note in the target chat replying to the request anchor (§7.4); best effort. */
  async _targetNote(rec, text, purpose) {
    if (!rec.request?.messageId || !rec.target.route) return;
    try {
      await this._postTo(this._sideOf(rec), {
        text: formatForChannel(rec.target.route.channel, [text]),
        idempotencyKey: feishuPostUuid(rec.kind === "ask" ? "ask" : "request", rec.sendId, purpose),
        replyToMessageId: rec.request.messageId,
      });
    } catch (err) {
      this.logger?.warn?.(`v-session-relay: note for #${rec.code} not posted: ${err?.message ?? err}`);
    }
  }

  /** Post the request anchor and make the queue item startable (accepted → posting → posted → queued). */
  async _postAnchor(sendId, ctl = { responded: true }) {
    let rec = this.ledger.getSend(sendId);
    if (!rec || !["accepted", "posting"].includes(rec.phase)) return { ok: true };
    if (!rec.target.route || !rec.request.text) {
      rec = await this._updateSend(sendId, (d) => { d.phase = "queued"; }, { from: ["accepted", "posting"] });
      if (rec) this._makeReady(rec);
      return { ok: true };
    }
    rec = await this._updateSend(sendId, (d) => { d.phase = "posting"; d.request.postAttempts += 1; }, { from: ["accepted", "posting"] });
    if (!rec) return { ok: true };
    let res;
    try {
      res = await this._postTo(this._sideOf(rec), {
        text: rec.request.text,
        idempotencyKey: feishuPostUuid(rec.kind === "ask" ? "ask" : "request", rec.sendId, "anchor"),
      });
    } catch (err) {
      const { code, transient } = bridgeErrorInfo(err);
      this.logger?.warn?.(`v-session-relay: anchor #${rec.code} not posted (${code}${transient ? ", transient" : ""}): ${err?.message ?? err}`);
      if (!transient) {
        if (!ctl.responded) {
          await this._detach(rec, code);
          return { ok: false, permanent: true, code };
        }
        await this._fail(rec.sendId, { class: "not_started", code, reason: reasonText(code, { channel: rec.target.route.channel }) });
        return { ok: false, code };
      }
      const n = rec.request.postAttempts;
      if (n > this.timing.postRetryMs.length) {
        await this._fail(rec.sendId, { class: "not_started", code: "CHANNEL_DOWN", reason: reasonText("CHANNEL_DOWN", { channel: rec.target.route.channel }) });
        return { ok: false, code };
      }
      const t = setTimeout(() => { this.postRetryTimers.delete(sendId); void this._postAnchor(sendId).catch(() => {}); }, this.timing.postRetryMs[n - 1] ?? this.timing.postRetryMs.at(-1));
      t.unref?.();
      this.postRetryTimers.set(sendId, t);
      return { ok: false, transient: true, code };
    }
    rec = await this._updateSend(sendId, (d) => { d.phase = "posted"; d.request.messageId = res?.messageId ?? null; d.request.postedAt = this.now(); }, { from: ["posting"] });
    if (!rec) return { ok: true };
    rec = await this._updateSend(sendId, (d) => { d.phase = "queued"; }, { from: ["posted"] });
    if (rec) this._makeReady(rec);
    return { ok: true };
  }

  _makeReady(rec) {
    this._queue(rec.target.sessionKey).add(rec.kind, rec.sendId, { ready: true, at: rec.createdAt });
    this._schedulePump(rec.target.sessionKey, 0);
  }

  /** A send that could not even be posted at accept time: closed as skipped, out of its batch. */
  async _detach(rec, code) {
    this._queue(rec.target.sessionKey).remove(rec.kind, rec.sendId);
    const closed = await this._updateSend(rec.sendId, (d) => {
      d.phase = "skipped";
      d.failure = { class: "not_started", code, reason: reasonText(code) };
    }, { note: `detached at accept: ${code}` });
    if (rec.batchId) {
      await this.ledger.updateBatch(rec.batchId, (b) => {
        if (!b.members.includes(rec.sendId)) return false;
        b.members = b.members.filter((m) => m !== rec.sendId);
        return undefined;
      });
      await this._checkBatch(rec.batchId);
    }
    return closed;
  }

  // ================================================================== settle and fail

  /** Close a send as failed (failure_ready); posts the §7.4 note in the target chat when asked. */
  async _fail(sendId, failure, { note } = {}) {
    const cur = this.ledger.getSend(sendId);
    if (!cur || isSettled(cur) || isSendTerminal(cur)) return null;
    this._queue(cur.target.sessionKey).remove(cur.kind, sendId);
    this._queue(cur.target.sessionKey).remove("collect", sendId);
    const rec = await this._updateSend(sendId, (d) => {
      if (isSettled(d) || SEND_TERMINAL_PHASES.includes(d.phase)) return false;
      d.phase = "failure_ready";
      d.failure = failure;
      return undefined;
    }, { note: failure.code });
    if (!rec) return null;
    if (note) {
      const text = note === "wedge" ? targetWedgedNote({ code: rec.code, from: rec.requester.label })
        : note === "interrupted" ? targetInterruptedNote({ code: rec.code, from: rec.requester.label })
        : targetNotStartedNote({ code: rec.code, reason: failure.reason, from: rec.requester.label });
      await this._targetNote(rec, text, `note-${failure.code}`);
    }
    await this._onSettled(rec);
    return rec;
  }

  async _settleResult(sendId, output, { incomplete = false } = {}) {
    const rec = await this._updateSend(sendId, (d) => {
      if (!["target_done", "awaiting_children", "awaiting_background"].includes(d.phase)) return false;
      d.phase = "result_ready";
      d.result = {
        text: output.text ?? "", media: output.media ?? [], noReply: Boolean(output.noReply), source: output.source ?? "bridge",
        fromRunId: output.fromRunId ?? null, ...(incomplete ? { incomplete: true } : {}),
      };
      return undefined;
    });
    if (rec) await this._onSettled(rec);
    return rec;
  }

  async _onSettled(rec) {
    this._clearBackground(rec.sendId);
    if (rec.mode === "inline" && !rec.inline?.expiredAt && !rec.inline?.claimedAt) return; // vrelay.wait claims it
    if (rec.batchId) await this._checkBatch(rec.batchId);
  }

  // ================================================================== inline (vrelay.wait)

  _armInline(rec) {
    clearTimeout(this.inlineTimers.get(rec.sendId));
    const ms = Math.max(0, (rec.inline?.until ?? 0) - this.now());
    const t = setTimeout(() => {
      this.inlineTimers.delete(rec.sendId);
      void this._expireInline(rec.sendId, "deadline").catch((err) => this.logger?.warn?.(`v-session-relay: inline expiry failed: ${err?.message ?? err}`));
    }, ms + 50);
    t.unref?.();
    this.inlineTimers.set(rec.sendId, t);
  }

  _waitChange(sendId, ms) {
    return new Promise((resolve) => {
      let done = false;
      const fire = () => { if (done) return; done = true; clearTimeout(t); resolve(); };
      const t = setTimeout(fire, Math.max(0, ms));
      t.unref?.();
      if (!this.waiters.has(sendId)) this.waiters.set(sendId, new Set());
      this.waiters.get(sendId).add(fire);
    });
  }

  _inlineResult(rec) {
    if (rec.result) {
      if (rec.result.noReply) return { status: "no_reply", code: rec.code, note: inlineNoReplyNote({ to: rec.target.label }) };
      return { status: "ok", code: rec.code, reply: rec.result.text, ...(rec.result.media?.length ? { media: rec.result.media } : {}), note: inlineOkNote({ to: rec.target.label }) };
    }
    const f = rec.failure ?? { class: "not_started", reason: reasonText("error") };
    return {
      status: "failed", code: rec.code, failure: { class: f.class, reason: f.reason },
      note: inlineFailedNote({ to: rec.target.label, code: rec.code, reason: f.reason, failureClass: f.class, wedge: f.code === "restart_wedge" }),
    };
  }

  _expiredResult(rec) {
    const seconds = Math.max(0, Math.round(((rec.inline?.expiredAt ?? this.now()) - rec.createdAt) / 1000));
    return { status: "expired", code: rec.code, note: inlineExpiredNote({ to: rec.target.label, seconds }) };
  }

  /** CAS claim: result_ready / failure_ready → delivered_inline (only while inline and not expired). */
  async _claim(sendId) {
    const rec = await this._updateSend(sendId, (d) => {
      if (d.mode !== "inline" || d.inline.expiredAt || d.inline.claimedAt) return false;
      if (d.phase !== "result_ready" && d.phase !== "failure_ready") return false;
      d.inline.claimedAt = this.now();
      d.inline.claimedFrom = d.phase;
      d.phase = "delivered_inline";
      return undefined;
    });
    if (rec) clearTimeout(this.inlineTimers.get(sendId));
    return rec;
  }

  async wait({ sendId, timeoutMs } = {}) {
    const budget = Math.max(0, Math.min(Number.isFinite(timeoutMs) ? timeoutMs : TIMEOUTS.waitSliceMaxMs, TIMEOUTS.waitSliceMaxMs));
    const deadline = this.now() + budget;
    for (;;) {
      let rec = this.ledger.getSend(sendId);
      if (!rec) return { status: "failed", code: null, failure: { class: "not_started", reason: "找不到这条请求" }, note: "找不到这条请求；不要重发，先看对方聊天里有没有出现它。" };
      if (rec.phase === "delivered_inline") return this._inlineResult(rec);
      if (rec.phase === "skipped" || rec.phase === "cancelled") return this._inlineResult(rec);
      if (rec.mode !== "inline" || rec.inline.expiredAt) return this._expiredResult(rec);
      if (rec.phase === "result_ready" || rec.phase === "failure_ready") {
        const claimed = await this._claim(sendId);
        if (claimed) return this._inlineResult(claimed);
        continue;
      }
      const now = this.now();
      if (now >= rec.inline.until) {
        rec = (await this._expireInline(sendId, "deadline")) ?? this.ledger.getSend(sendId);
        if (rec?.phase === "delivered_inline") return this._inlineResult(rec);
        return this._expiredResult(rec);
      }
      if (now >= deadline || !this._alive()) return { status: "pending", code: rec.code, note: "" };
      await this._waitChange(sendId, Math.min(deadline, rec.inline.until) - now);
    }
  }

  /** Inline window over (or requester run ended) without a claim: the send becomes async (§4.6). */
  async _expireInline(sendId, why) {
    clearTimeout(this.inlineTimers.get(sendId));
    this.inlineTimers.delete(sendId);
    const cur = this.ledger.getSend(sendId);
    if (!cur || cur.mode !== "inline" || cur.inline.expiredAt || cur.inline.claimedAt || SEND_TERMINAL_PHASES.includes(cur.phase)) return cur;
    const batchId = this._lateBatchId(cur);
    const rec = await this._updateSend(sendId, (d) => {
      if (d.inline.expiredAt || d.inline.claimedAt || SEND_TERMINAL_PHASES.includes(d.phase)) return false;
      d.inline.expiredAt = this.now();
      d.batchId = batchId.batchId;
      return undefined;
    }, { note: `inline expired: ${why}` });
    if (!rec) return this.ledger.getSend(sendId);
    await this._joinBatch(rec, batchId.batchId, { create: batchId.create, ctx: { sealed: batchId.sealed } });
    if (isSettled(rec)) await this._checkBatch(rec.batchId);
    return rec;
  }

  /** Batch for a send that turns async after accept: the run's open/sealed batch, else a new one. */
  _lateBatchId(rec) {
    const runId = rec.requester.runId;
    const ended = !runId || this.endedRuns.has(runId);
    if (runId) {
      const b = this.ledger.batchesWhere((x) => x.requester.runId === runId && (x.phase === "open" || x.phase === "sealed"))[0];
      if (b) return { batchId: b.batchId, create: false, sealed: b.phase === "sealed" };
    }
    return { batchId: newBatchId(this.now()), create: true, sealed: ended };
  }

  // ================================================================== pump

  _schedulePump(sessionKey, ms) {
    if (this.stopped) return;
    const existing = this.pumpTimers.get(sessionKey);
    if (existing && existing.at <= this.now() + ms) return;
    clearTimeout(existing?.t);
    const t = setTimeout(() => { this.pumpTimers.delete(sessionKey); this._pump(sessionKey); }, Math.max(0, ms));
    t.unref?.();
    this.pumpTimers.set(sessionKey, { t, at: this.now() + ms });
  }

  _itemStartable(item) {
    if (item.kind === "wake") return this.ledger.getBatch(item.id)?.phase === "ready";
    const rec = this.ledger.getSend(item.id);
    if (!rec) return false;
    if (item.kind === "collect") return rec.phase === "awaiting_background";
    return rec.phase === "queued";
  }

  _pump(sessionKey) {
    if (!this._alive()) return;
    if (this.running.has(sessionKey) || this.recoveryLock.has(sessionKey)) return;
    const q = this.queues.get(sessionKey);
    if (!q) return;
    for (;;) {
      const head = q.head();
      if (!head) return;
      if (!this._itemStartable(head)) { q.remove(head.kind, head.id); continue; }
      if (head.kind === "request" && this.runningRequests >= this.limits.maxConcurrentRequestTurns) {
        this.globalWaiting.add(sessionKey);
        return;
      }
      const bo = this.backoff.get(sessionKey);
      if (bo && bo.until > this.now()) { this._schedulePump(sessionKey, bo.until - this.now()); return; }
      if (head.kind === "request" || head.kind === "ask") {
        const rec = this.ledger.getSend(head.id);
        if (this.now() > rec.deadlines.queueBy) {
          q.remove(head.kind, head.id);
          void this._fail(rec.sendId, { class: "not_started", code: "queue_timeout", reason: reasonText("queue_timeout", { h: Math.round(this.limits.queueTimeoutMs / 3600_000) }) }, { note: "not_started" });
          continue;
        }
      }
      if (this._precheckBusy(sessionKey)) { this._schedulePump(sessionKey, this.timing.idleRecheckMs); return; }
      this.running.set(sessionKey, { kind: head.kind, id: head.id, runId: null });
      if (head.kind === "request") this.runningRequests += 1;
      this.globalWaiting.delete(sessionKey);
      void this._runItem(sessionKey, head)
        .catch((err) => this.logger?.error?.(`v-session-relay: ${head.kind} ${head.id} failed: ${err?.stack ?? err}`))
        .finally(() => {
          const cur = this.running.get(sessionKey);
          if (cur && cur.id === head.id) this.running.delete(sessionKey);
          if (head.kind === "request") {
            this.runningRequests -= 1;
            for (const key of [...this.globalWaiting]) { this.globalWaiting.delete(key); this._schedulePump(key, 0); }
          }
          this._schedulePump(sessionKey, this.backoff.get(sessionKey)?.until > this.now() ? 0 : this.timing.pumpDebounceMs);
        });
      return;
    }
  }

  _setBackoff(sessionKey) {
    const prev = this.backoff.get(sessionKey);
    const level = Math.min((prev?.level ?? -1) + 1, this.timing.busyBackoffMs.length - 1);
    this.backoff.set(sessionKey, { level, until: this.now() + this.timing.busyBackoffMs[level] });
  }

  async _runItem(sessionKey, item) {
    if (item.kind === "wake") return this._runWake(sessionKey, item);
    if (item.kind === "collect") return this._runCollect(sessionKey, item);
    return this._runSendTurn(sessionKey, item);
  }

  async _testStartDelay() {
    const ms = Number(this.env?.VSR_TEST_START_DELAY_MS ?? 0);
    if (Number.isFinite(ms) && ms > 0) await sleep(ms);
  }

  async _start(side, req, principal) {
    let outcome;
    try {
      outcome = side.transport === "bridge" ? await this.bridge.start(side.bridgeKey, req) : await this.agent.start(req, { principal });
    } catch (err) {
      const message = String(err?.message ?? err);
      return { status: "rejected", code: RESTART_WEDGE_RE.test(message) ? "RESTART_WEDGE" : "INTERNAL", message, started: false };
    }
    const valid = validateStartOutcome(outcome);
    if (!valid.ok) return { status: "rejected", code: "INTERNAL", message: `invalid start outcome: ${valid.errors.join("; ")}`, started: false };
    return outcome;
  }

  /** Await a started run; a lifecycle end without `done` resolves it after lostRunGraceMs. */
  async _awaitRun(runId, done, info) {
    const force = deferred();
    this.ourRuns.set(runId, { ...info, force });
    const ended = this.endedRuns.get(runId);
    if (ended) this._armLostRun(runId, ended.status, {}); // its lifecycle end came before we listened
    let ro;
    try {
      ro = await Promise.race([done, force.promise]);
    } catch (err) {
      ro = { status: "error", finals: [], visibleReplySent: false, finalCount: 0, error: `transport lost: ${err?.message ?? err}` };
    }
    this.ourRuns.delete(runId);
    if (this.activeTurnBySession.get(info.sessionKey) === runId) this.activeTurnBySession.delete(info.sessionKey);
    if (ro?.lost) {
      const text = await this._transcriptReply(info.sessionKey, info.tagKind, info.tagId).catch(() => null);
      if (text) ro = { ...ro, finals: [{ text }], finalCount: 1 };
    }
    return ro;
  }

  _rejectionFailure(outcome, rec) {
    const code = outcome.code;
    if (code === "RESTART_WEDGE") return { failure: { class: "interrupted", code: "restart_wedge", reason: reasonText("restart_wedge") }, note: "wedge" };
    if (code === "ARCHIVED") return { failure: { class: "not_started", code, reason: reasonText("ARCHIVED") }, note: "not_started" };
    if (code === "CHANNEL_DOWN") return { failure: { class: "not_started", code, reason: reasonText("CHANNEL_DOWN", { channel: rec.target.route?.channel }) }, note: "not_started" };
    if (code === "NO_ROUTE") return { failure: { class: "not_started", code, reason: reasonText("NO_ROUTE") }, note: "not_started" };
    return { failure: { class: "not_started", code, reason: reasonText("error", { err: outcome.message || code }) }, note: "not_started" };
  }

  async _runSendTurn(sessionKey, item) {
    let rec = this.ledger.getSend(item.id);
    const attempt = rec.attempt;
    const presetRunId = runIdFor(rec.kind, rec.sendId, attempt);
    rec = await this._updateSend(rec.sendId, (d) => { d.phase = "starting"; d.targetRun.runId = presetRunId; d.targetRun.startedAt = null; }, { from: ["queued"] });
    if (!rec) return;
    const runInfo = { runId: presetRunId, sessionKey, role: rec.kind === "ask" ? "ask" : "request", chainId: rec.chainId, depth: rec.depth, leaf: rec.target.leaf, servesSendId: rec.sendId, batchId: null, createdAt: this.now() };
    await this.ledger.putRun(runInfo);
    await this._testStartDelay();
    const side = this._sideOf(rec);
    const identity = this.routes.senderFor({ route: side.route, principal: rec.principal, chainId: rec.chainId, fromLabel: rec.requester.label });
    const req = sendStartRequest({ rec, kind: rec.kind, attempt, route: side.route, anchorMessageId: rec.request.messageId, identity, ownerName: this.config.ownerName, maxDepth: this.limits.maxDepth });
    const outcome = await this._start(side, req, rec.principal);
    const q = this._queue(sessionKey);

    if (outcome.status === "busy") {
      await this._updateSend(rec.sendId, (d) => { d.phase = "queued"; d.attempt += 1; d.lastBusy = { at: this.now(), reason: outcome.reason }; }, { from: ["starting"], note: `busy: ${outcome.reason}` });
      this._setBackoff(sessionKey);
      return;
    }
    if (outcome.status === "rejected") {
      const routeProblem = outcome.code === "ROUTE_MISMATCH" || outcome.code === "NO_ROUTE";
      if (routeProblem && side.transport === "bridge") {
        await this._updateSend(rec.sendId, (d) => { d.phase = "queued"; d.attempt += 1; d.target.forceAgent = true; d.target.transport = "agent"; }, { from: ["starting"], note: `rejected ${outcome.code}: agent transport` });
        return;
      }
      const transientDown = outcome.code === "CHANNEL_DOWN" || outcome.code === "INTERNAL";
      if (transientDown && (rec.rejects ?? 0) + 1 < MAX_REJECTS) {
        await this._updateSend(rec.sendId, (d) => { d.phase = "queued"; d.attempt += 1; d.rejects = (d.rejects ?? 0) + 1; }, { from: ["starting"], note: `rejected ${outcome.code}` });
        this._setBackoff(sessionKey);
        return;
      }
      q.remove(rec.kind, rec.sendId);
      const { failure, note } = this._rejectionFailure(outcome, rec);
      await this._fail(rec.sendId, failure, { note });
      return;
    }

    // started
    this.backoff.delete(sessionKey);
    q.remove(rec.kind, rec.sendId);
    const runId = outcome.runId;
    const started = await this._updateSend(rec.sendId, (d) => {
      d.phase = "running";
      d.targetRun.runId = runId;
      d.targetRun.startedAt = this.now();
      d.deadlines.runBy = this.now() + this.limits.runTimeoutMs;
      d.target.transport = side.transport;
    }, { from: ["starting"] });
    if (runId !== presetRunId) await this.ledger.putRun({ ...runInfo, runId });
    const slot = this.running.get(sessionKey);
    if (slot) slot.runId = runId;
    this.activeTurnBySession.set(sessionKey, runId);
    if (started?.request?.queuedLine && started.request.messageId) void this._editAnchor(started, started.request.baseText);
    const ro = await this._awaitRun(runId, outcome.done, { kind: rec.kind, id: rec.sendId, sessionKey, tagKind: rec.kind, tagId: rec.sendId });
    await this._onSendTurnEnd(rec.sendId, runId, ro, "target", side.transport);
  }

  async _editAnchor(rec, text) {
    if (rec.target.transport !== "bridge" || !rec.target.bridgeKey) return false;
    return this.bridge.edit(rec.target.bridgeKey, { route: rec.target.route, messageId: rec.request.messageId, text });
  }

  async _onSendTurnEnd(sendId, runId, ro, role, transport) {
    await this._onRunEnded(runId, ro.status);
    const cur = this.ledger.getSend(sendId);
    if (!cur) return;
    const output = { ...outputOf(ro), status: ro.status, error: ro.error ?? null, source: transport ?? "bridge", fromRunId: runId };
    if (role === "target") {
      const rec = await this._updateSend(sendId, (d) => {
        if (d.phase !== "running") return false;
        d.phase = "target_done";
        d.targetRun.endedAt = this.now();
        d.targetRun.status = ro.status;
        d.targetRun.error = ro.error ?? null;
        d.pending = output;
        return undefined;
      });
      if (!rec) return; // cancelled or timed out meanwhile: the late result is dropped
    } else {
      const rec = await this._updateSend(sendId, (d) => {
        if (d.phase !== "awaiting_background") return false;
        d.collect = { ...(d.collect ?? {}), endedAt: this.now(), status: ro.status };
        d.pending = output;
        return undefined;
      });
      if (!rec) return;
    }
    await this._evaluate(sendId);
  }

  // ================================================================== W(S) continuation (§5.5)

  _backgroundTasks(sessionKey) {
    const tb = this.taskBridge();
    if (typeof tb?.listActive !== "function") return [];
    let list;
    try { list = tb.listActive(sessionKey) ?? []; } catch { return []; }
    const key = lower(sessionKey);
    return (Array.isArray(list) ? list : [])
      .filter((t) => !(t?.runtime === "cli" && !t.taskKind && lower(t.childSessionKey) === key))
      .filter((t) => t?.taskKind !== "sessions_send" && t?.runtime !== "cron")
      .filter((t) => t?.runtime === "subagent" || t?.runtime === "acp" || BACKGROUND_KINDS.has(t?.taskKind));
  }

  async _evaluate(sendId) {
    const rec = this.ledger.getSend(sendId);
    if (!rec || !["target_done", "awaiting_children", "awaiting_background"].includes(rec.phase)) return;
    const p = rec.pending ?? { text: "", media: [], noReply: true, status: "ok" };
    if (p.status && p.status !== "ok") {
      await this._fail(sendId, failureOfRun({ status: p.status, error: p.error }, RESTART_WEDGE_RE));
      return;
    }
    if (rec.kind === "ask") { await this._settleResult(sendId, p); return; }
    const children = this.ledger.batchesWhere((b) => b.servesSendId === sendId && !isBatchTerminal(b));
    const background = children.length ? [] : this._backgroundTasks(rec.target.sessionKey);
    if ((children.length || background.length) && rec.wakeRounds >= this.limits.maxWakeRoundsPerSend) {
      await this._settleResult(sendId, p, { incomplete: true });
      return;
    }
    if (children.length) {
      await this._updateSend(sendId, (d) => {
        d.phase = "awaiting_children";
        d.children.batchIds = [...new Set([...(d.children.batchIds ?? []), ...children.map((b) => b.batchId)])];
      });
      return;
    }
    if (background.length) {
      await this._updateSend(sendId, (d) => { d.phase = "awaiting_background"; });
      this._armBackground(sendId);
      return;
    }
    await this._settleResult(sendId, p);
  }

  _armBackground(sendId, ms = this.timing.backgroundPollMs) {
    clearTimeout(this.bgTimers.get(sendId));
    const t = setTimeout(() => { this.bgTimers.delete(sendId); void this._backgroundCheck(sendId); }, ms);
    t.unref?.();
    this.bgTimers.set(sendId, t);
  }

  _clearBackground(sendId) {
    clearTimeout(this.bgTimers.get(sendId));
    this.bgTimers.delete(sendId);
  }

  _backgroundCheckSession(sessionKey) {
    for (const rec of this.ledger.sendsWhere((s) => s.phase === "awaiting_background" && s.target.sessionKey === sessionKey)) void this._backgroundCheck(rec.sendId);
  }

  async _backgroundCheck(sendId) {
    const rec = this.ledger.getSend(sendId);
    if (!rec || rec.phase !== "awaiting_background" || !this._alive()) return;
    if (rec.deadlines.runBy && this.now() > rec.deadlines.runBy) {
      await this._fail(sendId, { class: "timeout", code: "timeout", reason: reasonText("timeout", { h: Math.round(this.limits.runTimeoutMs / 3600_000) }) });
      return;
    }
    const target = rec.target.sessionKey;
    const q = this._queue(target);
    if (q.has("collect", sendId) || this.running.get(target)?.id === sendId) return;
    if (this._backgroundTasks(target).length) { this._armBackground(sendId); return; }
    q.add("collect", sendId, { ready: true });
    this._schedulePump(target, 0);
  }

  async _runCollect(sessionKey, item) {
    let rec = this.ledger.getSend(item.id);
    if (!rec || rec.phase !== "awaiting_background") return;
    const q = this._queue(sessionKey);
    if (this._backgroundTasks(sessionKey).length) { q.remove("collect", rec.sendId); this._armBackground(rec.sendId); return; }
    const attempt = rec.collect?.attempt ?? 0;
    const presetRunId = runIdFor("collect", rec.sendId, attempt);
    const side = this._sideOf(rec);
    let anchorMessageId = rec.collect?.attempt === attempt ? rec.collect?.anchorMessageId ?? null : null;
    if (!anchorMessageId && side.route) {
      try {
        const res = await this._postTo(side, {
          text: formatForChannel(side.route.channel, [collectAnchorText({ code: rec.code, from: rec.requester.label })]),
          idempotencyKey: feishuPostUuid("collect", rec.sendId, `anchor-${rec.wakeRounds}`),
        });
        anchorMessageId = res?.messageId ?? null;
      } catch (err) {
        this.logger?.warn?.(`v-session-relay: collect anchor #${rec.code} not posted: ${err?.message ?? err}`);
      }
    }
    rec = await this._updateSend(rec.sendId, (d) => {
      if (d.phase !== "awaiting_background") return false;
      d.collect = { attempt, runId: presetRunId, anchorMessageId, startedAt: null, endedAt: null, status: null };
      return undefined;
    });
    if (!rec) { q.remove("collect", item.id); return; }
    const runInfo = { runId: presetRunId, sessionKey, role: "collect", chainId: rec.chainId, depth: rec.depth, leaf: false, servesSendId: rec.sendId, batchId: null, createdAt: this.now() };
    await this.ledger.putRun(runInfo);
    await this._testStartDelay();
    const identity = this.routes.senderFor({ route: side.route, principal: rec.principal, chainId: rec.chainId, fromLabel: rec.requester.label });
    const req = sendStartRequest({ rec, kind: "collect", attempt, route: side.route, anchorMessageId, identity, ownerName: this.config.ownerName, maxDepth: this.limits.maxDepth });
    const outcome = await this._start(side, req, rec.principal);
    if (outcome.status === "busy") {
      await this._updateSend(rec.sendId, (d) => { d.collect.attempt = attempt + 1; d.collect.anchorMessageId = anchorMessageId; });
      this._setBackoff(sessionKey);
      return;
    }
    q.remove("collect", rec.sendId);
    if (outcome.status === "rejected") {
      if ((outcome.code === "ROUTE_MISMATCH" || outcome.code === "NO_ROUTE") && side.transport === "bridge") {
        await this._updateSend(rec.sendId, (d) => { d.collect.attempt = attempt + 1; d.target.forceAgent = true; d.target.transport = "agent"; });
        q.add("collect", rec.sendId, { ready: true });
        return;
      }
      // Cannot ask for the final reply: hand back the last turn's output, marked incomplete.
      await this._settleResult(rec.sendId, rec.pending ?? { text: "", media: [], noReply: true }, { incomplete: true });
      return;
    }
    this.backoff.delete(sessionKey);
    const runId = outcome.runId;
    await this._updateSend(rec.sendId, (d) => { d.collect.startedAt = this.now(); d.collect.runId = runId; d.wakeRounds += 1; });
    if (runId !== presetRunId) await this.ledger.putRun({ ...runInfo, runId });
    const slot = this.running.get(sessionKey);
    if (slot) slot.runId = runId;
    this.activeTurnBySession.set(sessionKey, runId);
    const ro = await this._awaitRun(runId, outcome.done, { kind: "collect", id: rec.sendId, sessionKey, tagKind: "collect", tagId: rec.sendId });
    await this._onSendTurnEnd(rec.sendId, runId, ro, "collect", side.transport);
  }

  // ================================================================== batches and wake (§5.4)

  async _checkBatch(batchId) {
    const b = this.ledger.getBatch(batchId);
    if (!b || b.phase !== "sealed") return;
    const members = b.members.map((id) => this.ledger.getSend(id));
    if (members.some((m) => m && !isSettled(m))) return;
    if (members.some((m) => m && m.mode === "inline" && !m.inline.expiredAt && !m.inline.claimedAt)) return;
    const reportable = members.filter((m) => m && m.phase !== "skipped");
    if (!reportable.length) {
      const skipped = await this.ledger.updateBatch(batchId, (d) => { d.phase = "skipped"; }, { from: ["sealed"] });
      if (skipped?.servesSendId) await this._evaluate(skipped.servesSendId);
      return;
    }
    const ready = await this.ledger.updateBatch(batchId, (d) => { d.phase = "ready"; }, { from: ["sealed"] });
    if (ready) this._enqueueWake(ready);
  }

  _enqueueWake(b) {
    this._queue(b.requester.sessionKey).add("wake", b.batchId, { ready: true });
    this._schedulePump(b.requester.sessionKey, 0);
  }

  async _sealBatch(batchId) {
    const b = await this.ledger.updateBatch(batchId, (d) => { d.phase = "sealed"; d.sealed = true; d.sealedAt = this.now(); }, { from: ["open"] });
    if (b) await this._checkBatch(batchId);
    return b;
  }

  async _skipBatch(b, why) {
    this.logger?.warn?.(`v-session-relay: batch ${b.batchId} skipped: ${why}`);
    await this.ledger.updateBatch(b.batchId, (d) => { d.phase = "skipped"; d.skipReason = why; });
    for (const id of b.members) {
      await this._updateSend(id, (d) => { if (!isSettled(d)) return false; d.phase = "skipped"; return undefined; }, { note: `wake skipped: ${why}` });
    }
    if (b.servesSendId) await this._evaluate(b.servesSendId);
  }

  async _runWake(sessionKey, item) {
    let b = this.ledger.getBatch(item.id);
    if (!b || b.phase !== "ready") return;
    const q = this._queue(sessionKey);
    const res = await this.routes.resolve({ sessionKey: b.requester.sessionKey, agentId: b.requester.agentId, hint: b.requester.hint ?? undefined, fresh: true, avoidBridge: b.wake.forceAgent === true });
    // A deleted requester session (no entry and nowhere to deliver) is skipped (§6.2). A chat
    // session is woken even without an entry: a missing entry must never drop a result.
    const entry = this.routes.entryOf(b.requester.sessionKey, b.requester.agentId);
    if (!entry && this.routes.hasEntries && res.ok && !res.route) {
      q.remove("wake", b.batchId);
      await this._skipBatch(b, "requester session is gone");
      return;
    }
    if (!res.ok && (res.code === "CHAT_GONE" || res.code === "NOT_MEMBER")) {
      q.remove("wake", b.batchId);
      await this._skipBatch(b, `requester chat: ${res.code}`);
      return;
    }
    const side = res.ok
      ? { transport: res.transport === "bridge" && this.bridge.get(res.bridgeKey) ? "bridge" : "agent", bridgeKey: res.bridgeKey, route: res.route }
      : { transport: "agent", bridgeKey: null, route: null };
    const attempt = b.wake.attempt;
    const presetRunId = runIdFor("wake", b.batchId, attempt);
    b = await this.ledger.updateBatch(b.batchId, (d) => {
      d.phase = "waking";
      d.wake.runId = presetRunId;
      d.wake.transport = side.transport;
      d.requester.transport = side.transport;
      d.requester.route = side.route;
    }, { from: ["ready"] });
    if (!b) return;
    const members = b.members.map((id) => this.ledger.getSend(id)).filter((m) => m && m.phase !== "skipped");
    if (!b.wake.handbackMessageId && side.route) {
      const items = members.map((m) => memberItem(m, { runTimeoutMs: this.limits.runTimeoutMs }));
      try {
        const r = await this._postTo(side, { text: formatForChannel(side.route.channel, [handbackText(items)]), idempotencyKey: feishuPostUuid("wake", b.batchId, "handback") });
        b = (await this.ledger.updateBatch(b.batchId, (d) => { d.wake.handbackMessageId = r?.messageId ?? "posted"; })) ?? b;
      } catch (err) {
        const { transient } = bridgeErrorInfo(err);
        this.logger?.warn?.(`v-session-relay: hand-back for ${b.batchId} not posted: ${err?.message ?? err}`);
        if (transient) {
          await this.ledger.updateBatch(b.batchId, (d) => { d.phase = "ready"; d.wake.attempt += 1; }, { from: ["waking"] });
          this._setBackoff(sessionKey);
          return;
        }
      }
    }
    const runInfo = { runId: presetRunId, sessionKey, role: "wake", chainId: b.chainId, depth: b.depth, leaf: false, servesSendId: b.servesSendId, batchId: b.batchId, createdAt: this.now() };
    await this.ledger.putRun(runInfo);
    await this._testStartDelay();
    const serving = b.servesSendId ? this.ledger.getSend(b.servesSendId) : null;
    const continuation = serving && !isSettled(serving) && !SEND_TERMINAL_PHASES.includes(serving.phase) ? { parent: serving.requester.label, code: serving.code } : null;
    const principal = this.ledger.getChain(b.chainId)?.principal ?? members[0]?.principal ?? null;
    const fromLabel = members.length === 1 ? members[0].target.label : `${members.length} 个会话`;
    const identity = this.routes.senderFor({ route: side.route, principal, chainId: b.chainId, fromLabel });
    const req = wakeStartRequest({ batch: b, members, attempt, route: side.route, anchorMessageId: b.wake.handbackMessageId === "posted" ? null : b.wake.handbackMessageId, identity, ownerName: this.config.ownerName, principal, continuation, runTimeoutMs: this.limits.runTimeoutMs });
    const outcome = await this._start(side, req, principal);
    if (outcome.status === "busy") {
      await this.ledger.updateBatch(b.batchId, (d) => { d.phase = "ready"; d.wake.attempt += 1; }, { from: ["waking"] });
      this._setBackoff(sessionKey);
      return;
    }
    if (outcome.status === "rejected") {
      if ((outcome.code === "ROUTE_MISMATCH" || outcome.code === "NO_ROUTE") && side.transport === "bridge") {
        await this.ledger.updateBatch(b.batchId, (d) => { d.phase = "ready"; d.wake.attempt += 1; d.wake.forceAgent = true; }, { from: ["waking"] });
        return;
      }
      const rejects = (b.wake.rejects ?? 0) + 1;
      if (outcome.code !== "RESTART_WEDGE" && outcome.code !== "ARCHIVED" && rejects < MAX_REJECTS) {
        await this.ledger.updateBatch(b.batchId, (d) => { d.phase = "ready"; d.wake.attempt += 1; d.wake.rejects = rejects; }, { from: ["waking"] });
        this._setBackoff(sessionKey);
        return;
      }
      q.remove("wake", b.batchId);
      await this.ledger.updateBatch(b.batchId, (d) => { d.phase = "ready"; }, { from: ["waking"] });
      await this._skipBatch(b, `wake rejected: ${outcome.code} ${outcome.message ?? ""}`.trim());
      return;
    }
    // started: the batch is woken (§6.1) and its members are handed back.
    this.backoff.delete(sessionKey);
    q.remove("wake", b.batchId);
    const runId = outcome.runId;
    await this.ledger.updateBatch(b.batchId, (d) => { d.phase = "woken"; d.wake.startedAt = this.now(); d.wake.runId = runId; }, { from: ["waking"] });
    if (runId !== presetRunId) await this.ledger.putRun({ ...runInfo, runId });
    for (const m of members) {
      await this._updateSend(m.sendId, (d) => { if (d.phase !== "result_ready" && d.phase !== "failure_ready") return false; d.phase = "handed_back"; return undefined; });
    }
    if (serving && !isSettled(serving)) await this._updateSend(serving.sendId, (d) => { d.wakeRounds += 1; });
    const slot = this.running.get(sessionKey);
    if (slot) slot.runId = runId;
    this.activeTurnBySession.set(sessionKey, runId);
    const ro = await this._awaitRun(runId, outcome.done, { kind: "wake", id: b.batchId, sessionKey, tagKind: "wake", tagId: b.batchId });
    await this._onWakeEnd(b.batchId, runId, ro, side.transport);
  }

  async _onWakeEnd(batchId, runId, ro, transport) {
    const b = await this.ledger.updateBatch(batchId, (d) => { d.wake.endedAt = this.now(); d.wake.status = ro.status; });
    await this._onRunEnded(runId, ro.status);
    if (!b?.servesSendId) return;
    const s = this.ledger.getSend(b.servesSendId);
    if (!s || s.phase !== "awaiting_children") return;
    await this._updateSend(s.sendId, (d) => { d.pending = { ...outputOf(ro), status: ro.status, error: ro.error ?? null, source: transport ?? "bridge", fromRunId: runId }; });
    await this._evaluate(s.sendId);
  }

  // ================================================================== run ends (ours and others)

  _rememberEnded(runId, status) {
    this.endedRuns.set(runId, { status, at: this.now() });
    if (this.endedRuns.size > ENDED_RUNS_MAX) this.endedRuns.delete(this.endedRuns.keys().next().value);
    for (const fn of this.runEndWaiters.get(runId) ?? []) fn(status);
    this.runEndWaiters.delete(runId);
  }

  /** Resolves with the end status of `runId` (or null after `ms`). */
  _waitRunEnd(runId, ms) {
    if (this.endedRuns.has(runId)) return Promise.resolve(this.endedRuns.get(runId).status);
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.runEndWaiters.get(runId)?.delete(fn); resolve(null); }, ms);
      t.unref?.();
      const fn = (status) => { clearTimeout(t); resolve(status); };
      if (!this.runEndWaiters.has(runId)) this.runEndWaiters.set(runId, new Set());
      this.runEndWaiters.get(runId).add(fn);
    });
  }

  /** A run ended: inline sends it was waiting on turn async or revert, then its batches seal. */
  async _onRunEnded(runId, status) {
    if (!runId || this.endedRuns.has(runId)) return;
    this._rememberEnded(runId, status);
    for (const s of this.ledger.sendsWhere((x) => x.requester.runId === runId && x.mode === "inline")) {
      if (s.phase === "delivered_inline") {
        if (status === "ok") {
          await this._updateSend(s.sendId, (d) => { if (d.phase !== "delivered_inline") return false; d.inline.requesterEnd = status; return undefined; });
        } else {
          await this._revertInline(s.sendId, status);
        }
      } else if (!s.inline.claimedAt && !s.inline.expiredAt && !SEND_TERMINAL_PHASES.includes(s.phase)) {
        await this._expireInline(s.sendId, "requester run ended");
      }
    }
    for (const b of this.ledger.batchesWhere((x) => x.requester.runId === runId && x.phase === "open")) await this._sealBatch(b.batchId);
  }

  /** The requester's run died after claiming an inline result: hand it back asynchronously (§4.6). */
  async _revertInline(sendId, status) {
    const cur = this.ledger.getSend(sendId);
    if (!cur || cur.phase !== "delivered_inline") return null;
    const late = this._lateBatchId({ ...cur, requester: { ...cur.requester } });
    const rec = await this._updateSend(sendId, (d) => {
      if (d.phase !== "delivered_inline") return false;
      d.phase = d.inline.claimedFrom ?? (d.result ? "result_ready" : "failure_ready");
      d.inline.revertedAt = this.now();
      d.inline.expiredAt = d.inline.expiredAt ?? this.now();
      d.inline.requesterEnd = status ?? "unknown";
      d.batchId = late.batchId;
      return undefined;
    }, { note: `inline claim reverted: requester ${status}` });
    if (!rec) return null;
    await this._joinBatch(rec, late.batchId, { create: late.create, ctx: { sealed: true } });
    await this._checkBatch(rec.batchId);
    return rec;
  }

  /** Our own runs end through `done`; this only guards a bridge that never resolves it. */
  _armLostRun(runId, status, data) {
    const t = setTimeout(() => {
      const still = this.ourRuns.get(runId);
      if (!still) return;
      this.logger?.warn?.(`v-session-relay: run ${runId} ended without done; closing it`);
      still.force.resolve({ status, finals: [], visibleReplySent: false, finalCount: 0, lost: true, ...(status !== "ok" ? { error: String(data?.error ?? status) } : {}) });
    }, this.timing.lostRunGraceMs);
    t.unref?.();
  }

  /** onAgentEvent listener (lifecycle only). Worker runs only show their end here (§13.3). */
  onAgentEvent(evt) {
    if (!evt || evt.stream !== "lifecycle" || !this._alive()) return;
    const phase = evt.data?.phase;
    if (evt.sessionKey) {
      const list = this.sessionEvents.get(evt.sessionKey) ?? [];
      list.push({ phase, runId: evt.runId, at: this.now() });
      this.sessionEvents.set(evt.sessionKey, list.slice(-10));
      if (this.sessionEvents.size > 2000) this.sessionEvents.delete(this.sessionEvents.keys().next().value);
    }
    if (phase !== "end" && phase !== "error") return;
    const aborted = evt.data?.aborted === true || evt.data?.stopReason === "aborted";
    const status = aborted ? "aborted" : phase === "error" ? "error" : "ok";
    const ours = this.ourRuns.get(evt.runId);
    if (ours) {
      this._armLostRun(evt.runId, status, evt.data ?? {});
    } else {
      void this._onRunEnded(evt.runId, status).catch((err) => this.logger?.warn?.(`v-session-relay: run end ${evt.runId}: ${err?.message ?? err}`));
    }
    if (evt.sessionKey) {
      // A turn there just ended: the BUSY backoff is over (§4.3), keep its level for next time.
      const bo = this.backoff.get(evt.sessionKey);
      if (bo) bo.until = 0;
      this._schedulePump(evt.sessionKey, this.timing.pumpDebounceMs);
      this._backgroundCheckSession(evt.sessionKey);
    }
  }

  // ================================================================== transcripts (recovery, lost runs)

  async _messages(sessionKey) {
    if (typeof this.runtime?.getSessionMessages !== "function") return null;
    const prev = this._transcriptGate ?? Promise.resolve();
    let release;
    this._transcriptGate = new Promise((r) => { release = r; });
    await prev;
    try {
      const res = await this.runtime.getSessionMessages({ sessionKey, limit: 20 });
      return Array.isArray(res?.messages) ? res.messages : Array.isArray(res) ? res : [];
    } finally {
      setTimeout(release, this.timing.transcriptGapMs).unref?.();
    }
  }

  /** The final assistant text after the user message tagged `:<kind>:<id>`, before the next untagged user message. */
  async _transcriptReply(sessionKey, kind, id) {
    const messages = await this._messages(sessionKey);
    if (!messages) return null;
    return transcriptReplyOf(messages, kind, id);
  }

  async _transcriptHasTag(sessionKey, kind, id) {
    const messages = await this._messages(sessionKey);
    if (!messages) return null;
    return findTagIndex(messages, kind, id) >= 0;
  }

  // ================================================================== vrelay.get / list / cancel

  get({ sendId, code } = {}) {
    let rec = sendId ? this.ledger.getSend(sendId) : null;
    if (!rec && code) {
      const matches = this.ledger.sendsWhere((s) => s.code === code).sort((a, b) => b.createdAt - a.createdAt);
      rec = matches.find((s) => !isSendTerminal(s)) ?? matches[0] ?? null;
    }
    if (!rec) return { found: false };
    const { message, idempotencyKey, contentKey, history, ...rest } = rec;
    return { found: true, record: { ...rest, message: { visibleText: message.visibleText, chars: message.chars, trimmed: message.trimmed, redactions: message.redactions }, history: (history ?? []).slice(-10) } };
  }

  list({ sessionKey, active, limit } = {}) {
    const now = this.now();
    const max = Math.max(1, Math.min(Number.isSafeInteger(limit) ? limit : 50, 100));
    const items = this.ledger.sendsWhere((s) => (!sessionKey || s.requester.sessionKey === sessionKey || s.target.sessionKey === sessionKey)
      && (!active || !SEND_TERMINAL_PHASES.includes(s.phase)))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, max)
      .map((s) => ({
        sendId: s.sendId, code: s.code, phase: s.phase,
        requester: { sessionKey: s.requester.sessionKey, label: s.requester.label },
        target: { sessionKey: s.target.sessionKey, label: s.target.label },
        ageMs: now - s.createdAt,
      }));
    let queued = 0;
    for (const q of this.queues.values()) queued += q.length;
    const awaiting = this.ledger.sendsWhere((s) => ["target_done", "awaiting_children", "awaiting_background", "result_ready", "failure_ready"].includes(s.phase)).length;
    return { items, counts: { running: this.running.size, queued, awaiting } };
  }

  async cancel({ sendId, reason } = {}) {
    const cur = this.ledger.getSend(sendId);
    if (!cur) return { ok: false, error: "unknown sendId" };
    if (isSettled(cur) || SEND_TERMINAL_PHASES.includes(cur.phase)) return { ok: false, error: `already ${cur.phase}` };
    const why = String(reason ?? "").trim() || reasonText("cancelled");
    this._queue(cur.target.sessionKey).remove(cur.kind, sendId);
    this._queue(cur.target.sessionKey).remove("collect", sendId);
    clearTimeout(this.postRetryTimers.get(sendId));
    const rec = await this._updateSend(sendId, (d) => {
      if (isSettled(d) || SEND_TERMINAL_PHASES.includes(d.phase)) return false;
      d.phase = "cancelled";
      d.failure = { class: "cancelled", code: "cancelled", reason: reasonText("cancelled") };
      d.cancelReason = why;
      return undefined;
    }, { note: `cancelled: ${why}` });
    if (!rec) return { ok: false, error: "changed meanwhile" };
    await this._targetNote(rec, targetCancelledNote({ code: rec.code, reason: why }), "cancel");
    if (rec.batchId) await this._checkBatch(rec.batchId);
    return { ok: true };
  }

  // ================================================================== periodic (memory only; no directory scans)

  async _sweep() {
    if (!this._alive()) return;
    const now = this.now();
    for (const rec of this.ledger.sendsWhere((s) => ACTIVE_PHASES.includes(s.phase))) {
      if (rec.phase === "queued" && now > rec.deadlines.queueBy) {
        await this._fail(rec.sendId, { class: "not_started", code: "queue_timeout", reason: reasonText("queue_timeout", { h: Math.round(this.limits.queueTimeoutMs / 3600_000) }) }, { note: "not_started" });
        continue;
      }
      if (rec.phase === "running" && rec.deadlines.runBy && now > rec.deadlines.runBy) {
        await this._fail(rec.sendId, { class: "timeout", code: "timeout", reason: reasonText("timeout", { h: Math.round(this.limits.runTimeoutMs / 3600_000) }) });
        continue;
      }
      if (rec.phase === "awaiting_background" && !this.bgTimers.has(rec.sendId)) this._armBackground(rec.sendId, 0);
      if (rec.phase === "queued" && rec.request.messageId && !rec.request.queueNoteEditedAt && now - rec.createdAt >= this.timing.queueNoteAfterMs
        && rec.target.transport === "bridge" && this.bridge.caps(rec.target.bridgeKey)?.editPost) {
        const lines = String(rec.request.text ?? "").split("\n");
        const base = isQueueLine(lines.at(-1)) ? lines.slice(0, -1) : lines;
        const text = [...base, queuedLine({ m: Math.round((now - rec.createdAt) / 60_000) })].join("\n");
        const ok = await this._editAnchor(rec, text);
        if (ok) await this._updateSend(rec.sendId, (d) => { d.request.queueNoteEditedAt = now; d.request.queuedLine = true; });
      }
      if (rec.mode === "inline" && !rec.inline.expiredAt && !rec.inline.claimedAt && now > rec.inline.until + 5_000) await this._expireInline(rec.sendId, "sweep");
    }
    if (now - this.lastArchiveAt >= this.timing.archiveEveryMs) {
      this.lastArchiveAt = now;
      await this.ledger.sweep({ keep: (kind, r) => kind === "batches" && r.phase === "woken" && !r.wake?.endedAt && now - (r.updatedAt ?? 0) < 2 * 24 * 3600_000 });
    }
  }
}

// ---------------------------------------------------------------- transcript helpers

function provenanceOf(m) {
  return m?.provenance ?? m?.message?.provenance ?? m?.inputProvenance ?? m?.meta?.provenance ?? null;
}
function roleOf(m) { return m?.role ?? m?.message?.role; }
function textOf(m) {
  const content = m?.content ?? m?.message?.content ?? m?.text;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((p) => p && p.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n");
  return "";
}

/** Index of the last user message whose originSessionId ends with `:<kind>:<id>`. */
export function findTagIndex(messages, kind, id) {
  const abbr = { request: "req", ask: "ask", collect: "col", wake: "wake" }[kind] ?? kind;
  const suffix = `:${abbr}:${id}`;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (roleOf(m) !== "user") continue;
    const origin = provenanceOf(m)?.originSessionId;
    if (typeof origin === "string" && origin.endsWith(suffix)) return i;
  }
  return -1;
}

export function transcriptReplyOf(messages, kind, id) {
  const start = findTagIndex(messages, kind, id);
  if (start < 0) return null;
  let last = null;
  for (let i = start + 1; i < messages.length; i += 1) {
    const m = messages[i];
    if (roleOf(m) === "user") {
      const origin = provenanceOf(m)?.originSessionId;
      if (!(typeof origin === "string" && origin.startsWith("v-a2a:") && origin.endsWith(`:${id}`))) break;
      continue;
    }
    if (roleOf(m) === "assistant") {
      const text = textOf(m).trim();
      if (text) last = text;
    }
  }
  return last;
}
