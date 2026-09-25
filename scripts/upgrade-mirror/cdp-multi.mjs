// CPU-profile several node processes at once through their inspector ports
// (started with --inspect=127.0.0.1:0). No signals are sent.
//   node cdp-multi.mjs <seconds> <outDir> <pid>...
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const [secondsArg, outDir, ...pids] = process.argv.slice(2);
const seconds = Number(secondsArg);
const ss = execFileSync("ss", ["-ltnpH"], { encoding: "utf8" });
const portOf = (pid) => {
  for (const line of ss.split("\n")) if (line.includes(`pid=${pid},`)) {
    const m = line.match(/127\.0\.0\.1:(\d+)/); if (m) return Number(m[1]);
  }
  return undefined;
};
async function profile(pid) {
  const port = portOf(pid);
  if (!port) return { pid, error: "no inspector port" };
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((t) => t.webSocketDebuggerUrl);
  if (!target) return { pid, port, error: "no inspector target" };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 1000 }); await send("Profiler.start");
  const startedAt = Date.now();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const { profile } = await send("Profiler.stop");
  await send("Profiler.disable"); ws.close();
  const file = `${outDir}/pid-${pid}.cpuprofile`;
  fs.writeFileSync(file, JSON.stringify(profile));
  return { pid, port, file, startedAt, samples: profile.samples.length };
}
const results = await Promise.all(pids.map((p) => profile(p).catch((e) => ({ pid: p, error: String(e) }))));
console.log(JSON.stringify(results));
