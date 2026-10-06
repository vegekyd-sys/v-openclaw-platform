import assert from 'node:assert/strict';

// Move a housekeeping memory flush behind the reply (memory-flush-defer), on V's
// 2026.9.1 db91.6 bytes.
//
// Production V 2026-10-06 19:40: a user message in a large vlab-worker session waited
// 38.6 s before its own run entered the harness. In front of it, the reply path's
// pre-reply memory flush (executePreparedReplyAgentRun -> traceAgentPhase
// "reply.memory_flush" -> runMemoryFlushIfNeeded) ran a 34.9 s embedded run in the same
// session that read and wrote memory/2026-10-06.md and answered NO_REPLY. The session sat
// at ~300k tokens, far below its compaction threshold: nothing was about to drop context.
//
// The flush protects one thing: durable memories written while the context that holds
// them is still there, before compaction summarizes it away. Its two triggers:
//   tokens            projected tokens >= compaction threshold - softThresholdTokens
//                     (4000 by default): compaction is near, the flush must go first;
//   transcript bytes  forceFlushTranscriptBytes (2 MiB by default) of model-visible
//                     transcript, once per compaction cycle, a guard for stale counters.
// A 300k-token session with tool output passes 2 MiB long before it nears a 1M window, so
// the transcript-size trigger fires while compaction is many turns away.
//
// The reply path has no flush after the run (agentCommand's post-run flush belongs to the
// Gateway `agent` command path, not to chat/channel replies), so a session that crossed
// the trigger during one turn is flushed in front of the next user message, possibly
// hours later.
//
// This change, on the reply path only:
//   agent-runner-memory  runMemoryFlushIfNeeded, once it has decided to flush, asks an
//                        optional deferPreReplyFlush hook; a true answer returns
//                        outcome "deferred" without running. runSessionCompactionIfNeeded
//                        accepts a `probe` object: it fills {willCompact, threshold,
//                        tokenCount} from the very gate preflight compaction uses and
//                        returns before compacting or writing anything.
//   agent-runner.runtime executePreparedReplyAgentRun passes the hook. It defers only when
//                        the token count is known, the projected tokens leave at least
//                        max(32768, 25% of the flush threshold) of room below the flush
//                        threshold (so a token-threshold flush, which by definition is
//                        within softThresholdTokens of compaction, always stays first),
//                        and the preflight probe says this turn does not compact. Then the
//                        flush runs after the reply operation clears and the session has
//                        been idle OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH_IDLE_MS (120 s by
//                        default), through the same runMemoryFlushIfNeeded, on the session
//                        lane, with no reply operation. A new non-heartbeat turn for the
//                        session aborts a running deferred flush (abort is not counted as
//                        a flush failure) and restarts the idle wait; if the flush has not
//                        run by the time compaction nears, the next turn flushes first
//                        exactly as before.
//
// Busy state (VLab candidate at 69bd4b9: a message sent while the deferred flush ran got
// state=final after 215 ms with no text). Having no reply operation does not make the flush
// invisible: its embedded run is active for the session's sessionId, and get-reply's
// resolveQueueBusyState counts isEmbeddedAgentRunActive(), so the turn reached runReplyAgent
// with isActive=true and took the steer path (no injectable reply operation, so a parked
// followup) or enqueue-followup, both decided before the yield aborted the flush.
// runReplyAgent therefore re-resolves isActive right after the yield: while a deferred
// flush of this session is running or still unwinding from the abort, the turn counts as
// busy only when another reply operation (not this turn's own provided operation) is
// registered for the session, so a real active reply is still steered into or queued
// behind. Otherwise the turn runs itself; its embedded run waits on the session lane until
// the aborted flush has released it.
//
// Gateway work admission (VLab candidate 2026-10-06: the deferred flush failed with
// "Gateway is draining; new tasks are not accepted" while nothing drained). The idle timer
// is armed inside the reply's async context, so it inherits that reply's root-work
// admission (an AsyncLocalStorage store). When it fires the admission is released, and
// isGatewaySubordinateWorkAdmissionClosed() returns `current.released` for any chain that
// carries a store, so the session-lane enqueue rejects with GatewayDrainingError and the
// flush counts a failure. The deferred run therefore:
//   - skips (phase=skipped reason=admission-closed, no failure counted, flush stays due
//     for the next pre-reply check) when isGatewayWorkAdmissionClosed() reports a real
//     restart drain, restart-signal fence or host suspension;
//   - otherwise runs under its own independent root admission "memory-flush-deferred"
//     (runWithGatewayIndependentRootWorkAdmission, as heartbeat wakes do), which replaces
//     the stale store and is visible to restart-drain and busy accounting;
//   - aborts on a restart drain (getGatewayRestartDrainSignal) as well as on a new turn,
//     and agent-runner-memory does not count an aborted deferred flush as a failure.
//
// Outcomes (VLab candidate at 6f05930, interrupt arm: "ran aborted ms=2454", then the
// re-run "ran skipped"). Neither the abort path nor a returned "deferred" writes
// memoryFlush; only a completed flush (or an exhausted failure budget) marks the cycle.
// But the "ran" line printed "aborted" whenever the signal was aborted, which also hid a
// flush that had finished (and marked the cycle) before an abort landed during its
// lifecycle completion. The line now carries the real outcome plus aborted:true, and a
// deferred run's skip carries its reason (already-flushed, below-trigger,
// transcript-stats-unavailable, no-entry). A read of the transcript stats can fail while
// the session's transcript projection is reindexed; the size trigger then reads as not
// met, so a deferred run that skipped for that reason keeps the job and looks again after
// the idle wait (at most three times) instead of ending it.
//
// Failure budget (VLab candidate at b6fef51: "ran outcome=failed aborted=true", and the
// session entry held memoryFlush {kind:"failed"}). recordMemoryFlushFailure is the only
// failed-write site; it skipped the write only when the abort signal was already aborted
// at the moment the error was recorded. An error that reached the flush first (from the
// incoming turn's own work, or from shutdown) was written as a counted failure, and three
// consecutive ones mark the cycle as flushed ("exhausted": no flush until the next
// compaction). A deferred flush runs behind the reply and is interrupted by design, so it
// never writes the failure budget now; its log line carries the error class
// (error:<name>). A flush that keeps failing is retried at most once per idle period, and
// near compaction the pre-reply flush runs first with the normal budget.
//
// Steering behind the unwinding flush (VLab candidate at b6fef51: message C, 100 ms after
// B, ended up outside B's turn; stock merges C into B's run). Chat and channel steering
// injects only into a reply operation's attached backend, never into the flush (which
// has no reply operation). But B's embedded run waits on the session lane until the
// aborted flush lets go, so B has no backend yet, the injection is rejected, and stock
// falls back to a separate queued followup turn after B. While a deferred flush of the
// session is in flight and another real reply is registered, a steer-mode turn now
// waits (at most STEER_WAIT_MS) until that reply can take the message, or until it ends,
// and then steers as stock would (phase=steer-wait).
//
// Injection by sessionId (queueEmbeddedAgentMessageWithOutcome: the TUI embedded backend,
// realtime voice control, sessions_spawn into a run-scoped session and subagent
// announces) reaches whatever embedded run is active for the sessionId, and a running
// deferred flush took such a message in as a stock pre-reply flush does. Those callers do
// not go through runReplyAgent, so they did not yield the flush either, and the message
// became part of a NO_REPLY housekeeping turn. A deferred flush now registers its run id
// (agent-runner-memory, only when memoryFlushDeferred), and builtin-openclaw's embedded
// run handle for that run refuses the injection as a compacting run does: prepare
// reports reason "compacting", the outcome every caller already handles (subagent
// announces retry and then deliver directly to the parent, the TUI embedded backend queues
// a followup, voice control speaks the compacting refusal, sessions_spawn reports the
// rejection). Refusing as "not_streaming" instead would make a subagent announce for a
// requester that still looks active end "dropped". The refusal also yields the flush
// (phase=yielded reason=session-injection), unless Gateway admission is closed (a
// restart drain asks compacting runs the same question and already aborts the flush).
// A stock pre-reply flush is not registered and still accepts injection.
// OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH=0 turns it off. Tagged log lines
// `[memory-flush-deferred.1]` carry a hashed session key and numbers, never message text.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export const MEMORY_FLUSH_DEFER_MARKER = 'memory-flush-defer-v1';

