// Pre-release acceptance for lab/release-files/mirror-facts-identity (PR #315), on top of
// lab/candidate/mirror-facts-identity.mjs (which only timed the read and compared its answer).
//
// V on 2026-10-12 16:50-17:24: session.transcript.mirror-facts held the Gateway main thread 77 s in
// five minutes, then 62 s, until the Gateway froze and was restarted. This shows, on a session big
// enough that V's original read crosses the 1 s slow-hold threshold:
//   1. the failure path is really taken: an instrumented copy of V's original records a full
//      transcript read while the projection is dirty, and the instrumented patched copy records
//      "lagging" (identity rows) instead; V's own slow-hold warning is emitted for the original;
//   2. answers are unchanged for every projection state the patch distinguishes: current (anchors
//      included), dirty after a side-appended reply audit record (what V writes after every
//      delivered channel reply), unindexed (events but no identity rows: still a full read), and
//      empty;
//   3. a Codex style mirror on the dirty session (read facts, append only missing keys with
//      idempotencyLookup "scan", as @openclaw/codex transcript-mirror does) appends each new key
//      exactly once, never re-appends an existing one, and a replay appends nothing;
//   4. cost: original vs patched read time per state (the read is synchronous, so this is also the
//      main-thread block).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateRoot = process.env.OPENCLAW_STATE_DIR;
const shared = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && stateRoot && shared, "candidate runtime environment is required");
const REPEAT = Number(process.env.REPEAT ?? 6);
const ROUNDS = Number(process.env.ROUNDS ?? 5);
const KEYS = Number(process.env.KEYS ?? 40);
const dist = path.join(runtime, "openclaw", "dist");
const name = "session-accessor-K0XuW6ln.js";
const MARKER = "v-mirror-facts-identity-v1";
const startedAt = Date.now();
assert(fs.readFileSync(path.join(dist, name), "utf8").includes(MARKER), "run this with the patched file in place");

const agentId = "makaron";
const relative = `agents/${agentId}/agent/openclaw-agent.sqlite`;
const dbPath = path.join(stateRoot, relative);
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const exportName = (source, local) => source.match(new RegExp(`\\b${local} as ([A-Za-z_$][\\w$]*)`))[1];

// Probe copies: the same bytes plus one line that records which path a read took.
const probe = (globalThis.__mirrorFactsProbe = []);
function instrumentOriginal(source) {
  const at = source.indexOf("function loadTranscriptEventsForMirrorFallback(");
  const call = "\treturn loadTranscriptEventsFromDatabase(database, sessionId);\n";
  const callAt = source.indexOf(call, at);
  assert(at > 0 && callAt > at, "original fallback shape");
  return source.slice(0, callAt) + "\tglobalThis.__mirrorFactsProbe.push(\"original:full-read\");\n" + source.slice(callAt);
}
function instrumentPatched(source) {
  const line = `\tconst projectionState = readTranscriptMirrorProjectionState(database, resolved.sessionId); // ${MARKER}\n`;
  assert.equal(source.split(line).length, 2, "patched projection state line");
  return source.replace(line, line + "\tglobalThis.__mirrorFactsProbe.push(\"patched:\" + projectionState);\n");
}

const tag = `${process.pid}-${Date.now().toString(36)}`;
const copies = {
  original: path.join(dist, `session-accessor-v-original-${tag}.js`),
  probeOriginal: path.join(dist, `session-accessor-probe-original-${tag}.js`),
  probePatched: path.join(dist, `session-accessor-probe-patched-${tag}.js`)
};

