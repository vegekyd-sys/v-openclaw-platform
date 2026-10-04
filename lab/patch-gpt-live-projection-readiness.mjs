import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const GPT_LIVE_PROJECTION_RECONCILE_BEFORE = "b0200676ea135b981d2caff2b6ec08cd608a75e48858fcd333519b046e613e89";
export const GPT_LIVE_PROJECTION_ACCESSOR_BEFORE = "21f2a5695f1caa2f3c18784f92a6f2beb7f54f71ad1378c5125f0d1d0563ca77";
export const GPT_LIVE_PROJECTION_DFS_BEFORE = "f61faf10c4eb3c7ca52e12c3641a2be2a8790a8acb08ef98ee85839e87ba105b";
const WAIT_MARKER = "// gpt-live-projection-readiness-v1: native-session-wait";
const BUILTIN_MARKER = "// gpt-live-projection-readiness-v1: admitted-voice-prompt";

function once(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label} projection-readiness anchor drifted`);
  return source.replace(before, after);
}

/** Wait for the actual database projection, even when another process owns its rebuild. */
export function patchGptLiveProjectionReadinessReconcile(source) {
  if (source.includes(WAIT_MARKER)) return source;
  assert.equal(createHash("sha256").update(source).digest("hex"), GPT_LIVE_PROJECTION_RECONCILE_BEFORE,
    "captured session projection reconciler drifted");
  const before = `/** Waits only until the requested session's scheduled projection rebuild settles. */
async function waitForSessionTranscriptProjection(scope, abortSignal) {
\tconst resolved = resolveSqliteTranscriptReadScope(scope);
\tconst databaseOptions = toDatabaseOptions(resolved);
\twhile (isSessionTranscriptIndexReconcileRunning(databaseOptions) && sessionTranscriptIndexNeedsReconcile(openOpenClawAgentDatabase(databaseOptions).db, resolved.sessionId)) await setTimeout(PROJECTION_READY_POLL_MS, void 0, abortSignal ? { signal: abortSignal } : void 0);
}`;
  const after = `/** Reads only a current native projection; never replays a prompt or a tool. */