// ---------------------------------------------------------------------------------------
// agent-runner-memory-7VF-zwNt.js

const FLUSH_DECISION_BEFORE = `	if (!(shouldRunMemoryFlush({
		entry,
		tokenCount: tokenCountForFlush,
		threshold: flushThreshold
	}) || shouldForceFlushByTranscriptSize && entry != null && !hasAlreadyFlushedForCurrentCompaction(entry))) return {
		sessionEntry: entry ?? params.sessionEntry,
		outcome: "skipped"
	};
	logVerbose(\`memoryFlush triggered: sessionKey=\${params.sessionKey} tokenCount=\${tokenCountForFlush ?? "undefined"} threshold=\${flushThreshold}\`);
`;

const FLUSH_DECISION_AFTER = `	const memoryFlushTokenTriggered = shouldRunMemoryFlush({
		entry,
		tokenCount: tokenCountForFlush,
		threshold: flushThreshold
	});
	if (!(memoryFlushTokenTriggered || shouldForceFlushByTranscriptSize && entry != null && !hasAlreadyFlushedForCurrentCompaction(entry))) return {
		sessionEntry: entry ?? params.sessionEntry,
		outcome: "skipped",
		// ${MEMORY_FLUSH_DEFER_MARKER}: a deferred run reports why it found nothing to flush.
		...params.memoryFlushDeferred === true ? { skipReason: entry == null ? "no-entry" : hasAlreadyFlushedForCurrentCompaction(entry) ? "already-flushed" : shouldCheckTranscriptSizeForForcedFlush && typeof transcriptByteSize !== "number" ? "transcript-stats-unavailable" : "below-trigger" } : {}
	};
	logVerbose(\`memoryFlush triggered: sessionKey=\${params.sessionKey} tokenCount=\${tokenCountForFlush ?? "undefined"} threshold=\${flushThreshold}\`);
	// ${MEMORY_FLUSH_DEFER_MARKER}: a reply-path caller may move a housekeeping flush behind the reply.
	if (typeof params.deferPreReplyFlush === "function") {
		let deferred = false;
		try {
			deferred = await params.deferPreReplyFlush({
				sessionEntry: entry ?? params.sessionEntry,
				tokenCount: tokenCountForFlush,
				flushThreshold,
				tokenTriggered: memoryFlushTokenTriggered,
				transcriptBytes: transcriptByteSize,
				forceFlushTranscriptBytes
			}) === true;
		} catch (err) {
			logVerbose(\`memoryFlush deferral check failed; flushing before the reply: \${String(err)}\`);
		}
		if (deferred) return {
			sessionEntry: entry ?? params.sessionEntry,
			outcome: "deferred"
		};
	}
`;

