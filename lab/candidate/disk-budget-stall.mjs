// Candidate evidence for disk-budget-stall-v1 (2026-10-15 V Gateway stall).
//
// One arm per process: `node disk-budget-stall.mjs A|B [scenario]`.
//   A = V's live bytes (lab/fixtures/disk-budget-stall/*), loaded beside the runtime
//       chunks under private names so both arms share every other real sibling.
//   B = the patched release files the candidate installed into openclaw/dist.
//
// A private OPENCLAW_STATE_DIR holds a real makaron Agent DB (created by the runtime)
// and a sessions directory shaped like V's: ~30k regular files whose apparent size
// (sparse) puts the store over session.maintenance.maxDiskBytes, plus canonical
// archives (rows in session_transcript_archives + .zst files) and legacy dash archives.
//
// Scenarios:
//   exhausted  over budget, high water unreachable (V on 10/15): one enforcement pass.
//   reachable  high water reachable by deleting some archives: both arms must delete
//              the same oldest archives and stop at the same point.
//   kicks      (B) forced kicks coalesce to one pass per minute; an exhausted pass
//              backs off; (A) every forced kick starts another full pass.
//
// While a pass runs, a probe asks for the session writer (runExclusiveSqliteSessionWrite,
// the queue Feishu inbound metadata writes wait on) every 250 ms and records the wait;
// monitorEventLoopDelay and ELU record what the Gateway main thread would see.
// Output: one JSON line on stdout. Assertion failures exit non-zero.
import strictAssert from "node:assert/strict";
// Results are printed before any check fails, so a failing arm still leaves its numbers.
const checks = [];
const assert = Object.assign((...a) => strictAssert(...a), {
  equal: (...a) => checks.push(() => strictAssert.equal(...a)),
  ok: (...a) => checks.push(() => strictAssert.ok(...a)),
  deepEqual: (...a) => checks.push(() => strictAssert.deepEqual(...a))
});
import fs from "node:fs";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const arm = process.argv[2];
const scenario = process.argv[3] ?? "exhausted";
assert(arm === "A" || arm === "B", "arm must be A or B");
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const dataRoot = process.env.VLAB_CANDIDATE_DATA ?? process.env.TMPDIR ?? "/tmp";
assert(runtime, "VLAB_CANDIDATE_RUNTIME is required");
const dist = path.join(runtime, "openclaw", "dist");
const FILES = Number(process.env.DBS_FILES ?? 30000);
const ARCHIVES = Number(process.env.DBS_ARCHIVES ?? 120);
const LEGACY = Number(process.env.DBS_LEGACY ?? 40);
const FILE_BYTES = 580 * 1024;
const ARCHIVE_BYTES = 2 * 1024 * 1024;
const GiB = 1024 ** 3;

const EVICTION = "session-history-eviction-d5aiCsHS.js";
const BUDGET = "disk-budget-BzLS0kmH.js";
const patched = fs.readFileSync(path.join(dist, EVICTION), "utf8");
assert(patched.includes("disk-budget-stall-v1"), "runtime does not carry the patched eviction chunk");
let evictionFile = EVICTION;
if (arm === "A") {
  // V's live bytes under private names; only the budget import is redirected.
  const fixtures = path.resolve("lab/fixtures/disk-budget-stall");
  const budgetA = fs.readFileSync(path.join(fixtures, BUDGET), "utf8");
  const evictionA = fs.readFileSync(path.join(fixtures, EVICTION), "utf8").replaceAll(`"./${BUDGET}"`, '"./disk-budget-armA.js"');
  assert(!evictionA.includes("disk-budget-stall-v1") && !budgetA.includes("disk-budget-scan-v1"));
  fs.writeFileSync(path.join(dist, "disk-budget-armA.js"), budgetA);
  fs.writeFileSync(path.join(dist, "session-history-eviction-armA.js"), evictionA);
  evictionFile = "session-history-eviction-armA.js";
}

