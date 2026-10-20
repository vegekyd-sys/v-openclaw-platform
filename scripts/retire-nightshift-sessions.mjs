#!/usr/bin/env node
// Retires old Night Shift subagent sessions of one agent through OpenClaw's own lifecycle removal
// (transcript archived into session_transcript_archives and published, rows, FTS and index rows deleted),
// a few keys per write transaction, from a separate process. See lab/gateway-fullread-hotpaths.md.
//
// Default is a preview: nothing is written. --apply deletes. Run on the host as the Gateway's user with
// the Gateway's environment (state dir, DB91 flags):
//
//   sudo -u openclaw env $(systemctl show openclaw-gateway -p Environment --value) \
//     /opt/node-v22.23.1/bin/node scripts/retire-nightshift-sessions.mjs \
//       --dist /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist \
//       [--older-than-days 14] [--apply] [--max 200] [--window 03:00-05:30]
//
// A session is retired only when all hold:
//   - key starts with agent:<agent>:subagent:workboard-nightshift-
//   - not updated for --older-than-days and its entry status is not "running"
//   - no workboard card links it (session_key / execution_session_key), or every linking card is done
//     or archived (blocked / review / ready / todo cards keep their sessions)
// Before each batch the script times its own BEGIN IMMEDIATE; when that wait exceeds --max-lock-wait-ms
// it backs off, so it yields to the Gateway and workers instead of competing with them.
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const dist = option("dist");
if (!dist || !fs.existsSync(path.join(dist, "session-accessor-K0XuW6ln.js"))) {
  console.error("usage: retire-nightshift-sessions.mjs --dist <core/dist with 2026.9.1 db91.6 chunks> [--apply] ...");
  process.exit(2);
}
const AGENT = option("agent", "makaron");
const PREFIX = `agent:${AGENT}:subagent:workboard-nightshift-`;
const OLDER_THAN_DAYS = Number(option("older-than-days", "14"));
const BATCH = Number(option("batch", "2"));
const PAUSE_MS = Number(option("pause-ms", "1000"));
const MAX = Number(option("max", "0")) || Infinity;
const MAX_LOCK_WAIT_MS = Number(option("max-lock-wait-ms", "1500"));
const WINDOW = option("window"); // "HH:MM-HH:MM" local time; outside it the script stops
const APPLY = flag("apply");
const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME ?? "", ".openclaw");
const agentDb = path.join(stateDir, "agents", AGENT, "agent", "openclaw-agent.sqlite");
const workboardDb = path.join(stateDir, "plugins", "workboard", "workboard.sqlite");
const storePath = path.join(stateDir, "agents", AGENT, "sessions", "sessions.json");
const line = (event, data) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));

function insideWindow() {
  if (!WINDOW) return true;
  const [from, to] = WINDOW.split("-").map((hm) => hm.split(":").reduce((h, m) => Number(h) * 60 + Number(m)));
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  return from <= to ? minute >= from && minute < to : minute >= from || minute < to;
}

// Cards that still need their session: any non-archived card whose status is not done.
function protectedSessionKeys() {
  const keep = new Set();
  const done = new Set();
  if (!fs.existsSync(workboardDb)) return { keep, done };
  const db = new DatabaseSync(workboardDb, { readOnly: true });
  for (const row of db.prepare("SELECT status, archived_at, session_key, execution_session_key FROM workboard_cards").all()) {
    const finished = row.status === "done" || (typeof row.archived_at === "number" && row.archived_at !== 0);
    for (const key of [row.session_key, row.execution_session_key]) {
      if (typeof key !== "string" || !key.startsWith(PREFIX)) continue;
      (finished ? done : keep).add(key);
    }
  }
  db.close();
  return { keep, done };
}

// Own write-lock wait, the same lock the Gateway and workers take.
function lockWaitMs() {
  const db = new DatabaseSync(agentDb);
  try {
    db.exec("PRAGMA busy_timeout = 60000");
    const t = performance.now();
    db.exec("BEGIN IMMEDIATE");
    const waited = performance.now() - t;
    db.exec("ROLLBACK");
    return Math.round(waited);
  } finally {
    db.close();
  }
}

