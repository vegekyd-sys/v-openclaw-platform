import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
assert.equal(execFileSync('systemctl',['show','openclaw-lab-db91-parity.service','-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const parsers=await import(root+'/runtime/openclaw/dist/task-registry.types-73FJYVhP.js');
const file=root+'/state/state/openclaw.sqlite',db=new DatabaseSync(file);
const introduced=db.prepare("SELECT task_id FROM task_runs WHERE delivery_status='skipped' AND notify_policy='none' AND status='cancelled'").all();
assert.equal(introduced.length,1,'Expected exactly the one incorrectly staged task');
const update=db.prepare("UPDATE task_runs SET notify_policy='silent',delivery_status='not_applicable' WHERE task_id=?");update.run(introduced[0].task_id);
const rows=db.prepare('SELECT runtime,status,delivery_status,notify_policy,scope_kind,terminal_outcome FROM task_runs').all();
for(const row of rows){parsers.s(row.runtime);parsers.l(row.status);parsers.a(row.delivery_status);parsers.o(row.notify_policy);parsers.c(row.scope_kind);parsers.i(row.terminal_outcome);}
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();
const report={correctedRows:1,validatedRows:rows.length,nativeParsers:true};
fs.writeFileSync(root+'/tmp/staging-task-status-correction.json',JSON.stringify(report),{mode:0o600,flag:'wx'});console.log(JSON.stringify(report));
