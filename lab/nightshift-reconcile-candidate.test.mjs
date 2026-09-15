import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import test from 'node:test';
const runtime=process.env.VLAB_CANDIDATE_RUNTIME, shared=process.env.VLAB_SHARED_STATE_DIR;
assert(runtime&&shared);
const dist=runtime+'/openclaw/dist',beforeDist=path.dirname(shared)+'/runtime/openclaw/dist';
const source=fs.readFileSync(dist+'/extensions/workboard/index.js','utf8');
const actual=await import(dist+'/runtime-api-1CCazqtv.js');
const part=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};
const read=vm.runInNewContext(part('function normalizeSession(', 'function createWorkboardLifecycleService(')+'\nreadWorkboardLifecycleSessions',{
 isRecord:x=>x!==null&&typeof x==='object'&&!Array.isArray(x),
 cardSessionKey:actual.c,workboardCardSessionLookupKey:actual.a,WORKBOARD_SESSION_SWEEP_LIMIT:10000,
});
const clone=x=>JSON.parse(JSON.stringify(x));
test('native lifecycle requests only linked identities, including every legacy agent fallback',async()=>{
 const requests=[];
 const gateway={isAvailable:async()=>true,request:async(method,params)=>{requests.push({method,params});if(method==='agents.list')return{selectionRequired:true,agents:[{id:'makaron'},{id:'v-codex'}]};return{sessions:params.sessionKeys.map(key=>({key,status:'done',hasActiveRun:false,updatedAt:123}))};}};
 const cards=[{id:'one',agentId:'makaron',sessionKey:'agent:makaron:subagent:workboard-one'}, {id:'legacy',sessionKey:'subagent:workboard-legacy'}, {id:'archived',sessionKey:'agent:makaron:main',metadata:{archivedAt:1}}];
 const r=await read(gateway,{cards});
 const keys=requests.filter(r=>r.method==='sessions.list').flatMap(r=>r.params.sessionKeys);
 assert(keys.includes('agent:makaron:subagent:workboard-one'));
 assert(keys.includes('agent:makaron:subagent:workboard-legacy'));
 assert(keys.includes('agent:v-codex:subagent:workboard-legacy'));
 assert(!keys.includes('agent:makaron:main'));assert(r.complete);
 assert(requests.every(r=>r.method!=='sessions.list'||Array.isArray(r.params.sessionKeys)));
});
test('empty scopes perform no list; large scopes batch and preserve prepared-launch completeness',async()=>{
 let requests=[];const gateway={isAvailable:async()=>true,request:async(m,p)=>{requests.push({m,p});return{sessions:[]};}};
 assert.deepEqual(clone(await read(gateway,{cards:[]})),{sessions:[],complete:true});assert.equal(requests.length,0);
 const cards=Array.from({length:600},(_,i)=>({id:String(i),agentId:'makaron',sessionKey:'agent:makaron:subagent:workboard-'+i}));
 assert((await read(gateway,{cards})).complete);assert.deepEqual(requests.map(r=>r.p.sessionKeys.length),[256,256,88]);
 gateway.request=async()=>({sessions:Array.from({length:10000},(_,i)=>({key:'agent:makaron:subagent:workboard-'+i}))});
 assert.equal((await read(gateway,{cards:cards.slice(0,1)})).complete,false);
 gateway.request=async()=>{throw Error('unavailable');};await assert.rejects(read(gateway,{cards:cards.slice(0,1)}),/unavailable/);
 gateway.isAvailable=async()=>false;assert.equal((await read(gateway,{cards})).complete,false);
});
test('unknown ownership remains gated and a failed batch cannot prove session absence',async()=>{
 let last;const gateway={isAvailable:async()=>true,request:async(m,p)=>m==='agents.list'?{selectionRequired:true,agents:[]}:(last=p,{sessions:[]})};
 await read(gateway,{cards:[{id:'unknown',sessionKey:'unknown'}],includeUnknown:true});assert.equal(last.includeUnknown,false);
 gateway.request=async(m,p)=>m==='agents.list'?{selectionRequired:false,agents:[]}:(last=p,{sessions:[]});
 await read(gateway,{cards:[{id:'unknown',sessionKey:'unknown'}],includeUnknown:true});assert.equal(last.includeUnknown,true);
 gateway.request=async()=>({sessions:null});await assert.rejects(read(gateway,{cards:[{id:'x',agentId:'makaron',sessionKey:'agent:makaron:main'}]}),/invalid lifecycle/);
});
test('real native protocol accepts bounded exact keys and rejects oversized or invalid scopes',async()=>{
 const schemas=await import(dist+'/src-B9mb84px.js');const schema=Object.values(schemas).find(s=>s?.properties?.configuredAgentsOnly&&s?.properties?.sessionKeys);assert(schema);
 const require=createRequire(runtime+'/openclaw/package.json');const value=await import(require.resolve('typebox/value'));const check=value.Check??value.default?.Check;assert.equal(typeof check,'function');
 assert(check(schema,{sessionKeys:[]}));assert(check(schema,{sessionKeys:['agent:makaron:main'],configuredAgentsOnly:true}));
 assert(!check(schema,{sessionKeys:['']}));assert(!check(schema,{sessionKeys:Array(513).fill('agent:makaron:main')}));assert(!check(schema,{sessionKeys:'agent:makaron:main'}));
});
test('scoped native filtering preserves historical visibility, ordering and pagination with zero writes',async()=>{
 const {t:open}=await import(dist+'/node-sqlite-CL-d6drd.js');const {i:getDb}=await import(dist+'/session-accessor.sqlite-scope-BwPKGcgm.js');
 const {n:query}=await import(dist+'/kysely-sync-DKYGT267.js');const {A:metadata,E:parse}=await import(dist+'/session-accessor.sqlite-transcript-state-Cz9g7S9v.js');
 const before=await import(beforeDist+'/session-utils-list-BUP03AzS.js'),after=await import(dist+'/session-utils-list-BUP03AzS.js');
 const db=open(shared+'/agents/makaron/agent/openclaw-agent.sqlite',{readOnly:true}),database={db,agentId:'makaron'};db.exec('PRAGMA query_only=ON; BEGIN DEFERRED');
 try{
  const changes=db.prepare('SELECT total_changes() AS n').get().n;
  const rows=query(db,getDb(db).selectFrom('session_nodes').select(['session_key',metadata])).rows;
  const store=Object.fromEntries(rows.flatMap(r=>{const entry=parse(r);return entry?[[r.session_key,entry]]:[]}));
  const cfg=JSON.parse(fs.readFileSync(shared+'/shared-vlab-20260909-v3/openclaw.json'));
  const params={cfg,store,opts:{limit:10000,configuredAgentsOnly:true,includeGlobal:false,includeUnknown:false},now:Date.now()};
  const full=before.t(params);assert(full.length>100);
  assert.deepEqual(after.t(params),full,'omitted scope preserves the full native result');
  const keys=full.slice(-30).map(([key])=>key),set=new Set(keys);
  for(const archived of [false,true,'all']){
   const p={...params,opts:{...params.opts,archived}};
   const expected=before.t(p).filter(([key])=>set.has(key));
   assert.deepEqual(after.t({...p,opts:{...p.opts,sessionKeys:[...keys,'agent:makaron:missing']}}),expected);
   assert.deepEqual(after.t({...p,opts:{...p.opts,sessionKeys:keys,limit:2,offset:1}}),expected.slice(1,3));
  }
  assert.deepEqual(after.t({...params,opts:{...params.opts,sessionKeys:[]}}),[]);
  const restricted={...params,entryFilter:key=>key!==keys[0]};
  assert.deepEqual(after.t({...restricted,opts:{...params.opts,sessionKeys:keys}}),before.t(restricted).filter(([key])=>set.has(key)));
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);
  console.log(JSON.stringify({event:'native-scoped-lifecycle-history',historyRows:rows.length,visibleRows:full.length,selectedKeys:keys.length,sharedDatabaseWrites:0}));
 }finally{db.exec('ROLLBACK');db.close();}
});
