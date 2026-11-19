import assert from 'node:assert/strict';

// Interactive priority on the Gateway main thread: while a person's message is waiting for its
// first visible output, background sessions (Night Shift Workboard cards) hold back the work they
// would start on the Gateway's main thread, for a bounded time.
//
// V 2026-11-18 (read-only, [firsttext-e2e.1] + the shared Codex app-server's own log DB): with
// 15-24 Night Shift /vds cards running, a chat message's dispatcher -> run start went from P50 1.1 s
// to 2.5-3.2 s (P90 3.6 -> 9.9 s) while run -> first model token stayed at P50 ~8 s. The Gateway
// main thread was 59% busy (P90 71%); a regression of its CPU on event counts puts a Night Shift
// tool call at ~110 ms and a chat message's pre-run work at ~0.9 s. A chat message's own work is
// sliced between everyone else's, so its wait grows like S / (1 - load of the others).
//
// What it does (all in the Gateway process, state in one global singleton):
//   - dispatchReplyFromConfig (every inbound channel message and chat.send) marks the session
//     "interactive pending" unless the session key is a background one; the mark ends at the first
//     assistant/tool/item agent event of that session, when the dispatch ends, or after
//     OPENCLAW_V_INTERACTIVE_PRIORITY_TTL_MS (15 s)
//   - a Codex attempt of a background session waits before it starts, and before each OpenClaw
//     dynamic tool call it runs, while any interactive mark is pending, for at most
//     OPENCLAW_V_INTERACTIVE_PRIORITY_MAX_WAIT_MS (3 s) each time; work already running is not
//     interrupted and nothing is dropped
//   - background = session key matching OPENCLAW_V_INTERACTIVE_PRIORITY_BACKGROUND
//     (default ":subagent:workboard-", the sessions Night Shift pins its cards to)
//   - OPENCLAW_V_INTERACTIVE_PRIORITY=0 turns it off (read per call, so one process can A/B it)
//   - every 60 s with activity: one [v-interactive-priority.1] line with counts and wait totals

export const MARKER = 'v-interactive-priority-v1';

export const GATE_SOURCE = `// ${MARKER}
function __vInteractivePriority() {
	const slot = Symbol.for("openclaw.v.interactivePriority.v1");
	if (globalThis[slot]) return globalThis[slot];
	const enabled = () => process.env.OPENCLAW_V_INTERACTIVE_PRIORITY !== "0";
	const num = (name, fallback) => {
		const raw = process.env[name];
		const value = raw === void 0 || raw === "" ? NaN : Number(raw);
		return Number.isFinite(value) && value >= 0 ? value : fallback;
	};
	let backgroundSource;
	let backgroundPattern = null;
	const isBackground = (sessionKey) => {
		const source = process.env.OPENCLAW_V_INTERACTIVE_PRIORITY_BACKGROUND ?? ":subagent:workboard-";
		if (source !== backgroundSource) {
			backgroundSource = source;
			try { backgroundPattern = source ? new RegExp(source, "u") : null; } catch { backgroundPattern = null; }
		}
		return typeof sessionKey === "string" && backgroundPattern !== null && backgroundPattern.test(sessionKey);
	};
	const pending = new Map();
	const waiters = new Set();
	const stats = { marks: 0, visible: 0, ended: 0, expired: 0, waits: 0, waitedMs: 0, maxWaitMs: 0, capped: 0, pendingMax: 0 };
	let reported = "";
	const wake = () => {
		if (pending.size !== 0) return;
		for (const release of [...waiters]) release();
	};
	const clear = (sessionKey, reason) => {
		const entry = pending.get(sessionKey);
		if (!entry) return;
		pending.delete(sessionKey);
		clearTimeout(entry.timer);
		stats[reason] += 1;
		wake();
	};
	const api = {
		isBackground,
		enter(sessionKey) {
			if (!enabled() || typeof sessionKey !== "string" || !sessionKey || isBackground(sessionKey)) return () => {};
			const previous = pending.get(sessionKey);
			if (previous) clearTimeout(previous.timer);
			const entry = { since: Date.now(), timer: setTimeout(() => clear(sessionKey, "expired"), num("OPENCLAW_V_INTERACTIVE_PRIORITY_TTL_MS", 15e3)) };
			entry.timer.unref?.();
			pending.set(sessionKey, entry);
			stats.marks += 1;
			stats.pendingMax = Math.max(stats.pendingMax, pending.size);
			return () => { if (pending.get(sessionKey) === entry) clear(sessionKey, "ended"); };
		},
		observe(event) {
			if (pending.size === 0 || !event) return;
			const stream = event.stream;
			if (stream !== "assistant" && stream !== "tool" && stream !== "item") return;
			const sessionKey = event.deliverySessionKey ?? event.sessionKey;
			if (typeof sessionKey === "string" && pending.has(sessionKey)) clear(sessionKey, "visible");
		},
		async yieldToInteractive(sessionKey, signal) {
			if (pending.size === 0 || !enabled() || !isBackground(sessionKey) || signal?.aborted) return 0;
			const maxWaitMs = num("OPENCLAW_V_INTERACTIVE_PRIORITY_MAX_WAIT_MS", 3e3);
			if (maxWaitMs === 0) return 0;
			const startedAt = Date.now();
			await new Promise((resolve) => {
				let timer;
				const release = () => {
					clearTimeout(timer);
					waiters.delete(release);
					signal?.removeEventListener?.("abort", release);
					resolve();
				};
				timer = setTimeout(() => { stats.capped += 1; release(); }, maxWaitMs);
				waiters.add(release);
				signal?.addEventListener?.("abort", release, { once: true });
			});
			const waitedMs = Date.now() - startedAt;
			stats.waits += 1;
			stats.waitedMs += waitedMs;
			stats.maxWaitMs = Math.max(stats.maxWaitMs, waitedMs);
			return waitedMs;
		},
		stats: () => ({ ...stats, pending: pending.size, waiting: waiters.size, enabled: enabled() })
	};
	const report = setInterval(() => {
		const line = JSON.stringify(api.stats());
		if (line === reported) return;
		reported = line;
		console.log("[v-interactive-priority.1] " + line);
	}, 6e4);
	report.unref?.();
	globalThis[slot] = api;
	return api;
}
`;

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// core dist dispatch-from-config-*.js: mark interactive inbound turns
export function patchDispatchFromConfig(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    'async function dispatchReplyFromConfigWithQueuePolicy(params, allowActiveQueueResolution) {\n\tconst ticket = reserveReplyAdmissionTicket(',
    `${GATE_SOURCE}async function dispatchReplyFromConfigWithQueuePolicy(params, allowActiveQueueResolution) {
	const vInteractivePriorityEnd = __vInteractivePriority().enter(params.ctx?.SessionKey);
	const ticket = reserveReplyAdmissionTicket(`, 'dispatchReplyFromConfigWithQueuePolicy start');
  out = replaceExactlyOnce(out,
    '\t} finally {\n\t\tticket?.release();\n\t}\n}\nasync function dispatchReplyFromConfigInner(',
    '\t} finally {\n\t\tticket?.release();\n\t\tvInteractivePriorityEnd();\n\t}\n}\nasync function dispatchReplyFromConfigInner(', 'dispatchReplyFromConfigWithQueuePolicy finally');
  return out;
}

