// Read-only collector for the shared Codex app-server's own log DB (logs_2.sqlite keeps ~15 min).
// Every INTERVAL s it copies the timing-relevant rows (no message content) into OUT/codex-events.jsonl,
// and samples Gateway main-thread / app-server CPU into OUT/proc.jsonl.
//   node codex-log-collector.mjs <codexHome> <outDir> <hours> <gatewayPid>
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const [codexHome, outDir, hoursArg, gwPidArg] = process.argv.slice(2);
const hours = Number(hoursArg || 2);
const gwPid = Number(gwPidArg);
const INTERVAL = 90_000;
const deadline = Date.now() + hours * 3600_000;
const evOut = path.join(outDir, 'codex-events.jsonl');
const procOut = path.join(outDir, 'proc.jsonl');
const stateFile = path.join(outDir, 'collector-state.json');
let lastId = 0;
try { lastId = JSON.parse(fs.readFileSync(stateFile, 'utf8')).lastId || 0; } catch {}

const TARGETS = [
  'codex_core::session::handlers',
  'codex_http_client::client',
  'codex_core::stream_events_utils',
  'codex_core::tools::parallel',
  'codex_core::session::turn',
];

function parse(row) {
  const ms = row.ts * 1000 + Math.floor(row.ts_nanos / 1e6);
  const b = row.body || '';
  const base = { id: row.id, ms, th: row.thread_id || null };
  switch (row.target) {
    case 'codex_core::session::handlers': {
      const op = /operation="([a-z_]+)"/.exec(b)?.[1];
      if (!op) return null;
      const sub = /submission_id=([0-9a-f-]{36})/.exec(b)?.[1];
      return { ...base, k: 'sub', op, sub };
    }
    case 'codex_http_client::client': {
      const m = /Request completed method=(\w+) url=https?:\/\/([^/\s]+)(\/[^\s?]*)? status=(\d+)/.exec(b);
      if (!m) {
        if (/Request failed|error/i.test(b)) return { ...base, k: 'httperr', msg: b.slice(b.lastIndexOf('}: ') + 3, b.lastIndexOf('}: ') + 120).replace(/[^\x20-\x7e]/g, '') };
        return null;
      }
      return { ...base, k: 'http', host: m[2], p: m[3] || '', st: Number(m[4]) };
    }
    case 'codex_core::stream_events_utils': {
      const t = /Output item item_type="(\w+)"/.exec(b)?.[1];
      return t ? { ...base, k: 'item', t } : null;
    }
    case 'codex_core::tools::parallel': {
      if (!b.includes('tool call completed')) return null;
      const g = (re) => re.exec(b)?.[1];
      return { ...base, k: 'tool', turn: g(/turn_id=([0-9a-f-]{36})/), tool: g(/tool_name=([\w.-]+)/),
        disp: Number(g(/dispatch_duration_ms=(\d+)/)), hand: Number(g(/handler_duration_ms=(\d+)/)), tot: Number(g(/total_duration_ms=(\d+)/)) };
    }
    case 'codex_core::session::turn': {
      if (!b.includes('post sampling token usage')) return null;
      return { ...base, k: 'sampled', turn: /turn_id=([0-9a-f-]{36})/.exec(b)?.[1], tok: Number(/total_usage_tokens=(\d+)/.exec(b)?.[1]),
        follow: /needs_follow_up=true/.test(b) };
    }
  }
  return null;
}

function cpuTicks(pid, tid) {
  try {
    const s = fs.readFileSync(tid ? `/proc/${pid}/task/${tid}/stat` : `/proc/${pid}/stat`, 'utf8');
    const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
    return Number(f[11]) + Number(f[12]);
  } catch { return null; }
}
function appServerPids() {
  const out = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const c = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8');
      if (c.includes('codex') && c.includes('app-server')) out.push(Number(d));
    } catch {}
  }
  return out;
}

function pollLogs() {
  const db = new DatabaseSync(path.join(codexHome, 'logs_2.sqlite'), { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=2000');
    const q = db.prepare(`select id, ts, ts_nanos, target, thread_id,
        case when target='codex_core::session::handlers' then substr(feedback_log_body,1,600) else feedback_log_body end as body
      from logs where id > ? and target in (${TARGETS.map(() => '?').join(',')}) order by id`);
    const minId = db.prepare('select min(id) m from logs').get().m;
    const rows = q.all(lastId, ...TARGETS);
    const lines = [];
    for (const r of rows) { const e = parse(r); if (e) lines.push(JSON.stringify(e)); lastId = Math.max(lastId, r.id); }
    if (lines.length) fs.appendFileSync(evOut, lines.join('\n') + '\n');
    const gap = lastId && minId > 0 && rows.length && rows[0].id > minId ? 0 : null;
    fs.writeFileSync(stateFile, JSON.stringify({ lastId, minId, at: Date.now() }));
    return { n: rows.length, kept: lines.length, minId, gap };
  } finally { db.close(); }
}

let prev = null;
function sampleProc() {
  const now = Date.now();
  const cur = { now, gwMain: cpuTicks(gwPid, gwPid), gwAll: cpuTicks(gwPid), app: {} };
  for (const p of appServerPids()) cur.app[p] = cpuTicks(p);
  if (prev) {
    const dt = (now - prev.now) / 1000;
    const pct = (a, b) => (a != null && b != null ? +((a - b) / dt).toFixed(1) : null);
    const app = {};
    for (const p of Object.keys(cur.app)) app[p] = pct(cur.app[p], prev.app[p]);
    fs.appendFileSync(procOut, JSON.stringify({ at: now, dt, gwMainPct: pct(cur.gwMain, prev.gwMain), gwAllPct: pct(cur.gwAll, prev.gwAll), appPct: app }) + '\n');
  }
  prev = cur;
}

const procTimer = setInterval(sampleProc, 15_000);
sampleProc();
async function loop() {
  while (Date.now() < deadline) {
    try { const r = pollLogs(); fs.appendFileSync(path.join(outDir, 'collector.log'), `${new Date().toISOString()} ${JSON.stringify(r)}\n`); }
    catch (e) { fs.appendFileSync(path.join(outDir, 'collector.log'), `${new Date().toISOString()} ERR ${e.message}\n`); }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
  clearInterval(procTimer);
}
loop();
