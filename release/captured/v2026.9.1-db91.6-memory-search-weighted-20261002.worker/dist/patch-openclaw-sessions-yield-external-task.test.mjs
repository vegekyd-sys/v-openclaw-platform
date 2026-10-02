import assert from "node:assert/strict";
import test from "node:test";
import {
  PATCH_MARKER,
  patchSessionsYieldExternalTask,
} from "./patch-openclaw-sessions-yield-external-task.mjs";

const fixture = `
function createSessionsYieldTool(opts) {
\treturn {
\t\texecute: async () => {
\t\t\tif (!await opts.claimYield?.()) return jsonResult({
\t\t\t\tstatus: "error"
\t\t\t});
\t\t\treturn jsonResult({ status: "yielded" });
\t\t}
\t};
}
//#endregion
function createOpenClawTools(options, trimmedRunSessionKey) {
	return [
		createSessionsYieldTool({
			sessionId: options?.sessionId,
			claimYield: options?.claimYield,
			onYield: options?.onYield
		})
	];
}
`;

test("lets an OpenClaw external Harness task claim sessions_yield", () => {
  const result = patchSessionsYieldExternalTask(fixture);
  assert.equal(result.changed, true);
  assert.match(result.source, new RegExp(PATCH_MARKER));
  assert.match(result.source, /external-harness-task-yield-v1/);
  assert.match(result.source, /requesterSessionKey: trimmedRunSessionKey/);
  assert.match(result.source, /requesterTurnRunId: options\?\.runId/);
  assert.doesNotThrow(() => new Function(result.source));
});

test("sessions_yield external task patch is idempotent", () => {
  const once = patchSessionsYieldExternalTask(fixture);
  const twice = patchSessionsYieldExternalTask(once.source);
  assert.equal(twice.changed, false);
  assert.equal(twice.source, once.source);
});
