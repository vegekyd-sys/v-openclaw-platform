import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export const GIB=1024**3;
export function isWithin(p,root){return p===root||p.startsWith(root+'/');}
export function inspectTree(root){
  assert.equal(fs.realpathSync(root),root,'Tree root must be canonical, not a symlink');
  const dev=fs.lstatSync(root).dev, entries=[];
  function visit(p){
    const s=fs.lstatSync(p);assert.equal(s.dev,dev,'Nested filesystem refused');
    assert(s.isDirectory()||s.isFile()||s.isSymbolicLink(),'Special file refused');
    entries.push({relative:path.relative(root,p),ino:s.ino,dev:s.dev,mode:s.mode,uid:s.uid,gid:s.gid,nlink:s.nlink,size:s.size,blocks:s.blocks,mtime:s.mtimeMs,ctime:s.ctimeMs,type:s.isDirectory()?'dir':s.isSymbolicLink()?'link':'file',link:s.isSymbolicLink()?fs.readlinkSync(p):null});
    if(s.isDirectory())for(const n of fs.readdirSync(p).sort())visit(path.join(p,n));
  }
  visit(root);return entries;
}
export function assertTreeMatches(actual,expected,message='Tree changed'){
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  if(digest(actual)===digest(expected))return;
  // Never pass whole inventories to assert.deepEqual: error formatting can grow
  // quadratically and exhaust host memory on a 20,000-entry mount mismatch.
  const index=new Map(expected.map(e=>[e.relative,e]));
  const samples=[];
  for(const e of actual){const old=index.get(e.relative);if(JSON.stringify(e)!==JSON.stringify(old)){samples.push({relative:e.relative,keys:Object.keys(e).filter(k=>e[k]!==old?.[k])});if(samples.length===3)break;}}
  throw new Error(message+': '+JSON.stringify({actualCount:actual.length,expectedCount:expected.length,samples}));
}
export function linkState(root,tree){
  return tree.filter(e=>e.type==='link').map(e=>{
    const p=path.join(root,e.relative);let target=null;
    try{const s=fs.statSync(p);target={type:s.isDirectory()?'dir':s.isFile()?'file':'other',size:s.size};}catch(err){if(!['ENOENT','ELOOP','ENOTDIR'].includes(err.code))throw err;}
    return {relative:e.relative,link:e.link,resolves:target!==null,target};
  });
}
export function noNewBrokenLinks(before,after){
  const index=new Map(after.map(e=>[e.relative,e]));
  for(const e of before){const a=index.get(e.relative);assert(a,'Symlink disappeared: '+e.relative);assert.equal(a.link,e.link,'Symlink content changed');if(e.resolves)assert(a.resolves,'New broken symlink: '+e.relative);}
}
export function processReferences(roots,{procRoot='/proc',self=process.pid}={}){
  const hits=[];
  for(const pid of fs.readdirSync(procRoot).filter(x=>/^\d+$/.test(x))){
    if(Number(pid)===self)continue;
    const base=path.join(procRoot,pid);
    const attempt=fn=>{try{return fn();}catch(e){if(['ENOENT','ESRCH','EINVAL'].includes(e.code))return undefined;throw e;}};
    const names=['cwd','exe','root',...(attempt(()=>fs.readdirSync(path.join(base,'fd')))||[]).map(n=>'fd/'+n)];
    for(const name of names){const p=attempt(()=>fs.readlinkSync(path.join(base,name)));if(p&&roots.some(r=>isWithin(p.replace(/ \(deleted\)$/,''),r)))hits.push({pid:Number(pid),kind:name});}
    const maps=attempt(()=>fs.readFileSync(path.join(base,'maps'),'utf8'))||'';
    if(roots.some(r=>maps.split('\n').some(l=>{const p=l.match(/\s(\/.*)$/)?.[1];return p&&isWithin(p.replace(/ \(deleted\)$/,''),r)})))hits.push({pid:Number(pid),kind:'map'});
    const cmd=attempt(()=>fs.readFileSync(path.join(base,'cmdline'),'utf8'))||'';
    if(roots.some(r=>cmd.split('\0').some(a=>a===r||a.startsWith(r+'/'))))hits.push({pid:Number(pid),kind:'command'});
  }
  return hits;
}
export function mountFacts(target,{allowOvermount=false}={}){
  const x=JSON.parse(execFileSync('findmnt',['--json','--target',target,'-o','TARGET,SOURCE,FSTYPE,UUID,FSROOT,OPTIONS'],{encoding:'utf8'}));
  if(allowOvermount&&x.filesystems.length>1){
    const visibleDevice=fs.statSync(target).dev;
    const visible=x.filesystems.filter(layer=>{
      const device=layer.source.split('[')[0];
      return device.startsWith('/dev/')&&fs.statSync(device).rdev===visibleDevice;
    });
    assert.equal(visible.length,1,'Ambiguous overmount; manual inspection required');return visible[0];
  }
  assert.equal(x.filesystems.length,1);return x.filesystems[0];
}
export function assertVolume(policy,{facts=mountFacts(policy.diskRoot),marker=JSON.parse(fs.readFileSync(policy.marker,'utf8')),allowReadOnlyMount=false}={}){
  assert.equal(facts.target,policy.diskRoot,'Data disk is not mounted at its exact mountpoint');
  assert.equal(facts.uuid,policy.diskUuid,'Wrong data disk UUID');
  assert.equal(facts.fstype,'ext4');assert(allowReadOnlyMount||facts.options.split(',').includes('rw'));
  assert.equal(marker.uuid,policy.diskUuid);assert.equal(marker.serial,policy.diskSerial);assert.equal(marker.purpose,'v-storage-governance');
}
export function assertMappings(policy,{allowReadOnlyDiskRoot=false}={}){
  assertVolume(policy,{allowReadOnlyMount:allowReadOnlyDiskRoot});
  for(const m of policy.mappings){
    const facts=mountFacts(m.original);assert.equal(facts.target,m.original,'Original path is not a bind mount: '+m.name);assert.equal(facts.uuid,policy.diskUuid);
    assert.equal(facts.fsroot,path.relative(policy.diskRoot,m.destination).replace(/^/,'/'),'Unexpected bind source');
    if(m.name==='cache')assert(facts.options.split(',').includes('rw')&&!facts.options.split(',').includes('ro'),'Cache cleanup path must remain writable even when the disk root is sandboxed read-only');
    const a=fs.statSync(m.original),b=fs.statSync(m.destination);assert.equal(a.dev,b.dev);assert.equal(a.ino,b.ino);
    for(const alias of m.aliases){assert.equal(fs.realpathSync(alias),m.original,'Alias changed');assert.equal(fs.statSync(alias).ino,b.ino);}
  }
}
export function diskUsage(p){const s=fs.statfsSync(p);return{availableBytes:s.bavail*s.bsize,totalBytes:s.blocks*s.bsize,usedBytes:(s.blocks-s.bfree)*s.bsize,percent:Math.ceil(100*(s.blocks-s.bfree)/(s.blocks-s.bfree+s.bavail))};}
export function pressure(policy,root,data){
  if(root.percent>=policy.criticalPercent||data.percent>=policy.criticalPercent)return'critical';
  if(root.percent>=policy.warningPercent||data.percent>=policy.warningPercent||root.availableBytes<policy.minimumRootFreeGiB*GIB||data.availableBytes<policy.minimumDataFreeGiB*GIB)return'warning';
  return'normal';
}
export function eligibleSnapshot(name,tree,{now=Date.now(),ageHours=48,pidExists}={}){
  const match=/^openclaw-sqlite-readonly-([1-9][0-9]*)-[A-Za-z0-9]{6}$/.exec(name);
  if(!match)return{eligible:false,reason:'unrecognized-name'};
  if(pidExists(Number(match[1])))return{eligible:false,reason:'creator-pid-still-exists'};
  if(tree.some(e=>e.type==='link'||e.nlink>1&&e.type==='file'))return{eligible:false,reason:'linked-content'};
  if(tree.some(e=>e.type==='dir'&&e.relative!==''))return{eligible:false,reason:'nested-content'};
  // `first` and `second` are OpenClaw's own staging copies (src/infra/sqlite-readonly-location.ts):
  // it copies the source twice, compares, renames `second` into place and removes `first`.
  // A process killed in between leaves them behind; they are copies of the same database.
  if(tree.some(e=>e.type==='file'&&!/^(?:(?:openclaw-agent|memory|snapshot|database)\.sqlite(?:-(?:wal|shm|journal))?|first|second)$/.test(e.relative)))return{eligible:false,reason:'unrecognized-content'};
  if(!tree.some(e=>e.type==='file'&&(e.relative.endsWith('.sqlite')||e.relative==='first'||e.relative==='second')))return{eligible:false,reason:'no-snapshot-database'};
  if(tree.some(e=>Math.max(e.mtime,e.ctime)>now-ageHours*3600_000))return{eligible:false,reason:'too-recent'};
  return{eligible:true,reason:'expired-orphan-readonly-snapshot'};
}
// A snapshot root that is not one of the verified bind mounts (Night Shift sets its
// own XDG_CACHE_HOME, so its snapshots land on the root disk). It must be a real,
// canonical directory owned by the service user; anything else is refused.
export function assertExtraSnapshotRoot(root,{uid}){
  assert(path.isAbsolute(root),'Snapshot root must be absolute');
  assert.equal(fs.realpathSync(root),root,'Snapshot root must be canonical, not a symlink');
  const s=fs.lstatSync(root);assert(s.isDirectory(),'Snapshot root must be a directory');
  assert.equal(s.uid,uid,'Snapshot root must belong to the service user');
}
// Remove expired orphan snapshots under each root. `roots` is [{dir, alternate?}],
// where alternate is the same directory seen through the data-disk path.
export function pruneSnapshots(roots,{apply,ageHours,maxDeletes,pidExists,references=processReferences,beforeDelete=()=>{},record=()=>{},now=Date.now()}){
  const actions=[],skipped=[];let deleted=0;
  for(const root of roots){
    const entries=fs.readdirSync(root.dir).filter(n=>/^openclaw-sqlite-readonly-/.test(n)).sort();
    for(const name of entries){
      const p=path.join(root.dir,name);let tree;
      try{tree=inspectTree(p);}catch(e){if(e.code==='ENOENT')continue;skipped.push({root:root.dir,name,reason:'unsafe-or-changing-tree'});continue;}
      const verdict=eligibleSnapshot(name,tree,{ageHours,pidExists,now});
      if(!verdict.eligible){skipped.push({root:root.dir,name,reason:verdict.reason});continue;}
      const paths=root.alternate?[p,path.join(root.alternate,name)]:[p];
      const busy=references(paths);
      if(busy.length){skipped.push({root:root.dir,name,reason:'in-use',processes:busy});continue;}
      if(deleted>=maxDeletes){skipped.push({root:root.dir,name,reason:'per-run-limit'});continue;}
      const bytes=tree.reduce((n,e)=>n+e.blocks*512,0);
      if(apply){
        beforeDelete();
        assert.equal(references(paths).length,0,'Snapshot acquired by a process');
        assert(!pidExists(Number(name.split('-')[3])),'Creator PID reappeared');
        unlinkTreeExact(p,tree);
        record({at:new Date().toISOString(),root:root.dir,name,reason:verdict.reason,allocatedBytes:bytes});
      }
      deleted++;
      actions.push({root:root.dir,name,action:apply?'removed-expired-snapshot':'would-remove-expired-snapshot',bytes});
    }
  }
  return{actions,skipped};
}
export function unlinkTreeExact(root,expected,{allowLinks=false,keepRoot=false}={}){
  assertTreeMatches(inspectTree(root),expected,'Tree changed before deletion');
  if(!allowLinks)assert(!expected.some(e=>e.type==='link'),'Links prohibited');
  // Never follow symlinks and never recursively delete an unresolved path.
  for(const e of [...expected].reverse()){
    if(keepRoot&&e.relative==='')continue;
    const p=path.join(root,e.relative);assert(isWithin(p,root));const s=fs.lstatSync(p);assert.equal(s.ino,e.ino);assert.equal(s.dev,e.dev);
    if(e.type==='dir')fs.rmdirSync(p);else{assert.equal(s.size,e.size);assert.equal(s.mtimeMs,e.mtime);if(e.type==='link')assert.equal(fs.readlinkSync(p),e.link);fs.unlinkSync(p);}
  }
}
export function writeJsonAtomic(file,value){
  const temp=file+'.tmp.'+process.pid;fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file);
}