const LATCH_BEFORE = '	if (latch !== void 0 && (typeof maxActiveTranscriptBytes !== "number" ||';
const LATCH_AFTER = '	if (latch !== void 0 && params.probe === void 0 && (typeof maxActiveTranscriptBytes !== "number" ||';

const PREFLIGHT_GATE_BEFORE = `	if (!(shouldRunPreflightCompaction({
		entry,
		tokenCount: tokenCountForCompaction,
		threshold
	}) || shouldCompactByTranscriptBytes)) return entry ?? params.sessionEntry;
`;

const PREFLIGHT_GATE_AFTER = `	if (params.probe) {
		// ${MEMORY_FLUSH_DEFER_MARKER}: report this turn's preflight decision without compacting or writing.
		params.probe.willCompact = Boolean(shouldRunPreflightCompaction({
			entry,
			tokenCount: tokenCountForCompaction,
			threshold
		}) || shouldCompactByTranscriptBytes);
		params.probe.threshold = threshold;
		params.probe.tokenCount = tokenCountForCompaction ?? freshPersistedTokens;
		return entry ?? params.sessionEntry;
	}
${PREFLIGHT_GATE_BEFORE}`;

const FAILURE_COUNT_BEFORE = '	if (!isAbortError(error) && storePath && sessionKey) try {\n';
const FAILURE_COUNT_AFTER = `	// ${MEMORY_FLUSH_DEFER_MARKER}: a deferred flush runs behind the reply and is interrupted by design
	// (new turn, restart drain, shutdown); it never writes the failure budget.
	if (!isAbortError(error) && run.memoryFlushDeferred !== true && storePath && sessionKey) try {
`;

const FAILURE_RETURN_BEFORE = '\treturn {\n\t\tsessionEntry,\n\t\toutcome\n\t};\n}\n//#endregion\nexport';
const FAILURE_RETURN_AFTER = `\treturn {
		sessionEntry,
		outcome,
		// ${MEMORY_FLUSH_DEFER_MARKER}: the error class only, for the deferred run's log line.
		...run.memoryFlushDeferred === true ? { failureName: isAbortError(error) ? "AbortError" : error instanceof Error ? error.name : typeof error } : {}
	};
}
//#endregion
export`;

export const DEFERRED_FLUSH_RUNS_KEY = 'openclaw.memoryFlushDefer.deferredRuns.v1';

const FLUSH_RUN_REGISTER_BEFORE = '\tconst flushedCompactionCount = activeSessionEntry?.compactionCount ?? 0;\n';
const FLUSH_RUN_REGISTER_AFTER = `\t// ${MEMORY_FLUSH_DEFER_MARKER}: a deferred flush registers its run: the embedded run's handle
	// (builtin-openclaw) refuses injection by sessionId as compacting and asks the flush to yield.
	const deferredMemoryFlushRuns = params.memoryFlushDeferred === true ? globalThis[Symbol.for("${DEFERRED_FLUSH_RUNS_KEY}")] ??= /* @__PURE__ */ new Map() : void 0;
	deferredMemoryFlushRuns?.set(flushRunId, {
		sessionKey: params.sessionKey,
		onInjection: typeof params.onDeferredFlushInjection === "function" ? params.onDeferredFlushInjection : void 0
	});
${FLUSH_RUN_REGISTER_BEFORE}`;

const FLUSH_RUN_RELEASE_BEFORE = '\t} finally {\n\t\tawait deferredLifecycle.complete();\n\t\tif (flushRunRegistered) clearAgentRunContext(flushRunId);\n';
const FLUSH_RUN_RELEASE_AFTER = `\t} finally {
		try {
			await deferredLifecycle.complete();
		} finally {
			// ${MEMORY_FLUSH_DEFER_MARKER}: registered until the embedded run has let go of the session
			deferredMemoryFlushRuns?.delete(flushRunId);
		}
		if (flushRunRegistered) clearAgentRunContext(flushRunId);
`;

