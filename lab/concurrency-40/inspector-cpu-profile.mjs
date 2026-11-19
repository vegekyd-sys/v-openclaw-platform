// One main-thread CPU profile of a Node process that already listens with --inspect (V's Gateway does,
// on 127.0.0.1:9229). Connects, profiles for <seconds> (sampling 1 ms), disconnects, writes the raw
// profile gzipped. Attaching and detaching stall the target's main thread for a few seconds; run it
// once, at a quiet time, and check liveness before and after.
//   node inspector-cpu-profile.mjs <host:port> <seconds> <out.cpuprofile.gz>
import fs from 'node:fs';
import zlib from 'node:zlib';

const [target = '127.0.0.1:9229', secondsArg = '60', out] = process.argv.slice(2);
const seconds = Math.min(60, Math.max(5, Number(secondsArg)));
if (!out) throw new Error('usage: inspector-cpu-profile.mjs <host:port> <seconds<=60> <out.cpuprofile.gz>');
const list = await (await fetch(`http://${target}/json/list`)).json();
const page = list.find((t) => t.type === 'node') ?? list[0];
if (!page?.webSocketDebuggerUrl) throw new Error('no inspector target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const t0 = Date.now();
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 1000 });
await send('Profiler.start');
const started = Date.now();
await new Promise((r) => setTimeout(r, seconds * 1000));
const { profile } = await send('Profiler.stop');
const stopped = Date.now();
await send('Profiler.disable');
ws.close();
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(profile)), { mode: 0o600 });
console.log(JSON.stringify({ out, seconds, attachMs: started - t0, profileMs: stopped - started, samples: profile.samples.length, startedAt: new Date(started).toISOString() }));
