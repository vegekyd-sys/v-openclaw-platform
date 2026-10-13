const timers = new Map();

const heartbeat = setInterval(() => {
  for (const requestId of timers.keys()) {
    process.send?.({
      type: "progress",
      id: requestId,
      reason: "worker:active",
    });
  }
}, 25);
heartbeat.unref?.();

process.on("message", (message) => {
  if (message?.type === "cancel") {
    // This fixture deliberately ignores cancellation so the pool must
    // quarantine only this request while a sibling drains normally.
    return;
  }
  if (!message?.id) return;
  timers.set(message.id, true);
  process.send?.({
    type: "progress",
    id: message.id,
    reason: "worker:started",
  });
  if (message.nonCooperative === true) return;
  const timer = setTimeout(() => {
    timers.delete(message.id);
    process.send?.({
      type: "response",
      id: message.id,
      ok: true,
      result: { kind: message.kind, marker: message.marker },
    });
  }, Number(message.durationMs ?? 10));
  timer.unref?.();
});

process.send?.({ type: "ready", pid: process.pid });
