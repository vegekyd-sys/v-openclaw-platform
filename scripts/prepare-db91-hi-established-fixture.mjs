// Align private prompt files with the existing VLab Agent, not its credentials.
// Preserve the original fresh-Agent fixture and all database history for audit.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import path from 'node:path';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-fix';
const shared='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json'));
assert.equal(m.owner,'codex-db91-contention-20260907');assert.equal(m.root,root);
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
assert(!fs.existsSync(shared+'/workspace/BOOTSTRAP.md'),'shared Agent is still in bootstrap');
const backup=root+'/state/db91-hi-fresh-fixture-before';assert(!fs.existsSync(backup),'fixture already prepared');
const uid=Number(execFileSync('id',['-u',m.user],{encoding:'utf8'})),gid=Number(execFileSync('id',['-g',m.user],{encoding:'utf8'}));
const hash=s=>createHash('sha256').update(s).digest('hex');
const privateGuard='\n\n## Private VLab boundary\nThis is an isolated development experiment. Work only inside this instance. No production business, messaging channels, external config edits, or shared Gateway restarts.\n';
const names=['AGENTS.md','SOUL.md','USER.md','IDENTITY.md','MEMORY.md','TOOLS.md'];
const plans=names.filter(n=>fs.existsSync(shared+'/workspace/'+n)).map(name=>{
  const source=shared+'/workspace/'+name,file=root+'/workspace/'+name;
  assert(fs.statSync(source).isFile());assert(fs.statSync(source).size<256*1024);
  const sourceText=fs.readFileSync(source,'utf8');
  const result=sourceText+(name==='AGENTS.md'?privateGuard:'');
  return {name,file,sourceSha:hash(sourceText),result,original:fs.existsSync(file)?fs.readFileSync(file):null};
});
fs.mkdirSync(backup,{mode:0o700});
for(const p of plans){
  if(p.original)fs.writeFileSync(path.join(backup,p.name),p.original,{mode:0o600,flag:'wx'});
  fs.writeFileSync(p.file,p.result,{mode:0o600});fs.chmodSync(p.file,0o600);fs.chownSync(p.file,uid,gid);
}
const bootstrap=root+'/workspace/BOOTSTRAP.md';let bootstrapMoved=false;
if(fs.existsSync(bootstrap)){fs.renameSync(bootstrap,path.join(backup,'BOOTSTRAP.md'));bootstrapMoved=true;}
const record={at:new Date().toISOString(),reason:'fresh-Agent onboarding is not a representative V latency fixture',source:shared+'/workspace',bootstrapMoved,
  files:plans.map(p=>({name:p.name,sourceSha:p.sourceSha,before:p.original?hash(p.original):null,after:hash(p.result)})),databaseUnchanged:true,configUnchanged:true,privateBoundaryAppended:true};
fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});
console.log(JSON.stringify(record));
