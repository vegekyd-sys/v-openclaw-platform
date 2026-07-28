export async function agentCommand(params) {
  if (params.message === "throw-timeout") {
    throw new Error("LLM request timed out.");
  }
  if (params.message === "hang") {
    await new Promise(() => {});
  }

  return {
    payloads: [
      {
        text: JSON.stringify({
          cleanupBundleMcpOnRunEnd: params.cleanupBundleMcpOnRunEnd,
          cleanupCliLiveSessionOnRunEnd:
            params.cleanupCliLiveSessionOnRunEnd,
          oneShotCliRun: params.oneShotCliRun,
        }),
      },
    ],
    meta: {
      agentMeta: {
        provider: "fixture",
        model: "fixture",
        sessionId: params.sessionId ?? "fixture-session",
      },
    },
  };
}
