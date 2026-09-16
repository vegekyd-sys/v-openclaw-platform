// A Worker that genuinely grows, so the recycle decision can be proven
// against real process.memoryUsage() values rather than scripted ones.
const growBytes = Number(process.env.VLAB_FAKE_WORKER_GROW_BYTES ?? 0);
const reportMs = Number(process.env.VLAB_FAKE_WORKER_MEMORY_REPORT_MS ?? 50);
const retained = [];

function memoryReport() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

process.send?.({ type: "ready", pid: process.pid, memory: memoryReport() });

const timer = setInterval(() => {
  process.send?.({ type: "memory-report", memory: memoryReport() });
}, reportMs);
timer.unref?.();

process.on("message", async (message) => {
  if (!message?.id) return;
  if (growBytes > 0) {
    // Touch every page so the allocation is resident, not just reserved.
    const block = Buffer.allocUnsafe(growBytes);
    block.fill(1);
    retained.push(block);
  }
  const durationMs = Number(message.durationMs ?? 0);
  if (durationMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
  }
  process.send?.({
    type: "response",
    id: message.id,
    ok: true,
    result: { workerPid: process.pid, retainedBlocks: retained.length },
  });
});
