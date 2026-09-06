import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export const LAB_ROOT='/srv/vlab-production-mirror/labs';
export const NODE='/opt/vlab/node-v22.23.1-linux-x64/bin/node';
export const digest=data=>createHash('sha256').update(data).digest('hex');
export const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export const run=(bin,args,options={})=>execFileSync(bin,args,{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,...options}).trim();
export const service=unit=>Object.fromEntries(run('systemctl',['show',unit,'-p','ActiveState,MainPID,NRestarts']).split('\n').map(line=>{const n=line.indexOf('=');return [line.slice(0,n),line.slice(n+1)];}));
export function target(name,owner,{stopped=false}={}){
  assert.equal(os.hostname(),'VM-0-4-ubuntu','VLab host required');
  assert.equal(process.getuid(),0,'Owner-checked controller runs as root on VLab');
  assert.match(name??'',/^[a-z][a-z0-9-]{1,23}$/);assert(owner);
  const m=readJson(`${LAB_ROOT}/control/${name}.json`);
  assert.equal(m.name,name);assert.equal(m.owner,owner);assert.equal(m.root,`${LAB_ROOT}/instances/${name}`);
  assert.equal(fs.realpathSync(m.root),m.root);assert.equal(m.user,`lab-${name}`);assert.equal(m.unit,`openclaw-lab-${name}.service`);
  const config=readJson(`${m.root}/state/openclaw.json`);
  assert.equal(config.gateway.port,m.port);assert.equal(config.gateway.bind,'loopback');assert(config.gateway.auth.token);
  assert.equal(Object.keys(config.channels??{}).length,0);assert.equal(config.cron.enabled,false);assert.equal(config.browser.enabled,false);
  if(stopped)assert.equal(service(m.unit).MainPID,'0','Stop only the owned instance with labctl before changing runtime');
  return m;
}
export function sourceCommit(m){
  // Native Gateway PATH excludes sbin. Nested probes inherit that environment,
  // but this owner check must still resolve the fixed administrator utility.
  const git=args=>run('/usr/sbin/runuser',['-u',m.user,'--','/usr/bin/git','-C',`${m.root}/source`,...args]);
  assert.equal(git(['status','--porcelain']),'','Source must be committed');
  return git(['rev-parse','HEAD']);
}
export function treeHash(root){
  const h=createHash('sha256');let files=0;
  const walk=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const p=path.join(dir,item.name);const rel=path.relative(root,p);assert(!item.isSymbolicLink(),`Unexpected source symlink ${rel}`);
    if(item.isDirectory())walk(p);else if(item.isFile()){h.update(rel+'\0');h.update(fs.readFileSync(p));files++;}
  }};
  walk(root);return {sha256:h.digest('hex'),files};
}
export function record(m,kind,data){
  const dir=`${m.root}/platform-evidence`;fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const out=`${dir}/${new Date().toISOString().replaceAll(':','-')}-${kind}.json`;
  fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),instance:m.name,owner:m.owner,kind,...data},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({out,kind,...data}));return out;
}
