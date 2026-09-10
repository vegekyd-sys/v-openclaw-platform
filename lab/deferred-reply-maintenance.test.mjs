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
function queueHarness() {
  const scheduled = [], sweeps = [], warnings = [], database = {db: {isOpen: true}}; let finalize = async () => {};
  const deps = {resolveOpenClawAgentSqlitePath: () => '/fixture/db', toDatabaseOptions: x => x, getOpenClawAgentDatabaseIfOpen: () => database,
    setImmediate: fn => scheduled.push(fn), process: {env: {}}, db91WaitAutomaticMaintenance: async () => {},
    runExclusiveSqliteSessionWrite: async (_scope, fn) => fn(), runOpenClawAgentWriteTransaction: fn => fn(database),
    applySessionEntryMaintenance: (_db, p) => {sweeps.push(p); return {};},
    finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort: async () => finalize(), getChildLogger: () => ({warn: (...args) => warnings.push(args)})};
  const api = Function(...Object.keys(deps), queueSource + ';return {kick: kickSessionEntryMaintenanceAfterWrite, owners: maintenanceByStore};')(...Object.values(deps));
  return {...api, database, sweeps, scheduled, warnings, setFinalize: fn => {finalize = fn;}, flush: async () => {scheduled.shift()(); for (let i = 0; i < 20; i++) await Promise.resolve();}};
}
test('native queue coalesces 15 writes and protects all active keys', async () => {
  const h = queueHarness(); for (let i = 0; i < 15; i++) h.kick({scope: {}, activeSessionKey: 'key' + i});
  assert.equal(h.scheduled.length, 1); await h.flush(); assert.equal(h.sweeps.length, 1); assert.equal(h.sweeps[0].activeSessionKeys.length, 15); assert.equal(h.owners.size, 0);
});
test('arrivals during maintenance finalization are not lost', async () => {
  const h = queueHarness(); let once = false; h.setFinalize(async () => {if (!once) {once = true; h.kick({scope: {}, activeSessionKey: 'later'});}});
  h.kick({scope: {}, activeSessionKey: 'first'}); await h.flush(); assert.deepEqual(h.sweeps.map(p => p.activeSessionKeys), [['first'], ['later']]); assert.equal(h.owners.size, 0);
});
test('closed database and explicitly skipped writes do not run maintenance', async () => {
  const h = queueHarness(); h.kick({scope: {}, skipMaintenance: true}); assert.equal(h.scheduled.length, 0);
  h.kick({scope: {}, activeSessionKey: 'first'}); h.database.db.isOpen = false; await h.flush(); assert.equal(h.sweeps.length, 0); assert.equal(h.owners.size, 0);
});
test('native queue, lifecycle transaction and reset/delete guards are byte-identical', () => {
  const before = read('./fixtures/concurrency-native-baseline/session-accessor.sqlite-entry-BlklNPKQ.js');
  assert.equal(entryModule, before.replace('export { ensureSessionEntrySync as C,', 'export { kickSessionEntryMaintenanceAfterWrite, ensureSessionEntrySync as C,'));
  const oldAccessor = read('./fixtures/concurrency-native-baseline/session-accessor-K0XuW6ln.js');
  const prefix = accessor.slice(accessor.indexOf('\n') + 1, accessor.indexOf('async function commitReplySessionInitialization('));
  assert.equal(prefix, oldAccessor.slice(0, oldAccessor.indexOf('async function commitReplySessionInitialization(')));
  assert.equal(accessor.slice(accessor.indexOf('async function archivePreviousSessionTranscript(')), oldAccessor.slice(oldAccessor.indexOf('async function archivePreviousSessionTranscript(')));
  assert.equal((read('./release-files/get-reply-CqW1y05D.js').match(/deferMaintenance: true/g) ?? []).length, 1);
});