export function patchAgentRunnerMemory(source) {
  assert(!source.includes(MEMORY_FLUSH_DEFER_MARKER), 'agent-runner-memory is already patched');
  let out = replaceExactlyOnce(source, FLUSH_DECISION_BEFORE, FLUSH_DECISION_AFTER, 'memory flush decision');
  out = replaceExactlyOnce(out, LATCH_BEFORE, LATCH_AFTER, 'byte-compaction latch clear');
  out = replaceExactlyOnce(out, PREFLIGHT_GATE_BEFORE, PREFLIGHT_GATE_AFTER, 'preflight compaction gate');
  out = replaceExactlyOnce(out, FAILURE_COUNT_BEFORE, FAILURE_COUNT_AFTER, 'memory flush failure accounting');
  out = replaceExactlyOnce(out, FAILURE_RETURN_BEFORE, FAILURE_RETURN_AFTER, 'memory flush failure result');
  out = replaceExactlyOnce(out, FLUSH_RUN_REGISTER_BEFORE, FLUSH_RUN_REGISTER_AFTER, 'memory flush run registration');
  out = replaceExactlyOnce(out, FLUSH_RUN_RELEASE_BEFORE, FLUSH_RUN_RELEASE_AFTER, 'memory flush run release');
  return out;
}

// ---------------------------------------------------------------------------------------
// agent-runner.runtime-CAdsMsQt.js

export const DEFER_REGION_START = `//#region ${MEMORY_FLUSH_DEFER_MARKER}`;
export const DEFER_REGION_END = `//#endregion ${MEMORY_FLUSH_DEFER_MARKER}`;
export const MIN_HEADROOM_TOKENS = 32768;
export const HEADROOM_RATIO = 0.25;
export const DEFAULT_IDLE_MS = 120000;
export const STEER_WAIT_MS = 5000;
export const STEER_POLL_MS = 25;

