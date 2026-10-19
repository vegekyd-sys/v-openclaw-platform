// Preloaded into the private Gateway (node --import) by runtime-concurrency.mjs.
// Once a second it prints how late this tick fired (a main-thread stall shows up as a late tick),
// the event-loop delay histogram max, and the process CPU spent in that window, so a stall can be
// told apart as CPU-bound (cpuMs ~ gapMs) or blocked/waiting (cpuMs << gapMs).
// Children forked with the parent's execArgv load it too; lines carry the pid so the runner keeps
// only the Gateway's.
import { monitorEventLoopDelay, performance } from "node:perf_hooks";

const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();
let lastAt = performance.now();
let lastCpu = process.cpuUsage();
let lastElu = performance.eventLoopUtilization();
setInterval(() => {
  const now = performance.now();
  const cpu = process.cpuUsage(lastCpu);
  const elu = performance.eventLoopUtilization(lastElu);
  const mem = process.memoryUsage();
  process.stderr.write(`[lt-lag] ${JSON.stringify({
    pid: process.pid,
    at: Date.now(),
    windowMs: Math.round(now - lastAt),
    gapMs: Math.max(0, Math.round(now - lastAt - 1000)),
    maxDelayMs: Math.round(histogram.max / 1e6),
    cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    elu: Math.round(elu.utilization * 1000) / 1000,
    rssMB: Math.round(mem.rss / 1048576),
    heapMB: Math.round(mem.heapUsed / 1048576),
  })}\n`);
  histogram.reset();
  lastAt = now;
  lastCpu = process.cpuUsage();
  lastElu = performance.eventLoopUtilization();
}, 1000).unref();
