// Full real-board read-only comparison plus an isolated native mutation fixture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner, process.argv[2]);
const base = '/srv/vlab-production-mirror/labs/instances/db91-parity';
const disk = fs.statfsSync(base); assert(disk.bavail * disk.bsize >= 3 * 1024 ** 3);
assert(Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m)[1]) * 1024 >= 2 * 1024 ** 3);
const pid = Number(execFileSync('systemctl', ['show', 'openclaw-vlab-production-mirror-v8.service', '-p', 'MainPID', '--value'], {encoding: 'utf8'})); assert(pid > 1);
const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
const uid = Number(status.match(/^Uid:\s+(\d+)/m)[1]), gid = Number(status.match(/^Gid:\s+(\d+)/m)[1]); assert(uid > 0 && gid > 0);
const metrics = JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/concurrency-metrics-1789042638894.json'));
const ownKeys = metrics.results.map(r => r.key); assert.equal(ownKeys.length, 15);
process.setgroups([]); process.setgid(gid); process.setuid(uid);
const runtime = pathToFileURL(base + '/runtime/openclaw/dist/'), imported = new Map();
let candidateSql;
async function compile(source, exports = '') {
  const mod = new vm.SourceTextModule(source + '\n' + exports);
  await mod.link(async spec => {
    if (spec === './sqlite-store-CH-caj1l.js') return candidateSql;
    if (!imported.has(spec)) imported.set(spec, (async () => {
      const ns = await import(new URL(spec, runtime).href);
      return new vm.SyntheticModule(Object.keys(ns), function() {for (const name of Object.keys(ns)) this.setExport(name, ns[name]);});
    })());
    return imported.get(spec);
  });
  await mod.evaluate(); return mod;
}
candidateSql = await compile(fs.readFileSync(new URL('./release-files/lifecycle-sqlite-store.js', import.meta.url), 'utf8'), 'export {WorkboardSqliteCardStore as ProbeCardStore, ensureWorkboardSchema as ProbeSchema};');
const candidateApi = await compile(fs.readFileSync(new URL('./release-files/lifecycle-runtime-api.js', import.meta.url), 'utf8'));
const native = await import(new URL('runtime-api-1CCazqtv.js', runtime).href);
const db = new DatabaseSync(base + '/state/plugins/workboard/workboard.sqlite', {readOnly: true});
let priority, report;
try {
  const cards = new candidateSql.namespace.ProbeCardStore(db), original = new native.r(cards), candidate = new candidateApi.namespace.r(cards);
  db.exec('BEGIN');
  const all = await original.list(), links = await cards.listLifecycleLinks();
  priority = all[0].priority; assert(all.length > 0); assert.equal(links.length, all.length);
  const byId = new Map(all.map(c => [c.id, c]));
  const identity = c => ({id: c.id, sessionKey: native.c(c) ?? null, runId: native.s(c) ?? null, lookupKey: native.a(c), archived: Boolean(c.metadata?.archivedAt)});
  for (const link of links) assert(isDeepStrictEqual(identity(link), identity(byId.get(link.id))), 'Lifecycle identity projection differs; no card contents emitted');
  const sources = [{}, {runId: 'concurrency-lifecycle-missing-run'}, ...ownKeys.map(sessionKey => ({sessionKey}))];
  for (let i = 0; i < all.length; i += Math.ceil(all.length / 30)) {
    const c = all[i], sessionKey = native.a(c), runId = native.s(c);
    sources.push({sessionKey, runId}, {sessionKey, runId: 'concurrency-mismatched-run'}, {runId});
  }
  let matched = 0;
  for (const source of sources) {
    const expected = all.filter(c => !c.metadata?.archivedAt && native.i(c, source));
    const actual = (await candidate.listLifecycleCandidates(source)).filter(c => !c.metadata?.archivedAt && native.i(c, source));
    assert(isDeepStrictEqual(actual, expected), 'Full native lifecycle selection differs; no contents emitted'); matched += expected.length;
  }
  const missing = {sessionKey: ownKeys[0]}, cycles = 5;
  const time = async operation => {const start = performance.now(); for (let i = 0; i < cycles; i++) await operation(); return performance.now() - start;};
  const originalMs = await time(async () => (await original.list()).filter(c => !c.metadata?.archivedAt && native.i(c, missing)));
  const candidateMs = await time(async () => (await candidate.listLifecycleCandidates(missing)).filter(c => !c.metadata?.archivedAt && native.i(c, missing)));
  report = {fullDatabaseReadOnly: true, cards: all.length, identityComparisons: links.length, sourceComparisons: sources.length, matchedCardsAcrossCases: matched, representativeMatches: all.filter(c => !c.metadata?.archivedAt && native.i(c, missing)).length, cycles, originalMs, candidateMs};
  db.exec('ROLLBACK');
} finally {db.close();}
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workboard-native-lifecycle-'));
let fixture, other;
try {
  const file = path.join(directory, 'test.sqlite'); fixture = new DatabaseSync(file);
  fixture.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON'); candidateSql.namespace.ProbeSchema(fixture);
  const raw = new candidateSql.namespace.ProbeCardStore(fixture), store = new candidateApi.namespace.r(raw);
  const now = Date.now(), key = 'agent:makaron:explicit:concurrency-lifecycle-fixture', id = 'lifecycle-fixture';
  await raw.register(id, {version: 1, card: {id, title: 'Dedicated native lifecycle fixture', status: 'running', priority, agentId: 'makaron', sessionKey: key, runId: 'run-one', labels: [], position: 1000, createdAt: now, updatedAt: now}});
  assert.equal((await store.listLifecycleCandidates({sessionKey: key, runId: 'run-one'})).length, 1);
  const association = {expectedSessionKey: key, expectedRunId: 'run-one', sessionKey: key, runId: 'run-one', acceptedAt: now + 10};
  await store.syncLifecycle(id, {targetStatus: 'review', sourceUpdatedAt: now + 10, now: now + 10, association});
  const completed = await store.get(id); assert.equal(completed.status, 'review');
  other = new DatabaseSync(file); other.exec('PRAGMA foreign_keys=ON');
  const otherRaw = new candidateSql.namespace.ProbeCardStore(other);
  await otherRaw.register(id, {version: 1, card: {...completed, runId: 'run-two', status: 'running', updatedAt: now + 20}});
  const replacement = await store.get(id);
  await store.syncLifecycle(id, {targetStatus: 'review', sourceUpdatedAt: now + 30, now: now + 30, association});
  assert(isDeepStrictEqual(await store.get(id), replacement), 'Stale run event changed a replacement association');
  assert.equal(await raw.registerIfUpdatedAt(id, {version: 1, card: {...replacement, title: 'stale'}}, now), false);
  await otherRaw.delete(id); assert.equal((await store.listLifecycleCandidates({sessionKey: key, runId: 'run-two'})).length, 0);
  console.log(JSON.stringify({event: 'native-workboard-lifecycle-passed', ...report, nativeLifecycleTransition: true, staleAssociationPreserved: true, staleCasDenied: true, externalDeletionPreserved: true}));
} finally {
  if (other?.isOpen) other.close(); if (fixture?.isOpen) fixture.close();
  fs.rmSync(directory, {recursive: true});
}
