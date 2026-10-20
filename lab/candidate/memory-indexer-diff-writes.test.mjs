// Candidate test for scripts/v-memory-indexer.mjs: unchanged chunks are not rewritten.
//
// sqlite-vec never reuses a deleted slot. The indexer rewrote every chunk of a file on
// each change, so each append to the daily log or log.md left hundreds of empty slots
// that every KNN query still scans (V, 2026-10-20: 65,792 slots for 42,309 vectors).
//
// Setup: a sample of the shared makaron memory files (log.md, the largest daily log,
// index.md, 200 project pages) in the candidate workspace, embedded by a stub
// OpenAI-compatible endpoint in this process (deterministic 64-dim vectors), indexed
// once with the CLI. Then the same edit sequence (appends, a middle insertion, a
// first-line edit, a deletion, a rename) runs twice from that snapshot: once with the
// indexer V ran before this change (support file v-memory-indexer.legacy.mjs, whole-file
// rewrites) and once with this one. Both final databases must hold the same rows; the
// sqlite-vec slot count must grow only by the chunks that changed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const data = process.env.VLAB_CANDIDATE_DATA;
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const state = process.env.OPENCLAW_STATE_DIR;
const cfgPath = process.env.OPENCLAW_CONFIG_PATH;
assert(data && runtime && state && cfgPath && process.env.VLAB_SHARED_CONFIG_PATH, "candidate environment is required");
const dist = path.join(runtime, "openclaw/dist");
const makaronWorkspace = (c) => c.agents?.entries?.makaron?.workspace ?? c.agents?.list?.find((a) => a.id === "makaron")?.workspace;
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const workspace = makaronWorkspace(cfg);
const sharedWorkspace = makaronWorkspace(JSON.parse(fs.readFileSync(process.env.VLAB_SHARED_CONFIG_PATH, "utf8")));
const memoryDir = path.join(workspace, "memory");
const dbDir = path.join(state, "agents/makaron/agent");
const db = path.join(dbDir, "openclaw-agent.sqlite");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
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
const fixed = path.join(root, "scripts/v-memory-indexer.mjs");
const legacy = findFile(root, "v-memory-indexer.legacy.mjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snapshot = path.join(data, "diff-writes-snapshot");

// Deterministic stub embeddings: 64 dims from the text's sha256.
let embedCalls = 0;
const stub = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const input = JSON.parse(body || "{}").input ?? [];
    const texts = Array.isArray(input) ? input : [input];
    embedCalls += texts.length;
    const data = texts.map((text, index) => {
      let seed = createHash("sha256").update(String(text)).digest().readUInt32LE(0);
      const v = Array.from({ length: 64 }, () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5);
      const n = Math.hypot(...v);
      return { object: "embedding", index, embedding: v.map((x) => x / n) };
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "list", data, model: "stub-embedding", usage: { prompt_tokens: 0, total_tokens: 0 } }));
  });
});

const run = (args, extraEnv = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  child.on("close", (code) => resolve({ code, out }));
});

