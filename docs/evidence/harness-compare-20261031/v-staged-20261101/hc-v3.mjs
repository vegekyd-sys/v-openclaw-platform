// Worker vs /vds on production V, split into stages, at Tianyi's request. Reuses the hc1031 sessions,
// no channel delivery, no session deletion, stops itself when V looks unhealthy.
import fs from "node:fs";
import { spawn, execSync } from "node:child_process";
import { createHash, randomUUID, randomBytes } from "node:crypto";

const DIST = "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist";
const OUT = `/tmp/hc-v-20261101-${process.argv[2] ?? "run"}`;
const PORT = 22793;
const VDS = "deepseek/vds-deepseek-flash";
const TURN_MS = 300_000;
const COOLDOWN_MS = 75_000;
const MAX_GW_RSS_MB = 9_000;
const MAX_OVERDUE_MS = 10_000;
const MIN_AVAIL_MB = 8_000;
const MAX_LOAD = 32;
const MAX_FAIL = 0.2;
const gwPid = execSync("systemctl show openclaw-gateway -p MainPID --value").toString().trim();
fs.mkdirSync(OUT, { recursive: true, mode: 0o700 });
const emit = (o) => { const r = { at: new Date().toISOString(), ...o }; fs.appendFileSync(`${OUT}/progress.jsonl`, `${JSON.stringify(r)}\n`); console.log(JSON.stringify(r).slice(0, 600)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = JSON.parse(fs.readFileSync("/home/openclaw/.openclaw/openclaw.json", "utf8")).gateway?.auth?.token;
if (typeof token !== "string") throw new Error("no token");

// ---- health gate, from the log stream only: no RPC probes ----
let abortReason = null;
const MAX_EXTERNAL_RUNS = 4;
const externalRuns = new Map();
const logs = [];
const j = spawn("journalctl", ["-u", "openclaw-gateway", "-f", "-n", "0", "-o", "cat", "--no-pager"], { stdio: ["ignore", "pipe", "ignore"] });
let buf = "";
j.stdout.on("data", (d) => {
  buf += d; const parts = buf.split("\n"); buf = parts.pop();
  for (const line of parts) {
    // Monitor's extra gate: stop when real replies pick up (runs this script did not send)
    const ext = /^\[firsttext-[a-z-]+\].*"runId":"([^"]+)"/u.exec(line)?.[1];
    if (ext && !runs.has(ext)) {
      externalRuns.set(ext, Date.now());
      for (const [id, t] of externalRuns) if (Date.now() - t > 300_000) externalRuns.delete(id);
      if (externalRuns.size >= MAX_EXTERNAL_RUNS && !abortReason) abortReason = `real runs rising: ${externalRuns.size} in 5 min`;
    }
    if (!/liveness|stream ack|Agent DB coordinator|lease|Worker start|worker.*(?:failed|exit)|harness failed|stalled|hook relay|nativeHook|another runner|rate.?limit|model-call-enter/iu.test(line)) continue;
    const at = Date.now();
    logs.push({ at, line: line.slice(0, 300) });
    const m = /liveness heartbeat delayed: overdue=(\d+)ms/u.exec(line);
    if (m && Number(m[1]) >= MAX_OVERDUE_MS && !abortReason) abortReason = `liveness overdue ${m[1]} ms`;
  }
});
function hostCheck() {
  if (fs.existsSync("/tmp/hc-v3-stop") && !abortReason) abortReason = "stop file";
  const load = Number(fs.readFileSync("/proc/loadavg", "utf8").split(" ")[0]);
  const avail = Number(/MemAvailable:\s+(\d+)/u.exec(fs.readFileSync("/proc/meminfo", "utf8"))[1]) / 1024;
  if (load > MAX_LOAD && !abortReason) abortReason = `load ${load}`;
  if (avail < MIN_AVAIL_MB && !abortReason) abortReason = `available memory ${Math.round(avail)} MB`;
  const gwRss = gwRssMB();
  if (gwRss > MAX_GW_RSS_MB && !abortReason) abortReason = `gateway rss ${gwRss} MB`;
  return { load, availMB: Math.round(avail) };
}

const gwRssMB = () => { try { return Math.round(Number(fs.readFileSync(`/proc/${gwPid}/statm`, "utf8").split(" ")[1]) * 4096 / 1048576); } catch { return 0; } };

