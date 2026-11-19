// lifecycle-cleanup-bounded: memory-core's Dreaming scrub (cleanupSessionLifecycleArtifacts) no longer
// reads every session entry and every historical transcript on the Gateway main thread. Offline checks
// of the release files; the V-scale behaviour is in lab/candidate/lifecycle-cleanup-bounded-ab.mjs and
// lab/candidate/startup-heap-spike.mjs (see lab/release-files/lifecycle-cleanup-bounded/README.md).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/lifecycle-cleanup-bounded.plan.json'), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const STATE = 'session-accessor.sqlite-lifecycle-state-CrB_K2kA.js';
const CORE = 'session-accessor.sqlite-lifecycle-dtL0ZEAl.js';
const read = (name) => fs.readFileSync(path.join(repo, 'lab/release-files/lifecycle-cleanup-bounded', name), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('plan replaces V 9.1-db91.6 bytes of the two lifecycle chunks with the release files', () => {
  assert.deepEqual(plan.files.map((f) => f.target), [`openclaw/dist/${STATE}`, `openclaw/dist/${CORE}`]);
  assert.deepEqual(plan.files.map((f) => f.before), [
    'ea381f9d45af70ff7bd47d2613e0b70974421ab375e273b77c870212a1666f07',
    'f3f6fdfa5fb552658072ed8d4bf0a17583c3f8dfe5bed70a9d7d82b802fc9eb2',
  ]);
  for (const file of plan.files) {
    const bytes = fs.readFileSync(path.join(repo, file.source));
    assert.equal(sha(bytes), file.after, file.source);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, file.source)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${file.source}: ${r.stderr}`);
    assert.match(bytes.toString('utf8'), /lifecycle-cleanup-bounded-v1/u);
  }
});

test('the planner reads candidate entries only and no transcript text', () => {
  const state = read(STATE);
  const planner = between(state, 'function planSessionLifecycleArtifactCleanup(database, params) {', '\nfunction deletePlannedLifecycleArtifactEntries');
  assert.doesNotMatch(planner, /"entry_json"/u, 'node inventory must not select entry_json');
  assert.doesNotMatch(planner, /readSessionEntryStore\(database\)/u, 'no whole-store entry read');
  assert.match(planner, /readSessionEntryStore\(database, \{ sessionKeys: rows\.map\(\(row\) => row\.session_key\) \}\)/u);
  assert.match(planner, /if \(entries\.length === 0 && markedOrphanIds\.size === 0\) return \{/u, 'the reference scan only runs when something is reclaimed');
  assert.match(planner, /projectedStore: \{\}/u);
  assert.doesNotMatch(state, /row\.event_json\.includes/u, 'markers are matched in SQLite');
  assert.match(state, /eb\.fn\("instr", \["event_json", eb\.val\(transcriptContentMarker\)\]\)/u);
  assert.match(state, /export \{ readMarkedOrphanLifecycleSessionIds as w, /u);
});

test('the marker prescan runs before the writer lane and yields between pages', () => {
  const state = read(STATE);
  const prescan = between(state, 'async function readMarkedOrphanLifecycleSessionIds(', '\nfunction planSessionLifecycleArtifactCleanup');
  assert.match(prescan, /await new Promise\(\(resolve\) => \{\n\t\t\tsetImmediate\(resolve\);/u);
  assert.match(prescan, /withOpenClawAgentDatabaseReadOnly\(/u);
  assert.match(state, /const ORPHAN_MARKER_PRESCAN_PAGE_SIZE = 16;/u);
  const core = between(read(CORE), 'async function cleanupSessionLifecycleArtifactsCore(params) {', '\n/** Resets one persisted');
  const prescanAt = core.indexOf('await readMarkedOrphanLifecycleSessionIds(databaseOptions, {');
  const laneAt = core.indexOf('const cleanupPlan = await runExclusiveSqliteSessionWrite(resolved');
  assert(prescanAt > 0 && laneAt > prescanAt, 'prescan precedes the writer lane');
  assert.match(core, /nowMs,\n\t\t\tmarkedOrphanSessionIds\n\t\t\}\);/u);
});
