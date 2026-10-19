import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const marker = "// subagent-settle-backlog-v1";
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, `settle patch anchor drifted: ${before.slice(0, 120)}`);
  return source.replace(before, after);
}

export function patchSettleWake(source) {
  if (source.startsWith(marker)) return source;
  let result = replaceOnce(source,
    '\tconst hasUnsettledDescendants = requesterHasUnsettledDescendants();\n\tif ((!frozenBatchRunIds || frozenBatchRunIds.length === 0) && hasUnsettledDescendants) return false;\n',
    "");
  result = replaceOnce(result,
    '\tconst selectedState = readSharedBatchState(settledBatch);\n\tif (hasUnsettledDescendants) {',
    `\tconst selectedState = readSharedBatchState(settledBatch);
\tconst requiredSettled = settledBatch.filter((entry) => entry.expectsCompletionMessage === true);
\t// A notification-free wave has no requester delivery to wait for. Settle it
\t// before consulting unrelated live descendants, including after a restart.
\t// Select the original connected/frozen wave first: mixed and yielded batches
\t// keep their required children, generation and durable delivery ownership.
\tif (requiredSettled.length === 0) {
\t\tcompleteRequesterSettleWakeBatch({
\t\t\trunIds: batchRunIds,
\t\t\tstate: selectedState,
\t\t\tcompleteBatch
\t\t});
\t\treturn false;
\t}
\tconst hasUnsettledDescendants = requesterHasUnsettledDescendants();
\tif (hasUnsettledDescendants) {`);
  result = replaceOnce(result,
    '\tconst requiredSettled = settledBatch.filter((entry) => entry.expectsCompletionMessage === true);\n\tconst hasUndeliveredRequiredCompletion',
    '\tconst hasUndeliveredRequiredCompletion');
  result = replaceOnce(result,
    'if (requiredSettled.length === 0 || requiredSettled.length < 2 &&',
    'if (requiredSettled.length < 2 &&');
  return `${marker}\n${result}`;
}

export function patchSettleRead(source) {
  if (source.startsWith(marker)) return source;
  let result = replaceOnce(source,
    '\t\t\tstatus: entry.delivery.status,\n\t\t\t...entry.delivery.suspendedAt',
    '\t\t\tstatus: entry.delivery.status,\n\t\t\t...entry.delivery.disposition ? { disposition: entry.delivery.disposition } : {},\n\t\t\t...entry.delivery.suspendedAt');
  result = replaceOnce(result,
    '\tcache.snapshot = {\n\t\tloadedAtMs: nowMs,\n\t\truns: cache.load()\n\t};',
    '\tconst runs = cache.load();\n\t// Start freshness after loading; a slow read must not expire its own cache.\n\tcache.snapshot = {\n\t\tloadedAtMs: Date.now(),\n\t\truns\n\t};');
  result = replaceOnce(result,
    'return hasDescendantRunAwaitingSettleFromRuns(getSubagentRunsSnapshotForRead(subagentRuns), rootSessionKey, excludeRunId, requesterAgentId);',
    '// Settle needs topology, liveness and delivery disposition, never task bodies.\n\treturn hasDescendantRunAwaitingSettleFromRuns(getSubagentSessionListRunsSnapshotForRead(subagentRuns), rootSessionKey, excludeRunId, requesterAgentId);');
  return `${marker}\n${result}`;
}

export function patchSettleStore(source) {
  if (source.startsWith(marker)) return source;
  let result = replaceOnce(source,
    '\t\tsubagentPayloadJsonValue("$.delivery.status").as("delivery_status"),',
    '\t\tsubagentPayloadJsonValue("$.delivery.status").as("delivery_status"),\n\t\tsubagentPayloadJsonValue("$.delivery.disposition").as("delivery_disposition"),\n\t\tsubagentPayloadJsonValue("$.expectsCompletionMessage").as("expects_completion_message"),');
  result = replaceOnce(result,
    'const deliveryStatus = DELIVERY_STATUSES.has(row.delivery_status ?? "") ? row.delivery_status : void 0;',
    'const deliveryStatus = row.expects_completion_message === 0 ? "not_required" : DELIVERY_STATUSES.has(row.delivery_status ?? "") ? row.delivery_status : void 0;');
  result = replaceOnce(result,
    'generation: asFiniteNumber(row.generation),',
    'generation: Number.isSafeInteger(row.generation) && row.generation > 0 ? row.generation : void 0,');
  result = replaceOnce(result,
    '\t\t\tstatus: deliveryStatus,\n\t\t\t...asFiniteNumber(row.delivery_suspended_at)',
    '\t\t\tstatus: deliveryStatus,\n\t\t\t...typeof row.delivery_disposition === "string" ? { disposition: row.delivery_disposition } : {},\n\t\t\t...asFiniteNumber(row.delivery_suspended_at)');
  return `${marker}\n${result}`;
}

export const settlePatches = {
  "subagent-announce.requester-settle-wake-B2NSziIo.js": patchSettleWake,
  "subagent-registry-read-UaDFTyfW.js": patchSettleRead,
  "subagent-registry.store.sqlite-hzGu4QSk.js": patchSettleStore,
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2] ?? fileURLToPath(new URL("./fixtures/subagent-settle-backlog/", import.meta.url));
  const output = process.argv[3] ?? fileURLToPath(new URL("./release-files/subagent-settle-backlog/", import.meta.url));
  for (const [name, patch] of Object.entries(settlePatches)) {
    const target = resolve(output, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, patch(readFileSync(resolve(input, name), "utf8")));
  }
}
