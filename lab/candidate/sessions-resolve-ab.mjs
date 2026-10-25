// sessions-resolve-exact-read A/B on a copy of V's session tables (see lab/sessions-resolve-exact-read.md).
//
// Data (read-only export from V, kept outside the repository; FIXTURE_DIR on the VLab host):
//   v-sessions.sqlite   all session_nodes / session_windows / session_participants /
//                       session_transcript_index_state / session_progress_cards rows of makaron
// A fresh makaron agent database is created by OpenClaw itself (schema, triggers) under WORK_DIR, then
// filled from the export; entry_valid keeps V's value (the insert trigger resets it).
//
// Both chunks are loaded side by side from the candidate dist: V's file and the release file under
// another name. Every case calls resolveSessionKeyFromResolveParams (the whole sessions.resolve
// decision; the handler only maps its result to the response) on both and compares the results.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { Session } from "node:inspector/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/rsx-20261023";
const WORK_DIR = process.env.WORK_DIR ?? path.join(FIXTURE_DIR, `run-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const REPEAT = Number(process.env.REPEAT ?? 5);
const SAMPLE = Number(process.env.SAMPLE ?? 100);
const NAME = "sessions-resolve-_D6BmQTT.js";
const RELEASE = path.resolve("lab/release-files/sessions-resolve-exact-read", NAME);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const out = {};
const progressLog = path.join(FIXTURE_DIR, `${path.basename(WORK_DIR)}.progress.log`);
const log = (key, value) => {
  out[key] = value;
  const line = `[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`;
  console.error(line);
  fs.appendFileSync(progressLog, `${line}\n`);
};

// ---- state directory ----
const stateDir = path.join(WORK_DIR, "state");
const agentDb = path.join(stateDir, "agents", "makaron", "agent", "openclaw-agent.sqlite");
if (process.env.KEEP_WORK !== "1") process.on("exit", () => fs.rmSync(WORK_DIR, { recursive: true, force: true }));
fs.mkdirSync(path.dirname(agentDb), { recursive: true });
// V's session.maintenance (warn): nothing here writes sessions, but keep VLab's enforce mode out of it.
{
  const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
  config.session = { ...config.session, maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  fs.writeFileSync(path.join(stateDir, "openclaw.json"), JSON.stringify(config, null, 2));
}
process.env.OPENCLAW_STATE_DIR = stateDir;
process.env.OPENCLAW_CONFIG_PATH = path.join(stateDir, "openclaw.json");
process.env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT = stateDir;
process.env.OPENCLAW_HOME = WORK_DIR;

// ---- side-by-side chunks ----
const plan = JSON.parse(fs.readFileSync("lab/sessions-resolve-exact-read.plan.json", "utf8")).files[0];
const pair = {};
for (const [arm, file, expected] of [["base", path.join(DIST, NAME), plan.before], ["patched", RELEASE, plan.after]]) {
  const source = fs.readFileSync(file, "utf8");
  assert.equal(sha(source), expected, `${arm}: ${file} hash`);
  const copy = path.join(DIST, NAME.replace(/\.js$/u, `.RSX${arm.toUpperCase()}.js`));
  fs.writeFileSync(copy, source);
  process.on("exit", () => fs.rmSync(copy, { force: true }));
  pair[arm] = (await import(copy)).t;
}

// ---- allocation and main-thread measurement ----
const inspector = new Session();
inspector.connect();
async function measure(label, fn, repeat = REPEAT) {
  // The lookup is synchronous up to its result, so wall time per call is time the main thread is blocked.
  global.gc?.();
  await inspector.post("HeapProfiler.startSampling", { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const times = [];
  let value;
  for (let i = 0; i < repeat; i++) {
    const t = performance.now();
    value = await fn(i);
    times.push(performance.now() - t);
  }
  const { profile } = await inspector.post("HeapProfiler.stopSampling");
  const allocated = profile.samples.reduce((sum, s) => sum + s.size, 0);
  const sorted = [...times].sort((a, b) => a - b);
  return {
    label,
    repeat,
    msMedian: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
    msMax: Math.round(sorted.at(-1) * 10) / 10,
    allocatedMBPerCall: Math.round(allocated / repeat / 1e5) / 10,
    value,
  };
}

// ---- fixture: agent database built by OpenClaw, filled from V's export ----
const sessionsFixture = path.join(FIXTURE_DIR, "v-sessions.sqlite");
const { g: openOpenClawAgentDatabase, a: closeOpenClawAgentDatabases } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
const INTERNAL_KEY = "agent:makaron:internal-session-effects:rsx-ab-run-0123456789abcdef";
{
  const t = performance.now();
  openOpenClawAgentDatabase({ agentId: "makaron" });
  closeOpenClawAgentDatabases();
  const db = new DatabaseSync(agentDb);
  db.exec("PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 30000;");
  db.exec(`ATTACH '${sessionsFixture}' AS v`);
  const copy = (table) => {
    const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
    const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
    const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
    db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
    return db.prepare(`SELECT count(*) AS n FROM main.${table}`).get().n;
  };
  db.exec("BEGIN");
  const counts = {};
  for (const table of ["session_nodes", "session_windows", "session_participants", "session_transcript_index_state", "session_progress_cards"]) counts[table] = copy(table);
  db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key)");
  db.exec("UPDATE main.session_windows SET primary_conversation_id = NULL");
  // One internal-session-effects row (V has none today): the whole-store read never returns them.
  const donor = db.prepare("SELECT * FROM main.session_nodes WHERE session_key LIKE 'agent:makaron:subagent:%' LIMIT 1").get();
  db.prepare("INSERT INTO main.session_nodes (session_key, current_session_id, entry_json, updated_at, status) VALUES (?, ?, ?, ?, ?)").run(INTERNAL_KEY, "internal-session-effects-rsx-ab", donor.entry_json.replace(donor.current_session_id, "internal-session-effects-rsx-ab"), donor.updated_at, donor.status);
  db.prepare("UPDATE main.session_nodes SET entry_valid = 1 WHERE session_key = ?").run(INTERNAL_KEY);
  db.exec("COMMIT");
  const entryBytes = db.prepare("SELECT sum(length(entry_json)) AS n FROM main.session_nodes").get().n;
  db.exec("DETACH v; PRAGMA wal_checkpoint(TRUNCATE);");
  db.close();
  log("fixture", { counts, entryJsonMB: Math.round(entryBytes / 1e6), bytes: fs.statSync(agentDb).size, ms: Math.round(performance.now() - t) });
}
// The Gateway keeps the writable handle open; so does this process.
openOpenClawAgentDatabase({ agentId: "makaron" });
const { n: getRuntimeConfig } = await import(path.join(DIST, "io.runtime-CKu7Rw0j.js"));
const cfg = getRuntimeConfig();
const rows = new DatabaseSync(agentDb, { readOnly: true }).prepare("SELECT session_key, current_session_id, label, spawned_by, parent_session_key, archived_at, updated_at, json_extract(entry_json, '$.endedAt') AS ended_at FROM session_nodes ORDER BY session_key").all();

// ---- cases ----
const spread = (list, n) => list.filter((_r, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
const nightshift = rows.filter((r) => r.session_key.startsWith("agent:makaron:subagent:workboard-nightshift-"));
const others = rows.filter((r) => !r.session_key.startsWith("agent:makaron:subagent:workboard-nightshift-") && r.session_key !== INTERNAL_KEY);
const sampled = [...spread(nightshift, Math.ceil(SAMPLE / 2)), ...spread(others, Math.ceil(SAMPLE / 2))];
const linked = rows.filter((r) => r.spawned_by || r.parent_session_key);
const cases = [];
const add = (kind, p, opts = {}) => cases.push({ kind, p, ...opts });
for (const r of sampled) {
  add("key", { key: r.session_key });
  add("key+agent", { key: r.session_key, agentId: "makaron" });
}
for (const r of spread(sampled, 20)) add("key+allowMissing", { key: r.session_key, allowMissing: true });
// Store-only child links count for 30 min after the child ends, so V's (old) rows are evaluated twice:
// at the real clock and at a clock one minute after the child ended (or was last updated).
const freshAt = (r) => (Number(r.ended_at) || r.updated_at) + 60_000;
for (const r of [...spread(linked.filter((x) => !x.archived_at), 30), ...spread(linked.filter((x) => x.archived_at), 10)]) {
  const parent = r.spawned_by ?? r.parent_session_key;
  for (const fresh of [false, true]) {
    const at = fresh ? { now: freshAt(r) } : {};
    add(`spawnedBy=parent${fresh ? "@fresh" : ""}`, { key: r.session_key, spawnedBy: parent }, at);
    add(`spawnedBy=other${fresh ? "@fresh" : ""}`, { key: r.session_key, spawnedBy: "agent:makaron:main" }, at);
    add(`spawnedBy=parent+global${fresh ? "@fresh" : ""}`, { key: r.session_key, spawnedBy: parent, includeGlobal: true, includeUnknown: true }, at);
  }
}
for (const r of spread(rows.filter((x) => x.archived_at), 10)) add("archived+spawnedBy@fresh", { key: r.session_key, spawnedBy: r.spawned_by ?? r.parent_session_key ?? "agent:makaron:main" }, { now: freshAt(r) });
const someGroup = others.find((r) => r.session_key.includes(":feishu:group:"))?.session_key;
for (const key of ["main", "agent:makaron:main", "AGENT:MAKARON:MAIN", "global", "unknown", someGroup, someGroup?.toUpperCase(), someGroup?.replace("agent:makaron:", ""), sampled[0].session_key.toUpperCase()].filter(Boolean)) {
  add("alias", { key });
  add("alias+agent", { key, agentId: "makaron" });
}
for (const key of ["agent:makaron:subagent:rsx-does-not-exist", "agent:ghost:main", "agent:ghost:subagent:x", "feishu:group:oc_rsx_missing"]) {
  add("missing", { key });
  add("missing+allowMissing", { key, allowMissing: true });
}
add("internal-effects", { key: INTERNAL_KEY });
add("internal-effects+allowMissing", { key: INTERNAL_KEY, allowMissing: true });
// An operator role boundary (V has none): the sharing filter sees the entry.
const roles = (others) => ({ ...cfg, gateway: { ...cfg.gateway, roles: { default: "member", definitions: { member: { sessions: { others }, agents: "*", scopes: [] } } } } });
// A real profile in this run's state database (role unset, so the default role applies).
const { n: ensureProfileForEmail } = await import(path.join(DIST, "user-profiles-ftXkbNlK.js"));
const profile = ensureProfileForEmail("rsx-ab@example.test");
const profileClient = { authenticatedUserProfile: { profileId: typeof profile === "string" ? profile : profile.id ?? profile.profileId } };
log("profile", profileClient.authenticatedUserProfile);
for (const r of spread(sampled, 15)) for (const others of ["read", "none"]) add(`roles:${others}`, { key: r.session_key }, { cfg: roles(others), client: profileClient });

if (process.env.KINDS) {
  const kinds = new Set(process.env.KINDS.split(","));
  cases.splice(0, cases.length, ...cases.filter((c) => kinds.has(c.kind.replace(/@fresh$/u, ""))));
}
const project = (value) => JSON.stringify(value);
const realNow = Date.now;
const mismatches = [];
const byKind = {};
const started = performance.now();
let okKeys = 0;
for (const [i, c] of cases.entries()) {
  const call = async (fn) => {
    if (c.now) Date.now = () => c.now;
    try { return { value: await fn({ cfg: c.cfg ?? cfg, client: c.client, p: c.p }) }; } catch (error) { return { threw: String(error?.message ?? error) }; } finally { Date.now = realNow; }
  };
  const a = await call(pair.base);
  const b = await call(pair.patched);
  const k = (byKind[c.kind] ??= { n: 0, ok: 0, missing: 0, error: 0, threw: 0 });
  k.n += 1;
  if (a.threw) { k.threw += 1; k.firstThrow ??= a.threw.slice(0, 200); }
  else if (a.value.ok && a.value.key) { k.ok += 1; if (c.kind === "key") okKeys += 1; }
  else if (a.value.missing) k.missing += 1;
  else { k.error += 1; k.firstError ??= String(a.value.error?.message ?? "").slice(0, 120); }
  if (project(a) !== project(b)) mismatches.push({ case: { kind: c.kind, p: c.p }, base: a, patched: b });
  if (i % 25 === 0) log("progress", { done: i + 1, of: cases.length, mismatches: mismatches.length, s: Math.round((performance.now() - started) / 1000) });
}
log("equivalence", { cases: cases.length, mismatches: mismatches.length, byKind, sample: mismatches.slice(0, 5) });
assert.equal(mismatches.length, 0, "sessions.resolve results differ");
if (!process.env.KINDS) {
  assert(okKeys >= sampled.length * 0.9, `most sampled keys must resolve (${okKeys}/${sampled.length})`);
  assert.equal(byKind["internal-effects"].ok, 0, "internal-effects rows never resolve");
  assert(byKind["spawnedBy=parent@fresh"].ok > 0, "some spawnedBy probes must be visible");
  for (const kind of ["roles:read", "roles:none"]) assert.equal(byKind[kind].threw, 0, `${kind} must run`);
}
if (process.env.COST === "0") {
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}

// ---- cost per call ----
const macKey = nightshift.at(-1).session_key;
const timed = [
  ["key (Night Shift subagent, as the Mac app on 10/23)", { key: macKey }],
  ["key agent:makaron:main", { key: "agent:makaron:main" }],
  ["key, missing + allowMissing", { key: "agent:makaron:subagent:rsx-does-not-exist", allowMissing: true }],
  ["key + spawnedBy", { key: linked[0].session_key, spawnedBy: linked[0].spawned_by ?? linked[0].parent_session_key }],
];
for (const [label, p] of timed) {
  log(`cost.base ${label}`, await measure(`V: ${label}`, () => pair.base({ cfg, p }).then(project)));
  log(`cost.patched ${label}`, await measure(`release: ${label}`, () => pair.patched({ cfg, p }).then(project), REPEAT * 10));
}
// Unchanged branches, same code in both chunks: what they still cost (follow-up candidates).
const withId = rows.find((r) => r.session_key === macKey);
const withLabel = rows.find((r) => r.label);
for (const [label, p] of [
  ["sessionId + agentId", { sessionId: withId.current_session_id, agentId: "makaron" }],
  ["sessionId, no agentId", { sessionId: withId.current_session_id }],
  ["label + agentId", { label: withLabel.label, agentId: "makaron" }],
  ["shortId + agentId", { shortId: withId.current_session_id.replaceAll("-", "").slice(0, 12), agentId: "makaron", allowMissing: true }],
]) {
  log(`cost.unchanged.base ${label}`, await measure(`V: ${label}`, () => pair.base({ cfg, p }).then(project), 3));
  log(`cost.unchanged.patched ${label}`, await measure(`release: ${label}`, () => pair.patched({ cfg, p }).then(project), 3));
}

console.log(JSON.stringify(out, null, 1));
process.exit(0);
