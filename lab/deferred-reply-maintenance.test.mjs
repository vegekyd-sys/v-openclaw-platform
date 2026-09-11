import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const accessor = read('./release-files/session-accessor-K0XuW6ln.js');
const commitSource = accessor.slice(accessor.indexOf('async function commitReplySessionInitialization('), accessor.indexOf('async function archivePreviousSessionTranscript('));
function harness(mode = 'ok') {
  const calls = [], entry = {sessionId: 's1', revision: 1, label: 'original'}, policy = {mode: 'enforce', maxEntries: 500};
  class Conflict extends Error { constructor() { super('conflict'); this.sessionKey = 'key'; } }
  const deps = {
    assertSessionInitializationAgentScope() {}, resolveSessionStorePathForScope: () => '/fixture/db.sqlite',
    loadReplySessionInitializationEntries: () => ({key: entry}),
    resolveSessionStoreEntryCore: ({store, sessionKey}) => ({normalizedKey: sessionKey, existing: store[sessionKey]}),
    createReplySessionInitializationRevision: e => e?.revision,
    createStaleReplySessionInitializationResult: e => ({ok: false, reason: 'stale-snapshot', currentEntry: e}),
    mergeConcurrentReplySessionMetadata: ({currentEntry, preparedEntry}) => ({...preparedEntry, label: currentEntry.label}),
    async applySessionEntryLifecycleMutation(p) {
      calls.push(['write', p]);
      const currentEntry = {...entry, label: 'concurrent', revision: mode === 'stale-build' ? 2 : 1};
      await p.upserts[0].buildEntry({currentEntry});
      if (mode === 'retry') await p.upserts[0].buildEntry({currentEntry});
      if (mode === 'conflict') throw new Conflict();
      await p.beforeCommitInTransaction?.();
      calls.push(['commit']);
    },
    SessionEntryLifecycleUpsertConflictError: Conflict, loadSessionEntry: () => ({...entry, revision: 2}),
    resolveSqliteScope: p => ({...p, databasePath: '/fixture/db.sqlite'}),
    resolveSqliteTranscriptArchiveDirectory: () => '/fixture/archive',
    kickSessionEntryMaintenanceAfterWrite: p => calls.push(['kick', p]),
    cloneSessionEntries: e => structuredClone(e), isIncognitoSessionKey: () => false,
    archivePreviousSessionTranscript: async () => {calls.push(['archive']); return {archive: true};}
  };
  const commit = Function(...Object.keys(deps), commitSource + ';return commitReplySessionInitialization;')(...Object.values(deps));
  const params = {agentId: 'makaron', sessionKey: 'key', expectedRevision: 1, sessionEntry: {...entry, displayName: 'new'}, maintenanceConfig: policy, deferMaintenance: true};
  return {calls, params, commit, policy};
}
test('ordinary reply keeps policy and scope, commits before enqueue, preserves concurrent metadata', async () => {
  const h = harness(); const r = await h.commit(h.params);
  assert.equal(r.ok, true); assert.equal(r.sessionEntry.label, 'concurrent'); assert.equal(r.sessionEntry.displayName, 'new');
  assert.deepEqual(h.calls.map(c => c[0]), ['write', 'commit', 'kick', 'archive']);
  assert.equal(h.calls[0][1].skipMaintenance, true); assert.equal(h.calls[0][1].maintenanceOverride, h.policy);
  const p = h.calls[2][1]; assert.equal(p.maintenanceConfig, h.policy); assert.equal(p.activeSessionKey, 'key'); assert.equal(p.scope.agentId, 'makaron'); assert.equal(p.archiveDirectory, '/fixture/archive');
});
test('explicit/default callers retain synchronous maintenance behavior', async () => {
  for (const value of [undefined, false]) {const h = harness(); await h.commit({...h.params, deferMaintenance: value}); assert.equal(h.calls[0][1].skipMaintenance, undefined); assert(!h.calls.some(c => c[0] === 'kick'));}
});
for (const mode of ['stale-initial', 'stale-build', 'conflict']) test(mode + ' cannot enqueue maintenance or archive', async () => {
  const h = harness(mode); if (mode === 'stale-initial') h.params.expectedRevision = 0;
  const r = await h.commit(h.params); assert.equal(r.ok, false); assert.equal(r.reason, 'stale-snapshot'); assert(!h.calls.some(c => ['kick', 'archive'].includes(c[0])));
});
test('commit guard failure propagates and never enqueues', async () => {
  const h = harness(); h.params.commitGuard = () => {throw new Error('fence rejected');};
  await assert.rejects(h.commit(h.params), /fence rejected/); assert.deepEqual(h.calls.map(c => c[0]), ['write']);
});
test('retry callback remains once and retired entry/reset options survive', async () => {
  const h = harness('retry'); let callbacks = 0;
  h.params.beforeEntryMutation = () => callbacks++; h.params.retiredEntry = {key: 'old', entry: {sessionId: 'old'}}; h.params.resetBoundary = {id: 'reset'};
  const r = await h.commit(h.params); assert.equal(callbacks, 1); assert.equal(r.sessionStoreView.old.sessionId, 'old'); assert.equal(h.calls[0][1].upserts[0].resetBoundary, h.params.resetBoundary);
});
const entryModule = read('./release-files/session-accessor.sqlite-entry-BlklNPKQ.js');
const queueSource = entryModule.slice(entryModule.indexOf('const maintenanceByStore ='), entryModule.indexOf('//#endregion', entryModule.indexOf('const maintenanceByStore =')));
function queueHarness({archives = false, incognito = false, permit = 'ok', archiveSizes, admissions = []} = {}) {
  const scheduled = [], timers = [], sweeps = [], warnings = [], archiveCommits = [], offloadedPlans = [], readSnapshots = [], writeTransactions = [], finalizeCalls = [], database = {db: {isOpen: true}, path: '/fixture/db.sqlite'}; let finalize = async () => {}, beforeArchiveRetry = () => {}, activeAdmissions = new Set(admissions);
  const deps = {resolveOpenClawAgentSqlitePath: () => '/fixture/db', toDatabaseOptions: x => x, getOpenClawAgentDatabaseIfOpen: () => database,
    isIncognitoOpenClawAgentSqlitePath: () => incognito,
    acquireAutomaticMaintenancePermit: () => {if (permit === 'busy') return null; if (permit === 'error') throw new Error('fixture coordinator failed'); return {finish() {}};}, tryAcquireExclusiveSqliteCoordinator() {},
    runSqliteDeferredTransactionSync: (_db, operation) => {readSnapshots.push(true); return operation();},
    runAutomaticSessionMaintenancePlan: async p => {offloadedPlans.push(p); const plan = deps.applySessionEntryMaintenance(database, {...p, planOnly: true}); return archiveSizes ? {...plan, automaticArchiveBytesBySessionId: archiveSizes} : plan;},
    filterAutomaticSessionMaintenancePlan: p => p, collectActiveSessionWorkAdmissions: () => activeAdmissions.size ? new Map([['/fixture/sessions.json', new Set(activeAdmissions)]]) : new Map(), uniqueStrings: xs => [...new Set(xs)],
    withSqliteBeginContentionRetry: async ({run, operation}) => {beforeArchiveRetry(); return run(operation);},
    commitPlannedSessionMaintenanceArchives: (_db, plan) => {archiveCommits.push(plan); return plan;},
    resolveMaintenanceConfig: () => ({mode: 'enforce'}), setImmediate: fn => scheduled.push(fn), setTimeout: fn => {timers.push(fn); return {unref() {}};}, process: {env: {}}, db91WaitAutomaticMaintenance: async () => {},
    runExclusiveSqliteSessionWrite: async (_scope, fn) => fn(), runOpenClawAgentWriteTransaction: fn => {writeTransactions.push(true); return fn(database);},
    applySessionEntryMaintenance: (_db, p) => {sweeps.push(p); return archives ? {plannedEntryArchives: [{}]} : {};},
    finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort: async (...args) => {finalizeCalls.push(args); return finalize();}, getChildLogger: () => ({warn: (...args) => warnings.push(args)})};
  const api = Function(...Object.keys(deps), queueSource + ';return {kick: kickSessionEntryMaintenanceAfterWrite, owners: maintenanceByStore};')(...Object.values(deps));
  const settle = async () => {for (let i = 0; i < 20; i++) await Promise.resolve();};
  return {...api, database, sweeps, scheduled, timers, warnings, archiveCommits, offloadedPlans, readSnapshots, writeTransactions, finalizeCalls, setAdmissions: values => {activeAdmissions = new Set(values);}, setBeforeArchiveRetry: fn => {beforeArchiveRetry = fn;}, setFinalize: fn => {finalize = fn;}, flush: async () => {scheduled.shift()(); await settle();}, tick: async () => {timers.shift()(); await settle();}};
}
test('native queue coalesces 15 writes and protects all active keys', async () => {
  const h = queueHarness(); for (let i = 0; i < 15; i++) h.kick({scope: {agentId: 'makaron'}, activeSessionKey: 'key' + i, archiveDirectory: '/fixture/archive', storePath: '/fixture/sessions.json'});
  assert.equal(h.scheduled.length, 1); await h.flush(); assert.equal(h.sweeps.length, 1); assert.equal(h.sweeps[0].activeSessionKeys.length, 15); assert.equal(h.owners.size, 0);
  assert.equal(h.offloadedPlans.length, 1); assert.equal(h.readSnapshots.length, 0); assert.equal(h.writeTransactions.length, 0); assert.equal(h.sweeps[0].planOnly, true);
  assert.equal(h.offloadedPlans[0].maintenanceConfig.mode, 'enforce');
});
test('incognito maintenance retains the process-local inline snapshot', async () => {
  const h = queueHarness({incognito: true}); h.kick({scope: {agentId: 'makaron'}, activeSessionKey: 'key', archiveDirectory: '/fixture/archive', storePath: '/fixture/sessions.json'}); await h.flush();
  assert.equal(h.offloadedPlans.length, 0); assert.equal(h.readSnapshots.length, 1); assert.equal(h.sweeps.length, 1); assert.equal(h.sweeps[0].planOnly, true);
});
test('automatic archive write uses a short native transaction after read-only planning', async () => {
  const h = queueHarness({archives: true}); h.kick({scope: {agentId: 'makaron'}, activeSessionKey: 'first', archiveDirectory: '/fixture/archive', storePath: '/fixture/sessions.json'}); await h.flush();
  assert.equal(h.offloadedPlans.length, 1); assert.equal(h.readSnapshots.length, 0); assert.equal(h.writeTransactions.length, 1); assert.equal(h.archiveCommits.length, 1);
});
test('automatic finalization forwards archive sizing prepared off the event loop', async () => {
  const sizes = [['session-1', 42]];
  const h = queueHarness({archiveSizes: sizes});
  h.kick({scope: {agentId: 'makaron'}, activeSessionKey: 'first', archiveDirectory: '/fixture/archive', storePath: '/fixture/sessions.json'});
  await h.flush();
  assert.equal(h.finalizeCalls.length, 1);
  assert.deepEqual([...h.finalizeCalls[0][2].archiveBytesBySessionId], sizes);
});
test('automatic destructive finalization waits for admitted Agent turns to drain', async () => {
  const h = queueHarness({admissions: ['agent:makaron:explicit:busy']});
  h.kick({scope: {agentId: 'makaron'}, activeSessionKey: 'first', archiveDirectory: '/fixture/archive', storePath: '/fixture/sessions.json'});
  await h.flush();
  assert.equal(h.offloadedPlans.length, 1);
  assert.equal(h.timers.length, 1);
  assert.equal(h.finalizeCalls.length, 0);
  h.setAdmissions([]);
  await h.tick();
  assert.equal(h.finalizeCalls.length, 1);
});
test('retired owner cannot commit an archive after BEGIN contention yields', async () => {
  const h = queueHarness({archives: true});
  h.setBeforeArchiveRetry(() => h.owners.set('/fixture/db', {replacementOwner: true}));
  h.kick({scope: {}, activeSessionKey: 'first'}); await h.flush();
  assert.equal(h.archiveCommits.length, 0); assert.equal(h.owners.get('/fixture/db').replacementOwner, true);
});
for (const permit of ['busy', 'error']) test('automatic coordinator ' + permit + ' neither sweeps nor rejects the caller', async () => {
  const h = queueHarness({permit}); h.kick({scope: {}, activeSessionKey: 'first'}); await h.flush();
  assert.equal(h.sweeps.length, 0); assert.equal(h.owners.size, 0); assert.equal(h.warnings.length, permit === 'error' ? 1 : 0);
});
test('arrivals during maintenance finalization are not lost', async () => {
  const h = queueHarness(); let once = false; h.setFinalize(async () => {if (!once) {once = true; h.kick({scope: {}, activeSessionKey: 'later'});}});
  h.kick({scope: {}, activeSessionKey: 'first'}); await h.flush(); assert.deepEqual(h.sweeps.map(p => p.activeSessionKeys), [['first'], ['later']]); assert.equal(h.owners.size, 0);
});
test('closed database and explicitly skipped writes do not run maintenance', async () => {
  const h = queueHarness(); h.kick({scope: {}, skipMaintenance: true}); assert.equal(h.scheduled.length, 0);
  h.kick({scope: {}, activeSessionKey: 'first'}); h.database.db.isOpen = false; await h.flush(); assert.equal(h.sweeps.length, 0); assert.equal(h.owners.size, 0);
});
test('outside the explicitly tested automatic queue, lifecycle/reset/delete guards are byte-identical', () => {
  const before = read('./fixtures/concurrency-native-baseline/session-accessor.sqlite-entry-BlklNPKQ.js');
  const beforeQueue = before.slice(before.indexOf('const maintenanceByStore ='), before.indexOf('//#endregion', before.indexOf('const maintenanceByStore =')));
  const withoutBeginRetry = entryModule.replace(queueSource, beforeQueue)
    .replace('import {acquireAutomaticMaintenancePermit} from "./automatic-maintenance-coordinator.mjs";\n', '')
    .replace('import {runAutomaticSessionMaintenancePlan} from "./automatic-session-maintenance-planner.mjs";\n', '')
    .replace('import {filterAutomaticSessionMaintenancePlan, runAutomaticSessionMaintenancePlan} from "./automatic-session-maintenance-planner.mjs";\n', '')
    .replace('import {l as runSqliteDeferredTransactionSync, o as tryAcquireExclusiveSqliteCoordinator} from "./node-sqlite-CL-d6drd.js";\n', '')
    .replace('import {commitPlannedSessionMaintenanceArchives} from "./session-history-eviction-d5aiCsHS.js";\n', '')
    .replace('import {s as resolveMaintenanceConfig} from "./disk-budget-BzLS0kmH.js";\n', '')
    .replace('import {i as collectActiveSessionWorkAdmissions} from "./session-lifecycle-admission-siUq03Jk.js";\n', '')
    .replace('import {withSqliteBeginContentionRetry} from "./sqlite-begin-contention-retry.mjs";\n', '')
    .replace('\t\tawait withSqliteBeginContentionRetry({\n\t\t\tdatabase: database.db,\n\t\t\trun: operation => runOpenClawAgentWriteTransaction(operation, toDatabaseOptions(resolved)),\n\t\t\toperation: (writeDatabase) => {\n', '\t\trunOpenClawAgentWriteTransaction((writeDatabase) => {\n')
    .replace('\t\t\tresult = cloneSessionEntry(persisted);\n\t\t\t}\n\t\t});', '\t\t\tresult = cloneSessionEntry(persisted);\n\t\t}, toDatabaseOptions(resolved));');
  assert.equal(withoutBeginRetry, before.replace('export { ensureSessionEntrySync as C,', 'export { kickSessionEntryMaintenanceAfterWrite, ensureSessionEntrySync as C,'));
  const oldAccessor = read('./fixtures/concurrency-native-baseline/session-accessor-K0XuW6ln.js');
  const prefix = accessor.slice(accessor.indexOf('\n') + 1, accessor.indexOf('async function commitReplySessionInitialization('));
  assert.equal(prefix, oldAccessor.slice(0, oldAccessor.indexOf('async function commitReplySessionInitialization(')));
  assert.equal(accessor.slice(accessor.indexOf('async function archivePreviousSessionTranscript(')), oldAccessor.slice(oldAccessor.indexOf('async function archivePreviousSessionTranscript(')));
  assert.equal((read('./release-files/get-reply-CqW1y05D.js').match(/deferMaintenance: true/g) ?? []).length, 1);
});
