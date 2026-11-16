import {
  WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
} from "./worker-gateway-events.mjs";

const pendingAcks = new Map();

function sendEvent(event) {
  return new Promise((resolve, reject) => {
    pendingAcks.set(event.eventId, { resolve, reject });
    process.send?.({ type: "worker-gateway-event", event });
  });
}

process.on("message", async (message) => {
  if (message?.type === "worker-gateway-event-ack") {
    const pending = pendingAcks.get(message.eventId);
    if (!pending) return;
    pendingAcks.delete(message.eventId);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error?.message ?? "event failed"));
    return;
  }
  if (!message?.id) return;
  if (message.kind === "hold") {
    setTimeout(() => {
      process.send?.({ type: "response", id: message.id, ok: true, result: {} });
    }, Number(message.durationMs ?? 100));
    return;
  }
  if (message.kind !== "detached") return;
  const taskKey = `media:${message.taskId}`;
  await sendEvent({
    contractVersion: WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
    eventKind: "detached_task_started",
    eventId: `${taskKey}:started`,
    taskKey,
  });
  process.send?.({ type: "response", id: message.id, ok: true, result: {} });
  setTimeout(async () => {
    await sendEvent({
      contractVersion: WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
      eventKind: "media_generation_completion",
      eventId: `${taskKey}:completion`,
      taskKey,
      delivery: {
        requesterSessionKey: "agent:makaron:explicit:parent",
        targetRequesterSessionKey: "agent:makaron:explicit:parent",
        announceId: `${taskKey}:ok`,
        triggerMessage: "done",
        steerMessage: "done",
        internalEvents: [],
        sourceSessionKey: taskKey,
        sourceChannel: "internal",
        sourceTool: "image_generate",
      },
    });
    await sendEvent({
      contractVersion: WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
      eventKind: "detached_task_settled",
      eventId: `${taskKey}:settled`,
      taskKey,
    });
  }, Number(message.detachedDurationMs ?? 250));
});

process.send?.({ type: "ready", pid: process.pid });
