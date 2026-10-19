// Night-time CPU sampler for the V Gateway main thread, aimed at one event: a Control UI open whose
// chat.history stalls the main thread for 10-95 s (2026-10-14..19, always 01:00-02:30 CST, always
// agent:makaron:main). It cannot be reproduced on demand without stalling production, so this waits
// for the next real open and records an inspector CPU profile around it.
//
// Run on V as root (the Gateway inspector listens on 127.0.0.1:9229), e.g.
//   systemd-run --unit=v-control-ui-open-profiler --property=RuntimeMaxSec=6h \
//     /opt/node-v22.23.1/bin/node /var/tmp/v-control-ui-open-profiler.mjs
// It only reads the Gateway journal and talks to the inspector. Sampling starts when a new connection
// answers skills.status/sessions.list/sessions.branches.list inside the window, and stops when that
// connection's chat.history answers (or after MAX_MS). At most MAX_CAPTURES profiles, then it exits.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.OUT ?? "/var/tmp/v-control-ui-open-profiles";
const INSPECT = process.env.INSPECT ?? "http://127.0.0.1:9229";
const WINDOW = (process.env.WINDOW ?? "0-4").split("-").map(Number); // local hours [from, to)
const MAX_CAPTURES = Number(process.env.MAX_CAPTURES ?? 3);
const MAX_MS = Number(process.env.MAX_MS ?? 180_000);
const INTERVAL_US = Number(process.env.INTERVAL_US ?? 2000);
fs.mkdirSync(OUT, { recursive: true, mode: 0o700 });
const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function summarize(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const label = (node) => `${node.callFrame.functionName || "(anon)"} ${path.basename(node.callFrame.url || "")}:${node.callFrame.lineNumber + 1}`;
  // Longest stretch without an (idle) sample, then self/total time inside that stretch only.
  let busy = 0, longest = 0, end = -1, startIdx = 0, bestStart = 0;
  profile.samples.forEach((id, i) => {
    const idle = byId.get(id).callFrame.functionName === "(idle)";
    if (idle) { busy = 0; startIdx = i + 1; return; }
    busy += profile.timeDeltas[i] ?? 0;
    if (busy > longest) { longest = busy; end = i; bestStart = startIdx; }
  });
  const self = new Map(), total = new Map();
  for (let i = bestStart; i <= end; i++) {
    const us = profile.timeDeltas[i] ?? 0;
    const id = profile.samples[i];
    self.set(label(byId.get(id)), (self.get(label(byId.get(id))) ?? 0) + us);
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const l = label(byId.get(cur));
      if (!seen.has(l)) { seen.add(l); total.set(l, (total.get(l) ?? 0) + us); }
    }
  }
  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, us]) => `${Math.round(us / 1000)}ms ${name}`);
  return { longestBusyMs: Math.round(longest / 1000), self: top(self, 30), total: top(total, 60) };
}

async function capture(conn, waitFor) {
  const target = (await (await fetch(`${INSPECT}/json/list`)).json())[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (event) => { const m = JSON.parse(event.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  const startedAt = Date.now();
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: INTERVAL_US });
  await send("Profiler.start");
  log(`sampling conn=${conn} (start acknowledged after ${Date.now() - startedAt} ms)`);
  await Promise.race([waitFor, sleep(MAX_MS)]);
  await sleep(2_000);
  const stopAt = Date.now();
  const { result } = await send("Profiler.stop");
  await send("Profiler.disable");
  ws.close();
  const stamp = new Date(startedAt).toISOString().replace(/[:.]/gu, "-");
  fs.writeFileSync(path.join(OUT, `${stamp}-${conn}.cpuprofile`), JSON.stringify(result.profile), { mode: 0o600 });
  const summary = { conn, startedAt: new Date(startedAt).toISOString(), stopAckMs: Date.now() - stopAt, ...summarize(result.profile) };
  fs.writeFileSync(path.join(OUT, `${stamp}-${conn}.summary.json`), JSON.stringify(summary, null, 1), { mode: 0o600 });
  log(`captured conn=${conn} longestBusyMs=${summary.longestBusyMs}`);
}

// JOURNAL_CMD (a shell command) replaces the journal tail, for dry runs off V.
const journal = process.env.JOURNAL_CMD
  ? spawn("sh", ["-c", process.env.JOURNAL_CMD], { stdio: ["ignore", "pipe", "inherit"] })
  : spawn("journalctl", ["-u", "openclaw-gateway", "-f", "-n", "0", "-o", "cat"], { stdio: ["ignore", "pipe", "inherit"] });
journal.stdout.setEncoding("utf8");
const seen = new Set();
const waiters = new Map();
let captures = 0, active = false, rest = "";
journal.stdout.on("data", (chunk) => {
  const lines = (rest + chunk).split("\n");
  rest = lines.pop();
  for (const line of lines) {
    const m = /res \S+ ([a-z.]+) (\d+)ms conn=([0-9a-f]{8})/u.exec(line);
    if (!m) continue;
    const [, method, , conn] = m;
    if (method === "chat.history") waiters.get(conn)?.();
    if (!["skills.status", "sessions.list", "sessions.branches.list"].includes(method) || seen.has(conn)) continue;
    seen.add(conn);
    const hour = new Date().getHours();
    if (active || captures >= MAX_CAPTURES || hour < WINDOW[0] || hour >= WINDOW[1]) continue;
    active = true;
    captures += 1;
    const waitFor = new Promise((resolve) => waiters.set(conn, resolve));
    capture(conn, waitFor).catch((error) => log(`capture failed conn=${conn}: ${error?.message ?? error}`)).finally(() => {
      active = false;
      waiters.delete(conn);
      if (captures >= MAX_CAPTURES) { journal.kill(); process.exit(0); }
    });
  }
});
log(`waiting; window ${WINDOW.join("-")}h local, up to ${MAX_CAPTURES} captures, out ${OUT}`);
