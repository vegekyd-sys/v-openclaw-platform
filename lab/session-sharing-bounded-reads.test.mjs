import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {patchState, patchEntry, patchUtils, patchRead, MARKER} from './patch-session-sharing-bounded-reads.mjs';

const read = name => fs.readFileSync(new URL(`./release-files/session-sharing-bounded-reads/${name}`, import.meta.url), 'utf8');
const fn = (source, name) => {
  const body = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
  assert(body, name); return body;
};
const state = read('session-accessor.sqlite-transcript-state-Cz9g7S9v.js');
const entry = read('session-accessor.sqlite-entry-BlklNPKQ.js');
const utils = read('session-utils-store-Dlphca2N.js');
const rpc = read('sessions-read-C6mAMxyQ.js');
const plan = JSON.parse(fs.readFileSync(new URL('./session-sharing-bounded-reads-plan.json', import.meta.url)));

test('four release chunks contain only the reviewed mechanical changes', () => {
  let beforeState = state.replace(`// ${MARKER}: inspect a valid full-store snapshot without rebuilding it.\n` + fn(state, 'readSessionEntryCacheIfCurrent') + '\n', '').replace('\nexport { readSessionEntryCacheIfCurrent, projectSqliteSessionParticipantsBatch };\n', '');
  let beforeEntry = entry.replace('import { E as parseSessionEntryJson, readSessionEntryCacheIfCurrent, projectSqliteSessionParticipantsBatch } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";\n', '').replace(`// ${MARKER}: one native scope and bounded SQL chunks, no full-store fill.\n` + fn(entry, 'loadExactSessionEntriesReadOnly') + '\n', '').replace('\nexport { loadExactSessionEntriesReadOnly };\n', '');
  let beforeUtils = utils.replace('import { loadExactSessionEntriesReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n', '').replace(`// ${MARKER}: prepare once, consume synchronously; never retain across awaits.\n` + fn(utils, 'createGatewaySessionStoreBatchCache') + '\n', '').replace('\nexport { createGatewaySessionStoreBatchCache };\n', '');
  const keyHelper = utils.match(/function gatewaySessionLookupCacheKey[^\n]+/)[0];
  const cacheKey = keyHelper.match(/return (.*); \}/)?.[1];
  // The one-line key helper has no following closing-line anchor.
  assert(cacheKey);
  beforeUtils = beforeUtils.replace(keyHelper + '\n', '').replace('const cacheKey = cache ? gatewaySessionLookupCacheKey(storePath, clone, agentId, options) : "";', `const cacheKey = cache ? ${cacheKey} : "";`).replaceAll('(params.lookupStore ?? loadGatewaySessionLookupStore)(', 'loadGatewaySessionLookupStore(').replaceAll('\n\t\tlookupStore: params.lookupStore,', '');
  let beforeRpc = rpc.replace('import { createGatewaySessionStoreBatchCache } from "./session-utils-store-Dlphca2N.js";\n', '').replace(/\t{4}\/\/ session-sharing-bounded-reads-v1: read only[\s\S]*?\n\t{4}\}\);\n/, '').replace('await measureDiagnosticsTimelineSpan("gateway.sessions.list.sharing", () => {\n', 'await measureDiagnosticsTimelineSpan("gateway.sessions.list.sharing", () => {\n\t\t\t\tconst sharingStoreCache = /* @__PURE__ */ new Map();\n');
  for (const [source, baseline, patch, index] of [[state, beforeState, patchState, 0], [entry, beforeEntry, patchEntry, 1], [utils, beforeUtils, patchUtils, 2], [rpc, beforeRpc, patchRead, 3]]) {
    assert.equal(createHash('sha256').update(baseline).digest('hex'), plan.files[index].before);
    assert.equal(patch(baseline), source);
    assert.throws(() => patch(source));
  }
});

// Release chunks are whole-file replacements: every patch already on V must survive.
test('rebuilt chunks keep every patch marker present in the V bytes they replace', () => {
  for (const [source, markers] of [
    [entry, ['oc64-session-races-v2', 'subagent-lazy-session-store-v1']],
    [rpc, ['v-workboard-sweep-light-v1']],
  ]) for (const marker of markers) assert(source.includes(marker), marker);
  assert(rpc.includes('const lifecycleOnly = p.lifecycleOnly === true && !visibilityFilter;'));
  assert(rpc.includes('} : await measureDiagnosticsTimelineSpan("gateway.sessions.list.sharing", () => {'));
  assert(rpc.includes('const projectPlacement = lifecycleOnly ? () => ({}) : createSessionPlacementBatchProjector(context, result.sessions);'));
  assert(entry.includes('createSessionEntryLookupReadOnly as z'));
});

