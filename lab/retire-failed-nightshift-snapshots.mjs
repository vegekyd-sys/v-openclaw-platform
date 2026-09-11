import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectTree,processReferences,unlinkTreeExact,diskUsage,assertMappings} from '/usr/local/lib/v-storage-governance/core.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
assert(fs.readFileSync('/proc/self/cgroup','utf8').includes('retire-failed-nightshift-20260911'));
const policy=JSON.parse(fs.readFileSync('/usr/local/lib/v-storage-governance/policy.json'));assertMappings(policy);
const current='/home/openclaw/.openclaw/nightshift';
const archive=policy.diskRoot+'/openclaw/backups/storage-maintenance/retired-nightshift-failures-20260911';
fs.mkdirSync(archive,{mode:0o700});
async function digest(file){const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
function verifyPayload(tree){
 for(const e of tree){if(e.type==='dir'||e.relative==='nightshift.sqlite')continue;const p=path.join(current,e.relative),s=fs.lstatSync(p);assert.equal(s.size,e.size,'Retained size changed: '+e.relative);assert.equal(s.mtimeMs,e.mtime,'Retained mtime changed: '+e.relative);if(e.type==='link')assert.equal(fs.readlinkSync(p),e.link);else assert(s.isFile());}
}
for(const name of ['nightshift.failed-20260909T084552Z','nightshift.failed-20260909T085819Z']){
 const root='/home/openclaw/.openclaw/'+name,tree=inspectTree(root);assert.equal(tree.length,10880);verifyPayload(tree);assert.equal(processReferences([root]).length,0);
 const source=root+'/nightshift.sqlite',target=archive+'/'+name+'.sqlite';assert.equal(fs.statSync(source).size,307273728);
 fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);fs.chmodSync(target,0o600);const fd=fs.openSync(target,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const expected=await digest(source);assert.equal(await digest(target),expected,'Historical database copy hash mismatch');
 const report={at:new Date().toISOString(),reason:'Retired failed deployment snapshot; historical database retained with SHA256; old payload paths, sizes and mtimes match current Night Shift',root,current,database:target,sha256:expected,inventory:tree,before:{root:diskUsage('/'),data:diskUsage(policy.diskRoot)}};
 fs.writeFileSync(archive+'/'+name+'.json',JSON.stringify(report),{flag:'wx',mode:0o600});
 verifyPayload(tree);assert.equal(processReferences([root]).length,0);assertMappings(policy);
 console.log(JSON.stringify({event:'historical-database-verified',name,archive:target,retiringBytes:tree.reduce((n,e)=>n+e.blocks*512,0)}));
 unlinkTreeExact(root,tree,{allowLinks:true});
 console.log(JSON.stringify({event:'retired',name,after:{root:diskUsage('/'),data:diskUsage(policy.diskRoot)}}));
}