const DEFER_REGION = `${DEFER_REGION_START}
/** Housekeeping memory flushes that can wait until after the reply (memory-flush-defer). */
const MEMORY_FLUSH_DEFER_MIN_HEADROOM_TOKENS = ${MIN_HEADROOM_TOKENS};
const MEMORY_FLUSH_DEFER_HEADROOM_RATIO = ${HEADROOM_RATIO};
const MEMORY_FLUSH_DEFER_DEFAULT_IDLE_MS = ${DEFAULT_IDLE_MS};
const MEMORY_FLUSH_DEFER_MAX_IDLE_MS = 36e5;
const MEMORY_FLUSH_DEFER_MAX_UNREADABLE_RETRIES = 3;
const MEMORY_FLUSH_DEFER_STEER_WAIT_MS = ${STEER_WAIT_MS};
const MEMORY_FLUSH_DEFER_STEER_POLL_MS = ${STEER_POLL_MS};
const memoryFlushDeferLog = createSubsystemLogger("auto-reply/memory-flush-defer");
const deferredMemoryFlushJobs = /* @__PURE__ */ new Map();
function isPreReplyMemoryFlushDeferralEnabled(env = process.env) {
	return env.OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH !== "0";
}
function resolveDeferredMemoryFlushIdleMs(env = process.env) {
	const raw = env.OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH_IDLE_MS;
	const value = raw === void 0 || raw === "" ? NaN : Number(raw);
	return Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), MEMORY_FLUSH_DEFER_MAX_IDLE_MS) : MEMORY_FLUSH_DEFER_DEFAULT_IDLE_MS;
}
function hashMemoryFlushSessionKey(sessionKey) {
	return crypto.createHash("sha256").update(String(sessionKey)).digest("hex").slice(0, 12);
}
function logMemoryFlushDeferral(fields) {
	memoryFlushDeferLog.info(\`[memory-flush-deferred.1] \${JSON.stringify(fields)}\`);
}
/**
* Pure decision. A flush is moved behind the reply only when it is pure housekeeping:
* known token count, far below the flush threshold (a token-threshold flush is within
* softThresholdTokens of compaction and always stays first), and this turn's preflight
* gate does not compact. Anything unknown keeps the flush in front.
*/
function resolvePreReplyMemoryFlushDeferral(input) {
	if (!input.enabled) return {
		defer: false,
		reason: "disabled"
	};
	if (input.isHeartbeat) return {
		defer: false,
		reason: "heartbeat"
	};
	if (!input.hasSession) return {
		defer: false,
		reason: "no-session"
	};
	const tokens = input.tokenCount;
	const threshold = input.flushThreshold;
	if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) return {
		defer: false,
		reason: "token-count-unknown"
	};
	if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0) return {
		defer: false,
		reason: "threshold-unknown"
	};
	const headroom = Math.max(MEMORY_FLUSH_DEFER_MIN_HEADROOM_TOKENS, Math.floor(threshold * MEMORY_FLUSH_DEFER_HEADROOM_RATIO));
	if (tokens + headroom > threshold) return {
		defer: false,
		reason: "near-compaction",
		headroom
	};
	const probe = input.probe;
	if (probe === void 0) return {
		defer: false,
		reason: "probe-required",
		headroom
	};
	if (probe.willCompact !== false) return {
		defer: false,
		reason: probe.willCompact === true ? "compaction-this-turn" : "compaction-unknown",
		headroom
	};
	if (typeof probe.tokenCount === "number" && Number.isFinite(probe.tokenCount) && probe.tokenCount + headroom > threshold) return {
		defer: false,
		reason: "near-compaction",
		headroom
	};
	return {
		defer: true,
		reason: "housekeeping",
		headroom
	};
}
/** deferPreReplyFlush hook for runMemoryFlushIfNeeded on the reply path. */
async function deferPreReplyMemoryFlush(ctx) {
	const flushState = ctx.flushState ?? {};
	const base = {
		enabled: isPreReplyMemoryFlushDeferralEnabled(),
		isHeartbeat: ctx.isHeartbeat === true,
		hasSession: Boolean(ctx.sessionKey && ctx.storePath && ctx.replyOperation),
		tokenCount: flushState.tokenCount,
		flushThreshold: flushState.flushThreshold
	};
	let decision = resolvePreReplyMemoryFlushDeferral(base);
	if (decision.reason !== "probe-required") {
		if (base.enabled && !base.isHeartbeat) logVerbose(\`memoryFlush kept before the reply: \${decision.reason}\`);
		return false;
	}
	const probe = {};
	await runSessionCompactionIfNeeded({
		cfg: ctx.cfg,
		followupRun: ctx.followupRun,
		promptForEstimate: ctx.followupRun.prompt,
		defaultModel: ctx.defaultModel,
		sessionEntry: flushState.sessionEntry,
		sessionStore: ctx.sessionStore,
		sessionKey: ctx.sessionKey,
		runtimePolicySessionKey: ctx.runtimePolicySessionKey,
		storePath: ctx.storePath,
		isHeartbeat: ctx.isHeartbeat,
		abortSignal: ctx.replyOperation.abortSignal,
		probe
	});
	decision = resolvePreReplyMemoryFlushDeferral({
		...base,
		probe
	});
	if (!decision.defer) {
		logVerbose(\`memoryFlush kept before the reply: \${decision.reason}\`);
		return false;
	}
	const idleMs = resolveDeferredMemoryFlushIdleMs();
	scheduleDeferredMemoryFlush(ctx, idleMs);
	logMemoryFlushDeferral({
		phase: "deferred",
		session: hashMemoryFlushSessionKey(ctx.sessionKey),
		tokens: Math.round(flushState.tokenCount),
		threshold: Math.round(flushState.flushThreshold),
		compactionThreshold: typeof probe.threshold === "number" ? Math.round(probe.threshold) : null,
		trigger: flushState.tokenTriggered ? "tokens" : "transcript_bytes",
		idleMs
	});
	return true;
}
function scheduleDeferredMemoryFlush(ctx, idleMs) {
	const key = ctx.sessionKey;
	let job = deferredMemoryFlushJobs.get(key);
	if (!job) {
		job = {
			key,
			epoch: 0,
			state: "new",
			timer: void 0,
			controller: void 0,
			ctx,
			idleMs
		};
		deferredMemoryFlushJobs.set(key, job);
	}
	if (job.state === "running") return job;
	job.ctx = ctx;
	job.idleMs = idleMs;
	waitForDeferredMemoryFlushReplyClear(job, ctx.replyOperation);
	return job;
}
function waitForDeferredMemoryFlushReplyClear(job, operation) {
	const epoch = ++job.epoch;
	if (job.timer) clearTimeout(job.timer);
	job.timer = void 0;
	job.state = "waiting-reply";
	runAfterReplyOperationClear(operation, () => armDeferredMemoryFlushTimer(job, epoch));
}
function armDeferredMemoryFlushTimer(job, epoch) {
	if (deferredMemoryFlushJobs.get(job.key) !== job || job.epoch !== epoch) return;
	const timerEpoch = ++job.epoch;
	if (job.timer) clearTimeout(job.timer);
	job.state = "idle-wait";
	job.timer = setTimeout(() => {
		startDeferredMemoryFlush(job, timerEpoch);
	}, job.idleMs);
	job.timer?.unref?.();
}
function startDeferredMemoryFlush(job, epoch) {
	if (deferredMemoryFlushJobs.get(job.key) !== job || job.epoch !== epoch) return;
	job.timer = void 0;
	const activeOperation = replyRunRegistry.get(job.key);
	if (activeOperation) {
		waitForDeferredMemoryFlushReplyClear(job, activeOperation);
		return;
	}
	if (isGatewayWorkAdmissionClosed()) {
		// Restart drain, restart-signal fence or host suspension: not a flush failure. The
		// flush stays due and the next pre-reply check decides again.
		deferredMemoryFlushJobs.delete(job.key);
		logMemoryFlushDeferral({
			phase: "skipped",
			session: hashMemoryFlushSessionKey(job.key),
			reason: "admission-closed"
		});
		return;
	}
	if (job.inFlight > 0) {
		// a yielded run is still unwinding: start only after it has let go of the session
		job.running.then(() => armDeferredMemoryFlushTimer(job, epoch));
		return;
	}
	const runEpoch = ++job.epoch;
	const controller = new AbortController();
	const abortSignal = AbortSignal.any([controller.signal, getGatewayRestartDrainSignal()]);
	const startedAt = Date.now();
	job.controller = controller;
	job.state = "running";
	job.inFlight = (job.inFlight ?? 0) + 1;
	// The timer was armed inside the reply's async context and inherits that reply's
	// root-work admission, released by now: subordinate admission (session lane enqueue,
	// session work admission) would read it as closed and throw GatewayDrainingError.
	// Run under a fresh independent root instead, so drain/busy accounting also sees it.
	const report = {};
	job.running = runWithGatewayIndependentRootWorkAdmission(() => runDeferredMemoryFlush(job.ctx, abortSignal, report), "memory-flush-deferred").catch((error) => {
		logVerbose(\`deferred memory flush was not admitted: \${String(error)}\`);
		return "not-admitted";
	}).then((outcome) => {
		job.inFlight -= 1;
		// the real outcome: an abort that lands after the flush finished does not undo it
		const retryUnreadable = outcome === "skipped" && report.skipReason === "transcript-stats-unavailable" && (job.unreadableRetries ?? 0) < MEMORY_FLUSH_DEFER_MAX_UNREADABLE_RETRIES;
		logMemoryFlushDeferral({
			phase: "ran",
			session: hashMemoryFlushSessionKey(job.key),
			outcome,
			...abortSignal.aborted ? { aborted: true } : {},
			...report.skipReason ? { reason: report.skipReason } : {},
			...report.failureName ? { error: report.failureName } : {},
			...retryUnreadable ? { retry: true } : {},
			ms: Date.now() - startedAt
		});
		if (deferredMemoryFlushJobs.get(job.key) !== job || job.epoch !== runEpoch) return;
		if (retryUnreadable) {
			// the transcript projection was being reindexed: the flush is still due, look again after the idle wait
			job.unreadableRetries = (job.unreadableRetries ?? 0) + 1;
			armDeferredMemoryFlushTimer(job, job.epoch);
			return;
		}
		deferredMemoryFlushJobs.delete(job.key);
	});
	return job.running;
}
async function runDeferredMemoryFlush(ctx, abortSignal, report = {}) {
	const sessionStore = {};
	const sessionEntry = refreshSessionEntryFromStore({
		storePath: ctx.storePath,
		sessionKey: ctx.sessionKey,
		fallbackEntry: void 0,
		activeSessionStore: sessionStore
	});
	if (!sessionEntry?.sessionId) return "no-session";
	const sessionChanged = sessionEntry.sessionId !== ctx.followupRun.run.sessionId;
	const followupRun = {
		...ctx.followupRun,
		prompt: "",
		run: {
			...ctx.followupRun.run,
			sessionId: sessionEntry.sessionId,
			...sessionChanged ? { sessionFile: ctx.sessionKey } : {}
		}
	};
	try {
		const result = await runMemoryFlushIfNeeded({
			cfg: ctx.cfg,
			followupRun,
			promptForEstimate: "",
			sessionCtx: ctx.sessionCtx,
			defaultModel: ctx.defaultModel,
			resolvedVerboseLevel: ctx.resolvedVerboseLevel,
			sessionEntry,
			sessionStore,
			sessionKey: ctx.sessionKey,
			runtimePolicySessionKey: ctx.runtimePolicySessionKey,
			storePath: ctx.storePath,
			isHeartbeat: false,
			abortSignal,
			memoryFlushDeferred: true,
			// an injection by sessionId was refused by this run's handle: the message goes
			// elsewhere, the flush yields. A restart drain asks the same question and already
			// aborts the flush through the drain signal.
			onDeferredFlushInjection: () => {
				if (!isGatewayWorkAdmissionClosed()) yieldDeferredMemoryFlush(ctx.sessionKey, "session-injection");
			},
			onVisibleErrorPayloads: (payloads) => {
				logVerbose(\`deferred memory flush produced \${payloads.length} maintenance error payload(s)\`);
			}
		});
		if (result?.skipReason) report.skipReason = result.skipReason;
		if (result?.failureName) report.failureName = result.failureName;
		return result?.outcome ?? "unknown";
	} catch (error) {
		logVerbose(\`deferred memory flush failed: \${String(error)}\`);
		return "error";
	}
}
/** A new turn for the session goes first: abort a running deferred flush and wait for idle again. */
function yieldDeferredMemoryFlush(sessionKey, reason) {
	const job = deferredMemoryFlushJobs.get(sessionKey);
	if (!job || job.state === "waiting-reply" || job.state === "new") return false;
	const wasRunning = job.state === "running";
	if (wasRunning) {
		job.controller?.abort();
		logMemoryFlushDeferral({
			phase: "yielded",
			session: hashMemoryFlushSessionKey(sessionKey),
			reason
		});
	}
	armDeferredMemoryFlushTimer(job, job.epoch);
	return wasRunning;
}
/**
* isActive for runReplyAgent after the yield. get-reply resolved it before the yield, and
* the deferred flush's embedded run is active for the session's sessionId, so it reads
* busy while the flush runs and while it unwinds from the abort. A flush is not a reply
* to steer into or queue behind: in that window only another registered reply operation
* (not this turn's own provided operation) keeps the turn busy.
*/
function resolveReplyActiveAfterDeferredFlushYield(params) {
	if (!params.isActive || params.isHeartbeat || !params.sessionKey) return params.isActive;
	const job = deferredMemoryFlushJobs.get(params.sessionKey);
	if (!job || !(job.inFlight > 0)) return true;
	const operation = replyRunRegistry.get(params.sessionKey);
	if (operation !== void 0 && operation !== params.providedReplyOperation) return true;
	logMemoryFlushDeferral({
		phase: "turn-not-busy",
		session: hashMemoryFlushSessionKey(params.sessionKey),
		flush: "in-flight"
	});
	return false;
}
/**
* A steer-mode message for a session whose real reply is queued behind an unwinding
* deferred flush. That reply's embedded run waits on the session lane until the flush has
* let go, so it has no backend to inject into yet, and stock steering would fall back to a
* separate queued followup turn. Wait (bounded) until the reply can take the message, as
* it could at once without the flush; give up when the reply ends or the wait runs out.
*/
async function waitForSteerTargetBehindDeferredFlush(params) {
	if (!params.isActive || !params.shouldSteer || params.isHeartbeat || !params.sessionKey) return;
	const job = deferredMemoryFlushJobs.get(params.sessionKey);
	if (!job || !(job.inFlight > 0)) return;
	const operation = replyRunRegistry.get(params.sessionKey);
	if (!operation || operation === params.providedReplyOperation) return;
	const startedAt = Date.now();
	let result = "timeout";
	while (Date.now() - startedAt < MEMORY_FLUSH_DEFER_STEER_WAIT_MS) {
		if (replyRunRegistry.get(params.sessionKey) !== operation) {
			result = "reply-ended";
			break;
		}
		if (replyRunRegistry.resolveCurrentMessageInjectionTarget(params.sessionKey)) {
			result = "injectable";
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, MEMORY_FLUSH_DEFER_STEER_POLL_MS));
	}
	logMemoryFlushDeferral({
		phase: "steer-wait",
		session: hashMemoryFlushSessionKey(params.sessionKey),
		result,
		ms: Date.now() - startedAt
	});
}
${DEFER_REGION_END}
`;

