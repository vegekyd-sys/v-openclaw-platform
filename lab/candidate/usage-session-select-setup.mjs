// Grow the candidate's makaron session store to V's 2026-11-20 shape (usage-session-select repro).
//
// V's makaron store: 25,866 session_nodes rows, 2.4 GB of entry_json (avg 97 KB). Per row the
// skillsSnapshot (a ~45 KB prompt string plus ~278 small skill objects, avg 62 KB) and the
// systemPromptReport (skills and tools entry lists, avg 34 KB) are 98% of it; the list projection
// is 37 MB. Size buckets (KB, rows): <20 230, 40-60 1324, 60-80 9818, 100-120 5657, 120-140 8587,
// 140-400 ~70.
//
// The candidate starts from a consistent copy of shared VLab's makaron database (plan
// "databases"), picks its busiest Feishu direct session as the target of the two V calls, and adds
// deterministic synthetic rows until the store has V's row count and size distribution. Rows are
// written like the session entry writer projects them (current_session_id = entry.sessionId,
// updated_at = entry.updatedAt, label = entry.label) and marked validated.
//
//   node lab/candidate/usage-session-select-setup.mjs   (env from the candidate runner)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

export const AGENT = 'makaron';
const TOTAL_ROWS = Number(process.env.USS_TOTAL_ROWS ?? 25_866);
const REF_MS = Date.UTC(2026, 10, 20, 9, 51, 0); // 2026-11-20 17:51 CST

export function agentDbPath() {
  return path.join(process.env.OPENCLAW_STATE_DIR, 'agents', AGENT, 'agent', 'openclaw-agent.sqlite');
}
export function targetPath() {
  return path.join(process.env.VLAB_CANDIDATE_DATA ?? process.env.OPENCLAW_STATE_DIR, 'uss-target.json');
}
export function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

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

// Target entry JSON size (bytes) drawn from V's buckets.
function drawSize(random) {
  const r = random();
  if (r < 0.009) return 4_000 + random() * 12_000;
  if (r < 0.060) return 42_000 + random() * 18_000;
  if (r < 0.440) return 60_000 + random() * 20_000;
  if (r < 0.659) return 100_000 + random() * 20_000;
  if (r < 0.997) return 120_000 + random() * 20_000;
  return 140_000 + random() * 260_000;
}

const words = 'skill brief route render scene asset caption voice board card review publish fetch'.split(' ');
function text(random, length) {
  let out = '';
  while (out.length < length) out += `${words[Math.floor(random() * words.length)]} `;
  return out.slice(0, length);
}

// skillsSnapshot ~64% and systemPromptReport ~34% of the row, shaped like V's.
function snapshots(random, bytes, sessionId, sessionKey) {
  const skillsBytes = bytes * 0.64;
  const skills = Array.from({ length: 278 }, (_, i) => ({ name: `s${i}`, skillKey: `k${i}`, requiredEnv: [] }));
  const skillsSnapshot = {
    prompt: text(random, Math.max(1_000, skillsBytes - 278 * 45)),
    skills,
    nodeSkillsEligibility: {},
    version: 1795168260000,
    promptFormatVersion: 1,
  };
  const reportBytes = bytes * 0.34;
  const toolCount = Math.max(4, Math.round((reportBytes * 0.63) / 120));
  const skillCount = Math.max(4, Math.round((reportBytes * 0.37) / 90));
  const systemPromptReport = {
    source: 'run',
    generatedAt: REF_MS,
    sessionId,
    sessionKey,
    provider: 'deepseek',
    model: 'vds-deepseek-flash',
    workspaceDir: '/home/openclaw/makaron-openclaw/.openclaw-local/workspace',
    bootstrapMaxChars: 20000,
    bootstrapTotalMaxChars: 60000,
    bootstrapTruncation: { truncated: false },
    sandbox: { mode: 'off' },
    systemPrompt: { chars: 48211, projectContextChars: 21000, nonProjectContextChars: 27211 },
    injectedWorkspaceFiles: Array.from({ length: 5 }, (_, i) => ({ name: `F${i}.md`, rawChars: 4000, injectedChars: 4000, truncated: false })),
    skills: { promptChars: 45424, entries: Array.from({ length: skillCount }, (_, i) => ({ name: `skill-${i}-${text(random, 24).trim()}`, blockChars: 160 + i })) },
    tools: { listChars: 9000, schemaChars: 60000, entries: Array.from({ length: toolCount }, (_, i) => ({ name: `tool_${i}`, summaryChars: 80, schemaChars: 400 + i, propertiesCount: 3, summary: text(random, 40) })) },
    currentTurn: { chars: 1200, userChars: 300 },
  };
  return { skillsSnapshot, systemPromptReport };
}

