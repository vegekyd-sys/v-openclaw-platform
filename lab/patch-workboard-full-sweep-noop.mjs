import assert from 'node:assert/strict';

// Workboard full lifecycle sweeps skip cards that are already in sync.
//
// A full sweep (first after start, every 10 minutes, any prepared launch) lists every session and
// calls store.syncLifecycle for every card whose session is listed: on V ~2,800 linked cards of
// ~3,580. syncLifecycle queues a mutation and re-reads the card by id (parent row plus eleven
// child-table queries; the per-card lookup cache holds 2,048 keys and every write empties it), and
// for a card already in sync it then builds no patch and writes nothing. With V's runtime code on
// a 3,581-card database the steady-state full sweep held the Gateway main thread 1.2-1.4 s in one
// stretch, almost all of it in those re-reads; on V's heavier cards it is longer. A message that
// arrives in that stretch waits for it.
//
// The sweep already holds every card from its list read. Before calling syncLifecycle it now
// checks that card against the observation and skips the call only when syncLifecycle could not
// build a patch from it: the status would not move (the store's own shouldSyncWorkboardLifecycleStatus
// rule), the card and its execution already point at the session with the target execution status,
// no launch is prepared or accepted for another session, and the stale marker already matches.
// Any doubt calls syncLifecycle as before, which re-reads the card and decides. A card that changed
// after the list read is decided by its fresh copy only when called; one that is skipped is
// rechecked by the next sweep that lists its session and by its agent/subagent end event.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWorkboardIndex(source) {
  let out = source;
  out = replaceExactlyOnce(out,
    'async function syncWorkboardCardLifecycle(params) {\n',
    `/** True only when store.syncLifecycle could build no patch from this card for the observation (any doubt: false). */
function workboardLifecycleSyncIsNoop(card, observation, association) {
	const target = LIFECYCLE_TARGETS[observation.state];
	const targetStatus = "card" in target ? target.card : void 0;
	const executionStatus = "execution" in target ? target.execution : void 0;
	if (targetStatus && card.status !== targetStatus && (targetStatus === "running" ? card.status === "backlog" || card.status === "todo" || card.status === "ready" : (targetStatus === "blocked" || targetStatus === "review") && (card.status === "running" || card.status === "todo" || card.status === "ready"))) return false;
	if (association.runId !== void 0 || association.acceptedAt !== void 0) return false;
	const execution = card.execution;
	if (card.sessionKey !== association.sessionKey || !execution || execution.sessionKey !== association.sessionKey || executionStatus !== void 0 && execution.status !== executionStatus) return false;
	const launch = card.metadata?.automation?.launch;
	if (launch?.phase === "prepared" || launch?.phase === "accepted" && launch.acceptedSessionKey !== association.sessionKey) return false;
	const stale = card.metadata?.stale;
	if (observation.stale) return Boolean(stale && stale.lastSessionUpdatedAt === observation.stale.lastSessionUpdatedAt && stale.reason === observation.stale.reason);
	return !stale;
}
async function syncWorkboardCardLifecycle(params) {\n`,
    'card lifecycle sync');
  out = replaceExactlyOnce(out,
    `		const observation = lifecycleFromSession(session, now);
		if (await syncWorkboardCardLifecycle({
			store: params.store,
			cardId: card.id,
			observation,
			now,
			association: {
				...cardSessionKey(card) ? { expectedSessionKey: cardSessionKey(card) } : {},
				...cardRunId(card) ? { expectedRunId: cardRunId(card) } : {},
				sessionKey: session.key,
				...preparedAcceptanceAt === void 0 ? {} : { acceptedAt: preparedAcceptanceAt }
			}
		})) count += 1;`,
    `		const observation = lifecycleFromSession(session, now);
		const association = {
			...cardSessionKey(card) ? { expectedSessionKey: cardSessionKey(card) } : {},
			...cardRunId(card) ? { expectedRunId: cardRunId(card) } : {},
			sessionKey: session.key,
			...preparedAcceptanceAt === void 0 ? {} : { acceptedAt: preparedAcceptanceAt }
		};
		if (workboardLifecycleSyncIsNoop(card, observation, association)) continue;
		if (await syncWorkboardCardLifecycle({
			store: params.store,
			cardId: card.id,
			observation,
			now,
			association
		})) count += 1;`,
    'session sweep sync call');
  return out;
}
