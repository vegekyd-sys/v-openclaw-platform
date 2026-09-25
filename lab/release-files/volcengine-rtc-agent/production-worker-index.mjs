import {Console as FirsttextMetricConsole} from "node:console";
const ocFirsttextMetricConsole = new FirsttextMetricConsole({stdout: process.stdout, stderr: process.stderr, ignoreErrors: true});
// OPENCLAW_FIRSTTEXT_WORKER_PHASES_V1
const ocFirsttextWorkerStages = new Set(["gateway-harness-enter","gateway-preflight-enter","gateway-preflight-end","gateway-submit-return","gateway-callback-enter","gateway-callback-end","gateway-transcript-enter","gateway-transcript-end","gateway-harness-exit","pool-submit-enter","pool-enqueued","pool-spawn","pool-ready","pool-ipc-send","pool-stream-received","pool-callback-enter","pool-callback-end","pool-ack-send","pool-response-received","worker-command-enter","worker-command-end","worker-agent-enter","worker-runtime-loaded","worker-event-runtime-loaded","worker-compaction-runtime-loaded","worker-prepared-runtime-enter","worker-prepared-runtime-end","worker-hooks-end","worker-tail-enter","worker-tail-end","worker-result-build-enter","worker-result-build-end","worker-response-send","worker-response-error","worker-stream-send","worker-ack-done","worker-ack-error","worker-native-drain-enter","worker-native-drain-end","worker-final-tail-enter","worker-final-tail-end"]);
const ocFirsttextWorkerCallbacks = new Set(['onAgentEvent','onPartialReply','onReasoningStream','onReasoningEnd','onToolStart','onToolResult','onBlockReply','onAssistantMessageStart','onAssistantMessageEnd','onAgentRunStart','onRunProgress','onAttemptDeadlineChanged','onCompactionStart','onCompactionEnd','onPlanUpdate','onApprovalEvent','onPatchSummary']);
const ocFirsttextWorkerEventCounts = new Map();
function ocFirsttextWorkerMark(stage, runId, fields = {}) {
  try {
    if (process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES !== '1' || !ocFirsttextWorkerStages.has(stage)) return;
    const validRun = typeof runId === 'string' && (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId) || /^DB91_HI_[0-9]+_[a-z0-9_]+$/.test(runId));
    if (!validRun && !['pool-spawn','pool-ready'].includes(stage)) return;
    if (/callback|stream-received|stream-send|ack-/.test(stage)) {
      let counts = ocFirsttextWorkerEventCounts.get(runId);
      if (!counts) {
        if (ocFirsttextWorkerEventCounts.size >= 256) ocFirsttextWorkerEventCounts.delete(ocFirsttextWorkerEventCounts.keys().next().value);
        counts = {}; ocFirsttextWorkerEventCounts.set(runId,counts);
      }
      counts[stage] = (counts[stage] || 0) + 1;
      if (counts[stage] > 3) return;
    }
    const row = {v:1,stage,pid:process.pid,atMs:Date.now(),monoMs:performance.now()};
    if (validRun) row.runId = runId;
    if (typeof fields.requestId === 'string' && /^request-[0-9]+$/.test(fields.requestId)) row.requestId = fields.requestId;
    if (typeof fields.eventId === 'string' && /^stream-[0-9]+$/.test(fields.eventId)) row.eventId = fields.eventId;
    if (ocFirsttextWorkerCallbacks.has(fields.name)) row.name = fields.name;
    if (Number.isSafeInteger(fields.workerPid) && fields.workerPid > 0) row.workerPid = fields.workerPid;
    if (Number.isSafeInteger(fields.slot) && fields.slot >= 0) row.slot = fields.slot;
    // row contains only validated timing/identity fields; no prompt, tool args or credentials.
    ocFirsttextMetricConsole.error('[firsttext-worker-phases] ' + JSON.stringify(row));
  } catch { /* Observation must not alter runtime control flow. */ }
}

import { buildSeeduplexRealtimeVoiceProvider } from "./seeduplex-realtime-provider.mjs";
import { buildVolcengineRtcAgentProvider } from "./volcengine-rtc-agent-provider.mjs";
import { WorkerPool } from "./worker-pool.mjs";
import { performance } from "node:perf_hooks";
import { buildNativeHarnessData } from './native-harness-data.mjs';
import { gatewayOwnedEventArgs } from './gateway-owned-terminal.mjs';
import { publishWorkerPublicStream } from './gateway-public-stream.mjs';
// Release gates are documented separately from runtime parity counters.
const nativeParityReleaseHold = false; // 9.1 Steer: real Feishu Worker/Codex acceptance passed.
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveOpenClawAgentRuntimePath,
  resolveOpenClawAgentHarnessRuntimePath,
  resolveOpenClawSubagentAnnounceRuntimePath,
  resolveOpenClawSubagentAnnounceOriginRuntimePath,
  resolveOpenClawGatewayCallerContextRuntimePath,
  resolveOpenClawGatewayRequestScopeRuntimePath,
} from "./runtime-path.mjs";
import { createWorkerActiveRunProxy } from "./worker-active-run-proxy.mjs";
import { createGatewayMessageToolRelay } from "./gateway-message-tool.mjs";
import { withGatewayCompletionContext } from "./gateway-completion-context.mjs";
import { buildHarnessFailureAttempt } from "./harness-failure.mjs";
import { readNativeSessionMessages } from "./harness-result.mjs";
import { closeInterruptedToolCalls } from "./transcript-recovery.mjs";
import { relayWorkerProgress } from "./worker-progress.mjs";
import {
  acknowledgeWorkerUserTurn,
  snapshotPersistedUserTurn,
  shouldWorkerPersistUserTurn,
} from "./user-turn-ownership.mjs";
import {
  buildWorkerEnvironment,
  resolveWorkerExecEnv,
} from "./exec-env.mjs";
import { buildFastCompactionProvider } from "./fast-compaction-provider.mjs";
import { runWithSessionRolloverRetry } from "./session-rollover-retry.mjs";
import { startSubagentCompletionRelays } from "./subagent-completion-relay.mjs";
import { getSessionHotsetStatus } from "./session-hotset.mjs";
import {
  buildForwardedHarnessOptions,
  HARNESS_EVENT_CONTRACT_VERSION,
  inspectHarnessEventContract,
  inspectHarnessOptionContract,
  WORKER_CONVERSATION_TOOL_POLICY_SAFE_DENY_TOOLS,
} from "./harness-event-contract.mjs";
import {
  createWorkerGatewayEventRouter,
  WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
} from "./worker-gateway-events.mjs";
import { buildSkillTelemetryIndex } from "./skill-usage-telemetry.mjs";
import {
  DEFAULT_NATIVE_REQUEST_TIMEOUT_MS,
  resolveNativeRequestTimeoutMs,
} from "./native-request-timeout.mjs";
import { NativeLaneProgressBridge } from "./native-lane-progress.mjs";
import { syncWorkerRuntimeConfigFile } from "./worker-config-sync.mjs";
import { createGatewayNativeCompactionPassthrough } from "./gateway-native-compaction.mjs";
import { resolveHarnessMessageChannel } from "./harness-channel.mjs";
import { withWorkerHarnessModelSelection } from "./worker-harness-model-routing.mjs";

const SESSION_PREFIX = "agent:makaron:explicit:vlab-worker-";
const NATIVE_HARNESS_ID = "vlab-worker";
const SHARED_POOL_KEY = Symbol.for(
  "versa.vlab-agent-worker-isolation.shared-pool-v1",
);

function readString(params, key, options = {}) {
  const value = params?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    if (options.required) {
      throw new Error(`${key} is required`);
    }
    return undefined;
  }
  return value.trim();
}

function readNumber(params, key, fallback) {
  const value = params?.[key] ?? fallback;
  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }
  return Number(value);
}

function requireLabSessionKey(params) {
  const sessionKey = readString(params, "sessionKey", {
    required: true,
  }).toLowerCase();
  if (!sessionKey.startsWith(SESSION_PREFIX)) {
    throw new Error(`sessionKey must start with ${SESSION_PREFIX}`);
  }
  return sessionKey;
}

