// Candidate test for lab/release-files/sessions-describe-exact-read: sessions.describe must stop
// loading the whole agent session store, and must describe every session exactly as before.
//
// On V (2026-10-10) sessions.describe ran 31 times in 24 hours, p50 7.9 s, max 9.9 s, because it
// loaded every makaron session entry (2,558, 158 MB) for buildGatewaySessionRow, which only needs
// the session's direct children. This backs the shared VLab mirror's makaron database up to a
// private copy on the root disk (the candidate data disk is nearly full), points the candidate
// state at it, and removes it at the end. With the patch in place, the #308 handlers (what V runs
// after the next batch) are loaded beside it; on the same copy, in one process:
//   - keys: every session that has a child (the only place the answers could differ) plus an even
//     sample of the rest, each described with no options and with derived titles + last message;
//   - answers: the #308 handler and the patched one, each asked twice, must reply identically;
//   - cost: each handler timed end to end and by the longest event-loop block (after a warm-up).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateRoot = process.env.OPENCLAW_STATE_DIR;
const shared = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && stateRoot && shared, "candidate runtime environment is required");
const SAMPLE = Number(process.env.SAMPLE ?? 30);
const dist = path.join(runtime, "openclaw", "dist");
const patched = fs.readFileSync(path.join(dist, "sessions-read-C6mAMxyQ.js"), "utf8").includes("sessions-describe-exact-read");
assert(patched, "run this with the patched file in place");

const scratch = fs.mkdtempSync("/var/tmp/sessions-describe-exact-read-");
const relative = "agents/makaron/agent/openclaw-agent.sqlite";
const copy = path.join(scratch, "openclaw-agent.sqlite");
const link = path.join(stateRoot, relative);
const beside = path.join(dist, `sessions-read-pr308-${process.pid}.js`);
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function timedSync(fn) {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

try {
  const t0 = Date.now();
  execFileSync("sqlite3", [path.join(shared, relative), `.backup '${copy}'`], { stdio: "inherit" });
  const backupMs = Date.now() - t0;
  fs.mkdirSync(path.dirname(link), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(link + suffix, { force: true });
  fs.symlinkSync(copy, link);

  const db = new DatabaseSync(copy, { readOnly: true });
  const keys = db.prepare("SELECT session_key FROM session_nodes ORDER BY session_key").all().map((r) => r.session_key);
  // On the mirror every child is long finished, so buildGatewaySessionRow drops it from
  // childSessions (store-only links count for 30 min after the child ends) and the one place the
  // versions could differ goes unexercised. Writing to the copy trips the database's integrity
  // checks, so instead each parent is described with the clock set just after its last child ended.
  const childClock = new Map(db.prepare("SELECT p.session_key AS parent, MAX(COALESCE(json_extract(c.entry_json, '$.endedAt'), json_extract(c.entry_json, '$.updatedAt'), c.updated_at)) AS at FROM session_nodes p JOIN session_nodes c ON c.session_key <> p.session_key AND (c.parent_session_key = p.session_key OR c.spawned_by = p.session_key) GROUP BY p.session_key").all().map((r) => [r.parent, Number(r.at) + 1000]));
  const parents = db.prepare("SELECT s.session_key FROM session_nodes s WHERE EXISTS (SELECT 1 FROM session_nodes c WHERE c.session_key <> s.session_key AND (c.parent_session_key = s.session_key OR c.spawned_by = s.session_key)) ORDER BY s.session_key").all().map((r) => r.session_key);
  db.close();
  const step = Math.max(1, Math.floor(keys.length / SAMPLE));
  const sample = [...new Set([...parents, ...keys.filter((_, i) => i % step === 0).slice(0, SAMPLE)])];

  fs.copyFileSync(path.join(process.cwd(), "lab/release-files/sessions-get-exact-read/sessions-read-C6mAMxyQ.js"), beside);
  const { r: loadConfig } = await import(path.join(dist, "io.runtime-CKu7Rw0j.js"));
  const { t: handlers } = await import(path.join(dist, "sessions-read-C6mAMxyQ.js"));
  const { t: pr308 } = await import(beside);
  const cfg = loadConfig();
  const context = { getRuntimeConfig: () => cfg };
  const describe = (h, key, opts) => { let reply; h["sessions.describe"]({ params: { key, ...opts }, respond: (ok, payload, error) => { reply = { ok, payload, error }; }, context }); return reply; };
  describe(pr308, sample[0], {});
  describe(handlers, sample[0], {});

  const variants = { plain: {}, titled: { includeDerivedTitles: true, includeLastMessage: true } };
  const differences = [];
  const cost = { pr308: [], patched: [] };
  let same = 0, withChildren = 0, described = 0;
  const realNow = Date.now;
  for (const key of sample) for (const [name, opts] of Object.entries(variants)) {
    const at = childClock.get(key);
    Date.now = at ? () => at : realNow;
    const a = timedSync(() => describe(pr308, key, opts));
    const b = timedSync(() => describe(handlers, key, opts));
    const replies = [a.value, b.value, describe(pr308, key, opts), describe(handlers, key, opts)].map((r) => JSON.stringify(r));
    cost.pr308.push(a.ms);
    cost.patched.push(b.ms);
    if (a.value?.payload?.session) described += 1;
    if (a.value?.payload?.session?.childSessions?.length) withChildren += 1;
    if (replies[0] !== replies[2]) differences.push({ key, name, kind: "#308 handler not deterministic" });
    else if (replies[0] === replies[1] && replies[1] === replies[3]) same += 1;
    else {
      let i = 0;
      while (i < replies[0].length && replies[0][i] === replies[1][i]) i += 1;
      differences.push({ key, name, kind: "patched differs", pr308: replies[0].slice(Math.max(0, i - 80), i + 160), patched: replies[1].slice(Math.max(0, i - 80), i + 160) });
    }
  }
  Date.now = realNow;
  const firstReply = JSON.stringify(describe(handlers, sample[0], {})).slice(0, 300);
  const summary = (xs) => ({ medianMs: Math.round(med(xs)), maxMs: Math.round(Math.max(...xs)) });
  console.log(JSON.stringify({
    sessions: keys.length, parents: parents.length, sample: sample.length, backupMs,
    replies: sample.length * 2, described, withChildren, same, differenceCount: differences.length, differences: differences.slice(0, 3),
    cost: { pr308: summary(cost.pr308), patched: summary(cost.patched) }, firstReply,
  }, null, 2));
  assert.equal(described, sample.length * 2, "every sampled session must be described");
  assert(withChildren > 0, "parents must be described with their children");
  assert.equal(differences.length, 0, "the patched handler must describe every session exactly as #308");
} finally {
  fs.rmSync(beside, { force: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(link + suffix, { force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
