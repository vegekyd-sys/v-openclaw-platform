import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {patchSessionUtilsList, unpatchSessionUtilsList, MARKER, V_BYTES_SHA256, RELEASE_FILE} from './patch-session-info-subagent-index.mjs';

// session-info-subagent-index: a single session row (chat.history sessionInfo, sessions.describe,
// session snapshots) reads the subagent registry through one prepared index instead of one global
// lookup per child run. See lab/session-info-subagent-index.md.
const sha = value => createHash('sha256').update(value).digest('hex');
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const plan = JSON.parse(read('./session-info-subagent-index.plan.json'));
const FILE = RELEASE_FILE;
const release = read('./release-files/session-info-subagent-index/session-utils-list-BUP03AzS.js');
// V's bytes, recovered by undoing every replacement (each anchor must occur exactly once).
const base = unpatchSessionUtilsList(release);

test('plan pins V bytes before and the release file after', () => {
  assert.equal(plan.files.length, 1);
  assert.equal(plan.files[0].source, FILE);
  assert.equal(plan.files[0].target, 'openclaw/dist/session-utils-list-BUP03AzS.js');
  assert.equal(sha(base), plan.files[0].before);
  assert.equal(plan.files[0].before, V_BYTES_SHA256);
  assert.equal(sha(release), plan.files[0].after);
  assert.equal(patchSessionUtilsList(base), release, 'release file is the patcher applied to V bytes');
  assert.throws(() => patchSessionUtilsList(release), /already patched/u);
});

test('only the subagent lookups of single rows change', () => {
  const baseLines = new Set(base.split('\n'));
  const releaseLines = new Set(release.split('\n'));
  const removed = [...baseLines].filter(line => !releaseLines.has(line));
  assert.deepEqual(removed.map(line => line.trim().slice(0, 60)), [
    'import { c as getSessionDisplaySubagentRunByChildSessionKey,',
    'requireCurrentController: true',
    'const subagentRun = rowContext ? rowContext.subagentRuns.get',
    'const hasActiveSubagentRun = liveSubagentRunActive || (rowCo',
    'const childSessions = params.storeChildSessionsByKey ? merge',
  ]);
  assert.equal(release.split(MARKER).length, 2);
  assert(release.includes('import { w as subagentRunRegistry } from "./subagent-registry.store.sqlite-hzGu4QSk.js";'));
  assert(release.includes('import { T as buildSubagentRunReadIndexFromRuns, b as getSubagentRunsSnapshotForRead, c as getSessionDisplaySubagentRunByChildSessionKey'));
});

test('a row without a list context builds one index, and both single-row callers share it with the store-child scan', () => {
  const row = release.slice(release.indexOf('function buildGatewaySessionRow('), release.indexOf('const persistedSessionStatus = entry?.status;'));
  assert(row.includes('const subagentIndex = rowContext?.subagentRuns ?? params.subagentRuns ?? buildSingleRowSubagentRunIndex(now);'));
  assert(!/countActiveDescendantRuns\(key\)\) > 0/u.test(row.replace('subagentIndex?.countActiveDescendantRuns(key) ?? countActiveDescendantRuns(key)', '')));
  for (const fn of ['function loadGatewaySessionSnapshot(', 'function buildGatewaySessionInfo(']) {
    const body = release.slice(release.indexOf(fn), release.indexOf('\n}\n', release.indexOf(fn)));
    assert.equal(body.split('buildSingleRowSubagentRunIndex(now)').length, 2, fn);
    assert(/buildSingleRowStoreChildSessionsByKey\(\{[^}]*subagentRuns\s*\}\)/u.test(body), fn);
    assert(/storeChildSessionsByKey,\s*subagentRuns,/u.test(body), fn);
  }
  // The index reads the same full snapshot and in-memory runs as the global lookups it replaces.
  const helper = release.slice(release.indexOf('function buildSingleRowSubagentRunIndex('), release.indexOf('function resolveSessionSelectedModelRef('));
  assert(helper.includes('runs: getSubagentRunsSnapshotForRead(subagentRunRegistry)'));
  assert(helper.includes('inMemoryRuns: subagentRunRegistry.values()'));
});

test('the imported names exist in the chunks they are imported from', () => {
  const dist = '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist';
  if (!fs.existsSync(dist)) return; // only checkable where a V dist exists; the candidate run loads it for real
  const exportsOf = file => fs.readFileSync(`${dist}/${file}`, 'utf8').match(/export \{([^}]*)\}/u)[1];
  assert(/getSubagentRunsSnapshotForRead as b\b/u.test(exportsOf('subagent-registry-read-UaDFTyfW.js')));
  assert(/buildSubagentRunReadIndexFromRuns as T\b/u.test(exportsOf('subagent-registry-read-UaDFTyfW.js')));
  assert(/subagentRuns as w\b/u.test(exportsOf('subagent-registry.store.sqlite-hzGu4QSk.js')));
});
