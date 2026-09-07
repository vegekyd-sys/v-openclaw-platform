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
  return source.slice(0, at) + body + source.slice(end);
}