// V's current bytes for the two changed chunks are the shipped #404 and #418 release files.
test('rebuilding from the #404 and #418 release files reproduces the chunks exactly', () => {
  const shipped = (dir, name) => fs.readFileSync(new URL(`./release-files/${dir}/${name}`, import.meta.url), 'utf8');
  const entryV = shipped('subagent-lazy-store', 'session-accessor.sqlite-entry-BlklNPKQ.js');
  const readV = shipped('workboard-sweep-light', 'sessions-read-C6mAMxyQ.js');
  assert.equal(createHash('sha256').update(entryV).digest('hex'), plan.files[1].before);
  assert.equal(createHash('sha256').update(readV).digest('hex'), plan.files[3].before);
  assert.equal(patchEntry(entryV), entry);
  assert.equal(patchRead(readV), rpc);
});

test('native cache peek detects other-connection COMMIT and same-connection raw writes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharing-cache-'));
  const filename = path.join(dir, 'state.sqlite'), db = new DatabaseSync(filename), other = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE session_nodes(session_key TEXT PRIMARY KEY, value TEXT)');
    const names = ['readDataVersion', 'ensureSessionNodesGenerationTracker', 'readSessionNodesGeneration', 'readCacheValidityToken', 'cacheValidityTokensEqual', 'readSessionEntryCacheIfCurrent'];
    const native = new Function(`const sessionEntryCaches = new WeakMap(), sessionNodesGenerationTrackerSchemaVersions = new WeakMap();\n${names.map(name => fn(state, name)).join('\n')}\nreturn {peek:readSessionEntryCacheIfCurrent, token:readCacheValidityToken, caches:sessionEntryCaches};`)();
    const database = {db};
    assert.equal(native.peek(database), undefined);
    const refresh = () => {const cached = {entries: new Map(), keys: [], validityToken: native.token(db)}; native.caches.set(db, cached); return cached;};
    let cached = refresh(); assert.equal(native.peek(database), cached);
    other.exec("INSERT INTO session_nodes VALUES('other','1')");
    assert.equal(native.peek(database), undefined);
    cached = refresh(); assert.equal(native.peek(database), cached);
    db.exec("UPDATE session_nodes SET value='2'");
    assert.equal(native.peek(database), undefined);
    cached = refresh(); assert.equal(native.peek(database), cached);
    db.exec('BEGIN'); assert.equal(native.peek(database), undefined); db.exec('ROLLBACK');
    assert(native.peek(database));
  } finally {other.close(); db.close(); fs.rmSync(dir, {recursive:true, force:true});}
});

// This exercises the actual canonical routing/control flow and cache layout.
// Native parsing, real profiles and permissions are separately required by candidate AB.
function lookupHarness(stores, configured = ['a'], failBatch = false) {
  let rowsRead = 0, batches = 0;
  const names = ['findCanonicalStoreMatch', 'buildGatewaySessionStoreScanTargets', 'resolveGatewaySessionStoreCandidates', 'createGatewaySessionStoreDiscoveryCache', 'gatewaySessionLookupCacheKey', 'mayUseWarmExactSessionLookup', 'loadGatewaySessionLookupStore', 'loadGatewaySessionLookupStoreUncached', 'resolveGatewaySessionStoreLookup', 'createGatewaySessionStoreBatchCache', 'isAgentScopedSentinelSessionKey', 'resolveExplicitDeletedLegacyMainStoreTarget', 'resolveGatewaySessionStoreTargetWithStore'];
  const cacheKeyHelper = utils.match(/function gatewaySessionLookupCacheKey[^\n]+/)[0];
  const source = names.map(name => name === 'gatewaySessionLookupCacheKey' ? cacheKeyHelper : fn(utils, name)).join('\n');
  const deps = {
    normalizeOptionalString:v=>typeof v==='string'&&v.trim()?v.trim():undefined,
    normalizeAgentId:v=>v?.toLowerCase(), listAgentIds:()=>configured,
    parseAgentSessionKey:key=>key?.startsWith('agent:')?{agentId:key.split(':')[1]}:null,
    resolveAgentMainSessionKey:({agentId})=>`agent:${agentId}:main`,
    resolveSessionStorePathCore:(_cfg,{agentId})=>'/'+agentId,
    resolveExistingAgentSessionStoreTargetsSync:(_cfg,agentId)=>[...stores.keys()].filter(p=>p.startsWith('/'+agentId)).map(storePath=>({agentId,storePath})),
    isConfiguredSessionStoreAgentId:(_cfg,id)=>configured.includes(id),
    resolveSessionStoreKey:({sessionKey,storeAgentId})=>sessionKey.startsWith('agent:')||['global','unknown'].includes(sessionKey)?sessionKey:`agent:${storeAgentId??'a'}:${sessionKey}`,
    resolveStoredSessionKeyForAgentStore:({sessionKey})=>sessionKey,
    resolveSessionStoreAgentId:(_cfg,key)=>key.split(':')[1]??'a',
    isIncognitoSessionKey:key=>key.includes(':incognito:'), resolveIncognitoOpenClawAgentSqlitePath:({agentId})=>'/'+agentId+'/incognito',
    getOpenClawAgentDatabaseIfOpen:()=>({db:{isOpen:true,isTransaction:false}}), resolveSqliteScope:v=>v, toDatabaseOptions:v=>v,
    includeDirectChildEntries:target=>target, canonicalSessionKeyMigrationRequiredError:message=>new Error(message),
    loadExactSessionEntriesReadOnly:({storePath},keys)=>{batches++;if(failBatch)throw new Error('invalid persisted row');return keys.flatMap(sessionKey=>{const entry=stores.get(storePath)?.[sessionKey]; if(!entry)return [];rowsRead++;return [{sessionKey,entry}];});},
    loadExactSessionEntry:()=>assert.fail('writable exact read'),loadExactSessionEntryReadOnly:({storePath,sessionKey})=>{assert(failBatch,'unexpected cache miss');const entry=stores.get(storePath)?.[sessionKey];return entry?.broken?undefined:entry?{sessionKey,entry}:undefined;},
    listSessionEntriesReadOnly:()=>assert.fail('full-store read'),listSessionEntriesCore:()=>assert.fail('full-store read'),
  };
  const api = new Function(...Object.keys(deps),source+'\nreturn {prepare:createGatewaySessionStoreBatchCache, resolve:resolveGatewaySessionStoreTargetWithStore};')(...Object.values(deps));
  return {...api, counts:()=>({rowsRead,batches})};
}

