// Soak on the mirror Gateway (run as root; Gateway started with the inspector,
// VERSA_NODE_FLAGS="--inspect=127.0.0.1:0"):
//   node soak.mjs <label> <minutes> <outDir> [cycleSeconds=240]
// Light mixed traffic: every cycle one bench96 c3 (plain turns) followed by one
// accept.mjs pass (6 sequential tool turns: exec, memory_search, cron,
// workboard, sessions_spawn). Every 5 min one sample line (JSONL):
//   Gateway RSS (ps), instance cgroup memory, V8 heap via CDP (process.memoryUsage),
//   cgroup tasks (pids.current = threads) and processes by kind (MCP helpers
//   must stay bounded), liveness warnings, and the V sentinel's journal
//   counters over the window (received / dispatch complete / first-nonempty-text
//   / isError=true) as the baseline for the "green but not serving" rule.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";

const [label, minutesArg, outDir, cycleArg] = process.argv.slice(2);
const minutes = Number(minutesArg), cycleS = Number(cycleArg ?? 240);
if (!/^[a-z0-9-]+$/.test(label ?? "") || !(minutes > 0) || !fs.existsSync(outDir ?? "")) throw new Error("usage");
const R = "/srv/versa-mirror95", UNIT = "versa-mirror95-gateway", NODE = `${R}/runtime/node-v24.17.0-linux-x64/bin/node`;
const run = (c, a, t = 60_000) => execFileSync(c, a, { encoding: "utf8", timeout: t, maxBuffer: 256 << 20 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pid = Number(run("systemctl", ["show", UNIT, "-p", "MainPID", "--value"]));
if (!(pid > 1)) throw new Error("gateway not running");
const cg = `/sys/fs/cgroup${run("systemctl", ["show", UNIT, "-p", "ControlGroup", "--value"])}`;
const out = `${outDir}/soak-${label}.jsonl`;
const log = (o) => { fs.appendFileSync(out, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

// ---- CDP (heap)
let evaluate = async () => null;
try {
  const ports = run("ss", ["-ltnpH"]).split("\n").filter((l) => l.includes(`pid=${pid},`)).map((l) => l.match(/127\.0\.0\.1:(\d+)/)?.[1]).filter(Boolean);
  for (const port of ports) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
      if (list?.[0]?.webSocketDebuggerUrl) {
        const ws = new WebSocket(list[0].webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        let id = 0; const pending = new Map();
        ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result); } };
        evaluate = (expression) => new Promise((res) => { const i = ++id; pending.set(i, (r) => res(r?.result?.value ?? null)); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true } })); setTimeout(() => { if (pending.delete(i)) res(null); }, 15_000); });
        break;
      }
    } catch {}
  }
} catch {}
const HEAP = `(() => { const m = process.memoryUsage(); const v8 = process.getBuiltinModule("node:v8").getHeapStatistics(); const MB = (v) => Math.round(v / 1048576);
  return { heapUsed: MB(m.heapUsed), heapTotal: MB(m.heapTotal), external: MB(m.external), arrayBuffers: MB(m.arrayBuffers), heapLimit: MB(v8.heap_size_limit), handles: process._getActiveHandles?.().length ?? null }; })()`;

