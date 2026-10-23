import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { patchSqlite, patchRuntime, patchPlugin } from './patch-workboard-lifecycle-bounded.mjs';

const read = name => fs.readFileSync(new URL(`./release-files/${name}`, import.meta.url), 'utf8');
const beforeSql = read('workboard-start-context/sqlite-store-CH-caj1l.js');
const beforeApi = read('workboard-start-context/runtime-api-1CCazqtv.js');
const beforePlugin = read('workboard-sweep-links/index.js');
const sql = read('workboard-lifecycle-bounded/sqlite-store-CH-caj1l.js');
const api = read('workboard-lifecycle-bounded/runtime-api-1CCazqtv.js');
const plugin = read('workboard-lifecycle-bounded/index.js');
const fn = (s, name) => {
  const match = s.match(new RegExp(`^(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`, 'm'));
  assert(match, name); return match[0];
};
const method = (s, name) => {
  const match = s.match(new RegExp(`\\tasync ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\t\\}`));
  assert(match, name); return match[0];
};
const helpers = ['cardSessionKey', 'cardRunId', 'latestStatusTransitionAt', 'shouldSkipPersistedLifecycleStatusUpdate',
  'shouldSyncWorkboardLifecycleStatus', 'preparedLaunchMatchesCard', 'acceptedLaunchForAssociation',
  'executionAssociationPatch', 'lifecycleExecution'];
const builder = new Function(`${helpers.map(n => fn(api, n)).join('\n')}\n${fn(api, 'buildWorkboardLifecyclePatch')}\nreturn buildWorkboardLifecyclePatch;`)();
const originalBuilder = new Function(`${helpers.map(n => fn(beforeApi, n)).join('\n')}\nreturn (card,input)=>{${method(beforeApi, 'syncLifecycle').split('(card) => {')[1].split('\n\t\t\t}, { allowAutomationLaunch: true }')[0]}\n};`)();
const project = new Function(`${['parseJson','stringValue','numberValue','requiredString','requiredNumber','readExecution','readCardLifecycleLink','readCardLifecycleState'].map(n => fn(sql,n)).join('\n')}\nreturn readCardLifecycleState;`)();
const nativeMethods = new Function('readCardLifecycleState', `const WORKBOARD_LIFECYCLE_STATE_COLUMNS = ${sql.match(/^const WORKBOARD_LIFECYCLE_STATE_COLUMNS = (.*);$/m)[1]}; return {${method(sql,'listLifecycleStates')},${method(sql,'lookupLifecycleState')}};`)(project);
const sync = new Function('buildWorkboardLifecyclePatch', `return {${method(api,'syncLifecycle')}}.syncLifecycle;`)(builder);

const row = (id, changes={}) => ({id,status:'running',position:1000,created_at:10,updated_at:20,started_at:10,
  agent_id:'a',session_key:'s',run_id:'r',execution_id:'e',execution_kind:'agent-session',execution_mode:'autonomous',
  execution_status:'running',execution_engine:null,execution_model:null,execution_session_key:'s',execution_run_id:'r',
  execution_started_at:10,execution_updated_at:20,automation_json:null,claim_json:null,stale_json:null,archived_at:null,
  lifecycle_status_source_updated_at:15,...changes});
const input = changes => ({targetStatus:'running',executionStatus:'running',sourceUpdatedAt:30,now:40,
  association:{expectedSessionKey:'s',expectedRunId:'r',sessionKey:'s',runId:'r'},...changes});

test('release bytes are reproducibly derived from the current deployed Workboard sources', () => {
  assert.equal(patchSqlite(beforeSql),sql); assert.equal(patchRuntime(beforeApi),api); assert.equal(patchPlugin(beforePlugin),plugin);
  assert.throws(()=>patchRuntime(api)); assert.throws(()=>patchSqlite(sql)); assert.throws(()=>patchPlugin(plugin));
});

test('one shared patch builder preserves the original native mutation result', () => {
  const cards = [project(row('a')),project(row('a',{archived_at:1})),project(row('a',{stale_json:'{"lastSessionUpdatedAt":1,"reason":"old"}'})),
    project(row('a',{automation_json:JSON.stringify({launch:{phase:'prepared',requestedSessionKey:'s',provisionalRunId:'r',preparedAt:5}})}))];
  for(const card of cards) for(const status of ['running','blocked','review','done','ready']) for(const sourceUpdatedAt of [0,15,30,undefined])
    for(const association of [undefined,input({}).association,{expectedSessionKey:'old',expectedRunId:'r',sessionKey:'new',runId:'n',acceptedAt:40}])
      for(const stale of [undefined,{lastSessionUpdatedAt:9,reason:'x',detectedAt:10}]) {
        const value=input({targetStatus:status,executionStatus:status,sourceUpdatedAt,association,stale});
        assert.deepEqual(builder(card,value),originalBuilder(card,value));
      }
});

