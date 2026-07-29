export async function agentCommand(params) {
  if (params.message === "throw-timeout") {
    throw new Error("LLM request timed out.");
  }
  if (params.message === "hang") {
    await new Promise(() => {});
  }
  if (params.message === "yield-turn") {
    return {
      meta: {
        yielded: true,
        stopReason: "end_turn",
        livenessState: "paused",
        agentMeta: {
          provider: "fixture",
          model: "fixture",
          sessionId: params.sessionId ?? "fixture-session",
        },
      },
    };
  }
  if (params.message === "special-terminal-results") {
    return {
      payloads: [
        {
          mediaUrl: "https://example.test/worker-result.png",
          trustedLocalMedia: true,
        },
      ],
      successfulCronAdds: 1,
      acceptedSessionSpawns: [
        { runId: "child-run-1", status: "accepted" },
      ],
      messagingToolSentTargets: [
        { channel: "feishu", to: "oc_fixture" },
      ],
      meta: {
        pendingToolCalls: [
          {
            id: "client-call-1",
            name: "search_catalog",
            arguments: JSON.stringify({ query: "worker parity" }),
          },
        ],
        agentMeta: {
          provider: "fixture",
          model: "fixture",
          sessionId: params.sessionId ?? "fixture-session",
        },
      },
    };
  }

  return {
    payloads: [
      {
        text: JSON.stringify({
          cleanupBundleMcpOnRunEnd: params.cleanupBundleMcpOnRunEnd,
          cleanupCliLiveSessionOnRunEnd:
            params.cleanupCliLiveSessionOnRunEnd,
          oneShotCliRun: params.oneShotCliRun,
          suppressPromptPersistence: params.suppressPromptPersistence,
          skipInitialSessionTouch: params.skipInitialSessionTouch,
          allowGatewaySubagentBinding:
            params.allowGatewaySubagentBinding,
          agentHarnessRuntimeOverride:
            params.agentHarnessRuntimeOverride,
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