export function setup() {
  const dbPath = agentDbPath();
  const db = new DatabaseSync(dbPath);
  db.exec('pragma busy_timeout = 30000');
  const started = Date.now();
  const baseRows = db.prepare('select count(*) as n from session_nodes').get().n;
  const baseBytes = db.prepare('select coalesce(sum(length(entry_json)), 0) as n from session_nodes').get().n;

  // The busiest Feishu direct session with a transcript is the target of the two V calls.
  const target = db.prepare(`
    select n.session_key as key, n.current_session_id as sessionId, count(e.seq) as events
    from session_nodes n join transcript_events e on e.session_id = n.current_session_id
    where n.session_key glob 'agent:${AGENT}:feishu:direct:ou_*' and n.session_key not like '%:thread:%'
      and n.entry_valid = 1
    group by n.session_key order by events desc limit 1`).get()
    ?? db.prepare(`
    select n.session_key as key, n.current_session_id as sessionId, count(e.seq) as events
    from session_nodes n join transcript_events e on e.session_id = n.current_session_id
    where n.entry_valid = 1 group by n.session_key order by events desc limit 1`).get();
  assert(target, 'no session with a transcript in the base database');
  const template = db.prepare('select * from session_nodes where session_key = ?').get(target.key);
  const templateEntry = JSON.parse(template.entry_json);

  // Give the target V's row size too (its own snapshots are kept when already larger).
  const random = prng(20261120);
  if (template.entry_json.length < 100_000) {
    const big = snapshots(random, 118_000, target.sessionId, target.key);
    const entry = { ...templateEntry, ...big };
    db.prepare('update session_nodes set entry_json = ? where session_key = ?').run(JSON.stringify(entry), target.key);
    // The update trigger marks the row unvalidated; only snapshot fields changed.
    db.prepare('update session_nodes set entry_valid = 1 where session_key = ?').run(target.key);
  }

  const cols = Object.keys(template);
  const insert = db.prepare(`insert into session_nodes (${cols.join(',')}) values (${cols.map(() => '?').join(',')})`);
  const validate = db.prepare('update session_nodes set entry_valid = 1 where session_key = ?');
  const synthetic = Math.max(0, TOTAL_ROWS - baseRows);
  let bytes = 0;
  const batch = 500;
  for (let start = 0; start < synthetic; start += batch) {
    db.exec('begin');
    for (let i = start; i < Math.min(synthetic, start + batch); i += 1) {
      const sessionKey = `agent:${AGENT}:feishu:direct:ou_uss_${String(i).padStart(5, '0')}`;
      const sessionId = uuidFor(`uss-${i}`);
      const updatedAt = Math.round(REF_MS - random() * 60 * 86_400_000);
      const entry = { ...templateEntry, sessionId, updatedAt, ...snapshots(random, drawSize(random), sessionId, sessionKey) };
      delete entry.label;
      if ('lastActivityAt' in entry) entry.lastActivityAt = updatedAt;
      const json = JSON.stringify(entry);
      const row = {
        ...template, session_key: sessionKey, current_session_id: sessionId, entry_json: json, updated_at: updatedAt,
        ...('label' in template ? { label: null } : {}),
        ...('display_name' in template ? { display_name: null } : {}),
        ...('last_activity_at' in template && template.last_activity_at !== null ? { last_activity_at: updatedAt } : {}),
        ...('last_interaction_at' in template && template.last_interaction_at !== null ? { last_interaction_at: updatedAt } : {}),
        ...('created_at' in template ? { created_at: updatedAt - 3_600_000 } : {}),
      };
      insert.run(...cols.map((c) => row[c]));
      validate.run(sessionKey);
      bytes += json.length;
    }
    db.exec('commit');
  }
  db.exec('pragma wal_checkpoint(truncate)');
  const totals = db.prepare('select count(*) as n, sum(length(entry_json)) as bytes from session_nodes').get();
  const listBytes = db.prepare(`select sum(length(json_remove(entry_json, '$.skillsSnapshot', '$.systemPromptReport'))) as n from session_nodes where json_valid(entry_json)`).get().n;
  db.close();
  const summary = {
    baseRows, baseBytes, syntheticRows: synthetic, syntheticBytes: bytes,
    rows: totals.n, entryBytes: totals.bytes, listProjectionBytes: listBytes,
    target: { key: target.key, events: target.events },
    dbBytes: fs.statSync(dbPath).size, setupMs: Date.now() - started,
  };
  fs.writeFileSync(targetPath(), JSON.stringify(summary.target));
  return summary;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(setup()));
}
