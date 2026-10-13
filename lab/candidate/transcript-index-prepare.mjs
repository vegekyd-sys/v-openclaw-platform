// Candidate A/B for lab/release-files/transcript-index-prepare: what one projection rebuild of a
// V-sized session costs with V's bytes (A) and with the patch (B), and whether both leave the same
// projection.
//
// On V (2026-10-12/13) a busy session's projection is marked dirty by side appends / rewrites and
// rebuilt in the background over and over: "sessions.transcript-index.prepare" 2-21 s in the
// reconcile Worker, each preceded by an unlabeled ~1.2 s BEGIN IMMEDIATE (the Worker opening the
// database through the writer path). Until the rebuild finishes, a turn that starts waits in
// waitForSessionTranscriptProjection (up to 15 s, before the model is called) and context reads
// fall back to whole-session reads.
//
// Setup (parent): a private makaron database built from the shared VLab mirror (read-only): its
// largest session inflated INFLATE times with view_image-shaped media (V's size), plus the next
// EXTRA_SESSIONS largest sessions as they are. Each variant runs in its own child process on its
// own copy of that database, in the order A B A B, with the variant's two dist files installed in
// the private runtime copy. A probe in node-sqlite logs every top-level transaction (label, mode,
// wait, hold incl. commit, main thread or Worker).
//
// Per child:
//   rounds   ROUNDS times: append one side-appended reply audit record (what a delivered channel
//            reply writes on V) to the big session, then measure
//              waitMs     waitForSessionTranscriptProjection from the append = the wait of a turn
//                         that starts right after the reply
//              windowMs   append -> projection current again
//              prepareMs  the prepare read transaction (Worker)
//              workerWriteMs  BEGIN IMMEDIATE held by the Worker (the open path)
//              mainMaxHoldMs / mainSumHoldMs  writer transactions on the main thread
//              eldMaxMs   main-thread event-loop delay max during the window
//   ordinary ORDINARY ordinary appends on the active branch (forward index, no rebuild): ms each,
//            and that no prepare ran
//   sync     small sessions rebuilt synchronously in a writer transaction (the other caller of the
//            patched function)
//   all      every session marked dirty and reconciled by the background path
//   digest   per session: active rows, FTS rows, index state (without updated_at)
// The parent compares the digests of A and B (must be identical) and reports medians.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const dist = path.join(runtime ?? "", "openclaw", "dist");
const AGENT = "makaron";
const DB_REL = path.join("agents", AGENT, "agent", "openclaw-agent.sqlite");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const med = (xs) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;
const max = (xs) => xs.length ? Math.max(...xs) : null;

if (process.argv[2] === "child") await child(process.argv[3], process.argv[4], process.argv[5]);
else await parent();

