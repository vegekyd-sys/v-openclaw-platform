// Candidate test for scripts/v-memory-indexer.mjs under a Librarian-style write burst.
//
// On 2026-10-02 21:16 a Librarian commit burst froze V's Gateway for 127 s: a memory file
// changed while the indexer was indexing it, upstream escalated the next sync to a full
// in-place reindex, and its table publish held the makaron agent database's write lock
// for 327 s while the Gateway waited for it on its main thread.
//
// The shared VLab index was built with V's Gemini embeddings, which VLab has no key for,
// so its identity never matches here. The candidate instead copies the shared makaron
// memory files (3.8k files) into its own workspace and indexes them keyword-only (FTS,
// trigram) into a fresh agent database. That reproduces the mechanism, not V's scale:
// there are no vector writes and no embedding latency.
// A probe process takes the write lock the way the Gateway does (BEGIN IMMEDIATE, busy
// timeout 5 s) every 250 ms and records how long each attempt waited.
// Phase A runs the indexer that was on V during the freeze (it also builds the initial
// index); phase B runs the fixed indexer on a second burst against the same database.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const data = process.env.VLAB_CANDIDATE_DATA;
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const state = process.env.OPENCLAW_STATE_DIR;
const cfgPath = process.env.OPENCLAW_CONFIG_PATH;
assert(data && runtime && state && cfgPath, "candidate environment is required");
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const makaronWorkspace = (c) => c.agents?.entries?.makaron?.workspace ?? c.agents?.list?.find((a) => a.id === "makaron")?.workspace;
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const workspace = makaronWorkspace(cfg);
const sharedWorkspace = makaronWorkspace(JSON.parse(fs.readFileSync(process.env.VLAB_SHARED_CONFIG_PATH, "utf8")));
const db = path.join(state, "agents/makaron/agent/openclaw-agent.sqlite");
const memoryDir = path.join(workspace, "memory");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixed = path.join(root, "scripts/v-memory-indexer.mjs");
const findFile = (dir, name) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return p;
    if (entry.isDirectory() && entry.name !== "node_modules") {
      const hit = findFile(p, name);
      if (hit) return hit;
    }
  }
  return null;
};
const legacy = findFile(root, "v-memory-indexer.legacy.mjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const summary = {};

function lockProbe() {
  const code = `const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1]);
db.exec("PRAGMA busy_timeout = 5000");
db.exec("CREATE TABLE IF NOT EXISTS claude_lock_probe (ts INTEGER)");
setInterval(() => {
  const t = performance.now();
  let ok = 1;
  try { db.exec("BEGIN IMMEDIATE"); db.prepare("INSERT INTO claude_lock_probe VALUES (?)").run(Date.now()); db.exec("COMMIT"); }
  catch { ok = 0; try { db.exec("ROLLBACK"); } catch {} }
  process.stdout.write(JSON.stringify({ at: Date.now(), ms: Math.round(performance.now() - t), ok }) + "\\n");
}, 250);`;
  const child = spawn(process.execPath, ["--no-warnings", "-e", code, db], { stdio: ["ignore", "pipe", "inherit"] });
  const samples = [];
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) samples.push(JSON.parse(buf.slice(0, i)));
  });
  return { child, samples };
}

