// One measured load step on the mirror Gateway (run as root):
//   node eldstep.mjs <label> <count> <outDir>
// - Gateway main-thread event-loop delay via CDP Runtime.evaluate
//   (perf_hooks.monitorEventLoopDelay, resolution 10 ms), reset per step.
// - CPU every 1 s: Gateway PID (/proc/<pid>/stat), whole instance cgroup
//   (cpu.stat usage_usec, includes exited children), host busy (/proc/stat).
// - Runs bench96.mjs <count> as versa-rehearsal, counts liveness lines.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";

const [label, countArg, outDir] = process.argv.slice(2);
const count = Number(countArg);
if (!/^[a-z0-9-]+$/.test(label ?? "") || !(count >= 0 && count <= 15) || !fs.existsSync(outDir)) throw new Error("usage");
const R = "/srv/versa-mirror95", UNIT = "versa-mirror95-gateway", NODE = `${R}/runtime/node-v24.17.0-linux-x64/bin/node`;
const HZ = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim());
const run = (c, a) => execFileSync(c, a, { encoding: "utf8", timeout: 15_000 }).trim();
const pid = Number(run("systemctl", ["show", UNIT, "-p", "MainPID", "--value"]));
if (!(pid > 1)) throw new Error("gateway not running");
const cg = `/sys/fs/cgroup${run("systemctl", ["show", UNIT, "-p", "ControlGroup", "--value"])}`;

// ---- CDP to the Gateway main thread
const ss = run("ss", ["-ltnpH"]);
const ports = ss.split("\n").filter((l) => l.includes(`pid=${pid},`)).map((l) => l.match(/127\.0\.0\.1:(\d+)/)?.[1]).filter(Boolean);
let target;
for (const port of ports) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
    if (Array.isArray(list) && list[0]?.webSocketDebuggerUrl) { target = list[0]; break; }
  } catch {}
}
if (!target) throw new Error(`no inspector port for gateway ${pid}`);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const evaluate = async (expression) => {
  const i = ++id;
  const res = await new Promise((res, rej) => { pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true } })); });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 400));
  return res.result.value;
};
const START = `(() => { const ph = process.getBuiltinModule("node:perf_hooks");
  if (globalThis.__versaEld) globalThis.__versaEld.disable();
  if (globalThis.__versaLag) globalThis.__versaLag.stop = true;
  globalThis.__versaEld = ph.monitorEventLoopDelay({ resolution: 10 }); globalThis.__versaEld.reset(); globalThis.__versaEld.enable();
  const j = globalThis.__versaLag = { h: ph.createHistogram(), stop: false, t0: performance.now() };
  let exp = performance.now() + 10;
  const tick = () => { const now = performance.now(); j.h.record(Math.max(1, Math.round((now - exp) * 1e6))); if (!j.stop) { exp = performance.now() + 10; setTimeout(tick, 10).unref(); } };
  setTimeout(tick, 10).unref(); globalThis.__versaT0 = performance.now(); return process.pid; })()`;
const READ = `(() => { const h = globalThis.__versaEld; h.disable(); const j = globalThis.__versaLag; j.stop = true; const ms = (v) => Math.round(v / 1e4) / 100;
  const wall = performance.now() - globalThis.__versaT0;
  const out = { p50: ms(h.percentile(50)), p95: ms(h.percentile(95)), p99: ms(h.percentile(99)), max: ms(h.max), mean: ms(h.mean), min: ms(h.min), count: h.count,
    coverage: Math.round(1000 * h.count * h.mean / 1e6 / wall) / 1000,
    lag: { p50: ms(j.h.percentile(50)), p95: ms(j.h.percentile(95)), p99: ms(j.h.percentile(99)), max: ms(j.h.max), mean: ms(j.h.mean), count: j.h.count } };
  h.reset(); return out; })()`;

// ---- CPU sampling
const gwTicks = () => { try { const f = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" "); return Number(f[11]) + Number(f[12]); } catch { return NaN; } };
const cgUsec = () => Number(/usage_usec (\d+)/.exec(fs.readFileSync(`${cg}/cpu.stat`, "utf8"))[1]);
const hostBusy = () => { const f = fs.readFileSync("/proc/stat", "utf8").split("\n")[0].split(/\s+/).slice(1).map(Number); const idle = f[3] + f[4]; const total = f.slice(0, 8).reduce((a, b) => a + b, 0); return { busy: total - idle, total }; };
const mainTicks = () => { try { const f = fs.readFileSync(`/proc/${pid}/task/${pid}/stat`, "utf8").split(") ")[1].split(" "); return Number(f[11]) + Number(f[12]); } catch { return NaN; } };
const threadsByName = () => { const out = {}; for (const tid of fs.readdirSync(`/proc/${pid}/task`)) { try { const raw = fs.readFileSync(`/proc/${pid}/task/${tid}/stat`, "utf8"); const name = Number(tid) === pid ? "MAIN" : raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")")); const f = raw.slice(raw.lastIndexOf(") ") + 2).split(" "); out[`${name}|${tid}`] = Number(f[11]) + Number(f[12]); } catch {} } return out; };
const snap = () => ({ t: performance.now(), gw: gwTicks(), main: mainTicks(), cg: cgUsec(), host: hostBusy() });
const threads0 = threadsByName();
const samples = [snap()];
const timer = setInterval(() => samples.push(snap()), 1000);
const loadBefore = fs.readFileSync("/proc/loadavg", "utf8").trim();
const startEpoch = Math.floor(Date.now() / 1000);

