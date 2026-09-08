// Keep old recovery material, but move verified inactive archives off the data disk.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'codex-db91-production-equivalent-20260908');
const dest='/var/lib/vlab-parity-recovery-20260908';
const sources=[
 '/root/data/disk/vlab-root-offload-20260831',
 '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/tmp/makaron-agent.before-auth-refresh.sqlite.parity-preserved.zst',
 '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/tmp/vcodex-auth-migrate-backup.parity-preserved.zst',
];
const hash=async p=>{const h=createHash('sha256');for await(const c of fs.createReadStream(p))h.update(c);return h.digest('hex');};
function entries(p){const st=fs.lstatSync(p);return st.isDirectory()?fs.readdirSync(p).flatMap(n=>entries(path.join(p,n))):[{path:p,st}];}
for(const src of sources){
 const target=path.join(dest,path.basename(src));assert.equal(fs.realpathSync(src),src);assert.equal(fs.realpathSync(target),target);
 const listing=entries(src),targetListing=entries(target);assert.equal(listing.length,targetListing.length);
 const checks=[];
 for(const {path:p,st}of listing){
  const q=p===src?target:path.join(target,path.relative(src,p));assert.equal(fs.lstatSync(q).size,st.size);
  if(st.isSymbolicLink()){
   assert(fs.lstatSync(q).isSymbolicLink());assert.equal(fs.readlinkSync(p),fs.readlinkSync(q));
   checks.push({relative:path.relative(src,p),bytes:0,link:fs.readlinkSync(p)});continue;
  }
  const ref=spawnSync('fuser',[p],{encoding:'utf8'});assert.equal(ref.status,1);assert.equal(ref.stderr.trim(),'');assert.equal(ref.stdout.trim(),'');
  const sha=await hash(p);assert.equal(await hash(q),sha);
  const now=fs.statSync(p);for(const k of ['size','mtimeMs','ctimeMs','ino','dev'])assert.equal(now[k],st[k]);
  checks.push({relative:p===src?'.':path.relative(src,p),bytes:st.size,sha256:sha});
 }
 assert.deepEqual(entries(src).map(x=>[x.path,x.st.size,x.st.mtimeMs]),listing.map(x=>[x.path,x.st.size,x.st.mtimeMs]));
 const record={at:new Date().toISOString(),source:src,target,files:checks};
 fs.appendFileSync(dest+'/relocation-manifest.jsonl',JSON.stringify({...record,phase:'verified'})+'\n',{mode:0o600});
 // Exact three allowlisted archive targets only; the verified copy is retained.
 if(fs.lstatSync(src).isDirectory())fs.rmSync(src,{recursive:true});else fs.unlinkSync(src);
 fs.symlinkSync(target,src);
 fs.appendFileSync(dest+'/relocation-manifest.jsonl',JSON.stringify({...record,phase:'complete'})+'\n',{mode:0o600});
 console.log(JSON.stringify({source:src,target,files:checks.length,reclaimedBytes:checks.reduce((a,x)=>a+x.bytes,0),recoverable:true}));
}
