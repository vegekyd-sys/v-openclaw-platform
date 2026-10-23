// doctor-subprocess A/B on a copy of shared VLab's makaron agent database (see lab/doctor-subprocess.md).
//
// This process stands in for the Gateway: it calls executeSystemAgentOperation({ kind: "doctor" }) the
// way the `openclaw` tool does (capture runtime, approved: false, setupSurface "gateway") and measures
// its own main thread while the operation runs: a 20 ms heartbeat (largest gap, time spent in gaps
// over 100 ms) and event-loop utilization.
//
// Arms (ARMS, comma separated, in order):
//   base          V's operations chunk (loaded under another name): doctor in this process
//   patched       release chunk: doctor in a child, transcript scans skipped
//   patched-full  release chunk with OPENCLAW_V_DOCTOR_TRANSCRIPT_SCANS=1: child, scans kept
//   lint          `openclaw doctor --lint` in a child, for comparison only (upstream's hosted doctor)
// The plan installs both release files, so the base arm's doctor loads the patched contribution
// chunk too; without OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS it runs V's contribution list.
//
// INFLATE=k adds k copies of every transcript session (transcript_events rows only, under new session
// ids) to reach V's transcript volume; shared VLab's makaron database has ~0.5 GB of transcripts, V ~15 GB.
// The managed npm plugins (codex etc.) are copied from shared VLab, as V has them installed.
//
// The report of each arm (base: everything doctor wrote to stdout/stderr plus the capture runtime;
// child arms: the capture runtime) is saved under EVIDENCE_DIR and diffed against base.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const runtimeRoot = process.env.VLAB_CANDIDATE_RUNTIME;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtimeRoot && stateDir && configPath, "candidate runtime environment is required");
const DIST = path.join(runtimeRoot, "openclaw", "dist");
const ARMS = (process.env.ARMS ?? "base,patched,patched-full,lint").split(",").filter(Boolean);
const EVIDENCE_DIR = process.env.EVIDENCE_DIR ?? path.join(process.env.VLAB_CANDIDATE_DATA ?? stateDir, "doctor-ab");
const INFLATE = Number(process.env.INFLATE ?? 0);
const OPERATIONS = "operations-CTofDiKh.js";
const sha = (value) => createHash("sha256").update(value).digest("hex");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const progressLog = path.join(EVIDENCE_DIR, "progress.log");
const out = { arms: {} };
const log = (key, value) => {
  const line = `[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`;
  fs.appendFileSync(progressLog, `${line}\n`);
  process.stderr.write(`${line}\n`);
};