// ---- hook process lifetimes, from eBPF exec/exit events ----
const relayLive = new Map();
const relayDone = [];
const bpfEnv = { ...process.env, PYTHONUNBUFFERED: "1" };
const exec_ = spawn("execsnoop-bpfcc", [], { stdio: ["ignore", "pipe", "ignore"], env: bpfEnv });
const exit_ = spawn("exitsnoop-bpfcc", [], { stdio: ["ignore", "pipe", "ignore"], env: bpfEnv });
const lines = (stream, fn) => { let b = ""; stream.on("data", (d) => { b += d; const p = b.split("\n"); b = p.pop(); p.forEach(fn); }); };
lines(exec_.stdout, (l) => { if (!/hooks relay/u.test(l)) return; const m = /^\S+\s+(\d+)\s/u.exec(l); if (m && !relayLive.has(m[1])) relayLive.set(m[1], { at: Date.now(), event: /--event\s+(\S+)/u.exec(l)?.[1] ?? null }); });
lines(exit_.stdout, (l) => { const m = /^\S+\s+(\d+)\s+\d+\s+(\d+)\s+([\d.]+)/u.exec(l); if (!m || m[1] !== m[2]) return; const r = relayLive.get(m[1]); if (r) { relayLive.delete(m[1]); relayDone.push({ at: r.at, event: r.event, lifeMs: Date.now() - r.at, ageS: Number(m[3]) }); } });

// ---- Gateway CPU per thread ----
function threadCpu() {
  const t = {};
  for (const tid of fs.readdirSync(`/proc/${gwPid}/task`)) {
    try {
      const s = fs.readFileSync(`/proc/${gwPid}/task/${tid}/stat`, "utf8");
      const f = s.slice(s.lastIndexOf(")") + 2).split(" ");
      const name = tid === gwPid ? "main" : s.slice(s.indexOf("(") + 1, s.lastIndexOf(")")).replace(/[0-9]+$/u, "");
      t[name] = (t[name] ?? 0) + (Number(f[11]) + Number(f[12])) / 100;
    } catch {}
  }
  return t;
}

// ---- Gateway CPU profile through the inspector V already has open; Profiler.start stalls main about 5 s ----
async function startProfile() {
  const [t] = await (await fetch("http://127.0.0.1:9229/json/list")).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const pending = new Map(); let id = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 2000 });
  const t0 = Date.now();
  await send("Profiler.start");
  emit({ phase: "profile-start", stallMs: Date.now() - t0 });
  return async () => {
    const t1 = Date.now();
    const m = await send("Profiler.stop");
    fs.writeFileSync(`${OUT}/gw.cpuprofile`, JSON.stringify(m.result.profile));
    emit({ phase: "profile-stop", stallMs: Date.now() - t1, bytes: JSON.stringify(m.result.profile).length });
    await send("Profiler.disable");
    ws.close();
  };
}

// ---- CPU by role ----
const TICK = 100;
function role(cmd) {
  if (/core\/dist\/index\.js gateway|openclaw-gateway|\/core\/.*gateway/u.test(cmd) && !/worker/u.test(cmd)) return "gatewayLike";
  if (/\/worker\//u.test(cmd)) return "worker";
  if (/codex/u.test(cmd)) return "codex";
  if (/chrome/u.test(cmd)) return "chrome";
  return "other";
}
function cpuTable() {
  const t = new Map();
  for (const p of fs.readdirSync("/proc").filter((d) => /^\d+$/u.test(d))) {
    try {
      const s = fs.readFileSync(`/proc/${p}/stat`, "utf8");
      const f = s.slice(s.lastIndexOf(")") + 2).split(" ");
      const cmd = fs.readFileSync(`/proc/${p}/cmdline`, "utf8").split("\0").join(" ");
      t.set(p, { cpu: (Number(f[11]) + Number(f[12]) + Number(f[13]) + Number(f[14])) / TICK, rssMB: Number(f[21]) * 4096 / 1048576, role: p === gwPid ? "gateway" : role(cmd) });
    } catch {}
  }
  return t;
}
function cpuDiff(a, b) {
  const out = {};
  for (const [p, v] of b) { const base = a.get(p)?.cpu ?? 0; out[v.role] = (out[v.role] ?? 0) + Math.max(0, v.cpu - base); }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(v)]));
}
const sysBusy = () => { const f = fs.readFileSync("/proc/stat", "utf8").split("\n")[0].trim().split(/\s+/u).slice(1).map(Number); return { busy: f[0] + f[1] + f[2] + f[5] + f[6], iowait: f[4] }; };
function sampleRss(peak) {
  let worker = 0, wn = 0, codex = 0, cn = 0, gw = 0;
  for (const [, v] of cpuTable()) {
    if (v.role === "gateway") gw = v.rssMB;
    if (v.role === "worker") { worker += v.rssMB; wn += 1; }
    if (v.role === "codex") { codex += v.rssMB; cn += 1; }
  }
  peak.gwRssMB = Math.max(peak.gwRssMB ?? 0, Math.round(gw)); peak.workerRssMB = Math.max(peak.workerRssMB ?? 0, Math.round(worker)); peak.workerN = Math.max(peak.workerN ?? 0, wn); peak.codexRssMB = Math.max(peak.codexRssMB ?? 0, Math.round(codex)); peak.codexN = Math.max(peak.codexN ?? 0, cn);
  return peak;
}