function processes() {
  const kinds = {};
  let n = 0;
  // Delegated units keep no process in the service cgroup itself (the Gateway
  // is in foreground/, the verifier in database-verifier/): walk the subtree.
  const procs = [];
  const walk = (dir) => {
    try { procs.push(...fs.readFileSync(`${dir}/cgroup.procs`, "utf8").split("\n").filter(Boolean)); } catch {}
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) walk(`${dir}/${e.name}`);
  };
  walk(cg);
  for (const p of procs) {
    let args = "";
    try { args = fs.readFileSync(`/proc/${p}/cmdline`, "utf8").replace(/\0/g, " "); } catch { continue; }
    n += 1;
    const kind = Number(p) === pid ? "gateway" : /mcp/i.test(args) ? "mcp" : /codex/.test(args) ? "codex" : /chrom/i.test(args) ? "browser"
      : /\bnode\b|node-v2/.test(args) ? "node" : /python/.test(args) ? "python" : args.split(" ")[0].split("/").pop() || "?";
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  return { n, kinds };
}
const count = (text, needle) => text.split(needle).length - 1;
async function sample(windowStartedAt) {
  const since = new Date(windowStartedAt).toISOString().replace("T", " ").slice(0, 19);
  const j = run("journalctl", ["-u", UNIT, "--since", `${since} UTC`, "--no-pager", "-o", "cat"], 120_000);
  const rssKb = Number(run("ps", ["-o", "rss=", "-p", String(pid)]) || 0);
  return {
    at: new Date().toISOString(), upS: Math.round((Date.now() - startedAt) / 1000), pidSame: Number(run("systemctl", ["show", UNIT, "-p", "MainPID", "--value"])) === pid,
    rssMB: Math.round(rssKb / 1024), cgroupMB: Math.round(Number(fs.readFileSync(`${cg}/memory.current`, "utf8")) / 1048576),
    heap: await evaluate(HEAP), tasks: Number(fs.readFileSync(`${cg}/pids.current`, "utf8")), procs: processes(),
    journal: { liveness: count(j, "liveness"), received: count(j, "received message from"), dispatchComplete: count(j, "dispatch complete"),
      firstText: count(j, "first-nonempty-text"), isError: count(j, "isError=true"), unhandled: count(j, "Unhandled promise rejection"),
      modelRouteChanged: count(j, "Model route changed"), compactionFallback: count(j, "falling back to LLM") + count(j, "configured but not registered"),
      slowDbOpen: count(j, "slow OpenClaw agent database open"), lines: count(j, "\n") },
    load: fs.readFileSync("/proc/loadavg", "utf8").split(" ").slice(0, 3).join(" "), traffic: { ...traffic },
  };
}
const traffic = { cycles: 0, benchOk: 0, benchRuns: 0, acceptPass: 0, acceptRuns: 0, errors: [] };
function runAs(script, args) {
  return new Promise((resolve) => {
    const child = spawn("runuser", ["--preserve-environment", "-u", "versa-rehearsal", "--", NODE, `${R}/scripts/${script}`, ...args],
      { cwd: "/tmp", env: { ...process.env, VERSA_UNIT: `${UNIT}.service` }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", () => {});
    const timer = setTimeout(() => child.kill("SIGTERM"), 9 * 60_000);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, last: stdout.trim().split("\n").pop() ?? "" }); });
  });
}
const startedAt = Date.now();
const endAt = startedAt + minutes * 60_000;
fs.mkdirSync(`${outDir}/soak-traffic`, { recursive: true }); run("chown", ["versa-rehearsal:", `${outDir}/soak-traffic`]);
log({ event: "start", label, pid, minutes, cycleS, sample: await sample(Date.now() - 300_000) });
let nextSample = startedAt + 300_000, windowStart = startedAt;
const sampler = (async () => {
  while (Date.now() < endAt + 1000) {
    await sleep(Math.max(0, Math.min(nextSample, endAt) - Date.now()));
    log({ event: "sample", ...(await sample(windowStart)) });
    windowStart = Date.now(); nextSample += 300_000;
    if (Date.now() >= endAt) break;
  }
})();
let i = 0;
while (Date.now() + 90_000 < endAt) {
  const cycleStart = Date.now(); i += 1; traffic.cycles = i;
  const b = await runAs("bench96.mjs", ["mirror", "3", `${label}-b${i}`, `${outDir}/soak-traffic`]);
  traffic.benchRuns += 1; if (b.code === 0) traffic.benchOk += 1; else traffic.errors.push(`bench${i}:${b.code}:${b.last.slice(0, 120)}`);
  const a = await runAs("accept.mjs", [`${label}-a${i}`, `${outDir}/soak-traffic`]);
  traffic.acceptRuns += 1;
  try { if (JSON.parse(a.last).pass) traffic.acceptPass += 1; else traffic.errors.push(`accept${i}:${a.last.slice(0, 160)}`); } catch { traffic.errors.push(`accept${i}:${a.code}`); }
  await sleep(Math.max(0, cycleStart + cycleS * 1000 - Date.now()));
}
await sampler;
log({ event: "end", traffic });
process.exit(0);
