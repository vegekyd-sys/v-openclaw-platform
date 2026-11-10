const delayMs = Number(process.env.VLAB_FAKE_WORKER_READY_DELAY_MS ?? 0);

await new Promise((resolve) => setTimeout(resolve, delayMs));
process.send?.({ type: "ready", pid: process.pid });

process.on("message", async (message) => {
  if (!message?.id) return;
  const durationMs = Number(message.durationMs ?? 0);
  if (durationMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
  }
  process.send?.({
    type: "response",
    id: message.id,
    ok: true,
    result: { workerPid: process.pid, slot: process.env.VLAB_WORKER_SLOT },
  });
});
