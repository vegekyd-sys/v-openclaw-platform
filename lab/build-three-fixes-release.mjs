// Rebase the authorized combined release onto exact current shared code artifacts.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {patchCallerContext,patchToolFactory,patchCronTool,patchHostCapability,patchIdentityToken,patchJobsPolicy,patchCronHandlers,runtimeName} from '../scripts/patch-openclaw91-cron-shared-management.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),baseRelease='concurrency-lifecycle-projection-v1',files=[];
const sha=s=>createHash('sha256').update(s).digest('hex');
const read=target=>{const r=JSON.parse(execFileSync('ssh',['-C','-F','/Users/tianyicai/v-upgrade-private/20260904/ssh-config','-o','ControlPath=none','-o','BatchMode=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3','vlab91','sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab-production-mirror/labs/shared-workflow/tool/server.mjs'],{input:JSON.stringify({command:'read-code',target}),encoding:'utf8',maxBuffer:16*1024**2,timeout:120000}));assert.equal(r.current.release,baseRelease);const source=Buffer.from(r.content,'base64').toString();assert.equal(sha(source),r.sha256);return {...r,source};};
const fixture=path.join(root,'lab/fixtures/three-fixes-cron-native');fs.mkdirSync(path.join(fixture,'dist'),{recursive:true});
fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify({version:'2026.9.1'})+'\n');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'patches/cron-shared-management/acceptance/vlab-patch-manifest.json')));
const transforms=[patchCallerContext,patchToolFactory,patchCronTool,patchHostCapability,patchIdentityToken,patchJobsPolicy,patchCronHandlers];
for(let i=0;i<transforms.length;i++){
  const name=manifest.files[i].name,target='openclaw/dist/'+name,r=read(target),after=transforms[i](r.source);
  assert.notEqual(after,r.source,'Expected unapplied Cron patch');
  fs.writeFileSync(path.join(fixture,'dist',name),r.source);
  const source='lab/release-files/three-fixes-cron-'+name;fs.writeFileSync(path.join(root,source),after);
  files.push({source,target,before:r.sha256});console.log(JSON.stringify({target,before:r.sha256,after:sha(after),sameAsIsolatedBaseline:r.sha256===manifest.files[i].before}));
}
files.push({source:'patches/cron-shared-management/runtime.mjs',target:'openclaw/dist/'+runtimeName,before:null});
for(const planName of ['deepseek-compaction-plan.json','provider-policy-optional-load-plan.json']){
  const plan=JSON.parse(fs.readFileSync(path.join(root,'lab',planName)));
  for(const entry of plan.files){const r=read(entry.target);assert.equal(r.sha256,entry.before,'Target drift requires rebase and retest');files.push(entry);}
}
fs.writeFileSync(path.join(root,'lab/three-fixes-release-plan.json'),JSON.stringify({baseRelease,files},null,2)+'\n');
console.log(JSON.stringify({baseRelease,files:files.length,fixture}));