// ---- gateway client ----
const { GatewayClient } = await import(`${DIST}/plugin-sdk/gateway-runtime.js`);
const runs = new Map();
function onEvent(e) {
  const p = e.payload ?? {};
  const r = runs.get(p.runId) ?? (p.idempotencyKey ? runs.get(p.idempotencyKey) : undefined);
  if (!r) return;
  const now = Date.now();
  if (e.event === "agent" && p.stream === "assistant" && typeof p.data?.text === "string" && p.data.text.trim() && !r.firstTextAt) r.firstTextAt = now;
  if (e.event === "agent" && p.stream === "tool" && p.data?.phase === "start") { r.toolStarts = (r.toolStarts ?? 0) + 1; r.firstToolAt ??= now; r.lastToolAt = now; (r.tools ??= []).push({ name: p.data?.name, startAt: now }); }
  if (e.event === "agent" && p.stream === "tool" && p.data?.phase === "result") { r.lastToolEndAt = now; const t = (r.tools ?? []).find((x) => !x.endAt && x.name === p.data?.name); if (t) t.endAt = now; }
  if (e.event === "chat" && p.state === "delta" && !r.firstTextAt) r.firstTextAt = now;
  if (e.event === "chat" && ["final", "error", "aborted"].includes(p.state) && !r.terminal) {
    r.terminal = p.state; r.endAt = now; r.error = p.errorMessage;
    const c = p.message?.content;
    r.text = (Array.isArray(c) ? c.filter((x) => x?.type === "text").map((x) => x.text).join("") : String(c ?? "")).slice(0, 300);
  }
}
let client;
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("hello timeout")), 15_000);
  client = new GatewayClient({ url: `ws://127.0.0.1:${PORT}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"], scopes: ["operator.admin", "operator.read", "operator.write"], onEvent, onHelloOk: () => { clearTimeout(t); resolve(); }, onConnectError: (err) => { clearTimeout(t); reject(err); } });
  client.start();
});

const key = (arm, i) => `agent:makaron:explicit:hc1031-${arm}-${String(i).padStart(2, "0")}`;
const created = new Set();
async function turn(arm, i, task) {
  const k = key(arm, i);
  created.add(k);
  const label = `hc1031-${arm}-${task}-${randomBytes(4).toString("hex")}`;
  const expected = createHash("sha256").update(label).digest("hex").slice(0, 12);
  const message = task === "multi"
    ? `（自动化并发压测）按顺序做，一步也不要省：1) 用 shell 执行 \`uname -r\`；2) 用 shell 执行 \`ls /tmp | wc -l\`；3) 用读文件工具读工作区 AGENTS.md（只需前 5 行）；4) 用 shell 执行 \`date\`；5) 用 shell 执行 \`printf %s ${label} | sha256sum | cut -c1-12\`。全部做完后只回复第 5 步输出的那 12 个字符，不要别的文字。`
    : `（自动化并发压测）用 shell 执行一次 \`printf %s ${label} | sha256sum | cut -c1-12\`，然后只回复它输出的那 12 个字符，不要别的文字。`;
  const id = randomUUID();
  const r = { key: k, sentAt: Date.now() };
  runs.set(id, r);
  try {
    await client.request("chat.send", { agentId: "makaron", sessionKey: k, message, deliver: false, idempotencyKey: id, timeoutMs: TURN_MS }, { timeoutMs: 120_000 });
  } catch (error) { r.terminal = "send-error"; r.endAt = Date.now(); r.error = String(error?.message ?? error).slice(0, 200); }
  const deadline = r.sentAt + TURN_MS + 30_000;
  while (!r.terminal && Date.now() < deadline && !abortReason) await sleep(200);
  if (!r.terminal && abortReason) { await client.request("chat.abort", { sessionKey: k, runId: id }).catch(() => {}); r.terminal = "aborted-by-gate"; r.endAt = Date.now(); }
  if (!r.terminal) { r.terminal = "timeout"; r.endAt = Date.now(); }
  if (r.terminal === "final" && !r.text) {
    try {
      const h = await client.request("chat.history", { agentId: "makaron", sessionKey: k, limit: 2 }, { timeoutMs: 60_000 });
      const c = (h?.messages ?? []).filter((m) => m.role === "assistant").at(-1)?.content;
      r.text = (Array.isArray(c) ? c.filter((x) => x?.type === "text").map((x) => x.text).join("") : String(c ?? "")).slice(0, 300);
    } catch {}
  }
  return { arm, task, ok: r.terminal === "final" && (r.text ?? "").includes(expected), terminal: r.terminal, error: r.error?.slice(0, 160), firstMs: r.firstTextAt ? r.firstTextAt - r.sentAt : null, firstToolMs: r.firstToolAt ? r.firstToolAt - r.sentAt : null, lastToolMs: r.lastToolEndAt ? r.lastToolEndAt - r.sentAt : null, doneMs: r.endAt - r.sentAt, toolStarts: r.toolStarts ?? 0, ...stages(r) };
}
function stages(r) {
  const t = r.tools ?? [];
  let exec = 0, between = 0;
  t.forEach((x, i) => { if (x.endAt) exec += x.endAt - x.startAt; const n = t[i + 1]; if (n && x.endAt) between += n.startAt - x.endAt; });
  return { execMs: exec, betweenMs: between, afterLastMs: r.lastToolEndAt ? r.endAt - r.lastToolEndAt : null, perTool: t.map((x) => ({ name: x.name, execMs: x.endAt ? x.endAt - x.startAt : null })) };
}
const pct = (a, p) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); return v.length ? Math.round(v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)] / 100) / 10 : null; };

