import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {Worker} from 'node:worker_threads';
import {isDeepStrictEqual} from 'node:util';

const data=process.env.VLAB_CANDIDATE_DATA,state=process.env.OPENCLAW_STATE_DIR;
assert(data&&state.startsWith(data+'/'));
console.log(execFileSync('python3',[new URL('./session-sharing-bounded-snapshot.py',import.meta.url).pathname],{encoding:'utf8',timeout:95000}));
const snapshot=JSON.parse(fs.readFileSync(path.join(data,'sharing-snapshot.json')));
const dist=path.join(process.env.VLAB_CANDIDATE_RUNTIME,'openclaw/dist');
const cfg=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
cfg.session={...cfg.session,maintenance:{...cfg.session?.maintenance,mode:'warn'}};
fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH,JSON.stringify(cfg));
const file=path.join(state,'agents/makaron/agent/openclaw-agent.sqlite');
const beforeSource=fs.readFileSync(new URL('../release-files/exactread-vlab-parity/session-sharing-BlMqwMBH.js',import.meta.url),'utf8');
const afterSource=fs.readFileSync(new URL('../release-files/session-sharing-BlMqwMBH.js',import.meta.url),'utf8');
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
assert.equal(digest(beforeSource),'615cd9d6b87f11be7453c5c1fe46c75a6b1c7b9eebe97eceedc87ba2dd58f0bf');
assert.equal(digest(afterSource),'23202d57d2de0840847faaa8d19ae94d98a8b529fcee14a8607c30315bc0af89');
// These policy functions must remain exactly the same, not replaced by a fixture.
for(const name of ['resolveSessionSharingRole','authorizeSessionSharingTarget','createSessionListEntryFilter','prepareSessionSharing']) {
 const body=s=>s.match(new RegExp('function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}'))?.[0];
 assert(body(beforeSource)&&body(beforeSource)===body(afterSource),name+' policy unchanged');
}
let activeStats;
const realPrepare=DatabaseSync.prototype.prepare;
DatabaseSync.prototype.prepare=function(sql){
 const statement=realPrepare.call(this,sql);
 const table=/\bfrom\s+["`\[]?session_nodes\b/i.test(sql)?'sessionNodes':/session_participants/i.test(sql)?'participants':/session_members/i.test(sql)?'members':'other';
 for(const method of ['get','all','iterate']) {
  const original=statement[method].bind(statement);
  if(method==='iterate') statement.iterate=function*(...args){if(activeStats){activeStats.sqlReads++;activeStats[table+'Queries']++;}for(const row of original(...args)){if(activeStats&&table==='sessionNodes')activeStats.nodeRows++;yield row;}};
  else statement[method]=(...args)=>{if(activeStats){activeStats.sqlReads++;activeStats[table+'Queries']++;}const value=original(...args);if(activeStats&&table==='sessionNodes')activeStats.nodeRows+=Array.isArray(value)?value.length:value===undefined?0:1;return value;};
 }
 return statement;
};
const moduleCache=new Map();let utils;
async function nativeLink(specifier){
 if(specifier==='./session-utils-store-Dlphca2N.js'&&utils)return utils;
 const url=new URL(specifier,pathToFileURL(dist+'/')).href;
 if(!moduleCache.has(url)) moduleCache.set(url,(async()=>{
  const ns=await import(url),names=Object.keys(ns);
  return new vm.SyntheticModule(names,function(){for(const name of names){let value=ns[name];
   const label=specifier==='./session-accessor.sqlite-entry-BlklNPKQ.js'?({l:'pointReads',u:'pointReads',a:'bulkReads',loadExactSessionEntriesReadOnly:'boundedReads'})[name]:specifier==='./session-accessor.entry-B8arwR7t.js'&&name==='t'?'bulkReads':undefined;
   if(label){const real=value;value=(...args)=>{if(activeStats)activeStats[label]++;return real(...args);};}
   this.setExport(name,value);
  }},{identifier:url});
 })());
 return moduleCache.get(url);
}
utils=new vm.SourceTextModule(fs.readFileSync(path.join(dist,'session-utils-store-Dlphca2N.js'),'utf8'),{identifier:pathToFileURL(path.join(dist,'sharing-ab-utils.mjs')).href});
await utils.link(nativeLink);await utils.evaluate();
async function loadSharing(source,label){const module=new vm.SourceTextModule(source,{identifier:pathToFileURL(path.join(dist,'sharing-ab-'+label+'.mjs')).href});await module.link(nativeLink);await module.evaluate();return module.namespace;}
const old=await loadSharing(beforeSource,'before'),fixed=await loadSharing(afterSource,'after');
const combined=await import(pathToFileURL(path.join(dist,'combined-store-gateway-BwDhjbIt.js')));
const entry=await import(pathToFileURL(path.join(dist,'session-accessor.sqlite-entry-BlklNPKQ.js')));
const dbApi=await import(pathToFileURL(path.join(dist,'openclaw-agent-db-CUTe8BX6.js')));
const cacheApi=await import(pathToFileURL(path.join(dist,'session-accessor.sqlite-transcript-state-Cz9g7S9v.js')));
const profiles=await import(pathToFileURL(path.join(dist,'user-profiles-ftXkbNlK.js')));
const members=await import(pathToFileURL(path.join(dist,'sessions-eI69vxPt.js')));
const creator=await import(pathToFileURL(path.join(dist,'session-entry-provenance-Ch9ZRplR.js')));

const database=dbApi.g({agentId:'makaron',path:file});
const external=new DatabaseSync(file);external.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
const scope={agentId:'makaron',storePath:file};
const realEntries=entry.a({...scope,projection:'list',clone:false});assert(realEntries.length>=2000,'Representative store must retain all 2000 requested real sessions');
const owners=[...new Set(realEntries.map(x=>creator.a(x.entry.createdActor)).filter(Boolean))];
const entriesByKey=new Map(realEntries.map(x=>[x.sessionKey,x.entry]));
const keys=realEntries.map(x=>x.sessionKey).filter(k=>!k.includes(':incognito-')).sort((a,b)=>{
 const x=entriesByKey.get(a)?.updatedAt??0,y=entriesByKey.get(b)?.updatedAt??0;return y-x||a.localeCompare(b);
});
const clients=[['admin',{connect:{scopes:['operator.admin']}}],['real-owner',{connect:{scopes:['operator.read']},authenticatedUserProfile:{profileId:owners[0]??'sharing-ab-no-owner'}}],['foreign',{connect:{scopes:['operator.read']},authenticatedUserProfile:{profileId:'sharing-ab-foreign'}}]];
function batch(sharing,selected,client,bounded=false){
 const targetDiscoveryCache=utils.namespace.u({cfg,targets:[{agentId:'makaron',storePath:file}],agentIds:['makaron']});
 const storeCache=bounded?utils.namespace.createGatewaySessionStoreBatchCache({cfg,targetDiscoveryCache,targets:selected.map(sessionKey=>({sessionKey,agentId:'makaron'}))}):new Map();
 const targets=selected.map(sessionKey=>sharing.R({cfg,sessionKey,agentId:'makaron',storeCache,targetDiscoveryCache}));
 const id=client.authenticatedUserProfile?.profileId;
 const found=targets.filter(Boolean);let membershipKeys=new Set();
 if(id&&found.length)membershipKeys=members.u({agentId:'makaron',storePath:file,sessionKey:found[0].storeKey},found.map(x=>x.storeKey),id);
 const prepared=sharing.r({cfg,client});
 const rows=targets.map(target=>!target?null:({key:target.canonicalKey,storeKey:target.storeKey,sessionId:target.entry.sessionId,visibility:sharing.z(target.entry),role:prepared.roleForTarget(target,membershipKeys.has(target.storeKey)),visible:prepared.entryFilter?.(target.storeKey,target.entry)??true,authorization:sharing.j({cfg,client,target,isMember:membershipKeys.has(target.storeKey)})}));
 return {targets,rows};
}
function measure(sharing,selected,client,temperature,bounded=false){
 let preludeMs=0;
 if(temperature.startsWith('list-prelude')){cacheApi.S(database);const at=performance.now();const loaded=combined.n(cfg,{agentId:'makaron',configuredAgentsOnly:true,projection:'list'});preludeMs=performance.now()-at;assert(Object.keys(loaded.store).length>=realEntries.length*.98);
  if(temperature==='list-prelude-external-commit'){const version=database.db.prepare('PRAGMA data_version').get().data_version;assert.equal(database.db.isTransaction,false);external.prepare('UPDATE schema_meta SET updated_at=updated_at+1 WHERE meta_key=(SELECT meta_key FROM schema_meta ORDER BY meta_key LIMIT 1)').run();assert(database.db.prepare('PRAGMA data_version').get().data_version>version,'real independent connection commit must invalidate metadata cache');}
 }
 else if(temperature==='cold-metadata')cacheApi.S(database);else entry.a({...scope,projection:'list',clone:false});
 activeStats={pointReads:0,bulkReads:0,boundedReads:0,sqlReads:0,sessionNodesQueries:0,participantsQueries:0,membersQueries:0,otherQueries:0,nodeRows:0};
 const start=performance.now();const result=batch(sharing,selected,client,bounded);const ms=performance.now()-start;const counts=activeStats;activeStats=undefined;
 assert(result.targets.filter(Boolean).length===selected.length,'Refuse empty/failed lookup as an equality pass');
 return {result,ms,counts,preludeMs};
}
const results=[];
for(const count of [...new Set([25,100,500,Math.min(2000,keys.length)])])for(const temperature of ['warm-metadata','cold-metadata','list-prelude','list-prelude-external-commit'])for(let repeat=0;repeat<2;repeat++){
 const selected=keys.slice(0,count),client=clients[0][1],arms={};
 const order=repeat===0?['live','bulk-dev','bounded']:['bounded','bulk-dev','live'];
 for(const arm of order)arms[arm]=measure(arm==='bulk-dev'?fixed:old,selected,client,temperature,arm==='bounded');
 assert(isDeepStrictEqual(arms.live.result,arms['bulk-dev'].result),'Native sharing live/dev results changed');
 assert(isDeepStrictEqual(arms.live.result,arms.bounded.result),'Native bounded target or permission projection changed');
 assert.equal(arms.bounded.counts.pointReads,0,'Bounded page must not fall through to per-row reads');
 assert.equal(arms.bounded.counts.bulkReads,0,'Bounded page must not materialize full store');
 assert(arms.bounded.counts.boundedReads>0);
 assert(arms.bounded.counts.nodeRows<=selected.length,'Unrelated node rows were materialized');
 results.push({rows:selected.length,temperature,repeat,arms:Object.fromEntries(Object.entries(arms).map(([name,arm])=>[name,{ms:Math.round(arm.ms*100)/100,counts:arm.counts,preludeMs:arm.preludeMs}])),resultSha256:digest(arms.live.result)});
}
console.log(JSON.stringify({kind:'sharing-ab-performance-complete',actualEntryRows:realEntries.length,actualCreatorIdentities:owners.length,results}));
let permissionComparisons=0;
const boundedBatch=(sharing,selected,client)=>batch(sharing,selected,client,true);
for(const [,client] of clients){const before=batch(old,keys.slice(0,500),client),after=boundedBatch(old,keys.slice(0,500),client);assert(isDeepStrictEqual(before,after));permissionComparisons+=before.rows.length;}
// Actual native writes affect one copied real row only; no shared data changes.
const ownerProfile=await profiles.n('sharing-ab-owner@candidate.invalid');
const aliasProfile=await profiles.n('sharing-ab-alias@candidate.invalid');
await profiles.o('sharing-ab-alias@candidate.invalid',ownerProfile.id);
assert(profiles.h(aliasProfile.id).has(ownerProfile.id));
const fixtureOwnerId=ownerProfile.id;
const key='agent:makaron:explicit:sharing-ab-policy-'+randomUUID(),fixtureScope={...scope,sessionKey:key};
const initial={sessionId:randomUUID(),createdAt:Date.now(),updatedAt:Date.now(),createdVia:'operator',createdActor:{type:'human',id:fixtureOwnerId,source:'profile'},status:'done',visibility:'shared'};
await entry.p(fixtureScope,()=>initial,{fallbackEntry:initial,replaceEntry:true,skipMaintenance:true});
const ownerClient={connect:{scopes:['operator.read']},authenticatedUserProfile:{profileId:fixtureOwnerId}};
const foreignClient=clients[2][1];
const aliasClient={connect:{scopes:['operator.read']},authenticatedUserProfile:{profileId:aliasProfile.id}};
const memberClient={connect:{scopes:['operator.read']},authenticatedUserProfile:{profileId:'sharing-ab-member'}};
database.db.prepare('INSERT INTO session_members(session_key,identity_id,added_by,added_at) VALUES(?,?,?,?)').run(key,'sharing-ab-member',fixtureOwnerId,Date.now());
for(const visibility of ['shared','draft','read-only','suggest']){
 await entry.p(fixtureScope,()=>({visibility,updatedAt:Date.now()}),{skipMaintenance:true});
 await Promise.resolve();
 for(const client of [clients[0][1],ownerClient,aliasClient,memberClient,foreignClient]){
  const a=batch(old,[key],client),b=boundedBatch(old,[key],client);assert(isDeepStrictEqual(a,b));permissionComparisons++;
  if(visibility==='draft'&&client===foreignClient)assert.equal(b.rows[0].visible,false);
  if(client===ownerClient||client===aliasClient)assert.equal(b.rows[0].role,'owner');
 }
}
await entry.p(fixtureScope,()=>({visibility:'read-only',updatedAt:Date.now()}),{skipMaintenance:true});
assert.equal(boundedBatch(old,[key],memberClient).rows[0].role,'member');
database.db.prepare('DELETE FROM session_members WHERE session_key=? AND identity_id=?').run(key,'sharing-ab-member');
await Promise.resolve();
for(const sharing of [old,fixed]){const row=batch(sharing,[key],memberClient,sharing===fixed).rows[0];assert.equal(row.role,'viewer');assert(row.authorization);permissionComparisons++;}
const authorization=sharing=>sharing.i({method:'chat.send',requestParams:{sessionKey:key,agentId:'makaron'},client:clients[0][1],context:{getRuntimeConfig:()=>cfg}});
const oldProof=authorization(old),newProof=authorization(fixed);assert.equal(oldProof.error,null);assert.equal(newProof.error,null);assert(oldProof.authorization&&newProof.authorization);
oldProof.authorization.assertCurrent();newProof.authorization.assertCurrent();
await entry.p(fixtureScope,()=>({sessionId:randomUUID(),updatedAt:Date.now()}),{skipMaintenance:true});
await Promise.resolve();
assert.throws(()=>oldProof.authorization.assertCurrent(),e=>e.name==='SessionMutationAuthorizationChangedError');
assert.throws(()=>newProof.authorization.assertCurrent(),e=>e.name==='SessionMutationAuthorizationChangedError');
const missing='agent:makaron:explicit:sharing-ab-missing-'+randomUUID();assert.equal(batch(old,[missing],clients[0][1]).targets[0],null);assert.equal(boundedBatch(old,[missing],clients[0][1]).targets[0],null);
// One corrupt requested row must not hide a valid sibling in the live exact mode.
const savedJson=database.db.prepare('SELECT entry_json FROM session_nodes WHERE session_key=?').get(key).entry_json;
try {
 database.db.prepare('UPDATE session_nodes SET entry_json=? WHERE session_key=?').run(JSON.stringify({sessionId:42}),key);
 cacheApi.S(database);
 const selected=[keys[0],key],expected=batch(old,selected,clients[0][1]),actual=boundedBatch(old,selected,clients[0][1]);
 assert(expected.targets[0]&&expected.targets[1]===null,'Native corrupt-row fixture must exercise degradation');
 assert(isDeepStrictEqual(actual,expected),'Failed batch hid a valid sibling');
} finally {
 database.db.prepare('UPDATE session_nodes SET entry_json=? WHERE session_key=?').run(savedJson,key);
 cacheApi.S(database);
}
// A real independent SQLite writer keeps committing during synchronous page reads.
// A native-created private session outside the selected page is updated, keeping
// normalized updated_at and its JSON in agreement. No production data is written.
const churnKey='agent:makaron:explicit:bounded-churn-'+randomUUID();
const churnInitial={sessionId:randomUUID(),createdAt:Date.now(),updatedAt:Date.now(),status:'done',visibility:'shared'};
await entry.p({...scope,sessionKey:churnKey},()=>churnInitial,{fallbackEntry:churnInitial,replaceEntry:true,skipMaintenance:true});
const churn=[];
for(const count of [25,500,Math.min(2000,keys.length)])for(const arm of ['live','bulk-dev','bounded']){
 const shared=new SharedArrayBuffer(6*4),control=new Int32Array(shared);
 const worker=new Worker(`
  const {workerData}=require('node:worker_threads');
  const {DatabaseSync}=require('node:sqlite');
  const control=new Int32Array(workerData.shared),db=new DatabaseSync(workerData.file);
  db.exec('PRAGMA busy_timeout=5000');
  const statement=db.prepare("UPDATE session_nodes SET updated_at=?, entry_json=json_set(entry_json, '$.updatedAt', ?) WHERE session_key=?");
  Atomics.store(control,0,1);Atomics.notify(control,0);
  try {while(!Atomics.load(control,1)){const at=Date.now();statement.run(at,at,workerData.sessionKey);Atomics.add(control,2,1);Atomics.wait(control,1,0,5);}}
  catch {Atomics.store(control,3,1);}
  db.close();Atomics.store(control,4,1);Atomics.notify(control,4);
 `,{eval:true,workerData:{file,shared,sessionKey:churnKey}});
 if(!Atomics.load(control,0))Atomics.wait(control,0,0,10000);
 assert.equal(Atomics.load(control,0),1);
 const started=performance.now(),selected=keys.slice(0,count),expected=batch(old,selected,clients[0][1]);
 const spans=[],beforeVersion=database.db.prepare('PRAGMA data_version').get().data_version;
 for(let round=0;round<6;round++){
  // Real prelude + a committed inter-stage write, then continuous writes as we read.
  cacheApi.S(database);combined.n(cfg,{agentId:'makaron',configuredAgentsOnly:true,projection:'list'});
  const committed=Atomics.load(control,2),commitDeadline=performance.now()+10000;
  while(Atomics.load(control,2)===committed){assert(performance.now()<commitDeadline,'Independent writer stopped committing');assert.equal(Atomics.load(control,3),0);Atomics.wait(control,1,0,2);}
  const at=performance.now(),actual=batch(arm==='bulk-dev'?fixed:old,selected,clients[0][1],arm==='bounded');
  spans.push(performance.now()-at);assert(isDeepStrictEqual(actual,expected));
 }
 const changedVersion=database.db.prepare('PRAGMA data_version').get().data_version;
 Atomics.store(control,1,1);Atomics.notify(control,1);
 if(!Atomics.load(control,4))Atomics.wait(control,4,0,10000);
 assert.equal(Atomics.load(control,4),1);assert.equal(Atomics.load(control,3),0);
 assert(Atomics.load(control,2)>0&&changedVersion>beforeVersion);
 await new Promise((resolve,reject)=>{worker.once('error',reject);worker.once('exit',code=>code===0?resolve():reject(new Error('writer failed')));});
 const elapsedMs=performance.now()-started;
 churn.push({rows:count,arm,sharingMs:spans,elapsedMs,commits:Atomics.load(control,2),commitsPerSecond:Atomics.load(control,2)*1000/elapsedMs,realDataVersionChanged:true});
}
const report={kind:'native-session-sharing-bounded-ab',sourceCommit:'bounded-reads-candidate',beforeSha256:digest(beforeSource),afterSha256:digest(afterSource),snapshot,actualEntryRows:realEntries.length,actualCreatorIdentities:owners.length,results,churn,permissionComparisons,allNativeTargetsAndPermissionResultsEqual:true,revocationAfterAwaitObserved:true,aliasOwnerObserved:true,membershipRevocationAfterAwaitObserved:true,syntheticPermissionFixture:{nativeProfilesCreated:2,nativeAliasMerge:true,memberGrantAndRevocation:true},rolloverInvalidatesBothProofs:true,missingPreserved:true,failedBatchPreservesValidSibling:true,scope:'synchronous sessions.list sharing-target and policy phase; not full RPC, model or channel timing',modelCalls:0,sharedWrites:0};
fs.writeFileSync(path.join(data,'session-sharing-bounded-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
external.close();
DatabaseSync.prototype.prepare=realPrepare;
process.exit(0);