// V's slow-hold warning goes to the OpenClaw file log; collect this process's mirror-facts lines.
function collectSlowHoldLogs() {
  let tmpDirs = [];
  try { tmpDirs = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("openclaw") && !n.includes("locks")).map((n) => path.join(os.tmpdir(), n)); } catch {}
  const dirs = [...new Set(["/tmp/openclaw", `/tmp/openclaw-${process.getuid?.()}`, ...tmpDirs, path.join(stateRoot, "logs")])];
  const lines = [];
  for (const dir of dirs) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const file of names) {
      const full = path.join(dir, file);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (!stat.isFile() || stat.mtimeMs < startedAt - 1000) continue;
      let text = "";
      try { text = fs.readFileSync(full, "utf8"); } catch { continue; }
      for (const l of text.split("\n")) if (l.includes(`"pid":${process.pid}`) && l.includes("slow SQLite transaction hold")) lines.push({ file: full, line: l.slice(0, 600) });
    }
  }
  return lines;
}

try {
  // V's bytes: release-files/placement-evidence-absence == V (checked 2026-10-12 18:3x CST: 5c2eb542).
  const vSource = fs.readFileSync(path.join(process.cwd(), "lab/release-files/placement-evidence-absence", name), "utf8");
  const patchedSource = fs.readFileSync(path.join(dist, name), "utf8");
  fs.writeFileSync(copies.original, vSource);
  fs.writeFileSync(copies.probeOriginal, instrumentOriginal(vSource));
  fs.writeFileSync(copies.probePatched, instrumentPatched(patchedSource));
  const mods = {
    patched: await import(path.join(dist, name)),
    original: await import(copies.original),
    probeOriginal: await import(copies.probeOriginal),
    probePatched: await import(copies.probePatched)
  };
  const fn = (mod, local) => mod[exportName(patchedSource, local)];
  const lock = Object.fromEntries(Object.entries(mods).map(([k, m]) => [k, fn(m, "withTranscriptWriteLock")]));
  const appendEvent = fn(mods.patched, "appendTranscriptEventSync");
  const createSession = fn(mods.patched, "createSessionEntryWithTranscript");
  const appendMessages = fn(mods.patched, "appendTranscriptMessages");
  assert([...Object.values(lock), appendEvent, createSession, appendMessages].every((f) => typeof f === "function"));

  // Source: the shared mirror's largest makaron transcript, read-only.
  const src = new DatabaseSync(path.join(shared, relative), { readOnly: true });
  const top = src.prepare("SELECT session_id, count(*) AS n FROM transcript_events GROUP BY session_id ORDER BY n DESC LIMIT 1").get();
  const sourceEvents = src.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? ORDER BY seq").all(top.session_id).map((r) => JSON.parse(r.event_json));
  src.close();
  const sourceMessages = sourceEvents.filter((e) => e?.type === "message" && e.message && typeof e.message === "object").map((e) => e.message);
  const assistantTemplate = sourceMessages.findLast((m) => m.role === "assistant");
  assert(assistantTemplate, "an assistant message to model mirrored replies on");

  const newSession = async (label) => {
    const sessionId = randomUUID();
    const sessionKey = `agent:${agentId}:explicit:vlab-dev-mirror-facts-${label}-${Date.now().toString(36)}`;
    const created = await createSession({ agentId, sessionKey }, async () => ({ ok: true, entry: { sessionId, updatedAt: Date.now() } }));
    assert(created.ok, `session created: ${JSON.stringify(created)}`);
    return { agentId, sessionId, sessionKey };
  };
  const fill = async (scope, copies) => {
    let appended = 0;
    for (let copy = 0; copy < copies; copy += 1) for (let i = 0; i < sourceMessages.length; i += 500) {
      const batch = sourceMessages.slice(i, i + 500).map((message, j) => ({ message: { ...structuredClone(message), idempotencyKey: `codex-app-server:candidate-thread:${copy}:${i + j}` } }));
      appended += (await appendMessages(scope, { messages: batch })).length;
    }
    return appended;
  };

  let db; // opened once the first session has created the database
  const stateOf = (sessionId) => {
    const latest = db.prepare("SELECT max(seq) AS seq, count(*) AS n, sum(length(event_json)) AS bytes FROM transcript_events WHERE session_id = ?").get(sessionId);
    const state = db.prepare("SELECT indexed_seq, needs_rebuild FROM session_transcript_index_state WHERE session_id = ?").get(sessionId);
    const identities = db.prepare("SELECT count(*) AS n FROM transcript_event_identities WHERE session_id = ?").get(sessionId).n;
    return { events: latest.n, mb: Math.round((latest.bytes ?? 0) / 1048576), latestSeq: latest.seq, indexedSeq: state?.indexed_seq, needsRebuild: state?.needs_rebuild, identities };
  };
  const recentKeys = (sessionId, n) => db.prepare("SELECT message_idempotency_key AS k FROM transcript_event_identities WHERE session_id = ? AND message_idempotency_key IS NOT NULL ORDER BY seq DESC LIMIT ?").all(sessionId, n).map((r) => r.k);
  const missingKeys = Array.from({ length: 5 }, (_, i) => `codex-app-server:missing:${i}`);

  const reads = []; // wall-clock window of every read, to attribute slow-hold log lines
  const read = async (which, scope, keys) => {
    let facts;
    let ms;
    await lock[which](scope, async (t) => {
      const at = Date.now();
      const start = performance.now();
      facts = await t.readMessageFacts({ idempotencyKeys: keys });
      ms = performance.now() - start;
      reads.push({ which, sessionId: scope.sessionId, at, end: Date.now() });
    });
    return { ms, facts };
  };
  const view = (facts, withAnchors) => JSON.stringify({
    existing: [...facts.existingIdempotencyKeys].sort(),
    messages: [...facts.messagesByIdempotencyKey].sort(([a], [b]) => a.localeCompare(b)),
    ...withAnchors ? { anchors: [...facts.anchorsByIdempotencyKey].sort(([a], [b]) => a.localeCompare(b)).map(([k, a]) => [k, { ...a, storePath: void 0 }]) } : {}
  });
  // One probed read per side records the path; then timed rounds on the unmodified copies.
  const phase = async (label, scope, keys, expect) => {
    const before = stateOf(scope.sessionId);
    probe.length = 0;
    const probed = { original: await read("probeOriginal", scope, keys), patched: await read("probePatched", scope, keys) };
    const paths = [...probe];
    assert.deepEqual(paths, expect.paths, `${label}: read paths`);
    const times = { original: [], patched: [] };
    const answers = {};
    for (let round = 0; round < ROUNDS; round += 1) for (const which of round % 2 ? ["patched", "original"] : ["original", "patched"]) {
      const r = await read(which, scope, keys);
      times[which].push(Math.round(r.ms));
      answers[which] ??= r.facts;
    }
    const after = stateOf(scope.sessionId);
    assert.equal(view(answers.patched, true), view(answers.original, true), `${label}: identical facts, anchors included`);
    assert.equal(view(probed.patched.facts, true), view(answers.original, true), `${label}: probe copy answers the same`);
    assert.equal(answers.patched.anchorsByIdempotencyKey.size > 0, expect.anchors, `${label}: anchors ${expect.anchors ? "present" : "absent"}`);
    assert.equal(answers.patched.existingIdempotencyKeys.size, expect.existing, `${label}: existing keys`);
    return {
      label, before, after, paths,
      asked: keys.length, existing: answers.patched.existingIdempotencyKeys.size, messages: answers.patched.messagesByIdempotencyKey.size, anchors: answers.patched.anchorsByIdempotencyKey.size,
      originalMs: { median: med(times.original), max: Math.max(...times.original), all: times.original },
      patchedMs: { median: med(times.patched), max: Math.max(...times.patched), all: times.patched }
    };
  };

  const results = { source: { sessionId: top.session_id, events: top.n }, repeat: REPEAT, rounds: ROUNDS };

  // Big session, built through V's own batch append.
  const t0 = Date.now();
  const big = await newSession("big");
  results.appended = await fill(big, REPEAT);
  results.buildMs = Date.now() - t0;
  db = new DatabaseSync(dbPath, { readOnly: true });
  results.built = stateOf(big.sessionId);
  assert.equal(results.built.needsRebuild, 0, "a clean append chain keeps the projection current");
  const recent = recentKeys(big.sessionId, KEYS);
  assert.equal(recent.length, KEYS);
  const keys = [...recent, ...missingKeys];

  results.current = await phase("current", big, keys, { paths: ["patched:current"], anchors: true, existing: KEYS });

  // What a delivered channel reply writes after the turn (dispatch-from-config reply audit record).
  const audit = appendEvent(big, { type: "custom", id: randomUUID(), customType: "openclaw:conversation-turn-reply", appendMode: "side", timestamp: Date.now(), data: { turnId: randomUUID(), messageId: "om_candidate", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } } });
  assert(audit.ok && audit.value, "side audit record appended");
  results.afterSideAppend = stateOf(big.sessionId);
  assert(results.afterSideAppend.needsRebuild === 1 || results.afterSideAppend.indexedSeq !== results.afterSideAppend.latestSeq, "the side append left the projection behind");
  results.dirty = await phase("dirty", big, keys, { paths: ["original:full-read", "patched:lagging"], anchors: false, existing: KEYS });

  // Codex style mirror on the dirty session: 10 existing + 5 new keys, then a replay.
  const mirrorKeys = [...recent.slice(0, 10), ...Array.from({ length: 5 }, (_, i) => `codex-app-server:candidate-mirror:${tag}:${i}`)];
  const mirrorOnce = async (which) => {
    const decided = { skipped: [], appended: [], deduped: [] };
    await lock[which](big, async (t) => {
      const facts = await t.readMessageFacts({ idempotencyKeys: mirrorKeys });
      for (const key of mirrorKeys) {
        if (facts.existingIdempotencyKeys.has(key)) { decided.skipped.push(key); continue; }
        const message = { ...structuredClone(assistantTemplate), content: [{ type: "text", text: `mirror ${key}` }], idempotencyKey: key, timestamp: Date.now() };
        const { result } = await t.appendMessageWithMessageSequence({ message, idempotencyLookup: "scan" });
        (result?.appended === false ? decided.deduped : decided.appended).push(key);
      }
    });
    return decided;
  };
  const countEvents = (key) => db.prepare("SELECT count(*) AS n FROM transcript_events WHERE session_id = ? AND instr(event_json, ?) > 0").get(big.sessionId, JSON.stringify(key)).n;
  const beforeMirror = Object.fromEntries(mirrorKeys.map((k) => [k, countEvents(k)]));
  // Decisions the original would take on the same state (read only; nothing appended by it).
  const originalFacts = (await read("original", big, mirrorKeys)).facts;
  const first = await mirrorOnce("patched");
  const afterFirst = Object.fromEntries(mirrorKeys.map((k) => [k, countEvents(k)]));
  const replay = await mirrorOnce("patched");
  const afterReplay = Object.fromEntries(mirrorKeys.map((k) => [k, countEvents(k)]));
  assert.deepEqual(first.skipped, mirrorKeys.slice(0, 10), "existing keys are skipped");
  assert.deepEqual(first.skipped, mirrorKeys.filter((k) => originalFacts.existingIdempotencyKeys.has(k)), "same skip decision as V's original");
  assert.deepEqual(first.appended, mirrorKeys.slice(10), "new keys are appended");
  assert.deepEqual(replay.skipped, mirrorKeys, "a replay appends nothing");
  for (const k of mirrorKeys.slice(0, 10)) assert.equal(afterReplay[k], beforeMirror[k], `existing ${k} not re-appended`);
  for (const k of mirrorKeys.slice(10)) { assert.equal(beforeMirror[k], 0); assert.equal(afterFirst[k], 1, `new ${k} appended once`); assert.equal(afterReplay[k], 1, `new ${k} still once after replay`); }
  const identityRows = mirrorKeys.slice(10).map((k) => db.prepare("SELECT count(*) AS n FROM transcript_event_identities WHERE session_id = ? AND message_idempotency_key = ?").get(big.sessionId, k).n);
  assert.deepEqual(identityRows, [1, 1, 1, 1, 1], "each new key owns exactly one identity row");
  results.mirror = { keys: mirrorKeys.length, first: { skipped: first.skipped.length, appended: first.appended.length, deduped: first.deduped.length }, replay: { skipped: replay.skipped.length, appended: replay.appended.length }, stateAfter: stateOf(big.sessionId) };

  // Unindexed: events but no identity rows (still a full read on both sides).
  const small = await newSession("unindexed");
  await appendMessages(small, { messages: sourceMessages.slice(0, 300).map((message, i) => ({ message: { ...structuredClone(message), idempotencyKey: `codex-app-server:candidate-small:${i}` } })) });
  const smallKeys = [...recentKeys(small.sessionId, 20), ...missingKeys];
  const rw = new DatabaseSync(dbPath);
  rw.prepare("DELETE FROM transcript_event_identities WHERE session_id = ?").run(small.sessionId);
  rw.prepare("UPDATE session_transcript_index_state SET needs_rebuild = 1 WHERE session_id = ?").run(small.sessionId);
  rw.close();
  results.unindexed = await phase("unindexed", small, smallKeys, { paths: ["original:full-read", "patched:unindexed"], anchors: false, existing: 20 });

  // Empty: a session with no transcript events.
  const empty = { agentId, sessionId: randomUUID(), sessionKey: `agent:${agentId}:explicit:vlab-dev-mirror-facts-empty-${Date.now().toString(36)}` };
  await createSession({ agentId, sessionKey: empty.sessionKey }, async () => ({ ok: true, entry: { sessionId: empty.sessionId, updatedAt: Date.now() } }));
  const emptyState = stateOf(empty.sessionId);
  if (!emptyState.events) results.empty = await phase("empty", empty, missingKeys, { paths: ["patched:empty"], anchors: false, existing: 0 });
  else results.empty = { skipped: "session creation wrote a header event", state: emptyState };

  db.close();
  await new Promise((resolve) => setTimeout(resolve, 1500)); // let the file transport flush
  results.slowHoldLogs = collectSlowHoldLogs();
  // Attribute each mirror-facts slow hold to the read whose window contains the log time.
  results.slowHoldByOperation = {};
  results.mirrorFactsSlowHolds = { byReader: {}, unattributed: 0, elapsedMs: [] };
  for (const { line } of results.slowHoldLogs) {
    const op = line.match(/"operation":"([^"]+)"/)?.[1] ?? "?";
    results.slowHoldByOperation[op] = (results.slowHoldByOperation[op] ?? 0) + 1;
    if (op !== "session.transcript.mirror-facts") continue;
    const when = Date.parse(line.match(/"date":"([^"]+)"/)?.[1] ?? "");
    results.mirrorFactsSlowHolds.elapsedMs.push(Number(line.match(/"elapsedMs":(\d+)/)?.[1]));
    const r = reads.find((x) => when >= x.at - 5 && when <= x.end + 50);
    if (!r) { results.mirrorFactsSlowHolds.unattributed += 1; continue; }
    results.mirrorFactsSlowHolds.byReader[r.which] = (results.mirrorFactsSlowHolds.byReader[r.which] ?? 0) + 1;
  }
  results.readsBySide = reads.reduce((acc, r) => ((acc[r.which] = (acc[r.which] ?? 0) + 1), acc), {});
  results.slowHoldSample = results.slowHoldLogs.find((x) => x.line.includes("mirror-facts"));
  delete results.slowHoldLogs;
  assert(results.slowHoldByOperation["session.transcript.mirror-facts"] > 0, "V's slow-hold warning is emitted for the original full read");
  assert(!results.mirrorFactsSlowHolds.byReader.patched && !results.mirrorFactsSlowHolds.byReader.probePatched, "no mirror-facts slow hold from the patched read");
  console.log(JSON.stringify(results, null, 2));
} finally {
  for (const file of Object.values(copies)) fs.rmSync(file, { force: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
}
process.exit(0);