async function level(arm, c, task, round) {
  const from = Date.now();
  const logFrom = logs.length;
  const cpu0 = cpuTable(); const sys0 = sysBusy(); const th0 = threadCpu(); const relayFrom = relayDone.length;
  const peak = {}; let hostMaxLoad = 0; let minAvail = Infinity;
  const timer = setInterval(() => { sampleRss(peak); const h = hostCheck(); hostMaxLoad = Math.max(hostMaxLoad, h.load); minAvail = Math.min(minAvail, h.availMB); }, 5_000);
  const canaryRun = c >= 15 ? sleep(5_000).then(() => turn("canary", arm === "flash" ? 0 : 1, "sha")) : null;
  const results = await Promise.all(Array.from({ length: c }, (_, i) => turn(arm, i, task)));
  const wallMs = Date.now() - from;
  const canary = canaryRun ? await canaryRun : null;
  clearInterval(timer);
  const sys1 = sysBusy();
  const seen = logs.slice(logFrom);
  const overdue = seen.map((l) => /overdue=(\d+)ms/u.exec(l.line)?.[1]).filter(Boolean).map(Number);
  await sleep(1_500);
  const th1 = threadCpu();
  const relays = relayDone.slice(relayFrom);
  fs.appendFileSync(`${OUT}/runs.jsonl`, `${JSON.stringify({ arm, c, task, round, results })}\n`);
  const rec = { phase: "level", arm, c, task, round, wallS: Math.round(wallMs / 1000), ok: results.filter((r) => r.ok).length, n: c,
    firstP50: pct(results.map((r) => r.firstMs), 0.5), firstP95: pct(results.map((r) => r.firstMs), 0.95),
    execP50: pct(results.map((r) => r.execMs), 0.5), betweenP50: pct(results.map((r) => r.betweenMs), 0.5), afterLastP50: pct(results.map((r) => r.afterLastMs), 0.5),
    threadCpuSec: Object.fromEntries(Object.entries(th1).map(([k, v]) => [k, Math.round((v - (th0[k] ?? 0)) * 10) / 10]).filter(([, v]) => v >= 0.1)),
    mainBusyPct: Math.round(100 * ((th1.main ?? 0) - (th0.main ?? 0)) / (wallMs / 1000)),
    relayN: relays.length, relayByEvent: relays.reduce((a, x) => { a[x.event] = (a[x.event] ?? 0) + 1; return a; }, {}), relayLifeP50: pct(relays.map((x) => x.lifeMs), 0.5), relayLifeP95: pct(relays.map((x) => x.lifeMs), 0.95),
    firstToolP50: pct(results.map((r) => r.firstToolMs), 0.5), lastToolP50: pct(results.map((r) => r.lastToolMs), 0.5),
    doneP50: pct(results.map((r) => r.doneMs), 0.5), doneP95: pct(results.map((r) => r.doneMs), 0.95),
    toolStartsAvg: Math.round(10 * results.reduce((a, r) => a + r.toolStarts, 0) / c) / 10,
    cpuSec: cpuDiff(cpu0, cpuTable()), sysCores: Math.round(100 * (sys1.busy - sys0.busy) / TICK / (wallMs / 1000)) / 100, iowaitCores: Math.round(100 * (sys1.iowait - sys0.iowait) / TICK / (wallMs / 1000)) / 100,
    loadMax: hostMaxLoad, availMinMB: minAvail === Infinity ? null : minAvail, ...sampleRss(peak),
    livenessN: overdue.length, overdueMaxMs: overdue.length ? Math.max(...overdue) : 0,
    ackTimeouts: seen.filter((l) => /stream ack/iu.test(l.line)).length, lockTimeouts: seen.filter((l) => /Agent DB coordinator|lease.*timeout/iu.test(l.line)).length, hookIssues: seen.filter((l) => /hook relay|nativeHook/iu.test(l.line)).length, harnessFailed: seen.filter((l) => /harness failed|another runner/iu.test(l.line)).length,
    modelCallEnters: seen.filter((l) => /model-call-enter/u.test(l.line)).length,
    canary: canary && { ok: canary.ok, firstMs: canary.firstMs, doneMs: canary.doneMs }, errors: results.filter((r) => !r.ok).slice(0, 3).map((r) => r.error ?? r.terminal), abortReason };
  emit(rec);
  return rec;
}

