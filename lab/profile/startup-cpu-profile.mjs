// CPU profile of a Gateway start through its own inspector (the unit runs with
// --inspect=127.0.0.1:PORT). Restarts the unit, attaches as soon as the port answers, samples
// at 1 ms until "[gateway] ready" + TAIL seconds, writes the profile and the journal marks.
// Runs on the Gateway host as root:  node startup-cpu-profile.mjs UNIT OUT_DIR [PORT] [TAIL_S]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const [unit, outDir, port = "9229", tailS = "25"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
execFileSync("systemctl", ["restart", unit]);
let list;
while (!list) {
  try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(20); }
  if (Date.now() - t0 > 60_000) throw new Error("inspector never answered");
}
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
await new Promise((r) => (ws.onopen = r));
await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 1000 });
const startedWall = Date.now();
await send("Profiler.start");
const since = `@${Math.floor(t0 / 1000) - 1}`;
const ready = () => execFileSync("journalctl", ["-u", unit, "--since", since, "-o", "cat", "--no-pager"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).includes("[gateway] ready");
const deadline = Date.now() + 900_000;
while (!ready() && Date.now() < deadline) await sleep(500);
await sleep(Number(tailS) * 1000);
const { profile } = await send("Profiler.stop");
const stoppedWall = Date.now();
ws.close();
fs.writeFileSync(`${outDir}/gateway.cpuprofile`, JSON.stringify(profile));
const marks = execFileSync("journalctl", ["-u", unit, "--since", since, "-o", "short-unix", "--no-pager"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
fs.writeFileSync(`${outDir}/journal.txt`, marks);
fs.writeFileSync(`${outDir}/meta.json`, JSON.stringify({ t0, startedWall, stoppedWall, attachMs: startedWall - t0 }));
console.log(JSON.stringify({ attachMs: startedWall - t0, profileSeconds: (stoppedWall - startedWall) / 1000, samples: profile.samples.length }));
