const agentEventListeners = new Set();
const activeSteerWaiters = new Map();
const fakePluginRegistry = { compactionProviders: [] };

export function loadConfig() {
  return {};
}

export function resolveAgentWorkspaceDir(_config, agentId) {
  return `/tmp/fake-openclaw/${agentId}`;
}

export function resolveAgentDir(_config, agentId) {
  return `/tmp/fake-openclaw/agents/${agentId}`;
}

export function loadAgentRuntimePluginRegistryHandle() {
  return { compactionProviders: [] };
}

export function loadPluginMetadataSnapshot({ workspaceDir } = {}) {
  return { plugins: [], workspaceDir };
}

export async function acquireAgentRunPreparedModelRuntime(
  _input,
  _options = {},
) {
  const delayMs = Number(process.env.VLAB_FAKE_PREPARE_DELAY_MS ?? 0);
  if (Number.isFinite(delayMs) && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return {
    pluginGeneration: {
      pluginMetadataSnapshot: { plugins: [] },
      pluginRegistry: {
        compactionProviders: [
          {
            ownerPluginId: "vlab-agent-worker-isolation",
            provider: { id: "versa-fast-quality-v1" },
          },
        ],
      },
    },
    release() {},
  };
}

export async function prewarmAgentCommandRuntimes() {}

export function requireActivePluginRegistry() {
  return fakePluginRegistry;
}

export async function withPluginRuntimeRegistryScope(_registry, run) {
  return await run();
}

export function onAgentEvent(listener) {
  agentEventListeners.add(listener);
  return () => agentEventListeners.delete(listener);
}

export function queueAgentHarnessMessage(sessionId, text) {
  const waiter = activeSteerWaiters.get(sessionId);
  if (!waiter) return false;
  waiter(text);
  return true;
}

function emitAgentEvent(event) {
  for (const listener of agentEventListeners) {
    listener(event);
  }
}

export async function agentCommand(params) {
  if (params.message === 'native-data-envelope') {
    const bridge=globalThis[Symbol.for('versa.vlab.native-attempt-91-v1')];
    const native=bridge.prepare({runId:params.runId,sessionId:params.sessionId,agentId:params.agentId});
    return {payloads:[{text:JSON.stringify(native.futureNativeOption),futureMetadata:{preserved:true},
      ...(native.images?{imageFactIndexes:native.images[Symbol.for('openclaw.runtimePromptImageFactIndexes')]}:{})}],
      meta:{agentMeta:{provider:'fixture',model:'fixture',sessionId:params.sessionId}}};
  }
  if (params.message === "inspect-timeout") {
    return {
      payloads: [{ text: String(params.timeout) }],
      meta: {
        agentMeta: {
          provider: "fixture",
          model: "fixture",
          sessionId: params.sessionId,
        },
      },
    };
  }
  if (params.message === "skill-telemetry") {
    const { emitFakeTrustedDiagnosticEvent } = await import(
      "./fake-diagnostic-runtime.mjs"
    );
    emitFakeTrustedDiagnosticEvent({
      type: "skill.used",
      runId: params.runId,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      skillName: "fixture-skill",
      skillSource: "workspace",
      activation: "read",
      toolName: "read",
      toolCallId: "fixture-tool-call",
    });
    return {
      payloads: [{ text: "SKILL_TELEMETRY_FIXTURE_OK" }],
      meta: {
        agentMeta: {
          provider: "fixture",
          model: "fixture",
          sessionId: params.sessionId,
        },
      },
    };
  }
  if (params.message === "steer-hold") {
    const steered = new Promise((resolve) => {
      activeSteerWaiters.set(params.sessionId, resolve);
    });
    await params.onExecutionPhase?.({
      phase: "fixture_steer_ready",
    });
    const steeredText = await steered;
    activeSteerWaiters.delete(params.sessionId);
    return {
      payloads: [{ text: `steered:${steeredText}` }],
      meta: {
        agentMeta: {
          provider: "fixture",
          model: "fixture",
          sessionId: params.sessionId,
        },
      },
    };
  }
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
            conversationToolPolicy: params.conversationToolPolicy,
            pluginHarnessToolPolicyRestricted:
              params.pluginHarnessToolPolicyRestricted,
            pluginHarnessToolPolicySafeDeniedTools:
              params.pluginHarnessToolPolicySafeDeniedTools,
            trustedInternalHandoff: params.trustedInternalHandoff,
            bootstrapWorkspaceDir: params.bootstrapWorkspaceDir,
            contextEngineAgentId: params.contextEngineAgentId,
            delegationCapability: params.delegationCapability,
            modelSelectionLocked: params.modelSelectionLocked,
            operation: params.operation,
            scheduledRuntimeAuthority: params.scheduledRuntimeAuthority,
            scheduledRuntimeAuthorityRecoveryRequired:
              params.scheduledRuntimeAuthorityRecoveryRequired,
            skipPreparedUserTurnMessage:
              params.skipPreparedUserTurnMessage,
            startedAtMs: params.startedAtMs,
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
    await params.onUserMessagePersistenceInvalidated?.();
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
          promptCacheKey: params.promptCacheKey,
          suppressPromptPersistence: params.suppressPromptPersistence,
          skipInitialSessionTouch: params.skipInitialSessionTouch,
          mainRestartRecoveryAdmitted: params.mainRestartRecoveryAdmitted,
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

export async function agentCommandFromGatewayIngress(
  params,
  _runtime,
  _deps,
  _recovery,
  runtimeContext,
) {
  if (params.message === "inspect-compaction-runtime") {
    return {
      payloads: [
        {
          text: JSON.stringify({
            hasRuntimeContext: Boolean(runtimeContext?.pluginGeneration),
            providerIds:
              runtimeContext?.pluginGeneration?.pluginRegistry?.compactionProviders?.map(
                (entry) => entry?.provider?.id,
              ) ?? [],
          }),
        },
      ],
      meta: {
        agentMeta: {
          provider: "fixture",
          model: "fixture",
          sessionId: params.sessionId,
        },
      },
    };
  }
  return await agentCommand(params);
}

export async function agentCommandFromIngress(params) {
  return await agentCommand(params);
}
