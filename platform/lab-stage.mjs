// Candidate-only bootstrap. Not the future production installer.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {target,sourceCommit,treeHash,readJson,run,service,record,digest} from './lab-instance.mjs';

const [action,name,owner]=process.argv.slice(2);
assert(['worker91','worker-candidate','core92','select91','select92'].includes(action),'worker91|worker-candidate|core92|select91|select92 INSTANCE OWNER');
const m=target(name,owner,{stopped:true});const root=m.root,commit=sourceCommit(m);
const integration=service('openclaw-vlab-production-mirror-v8.service');
if(action==='worker91'||action==='worker-candidate'){
  const hostVersion=readJson(`${root}/runtime/openclaw/package.json`).version;
  assert(['2026.9.1','2026.9.2'].includes(hostVersion));
  if(action==='worker91')assert.equal(hostVersion,'2026.9.1');
  const src=`${root}/source/experiments/agent-worker-isolation-v1`,dest=`${root}/runtime/worker`;
  assert.equal(readJson(`${src}/package.json`).version,'0.2.11');
  const backup=action==='worker91'?`${root}/runtime/worker-before-v-platform`:`${root}/runtime/worker-before-${commit}`;
  assert(!fs.existsSync(backup),'Worker bootstrap already performed');
  const before=treeHash(dest),after=treeHash(src);
  fs.cpSync(src,`${dest}.vplatform-stage`,{recursive:true,errorOnExist:true,force:false});
  assert.deepEqual(treeHash(`${dest}.vplatform-stage`),after);
  run('chown',['-R',`${m.user}:${m.user}`,`${dest}.vplatform-stage`]);
  fs.renameSync(dest,backup);fs.renameSync(`${dest}.vplatform-stage`,dest);
  assert.deepEqual(service('openclaw-vlab-production-mirror-v8.service'),integration);
  record(m,'worker-staged',{commit,hostVersion,version:'0.2.11',candidateBuild:action==='worker-candidate',before,after,configChanged:false,sharedGatewayUnchanged:true,accepted:false});
}else if(action==='select91'||action==='select92'){
  const version=action==='select91'?'2026.9.1':'2026.9.2';
  const dest=action==='select91'?`${root}/runtime/openclaw-before-92`:`${root}/runtime/core92/node_modules/openclaw`;
  const current=`${root}/runtime/openclaw`,temporary=`${root}/runtime/openclaw-switch-${commit}`;
  assert(fs.lstatSync(current).isSymbolicLink(),'Only a previously staged private core link may switch');
  assert.equal(readJson(`${dest}/package.json`).version,version);
  assert(fs.realpathSync(dest).startsWith(root+'/runtime/'));
  assert(!fs.existsSync(temporary));
  fs.symlinkSync(dest,temporary,'dir');fs.renameSync(temporary,current);
  assert.deepEqual(service('openclaw-vlab-production-mirror-v8.service'),integration);
  record(m,'core-selected',{commit,version,previousCodeRetained:true,stateRestored:false,stateOverwritten:false,sharedGatewayUnchanged:true,accepted:false});
}else{
  const candidate=`${root}/runtime/core92/node_modules/openclaw`;
  assert.equal(readJson(`${candidate}/package.json`).version,'2026.9.2');
  const lockFile=`${root}/runtime/core92/package-lock.json`,lock=readJson(lockFile),pkg=lock.packages['node_modules/openclaw'];
  assert.equal(pkg.version,'2026.9.2');
  assert.equal(pkg.integrity,'sha512-M6C7UsnX815nv26qBJFYGe6aGzv+ftZLRzV6S9oRXUtXg2Yn67eVntpssT94kgkquKVSeUxerUg0j1ONp4WYQg==');
  const current=`${root}/runtime/openclaw`,backup=`${root}/runtime/openclaw-before-92`;
  assert(!fs.existsSync(backup),'9.2 candidate already staged');assert(!fs.lstatSync(current).isSymbolicLink());
  assert.equal(readJson(`${current}/package.json`).version,'2026.9.1');
  const checkpoint=`${root}/state-before-92`;assert(!fs.existsSync(checkpoint));
  fs.cpSync(`${root}/state`,checkpoint,{recursive:true,errorOnExist:true,force:false});
  fs.renameSync(current,backup);fs.symlinkSync(candidate,current,'dir');
  assert(fs.realpathSync(current).startsWith(root+'/runtime/'));
  assert.deepEqual(service('openclaw-vlab-production-mirror-v8.service'),integration);
  record(m,'core92-staged',{commit,version:'2026.9.2',lockSha256:digest(fs.readFileSync(lockFile)),integrity:pkg.integrity,
    previousCoreRetained:true,privateStateCheckpoint:true,sharedGatewayUnchanged:true,
    constraints:['Existing 9.1 plugin payloads still require reconciliation','npm lifecycle scripts were not executed','No real business state was copied','Not a clean-install or production-rollback acceptance'],accepted:false});
}
