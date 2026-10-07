function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isCompactionFailure(error) {
  return /compaction/i.test(errorMessage(error));
}

function isTimeoutFailure(error) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  return (
    /timeout|timed out|UND_ERR_(?:CONNECT_)?TIMEOUT/i.test(code) ||
    /timeout|timed out/i.test(errorMessage(error))
  );
}

export function buildHarnessFailureAttempt(error, params = {}) {
  const promptError =
    error instanceof Error ? error : new Error(String(error));
  const compactionFailure = isCompactionFailure(promptError);

  return {
    aborted: false,
    assistantTranscriptOwned: true,
    externalAbort: false,
    timedOut: !compactionFailure && isTimeoutFailure(promptError),
    idleTimedOut: false,
    timedOutDuringCompaction: compactionFailure,
    promptError,
    promptErrorSource: compactionFailure ? "compaction" : "prompt",
    sessionIdUsed: params.sessionId,
    sessionFileUsed: params.sessionFile,
    messagesSnapshot: [],
    assistantTexts: [],
    toolMetas: [],
    acceptedSessionSpawns: [],
    didSendViaMessagingTool: false,
    messagingToolSentTexts: [],
    messagingToolSentMediaUrls: [],
    messagingToolSentTargets: [],
    replayMetadata: {
      // The worker may have completed tools before the terminal failure. Never
      // replay an opaque failed attempt merely because its IPC call rejected.
      hadPotentialSideEffects: true,
      replaySafe: false,
    },
    itemLifecycle: {
      startedCount: 1,
      completedCount: 1,
      activeCount: 0,
    },
  };
}