// db91 pins the state database to the runner's OPENCLAW_STATE_DIR; use a private agent in it.
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(stateDir, "OPENCLAW_STATE_DIR is required");
const AGENT = `dbstall${arm.toLowerCase()}${Date.now().toString(36)}`;
const state = path.join(stateDir, "agents", AGENT);
const sessionsDir = path.join(state, "sessions");
fs.mkdirSync(sessionsDir, { recursive: true });
const storePath = path.join(sessionsDir, "sessions.json");

// Count full directory scans and synchronous realpath calls made by the pass.
let scans = 0;
let realpathSyncCalls = 0;
const readdir = fs.promises.readdir;
fs.promises.readdir = async function (dir, ...rest) {
  if (path.resolve(String(dir)) === sessionsDir) scans += 1;
  return await readdir.call(this, dir, ...rest);
};
const realpathSync = fs.realpathSync;
const countedRealpathSync = function (...args) {
  realpathSyncCalls += 1;
  return realpathSync.apply(this, args);
};
countedRealpathSync.native = function (...args) {
  realpathSyncCalls += 1;
  return realpathSync.native.apply(this, args);
};
fs.realpathSync = countedRealpathSync;

const load = async (name) => await import(pathToFileURL(path.join(dist, name)).href);
const eviction = await load(evictionFile);
const scope = await load("session-accessor.sqlite-scope-BwPKGcgm.js");
const agentDb = await load("openclaw-agent-db-CUTe8BX6.js");
const enforce = eviction.n;
const kick = eviction.i;
const runWriter = scope.p;
const resolved = scope.c({ agentId: AGENT, sessionKey: "", storePath });
const databaseOptions = scope.m(resolved);
const database = agentDb.g(databaseOptions);
const dbPath = database.path;

// ---- fixture ----
const t0 = performance.now();
for (let i = 0; i < FILES; i += 1) {
  const fd = fs.openSync(path.join(sessionsDir, `${String(i).padStart(8, "0")}-legacy.trajectory.jsonl`), "w");
  fs.ftruncateSync(fd, FILE_BYTES);
  fs.closeSync(fd);
}
const raw = new DatabaseSync(dbPath);
const insert = raw.prepare(`INSERT INTO session_transcript_archives
  (session_id, generation, session_key, reason, encoding, archive_blob, archive_sha256, archive_name, created_at, published_at)
  VALUES (?, ?, ?, 'deleted', 'zstd', x'00', ?, ?, ?, ?)`);
const archiveNames = [];
const baseMs = Date.parse("2026-10-01T00:00:00Z");
for (let i = 0; i < ARCHIVES; i += 1) {
  const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const stamp = new Date(baseMs + i * 60000).toISOString().replace(/:/g, "-");
  const name = `${id}.jsonl.deleted.${stamp}.${"a".repeat(32)}.zst`;
  archiveNames.push(name);
  insert.run(id, "g1", `agent:${AGENT}:test:${i}`, "0".repeat(64), name, baseMs + i * 60000, baseMs + i * 60000);
  const fd = fs.openSync(path.join(sessionsDir, name), "w");
  fs.ftruncateSync(fd, ARCHIVE_BYTES);
  fs.closeSync(fd);
}
raw.close();
for (let i = 0; i < LEGACY; i += 1) {
  const stamp = new Date(baseMs - (LEGACY - i) * 60000).toISOString().replace(/:/g, "-");
  const name = `legacy-${i}.jsonl.deleted.${stamp}`;
  const fd = fs.openSync(path.join(sessionsDir, name), "w");
  fs.ftruncateSync(fd, ARCHIVE_BYTES);
  fs.closeSync(fd);
  fs.utimesSync(path.join(sessionsDir, name), new Date(baseMs - (LEGACY - i) * 60000), new Date(baseMs - (LEGACY - i) * 60000));
}
const fixtureMs = Math.round(performance.now() - t0);
const dirBytes = FILES * FILE_BYTES + ARCHIVES * ARCHIVE_BYTES + LEGACY * ARCHIVE_BYTES;

