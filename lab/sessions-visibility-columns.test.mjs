// sessions-visibility-columns: sessions.list visibilityRowsOnly reads promoted columns instead of every
// session node's entry JSON. Offline checks of the release files; equivalence and timing on a V-scale store are
// in lab/candidate/sessions-visibility-columns-ab.mjs (see lab/release-files/sessions-visibility-columns/README.md).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { patchCombinedStoreGateway, patchSessionAccessorEntry, patchSessionsRead } from './patch-sessions-visibility-columns.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/sessions-visibility-columns.plan.json'), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const ENTRY = 'session-accessor.sqlite-entry-BlklNPKQ.js';
const COMBINED = 'combined-store-gateway-BwDhjbIt.js';
const READ = 'sessions-read-C6mAMxyQ.js';
const read = (name) => fs.readFileSync(path.join(repo, 'lab/release-files/sessions-visibility-columns', name), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('plan replaces V 9.1-db91.6 bytes of the three chunks with the release files', () => {
  assert.deepEqual(plan.files.map((f) => f.target), [ENTRY, COMBINED, READ].map((name) => `openclaw/dist/${name}`));
  assert.deepEqual(plan.files.map((f) => f.before), [
    '258aa1be787081f9333db2ef576caee987b537acde9d99dcdb7f48542022a230',
    '9cb53296f60b4d375f19cdd0e52d104a7b255c9feaae34656654c718bb6f5c51',
    '5c84c606c258ae729630a659d54bdf28d1b7cb2999b1ca86a325832b78ef5a43',
  ]);
  for (const file of plan.files) {
    const bytes = fs.readFileSync(path.join(repo, file.source));
    assert.equal(sha(bytes), file.after, file.source);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, file.source)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${file.source}: ${r.stderr}`);
    assert.match(bytes.toString('utf8'), /sessions-visibility-columns-v1/u);
  }
});

test('the column read takes values from covering indexes and the table header only', () => {
  const entry = read(ENTRY);
  const fn = between(entry, 'function readSqliteSessionVisibilityEntries(database) {', '\nfunction listSqliteSessionEntriesFromDatabase');
  // the only table scan reads entry_valid and typeof(pinned_at): header-only for 0/1/NULL
  assert.match(fn, /SELECT rowid AS id, session_key, entry_valid, typeof\(pinned_at\) AS pinned_type FROM session_nodes ORDER BY session_key/u);
  for (const [column, index] of [
    ['updated_at', 'updated_at'],
    ['current_session_id', 'current_session_id'],
    ['parent_session_key', 'parent_session_key'],
    ['spawned_by', 'spawned_by'],
    ['archived_at', 'archived_at'],
    ['last_interaction_at', 'last_interaction_at'],
  ]) assert.match(fn, new RegExp(`SELECT rowid AS id, ${column} AS v FROM session_nodes INDEXED BY idx_agent_session_nodes_${index}`, 'u'));
  // no entry JSON in the column queries; JSON only for the rows the columns cannot reproduce
  for (const query of fn.match(/"SELECT [^"]+"/gu)) assert.doesNotMatch(query, /entry_json/u, query);
  assert.match(fn, /if \(node\.entry_valid !== 1 \|\| node\.pinned_type !== "null" \|\| parentKey !== void 0 && parentKey === spawnedKey \|\| typeof updated !== "number" \|\| typeof currentSessionId !== "string"\) \{\n\t\t\t\tspecial\.push\(node\.session_key\);/u);
  assert.match(fn, /selectSessionEntryRows\(database, "list"\)\.select\("updated_at"\)\.where\("session_key", "in", chunk\)/u);
  assert.match(fn, /const entry = parseSessionEntryJson\(row, "list"\);/u);
  assert.match(fn, /projectSqliteSessionParticipantsBatch\(db, parsed\)/u);
  // a missing index keeps the list projection; one snapshot (or the caller's transaction)
  assert.match(fn, /if \(!SESSION_VISIBILITY_COLUMN_INDEXES\.every\(\(name\) => indexNames\.has\(name\)\)\) return;/u);
  assert.match(fn, /return db\.isTransaction \? read\(\) : runSqliteDeferredTransactionSync\(db, read\);/u);
  // the entry carries the six fields, nothing else
  assert.match(fn, /entries\.set\(node\.session_key, \{\n\t\t\t\tsessionId: currentSessionId,\n\t\t\t\tupdatedAt: updated,\n\t\t\t\t\.\.\.archived !== void 0 \? \{ archivedAt: archived \} : \{\},\n\t\t\t\t\.\.\.interacted !== void 0 \? \{ lastInteractionAt: interacted \} : \{\},\n\t\t\t\t\.\.\.spawnedKey !== void 0 \? \{ spawnedBy: spawnedKey \} : \{\},\n\t\t\t\t\.\.\.parentKey !== void 0 \? \{ parentSessionKey: parentKey \} : \{\}\n\t\t\t\}\);/u);
  assert.match(entry, /import \{ a as iterateSqliteQuerySync, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync \} from "\.\/kysely-sync-DKYGT267\.js";/u);
  assert.match(entry, /import \{l as runSqliteDeferredTransactionSync, o as tryAcquireExclusiveSqliteCoordinator\} from "\.\/node-sqlite-CL-d6drd\.js";/u);

  const list = between(entry, 'function listSqliteSessionEntriesFromDatabase(database, resolved, scope) {', '\n/** Lists only entries');
  assert.match(list, /const visibilitySnapshot = scope\.visibilityColumns === true && projection === "list" && cache && process\.env\.OPENCLAW_V_SESSIONS_VISIBILITY_COLUMNS !== "0" \? readSqliteSessionVisibilityEntries\(database\) : void 0;/u);
  assert.match(list, /const snapshot = visibilitySnapshot \?\? readSessionEntryCache\(database, \{/u);
  assert.match(list, /assertCanonicalSqliteSessionKeysCurrent\(database\);/u, 'the canonical key check still runs first');
});

test('only sessions.list visibility listings with column filters ask for the column read', () => {
  const combined = read(COMBINED);
  const load = between(combined, 'function loadGatewayStoreEntries(params) {', '\nfunction mergeSessionEntryIntoCombined');
  assert.match(load, /const projection = params\.projection === "visibility" \? "list" : params\.projection;/u);
  assert.match(load, /\.\.\.params\.projection === "visibility" \? \{ visibilityColumns: true \} : \{\},/u);
  assert.equal(load.split('visibilityColumns').length, 2, 'the match (search) path never reads columns');

  const sessionsRead = read(READ);
  assert.match(sessionsRead, /const visibilityColumns = p\.visibilityRowsOnly === true && lifecycleUpdatedSince === void 0 && !options\.excludedKeys\?\.size && isVisibilityColumnListRequest\(p\) && !prepareSessionSharing\(\{/u);
  assert.match(sessionsRead, /projection: visibilityColumns \? "visibility" : "list",/u);
  assert.equal(sessionsRead.split('"visibility"').length, 2, 'one call site asks for the visibility projection');
  const allowed = between(sessionsRead, 'const VISIBILITY_COLUMN_LIST_PARAMS = new Set([', ']);');
  const names = [...allowed.matchAll(/"([a-zA-Z]+)"/gu)].map((m) => m[1]);
  assert.deepEqual(names, ['agentId', 'archived', 'activeMinutes', 'configuredAgentsOnly', 'includeDerivedTitles', 'includeGlobal', 'includeLastMessage', 'includeUnknown', 'limit', 'offset', 'sortBy', 'visibilityRowsOnly']);
  // filters that read other entry fields are not allowed
  for (const name of ['search', 'label', 'boardFace', 'creatorId', 'ownerId', 'ownerFirst', 'involvingMe', 'involvingProfileId', 'includePeople', 'spawnedBy', 'requireLastInteraction', 'lifecycleOnly']) assert(!names.includes(name), name);
  // evaluate the predicate as shipped
  const predicate = new Function(`${between(sessionsRead, 'const VISIBILITY_COLUMN_LIST_PARAMS', 'const sessionReadHandlers = {')}\nreturn isVisibilityColumnListRequest;`)();
  assert.equal(predicate({ visibilityRowsOnly: true, archived: 'all', limit: 50000, agentId: 'makaron' }), true);
  assert.equal(predicate({ visibilityRowsOnly: true, search: 'x' }), false);
  assert.equal(predicate({ visibilityRowsOnly: true, search: undefined, includePeople: false }), true);
  assert.equal(predicate({ visibilityRowsOnly: true, spawnedBy: 'agent:makaron:main' }), false);
});

test('the patcher refuses to patch twice', () => {
  assert.throws(() => patchSessionAccessorEntry(read(ENTRY)), /already patched/u);
  assert.throws(() => patchCombinedStoreGateway(read(COMBINED)), /already patched/u);
  assert.throws(() => patchSessionsRead(read(READ)), /already patched/u);
});