// core dist agent-events-*.js: the first assistant/tool/item event of an interactive session ends its mark
export function patchAgentEvents(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    'function emitAgentEventIfCurrent(event) {\n\tconst enriched = enrichAgentEvent(event);\n\tif (!enriched) return false;\n',
    `${GATE_SOURCE}function emitAgentEventIfCurrent(event) {
	const enriched = enrichAgentEvent(event);
	if (!enriched) return false;
	__vInteractivePriority().observe(enriched);
`, 'emitAgentEventIfCurrent');
}

// Codex plugin dist run-attempt-*.js: background attempts yield before they start and before each dynamic tool call
export function patchCodexRunAttempt(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    'async function runCodexAppServerAttempt(params, options) {\n\tconst connection = await prepareCodexAttemptConnection({',
    `${GATE_SOURCE}async function runCodexAppServerAttempt(params, options) {
	await __vInteractivePriority().yieldToInteractive(params.sessionKey, params.abortSignal);
	const connection = await prepareCodexAttemptConnection({`, 'runCodexAppServerAttempt start');
  out = replaceExactlyOnce(out,
    '\t\t\tconst replayedExecution = openClawDynamicToolExecutions.get(call);\n\t\t\tif (replayedExecution) {\n\t\t\t\tmarkCurrentTurnRequestProgress();\n\t\t\t\treturn toCodexDynamicToolProtocolResponse(await replayedExecution);\n\t\t\t}\n',
    `\t\t\tconst replayedExecution = openClawDynamicToolExecutions.get(call);
\t\t\tif (replayedExecution) {
\t\t\t\tmarkCurrentTurnRequestProgress();
\t\t\t\treturn toCodexDynamicToolProtocolResponse(await replayedExecution);
\t\t\t}
\t\t\tif (await __vInteractivePriority().yieldToInteractive(params.sessionKey, signal) > 0) markCurrentTurnRequestProgress();
`, 'dynamic tool call replay check');
  return out;
}

export const TARGETS = [
  { prefix: 'dispatch-from-config-', patch: patchDispatchFromConfig, marker: 'async function dispatchReplyFromConfigWithQueuePolicy(' },
  { prefix: 'agent-events-', patch: patchAgentEvents, marker: 'function emitAgentEventIfCurrent(event) {' },
  { prefix: 'run-attempt-', patch: patchCodexRunAttempt, marker: 'async function runCodexAppServerAttempt(params, options) {' },
];

// usage: node lab/patch-interactive-priority.mjs <dist dir> [more dist dirs...]
// patches, in place, every file in the given dist directories that one of TARGETS applies to
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dirs = process.argv.slice(2);
  assert(dirs.length, 'usage: patch-interactive-priority.mjs <dist dir>...');
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      const target = TARGETS.find((t) => name.startsWith(t.prefix) && name.endsWith('.js'));
      if (!target) continue;
      const file = path.join(dir, name);
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes(target.marker)) continue;
      if (source.includes(MARKER)) { console.log(`already patched ${file}`); continue; }
      fs.writeFileSync(file, target.patch(source));
      console.log(`patched ${file}`);
    }
  }
}
