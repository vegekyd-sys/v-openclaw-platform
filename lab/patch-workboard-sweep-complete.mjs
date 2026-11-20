import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// workboard-sweep-complete: the Workboard lifecycle sweep's 10-minute full listing covers the whole session
// catalog again, and a complete snapshot fails only an orphaned prepared launch. See lab/workboard-sweep-complete.md.
//
// V, 2026-11-18: readWorkboardLifecycleSessions lists sessions with limit 10,000 and calls a full listing complete
// only when the page comes back shorter. V lists ~22,900 sessions (makaron 22,852 unarchived, non-cron), so since
// late October the full sweep is never complete:
//   - syncWorkboardLifecycleSessions never fails a prepared launch (failPreparedLaunch needs `complete`). A launch
//     lost to a restart would stay prepared forever, and while any card is prepared every sweep is a full one.
//   - sessions ranked past 10,000 by updatedAt (V: not updated since 2026-10-30 17:19 CST; 8,125 unarchived
//     linked cards) are never reconciled by a full sweep again.
// Restoring completeness alone would also restore an old race: the dispatcher prepares a launch, then awaits
// subagent.run (seconds) before accepting it; a full sweep that listed sessions before the run's session existed
// and read the card while still prepared failed a launch that was being started (V, September: 9 launches failed
// 1-36 s after they were prepared).
//
// 1. A full read requests limit 1,000,000 and is complete when the Gateway says hasMore === false (V's
//    sessions.list lifecycle rows return hasMore/totalCount). Without hasMore, only a page shorter than 10,000
//    counts, as before. Incremental (activeMinutes) reads keep limit 10,000 and are never complete.
// 2. A complete snapshot fails a prepared launch only when it is orphaned: prepared at or before this process
//    started (performance.timeOrigin; lost to a restart, failed at the first complete snapshot as before), or
//    30 minutes (WORKBOARD_STALE_SESSION_MS) before the sweep began and still without an accepted session.
// OPENCLAW_V_WORKBOARD_SWEEP_COMPLETE=0 restores both (read on every sweep).
//
// Source: vegekyd-sys/openclaw-versa versa/port-workboard-sweep-complete-20261118 (extensions/workboard/src/lifecycle-sync.ts).

export const MARKER = 'workboard-sweep-complete';
export const ENV = 'OPENCLAW_V_WORKBOARD_SWEEP_COMPLETE';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const once = (source, needle, what) => assert.equal(source.split(needle).length, 2, `Expected exactly one ${what}`);
const swap = (pairs) => ({
  patch(source) {
    assert(!source.includes(MARKER), 'already patched');
    for (const [before, , what] of pairs) once(source, before, what);
    return pairs.reduce((text, [before, after]) => text.replace(before, () => after), source);
  },
  unpatch(source) {
    assert(source.includes(MARKER), 'not patched');
    for (const [, after, what] of pairs) once(source, after, `patched ${what}`);
    return pairs.reduce((text, [before, after]) => text.replace(after, () => before), source);
  },
});

// ---- extensions/workboard/index.js (V: workboard-sweep-bounded #487 release) ----
export const INDEX = 'extensions/workboard/index.js';
export const INDEX_BEFORE = '448d3ae80781a98bc7b55ec14394c52f44e3247dc512d4e5aaef4a13c8a71466';
const index = swap([
  [
    `const WORKBOARD_SESSION_SWEEP_LIMIT = 1e4;
`,
    `const WORKBOARD_SESSION_SWEEP_LIMIT = 1e4;
// ${MARKER}: a full sweep lists the whole catalog. Only a complete snapshot can fail an orphaned prepared launch, and
// a session past a fixed page is never reconciled again once the catalog outgrows the page. The Gateway's hasMore
// proves the listing complete; this only bounds a runaway catalog.
const WORKBOARD_SESSION_FULL_SWEEP_LIMIT = 1e6;
// ${MARKER}: a launch this process prepared is accepted or failed by its own dispatcher, which may still be starting
// the subagent run while a sweep lists sessions. A complete snapshot fails it only after this long without an accepted
// session; a launch an earlier process prepared (lost to a restart) fails at the first complete snapshot.
const WORKBOARD_PREPARED_LAUNCH_GRACE_MS = WORKBOARD_STALE_SESSION_MS;
const workboardSweepComplete = () => process.env.${ENV} !== "0";
`,
    'sweep limit constant',
  ],
  [
    `		if (launch?.phase === "prepared" && (preparedAcceptanceAt === void 0 || preparedAcceptanceAt < launch.preparedAt)) {
			if (params.complete && await params.store.failPreparedLaunch(card.id, {`,
    `		if (launch?.phase === "prepared" && (preparedAcceptanceAt === void 0 || preparedAcceptanceAt < launch.preparedAt)) {
			// ${MARKER}: an orphaned launch: prepared by an earlier process, or by this one and still without an accepted
			// session after the grace period. Anything younger may be a subagent run this process's dispatcher is still starting.
			const orphaned = !workboardSweepComplete() || launch.preparedAt <= (params.processStartedAt ?? performance.timeOrigin) || launch.preparedAt + WORKBOARD_PREPARED_LAUNCH_GRACE_MS <= (params.snapshotStartedAt ?? now);
			if (params.complete && orphaned && await params.store.failPreparedLaunch(card.id, {`,
    'prepared launch failure',
  ],
  [
    `	const payload = await gateway.request("sessions.list", {
		limit: WORKBOARD_SESSION_SWEEP_LIMIT,`,
    `	// ${MARKER}: a full read lists the whole catalog and trusts the Gateway's hasMore.
	const wholeCatalog = !activeMinutes && workboardSweepComplete();
	const payload = await gateway.request("sessions.list", {
		limit: wholeCatalog ? WORKBOARD_SESSION_FULL_SWEEP_LIMIT : WORKBOARD_SESSION_SWEEP_LIMIT,`,
    'sessions.list limit',
  ],
  [
    `		complete: !activeMinutes && payload.sessions.length < WORKBOARD_SESSION_SWEEP_LIMIT,`,
    `		complete: !activeMinutes && (wholeCatalog && typeof payload.hasMore === "boolean" ? !payload.hasMore : payload.sessions.length < WORKBOARD_SESSION_SWEEP_LIMIT),`,
    'snapshot completeness',
  ],
  [
    `							...projected ? { projected: true } : {},
							now: params.now?.() ?? Date.now()`,
    `							...projected ? { projected: true } : {},
							snapshotStartedAt: sweepStartedAt,
							processStartedAt: params.processStartedAt ?? performance.timeOrigin,
							now: params.now?.() ?? Date.now()`,
    'sync call',
  ],
]);
export const patchIndex = index.patch;
export const unpatchIndex = index.unpatch;

export const FILES = [[INDEX, INDEX_BEFORE, index.patch, index.unpatch]];
