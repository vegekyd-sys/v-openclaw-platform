// Candidate test for lab/release-files/mirror-facts-identity: a Codex transcript mirror's facts read
// must stop loading the whole transcript while the session's projection is dirty or behind, and
// must answer exactly as before.
//
// On V (2026-10-10 14:00-15:00) session.transcript.mirror-facts held a SQLite transaction on the
// Gateway main thread 380 times in an hour, about 1.1 s each, all for one /vds session with 13,787
// events. This builds a session that size in a fresh private agent database: the messages of the
// shared VLab mirror's largest makaron transcript (read-only) appended REPEAT times through V's own
// batch append, each with a Codex mirror style idempotency key unique per copy.
// V's original accessor is loaded beside the patched one (same process, same database) and both
// read the same keys (recent mirrored messages, plus keys that do not exist):
//   current  the projection is up to date: answers identical, anchors included, cost unchanged;
//   dirty    one side-appended reply audit record (what a delivered channel reply writes) marks the
//            projection dirty, as on V: the original falls back to the full read, the patched one
//            reads identity rows; existence and messages identical, neither returns anchors.
// Each read is timed end to end (it is synchronous, so that is also the main-thread block).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateRoot = process.env.OPENCLAW_STATE_DIR;
const shared = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && stateRoot && shared, "candidate runtime environment is required");
const REPEAT = Number(process.env.REPEAT ?? 3);
const ROUNDS = Number(process.env.ROUNDS ?? 5);
const KEYS = Number(process.env.KEYS ?? 40);
const dist = path.join(runtime, "openclaw", "dist");
const name = "session-accessor-K0XuW6ln.js";
assert(fs.readFileSync(path.join(dist, name), "utf8").includes("v-mirror-facts-identity-v1"), "run this with the patched file in place");

const agentId = "makaron";
const relative = `agents/${agentId}/agent/openclaw-agent.sqlite`;
const dbPath = path.join(stateRoot, relative);
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const beside = path.join(dist, `session-accessor-v-original-${process.pid}.js`);
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const exportName = (source, local) => source.match(new RegExp(`\\b${local} as ([A-Za-z_$][\\w$]*)`))[1];

