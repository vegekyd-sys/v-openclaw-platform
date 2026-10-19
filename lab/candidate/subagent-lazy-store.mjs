// Candidate check for subagent-lazy-session-store-v1: same answers, fewer reads.
//
// Builds a private makaron database holding the shared VLab mirror's session store (every
// session_nodes row and the small session tables; transcripts, FTS and memory are left out),
// then, for every session key plus synthetic misses (unknown keys, session ids used as keys, a
// foreign agent), runs the subagent capability and completion lookups that V's Gateway runs per
// turn and per subagent cleanup. Prints a digest of every answer (compare the digests of a run
// without and a run with the release files) and the per-call latency of the hot calls.
// With the release it also compares the lazy view entry by entry against the full list.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && stateDir && sharedState && configPath, "candidate runtime environment is required");
const TIMING_KEYS = Number(process.env.TIMING_KEYS ?? 40);
const SKIP = /^(transcript_|session_transcript_|memory_|standing_intents_fts)/u;
const dist = path.join(runtime, "openclaw", "dist");
const load = async (file) => import(pathToFileURL(path.join(dist, file)).href);
const sha = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);
const stable = (value) => JSON.stringify(value, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));

// ---- private database: the session store only ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
fs.mkdirSync(path.dirname(dstPath), { recursive: true });
{
  const src = new DatabaseSync(srcPath, { readOnly: true });
  const dst = new DatabaseSync(dstPath);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name) && !(virtual.includes(m.name) && /vec0/iu.test(m.sql)));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && tables.some((t) => t.name === m.tbl_name))) dst.exec(i.sql);
  for (const t of tables) {
    if (SKIP.test(t.name) || virtual.includes(t.name)) continue;
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => `"${c.name}"`);
    const ins = dst.prepare(`INSERT INTO "${t.name}" (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of src.prepare(`SELECT ${cols.join(",")} FROM "${t.name}"`).iterate()) ins.run(...Object.values(r));
    dst.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && tables.some((t) => t.name === m.tbl_name))) dst.exec(tr.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  src.close();
  dst.close();
}
const db = new DatabaseSync(dstPath, { readOnly: true });
const rows = db.prepare("SELECT session_key, current_session_id, spawned_by FROM session_nodes ORDER BY session_key").all();
const nodeStats = db.prepare("SELECT count(*) AS n, sum(length(entry_json)) AS bytes FROM session_nodes").get();
db.close();

// ---- runtime under test ----
const caps = await load("subagent-capabilities-CPAHEjL-.js");
const admission = await load("subagent-completion-admission.store-JmpNDYTF.js");
const entryMod = await load("session-accessor.sqlite-entry-BlklNPKQ.js");
const agentDb = await load("openclaw-agent-db-CUTe8BX6.js");
const patched = typeof entryMod.z === "function";
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
agentDb.g({ agentId: "makaron" }); // first open runs the integrity check; keep it out of the timings

const SAMPLE = Number(process.env.SAMPLE_KEYS ?? 100);
const everyNth = (list, n) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
// deterministic sample: the baseline reads the whole store per call, so all 4k keys would take hours
const keys = [...everyNth(rows.map((r) => r.session_key), SAMPLE), ...rows.filter((r) => r.spawned_by).map((r) => r.session_key)];
const synthetic = [
  "agent:makaron:subagent:does-not-exist",
  "agent:makaron:feishu:direct:ou_nobody",
  "agent:other-agent:subagent:x",
  "unknown",
  ...everyNth(rows.filter((r) => r.current_session_id), 20).map((r) => r.current_session_id),
  ...rows.filter((r) => r.spawned_by).map((r) => r.spawned_by),
];
const probes = [...new Set([...keys, ...synthetic])];
const answer = (fn) => { try { return { ok: fn() }; } catch (error) { return { error: String(error?.message ?? error).slice(0, 200) }; } };
const digests = {};
const record = (name, key, value) => { (digests[name] ??= createHash("sha256")).update(`${key}\0${stable(value)}\n`); };
for (const key of probes) {
  record("depth", key, answer(() => caps.c(key, { cfg })));
  record("capabilities", key, answer(() => caps.r(key, { cfg })));
  record("isSubagentEnvelope", key, answer(() => caps.t(key, { cfg })));
  record("persistedEnvelope", key, answer(() => caps.n(key, { cfg })));
  record("inheritedDeny", key, answer(() => caps.a(key, { cfg })));
  record("inheritedAllow", key, answer(() => caps.i(key, { cfg })));
  record("completionEntry", key, answer(() => admission.L({ childSessionKey: key, cfg })));
}
const out = { patched, sessionNodes: nodeStats.n, entryMb: Math.round(nodeStats.bytes / 1e5) / 10, probes: probes.length, digests: Object.fromEntries(Object.entries(digests).map(([k, h]) => [k, h.digest("hex").slice(0, 16)])) };

// ---- lazy view against the full list ----
if (patched) {
  const full = Object.fromEntries(entryMod.a({ agentId: "makaron", clone: false }).map(({ sessionKey, entry }) => [sessionKey, entry]));
  const view = entryMod.z({ agentId: "makaron" });
  let mismatches = 0;
  const allKeys = [...new Set([...rows.map((r) => r.session_key), ...probes])];
  for (const key of allKeys) if (!isDeepStrictEqual(view[key], full[key])) mismatches++;
  const lookup = view[Symbol.for("openclaw.v.sessionEntryLookup")];
  let idMismatches = 0;
  for (const id of new Set(rows.map((r) => r.current_session_id).filter(Boolean))) {
    const expected = Object.values(full).find((e) => typeof e?.sessionId === "string" && e.sessionId.trim() === id);
    if (!isDeepStrictEqual(lookup.findBySessionId(id), expected)) idMismatches++;
  }
  const enumerated = entryMod.z({ agentId: "makaron" });
  out.lazyView = { keysCompared: allKeys.length, mismatches, idMismatches, enumerationEqual: isDeepStrictEqual(Object.keys(enumerated), Object.keys(full)) && isDeepStrictEqual(Object.values(enumerated), Object.values(full)) };
}

// ---- latency of the per-turn and per-cleanup calls ----
const time = (fn) => { const t0 = performance.now(); fn(); return performance.now() - t0; };
const pick = (list, n) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
const mains = pick(rows.filter((r) => !r.spawned_by).map((r) => r.session_key), TIMING_KEYS);
const subs = pick(rows.filter((r) => r.spawned_by).map((r) => r.session_key), TIMING_KEYS);
const stats = (ms) => { const s = [...ms].sort((a, b) => a - b); return { n: s.length, p50: Math.round(s[Math.floor(s.length / 2)]), max: Math.round(s.at(-1)), totalMs: Math.round(s.reduce((a, b) => a + b, 0)) }; };
out.latencyMs = {
  depthMainSession: stats(mains.map((k) => time(() => caps.c(k, { cfg })))),
  capabilitiesSubagent: stats(subs.map((k) => time(() => caps.r(k, { cfg })))),
  persistedEnvelopeSubagent: stats(subs.map((k) => time(() => caps.n(k, { cfg })))),
  completionEntry: stats(subs.map((k) => time(() => admission.L({ childSessionKey: k, cfg })))),
};
console.log(JSON.stringify(out, null, 1));