async function waitForSessionTranscriptProjection(scope, abortSignal, options = {}) {
\tconst assertWaitActive = () => {
\t\tabortSignal?.throwIfAborted();
\t\tif (options.assertActive?.() === false) throw new Error("Session projection wait owner is no longer active");
\t};
\tassertWaitActive();
\tconst resolved = resolveSqliteTranscriptReadScope(scope);
\tconst databaseOptions = toDatabaseOptions(resolved);
\t// The accessor imports this reconciler. Resolve its existing hard guard only
\t// after module initialization, preserving the native transaction and generation checks.
\tconst { C: withCurrentProjectionSnapshot, T: isSessionTranscriptProjectionUnavailableError } = await import("./session-accessor-K0XuW6ln.js");
\tassertWaitActive();
\tconst startedAt = performance.now();
\tconst timeoutMs = 15e3;
\tlet lastRebuildingError;
\tlet polls = 0;
\twhile (true) {
\t\tassertWaitActive();
\t\t// The process-local reconcile Map cannot prove readiness in another Worker.
\t\tconst needsReconcile = sessionTranscriptIndexNeedsReconcile(openOpenClawAgentDatabase(databaseOptions).db, resolved.sessionId);
\t\tif (!lastRebuildingError || !needsReconcile) {
\t\t\ttry {
\t\t\t\tconst proof = withCurrentProjectionSnapshot(resolved, ({ state }) => ({ sessionId: resolved.sessionId, indexedSeq: state.indexedSeq }));
\t\t\t\tassertWaitActive();
\t\t\t\tconst waitMs = performance.now() - startedAt;
\t\t\t\tif (polls > 0) log.debug(\`session transcript projection ready session=\${resolved.sessionId} indexedSeq=\${proof.indexedSeq} waitMs=\${waitMs} polls=\${polls}\`);
\t\t\t\treturn { ...proof, waitMs, polls };
\t\t\t} catch (error) {
\t\t\t\tif (!isSessionTranscriptProjectionUnavailableError(error) || error.sessionId !== resolved.sessionId) throw error;
\t\t\t\tlastRebuildingError = error;
\t\t\t}
\t\t}
\t\tassertWaitActive();
\t\tconst elapsedMs = performance.now() - startedAt;
\t\tif (elapsedMs >= timeoutMs) {
\t\t\t// Keep the real structured rebuilding error. A caller must not retry a run.
\t\t\tlastRebuildingError.projectionWait = { phase: "before-model", sessionId: resolved.sessionId, timeoutMs, elapsedMs, polls };
\t\t\tthrow lastRebuildingError;
\t\t}
\t\tawait setTimeout(Math.min(PROJECTION_READY_POLL_MS, timeoutMs - elapsedMs), void 0, abortSignal ? { signal: abortSignal } : void 0);
\t\tpolls += 1;
\t}
}`;
  return `${WAIT_MARKER}\n${once(source, before, after, "native session wait")}`;
}

/** Applied after the exact trusted voice tool-order admission patch, preserving its stack. */
export function patchGptLiveProjectionReadinessBuiltin(source) {
  if (source.includes(BUILTIN_MARKER)) return source;
  assert(source.includes("// gpt-live-voice-tool-order-v1: native-builtin"),
    "projection readiness requires the trusted native voice admission patch");
  source = once(source,
    '\t\t\tinput.activeSession.agent.toolExecution = "sequential";',
    `\t\t\tinput.activeSession.agent.toolExecution = "sequential";
\t\t\t// This closure is called only by the registered, current native voice admission.
\t\t\tinput.activeSession[Symbol.for("openclaw.gptLive.projectionReadiness")] = true;`,
    "trusted native voice admission");
  const before = `\tconst promptActiveSession = (prompt, options) => withOwnedSessionTranscriptWrites(input.sessionLock.ownedTranscriptWriteContext, async () => {
\t\tif (input.runAbortController.signal.aborted) return abortable$1(Promise.resolve());
\t\treturn abortable$1(trackPromptSettlePromise(activeSession.prompt(prompt, options)));
\t});`;
  const after = `\tconst promptActiveSession = async (prompt, options) => {
\t\tif (activeSession[Symbol.for("openclaw.gptLive.projectionReadiness")] === true) {
\t\t\tconst assertProjectionOwner = () => {
\t\t\t\tinput.runAbortController.signal.throwIfAborted();
\t\t\t\tassertActive();
\t\t\t\tconst queueHandle = queueHandleRef.current;
\t\t\t\tif (!queueHandle || ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(attempt.runId) !== queueHandle || queueHandle.isStopped()) throw new Error("Native voice projection wait owner is no longer active");
\t\t\t};
\t\t\tassertProjectionOwner();
\t\t\tconst target = sessionManager.getSessionTarget();
\t\t\tif (!target || target.sessionId !== attempt.sessionId) throw new Error("Native voice projection wait requires the admitted session target");
\t\t\tconst { waitForSessionTranscriptProjection } = await import("./session-transcript-reconcile-DFsDtc9l.js");
\t\t\tassertProjectionOwner();
\t\t\t// Do not hold a transcript write context while the native writer rebuilds.
\t\t\tawait waitForSessionTranscriptProjection(target, input.runAbortController.signal, { assertActive: assertProjectionOwner });
\t\t\tassertProjectionOwner();
\t\t}
\t\treturn withOwnedSessionTranscriptWrites(input.sessionLock.ownedTranscriptWriteContext, async () => {
\t\t\tif (input.runAbortController.signal.aborted) return abortable$1(Promise.resolve());
\t\t\treturn abortable$1(trackPromptSettlePromise(activeSession.prompt(prompt, options)));
\t\t});
\t};`;
  return `${BUILTIN_MARKER}\n${once(source, before, after, "admitted voice prompt")}`;
}
