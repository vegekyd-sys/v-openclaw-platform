// Candidate: does a whole-tree grep in agent-shell stop freezing the Gateway?
//
// The candidate unit is delegated like V's Gateway unit (Delegate=yes, DelegateSubgroup=
// foreground). Inside it this script builds
//
//   <unit>/box             memory.max = what the Gateway holds after warm-up + AS_BOX_MARGIN.
//                          Stands in for V's RAM: on V the 37 GB scan is far larger than what is
//                          free, here a 6 GB scan is larger than the box's spare room.
//   <unit>/box/gw          the Gateway (and its Workers)
//   <unit>/box/agent-shell what scripts/v-agent-shell-cgroup.py creates and fills
//
// and runs a real Gateway on copies of shared VLab's databases (the dealclaw agent database, 0.4 GB:
// the run directory's disk has no room for makaron's 7 GB) while a client reads chat history in a loop. Each arm runs the same `grep -r` over a 6 GB
// directory of fresh random files:
//
//   baseline       no grep
//   agent-mem      grep started under an exec relay; the sidecar moves it into agent-shell
//                  (memory.high only: what V gets without touching the io controller)
//   agent-mem-io   the same plus io.max on agent-shell
//   inside         grep in the Gateway's own cgroup (V today)
//
// Measured per arm: the Gateway main thread's event-loop delay (worst stall per second, via a
// --import monitor), chat.history latency, the Gateway's page cache before/after, and whether the
// grep finished and how much it read. Then normal commands (ls, a small grep, a large file copy,
// ffmpeg when present) are timed in agent-shell against the box root.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const DATA_GB = Number(process.env.AS_DATA_GB ?? 6);
const BOX_MARGIN = Number(process.env.AS_BOX_MARGIN_MB ?? 768) * 1024 ** 2;
const AGENT_HIGH = process.env.AS_AGENT_HIGH ?? "256M";
const IO_BPS = process.env.AS_IO_BPS ?? "60M";
const ARM_CAP_MS = Number(process.env.AS_ARM_CAP_S ?? 150) * 1000;
const ARMS = (process.env.AS_ARMS ?? "baseline,agent-mem,agent-mem-io,inside").split(",");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dist = path.join(runtime, "openclaw", "dist");
const summary = { startedAt: new Date().toISOString(), dataGb: DATA_GB, agentHigh: AGENT_HIGH, ioBps: IO_BPS, arms: {}, notes: [] };
const pct = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null; };
const stats = (xs) => ({ n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), max: pct(xs, 100) });

// ---------------------------------------------------------------- cgroups
const self = fs.readFileSync("/proc/self/cgroup", "utf8").trim().split("\n").find((l) => l.startsWith("0::")).slice(3);
assert.equal(path.basename(self), "foreground", `expected DelegateSubgroup=foreground, got ${self}`);
const SERVICE = "/sys/fs/cgroup" + path.dirname(self);
const BOX = path.join(SERVICE, "box");
const GW = path.join(BOX, "gw");
const AGENT = path.join(BOX, "agent-shell");
const GEN = path.join(SERVICE, "gen");
const rd = (f) => fs.readFileSync(f, "utf8").trim();
const wr = (f, v) => fs.writeFileSync(f, String(v));
const enable = (dir, ctl) => { if (!rd(path.join(dir, "cgroup.subtree_control")).split(/\s+/).includes(ctl)) wr(path.join(dir, "cgroup.subtree_control"), `+${ctl}`); };
summary.cgroup = { service: SERVICE, serviceControllers: rd(path.join(SERVICE, "cgroup.controllers")), serviceSubtree: rd(path.join(SERVICE, "cgroup.subtree_control")) };
for (const ctl of ["memory", "io"]) enable(SERVICE, ctl);
for (const dir of [BOX, GEN]) if (!fs.existsSync(dir)) fs.mkdirSync(dir);
for (const ctl of ["memory", "io"]) enable(BOX, ctl);
if (!fs.existsSync(GW)) fs.mkdirSync(GW);
const memStat = (dir) => Object.fromEntries(rd(path.join(dir, "memory.stat")).split("\n").map((l) => l.split(" ")).filter(([k]) => ["anon", "file", "active_file", "inactive_file"].includes(k)).map(([k, v]) => [k, Math.round(Number(v) / 1024 ** 2)]));
const attach = (dir, pid) => wr(path.join(dir, "cgroup.procs"), pid);

