import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {MARKER, patchTranscriptStateChunk} from "./patch-canonical-scan-path-cache.mjs";

const name = "session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
const read = (url) => fs.readFileSync(new URL(url, import.meta.url), "utf8");
const base = read(`./release-files/${name}`);
const released = read(`./release-files/canonical-scan-path-cache/${name}`);

test("release file is V's chunk with only the path cache change", () => {
  assert.equal(patchTranscriptStateChunk(base), released);
  assert.throws(() => patchTranscriptStateChunk(released), /already patched/);
  assert.equal(released.split(MARKER).length, 2);
});

test("the added code uses only names the chunk already imports or defines", () => {
  for (const [name, re] of [
    ["getNodeSqliteKysely", /^import \{[^}]*\bgetNodeSqliteKysely\b[^}]*\} from "\.\/kysely-sync-DKYGT267\.js";$/m],
    ["executeSqliteQueryTakeFirstSync", /^import \{[^}]*\bexecuteSqliteQueryTakeFirstSync\b[^}]*\} from "\.\/kysely-sync-DKYGT267\.js";$/m],
    ["normalizeMainKey", /^import \{[^}]*\bnormalizeMainKey\b[^}]*\} from "\.\/session-key-CRjxKW0X\.js";$/m],
  ]) assert.match(base, re, name);
  const scan = released.slice(released.indexOf("function scanCanonicalSqliteSessionEntries("), released.indexOf("function assertCanonicalSqliteSessionKeysCurrent("));
  assert.match(scan, /const canonicalMainKey = normalizeMainKey\(mainKey \?\? storedMainKey\);/);
});

// Run the patched validation functions against an on-disk SQLite file with two connections.
function load(src) {
  const start = src.indexOf("const validatedDatabases = ");
  const end = src.indexOf("/** Checks the startup contract");
  assert(start > 0 && end > start);
  let body = src.slice(start, end);
  // stand-in for the full row scan: count calls and throw on a marked noncanonical row
  body = body.replace(/function scanCanonicalSqliteSessionEntries\(database, visit, mainKey\) \{[\s\S]*?\n\}\nfunction assertCanonicalSqliteSessionKeysCurrent/, `function scanCanonicalSqliteSessionEntries(database, visit, mainKey) {
	const storedMainKey = database.db.prepare("SELECT main_key FROM session_key_contract WHERE id = 1").get()?.main_key;
	const canonicalMainKey = normalizeMainKey(mainKey ?? storedMainKey);
	scans.push(database.path);
	if (database.db.prepare("SELECT count(*) AS n FROM session_nodes WHERE session_key <> trim(session_key)").get().n > 0) throw Object.assign(new Error("noncanonical"), {code: "SESSION_CANONICAL_KEY_MIGRATION_REQUIRED"});
	validatedDatabases.add(database.db);
	if (sharesCanonicalValidationByPath(database)) validatedDatabasePaths.set(database.path, canonicalMainKey);
	return 0;
}
function assertCanonicalSqliteSessionKeysCurrent`);
  const scans = [];
  // just enough of kysely for the main-key read and the main-key upsert
  const kysely = (db) => ({
    selectFrom: () => ({select: () => ({where: () => ({db})})}),
    insertInto: () => ({values: (v) => ({onConflict: () => ({db, mainKey: v.main_key})})}),
  });
  const takeFirst = (db, q) => q.db.prepare("SELECT main_key FROM session_key_contract WHERE id = 1").get();
  const exec = (db, q) => q.db.prepare("UPDATE session_key_contract SET main_key = ? WHERE id = 1").run(q.mainKey);
  const fns = new Function("getNodeSqliteKysely", "executeSqliteQueryTakeFirstSync", "executeSqliteQuerySync", "normalizeMainKey", "scans",
    `${body}\nreturn { assert: assertCanonicalSqliteSessionKeysCurrent, setMainKey: setCanonicalSqliteSessionMainKey };`)(
    kysely, takeFirst, exec, (k) => (k ?? "main").trim().toLowerCase() || "main", scans);
  return {...fns, scans};
}

function file(t) {
  const dir = fs.mkdtempSync(`${process.env.TMPDIR ?? "/tmp"}/canonical-path-cache-`);
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const path = `${dir}/agent.sqlite`;
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE session_key_contract(id INTEGER PRIMARY KEY, main_key TEXT); INSERT INTO session_key_contract VALUES (1, 'main'); CREATE TABLE session_nodes(session_key TEXT)");
  db.close();
  const open = () => { const handle = new DatabaseSync(path); t.after(() => handle.isOpen && handle.close()); return {db: handle, path}; };
  return {path, open};
}

test("a fresh connection to an already validated file skips the row scan", (t) => {
  const mod = load(released);
  const {open} = file(t);
  const first = open();
  mod.assert(first);
  // a row written after validation is not rescanned, exactly like the long-lived handle
  first.db.exec("INSERT INTO session_nodes VALUES (' noncanonical')");
  mod.assert(first);
  mod.assert(open());
  mod.assert(open());
  assert.equal(mod.scans.length, 1);
});

test("the opt-out restores one scan per connection", (t) => {
  const mod = load(released);
  const {open} = file(t);
  const old = process.env.OPENCLAW_CANONICAL_SCAN_PATH_CACHE;
  process.env.OPENCLAW_CANONICAL_SCAN_PATH_CACHE = "0";
  t.after(() => { if (old === undefined) delete process.env.OPENCLAW_CANONICAL_SCAN_PATH_CACHE; else process.env.OPENCLAW_CANONICAL_SCAN_PATH_CACHE = old; });
  mod.assert(open());
  mod.assert(open());
  assert.equal(mod.scans.length, 2);
});

test("a changed main key, or an in-memory database, is scanned again", (t) => {
  const mod = load(released);
  const {open} = file(t);
  const first = open();
  mod.assert(first);
  mod.assert(open(), "Other");
  assert.equal(mod.scans.length, 2);
  mod.setMainKey(first, "other");
  mod.assert(open());
  assert.equal(mod.scans.length, 3);
  const memory = () => ({db: new DatabaseSync(":memory:"), path: ":memory:"});
  for (const m of [memory(), memory()]) {
    m.db.exec("CREATE TABLE session_key_contract(id INTEGER PRIMARY KEY, main_key TEXT); CREATE TABLE session_nodes(session_key TEXT)");
    mod.assert(m);
    m.db.close();
  }
  assert.equal(mod.scans.length, 5);
});
