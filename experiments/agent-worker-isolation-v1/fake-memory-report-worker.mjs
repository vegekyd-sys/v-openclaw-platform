// A Worker whose reported footprint is scripted, so the pool's recycle
// decision can be exercised without allocating gigabytes in a test.
const readyDelayMs = Number(process.env.VLAB_FAKE_WORKER_READY_DELAY_MS ?? 0);
const reportMs = Number(process.env.VLAB_FAKE_WORKER_MEMORY_REPORT_MS ?? 20);
// Slot 0 is the first Worker the pool starts, so scripting "the first Worker
// is the fat one" only needs the first process to report the large value.
const rssBytes = Number(
  process.env[`VLAB_FAKE_WORKER_RSS_${process.env.VLAB_FAKE_WORKER_INDEX ?? ""}`] ??
    process.env.VLAB_FAKE_WORKER_RSS ??
    1024,
);

await new Promise((resolve) => setTimeout(resolve, readyDelayMs));
process.send?.({
  type: "ready",
  pid: process.pid,
  memory: { rss: rssBytes, heapUsed: rssBytes, heapTotal: rssBytes },
});

const timer = setInterval(() => {
  process.send?.({
    type: "memory-report",
    memory: { rss: rssBytes, heapUsed: rssBytes, heapTotal: rssBytes },
  });
}, reportMs);
timer.unref?.();

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
    result: { workerPid: process.pid },
  });
});
