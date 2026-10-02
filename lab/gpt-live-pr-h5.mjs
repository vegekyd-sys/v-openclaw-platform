#!/usr/bin/env node
// Starts the genuine H5 from the exact trial PR head, after a leased cutover.
// Credentials remain in a server-only file readable by the Gateway service UID.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PR_BRANCH,PR_URL} from './gpt-live-pr-provenance.mjs';
const [artifactFile]=process.argv.slice(2);assert(artifactFile,'Trial artifact required');
const {artifact,policy}=JSON.parse(fs.readFileSync(artifactFile));
const root=new URL('..',import.meta.url).pathname;
const run=(bin,args,options={})=>execFileSync(bin,args,{encoding:'utf8',timeout:60000,maxBuffer:64*1024**2,...options}).trim();
const git=(...args)=>run('git',['-C',root,...args]);
assert.equal(git('branch','--show-current'),PR_BRANCH);assert.equal(git('rev-parse','HEAD'),policy.sourceCommit);assert.equal(git('status','--porcelain'),'');
const pr=JSON.parse(run('gh',['pr','view','154','--repo','vegekyd-sys/v-openclaw-platform','--json','url,state,headRefOid']));
assert.equal(pr.url,PR_URL);assert.equal(pr.state,'OPEN');assert.equal(pr.headRefOid,policy.sourceCommit);
const paths=['lab/gpt-live-h5/server.mjs','lab/gpt-live-h5/events.mjs','lab/gpt-live-h5/duplex-playback.mjs','lab/gpt-live-h5/index.html','lab/gpt-live-h5/app.js','lab/rtc-h5/styles.css','lab/rtc-h5/assets/v-idle-nohat-20260922.png','lab/rtc-h5/assets/v-tool-busy-20260922.png'];
const files=paths.map(name=>{const bytes=execFileSync('git',['-C',root,'show',policy.sourceCommit+':'+name],{maxBuffer:64*1024**2});return {name,content:bytes.toString('base64'),sha:createHash('sha256').update(bytes).digest('hex')}});
const input={owner:policy.owner,commit:policy.sourceCommit,release:artifact.id,files};
const script=String.raw`import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import os from 'node:os';
let text='';for await(const chunk of process.stdin)text+=chunk;const req=JSON.parse(text);
const home='/srv/vlab-production-mirror/labs/shared-workflow';const unit='openclaw-vlab-production-mirror-v8.service';const node='/opt/vlab/node-v22.23.1-linux-x64/bin/node';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,req.owner);
assert(!fs.existsSync(home+'/pending.json'));const current=JSON.parse(fs.readFileSync(home+'/current.json'));assert.equal(current.release,req.release);assert.equal(current.sourceCommit,req.commit);
const pid=Number(execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim());assert(pid>1);
const env=Object.fromEntries(fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').filter(Boolean).map(row=>{const at=row.indexOf('=');return[row.slice(0,at),row.slice(at+1)]}));
const stat=fs.statSync(env.OPENCLAW_CONFIG_PATH);assert.equal(stat.uid,977);assert.equal(stat.gid,972);const config=JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH));assert.equal(config.gateway.port,24993);
assert.equal(execFileSync('ss',['-H','-lnt','sport = :26244'],{encoding:'utf8'}).trim(),'','H5 port is already occupied');
const dir=home+'/tmp/gpt-live-h5-pr154-'+req.commit.slice(0,12);assert(!fs.existsSync(dir),'This H5 snapshot already exists');fs.mkdirSync(dir,{recursive:true,mode:0o750});fs.chownSync(dir,977,972);
for(const file of req.files){assert(!file.name.includes('..')&&file.name.startsWith('lab/'));const target=path.join(dir,file.name);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o750});const bytes=Buffer.from(file.content,'base64');assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha);fs.writeFileSync(target,bytes,{flag:'wx',mode:0o640});}
const walk=p=>{fs.chownSync(p,977,972);if(fs.statSync(p).isDirectory())for(const f of fs.readdirSync(p))walk(path.join(p,f));};walk(dir);
const childEnv={OPENCLAW_CONFIG_PATH:env.OPENCLAW_CONFIG_PATH,GPT_LIVE_H5_RUNTIME_ROOT:'/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw',GPT_LIVE_H5_PORT:'26244'};
for(const match of String(config.gateway.auth.token).matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)){assert(env[match[1]],'Gateway token environment unavailable');childEnv[match[1]]=env[match[1]];}
const envFile=dir+'/server.env';const escape=value=>{assert(!/[\r\n\0]/u.test(value));const slash=String.fromCharCode(92);return '"'+[...value].map(char=>char===slash||char==='"'?slash+char:char).join('')+'"';};fs.writeFileSync(envFile,Object.entries(childEnv).map(([key,value])=>key+'='+escape(value)).join('\n')+'\n',{mode:0o600,flag:'wx'});fs.chownSync(envFile,977,972);
const service='gpt-live-pr154-h5-'+req.commit.slice(0,12);execFileSync('systemd-run',['--unit='+service,'--collect','--property=Type=exec','--property=User=lab-db91-parity','--property=Group=lab-db91-parity','--property=WorkingDirectory='+dir,'--property=EnvironmentFile='+envFile,'--property=RuntimeMaxSec=14400','--property=KillMode=control-group','--property=UMask=0077',node,dir+'/lab/gpt-live-h5/server.mjs'],{stdio:'pipe',timeout:30000});
console.log(JSON.stringify({service,dir,sourceCommit:req.commit,url:'http://127.0.0.1:26244/',appSha:req.files.find(f=>f.name==='lab/gpt-live-h5/app.js').sha,expirySeconds:14400,gatewayPid:pid}));`;
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
const result=run('ssh',['-F','/Users/tianyicai/v-upgrade-private/20260904/ssh-config','-o','BatchMode=yes','vlab91','sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node --input-type=module -e '+quote(script)],{input:JSON.stringify(input)});
console.log(result);