const { a: listSessionEntriesReadOnly } = await import(path.join(dist, "session-accessor.sqlite-entry-BlklNPKQ.js"));
const cutoff = Date.now() - OLDER_THAN_DAYS * 86400_000;
const { keep, done } = protectedSessionKeys();
const entries = listSessionEntriesReadOnly({ agentId: AGENT, storePath, projection: "list" }).filter(({ sessionKey }) => sessionKey.startsWith(PREFIX));
const skipped = { recent: 0, running: 0, cardOpen: 0 };
const candidates = [];
for (const { sessionKey, entry } of entries) {
  if ((entry.updatedAt ?? Date.now()) >= cutoff) { skipped.recent += 1; continue; }
  if (entry.status === "running") { skipped.running += 1; continue; }
  if (keep.has(sessionKey)) { skipped.cardOpen += 1; continue; }
  candidates.push({ sessionKey, linkedToDoneCard: done.has(sessionKey) });
}
candidates.sort((a, b) => a.sessionKey.localeCompare(b.sessionKey));
const selected = candidates.slice(0, MAX);
line("plan", { apply: APPLY, agent: AGENT, olderThanDays: OLDER_THAN_DAYS, nightShiftSessions: entries.length, candidates: candidates.length, selected: selected.length, linkedToDoneCard: selected.filter((c) => c.linkedToDoneCard).length, skipped, batch: BATCH, pauseMs: PAUSE_MS, sample: selected.slice(0, 5).map((c) => c.sessionKey) });
if (!APPLY) process.exit(0);

const { It: applySessionEntryLifecycleMutation } = await import(path.join(dist, "session-accessor-K0XuW6ln.js"));
const { l: loadExactSessionEntry } = await import(path.join(dist, "session-accessor.sqlite-entry-BlklNPKQ.js"));
let removed = 0, batches = 0, backoffs = 0, publishPending = 0;
const t0 = performance.now();
for (let i = 0; i < selected.length; i += BATCH) {
  if (!insideWindow()) { line("stop", { reason: "outside window", removed }); break; }
  const waited = lockWaitMs();
  if (waited > MAX_LOCK_WAIT_MS) {
    backoffs += 1;
    line("backoff", { lockWaitMs: waited });
    await new Promise((r) => setTimeout(r, Math.max(PAUSE_MS * 10, 10_000)));
    i -= BATCH;
    continue;
  }
  // Re-read each entry exactly; the removal is conditional on it being unchanged.
  const removals = selected.slice(i, i + BATCH).flatMap(({ sessionKey }) => {
    const entry = loadExactSessionEntry({ agentId: AGENT, storePath, sessionKey })?.entry;
    if (!entry || entry.status === "running" || (entry.updatedAt ?? Date.now()) >= cutoff) return [];
    return [{ sessionKey, expectedEntry: entry, ...entry.sessionId ? { expectedSessionId: entry.sessionId } : {}, expectedUpdatedAt: entry.updatedAt, archiveRemovedTranscript: true }];
  });
  if (removals.length === 0) continue;
  const t = performance.now();
  try {
    const result = await applySessionEntryLifecycleMutation({ agentId: AGENT, storePath, removals });
    removed += result.removedEntries;
  } catch (error) {
    // The rows are deleted and the archive blobs kept when only the archive file export failed.
    if (!/transcript archive file export/u.test(String(error?.message))) throw error;
    publishPending += removals.length;
    removed += removals.length;
  }
  batches += 1;
  line("batch", { keys: removals.map((r) => r.sessionKey), ms: Math.round(performance.now() - t), lockWaitMs: waited, removed });
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}
line("done", { removed, batches, backoffs, publishPending, minutes: Math.round((performance.now() - t0) / 6000) / 10 });
process.exit(0);
