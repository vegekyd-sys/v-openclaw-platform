// Candidate A/B for sqlite-hold-callsite-v1 on V's runtime bytes and a V-mirror Agent DB.
//
// A = the runtime's dist with V's original node-sqlite (b4516f85, carried as a support file),
// B = the runtime's dist with the release file (the plan's `files` entry). Shared VLab's
// node-sqlite and openclaw-agent-db are byte-identical to V's (checked 2026-10-16).
//
// Each arm runs in its own process, through the real runOpenClawAgentWriteTransaction (process
// coordinator, begin-contention retry, post-commit publications) on a private online-backup copy
// of the dealclaw Agent DB from the shared V mirror, and logs through the production subsystem
// logger to a private log file:
//   below     3 agent.write holds of SUB_MS (default 300 ms): no hold line in either arm
//   normal    BENCH_TXNS short agent.write transactions, timed: the normal path's cost
//   slowpath  SLOWPATH_TXNS in-memory transactions with slowTransactionHoldMs 0 and a no-op
//             logger, timed: what one slow-hold line costs on top of the logger
//   slow      one agent.write from vlabHoldProbeFullScan that reads every transcript_events row
//             of the copy and is held at least SLOW_MS (default 1500 ms): exactly one hold line;
//             in B its callers start at vlabHoldProbeFullScan, in A there are none
// Arms alternate A,B for ROUNDS rounds. Output: one JSON summary.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const AGENT = process.env.HOLD_AGENT ?? "dealclaw";
const NODE_SQLITE = "node-sqlite-CL-d6drd.js";
const AGENT_DB = "openclaw-agent-db-CUTe8BX6.js";
const ORIGINAL = "release/captured/v2026.9.1-db91.6-voice-task-continuity-20261016-r3/dist/node-sqlite-CL-d6drd.js";
const MARKER = "sqlite-hold-callsite-v1";

if (process.env.HOLD_ARM_DIST) await child(process.env.HOLD_ARM_DIST);
else parent();

function spin(ms) { const until = Date.now() + ms; while (Date.now() < until); }

async function child(distDir) {
  const SUB_MS = Number(process.env.SUB_MS ?? 300);
  const SLOW_MS = Number(process.env.SLOW_MS ?? 1500);
  const BENCH_TXNS = Number(process.env.BENCH_TXNS ?? 3000);
  const SLOWPATH_TXNS = Number(process.env.SLOWPATH_TXNS ?? 5000);
  const agentDb = await import(pathToFileURL(path.join(distDir, AGENT_DB)).href);
  const sqlite = await import(pathToFileURL(path.join(distDir, NODE_SQLITE)).href);
  const runWrite = agentDb.y; // runOpenClawAgentWriteTransaction
  assert.equal(runWrite.name, "runOpenClawAgentWriteTransaction");
  const options = { agentId: AGENT, env: process.env };
  const out = { pid: process.pid, arm: process.env.HOLD_ARM };
  let t = Date.now();
  runWrite(() => 0, options); // open, integrity gate, schema checks
  out.openMs = Date.now() - t;

  for (let i = 0; i < 3; i += 1) runWrite(() => spin(SUB_MS), options);
  out.belowMs = SUB_MS;

  for (let i = 0; i < 200; i += 1) runWrite((d) => d.db.prepare("SELECT 1 AS one").get(), options);
  t = process.hrtime.bigint();
  for (let i = 0; i < BENCH_TXNS; i += 1) runWrite((d) => d.db.prepare("SELECT 1 AS one").get(), options);
  out.normalUsPerTxn = Number(process.hrtime.bigint() - t) / 1e3 / BENCH_TXNS;

  {
    const { DatabaseSync } = await import("node:sqlite");
    const mem = new DatabaseSync(":memory:");
    const logger = { warn() {} };
    const opts = { logger, slowTransactionHoldMs: 0, operationLabel: "agent.write" };
    for (let i = 0; i < 200; i += 1) sqlite.u(mem, () => 0, opts);
    t = process.hrtime.bigint();
    for (let i = 0; i < SLOWPATH_TXNS; i += 1) sqlite.u(mem, () => 0, opts);
    out.slowLineUsPerTxn = Number(process.hrtime.bigint() - t) / 1e3 / SLOWPATH_TXNS;
    mem.close();
  }

  function vlabHoldProbeFullScan() {
    return runWrite((d) => {
      const started = Date.now();
      let rows = 0;
      try { for (const _ of d.db.prepare("SELECT * FROM transcript_events").iterate()) rows += 1; } catch (error) { out.scanError = String(error?.message ?? error); }
      out.scan = { rows, ms: Date.now() - started };
      spin(Math.max(0, SLOW_MS - (Date.now() - started)));
      return rows;
    }, options);
  }
  function vlabHoldProbeTurn() { return vlabHoldProbeFullScan(); }
  t = Date.now();
  vlabHoldProbeTurn();
  out.slowHoldMs = Date.now() - t;
  agentDb.a?.(); // closeOpenClawAgentDatabases
  await new Promise((resolve) => setTimeout(resolve, 500)); // let the file transport flush
  console.log(JSON.stringify(out));
}

