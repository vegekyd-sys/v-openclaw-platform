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

// PROFILE_DIR: the runner drops start.<name> / stop.<name> files around a load level; the Gateway's
// main thread profiles itself in between and writes a compact summary (CPU self time, live heap).
const profileDir = process.env.LT_PROFILE_DIR;
if (profileDir && process.argv.some((a) => a === "gateway")) {
  const [{ Session }, fs, path] = await Promise.all([import("node:inspector"), import("node:fs"), import("node:path")]);
  const session = new Session();
  session.connect();
  const post = (method, params) => new Promise((resolve, reject) => session.post(method, params, (error, result) => (error ? reject(error) : resolve(result))));
  const short = (url) => path.basename(String(url ?? "")).replace(/\?.*$/u, "");
  const label = (cf) => `${cf.functionName || "(anon)"} ${short(cf.url)}:${cf.lineNumber}`;
  const seen = new Set();
  let current = null;
  await post("Profiler.enable");
  await post("HeapProfiler.enable");
  setInterval(async () => {
    let names;
    try { names = fs.readdirSync(profileDir); } catch { return; }
    if (!current) {
      const start = names.find((n) => n.startsWith("start.") && !seen.has(n));
      if (!start) return;
      seen.add(start);
      current = start.slice(6);
      await post("Profiler.setSamplingInterval", { interval: 1000 });
      await post("Profiler.start");
      await post("HeapProfiler.startSampling", { samplingInterval: 262144 });
      return;
    }
    if (!names.includes(`stop.${current}`)) return;
    const name = current;
    current = null;
    const { profile } = await post("Profiler.stop");
    const { profile: heap } = await post("HeapProfiler.stopSampling");
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map();
    const dts = profile.timeDeltas ?? [];
    profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dts[i] ?? 0)));
    const byFn = new Map(); const byFile = new Map();
    let total = 0;
    for (const [id, us] of self) {
      const cf = nodes.get(id).callFrame;
      total += us;
      byFn.set(label(cf), (byFn.get(label(cf)) ?? 0) + us);
      const file = cf.url ? short(cf.url) : cf.functionName;
      byFile.set(file, (byFile.get(file) ?? 0) + us);
    }
    const ms = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v / 1000)]);
    const live = new Map();
    const walk = (node) => { const sz = (node.selfSize ?? 0); if (sz) live.set(label(node.callFrame), (live.get(label(node.callFrame)) ?? 0) + sz); (node.children ?? []).forEach(walk); };
    walk(heap.head);
    const mb = [...live].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, Math.round(v / 1048576)]);
    fs.writeFileSync(path.join(profileDir, `summary.${name}.json`), JSON.stringify({ name, wallMs: Math.round(total / 1000), topFn: ms(byFn, 60), topFile: ms(byFile, 30), liveHeapMB: mb }));
  }, 300).unref();
}