const remainingArchives = () => {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare("SELECT archive_name FROM session_transcript_archives ORDER BY created_at").all().map((r) => r.archive_name);
  } finally {
    db.close();
  }
};
const archiveFilesLeft = () => fs.readdirSync(sessionsDir).filter((n) => n.endsWith(".zst")).length;
const legacyFilesLeft = () => fs.readdirSync(sessionsDir).filter((n) => n.startsWith("legacy-")).length;

// ---- probes ----
async function observe(run) {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const elu0 = performance.eventLoopUtilization();
  const writerWaits = [];
  let probing = true;
  let pendingProbeStartedAt = null;
  const probe = (async () => {
    while (probing) {
      const start = performance.now();
      pendingProbeStartedAt = start;
      await runWriter(resolved, async () => {});
      pendingProbeStartedAt = null;
      writerWaits.push(performance.now() - start);
      await new Promise((r) => setTimeout(r, 250));
    }
  })();
  const started = performance.now();
  const scans0 = scans;
  const realpath0 = realpathSyncCalls;
  const result = await run();
  const elapsedMs = performance.now() - started;
  // The probe still queued behind the pass when it ended waited at least this long.
  const tailWait = pendingProbeStartedAt == null ? 0 : performance.now() - pendingProbeStartedAt;
  probing = false;
  await probe;
  histogram.disable();
  const elu = performance.eventLoopUtilization(elu0);
  const sorted = [...writerWaits].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]) : null);
  return {
    result,
    elapsedMs: Math.round(elapsedMs),
    scans: scans - scans0,
    realpathSyncCalls: realpathSyncCalls - realpath0,
    eventLoop: {
      maxMs: Math.round(histogram.max / 1e6),
      p99Ms: Math.round(histogram.percentile(99) / 1e6),
      elu: Number(elu.utilization.toFixed(3))
    },
    writer: {
      probes: writerWaits.length,
      p50Ms: pct(0.5),
      p99Ms: pct(0.99),
      maxMs: Math.round(Math.max(0, ...writerWaits, tailWait)),
      longestQueuedMs: Math.round(Math.max(tailWait, ...writerWaits))
    }
  };
}

const out = { arm, scenario, files: FILES, archives: ARCHIVES, legacy: LEGACY, dirGiB: Number((dirBytes / GiB).toFixed(2)), fixtureMs };

if (scenario === "exhausted") {
  // V on 10/15: over maxDiskBytes, high water below what deleting every archive reaches.
  // Even with every archive gone the plain files alone stay over the budget (V: DB + legacy).
  const maxDiskBytes = FILES * FILE_BYTES - GiB;
  const highWaterBytes = Math.floor(dirBytes * 0.8);
  const maintenance = { mode: "enforce", maxDiskBytes, highWaterBytes, preserveRecentMs: null };
  out.budget = { maxDiskBytes, highWaterBytes };
  out.pass = await observe(async () => await enforce({ agentId: AGENT, storePath, mode: "enforce", maintenance }));
  out.archiveRowsLeft = remainingArchives().length;
  out.archiveFilesLeft = archiveFilesLeft();
  out.legacyFilesLeft = legacyFilesLeft();
  assert.equal(out.archiveRowsLeft, 0, "every canonical archive is pruned when high water is unreachable");
  assert.equal(out.archiveFilesLeft, 0);
  assert.equal(out.legacyFilesLeft, 0, "legacy dash archives are pruned after canonical ones");
  assert.ok(out.pass.result.overBudget && out.pass.result.totalBytesAfter > maxDiskBytes);
  assert.equal(out.pass.result.removedFiles, ARCHIVES + LEGACY);
}

