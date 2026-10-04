#!/usr/bin/env node
// Explicit PR-only exception for the user's shared VLab acceptance request.
// Uses the existing lease, operation lock, idle fence, journal and rollback.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PR_URL,PR_BRANCH,digest,validatePrCandidate,buildPrController} from './gpt-live-pr-provenance.mjs';
import {relative,name} from './shared/files.mjs';
import {GPT_LIVE_CALL_INSTRUCTIONS} from './gpt-live-h5/instructions.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SSH=['-F','/Users/tianyicai/v-upgrade-private/20260904/ssh-config','-o','BatchMode=yes','-o','ConnectTimeout=10','vlab91'];
const NODE='/opt/vlab/node-v22.23.1-linux-x64/bin/node';
const HOME='/srv/vlab-production-mirror/labs/shared-workflow';
const run=(bin,args,extra={})=>execFileSync(bin,args,{encoding:'utf8',timeout:60000,maxBuffer:96*1024**2,...extra}).trim();
const git=(...args)=>run('git',['-C',root,...args]);
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
const [command,...args]=process.argv.slice(2),opts={};
for(let i=0;i<args.length;i+=2){assert(args[i].startsWith('--')&&args[i+1]);opts[args[i].slice(2)]=args[i+1];}
function save(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});}
function prHead(commit) {
  const pr=JSON.parse(run('gh',['pr','view','154','--repo','vegekyd-sys/v-openclaw-platform','--json','url,state,headRefName,headRefOid,baseRefName']));
  assert.equal(pr.url,PR_URL);assert.equal(pr.state,'OPEN');assert.equal(pr.headRefName,PR_BRANCH);assert.equal(pr.baseRefName,'dev');assert.equal(pr.headRefOid,commit,'Push the tested PR commit before deploying');
}
function remote(req,dir){return JSON.parse(run('ssh',[...SSH,`sudo ${NODE} ${quote(dir+'/server.mjs')}`],{input:JSON.stringify(req),timeout:['deploy','rollback'].includes(req.command)?1800000:600000}));}
try {
  let result;
  if(command==='package') {
    assert.equal(git('status','--porcelain'),'','Commit the tested candidate first');
    assert.equal(git('branch','--show-current'),PR_BRANCH);
    const commit=git('rev-parse','HEAD');assert.equal(opts.commit,commit);prHead(commit);
    assert(/^[\w-]+$/.test(opts.owner??''));
    assert(opts['metadata-trace']===undefined||['true','false'].includes(opts['metadata-trace']),'Metadata trace accepts only true or false');
    const trialMetadataTrace=opts['metadata-trace']==='true';
    const plan=JSON.parse(fs.readFileSync(opts.plan));
    const files=plan.files.map(f=>{
      relative(f.source);relative(f.target);
      const content=execFileSync('git',['-C',root,'show',commit+':'+f.source],{maxBuffer:64*1024**2});
      return {...f,content:content.toString('base64'),after:digest(content)};
    });
    const artifact={command:'stage',id:name(opts.id),owner:opts.owner,branch:PR_BRANCH,sourceCommit:commit,baseRelease:plan.baseRelease,files,candidatePr:{url:PR_URL,head:commit,productionAuthorized:false},trialInstructions:GPT_LIVE_CALL_INSTRUCTIONS,trialMetadataTrace};
    const policy={owner:opts.owner,releaseId:artifact.id,prUrl:PR_URL,branch:PR_BRANCH,sourceCommit:commit,baseRelease:plan.baseRelease,filesSha:digest(JSON.stringify(files)),trialInstructionsSha:digest(GPT_LIVE_CALL_INSTRUCTIONS),trialMetadataTrace};
    validatePrCandidate(artifact,policy);
    save(opts.output,{artifact,policy});result={artifact:opts.output,sourceCommit:commit,files:files.length};
  } else {
    const packed=JSON.parse(fs.readFileSync(opts.artifact));const {artifact,policy}=packed;
    validatePrCandidate(artifact,policy);
    const dir=HOME+'/tmp/gpt-live-pr154-'+policy.sourceCommit.slice(0,12)+'/tool';
    if(command==='install') {
      prHead(policy.sourceCommit);
      const files=['files.mjs','lifecycle.mjs'].map(f=>({name:f,content:fs.readFileSync(path.join(root,'lab/shared',f)).toString('base64')}));
      files.push({name:'server.mjs',content:Buffer.from(buildPrController(fs.readFileSync(path.join(root,'lab/shared/server.mjs'),'utf8'))).toString('base64')},
        {name:'gpt-live-pr-provenance.mjs',content:fs.readFileSync(path.join(root,'lab/gpt-live-pr-provenance.mjs')).toString('base64')},
        {name:'gpt-live-pr-config.mjs',content:fs.readFileSync(path.join(root,'lab/gpt-live-pr-config.mjs')).toString('base64')},
        {name:'gpt-live-pr-trace.mjs',content:fs.readFileSync(path.join(root,'lab/gpt-live-pr-trace.mjs')).toString('base64')},
        {name:'policy.json',content:Buffer.from(JSON.stringify(policy)).toString('base64')});
      const input={dir,owner:policy.owner,files,globalHashes:Object.fromEntries(['server.mjs','files.mjs','lifecycle.mjs'].map(f=>[f,digest(fs.readFileSync(path.join(root,'lab/shared',f)))]))};
      const bootstrap=`import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';let s='';for await(const b of process.stdin)s+=b;const r=JSON.parse(s);const home='${HOME}';assert.equal(process.getuid(),0);assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,r.owner);for(const [f,h]of Object.entries(r.globalHashes))assert.equal(createHash('sha256').update(fs.readFileSync(home+'/tool/'+f)).digest('hex'),h,'Platform controller changed; review first');assert(!fs.existsSync(r.dir),'Private controller already installed');fs.mkdirSync(r.dir,{recursive:true,mode:0o700});for(const f of r.files)fs.writeFileSync(r.dir+'/'+f.name,Buffer.from(f.content,'base64'),{mode:0o600,flag:'wx'});console.log(JSON.stringify({dir:r.dir,globalControllerChanged:false}));`;
      result=JSON.parse(run('ssh',[...SSH,`sudo ${NODE} --input-type=module -e ${quote(bootstrap)}`],{input:JSON.stringify(input)}));
    } else if(command==='stage'){prHead(policy.sourceCommit);result=remote(artifact,dir);}
    else if(['status','deploy','rollback'].includes(command))result=remote({command,owner:policy.owner,id:artifact.id},dir);
    else throw Error('Use package, install, stage, deploy, rollback or status');
  }
  console.log(JSON.stringify(result,null,2));
} catch(e){console.error(e.message);process.exitCode=1;}
