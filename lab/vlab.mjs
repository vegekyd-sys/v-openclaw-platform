#!/usr/bin/env node
// Local control plane: all remote traffic uses the established VLab-only SSH alias.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {name,relative,sha,read,save} from './shared/files.mjs';
import {candidate} from './candidate/client.mjs';
import {sourceBundle} from './shared/source.mjs';
const SSH=['-F','/Users/tianyicai/v-upgrade-private/20260904/ssh-config','-o','BatchMode=yes','-o','ConnectTimeout=10','vlab91'];
const REMOTE='sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab-production-mirror/labs/shared-workflow/tool/server.mjs';
const run=(bin,args,opts={})=>execFileSync(bin,args,{encoding:'utf8',maxBuffer:96*1024**2,timeout:600000,...opts}).trim();
const git=(dir,args)=>run('git',['-C',dir,...args]);
const remote=req=>JSON.parse(os.hostname()==='VM-0-4-ubuntu' ? run('/opt/vlab/node-v22.23.1-linux-x64/bin/node',['/srv/vlab-production-mirror/labs/shared-workflow/tool/server.mjs'],{input:JSON.stringify(req)}) : run('ssh',[...SSH,REMOTE],{input:JSON.stringify(req)}));
const [command,...args]=process.argv.slice(2);const opts={};
for(let i=0;i<args.length;i+=2){assert(args[i].startsWith('--')&&args[i+1],'Use --option value');opts[args[i].slice(2)]=args[i+1];}
function repo() {return path.resolve(git(opts.repo??process.cwd(),['rev-parse','--path-format=absolute','--git-common-dir']));}
function registry(){return read(repo()+'/vlab-workflow.json');}
function clean(dir) {assert(!git(dir,['status','--porcelain']),'Commit or preserve dirty changes before integration');}
function dev() {const r=registry();assert.equal(git(r.dev,['branch','--show-current']),'dev');return r.dev;}
function lock(fn) {
  const dir=repo()+'/vlab-merge.lock';fs.mkdirSync(dir);
  try{return fn();}finally{fs.rmdirSync(dir);}
}
try {
  let result;
  if(command==='candidate') {
    result=candidate(opts); if(!result.ok)process.exitCode=1;
  } else if(command==='init') {
    const common=repo(),dest=path.resolve(opts.path);assert(opts.base,'Explicit baseline commit required');
    assert(!fs.existsSync(common+'/vlab-workflow.json'),'Already initialized');
    const commit=git(opts.repo??process.cwd(),['rev-parse',opts.base+'^{commit}']);
    assert(!fs.existsSync(dest),'Destination already exists');
    git(opts.repo??process.cwd(),['worktree','add','-b','dev',dest,commit]);
    save(common+'/vlab-workflow.json',{dev:dest,base:commit,sshAlias:'vlab91'});result={dev:dest,commit};
  } else if(command==='new') {
    const task=name(opts.task),base=dev(),dest=path.resolve(opts.path??path.join(path.dirname(base),'v-worktrees',task));
    assert(opts.owner,'Task owner required');assert(!fs.existsSync(dest));
    const baseCommit=git(base,['rev-parse','HEAD']);
    git(base,['worktree','add','-b','codex/'+task,dest,baseCommit]);
    const admin=git(dest,['rev-parse','--absolute-git-dir']);
    save(admin+'/vlab-task.json',{owner:opts.owner,base:baseCommit,task,createdAt:new Date().toISOString()});
    result={worktree:dest,branch:'codex/'+task,base:baseCommit,runtimeCopied:false,stateCopied:false,dependencies:'Use shared package cache; no writable node_modules link created'};
  } else if(command==='merge') {
    assert(os.hostname()!=='VM-0-4-ubuntu','Canonical dev integration runs on the Mac; export the committed task branch as a Git bundle for import there');
    result=lock(()=>{
      const d=dev();clean(d);assert(/^codex\/[a-z0-9][a-z0-9-]*$/.test(opts.branch??''),'Task branch required');
      const branchCommit=git(d,['rev-parse',opts.branch+'^{commit}']);assert.equal(branchCommit,opts.commit,'Task branch advanced; review exact commit');
      // Git itself refuses unresolved conflicts. Never reset or auto-resolve another task's files.
      run('git',['-C',d,'merge','--no-ff','--no-edit',opts.branch]);clean(d);
      return {dev:d,commit:git(d,['rev-parse','HEAD']),validation:'Run relevant tests on this merged commit before packaging'};
    });
  } else if(command==='package') {
    const d=dev();clean(d);const id=name(opts.id),commit=git(d,['rev-parse','HEAD']);assert.equal(opts.commit,commit,'Use exact tested dev commit');
    const plan=read(opts.plan);assert(Array.isArray(plan.files));
    const files=plan.files.map(f=>{relative(f.source);relative(f.target);const content=execFileSync('git',['-C',d,'show',commit+':'+f.source],{maxBuffer:64*1024**2});return {...f,before:f.before,content:content.toString('base64'),after:sha(content)};});
    result={command:'stage',id,sourceCommit:commit,branch:'dev',baseRelease:plan.baseRelease,owner:opts.owner,files};
    assert(opts.owner);const dest=path.resolve(opts.output??path.join(d,'tmp','vlab',id+'.json'));save(dest,result);
    result={artifact:dest,sourceCommit:commit,files:files.length};
  } else if(command==='sync') {
    const d=dev();clean(d);const commit=git(d,['rev-parse','HEAD']);assert(opts.owner);
    const remoteCommit=remote({command:'status'}).devSource?.commit;
    const bundle=sourceBundle(d,remoteCommit);
    assert.equal(bundle.commit,commit,'dev advanced during sync preparation; retry with the current commit');
    result=bundle.bytes
      ? remote({command:'sync',owner:opts.owner,sourceCommit:commit,bundle:bundle.bytes.toString('base64')})
      : {devSourceCommit:commit,bundleBytes:0,skipped:true,runtimeChanged:false};
  } else if(command==='status')result=remote({command:'status'});
  else if(command==='lease') {
    assert(/^[\w-]+$/.test(opts.owner??''),'Owner required');assert(['true','false',undefined].includes(opts.release));
    result=os.hostname()==='VM-0-4-ubuntu' ? run('/usr/local/bin/labctl',['lease','integration','--owner',opts.owner,...(opts.release==='true'?['--release','true']:[])]) : run('ssh',[...SSH,`sudo labctl lease integration --owner ${opts.owner}${opts.release==='true'?' --release true':''}`]);
  } else if(command==='stage') {
    const artifact=read(opts.artifact),d=dev();clean(d);
    assert.equal(artifact.command,'stage');assert.equal(artifact.sourceCommit,git(d,['rev-parse','HEAD']),'dev advanced since packaging; package merged result again');result=remote(artifact);
  } else if(command==='align') {
    // Mark shared VLab as equal to production V. Runs the parity check from dev
    // here (it needs SSH to both hosts, which VLab itself must not have).
    assert(opts.owner,'Owner required');const d=dev();
    const before=remote({command:'status'}).current;
    let out;try{out=run('node',[path.join(d,'scripts/vlab-v-parity.mjs'),'--json'],{timeout:1800000});}catch(e){out=e.stdout;}
    const parity=JSON.parse(out);
    if(parity.state!=='ALIGNED')throw Error(`Parity is ${parity.state}, not ALIGNED:\n`+parity.findings.map(f=>`  ${f.kind} ${f.target}`).join('\n'));
    result=remote({command:'align',owner:opts.owner,parity:parity.state,runtimeSha:before.runtimeSha,vCore:parity.vCore,compared:String(parity.compared)});
  } else if(['deploy','rollback','accept','baseline'].includes(command)) {
    const {repo:unused,...params}=opts;result=remote({command,...params});
  } else if(command==='rpc')result=remote({command:'rpc',method:opts.method,params:opts.params?JSON.parse(opts.params):{}});
  else if(command==='read-code')result=remote({command:'read-code',target:opts.target});
  else if(command==='test')result=remote({command:'test',owner:opts.owner,task:opts.task,agent:opts.agent,sessionKey:opts.sessionKey,message:opts.message,idempotencyKey:opts.idempotencyKey});
  else throw Error('Commands: candidate, init, new, merge, package, lease, status, read-code, stage, deploy, rollback, accept, align, rpc, test, sync, baseline. See lab/README.md');
  console.log(typeof result==='string'?result:JSON.stringify(result,null,2));
} catch(e) {console.error(e.message);process.exitCode=1;}