const EXECUTE_FN = 'async function executePreparedReplyAgentRun(context) {\n';

const FLUSH_CALL_BEFORE = `		isHeartbeat,
		replyOperation,
		onVisibleErrorPayloads: (payloads) => {
			logVerbose(\`memory flush produced \${payloads.length} visible maintenance error payload(s); continuing user reply\`);
		}
	}));
`;

const FLUSH_CALL_AFTER = `		isHeartbeat,
		replyOperation,
		deferPreReplyFlush: (flushState) => deferPreReplyMemoryFlush({
			flushState,
			cfg,
			followupRun,
			defaultModel,
			sessionStore: activeSessionStore,
			sessionKey,
			runtimePolicySessionKey,
			storePath,
			isHeartbeat,
			replyOperation,
			sessionCtx,
			resolvedVerboseLevel
		}),
		onVisibleErrorPayloads: (payloads) => {
			logVerbose(\`memory flush produced \${payloads.length} visible maintenance error payload(s); continuing user reply\`);
		}
	}));
`;

const REPLY_START_BEFORE = '\tconst isHeartbeat = opts?.isHeartbeat === true;\n\tlet didDeliverVisiblePartialReply = false;\n';
const REPLY_START_AFTER = '\tconst isHeartbeat = opts?.isHeartbeat === true;\n\tif (!isHeartbeat && sessionKey) yieldDeferredMemoryFlush(sessionKey, "inbound-turn");\n\tconst isActive = resolveReplyActiveAfterDeferredFlushYield({\n\t\tisActive: isActiveBeforeDeferredFlushYield,\n\t\tisHeartbeat,\n\t\tsessionKey,\n\t\tprovidedReplyOperation\n\t});\n\tawait waitForSteerTargetBehindDeferredFlush({\n\t\tisActive,\n\t\tshouldSteer: shouldSteer && !effectiveResetTriggered && !isHeartbeat,\n\t\tisHeartbeat,\n\t\tsessionKey,\n\t\tprovidedReplyOperation\n\t});\n\tlet didDeliverVisiblePartialReply = false;\n';

