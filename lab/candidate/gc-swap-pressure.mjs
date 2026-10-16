// Fix check for V 2026-10-16: under page-cache pressure inside one memory-limited cgroup (the
// Gateway's cgroup on V holds the Gateway, its Workers and the page cache of the 18.5 GB agent
// database they read), does the kernel push a long-lived Node heap to swap, and what do full GCs
// then cost? Run by gc-swap-pressure.sh per vm.swappiness value, with and without
// MemorySwapMax=0 (SWAPMAX=0). Whether the heap is swapped out under this pressure varies from
// run to run (MGLRU); gc-swapped-heap.sh is the deterministic check.
import fs from "node:fs";
const HEAP_MB = Number(process.env.HEAP_MB ?? 2000);
const DURATION_S = Number(process.env.DURATION_S ?? 180);
const GC_EVERY_S = Number(process.env.GC_EVERY_S ?? 15);
if (typeof global.gc !== "function") throw new Error("run with --expose-gc");
const status = () => {
  const s = fs.readFileSync("/proc/self/status", "utf8");
  const kb = (k) => Number(s.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"))?.[1] ?? 0);
  const stat = fs.readFileSync("/proc/self/stat", "utf8").split(") ")[1].split(" ");
  return { rssMb: Math.round(kb("VmRSS") / 1024), swapMb: Math.round(kb("VmSwap") / 1024), majflt: Number(stat[9]) };
};
const live = [];
let i = 0;
while (process.memoryUsage().heapUsed < HEAP_MB * 2 ** 20) {
  const block = [];
  for (let j = 0; j < 10_000; j++, i++) block.push({ type: "message", id: `e${i}`, parentId: `e${i - 1}`, timestamp: i,
    message: { role: i % 2 ? "assistant" : "user", content: [{ type: "text", text: `turn ${i} ` + "x".repeat(40 + (i % 200)) }] } });
  live.push(block);
}
fs.writeFileSync(process.env.READY_FILE, "1");
const gcs = [];
const started = Date.now();
while (Date.now() - started < DURATION_S * 1000) {
  // a little garbage, like a serving process between GCs; the live set stays cold
  for (let k = 0; k < 50; k++) { const tmp = new Array(10_000).fill(0).map((_, n) => ({ n })); if (tmp.length < 0) live.push(tmp); }
  await new Promise((resolve) => setTimeout(resolve, GC_EVERY_S * 1000));
  const b = status(); const c0 = process.cpuUsage(); const t0 = performance.now();
  global.gc();
  const wall = performance.now() - t0; const c = process.cpuUsage(c0); const a = status();
  gcs.push({ atS: Math.round((Date.now() - started) / 1000), gcMs: Math.round(wall), cpuCoreRatio: Math.round((c.user + c.system) / 1000 / wall * 100) / 100, majorFaults: a.majflt - b.majflt, swapBeforeMb: b.swapMb });
  console.log(JSON.stringify(gcs.at(-1)));
}
const ms = gcs.map((g) => g.gcMs);
console.log(JSON.stringify({ summary: true, swappiness: Number(fs.readFileSync("/proc/sys/vm/swappiness", "utf8")), gcs: gcs.length, maxGcMs: Math.max(...ms), medianGcMs: ms.sort((x, y) => x - y)[Math.floor(ms.length / 2)], maxSwapMb: Math.max(...gcs.map((g) => g.swapBeforeMb)), majorFaults: gcs.reduce((s, g) => s + g.majorFaults, 0), liveBlocks: live.length }));
