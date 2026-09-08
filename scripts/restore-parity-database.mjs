// Receive ONE sealed baseline DB on stdin into the stopped disposable replica.
// Generated test database rows are replaced; result logs/config/workspaces remain.
// Canonical recoverable data is the SHA-sealed snapshot still retained on V.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const [arm,tag]=process.argv.slice(2);assert(/^[a-z0-9-]{1,32}$/.test(arm));
const allowed=['openclaw','main','xiaoai','dealclaw','short-v','v-codex','makaron','global-state','nightshift-state'];assert(allowed.includes(tag));
const control=root+'/../../control';const m=JSON.parse(fs.readFileSync(control+'/db91-parity.json'));
assert.equal(m.owner,'codex-db91-production-equivalent-20260908');assert.equal(m.root,root);
assert.equal(JSON.parse(fs.readFileSync(control+'/integration.json')).owner,m.owner);
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const manifest=JSON.parse(fs.readFileSync(root+'/tmp/production-snapshot/manifest.json'));assert(manifest.exportSealedAt);
const record=manifest.databases.find(x=>x.file===tag+'.sqlite');assert(record&&/^[a-f0-9]{64}$/.test(record.sha256));
const target=tag==='global-state'?root+'/state/state/openclaw.sqlite':tag==='nightshift-state'?root+'/state/nightshift/nightshift.sqlite':root+'/state/agents/'+tag+'/agent/openclaw-agent.sqlite';
assert.equal(fs.realpathSync(target),target);assert(fs.lstatSync(target).isFile());
const audit=root+'/tmp/baseline-restore-'+arm;fs.mkdirSync(audit,{recursive:true,mode:0o700});
const status=audit+'/'+tag+'.json';assert(!fs.existsSync(status),'Restore attempt already exists; inspect before retry');
for(const file of [target,target+'-wal',target+'-shm'])if(fs.existsSync(file)){
 try{execFileSync('fuser',[file],{stdio:['ignore','pipe','pipe']});throw Error('Database has a live file user');}
 catch(error){if(error.status!==1)throw error;}
}
const before=fs.statSync(target),report={tag,arm,startedAt:new Date().toISOString(),sourceSha256:record.sha256,sourceBytes:record.bytes,previousBytes:before.size,generatedRowsReplaced:true,complete:false};
fs.writeFileSync(status,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
// Old WAL cannot ever be replayed against the restored main file.
for(const suffix of ['-wal','-shm'])if(fs.existsSync(target+suffix))fs.renameSync(target+suffix,audit+'/'+tag+suffix);
const fd=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW);const hash=createHash('sha256');let bytes=0;
try{for await(const chunk of process.stdin){assert(bytes+chunk.length<=record.bytes,'Input exceeds sealed baseline');let offset=0;while(offset<chunk.length)offset+=fs.writeSync(fd,chunk,offset,chunk.length-offset);hash.update(chunk);bytes+=chunk.length;}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
assert.equal(bytes,record.bytes,'Truncated stream: instance must remain stopped');assert.equal(hash.digest('hex'),record.sha256,'Hash mismatch: instance must remain stopped');
report.complete=true;report.finishedAt=new Date().toISOString();fs.writeFileSync(status,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
