import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {patchSessionAccessor, MARKER} from './patch-bounded-branch-list.mjs';
import {BOUNDED_BRANCH_LIST_FILES} from './build-bounded-branch-list.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const plan = JSON.parse(read('./bounded-branch-list-plan.json'));
const vBytes = read('./release-files/mirror-facts-identity/session-accessor-K0XuW6ln.js');
const release = read('./release-files/bounded-branch-list/session-accessor-K0XuW6ln.js');

test('release chunk is the patcher applied to V live bytes, and drift is refused', () => {
  assert.equal(sha(vBytes), BOUNDED_BRANCH_LIST_FILES[0].before);
  assert.equal(plan.files[0].before, BOUNDED_BRANCH_LIST_FILES[0].before);
  assert.equal(patchSessionAccessor(vBytes), release);
  assert.equal(sha(release), plan.files[0].after);
  assert.throws(() => patchSessionAccessor(release), 'already patched');
  assert.throws(() => patchSessionAccessor(vBytes.replace('summarizeSessionBranches(loadTranscriptEventsFromDatabase(database, sessionId))', 'summarizeSessionBranches(events)')), /Expected one anchor/);
});

test('only the branch-summary read changes; V patches already in the chunk survive', () => {
  const vLines = vBytes.split('\n'), rLines = release.split('\n');
  const removed = vLines.filter(line => !rLines.includes(line));
  assert.deepEqual(removed, ['\tconst branches = summarizeSessionBranches(loadTranscriptEventsFromDatabase(database, sessionId));']);
  assert(release.includes('v-mirror-facts-identity-v1'));
  assert.equal(release.split(MARKER).length, 2);
  // The old full summary stays for nothing but reference; the read path no longer parses every row.
  const reader = release.slice(release.indexOf('function loadSessionBranchSummaries('), release.indexOf('function invalidateSessionBranchCache('));
  assert(!reader.includes('loadTranscriptEventsFromDatabase(database, sessionId)'));
  const bounded = release.slice(release.indexOf('function readSessionBranchSummariesBounded('), release.indexOf('function summarizeSessionBranchesBounded('));
  assert(bounded.includes('{ projection: "reset-boundary" }'), 'tree rows come from the native navigation projection');
  assert(bounded.includes('runSqliteDeferredTransactionSync'), 'navigation, seq list and headline rows share one read snapshot');
});
