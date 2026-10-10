// Candidate test for lab/release-files/sessions-get-exact-read: sessions.get must stop loading the
// whole agent session store, and must answer exactly as before.
//
// On V (2026-10-10) sessions.get took avg 1.7 s over 968 calls in 6 hours (Night Shift reading a
// card's session), because it loaded every makaron session entry (2,558, 158 MB of JSON) to pick
// one. The shared VLab mirror's makaron database is the same shape (4,159 sessions, 150 MB).
//
// The candidate's own data directory is on the nearly full mirror disk, so this backs the shared
// mirror's makaron database up (SQLite backup, read-only on the source) to a private copy on the
// root disk, points the candidate state at it, and removes it at the end. On the runtime in place
// (plan without `files`: V's code; with them: the patch):
//   - entries: for an even sample of session keys plus every key not in the agent:makaron: form,
//     the entry found by the full-store lookup (loadSessionEntriesForTarget, ~1.5 s each) and by
//     the exact lookup (exactRead, readOnly) must be equal;
//   - handler: the real sessions.get handler on a fixed sample of keys with Night Shift's limit,
//     timed end to end and by the longest event-loop block (after one warm-up call);
//   - answers: with the patch in place, V's original handler is loaded beside it and both answer
//     every sampled key twice on the same copy; every reply must be identical.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateRoot = process.env.OPENCLAW_STATE_DIR;
const shared = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && stateRoot && shared, "candidate runtime environment is required");
const SAMPLE = Number(process.env.SAMPLE ?? 30);
const ENTRY_SAMPLE = Number(process.env.ENTRY_SAMPLE ?? 200);
const LIMIT = Number(process.env.LIMIT ?? 12);
const dist = path.join(runtime, "openclaw", "dist");
const patched = fs.readFileSync(path.join(dist, "sessions-read-C6mAMxyQ.js"), "utf8").includes("sessions-get-exact-read");

const scratch = fs.mkdtempSync("/var/tmp/sessions-get-exact-read-");
const relative = "agents/makaron/agent/openclaw-agent.sqlite";
const copy = path.join(scratch, "openclaw-agent.sqlite");
const link = path.join(stateRoot, relative);
const sha = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
async function timed(fn) {
  let last = performance.now(), gap = 0;
  const iv = setInterval(() => { const t = performance.now(); gap = Math.max(gap, t - last); last = t; }, 1);
  const start = performance.now();
  const value = await fn();
  const ms = performance.now() - start;
  await new Promise((r) => setTimeout(r, 5));
  clearInterval(iv);
  return { value, ms: Math.round(ms), blockMs: Math.round(gap) };
}
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

