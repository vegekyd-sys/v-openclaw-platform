// run-start-phases-v1: where a chat turn's time goes between the reply resolver starting and the agent run
// starting (onAgentRunStart, the run's first agent event). One structured log line per run
// ([run-start-phases.1]). Logging only; no behaviour changes.
//
// V 2026-11-20..23: /vds dispatcherAtMs -> runStartAtMs ([firsttext-e2e.1]) is p50 1.27 s, p90 3.8 s. The only
// log line inside that window is the plugin tool registration (p50 0.78 s after dispatch, then 0.43 s to run
// start), so nothing says which step the rest is. This measures it on V:
//   startedAtMs  epoch ms at getReplyFromConfig entry (joins [firsttext-e2e.1].dispatcherAtMs by runId)
//   steps        ordered [step, ms since the previous mark]. ">name" is the gap before a traced phase starts,
//                "name" the phase itself. get-reply: every traceGetReplyPhase (reply.init_session_state,
//                reply.resolve_directives, reply.handle_inline_actions, ...). agent-runner: run-reply-agent,
//                every traceAgentPhase (reply.memory_flush, reply.preflight_compaction, reply.run_agent_turn),
//                agent-turn, turn-media, fallback-start, embedded-call. Codex plugin (run-attempt): codex-enter,
//                codex-connection, codex-runtime, codex-tools, codex-context, codex-prompt. The last step, run-start,
//                is the time from the previous mark to onAgentRunStart: the run's first agent event, which for Codex
//                is the app-server startup event at the top of startCodexAttemptRuntime (not turn/started).
//   lagMaxMs / lagOver50Ms   event-loop lag sampled every 100 ms while this head is open: the largest, and the
//                sum of lags >= 50 ms (main thread blocked by this or any other work in the process).
// Heads that never reach a run start (commands, silent replies, errors) expire without logging. One
// process-global tracker (Symbol.for), so the core chunks and the Codex plugin share it.

export const HEAD_MARKER = 'run-start-phases-v1';

export const HEAD_HELPER = `//#region V ${HEAD_MARKER}: dispatch -> run start timing (logging only)
function __vRunHead() {
	const key = Symbol.for("openclaw.v.runStartPhases.v1");
	if (globalThis[key]) return globalThis[key];
	const heads = new Set();
	const byRun = new Map();
	let sampler;
	let lastTick = 0;
	const tick = () => {
		const now = Date.now();
		const lag = Math.max(0, now - lastTick - 100);
		lastTick = now;
		for (const head of heads) {
			if (lag > head.lagMaxMs) head.lagMaxMs = lag;
			if (lag >= 50) head.lagOver50Ms += lag;
		}
	};
	const drop = (head) => {
		heads.delete(head);
		if (head.runId !== void 0 && byRun.get(head.runId) === head) byRun.delete(head.runId);
		if (heads.size === 0 && sampler) {
			clearInterval(sampler);
			sampler = void 0;
		}
	};
	const expire = (now) => {
		for (const head of heads) if (now - head.startedAtMs > (head.runId === void 0 ? 6e4 : 6e5)) drop(head);
		while (heads.size >= 64) drop(heads.values().next().value);
	};
	const api = {
		begin() {
			try {
				const now = Date.now();
				expire(now);
				const head = { startedAtMs: now, last: now, steps: [], lagMaxMs: 0, lagOver50Ms: 0, runId: void 0 };
				heads.add(head);
				if (!sampler) {
					lastTick = now;
					sampler = setInterval(tick, 100);
					sampler.unref?.();
				}
				return head;
			} catch {}
		},
		mark(head, step) {
			try {
				if (!head || !heads.has(head) || head.steps.length >= 80) return;
				const now = Date.now();
				head.steps.push([step, now - head.last]);
				head.last = now;
			} catch {}
		},
		bind(head, runId) {
			try {
				if (!head || !heads.has(head) || typeof runId !== "string" || !runId) return;
				if (head.runId !== void 0 && byRun.get(head.runId) === head) byRun.delete(head.runId);
				head.runId = runId;
				byRun.set(runId, head);
			} catch {}
		},
		markRun(runId, step) {
			try {
				if (typeof runId === "string") api.mark(byRun.get(runId), step);
			} catch {}
		},
		active() {
			return heads.size > 0;
		},
		finish(runId) {
			try {
				const head = typeof runId === "string" ? byRun.get(runId) : void 0;
				if (!head) return;
				api.mark(head, "run-start");
				drop(head);
				return { runId: head.runId, startedAtMs: head.startedAtMs, totalMs: head.last - head.startedAtMs, steps: head.steps, lagMaxMs: head.lagMaxMs, lagOver50Ms: head.lagOver50Ms };
			} catch {}
		}
	};
	globalThis[key] = api;
	return api;
}
//#endregion
`;