// ---------------------------------------------------------------- scan data (written in its own small cgroup so it is not cached afterwards)
// On the root disk: the candidate run directory sits on VLab's small shared data disk.
const scanDir = process.env.AS_SCAN_DIR ?? `/var/tmp/asc-scan-${process.pid}`;
const AGENT_ID = process.env.AS_AGENT ?? "dealclaw";
const HOT_GB = Number(process.env.AS_HOT_GB ?? 2);
const hotFile = path.join(scanDir, "hot.bin");
async function makeScanData() {
  wr(path.join(GEN, "memory.high"), 256 * 1024 ** 2);
  const files = DATA_GB * 100; // 10 MB each
  const started = Date.now();
  const gen = spawn(process.execPath, ["-e", `
    const fs = require("fs"), crypto = require("crypto"), path = require("path");
    const dir = process.argv[1], n = Number(process.argv[2]);
    fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.alloc(10 * 1024 * 1024);
    for (let i = 0; i < n; i += 1) {
      const d = path.join(dir, "sub" + (i % 20));
      fs.mkdirSync(d, { recursive: true });
      crypto.randomFillSync(buf);
      const fd = fs.openSync(path.join(d, "blob-" + i + ".bin"), "w");
      fs.writeSync(fd, buf); fs.fsyncSync(fd); fs.closeSync(fd);
    }
    const hot = fs.openSync(path.join(dir, "hot.bin"), "w");
    for (let i = 0; i < Number(process.argv[3]) * 100; i += 1) { crypto.randomFillSync(buf); fs.writeSync(hot, buf); }
    fs.fsyncSync(hot); fs.closeSync(hot);`, scanDir, String(files), String(HOT_GB)], { stdio: "inherit" });
  attach(GEN, gen.pid);
  await new Promise((resolve) => gen.on("exit", resolve));
  try { wr(path.join(GEN, "memory.reclaim"), "8G"); } catch { /* best effort */ }
  summary.scanData = { files, gb: DATA_GB, secs: Math.round((Date.now() - started) / 1000), genCacheAfterMb: memStat(GEN).file };
}

// ---------------------------------------------------------------- Gateway
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  const workerConfig = fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
const sharedNpm = path.join(process.env.VLAB_SHARED_STATE_DIR, "npm");
if (!fs.existsSync(path.join(stateDir, "npm"))) assert.equal(spawnSync("cp", ["-a", "--reflink=auto", sharedNpm, path.join(stateDir, "npm")]).status, 0);