test('omitted histories never turn a real native patch into a projected no-op', () => {
  for(const status of ['running','ready','done','review','blocked']) for(const phase of [undefined,'prepared','accepted'])
    for(const source of [5,15,99]) for(const target of ['running','review','blocked']) {
      const automation=phase?{launch:{phase,requestedSessionKey:'s',provisionalRunId:'r',preparedAt:10,acceptedSessionKey:'s',acceptedRunId:'r'}}:undefined;
      const projected=project(row('a',{status,automation_json:automation?JSON.stringify(automation):null,lifecycle_status_source_updated_at:null}));
      projected.events=[{kind:'moved',at:15,fromStatus:'todo',toStatus:status}];
      const full=structuredClone(projected);
      full.metadata.attempts=[{id:'attempt',status:'running',sessionKey:'s',runId:'r',startedAt:1}];
      full.metadata.comments=[{id:'comment',body:'retained'}];full.events.unshift({kind:'created',at:1,toStatus:'todo'});
      const value=input({targetStatus:target,executionStatus:target,sourceUpdatedAt:source,
        association:{...input({}).association,sessionKey:'new',runId:'actual',acceptedAt:20}});
      assert.equal(Boolean(builder(projected,value)),Boolean(originalBuilder(full,value)));
    }
});

function fixture(t) {
  const db=new DatabaseSync(':memory:'); t.after(()=>db.close());
  const cols=Object.keys(row('a')).map(k=>`${k} ${['id','status'].includes(k)?'TEXT':k.endsWith('_json')||k.includes('session')||k.includes('run_id')||k.startsWith('execution_')&&!k.endsWith('_at')||k==='agent_id'?'':'NUMERIC'}`).join(',');
  db.exec(`CREATE TABLE workboard_cards (${cols}); CREATE UNIQUE INDEX cards_id ON workboard_cards(id);
    CREATE TABLE workboard_card_events(card_id TEXT,ordinal INTEGER,kind TEXT,at INTEGER,from_status TEXT,to_status TEXT);
    CREATE INDEX events_card_ordinal ON workboard_card_events(card_id,ordinal);`);
  const insert=record=>{const keys=Object.keys(record);db.prepare(`INSERT INTO workboard_cards (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>record[k]));};
  return {db,insert,native:{db,...nativeMethods}};
}

test('native narrow queries preserve event ordering and the manual-status fence', async t => {
  const {db,insert,native}=fixture(t);insert(row('a',{status:'ready',lifecycle_status_source_updated_at:null}));
  const event=db.prepare('INSERT INTO workboard_card_events VALUES (?,?,?,?,?,?)');
  event.run('a',0,'created',2,null,'ready');event.run('a',1,'moved',90,'todo','ready');
  event.run('a',2,'commented',100,null,null);event.run('a',3,'moved',80,null,'ready');
  const state=await native.lookupLifecycleState('a');
  assert.equal(state.events[0].at,80,'reverse ordinal, not greatest timestamp');
  assert.equal(builder(state,input({targetStatus:'running',sourceUpdatedAt:50})),undefined,'older callback cannot override manual move');
  assert(builder(state,input({targetStatus:'running',sourceUpdatedAt:81})));
  assert.equal(await native.lookupLifecycleState('missing'),undefined);
  assert.equal((await native.listLifecycleStates()).length,1);
  assert(!('notes' in state)&&!state.metadata.comments&&!state.metadata.attempts);
  assert(db.prepare(`EXPLAIN QUERY PLAN SELECT kind, at FROM workboard_card_events WHERE card_id=? AND to_status=? ORDER BY ordinal DESC LIMIT 1`).all('a','ready').some(r=>r.detail.includes('events_card_ordinal')));
});

test('unchanged cards bypass complete history; possible changes keep fresh-read/CAS ownership guards', async t => {
  const {insert,native}=fixture(t);insert(row('a'));
  let fullReads=0;
  const store={cardStore:native,enqueueMutation:run=>run(),updateLatestCard:async(id,build,options)=>{
    fullReads++;assert.deepEqual(options,{allowAutomationLaunch:true});
    const fresh=project(row(id,{session_key:'new',run_id:'new',execution_session_key:'new',execution_run_id:'new'}));
    const patch=build(fresh);assert.equal(patch,undefined,'stale observation cannot relink the new attempt');return {updated:false};
  }};
  assert.equal(await sync.call(store,'a',input({})),false);assert.equal(fullReads,0);
  assert.equal(await sync.call(store,'a',input({targetStatus:'review',executionStatus:'review'})),false);assert.equal(fullReads,1);
  await assert.rejects(sync.call(store,'missing',input({})),/card not found/);
  await assert.rejects(sync.call({...store,cardStore:{lookupLifecycleState:async()=>{throw Error('db failed');}}},'a',input({})),/db failed/);
});

test('native state parsing yields to socket/timer work without dropping rows or changing ordering', async t => {
  const {insert,native}=fixture(t);for(let i=0;i<600;i++)insert(row(`c${i}`,{created_at:600-i}));
  let polled=false;setImmediate(()=>{polled=true;});
  const result=await native.listLifecycleStates();assert(polled);assert.equal(result.length,600);assert.equal(result[0].id,'c599');
});

export function loadLifecycle(source, overrides={}) {
  const start=source.indexOf('//#region extensions/workboard/src/lifecycle-sync.ts');
  const end=source.indexOf('//#endregion',start);
  const deps={resolveGlobalSingleton:(_key,create)=>create(),isRecord:v=>!!v&&typeof v==='object'&&!Array.isArray(v),
    cardSessionKey:c=>c.sessionKey??c.execution?.sessionKey,cardRunId:c=>c.runId??c.execution?.runId,
    workboardCardSessionLookupKey:c=>c.sessionKey??c.execution?.sessionKey??`subagent:workboard-default-${c.id}`,
    workboardCardMatchesLifecycleLink:()=>false,
    isWorkboardWorktreeCleanupCandidate:c=>!!(c.metadata?.automation?.workspace?.sourcePath&&['done','review','blocked'].includes(c.execution?.status??c.status)),
    cleanupWorkboardCardWorktree:async()=>{},...overrides};
  return new Function(...Object.keys(deps),`${source.slice(start,end)}\nreturn {createWorkboardLifecycleService,syncWorkboardLifecycleSessions};`)(...Object.values(deps));
}

test('full and >64-card partial sweeps never hydrate all cards; prepared/unknown/cleanup semantics survive', async () => {
  for(const size of [3,65,160]) {
    const cards=Array.from({length:size},(_,i)=>project(row(`c${i}`,{session_key:`s${i}`})));
    cards.push(project(row('prepared',{session_key:'unknown',automation_json:JSON.stringify({launch:{phase:'prepared',preparedAt:5}})})));
    let complete,failed=0,finished;const done=new Promise(r=>finished=r);const reads=[];
    const store={listLifecycleStates:async()=>structuredClone(cards),list:()=>assert.fail('full/scoped history read during sweep'),
      syncLifecycle:async()=>false,failPreparedLaunch:async()=>{failed++;return true;}};
    const service=loadLifecycle(plugin).createWorkboardLifecycleService({store,readSessions:async opts=>{
      reads.push(opts);complete=true;return {sessions:cards.filter(c=>c.id!=='prepared').map(c=>({key:c.sessionKey,status:'running',hasActiveRun:true,updatedAt:30})),complete:true,listed:true};
    },worktrees:null});
    service.start({logger:{warn:msg=>assert.fail(msg)}});service.onGatewayStart();
    for(let i=0;i<Math.ceil(size/32)+10;i++)await new Promise(r=>setImmediate(r));
    service.stop();assert(complete);assert.equal(failed,1);assert.equal(reads[0].includeUnknown,true);assert.equal(reads[0].activeMinutes,undefined);finished();await done;
  }
});

test('minute, >64 partial and ten-minute full passes preserve scope/cadence using only parent state', async () => {
  let now=1_791_200_000_000,next,settled;
  const cards=Array.from({length:150},(_,i)=>project(row(`c${i}`,{session_key:`s${i}`})));
  const requests=[],synced=[];
  const store={listLifecycleStates:async()=>structuredClone(cards),list:()=>assert.fail('full history read'),syncLifecycle:async id=>{synced.push(id);return false;}};
  const source=loadLifecycle(plugin,{Date:{now:()=>now},setTimeout:fn=>{next=fn;settled?.();return {unref(){}};},clearTimeout:()=>{}});
  const service=source.createWorkboardLifecycleService({store,readSessions:async opts=>{
    requests.push(opts);return {sessions:cards.slice(0,opts.activeMinutes?65:150).map(c=>({key:c.sessionKey,status:'running',hasActiveRun:true,updatedAt:now})),complete:!opts.activeMinutes,listed:true};
  }});
  const wait=()=>new Promise(resolve=>{settled=resolve;});
  service.start({logger:{warn:m=>assert.fail(m)}});let done=wait();service.onGatewayStart();await done;
  assert.equal(synced.length,150);
  for(let i=1;i<=10;i++) {now+=60000;synced.length=0;done=wait();next();await done;assert.equal(synced.length,i===10?150:65);}
  assert.deepEqual(requests.map(x=>x.activeMinutes??'full'),['full',2,2,2,2,2,2,2,2,2,'full']);
  service.stop();
});