const REPLY_PARAMS_BEFORE = 'queueAdmissionState = "empty", isActive, isRunActive, opts,';
const REPLY_PARAMS_AFTER = 'queueAdmissionState = "empty", isActive: isActiveBeforeDeferredFlushYield, isRunActive, opts,';

const ADMISSION_IMPORT_BEFORE = 'import { t as GatewayDrainingError } from "./gateway-work-admission-3tn4Qiws.js";\n';
const ADMISSION_IMPORT_AFTER = 'import { b as runWithGatewayIndependentRootWorkAdmission, f as isGatewayWorkAdmissionClosed, s as getGatewayRestartDrainSignal, t as GatewayDrainingError } from "./gateway-work-admission-3tn4Qiws.js";\n';

export function patchAgentRunnerRuntime(source) {
  assert(!source.includes(MEMORY_FLUSH_DEFER_MARKER), 'agent-runner.runtime is already patched');
  let out = replaceExactlyOnce(source, ADMISSION_IMPORT_BEFORE, ADMISSION_IMPORT_AFTER, 'gateway work admission import');
  out = replaceExactlyOnce(out, EXECUTE_FN, `${DEFER_REGION}${EXECUTE_FN}`, 'reply agent run executor');
  out = replaceExactlyOnce(out, FLUSH_CALL_BEFORE, FLUSH_CALL_AFTER, 'pre-reply memory flush call');
  out = replaceExactlyOnce(out, REPLY_PARAMS_BEFORE, REPLY_PARAMS_AFTER, 'reply agent isActive parameter');
  out = replaceExactlyOnce(out, REPLY_START_BEFORE, REPLY_START_AFTER, 'reply agent turn start');
  return out;
}

