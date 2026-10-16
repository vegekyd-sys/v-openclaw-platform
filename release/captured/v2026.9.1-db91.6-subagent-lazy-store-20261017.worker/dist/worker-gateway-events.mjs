export const WORKER_GATEWAY_EVENT_CONTRACT_VERSION =
  "versa-worker-gateway-events-v1";
export const WORKER_GATEWAY_EVENT_BRIDGE_SYMBOL = Symbol.for(
  "versa.vlab-worker.gateway-event-bridge-v1",
);

const SUPPORTED_EVENT_KINDS = new Set([
  "detached_task_started",
  "media_generation_completion",
  "detached_task_settled",
  "skill_usage",
]);

export function normalizeWorkerGatewayEvent(event) {
  if (!event || typeof event !== "object") {
    throw new Error("Worker Gateway event must be an object");
  }
  if (event.contractVersion !== WORKER_GATEWAY_EVENT_CONTRACT_VERSION) {
    throw new Error(
      `unsupported Worker Gateway event contract: ${String(event.contractVersion)}`,
    );
  }
  if (!SUPPORTED_EVENT_KINDS.has(event.eventKind)) {
    throw new Error(`unsupported Worker Gateway event kind: ${String(event.eventKind)}`);
  }
  if (typeof event.eventId !== "string" || !event.eventId.trim()) {
    throw new Error("Worker Gateway eventId is required");
  }
  if (typeof event.taskKey !== "string" || !event.taskKey.trim()) {
    throw new Error("Worker Gateway taskKey is required");
  }
  return {
    ...event,
    eventId: event.eventId.trim(),
    taskKey: event.taskKey.trim(),
  };
}

export function buildMediaCompletionDelivery(event) {
  const normalized = normalizeWorkerGatewayEvent(event);
  if (normalized.eventKind !== "media_generation_completion") {
    throw new Error("event is not a media generation completion");
  }
  const delivery = normalized.delivery;
  if (!delivery || typeof delivery !== "object") {
    throw new Error("media completion delivery payload is required");
  }
  for (const field of [
    "requesterSessionKey",
    "targetRequesterSessionKey",
    "announceId",
    "triggerMessage",
    "steerMessage",
    "sourceSessionKey",
    "sourceTool",
  ]) {
    if (typeof delivery[field] !== "string" || !delivery[field].trim()) {
      throw new Error(`media completion delivery.${field} is required`);
    }
  }
  if (!Array.isArray(delivery.internalEvents)) {
    throw new Error("media completion delivery.internalEvents must be an array");
  }
  // 9.2 derives the internal source at the native destination; older hosts
  // provide sourceChannel. Preserve either shape, never invent an identity.
  for (const field of ["sourceChannel", "requesterAgentId"]) {
    if (delivery[field] !== undefined &&
      (typeof delivery[field] !== "string" || !delivery[field].trim())) {
      throw new Error(`media completion delivery.${field} must be a nonempty string`);
    }
  }
  return {
    requesterSessionKey: delivery.requesterSessionKey,
    ...(delivery.requesterAgentId === undefined ? {} : {requesterAgentId: delivery.requesterAgentId}),
    targetRequesterSessionKey: delivery.targetRequesterSessionKey,
    announceId: delivery.announceId,
    triggerMessage: delivery.triggerMessage,
    steerMessage: delivery.steerMessage,
    internalEvents: delivery.internalEvents,
    summaryLine: delivery.summaryLine,
    requesterSessionOrigin: delivery.requesterSessionOrigin,
    requesterOrigin: delivery.requesterOrigin,
    completionDirectOrigin: delivery.completionDirectOrigin,
    directOrigin: delivery.directOrigin,
    sourceSessionKey: delivery.sourceSessionKey,
    ...(delivery.sourceChannel === undefined ? {} : {sourceChannel: delivery.sourceChannel}),
    sourceTool: delivery.sourceTool,
    requesterIsSubagent: delivery.requesterIsSubagent === true,
    expectsCompletionMessage: delivery.expectsCompletionMessage === true,
    bestEffortDeliver: delivery.bestEffortDeliver === true,
    directIdempotencyKey: delivery.directIdempotencyKey,
  };
}

