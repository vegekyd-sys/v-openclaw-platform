// Register starts core runtime imports early and awaits them only when a run
// needs them. An unobserved rejection in between (a retired plugin generation,
// a failed register after the imports started, a core chunk that moved) is a
// process-level unhandled rejection that kills the Gateway. Observe each load
// at creation; the callers that await it still receive the original failure.
export function observeEagerRuntimeLoad(label, promise, logger) {
  promise.catch((error) => {
    logger?.warn?.(
      `vlab-agent-worker-isolation: eager ${label} load failed; runs that need it will report the error: ${
        error instanceof Error ? `${error.code ? `${error.code}: ` : ""}${error.message}` : String(error)
      }`,
    );
  });
  return promise;
}
