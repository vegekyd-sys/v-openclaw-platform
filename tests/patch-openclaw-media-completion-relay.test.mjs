import assert from "node:assert/strict";
import test from "node:test";
import {
  PATCH_MARKER,
  patchOpenClawMediaCompletionBundle,
} from "../scripts/patch-openclaw-media-completion-relay.mjs";

const fixture = `
function scheduleMediaGenerationTaskCompletion(params) {
\tparams.scheduleBackgroundWork(async () => {
\t\tlet executed;
\t\ttry {
\t\t\texecuted = await params.run();
\t\t} catch (error) {
\t\t\treturn;
\t\t}
\t\ttry {
\t\t\tparams.lifecycle.completeTaskRun({ handle: params.handle });
\t\t} catch (error) {
\t\t\tparams.onWakeFailure(\`\${params.toolName} completion state update failed\`, {
\t\t\t\ttaskId: params.handle?.taskId,
\t\t\t\trunId: params.handle?.runId,
\t\t\t\terror
\t\t\t});
\t\t\tparams.lifecycle.failTaskRun({
\t\t\t\thandle: params.handle,
\t\t\t\terror
\t\t\t});
\t\t}
\t});
}
async function wakeMediaGenerationTaskCompletion(params) {
\tconst announceId = \`\${params.toolName}:\${params.handle.taskId}:\${params.status}\`;
\tconst internalEvents = [];
\tconst triggerMessage = "complete";
\tconst delivery = await deliverSubagentAnnouncement({
\t\trequesterSessionKey: params.handle.requesterSessionKey
\t});
\treturn delivery.delivered;
}
async function tryDeliverMediaGenerationDirect(params) { return false; }
`;

const openClaw81Fixture = `
function scheduleMediaGenerationTaskCompletion(params) {
\tconst runBackgroundWork = async () => {
\t\tlet executed;
\t\ttry {
\t\t\texecuted = await withMediaGenerationTaskKeepalive({
\t\t\t\thandle: params.handle,
\t\t\t\trun: params.run
\t\t\t});
\t\t} catch (error) {
\t\t\tparams.lifecycle.failTaskRun({ handle: params.handle, error });
\t\t\treturn;
\t\t}
\t\ttry {
\t\t\tparams.lifecycle.completeTaskRun({ handle: params.handle });
\t\t} catch (error) {
\t\t\tparams.lifecycle.failTaskRun({ handle: params.handle, error });
\t\t}
\t};
\tparams.scheduleBackgroundWork(() => runWithoutOwnedSessionTranscriptWrites(runBackgroundWork));
}
async function wakeMediaGenerationTaskCompletion(params) {
\tconst announceId = \`\${params.toolName}:\${params.handle.taskId}:\${params.status}\`;
\tconst internalEvents = [];
\tconst triggerMessage = "complete";
\tconst delivery = await deliverSubagentAnnouncement({
\t\trequesterSessionKey: params.handle.requesterSessionKey
\t});
\treturn delivery.delivered;
}
async function tryDeliverMediaGenerationDirect(params) { return false; }
`;

test("patches lifecycle ownership and completion delivery together", () => {
  const result = patchOpenClawMediaCompletionBundle(fixture);
  assert.equal(result.changed, true);
  assert.equal(result.source.split(PATCH_MARKER).length - 1, 2);
  assert.match(result.source, /detached_task_started/);
  assert.match(result.source, /detached_task_settled/);
  assert.match(result.source, /media_generation_completion/);
  assert.match(result.source, /directIdempotencyKey: announceId/);
  assert.match(result.source, /if \(bridged\?\.handled === true\) return/);
});

test("patch is idempotent and rejects partial patches", () => {
  const first = patchOpenClawMediaCompletionBundle(fixture);
  const second = patchOpenClawMediaCompletionBundle(first.source);
  assert.equal(second.changed, false);
  assert.equal(second.source, first.source);
  assert.throws(
    () => patchOpenClawMediaCompletionBundle(`${fixture}\n// ${PATCH_MARKER}`),
    /partially patched/,
  );
});

test("patches the OpenClaw 2026.8.1 background-work shape", () => {
  const result = patchOpenClawMediaCompletionBundle(openClaw81Fixture);
  assert.equal(result.changed, true);
  assert.equal(result.source.split(PATCH_MARKER).length - 1, 2);
  assert.match(result.source, /const runBackgroundWork = async \(\) => \{/);
  assert.match(result.source, /detached_task_started/);
  assert.match(result.source, /detached_task_settled/);
  assert.match(result.source, /media_generation_completion/);
  assert.doesNotThrow(() => new Function(result.source));
  assert.equal(
    patchOpenClawMediaCompletionBundle(result.source).changed,
    false,
  );
});
