export function relayWorkerProgress(emitDiagnosticEvent, progress) {
  if (
    typeof emitDiagnosticEvent !== "function" ||
    typeof progress?.runId !== "string" ||
    progress.runId.trim() === ""
  ) {
    return false;
  }
  emitDiagnosticEvent({
    type: "run.progress",
    runId: progress.runId,
    ...(typeof progress.sessionId === "string" && progress.sessionId.trim()
      ? { sessionId: progress.sessionId }
      : {}),
    ...(typeof progress.sessionKey === "string" && progress.sessionKey.trim()
      ? { sessionKey: progress.sessionKey }
      : {}),
    reason:
      typeof progress.reason === "string" && progress.reason.trim()
        ? progress.reason
        : "worker:active",
  });
  return true;
}