const elFile = path.join(data, "el.jsonl");
const monitor = path.join(data, "el-monitor.mjs");
fs.writeFileSync(monitor, `
import { monitorEventLoopDelay } from "node:perf_hooks";
import { appendFileSync } from "node:fs";
if (process.argv.includes("gateway") && !process.env.__EL_MON) {
  process.env.__EL_MON = "1";
  const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
  setInterval(() => { try { appendFileSync(${JSON.stringify(elFile)}, JSON.stringify({ t: Date.now(), max: Math.round(h.max / 1e6), p99: Math.round(h.percentile(99) / 1e6) }) + "\\n"); } catch {} h.reset(); }, 1000).unref();
}
`);
const shortTmp = `/tmp/.asc-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: path.join(data, "cache"), NODE_OPTIONS: `--import=${monitor}` };
const lines = [];
let gateway;
function startGateway() {
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  attach(GW, gateway.pid);
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); if (lines.length > 20_000) lines.splice(0, lines.length - 20_000); });
  }
}
let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let restarted = false;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (!restarted && lines.some((l) => /Restart OpenClaw so state migrations run|migration inputs changed/u.test(l.line))) { restarted = true; startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${lines.slice(-40).map((l) => l.line).join("\n")}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read", "operator.write"], onHelloOk: () => { clearTimeout(timeout); resolve(); }, onConnectError: (e) => { clearTimeout(timeout); reject(e); } });
        client.start();
      });
      return;
    } catch { client?.stop(); await sleep(1_000); }
  }
  throw new Error("candidate Gateway did not become ready");
}

// ---------------------------------------------------------------- stand-in for the Gateway's hot database pages
// V's Gateway keeps ~18 GB of database pages in its page cache and reads them on its main thread;
// the copied database here is far smaller. This reader, in the Gateway's cgroup, keeps a HOT_GB file
// hot and times random 64 KB reads of it every 5 ms, like a database page lookup.
const readerFile = path.join(data, "reader.jsonl");
let reader;
function startReader() {
  reader = spawn(process.execPath, ["-e", `
    const fs = require("fs");
    const [file, out] = process.argv.slice(1);
    const fd = fs.openSync(file, "r"); const size = fs.fstatSync(fd).size; const buf = Buffer.alloc(65536);
    for (let off = 0; off < size; off += 1 << 20) fs.readSync(fd, Buffer.alloc(1 << 20), 0, 1 << 20, off); // warm
    let window = [], last = Date.now();
    setInterval(() => {
      const t0 = process.hrtime.bigint();
      fs.readSync(fd, buf, 0, 65536, Math.floor(Math.random() * (size / 65536 - 1)) * 65536);
      window.push(Number(process.hrtime.bigint() - t0) / 1e6);
      if (Date.now() - last >= 1000) {
        window.sort((a, b) => a - b);
        fs.appendFileSync(out, JSON.stringify({ t: Date.now(), n: window.length, max: +window.at(-1).toFixed(1), p99: +window[Math.floor(window.length * 0.99)].toFixed(1), slow: window.filter((x) => x > 50).length }) + "\\n");
        window = []; last = Date.now();
      }
    }, 5);`, hotFile, readerFile], { stdio: ["ignore", "ignore", "pipe"] });
  reader.stderr.on("data", (c) => summary.notes.push(`reader: ${c.toString().slice(0, 300)}`));
  attach(GW, reader.pid);
}
const readerSince = (t0, t1) => (fs.existsSync(readerFile) ? fs.readFileSync(readerFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.t >= t0 && e.t <= t1) : []);

// ---------------------------------------------------------------- load: chat history reads
let sessionKeys = [];
const loadSamples = [];
let loadOn = false;
async function loadLoop() {
  let i = 0;
  while (loadOn) {
    const key = sessionKeys[i++ % sessionKeys.length];
    const t0 = Date.now();
    try { await client.request("chat.history", { sessionKey: key, limit: 200 }, { timeoutMs: 120_000 }); loadSamples.push({ t: t0, ms: Date.now() - t0 }); }
    catch (e) { loadSamples.push({ t: t0, ms: Date.now() - t0, error: String(e.message).slice(0, 80) }); }
    await sleep(300);
  }
}
const elSince = (t0, t1) => (fs.existsSync(elFile) ? fs.readFileSync(elFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.t >= t0 && e.t <= t1) : []);
const gwLog = (t0, t1, re) => lines.filter((l) => l.at >= t0 && l.at <= t1 && re.test(l.line)).length;

// ---------------------------------------------------------------- grep runner
const fakeRelayDir = path.join(data, "fake", "process", "supervisor");
fs.mkdirSync(fakeRelayDir, { recursive: true });
// Same path suffix as OpenClaw's relay, so the sidecar treats it like one.
fs.writeFileSync(path.join(fakeRelayDir, "service-child-relay.js"), `
const { spawn } = require("child_process");
const c = spawn(process.argv[2], process.argv.slice(3), { stdio: "ignore" });
c.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGTERM", () => c.kill("SIGTERM"));
`);
async function runGrep({ where }) {
  const argv = ["grep", "-r", "-l", "zzzz-not-present-zzzz", scanDir];
  const started = Date.now();
  let proc;
  if (where === "inside") {
    proc = spawn(argv[0], argv.slice(1), { stdio: "ignore" });
    attach(GW, proc.pid);
  } else {
    proc = spawn(process.execPath, [path.join(fakeRelayDir, "service-child-relay.js"), ...argv], { stdio: "ignore" });
    attach(GW, proc.pid); // where an OpenClaw exec relay starts: in the Gateway's cgroup
  }
  const placed = [];
  const watch = setInterval(() => { try { const cg = rd(`/proc/${proc.pid}/cgroup`).split("::")[1]; placed.push(path.basename(cg)); } catch {} }, 250);
  let readBytes = 0;
  const ioWatch = setInterval(() => {
    try {
      const kids = rd(`/proc/${proc.pid}/task/${proc.pid}/children`).split(/\s+/).filter(Boolean).map(Number);
      for (const pid of [proc.pid, ...kids]) { const m = /read_bytes: (\d+)/.exec(rd(`/proc/${pid}/io`)); if (m) readBytes = Math.max(readBytes, Number(m[1])); }
    } catch {}
  }, 500);
  const exited = new Promise((resolve) => proc.on("exit", (code, signal) => resolve({ code, signal })));
  const result = await Promise.race([exited, sleep(ARM_CAP_MS).then(() => null)]);
  clearInterval(watch); clearInterval(ioWatch);
  if (!result) { proc.kill("SIGTERM"); spawnSync("pkill", ["-TERM", "-f", "zzzz-not-present-zzzz"]); await exited; }
  return { finished: Boolean(result), exit: result, secs: Math.round((Date.now() - started) / 100) / 10, readMb: Math.round(readBytes / 1024 ** 2), cgroups: [...new Set(placed)] };
}
function sidecar(extra) {
  const p = spawn("python3", ["scripts/v-agent-shell-cgroup.py", "--service-cgroup", BOX, "--source", "gw", "--memory-high", AGENT_HIGH, "--interval", "0.5", ...extra], { stdio: ["ignore", "pipe", "pipe"] });
  const out = [];
  p.stdout.on("data", (c) => out.push(...c.toString().split("\n").filter(Boolean)));
  p.stderr.on("data", (c) => out.push(...c.toString().split("\n").filter(Boolean)));
  return { stop: async () => { p.kill("SIGTERM"); await new Promise((r) => p.on("exit", r)); return out; } };
}

async function arm(name) {
  // Restore the Gateway's working set before every arm.
  loadSamples.length = 0;
  await sleep(20_000);
  if (fs.existsSync(AGENT)) { try { wr(path.join(AGENT, "memory.reclaim"), "8G"); } catch {} }
  const gwBefore = memStat(GW);
  const t0 = Date.now();
  let grep = null;
  let side;
  if (name === "baseline") await sleep(40_000);
  else if (name === "inside") grep = await runGrep({ where: "inside" });
  else {
    side = sidecar(name === "agent-mem-io" ? ["--io-read-bps", IO_BPS, "--io-write-bps", IO_BPS, "--io-path", scanDir, "--io-path", stateDir] : []);
    await sleep(1_500);
    grep = await runGrep({ where: "relay" });
  }
  const t1 = Date.now();
  const sideLog = side ? await side.stop() : [];
  const el = elSince(t0, t1);
  const load = loadSamples.filter((s) => s.t >= t0 && s.t <= t1);
  summary.arms[name] = {
    secs: Math.round((t1 - t0) / 1000),
    grep,
    eventLoopStallPerSecondMs: stats(el.map((e) => e.max)),
    secondsWithStallOver500ms: el.filter((e) => e.max > 500).length,
    hotReadMs: (() => { const r = readerSince(t0, t1); return { worstPerSecond: stats(r.map((e) => e.max)), p99PerSecond: stats(r.map((e) => e.p99)), readsOver50ms: r.reduce((a, e) => a + e.slow, 0), reads: r.reduce((a, e) => a + e.n, 0) }; })(),
    chatHistoryMs: stats(load.filter((s) => !s.error).map((s) => s.ms)),
    chatHistoryErrors: load.filter((s) => s.error).length,
    livenessWarnings: gwLog(t0, t1, /liveness|event loop|timing gap|frozen/iu),
    gatewayCacheMb: { before: gwBefore.file, after: memStat(GW).file },
    agentShellMb: fs.existsSync(AGENT) ? memStat(AGENT) : null,
    gwIoPressure: rd(path.join(GW, "io.pressure")).split("\n")[0],
    sidecar: sideLog.filter((l) => /prepared|moved|error|controller/u.test(l)).slice(0, 6),
  };
  console.error(`[agent-shell] ${name}: ${JSON.stringify(summary.arms[name])}`);
}

// ---------------------------------------------------------------- normal commands in agent-shell vs box root
function timeIn(dir, argv) {
  const t0 = Date.now();
  const p = spawnSync("bash", ["-c", `echo $$ > ${path.join(dir, "cgroup.procs")} && exec "$@"`, "bash", ...argv], { encoding: "utf8", maxBuffer: 64 * 1024 ** 2 });
  return { ms: Date.now() - t0, code: p.status, err: p.status ? p.stderr.slice(0, 200) : undefined };
}
function normalCommands() {
  const big = path.join(scanDir, "copy-src.bin");
  spawnSync("bash", ["-c", `head -c ${1024 ** 3} /dev/urandom > ${big}`]);
  const probe = path.join(SERVICE, "probe");
  if (!fs.existsSync(probe)) fs.mkdirSync(probe);
  // agent-shell as V gets it: memory.high 12G, io.max 80 MB/s on both disks.
  const vlike = path.join(SERVICE, "agent-shell-v");
  if (!fs.existsSync(vlike)) fs.mkdirSync(vlike);
  wr(path.join(vlike, "memory.high"), 12 * 1024 ** 3);
  for (const dev of ["253:0", "253:16"]) { try { wr(path.join(vlike, "io.max"), `${dev} rbps=${80 * 1024 ** 2} wbps=${80 * 1024 ** 2}`); } catch (e) { summary.notes.push(`io.max ${dev}: ${e.message}`); } }
  const out = {};
  const cmds = {
    ls: ["ls", "-la", stateDir],
    smallGrep: ["grep", "-rn", "gateway", path.join(stateDir, "openclaw.json")],
    copy1G: ["cp", big, path.join(scanDir, "copy-dst.bin")],
    ffmpeg: spawnSync("bash", ["-c", "command -v ffmpeg"]).status === 0 ? ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=20:size=1280x720:rate=30", "-c:v", "libx264", "-preset", "veryfast", path.join(data, "probe.mp4")] : null,
  };
  for (const [name, argv] of Object.entries(cmds)) {
    if (!argv) { out[name] = "ffmpeg not installed"; continue; }
    try { wr(path.join(AGENT, "memory.reclaim"), "8G"); } catch {}
    const plain = timeIn(probe, argv);
    try { wr(path.join(vlike, "memory.reclaim"), "8G"); } catch {}
    const v = timeIn(vlike, argv);
    out[name] = { plainMs: plain.ms, agentShellAsOnVMs: v.ms, ok: (plain.code === 0 && v.code === 0) || name === "smallGrep" };
  }
  fs.rmSync(big, { force: true }); fs.rmSync(path.join(scanDir, "copy-dst.bin"), { force: true });
  summary.normalCommands = out;
}

try {
  await makeScanData();
  startGateway();
  await connectGateway();
  const listed = await client.request("sessions.list", { agentId: AGENT_ID, limit: 60, includeLastMessage: false }, { timeoutMs: 120_000 });
  sessionKeys = (listed.sessions ?? []).map((s) => s.key).filter(Boolean);
  summary.sessions = sessionKeys.length;
  assert(sessionKeys.length > 0, `no ${AGENT_ID} sessions in the copied database`);
  loadOn = true;
  const loadDone = loadLoop();
  startReader();
  await sleep(45_000);
  const warm = Number(rd(path.join(BOX, "memory.current")));
  wr(path.join(BOX, "memory.max"), warm + BOX_MARGIN);
  summary.box = { warmMb: Math.round(warm / 1024 ** 2), maxMb: Math.round((warm + BOX_MARGIN) / 1024 ** 2), gw: memStat(GW) };
  for (const name of ARMS) await arm(name);
  loadOn = false; await loadDone;
  normalCommands();
  summary.verdict = "done";
} catch (error) {
  summary.verdict = "fail";
  summary.error = String(error?.stack ?? error).slice(0, 3000);
  summary.gatewayTail = lines.slice(-40).map((l) => l.line).join("\n").slice(-4000);
  process.exitCode = 1;
} finally {
  loadOn = false;
  try { reader?.kill("SIGTERM"); } catch {}
  summary.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(summary, null, 1));
  client?.stop();
  if (gateway && gateway.exitCode === null) { gateway.kill("SIGTERM"); await sleep(5_000); if (gateway.exitCode === null) gateway.kill("SIGKILL"); }
  fs.rmSync(scanDir, { recursive: true, force: true });
  try { fs.rmSync(shortTmp, { recursive: true, force: true }); } catch {}
}