const eldPid = await evaluate(START);
const bench = count === 0 ? await new Promise((r) => setTimeout(() => r({ code: 0, brief: null }), 60_000)) : await new Promise((resolve) => {
  const child = spawn("runuser", ["--preserve-environment", "-u", "versa-rehearsal", "--", NODE, `${R}/scripts/bench96.mjs`, "mirror", String(count), label, `${R}/evidence/bench`],
    { cwd: "/tmp", env: { ...process.env, VERSA_UNIT: `${UNIT}.service` }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; let err = "";
  child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { err += d; });
  child.on("close", (code) => { const last = out.trim().split("\n").at(-1); let j = null; try { j = JSON.parse(last); } catch {} resolve({ code, brief: j, stderrTail: err.slice(-600) }); });
});
const eld = await evaluate(READ);
clearInterval(timer); samples.push(snap());
const threads1 = threadsByName();
const threadCpu = {}; for (const [k, v] of Object.entries(threads1)) { const name = k.split("|")[0]; threadCpu[name] = (threadCpu[name] ?? 0) + (v - (threads0[k] ?? 0)) / HZ; }
ws.close();
const loadAfter = fs.readFileSync("/proc/loadavg", "utf8").trim();
const journal = execFileSync("journalctl", ["-u", UNIT, "--no-pager", "--since", `@${startEpoch}`], { encoding: "utf8", maxBuffer: 64 << 20 });
const liveness = { warning: (journal.match(/liveness warning/g) ?? []).length, heartbeatDelayed: (journal.match(/liveness heartbeat delayed/g) ?? []).length };

const a = samples[0], z = samples.at(-1), wall = (z.t - a.t) / 1000;
const per = [];
for (let i = 1; i < samples.length; i++) {
  const p = samples[i - 1], c = samples[i], dt = (c.t - p.t) / 1000;
  per.push({ main: (c.main - p.main) / HZ / dt, gw: (c.gw - p.gw) / HZ / dt, inst: (c.cg - p.cg) / 1e6 / dt, host: 4 * (c.host.busy - p.host.busy) / (c.host.total - p.host.total) });
}
const peakWin = (key, w) => { let best = 0; for (let i = 0; i + w <= per.length; i++) { const s = per.slice(i, i + w).reduce((x, y) => x + y[key], 0) / w; best = Math.max(best, s); } return Math.round(best * 100) / 100; };
const r2 = (v) => Math.round(v * 100) / 100;
const cpu = {
  wallS: r2(wall),
  mainThreadAvg: r2((z.main - a.main) / HZ / wall), mainThreadPeak5s: peakWin("main", 5),
  gatewayAvg: r2((z.gw - a.gw) / HZ / wall), gatewayPeak1s: peakWin("gw", 1), gatewayPeak5s: peakWin("gw", 5),
  instanceAvg: r2((z.cg - a.cg) / 1e6 / wall), instancePeak1s: peakWin("inst", 1), instancePeak5s: peakWin("inst", 5),
  hostAvg: r2(4 * (z.host.busy - a.host.busy) / (z.host.total - a.host.total)), hostPeak5s: peakWin("host", 5),
};
cpu.otherHostAvg = r2(cpu.hostAvg - cpu.instanceAvg);
cpu.gatewayThreadsCores = Object.fromEntries(Object.entries(threadCpu).map(([k, v]) => [k, r2(v / wall)]).filter(([, v]) => v >= 0.01).sort((x, y) => y[1] - x[1]));
const b = bench.brief ?? {};
const q = (vals, p) => { const v = vals.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)] : null; };
let lat = null;
try { const full = JSON.parse(fs.readFileSync(b.output, "utf8")); const f = full.rows.map((r) => r.firstTextMs), t = full.rows.map((r) => r.totalMs);
  lat = { firstP50: q(f, 50), firstP95: q(f, 95), totalP50: q(t, 50), totalP95: q(t, 95), n: full.rows.length,
    bodyVerified: full.rows.filter((r) => r.bodyVerified).length, persisted: full.rows.filter((r) => r.persisted).length,
    errorMessages: full.rows.filter((r) => r.errorMessage).map((r) => r.errorMessage.slice(0, 160)) }; } catch {}
const result = { label, count, pid, eldPid, at: new Date(startEpoch * 1000).toISOString(), loadBefore, loadAfter, eld, cpu, liveness,
  lat, bench: { code: bench.code, output: b.output, completed: b.completed, finals: b.finals, errors: b.errors, unfinished: b.unfinished,
    firstTextMs: b.firstTextMs, totalMs: b.totalMs, healthEventLoop: b.eventLoop, workerRpc: b.workerRpc, peakWorkers: b.peakWorkers, peakActive: b.peakActive, failure: b.failure?.slice?.(0, 300) },
  stderrTail: bench.code ? bench.stderrTail : undefined };
fs.writeFileSync(`${outDir}/step-${label}.json`, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ label, eld, cpu: { main: [cpu.mainThreadAvg, cpu.mainThreadPeak5s], gw: [cpu.gatewayAvg, cpu.gatewayPeak5s], thr: cpu.gatewayThreadsCores, inst: [cpu.instanceAvg, cpu.instancePeak5s], host: cpu.hostAvg, other: cpu.otherHostAvg }, liveness,
  finals: b.finals, errors: b.errors, lat: lat && [lat.firstP50, lat.firstP95, lat.totalP50, lat.totalP95, lat.bodyVerified, lat.persisted], load: loadBefore.split(" ").slice(0, 3).join(" ") }));
