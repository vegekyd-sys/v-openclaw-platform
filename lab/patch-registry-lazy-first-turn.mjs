import assert from 'node:assert/strict';

// A fresh Worker's first turn restores two whole registries before its first model request
// (VLab profile 2026-11-08, V-sized registries, #567 already applied: 5.9 s subagent restore of which
// 5.1 s is reading every subagent_runs payload, 3.0 s task restore of which 2.1 s is reading every
// task_runs row). V, read-only: subagent_runs 16,770 rows / 203 MB (task text 143 MB, completion
// 40 MB; 1 run not ended), read alone 1.0 s; task_runs 18,960 rows / 50 MB, 0.4 s; plus parsing,
// record conversion and GC. Neither caller needs the whole registry:
//
// 1. Prompt assembly leases pending agent-steering items for the requester session
//    (leasePendingAgentSteeringItems), and restores the subagent registry first. An item needs a run
//    whose delivery carries a payload addressed to this requester and is pending (or leased, if the
//    lease went stale). delivery.payload.requesterSessionKey is always the run's requesterSessionKey
//    (loadPendingFinalDeliveryPayload; the field is never reassigned), which is the indexed
//    requester_session_key column written in the same statement. So: if no in-memory run has an item
//    and no row of this requester has a delivery payload in pending or in_progress, there is nothing to
//    lease and the restore is skipped. Any doubt (a query error, more than 5,000 rows) takes the
//    original path. The registry restores on its next real use as before.
//
// 2. listFreshTasksForOwnerKey (active media/task prompt context) restores the task registry, then
//    reads the owner's tasks from the store directly (idx_task_runs_owner_key) and returns those; the
//    in-memory registry is only its fallback when that read fails. Restore only on the fallback.
//
// OPENCLAW_V_REGISTRY_LAZY_FIRST_TURN=0 restores the old behavior for both.

export const MARKER = 'v-registry-lazy-first-turn-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchSubagentRegistry(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `import { $ as normalizeAgentRunTerminalReplySnapshot, Q as mergeAgentRunTerminalReplySnapshot, X as selectDeliverableSessionsReply } from "./openclaw-state-db-Bh3Bq87y.js";`,
    `import { $ as normalizeAgentRunTerminalReplySnapshot, Q as mergeAgentRunTerminalReplySnapshot, X as selectDeliverableSessionsReply, i as openOpenClawStateDatabase } from "./openclaw-state-db-Bh3Bq87y.js";`,
    'openclaw-state-db import');
  out = replaceExactlyOnce(out,
    `function createSubagentRegistryPublicApi(config) {`,
    `// ${MARKER}: can this requester have a pending steering item at all? Any doubt answers true.
const V_STEERING_PRECHECK_MAX_ROWS = 5e3;
function mayHavePendingAgentSteeringItems(runs, requesterSessionKey) {
	if (process.env.OPENCLAW_V_REGISTRY_LAZY_FIRST_TURN === "0") return true;
	try {
		const key = requesterSessionKey?.trim();
		if (!key) return false;
		if (listPendingAgentSteeringItemsFromSubagentRuns({ runs, requesterSessionKey: key }).length > 0) return true;
		const rows = openOpenClawStateDatabase().db.prepare("SELECT json_extract(payload_json, '$.delivery.status') AS status, json_extract(payload_json, '$.delivery.payload') IS NOT NULL AS hasPayload FROM subagent_runs WHERE requester_session_key = ? LIMIT " + (V_STEERING_PRECHECK_MAX_ROWS + 1)).all(key);
		if (rows.length > V_STEERING_PRECHECK_MAX_ROWS) return true;
		return rows.some((row) => Boolean(row.hasPayload) && (row.status === "pending" || row.status === "in_progress"));
	} catch {
		return true;
	}
}
function createSubagentRegistryPublicApi(config) {`,
    'public api factory');
  out = replaceExactlyOnce(out,
    `	function leasePendingAgentSteeringItems(params) {
		restoreOnce();`,
    `	function leasePendingAgentSteeringItems(params) {
		if (!mayHavePendingAgentSteeringItems(runs, params.requesterSessionKey)) return;
		restoreOnce();`,
    'leasePendingAgentSteeringItems restore');
  return out;
}

export function patchTaskRegistry(source) {
  assert(!source.includes(MARKER), 'already patched');
  const head = replaceExactlyOnce(source,
    `function listFreshTasksForOwnerKey(ownerKey) {
	ensureTaskRegistryReady();
	const key = normalizeOptionalString(ownerKey);
	if (!key) return [];
	const store = getTaskRegistryStore();
	if (store.listTasksForOwnerKey) try {`,
    `function listFreshTasksForOwnerKey(ownerKey) {
	// ${MARKER}: the store read below does not use the in-memory registry; restore only for the fallback
	const vLazy = process.env.OPENCLAW_V_REGISTRY_LAZY_FIRST_TURN !== "0";
	if (!vLazy) ensureTaskRegistryReady();
	const key = normalizeOptionalString(ownerKey);
	if (!key) return [];
	const store = getTaskRegistryStore();
	if (store.listTasksForOwnerKey) try {`,
    'listFreshTasksForOwnerKey head');
  return replaceExactlyOnce(head,
    `		taskRegistryLog.warn("Failed to read fresh owner task registry records", {
			ownerKey: key,
			error
		});
	}
	return listTasksFromIndex(taskIdsByOwnerKey, key);
}`,
    `		taskRegistryLog.warn("Failed to read fresh owner task registry records", {
			ownerKey: key,
			error
		});
	}
	if (vLazy) ensureTaskRegistryReady();
	return listTasksFromIndex(taskIdsByOwnerKey, key);
}`,
    'listFreshTasksForOwnerKey fallback');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [kind, input, output] = process.argv.slice(2);
  assert(['subagent', 'task'].includes(kind) && input && output, 'usage: patch-registry-lazy-first-turn.mjs subagent|task <in> <out>');
  const patch = kind === 'subagent' ? patchSubagentRegistry : patchTaskRegistry;
  fs.writeFileSync(output, patch(fs.readFileSync(input, 'utf8')));
}
