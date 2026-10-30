// Execution ownership is independent of whether a channel presentation exists.
const relay = () => globalThis[Symbol.for('openclaw.v.sessionRelay.host')]?.engine;
export async function finishSessionTaskRun(runId, result, failure) {
  if (!runId) return;
  const status = failure || result?.meta?.error ? 'error' : result?.meta?.aborted ? 'aborted' : 'ok';
  await relay()?.finishExternalRun(runId, status);
}
export function watchSessionTaskContinuation(runId, options) {
  return relay()?.watchRequesterRun(runId, options) ?? null;
}
export async function executeSessionTaskConsult(params, execute) {
  let runId, sessionId;
  const result = await execute({ ...params, onRunStarted: info => { runId = info.runId; sessionId = info.sessionId; return params.onRunStarted?.(info); } });
  // Native owners already preserve cancellation, steering and subagent lineage.
  if (result?.provenance?.ownerRunId || !runId) return result;
  const continuation = watchSessionTaskContinuation(runId, { sessionKey: params.sessionKey, sessionId, signal: params.abortSignal,
    onRunStarted: info => params.onResumeRunStarted?.(info) });
  if (!continuation) return result;
  const final = await continuation.promise;
  const text = final.payloads.filter(p => !p.isReasoning && !p.isCommentary && !p.isError).map(p => p.text ?? '').join('\n\n').trim();
  if (!text) throw Error('Session task continuation returned no visible final');
  return { text, provenance: { runId: final.runId, ownerRunId: runId, source: 'canonical_final', role: 'parent' } };
}
