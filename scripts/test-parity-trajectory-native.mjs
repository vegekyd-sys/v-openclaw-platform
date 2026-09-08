// Native 9.1 trajectory implementation and Kysely, isolated SQLite fixture.
// This verifies retention semantics, not Agent performance or release acceptance.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {pathToFileURL} from 'node:url';
import {patchTrajectorySweep,prepareTrajectorySweep,isTrajectorySweepCurrent} from '../experiments/db91-integrity-gate/trajectory-sweep.mjs';
import {patchTrajectoryBudgetQuery,trajectoryIndexSql} from '../experiments/db91-integrity-gate/trajectory-index.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const dist=root+'/runtime/openclaw/dist/';
const schemaModule=await import(pathToFileURL(dist+'openclaw-agent-db-maintenance-DYSkzMMg.js').href);
const schemaFixture=new DatabaseSync(':memory:');
try {
 schemaFixture.exec(schemaModule.F);
 schemaModule.u(schemaFixture,':memory:',schemaModule.F);
 schemaFixture.exec(trajectoryIndexSql);
 schemaModule.u(schemaFixture,':memory:',schemaModule.F);
 assert.equal(schemaFixture.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 console.log(JSON.stringify({nativeSchemaContainsAcceptsAdditiveIndex:true}));
} finally {schemaFixture.close();}
const source=fs.readFileSync(root+'/tmp/before-trajectory-sweep.js','utf8');
const patched=patchTrajectoryBudgetQuery(patchTrajectorySweep(source));assert.throws(()=>patchTrajectorySweep(patched));assert.throws(()=>patchTrajectoryBudgetQuery(patched));
const directory=fs.mkdtempSync(root+'/tmp/trajectory-native-');
const fixture=directory+'/fixture.sqlite';const db=new DatabaseSync(fixture);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE trajectory_runtime_events(session_id TEXT NOT NULL, seq INTEGER NOT NULL, run_id TEXT, event_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id,seq))');
const other=new DatabaseSync(fixture),database={db};let beforeWrite;
const imports={prepareTrajectorySweep,isTrajectorySweepCurrent};
for(const match of source.matchAll(/^import \{([^}]+)\} from "([^"]+)";/gm)){
 const mod=await import(pathToFileURL(dist+match[2]).href);
 for(const spec of match[1].split(',')){const [exported,local]=spec.trim().split(/\s+as\s+/);imports[local??exported]=mod[exported];}
}
imports.openOpenClawAgentDatabase=()=>database;
imports.resolveSqliteTargetFromSessionStorePath=()=>({agentId:'fixture',path:fixture});
imports.runOpenClawAgentWriteTransaction=fn=>{beforeWrite?.();db.exec('BEGIN IMMEDIATE');try{const value=fn(database);db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}};
function make(text=patched){const body=text.replace(/^import .*;\n/gm,'').replace(/export \{[\s\S]*$/,'');return new Function(...Object.keys(imports),body+'\nreturn appendSqliteTrajectoryRuntimeEvents;')(...Object.values(imports));}
const now=Date.now(),age=14*24*3600*1000;
const add=db.prepare('INSERT INTO trajectory_runtime_events VALUES(?,?,?,?,?)');
function reset(){db.exec('DELETE FROM trajectory_runtime_events');for(const [session,run,timestamp,payload]of [['expired','old',now-age-1000,'old'],['oldest','r1',now-5000,'中文'.repeat(100)],['newer','r2',now-1000,'new'.repeat(100)],['current','previous',now-2000,'prev']])add.run(session,0,run,JSON.stringify({payload}),timestamp);}
const rows=()=>db.prepare('SELECT * FROM trajectory_runtime_events ORDER BY session_id,seq').all();
const event={runId:'current-run',ts:new Date(now).toISOString(),payload:'工具🙂'.repeat(100)};
let cases=0;
try{
 for(const [globalLimit,sessionLimit]of [[1e8,1e7],[1000,1e7],[1,1e7],[1000,50]]){
  let baseline;
  for(const variant of ['native','query','query-index','query-index-detached']){db.exec('DROP INDEX IF EXISTS idx_agent_trajectory_runtime_budget_v1');if(variant.includes('index'))db.exec(trajectoryIndexSql);reset();beforeWrite=undefined;make(variant==='native'?source:patched)({agentId:'fixture',sessionId:'current',storePath:fixture,maxGlobalRuntimeBytes:globalLimit,maxRuntimeBytes:sessionLimit,env:{OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE:variant.endsWith('detached')?'1':'0'}},[event]);if(variant==='native')baseline=rows();else assert.deepEqual(rows(),baseline,variant);}
  cases++;
 }
 reset();let raced=false;
 beforeWrite=()=>{if(!raced){raced=true;other.exec("UPDATE trajectory_runtime_events SET created_at="+now+" WHERE session_id='expired'");}};
 const append=make(),scope={agentId:'fixture',sessionId:'current',storePath:fixture,maxGlobalRuntimeBytes:1,env:{OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE:'1'}};
 append(scope,[event]);assert.equal(rows().length,5,'invalidated plan must not delete');
 beforeWrite=undefined;append(scope,[event]);assert(rows().every(r=>r.session_id==='current'),'later flush retries unmarked sweep');cases++;
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 console.log(JSON.stringify({nativeTrajectoryPolicyCases:cases,changedPlanSkipsDeletion:true,subsequentFlushRetries:true,fixture:directory,performanceAcceptance:false}));
}finally{other.close();db.close();}
