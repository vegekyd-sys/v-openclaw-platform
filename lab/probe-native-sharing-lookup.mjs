// Compare existing full-list and proposed exact sharing resolution on the full DB.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const base = '/srv/vlab-production-mirror/labs/instances/db91-parity';
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner, process.argv[2]);
const disk = fs.statfsSync(base); assert(disk.bavail * disk.bsize >= 3 * 1024 ** 3);
assert(Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m)[1]) * 1024 >= 2 * 1024 ** 3, 'Insufficient memory for native comparison');
const pid = Number(execFileSync('systemctl', ['show', 'openclaw-vlab-production-mirror-v8.service', '-p', 'MainPID', '--value'], {encoding: 'utf8'})); assert(pid > 1);
const env = Object.fromEntries(fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0').filter(s => s.includes('=')).map(s => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)])); Object.assign(process.env, env);
const cfg = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH)); assert.equal(cfg.gateway.port, 24993); assert.equal(env.OPENCLAW_STATE_DIR, base + '/state');
const metrics = JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/concurrency-metrics-1789035034467.json'));
const keys = metrics.results.filter(r => r.label === 'short-tx-v2-warm-c15-wave5').map(r => r.key); assert.equal(keys.length, 15);
const source = fs.readFileSync(new URL('./release-files/session-sharing-BlMqwMBH.js', import.meta.url), 'utf8');
const body = source.match(/function resolveSessionSharingTarget\(params\) \{[\s\S]*?\n\}(?=\nfunction sharingIdentity)/)?.[0]; assert(body?.includes('exactRead: "warm"'));
const utilsSource = fs.readFileSync(new URL('./release-files/session-utils-store-Dlphca2N.js', import.meta.url), 'utf8');
const s = fs.readFileSync('/proc/' + pid + '/status', 'utf8'); const uid = Number(s.match(/^Uid:\s+(\d+)/m)[1]), gid = Number(s.match(/^Gid:\s+(\d+)/m)[1]); assert(uid > 0 && gid > 0);
process.setgroups([]); process.setgid(gid); process.setuid(uid);
const sharing = await import(base + '/runtime/openclaw/dist/session-sharing-BlMqwMBH.js');
const native = await import(base + '/runtime/openclaw/dist/session-utils-store-Dlphca2N.js');
const entry = await import(base + '/runtime/openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js');
// Evaluate only the committed candidate utility module against the installed
// native dependencies. Do not write a candidate file into the live runtime.
assert.equal(typeof vm.SourceTextModule, 'function', 'Run with --experimental-vm-modules');
let exactReads = 0;
const imported = new Map();
const candidate = new vm.SourceTextModule(utilsSource, {identifier: 'candidate-session-utils-store'});
const linkNative = specifier => {
  if (specifier === './session-utils-store-Dlphca2N.js') return candidate;
  const id = new URL(specifier, pathToFileURL(base + '/runtime/openclaw/dist/')).href;
  if (!imported.has(id)) imported.set(id, (async () => {
    const namespace = await import(id); const names = Object.keys(namespace);
    return new vm.SyntheticModule(names, function() {
      for (const name of names) {
        const value = namespace[name];
        this.setExport(name, specifier === './session-accessor.sqlite-entry-BlklNPKQ.js' && ['l', 'u'].includes(name)
          ? (...args) => { exactReads++; return value(...args); } : value);
      }
    }, {identifier: id});
  })());
  return imported.get(id);
};
await candidate.link(linkNative);
await candidate.evaluate();
const candidateSharing = new vm.SourceTextModule(source, {identifier: 'candidate-session-sharing'});
await candidateSharing.link(linkNative); await candidateSharing.evaluate();
const exact = new Function('resolveGatewaySessionStoreTargetWithStore', 'resolveCanonicalSessionStoreMatchFromStoreKeys', 'return (' + body + ');')(candidate.namespace.f, candidate.namespace.c);
// Compare against an explicitly full-list version, even after candidate deployment.
const full = new Function('resolveGatewaySessionStoreTargetWithStore', 'resolveCanonicalSessionStoreMatchFromStoreKeys', 'return (' + body.replace('\n\t\t...params.exactRead ? { exactRead: "warm" } : {},', '') + ');')(native.f, native.c);
let compared = 0; const timings = [];
function compare(key, expectExact = true) {
  const params = {cfg, agentId: 'makaron', sessionKey: key, exactRead: true};
  const t = performance.now(), expected = full(params), a = performance.now(), beforeReads = exactReads, actual = exact(params), b = performance.now();
  assert(isDeepStrictEqual(actual, expected), 'Sharing resolution differed; no entry contents emitted');
  assert.equal(exactReads > beforeReads, expectExact, 'Exact/full reader selection differed');
  compared++; timings.push({fullMs: a - t, exactMs: b - a}); return actual;
}
// clone:false full-list reads use the native read view and do not open a
// writer. First prove the cold fallback, then open only our fixture's writer
// through the normal native mutation before asserting warm exact reads.
compare(keys[0], false);
const scope = {agentId: 'makaron', storePath: base + '/state/agents/makaron/agent/openclaw-agent.sqlite', sessionKey: 'agent:makaron:explicit:concurrency-fix-sharing-native-' + Date.now()};
let sessionId = randomUUID();
const initial = {sessionId, createdAt: Date.now(), updatedAt: Date.now(), status: 'done', visibility: 'draft', createdActor: {id: 'sharing-probe-owner', type: 'human', source: 'profile'}};
await entry.p(scope, () => initial, {fallbackEntry: initial, replaceEntry: true, skipMaintenance: true});
for (const key of keys) compare(key);
assert.equal(compare('agent:makaron:explicit:concurrency-fix-sharing-missing-' + randomUUID()), null);
const mutationParams = client => ({method: 'chat.send', requestParams: {sessionKey: scope.sessionKey, agentId: 'makaron'}, client, context: {getRuntimeConfig: () => cfg}});
const adminClient = {connect: {scopes: ['operator.admin']}};
const admission = candidateSharing.namespace.i(mutationParams(adminClient));
assert.equal(admission.error, null); assert(admission.authorization);
const beforeAdmissionReads = exactReads; admission.authorization.assertCurrent(); assert(exactReads > beforeAdmissionReads, 'Point authorization did not use exact reads');
const foreignClient = {connect: {scopes: ['operator.read']}, authenticatedUserProfile: {profileId: 'sharing-probe-foreign'}};
assert(candidateSharing.namespace.i(mutationParams(foreignClient)).error, 'Foreign actor unexpectedly authorized into draft');
for (const visibility of ['draft', 'shared', 'read-only', 'suggest']) {
  await entry.p(scope, () => ({visibility, updatedAt: Date.now()}), {skipMaintenance: true});
  const target = compare(scope.sessionKey); assert.equal(target.entry.visibility, visibility); assert.equal(target.entry.sessionId, sessionId);
  // Native owner/admin versus foreign private-session denial; policy unchanged.
  const ownerClient = {connect: {scopes: ['operator.read']}, authenticatedUserProfile: {profileId: 'sharing-probe-owner'}};
  assert.equal(sharing.j({cfg, client: ownerClient, target}), null);
  assert.equal(sharing.j({cfg, client: {connect: {scopes: ['operator.admin']}}, target}), null);
  if (visibility === 'draft') assert(sharing.j({cfg, client: {connect: {scopes: ['operator.read']}, authenticatedUserProfile: {profileId: 'sharing-probe-foreign'}}, target}), 'Foreign actor unexpectedly allowed into draft');
}
sessionId = randomUUID(); await entry.p(scope, () => ({sessionId, updatedAt: Date.now()}), {skipMaintenance: true});
assert.equal(compare(scope.sessionKey).entry.sessionId, sessionId);
assert.throws(() => admission.authorization.assertCurrent(), error => error.name === 'SessionMutationAuthorizationChangedError');
// Authorization inside a native write transaction retains the original full
// store/cache snapshot, which need not expose an uncommitted row change.
const nativeDb = await import(base + '/runtime/openclaw/dist/openclaw-agent-db-CUTe8BX6.js');
const nativeScope = await import(base + '/runtime/openclaw/dist/session-accessor.sqlite-scope-BwPKGcgm.js');
const nativeStore = await import(base + '/runtime/openclaw/dist/session-accessor.sqlite-entry-store-VfW3gyuj.js');
const beforeRollback = entry.f({...scope, hydrateSkillPromptRefs: false});
const rollback = new Error('dedicated sharing probe rollback');
assert.throws(() => nativeDb.y(database => {
  nativeStore.y(database, scope.sessionKey, {...beforeRollback, label: 'uncommitted-sharing-probe', visibility: 'draft', updatedAt: Date.now()});
  assert.equal(nativeStore.l(database, scope.sessionKey)?.entry.label, 'uncommitted-sharing-probe');
  compare(scope.sessionKey, false);
  throw rollback;
}, nativeScope.m(nativeScope.c(scope))), error => error === rollback);
const afterRollback = entry.f({...scope, hydrateSkillPromptRefs: false});
assert(isDeepStrictEqual(afterRollback, beforeRollback), 'Native rollback did not preserve the original probe record');
compare(scope.sessionKey);
const warm = timings.slice(1); const median = values => values.sort((a,b) => a-b)[Math.floor(values.length / 2)];
console.log(JSON.stringify({event: 'native-sharing-lookup-passed', compared, fullDatabase: true, missingPreserved: true, visibilityChangesPreserved: true, ownerAndAdminAllowed: true, foreignDraftDenied: true, rolloverPreserved: true, actualMutationAuthorizationPreserved: true, staleAuthorizationRejected: true, nativeWriterSnapshotPreserved: true, rollbackPreserved: true, exactReads, sessionKey: scope.sessionKey, fullWarmMedianMs: median(warm.map(t => t.fullMs)), exactWarmMedianMs: median(warm.map(t => t.exactMs))}));
