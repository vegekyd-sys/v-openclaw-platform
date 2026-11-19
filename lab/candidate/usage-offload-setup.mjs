// Grow the candidate's makaron agent database to V's usage-report scale (2026-11-12 incident).
//
// V: 25k sessions, a 310 MB / 44.5k-event and an 88 MB direct session, 6,214 stored rollups
// holding 457 MB of JSON, all stale since 9/27. The candidate starts from a consistent copy of the
// shared VLab makaron database (plan "databases") and adds deterministic synthetic sessions cloned
// from its own transcripts, so both arms of the repro (old dist / patched dist) get the same data.
//
//   node lab/candidate/usage-offload-setup.mjs   (env from the candidate runner)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

export const AGENT = 'makaron';
export const REF_MS = Date.UTC(2026, 10, 12, 14, 0, 0); // 2026-11-12 22:00 CST
const DAY = 86_400_000;
const TOTAL_SESSIONS = Number(process.env.UO_TOTAL_SESSIONS ?? 25_000);
const HUGE_BYTES = Number(process.env.UO_HUGE_BYTES ?? 310e6);
const BIG_BYTES = Number(process.env.UO_BIG_BYTES ?? 88e6);
const ROLLUP_BYTES = Number(process.env.UO_ROLLUP_BYTES ?? 457e6);
const TEMPLATE_CUTOFF_MS = Date.UTC(2026, 10, 1);
const ROLLUP_SCOPE = 'session-cost-usage-rollup-v2';

export function agentDbPath() {
  return path.join(process.env.OPENCLAW_STATE_DIR, 'agents', AGENT, 'agent', 'openclaw-agent.sqlite');
}
export const marker = (db, sessionId) => `sqlite:${AGENT}:${sessionId}:${db}`;

function prng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
function uuidFor(label) {
  const h = createHash('sha1').update(label).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function rewriteEvent(raw, { sessionId, atMs, idSuffix, parentOverride, cost }) {
  const event = JSON.parse(raw);
  if (event.type === 'session') event.id = sessionId;
  else if (idSuffix && typeof event.id === 'string') event.id = `${event.id}${idSuffix}`;
  if (Object.hasOwn(event, 'parentId')) {
    if (parentOverride !== undefined && (event.parentId === null || event.parentId === undefined)) event.parentId = parentOverride;
    else if (idSuffix && typeof event.parentId === 'string') event.parentId = `${event.parentId}${idSuffix}`;
  }
  if (typeof event.timestamp === 'string') event.timestamp = new Date(atMs).toISOString();
  else if (typeof event.timestamp === 'number') event.timestamp = atMs;
  const message = event.message;
  if (message && typeof message === 'object') {
    if (typeof message.timestamp === 'number') message.timestamp = atMs;
    if (message.usage && typeof message.usage === 'object') {
      message.usage.cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost };
    }
  }
  return JSON.stringify(event);
}

function pickTemplates(db, where, limit) {
  return db.prepare(`
    select w.session_id as sessionId, w.session_key as sessionKey, count(*) as n, sum(length(e.event_json)) as bytes,
      sum(instr(e.event_json, '"usage"') > 0) as usageEvents
    from session_windows w join transcript_events e on e.session_id = w.session_id
    where coalesce(w.transcript_updated_at, w.updated_at) < ${TEMPLATE_CUTOFF_MS}
    group by w.session_id having ${where}
    order by w.session_id limit ${limit}`).all();
}

function loadTemplate(db, sessionId) {
  return {
    window: db.prepare('select * from session_windows where session_id = ?').get(sessionId),
    node: db.prepare('select * from session_nodes where current_session_id = ? limit 1').get(sessionId),
    events: db.prepare('select event_json from transcript_events where session_id = ? order by seq').all(sessionId).map((row) => row.event_json),
  };
}