try {
  // V's bytes beside the patched file: release-files/placement-evidence-absence == V on 2026-10-10.
  fs.copyFileSync(path.join(process.cwd(), "lab/release-files/placement-evidence-absence", name), beside);
  const patchedSource = fs.readFileSync(path.join(dist, name), "utf8");
  const patchedMod = await import(path.join(dist, name));
  const originalMod = await import(beside);
  const lock = { patched: patchedMod[exportName(patchedSource, "withTranscriptWriteLock")], original: originalMod[exportName(patchedSource, "withTranscriptWriteLock")] };
  const appendEvent = patchedMod[exportName(patchedSource, "appendTranscriptEventSync")];
  const createSession = patchedMod[exportName(patchedSource, "createSessionEntryWithTranscript")];
  assert([lock.patched, lock.original, appendEvent, createSession].every((f) => typeof f === "function"));

  // Source: the shared mirror's largest makaron transcript, read-only.
  const src = new DatabaseSync(path.join(shared, relative), { readOnly: true });
  const top = src.prepare("SELECT session_id, count(*) AS n FROM transcript_events GROUP BY session_id ORDER BY n DESC LIMIT 1").get();
  const sourceEvents = src.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? ORDER BY seq").all(top.session_id).map((r) => JSON.parse(r.event_json));
  src.close();

  const sessionId = randomUUID();
  const sessionKey = `agent:${agentId}:explicit:vlab-dev-mirror-facts-${Date.now().toString(36)}`;
  const scope = { agentId, sessionId, sessionKey };
  const t0 = Date.now();
  const created = await createSession({ agentId, sessionKey }, async () => ({ ok: true, entry: { sessionId, updatedAt: Date.now() } }));
  assert(created.ok, `session created: ${JSON.stringify(created)}`);
  // Messages go through V's own batch append (parent chain, seq, identity and projection rows); each
  // gets a Codex mirror style idempotency key, unique per copy, as mirrored Codex messages carry.
  const appendMessages = patchedMod[exportName(patchedSource, "appendTranscriptMessages")];
  const sourceMessages = sourceEvents.filter((event) => event?.type === "message" && event.message && typeof event.message === "object").map((event) => event.message);
  let appended = 0;
  for (let copy = 0; copy < REPEAT; copy += 1) {
    for (let i = 0; i < sourceMessages.length; i += 500) {
      const batch = sourceMessages.slice(i, i + 500).map((message, j) => ({ message: { ...structuredClone(message), idempotencyKey: `codex-app-server:candidate-thread:${copy}:${i + j}` } }));
      appended += (await appendMessages(scope, { messages: batch })).length;
    }
  }
  const buildMs = Date.now() - t0;

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const stateOf = () => {
    const latest = db.prepare("SELECT max(seq) AS seq, count(*) AS n, sum(length(event_json)) AS bytes FROM transcript_events WHERE session_id = ?").get(sessionId);
    const state = db.prepare("SELECT indexed_seq, needs_rebuild FROM session_transcript_index_state WHERE session_id = ?").get(sessionId);
    return { events: latest.n, mb: Math.round(latest.bytes / 1048576), latestSeq: latest.seq, indexedSeq: state?.indexed_seq, needsRebuild: state?.needs_rebuild };
  };
  const recent = db.prepare("SELECT message_idempotency_key AS k FROM transcript_event_identities WHERE session_id = ? AND message_idempotency_key IS NOT NULL ORDER BY seq DESC LIMIT ?").all(sessionId, KEYS).map((r) => r.k);
  const keys = [...recent, ...Array.from({ length: 5 }, (_, i) => `codex-app-server:missing:${i}`)];
  assert(recent.length > 0, "session has mirrored keys");

  const read = async (which) => {
    let facts;
    let ms;
    await lock[which](scope, async (t) => {
      const start = performance.now();
      facts = await t.readMessageFacts({ idempotencyKeys: keys });
      ms = performance.now() - start;
    });
    return { ms, facts };
  };
  const view = (facts, withAnchors) => JSON.stringify({
    existing: [...facts.existingIdempotencyKeys].sort(),
    messages: [...facts.messagesByIdempotencyKey].sort(([a], [b]) => a.localeCompare(b)),
    ...withAnchors ? { anchors: [...facts.anchorsByIdempotencyKey].sort(([a], [b]) => a.localeCompare(b)).map(([k, a]) => [k, { ...a, storePath: void 0 }]) } : {}
  });
  const phase = async (label, expectAnchors) => {
    const before = stateOf();
    const times = { original: [], patched: [] };
    let answers;
    for (let round = 0; round < ROUNDS; round += 1) for (const which of round % 2 ? ["patched", "original"] : ["original", "patched"]) {
      const r = await read(which);
      times[which].push(Math.round(r.ms));
      answers ??= {};
      answers[which] ??= r.facts;
    }
    const after = stateOf();
    assert.equal(view(answers.patched, true), view(answers.original, true), `${label}: identical facts, anchors included`);
    assert.equal(answers.patched.anchorsByIdempotencyKey.size > 0, expectAnchors, `${label}: anchors ${expectAnchors ? "present" : "absent"}`);
    return {
      label, before, after,
      existing: answers.patched.existingIdempotencyKeys.size, asked: keys.length, anchors: answers.patched.anchorsByIdempotencyKey.size,
      originalMs: { median: med(times.original), all: times.original },
      patchedMs: { median: med(times.patched), all: times.patched }
    };
  };

  const results = { source: { sessionId: top.session_id, events: top.n }, repeat: REPEAT, appended, buildMs, built: stateOf() };
  assert.equal(results.built.needsRebuild, 0, "a clean append chain keeps the projection current");
  results.current = await phase("current", true);

  // What a delivered channel reply writes after the turn (dispatch-from-config reply audit record).
  const audit = appendEvent(scope, { type: "custom", id: randomUUID(), customType: "openclaw:conversation-turn-reply", appendMode: "side", timestamp: Date.now(), data: { turnId: randomUUID(), messageId: "om_candidate", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } } });
  assert(audit.ok && audit.value, "side audit record appended");
  results.afterSideAppend = stateOf();
  results.dirty = await phase("dirty", false);
  assert(results.dirty.before.needsRebuild === 1 || results.dirty.before.indexedSeq !== results.dirty.before.latestSeq, "the side append left the projection behind");
  db.close();
  console.log(JSON.stringify(results, null, 2));
} finally {
  fs.rmSync(beside, { force: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
}
process.exit(0);
