// Run with NATIVE_SCAN_RUNTIME=/absolute/installed/runtime; all DBs are :memory:.
import test, {after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {registerHooks} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";

const root = process.env.NATIVE_SCAN_RUNTIME;
assert(root?.startsWith("/"), "Provide installed native runtime; this suite must not be silently skipped");
const scratch = fs.mkdtempSync(join(os.tmpdir(), "canonical-native-contracts-"));
process.env.OPENCLAW_STATE_DIR = scratch; process.env.OPENCLAW_CONFIG_PATH = join(scratch, "unused.json");
const name = "session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
const original = join(root, "openclaw/dist", name), baselineURL = pathToFileURL(original).href;
assert.equal(createHash("sha256").update(fs.readFileSync(original)).digest("hex"), "686ae2059ab36a85f9c93a9de9fdc8c75212b5fc978ebcb780c6abca1bd595e5");
const source = fs.readFileSync(new URL("./release-files/" + name, import.meta.url), "utf8"), candidateURL = baselineURL + "?canonical-contract-candidate";
const hook = registerHooks({load(url, context, nextLoad) {return url === candidateURL ? {format: "module", source, shortCircuit: true} : nextLoad(url, context);}});
const baseline = await import(baselineURL), candidate = await import(candidateURL);
after(() => {hook.deregister(); fs.rmSync(scratch, {recursive: true, force: true});});

function fixture(row = {}, mainKey = "main") {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE session_key_contract(id INTEGER PRIMARY KEY, main_key TEXT, updated_at INTEGER);
    CREATE TABLE session_nodes(session_key TEXT PRIMARY KEY, current_session_id TEXT, entry_json, entry_valid INTEGER,
      fork_source_session_key TEXT, parent_session_key TEXT, spawned_by TEXT);
    CREATE TABLE session_windows(session_id TEXT, session_key TEXT, PRIMARY KEY(session_id,session_key));`);
  db.prepare("INSERT INTO session_key_contract VALUES (1,?,1)").run(mainKey);
  const r = {session_key: "agent:makaron:explicit:test", current_session_id: "session-one",
    entry_json: JSON.stringify({sessionId: "session-one", updatedAt: 1, skillsSnapshot: {prompt: "catalog"}, systemPromptReport: {report: "large"}}),
    entry_valid: 1, fork_source_session_key: null, parent_session_key: null, spawned_by: null, ...row};
  db.prepare("INSERT INTO session_nodes VALUES (?,?,?,?,?,?,?)").run(r.session_key, r.current_session_id, r.entry_json,
    r.entry_valid, r.fork_source_session_key, r.parent_session_key, r.spawned_by);
  if (row.retained) db.prepare("INSERT INTO session_windows VALUES (?,?)").run(r.current_session_id, r.session_key);
  return {db, agentId: "makaron", path: ":memory:"};
}
function outcome(mod, row, mainKey, visitor = false) {
  const database = fixture(row, mainKey), entries = [];
  try {return {ok: true, count: mod.g(database, visitor ? e => entries.push(e) : undefined), entries};}
  catch (e) {return {ok: false, code: e.code, name: e.name, message: e.message};}
  finally {database.db.close();}
}
function parity(row, {ok, mainKey, visitor = false} = {}) {
  const a = outcome(baseline, row, mainKey, visitor), b = outcome(candidate, row, mainKey, visitor);
  assert.deepEqual(b, a); if (ok !== undefined) assert.equal(b.ok, ok); return b;
}
test("valid native rows remain valid", () => {assert.equal(parity({}, {ok: true}).count, 1);});
test("native visitor receives complete skills and prompt report, unchanged", () => {
  const result = parity({}, {ok: true, visitor: true});
  assert.equal(result.entries[0].entry.skillsSnapshot.prompt, "catalog");
  assert.equal(result.entries[0].entry.systemPromptReport.report, "large");
});
test("native identity validation rejects missing, mismatched and non-finite values", () => {
  for (const entry_json of ['{}', '[]', 'null', '{"sessionId":"wrong","updatedAt":1}',
    '{"sessionId":"session-one","updatedAt":"1"}', '{"sessionId":"session-one","updatedAt":1e999}',
    '{"sessionId":4,"updatedAt":1}', '{"sessionId":"session-one","updatedAt":null}']) parity({entry_json}, {ok: false});
});
test("malformed omitted payloads remain native migration errors", () => {
  for (const field of ["skillsSnapshot", "systemPromptReport"]) {
    const r = parity({entry_json: `{"sessionId":"session-one","updatedAt":1,"${field}":{broken}}`}, {ok: false});
    assert.equal(r.code, "SESSION_CANONICAL_KEY_MIGRATION_REQUIRED");
  }
});
test("every invalid projection flag fails exactly as before", () => {
  for (const entry_valid of [-1, 0, 2, null]) parity({entry_valid}, {ok: false});
});
test("retained-window exact tombstone exception is unchanged", () => {
  assert.equal(parity({entry_json: "{}", entry_valid: -1, retained: true}, {ok: true}).count, 0);
  parity({entry_json: "{}", entry_valid: -1}, {ok: false});
  parity({entry_json: " { } ", entry_valid: -1, retained: true}, {ok: false});
});
test("parent, spawnedBy and forkSource column consistency remains enforced", () => {
  const parent = "agent:makaron:explicit:parent";
  const entry = {sessionId: "session-one", updatedAt: 1, parentSessionKey: parent, spawnedBy: parent, forkSource: {sessionKey: parent},
    skillsSnapshot: {prompt: "x"}, systemPromptReport: {prompt: "y"}};
  const valid = {entry_json: JSON.stringify(entry), parent_session_key: parent, spawned_by: parent, fork_source_session_key: parent};
  parity(valid, {ok: true});
  for (const key of ["parent_session_key", "spawned_by", "fork_source_session_key"]) parity({...valid, [key]: "agent:makaron:explicit:wrong"}, {ok: false});
});
test("noncanonical row and lineage keys are still refused", () => {
  for (const session_key of [" main", "MAIN", "agent:MAKARON:main", "agent:makaron:main ", " "]) parity({session_key}, {ok: false});
  const parent = " agent:makaron:main";
  parity({parent_session_key: parent, entry_json: JSON.stringify({sessionId: "session-one", updatedAt: 1, parentSessionKey: parent})}, {ok: false});
});
test("main-key contract and generation invalidation remain native", () => {
  parity({session_key: "agent:makaron:main"}, {ok: false, mainKey: "other"});
  for (const mod of [baseline, candidate]) {
    const database = fixture({session_key: "agent:makaron:main"});
    try {mod.p(database); mod.p(database); mod._(database, "other"); assert.throws(() => mod.p(database), {code: "SESSION_CANONICAL_KEY_MIGRATION_REQUIRED"});}
    finally {database.db.close();}
  }
});
test("duplicate field ordering preserves strict JSON identity and lineage decisions", () => {
  for (const [entry_json, ok] of [
    ['{"sessionId":"wrong","sessionId":"session-one","updatedAt":1,"skillsSnapshot":{}}', true],
    ['{"sessionId":"session-one","sessionId":"wrong","updatedAt":1,"systemPromptReport":{}}', false],
    ['{"sessionId":"session-one","updatedAt":null,"updatedAt":1,"skillsSnapshot":{},"skillsSnapshot":{}}', true],
  ]) parity({entry_json}, {ok});
});
test("opaque delivery proof has the same exact-case canonical result", () => {
  for (const peer of ["oc_AbCd", "oc_abcd"]) for (const channel of ["feishu", "slack"]) {
    const entry = {sessionId: "session-one", updatedAt: 1, delivery: {lastContext: {channel, to: `chat:${peer}`}},
      deliveryContext: {channel, to: `chat:${peer}`}, skillsSnapshot: {opaque: "unused"}, systemPromptReport: {opaque: "unused"}};
    for (const keyPeer of ["oc_AbCd", "oc_abcd"]) parity({session_key: `agent:makaron:${channel}:group:${keyPeer}`, entry_json: JSON.stringify(entry)});
  }
});
test("oversized valid payloads still undergo all native row checks", () => {
  const entry = {sessionId: "session-one", updatedAt: 1, skillsSnapshot: {prompt: "x".repeat(512_000)}, systemPromptReport: {tools: "y".repeat(512_000)}};
  parity({entry_json: JSON.stringify(entry)}, {ok: true});
  parity({entry_json: JSON.stringify({...entry, sessionId: "wrong"})}, {ok: false});
});
test("opt-out restores the native validation read", () => {
  const old = process.env.OPENCLAW_CANONICAL_SCAN_LEAN; process.env.OPENCLAW_CANONICAL_SCAN_LEAN = "0";
  try {parity({}, {ok: true}); parity({entry_json: "{"}, {ok: false});}
  finally {if (old === undefined) delete process.env.OPENCLAW_CANONICAL_SCAN_LEAN; else process.env.OPENCLAW_CANONICAL_SCAN_LEAN = old;}
});
