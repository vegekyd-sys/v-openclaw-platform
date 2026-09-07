import assert from 'node:assert/strict';

// Lab-only timing boundaries; never record content, credentials or SQL.
export function instrumentSessionTiming(source) {
  assert(!source.includes('db91TimingPrevious'), 'already instrumented');
  const start = 'async function prepareEmbeddedAttemptSessionRuntime(input) {';
  const at = source.indexOf(start);
  const end = source.indexOf('//#endregion', at);
  assert(at >= 0 && end > at);
  let body = source.slice(at, end);
  const once = (anchor, replacement) => {
    assert.equal(body.split(anchor).length, 2, `unique timing anchor: ${anchor}`);
    body = body.replace(anchor, replacement);
  };
  once(start, start + `
 let db91TimingPrevious = performance.now();
 const db91TimingMark = (stage) => {
  const now = performance.now();
  if (input.attempt.sessionKey?.includes("db91-")) console.error("[db91-session-timing] " + JSON.stringify({runId:input.attempt.runId,pid:process.pid,stage,atMs:Date.now(),elapsedMs:Math.round((now-db91TimingPrevious)*10)/10}));
  db91TimingPrevious = now;
 };
`);
  const marks = [
    ['\tconst { isOpenAIResponsesApi, preparedUserTurnMessage, sessionManager, transcriptPolicy } = preparedSessionManager;', 'session-manager'],
    ['\tconst { activeSession, setActiveSessionSystemPrompt, settingsManager } = preparedAgentSession;', 'agent-session'],
    ['\tconst boundary = await input.sessionManager.withOwnedTranscriptWrite(', 'runtime-persistence'],
    ['\tstate.prePromptMessageCount = activeSession.messages.length;', 'session-boundary'],
    ['\tconst trajectoryRecorder = await prepareEmbeddedAttemptTrajectory({', 'context-guards'],
    ['\tconst transport = await prepareEmbeddedAttemptTransport({', 'trajectory'],
    ['\treturn {\n\t\tagentSession: preparedAgentSession,', 'transport'],
  ];
  for (const [anchor, stage] of marks) once(anchor, `\tdb91TimingMark("${stage}");\n` + anchor);
  let result = source.slice(0, at) + body + source.slice(end);
  const boundaryStart = 'async function prepareEmbeddedAttemptSessionBoundary(input) {';
  const from = result.indexOf(boundaryStart), until = result.indexOf('async function prepareEmbeddedAttemptSessionManager(', from);
  assert(from >= 0 && until > from);
  let boundary = result.slice(from, until);
  const mark = (anchor, stage) => {
    assert.equal(boundary.split(anchor).length, 2, `unique boundary anchor: ${anchor}`);
    boundary = boundary.replace(anchor, `\tdb91BoundaryMark("${stage}");\n` + anchor);
  };
  boundary = boundary.replace(boundaryStart, boundaryStart + `
 let db91BoundaryPrevious = performance.now();
 const db91BoundaryMark = (stage) => {
  const now = performance.now();
  if (input.attempt.sessionKey?.includes("db91-")) console.error("[db91-boundary-timing] " + JSON.stringify({runId:input.attempt.runId,pid:process.pid,stage,atMs:Date.now(),elapsedMs:Math.round((now-db91BoundaryPrevious)*10)/10}));
  db91BoundaryPrevious = now;
 };
 db91BoundaryMark("entered-owner-scope");
`);
  mark('\tif (orphanRepair?.removeLeaf) {', 'orphan-plan');
  mark('\t\t\tawait waitForSessionTranscriptProjection(target, input.abortSignal);', 'projection-start');
  mark('\t\tsessionManager.clearNextUserMessagePersistenceSuppression?.();', 'projection-end');
  mark('\tconst boundaryTimezone = preserveExactPrompt ?', 'rebuild-context');
  return result.slice(0, from) + boundary + result.slice(until);
}
