// workboard-full-sweep: the Workboard lifecycle sweep's 10-minute full listing reads the session stores and the
// persisted subagent runs on a worker thread. Offline checks of the release files; equivalence and timing on a
// V-scale store are in lab/candidate/workboard-full-sweep-ab.mjs (see lab/workboard-full-sweep.md).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ENV, FILES, MARKER, WORKER, WORKER_SOURCE } from './patch-workboard-full-sweep.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/workboard-full-sweep.plan.json'), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const DIR = 'lab/release-files/workboard-full-sweep';
const read = (name) => fs.readFileSync(path.join(repo, DIR, name), 'utf8');
// V's bytes (db91.6 core/dist on 2026-11-17, unchanged by infer-latency #613): the release files of the PRs that put them there
const ORIGINS = {
  'session-accessor.sqlite-transcript-state-Cz9g7S9v.js': 'lab/release-files/session-sharing-bounded-reads',
  'combined-store-gateway-BwDhjbIt.js': 'lab/release-files/sessions-visibility-columns',
  'sessions-read-C6mAMxyQ.js': 'lab/release-files/sessions-visibility-columns',
  'subagent-registry.store.sqlite-hzGu4QSk.js': 'lab/release-files/subagent-row-index',
  'subagent-registry-read-UaDFTyfW.js': 'lab/release-files/subagent-settle-backlog',
  'session-utils-list-BUP03AzS.js': 'lab/release-files/subagent-row-index',
};

test('plan replaces V bytes of six chunks and adds the worker; patch and unpatch round-trip', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map(([name]) => `openclaw/dist/${name}`));
  const infer = JSON.parse(fs.readFileSync(path.join(repo, 'lab/infer-latency.plan.json'), 'utf8'));
  for (const [name, before, patch, unpatch] of FILES) {
    const file = plan.files.find((f) => f.target === `openclaw/dist/${name}`);
    assert.equal(file.before, before, name);
    assert(!infer.files.some((f) => f.target === file.target), `${name} is also in infer-latency (#613)`);
    const released = fs.readFileSync(path.join(repo, file.source), 'utf8');
    assert.equal(sha(released), file.after, file.source);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, file.source)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${file.source}: ${r.stderr}`);
    assert.match(released, new RegExp(MARKER, 'u'), name);
    if (before === null) {
      assert.equal(name, WORKER);
      assert.equal(released, WORKER_SOURCE);
      continue;
    }
    const original = fs.readFileSync(path.join(repo, ORIGINS[name], name), 'utf8');
    assert.equal(sha(original), before, `${ORIGINS[name]}/${name} is not V's bytes`);
    assert.equal(patch(original), released, `patch(V) ${name}`);
    assert.equal(unpatch(released), original, `unpatch(release) ${name}`);
  }
});

