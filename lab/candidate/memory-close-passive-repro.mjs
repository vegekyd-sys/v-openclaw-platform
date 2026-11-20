// memory-close-passive repro on a copy of the makaron agent database (see
// lab/release-files/memory-close-passive/README.md). ARM=old runs V's bytes; ARM=new applies
// lab/memory-close-passive.plan.json. Same data and steps in both arms.
//
// This process stands in for the Gateway: like memory_search, each query gets a "search"
// MemoryIndexManager, searches, and closes it. Phases:
//   A. no other reader;
//   B. another process holds a read transaction on the same database (as some reader on V did
//      from about 22:30 to 23:07 on 2026-11-20) while this process keeps writing, like the Gateway;
//      a third process tries one write while each close runs;
//   C. the reader is gone again.
// Per query it reports search ms, close ms, and the longest event-loop stall seen during close.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const AGENT = 'makaron';
const arm = process.env.ARM;
assert(arm === 'old' || arm === 'new', 'ARM=old|new');
const dist = path.join(process.env.VLAB_CANDIDATE_RUNTIME, 'openclaw', 'dist');
const dbPath = path.join(process.env.OPENCLAW_STATE_DIR, 'agents', AGENT, 'agent', 'openclaw-agent.sqlite');
assert(fs.existsSync(dbPath), `missing candidate copy ${dbPath}`);
assert(!dbPath.startsWith(process.env.VLAB_SHARED_STATE_DIR ?? '\0'), 'must not open the shared VLab database');
const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, 'utf8'));

const storage = fs.readFileSync(path.join(dist, 'manager-vector-warning-BHH19jrh.js'), 'utf8');
assert.equal(storage.includes('memory-close-passive-v1'), arm === 'new', 'runtime file does not match ARM');

const { MemoryIndexManager } = await import(pathToFileURL(path.join(dist, 'extensions/memory-core/manager-runtime.js')).href);

const log = (o) => console.log(JSON.stringify({ arm, ...o }));
const QUERIES = ['夜班模式是干什么用的', 'Gateway 重启 恢复 卡死', 'Makaron 项目 当前状态', '客户群 服务规则'];

// Longest gap between 10 ms ticks while `fn` runs: a synchronous busy wait shows up here.
async function measureStall(fn) {
  let last = performance.now(), worst = 0;
  const iv = setInterval(() => { const now = performance.now(); worst = Math.max(worst, now - last - 10); last = now; }, 10);
  const t = performance.now();
  try { await fn(); } finally { clearInterval(iv); }
  const now = performance.now();
  worst = Math.max(worst, now - last - 10);
  return { ms: Math.round(now - t), stallMs: Math.round(Math.max(0, worst)) };
}

function child(source, args = []) {
  const p = spawn(process.execPath, ['--input-type=module', '-e', source, dbPath, ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = [];
  let waiters = [];
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); waiters.splice(0).forEach((w) => w()); }
  });
  const next = async () => { while (!lines.length) await new Promise((r) => waiters.push(r)); return lines.shift(); };
  return { p, next };
}

// Holds one read transaction until stdin closes.
const READER = `
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[1], { readOnly: true });
db.exec('BEGIN');
const n = db.prepare('SELECT count(*) AS n FROM memory_index_chunks').get().n;
console.log(JSON.stringify({ reader: 'holding', chunks: n }));
process.stdin.resume();
process.stdin.on('end', () => { db.exec('COMMIT'); db.close(); process.exit(0); });
`;
// On each line: wait 300 ms (the close is running), try one write without waiting, report.
const WRITER = `
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[1]);
db.exec('PRAGMA busy_timeout = 0');
db.exec('CREATE TABLE IF NOT EXISTS v_close_probe_other(x)');
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  while (buf.includes('\\n')) {
    buf = buf.slice(buf.indexOf('\\n') + 1);
    setTimeout(() => {
      const t = Date.now();
      try { db.prepare('INSERT INTO v_close_probe_other VALUES (?)').run(t); console.log(JSON.stringify({ write: 'ok', ms: Date.now() - t })); }
      catch (e) { console.log(JSON.stringify({ write: 'refused', error: String(e.message) })); }
    }, 300);
  }
});
process.stdin.on('end', () => { db.close(); process.exit(0); });
`;

// Gateway-like writer in this process: the WAL keeps growing past the reader's snapshot.
const gatewayWriter = new DatabaseSync(dbPath);
gatewayWriter.exec('PRAGMA busy_timeout = 5000');
gatewayWriter.exec('CREATE TABLE IF NOT EXISTS v_close_probe(x)');
const gatewayWrite = () => gatewayWriter.prepare('INSERT INTO v_close_probe VALUES (?)').run(Date.now());

async function runQuery(phase, query, writer) {
  gatewayWrite();
  const manager = await MemoryIndexManager.get({ cfg, agentId: AGENT, purpose: 'search' });
  let hits = null, searchError = null;
  const s = performance.now();
  try {
    hits = (await manager.search(query, { maxResults: 6, activeProjectKeys: [AGENT] })).length;
  } catch (e) {
    searchError = String(e?.message ?? e).slice(0, 200);
  }
  const searchMs = Math.round(performance.now() - s);
  gatewayWrite();
  writer?.p.stdin.write('go\n');
  const close = await measureStall(() => manager.close());
  const other = writer ? JSON.parse(await writer.next()) : undefined;
  const row = { phase, query, hits, searchError, searchMs, closeMs: close.ms, closeStallMs: close.stallMs, otherWrite: other };
  log(row);
  return row;
}

const rows = [];
const t0 = Date.now();
// Warm-up: the first search open in a process runs the DB91 integrity check on the copy.
{
  const m = await MemoryIndexManager.get({ cfg, agentId: AGENT, purpose: 'search' });
  try { await m.search('warm up', { maxResults: 3 }); } catch (e) { log({ phase: 'warm', searchError: String(e?.message ?? e).slice(0, 200) }); }
  await m.close();
  log({ phase: 'warm', ms: Date.now() - t0 });
}

for (const q of QUERIES) rows.push(await runQuery('A-no-reader', q));

const reader = child(READER);
log({ phase: 'B', ...JSON.parse(await reader.next()) });
const writer = child(WRITER);
for (const q of QUERIES) rows.push(await runQuery('B-reader-held', q, writer));
writer.p.stdin.end();
reader.p.stdin.end();
await new Promise((r) => reader.p.on('exit', r));

for (const q of QUERIES) rows.push(await runQuery('C-reader-gone', q));
gatewayWriter.close();

const summary = {};
for (const phase of ['A-no-reader', 'B-reader-held', 'C-reader-gone']) {
  const r = rows.filter((x) => x.phase === phase);
  summary[phase] = {
    closeMs: r.map((x) => x.closeMs),
    closeStallMs: r.map((x) => x.closeStallMs),
    searchMs: r.map((x) => x.searchMs),
    otherWritesRefused: r.filter((x) => x.otherWrite?.write === 'refused').length,
    searchErrors: r.filter((x) => x.searchError).length,
  };
}
log({ phase: 'summary', summary });
