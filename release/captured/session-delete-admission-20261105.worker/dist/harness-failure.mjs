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
    // upstream-5xx-fallback-v1: a model timeout the worker already retried is a prompt failure for the Gateway's
    // fallback rules (promptTimeoutFallbackSafe), not a timeout of this Gateway attempt
    timedOut: !compactionFailure && params.providerFailureWithoutTools !== true && isTimeoutFailure(promptError),
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
    // upstream-5xx-fallback-v1: replay-safe only when the caller proved the turn ran no tool
    replayMetadata: params.providerFailureWithoutTools === true
      ? { hadPotentialSideEffects: false, replaySafe: true }
      : {
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