async function parent() {
  const shared = process.env.VLAB_SHARED_STATE_DIR;
  const data = process.env.VLAB_CANDIDATE_DATA;
  assert(runtime && shared && data, "candidate runtime environment is required");
  const INFLATE = Number(process.env.INFLATE ?? 5);
  const EXTRA_SESSIONS = Number(process.env.EXTRA_SESSIONS ?? 20);
  const MEDIA_ROWS = Number(process.env.MEDIA_ROWS ?? 40);
  const ORDER = (process.env.ORDER ?? "A,B,A,B").split(",");

  // ---- variant files ----
  const files = JSON.parse(fs.readFileSync("lab/transcript-index-prepare-plan.json", "utf8")).files;
  const variants = { A: {}, B: {} };
  for (const file of files) {
    const target = path.join(runtime, file.target);
    const original = fs.readFileSync(target);
    assert.equal(sha(original), file.before, `runtime ${file.target} is not V's bytes`);
    const patched = fs.readFileSync(file.source);
    assert.equal(sha(patched), file.after, `${file.source} is not the planned build`);
    variants.A[target] = original;
    variants.B[target] = patched;
  }
  const neighbours = {};
  for (const name of ["node-sqlite-CL-d6drd.js", "openclaw-agent-db-CUTe8BX6.js", "openclaw-agent-db-maintenance-DYSkzMMg.js", "session-accessor-K0XuW6ln.js", "session-transcript-reconcile-j5qhAafV.js", "session-accessor.sqlite-transcript-store-DV0WFe1a.js", "transcript-tree-BH69pMSi.js", "kysely-sync-DKYGT267.js", "agent-id-CeT3w4ap.js"]) {
    neighbours[name] = sha(fs.readFileSync(path.join(dist, name))).slice(0, 8);
  }

  // ---- transaction probe (same code for both variants) ----
  {
    const file = path.join(dist, "node-sqlite-CL-d6drd.js");
    const src = fs.readFileSync(file, "utf8");
    const anchor = `			if (vTail.active() && (vTailWaitMs >= 20 || vTailHoldMs >= 50)) vTail.note("tx", { op: options?.operationLabel ?? null, waitMs: vTailWaitMs, holdMs: vTailHoldMs });
		}
		commitImmediateTransaction(db, options);
`;
    assert.equal(src.split(anchor).length, 2, "node-sqlite probe anchor");
    fs.writeFileSync(file, src.replace(anchor, `${anchor}		if (process.env.TIP_TX_LOG) process.getBuiltinModule("node:fs").appendFileSync(process.env.TIP_TX_LOG, JSON.stringify({ at: Date.now(), op: options?.operationLabel ?? null, mode, waitMs: vTailWaitMs, holdMs: Date.now() - transactionStartedAt, main: process.getBuiltinModule("node:worker_threads").isMainThread }) + "\\n");
`));
  }

  // ---- base database ----
  const base = path.join(data, "tip-base", DB_REL);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  const built = buildBase(path.join(shared, DB_REL), base, { INFLATE, EXTRA_SESSIONS, MEDIA_ROWS });
  console.log(JSON.stringify({ phase: "base", ...built }));

  // ---- children ----
  const results = [];
  for (const [i, variant] of ORDER.entries()) {
    for (const [target, bytes] of Object.entries(variants[variant])) fs.writeFileSync(target, bytes);
    const stateDir = path.join(data, `tip-${i}-${variant}`);
    const dbPath = path.join(stateDir, DB_REL);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.copyFileSync(base, dbPath);
    const txLog = path.join(stateDir, "tx.jsonl");
    const run = spawnSync(process.execPath, ["--max-old-space-size=8192", process.argv[1], "child", variant, stateDir, JSON.stringify({ big: built.big, sessions: built.sessions })], {
      encoding: "utf8", maxBuffer: 256 * 1024 ** 2,
      env: { ...childEnv(stateDir), TIP_TX_LOG: txLog },
    });
    const lines = run.stdout.trim().split("\n").filter((l) => l.startsWith("{"));
    const result = JSON.parse(lines.at(-1) ?? "{}");
    if (run.status !== 0 || !result.digest) {
      console.log(run.stdout.slice(-4000));
      console.log(run.stderr.slice(-8000));
      throw new Error(`child ${variant} failed with ${run.status}`);
    }
    results.push({ variant, ...result });
    console.log(JSON.stringify({ phase: "child", variant, i, rounds: result.rounds, ordinary: result.ordinarySummary, sync: result.syncSummary, all: result.allSummary }));
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  fs.rmSync(path.join(data, "tip-base"), { recursive: true, force: true });

  // ---- compare ----
  const digests = new Set(results.map((r) => r.digest));
  const summary = {};
  for (const variant of ["A", "B"]) {
    const rounds = results.filter((r) => r.variant === variant).flatMap((r) => r.rounds);
    const ordinary = results.filter((r) => r.variant === variant).flatMap((r) => r.ordinaryMs);
    summary[variant] = Object.fromEntries(["waitMs", "windowMs", "prepareMs", "workerWriteMs", "mainMaxHoldMs", "mainSumHoldMs", "eldMaxMs"].map((k) => [k, { med: med(rounds.map((r) => r[k])), max: max(rounds.map((r) => r[k])) }]));
    summary[variant].ordinaryAppendMs = { med: med(ordinary), max: max(ordinary), n: ordinary.length };
    summary[variant].ordinaryPrepares = results.filter((r) => r.variant === variant).map((r) => r.ordinarySummary.prepares);
    summary[variant].sync = results.filter((r) => r.variant === variant).map((r) => r.syncSummary);
    summary[variant].all = results.filter((r) => r.variant === variant).map((r) => r.allSummary);
  }
  const report = { neighbours, base: built, identicalProjection: digests.size === 1, digests: [...digests].map((d) => d.slice(0, 16)), sessionsCompared: results[0].sessionsCompared, summary };
  fs.writeFileSync("tip-report.json", JSON.stringify({ report, results }, null, 2));
  console.log(JSON.stringify({ phase: "report", ...report }));
  assert.equal(digests.size, 1, "A and B left different projections");
}

// The candidate environment points db91 state checks (OPENCLAW_DB91_INTEGRITY_STATE_ROOT, ...) at
// the candidate's state directory; each child moves every such path to its own directory.
function childEnv(stateDir) {
  const from = process.env.OPENCLAW_STATE_DIR;
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    env[key] = value === from ? stateDir : value?.startsWith(`${from}/`) ? stateDir + value.slice(from.length) : value;
  }
  return env;
}

