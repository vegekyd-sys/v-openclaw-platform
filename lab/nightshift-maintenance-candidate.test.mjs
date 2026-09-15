import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import test from 'node:test';

const runtime=process.env.VLAB_CANDIDATE_RUNTIME;
const sharedState=process.env.VLAB_SHARED_STATE_DIR;
const sharedRuntime=path.dirname(sharedState)+'/runtime';
const fixedNow=Date.now();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function compact(plan){
 return {
  counts:{archived:plan.archived,pruned:plan.pruned,capped:plan.capped,modelRunPruned:plan.modelRunPruned},
  archives:(plan.plannedEntryArchives??[]).map(x=>({key:digest(x.sessionKey),value:digest(x)})),
  removals:(plan.entryRemovals??[]).map(x=>({key:digest(x.sessionKey),value:digest(x)})),
  deletePlans:(plan.stateDeletePlans??plan.deletePlans??[]).map(digest).sort(),
  entries:(plan.entries??[]).map(digest).sort(),
 };
}
function timed(fn){const at=performance.now();const plan=fn();const ms=performance.now()-at;return{ms,result:compact(plan)};}

test('bounded native maintenance and scoped cleanup preserve real shared history plans', {timeout:180000},async()=>{
 assert(runtime&&sharedState);
 const before=await import(sharedRuntime+'/openclaw/dist/session-history-eviction-d5aiCsHS.js');
 const after=await import(runtime+'/openclaw/dist/session-history-eviction-d5aiCsHS.js');
 const beforeLife=await import(sharedRuntime+'/openclaw/dist/session-accessor.sqlite-lifecycle-state-CrB_K2kA.js');
 const afterLife=await import(runtime+'/openclaw/dist/session-accessor.sqlite-lifecycle-state-CrB_K2kA.js');
 const {t:open}=await import(runtime+'/openclaw/dist/node-sqlite-CL-d6drd.js');
 const {s:resolveMaintenance}=await import(sharedRuntime+'/openclaw/dist/disk-budget-BzLS0kmH.js');
 const databasePath=sharedState+'/agents/makaron/agent/openclaw-agent.sqlite';
 const db=open(databasePath,{readOnly:true});
 const database={db,path:databasePath,agentId:'makaron'};
 const now=Date.now;Date.now=()=>fixedNow;
 const maintenanceConfig={...resolveMaintenance(),mode:'enforce',maxEntries:2000};
 const params={planOnly:true,maintenanceConfig,storePath:sharedState+'/agents/makaron/sessions/sessions.json',activeSessionKey:'agent:makaron:main'};
 try{
  db.exec('PRAGMA query_only=ON; BEGIN DEFERRED');
  const inventory=db.prepare('SELECT COUNT(*) AS entries, SUM(LENGTH(entry_json)) AS jsonBytes FROM session_nodes').get();
  const changesBefore=db.prepare('SELECT total_changes() AS n').get().n;
  const baseline=timed(()=>before.a(database,params));
  const candidate=timed(()=>after.a(database,params));
  const warmCandidate=timed(()=>after.a(database,params));
  assert.deepEqual(warmCandidate.result,candidate.result);
  const beforeEligible=new Map([...baseline.result.archives,...baseline.result.removals].map(x=>[x.key,x.value]));
  const selected=[...candidate.result.archives,...candidate.result.removals];
  assert(beforeEligible.size>64,'real fixture must exercise more than one batch');
  assert.equal(selected.length,64,'automatic planning must hydrate only one native batch');
  for(const item of selected)assert.equal(item.value,beforeEligible.get(item.key),'batch must preserve native eligibility and exact optimistic snapshots');
  assert(candidate.result.deletePlans.every(x=>baseline.result.deletePlans.includes(x)),'batch must retain native reference protection');
  const explicitBefore=timed(()=>before.a(database,{...params,forceMaintenance:true}));
  const explicitAfter=timed(()=>after.a(database,{...params,forceMaintenance:true}));
  assert.deepEqual(explicitAfter.result,explicitBefore.result,'explicit full maintenance retains the complete plan');
  const cleanups=[];
  for(const prefix of ['nightshift-does-not-exist-', 'workboard-nightshift-vlab-native-']){
   const input={agentId:'makaron',sessionKeySegmentPrefix:prefix,transcriptContentMarker:'SHARED_CAPACITY_TOOL',orphanTranscriptMinAgeMs:0,nowMs:fixedNow,archiveRemovedEntryTranscripts:true};
   const a=timed(()=>beforeLife.o(database,input));const b=timed(()=>afterLife.o(database,input));
   assert.deepEqual(b.result,a.result,'scoped cleanup must preserve every deletion, snapshot and retained reference');
   cleanups.push({prefix,baselineMs:a.ms,candidateMs:b.ms,plannedEntries:b.result.entries.length,plannedDeletes:b.result.deletePlans.length});
  }
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changesBefore,'the acceptance fixture is strictly read-only');
  const result={inventory,automatic:{baselineMs:baseline.ms,candidateMs:candidate.ms,baselineEntries:beforeEligible.size,candidateEntries:selected.length,baselineCounts:baseline.result.counts,candidateCounts:candidate.result.counts,warmCandidateMs:warmCandidate.ms},explicit:{baselineMs:explicitBefore.ms,candidateMs:explicitAfter.ms,equal:true},cleanups,sharedDatabaseWrites:0};
  console.log(JSON.stringify({event:'native-maintenance-real-history',...result}));
  assert(candidate.ms<baseline.ms*.8,'bounded selection should remove the measured full-history planning cost');
  assert(cleanups.every(x=>x.candidateMs<x.baselineMs),'scoped cleanup should remove redundant full-history copies');
 }finally{Date.now=now;db.exec('ROLLBACK');db.close();}
});
