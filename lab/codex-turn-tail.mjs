// codex-turn-tail-v1: timing of a Codex turn's tail, from the app-server's turn/completed to the end of the
// embedded run, as one structured log line per run ([codex-turn-tail.1]). Logging only; no behaviour changes.
//
// V 2026-10-10 01:33-01:55 (after batch-20261010): a big /vds group's short replies ended 3-12 s after Codex's
// task_complete (0.7-1.1 s on 10/08), with no log line for the run in between. VLab could not reproduce it
// (3.1-3.7 s on V's and the batch's bytes alike), so the tail itself is now measured on V:
//   steps  ordered [step, ms] since the previous mark. Codex plugin (run-attempt): turn-completion (turn/completed
//          to the attempt's completion promise), drain-close-projection (notification queue drained, transcript
//          checkpoint closed), turn-drain (the result built, up to the final section), prompt-mirror-wait (the user prompt's transcript write),
//          transcript-mirror (the turn's messages written), settled-finalization, agent-end-hooks (llm_output and
//          agent_end dispatch; channel turns do not wait for agent_end side effects), binding-mark. Core
//          (embedded-agent): attempt-return (the plugin's cleanup until the core resumes),
//          user-message-persistence, normalize, failover-decision, settle.
//   tx     SQLite transactions in this process during the tail with a lock wait >= 20 ms or a hold >= 50 ms:
//          operation label, wait, hold, offset. Process-wide: another run's writes show up here too.
//          Main thread only: worker-thread transactions (the transcript projection's index prepare) are not here;
//          waiting on them shows up as the step that awaited them (VLab: 2.7-3.6 s in the drain on a 172 MB session,
//          event-loop lag <= 27 ms).
//   rpc    Gateway RPC responses >= 200 ms during the tail: method, ms, connection, offset.
//   lag    event-loop lag sampled every 100 ms during the tail: max, and the sum of lags >= 50 ms.
// One process-global tracker (Symbol.for), so the plugin and the core chunks share it.

export const TAIL_MARKER = 'codex-turn-tail-v1';

export const TAIL_HELPER = `//#region V ${TAIL_MARKER}: Codex turn tail timing (logging only)
function __vCodexTurnTail() {
	const key = Symbol.for("openclaw.v.codexTurnTail.v1");
	if (globalThis[key]) return globalThis[key];
	const runs = new Map();
	let sampler;
	let lastTick = 0;
	const tick = () => {
		const now = Date.now();
		const lag = Math.max(0, now - lastTick - 100);
		lastTick = now;
		for (const run of runs.values()) {
			if (lag > run.lagMaxMs) run.lagMaxMs = lag;
			if (lag >= 50) run.lagOver50Ms += lag;
		}
	};
	const api = {
		start(runId, meta) {
			try {
				if (typeof runId !== "string" || !runId || runs.has(runId)) return;
				const now = Date.now();
				for (const [id, run] of runs) if (now - run.startedAt > 6e5) runs.delete(id);
				if (runs.size >= 64) runs.delete(runs.keys().next().value);
				runs.set(runId, { runId, ...meta, startedAt: now, last: now, steps: [], tx: [], rpc: [], lagMaxMs: 0, lagOver50Ms: 0 });
				if (!sampler) {
					lastTick = now;
					sampler = setInterval(tick, 100);
					sampler.unref?.();
				}
			} catch {}
		},
		mark(runId, step) {
			try {
				const run = runs.get(runId);
				if (!run) return;
				const now = Date.now();
				run.steps.push([step, now - run.last]);
				run.last = now;
			} catch {}
		},
		note(kind, item) {
			try {
				if (runs.size === 0) return;
				const now = Date.now();
				for (const run of runs.values()) if (run[kind].length < 40) run[kind].push({ ...item, atMs: now - run.startedAt });
			} catch {}
		},
		active() {
			return runs.size > 0;
		},
		end(runId) {
			try {
				const run = runs.get(runId);
				if (!run) return;
				runs.delete(runId);
				if (runs.size === 0 && sampler) {
					clearInterval(sampler);
					sampler = void 0;
				}
				const { last, startedAt, ...rest } = run;
				return { ...rest, totalMs: Date.now() - startedAt };
			} catch {}
		}
	};
	globalThis[key] = api;
	return api;
}
//#endregion
`;
