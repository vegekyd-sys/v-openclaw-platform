import assert from 'node:assert/strict';

// Follow-up to subagent-settle-wake-shared-gateway-v1 (#569), found in V's acceptance
// (2026-11-08 03:16 CST): the stuck batch in group oc_a59571a2 still threw
// "subagent completion owner changed before settlement: 284f7211" every minute.
//
// The settle path looks the task up with runtime "subagent"; vision_probe's only task row is
// the Gateway's CLI tracking row for its run id, so the lookup finds nothing and passes an
// empty task id. v1 only covered the CLI row being passed in. v2 treats a missing row the same
// way: block the registry delivery alone instead of reporting an owner change.
//
// Source: openclaw-versa versa/fix-subagent-owner-changed-20261108 (5985c7debf6).

export const MARKER = 'subagent-settle-wake-missing-task-v2';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// core/dist/subagent-completion-admission.store-JmpNDYTF.js, as #569 (v1) left it.
export function patchCompletionAdmissionStore(source) {
  assert(!source.includes(MARKER), 'already patched');
  assert(source.includes('subagent-settle-wake-shared-gateway-v1'), 'needs the v1 bytes (#569)');
  let out = replaceExactlyOnce(source,
    `		if (!subagent || !task || subagent.execution.status !== "terminal" || subagent.execution.outcome?.status !== "ok" || subagent.expectsCompletionMessage !== true || (subagent.taskRunId ?? subagent.runId) !== task.runId || (subagent.delivery?.generation ?? 1) !== generation) return false;
		// subagent-settle-wake-shared-gateway-v1: the Gateway CLI row for this same run is not this completion's ledger.
		const foreignTask = task.runtime !== "subagent" && task.childSessionKey === subagent.childSessionKey;
		if (!foreignTask && (task.runtime !== "subagent" || task.status !== "succeeded")) return false;`,
    `		if (!subagent || subagent.execution.status !== "terminal" || subagent.execution.outcome?.status !== "ok" || subagent.expectsCompletionMessage !== true || task && (subagent.taskRunId ?? subagent.runId) !== task.runId || (subagent.delivery?.generation ?? 1) !== generation) return false;
		// subagent-settle-wake-shared-gateway-v1 + ${MARKER}: no subagent task row (missing, or the
		// Gateway CLI row for this same run) is not this completion's ledger.
		const foreignTask = !task || task.runtime !== "subagent" && task.childSessionKey === subagent.childSessionKey;
		if (task && !foreignTask && (task.runtime !== "subagent" || task.status !== "succeeded")) return false;`,
    'block admission');
  out = replaceExactlyOnce(out,
    `		if (foreignTask) {
			upsertSubagentRunRowInDatabase(database, bindSubagentRunRecord(subagent));`,
    `		if (foreignTask || !task) {
			upsertSubagentRunRowInDatabase(database, bindSubagentRunRecord(subagent));`,
    'registry-only block');
  return out;
}

export const FILES = [
  {
    base: 'core/dist',
    target: 'openclaw/dist',
    name: 'subagent-completion-admission.store-JmpNDYTF.js',
    before: '8f8adebe18223078ed3fed1776c37bea01359d74a8e367cba0f055660551db4f',
    patch: patchCompletionAdmissionStore,
  },
];
