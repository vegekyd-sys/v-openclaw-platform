// Summarize the CPU samples of V8 .cpuprofile files inside wall-clock windows.
// clock-<pid>.json (written by the candidate's preload) carries performance.timeOrigin. V8's profile
// clock is not process.hrtime's on every platform, but --cpu-prof starts while Node bootstraps, so
// wall = timeOrigin + (tUs - profile.startTime) / 1000 (error: a few ms).
import fs from "node:fs";
import path from "node:path";

const short = (url) => (url || "").replace(/^file:\/\//u, "").split("/").slice(-2).join("/");
const frameKey = (cf) => `${cf.functionName || "(anon)"} ${short(cf.url)}:${cf.lineNumber + 1}`;

export function loadProfiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const clocks = new Map();
  for (const f of fs.readdirSync(dir).filter((n) => /^clock-\d+\.json$/u.test(n))) {
    const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); clocks.set(c.pid, c);
  }
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".cpuprofile"))) {
    const pid = Number(/\.(\d+)\.\d+\.\d+\.cpuprofile$/u.exec(f)?.[1] ?? /CPU\.\d+\.\d+\.(\d+)\./u.exec(f)?.[1]);
    const clock = clocks.get(pid);
    out.push({ file: f, pid, clock, profile: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) });
  }
  return out;
}

export function summarizeWindow(entry, fromMs, toMs, top = 40) {
  const { profile, clock } = entry;
  if (!clock) return null;
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const self = new Map(), incl = new Map();
  let t = profile.startTime, total = 0, idle = 0, gc = 0, program = 0;
  const toWall = (us) => clock.timeOrigin + (us - profile.startTime) / 1000;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    const w = toWall(t);
    if (w < fromMs || w > toMs) continue;
    const node = nodes.get(profile.samples[i]);
    const name = node.callFrame.functionName;
    total++;
    if (name === "(idle)") { idle++; continue; }
    if (name === "(garbage collector)") gc++;
    if (name === "(program)") program++;
    const k = frameKey(node.callFrame);
    self.set(k, (self.get(k) ?? 0) + 1);
    const seen = new Set();
    for (let id = node.id; id !== undefined; id = parent.get(id)) {
      const kk = frameKey(nodes.get(id).callFrame);
      if (seen.has(kk)) continue;
      seen.add(kk);
      incl.set(kk, (incl.get(kk) ?? 0) + 1);
    }
  }
  if (!total) return null;
  const interval = profile.samples.length ? (profile.endTime - profile.startTime) / profile.samples.length / 1000 : 1;
  const ms = (n) => Math.round(n * interval);
  const sort = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => `${ms(v)}ms ${k}`);
  return { pid: entry.pid, windowMs: Math.round(toMs - fromMs), sampledMs: ms(total), busyMs: ms(total - idle), gcMs: ms(gc), programMs: ms(program), self: sort(self), inclusive: sort(incl).filter((l) => !/\(root\)/u.test(l)) };
}
