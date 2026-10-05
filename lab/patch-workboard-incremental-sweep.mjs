import assert from 'node:assert/strict';

// Workboard lifecycle sweep reads only recently updated sessions between full sweeps.
//
// The workboard-lifecycle-sync service reconciles cards with their sessions every 60 s. A
// sweep runs whenever any unarchived card has a session, run, claim or execution, which on V
// is always (Night Shift keeps cards linked), and each sweep asked the Gateway for every
// session: sessions.list with limit 10000. On production V 2026-10-05 21:50-22:10 (CPU
// profile of the Gateway; 2,562 sessions across agents, 3,577 unarchived cards) every sweep held the Gateway main thread for
// 2.0-2.4 s over ~3 s, 1.2-1.4 s of it resolving session sharing per listed session, and
// the sweep's own two card-list reads added ~0.9 s: about 3 s of every 64 s. Inbound
// messages arriving inside that window waited for it before their run could start; the three
// liveness heartbeat delays in that window (1.3-2.6 s) were all inside sweeps.
//
// Card state normally follows agent/subagent end events; the periodic sweep is the backstop.
// Between full sweeps it now asks sessions.list only for sessions updated since the previous
// successful sweep began (activeMinutes, applied before any row or sharing work), plus a
// minute of margin. A full sweep still runs on the first pass, every 10 minutes, and whenever
// an unarchived card has a prepared launch, so the two decisions that depend on absence or
// age keep their inputs:
//   - failing a prepared launch the Gateway never accepted needs the complete list;
//   - a running session idle for 30 minutes (stale) is, by definition, not recently updated.
// Partial sweeps report complete=false, as an unavailable Gateway already does. Only a sweep
// whose sessions.list answered advances its marks (not an unavailable Gateway, not a failure),
// so the next one covers any gap. When the sync changed no card,
// the second card-list read is skipped and the first list is reused for worktree cleanup.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWorkboardIndex(source) {
  let out = source;
  out = replaceExactlyOnce(out,
    'const WORKBOARD_SESSION_SWEEP_LIMIT = 1e4;\n',
    'const WORKBOARD_SESSION_SWEEP_LIMIT = 1e4;\n/** Between full sweeps, list only sessions updated since the previous sweep began. */\nconst WORKBOARD_LIFECYCLE_FULL_SWEEP_MS = 6e5;\n',
    'sweep limit');
  out = replaceExactlyOnce(out,
    '\tconst payload = await gateway.request("sessions.list", {\n\t\tlimit: WORKBOARD_SESSION_SWEEP_LIMIT,\n',
    '\tconst activeMinutes = typeof options.activeMinutes === "number" && Number.isFinite(options.activeMinutes) && options.activeMinutes >= 1 ? Math.ceil(options.activeMinutes) : void 0;\n\tconst payload = await gateway.request("sessions.list", {\n\t\tlimit: WORKBOARD_SESSION_SWEEP_LIMIT,\n\t\t...activeMinutes ? { activeMinutes } : {},\n',
    'sessions.list request');
  out = replaceExactlyOnce(out,
    '\t\tcomplete: payload.sessions.length < WORKBOARD_SESSION_SWEEP_LIMIT\n\t};\n}\n',
    '\t\tcomplete: !activeMinutes && payload.sessions.length < WORKBOARD_SESSION_SWEEP_LIMIT,\n\t\tlisted: true\n\t};\n}\n',
    'complete flag');
  out = replaceExactlyOnce(out,
    '\tlet cleanupCursor = 0;\n',
    '\tlet cleanupCursor = 0;\n\tlet lastSweepStartedAt;\n\tlet lastFullSweepAt;\n',
    'service state');
  out = replaceExactlyOnce(out,
    `					if (cards.some((card) => needsWorkboardLifecycleReconciliation(card))) try {
						const snapshot = await params.readSessions({ includeUnknown: cards.some((card) => !card.metadata?.archivedAt && cardSessionKey(card) === "unknown") });
						if (generation !== owner) return;
						await syncWorkboardLifecycleSessions({
							store: params.store,
							cards,
							...snapshot,
							now: params.now?.() ?? Date.now()
						});
						if (generation !== owner) return;
						cards = await params.store.list();
					} catch (error) {`,
    `					if (cards.some((card) => needsWorkboardLifecycleReconciliation(card))) try {
						const sweepStartedAt = Date.now();
						const full = lastSweepStartedAt === void 0 || lastFullSweepAt === void 0 || sweepStartedAt - lastFullSweepAt >= WORKBOARD_LIFECYCLE_FULL_SWEEP_MS || sweepStartedAt < lastSweepStartedAt || cards.some((card) => !card.metadata?.archivedAt && card.metadata?.automation?.launch?.phase === "prepared");
						const snapshot = await params.readSessions({
							includeUnknown: cards.some((card) => !card.metadata?.archivedAt && cardSessionKey(card) === "unknown"),
							...full ? {} : { activeMinutes: Math.ceil((sweepStartedAt - lastSweepStartedAt) / 6e4) + 1 }
						});
						if (generation !== owner) return;
						const changed = await syncWorkboardLifecycleSessions({
							store: params.store,
							cards,
							...snapshot,
							now: params.now?.() ?? Date.now()
						});
						if (generation !== owner) return;
						if (snapshot.listed === true) {
							lastSweepStartedAt = sweepStartedAt;
							if (full) lastFullSweepAt = sweepStartedAt;
						}
						if (changed !== 0) cards = await params.store.list();
					} catch (error) {`,
    'reconcile sweep');
  return out;
}
