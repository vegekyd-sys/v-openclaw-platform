process.on("SIGTERM", () => {
  // Intentionally stay alive so the pool's forced scale-in path is exercised.
});

process.on("message", (message) => {
  if (!message?.id) {
    return;
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
