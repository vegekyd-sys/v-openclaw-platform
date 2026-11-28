// Candidate rehearsal for scripts/v-memory-vec-rebuild.mjs on a copy of the shared VLab
// makaron agent database: how long the rebuild holds the write lock, how much disk it
// needs at peak, that KNN answers are identical after it, that the rollback restores the
// table exactly, and how much faster a KNN scan gets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { open, stats, knnProbe, scanMs } from "../../scripts/v-memory-vec-rebuild.mjs";

const state = process.env.OPENCLAW_STATE_DIR;
const data = process.env.VLAB_CANDIDATE_DATA;
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(state && data && runtime, "candidate environment is required");
const db = path.join(state, "agents/makaron/agent/openclaw-agent.sqlite");
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/v-memory-vec-rebuild.mjs");
const backupFile = path.join(data, "vec-backup.sqlite");
const find = (dir, name) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    if (e.isDirectory()) { const hit = find(p, name); if (hit) return hit; }
  }
  return null;
};
const extension = find(path.join(runtime, "openclaw/node_modules"), "vec0.so");
const size = (f) => (fs.existsSync(f) ? fs.statSync(f).size : 0);
const mb = (b) => Math.round(b / 1048576);

function runScript(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--no-warnings", script, "--db", db, "--extension", extension, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let peak = { db: 0, wal: 0, backup: 0 };
    const poll = setInterval(() => {
      peak = { db: Math.max(peak.db, size(db)), wal: Math.max(peak.wal, size(`${db}-wal`)), backup: Math.max(peak.backup, size(backupFile)) };
    }, 200);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => { clearInterval(poll); resolve({ code, out, peak }); });
  });
}

const r = {};

test("baseline: table state, probes and scan speed", () => {
  assert(extension, "sqlite-vec loadable not found in the runtime");
  assert(fs.existsSync(db) && path.resolve(db).startsWith(path.resolve(state)));
  const h = open(db, extension);
  r.before = stats(h);
  r.probe = knnProbe(h);
  r.scanBeforeMs = scanMs(h);
  h.close();
  r.dbBytes = size(db);
  console.log(JSON.stringify({ before: r.before, scanBeforeMs: r.scanBeforeMs, dbMB: mb(r.dbBytes) }));
  assert(r.before.vectors > 1000);
});

test("rebuild: identical KNN answers, slots = live vectors rounded up to a block", async () => {
  const run = await runScript(["--backup", backupFile, "--apply"]);
  assert.equal(run.code, 0, run.out.slice(-2000));
  const report = JSON.parse(run.out.slice(run.out.indexOf("{")));
  const h = open(db, extension);
  const after = stats(h);
  const check = knnProbe(h, r.probe.ids);
  r.scanAfterMs = scanMs(h);
  h.close();
  console.log(JSON.stringify({ report: { ...report, before: undefined, after: undefined }, after, scanAfterMs: r.scanAfterMs, peakMB: { db: mb(run.peak.db), wal: mb(run.peak.wal), backup: mb(run.peak.backup) }, extraDiskPeakMB: mb(run.peak.db - r.dbBytes + run.peak.wal + run.peak.backup) }));
  assert.equal(report.rolledBack, undefined, report.rolledBack);
  assert.equal(report.knnIdentical, true);
  assert.equal(after.vectors, r.before.vectors);
  const blockSize = r.before.slots / r.before.blocks; // vec0 chunk_size: 1024 on VLab, 64 on V
  assert.equal(after.slots, Math.ceil(after.vectors / blockSize) * blockSize, `slots ${after.slots} for ${after.vectors} vectors`);
  assert.deepEqual(check.results, r.probe.results);
});

test("rollback: the backup restores the original table exactly", async () => {
  const run = await runScript(["--backup", backupFile, "--restore"]);
  assert.equal(run.code, 0, run.out.slice(-2000));
  const report = JSON.parse(run.out.slice(run.out.indexOf("{")));
  const h = open(db, extension);
  const restored = stats(h);
  const check = knnProbe(h, r.probe.ids);
  h.close();
  console.log(JSON.stringify({ restoreMs: report.restoreMs, restored }));
  assert.equal(restored.slots, r.before.slots);
  assert.equal(restored.vectors, r.before.vectors);
  assert.deepEqual(check.results, r.probe.results);
});

test("prune cache: rows no chunk uses, time and space freed", async () => {
  const run = await runScript(["--prune-cache"]);
  assert.equal(run.code, 0, run.out.slice(-2000));
  const report = JSON.parse(run.out.slice(run.out.indexOf("{")));
  console.log(JSON.stringify({ pruneCache: report.pruneCache, walPeakMB: mb(run.peak.wal) }));
  const h = open(db, extension);
  const left = h.prepare("SELECT count(*) AS n FROM memory_embedding_cache c WHERE NOT EXISTS (SELECT 1 FROM memory_index_chunks k WHERE k.hash = c.hash AND k.model = c.model)").get().n;
  const check = knnProbe(h, r.probe.ids);
  h.close();
  assert.equal(left, 0);
  assert.deepEqual(check.results, r.probe.results, "search answers unchanged");
});

test("compact estimate: VACUUM INTO a file on another disk (time, size, search unchanged)", async () => {
  const tmp = fs.mkdtempSync("/var/tmp/vec-rebuild-vacuum-");
  const target = path.join(tmp, "compacted.sqlite");
  try {
    const code = `const { DatabaseSync } = require("node:sqlite"); const d = new DatabaseSync(process.argv[1]); const s = performance.now(); d.prepare("VACUUM INTO ?").run(process.argv[2]); console.log(JSON.stringify({ vacuumIntoMs: Math.round(performance.now() - s) }));`;
    const res = await new Promise((resolve) => {
      const child = spawn(process.execPath, ["--no-warnings", "-e", code, db, target], { env: { ...process.env, SQLITE_TMPDIR: tmp, TMPDIR: tmp }, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
      child.on("close", (c) => resolve({ c, out }));
    });
    assert.equal(res.c, 0, res.out);
    const h = open(target, extension);
    const check = knnProbe(h, r.probe.ids);
    const scan = scanMs(h);
    const st = stats(h);
    h.close();
    console.log(JSON.stringify({ vacuum: JSON.parse(res.out.slice(res.out.indexOf("{"))), dbMB: { before: mb(size(db)), compacted: mb(size(target)) }, scanAfterCompactMs: scan, vec: st }));
    assert.deepEqual(check.results, r.probe.results);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test.after(() => fs.rmSync(backupFile, { force: true }));
