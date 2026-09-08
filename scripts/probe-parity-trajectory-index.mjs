// Scoped diagnostic on the stopped owned copy. Adds one reversible index only.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
import {trajectoryIndexName,trajectoryIndexSql,trajectoryBudgetSql} from '../experiments/db91-integrity-gate/trajectory-index.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
assert.equal(process.env.OPENCLAW_STATE_DIR,root+'/state');
const manifest=JSON.parse(fs.readFileSync(root+'/../../control/db91-parity.json'));assert.equal(manifest.owner,'codex-db91-production-equivalent-20260908');
assert.equal(execFileSync('systemctl',['show',manifest.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const file=root+'/state/agents/makaron/agent/openclaw-agent.sqlite';assert.equal(fs.realpathSync(file),file);
const output=root+'/tmp/parity-results/trajectory-index-probe.json';assert(!fs.existsSync(output));
const db=new DatabaseSync(file),report={startedAt:Date.now(),file,diagnosticOnly:true};
const query=(sql,...args)=>{const start=performance.now();const rows=db.prepare(sql).all(...args);return {rows,ms:Math.round(performance.now()-start)};};
try{
 assert(!db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(trajectoryIndexName));
 const before=query(trajectoryBudgetSql);report.before={ms:before.ms,runs:before.rows.length,plan:query('EXPLAIN QUERY PLAN '+trajectoryBudgetSql).rows};
 const started=Date.now();db.exec(trajectoryIndexSql);report.buildMs=Date.now()-started;
 const after=query(trajectoryBudgetSql);assert.deepEqual(after.rows,before.rows);report.after={ms:after.ms,runs:after.rows.length,plan:query('EXPLAIN QUERY PLAN '+trajectoryBudgetSql).rows};
 const parameter=query(trajectoryBudgetSql.replace('+ 1','+ ?'),1);assert.deepEqual(parameter.rows,before.rows);report.parameter={ms:parameter.ms,plan:query('EXPLAIN QUERY PLAN '+trajectoryBudgetSql.replace('+ 1','+ ?'),1).rows};
 report.nativeIntegrity=query('PRAGMA integrity_check');assert.deepEqual(report.nativeIntegrity.rows.map(row=>row.integrity_check),['ok']);
 db.exec('PRAGMA wal_checkpoint(TRUNCATE)');report.complete=true;
}finally{db.close();fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});}
console.log(JSON.stringify(report));