function respondError(respond, error) {
  respond(false, undefined, {
    code:
      error && typeof error === "object" && error.code
        ? String(error.code)
        : "vlab_worker_error",
    message: error instanceof Error ? error.message : String(error),
  });
}

function lastAssistantText(messages) {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    const text = message.content
      .filter(
        (block) => block?.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n");
    if (text) return text;
  }
  return undefined;
}

function operationSnapshot(operation) {
  return {
    operationId: operation.operationId,
    idempotencyKey: operation.idempotencyKey,
    requestId: operation.requestId,
    sessionKey: operation.sessionKey,
    kind: operation.kind,
    state: operation.state,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    result: operation.result,
    error: operation.error,
  };
}

function acquireSharedPool(options) {
  if (!globalThis[SHARED_POOL_KEY]) {
    globalThis[SHARED_POOL_KEY] = {
      pool: new WorkerPool(options),
      nativeHarnessStats: {
        admitted: 0,
        completed: 0,
        cancelled: 0,
        failed: 0,
        interruptedToolCallsRecovered: 0,
        transcriptRecoveryFailed: 0,
        userTurnsAcknowledgedFromWorker: 0,
        userTurnsAlreadyPersisted: 0,
        userTurnAcknowledgementMisses: 0,
        userTurnOwnershipUnavailable: 0,
        workerAttempts: 0,
        sessionPreflightRebinds: 0,
        sessionPreflightRebindFailures: 0,
        sessionRolloverRetries: 0,
        sessionRolloverRetryFailures: 0,
        subagentCompletionRelay: {
          started: 0,
          completed: 0,
          failed: 0,
          delivered: 0,
        },
        lastSessionKey: undefined,
        lastWorkerSlot: undefined,
        lastWorkerPid: undefined,
      },
      nativeRequestsByRunId: new Map(),
      nativeLaneProgressBridge: new NativeLaneProgressBridge(),
      nativeSubagentCompletionRelays: new Map(),
      fastCompactionWorkerStats: new Map(),
      harnessEventParity: {
        observedCallbacks: new Set(),
        bridgedCallbacks: new Set(),
        gatewayOwnedCallbacks: new Set(),
        unclassifiedCallbacks: new Set(),
        eventsRelayed: 0,
        eventRelayFailures: 0,
        eventsByCallback: new Map(),
        observedOptions: new Set(),
        forwardedOptions: new Set(),
        translatedOptions: new Set(),
        processLocalOptions: new Set(),
        unclassifiedOptions: new Set(),
      },
    };
  }
  if (!globalThis[SHARED_POOL_KEY].harnessEventParity) {
    globalThis[SHARED_POOL_KEY].harnessEventParity = {
      observedCallbacks: new Set(),
      bridgedCallbacks: new Set(),
      gatewayOwnedCallbacks: new Set(),
      unclassifiedCallbacks: new Set(),
      eventsRelayed: 0,
      eventRelayFailures: 0,
      eventsByCallback: new Map(),
      observedOptions: new Set(),
      forwardedOptions: new Set(),
      translatedOptions: new Set(),
      processLocalOptions: new Set(),
      unclassifiedOptions: new Set(),
    };
  }
  if (!globalThis[SHARED_POOL_KEY].nativeLaneProgressBridge) {
    globalThis[SHARED_POOL_KEY].nativeLaneProgressBridge =
      new NativeLaneProgressBridge();
  }
  if (!globalThis[SHARED_POOL_KEY].harnessEventParity.eventsByCallback) {
    globalThis[SHARED_POOL_KEY].harnessEventParity.eventsByCallback = new Map();
  }
  for (const name of [
    "observedOptions",
    "forwardedOptions",
    "translatedOptions",
    "processLocalOptions",
    "unclassifiedOptions",
  ]) {
    if (!globalThis[SHARED_POOL_KEY].harnessEventParity[name]) {
      globalThis[SHARED_POOL_KEY].harnessEventParity[name] = new Set();
    }
  }
  return globalThis[SHARED_POOL_KEY];
}

