import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const source = fs.readFileSync(new URL('./release-files/session-sharing-BlMqwMBH.js', import.meta.url), 'utf8');
const body = source.match(/function resolveSessionSharingTarget\(params\) \{[\s\S]*?\n\}(?=\nfunction sharingIdentity)/)?.[0];
assert(body);
const make = (load, match) => new Function('resolveGatewaySessionStoreTargetWithStore', 'resolveCanonicalSessionStoreMatchFromStoreKeys', 'return (' + body + ');')(load, match);
test('artifact changes only exact-read mode at the native sharing lookup call', () => {
  let before = source.replace(body, body.replace('\n\t\t...params.exactRead ? { exactRead: "warm" } : {},', ''));
  for (const point of ['return { target: resolveSessionSharingTarget({\n\t\t\t\tcfg: getCfg(),', 'const current = resolveSessionSharingTarget({\n\t\t\t\t\tcfg: currentCfg,']) before = before.replace(point + '\n\t\t\t\texactRead: true,', point);
  const plan = JSON.parse(fs.readFileSync(new URL('./exact-sharing-lookup-plan.json', import.meta.url)));
  assert.equal(createHash('sha256').update(before).digest('hex'), plan.files[0].before);
});
test('native key resolution, list projection and per-authorization caches are preserved', () => {
  const params = {cfg: {}, agentId: 'a', sessionKey: 'alias', exactRead: true, storeCache: new Map(), targetDiscoveryCache: new Map()};
  const entry = {visibility: 'draft', createdActor: {id: 'owner'}, sessionId: 'v1'};
  const target = {agentId: 'a', canonicalKey: 'canonical', storeKeys: ['canonical', 'alias'], storePath: '/store', store: {canonical: entry}};
  const f = make(options => {
    assert.deepEqual(options, {cfg: params.cfg, key: 'alias', agentId: 'a', clone: false, projection: 'list', exactRead: 'warm', storeCache: params.storeCache, targetDiscoveryCache: params.targetDiscoveryCache});
    return target;
  }, (store, keys) => {assert.equal(store, target.store); assert.equal(keys, target.storeKeys); return {key: 'canonical', entry};});
  assert.deepEqual(f(params), {agentId: 'a', canonicalKey: 'canonical', entry, storeKey: 'canonical', storeKeys: target.storeKeys, storePath: '/store'});
});
test('bulk list/event sharing lookup does not opt into per-row exact reads', () => {
  make(options => {assert.equal(Object.hasOwn(options, 'exactRead'), false); return {store: {}, storeKeys: []};}, () => undefined)({cfg: {}, sessionKey: 'a', storeCache: new Map()});
});
test('absent target stays null and canonical/duplicate errors are not swallowed', () => {
  const target = {store: {}, storeKeys: ['a']};
  assert.equal(make(() => target, () => undefined)({sessionKey: 'a'}), null);
  const error = new Error('canonical duplicate');
  assert.throws(() => make(() => target, () => {throw error;})({sessionKey: 'a'}), e => e === error);
  assert.throws(() => make(() => {throw error;}, () => undefined)({sessionKey: 'a'}), e => e === error);
});
test('each revalidation reloads the target; no cross-await authorization cache added', () => {
  let calls = 0, version = 'v1';
  const f = make(() => {calls++; return {agentId: 'a', canonicalKey: 'k', storeKeys: ['k'], storePath: '/store', store: {k: {sessionId: version, visibility: 'draft'}}};}, store => ({key: 'k', entry: store.k}));
  assert.equal(f({sessionKey: 'k'}).entry.sessionId, 'v1'); version = 'v2';
  assert.equal(f({sessionKey: 'k'}).entry.sessionId, 'v2'); assert.equal(calls, 2);
});
const utils = fs.readFileSync(new URL('./release-files/session-utils-store-Dlphca2N.js', import.meta.url), 'utf8');
const helper = utils.match(/function mayUseWarmExactSessionLookup\([^\n]+\) \{[\s\S]*?\n\}/)?.[0];
const loader = utils.match(/function loadGatewaySessionLookupStore\([^\n]+\) \{[\s\S]*?\n\}(?=\nfunction loadGatewaySessionLookupStoreUncached)/)?.[0];
assert(helper && loader);
const makeLoader = (opened, load) => new Function('getOpenClawAgentDatabaseIfOpen', 'resolveSqliteScope', 'toDatabaseOptions', 'loadGatewaySessionLookupStoreUncached', helper + '\n' + loader + '\nreturn loadGatewaySessionLookupStore;')(opened, s => s, s => s, load);
test('utility artifact preserves all native validation and lookup code outside the warm-mode guard', () => {
  let before = utils.replace('import { u as getOpenClawAgentDatabaseIfOpen } from "./openclaw-agent-db-CUTe8BX6.js";\nimport { c as resolveSqliteScope, m as toDatabaseOptions } from "./session-accessor.sqlite-scope-BwPKGcgm.js";', 'import "./openclaw-agent-db-CUTe8BX6.js";')
    .replace(helper + '\n', '')
    .replace('\tif (options.warmExact && options.exactKeys && !mayUseWarmExactSessionLookup(storePath, agentId, options.exactKeys[0] ?? "")) options = {...options, exactKeys: void 0};\n', '');
  for (const keys of ['scanTargets', 'lookupSeeds', '[canonicalKey]']) before = before.replace(`{ exactKeys: ${keys}, warmExact: params.exactRead === "warm" }`, `{ exactKeys: ${keys} }`);
  const plan = JSON.parse(fs.readFileSync(new URL('./exact-sharing-lookup-plan.json', import.meta.url)));
  assert.equal(createHash('sha256').update(before).digest('hex'), plan.files[1].before);
});
for (const state of ['missing', 'closed', 'transaction', 'owner-error', 'warm']) test('warm exact selection: ' + state, () => {
  const options = {exactKeys: ['agent:a:explicit:k'], warmExact: true, projection: 'list'};
  const load = makeLoader(scope => {
    assert.deepEqual(scope, {storePath: '/store', agentId: 'a', sessionKey: 'agent:a:explicit:k'});
    if (state === 'owner-error') throw new Error('owner mismatch');
    return state === 'missing' ? undefined : {db: {isOpen: state !== 'closed', isTransaction: state === 'transaction'}};
  }, (_path, _clone, _agent, actual) => actual.exactKeys ? 'exact' : 'full');
  assert.equal(load('/store', false, 'a', options), state === 'warm' ? 'exact' : 'full');
  assert.deepEqual(options.exactKeys, ['agent:a:explicit:k'], 'Caller options must not be mutated');
});
test('transaction fallback reuses the original full-store cache and never the exact cache', () => {
  let transaction = false, reads = 0;
  const load = makeLoader(() => ({db: {isOpen: true, isTransaction: transaction}}), (_path, _clone, _agent, options) => ({reader: options.exactKeys ? 'exact' : 'full', call: ++reads}));
  const cache = new Map(), fullOptions = {cache, projection: 'list'}, exactOptions = {...fullOptions, warmExact: true, exactKeys: ['k']};
  const full = load('/store', false, 'a', fullOptions), exact = load('/store', false, 'a', exactOptions);
  assert.notEqual(exact, full); transaction = true;
  assert.equal(load('/store', false, 'a', exactOptions), full); assert.equal(reads, 2);
});
test('ordinary pre-existing exact reads never consult the new warm guard', () => {
  const load = makeLoader(() => assert.fail('New guard must be opt-in'), (_path, _clone, _agent, options) => options.exactKeys);
  assert.deepEqual(load('/store', false, 'a', {exactKeys: ['k']}), ['k']);
});