function parent() {
  const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
  const stateDir = process.env.OPENCLAW_STATE_DIR;
  const configPath = process.env.OPENCLAW_CONFIG_PATH;
  assert(runtime && stateDir && configPath, "candidate runtime environment is required");
  const ROUNDS = Number(process.env.ROUNDS ?? 3);
  const distB = path.join(runtime, "openclaw", "dist");
  assert(fs.readFileSync(path.join(distB, NODE_SQLITE), "utf8").includes(MARKER), "runtime dist does not carry the release file");
  // A: sibling dist (same node_modules resolution) with V's original node-sqlite
  const distA = path.join(runtime, "openclaw", "dist-original");
  fs.cpSync(distB, distA, { recursive: true });
  fs.rmSync(path.join(distA, NODE_SQLITE));
  fs.copyFileSync(path.resolve(ORIGINAL), path.join(distA, NODE_SQLITE));
  assert(!fs.readFileSync(path.join(distA, NODE_SQLITE), "utf8").includes(MARKER));
  const dbPath = path.join(stateDir, "agents", AGENT, "agent", "openclaw-agent.sqlite");
  assert(fs.existsSync(dbPath), `no Agent DB copy at ${dbPath}; select it in the plan's databases`);

  // the production subsystem logger, to a private file
  const logDir = path.join(process.env.VLAB_CANDIDATE_DATA ?? stateDir, "hold-logs");
  fs.mkdirSync(logDir, { recursive: true });
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.logging = { ...(config.logging ?? {}), file: path.join(logDir, "openclaw.log"), level: "info" };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  const runs = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const [arm, dist] of [["A", distA], ["B", distB]]) {
      const result = spawnSync(process.execPath, [process.argv[1]], { env: { ...process.env, HOLD_ARM: arm, HOLD_ARM_DIST: dist }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      assert.equal(result.status, 0, `${arm} round ${round} failed: ${result.stderr.slice(-4000)}`);
      runs.push(JSON.parse(result.stdout.trim().split("\n").at(-1)));
    }
  }

  // hold lines of our children, from the private log and (if the logger ignored it) the default tmp logs
  const pids = new Map(runs.map((run) => [run.pid, run]));
  const logFiles = [];
  const collect = (dir) => { try { for (const f of fs.readdirSync(dir)) if (f.endsWith(".log")) logFiles.push(path.join(dir, f)); } catch {} };
  collect(logDir);
  for (const d of fs.readdirSync("/tmp")) if (/^openclaw/u.test(d)) collect(path.join("/tmp", d));
  const holds = [];
  const otherLines = [];
  for (const file of logFiles) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    for (const line of text.split("\n")) {
      if (!line.includes("slow SQLite transaction")) continue;
      let parsed;
      try { parsed = JSON.parse(line); } catch { continue; }
      const meta = Object.values(parsed).find((v) => v && typeof v === "object" && "elapsedMs" in v && "pid" in v);
      if (!meta || !pids.has(meta.pid)) continue;
      if (line.includes("slow SQLite transaction hold")) holds.push({ file: path.basename(file), arm: pids.get(meta.pid).arm, ...meta });
      else otherLines.push({ arm: pids.get(meta.pid).arm, ...meta, line: line.slice(0, 300) });
    }
  }
  const per = (arm) => runs.filter((r) => r.arm === arm);
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const checks = {};
  for (const run of runs) {
    const mine = holds.filter((h) => h.pid === run.pid);
    run.holdLines = mine.length;
    checks[`${run.arm}:${run.pid}:one hold line (the slow one; none for ${run.belowMs} ms holds or the bench)`] = mine.length === 1 && mine[0].elapsedMs >= 1000;
    if (run.arm === "B") checks[`B:${run.pid}:callers start at vlabHoldProbeFullScan`] = /^vlabHoldProbeFullScan /u.test(mine[0]?.callers?.[0] ?? "") && /^vlabHoldProbeTurn /u.test(mine[0]?.callers?.[1] ?? "");
    else checks[`A:${run.pid}:no callers`] = mine.length > 0 && mine[0].callers === undefined;
  }
  const summary = {
    agent: AGENT,
    dbBytes: fs.statSync(dbPath).size,
    logFiles: logFiles.map((f) => path.relative("/", f)),
    rounds: ROUNDS,
    runs,
    holds,
    otherLines,
    normalUsPerTxn: { A: median(per("A").map((r) => r.normalUsPerTxn)), B: median(per("B").map((r) => r.normalUsPerTxn)) },
    slowLineUsPerTxn: { A: median(per("A").map((r) => r.slowLineUsPerTxn)), B: median(per("B").map((r) => r.slowLineUsPerTxn)) },
    checks,
    ok: Object.values(checks).every(Boolean),
  };
  console.log(JSON.stringify(summary, null, 2));
  fs.rmSync(distA, { recursive: true, force: true });
  if (!summary.ok) process.exitCode = 1;
}