test('page planning handles scoped aliases, missing rows and both live/dev cache modes', () => {
  const all = Object.fromEntries(Array.from({length:4200},(_,i)=>[`agent:a:k${i}`, {sessionId:`s${i}`}])) , cfg = {};
  const api = lookupHarness(new Map([['/a',all]]));
  const targets = [{sessionKey:'k7',agentId:'a'},{sessionKey:'agent:a:k19'},{sessionKey:'agent:a:missing'}];
  const cache = api.prepare({cfg,targets});
  assert.deepEqual(api.counts(),{rowsRead:2,batches:1});
  for(const exactRead of [undefined,'warm',true]) for(const target of targets) {
    const result = api.resolve({cfg,key:target.sessionKey,agentId:target.agentId,clone:false,projection:'list',exactRead,storeCache:cache});
    assert.equal(result.store[result.canonicalKey]?.sessionId, target.sessionKey.includes('missing')?undefined:target.sessionKey.includes('19')?'s19':'s7');
  }
  assert.deepEqual(api.counts(),{rowsRead:2,batches:1});
});

test('page batching preserves cross-store duplicate rejection and does not retain snapshots across calls', () => {
  const key='agent:a:k', stores=new Map([['/a',{[key]:{sessionId:'v1'}}],['/a/extra',{[key]:{sessionId:'v2'}}]]), cfg={};
  const api=lookupHarness(stores),targets=[{sessionKey:key}];
  let cache=api.prepare({cfg,targets});
  assert.throws(()=>api.resolve({cfg,key,clone:false,projection:'list',exactRead:'warm',storeCache:cache}),/duplicate rows/);
  stores.delete('/a/extra'); cache=api.prepare({cfg,targets});
  assert.equal(api.resolve({cfg,key,clone:false,projection:'list',storeCache:cache}).store[key].sessionId,'v1');
  stores.set('/a',{[key]:{sessionId:'v3'}}); cache=api.prepare({cfg,targets});
  assert.equal(api.resolve({cfg,key,clone:false,projection:'list',storeCache:cache}).store[key].sessionId,'v3');
});

test('failed native batch falls back to original per-target degradation instead of hiding valid siblings', () => {
  const good='agent:a:good',bad='agent:a:bad',cfg={};
  const api=lookupHarness(new Map([['/a',{[good]:{sessionId:'v1'},[bad]:{broken:true}}]]),['a'],true);
  const cache=api.prepare({cfg,targets:[{sessionKey:good},{sessionKey:bad}]});
  assert.equal(cache.size,0);
  for(const key of [good,bad]){
    const target=api.resolve({cfg,key,clone:false,projection:'list',exactRead:'warm',storeCache:cache});
    assert.equal(target.store[key]?.sessionId,key===good?'v1':undefined);
  }
});
