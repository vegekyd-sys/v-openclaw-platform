import assert from 'node:assert/strict';

// Results of a requester's spawned subagents never reached it (V 2026-11-07, group
// oc_a59571a2, /vcc parent).
//
// The parent yielded with four children: three created with `sessions.create`, one spawned
// with `sessions_spawn` (model deepseek-flash). All four finished `ok`, then:
//
// 1. The settle wake that hands the batch back to the parent never dispatched: "In-process
//    gateway dispatch requires a gateway request scope or instance binding (method: agent)",
//    three attempts. getSharedGatewayContextResolver compares the children's resolver
//    *functions*; every registration fences the Gateway instance in its own closure, so a
//    batch registered by separate calls never shares one and gets a rejecting binding, even
//    though all four fence the same live Gateway.
// 2. Giving up then threw "subagent completion owner changed before settlement" every minute:
//    the spawned child's only task row was the Gateway's CLI tracking row for the same run id,
//    blockSubagentCompletionDelivery refused it, and the throw left the batch re-armed forever
//    with no reply and no blocked notice.
//
// subagent-settle-wake-shared-gateway-v1:
// - separately fenced owners share a resolver when they all resolve to the same live instance
//   context (another instance, a retired one or a mixed bound/unbound batch still rejects);
// - a completion whose task row is the Gateway CLI row for this same run and child is blocked
//   in the registry alone (the CLI row is left as is) instead of failing the batch.
//
// Source: openclaw-versa versa/fix-subagent-owner-changed-20261108 (e02a568d77a), on
// versa/port-cron-native-creator-20261107 (595ee2bf4aa).

export const MARKER = 'subagent-settle-wake-shared-gateway-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// core/dist/gateway-request-scope-CmMd3nUp.js
export function patchGatewayRequestScope(source) {
  guard(source);
  return replaceExactlyOnce(source,
    `function getSharedGatewayContextResolver(owners) {
	const first = owners[0] ? gatewayContextResolvers.get(owners[0]) : void 0;
	return owners.every((owner) => gatewayContextResolvers.get(owner) === first) ? first : () => void 0;
}`,
    `function getSharedGatewayContextResolver(owners) {
	const resolvers = owners.map((owner) => gatewayContextResolvers.get(owner));
	const first = resolvers[0];
	if (resolvers.every((resolver) => resolver === first)) return first;
	if (resolvers.some((resolver) => resolver === void 0)) return () => void 0;
	// ${MARKER}: separately fenced owners share one live Gateway instance.
	return () => {
		const contexts = resolvers.map((resolver) => {
			const context = resolver?.();
			return context?.resolveGatewayContext ? context.resolveGatewayContext() : context;
		});
		const context = contexts[0];
		return context && contexts.every((candidate) => candidate === context) ? context : void 0;
	};
}`,
    'shared resolver');
}

// core/dist/subagent-completion-admission.store-JmpNDYTF.js
export function patchCompletionAdmissionStore(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `		if (!subagent || !task || task.runtime !== "subagent" || task.status !== "succeeded" || subagent.execution.status !== "terminal" || subagent.execution.outcome?.status !== "ok" || subagent.expectsCompletionMessage !== true || (subagent.taskRunId ?? subagent.runId) !== task.runId || (subagent.delivery?.generation ?? 1) !== generation) return false;
		const delivery = ensureDeliveryState(subagent);`,
    `		if (!subagent || !task || subagent.execution.status !== "terminal" || subagent.execution.outcome?.status !== "ok" || subagent.expectsCompletionMessage !== true || (subagent.taskRunId ?? subagent.runId) !== task.runId || (subagent.delivery?.generation ?? 1) !== generation) return false;
		// ${MARKER}: the Gateway CLI row for this same run is not this completion's ledger.
		const foreignTask = task.runtime !== "subagent" && task.childSessionKey === subagent.childSessionKey;
		if (!foreignTask && (task.runtime !== "subagent" || task.status !== "succeeded")) return false;
		const delivery = ensureDeliveryState(subagent);`,
    'block admission');
  out = replaceExactlyOnce(out,
    `		if (params.suspendedReason) markRequesterSettleWakePending(subagent);
		else subagent.suppressCompletionDelivery = true;
		const terminal = resolveRequiredCompletionDeliveryFailureTerminalResult(params.reason);`,
    `		if (params.suspendedReason) markRequesterSettleWakePending(subagent);
		else subagent.suppressCompletionDelivery = true;
		if (foreignTask) {
			upsertSubagentRunRowInDatabase(database, bindSubagentRunRecord(subagent));
			deferSqlitePostCommitPublication(database.db, () => publishCommittedSubagent(subagent));
			return true;
		}
		const terminal = resolveRequiredCompletionDeliveryFailureTerminalResult(params.reason);`,
    'block foreign row');
  out = replaceExactlyOnce(out,
    `function publishCommittedRecords(subagent, task) {
	const live = subagentRuns.get(subagent.runId);
	if (live) {
		for (const key of Object.keys(live)) Reflect.deleteProperty(live, key);
		Object.assign(live, subagent);
	} else subagentRuns.set(subagent.runId, subagent);
	publishTaskRecordAfterAtomicStore(task);
}`,
    `function publishCommittedRecords(subagent, task) {
	publishCommittedSubagent(subagent);
	publishTaskRecordAfterAtomicStore(task);
}
function publishCommittedSubagent(subagent) {
	const live = subagentRuns.get(subagent.runId);
	if (live) {
		for (const key of Object.keys(live)) Reflect.deleteProperty(live, key);
		Object.assign(live, subagent);
	} else subagentRuns.set(subagent.runId, subagent);
}`,
    'publish helper');
  return out;
}

export const FILES = [
  {
    base: 'core/dist',
    target: 'openclaw/dist',
    name: 'gateway-request-scope-CmMd3nUp.js',
    before: '7a0b33d95299c96598f5f6dac26fd4ef3695a796487240a7c9ceab5bdedf1c1d',
    patch: patchGatewayRequestScope,
  },
  {
    base: 'core/dist',
    target: 'openclaw/dist',
    name: 'subagent-completion-admission.store-JmpNDYTF.js',
    before: 'c106a6cec9ba3c5def63297f43a23f9bcabe4543c373d61872f3cac7bad48c43',
    patch: patchCompletionAdmissionStore,
  },
];
