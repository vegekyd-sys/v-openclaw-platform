// Mechanism check for V 2026-10-16: how long does a full V8 GC stop a process whose old
// generation is partly in swap?
//
// V's Gateway (heap 4.6-6.9 GB that afternoon, --max-old-space-size=12288) froze for 46-70 s at a
// time with almost no CPU (19:20: event loop max delay 57 s, cpuCoreRatio 0.247), while the host
// was swapping (vm.swappiness 50; 469 MB of the Gateway's heap was already in swap 1.5 h after
// its 10/16 23:32 restart). A full GC marks every live object, so every swapped-out page of the
// old generation has to be faulted back in, one page fault at a time.
//
// Run by gc-swapped-heap.sh: this process builds HEAP_MB of transcript-shaped live objects,
// measures a full GC with everything resident, writes READY, waits until the driver has pushed
// part of its memory to swap (cgroup v2 memory.reclaim) and written GO, then measures the same
// full GC again. Each measurement reports wall time, process CPU time, major page faults and
// VmSwap before/after.

import fs from "node:fs";

const HEAP_MB = Number(process.env.HEAP_MB ?? 2500);
const DIR = process.env.GC_DIR ?? "/tmp/cc-gcswap";
const ROUNDS = Number(process.env.ROUNDS ?? 2);
assert(typeof global.gc === "function", "run with --expose-gc");
function assert(ok, message) { if (!ok) throw new Error(message); }

const status = () => {
  const s = fs.readFileSync("/proc/self/status", "utf8");
  const kb = (k) => Number(s.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"))?.[1] ?? 0);
  const stat = fs.readFileSync("/proc/self/stat", "utf8").split(") ")[1].split(" ");
  return { rssMb: Math.round(kb("VmRSS") / 1024), swapMb: Math.round(kb("VmSwap") / 1024), majflt: Number(stat[9]) };
};
const measure = (label) => {
  const before = status();
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  global.gc();
  const wallMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const after = status();
  const r = {
    label, wallMs: Math.round(wallMs), cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    cpuCoreRatio: Math.round((cpu.user + cpu.system) / 1000 / wallMs * 1000) / 1000,
    majorFaults: after.majflt - before.majflt, swapBeforeMb: before.swapMb, swapAfterMb: after.swapMb,
    rssBeforeMb: before.rssMb, rssAfterMb: after.rssMb, heapUsedMb: Math.round(process.memoryUsage().heapUsed / 2 ** 20),
  };
  console.log(JSON.stringify(r));
  return r;
};

// transcript-event-shaped objects: many small objects and short strings, like parsed sessions
const live = [];
let i = 0;
while (process.memoryUsage().heapUsed < HEAP_MB * 2 ** 20) {
  const block = [];
  for (let j = 0; j < 10_000; j++, i++) {
    block.push({
      type: "message", id: `e${i}`, parentId: `e${i - 1}`, timestamp: 1792139877655 + i,
      message: { role: i % 2 ? "assistant" : "user", content: [{ type: "text", text: `turn ${i} ` + "x".repeat(40 + (i % 200)) }], usage: { input: i, output: i % 97 } },
    });
  }
  live.push(block);
}
console.log(JSON.stringify({ built: i, ...status(), heapUsedMb: Math.round(process.memoryUsage().heapUsed / 2 ** 20) }));
for (let r = 0; r < ROUNDS; r++) measure("resident");

fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(`${DIR}/READY`, String(process.pid));
while (!fs.existsSync(`${DIR}/GO`)) await new Promise((resolve) => setTimeout(resolve, 200));
console.log(JSON.stringify({ afterReclaim: status() }));
for (let r = 0; r < ROUNDS; r++) measure(r === 0 ? "partly-swapped" : "after-swap-in");
console.log(JSON.stringify({ liveBlocks: live.length }));