// V's session.maintenance is warn; keep VLab's enforce mode out of the candidate copy.
{
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.session = { ...config.session, maintenance: { ...config.session?.maintenance, mode: "warn" } };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
const agentDb = path.join(stateDir, "agents", "makaron", "agent", "openclaw-agent.sqlite");
assert(fs.existsSync(agentDb), `makaron database copy missing at ${agentDb} (plan.databases)`);
if (INFLATE > 0) {
  const started = performance.now();
  execFileSync("python3", ["-c", String.raw`import sqlite3,sys
db=sqlite3.connect(sys.argv[1],isolation_level=None)
db.execute('pragma foreign_keys=off')
for k in range(1,int(sys.argv[2])+1):
    db.execute('begin')
    db.execute("insert into transcript_events(session_id,seq,event_json,created_at) select session_id||'~x'||?,seq,event_json,created_at from transcript_events where instr(session_id,'~x')=0",(k,))
    db.execute('commit')
db.execute('pragma wal_checkpoint(truncate)')`, agentDb, String(INFLATE)], { stdio: "inherit" });
  out.inflateMs = Math.round(performance.now() - started);
}
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
if (sharedState && !fs.existsSync(path.join(stateDir, "npm"))) {
  execFileSync("cp", ["-a", "--reflink=auto", path.join(sharedState, "npm"), path.join(stateDir, "npm")]);
  out.npmPluginsCopied = true;
}
out.database = { path: agentDb, bytes: fs.statSync(agentDb).size, inflate: INFLATE };
out.transcripts = JSON.parse(execFileSync("python3", ["-c", String.raw`import json,sqlite3,sys
db=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
print(json.dumps(dict(zip(['sessions','rows','eventJsonBytes'],db.execute('select count(distinct session_id),count(*),sum(length(event_json)) from transcript_events').fetchone()))))`, agentDb], { encoding: "utf8" }));
log("data", out);

// ---- the two operations chunks, side by side ----
const plan = JSON.parse(fs.readFileSync("lab/doctor-subprocess.plan.json", "utf8"));
const opsPlan = plan.files.find((file) => file.target.endsWith(OPERATIONS));
const installed = fs.readFileSync(path.join(DIST, OPERATIONS), "utf8");
assert.equal(sha(installed), opsPlan.after, "release operations chunk installed");
for (const file of plan.files) assert.equal(sha(fs.readFileSync(path.join(DIST, path.basename(file.target)))), file.after, `${file.target} installed`);
const { unpatch } = await import(path.resolve("lab/patch-doctor-subprocess.mjs"));
const vBytes = unpatch(OPERATIONS, installed);
assert.equal(sha(vBytes), opsPlan.before, "V operations bytes");
const baseCopy = path.join(DIST, OPERATIONS.replace(/\.js$/u, ".DOCTORAB.js"));
fs.writeFileSync(baseCopy, vBytes);
process.on("exit", () => fs.rmSync(baseCopy, { force: true }));
const chunks = { base: (await import(baseCopy)).t, patched: (await import(path.join(DIST, OPERATIONS))).t };

// ---- what changes on disk (state files: size + mtime) ----
function snapshotState() {
  const files = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (full.startsWith(EVIDENCE_DIR) || entry.name === "logs") continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const stat = fs.statSync(full);
        files.set(path.relative(stateDir, full), `${stat.size}:${stat.mtimeMs}`);
      }
    }
  };
  walk(stateDir);
  return files;
}
const changedFiles = (before, after) => [...new Set([...before.keys(), ...after.keys()])].filter((key) => before.get(key) !== after.get(key)).sort();

// ---- main-thread measurement ----
async function measure(arm, run) {
  const gaps = [];
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    gaps.push(now - last - 20);
    last = now;
  }, 20);
  const children = new Map();
  const sampler = setInterval(() => {
    try {
      for (const line of execFileSync("ps", ["-o", "pid=,ni=,pcpu=,rss=,args=", "--ppid", String(process.pid)], { encoding: "utf8" }).trim().split("\n")) {
        const [pid, ni, pcpu, rss, ...args] = line.trim().split(/\s+/);
        if (!/ doctor/.test(args.join(" "))) continue;
        const ioClass = execFileSync("ionice", ["-p", pid], { encoding: "utf8" }).trim();
        const seen = children.get(pid) ?? { nice: Number(ni), ioClass, args: args.join(" ").slice(0, 160), maxCpuPercent: 0, maxRssMb: 0 };
        seen.maxCpuPercent = Math.max(seen.maxCpuPercent, Number(pcpu));
        seen.maxRssMb = Math.max(seen.maxRssMb, Math.round(Number(rss) / 1024));
        children.set(pid, seen);
      }
    } catch {}
  }, 2000);
  const elu = performance.eventLoopUtilization();
  const before = snapshotState();
  const started = performance.now();
  let error;
  try {
    await run();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const wallMs = performance.now() - started;
  const utilization = performance.eventLoopUtilization(elu).utilization;
  clearInterval(timer);
  clearInterval(sampler);
  const sorted = [...gaps].sort((a, b) => a - b);
  const blocked = gaps.filter((gap) => gap > 100);
  const result = {
    wallMs: Math.round(wallMs),
    eventLoopUtilization: Number(utilization.toFixed(3)),
    heartbeat: {
      ticks: gaps.length,
      maxGapMs: Math.round(sorted.at(-1) ?? 0),
      p99GapMs: Math.round(sorted[Math.floor(sorted.length * 0.99)] ?? 0),
      gapsOver100ms: blocked.length,
      gapsOver1s: gaps.filter((gap) => gap > 1000).length,
      blockedMsInGapsOver100ms: Math.round(blocked.reduce((sum, gap) => sum + gap, 0))
    },
    changedStateFiles: changedFiles(before, snapshotState()),
    children: [...children.values()],
    ...error ? { error } : {}
  };
  return result;
}

