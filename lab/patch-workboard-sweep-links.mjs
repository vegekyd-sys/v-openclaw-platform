import assert from 'node:assert/strict';

// Workboard lifecycle partial sweeps read card links, not every full card.
//
// After #212 the lifecycle sweep lists only recently updated sessions between full sweeps, but
// every sweep, every minute, still began with store.list(): every card on V (3,577 unarchived)
// with its notes and all eleven child tables, built into full card objects on the Gateway main
// thread. #212's V profile put the sweep's card-list reads at ~0.9 s for two reads; on the shared
// VLab Gateway after #212 the per-minute burst was still 0.45-0.6 s. An inbound message that
// arrives during that read waits for it before its run can start.
//
// A partial sweep only changes cards whose session is in its short session list, and its worktree
// cleanup only touches cards with an uncleaned worktree. Both are decided by fields the store's
// lifecycle link projection already carries (listLifecycleLinks: id, agent, session/run keys,
// execution keys, automation JSON, archived flag; the same parent-row read agent_end uses). So
// a partial sweep now reads the links, picks those cards, and loads only them by id, through the
// unchanged per-card read. Selection is a superset of what the unchanged sync and cleanup act on
// (they still filter with the full card), and the sort order is the same, so the cleanup cursor
// walks the same list. Unchanged:
//   - a full sweep (first, every 10 minutes, any prepared launch) still loads every card;
//   - more than 64 selected cards (per-card reads stop being cheaper) loads every card;
//   - a store without listLifecycleLinks, or links that show no linked card (the sweep may then
//     still be needed for a running, claimed or stale card), takes the original path.

export const HYDRATE_LIMIT = 64;

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWorkboardIndex(source) {
  let out = source;
  out = replaceExactlyOnce(out,
    'const WORKBOARD_WORKTREE_CLEANUP_SWEEP_LIMIT = 32;\n',
    `const WORKBOARD_WORKTREE_CLEANUP_SWEEP_LIMIT = 32;\n/** A partial sweep loads at most this many cards by id; above it, one full list read is cheaper. */\nconst WORKBOARD_LIFECYCLE_HYDRATE_LIMIT = ${HYDRATE_LIMIT};\n`,
    'cleanup limit');
  out = replaceExactlyOnce(out,
    'const LIFECYCLE_TARGETS = {\n',
    `/** Card links from the store's parent-row projection (no notes, no child tables), when it has one. */
async function readWorkboardLifecycleLinks(store) {
	return typeof store.cardStore?.listLifecycleLinks === "function" ? await store.cardStore.listLifecycleLinks() : void 0;
}
function workboardLinkNeedsReconciliation(link) {
	return !link.metadata?.archivedAt && Boolean(link.sessionKey || link.runId || link.execution);
}
/** Unarchived cards a session in this snapshot can change: the keys syncWorkboardLifecycleSessions looks up, without its narrowing. */
function workboardLifecycleSnapshotCardIds(links, sessions) {
	if (sessions.length === 0) return [];
	const keys = /* @__PURE__ */ new Set();
	const suffixes = /* @__PURE__ */ new Set();
	for (const session of sessions) {
		keys.add(session.key);
		const suffixIndex = session.key.lastIndexOf(":subagent:workboard-");
		if (suffixIndex >= 0) suffixes.add(session.key.slice(suffixIndex + 1));
	}
	return links.filter((link) => {
		if (link.metadata?.archivedAt) return false;
		const lookupKey = workboardCardSessionLookupKey(link);
		if (keys.has(lookupKey)) return true;
		const suffixIndex = lookupKey.lastIndexOf("subagent:workboard-");
		return suffixIndex >= 0 && suffixes.has(lookupKey.slice(suffixIndex));
	}).map((link) => link.id);
}
/** Cards whose worktree has not been cleaned up yet: isWorkboardWorktreeCleanupCandidate's workspace test. */
function workboardWorktreeLinkIds(links) {
	return links.filter((link) => {
		const workspace = link.metadata?.automation?.workspace;
		return Boolean(workspace?.kind === "worktree" && workspace.path && workspace.sourcePath);
	}).map((link) => link.id);
}
const LIFECYCLE_TARGETS = {\n`,
    'lifecycle targets');
  out = replaceExactlyOnce(out,
    `				try {
					let cards = await params.store.list();
					if (generation !== owner) return;
					if (cards.some((card) => needsWorkboardLifecycleReconciliation(card))) try {
						const sweepStartedAt = Date.now();
						const full = lastSweepStartedAt === void 0 || lastFullSweepAt === void 0 || sweepStartedAt - lastFullSweepAt >= WORKBOARD_LIFECYCLE_FULL_SWEEP_MS || sweepStartedAt < lastSweepStartedAt || cards.some((card) => !card.metadata?.archivedAt && card.metadata?.automation?.launch?.phase === "prepared");
						const snapshot = await params.readSessions({
							includeUnknown: cards.some((card) => !card.metadata?.archivedAt && cardSessionKey(card) === "unknown"),
							...full ? {} : { activeMinutes: Math.ceil((sweepStartedAt - lastSweepStartedAt) / 6e4) + 1 }
						});
						if (generation !== owner) return;
						const changed = await syncWorkboardLifecycleSessions({`,
    `				try {
					const links = await readWorkboardLifecycleLinks(params.store);
					if (generation !== owner) return;
					let cards = links?.some(workboardLinkNeedsReconciliation) ? void 0 : await params.store.list();
					if (generation !== owner) return;
					let cardIds = cards ? void 0 : workboardWorktreeLinkIds(links);
					const readCards = async () => cardIds && cardIds.length <= WORKBOARD_LIFECYCLE_HYDRATE_LIMIT ? await params.store.list({ cardIds }) : await params.store.list();
					if (!cards || cards.some((card) => needsWorkboardLifecycleReconciliation(card))) try {
						const linked = cards ?? links;
						const sweepStartedAt = Date.now();
						const full = lastSweepStartedAt === void 0 || lastFullSweepAt === void 0 || sweepStartedAt - lastFullSweepAt >= WORKBOARD_LIFECYCLE_FULL_SWEEP_MS || sweepStartedAt < lastSweepStartedAt || linked.some((card) => !card.metadata?.archivedAt && card.metadata?.automation?.launch?.phase === "prepared");
						const snapshot = await params.readSessions({
							includeUnknown: linked.some((card) => !card.metadata?.archivedAt && cardSessionKey(card) === "unknown"),
							...full ? {} : { activeMinutes: Math.ceil((sweepStartedAt - lastSweepStartedAt) / 6e4) + 1 }
						});
						if (generation !== owner) return;
						if (!cards) {
							cardIds = full ? void 0 : [...new Set([...cardIds, ...workboardLifecycleSnapshotCardIds(links, snapshot.sessions)])];
							cards = await readCards();
							if (generation !== owner) return;
						}
						const changed = await syncWorkboardLifecycleSessions({`,
    'reconcile sweep start');
  out = replaceExactlyOnce(out,
    `						if (changed !== 0) cards = await params.store.list();
					} catch (error) {
						ctx.logger.warn(\`workboard lifecycle sync failed: \${String(error)}\`);
					}
					if (generation === owner) await cleanupWorktrees(cards, (message) => ctx.logger.warn(message));`,
    `						if (changed !== 0) cards = await readCards();
					} catch (error) {
						ctx.logger.warn(\`workboard lifecycle sync failed: \${String(error)}\`);
					}
					if (generation === owner) await cleanupWorktrees(cards ?? await readCards(), (message) => ctx.logger.warn(message));`,
    'reconcile sweep end');
  return out;
}