function buildBase(srcPath, dstPath, { INFLATE, EXTRA_SESSIONS, MEDIA_ROWS }) {
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(dstPath, { allowExtension: true });
  src.loadExtension(vec);
  dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  const top = src.prepare(`SELECT s.session_id FROM session_transcript_index_state s JOIN session_nodes n ON n.current_session_id = s.session_id
    WHERE s.needs_rebuild = 0 ORDER BY s.active_event_count DESC LIMIT ?`).all(EXTRA_SESSIONS + 1).map((r) => r.session_id);
  const big = top[0];
  const ids = top;
  const keys = ids.map((id) => src.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(id).session_key);
  const convs = new Set();
  for (const id of ids) {
    for (const r of src.prepare("SELECT conversation_id FROM session_conversations WHERE session_id = ?").all(id)) convs.add(r.conversation_id);
    const primary = src.prepare("SELECT primary_conversation_id FROM session_windows WHERE session_id = ?").get(id)?.primary_conversation_id;
    if (primary) convs.add(primary);
  }
  const inList = (col, values) => `"${col}" IN (${values.map(() => "?").join(",")})`;
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    let where, args;
    if (cols.includes("session_id")) { where = inList("session_id", ids); args = ids; }
    else if (cols.includes("session_key")) { where = inList("session_key", keys); args = keys; }
    else if (cols.includes("conversation_id")) {
      if (!convs.size) continue;
      where = `"conversation_id" IN (${[...convs].map(() => "?").join(",")})`; args = [...convs];
    } else { where = ""; args = []; }
    const list = cols.map((c) => `"${c}"`).join(",");
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of src.prepare(`SELECT ${list} FROM "${t.name}"${where ? ` WHERE ${where}` : ""}`).iterate(...args)) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  src.close();

  // inflate the biggest session INFLATE times as one chain, derived rows consistent (as in big-session-reads.mjs)
  const sid = big;
  const events = dst.prepare("SELECT seq, event_json, created_at FROM transcript_events WHERE session_id = ? ORDER BY seq").all(sid).map((e) => ({ ...e, obj: JSON.parse(e.event_json) }));
  const identities = dst.prepare("SELECT event_id, seq, event_type, parent_id, message_idempotency_key, created_at FROM transcript_event_identities WHERE session_id = ?").all(sid);
  const active = dst.prepare("SELECT active_position, event_seq, message_position, context_eligible FROM session_transcript_active_events WHERE session_id = ? ORDER BY active_position").all(sid);
  const state = dst.prepare("SELECT * FROM session_transcript_index_state WHERE session_id = ?").get(sid);
  assert(state && state.needs_rebuild === 0 && state.leaf_event_id, "source session index state is not usable");
  const header = events.find((e) => e.obj.type === "session");
  const idSet = new Set(identities.map((r) => r.event_id));
  const stride = Math.max(...events.map((e) => e.seq)) + 1;
  const body = events.filter((e) => e !== header);
  const activeBody = active.filter((a) => a.event_seq !== header?.seq);
  const suffix = (id, b) => `${id}r${b}`;
  const rewrite = (value, b) => {
    if (typeof value === "string") return idSet.has(value) ? suffix(value, b) : value;
    if (Array.isArray(value)) return value.map((v) => rewrite(v, b));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, b)]));
    return value;
  };
  const insEvent = dst.prepare("INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)");
  const insIdentity = dst.prepare("INSERT INTO transcript_event_identities (session_id, event_id, seq, event_type, parent_id, message_idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insActive = dst.prepare("INSERT INTO session_transcript_active_events (session_id, active_position, event_seq, message_position, context_eligible) VALUES (?, ?, ?, ?, ?)");
  const identityBySeq = new Map(identities.map((r) => [r.seq, r]));
  dst.exec("BEGIN");
  let leaf = state.leaf_event_id;
  for (let b = 1; b < INFLATE; b++) {
    const previousLeaf = leaf;
    for (const e of body) {
      let obj = rewrite(e.obj, b);
      if ("parentId" in obj && obj.parentId === null) obj.parentId = previousLeaf;
      const metaToCustom = obj.type === "thinking_level_change" || obj.type === "model_change";
      if (metaToCustom) obj = { type: "custom", customType: "inflated-meta", id: obj.id, parentId: obj.parentId, timestamp: obj.timestamp, data: {} };
      const seq = b * stride + e.seq;
      insEvent.run(sid, seq, JSON.stringify(obj), e.created_at);
      const identity = identityBySeq.get(e.seq);
      if (identity) {
        insIdentity.run(sid, suffix(identity.event_id, b), seq, metaToCustom ? "custom" : identity.event_type,
          identity.parent_id === null ? previousLeaf : (idSet.has(identity.parent_id) ? suffix(identity.parent_id, b) : identity.parent_id),
          identity.message_idempotency_key === null ? null : `${identity.message_idempotency_key}:r${b}`, identity.created_at);
      }
    }
    activeBody.forEach((a, index) => {
      insActive.run(sid, active.length + (b - 1) * activeBody.length + index, b * stride + a.event_seq,
        a.message_position === null ? null : b * state.active_message_count + a.message_position, a.context_eligible);
    });
    leaf = suffix(state.leaf_event_id, b);
  }
  dst.prepare("UPDATE session_transcript_index_state SET indexed_seq = ?, leaf_event_id = ?, active_event_count = ?, active_message_count = ? WHERE session_id = ?")
    .run((INFLATE - 1) * stride + stride - 1, leaf, active.length + (INFLATE - 1) * activeBody.length, INFLATE * state.active_message_count, sid);
  const toolResults = dst.prepare(`SELECT seq FROM transcript_events WHERE session_id = ? AND json_extract(event_json, '$.message.role') = 'toolResult' ORDER BY seq`).all(sid).map((r) => r.seq);
  const n = Math.min(MEDIA_ROWS, toolResults.length);
  const picks = new Set(Array.from({ length: n }, (_, i) => toolResults[Math.floor((i + 0.5) * toolResults.length / n)]));
  const getEvent = dst.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? AND seq = ?");
  const setEvent = dst.prepare("UPDATE transcript_events SET event_json = ? WHERE session_id = ? AND seq = ?");
  for (const seq of picks) {
    const obj = JSON.parse(getEvent.get(sid, seq).event_json);
    const images = Array.from({ length: 5 }, () => ({ type: "image", data: randomBytes(180_000).toString("base64"), mimeType: "image/jpeg" }));
    obj.message.content = [...(Array.isArray(obj.message.content) ? obj.message.content : [{ type: "text", text: String(obj.message.content ?? "") }]), ...images];
    setEvent.run(JSON.stringify(obj), sid, seq);
  }
  dst.exec("COMMIT");
  // the inflated FTS rows are left to the first rebuild; mark nothing dirty here
  const size = dst.prepare("SELECT count(*) AS rows, sum(octet_length(event_json)) AS bytes FROM transcript_events WHERE session_id = ?").get(sid);
  const all = dst.prepare("SELECT count(DISTINCT session_id) AS sessions, count(*) AS rows, sum(octet_length(event_json)) AS bytes FROM transcript_events").get();
  dst.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  dst.close();
  return { big, bigRows: size.rows, bigMb: Math.round(size.bytes / 1e5) / 10, sessions: ids.map((id, i) => ({ sessionId: id, sessionKey: keys[i] })), totalSessions: all.sessions, totalRows: all.rows, totalMb: Math.round(all.bytes / 1e5) / 10 };
}