let stopped = null;
try {
  emit({ phase: "start", host: hostCheck() });
  // disposable sessions: the Worker arm keeps the default, the /vds arm gets the override users get from /vds
  for (let i = 0; i < 15; i++) { await client.request("sessions.patch", { key: key("vds", i), model: VDS }); created.add(key("vds", i)); }
  // warm every session once, a few at a time, so both arms start from an existing session
  for (const arm of ["flash", "vds"]) {
    for (let i = 0; i < 15 && !abortReason; i += 3) {
      const res = await Promise.all([i, i + 1, i + 2].map((x) => turn(arm, x, "sha")));
      emit({ phase: "warm", arm, from: i, ok: res.filter((r) => r.ok).length, firstMs: res.map((r) => r.firstMs), errors: res.filter((r) => !r.ok).map((r) => r.error ?? r.terminal) });
      if (res.some((r) => !r.ok)) { stopped = `warm failed on ${arm}`; break; }
      await sleep(3_000);
    }
    if (stopped) break;
  }
  await sleep(COOLDOWN_MS);
  const plan = [[1, "multi", 1], [15, "multi", 1], [5, "multi", 1], [15, "multi", 2]];
  for (const [c, task, round] of plan) {
    // alternate who goes first so neither arm always follows the other
    const order = round === 2 ? ["vds", "flash"] : ["flash", "vds"];
    for (const arm of order) {
      if (stopped || abortReason) break;
      const profile = false; // this run has no profile approval
      const stop = profile ? await startProfile() : null;
      if (stop) await sleep(20_000);
      const rec = await level(arm, c, task, round);
      if (stop) await stop();
      if (abortReason) { stopped = abortReason; break; }
      if ((c - rec.ok) / c > MAX_FAIL) { stopped = `fail rate ${c - rec.ok}/${c} on ${arm} c${c} ${task}`; break; }
      await sleep(COOLDOWN_MS);
    }
    if (stopped || abortReason) break;
  }
} catch (error) {
  stopped = String(error?.message ?? error).slice(0, 300);
} finally {
  emit({ phase: "end", stopped: stopped ?? abortReason, host: hostCheck() });
  await sleep(30_000);
  exec_.kill(); exit_.kill();
  j.kill(); client.stop();
  process.exit(0);
}