test('the worker path is behind the switch and only for the sweep\'s full listing', () => {
  const sessionsRead = read('sessions-read-C6mAMxyQ.js');
  const guard = sessionsRead.slice(sessionsRead.indexOf('let durableSnapshot;'), sessionsRead.indexOf('if (!loaded) loaded = {'));
  assert.match(guard, new RegExp(`if \\(!loaded && lifecycleRows && lifecycleUpdatedSince === void 0 && !options\\.excludedKeys\\?\\.size && isLifecycleSnapshotListRequest\\(p\\) && process\\.env\\.${ENV} !== "0"\\) try \\{`, 'u'));
  assert.match(guard, /\} catch \(error\) \{\n\t\t\t\tcontext\.logGateway\?\.warn\?\.\(`sessions\.list lifecycle snapshot worker failed; reading on the main thread: /u);
  assert.match(sessionsRead, /const LIFECYCLE_SNAPSHOT_LIST_PARAMS = new Set\(\[\n\t"agentId",\n\t"configuredAgentsOnly",\n\t"includeGlobal",\n\t"includeUnknown",\n\t"lifecycleOnly",\n\t"limit",\n\t"offset"\n\]\);/u);
  assert.match(sessionsRead, /\.\.\.durableSnapshot\?\.subagentRuns \? \{ persistedSubagentRuns: durableSnapshot\.subagentRuns \} : \{\},/u);
  assert.match(sessionsRead, /\.\.\.durableSnapshot \? \{ durableSnapshot \} : \{\}/u);
  // the partial sweep (activeMinutes) keeps its bounded read: lifecycleUpdatedSince is set exactly then
  assert.match(sessionsRead, /const lifecycleUpdatedSince = lifecycleRows && typeof p\.activeMinutes === "number"/u);
});

test('the combined store takes the snapshot only for the same targets, and the durable loop is unchanged', () => {
  const combined = read('combined-store-gateway-BwDhjbIt.js');
  const v = fs.readFileSync(path.join(repo, ORIGINS['combined-store-gateway-BwDhjbIt.js'], 'combined-store-gateway-BwDhjbIt.js'), 'utf8');
  const loopBody = (source, head) => source.slice(source.indexOf('\t\tfor (const { sessionKey: key, entry } of store) {', source.indexOf(head)), source.indexOf('const incognitoStorePaths', source.indexOf(head)));
  // the per-row merge is the same code in V's loop and in mergeDurableGatewayStores
  const vLoop = loopBody(v, 'function loadCombinedSessionStoreForGatewayCore');
  const merged = combined.slice(combined.indexOf('function mergeDurableGatewayStores(params)'));
  assert(merged.includes(vLoop.slice(0, vLoop.lastIndexOf('\t\t}') + 3)), 'durable merge loop differs from V');
  assert.match(combined, /const durableSnapshot = opts\.durableSnapshot && isDurableLifecycleSnapshotFor\(opts\.durableSnapshot, durableTargets, requestedAgentId\) \? opts\.durableSnapshot : void 0;/u);
  assert.match(combined, /snapshot\.requestedAgentId === requestedAgentId && snapshot\.durableTargets\.length === durableTargets\.length && snapshot\.durableTargets\.every\(\(target, index\) => target\.agentId === durableTargets\[index\]\.agentId && target\.storePath === durableTargets\[index\]\.storePath\)/u);
  assert.match(combined, /mergeDurableGatewayStores\(\{\n\t\tcfg: params\.cfg,\n\t\tcombined,\n\t\tagentIdBySessionKey,\n\t\tdurableTargets: params\.durableTargets,\n\t\trequestedAgentId: params\.requestedAgentId,\n\t\tprojection: "list"\n\t\}\);/u);
  assert.match(combined, /setTimeout\(\(\) => finish\(new Error\(`lifecycle snapshot worker timed out after \$\{LIFECYCLE_SNAPSHOT_WORKER_TIMEOUT_MS\} ms`\)\), LIFECYCLE_SNAPSHOT_WORKER_TIMEOUT_MS\);/u);
  assert.match(combined, /worker\.terminate\(\)\.catch\(\(\) => \{\}\);/u);
});

test('the kept entry fields equal the fields the lifecycle listing reads with the sweep\'s parameters', async () => {
  const combined = read('combined-store-gateway-BwDhjbIt.js');
  const fields = JSON.parse(combined.match(/const LIFECYCLE_SNAPSHOT_ENTRY_FIELDS = (\[[^\]]+\]);/u)[1]);
  const list = read('session-utils-list-BUP03AzS.js');
  const fn = (name) => list.slice(list.indexOf(`function ${name}(`), list.indexOf('\n}\n', list.indexOf(`function ${name}(`)));
  const readsOf = (source) => new Set([...source.matchAll(/\bentry\??\.(\w+)/gu)].map((m) => m[1]));
  // the lifecycle rows, the phantom check, the order, the classification and a single row's subagent index
  const rows = readsOf(fn('listSessionLifecycleRowsFromStore'));
  const used = new Set([...rows, ...readsOf(fn('isPhantomAgentStoreListEntry')), 'pinnedAt', 'updatedAt', 'archivedAt', 'owner', 'createdActor', 'chatType', 'heartbeatIsolatedBaseSessionKey', 'spawnedBy', 'parentSessionKey']);
  for (const field of rows) assert(fields.includes(field), `lifecycle rows read ${field}`);
  assert.deepEqual([...used].sort(), [...fields].sort());
  // the filter, with the sweep's parameters, reads no other entry field than these (search, label, spawnedBy,
  // creatorId, ownerId, involving and people filters are excluded by LIFECYCLE_SNAPSHOT_LIST_PARAMS)
  const filter = fn('filterSessionEntries');
  for (const guarded of ['entry.label !== label', 'entry.createdActor?.id !== creatorId', 'entry.lastInteractionAt', 'entry.boardFace']) assert(filter.includes(guarded), guarded);
});

test('the rows build the subagent index from the worker\'s runs merged as getSubagentRunsSnapshot merges them', () => {
  const registry = read('subagent-registry-read-UaDFTyfW.js');
  const v = fs.readFileSync(path.join(repo, ORIGINS['subagent-registry-read-UaDFTyfW.js'], 'subagent-registry-read-UaDFTyfW.js'), 'utf8');
  // V: persisted first (only when shouldReadPersistedSubagentRuns), then every in-memory run projected and set
  assert.match(v, /if \(shouldReadPersistedSubagentRuns\(\)\) try \{/u);
  assert.match(v, /for \(const \[runId, entry\] of inMemoryRuns\) \{\n\t\tconst projected = cache\.project\(entry\);\n\t\tif \(!scope \|\| scope\.matches\(projected, key\)\) merged\.set\(runId, projected\);/u);
  assert.match(registry, /if \(shouldReadPersistedSubagentRuns\(\)\) for \(const entry of persisted\.values\(\)\) merged\.set\(entry\.runId, entry\);\n\tfor \(const \[runId, entry\] of subagentRuns\) merged\.set\(runId, persistedSubagentSessionListRunsReadCache\.project\(entry\)\);/u);
  const list = read('session-utils-list-BUP03AzS.js');
  assert.match(list, /subagentRuns: params\.subagentRuns \?\? buildSubagentSessionListReadIndex\(params\.now\),/u);
  assert.match(list, /\.\.\.params\.persistedSubagentRuns \? \{ subagentRuns: buildSubagentSessionListReadIndexFromPersisted\(params\.persistedSubagentRuns, now\) \} : \{\}/u);
  const store = read('subagent-registry.store.sqlite-hzGu4QSk.js');
  assert.match(store, /function readSubagentSessionListRows\(database\) \{\n\tconst \{ db \} = database \?\? openOpenClawStateDatabase\(\);/u);
  assert.match(store, /load: \(\) => loadSubagentSessionListRunsFromSqlite\(\)|function loadSubagentSessionListRunsFromSqlite\(database\)/u);
});

test('the worker hands back failures and reads the state database read-only', () => {
  assert.match(WORKER_SOURCE, /adoptCanonicalSessionKeyValidatedPaths\(workerData\.canonicalValidatedPaths\);/u);
  assert.match(WORKER_SOURCE, /const db = openNodeSqliteDatabase\(pathname, \{ readOnly: true \}\);/u);
  assert.match(WORKER_SOURCE, /\} catch \{\n\t\treturn;\n\t\}/u);
  assert.match(WORKER_SOURCE, /parentPort\.postMessage\(\{\n\t\tok: false,/u);
  const state = read('session-accessor.sqlite-transcript-state-Cz9g7S9v.js');
  assert.match(state, /function adoptCanonicalSessionKeyValidatedPaths\(entries\) \{\n\tfor \(const \[pathname, mainKey\] of entries \?\? \[\]\) if \(typeof pathname === "string" && pathname\) validatedDatabasePaths\.set\(pathname, mainKey\);\n\}/u);
  // every relative import of the worker and of the new imports names a chunk this release ships or V has
  const imported = [...WORKER_SOURCE.matchAll(/from "\.\/([^"]+)"/gu)].map((m) => m[1]);
  for (const name of imported) assert(/^[\w.-]+\.(js|mjs)$/u.test(name), name);
});
