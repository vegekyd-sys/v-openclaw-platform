// session-reference-index: session deletions no longer project and parse every session's entry JSON
// inside their write transaction to find surviving references. Offline checks of the release files;
// the V-scale behaviour is in lab/candidate/session-reference-index-ab.mjs (see
// lab/release-files/session-reference-index/README.md).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MARKER } from './patch-session-reference-index.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/session-reference-index.plan.json'), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const ENTRY = 'session-accessor.sqlite-entry-store-VfW3gyuj.js';
const STATE = 'session-accessor.sqlite-lifecycle-state-CrB_K2kA.js';
const CORE = 'session-accessor.sqlite-lifecycle-dtL0ZEAl.js';
const read = (name) => fs.readFileSync(path.join(repo, 'lab/release-files/session-reference-index', name), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('plan replaces the V 9.1-db91.6 bytes of three session chunks with the release files', () => {
  assert.deepEqual(plan.files.map((f) => f.target), [ENTRY, STATE, CORE].map((name) => `openclaw/dist/${name}`));
  assert.deepEqual(plan.files.map((f) => f.before), [
    '455037c6dd4d03e06151c49bf8dcda76bc6124ea05a3c70b502cd819429d338d',
    '4f4cce65c21e82f7d9d5f49bbb2d9b76802c6b7b468cc741b4ce9b820a3e4096',
    'efa4604b435e588dfeb3b86730c183c4e4950cbb5b4ebc261fc6023819fd7646',
  ]);
  for (const file of plan.files) {
    const bytes = fs.readFileSync(path.join(repo, file.source));
    assert.equal(sha(bytes), file.after, file.source);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, file.source)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${file.source}: ${r.stderr}`);
    assert(bytes.toString('utf8').includes(MARKER), `${file.source} carries ${MARKER}`);
  }
});

test('deleteSessionEntryRows takes surviving owners from the index, not every row', () => {
  const entry = read(ENTRY);
  const rows = between(entry, 'function deleteSessionEntryRows(database, sessionKey, options = {}) {', '\n/** Remove the logical entry');
  assert.doesNotMatch(rows, /sessionEntryMetadataJson/u, 'no metadata projection of every node');
  assert.match(rows, /findSurvivingSessionNodeKeys\(database, windows\.map\(\(window\) => window\.session_id\), sessionKey\)/u);
  // the full read survives only as the switch-off / failure fallback
  const fallback = between(entry, 'function findSurvivingSessionNodeKeys(database, sessionIds, sessionKey) {', '\n//#endregion');
  assert.match(fallback, /if \(isSessionReferenceIndexEnabled\(\)\) try \{/u);
  assert.match(fallback, /\.where\("session_key", "!=", sessionKey\)\.orderBy\("session_key", "asc"\)/u);
  assert.match(entry, /return env\.OPENCLAW_V_SESSION_REFERENCE_INDEX !== "0";/u);
  assert.match(entry, /^import \{ sql \} from "kysely";$/mu);
  assert.match(entry, /export \{ isSessionReferenceIndexEnabled, prewarmSessionReferenceIndex, readReferencedSessionIdsFromIndex, registerSessionPendingInputOwner as A,/u);
});

test('the index fingerprint never loads entry_json and dirty triggers cannot fail a write', () => {
  const entry = read(ENTRY);
  assert.match(entry, /octet_length\(entry_json\) AS n/u);
  const refresh = between(entry, 'function refreshSessionReferenceIndexSync(database) {', '\nconst yieldSessionReferencePrewarm');
  assert.match(refresh, /if \(index\.dataVersion !== dataVersion \|\| !epochCurrent\)/u, 'fingerprints only after another connection committed');
  assert.match(refresh, /if \(!epochCurrent\) for \(const key of index\.uncertain\) stale\.add\(key\);/u, 'rolled-back reads are re-read');
  // TEMP tables without constraints: an outer ON CONFLICT clause overrides a trigger's own handling
  assert.match(entry, /CREATE TEMP TABLE IF NOT EXISTS \$\{SESSION_REFERENCE_DIRTY_TABLE\} \(session_key TEXT\);/u);
  assert.doesNotMatch(entry, /INSERT OR IGNORE INTO \$\{SESSION_REFERENCE_DIRTY_TABLE\}/u);
  assert.match(entry, /WHERE NOT EXISTS \(SELECT 1 FROM \$\{SESSION_REFERENCE_DIRTY_TABLE\} WHERE session_key = \$\{key\}\.session_key\)/u);
});

test('readReferencedSessionIds uses the index with the full read as fallback', () => {
  const state = read(STATE);
  const reader = between(state, 'function readReferencedSessionIds(database, excludedSessionKeys', '\nfunction readReferencedSessionIdsAfterTargetMutation');
  assert.match(reader, /return readReferencedSessionIdsFromIndex\(database, excludedSessionKeys\);/u);
  assert.match(reader, /function readReferencedSessionIdsFullScan\(database, excludedSessionKeys\) \{\n\tconst db = getSessionKysely\(database\.db\);/u);
  assert.match(state, /^import \{ isSessionReferenceIndexEnabled, readReferencedSessionIdsFromIndex, Y as sqliteSessionEntriesEqual,/mu);
});

test('deletions prewarm the index outside the writer lane', () => {
  const core = read(CORE);
  const prewarmAt = core.indexOf('await prewarmSessionReferenceIndex(() => openOpenClawAgentDatabase(toDatabaseOptions(resolved)));');
  const laneAt = core.indexOf('const result = await runExclusiveSqliteSessionWrite(resolved, async () => {', prewarmAt);
  assert(prewarmAt > 0 && laneAt > prewarmAt, 'prewarm precedes the deletion lane');
  const locked = between(core, 'async function deleteSqliteSessionEntryLifecycleLocked(', 'const prepared = await runExclusiveSqliteSessionWrite(resolved');
  assert.match(locked, /if \(params\.archiveTranscript \|\| params\.deleteTranscriptWithoutArchive === true\) await prewarmSessionReferenceIndex\(\(\) => getOpenClawAgentDatabaseIfOpen\(toDatabaseOptions\(resolved\)\)\);/u, 'transcript-dropping deletions prewarm before the preparation lane, on an already open store');
  const entry = read(ENTRY);
  const prepared = between(entry, 'async function runPreparedSqliteSessionWrite(scope, prepare) {', '\n/** Prepare owner leases');
  const warmAt = prepared.indexOf('await prewarmSessionReferenceIndex(() => openOpenClawAgentDatabase(toDatabaseOptions(scope)));');
  assert(warmAt > 0 && prepared.indexOf('withSqliteSessionDeletions(', warmAt) > warmAt, 'prewarm precedes the commit lane');
  const prewarm = between(entry, 'async function prewarmSessionReferenceIndex(open) {', '\n/** Session ids referenced');
  assert.match(prewarm, /if \(start > 0\) \{\n\t\t\t\tawait yieldSessionReferencePrewarm\(\);/u, 'yields between pages only');
  assert.match(prewarm, /\} catch \{\}/u, 'best effort');
});