export function buildSkillUsageRecord(event) {
  const normalized = normalizeWorkerGatewayEvent(event);
  if (normalized.eventKind !== "skill_usage") {
    throw new Error("event is not a skill usage event");
  }
  const usage = normalized.usage;
  if (!usage || typeof usage !== "object") {
    throw new Error("skill usage payload is required");
  }
  for (const field of [
    "runId",
    "sessionKey",
    "skillName",
    "skillSource",
    "skillFile",
    "activation",
    "toolName",
  ]) {
    if (typeof usage[field] !== "string" || !usage[field].trim()) {
      throw new Error(`skill usage.${field} is required`);
    }
  }
  if (!usage.skillFile.startsWith("/")) {
    throw new Error("skill usage.skillFile must be absolute");
  }
  return {
    runId: usage.runId,
    sessionKey: usage.sessionKey,
    sessionId: usage.sessionId,
    agentId: usage.agentId,
    skillName: usage.skillName,
    skillSource: usage.skillSource,
    skillFile: usage.skillFile,
    activation: usage.activation,
    toolName: usage.toolName,
    toolCallId: usage.toolCallId,
  };
}

export function createWorkerGatewayEventRouter(options) {
  const completed = new Map();
  const inFlight = new Map();
  const maxRemembered = Number(options.maxRemembered ?? 10_000);
  const stats = options.stats ?? {};
  for (const key of [
    "received",
    "duplicates",
    "delivered",
    "terminal",
    "failed",
  ]) {
    stats[key] = Number(stats[key] ?? 0);
  }
  const skillUsageStats = options.skillUsageStats ?? {};
  for (const key of ["received", "duplicates", "recorded", "failed"]) {
    skillUsageStats[key] = Number(skillUsageStats[key] ?? 0);
  }

  return async function routeWorkerGatewayEvent(rawEvent) {
    const event = normalizeWorkerGatewayEvent(rawEvent);
    if (
      event.eventKind !== "media_generation_completion" &&
      event.eventKind !== "skill_usage"
    ) {
      return { handled: true, lifecycle: event.eventKind };
    }
    const isSkillUsage = event.eventKind === "skill_usage";
    const eventStats = isSkillUsage ? skillUsageStats : stats;
    eventStats.received += 1;
    if (completed.has(event.eventId)) {
      eventStats.duplicates += 1;
      return completed.get(event.eventId);
    }
    if (inFlight.has(event.eventId)) {
      eventStats.duplicates += 1;
      return await inFlight.get(event.eventId);
    }
    const operation = (async () => {
      try {
        if (isSkillUsage) {
          if (typeof options.recordSkillUsage !== "function") {
            throw new Error("Gateway skill usage recorder is unavailable");
          }
          await options.recordSkillUsage(buildSkillUsageRecord(event));
          const result = { handled: true, recorded: true };
          skillUsageStats.recorded += 1;
          while (completed.size >= maxRemembered) {
            completed.delete(completed.keys().next().value);
          }
          completed.set(event.eventId, result);
          return result;
        }
        const delivery = await options.deliverMediaCompletion(
          buildMediaCompletionDelivery(event),
        );
        const result = {
          handled: true,
          delivered: delivery?.delivered === true,
          terminal: delivery?.terminal === true,
          path: delivery?.path,
          reason: delivery?.reason,
          ...(delivery?.disposition === undefined ? {} : {disposition: delivery.disposition}),
          ...(delivery?.error === undefined ? {} : {error: delivery.error}),
        };
        if (result.delivered) stats.delivered += 1;
        if (result.terminal) stats.terminal += 1;
        // Pending handoffs must be retried with the SAME native idempotency
        // key. Caching them as completed would freeze 9.2's retry loop forever.
        if (result.delivered || result.terminal || result.disposition === "ambiguous") {
          while (completed.size >= maxRemembered) {
            completed.delete(completed.keys().next().value);
          }
          completed.set(event.eventId, result);
        }
        return result;
      } catch (error) {
        eventStats.failed += 1;
        throw error;
      } finally {
        inFlight.delete(event.eventId);
      }
    })();
    inFlight.set(event.eventId, operation);
    return await operation;
  };
}
