export function createWorkerActiveRunProxy(options) {
  const { pool, requestId, runId, sourceReplyDeliveryMode } = options;
  let active = true;

  return {
    handle: {
      kind: "embedded",
      runId,
      supportsTranscriptCommitWait: false,
      sourceReplyDeliveryMode,
      isStreaming: () => active,
      isStopped: () => !active,
      isAbortable: () => active,
      // The child performs the authoritative compacting/injectability check.
      isCompacting: () => false,
      async queueMessage(text, steerOptions = {}) {
        if (!active) {
          throw new Error("worker Agent run is no longer active");
        }
        if (steerOptions.waitForTranscriptCommit === true) {
          throw new Error(
            "worker Steer does not support transcript-commit waiting",
          );
        }
        const result = await pool.steer(requestId, text, steerOptions);
        if (result.steered !== true) {
          throw new Error(result.error ?? "worker rejected Steer message");
        }
      },
      cancel() {
        return pool.cancel(requestId).cancelled;
      },
      abort() {
        return pool.cancel(requestId).cancelled;
      },
    },
    deactivate() {
      active = false;
    },
  };
}
