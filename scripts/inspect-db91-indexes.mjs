import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {trajectoryIndexName,trajectoryBudgetSql} from '../experiments/db91-integrity-gate/trajectory-index.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const root='/home/openclaw/.openclaw';
assert.equal(process.getuid(),fs.statSync(root).uid);
for(const agent of ['openclaw','main','xiaoai','dealclaw','short-v','v-codex','makaron']){
 const db=new DatabaseSync(root+'/agents/'+agent+'/agent/openclaw-agent.sqlite',{readOnly:true});
 try{
  assert(db.prepare('SELECT name FROM sqlite_schema WHERE name=?').get(trajectoryIndexName));
  const plan=db.prepare('EXPLAIN QUERY PLAN '+trajectoryBudgetSql).all().map(r=>r.detail);
  assert(plan.some(s=>s.includes(trajectoryIndexName)));assert(!plan.some(s=>s.includes('TEMP B-TREE')));
  console.log(JSON.stringify({agent,indexPresent:true,noTemporarySort:true,plan}));
 }finally{db.close();}
}