try {
  const t0 = Date.now();
  execFileSync("sqlite3", [path.join(shared, relative), `.backup '${copy}'`], { stdio: "inherit" });
  const backupMs = Date.now() - t0;
  fs.mkdirSync(path.dirname(link), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(link + suffix, { force: true });
  fs.symlinkSync(copy, link);

  const db = new DatabaseSync(copy, { readOnly: true });
  const keys = db.prepare("SELECT session_key FROM session_nodes ORDER BY session_key").all().map((r) => r.session_key);
  db.close();
  const step = Math.max(1, Math.floor(keys.length / SAMPLE));
  const sample = keys.filter((_, i) => i % step === 0).slice(0, SAMPLE);

  const { r: loadConfig } = await import(path.join(dist, "io.runtime-CKu7Rw0j.js"));
  const { a: loadSessionEntriesForTarget } = await import(path.join(dist, "sessions-shared-Bdbh46q8.js"));
  const { f: resolveTarget, s: canonicalEntry } = await import(path.join(dist, "session-utils-store-Dlphca2N.js"));
  const { t: handlers } = await import(path.join(dist, "sessions-read-C6mAMxyQ.js"));
  const cfg = loadConfig();

  // entries: full-store lookup vs exact lookup (independent of the patch)
  const entryStep = Math.max(1, Math.floor(keys.length / ENTRY_SAMPLE));
  const odd = keys.filter((k) => !k.startsWith("agent:makaron:"));
  const entryKeys = [...new Set([...keys.filter((_, i) => i % entryStep === 0), ...odd])];
  let compared = 0, found = 0;
  const mismatches = [];
  for (const key of entryKeys) {
    const full = loadSessionEntriesForTarget({ key, cfg, agentId: "makaron" });
    const exact = resolveTarget({ cfg, key, agentId: "makaron", exactRead: true, readOnly: true });
    const exactEntry = canonicalEntry(exact.store, exact.storeKeys);
    compared += 1;
    if (full.entry) found += 1;
    if (JSON.stringify(full.entry) !== JSON.stringify(exactEntry) || full.storePath !== exact.storePath) mismatches.push(key);
  }

  // handler: the real sessions.get on the sample (one warm-up call first: a fresh process opening
  // a 7 GB database pays a one-off cost that the long-running Gateway does not)
  const context = { getRuntimeConfig: () => cfg };
  const ask = async (h, key) => { let reply; await h["sessions.get"]({ params: { key, limit: LIMIT }, respond: (ok, payload, error) => { reply = { ok, payload, error }; }, context }); return reply; };
  await ask(handlers, sample[0]);
  const calls = [];
  const answers = {};
  for (const key of sample) {
    let reply;
    const r = await timed(() => handlers["sessions.get"]({ params: { key, limit: LIMIT }, respond: (ok, payload, error) => { reply = { ok, payload, error }; }, context }));
    answers[key] = sha(reply);
    calls.push({ ms: r.ms, blockMs: r.blockMs, messages: reply?.payload?.messages?.length ?? null });
  }
  // same process, same copy: V's original handler next to the one in place, each asked twice
  let sameAnswers = null;
  const differences = [];
  const original = path.join(process.cwd(), "lab/release-files/sessions-read-live-20261010/sessions-read-C6mAMxyQ.js");
  if (patched && fs.existsSync(original)) {
    const beside = path.join(dist, `sessions-read-original-${process.pid}.js`);
    fs.copyFileSync(original, beside);
    try {
      const { t: originalHandlers } = await import(beside);
      sameAnswers = 0;
      for (const key of sample) {
        const replies = [await ask(originalHandlers, key), await ask(handlers, key), await ask(originalHandlers, key), await ask(handlers, key)].map((r) => JSON.stringify(r));
        if (replies[0] !== replies[2]) differences.push({ key, kind: "original not deterministic" });
        else if (replies[0] === replies[1] && replies[1] === replies[3]) sameAnswers += 1;
        else {
          let i = 0;
          while (i < replies[0].length && replies[0][i] === replies[1][i]) i += 1;
          differences.push({ key, kind: "patched differs", original: replies[0].slice(Math.max(0, i - 80), i + 120), patched: replies[1].slice(Math.max(0, i - 80), i + 120) });
        }
      }
    } finally { fs.rmSync(beside, { force: true }); }
  }
  console.log(JSON.stringify({
    patched, sessions: keys.length, backupMs, sameAnswers, differences: differences.slice(0, 3), differenceCount: differences.length,
    entries: { compared, otherFormKeys: odd.length, found, mismatches: mismatches.length, firstMismatches: mismatches.slice(0, 5) },
    handler: { sample: sample.length, limit: LIMIT, medianMs: med(calls.map((c) => c.ms)), medianBlockMs: med(calls.map((c) => c.blockMs)), maxBlockMs: Math.max(...calls.map((c) => c.blockMs)), withMessages: calls.filter((c) => c.messages > 0).length },
    answersSha: sha(answers), answers,
  }, null, 2));
  assert.equal(mismatches.length, 0, "the exact lookup must find the same entry for every compared session");
  if (sameAnswers !== null) assert.equal(differences.length, 0, "the patched handler must answer exactly as the original");
} finally {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(link + suffix, { force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
