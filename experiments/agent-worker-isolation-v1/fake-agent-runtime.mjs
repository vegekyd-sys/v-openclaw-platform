const agentEventListeners = new Set();

export function onAgentEvent(listener) {
  agentEventListeners.add(listener);
  return () => agentEventListeners.delete(listener);
}

function emitAgentEvent(event) {
  for (const listener of agentEventListeners) {
    listener(event);
  }
}

export async function agentCommand(params) {
  if (params.message === "option-parity") {
    return {
      payloads: [
        {
          text: JSON.stringify({
            provider: params.provider,
            model: params.model,
            thinking: params.thinking,
            blockReplyBreak: params.blockReplyBreak,
            blockReplyChunking: params.blockReplyChunking,
            workspaceDir: params.workspaceDir,
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
  if (params.message === "stream-parity") {
    await params.onAssistantMessageStart?.();
    await params.onReasoningStream?.({
      text: "Checking the parity contract",
      isReasoningSnapshot: true,
    });
    await params.onToolStart?.({
      name: "read",
      phase: "start",
      args: { path: "/tmp/parity-fixture" },
      detailMode: "full",
    });
    await params.onItemEvent?.({
      itemId: "item-1",
      kind: "preamble",
      progressText: "Inspecting the fixture",
    });
    emitAgentEvent({
      runId: params.runId,
      stream: "assistant",
      data: { text: "Streaming" },
    });
    await params.onPartialReply?.({ text: "Streaming" });
    await params.onCompactionStart?.();
    await params.onCompactionEnd?.();
    emitAgentEvent({
      runId: params.runId,
      stream: "assistant",
      data: { text: "Streaming reply restored." },
    });
    await params.onPartialReply?.({ text: "Streaming reply restored." });
    await params.onReasoningEnd?.();
    return {
      payloads: [{ text: "Streaming reply restored." }],
      meta: {
        agentMeta: {
          provider: "fixture",
          model: "fixture",
          sessionId: params.sessionId ?? "fixture-session",
        },
      },
    };
  }
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
          allowModelOverride: params.allowModelOverride,
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

export async function agentCommandFromIngress(params) {
  return await agentCommand(params);
}