async function child(variant, stateDir, argsJson) {
  const { big, sessions } = JSON.parse(argsJson);
  const ROUNDS = Number(process.env.ROUNDS ?? 4);
  const ORDINARY = Number(process.env.ORDINARY ?? 20);
  const SETTLE_MS = Number(process.env.SETTLE_MS ?? 3000);
  const txLog = process.env.TIP_TX_LOG;
  const dbPath = path.join(stateDir, DB_REL);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const exp = (file, local) => {
    const src = fs.readFileSync(path.join(dist, file), "utf8");
    const m = src.match(new RegExp(`\\b${local} as ([A-Za-z_$][\\w$]*)[,\\s}]`));
    assert(m, `${file} does not export ${local}`);
    return m[1];
  };
  const accessorFile = "session-accessor-K0XuW6ln.js";
  const reconcileFile = "session-transcript-reconcile-j5qhAafV.js";
  const indexFile = "session-transcript-index-9itOio9h.js";
  const dbFile = "openclaw-agent-db-CUTe8BX6.js";
  const accessor = await import(path.join(dist, accessorFile));
  const reconcile = await import(path.join(dist, reconcileFile));
  const index = await import(path.join(dist, indexFile));
  const agentDb = await import(path.join(dist, dbFile));
  const appendEvent = accessor[exp(accessorFile, "appendTranscriptEventSync")];
  const appendMessage = accessor[exp(accessorFile, "appendTranscriptMessageSync")];
  const waitForProjection = reconcile[exp(reconcileFile, "waitForSessionTranscriptProjection")];
  const waitForReconcile = reconcile[exp(reconcileFile, "waitForSessionTranscriptIndexReconcile")];
  const startReconcile = reconcile[exp(reconcileFile, "startSessionTranscriptIndexReconcile")];
  const markDirty = index[exp(indexFile, "markSessionTranscriptIndexDirtyInTransaction")];
  const reconcileInTx = index[exp(indexFile, "reconcileSessionTranscriptIndexInTransaction")];
  const shouldSync = index[exp(indexFile, "shouldRebuildSessionTranscriptIndexSynchronously")];
  const openDb = agentDb[exp(dbFile, "openOpenClawAgentDatabase")];
  const writeTx = agentDb[exp(dbFile, "runOpenClawAgentWriteTransaction")];
  for (const f of [appendEvent, appendMessage, waitForProjection, waitForReconcile, startReconcile, markDirty, reconcileInTx, shouldSync, openDb, writeTx]) assert.equal(typeof f, "function");
  const options = { agentId: AGENT, path: dbPath };
  const bigScope = { agentId: AGENT, ...sessions.find((s) => s.sessionId === big) };
  const ro = new DatabaseSync(dbPath, { readOnly: true });
  const stateOf = (sid) => ro.prepare("SELECT needs_rebuild, indexed_seq, (SELECT max(seq) FROM transcript_events WHERE session_id = ?) AS latest FROM session_transcript_index_state WHERE session_id = ?").get(sid, sid);
  const current = (sid) => { const s = stateOf(sid); return s && s.needs_rebuild === 0 && s.indexed_seq === s.latest; };
  const tx = () => fs.existsSync(txLog) ? fs.readFileSync(txLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const since = (t0, t1 = Infinity) => tx().filter((r) => r.at >= t0 && r.at <= t1);

  const t0 = Date.now();
  openDb(options); // first open: db91 verification and schema convergence, as at Gateway start
  const openMs = Date.now() - t0;
  // bring every copied session current once (the inflated session has no FTS rows for its copies yet)
  await writeTx((database) => { markDirty(database.db, big); }, options, { operationLabel: "tip.mark" });
  startReconcile({ ...options, preferredSessionId: big });
  await sleep(0);
  await waitForReconcile(options);
  assert(current(big), "big session current after the initial rebuild");

  // ---- rounds: one side-appended reply record, then the rebuild it causes ----
  const rounds = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    await sleep(SETTLE_MS);
    const eld = monitorEventLoopDelay({ resolution: 5 });
    eld.enable();
    const stalls = [];
    let last = performance.now();
    const sampler = setInterval(() => { const now = performance.now(); const lag = now - last - 5; last = now; if (lag >= 40) stalls.push({ at: Date.now(), lagMs: Math.round(lag) }); }, 5);
    const gcs = [];
    const gcObserver = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.duration >= 10) gcs.push({ at: Math.round(performance.timeOrigin + e.startTime + e.duration), ms: Math.round(e.duration), kind: e.detail?.kind }); });
    gcObserver.observe({ entryTypes: ["gc"] });
    const appendAt = Date.now();
    appendEvent(bigScope, { type: "custom", id: `conversation-turn-reply-tip-${r}`, customType: "openclaw.conversation-turn-reply", appendMode: "side", timestamp: 1791820000000 + r, data: { turnId: `tip-${r}`, message: { role: "assistant", content: [{ type: "text", text: `side reply ${r}` }] } } });
    assert(!current(big), "side append leaves the projection dirty");
    let waitMs;
    let waitError;
    try {
      const proof = await waitForProjection(bigScope);
      waitMs = Date.now() - appendAt;
      assert(proof.indexedSeq >= 0);
    } catch (error) {
      waitError = String(error?.message ?? error);
      waitMs = Date.now() - appendAt;
    }
    while (!current(big)) await sleep(5);
    const windowMs = Date.now() - appendAt;
    await sleep(0);
    await waitForReconcile(options);
    const doneAt = Date.now();
    eld.disable();
    clearInterval(sampler);
    gcObserver.disconnect();
    const rows = since(appendAt, doneAt);
    // each main-thread stall >= 40 ms with what ended around it (transactions on either thread, main-thread GC)
    const stallDetail = stalls.sort((a, b) => b.lagMs - a.lagMs).slice(0, 4).map((st) => ({
      atMs: st.at - appendAt, lagMs: st.lagMs,
      tx: rows.filter((x) => x.at >= st.at - st.lagMs - 20 && x.at <= st.at + 5).map((x) => `${x.main ? "main" : "worker"}:${x.op}:${x.holdMs}`),
      gc: gcs.filter((g) => g.at >= st.at - st.lagMs - 20 && g.at <= st.at + 5).map((g) => `${g.kind}:${g.ms}`),
    }));
    const main = rows.filter((x) => x.main && x.mode === "immediate");
    rounds.push({
      waitMs, waitError, windowMs,
      prepareMs: rows.filter((x) => x.op === "sessions.transcript-index.prepare").reduce((s, x) => s + x.holdMs, 0),
      workerWriteMs: rows.filter((x) => !x.main && x.mode === "immediate").reduce((s, x) => s + x.holdMs, 0),
      workerWrites: rows.filter((x) => !x.main && x.mode === "immediate").length,
      mainMaxHoldMs: max(main.map((x) => x.holdMs)) ?? 0,
      mainSumHoldMs: main.reduce((s, x) => s + x.holdMs, 0),
      mainWrites: main.length,
      ops: Object.entries(rows.reduce((m, x) => { const k = `${x.main ? "main" : "worker"}:${x.mode}:${x.op}`; m[k] = (m[k] ?? 0) + x.holdMs; return m; }, {})).map(([k, v]) => `${k}=${v}`),
      eldMaxMs: Math.round(eld.max / 1e6),
      gcMaxMs: max(gcs.map((g) => g.ms)) ?? 0,
      gcSumMs: gcs.reduce((a, g) => a + g.ms, 0),
      stallDetail,
    });
  }

  // ---- ordinary appends on the active branch: forward index, no rebuild ----
  await sleep(SETTLE_MS);
  const ordinaryAt = Date.now();
  const ordinaryMs = [];
  for (let i = 0; i < ORDINARY; i += 1) {
    const t = Date.now();
    const appended = appendMessage(bigScope, { eventId: `tip-ordinary-${i}`, now: 1791821000000 + i, message: { role: i % 2 ? "assistant" : "user", content: [{ type: "text", text: `ordinary ${i}` }], timestamp: 1791821000000 + i } });
    ordinaryMs.push(Date.now() - t);
    assert(appended.ok && appended.value?.appended, `ordinary append ${i}: ${JSON.stringify(appended)}`);
  }
  await sleep(1500);
  const ordinaryRows = since(ordinaryAt);
  const ordinarySummary = { med: med(ordinaryMs), max: max(ordinaryMs), prepares: ordinaryRows.filter((x) => x.op === "sessions.transcript-index.prepare").length, stillCurrent: current(big) };

  // ---- synchronous rebuild of small sessions inside a writer transaction ----
  const small = [];
  for (const s of sessions) {
    if (s.sessionId === big) continue;
    const yes = await writeTx((database) => shouldSync(database.db, s.sessionId), options, { operationLabel: "tip.size" });
    if (yes) small.push(s.sessionId);
  }
  const syncMs = [];
  for (const sid of small) {
    await writeTx((database) => { markDirty(database.db, sid); }, options, { operationLabel: "tip.mark" });
    const t = Date.now();
    await writeTx((database) => { reconcileInTx(database.db, sid); }, options, { operationLabel: "tip.sync-rebuild" });
    syncMs.push(Date.now() - t);
    assert(current(sid), `sync rebuild left ${sid} dirty`);
  }
  const syncSummary = { sessions: small.length, med: med(syncMs), max: max(syncMs), sum: syncMs.reduce((a, b) => a + b, 0) };

  // ---- every session through the background reconcile ----
  await writeTx((database) => { for (const s of sessions) markDirty(database.db, s.sessionId); }, options, { operationLabel: "tip.mark" });
  const allAt = Date.now();
  startReconcile(options);
  await sleep(0);
  await waitForReconcile(options);
  const allRows = since(allAt);
  for (const s of sessions) assert(current(s.sessionId), `background reconcile left ${s.sessionId} dirty`);
  const allSummary = { ms: Date.now() - allAt, prepareSumMs: allRows.filter((x) => x.op === "sessions.transcript-index.prepare").reduce((a, x) => a + x.holdMs, 0), workerWrites: allRows.filter((x) => !x.main && x.mode === "immediate").length };

  // ---- digest ----
  const h = createHash("sha256");
  let sessionsCompared = 0;
  for (const s of [...sessions].sort((a, b) => a.sessionId.localeCompare(b.sessionId))) {
    h.update(`session ${s.sessionId}\n`);
    for (const r of ro.prepare("SELECT active_position, event_seq, message_position, context_eligible FROM session_transcript_active_events WHERE session_id = ? ORDER BY active_position").iterate(s.sessionId)) h.update(JSON.stringify(r));
    for (const r of ro.prepare("SELECT message_id, role, text, timestamp FROM session_transcript_fts WHERE session_id = ? ORDER BY rowid").iterate(s.sessionId)) h.update(JSON.stringify(r));
    h.update(JSON.stringify(ro.prepare("SELECT active_event_count, active_message_count, indexed_seq, leaf_event_id, needs_rebuild FROM session_transcript_index_state WHERE session_id = ?").get(s.sessionId)));
    sessionsCompared += 1;
  }
  ro.close();
  console.log(JSON.stringify({ variant, openMs, rounds, ordinaryMs, ordinarySummary, syncSummary, allSummary, sessionsCompared, digest: h.digest("hex") }));
  process.exit(0);
}