if (scenario === "reachable") {
  // Deleting the 30 oldest archives (and nothing else) brings the store to high water.
  const keep = 30;
  const before = dirBytes + fs.statSync(dbPath).size + (fs.existsSync(`${dbPath}-wal`) ? fs.statSync(`${dbPath}-wal`).size : 0);
  const highWaterBytes = before - keep * ARCHIVE_BYTES + Math.floor(ARCHIVE_BYTES / 2);
  const maintenance = { mode: "enforce", maxDiskBytes: before - 1, highWaterBytes, preserveRecentMs: null };
  out.budget = { maxDiskBytes: before - 1, highWaterBytes };
  out.pass = await observe(async () => await enforce({ agentId: AGENT, storePath, mode: "enforce", maintenance }));
  const left = remainingArchives();
  out.archiveRowsLeft = left.length;
  out.archiveFilesLeft = archiveFilesLeft();
  out.legacyFilesLeft = legacyFilesLeft();
  out.oldestLeft = left[0];
  assert.equal(out.legacyFilesLeft, LEGACY, "legacy archives untouched when canonical pruning suffices");
  assert.equal(out.archiveFilesLeft, out.archiveRowsLeft, "rows and files stay paired");
  assert.deepEqual(left, archiveNames.slice(ARCHIVES - out.archiveRowsLeft), "oldest archives go first");
  assert.ok(out.pass.result.totalBytesAfter <= highWaterBytes);
}

if (scenario === "kicks") {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Part 1, under budget (V most of 10/15): a delete or reset every second for 30 s.
  // Each forced kick in A starts a full scan; B coalesces to one per minute.
  const under = { mode: "enforce", maxDiskBytes: dirBytes * 2, highWaterBytes: dirBytes * 2 - 1, preserveRecentMs: null };
  const scans0 = scans;
  out.underBudget = await observe(async () => {
    for (let i = 0; i < 30; i += 1) {
      kick({ agentId: AGENT, storePath, maintenanceConfig: under, force: true });
      await sleep(1000);
    }
    const in30s = scans - scans0;
    await sleep(35000);
    return { kicks: 30, scansIn30s: in30s, scansIn65s: scans - scans0 };
  });
  if (arm === "B") {
    assert.equal(out.underBudget.result.scansIn30s, 1, "forced kicks coalesce inside one minute");
    assert.equal(out.underBudget.result.scansIn65s, 2, "the deferred forced check runs once after the minute");
  } else {
    assert.ok(out.underBudget.result.scansIn30s >= 10, "A rescans back to back while forced kicks keep coming");
  }
  // Part 2, over budget and unreachable: after one exhausted pass, kicks back off.
  const over = { mode: "enforce", maxDiskBytes: FILES * FILE_BYTES - GiB, highWaterBytes: Math.floor(dirBytes * 0.8), preserveRecentMs: null };
  const scans1 = scans;
  out.overBudget = await observe(async () => {
    await sleep(61000);
    kick({ agentId: AGENT, storePath, maintenanceConfig: over, force: true });
    let last = -1;
    const deadline = performance.now() + 20 * 60000;
    while (performance.now() < deadline) {
      await sleep(5000);
      const now = scans - scans1;
      if (now === last && remainingArchives().length === 0) break;
      last = now;
    }
    const passScans = scans - scans1;
    const scans2 = scans;
    for (let i = 0; i < 10; i += 1) {
      kick({ agentId: AGENT, storePath, maintenanceConfig: over, force: true });
      kick({ agentId: AGENT, storePath, maintenanceConfig: over });
      await sleep(7000);
    }
    return { passScans, scansAfterExhausted: scans - scans2 };
  });
  if (arm === "B") assert.equal(out.overBudget.result.scansAfterExhausted, 0, "exhausted budget backs off");
}

console.log(JSON.stringify(out));
let failed = 0;
for (const check of checks) {
  try {
    check();
  } catch (error) {
    failed += 1;
    console.error(error.message);
  }
}
fs.rmSync(state, { recursive: true, force: true });
if (arm === "A") {
  fs.rmSync(path.join(dist, "disk-budget-armA.js"), { force: true });
  fs.rmSync(path.join(dist, "session-history-eviction-armA.js"), { force: true });
}
process.exit(failed ? 1 : 0);