function startIndexer(script) {
  const child = spawn(process.execPath, ["--no-warnings", script, "makaron"], {
    env: { ...process.env, OPENCLAW_DIST: dist, QUIET_SECONDS: "2", SLOW_WRITE_MS: "0", RECONCILE_MINUTES: "600" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const events = [];
  let buf = "";
  const onData = (d) => {
    buf += d;
    for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) {
      const line = buf.slice(0, i);
      if (line.startsWith("{")) try { events.push({ at: Date.now(), ...JSON.parse(line) }); } catch {}
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  return { child, events };
}

async function waitForSync(indexer, after, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (indexer.events.some((e) => (e.event === "sync" || e.event === "sync-failed") && e.at > after)) {
      const last = Math.max(...indexer.events.map((e) => e.at));
      if (Date.now() - last > 3000) return;
    }
    await sleep(500);
  }
  throw new Error("indexer did not sync");
}

function slots() {
  const d = new DatabaseSync(db, { readOnly: true });
  try {
    return {
      slots: d.prepare("SELECT coalesce(sum(size), 0) AS n FROM memory_index_chunks_vec_chunks").get().n,
      vectors: d.prepare("SELECT count(*) AS n FROM memory_index_chunks_vec_rowids").get().n,
      chunks: d.prepare("SELECT count(*) AS n FROM memory_index_chunks").get().n,
    };
  } finally {
    d.close();
  }
}

function dump(file) {
  const d = new DatabaseSync(file, { readOnly: true });
  try {
    const q = (sql) => JSON.stringify(d.prepare(sql).all());
    return {
      chunks: q("SELECT id, path, source, start_line, end_line, hash, model, text, embedding FROM memory_index_chunks ORDER BY id"),
      fts: q("SELECT id, path, source, model, start_line, end_line, text, count(*) AS n FROM memory_index_chunks_fts GROUP BY id, path, source, model, start_line, end_line, text ORDER BY id"),
      vectors: q("SELECT id FROM memory_index_chunks_vec_rowids ORDER BY id"),
      recall: q("SELECT chunk_id, importance, triggers, project_key FROM memory_index_chunk_recall_metadata WHERE chunk_id IN (SELECT id FROM memory_index_chunks) ORDER BY chunk_id"),
      provenance: q("SELECT chunk_id, origin_class, session_kind, supersedes_key FROM memory_index_chunk_provenance WHERE chunk_id IN (SELECT id FROM memory_index_chunks) ORDER BY chunk_id"),
      sources: q("SELECT path, source, hash FROM memory_index_sources ORDER BY path, source"),
    };
  } finally {
    d.close();
  }
}

const checkpoint = () => {
  const d = new DatabaseSync(db);
  try { d.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } finally { d.close(); }
};
const saveDb = (to) => {
  checkpoint();
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(dbDir).filter((f) => f.startsWith("openclaw-agent.sqlite"))) fs.copyFileSync(path.join(dbDir, f), path.join(to, f));
};
const restoreDb = (from) => {
  for (const f of fs.readdirSync(dbDir).filter((f) => f.startsWith("openclaw-agent.sqlite"))) fs.rmSync(path.join(dbDir, f), { force: true });
  for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(dbDir, f));
};
const restoreWorkspace = () => {
  fs.rmSync(memoryDir, { recursive: true, force: true });
  fs.cpSync(path.join(snapshot, "memory"), memoryDir, { recursive: true });
};

// The edit sequence; each step is followed by a sync.
const projectFiles = () => fs.readdirSync(path.join(memoryDir, "projects"), { recursive: true }).filter((f) => f.endsWith(".md")).sort();
function steps() {
  const logFile = path.join(memoryDir, "log.md");
  const daily = path.join(memoryDir, fs.readdirSync(memoryDir).find((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)));
  const index = path.join(memoryDir, "index.md");
  const pages = projectFiles();
  const multi = pages.map((f) => path.join(memoryDir, "projects", f)).find((f) => fs.statSync(f).size > 6000);
  return [
    ["append log.md", () => fs.appendFileSync(logFile, "\n## [2026-10-21] lint | diff-writes test 1\n- appended line\n")],
    ["append log.md again", () => fs.appendFileSync(logFile, "\n## [2026-10-21] lint | diff-writes test 2\n- appended line\n")],
    ["append log.md a third time", () => fs.appendFileSync(logFile, "\n## [2026-10-21] lint | diff-writes test 3\n- appended line\n")],
    ["append daily log", () => fs.appendFileSync(daily, "\n- 22:10 daily append one\n")],
    ["append daily log again", () => fs.appendFileSync(daily, "\n- 22:11 daily append two\n")],
    ["insert a line in the middle of index.md", () => {
      const lines = fs.readFileSync(index, "utf8").split("\n");
      lines.splice(Math.floor(lines.length / 2), 0, "- inserted in the middle by the diff-writes test");
      fs.writeFileSync(index, lines.join("\n"));
    }],
    ["edit the first line of a multi-chunk page", () => {
      const lines = fs.readFileSync(multi, "utf8").split("\n");
      lines[0] = `${lines[0]} (edited)`;
      fs.writeFileSync(multi, lines.join("\n"));
    }],
    ["delete a page", () => fs.rmSync(path.join(memoryDir, "projects", pages[1]))],
    ["rename a page", () => fs.renameSync(path.join(memoryDir, "projects", pages[2]), path.join(memoryDir, "projects", pages[2].replace(/\.md$/, "-renamed.md")))],
  ];
}

async function variant(label, script) {
  restoreDb(path.join(snapshot, "db"));
  restoreWorkspace();
  const indexer = startIndexer(script);
  await waitForSync(indexer, 0, 300_000);
  const before = slots();
  const perStep = [];
  for (const [name, edit] of steps()) {
    const at = Date.now();
    edit();
    await waitForSync(indexer, at);
    const writes = indexer.events.filter((e) => e.event === "slow-write" && e.at > at);
    perStep.push({ step: name, writes: writes.map((w) => ({ path: w.path, chunks: w.chunks, unchanged: w.unchanged, longestMs: w.longestMs, transactions: w.transactions })), failed: indexer.events.filter((e) => e.event === "sync-failed" && e.at > at).length });
  }
  indexer.child.kill("SIGTERM");
  await new Promise((r) => indexer.child.once("close", r));
  const after = slots();
  saveDb(path.join(data, `diff-writes-${label}`));
  return { label, before, after, perStep };
}

const results = {};

test("setup: stub embeddings, sample workspace, initial index", async () => {
  assert(workspace && sharedWorkspace && path.resolve(workspace).startsWith(path.resolve(data)), `workspace ${workspace} must be the candidate's own`);
  assert(path.resolve(db).startsWith(path.resolve(state)) && path.resolve(state) !== path.resolve(process.env.VLAB_SHARED_STATE_DIR ?? "/nonexistent"), "database must be the candidate's own");
  assert(legacy && fs.existsSync(fixed), "both indexer versions are required");
  await new Promise((r) => stub.listen(0, "127.0.0.1", r));
  const port = stub.address().port;
  fs.rmSync(memoryDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(memoryDir, "projects"), { recursive: true });
  const sharedMemory = path.join(sharedWorkspace, "memory");
  const daily = fs.readdirSync(sharedMemory).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort((a, b) => fs.statSync(path.join(sharedMemory, b)).size - fs.statSync(path.join(sharedMemory, a)).size)[0];
  for (const f of ["log.md", "index.md", daily]) fs.copyFileSync(path.join(sharedMemory, f), path.join(memoryDir, f));
  const pages = fs.readdirSync(path.join(sharedMemory, "projects"), { recursive: true }).filter((f) => f.endsWith(".md")).sort().slice(0, 200);
  for (const f of pages) {
    fs.mkdirSync(path.dirname(path.join(memoryDir, "projects", f)), { recursive: true });
    fs.copyFileSync(path.join(sharedMemory, "projects", f), path.join(memoryDir, "projects", f));
  }
  cfg.memory = { search: { provider: "openai", model: "stub-embedding", remote: { baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: "stub" }, fallback: "none", sources: ["memory"], store: { fts: { tokenizer: "trigram" } } } };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  for (const f of fs.readdirSync(dbDir).filter((f) => f.startsWith("openclaw-agent.sqlite"))) fs.rmSync(path.join(dbDir, f), { force: true });
  const built = await run([path.join(dist, "index.js"), "memory", "index", "--agent", "makaron", "--force"]);
  assert.equal(built.code, 0, built.out.slice(-2000));
  const s = slots();
  assert(s.chunks > 1000 && s.vectors === s.chunks, `initial index: ${JSON.stringify(s)} ${built.out.slice(-800)}`);
  fs.rmSync(snapshot, { recursive: true, force: true });
  fs.mkdirSync(snapshot, { recursive: true });
  fs.cpSync(memoryDir, path.join(snapshot, "memory"), { recursive: true });
  saveDb(path.join(snapshot, "db"));
  console.log(JSON.stringify({ setup: { files: pages.length + 3, daily, ...s, embedCalls } }));
});

test("legacy indexer: whole-file rewrites", async () => {
  results.legacy = await variant("legacy", legacy);
  console.log(JSON.stringify(results.legacy));
});

test("this indexer: unchanged chunks keep their rows", async () => {
  results.diff = await variant("diff", fixed);
  console.log(JSON.stringify(results.diff));
  for (const step of results.diff.perStep) assert.equal(step.failed, 0, `${step.step}: sync failed`);
  const appends = results.diff.perStep.filter((s) => s.step.startsWith("append")).flatMap((s) => s.writes);
  assert(appends.length >= 5, "every append was written");
  for (const w of appends) assert(w.unchanged >= w.chunks - 3, `${w.path}: only the tail chunks change on an append (${w.unchanged}/${w.chunks})`);
});

test("both indexers end with the same rows; only changed chunks take new slots", () => {
  const a = dump(path.join(data, "diff-writes-legacy/openclaw-agent.sqlite"));
  const b = dump(path.join(data, "diff-writes-diff/openclaw-agent.sqlite"));
  for (const table of Object.keys(a)) assert.equal(b[table], a[table], `${table} differs`);
  const grown = (r) => r.after.slots - r.before.slots;
  const { legacy: L, diff: D } = results;
  assert.equal(D.after.vectors, D.after.chunks, "one vector per chunk");
  const legacyRewritten = L.perStep.flatMap((s) => s.writes).reduce((n, w) => n + w.chunks, 0);
  const diffWritten = D.perStep.flatMap((s) => s.writes).reduce((n, w) => n + w.chunks - (w.unchanged ?? 0), 0);
  console.log(JSON.stringify({ slotsGrown: { legacy: grown(L), diff: grown(D) }, vectorsWritten: { legacy: legacyRewritten, diff: diffWritten }, longestMsLog: {
    legacy: Math.max(...L.perStep.flatMap((s) => s.writes).filter((w) => w.path === "memory/log.md").map((w) => w.longestMs)),
    diff: Math.max(...D.perStep.flatMap((s) => s.writes).filter((w) => w.path === "memory/log.md").map((w) => w.longestMs)),
  } }));
  assert(grown(D) <= diffWritten + 64, `diff grew ${grown(D)} slots for ${diffWritten} written vectors`);
  assert(grown(L) > grown(D) * 3, `legacy grew ${grown(L)} slots, diff ${grown(D)}`);
});

test.after(() => {
  stub.close();
  for (const d of ["diff-writes-legacy", "diff-writes-diff", "diff-writes-snapshot"]) fs.rmSync(path.join(data, d), { recursive: true, force: true });
});
