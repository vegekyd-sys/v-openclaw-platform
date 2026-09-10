// Native CAS/commit-guard acceptance against the full shared database, no model.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner, process.argv[2]);
const base = '/srv/vlab-production-mirror/labs/instances/db91-parity';
const disk = fs.statfsSync(base); assert(disk.bavail * disk.bsize >= 3 * 1024 ** 3);
const pid = Number(execFileSync('systemctl', ['show', 'openclaw-vlab-production-mirror-v8.service', '-p', 'MainPID', '--value'], {encoding: 'utf8'})); assert(pid > 1);
const env = Object.fromEntries(fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0').filter(s => s.includes('=')).map(s => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)])); Object.assign(process.env, env);
assert.equal(env.OPENCLAW_STATE_DIR, base + '/state'); assert.equal(JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH)).gateway.port, 24993);
const procStatus = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
const uid = Number(procStatus.match(/^Uid:\s+(\d+)/m)[1]), gid = Number(procStatus.match(/^Gid:\s+(\d+)/m)[1]); assert(uid > 0 && gid > 0);
process.setgroups([]); process.setgid(gid); process.setuid(uid);
const main = await import(base + '/runtime/openclaw/dist/session-accessor-K0XuW6ln.js');
const entry = await import(base + '/runtime/openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js');
const scope = {agentId: 'makaron', storePath: base + '/state/agents/makaron/agent/openclaw-agent.sqlite', sessionKey: 'agent:makaron:explicit:concurrency-fix-native-commit-' + Date.now()};
const initial = {sessionId: randomUUID(), createdAt: Date.now(), updatedAt: Date.now(), label: 'initial', status: 'done'};
// Reply initialization runs after Gateway admission has opened the native owner
// connection. Mirror that precondition without creating or mutating this row.
entry.d({...scope, hydrateSkillPromptRefs: false});
const empty = main.Y(scope);
const created = await main.J({...scope, expectedRevision: empty.revision, sessionEntry: initial, deferMaintenance: true, archivePreviousTranscript: false}); assert.equal(created.ok, true);
const snapshot = main.Y(scope); let prepares = 0, beforeCommits = 0;
const merged = await main.J({...scope, expectedRevision: snapshot.revision, snapshotEntry: snapshot.currentEntry,
  sessionEntry: {...snapshot.currentEntry, displayName: 'prepared-field', updatedAt: Date.now()}, deferMaintenance: true, archivePreviousTranscript: false,
  prepareSessionEntry: async ({sessionEntry}) => {prepares++; await entry.p(scope, () => ({label: 'concurrent-field', updatedAt: Date.now()}), {skipMaintenance: true}); return sessionEntry;},
  beforeEntryMutation: () => {beforeCommits++;}});
assert.equal(merged.ok, true); assert.equal(prepares, 1); assert.equal(beforeCommits, 1);
let persisted = entry.f({...scope, hydrateSkillPromptRefs: false}); assert.equal(persisted.label, 'concurrent-field'); assert.equal(persisted.displayName, 'prepared-field');
const guardedSnapshot = main.Y(scope), denied = new Error('fixture ownership guard rejected'); let guardCalls = 0;
await assert.rejects(main.J({...scope, expectedRevision: guardedSnapshot.revision, sessionEntry: {...guardedSnapshot.currentEntry, label: 'must-not-commit'}, deferMaintenance: true, archivePreviousTranscript: false, commitGuard: () => {guardCalls++; throw denied;}}), e => e === denied);
assert.equal(guardCalls, 1); persisted = entry.f({...scope, hydrateSkillPromptRefs: false}); assert.equal(persisted.label, 'concurrent-field');
const beforeRollover = main.Y(scope), nextId = randomUUID();
await entry.p(scope, () => ({sessionId: nextId, updatedAt: Date.now()}), {skipMaintenance: true});
const stale = await main.J({...scope, expectedRevision: beforeRollover.revision, sessionEntry: {...beforeRollover.currentEntry, label: 'must-not-revive'}, deferMaintenance: true, archivePreviousTranscript: false});
assert.equal(stale.ok, false); assert.equal(stale.reason, 'stale-snapshot');
persisted = entry.f({...scope, hydrateSkillPromptRefs: false}); assert.equal(persisted.sessionId, nextId); assert.equal(persisted.label, 'concurrent-field');
// Exercise the exact new short archive commit on a second dedicated row.
// No global retention policy is changed and no business row is selected.
const maintenance = await import(base + '/runtime/openclaw/dist/session-history-eviction-d5aiCsHS.js');
const nativeDb = await import(base + '/runtime/openclaw/dist/openclaw-agent-db-CUTe8BX6.js');
const nativeScope = await import(base + '/runtime/openclaw/dist/session-accessor.sqlite-scope-BwPKGcgm.js');
const archiveScope = {...scope, sessionKey: scope.sessionKey + '-archive'};
const archiveInitial = {sessionId: randomUUID(), updatedAt: Date.now(), label: 'archive-fixture', status: 'done'};
await entry.p(archiveScope, () => archiveInitial, {fallbackEntry: archiveInitial, replaceEntry: true, skipMaintenance: true});
const archiveOptions = nativeScope.m(nativeScope.c(archiveScope));
const planArchive = () => {
  const expectedEntry = entry.f({...archiveScope, hydrateSkillPromptRefs: false});
  return {plannedEntryArchives: [{sessionKey: archiveScope.sessionKey, expectedEntry: structuredClone(expectedEntry), entry: {...expectedEntry, archivedAt: Date.now()}}], entryRemovals: [], stateDeletePlans: [], archived: 1, modelRunPruned: 0, pruned: 0, capped: 0};
};
const commitArchive = plan => nativeDb.y(db => maintenance.commitPlannedSessionMaintenanceArchives(db, plan), archiveOptions);
const goodPlan = planArchive(); assert.equal(commitArchive(goodPlan).archived, 1);
assert.equal(entry.f({...archiveScope, hydrateSkillPromptRefs: false}).archivedAt, goodPlan.plannedEntryArchives[0].entry.archivedAt);
const changedPlan = planArchive();
await entry.p(archiveScope, () => ({label: 'concurrent-archive-metadata', updatedAt: Date.now()}), {skipMaintenance: true});
assert.equal(commitArchive(changedPlan).archived, 0);
assert.equal(entry.f({...archiveScope, hydrateSkillPromptRefs: false}).label, 'concurrent-archive-metadata');
const rolloverPlan = planArchive(), archiveNextId = randomUUID();
await entry.p(archiveScope, () => ({sessionId: archiveNextId, updatedAt: Date.now()}), {skipMaintenance: true});
assert.equal(commitArchive(rolloverPlan).archived, 0);
assert.equal(entry.f({...archiveScope, hydrateSkillPromptRefs: false}).sessionId, archiveNextId);
console.log(JSON.stringify({event: 'native-reply-commit-passed', sessionKey: scope.sessionKey, fullDatabase: true, created: true, concurrentMetadataPreserved: true, prepareCalls: prepares, beforeMutationCalls: beforeCommits, commitGuardDeniedWithoutWrite: true, staleRolloverRejected: true, nativeArchiveCommitted: true, changedArchiveSkipped: true, rolledOverArchiveSkipped: true}));
