process.on("message", () => {
  // Deliberately ignore requests and cancellation without emitting progress.
  // The parent pool must detect this as worker-process liveness failure.
});

setInterval(() => {}, 60_000);
process.send?.({ type: "ready", pid: process.pid });
