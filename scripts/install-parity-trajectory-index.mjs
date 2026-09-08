// Only the stopped, owned production-equivalent replica. No production path.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';import {pathToFileURL} from 'node:url';
import {trajectoryIndexName,trajectoryIndexSql,trajectoryBudgetSql,patchTrajectoryBudgetQuery} from '../experiments/db91-integrity-gate/trajectory-index.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
assert.equal(process.env.OPENCLAW_STATE_DIR,root+'/state');
const manifest=JSON.parse(fs.readFileSync(root+'/../../control/db91-parity.json'));assert.equal(manifest.owner,'codex-db91-production-equivalent-20260908');
assert.equal(execFileSync('systemctl',['show',manifest.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const dist=root+'/runtime/openclaw/dist/',file=dist+'runtime-store.sqlite-D0DF2c9M.js';
const before=fs.readFileSync(file,'utf8'),after=patchTrajectoryBudgetQuery(before);
assert(before.includes('prepareTrajectorySweep'),'expected previous candidate');
const backup=root+'/tmp/before-trajectory-budget-query.js';assert(!fs.existsSync(backup));
const report={startedAt:Date.now(),databases:[],complete:false,nativeRuntimeIntegrityStillRequired:true};
const schema=await import(pathToFileURL(dist+'openclaw-agent-db-maintenance-DYSkzMMg.js').href);
const owner=fs.statSync(root+'/state/agents/main/agent/openclaw-agent.sqlite');
assert(owner.uid>0&&owner.gid>0);
// Each DB is owned by the lab user; execute SQLite with that identity to keep
// journal and WAL ownership correct. The runtime itself remains root-owned.
const installDb=(agent)=>{
 const pathname=root+'/state/agents/'+agent+'/agent/openclaw-agent.sqlite';assert.equal(fs.realpathSync(pathname),pathname);
 const db=new DatabaseSync(pathname),entry={agent,startedAt:Date.now()};
 try{
  schema.u(db,pathname,schema.F);
  assert(!db.prepare('SELECT name FROM sqlite_schema WHERE name=?').get(trajectoryIndexName));
  const rows=db.prepare(trajectoryBudgetSql).all();
  db.exec('BEGIN IMMEDIATE');
  try{db.exec(trajectoryIndexSql);assert.deepEqual(db.prepare(trajectoryBudgetSql).all(),rows);schema.u(db,pathname,schema.F);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');entry.runs=rows.length;entry.finishedAt=Date.now();report.databases.push(entry);console.log(JSON.stringify(entry));
 }finally{db.close();}
};
try{
 process.setegid(owner.gid);process.seteuid(owner.uid);
 try{for(const agent of ['openclaw','main','xiaoai','dealclaw','short-v','v-codex','makaron'])installDb(agent);}
 finally{process.seteuid(0);process.setegid(0);}
 fs.writeFileSync(backup,before,{mode:0o600,flag:'wx'});fs.writeFileSync(file,after);execFileSync(process.execPath,['--check',file]);report.complete=true;
}finally{
 report.finishedAt=Date.now();fs.writeFileSync(root+'/tmp/trajectory-index-install.json',JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
}
console.log(JSON.stringify({complete:report.complete,additiveIndexes:report.databases.length,retentionPolicyUnchanged:true,nativeRuntimeIntegrityStillRequired:true}));