/** The deferral region of a patched runtime, for tests that run it against fakes. */
export function extractDeferRegion(patchedRuntime) {
  const start = patchedRuntime.indexOf(DEFER_REGION_START);
  const end = patchedRuntime.indexOf(DEFER_REGION_END);
  assert(start >= 0 && end > start, 'memory-flush-defer region not found');
  return patchedRuntime.slice(start, end + DEFER_REGION_END.length);
}

// ---------------------------------------------------------------------------------------
// builtin-openclaw-zQV8Wwjr.js (V's bytes: V patches it)

export const BUILTIN_REGION_START = `//#region ${MEMORY_FLUSH_DEFER_MARKER}`;
export const BUILTIN_REGION_END = `//#endregion ${MEMORY_FLUSH_DEFER_MARKER}`;

const BUILTIN_REGION = `${BUILTIN_REGION_START}
/**
* A deferred memory flush (memory-flush-defer) runs behind the reply with no reply
* operation, and agent-runner-memory registers its run id. Injection by sessionId must
* not land in it: its handle reads as available and compacting, so prepare refuses with
* reason "compacting" (the refusal every caller already handles: retry, followup or direct
* delivery), and the flush is asked to yield. Any other run is untouched.
*/
function resolveDeferredMemoryFlushRun(attempt) {
	if (attempt.trigger !== "memory" || !attempt.runId) return;
	return globalThis[Symbol.for("${DEFERRED_FLUSH_RUNS_KEY}")]?.get(attempt.runId);
}
function refuseDeferredMemoryFlushInjection(attempt) {
	const run = resolveDeferredMemoryFlushRun(attempt);
	if (!run) return false;
	try {
		run.onInjection?.();
	} catch {}
	return true;
}
${BUILTIN_REGION_END}
`;

const PREPARE_STREAM_FN = 'function prepareEmbeddedAttemptStream(input) {\n';

const QUEUE_MESSAGE_BEFORE = '\tconst queueMessage = async (text, options) => {\n\t\tconst canInject = () => acceptingSteerMessages && !input.getRunState().aborted && !input.runAbortController.signal.aborted;\n';
const QUEUE_MESSAGE_AFTER = '\tconst queueMessage = async (text, options) => {\n\t\tif (resolveDeferredMemoryFlushRun(attempt)) throw new Error("active run is a deferred memory flush");\n\t\tconst canInject = () => acceptingSteerMessages && !input.getRunState().aborted && !input.runAbortController.signal.aborted;\n';

// available while registered (also while it unwinds from the yield): a "not_streaming"
// refusal would make a subagent announce for a still-active requester end "dropped"
const INJECTION_AVAILABLE_BEFORE = '\t\t\tisAvailable: () => acceptingSteerMessages && !input.getRunState().aborted && !input.runAbortController.signal.aborted,\n';
const INJECTION_AVAILABLE_AFTER = '\t\t\tisAvailable: () => resolveDeferredMemoryFlushRun(attempt) !== void 0 || acceptingSteerMessages && !input.getRunState().aborted && !input.runAbortController.signal.aborted,\n';

const IS_COMPACTING_BEFORE = '\t\tisCompacting: () => subscription.isCompacting(),\n';
const IS_COMPACTING_AFTER = '\t\tisCompacting: () => refuseDeferredMemoryFlushInjection(attempt) || subscription.isCompacting(),\n';

export function patchBuiltinOpenclaw(source) {
  assert(!source.includes(MEMORY_FLUSH_DEFER_MARKER), 'builtin-openclaw is already patched');
  let out = replaceExactlyOnce(source, PREPARE_STREAM_FN, `${BUILTIN_REGION}${PREPARE_STREAM_FN}`, 'embedded attempt stream preparation');
  out = replaceExactlyOnce(out, QUEUE_MESSAGE_BEFORE, QUEUE_MESSAGE_AFTER, 'embedded run queueMessage');
  out = replaceExactlyOnce(out, INJECTION_AVAILABLE_BEFORE, INJECTION_AVAILABLE_AFTER, 'embedded run injection availability');
  out = replaceExactlyOnce(out, IS_COMPACTING_BEFORE, IS_COMPACTING_AFTER, 'embedded run compacting state');
  return out;
}

/** The embedded run handle of a patched builtin (queueMessage through attachBackend), for tests. */
export function extractBuiltinQueueHandle(patchedBuiltin) {
  const regionStart = patchedBuiltin.indexOf(BUILTIN_REGION_START);
  const regionEnd = patchedBuiltin.indexOf(BUILTIN_REGION_END);
  const start = patchedBuiltin.indexOf('\tconst queueMessage = async (text, options) => {\n');
  const end = patchedBuiltin.indexOf('\tattempt.replyOperation?.attachBackend(queueHandle);\n', start);
  assert(start >= 0 && end > start, 'embedded run handle not found');
  return {
    region: regionStart >= 0 && regionEnd > regionStart ? patchedBuiltin.slice(regionStart, regionEnd + BUILTIN_REGION_END.length) : '',
    handle: patchedBuiltin.slice(start, end),
  };
}
