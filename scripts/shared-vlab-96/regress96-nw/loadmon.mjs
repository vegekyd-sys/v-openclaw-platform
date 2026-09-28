// Server-side monitor for one Feishu load level on the shared VLab Gateway (run as root):
//   node loadmon.mjs <label> <seconds> <outDir>
// Main-thread event-loop delay (perf_hooks.monitorEventLoopDelay via the inspector, reset at start),
// Gateway process CPU and host CPU every 1 s, RSS, and journal counters over the window.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const [label, secsArg, outDir] = process.argv.slice(2);
const secs = Number(secsArg);
const UNIT = process.env.VERSA_UNIT_NAME ?? "openclaw-vlab-production-mirror-v8";
const HZ = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim());
const run = (c, a, t = 60_000) => execFileSync(c, a, { encoding: "utf8", timeout: t, maxBuffer: 256 << 20 }).trim();
const pid = Number(run("systemctl", ["show", UNIT, "-p", "MainPID", "--value"]));
const ports = run("ss", ["-ltnpH"]).split("\n").filter((l) => l.includes(`pid=${pid},`)).map((l) => l.match(/127\.0\.0\.1:(\d+)/)?.[1]).filter(Boolean);
let target;
for (const port of ports) { try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json(); if (list?.[0]?.webSocketDebuggerUrl) { target = list[0]; break; } } catch {} }
if (!target) throw new Error("no inspector");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result); } };
const evaluate = (expression) => new Promise((res) => { const i = ++id; pending.set(i, (r) => res(r?.result?.value ?? null)); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true } })); });
const START = `(() => { const ph = process.getBuiltinModule("node:perf_hooks"); if (globalThis.__vLoadEld) globalThis.__vLoadEld.disable();
  globalThis.__vLoadEld = ph.monitorEventLoopDelay({ resolution: 10 }); globalThis.__vLoadEld.enable(); globalThis.__vLoadT0 = performance.now(); return true; })()`;
const READ = `(() => { const h = globalThis.__vLoadEld; h.disable(); const ms = (v) => Math.round(v / 1e4) / 100;
  return { p50: ms(h.percentile(50)), p95: ms(h.percentile(95)), p99: ms(h.percentile(99)), max: ms(h.max), mean: ms(h.mean), count: h.count, wallS: Math.round((performance.now() - globalThis.__vLoadT0) / 1000) }; })()`;
const gwTicks = () => { const f = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" "); return Number(f[11]) + Number(f[12]); };
const mainTicks = () => { const f = fs.readFileSync(`/proc/${pid}/task/${pid}/stat`, "utf8").split(") ")[1].split(" "); return Number(f[11]) + Number(f[12]); };
const host = () => { const f = fs.readFileSync("/proc/stat", "utf8").split("\n")[0].split(/\s+/).slice(1).map(Number); const idle = f[3] + f[4]; const total = f.slice(0, 8).reduce((a, b) => a + b, 0); return { busy: total - idle, total }; };
const rss = () => Math.round(Number(fs.readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1]) * 4096 / 1048576);
const ncpu = Number(run("nproc", []));
const t0 = Date.now(); const startIso = new Date(t0).toISOString();
await evaluate(START);
const samples = []; let prev = { t: performance.now(), gw: gwTicks(), main: mainTicks(), host: host() };
const rssSeries = [rss()];
while (Date.now() - t0 < secs * 1000) {
  await new Promise((r) => setTimeout(r, 1000));
  const cur = { t: performance.now(), gw: gwTicks(), main: mainTicks(), host: host() };
  const dt = (cur.t - prev.t) / 1000;
  samples.push({ gwPct: ((cur.gw - prev.gw) / HZ / dt) * 100, mainPct: ((cur.main - prev.main) / HZ / dt) * 100,
    hostPct: ((cur.host.busy - prev.host.busy) / (cur.host.total - prev.host.total)) * 100 });
  prev = cur;
  if (samples.length % 10 === 0) rssSeries.push(rss());
  if (fs.existsSync(`${outDir}/stop-${label}`)) break;
}
const eld = await evaluate(READ);
const avg = (k) => Math.round(samples.reduce((a, s) => a + s[k], 0) / samples.length * 10) / 10;
const peak = (k) => Math.round(Math.max(...samples.map((s) => s[k])) * 10) / 10;
const since = startIso.replace("T", " ").slice(0, 19);
const j = run("journalctl", ["-u", UNIT, "--since", `${since} UTC`, "--no-pager", "-o", "cat"], 120_000);
const count = (s) => j.split(s).length - 1;
const out = { label, pid, startIso, endIso: new Date().toISOString(), seconds: samples.length, ncpu,
  cpu: { gatewayAvgPct: avg("gwPct"), gatewayPeakPct: peak("gwPct"), mainThreadAvgPct: avg("mainPct"), mainThreadPeakPct: peak("mainPct"), hostAvgPct: avg("hostPct"), hostPeakPct: peak("hostPct") },
  eventLoopDelayMs: eld, rssMB: { first: rssSeries[0], last: rssSeries.at(-1), max: Math.max(...rssSeries) },
  journal: { livenessWarning: count("liveness warning"), livenessDelayed: count("liveness heartbeat delayed"), unhandled: count("Unhandled promise rejection"),
    slowDbOpen: count("slow OpenClaw agent database open"), budgetExhausted: count("V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED"), dbLocked: count("database is locked"),
    feishuReceived: count("received message from"), dispatchComplete: count("dispatch complete"), errorsIsError: count("isError=true"), authorityClosed: count("Gateway client authority closed") } };
fs.writeFileSync(`${outDir}/loadmon-${label}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
ws.close(); process.exit(0);
