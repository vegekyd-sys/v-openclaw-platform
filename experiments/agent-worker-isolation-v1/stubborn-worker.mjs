process.on("SIGTERM", () => {
  // Intentionally stay alive so the pool's forced scale-in path is exercised.
});

process.on("message", async (message) => {
  if (!message?.id) {
    return;
  }
  const durationMs = Number(message.durationMs ?? 0);
  if (durationMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
  }
  process.send?.({
    type: "response",
    id: message.id,
    ok: true,
    result: {
      kind: message.kind,
    },
  });
});

setInterval(() => {}, 60_000);
process.send?.({ type: "ready", pid: process.pid });