function startIndexer(script) {
  const child = spawn(process.execPath, ["--no-warnings", script, "makaron"], {
    env: { ...process.env, OPENCLAW_DIST: path.join(runtime, "openclaw/dist") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const events = [];
  const lines = [];
  let buf = "";
  const onData = (d) => {
    buf += d;
    for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) {
      const line = buf.slice(0, i);
      lines.push({ at: Date.now(), line });
      if (line.startsWith("{")) try { events.push({ at: Date.now(), ...JSON.parse(line) }); } catch {}
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  return { child, events, lines };
}

// Bursts of writes separated by 2-6 s pauses, like a Librarian compile: new notes, appends
// to the large memory/log.md, and moving a whole directory out of memory/.
async function burst(tag, seconds) {
  const notes = path.join(memoryDir, `claude-burst-${tag}`);
  fs.mkdirSync(notes, { recursive: true });
  const logFile = path.join(memoryDir, "log.md");
  const moveFrom = path.join(memoryDir, `claude-burst-move-${tag}`);
  fs.mkdirSync(moveFrom, { recursive: true });
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(moveFrom, `m${i}.md`), `# moved ${tag} ${i}\n\n${"背景说明 context line. ".repeat(60)}\n`);
  await sleep(20_000); // let the indexer pick up the directory that is moved out later
  const end = Date.now() + seconds * 1000;
  let n = 0;
  let moved = false;
  while (Date.now() < end) {
    for (let k = 0; k < 3; k++, n++) fs.writeFileSync(path.join(notes, `note-${n}.md`), `# burst ${tag} ${n}\n\n${`第 ${n} 条整理记录，Librarian compile proposal ${n}. `.repeat(40)}\n`);
    if (!moved && Date.now() > end - seconds * 500) {
      fs.renameSync(moveFrom, path.join(workspace, `claude-burst-moved-${tag}`));
      moved = true;
    }
    // A pause long enough for the 1.5 s upstream debounce to start a sync, then appends to
    // the large log.md while that sync is reading and writing files.
    await sleep(1600 + Math.random() * 800);
    for (let k = 0; k < 15; k++) {
      fs.appendFileSync(logFile, `\n- ${new Date().toISOString()} claude burst ${tag} ${n}.${k}\n`);
      await sleep(100);
    }
    await sleep(Math.random() * 3000);
  }
  return { notes: n, notesDir: path.relative(workspace, notes), movedDir: path.relative(workspace, moveFrom) };
}

async function phase(label, script) {
  const indexer = startIndexer(script);
  // Wait for the startup sync (in phase A this builds the initial index).
  const startDeadline = Date.now() + 30 * 60_000;
  while (!indexer.events.some((e) => e.event === "sync" || e.event === "sync-failed") && Date.now() < startDeadline) await sleep(2000);
  const startup = indexer.events.find((e) => e.event === "sync" || e.event === "sync-failed");
  const probe = lockProbe();
  // A full in-place reindex builds a temp database next to the agent database.
  const dbDir = path.dirname(db);
  let fullReindexSeen = 0;
  const reindexWatch = setInterval(() => {
    if (fs.readdirSync(dbDir).some((f) => f.includes(".memory-reindex-"))) fullReindexSeen++;
  }, 500);
  const burstStart = Date.now();
  const written = await burst(label, 120);
  const burstEnd = Date.now();
  // Settle: a successful sync after the burst, then no indexer output for 60 s (cap 30 min).
  const settleDeadline = Date.now() + 30 * 60_000;
  while (Date.now() < settleDeadline) {
    const lastOut = indexer.lines.at(-1)?.at ?? 0;
    const synced = indexer.events.some((e) => e.event === "sync" && e.at > burstEnd);
    if (synced && Date.now() - lastOut > 60_000) break;
    await sleep(5000);
  }
  clearInterval(reindexWatch);
  indexer.child.kill("SIGTERM");
  probe.child.kill("SIGTERM");
  await sleep(3000);
  const window = probe.samples.filter((s) => s.at >= burstStart);
  const check = new DatabaseSync(db, { readOnly: true });
  const indexedNotes = check.prepare("SELECT count(DISTINCT path) AS n FROM memory_index_chunks WHERE path LIKE ?").get(`${written.notesDir}/%`).n;
  const movedLeft = check.prepare("SELECT count(*) AS n FROM memory_index_chunks WHERE path LIKE ?").get(`${written.movedDir}/%`).n;
  check.close();
  const result = {
    label,
    startup: startup && { event: startup.event, ms: startup.ms, chunks: startup.chunks },
    fullReindexSeen,
    burstSeconds: Math.round((burstEnd - burstStart) / 1000),
    settledAfterSeconds: Math.round((Date.now() - burstEnd) / 1000),
    probe: {
      attempts: window.length,
      failed: window.filter((s) => !s.ok).length,
      over1s: window.filter((s) => s.ms > 1000).length,
      maxMs: Math.max(0, ...window.map((s) => s.ms)),
      sumOver1sMs: window.filter((s) => s.ms > 1000).reduce((a, s) => a + s.ms, 0),
    },
    indexer: {
      syncs: indexer.events.filter((e) => e.event === "sync").map((e) => e.ms),
      syncFailed: indexer.events.filter((e) => e.event === "sync-failed").map((e) => e.error?.slice(0, 80)),
      fullReindexRefused: indexer.events.filter((e) => e.event === "full-reindex-refused").length,
      slowWrites: indexer.events.filter((e) => e.event === "slow-write").map((e) => `${e.path}:${e.chunks}:${e.ms}`),
      slowHoldLines: indexer.lines.filter((l) => l.line.includes("slow SQLite transaction hold")).length,
    },
    written: written.notes,
    indexedNotes,
    movedLeft,
  };
  summary[label] = result;
  console.log(JSON.stringify(result));
  return result;
}

test("setup: a keyword-only index over a copy of the shared memory files", () => {
  assert(workspace && sharedWorkspace && path.resolve(workspace) !== path.resolve(sharedWorkspace));
  assert(path.resolve(workspace).startsWith(path.resolve(data)), `workspace ${workspace} is not under ${data}`);
  assert(path.resolve(db).startsWith(path.resolve(state)) && (!sharedState || path.resolve(state) !== path.resolve(sharedState)), "database must be the candidate's own");
  assert(legacy && fs.existsSync(fixed), "both indexer versions are required");
  fs.mkdirSync(workspace, { recursive: true });
  fs.cpSync(path.join(sharedWorkspace, "memory"), memoryDir, { recursive: true, verbatimSymlinks: true });
  for (const f of fs.readdirSync(sharedWorkspace)) if (f.endsWith(".md")) fs.copyFileSync(path.join(sharedWorkspace, f), path.join(workspace, f));
  if (!fs.existsSync(path.join(memoryDir, "log.md"))) fs.writeFileSync(path.join(memoryDir, "log.md"), "# log\n" + "- earlier entry\n".repeat(20000));
  cfg.memory = { search: { provider: "none", sources: ["memory"], store: { fts: { tokenizer: "trigram" } } } };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  for (const f of fs.readdirSync(path.dirname(db)).filter((f) => f.startsWith(path.basename(db)))) fs.rmSync(path.join(path.dirname(db), f), { force: true });
  console.log(JSON.stringify({ workspace, files: fs.readdirSync(memoryDir).length, logBytes: fs.statSync(path.join(memoryDir, "log.md")).size }));
});

test("phase A: the indexer that was on V during the freeze", async () => {
  const r = await phase("a", legacy);
  // Evidence that the burst reaches the failure path; reported, not asserted.
  console.log(JSON.stringify({ reproduced: r.probe.failed > 0 || r.probe.maxMs >= 5000, fullReindex: r.indexer.syncs.some((ms) => ms > 120_000) }));
});

test("phase B: the fixed indexer never holds the write lock long", async () => {
  const r = await phase("b", fixed);
  assert.equal(r.probe.failed, 0, "a Gateway-style write gave up waiting for the lock");
  assert(r.probe.maxMs < 5000, `longest lock wait ${r.probe.maxMs} ms`);
  assert(r.indexer.syncs.length > 0, "the fixed indexer completed no sync");
  assert.equal(r.indexedNotes, r.written, "every note written in the burst is indexed");
  assert.equal(r.movedLeft, 0, "the moved directory left the index");
  console.log(JSON.stringify({ summary }));
});
