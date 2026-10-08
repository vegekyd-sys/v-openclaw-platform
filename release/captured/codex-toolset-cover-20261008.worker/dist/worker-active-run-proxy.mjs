export function createWorkerActiveRunProxy(options) {
  const { pool, requestId, runId, sourceReplyDeliveryMode, permissionChange } = options;
  let active = true;

  return {
    handle: {
      kind: "embedded",
      runId,
      supportsTranscriptCommitWait: options.nativeSteer === true,
      toolAuthorityFingerprint: options.toolAuthorityFingerprint,
      taskSuggestionDeliveryMode: options.taskSuggestionDeliveryMode,
      sourceReplyDeliveryMode,
      permissionChangeOwner: permissionChange?.owner,
      applyPermissionMode: permissionChange ? (mode, revokeApprovals) => {
        if (!active) return Promise.resolve(false);
        // recordApplied must run synchronously inside core's operator-authorized
        // handoff. No owner token or authorization closure crosses IPC.
        permissionChange.recordApplied(mode);
        options.onPermissionChange?.();
        revokeApprovals();
        return pool.applyPermission(requestId, mode).then(applied => active && applied);
      } : undefined,
      isStreaming: () => active,
      isStopped: () => !active,
      isAbortable: () => active,
      // The child performs the authoritative compacting/injectability check.
      isCompacting: () => false,
      async queueMessage(text, steerOptions = {}) {
        if (!active) {
          throw new Error("worker Agent run is no longer active");
        }
        if (steerOptions.waitForTranscriptCommit === true && !options.nativeSteer) {
          throw new Error(
            "worker Steer does not support transcript-commit waiting",
          );
        }
        const result = await pool.steer(requestId, text, steerOptions);
        if (result.steered !== true) {
          throw new Error(result.error ?? "worker rejected Steer message");
        }
        return result.result;
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