function insertRow(db, table, row) {
  const cols = Object.keys(row);
  db.prepare(`insert into ${table} (${cols.join(',')}) values (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => row[c]));
}

function insertSession(db, { index, template, sessionKey, sessionId, endMs, stepMs, copies = 1, targetBytes }) {
  const events = [];
  const withoutHeader = template.events.filter((raw) => JSON.parse(raw).type !== 'session');
  const maxCopies = targetBytes ? Number.POSITIVE_INFINITY : copies;
  let bytes = 0;
  let lastId = null;
  outer: for (let copy = 0; copy < maxCopies; copy += 1) {
    const suffix = copy === 0 ? '' : `-c${copy}`;
    const parent = copy === 0 ? undefined : lastId;
    for (const raw of copy === 0 ? template.events : withoutHeader) {
      events.push({ raw, suffix, parent });
      const parsed = JSON.parse(raw);
      if (parsed.type !== 'session' && typeof parsed.id === 'string') lastId = `${parsed.id}${suffix}`;
      bytes += raw.length;
      if (targetBytes && bytes >= targetBytes) break outer;
    }
  }
  const n = events.length;
  const startMs = endMs - (n - 1) * stepMs;
  const insert = db.prepare('insert into transcript_events (session_id, seq, event_json, created_at) values (?, ?, ?, ?)');
  const node = { ...template.node };
  const entry = JSON.parse(node.entry_json);
  entry.sessionId = sessionId;
  entry.updatedAt = endMs;
  if ('sessionStartedAt' in entry) entry.sessionStartedAt = startMs;
  if ('lastActivityAt' in entry) entry.lastActivityAt = endMs;
  insertRow(db, 'session_nodes', {
    ...node, session_key: sessionKey, current_session_id: sessionId, entry_json: JSON.stringify(entry),
    updated_at: endMs, ...(node.created_at !== undefined ? { created_at: startMs } : {}),
    ...(node.last_activity_at !== undefined ? { last_activity_at: endMs } : {}),
    ...(node.last_interaction_at !== undefined ? { last_interaction_at: endMs } : {}),
  });
  // The insert trigger marks the row unvalidated; the cloned entry matches its columns.
  db.prepare('update session_nodes set entry_valid = 1 where session_key = ?').run(sessionKey);
  insertRow(db, 'session_windows', {
    ...template.window, session_id: sessionId, session_key: sessionKey, previous_session_id: null,
    primary_conversation_id: null, created_at: startMs, updated_at: endMs, transcript_updated_at: endMs,
    transcript_observed_at: endMs, started_at: startMs, ended_at: endMs,
  });
  let written = 0;
  for (const [seq, { raw, suffix, parent }] of events.entries()) {
    const atMs = startMs + seq * stepMs;
    const json = rewriteEvent(raw, {
      sessionId, atMs, idSuffix: suffix, parentOverride: parent,
      cost: ((index * 31 + seq) % 97 + 1) / 10_000,
    });
    insert.run(sessionId, seq, json, atMs);
    written += json.length;
  }
  return { events: n, bytes: written };
}

async function createRollupTemplates(db, dbPath, sessionIds) {
  // Let the runtime's own refresh build real rollups for a few template sessions (both arms).
  const dist = path.join(process.env.VLAB_CANDIDATE_RUNTIME, 'openclaw', 'dist');
  const usage = await import(pathToFileURL(path.join(dist, 'session-cost-usage-C_mE_GAE.js')).href);
  const config = readConfig();
  await usage.s({
    sessions: sessionIds.map((sessionId) => ({ sessionId, sessionFile: marker(dbPath, sessionId) })),
    config, agentId: AGENT, requestRefresh: true,
  });
  const keys = sessionIds.map((id) => marker(dbPath, id));
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const rows = db.prepare(`select key, value_json from cache_entries where scope = ? and key in (${keys.map(() => '?').join(',')})`).all(ROLLUP_SCOPE, ...keys);
    if (rows.length === keys.length) return rows.map((row) => row.value_json);
    assert(Date.now() < deadline, `rollup templates not written (${rows.length}/${keys.length})`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export async function setup() {
  const dbPath = agentDbPath();
  const db = new DatabaseSync(dbPath);
  db.exec('pragma busy_timeout = 30000');
  const started = Date.now();
  const baseSessions = db.prepare('select count(*) as n from session_windows').get().n;
  const small = pickTemplates(db, 'n between 15 and 60 and usageEvents >= 3', 6);
  const medium = pickTemplates(db, 'n between 100 and 400 and usageEvents >= 20', 6);
  const large = pickTemplates(db, 'n >= 400 and usageEvents >= 50 and bytes / n >= 3000', 1);
  assert(small.length && medium.length && large.length, `templates: ${small.length}/${medium.length}/${large.length}`);
  const smallT = small.map((t) => loadTemplate(db, t.sessionId));
  const mediumT = medium.map((t) => loadTemplate(db, t.sessionId));
  const largeT = loadTemplate(db, large[0].sessionId);

  const rollupTemplates = await createRollupTemplates(db, dbPath, medium.slice(0, 3).map((t) => t.sessionId));
  const avgRollup = rollupTemplates.reduce((sum, value) => sum + value.length, 0) / rollupTemplates.length;

  const random = prng(20261112);
  const synthetic = Math.max(0, TOTAL_SESSIONS - baseSessions - 2);
  let events = 0;
  let bytes = 0;
  const syntheticIds = [];
  const batch = 500;
  for (let start = 0; start < synthetic; start += batch) {
    db.exec('begin');
    for (let i = start; i < Math.min(synthetic, start + batch); i += 1) {
      const r = random();
      const ageMs = r < 0.03 ? random() * (22 * 3_600_000) : random() * 35 * DAY;
      const template = i % 4 === 0 ? mediumT[i % mediumT.length] : smallT[i % smallT.length];
      const sessionId = uuidFor(`uo-syn-${i}`);
      const result = insertSession(db, {
        index: i, template, sessionKey: `agent:${AGENT}:explicit:uo-syn-${i}`, sessionId,
        endMs: Math.round(REF_MS - ageMs), stepMs: 5_000,
      });
      syntheticIds.push(sessionId);
      events += result.events;
      bytes += result.bytes;
    }
    db.exec('commit');
  }
  const big = [];
  for (const [label, target] of [['uo-huge-310', HUGE_BYTES], ['uo-big-88', BIG_BYTES]]) {
    db.exec('begin');
    const sessionId = uuidFor(label);
    const result = insertSession(db, {
      index: label.length, template: largeT, sessionKey: `agent:${AGENT}:feishu:direct:${label}`, sessionId,
      endMs: REF_MS - 3_600_000, stepMs: 30_000, targetBytes: target,
    });
    db.exec('commit');
    big.push({ label, sessionId, ...result });
  }

  // Stale stored rollups, like V's 9/27 rows: valid JSON for other sessions' checkpoints.
  const rollupRows = Math.min(syntheticIds.length, Math.ceil(ROLLUP_BYTES / avgRollup));
  const upsert = db.prepare(`insert or replace into cache_entries (scope, key, value_json, blob, expires_at, updated_at) values (?, ?, ?, null, null, ?)`);
  let rollupBytes = 0;
  db.exec('begin');
  for (let i = 0; i < rollupRows; i += 1) {
    const value = rollupTemplates[i % rollupTemplates.length];
    upsert.run(ROLLUP_SCOPE, marker(dbPath, syntheticIds[i]), value, REF_MS - 47 * DAY);
    rollupBytes += value.length;
  }
  db.exec('commit');
  db.exec('pragma wal_checkpoint(truncate)');
  const summary = {
    baseSessions, syntheticSessions: synthetic, syntheticEvents: events, syntheticBytes: bytes, big,
    templates: { small: small.length, medium: medium.length, large: large[0] },
    rollups: { rows: rollupRows, bytes: rollupBytes, templateBytes: rollupTemplates.map((v) => v.length) },
    totalSessions: db.prepare('select count(*) as n from session_windows').get().n,
    dbBytes: fs.statSync(dbPath).size,
    setupMs: Date.now() - started,
  };
  db.close();
  return summary;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await setup()));
  process.exit(0);
}
