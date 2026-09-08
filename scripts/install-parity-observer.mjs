import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const manifest=JSON.parse(fs.readFileSync(root+'/../../control/db91-parity.json'));
assert.equal(manifest.owner,'codex-db91-production-equivalent-20260908');
assert.equal(execFileSync('systemctl',['show',manifest.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const file=root+'/runtime/openclaw/dist/openclaw-agent-db-CUTe8BX6.js';
let source=fs.readFileSync(file,'utf8');const original=source;
const expressions=[
  ['sidecar-quarantine','quarantineOrphanedSqliteSidecars(pathname)'],
  ['read-quarantine','readOpenClawDatabaseQuarantine(pathname, { env: databaseOptions.env })'],
  ['lease','claimOpenClawAgentDatabaseLease({\n\t\tagentId,\n\t\tpath: pathname,\n\t\t...options.env ? { env: options.env } : {}\n\t})'],
  ['open-sqlite','openNodeSqliteDatabase(pathname)'],
  ['integrity','assertAgentDatabaseIntegrityBeforeMutation(db, agentId, pathname)'],
  ['schema','ensureAgentSchema(db, agentId, pathname)'],
  ['register-global','registerOpenClawAgentDatabase({\n\t\t\tagentId,\n\t\t\tpath: pathname,\n\t\t\tenv: options.env\n\t\t})'],
];
for(const [label,expression] of expressions){
  const count=source.split(expression).length-1;
  assert.equal(count,label==='schema'?2:1,'Changed runtime anchor '+label);
  source=source.replaceAll(expression,`__parityPhase(${JSON.stringify(label)},agentId,()=>${expression})`);
}
source+='\nfunction __parityPhase(phase,agent,fn){const start=performance.now();try{return fn();}finally{process.stderr.write("[parity-db-phase] "+JSON.stringify({phase,agent,pid:process.pid,at:Date.now(),ms:Math.round(performance.now()-start)})+"\\n");}}\n';
fs.writeFileSync(root+'/tmp/openclaw-agent-db-before-observer.js',original,{mode:0o600,flag:'wx'});
fs.writeFileSync(file,source);
execFileSync(process.execPath,['--check',file]);
const observer=root+'/runtime/openclaw/dist/parity-slow-sync.mjs';
fs.writeFileSync(observer,fs.readFileSync(new URL('./db91-slow-sync-observer.mjs',import.meta.url)),{mode:0o644,flag:'wx'});
fs.appendFileSync(root+'/secrets.env',`\nNODE_OPTIONS="--import=${observer}"\n`);
console.log(JSON.stringify({observerOnly:true,sha256:createHash('sha256').update(source).digest('hex'),phases:expressions.map(x=>x[0])}));