const plugin = {
  id: "vlab-agent-worker-isolation",
  name: "vLab Agent Worker Isolation",
  description:
    "Runs native OpenClaw Agent Harness dispatch in elastic child-process workers.",
  register(api) {
    api.registerRealtimeVoiceProvider(buildVolcengineRtcAgentProvider());
    api.registerRealtimeVoiceProvider(buildSeeduplexRealtimeVoiceProvider());
    const minWorkers = Number(api.pluginConfig?.minWorkers ?? 1);
    const maxWorkers = Number(api.pluginConfig?.maxWorkers ?? 3);
    const sessionsPerWorker = Number(
      api.pluginConfig?.sessionsPerWorker ?? 3,
    );
    const idleTimeoutMs = Number(api.pluginConfig?.idleTimeoutMs ?? 180_000);
    const requestTimeoutMs = Number(api.pluginConfig?.requestTimeoutMs ?? 600_000);
    // OpenClaw 2026.7.1 supplies a 600s default attempt budget even for
    // isolated child Sessions. Native Gateway Sessions historically continue
    // well beyond that channel-sized budget, so the Worker must provide a
    // longer execution lease while still honoring explicit AbortSignals.
    const nativeRequestTimeoutMs = Number(
      api.pluginConfig?.nativeRequestTimeoutMs ??
        DEFAULT_NATIVE_REQUEST_TIMEOUT_MS,
    );
    const requestStallTimeoutMs = Number(
      api.pluginConfig?.requestStallTimeoutMs ?? 120_000,
    );
    const requestCancelGraceMs = Number(
      api.pluginConfig?.requestCancelGraceMs ?? 15_000,
    );
    const workerStartupTimeoutMs = Number(
      api.pluginConfig?.workerStartupTimeoutMs ?? 180_000,
    );
    const warmSpareWorkers = Number(
      api.pluginConfig?.warmSpareWorkers ?? 1,
    );
    const workerHeartbeatMs = Number(
      api.pluginConfig?.workerHeartbeatMs ?? 15_000,
    );
    const workerMemoryReportMs = Number(
      api.pluginConfig?.workerMemoryReportMs ?? 30_000,
    );
    // worker-memory-recycle.1: 0 disables the bound. recycleRssMb is the
    // primary control; the lifetime bound only catches slow growth that never
    // crosses the RSS threshold.
    const recycleRssMb = Number(api.pluginConfig?.recycleRssMb ?? 1_536);
    const recycleMaxLifetimeMs = Number(
      api.pluginConfig?.recycleMaxLifetimeMs ?? 12 * 60 * 60 * 1_000,
    );
    const recycleMaxSessions = Number(api.pluginConfig?.recycleMaxSessions ?? 0);
    const recycleCooldownMs = Number(
      api.pluginConfig?.recycleCooldownMs ?? 60_000,
    );
    const recycleMinAgeMs = Number(
      api.pluginConfig?.recycleMinAgeMs ?? 300_000,
    );
    // 0 keeps whatever the Gateway was started with. A Worker that inherits a
    // Gateway-sized old-space ceiling has no reason to collect early.
    const workerMaxOldSpaceMb = Number(
      api.pluginConfig?.workerMaxOldSpaceMb ?? 0,
    );
    const gatewayOwnedToolTimeoutMs = Number(
      api.pluginConfig?.gatewayOwnedToolTimeoutMs ?? 310_000,
    );
    const workerConfigPath =
      typeof api.pluginConfig?.workerConfigPath === "string"
        ? api.pluginConfig.workerConfigPath.trim()
        : undefined;
    const gatewayConfigPath =
      typeof api.pluginConfig?.gatewayConfigPath === "string"
        ? api.pluginConfig.gatewayConfigPath.trim()
        : typeof process.env.OPENCLAW_CONFIG_PATH === "string"
          ? process.env.OPENCLAW_CONFIG_PATH.trim()
          : undefined;
    if (!workerConfigPath) {
      throw new Error("workerConfigPath is required");
    }
    if (!gatewayConfigPath) {
      throw new Error("gatewayConfigPath is required");
    }
    const workerRuntimeConfigSync = syncWorkerRuntimeConfigFile({
      gatewayConfigPath,
      workerConfigPath,
    });
    if (workerRuntimeConfigSync.changed) {
      api.logger.info(
        `Synchronized Worker runtime policy from Gateway config: ${workerRuntimeConfigSync.paths.join(
          ", ",
        )}`,
      );
    }
    const fastCompactionModel =
      typeof api.pluginConfig?.fastCompactionModel === "string" &&
      api.pluginConfig.fastCompactionModel.trim()
        ? api.pluginConfig.fastCompactionModel.trim()
        : typeof api.config.agents?.defaults?.compaction?.model === "string" &&
            api.config.agents.defaults.compaction.model.trim()
          ? api.config.agents.defaults.compaction.model.trim()
          : "azure-openai/gpt-5.5";
    const fastCompactionProvider = buildFastCompactionProvider({
      model: fastCompactionModel,
      maxInputChars: Number(
        api.pluginConfig?.fastCompactionMaxInputChars ?? 420_000,
      ),
      maxOutputTokens: Number(
        api.pluginConfig?.fastCompactionMaxOutputTokens ?? 12_000,
      ),
      maxQualityRetries: Number(
        api.pluginConfig?.fastCompactionMaxQualityRetries ?? 1,
      ),
      llmComplete: (params) => api.runtime.llm.complete(params),
    });
    api.registerCompactionProvider(fastCompactionProvider);
    // This hook is needed inside the Worker child: Agent-launched CLI commands
    // are control-plane clients and must target the Gateway config. Register it
    // before the child-only early return.
    api.on(
      "resolve_exec_env",
      (event) => resolveWorkerExecEnv(event),
      { priority: 100 },
    );
    if (process.env.VLAB_WORKER_CHILD === "1") {
      api.logger.info(
        "Loaded Worker child compaction provider without recursive Worker services",
      );
      return;
    }
    const openClawAgentRuntimePath = resolveOpenClawAgentRuntimePath();
    const agentHarnessActiveRunRuntimePromise = import(
      pathToFileURL(
        resolveOpenClawAgentHarnessRuntimePath({
          agentRuntimePath: openClawAgentRuntimePath,
        }),
      ).href
    );
    const compactNativeOpenClawSession =
      createGatewayNativeCompactionPassthrough();
    const transcriptRuntimePromise = import(
      pathToFileURL(
        resolve(dirname(openClawAgentRuntimePath), "session-transcript-runtime.js"),
      ).href
    );
    const gatewayCallerRuntimePromise = import(pathToFileURL(
      resolveOpenClawGatewayCallerContextRuntimePath({agentRuntimePath:openClawAgentRuntimePath}),
    ).href);
    const gatewayScopeRuntimePromise = import(pathToFileURL(
      resolveOpenClawGatewayRequestScopeRuntimePath({agentRuntimePath:openClawAgentRuntimePath}),
    ).href);
    const agentHarnessTaskRuntimePromise = import(
      pathToFileURL(
        resolve(
          dirname(openClawAgentRuntimePath),
          "agent-harness-task-runtime.js",
        ),
      ).href
    );
    const diagnosticRuntimePromise = import(
      pathToFileURL(
        resolve(dirname(openClawAgentRuntimePath), "diagnostic-runtime.js"),
      ).href
    );
    const nativeSubagentAnnounceRuntimePromise = import(
      pathToFileURL(
        resolveOpenClawSubagentAnnounceRuntimePath({
          agentRuntimePath: openClawAgentRuntimePath,
        }),
      ).href
    );
    const nativeSubagentAnnounceOriginRuntimePromise = import(
      pathToFileURL(
        resolveOpenClawSubagentAnnounceOriginRuntimePath({
          agentRuntimePath: openClawAgentRuntimePath,
        }),
      ).href
    );
    const mediaCompletionRelayStats = {};
    const skillUsageRelayStats = {};
    const routeWorkerGatewayEvent = createWorkerGatewayEventRouter({
      stats: mediaCompletionRelayStats,
      skillUsageStats: skillUsageRelayStats,
      async deliverMediaCompletion(deliveryParams) {
        const runtime = await nativeSubagentAnnounceOriginRuntimePromise;
        const deliverSubagentAnnouncement =
          runtime.deliverSubagentAnnouncement ?? runtime.t ?? runtime.n;
        if (typeof deliverSubagentAnnouncement !== "function") {
          throw new Error(
            "OpenClaw native completion delivery runtime is unavailable",
          );
        }
        return await deliverSubagentAnnouncement(deliveryParams);
      },
      async recordSkillUsage(usage) {
        const runtime = await diagnosticRuntimePromise;
        if (
          typeof runtime.emitTrustedDiagnosticEventWithPrivateData !==
          "function"
        ) {
          throw new Error("OpenClaw trusted diagnostic emitter is unavailable");
        }
        runtime.emitTrustedDiagnosticEventWithPrivateData(
          {
            type: "skill.used",
            runId: usage.runId,
            sessionKey: usage.sessionKey,
            sessionId: usage.sessionId,
            agentId: usage.agentId,
            skillName: usage.skillName,
            skillSource: usage.skillSource,
            activation: usage.activation,
            toolName: usage.toolName,
            toolCallId: usage.toolCallId,
          },
          { skillUsage: { skillFile: usage.skillFile } },
        );
        await runtime.waitForDiagnosticEventsDrained?.();
      },
    });
    const workerEnv = buildWorkerEnvironment(
      {
        ...process.env,
        VLAB_OPENCLAW_AGENT_RUNTIME: openClawAgentRuntimePath,
        VLAB_OPENCLAW_DIAGNOSTIC_RUNTIME: resolve(
          dirname(openClawAgentRuntimePath),
          "diagnostic-runtime.js",
        ),
        VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME: "1",
        VLAB_REQUIRE_SKILL_USAGE_TELEMETRY: "1",
        VLAB_WORKER_HEARTBEAT_MS: String(workerHeartbeatMs),
        VLAB_WORKER_MEMORY_REPORT_MS: String(workerMemoryReportMs),
        VLAB_GATEWAY_OWNED_TOOL_TIMEOUT_MS: String(
          gatewayOwnedToolTimeoutMs,
        ),
      },
      {
        gatewayConfigPath,
        workerConfigPath,
      },
    );
    const sharedPool = acquireSharedPool({
      minWorkers,
      maxWorkers,
      sessionsPerWorker,
      idleTimeoutMs,
      requestTimeoutMs,
      requestStallTimeoutMs,
      requestCancelGraceMs,
      startupTimeoutMs: workerStartupTimeoutMs,
      recycleRssBytes: Math.max(0, Math.trunc(recycleRssMb)) * 1024 * 1024,
      recycleMaxLifetimeMs,
      recycleMaxSessions,
      recycleCooldownMs,
      recycleMinAgeMs,
      workerMaxOldSpaceMb: Math.trunc(workerMaxOldSpaceMb),
      warmSpareWorkers,
      workerEnv,
      async onProgress(progress) {
        const nativeLaneProgressBridge =
          globalThis[SHARED_POOL_KEY]?.nativeLaneProgressBridge;
        if (nativeLaneProgressBridge) {
          try {
            await nativeLaneProgressBridge.relay(progress);
          } catch (error) {
            api.logger.warn(
              `Worker native lane progress relay failed for ${progress.requestId}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
        const { emitDiagnosticEvent } = await diagnosticRuntimePromise;
        relayWorkerProgress(emitDiagnosticEvent, progress);
      },
      async onWorkerEvent(event) {
        try {
          return await routeWorkerGatewayEvent(event);
        } catch (error) {
          api.logger.warn(
            `Worker Gateway event relay failed for ${String(event?.eventId)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          throw error;
        }
      },
    });
    const pool = sharedPool.pool;
    const nativeRequestsByRunId = sharedPool.nativeRequestsByRunId;
    const nativeLaneProgressBridge = sharedPool.nativeLaneProgressBridge;
    const nativeSubagentCompletionRelays =
      sharedPool.nativeSubagentCompletionRelays;
    const fastCompactionWorkerStats = sharedPool.fastCompactionWorkerStats;
    const harnessEventParity = sharedPool.harnessEventParity;
    const operationsById = new Map();
    const operationsByIdempotencyKey = new Map();
    let nextOperationId = 1;
    let nativeSessionWriteTail = Promise.resolve();
    const nativeHarnessStats = sharedPool.nativeHarnessStats;

    function configuredAgentModelRuntimes() {
      return Object.values(api.config.agents?.defaults?.models ?? {})
        .map((entry) => entry?.agentRuntime?.id)
        .filter((value) => typeof value === "string");
    }

    async function dispatchNativeHarnessAttempt(params) {
      ocFirsttextWorkerMark("gateway-harness-enter", params.runId);
      // Validate before creating a relay or admitting any side effects.
      const nativeHarnessData = buildNativeHarnessData(params);
      const harnessAttemptStartedAt = Date.now();
      const messageChannel = resolveHarnessMessageChannel(params);
      const sessionKey =
        typeof params.sessionKey === "string" && params.sessionKey.trim()
          ? params.sessionKey
          : `agent:${params.agentId ?? "makaron"}:${params.sessionId}`;
      const upstreamAttemptTimeoutMs = Number(
        params.timeoutMs ?? requestTimeoutMs,
      );
      const attemptTimeoutMs = resolveNativeRequestTimeoutMs({
        upstreamTimeoutMs: upstreamAttemptTimeoutMs,
        nativeTimeoutMs: nativeRequestTimeoutMs,
      });
      const expectedUserTurn = params.transcriptPrompt ?? params.prompt;
      const workerShouldPersistUserTurn = shouldWorkerPersistUserTurn(
        params.userTurnTranscriptRecorder,
      );
      const nativePersistedUserTurn = snapshotPersistedUserTurn(params.userTurnTranscriptRecorder, {
        runId: params.runId, sessionId: params.sessionId, sessionKey,
        agentId: params.agentId ?? 'makaron',
      });
      const eventContract = inspectHarnessEventContract(params);
      const optionContract = inspectHarnessOptionContract(params);
      for (const name of eventContract.observed) {
        harnessEventParity.observedCallbacks.add(name);
      }
      for (const name of eventContract.bridged) {
        harnessEventParity.bridgedCallbacks.add(name);
      }
      for (const name of eventContract.gatewayOwned) {
        harnessEventParity.gatewayOwnedCallbacks.add(name);
      }
      for (const name of eventContract.unclassified) {
        if (!harnessEventParity.unclassifiedCallbacks.has(name)) {
          api.logger.warn(
            `OpenClaw exposed an unclassified Agent Harness callback: ${name}`,
          );
        }
        harnessEventParity.unclassifiedCallbacks.add(name);
      }
      for (const name of optionContract.observed) {
        harnessEventParity.observedOptions.add(name);
      }
      for (const name of optionContract.forwarded) {
        harnessEventParity.forwardedOptions.add(name);
      }
      for (const name of optionContract.translated) {
        harnessEventParity.translatedOptions.add(name);
      }
      for (const name of optionContract.processLocal) {
        harnessEventParity.processLocalOptions.add(name);
      }
      for (const name of optionContract.unclassified) {
        if (Object.hasOwn(nativeHarnessData, name)) {
          harnessEventParity.automaticallyForwardedOptions ??= new Set();
          harnessEventParity.automaticallyForwardedOptions.add(name);
          continue;
        }
        if (!harnessEventParity.unclassifiedOptions.has(name)) {
          api.logger.warn(
            `OpenClaw exposed an unclassified Agent Harness option: ${name}`,
          );
        }
        harnessEventParity.unclassifiedOptions.add(name);
      }
      nativeHarnessStats.admitted += 1;
      nativeHarnessStats.lastSessionKey = sessionKey;
      let workerMessagesSnapshot;
      let finalSession = {
        sessionId: params.sessionId,
        sessionFile: params.sessionFile,
      };
      try {
        ocFirsttextWorkerMark("gateway-preflight-enter", params.runId);
        const logicalAttempt = await runWithSessionRolloverRetry({
          initialSession: finalSession,
          maxRetries: 1,
          readLatestSession: async () =>
            readNativeSession(params.agentId ?? "makaron", sessionKey),
          onRetry: (event) => {
            nativeHarnessStats.sessionRolloverRetries += 1;
            api.logger.warn(
              `retrying ${sessionKey} after pre-work session revision ${event.previousSessionId} -> ${event.nextSessionId}`,
            );
          },
          onRebind: (event) => {
            nativeHarnessStats.sessionPreflightRebinds =
              (nativeHarnessStats.sessionPreflightRebinds ?? 0) + 1;
            api.logger.info(
              `rebound stale ${sessionKey} dispatch before execution ${event.previousSessionId} -> ${event.nextSessionId}`,
            );
          },
          onRebindError: (error) => {
            nativeHarnessStats.sessionPreflightRebindFailures =
              (nativeHarnessStats.sessionPreflightRebindFailures ?? 0) + 1;
            api.logger.warn(
              `could not preflight ${sessionKey} session freshness; continuing with the admitted session: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          },
          execute: async (session) => {
            if (params.abortSignal?.aborted) {
              throw (
                params.abortSignal.reason ??
                Object.assign(new Error("worker Agent request was cancelled"), {
                  name: "AbortError",
                })
              );
            }
            finalSession = session;
            const workerAgentId = params.agentId ?? "makaron";
            const gatewayMessageRelay = createGatewayMessageToolRelay(params);
            ocFirsttextWorkerMark("gateway-preflight-end", params.runId);
            const submitted = await pool.submit(
              sessionKey,
              {
                kind: "agent",
                harnessAttempt: true,
                nativeAttempt91: true,
                nativeHarnessData,
                // A rollover gets a new transcript owner; never carry the old
                // session's durable message acknowledgement into that owner.
                nativePersistedUserTurn: session.sessionId === params.sessionId ? nativePersistedUserTurn : undefined,
                gatewayMessageTool: Boolean(params.messageActionTurnCapability),
                message: params.prompt,
                transcriptMessage: expectedUserTurn,
                suppressPromptPersistence: !workerShouldPersistUserTurn,
                images: params.images,
                imageOrder: params.imageOrder,
                clientTools: params.clientTools,
                agentId: workerAgentId,
                skillTelemetryIndex: buildSkillTelemetryIndex(
                  params.skillsSnapshot,
                ),
                sessionId: session.sessionId,
                // Keep the channel/session routing identity distinct from the
                // transcript owner used by the pool. Synthetic subagent
                // announce keys can target the same parent transcript.
                sessionKey,
                runId: params.runId,
                timeoutSeconds: Math.max(
                  1,
                  Math.ceil(attemptTimeoutMs / 1_000),
                ),
                // Explicit cancellation still arrives through abortSignal.
                // The longer Worker lease prevents OpenClaw's 600s default
                // from turning into an isolated-Subagent hard wall.
                requestTimeoutMs: attemptTimeoutMs,
                messageChannel,
                messageProvider: params.messageProvider,
                channel: messageChannel,
                accountId: params.agentAccountId,
                to: params.messageTo,
                replyTo: params.messageTo,
                replyChannel: messageChannel,
                replyAccountId: params.agentAccountId,
                threadId: params.messageThreadId,
                runContext: {
                  messageChannel,
                  accountId: params.agentAccountId,
                  groupId: params.groupId,
                  groupChannel: params.groupChannel,
                  groupSpace: params.groupSpace,
                  currentChannelId: params.currentChannelId,
                  senderId: params.senderId,
                },
                toolsAllow: params.toolsAllow,
                extraSystemPrompt: params.extraSystemPrompt,
                sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
                senderIsOwner: params.senderIsOwner,
                eventCallbackNames: eventContract.bridged,
                agentCommandOptions: buildForwardedHarnessOptions(withWorkerHarnessModelSelection(params)),
              },
              {
                // Session ID/file identity is the authoritative transcript
                // owner. This serializes a parent turn and its synthetic
                // subagent completion announce even when their dispatch keys
                // differ.
                sessionOwnerKey: `${workerAgentId}:${session.sessionId}`,
                onGatewayToolRequest: gatewayMessageRelay?.execute,
                onEvent: async (event) => {
                  const callback = params[event.name];
                  if (typeof callback !== "function") {
                    throw new Error(
                      `missing Gateway callback for Worker event ${event.name}`,
                    );
                  }
                  try {
                    ocFirsttextWorkerMark("gateway-callback-enter", params.runId, {requestId:event.requestId,name:event.name});
                    try {
                      await callback(...gatewayOwnedEventArgs(event.name, event.args));
                    } finally { ocFirsttextWorkerMark("gateway-callback-end", params.runId, {requestId:event.requestId,name:event.name}); }
                    publishWorkerPublicStream(params, event.name, event.args,
                      (await agentHarnessActiveRunRuntimePromise).emitAgentEvent);
                    harnessEventParity.eventsRelayed += 1;
                    harnessEventParity.eventsByCallback.set(
                      event.name,
                      (harnessEventParity.eventsByCallback.get(event.name) ??
                        0) + 1,
                    );
                  } catch (error) {
                    harnessEventParity.eventRelayFailures += 1;
                    throw error;
                  }
                },
              },
            );
            ocFirsttextWorkerMark("gateway-submit-return", params.runId, {requestId:submitted.requestId});
            nativeHarnessStats.workerAttempts += 1;
            nativeRequestsByRunId.set(params.runId, {
              requestId: submitted.requestId,
              sessionKey,
            });
            const unregisterNativeLaneProgress =
              nativeLaneProgressBridge.register(
                submitted.requestId,
                async (progress) => {
                  if (typeof params.onRunProgress !== "function") return;
                  await params.onRunProgress({
                    phase: "worker_active",
                    source: "vlab-worker",
                    reason: progress.reason,
                    requestId: progress.requestId,
                    workerPid: progress.workerPid,
                    workerSlot: progress.slot,
                  });
                },
              );
            const onAbort = () => {
              const abortReason = params.abortSignal?.reason;
              api.logger.warn(
                `Gateway aborted Worker Agent request runId=${String(
                  params.runId,
                )} sessionKey=${sessionKey} elapsedMs=${
                  Date.now() - harnessAttemptStartedAt
                } upstreamTimeoutMs=${upstreamAttemptTimeoutMs} ` +
                  `workerLeaseMs=${attemptTimeoutMs} reason=${
                    abortReason instanceof Error
                      ? `${abortReason.name}:${abortReason.message}`
                      : String(abortReason ?? "unknown")
                  }`,
              );
              pool.cancel(submitted.requestId);
            };
            const activeRunRuntime = await agentHarnessActiveRunRuntimePromise;
            const activeRunProxy = createWorkerActiveRunProxy({
              pool,
              requestId: submitted.requestId,
              runId: params.runId,
              sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
              nativeSteer: true,
              toolAuthorityFingerprint: params.toolAuthorityFingerprint,
              taskSuggestionDeliveryMode: params.taskSuggestionDeliveryMode,
              permissionChange: params.permissionChange,
              onPermissionChange: () => gatewayMessageRelay?.invalidate(),
            });
            activeRunRuntime.setActiveEmbeddedRun(
              session.sessionId,
              activeRunProxy.handle,
              sessionKey,
              session.sessionFile,
            );
            // 9.1 resolves interactive injection through the native Reply
            // Operation, not only the legacy embedded-run map.
            params.replyOperation?.attachBackend(activeRunProxy.handle);
            params.abortSignal?.addEventListener("abort", onAbort, {
              once: true,
            });
            try {
              return await submitted.promise;
            } finally {
              unregisterNativeLaneProgress();
              activeRunProxy.deactivate();
              gatewayMessageRelay?.close();
              activeRunRuntime.clearActiveEmbeddedRun(
                session.sessionId,
                activeRunProxy.handle,
                sessionKey,
                session.sessionFile,
              );
              if (
                nativeRequestsByRunId.get(params.runId)?.requestId ===
                submitted.requestId
              ) {
                nativeRequestsByRunId.delete(params.runId);
              }
              params.abortSignal?.removeEventListener("abort", onAbort);
            }
          },
        });
        finalSession = logicalAttempt.session;
        const result = logicalAttempt.value;
        nativeHarnessStats.completed += 1;
        nativeHarnessStats.lastWorkerSlot = result.slot;
        nativeHarnessStats.lastWorkerPid = result.workerPid;
        if (result.meta?.fastCompaction) {
          nativeHarnessStats.fastCompaction = result.meta.fastCompaction;
          fastCompactionWorkerStats.set(
            result.workerPid,
            result.meta.fastCompaction,
          );
        }
        if (!result.attempt || typeof result.attempt !== "object") {
          throw new Error("worker did not return an Agent Harness attempt result");
        }
        const acceptedSessionSpawns = [
          ...(Array.isArray(result.acceptedSessionSpawns)
            ? result.acceptedSessionSpawns
            : []),
          ...(Array.isArray(result.attempt.acceptedSessionSpawns)
            ? result.attempt.acceptedSessionSpawns
            : []),
        ];
        startSubagentCompletionRelays({
          // Gateway-owned sessions_spawn already registered the native
          // completion lifecycle in the Gateway. Only legacy Worker-owned
          // spawns need the compatibility relay.
          spawns: acceptedSessionSpawns.filter(
            (spawn) => spawn?.vlabGatewayOwned !== true,
          ),
          requesterSessionKey: sessionKey,
          requesterOrigin: {
            channel: messageChannel,
            accountId: params.agentAccountId,
            to: params.messageTo,
            threadId: params.messageThreadId,
          },
          active: nativeSubagentCompletionRelays,
          stats: nativeHarnessStats.subagentCompletionRelay,
          waitForRun: (waitParams) =>
            api.runtime.subagent.waitForRun(waitParams),
          deliverHarnessTaskCompletion: async ({ spawn, outcome }) => {
            if (!params.agentHarnessTaskRuntimeScope) {
              throw new Error(
                "OpenClaw Agent Harness task runtime scope is unavailable",
              );
            }
            const childSessionKey = spawn.childSessionKey.trim();
            const childAgentId =
              childSessionKey.split(":")[1]?.trim() ||
              spawn.agentId ||
              params.agentId ||
              "makaron";
            const childSession = readNativeSession(
              childAgentId,
              childSessionKey,
            );
            if (!childSession.exists || !childSession.sessionId) {
              throw new Error(
                `completed child Session was not found: ${childSessionKey}`,
              );
            }
            const history = await api.runtime.subagent.getSessionMessages({
              sessionKey: childSessionKey,
              limit: 200,
            });
            const result =
              lastAssistantText(history.messages) ??
              outcome.error ??
              `Child task ${outcome.status}`;
            const runtime = await agentHarnessTaskRuntimePromise;
            const { o: withoutGatewayToolCallerIdentity } = await gatewayCallerRuntimePromise;
            const { r: getResolver, s: withResolver } = await gatewayScopeRuntimePromise;
            // Core's process-owned-work boundary releases only the expired
            // initiating turn context. The native task scope still owns the
            // requester and native delivery validates the completion lifecycle.
            return await withGatewayCompletionContext({
              scope: params.agentHarnessTaskRuntimeScope,
              subagentRuntime: api.runtime.subagent,
              getResolver, withResolver, withoutCaller: withoutGatewayToolCallerIdentity,
            }, () => runtime.deliverAgentHarnessTaskCompletion({
              scope: params.agentHarnessTaskRuntimeScope,
              childSessionKey,
              childSessionId: childSession.sessionId,
              announceId: `vlab-worker:${spawn.runId}:${outcome.status}`,
              announceType: "OpenClaw isolated subagent",
              taskLabel: spawn.label || spawn.taskName || "OpenClaw subagent",
              status: outcome.status === "ok" ? "succeeded" : "failed",
              statusLabel: outcome.status,
              result,
              replyInstruction:
                "Use the completed subagent result to continue or wrap up the parent task. Reply in your normal assistant voice and do not expose internal notification markup.",
            }));
          },
          runNativeAnnounce: async (announceParams) => {
            const { runSubagentAnnounceFlow } =
              await nativeSubagentAnnounceRuntimePromise;
            if (typeof runSubagentAnnounceFlow !== "function") {
              throw new Error(
                "OpenClaw native subagent announce runtime is unavailable",
              );
            }
            return await runSubagentAnnounceFlow(announceParams);
          },
          logger: api.logger,
        });
        workerMessagesSnapshot = result.attempt.messagesSnapshot;
        return result.attempt;
      } catch (error) {
        if (
          error?.name === "AbortError" ||
          error?.code === "VLAB_WORKER_CANCELLED"
        ) {
          nativeHarnessStats.cancelled += 1;
          return {
            aborted: true,
            assistantTranscriptOwned: true,
            externalAbort: true,
            timedOut: false,
            idleTimedOut: false,
            timedOutDuringCompaction: false,
            promptError: null,
            promptErrorSource: null,
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
              hadPotentialSideEffects: false,
              replaySafe: true,
            },
            itemLifecycle: {
              startedCount: 0,
              completedCount: 0,
              activeCount: 0,
            },
          };
        }
        nativeHarnessStats.failed += 1;
        if (error?.code === "SESSION_WORK_START_CHANGED" || error?.name === "SessionWorkStartChangedError") {
          api.logger.warn(`Worker lifecycle rejection frames: ${String(error?.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line)).slice(0, 8).join(" | ")}`);
        }
        api.logger.warn(
          `Worker Agent request failed runId=${String(
            params.runId,
          )} sessionKey=${sessionKey} elapsedMs=${
            Date.now() - harnessAttemptStartedAt
          } error=${error instanceof Error ? `${error.name}:${error.message}` : String(error)}`,
        );
        const latestSession = readNativeSession(
          params.agentId ?? "makaron",
          sessionKey,
        );
        if (
          latestSession.exists &&
          latestSession.sessionId !== finalSession.sessionId
        ) {
          finalSession = {
            sessionId: latestSession.sessionId,
            sessionFile: latestSession.sessionFile,
          };
          nativeHarnessStats.sessionRolloverRetryFailures += 1;
        }
        try {
          const { withSessionTranscriptWriteLock } =
            await transcriptRuntimePromise;
          nativeHarnessStats.interruptedToolCallsRecovered +=
            await closeInterruptedToolCalls({
              withSessionTranscriptWriteLock,
              target: {
                agentId: params.agentId ?? "makaron",
                sessionKey,
                sessionId: finalSession.sessionId,
                sessionFile: finalSession.sessionFile,
              },
              config: api.config,
              error,
            });
        } catch (recoveryError) {
          nativeHarnessStats.transcriptRecoveryFailed += 1;
          api.logger.warn(
            `failed to close interrupted worker tool calls for ${sessionKey}: ${
              recoveryError instanceof Error
                ? recoveryError.message
                : String(recoveryError)
            }`,
          );
        }
        // Agent Harness expects a terminal attempt result. Throwing here skips
        // OpenClaw's normal attempt finalization and can leave the Session and
        // per-chat lane active even though the worker already failed.
        return buildHarnessFailureAttempt(error, {
          ...params,
          sessionId: finalSession.sessionId,
          sessionFile: finalSession.sessionFile,
        });
      } finally {
        if (!Array.isArray(workerMessagesSnapshot)) {
          try {
            ocFirsttextWorkerMark("gateway-transcript-enter", params.runId);
            workerMessagesSnapshot = await readNativeSessionMessages(
              { agentId: params.agentId ?? "makaron", sessionKey,
                sessionId: finalSession.sessionId },
            );
          } catch {
            workerMessagesSnapshot = [];
          } finally { ocFirsttextWorkerMark("gateway-transcript-end", params.runId); }
        }
        const userTurnAcknowledgement = acknowledgeWorkerUserTurn({
          recorder: params.userTurnTranscriptRecorder,
          messages: workerMessagesSnapshot,
          expectedText: expectedUserTurn,
        });
        if (userTurnAcknowledgement === "acknowledged") {
          nativeHarnessStats.userTurnsAcknowledgedFromWorker += 1;
        } else if (userTurnAcknowledgement === "already-persisted") {
          nativeHarnessStats.userTurnsAlreadyPersisted += 1;
        } else if (userTurnAcknowledgement === "not-found") {
          nativeHarnessStats.userTurnAcknowledgementMisses += 1;
        } else if (userTurnAcknowledgement === "unavailable") {
          nativeHarnessStats.userTurnOwnershipUnavailable += 1;
        }
        ocFirsttextWorkerMark("gateway-harness-exit", params.runId);
      }
    }

    function readNativeSession(agentId, sessionKey) {
      const sessionRuntime = api.runtime.agent.session;
      const storePath = sessionRuntime.resolveStorePath(api.config.session?.store, {
        agentId,
      });
      const entry = sessionRuntime.getSessionEntry({
        agentId,
        storePath,
        sessionKey,
        readConsistency: "latest",
      });
      if (!entry) {
        return {
          exists: false,
        };
      }
      return {
        exists: true,
        sessionId: entry.sessionId,
        sessionFile: entry.sessionFile,
        lifecycleRevision: entry.lifecycleRevision,
        compactionCount: entry.compactionCount,
        totalTokens: entry.totalTokens,
        updatedAt: entry.updatedAt,
        status: entry.status,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        abortedLastRun: entry.abortedLastRun === true,
      };
    }

    function aggregateWorkerCompactionStats() {
      const aggregate = {
        calls: 0,
        modelCalls: 0,
        qualityRetries: 0,
        repaired: 0,
        failures: 0,
        workerProcesses: fastCompactionWorkerStats.size,
      };
      let latest;
      for (const stats of fastCompactionWorkerStats.values()) {
        for (const key of [
          "calls",
          "modelCalls",
          "qualityRetries",
          "repaired",
          "failures",
        ]) {
          aggregate[key] += Number(stats?.[key] ?? 0);
        }
        if (
          !latest ||
          Number(stats?.updatedAt ?? 0) > Number(latest?.updatedAt ?? 0)
        ) {
          latest = stats;
        }
      }
      return {
        ...aggregate,
        ...(latest
          ? {
              lastDurationMs: latest.lastDurationMs,
              lastInputChars: latest.lastInputChars,
              lastOutputChars: latest.lastOutputChars,
              lastAuditReasons: latest.lastAuditReasons,
              lastModel: latest.lastModel,
              updatedAt: latest.updatedAt,
            }
          : {}),
      };
    }

    async function reconcileNativeSessions(agentId, sessionKey, result) {
      const sessionId = result.meta?.sessionId;
      if (typeof sessionId !== "string" || sessionId.trim() === "") {
        throw new Error("worker Agent result did not include a native sessionId");
      }
      const snapshot = {
        agentId,
        sessionId,
        sessionFile: result.meta?.sessionFile,
        updatedAt: Date.now(),
      };

      const reconcile = async () => {
        const sessionRuntime = api.runtime.agent.session;
        const storePath = sessionRuntime.resolveStorePath(api.config.session?.store, {
          agentId: snapshot.agentId,
        });
        const existing = sessionRuntime.getSessionEntry({
          agentId: snapshot.agentId,
          storePath,
          sessionKey,
          readConsistency: "latest",
        });
        if (existing && existing.sessionId !== snapshot.sessionId) {
          throw new Error(
            `native session ${sessionKey} changed from ${snapshot.sessionId} to ${existing.sessionId}`,
          );
        }
        if (existing) {
          return;
        }
        await sessionRuntime.upsertSessionEntry({
          agentId: snapshot.agentId,
          storePath,
          sessionKey,
          readConsistency: "latest",
          entry: {
            sessionId: snapshot.sessionId,
            updatedAt: snapshot.updatedAt,
            lastActivityAt: snapshot.updatedAt,
            sessionStartedAt: snapshot.updatedAt,
            abortedLastRun: false,
            ...(typeof snapshot.sessionFile === "string"
              ? { sessionFile: snapshot.sessionFile }
              : {}),
          },
        });
      };

      const pendingWrite = nativeSessionWriteTail.then(reconcile, reconcile);
      nativeSessionWriteTail = pendingWrite.catch(() => {});
      await pendingWrite;
    }

    function trimOperations() {
      if (operationsById.size <= 1024) {
        return;
      }
      for (const [operationId, operation] of operationsById) {
        if (
          operationsById.size <= 1024 ||
          operation.state === "pending" ||
          operation.state === "running" ||
          operation.state === "cancelling"
        ) {
          continue;
        }
        operationsById.delete(operationId);
        if (
          operationsByIdempotencyKey.get(operation.idempotencyKey) ===
          operation
        ) {
          operationsByIdempotencyKey.delete(operation.idempotencyKey);
        }
      }
    }

    function finishOperation(operation, state, fields = {}) {
      operation.state = state;
      operation.updatedAt = Date.now();
      Object.assign(operation, fields);
      trimOperations();
    }

    async function startOperation(params) {
      const idempotencyKey = readString(params, "idempotencyKey", {
        required: true,
      });
      const existing = operationsByIdempotencyKey.get(idempotencyKey);
      if (existing) {
        return {
          deduplicated: true,
          operation: operationSnapshot(existing),
        };
      }

      const sessionKey = requireLabSessionKey(params);
      const kind = readString(params, "kind", { required: true });
      if (kind !== "hold" && kind !== "agent") {
        throw new Error("kind must be hold or agent");
      }
      const createdAt = Date.now();
      const operation = {
        operationId: `operation-${nextOperationId}`,
        idempotencyKey,
        sessionKey,
        kind,
        state: "pending",
        createdAt,
        updatedAt: createdAt,
      };
      nextOperationId += 1;
      operationsById.set(operation.operationId, operation);
      operationsByIdempotencyKey.set(idempotencyKey, operation);

      let request;
      let afterSuccess = async () => {};
      if (kind === "hold") {
        const durationMs = readNumber(params, "durationMs", 5_000);
        request = {
          kind,
          durationMs,
          requestTimeoutMs: readNumber(
            params,
            "requestTimeoutMs",
            Math.max(requestTimeoutMs, durationMs + 60_000),
          ),
        };
      } else {
        const agentId = readString(params, "agentId") ?? "makaron";
        const timeoutSeconds = readNumber(params, "timeoutSeconds", 300);
        request = {
          kind,
          message: readString(params, "message", { required: true }),
          agentId,
          timeoutSeconds,
          requestTimeoutMs: timeoutSeconds * 1_000,
          modelRun: params?.modelRun === true,
          toolsAllow: Array.isArray(params?.toolsAllow)
            ? params.toolsAllow.filter((item) => typeof item === "string")
            : undefined,
        };
        afterSuccess = async (result) => {
          await reconcileNativeSessions(agentId, sessionKey, result);
        };
      }

      try {
        const submitted = await pool.submit(sessionKey, request);
        operation.requestId = submitted.requestId;
        operation.state = "running";
        operation.updatedAt = Date.now();
        void submitted.promise.then(
          async (result) => {
            try {
              await afterSuccess(result);
              finishOperation(operation, "succeeded", { result });
            } catch (error) {
              finishOperation(operation, "failed", {
                error: {
                  code: "vlab_worker_reconcile_error",
                  message: error instanceof Error ? error.message : String(error),
                },
              });
            }
          },
          (error) => {
            const cancelled =
              error?.name === "AbortError" ||
              error?.code === "VLAB_WORKER_CANCELLED" ||
              operation.state === "cancelling";
            finishOperation(operation, cancelled ? "cancelled" : "failed", {
              error: {
                code: cancelled
                  ? "VLAB_WORKER_CANCELLED"
                  : "vlab_worker_operation_failed",
                message: error instanceof Error ? error.message : String(error),
              },
            });
          },
        );
      } catch (error) {
        finishOperation(operation, "failed", {
          error: {
            code: "vlab_worker_submit_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }

      return {
        deduplicated: false,
        operation: operationSnapshot(operation),
      };
    }

    api.registerService({
      id: "vlab-agent-worker-isolation",
      async start() {
        await pool.start();
        api.logger.info(
          `vLab Agent Worker Isolation started with ${minWorkers}-${maxWorkers} elastic workers and ${sessionsPerWorker} sessions per worker`,
        );
      },
      async stop() {
        await pool.close();
      },
    });

    api.registerAgentHarness({
      id: NATIVE_HARNESS_ID,
      label: "vLab elastic worker harness",
      // OpenClaw 8.1 requires plugin Harnesses to certify exact enforcement
      // before a run with any conversation-level tool restriction is admitted.
      // The Worker runs the same OpenClaw build and config overlay, forwards
      // the complete policy identity, and adds no native tool surface.
      conversationToolPolicySupport: "exact",
      conversationToolPolicySafeDenyTools:
        WORKER_CONVERSATION_TOOL_POLICY_SAFE_DENY_TOOLS,
      supports() {
        return {
          supported: true,
          priority: 100,
          reason: "vLab worker isolation experiment is enabled",
        };
      },
      runAttempt: dispatchNativeHarnessAttempt,
      compact: compactNativeOpenClawSession,
    });

    api.registerGatewayMethod(
      "vlab.workers.status",
      async ({ respond }) => {
        respond(true, {
          ...pool.status(),
          openClawConcurrency: {
            maxConcurrent: api.config.agents?.defaults?.maxConcurrent,
            subagentsMaxConcurrent:
              api.config.agents?.defaults?.subagents?.maxConcurrent,
            configuredModelRuntimes: configuredAgentModelRuntimes(),
          },
          integration: {
            currentEntry: "native Channel/dispatch -> AgentHarness -> worker agentCommand",
            nativeAgentHarnessId: NATIVE_HARNESS_ID,
            nativeAgentHarnessDispatchAttached: true,
            nestedGatewayHarnessRouting: true,
            workerUsesIngressAgentCommand: true,
            workerIsolationVersion: "0.2.11",
            nativeDataTransport: {
              contract: "native-harness-data-v1",
              ordinaryDataPassthrough: true,
              nonDataRequiresReview: true,
              perRunNativeChannelRegistry: true,
              automaticFields: [...(harnessEventParity.automaticallyForwardedOptions ?? [])].sort(),
            },
            activeRunSteer: {
              enabled: process.env.VLAB_FEISHU_STEER_ENABLED === "1",
              allowedChatIds: (process.env.VLAB_FEISHU_STEER_CHAT_IDS ?? "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            },
            sessionHotset: {
              gateway: getSessionHotsetStatus(),
              workers: pool.status().workers.map((worker) => ({
                slot: worker.slot,
                pid: worker.pid,
                status: worker.sessionHotset,
              })),
            },
            longRunProgressBridge: true,
            nativeCommandLaneProgress: nativeLaneProgressBridge.status(),
            upstreamAttemptTimeoutPropagation: true,
            nativeRequestTimeoutFloorMs: nativeRequestTimeoutMs,
            upstreamDefaultDoesNotCapNativeRun: true,
            workerRequestTimeoutIsFallbackOnly: false,
            workerStallTimeoutMs: requestStallTimeoutMs,
            nativeHarnessEventParity: {
              contractVersion: HARNESS_EVENT_CONTRACT_VERSION,
              orderedBackpressure: true,
              differentialTraceTest: true,
              observedCallbacks: [
                ...harnessEventParity.observedCallbacks,
              ].sort(),
              bridgedCallbacks: [
                ...harnessEventParity.bridgedCallbacks,
              ].sort(),
              gatewayOwnedCallbacks: [
                ...harnessEventParity.gatewayOwnedCallbacks,
              ].sort(),
              unclassifiedCallbacks: [
                ...harnessEventParity.unclassifiedCallbacks,
              ].sort(),
              eventsRelayed: harnessEventParity.eventsRelayed,
              eventRelayFailures: harnessEventParity.eventRelayFailures,
              eventsByCallback: Object.fromEntries(
                [...harnessEventParity.eventsByCallback.entries()].sort(
                  ([left], [right]) => left.localeCompare(right),
                ),
              ),
              observedOptions: [
                ...harnessEventParity.observedOptions,
              ].sort(),
              forwardedOptions: [
                ...harnessEventParity.forwardedOptions,
              ].sort(),
              translatedOptions: [
                ...harnessEventParity.translatedOptions,
              ].sort(),
              processLocalOptions: [
                ...harnessEventParity.processLocalOptions,
              ].sort(),
              unclassifiedOptions: [
                ...harnessEventParity.unclassifiedOptions,
              ].sort(),
            },
            channelTimeoutCoupledToWorker: false,
            cooperativeRequestTimeout: true,
            nativeUserTurnOwnedByWorker: true,
            nativeUserTurnAcknowledgedByGateway: true,
            nativeYieldTerminalSemantics: true,
            nativeNonTextTerminalSemantics: true,
            transcriptOwnerSerialization: true,
            nativeSubagentCompletionRelay: true,
            mediaCompletionRelay: {
              contractVersion: WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
              gatewayOwned: true,
              ackRetry: true,
              idempotent: true,
              ...mediaCompletionRelayStats,
            },
            skillUsageTelemetry: {
              contractVersion: WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
              gatewayOwnedLedger: true,
              nativeSkillUsageEvent: true,
              ackRetry: true,
              idempotent: true,
              ...skillUsageRelayStats,
              workers: pool.status().workers.map((worker) => ({
                slot: worker.slot,
                pid: worker.pid,
                status: worker.skillUsageTelemetry,
              })),
            },
            staleSessionPreflightRebind: true,
            sessionRolloverRebindRetry: true,
            fastCompaction: {
              provider: fastCompactionProvider.id,
              model: fastCompactionModel,
              maxQualityRetries: Number(
                api.pluginConfig?.fastCompactionMaxQualityRetries ?? 1,
              ),
              stats: { ...fastCompactionProvider.stats },
              lastWorkerStats: nativeHarnessStats.fastCompaction,
              aggregateWorkerStats: aggregateWorkerCompactionStats(),
            },
            configDomainIsolation: {
              workerRuntimeConfigPath: workerConfigPath,
              workerExecConfigPath: gatewayConfigPath,
              execUsesGatewayConfig: true,
              runtimePolicySync: workerRuntimeConfigSync,
            },
            gatewayOwnedToolIsolation: {
              enabled: true,
              subprocessTools: ["skill_workshop"],
              timeoutMs: gatewayOwnedToolTimeoutMs,
              workers: pool.status().workers.map((worker) => ({
                slot: worker.slot,
                pid: worker.pid,
                status: worker.gatewayOwnedToolProxy,
              })),
            },
            workerHeartbeatMs,
            productionPromotionBlocked:
              nativeParityReleaseHold ||
              harnessEventParity.unclassifiedCallbacks.size > 0 ||
              harnessEventParity.unclassifiedOptions.size > 0 ||
              harnessEventParity.eventRelayFailures > 0 ||
              Number(mediaCompletionRelayStats.failed ?? 0) > 0 ||
              Number(skillUsageRelayStats.failed ?? 0) > 0 ||
              pool.status().workers.some(
                (worker) =>
                  Number(worker.skillUsageTelemetry?.failed ?? 0) > 0 ||
                  Number(worker.skillUsageTelemetry?.unmatched ?? 0) > 0 ||
                  worker.skillUsageTelemetry?.unavailable === true,
              ),
            productionPromotionAcceptance: {
              status: "vlab-real-feishu-steer-regression-passed",
              report: "docs/steer91-repair.md",
              legacyAcceptanceIsNotInherited: true,
              verified: ["private-worker-steer-original-run", "single-user-transcript", "single-worker-attempt", "real-feishu-worker-steer", "real-feishu-codex-steer", "feishu-stop-and-next-reply"],
              blockers: [],
            },
            nativeHarnessStats: { ...nativeHarnessStats },
          },
        });
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "vlab.workers.start",
      async ({ params, respond }) => {
        try {
          respond(true, await startOperation(params));
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "vlab.workers.operation",
      async ({ params, respond }) => {
        try {
          const operationId = readString(params, "operationId", {
            required: true,
          });
          const operation = operationsById.get(operationId);
          if (!operation) {
            throw new Error(`unknown operationId: ${operationId}`);
          }
          respond(true, operationSnapshot(operation));
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "vlab.workers.cancel",
      async ({ params, respond }) => {
        try {
          const operationId = readString(params, "operationId", {
            required: true,
          });
          const operation = operationsById.get(operationId);
          if (!operation) {
            throw new Error(`unknown operationId: ${operationId}`);
          }
          if (
            operation.state !== "pending" &&
            operation.state !== "running" &&
            operation.state !== "cancelling"
          ) {
            respond(true, {
              cancelled: false,
              reason: "already_terminal",
              operation: operationSnapshot(operation),
            });
            return;
          }
          const cancellation = pool.cancel(operation.requestId);
          if (cancellation.cancelled) {
            operation.state = "cancelling";
            operation.updatedAt = Date.now();
          }
          respond(true, {
            ...cancellation,
            operation: operationSnapshot(operation),
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "vlab.workers.native.cancel",
      async ({ params, respond }) => {
        try {
          const runId = readString(params, "runId", { required: true });
          const nativeRequest = nativeRequestsByRunId.get(runId);
          if (!nativeRequest) {
            respond(true, {
              cancelled: false,
              state: "not_found",
              runId,
            });
            return;
          }
          respond(true, {
            ...pool.cancel(nativeRequest.requestId),
            runId,
            sessionKey: nativeRequest.sessionKey,
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "vlab.workers.kill",
      async ({ params, respond }) => {
        try {
          const slot = readNumber(params, "slot");
          if (!Number.isInteger(slot)) {
            throw new Error("slot must be an integer");
          }
          respond(true, pool.terminateWorker(slot));
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "vlab.workers.ping",
      async ({ params, respond }) => {
        try {
          const startedAt = performance.now();
          const sessionKey = requireLabSessionKey(params);
          const result = await pool.dispatch(sessionKey, { kind: "ping" });
          respond(true, {
            ...result,
            gatewayDispatchMs: performance.now() - startedAt,
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "vlab.workers.cpu",
      async ({ params, respond }) => {
        try {
          const startedAt = performance.now();
          const sessionKey = requireLabSessionKey(params);
          const durationMs = readNumber(params, "durationMs", 5_000);
          const result = await pool.dispatch(sessionKey, {
            kind: "cpu",
            durationMs,
          });
          respond(true, {
            ...result,
            gatewayDispatchMs: performance.now() - startedAt,
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "vlab.workers.hold",
      async ({ params, respond }) => {
        try {
          const startedAt = performance.now();
          const sessionKey = requireLabSessionKey(params);
          const durationMs = readNumber(params, "durationMs", 5_000);
          const resolvedRequestTimeoutMs = readNumber(
            params,
            "requestTimeoutMs",
            Math.max(requestTimeoutMs, durationMs + 60_000),
          );
          const result = await pool.dispatch(sessionKey, {
            kind: "hold",
            durationMs,
            requestTimeoutMs: resolvedRequestTimeoutMs,
          });
          respond(true, {
            ...result,
            gatewayDispatchMs: performance.now() - startedAt,
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "vlab.workers.agent",
      async ({ params, respond }) => {
        try {
          const startedAt = performance.now();
          const sessionKey = requireLabSessionKey(params);
          const message = readString(params, "message", { required: true });
          const agentId = readString(params, "agentId") ?? "makaron";
          const timeoutSeconds = readNumber(params, "timeoutSeconds", 300);
          const nativeSessionBefore = readNativeSession(agentId, sessionKey);
          const result = await pool.dispatch(sessionKey, {
            kind: "agent",
            message,
            agentId,
            timeoutSeconds,
            requestTimeoutMs: timeoutSeconds * 1_000,
            modelRun: params?.modelRun === true,
            toolsAllow: Array.isArray(params?.toolsAllow)
              ? params.toolsAllow.filter((item) => typeof item === "string")
              : undefined,
          });
          await reconcileNativeSessions(agentId, sessionKey, result);
          const nativeSessionAfter = readNativeSession(agentId, sessionKey);
          respond(true, {
            ...result,
            nativeSession: {
              before: nativeSessionBefore,
              after: nativeSessionAfter,
            },
            gatewayDispatchMs: performance.now() - startedAt,
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );
  },
};

export default plugin;
