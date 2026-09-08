// Reversible query-only selection for fresh matched-snapshot controls.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
import {patchTrajectoryBudgetQuery,trajectoryIndexName} from '../experiments/db91-integrity-gate/trajectory-index.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const [arm]=process.argv.slice(2);assert(['native','indexed'].includes(arm));
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const m=JSON.parse(fs.readFileSync(root+'/../../control/db91-parity.json'));assert.equal(m.owner,'codex-db91-production-equivalent-20260908');
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const original=fs.readFileSync(root+'/tmp/before-trajectory-budget-query.js','utf8'),indexed=patchTrajectoryBudgetQuery(original);
const file=root+'/runtime/openclaw/dist/runtime-store.sqlite-D0DF2c9M.js',before=fs.readFileSync(file,'utf8');assert(before===original||before===indexed,'Unrecognized installed query');
const found=[];
for(const agent of ['openclaw','main','xiaoai','dealclaw','short-v','v-codex','makaron']){
 const file=root+'/state/agents/'+agent+'/agent/openclaw-agent.sqlite';assert.equal(fs.realpathSync(file),file);
 const db=new DatabaseSync(file,{readOnly:true});try{if(db.prepare('SELECT name FROM sqlite_schema WHERE name=?').get(trajectoryIndexName))found.push(agent);}finally{db.close();}
}
assert.equal(found.length,arm==='native'?0:7,'Restore original snapshots for native control; install all indexes for indexed candidate');
const after=arm==='native'?original:indexed;
if(after!==before)fs.writeFileSync(file,after);
execFileSync(process.execPath,['--check',file]);
console.log(JSON.stringify({arm,indexes:found.length,queryChanged:before!==after,noDatabaseWrites:true}));
