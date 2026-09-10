import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const source = fs.readFileSync(new URL('./release-files/session-sharing-BlMqwMBH.js', import.meta.url), 'utf8');
const body = source.match(/function resolveSessionSharingTarget\(params\) \{[\s\S]*?\n\}(?=\nfunction sharingIdentity)/)?.[0];
assert(body);
const make = (load, match) => new Function('resolveGatewaySessionStoreTargetWithStore', 'resolveCanonicalSessionStoreMatchFromStoreKeys', 'return (' + body + ');')(load, match);
test('artifact changes only exactRead at the native sharing lookup call', () => {
  const before = source.replace(body, body.replace('\n\t\texactRead: true,', ''));
  const plan = JSON.parse(fs.readFileSync(new URL('./exact-sharing-lookup-plan.json', import.meta.url)));
  assert.equal(createHash('sha256').update(before).digest('hex'), plan.files[0].before);
});
test('native key resolution, list projection and per-authorization caches are preserved', () => {
  const params = {cfg: {}, agentId: 'a', sessionKey: 'alias', storeCache: new Map(), targetDiscoveryCache: new Map()};
  const entry = {visibility: 'draft', createdActor: {id: 'owner'}, sessionId: 'v1'};
  const target = {agentId: 'a', canonicalKey: 'canonical', storeKeys: ['canonical', 'alias'], storePath: '/store', store: {canonical: entry}};
  const f = make(options => {
    assert.deepEqual(options, {cfg: params.cfg, key: 'alias', agentId: 'a', clone: false, projection: 'list', exactRead: true, storeCache: params.storeCache, targetDiscoveryCache: params.targetDiscoveryCache});
    return target;
  }, (store, keys) => {assert.equal(store, target.store); assert.equal(keys, target.storeKeys); return {key: 'canonical', entry};});
  assert.deepEqual(f(params), {agentId: 'a', canonicalKey: 'canonical', entry, storeKey: 'canonical', storeKeys: target.storeKeys, storePath: '/store'});
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
