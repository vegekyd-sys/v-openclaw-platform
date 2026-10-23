// sessions-search-exact-read A/B on a copy of V's session tables (see lab/sessions-search-exact-read.md).
//
// Data (read-only export from V, kept outside the repository; FIXTURE_DIR on the VLab host):
//   <agent>.sqlite   session_nodes / session_windows / session_participants /
//                    session_transcript_index_state / session_progress_cards of makaron, v-codex,
//                    xiaoai, dealclaw and short-v
// Each agent database is created by OpenClaw itself (schema, triggers) under WORK_DIR and filled from
// the export; entry_valid keeps V's value (the insert trigger resets it). A few synthetic rows cover
// what V's data lacks today (locked harness sessions, tombstones, an internal-session-effects row,
// cross-agent duplicates, a short-id collision).
//
// Both arms are loaded side by side from the candidate dist: V's chunks, and the release chunks under
// other names (the release sessions-resolve imports the release combined store). Every case calls
// resolveSessionKeyFromResolveParams (the whole sessions.resolve decision) or the plugin session
// ownership checks on both and compares results and thrown errors.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { Session } from "node:inspector/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/rsx2-20261024";
const WORK_DIR = process.env.WORK_DIR ?? path.join(FIXTURE_DIR, `run-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const REPEAT = Number(process.env.REPEAT ?? 3);
const SAMPLE = Number(process.env.SAMPLE ?? 40);
const AGENTS = ["makaron", "v-codex", "xiaoai", "dealclaw", "short-v"];
const REL = "lab/release-files/sessions-search-exact-read";
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
const agentDb = (agentId) => path.join(stateDir, "agents", agentId, "agent", "openclaw-agent.sqlite");
if (process.env.KEEP_WORK !== "1") process.on("exit", () => fs.rmSync(WORK_DIR, { recursive: true, force: true }));
for (const agentId of AGENTS) fs.mkdirSync(path.dirname(agentDb(agentId)), { recursive: true });
{
  // V's session.maintenance (warn); nothing here writes sessions after the fixture is built.
  const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
  config.session = { ...config.session, maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  fs.writeFileSync(path.join(stateDir, "openclaw.json"), JSON.stringify(config, null, 2));
}
process.env.OPENCLAW_STATE_DIR = stateDir;
process.env.OPENCLAW_CONFIG_PATH = path.join(stateDir, "openclaw.json");
process.env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT = stateDir;
process.env.OPENCLAW_HOME = WORK_DIR;

// ---- side-by-side chunks ----
const plan = JSON.parse(fs.readFileSync("lab/sessions-search-exact-read.plan.json", "utf8"));
const planFile = (name) => plan.files.find((f) => f.target === `openclaw/dist/${name}`);
const RESOLVE = "sessions-resolve-_D6BmQTT.js";
const COMBINED = "combined-store-gateway-BwDhjbIt.js";
const OWNERSHIP = "registry-runtime-session-ownership-B1XvaNE7.js";
const MODULE = "v-session-entries-matching.mjs";
const copies = [];
const place = (name, source) => {
  const file = path.join(DIST, name);
  fs.writeFileSync(file, source);
  copies.push(file);
  return file;
};
process.on("exit", () => { for (const file of copies) fs.rmSync(file, { force: true }); });
for (const name of [RESOLVE, COMBINED, OWNERSHIP]) assert.equal(sha(fs.readFileSync(path.join(DIST, name), "utf8")), planFile(name).before, `V bytes: ${name}`);
const release = (name) => {
  const source = fs.readFileSync(path.join(REL, name), "utf8");
  assert.equal(sha(source), planFile(name).after, `release bytes: ${name}`);
  return source;
};
assert(!fs.existsSync(path.join(DIST, MODULE)), `${MODULE} must not exist in the V runtime`);
place(MODULE, release(MODULE));
const patchedCombined = COMBINED.replace(/\.js$/u, ".SSXPATCHED.js");
place(patchedCombined, release(COMBINED));
const patchedResolveSource = release(RESOLVE).replace(`from "./${COMBINED}"`, `from "./${patchedCombined}"`);
assert.notEqual(patchedResolveSource, release(RESOLVE));
const base = {
  resolve: (await import(path.join(DIST, RESOLVE))).t,
  ownership: (await import(path.join(DIST, OWNERSHIP))).createPluginSessionOwnership,
};
const patched = {
  resolve: (await import(place(RESOLVE.replace(/\.js$/u, ".SSXPATCHED.js"), patchedResolveSource))).t,
  ownership: (await import(place(OWNERSHIP.replace(/\.js$/u, ".SSXPATCHED.js"), release(OWNERSHIP)))).createPluginSessionOwnership,
};

// ---- allocation and main-thread measurement ----
const inspector = new Session();
inspector.connect();
async function measure(label, fn, repeat = REPEAT) {
  // Both paths are synchronous up to their result, so wall time per call is main-thread time.
  global.gc?.();
  await inspector.post("HeapProfiler.startSampling", { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const times = [];
  let value;
  for (let i = 0; i < repeat; i++) {
    const t = performance.now();
    try { value = await fn(i); } catch (error) { value = { threw: String(error?.message ?? error) }; }
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
    value: typeof value === "string" ? value.slice(0, 200) : value,
  };
}

// ---- fixture: agent databases built by OpenClaw, filled from V's export ----
const { g: openOpenClawAgentDatabase, a: closeOpenClawAgentDatabases } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
const uuidFrom = (seed) => {
  const h = sha(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const synthetic = {};
{
  const t = performance.now();
  for (const agentId of AGENTS) {
    openOpenClawAgentDatabase({ agentId });
  }
  closeOpenClawAgentDatabases();
  const counts = {};
  for (const agentId of AGENTS) {
    const db = new DatabaseSync(agentDb(agentId));
    db.exec("PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 30000;");
    db.exec(`ATTACH '${path.join(FIXTURE_DIR, `${agentId}.sqlite`)}' AS v`);
    const copy = (table) => {
      const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
      const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
      const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
      db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
      return db.prepare(`SELECT count(*) AS n FROM main.${table}`).get().n;
    };
    db.exec("BEGIN");
    counts[agentId] = {};
    for (const table of ["session_nodes", "session_windows", "session_participants", "session_transcript_index_state", "session_progress_cards"]) counts[agentId][table] = copy(table);
    db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key)");
    db.exec("UPDATE main.session_windows SET primary_conversation_id = NULL");
    db.exec("COMMIT");
    db.exec("DETACH v");
    db.close();
  }
  // Synthetic rows, written the way the entry writer projects them (columns from the entry).
  const insert = (agentId, key, entry, extra = {}) => {
    const db = new DatabaseSync(agentDb(agentId));
    db.prepare("INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at, status, label) VALUES (?, ?, ?, ?, ?, ?)").run(key, extra.currentSessionId ?? entry.sessionId, extra.entryJson ?? JSON.stringify(entry), entry.updatedAt ?? Date.now(), null, extra.label === undefined ? (typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : null) : extra.label);
    db.prepare("UPDATE session_nodes SET entry_valid = ? WHERE session_key = ?").run(extra.entryValid ?? 1, key);
    if (extra.window) db.prepare("INSERT INTO session_windows (session_id, session_key, created_at, updated_at) VALUES (?, ?, ?, ?)").run(extra.currentSessionId ?? entry.sessionId, key, entry.updatedAt ?? Date.now(), entry.updatedAt ?? Date.now());
    db.close();
  };
  const read = (agentId, sql, ...args) => {
    const db = new DatabaseSync(agentDb(agentId), { readOnly: true });
    try { return db.prepare(sql).get(...args); } finally { db.close(); }
  };
  const donorRow = read("makaron", "SELECT session_key, entry_json FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:%' AND archived_at IS NULL ORDER BY session_key LIMIT 1");
  const donor = JSON.parse(donorRow.entry_json);
  const strip = (entry) => { const { label: _l, spawnedBy: _s, parentSessionKey: _p, modelSelectionLocked: _m, agentHarnessId: _a, pluginOwnerId: _o, archivedAt: _x, ...rest } = entry; return rest; };
  const mainEntry = JSON.parse(read("makaron", "SELECT entry_json FROM session_nodes WHERE session_key = 'agent:makaron:main'")?.entry_json ?? donorRow.entry_json);
  // one internal-session-effects row with its own session id and label (the whole-store read skips it)
  synthetic.internal = { key: `agent:makaron:internal-session-effects:ssx-run-${uuidFrom("internal")}`, sessionId: uuidFrom("internal-sid"), label: "ssx internal label" };
  insert("makaron", synthetic.internal.key, { ...strip(donor), sessionId: synthetic.internal.sessionId, label: synthetic.internal.label });
  // a locked harness session (codex, registered by another plugin) sharing agent:makaron:main's session id
  synthetic.lockedCodex = { key: `agent:makaron:ssx-locked-codex-${uuidFrom("locked-codex")}`, sessionId: mainEntry.sessionId };
  insert("makaron", synthetic.lockedCodex.key, { ...strip(donor), sessionId: synthetic.lockedCodex.sessionId, modelSelectionLocked: true, agentHarnessId: "codex" });
  // a locked session owned by another plugin, own session id
  synthetic.lockedPlugin = { key: `agent:makaron:ssx-locked-plugin-${uuidFrom("locked-plugin")}`, sessionId: uuidFrom("locked-plugin-sid") };
  insert("makaron", synthetic.lockedPlugin.key, { ...strip(donor), sessionId: synthetic.lockedPlugin.sessionId, modelSelectionLocked: true, pluginOwnerId: "ssx-other-plugin" });
  // a tombstone kept for its transcript window (invisible to the whole-store read; any other invalid row
  // fails the database-wide canonical check for both arms)
  synthetic.tombstone = { key: `agent:makaron:ssx-tombstone-${uuidFrom("tombstone")}`, sessionId: uuidFrom("tombstone-sid"), label: "ssx tombstone label" };
  insert("makaron", synthetic.tombstone.key, { sessionId: synthetic.tombstone.sessionId }, { entryJson: "{}", entryValid: -1, window: true, label: synthetic.tombstone.label });
  // labels: padded in the entry (the column is trimmed; filterSessionEntries compares the entry), exact, and one label in two agents
  synthetic.padded = { key: `agent:makaron:ssx-padded-${uuidFrom("padded")}`, label: "ssx padded label" };
  insert("makaron", synthetic.padded.key, { ...strip(donor), sessionId: uuidFrom("padded-sid"), label: "  ssx padded label  " });
  synthetic.crossLabel = "ssx cross-agent label";
  insert("makaron", `agent:makaron:ssx-cross-${uuidFrom("cross-m")}`, { ...strip(donor), sessionId: uuidFrom("cross-m-sid"), label: synthetic.crossLabel });
  const codexDonor = JSON.parse(read("v-codex", "SELECT entry_json FROM session_nodes WHERE archived_at IS NULL ORDER BY session_key LIMIT 1").entry_json);
  insert("v-codex", `agent:v-codex:ssx-cross-${uuidFrom("cross-c")}`, { ...strip(codexDonor), sessionId: uuidFrom("cross-c-sid"), label: synthetic.crossLabel });
  // a session id present in two agents (sessionId without agentId is ambiguous across agents)
  synthetic.crossSessionId = uuidFrom("cross-sid");
  insert("makaron", `agent:makaron:ssx-xsid-${uuidFrom("xsid-m")}`, { ...strip(donor), sessionId: synthetic.crossSessionId });
  insert("v-codex", `agent:v-codex:ssx-xsid-${uuidFrom("xsid-c")}`, { ...strip(codexDonor), sessionId: synthetic.crossSessionId });
  // a short-id collision with a real key's UUID suffix
  const realUuidKey = read("makaron", "SELECT session_key FROM session_nodes WHERE session_key GLOB '*-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]' AND session_key NOT LIKE '%:ssx-%' AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 1").session_key;
  const prefix = realUuidKey.slice(-36, -28);
  synthetic.shortCollision = { prefix, keys: [realUuidKey, `agent:makaron:ssx-short-${prefix}-0000-4000-8000-000000000000`] };
  insert("makaron", synthetic.shortCollision.keys[1], { ...strip(donor), sessionId: uuidFrom("short-sid"), label: "ssx short collision" });
  for (const agentId of AGENTS) {
    const db = new DatabaseSync(agentDb(agentId));
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
  }
  log("fixture", { counts, synthetic, ms: Math.round(performance.now() - t) });
}
// The Gateway keeps the writable handles open; so does this process.
for (const agentId of AGENTS) openOpenClawAgentDatabase({ agentId });
const { n: getRuntimeConfig } = await import(path.join(DIST, "io.runtime-CKu7Rw0j.js"));
const cfg = getRuntimeConfig();
// V (and VLab) configure no agents.list. The five agent databases are discovered anyway (the log shows
// the same ids for both); the "multi:" cases also pass an explicit list.
const multiCfg = { ...cfg, agents: { ...cfg.agents, list: AGENTS.map((id, i) => ({ id, ...i === 0 ? { default: true } : {} })) } };
{
  const { o: listAgentIds } = await import(path.join(DIST, "agent-scope-config-CUiGBd59.js"));
  log("agents", { config: listAgentIds(cfg), multi: listAgentIds(multiCfg) });
}
const rowsOf = (agentId) => new DatabaseSync(agentDb(agentId), { readOnly: true }).prepare("SELECT session_key, current_session_id, label, spawned_by, parent_session_key, archived_at, updated_at, entry_valid, CASE WHEN json_valid(entry_json) THEN json_extract(entry_json, '$.endedAt') END AS ended_at FROM session_nodes ORDER BY session_key").all();
const rows = rowsOf("makaron");
const otherRows = AGENTS.slice(1).flatMap(rowsOf);

// ---- invariant: the candidate columns are the entry's own values (V's rows, OpenClaw's parser) ----
{
  const { a: listSessionEntriesReadOnly } = await import(path.join(DIST, "session-accessor.sqlite-entry-BlklNPKQ.js"));
  const byKey = new Map([...rows, ...otherRows].map((r) => [r.session_key, r]));
  const inv = { entries: 0, sessionIdMismatch: 0, labelMismatch: 0, untrimmedSessionId: 0, examples: [] };
  for (const agentId of AGENTS) for (const { sessionKey, entry } of listSessionEntriesReadOnly({ agentId, clone: false })) {
    const row = byKey.get(sessionKey);
    inv.entries += 1;
    if (row.current_session_id !== entry.sessionId) { inv.sessionIdMismatch += 1; inv.examples.push(sessionKey); }
    const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : null;
    if (row.label !== label) { inv.labelMismatch += 1; inv.examples.push(sessionKey); }
    if (typeof entry.sessionId === "string" && entry.sessionId !== entry.sessionId.trim()) inv.untrimmedSessionId += 1;
  }
  inv.examples = inv.examples.slice(0, 5);
  log("invariant", inv);
  assert.equal(inv.sessionIdMismatch, 0, "current_session_id = entry.sessionId");
  assert.equal(inv.labelMismatch, 0, "label column = trimmed entry.label");
}

// ---- cases ----
const spread = (list, n) => list.filter((_r, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
const isSynthetic = (r) => r.session_key.includes(":ssx-") || r.session_key.includes("internal-session-effects");
const valid = rows.filter((r) => r.entry_valid === 1 && !isSynthetic(r));
const nightshift = valid.filter((r) => r.session_key.startsWith("agent:makaron:subagent:workboard-nightshift-"));
const others = valid.filter((r) => !r.session_key.startsWith("agent:makaron:subagent:workboard-nightshift-"));
const sampled = [...spread(nightshift, Math.ceil(SAMPLE / 2)), ...spread(others, Math.ceil(SAMPLE / 2))];
const labelled = valid.filter((r) => r.label);
const dupLabels = [...Map.groupBy(labelled, (r) => r.label)].filter(([, list]) => list.length > 1).map(([label]) => label);
const dupSessionIds = [...Map.groupBy(valid, (r) => r.current_session_id)].filter(([, list]) => list.length > 1).map(([sid]) => sid);
const linked = valid.filter((r) => r.spawned_by || r.parent_session_key);
const uuidKeyed = valid.filter((r) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(r.session_key));
const freshAt = (r) => (Number(r.ended_at) || r.updated_at) + 60_000;
const cases = [];
const add = (kind, p, opts = {}) => cases.push({ kind, p, ...opts });
// sessionId: as agent session tools send it (includeGlobal/includeUnknown, no agentId), with agentId, allowMissing
for (const r of sampled) {
  add("sessionId+agent", { sessionId: r.current_session_id, agentId: "makaron" });
  add("sessionId+tools", { sessionId: r.current_session_id, includeGlobal: true, includeUnknown: true });
}
for (const r of spread(sampled, 10)) add("sessionId+allowMissing", { sessionId: r.current_session_id, allowMissing: true });
for (const r of spread(otherRows.filter((x) => x.entry_valid === 1 && !isSynthetic(x)), 10)) {
  add("sessionId:other-agent", { sessionId: r.current_session_id });
  add("multi:sessionId:other-agent", { sessionId: r.current_session_id }, { cfg: multiCfg });
  add("multi:sessionId:other-agent+wrong-agent", { sessionId: r.current_session_id, agentId: "makaron" }, { cfg: multiCfg });
}
for (const r of spread(sampled, 10)) add("multi:sessionId+tools", { sessionId: r.current_session_id, includeGlobal: true, includeUnknown: true }, { cfg: multiCfg });
for (const r of spread(labelled, 10)) add("multi:label", { label: r.label }, { cfg: multiCfg });
for (const r of spread(uuidKeyed, 6)) add("multi:shortId", { shortId: r.session_key.slice(-36).replaceAll("-", "").slice(0, 12) }, { cfg: multiCfg });
for (const sid of dupSessionIds) {
  add("sessionId:duplicate", { sessionId: sid, agentId: "makaron" });
  add("sessionId:duplicate", { sessionId: sid });
}
add("multi:sessionId:cross-agent", { sessionId: synthetic.crossSessionId }, { cfg: multiCfg });
add("multi:sessionId:cross-agent", { sessionId: synthetic.crossSessionId, agentId: "makaron" }, { cfg: multiCfg });
add("multi:sessionId:cross-agent", { sessionId: synthetic.crossSessionId, agentId: "v-codex" }, { cfg: multiCfg });
for (const key of ["agent:makaron:main", sampled[0].session_key, sampled.at(-1).session_key]) {
  add("sessionId=key", { sessionId: key });
  add("sessionId=key", { sessionId: key, agentId: "makaron" });
}
for (const s of [synthetic.internal, synthetic.tombstone, synthetic.lockedPlugin]) {
  add("sessionId:synthetic", { sessionId: s.sessionId, agentId: "makaron" });
  add("sessionId:synthetic", { sessionId: s.sessionId, allowMissing: true });
}
for (const sid of ["ssx-missing-session-id", uuidFrom("missing")]) {
  add("sessionId:missing", { sessionId: sid });
  add("sessionId:missing", { sessionId: sid, agentId: "makaron", allowMissing: true });
}
for (const r of [...spread(linked.filter((x) => !x.archived_at), 12), ...spread(linked.filter((x) => x.archived_at), 4)]) {
  const parent = r.spawned_by ?? r.parent_session_key;
  for (const fresh of [false, true]) {
    const at = fresh ? { now: freshAt(r) } : {};
    add(`sessionId+spawnedBy=parent${fresh ? "@fresh" : ""}`, { sessionId: r.current_session_id, spawnedBy: parent }, at);
    add(`sessionId+spawnedBy=other${fresh ? "@fresh" : ""}`, { sessionId: r.current_session_id, spawnedBy: "agent:makaron:main", agentId: "makaron" }, at);
  }
}
// label
for (const r of spread(labelled, SAMPLE)) {
  add("label+agent", { label: r.label, agentId: "makaron" });
  add("label", { label: r.label });
}
for (const label of dupLabels.slice(0, 10)) add("label:duplicate", { label, agentId: "makaron" });
add("multi:label:cross-agent", { label: synthetic.crossLabel }, { cfg: multiCfg });
add("multi:label:cross-agent", { label: synthetic.crossLabel, agentId: "makaron" }, { cfg: multiCfg });
add("multi:label:cross-agent", { label: synthetic.crossLabel, agentId: "v-codex" }, { cfg: multiCfg });
add("label:padded-entry", { label: synthetic.padded.label, agentId: "makaron" });
add("label:padded-request", { label: `   ${labelled[0].label}  `, agentId: "makaron" });
for (const s of [synthetic.internal, synthetic.tombstone]) add("label:synthetic", { label: s.label, agentId: "makaron", allowMissing: true });
add("label:missing", { label: "ssx no such label" });
add("label:missing", { label: "ssx no such label", agentId: "makaron", allowMissing: true });
add("label:invalid", { label: "   " });
for (const r of spread(labelled.filter((x) => x.spawned_by || x.parent_session_key), 6)) {
  const parent = r.spawned_by ?? r.parent_session_key;
  add("label+spawnedBy@fresh", { label: r.label, spawnedBy: parent }, { now: freshAt(r) });
  add("label+spawnedBy", { label: r.label, spawnedBy: parent });
}
// shortId: 8 / 12 / 32 hex of a key's UUID suffix, upper case, slugHint, collisions
for (const r of spread(uuidKeyed, SAMPLE)) {
  const hex = r.session_key.slice(-36).replaceAll("-", "");
  add("shortId+agent", { shortId: hex.slice(0, 12), agentId: "makaron" });
  add("shortId", { shortId: hex.slice(0, 8).toUpperCase() });
}
for (const r of spread(uuidKeyed, 5)) add("shortId:32", { shortId: r.session_key.slice(-36).replaceAll("-", ""), agentId: "makaron" });
add("shortId:collision", { shortId: synthetic.shortCollision.prefix, agentId: "makaron" });
add("shortId:collision+slugHint", { shortId: synthetic.shortCollision.prefix, agentId: "makaron", slugHint: "ssx-short-collision" });
add("shortId:collision+slugHint-miss", { shortId: synthetic.shortCollision.prefix, slugHint: "nothing-like-this" });
add("shortId:internal", { shortId: synthetic.internal.key.slice(-36).replaceAll("-", "").slice(0, 12), allowMissing: true });
add("shortId:tombstone", { shortId: synthetic.tombstone.key.slice(-36).replaceAll("-", "").slice(0, 12), agentId: "makaron", allowMissing: true });
add("shortId:missing", { shortId: "ffffffffffff0000", allowMissing: true });
add("shortId:missing", { shortId: "ffffffffffff0000" });
add("shortId:invalid", { shortId: "xyz" });
add("slugHint-without-shortId", { sessionId: sampled[0].current_session_id, slugHint: "x" });
add("multiple-selectors", { sessionId: sampled[0].current_session_id, label: "x" });
// operator role boundary: the sharing filter decides each entry
const roles = (othersCap) => ({ ...cfg, gateway: { ...cfg.gateway, roles: { default: "member", definitions: { member: { sessions: { others: othersCap }, agents: "*", scopes: [] } } } } });
const { n: ensureProfileForEmail } = await import(path.join(DIST, "user-profiles-ftXkbNlK.js"));
const profile = ensureProfileForEmail("ssx-ab@example.test");
const profileClient = { authenticatedUserProfile: { profileId: typeof profile === "string" ? profile : profile.id ?? profile.profileId } };
for (const r of spread(sampled, 6)) for (const othersCap of ["read", "none"]) {
  add(`roles:${othersCap}:sessionId`, { sessionId: r.current_session_id, agentId: "makaron" }, { cfg: roles(othersCap), client: profileClient });
}
for (const r of spread(labelled, 4)) for (const othersCap of ["read", "none"]) add(`roles:${othersCap}:label`, { label: r.label, agentId: "makaron" }, { cfg: roles(othersCap), client: profileClient });
for (const r of spread(uuidKeyed, 4)) for (const othersCap of ["read", "none"]) add(`roles:${othersCap}:shortId`, { shortId: r.session_key.slice(-36).replaceAll("-", "").slice(0, 12), agentId: "makaron" }, { cfg: roles(othersCap), client: profileClient });

// ---- ownership cases ----
const pick = (i) => sampled[i % sampled.length];
const { f: loadSessionEntryReadOnly, a: listSessionEntriesReadOnly } = await import(path.join(DIST, "session-accessor.sqlite-entry-BlklNPKQ.js"));
const { t: listSessionEntriesCore } = await import(path.join(DIST, "session-accessor.entry-B8arwR7t.js"));
const { o: resolveSessionStorePathCore } = await import(path.join(DIST, "paths-DDTeIhCT.js"));
const { t: formatSqliteSessionFileMarker } = await import(path.join(DIST, "legacy-sqlite-marker-COPKCuIN.js"));
// The plugin runtime's session accessors (src/plugins/runtime/runtime-agent.ts, runtime-C-huom3Y.js).
const toSessionAccessScope = (params) => ({
  sessionKey: params.sessionKey,
  ...params.agentId !== void 0 ? { agentId: params.agentId } : {},
  ...params.env !== void 0 ? { env: params.env } : {},
  ...params.hydrateSkillPromptRefs !== void 0 ? { hydrateSkillPromptRefs: params.hydrateSkillPromptRefs } : {},
  ...params.readConsistency !== void 0 ? { readConsistency: params.readConsistency } : {},
  ...params.storePath !== void 0 ? { storePath: params.storePath } : {},
});
const sessionRuntime = {
  getSessionEntry: (params) => loadSessionEntryReadOnly(toSessionAccessScope(params)),
  listSessionEntries: (params = {}) => (params.readOnly ? listSessionEntriesReadOnly : listSessionEntriesCore)({
    ...params.agentId !== void 0 ? { agentId: params.agentId } : {},
    ...params.env !== void 0 ? { env: params.env } : {},
    ...params.hydrateSkillPromptRefs !== void 0 ? { hydrateSkillPromptRefs: params.hydrateSkillPromptRefs } : {},
    ...params.storePath !== void 0 ? { storePath: params.storePath } : {},
  }),
};
const ownershipState = {
  registry: { agentHarnesses: [{ pluginId: "ssx-harness-owner", harness: { id: "codex" } }] },
  registryParams: { runtime: { config: { current: () => cfg }, agent: { session: sessionRuntime } } },
};
const ownershipFor = (arm, pluginId = "v-voice-gpt-live") => arm.ownership(ownershipState, pluginId);
const storePathOf = (agentId) => resolveSessionStorePathCore(cfg.session?.store, { agentId });
const makaronStore = storePathOf("makaron");
const marker = (sessionId, agentId = "makaron") => formatSqliteSessionFileMarker({ agentId, sessionId, storePath: agentDb(agentId) });
const ownershipCases = [];
const addOwn = (kind, call, pluginId) => ownershipCases.push({ kind, call, pluginId });
const voiceRun = (key, sessionId, agentId = "makaron") => ({ fn: "resolveRunSessionExecutionOwner", params: { sessionId, sessionKey: key, agentId, sessionTarget: { agentId, sessionId, sessionKey: key, storePath: storePathOf(agentId) } } });
const identities = (params) => ({ fn: "assertSessionIdentitiesOwned", params: { action: "run", ...params } });
for (const r of spread(sampled, SAMPLE)) {
  addOwn("voice-run", voiceRun(r.session_key, r.current_session_id));
  addOwn("identities:id+key", identities({ agentId: "makaron", sessionIds: [r.current_session_id], sessionKeys: [r.session_key] }));
}
addOwn("voice-run:main (shares its session id with a locked codex row)", voiceRun("agent:makaron:main", synthetic.lockedCodex.sessionId));
addOwn("voice-run:main as the harness owner", voiceRun("agent:makaron:main", synthetic.lockedCodex.sessionId), "ssx-harness-owner");
addOwn("identities:locked-plugin id", identities({ agentId: "makaron", sessionIds: [synthetic.lockedPlugin.sessionId] }));
addOwn("identities:locked-plugin id as owner", identities({ agentId: "makaron", sessionIds: [synthetic.lockedPlugin.sessionId] }), "ssx-other-plugin");
addOwn("identities:locked-plugin key", identities({ agentId: "makaron", sessionKeys: [synthetic.lockedPlugin.key] }));
for (const sid of dupSessionIds) addOwn("identities:duplicate id", identities({ agentId: "makaron", sessionIds: [sid] }));
for (const s of [synthetic.internal, synthetic.tombstone]) addOwn("identities:synthetic id", identities({ agentId: "makaron", sessionIds: [s.sessionId] }));
addOwn("identities:missing id", identities({ agentId: "makaron", sessionIds: [uuidFrom("missing-own")] }));
addOwn("identities:storePath", identities({ agentId: "makaron", storePath: makaronStore, sessionIds: [pick(1).current_session_id] }));
addOwn("identities:default agent", identities({ sessionIds: [pick(2).current_session_id, synthetic.lockedPlugin.sessionId] }));
addOwn("identities:other agent", identities({ agentId: "v-codex", sessionIds: [synthetic.crossSessionId] }));
addOwn("voice-run:other agent", voiceRun(otherRows.find((r) => r.session_key.startsWith("agent:v-codex:") && !isSynthetic(r)).session_key, otherRows.find((r) => r.session_key.startsWith("agent:v-codex:") && !isSynthetic(r)).current_session_id, "v-codex"));
// sessionFiles: a key (then every row sharing its session id), a marker, a missing marker, garbage
addOwn("files:key", identities({ agentId: "makaron", sessionFiles: [pick(3).session_key] }));
addOwn("files:main key (session id shared with a locked row)", identities({ agentId: "makaron", sessionFiles: ["agent:makaron:main"] }));
addOwn("files:locked key", identities({ agentId: "makaron", sessionFiles: [synthetic.lockedPlugin.key] }));
addOwn("files:marker", identities({ agentId: "makaron", sessionFiles: [marker(pick(4).current_session_id)] }));
addOwn("files:marker locked", identities({ agentId: "makaron", sessionFiles: [marker(synthetic.lockedCodex.sessionId)] }));
addOwn("files:marker other agent", identities({ agentId: "makaron", sessionFiles: [marker(synthetic.crossSessionId, "v-codex")] }));
addOwn("files:marker missing", identities({ agentId: "makaron", sessionFiles: [marker(uuidFrom("missing-marker"))] }));
addOwn("files:marker internal", identities({ agentId: "makaron", sessionFiles: [marker(synthetic.internal.sessionId)] }));
addOwn("files:not a marker", identities({ agentId: "makaron", sessionFiles: ["not-a-marker"] }));
addOwn("files+ids", identities({ agentId: "makaron", sessionIds: [pick(5).current_session_id], sessionFiles: [pick(6).session_key, marker(pick(7).current_session_id)] }));

if (process.env.KINDS) {
  const kinds = new Set(process.env.KINDS.split(","));
  cases.splice(0, cases.length, ...cases.filter((c) => kinds.has(c.kind.replace(/@fresh$/u, ""))));
  ownershipCases.splice(0, ownershipCases.length, ...ownershipCases.filter((c) => kinds.has(c.kind)));
}
const project = (value) => JSON.stringify(value);
const realNow = Date.now;
const mismatches = [];
const byKind = {};
const started = performance.now();
const tally = (kind, a) => {
  const k = (byKind[kind] ??= { n: 0, ok: 0, ambiguous: 0, missing: 0, error: 0, threw: 0, passed: 0 });
  k.n += 1;
  if (a.threw) { k.threw += 1; k.firstThrow ??= a.threw.slice(0, 160); }
  else if (a.value === undefined) k.passed += 1;
  else if (a.value?.ok && a.value.ambiguous) k.ambiguous += 1;
  else if (a.value?.ok && a.value.key) k.ok += 1;
  else if (a.value?.missing) k.missing += 1;
  else { k.error += 1; k.firstError ??= String(a.value?.error?.message ?? "").slice(0, 160); }
};
const capture = async (fn, now) => {
  if (now) Date.now = () => now;
  try { return { value: await fn() }; } catch (error) { return { threw: String(error?.message ?? error) }; } finally { Date.now = realNow; }
};
for (const [i, c] of cases.entries()) {
  const args = { cfg: c.cfg ?? cfg, client: c.client, p: c.p };
  const a = await capture(() => base.resolve(args), c.now);
  const b = await capture(() => patched.resolve(args), c.now);
  tally(c.kind, a);
  if (project(a) !== project(b)) mismatches.push({ case: { kind: c.kind, p: c.p }, base: a, patched: b });
  if (i % 20 === 0) log("progress.resolve", { done: i + 1, of: cases.length, mismatches: mismatches.length, s: Math.round((performance.now() - started) / 1000) });
}
for (const [i, c] of ownershipCases.entries()) {
  const run = (arm) => () => ownershipFor(arm, c.pluginId)[c.call.fn](c.call.params);
  const a = await capture(run(base));
  const b = await capture(run(patched));
  tally(`own:${c.kind}`, a);
  if (project(a) !== project(b)) mismatches.push({ case: { kind: c.kind, call: c.call }, base: a, patched: b });
  if (i % 20 === 0) log("progress.ownership", { done: i + 1, of: ownershipCases.length, mismatches: mismatches.length, s: Math.round((performance.now() - started) / 1000) });
}
log("equivalence", { cases: cases.length + ownershipCases.length, resolve: cases.length, ownership: ownershipCases.length, mismatches: mismatches.length, byKind, sample: mismatches.slice(0, 5) });
assert.equal(mismatches.length, 0, "results differ");
if (!process.env.KINDS) {
  // every outcome the branches can produce was reached
  const sum = (prefix, field) => Object.entries(byKind).filter(([k]) => k.startsWith(prefix)).reduce((n, [, v]) => n + v[field], 0);
  for (const prefix of ["sessionId", "label", "shortId"]) {
    assert(sum(prefix, "ok") > 0, `${prefix}: some resolve`);
    assert(sum(prefix, "missing") + sum(prefix, "error") > 0, `${prefix}: some are not found`);
  }
  for (const kind of ["multi:sessionId:cross-agent", "multi:label:cross-agent"]) assert(byKind[kind].error > 0 && byKind[kind].ok > 0, `${kind}: ambiguous without agentId, resolved with one`);
  assert(byKind["multi:sessionId:other-agent"].ok > 0, "sessions of other agents resolve across the combined store");
  // V's natural duplicate session ids and labels resolve to one row (archived rows are filtered first)
  assert(byKind["sessionId:duplicate"].ok > 0 && byKind["label:duplicate"].ok > 0, "natural duplicates run");
  assert(byKind["shortId:collision"].ambiguous > 0, "short-id collisions are ambiguous");
  assert(byKind["sessionId+spawnedBy=parent@fresh"].ok > 0, "some spawnedBy probes are visible");
  assert(sum("own:", "threw") > 0 && sum("own:", "passed") > 0, "ownership checks both pass and refuse");
  assert(byKind["own:voice-run:main (shares its session id with a locked codex row)"].threw === 1, "the session id pass reaches rows found only by session id");
  assert(byKind["own:files:main key (session id shared with a locked row)"].threw === 1, "the session file pass reaches rows sharing the key's session id");
}

// ---- the switches restore the whole-store reads ----
if (!process.env.KINDS) {
  const offCases = [cases.find((c) => c.kind === "sessionId+tools"), cases.find((c) => c.kind === "label:duplicate"), cases.find((c) => c.kind === "shortId:collision")].filter(Boolean);
  const off = [];
  process.env.OPENCLAW_V_SESSIONS_RESOLVE_SEARCH_EXACT = "0";
  for (const c of offCases) {
    const args = { cfg, p: c.p };
    const t = performance.now();
    const b = await capture(() => patched.resolve(args));
    off.push({ kind: c.kind, ms: Math.round(performance.now() - t), same: project(b) === project(await capture(() => base.resolve(args))) });
  }
  delete process.env.OPENCLAW_V_SESSIONS_RESOLVE_SEARCH_EXACT;
  process.env.OPENCLAW_V_SESSION_OWNERSHIP_EXACT = "0";
  {
    const c = ownershipCases.find((x) => x.kind.startsWith("voice-run:main"));
    const t = performance.now();
    const b = await capture(() => ownershipFor(patched, c.pluginId)[c.call.fn](c.call.params));
    off.push({ kind: `own:${c.kind}`, ms: Math.round(performance.now() - t), same: project(b) === project(await capture(() => ownershipFor(base, c.pluginId)[c.call.fn](c.call.params))) });
  }
  delete process.env.OPENCLAW_V_SESSION_OWNERSHIP_EXACT;
  log("switch-off", off);
  assert(off.every((x) => x.same), "switch off equals V");
  // with the switch off the patched arm reads the whole store again (seconds, not milliseconds)
  assert(off.every((x) => x.ms > 500), "switch off reads the whole store");
}
if (process.env.COST === "0") {
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}

// ---- cost per call ----
// a Feishu direct session, as V Voice product tasks run in the caller's own session
const voiceKey = others.find((r) => r.session_key.includes(":feishu:direct:"))?.session_key ?? "agent:makaron:main";
const voiceSessionId = rows.find((r) => r.session_key === voiceKey)?.current_session_id ?? pick(0).current_session_id;
const withLabel = labelled.find((r) => !dupLabels.includes(r.label));
const withUuid = uuidKeyed.at(-1);
const timed = [
  ["sessionId + agentId", { sessionId: nightshift.at(-1).current_session_id, agentId: "makaron" }],
  ["sessionId, no agentId (agent session tools)", { sessionId: nightshift.at(-1).current_session_id, includeGlobal: true, includeUnknown: true }],
  ["label + agentId", { label: withLabel.label, agentId: "makaron" }],
  ["label, no agentId", { label: withLabel.label }],
  ["shortId + agentId", { shortId: withUuid.session_key.slice(-36).replaceAll("-", "").slice(0, 12), agentId: "makaron" }],
];
for (const [label, p] of timed) {
  log(`cost.base ${label}`, await measure(`V: ${label}`, () => base.resolve({ cfg, p }).then(project)));
  log(`cost.patched ${label}`, await measure(`release: ${label}`, () => patched.resolve({ cfg, p }).then(project), REPEAT * 10));
}
const voice = voiceRun(voiceKey, voiceSessionId);
log("cost.base ownership (V Voice product task run)", await measure("V: voice run ownership", () => ownershipFor(base)[voice.fn](voice.params) ?? "passed"));
log("cost.patched ownership (V Voice product task run)", await measure("release: voice run ownership", () => ownershipFor(patched)[voice.fn](voice.params) ?? "passed", REPEAT * 10));

console.log(JSON.stringify(out, null, 1));
process.exit(0);