function captureRuntime() {
  const lines = [];
  return {
    lines,
    log: (...args) => lines.push(args.join(" ")),
    error: (...args) => lines.push(args.join(" ")),
    exit: (code) => {
      throw new Error(`openclaw operation exited with code ${String(code)}`);
    }
  };
}
const operationOpts = { approved: false, deps: { setupSurface: "gateway" } };

async function runArm(arm) {
  const runtime = captureRuntime();
  let report;
  if (arm === "base") {
    // doctor's notes go to process.stdout (the Gateway journal on V); collect them with the runtime's lines
    const writes = [];
    const original = { out: process.stdout.write, err: process.stderr.write };
    const hook = (stream) => function (chunk, encoding, callback) {
      writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      if (typeof encoding === "function") encoding();
      else if (typeof callback === "function") callback();
      return true;
    };
    process.stdout.write = hook("out");
    process.stderr.write = hook("err");
    let measured;
    try {
      measured = await measure(arm, () => chunks.base({ kind: "doctor" }, runtime, operationOpts));
    } finally {
      process.stdout.write = original.out;
      process.stderr.write = original.err;
    }
    report = [...writes.join("").split("\n"), ...runtime.lines];
    out.arms[arm] = measured;
  } else if (arm === "patched" || arm === "patched-full") {
    if (arm === "patched-full") process.env.OPENCLAW_V_DOCTOR_TRANSCRIPT_SCANS = "1";
    try {
      out.arms[arm] = await measure(arm, () => chunks.patched({ kind: "doctor" }, runtime, operationOpts));
    } finally {
      delete process.env.OPENCLAW_V_DOCTOR_TRANSCRIPT_SCANS;
    }
    report = runtime.lines;
  } else if (arm === "lint") {
    out.arms[arm] = await measure(arm, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(DIST, "index.js"), "doctor", "--lint"], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.on("data", (chunk) => runtime.lines.push(...chunk.toString("utf8").split("\n")));
      child.stderr.on("data", (chunk) => runtime.lines.push(...chunk.toString("utf8").split("\n")));
      child.once("error", reject);
      child.once("close", (code) => {
        out.arms[arm] = { ...out.arms[arm], exitCode: code };
        resolve();
      });
    }));
    report = runtime.lines;
  } else throw new Error(`unknown arm ${arm}`);
  // eslint-disable-next-line no-control-regex
  const text = report.map((line) => line.replace(/\u001b\[[0-9;]*m/g, "").trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  fs.writeFileSync(path.join(EVIDENCE_DIR, `${arm}.txt`), `${text}\n`);
  out.arms[arm].reportLines = text.split("\n").length;
  out.arms[arm].reportBytes = Buffer.byteLength(text);
  out.arms[arm].sections = [...text.matchAll(/^[◇└┌]\s+(.+?)\s*[─]*$/gmu)].map((match) => match[1].replace(/\s*─.*$/u, ""));
  log(arm, out.arms[arm]);
}

for (const arm of ARMS) await runArm(arm);

// ---- report equivalence: every child arm against base ----
if (out.arms.base) {
  for (const arm of ["patched", "patched-full"].filter((name) => out.arms[name])) {
    let diff = "";
    try {
      execFileSync("diff", ["-u", path.join(EVIDENCE_DIR, "base.txt"), path.join(EVIDENCE_DIR, `${arm}.txt`)], { encoding: "utf8" });
    } catch (error) {
      diff = error.stdout;
    }
    fs.writeFileSync(path.join(EVIDENCE_DIR, `base-vs-${arm}.diff`), diff);
    const removed = out.arms.base.sections.filter((section, index, all) => all.slice(0, index).filter((s) => s === section).length >= out.arms[arm].sections.filter((s) => s === section).length);
    out.arms[arm].sectionsVsBase = { onlyInBase: removed, onlyHere: out.arms[arm].sections.filter((section, index, all) => all.slice(0, index).filter((s) => s === section).length >= out.arms.base.sections.filter((s) => s === section).length) };
    out.arms[arm].diffLines = diff.split("\n").filter((line) => /^[-+][^-+]/.test(line)).length;
  }
}
log("result", out);
console.log(JSON.stringify(out, null, 2));
