import assert from 'node:assert/strict';

// One stuck operation no longer blocks a browser profile until the Gateway restarts (V 2026-11-27).
//
// Each browser profile has a lifecycle actor whose settled "tail" serializes starts and destructive
// transitions; ordinary work (status, tabs, snapshot, act) and later starts wait on that tail, often with no
// caller deadline (GET /profiles waits on every profile). In 9.1 a tail link could stay pending forever:
// a restart/stop transition awaits Promise.allSettled(actor.leases) and an admitted lease that ignores the
// abort never settles; a queued start and a transition's cleanup have no budget either.
//
// On V the managed "openclaw" profile (Gateway-launched Chrome on 127.0.0.1:22804) stopped answering at
// ~17:56 on 2026-11-27, right after a ~7 s Gateway event-loop stall (liveness p99 6975 ms at 17:58:21): the
// tab sweeper reached it at 17:50:59 and failed from 18:01:07 on. For 8+ hours every request for that profile
// - browser.request status/tabs/snapshot, the agents' browser tool and browser_fill_secret's in-process
// dispatcher - ran into its deadline (45 s "browser request timed out", UNAVAILABLE), GET /profiles hung,
// while the Chrome answered CDP in 0 ms with no client attached and the other profiles (ha-lab,
// account-procurement, vbrowser-*) answered normally. stop/reset queue on the same tail, so only a Gateway
// restart recovered it.
//
// browser-lifecycle-unwedge-v1 (source: vegekyd-sys/openclaw-versa
// versa/port-browser-lifecycle-unwedge-20261128 @9c0bc742323): every tail link settles on its own clock.
// - a transition waits for aborted leases at most OPENCLAW_BROWSER_LEASE_DRAIN_MS (15 s), then continues
//   without them (they were aborted and are fenced by the generation bump);
// - a queued start owns the tail at most OPENCLAW_BROWSER_START_BUDGET_MS (120 s), then rejects;
// - a transition's resource cleanup and afterCleanup each get OPENCLAW_BROWSER_CLEANUP_BUDGET_MS (60 s); expiry
//   fails the transition and leaves the profile to the existing cleanup retry.
// Each expiry logs a "[browser/lifecycle]" warning.

export const MARKER = 'browser-lifecycle-unwedge-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const HELPERS = `/**
* ${MARKER}: every link of an actor's settled tail settles on its own clock. Ordinary work and later
* starts/transitions wait on the tail, often without a caller deadline (status, profile listing); one start
* or cleanup that never settles, or one admitted lease that ignores the abort a transition sends it, would
* otherwise block the profile until the Gateway restarts.
*/
function lifecycleBudgetMs(name, fallbackMs) {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? value : fallbackMs;
}
/** How long a transition waits for aborted leases before it continues without them. */
function profileLeaseDrainMs() {
	return lifecycleBudgetMs("OPENCLAW_BROWSER_LEASE_DRAIN_MS", 15e3);
}
/** How long one queued start may own the tail. Launch plus CDP readiness is well under this. */
function profileStartBudgetMs() {
	return lifecycleBudgetMs("OPENCLAW_BROWSER_START_BUDGET_MS", 12e4);
}
/** How long one transition's resource cleanup (and its afterCleanup) may own the tail. */
function profileCleanupBudgetMs() {
	return lifecycleBudgetMs("OPENCLAW_BROWSER_CLEANUP_BUDGET_MS", 6e4);
}
function warnLifecycle(message) {
	console.warn(\`[browser/lifecycle] \${message}\`);
}
/** Resolves true when \`promise\` settles within \`ms\`, false when it is still pending. */
async function settlesWithin(promise, ms) {
	let timer;
	const expired = new Promise((resolve) => {
		timer = setTimeout(() => resolve(false), ms);
		timer.unref?.();
	});
	try {
		return await Promise.race([promise.then(() => true, () => true), expired]);
	} finally {
		clearTimeout(timer);
	}
}
/** Rejects with \`onExpire()\` when \`work\` does not settle within \`ms\`; \`work\` keeps running unobserved. */
async function withinBudget(work, ms, onExpire) {
	let timer;
	const expired = new Promise((_, reject) => {
		timer = setTimeout(() => reject(onExpire()), ms);
		timer.unref?.();
	});
	work.catch(() => {});
	try {
		return await Promise.race([work, expired]);
	} finally {
		clearTimeout(timer);
	}
}
function combineSignals(lifecycleSignal, callerSignal) {`;

export function patchLifecycle(source) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to server-context.lifecycle-D0RhNtWT.js`);
  let out = replaceExactlyOnce(source, 'function combineSignals(lifecycleSignal, callerSignal) {', HELPERS, 'combineSignals');
  out = replaceExactlyOnce(out,
    '		await profileLeaseStorage.run(owned, async () => await params.run(signal, generation));\n',
    `		const budgetMs = profileStartBudgetMs();
		await withinBudget(profileLeaseStorage.run(owned, async () => await params.run(signal, generation)), budgetMs, () => {
			warnLifecycle(\`profile "\${params.runtime.profile.name}" start did not settle within \${budgetMs} ms; released the profile queue\`);
			return new BrowserProfileUnavailableError(\`Browser start for profile "\${params.runtime.profile.name}" did not finish within \${Math.round(budgetMs / 1e3)} s. Retry the browser call.\`);
		});
`,
    'enqueueProfileStart run');
  out = replaceExactlyOnce(out,
    '		await Promise.allSettled(actor.leases);\n',
    `		const drainMs = profileLeaseDrainMs();
		if (!await settlesWithin(Promise.allSettled(actor.leases), drainMs)) {
			warnLifecycle(\`profile "\${ownerProfile.name}" \${params.reason}: \${actor.leases.size} operation(s) ignored cancellation for \${drainMs} ms; continuing without them\`);
			actor.leases.clear();
		}
`,
    'transition lease drain');
  out = replaceExactlyOnce(out,
    `		const result = await cleanupProfileResources({
			state: params.state,
			runtime: params.runtime,
			eagerMcpClose,
			hadPendingWork: hadPendingWork || Boolean(eagerPlaywrightRetirement?.retired)
		});
		cleanupCompleted = true;
		await params.afterCleanup?.();
`,
    `		const cleanupMs = profileCleanupBudgetMs();
		const cleanupExpired = (step) => () => {
			warnLifecycle(\`profile "\${ownerProfile.name}" \${params.reason}: \${step} did not settle within \${cleanupMs} ms\`);
			return new BrowserProfileUnavailableError(\`Browser profile "\${ownerProfile.name}" \${step} did not finish within \${Math.round(cleanupMs / 1e3)} s.\`);
		};
		const result = await withinBudget(cleanupProfileResources({
			state: params.state,
			runtime: params.runtime,
			eagerMcpClose,
			hadPendingWork: hadPendingWork || Boolean(eagerPlaywrightRetirement?.retired)
		}), cleanupMs, cleanupExpired("cleanup"));
		cleanupCompleted = true;
		if (params.afterCleanup) await withinBudget(params.afterCleanup(), cleanupMs, cleanupExpired("post-cleanup"));
`,
    'transition cleanup');
  return out;
}

export const FILES = [
  { name: 'server-context.lifecycle-D0RhNtWT.js', base: 'lab/release-files/browser-lifecycle-unwedge/base', target: 'openclaw/dist', before: '8f0cd4f4b444eb7ab13822a0d78a42cceddf1f52fe3eaa33f174e073440f9aac', patch: patchLifecycle },
];
