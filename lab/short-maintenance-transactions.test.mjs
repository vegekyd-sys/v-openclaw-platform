import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {acquireAutomaticMaintenancePermit} from './release-files/automatic-maintenance-coordinator.mjs';
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const source = read('./release-files/session-history-eviction-d5aiCsHS.js');
const applySource = source.slice(source.indexOf('function applySessionEntryMaintenance('), source.indexOf('/** Finalizes maintenance after its caller releases the per-store writer lane. */'));
const commitSource = source.slice(source.indexOf('export function commitPlannedSessionMaintenanceArchives(')).replace('export function ', 'function ');
function maintenanceFixture() {
  const entries = {
    archive: {sessionId: 'archive-session', updatedAt: 1, label: 'original', worktree: {branch: 'test-only'}},
    remove: {sessionId: 'remove-session', updatedAt: 1},
    active: {sessionId: 'active-session', updatedAt: 10},
  };
  const writes = [], database = {entries};
  const deps = {
    normalizeResolvedMaintenanceConfigInput: value => value,
    resolveMaintenanceConfig: () => ({mode: 'enforce', pruneAfterMs: 100, archiveDashboardAfterMs: 100, maxEntries: 100}),
    readSessionEntryCount: db => Object.keys(db.entries).length,
    uniqueStrings: values => [...new Set(values.filter(Boolean))],
    readSessionMaintenanceKeyProjection: db => structuredClone(db.entries),
    collectSqliteSessionMaintenanceBaseKeys: (_store, keys) => keys,
    collectSessionMaintenancePreserveKeysForStore: p => new Set(p.baseKeys),
    shouldRunModelRunPrune: () => false,
    readSessionMaintenanceAgeCandidates: ({database}) => structuredClone(database.entries),
    pruneStaleModelRunEntries: () => 0,
    archiveStaleDashboardEntries: (store, _age, p) => {if (!store.archive || p.preserveKeys.has('archive')) return 0; store.archive.archivedAt = 100; p.onArchived({key: 'archive'}); return 1;},
    pruneStaleEntries: (store, _age, p) => {if (!store.remove || p.preserveKeys.has('remove')) return 0; delete store.remove; p.onPruned({key: 'remove'}); return 1;},
    shouldRunSessionEntryMaintenance: () => false,
    readSessionMaintenanceCapCandidates: () => assert.fail('no cap in this fixture'),
    capEntryCount: () => assert.fail('no cap in this fixture'),
    // Deliberately return shared entries: read-only planning must not mutate caches.
    readSessionEntryStore: (db, {sessionKeys}) => Object.fromEntries(sessionKeys.filter(k => db.entries[k]).map(k => [k, db.entries[k]])),
    cloneSessionEntry: structuredClone,
    writeSessionEntry: (db, key, entry) => {writes.push(key); db.entries[key] = structuredClone(entry);},
    collectSessionStateIdsForEntry: entry => [entry.sessionId],
    readSessionGenerationIdsForKeys: () => [],
    collectProjectedReferencedSessionIds: () => new Set(['active-session']),
    planSessionStateDeleteIfUnreferenced: p => p.referencedSessionIds.has(p.sessionId) ? undefined : {sessionId: p.sessionId, archiveTranscript: true},
    partitionUnchangedPlannedLifecycleArtifactEntries: (db, plans) => ({unchanged: plans.filter(p => JSON.stringify(db.entries[p.sessionKey]) === JSON.stringify(p.expectedEntry))}),
  };
  const functions = Function(...Object.keys(deps), applySource + '\n' + commitSource + ';return {applySessionEntryMaintenance, commitPlannedSessionMaintenanceArchives};')(...Object.values(deps));
  return {...functions, database, writes};
}
test('explicit maintenance retains synchronous archive writes and native deletion plans', () => {
  const h = maintenanceFixture(), plan = h.applySessionEntryMaintenance(h.database, {activeSessionKeys: ['active'], storePath: '/fixture'});
  assert.deepEqual(h.writes, ['archive']); assert.equal(h.database.entries.archive.archivedAt, 100);
  assert.equal(plan.plannedEntryArchives, undefined); assert.equal(plan.archived, 1);
  assert.equal(plan.entryRemovals[0].sessionKey, 'remove'); assert.equal(plan.stateDeletePlans[0].sessionId, 'remove-session');
});
test('automatic planning has zero writes and produces the same deletion snapshots', () => {
  const h = maintenanceFixture(), original = structuredClone(h.database.entries);
  const plan = h.applySessionEntryMaintenance(h.database, {activeSessionKeys: ['active'], storePath: '/fixture', planOnly: true});
  assert.deepEqual(h.writes, []); assert.deepEqual(h.database.entries, original);
  assert.deepEqual(plan.plannedEntryArchives[0].expectedEntry, original.archive);
  assert.equal(plan.plannedEntryArchives[0].entry.archivedAt, 100);
  const other = maintenanceFixture(), explicit = other.applySessionEntryMaintenance(other.database, {activeSessionKeys: ['active'], storePath: '/fixture'});
  assert.deepEqual(plan.entryRemovals, explicit.entryRemovals); assert.deepEqual(plan.stateDeletePlans, explicit.stateDeletePlans);
});
test('archive commit revalidates unchanged records before writing', () => {
  const h = maintenanceFixture(), plan = h.applySessionEntryMaintenance(h.database, {planOnly: true});
  const committed = h.commitPlannedSessionMaintenanceArchives(h.database, plan);
  assert.deepEqual(h.writes, ['archive']); assert.equal(committed.archived, 1); assert.equal(committed.archivedWorktrees.length, 1);
  assert.equal(committed.plannedEntryArchives, undefined);
});
for (const mutation of ['metadata', 'rollover', 'deleted']) test('archive commit never revives or overwrites a ' + mutation + ' change', () => {
  const h = maintenanceFixture(), plan = h.applySessionEntryMaintenance(h.database, {planOnly: true});
  if (mutation === 'metadata') h.database.entries.archive.label = 'concurrent';
  if (mutation === 'rollover') h.database.entries.archive.sessionId = 'new-generation';
  if (mutation === 'deleted') delete h.database.entries.archive;
  const before = structuredClone(h.database.entries), committed = h.commitPlannedSessionMaintenanceArchives(h.database, plan);
  assert.deepEqual(h.writes, []); assert.deepEqual(h.database.entries, before);
  assert.equal(committed.archived, 0); assert.deepEqual(committed.archivedWorktrees, []);
});
test('skip/warn modes and protected active keys remain non-mutating', () => {
  for (const p of [{skipMaintenance: true}, {maintenanceConfig: {mode: 'warn'}}, {activeSessionKeys: ['archive', 'remove', 'active'], planOnly: true}]) {
    const h = maintenanceFixture(), plan = h.applySessionEntryMaintenance(h.database, p);
    assert.equal(plan.archived, 0); assert.deepEqual(h.writes, []); assert.deepEqual(plan.entryRemovals, []);
  }
});
test('native deletion finalizer, snapshot comparison and other eviction code remain byte-identical', () => {
  const before = read('./fixtures/concurrency-native-baseline/session-history-eviction-d5aiCsHS.js');
  const marker = '/** Finalizes maintenance after its caller releases the per-store writer lane. */';
  const v2ArchiveSizing = `\tlet archiveBytesBySessionId = options.archiveBytesBySessionId;
\ttry {
\t\tif (archiveBytesBySessionId) {
\t\t\tfor (const plan of stateDeletePlans) if (plan.archiveTranscript && !archiveBytesBySessionId.has(plan.sessionId)) throw new Error(\`Missing precomputed archive byte size for \${plan.sessionId}\`);
\t\t} else archiveBytesBySessionId = await readSessionTranscriptJsonlBytes(scope, stateDeletePlans.filter((plan) => plan.archiveTranscript).map((plan) => plan.sessionId), isCurrent);`;
  const nativeArchiveSizing = `\tlet archiveBytesBySessionId;
\ttry {
\t\tarchiveBytesBySessionId = await readSessionTranscriptJsonlBytes(scope, stateDeletePlans.filter((plan) => plan.archiveTranscript).map((plan) => plan.sessionId), isCurrent);`;
  assert.equal(source.split(v2ArchiveSizing).length, 2, 'archive sizing fast-path anchor drift');
  const boundedBatchExport = 'applySessionEntryMaintenance as a, buildSessionMaintenanceBatches as b,';
  assert.equal(source.split(boundedBatchExport).length, 2, 'bounded batch export anchor drift');
  const normalized = source.replace(v2ArchiveSizing, nativeArchiveSizing)
    .replace(boundedBatchExport, 'applySessionEntryMaintenance as a,');
  assert.equal(source.slice(0, source.indexOf('function applySessionEntryMaintenance(')), before.slice(0, before.indexOf('function applySessionEntryMaintenance(')));
  assert.equal(normalized.slice(normalized.indexOf(marker), normalized.indexOf('\n// Automatic planning is read-only.')), before.slice(before.indexOf(marker)));
});
test('coordinator success or same-path handle rotation holds one cooldown; failure/closed handle releases immediately', () => {
  for (const mode of ['success', 'rebound', 'failure', 'closed']) {
    const scheduled = [], paths = []; let releases = 0;
    const database = {path: '/fixture/agent.sqlite', db: {isOpen: true}};
    const permit = acquireAutomaticMaintenancePermit(database, (p, o) => {paths.push([p, o]); return {release() {releases++;}};}, {setTimer: (f, ms) => {scheduled.push([f, ms]); return {unref() {}};}});
    let currentDatabase = database;
    if (mode === 'closed' || mode === 'rebound') database.db.isOpen = false;
    if (mode === 'rebound') currentDatabase = {path: database.path, db: {isOpen: true}};
    permit.finish(mode !== 'failure', currentDatabase); permit.finish(true, currentDatabase);
    assert.equal(paths[0][0], '/fixture/agent.sqlite.automatic-maintenance-coordinator'); assert.equal(paths[0][1].busyTimeoutMs, 0);
    if (mode === 'success' || mode === 'rebound') {assert.equal(releases, 0); assert.equal(scheduled.length, 1); assert.equal(scheduled[0][1], 60000); scheduled[0][0](); scheduled[0][0]();}
    else assert.equal(scheduled.length, 0);
    assert.equal(releases, 1);
  }
});
test('coordinator busy does not steal, corrupt/error is surfaced, closed handle is untouched', () => {
  assert.equal(acquireAutomaticMaintenancePermit({path: '/fixture/db', db: {isOpen: true}}, () => null), null);
  const error = new Error('coordinator failed'); assert.throws(() => acquireAutomaticMaintenancePermit({path: '/fixture/db', db: {isOpen: true}}, () => {throw error;}), e => e === error);
  assert.equal(acquireAutomaticMaintenancePermit({db: {isOpen: false}}, () => assert.fail('closed')), null);
});
test('coordinator refuses symlinks and hardlinks before invoking SQLite', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlab-coordinator-links-')), filename = path.join(dir, 'agent.sqlite');
  const db = new DatabaseSync(filename); db.close();
  const side = filename + '.automatic-maintenance-coordinator';
  try {
    fs.symlinkSync(filename, side);
    assert.throws(() => acquireAutomaticMaintenancePermit({path: filename, db: {isOpen: true}}, () => assert.fail('unsafe acquire')), /Unsafe/);
    fs.unlinkSync(side); fs.linkSync(filename, side);
    assert.throws(() => acquireAutomaticMaintenancePermit({path: filename, db: {isOpen: true}}, () => assert.fail('unsafe acquire')), /Unsafe/);
  } finally {fs.rmSync(dir, {recursive: true});}
});
const acquireFixture = (filename, {busyTimeoutMs}) => {
  const db = new DatabaseSync(filename); db.exec('PRAGMA busy_timeout=' + busyTimeoutMs);
  try {db.exec('BEGIN EXCLUSIVE');} catch (error) {db.close(); if ((error.errcode & 255) === 5) return null; throw error;}
  return {release() {db.exec('ROLLBACK'); db.close();}};
};
async function childJson(code) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {stdio: ['ignore', 'pipe', 'pipe']});
  let out = '', err = ''; child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c);
  await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', c => c === 0 ? resolve() : reject(new Error(err)));});
  return JSON.parse(out);
}
test('real processes coalesce on sidecar while the actual data file remains writable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlab-maintenance-coordinator-')), filename = path.join(dir, 'agent.sqlite');
  const db = new DatabaseSync(filename); db.exec('PRAGMA journal_mode=DELETE; CREATE TABLE state (value INTEGER)'); db.close();
  let releaseTimer;
  try {
    const permit = acquireAutomaticMaintenancePermit({path: filename, db: {isOpen: true}}, acquireFixture, {setTimer: f => {releaseTimer = f; return {unref() {}};}});
    permit.finish(true);
    const code = `import {DatabaseSync} from 'node:sqlite'; const side = new DatabaseSync(${JSON.stringify(filename + '.automatic-maintenance-coordinator')}); side.exec('PRAGMA busy_timeout=0'); let busy=false; try{side.exec('BEGIN EXCLUSIVE'); side.exec('ROLLBACK');}catch(e){if((e.errcode&255)!==5)throw e;busy=true;} side.close(); const data=new DatabaseSync(${JSON.stringify(filename)}); data.exec('INSERT INTO state VALUES (1)'); data.close(); console.log(JSON.stringify({busy,foregroundCommitted:true}));`;
    assert.deepEqual(await childJson(code), {busy: true, foregroundCommitted: true});
    releaseTimer(); assert.deepEqual(await childJson(code), {busy: false, foregroundCommitted: true});
  } finally {releaseTimer?.(); fs.rmSync(dir, {recursive: true});}
});
test('coordinator owner exit releases the OS lock without deleting or stealing a lease', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlab-coordinator-exit-')), filename = path.join(dir, 'agent.sqlite');
  let child;
  try {
    child = spawn(process.execPath, ['--input-type=module', '-e', `import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(${JSON.stringify(filename + '.automatic-maintenance-coordinator')});db.exec('BEGIN EXCLUSIVE');process.stdout.write('READY\\n');setInterval(()=>{},1000);`], {stdio: ['ignore', 'pipe', 'pipe']});
    child.stderr.resume();
    const exited = new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);});
    await new Promise((resolve, reject) => {child.stdout.once('data', resolve); child.once('error', reject);});
    assert.equal(acquireAutomaticMaintenancePermit({path: filename, db: {isOpen: true}}, acquireFixture), null);
    child.kill('SIGTERM'); await exited;
    const permit = acquireAutomaticMaintenancePermit({path: filename, db: {isOpen: true}}, acquireFixture);
    assert(permit); permit.finish(false);
  } finally {if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); fs.rmSync(dir, {recursive: true});}
});
test('actual native deferred WAL snapshot does not block a different process writer', {skip: !process.env.OPENCLAW_TEST_NATIVE_DIST}, async () => {
  assert.equal(os.hostname(), 'VM-0-4-ubuntu'); assert.equal(process.version, 'v22.23.1');
  assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner, process.env.VLAB_TEST_OWNER);
  const dist = '/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw/dist'; assert.equal(process.env.OPENCLAW_TEST_NATIVE_DIST, dist);
  const disk = fs.statfsSync('/srv/vlab-production-mirror'); assert(disk.bavail * disk.bsize >= 3 * 1024 ** 3);
  const {l: nativeReadSnapshot} = await import(dist + '/node-sqlite-CL-d6drd.js');
  const dir = fs.mkdtempSync('/srv/vlab-production-mirror/labs/control/maintenance-wal-test-'), filename = path.join(dir, 'fixture.sqlite');
  const db = new DatabaseSync(filename); db.exec('PRAGMA journal_mode=WAL; CREATE TABLE state (value INTEGER); INSERT INTO state VALUES (0)');
  try {
    // The native snapshot function is synchronous. A child writer is launched
    // inside it; its commit is waited on with a bounded synchronous subprocess.
    nativeReadSnapshot(db, () => {
      assert.equal(db.prepare('SELECT sum(value) AS n FROM state').get().n, 0);
      execFileSync(process.execPath, ['--input-type=module', '-e', `import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(${JSON.stringify(filename)});db.exec('PRAGMA busy_timeout=0; INSERT INTO state VALUES (7)');db.close();`], {timeout: 3000, stdio: 'pipe'});
      assert.equal(db.prepare('SELECT sum(value) AS n FROM state').get().n, 0);
    });
    assert.equal(db.prepare('SELECT sum(value) AS n FROM state').get().n, 7);
  } finally {db.close(); fs.rmSync(dir, {recursive: true});}
});
