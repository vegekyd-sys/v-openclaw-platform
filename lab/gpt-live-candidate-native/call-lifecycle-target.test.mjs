import assert from 'node:assert/strict';
import test from 'node:test';
import {H5_PATHS} from '../gpt-live-h5-release.mjs';
import {createHash} from 'node:crypto';
import {validateLifecycleTargetIdentity,validateLifecycleReleaseIdentity,mapLifecycleRuntimeTarget,preflightLifecycleMedia} from './call-lifecycle-target.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');

function fixture(target='shared') {
 const gateway={unit:target==='v'?'openclaw-gateway.service':'openclaw-vlab-production-mirror-v8.service',pid:40,startTicks:'1234',corePath:target==='v'?'/opt/release/core':'/srv/vlab/runtime/openclaw',configPath:target==='v'?'/home/openclaw/.openclaw/openclaw.json':'/srv/vlab/state/openclaw.json',stateRoot:target==='v'?'/home/openclaw/.openclaw':'/srv/vlab/state',configSha256:'a'.repeat(64)};
 const h5={unit:'gpt-live-test.service',pid:50,startTicks:'5678',root:'/opt/gpt-live-test',url:'http://127.0.0.1:26244/',files:H5_PATHS.map(name=>({name,sha:'b'.repeat(64)}))};
 const expected={schema:'gpt-live-call-validation-target-v1',target,validationId:'own-test-unique',release:'actual-release',sourceCommit:'c'.repeat(40),artifactSha:'d'.repeat(64),owner:'test-owner',gateway,h5,runtimeFiles:[{target:'openclaw/dist/talk.js',after:'e'.repeat(64)}]};
 expected.sharedAccepted={schema:'gpt-live-h5-accepted-v1',release:expected.release,sourceCommit:expected.sourceCommit,artifactSha:expected.artifactSha,
  h5FilesSha:hash(JSON.stringify(h5.files)),h5AcceptanceSha:'f'.repeat(64),runtimeFiles:structuredClone(expected.runtimeFiles)};
 const active=v=>({...structuredClone(v),activeState:'active',subState:'running',cgroup:'0::/system.slice/'+v.unit});
 const actual={target,gateway:{...active(gateway),port:target==='v'?18789:24993},h5:{...active(h5),configPath:gateway.configPath,corePath:gateway.corePath},runtimeFiles:structuredClone(expected.runtimeFiles),integrationOwner:target==='shared'?'test-owner':null};
 actual.release=target==='shared'?{pendingPresent:false,current:{release:expected.release,sourceCommit:expected.sourceCommit,artifactSha:expected.artifactSha,accepted:false},
  manifest:{sourceCommit:expected.sourceCommit,branch:'dev',artifactSha:expected.artifactSha,runtimeFiles:structuredClone(expected.runtimeFiles)},artifactSha:expected.artifactSha}:
  {runtimeFiles:structuredClone(expected.runtimeFiles)};
 return {expected,actual};
}
test('shared and production retain distinct service/core/config/H5 provenance',()=>{
 for(const target of ['shared','v']){const f=fixture(target);assert.equal(validateLifecycleTargetIdentity(f.expected,f.actual).target,target);}
 const f=fixture();f.actual.target='candidate';assert.throws(()=>validateLifecycleTargetIdentity(f.expected,f.actual));
});
test('canonical foreground subgroup remains inside the exact MainPID service',()=>{
 const f=fixture();f.actual.gateway.cgroup+='\/foreground';assert(validateLifecycleTargetIdentity(f.expected,f.actual));
 for(const cgroup of ['0::/other.service/foreground','0::/system.slice/'+f.expected.gateway.unit+'-neighbor/foreground']){
  const other=fixture();other.actual.gateway.cgroup=cgroup;assert.throws(()=>validateLifecycleTargetIdentity(other.expected,other.actual));
 }
});
test('staged shared release may be tested but pending or unrelated canonical artifact cannot',()=>{
 const f=fixture();assert.equal(validateLifecycleTargetIdentity(f.expected,f.actual).release.accepted,false);
 for(const alter of [r=>r.pendingPresent=true,r=>r.current.release='neighbor',r=>r.current.sourceCommit='f'.repeat(40),
  r=>r.manifest.branch='other',r=>r.artifactSha='f'.repeat(64),r=>r.current.artifactSha=null,r=>r.manifest.runtimeFiles=[]]){
  const v=fixture();alter(v.actual.release);assert.throws(()=>validateLifecycleTargetIdentity(v.expected,v.actual));
 }
});
test('actual canonical unaccepted current binds the manifest and artifact before acceptance adds artifactSha',()=>{
 const f=fixture();delete f.actual.release.current.artifactSha;
 assert.equal(validateLifecycleTargetIdentity(f.expected,f.actual).release.artifactSha,f.expected.artifactSha);
 for(const change of [r=>r.current.accepted=true,r=>delete r.current.accepted,r=>r.manifest.artifactSha='f'.repeat(64),
   r=>r.artifactSha='f'.repeat(64),r=>r.manifest.sourceCommit='f'.repeat(40),r=>r.manifest.runtimeFiles=[]]){
  const value=structuredClone(f);change(value.actual.release);assert.throws(()=>validateLifecycleTargetIdentity(value.expected,value.actual));
 }
});
test('V must retain the same shared accepted runtime and H5 proof',()=>{
 const f=fixture('v');assert(validateLifecycleReleaseIdentity(f.expected,f.actual.release));
 for(const alter of [v=>v.expected.sharedAccepted=null,v=>v.expected.sharedAccepted.h5FilesSha='e'.repeat(64),
  v=>v.expected.sharedAccepted.release='neighbor',v=>v.actual.release.runtimeFiles[0].after='f'.repeat(64)]){
  const v=fixture('v');alter(v);assert.throws(()=>validateLifecycleTargetIdentity(v.expected,v.actual));
 }
});
test('production Worker is sibling worker; shared Worker is production-worker',()=>{
 assert.equal(mapLifecycleRuntimeTarget('v','/opt/release/core','production-worker/worker-pool.mjs'),'/opt/release/worker/worker-pool.mjs');
 assert.equal(mapLifecycleRuntimeTarget('shared','/srv/runtime/openclaw','production-worker/worker-pool.mjs'),'/srv/runtime/production-worker/worker-pool.mjs');
 assert.throws(()=>mapLifecycleRuntimeTarget('v','/opt/core','production-worker/../shared.js'));
});
test('missing media or unhashed explicit media path fails before paid voice',()=>{
 assert.throws(()=>preflightLifecycleMedia({chrome:{path:'/nonexistent/private-media',sha256:'e'.repeat(64)}}));
 assert.throws(()=>preflightLifecycleMedia({chrome:{path:'/bin/sh'}}),/frozen hash/u);
});
test('PID reuse, foreign unit/core/config or changed artifact bytes stop before native call',()=>{
 for(const alter of [a=>a.gateway.pid++,a=>a.gateway.startTicks='1235',a=>a.gateway.cgroup='0::/other',a=>a.gateway.corePath='/opt/other',
  a=>a.gateway.configSha256='f'.repeat(64),a=>a.h5.configPath='/wrong',a=>a.h5.files[1].sha='f'.repeat(64),a=>a.runtimeFiles[0].after='f'.repeat(64),
  a=>a.h5.activeState='inactive',a=>a.integrationOwner='neighbor']){const f=fixture();alter(f.actual);assert.throws(()=>validateLifecycleTargetIdentity(f.expected,f.actual));}
});
test('missing or incomplete eleven-file H5 proof and mislabeled production are refused',()=>{
 for(const alter of [f=>f.expected.h5.files.pop(),f=>f.expected.artifactSha=null,f=>f.actual.h5.url='https://public.example/',
  f=>f.expected.gateway.unit='other.service']){const f=fixture();alter(f);assert.throws(()=>validateLifecycleTargetIdentity(f.expected,f.actual));}
 const f=fixture('v');f.expected.gateway.corePath='/srv/vlab/runtime/openclaw';f.actual.gateway.corePath=f.expected.gateway.corePath;f.actual.h5.corePath=f.actual.gateway.corePath;
 assert.throws(()=>validateLifecycleTargetIdentity(f.expected,f.actual));
});
