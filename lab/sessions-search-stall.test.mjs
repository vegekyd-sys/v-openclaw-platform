// sessions-search-stall: sessions_search no longer holds the Gateway main thread for the whole search.
// Offline checks of the release files; the V-scale behaviour is in lab/candidate/sessions-search-stall-ab.mjs
// (see lab/release-files/sessions-search-stall/README.md).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { patchSessionsSearchTool, patchTranscriptReconcile, patchTranscriptSearch } from './patch-sessions-search-stall.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/sessions-search-stall.plan.json'), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const RECONCILE = 'session-transcript-reconcile-j5qhAafV.js';
const SEARCH = 'session-transcript-search-pRB2YScP.js';
const TOOLS = 'openclaw-tools-BODVdJQD.js';
const read = (name) => fs.readFileSync(path.join(repo, 'lab/release-files/sessions-search-stall', name), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('plan replaces V 9.1-db91.6 bytes of the three chunks with the release files', () => {
  assert.deepEqual(plan.files.map((f) => f.target), [RECONCILE, SEARCH, TOOLS].map((name) => `openclaw/dist/${name}`));
  assert.deepEqual(plan.files.map((f) => f.before), [
    '85455fa43c681eda0b831d6dc9b147925c149acc503fd936a018e765faca325b',
    '399b50e688169ad0fea5382c38c00f89925aa29b99949bc92446d5adee3690bc',
    '0b8b623310c01d8153a7f751c1f3a2042a2f3481d62499effce4f34d60ed2799',
  ]);
  for (const file of plan.files) {
    const bytes = fs.readFileSync(path.join(repo, file.source));
    assert.equal(sha(bytes), file.after, file.source);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, file.source)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${file.source}: ${r.stderr}`);
    assert.match(bytes.toString('utf8'), /sessions-search-stall-v1/u);
  }
  assert.equal(sha(read(`v-base/${SEARCH}`)), plan.files[1].before, 'kept upstream bytes of the search chunk');
});

test('the search caller no longer lists every window; the lag check runs on the preflight Worker', () => {
  const search = read(SEARCH);
  const body = between(search, 'function searchSessionTranscripts(params) {', '\n//#endregion');
  assert.doesNotMatch(body, /listSessionsNeedingTranscriptIndexReconcile/u);
  assert.match(body, /const indexing = readSearchIndexing\(database\.db, databaseOptions\);/u);
  const reader = between(search, 'function readSearchIndexing(db, databaseOptions) {', '\nfunction toFtsQuery');
  // the whole listing only behind the kill switch
  assert.match(reader, /OPENCLAW_V_TRANSCRIPT_SEARCH_LAG_OFFTHREAD === "0"\) \{\n\t\tconst dirtySessions = listSessionsNeedingTranscriptIndexReconcile\(db\);/u);
  assert.equal(reader.split('listSessionsNeedingTranscriptIndexReconcile(').length, 2);
  assert.match(reader, /else if \(!running\) startSearchTranscriptIndexLagCheck\(databaseOptions\);/u);
  // the small-table predicate is the native one without the watermark clause
  const sql = between(search, 'const SEARCH_INDEX_DIRTY_SQL = `', 'AS dirty`');
  assert.match(sql, /st\.needs_rebuild != 0/u);
  assert.match(sql, /NOT EXISTS \(\n\s+SELECT 1 FROM session_transcript_index_state st WHERE st\.session_id = w\.session_id/u);
  assert.match(sql, /pending\.context_eligible IS NULL/u);
  assert.doesNotMatch(sql, /indexed_seq|ORDER BY/u);
  assert.match(search, /const SEARCH_LAG_CHECK_INTERVAL_MS = 6e4;/u);
  assert.match(search, /import \{ o as scanTranscriptIndexNeedsReconcile, r as startSessionTranscriptIndexReconcile, t as isSessionTranscriptIndexReconcileRunning \} from "\.\/session-transcript-reconcile-j5qhAafV\.js";/u);

  const reconcile = read(RECONCILE);
  assert.match(reconcile, /async function scanTranscriptIndexNeedsReconcile\(databaseOptions\) \{\n\treturn \(await scanTranscriptIndexPreflight\(databaseOptions\.path, true, false\)\)\.needsReconcile;/u);
  assert.match(reconcile, /scanTranscriptIndexNeedsReconcile as o, /u);
  const worker = between(reconcile, 'const PREFLIGHT_SCAN_SOURCE = `', '\n`;');
  const guarded = between(worker, 'if (workerData.orphans !== false) {', 'const needsReconcile');
  assert.match(guarded, /FROM session_transcript_fts/u, 'the FTS orphan scan is skipped for the lag check');
  assert.match(worker, /const ftsOwners = new Map\(\);\n\t\t\tif \(workerData\.orphans !== false\) \{/u);
  assert.match(reconcile, /\t\t\t\t\tneeds,\n\t\t\t\t\torphans,\n\t\t\t\t\tpath: databasePath\n/u);
});

test('sessions_search yields to the event loop before every Gateway call', () => {
  const tools = read(TOOLS);
  const listing = between(tools, 'async function listVisibleSearchSessions(params) {', '\nfunction compareSearchHits');
  assert.match(listing, /await yieldBeforeGatewayCall\(\);\n\t\t\t\t\tpage = await params\.gatewayCall\(\{/u);
  const execute = between(tools, 'function createSessionsSearchTool(opts) {', '\n//#endregion');
  assert.match(execute, /const scopedCandidate = chunk\.length === 1 \? chunk\[0\] : void 0;\n\t\t\t\tawait yieldBeforeGatewayCall\(\);\n\t\t\t\tconst result = scopedCandidate\?\.expectedSessionId/u);
  assert.match(tools, /OPENCLAW_V_SESSIONS_SEARCH_YIELD === "0"\) return Promise\.resolve\(\);\n\treturn new Promise\(\(resolve\) => \{\n\t\tsetImmediate\(resolve\);/u);
});

test('the patcher refuses to patch twice', () => {
  assert.throws(() => patchTranscriptReconcile(read(RECONCILE)), /already patched/u);
  assert.throws(() => patchTranscriptSearch(read(SEARCH)), /already patched/u);
  assert.throws(() => patchSessionsSearchTool(read(TOOLS)), /already patched/u);
});
