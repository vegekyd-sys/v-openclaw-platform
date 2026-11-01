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

// LT_AB_FILE: the runner writes "off" or "on" there; "off" sets each switch in LT_AB_ENVS to 0, "on" clears
// it. The code under test reads process.env per call, so one process compares both sides.
if (process.env.LT_AB_FILE) {
  const fs = await import("node:fs");
  const names = (process.env.LT_AB_ENVS ?? "").split(",").filter(Boolean);
  let current = null;
  setInterval(() => {
    let side;
    try { side = fs.readFileSync(process.env.LT_AB_FILE, "utf8").trim(); } catch { return; }
    if (side === current) return;
    current = side;
    for (const name of names) { if (side === "off") process.env[name] = "0"; else delete process.env[name]; }
  }, 200).unref();
}

// LT_PROFILE_DIR: the runner drops start.<name> / stop.<name> files around a level; the Gateway's main
// thread profiles itself in between and writes a compact summary.
const profileDir = process.env.LT_PROFILE_DIR;
if (profileDir && process.argv.includes("gateway")) {
  const [{ Session }, fs, path] = await Promise.all([import("node:inspector"), import("node:fs"), import("node:path")]);
  const session = new Session();
  session.connect();
  const post = (method, params) => new Promise((resolve, reject) => session.post(method, params, (error, result) => (error ? reject(error) : resolve(result))));
  const short = (url) => path.basename(String(url ?? "")).replace(/\?.*$/u, "");
  const label = (cf) => `${cf.functionName || "(anon)"} ${short(cf.url)}:${cf.lineNumber}`;
  const seen = new Set();
  let current = null;
  await post("Profiler.enable");
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
      return;
    }
    if (!names.includes(`stop.${current}`)) return;
    const name = current;
    current = null;
    const { profile } = await post("Profiler.stop");
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
    const selfUs = new Map();
    const dts = profile.timeDeltas ?? [];
    profile.samples.forEach((id, i) => selfUs.set(id, (selfUs.get(id) ?? 0) + (dts[i] ?? 0)));
    const self = new Map();
    const inclusive = new Map();
    let total = 0;
    const walk = (id, stack) => {
      const node = nodes.get(id);
      const key = label(node.callFrame);
      const us = selfUs.get(id) ?? 0;
      total += us;
      self.set(key, (self.get(key) ?? 0) + us);
      const added = !stack.has(key);
      if (added) stack.add(key);
      let sum = us;
      for (const child of node.children ?? []) sum += walk(child, stack);
      if (added) { stack.delete(key); inclusive.set(key, (inclusive.get(key) ?? 0) + sum); }
      return sum;
    };
    walk(profile.nodes[0].id, new Set());
    const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v / 1000)]);
    fs.writeFileSync(path.join(profileDir, `summary.${name}.json`), JSON.stringify({ name, wallMs: Math.round(total / 1000), self: top(self, 60), inclusive: top(inclusive, 90) }));
  }, 300).unref();
}
