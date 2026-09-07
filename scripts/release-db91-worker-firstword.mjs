// Production code-only release. Stage is inert; apply/restore require a stopped unit.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {replacePublicCode} from './db91-firstword-files.mjs';
import {filename as nativeLookupName,beforeSha as nativeLookupBeforeSha,patchWorkspaceSessionLookup} from '../experiments/db91-session-lookup/plan.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const action=process.argv[2];assert(['stage','apply','restore','verify','verify-restore'].includes(action));
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root='/home/openclaw/.openclaw',unit='openclaw-gateway.service',plugin='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.11-steer91';
const evidence=root+'/backups/db91-firstword-20260907',manifestFile=evidence+'/manifest.json';
const hash=b=>createHash('sha256').update(b).digest('hex');
const value=p=>fs.existsSync(p)?fs.readFileSync(p):null;
const fileHash=p=>{const b=value(p);return b===null?null:hash(b);};
const sha=execFileSync('git',['-c','safe.directory='+source,'-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();assert(/^[a-f0-9]{40}$/.test(sha));
assert.equal(execFileSync('git',['-c','safe.directory='+source,'-C',source,'status','--porcelain'],{encoding:'utf8'}).trim(),'');
const expected={
 'index.mjs':'392b6473f02fe94123d8d654cad48066a6a2afd68ec39d3baa78c8240de78bb8',
 'worker-pool.mjs':'7b61b6a859277ada60666d05709595b5feb09d83928e1e644c7310635c656748',
 'worker.mjs':'921c637a82ade948febe2670c5487b5f9505863bb0c07f8ef9cd6c68523a749c',
 'native-attempt-bridge.mjs':'9708da5aa2cbc45518ba190ef5a3c3004c09816011ff4e4207aa9e3ff6abf41e',
 'gateway-public-stream.mjs':null,
 [nativeLookupName]:nativeLookupBeforeSha,
};
const filenameFor=name=>name===nativeLookupName?'/opt/openclaw-2026.9.1-v/openclaw/dist/'+name:plugin+'/'+name;
const releaseBytes=name=>{
 if(name!==nativeLookupName)return fs.readFileSync(source+'/experiments/agent-worker-isolation-v1/'+name);
 const backup=evidence+'/'+name+'.before';
 const original=fs.readFileSync(fs.existsSync(backup)?backup:filenameFor(name),'utf8');assert.equal(hash(original),nativeLookupBeforeSha);
 return Buffer.from(patchWorkspaceSessionLookup(original));
};
const protectedFiles={
 [root+'/openclaw.json']:'a6b869cf92121d7a730734d5a9dbb01a5914168f7903f7dac45741611ae75966',
 [root+'/experiments/agent-worker-isolation-v1/worker-openclaw.json']:'ed4ec4e1fd521e09ff3c1fa429d5fa9e5d818b6ae0d1ae6f158bde81b7b198a0',
 '/opt/openclaw-2026.9.1-v/openclaw/dist/agent-command-DPfawBbr.js':'f914243041fab139683a7fbf74ed6817da3312791e89dc3586d981e88c83df4a',
};
function guard(){
 assert.equal(fs.realpathSync(plugin),plugin);
 for(const [file,sha] of Object.entries(protectedFiles))assert.equal(fileHash(file),sha,'protected file drift: '+file);
 const cfg=JSON.parse(fs.readFileSync(root+'/openclaw.json'));
 assert(cfg.plugins.load.paths.includes(plugin));
 const w=cfg.plugins.entries['vlab-agent-worker-isolation'].config;
 assert.equal(w.maxWorkers,15);assert.equal(w.sessionsPerWorker,3);assert.equal(w.minWorkers,1);
 assert(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize>8*1024**3,'disk reserve');
}
guard();
if(action==='stage'){
 assert(!fs.existsSync(manifestFile),'release already staged; use verify rather than overwrite');
 const files=Object.entries(expected).map(([name,beforeSha])=>{
  const filename=filenameFor(name);
  assert.equal(fileHash(filename),beforeSha,'baseline drift: '+name);
  const stat=fs.statSync(beforeSha===null?plugin+'/index.mjs':filename);
  return {name,filename,beforeSha,afterSha:hash(releaseBytes(name)),mode:stat.mode&0o777,uid:stat.uid,gid:stat.gid};
 });
 assert(files.every(f=>f.afterSha));
 fs.mkdirSync(evidence,{mode:0o700});
 for(const f of files)if(f.beforeSha!==null)fs.writeFileSync(evidence+'/'+f.name+'.before',fs.readFileSync(f.filename),{mode:0o600,flag:'wx'});
 fs.writeFileSync(manifestFile,JSON.stringify({source,commit:sha,createdAt:new Date().toISOString(),protectedFiles,files},null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({action,commit:sha,manifest:manifestFile,codeNotActivated:true}));
}else{
 const m=JSON.parse(fs.readFileSync(manifestFile));assert.equal(m.source,source);assert.equal(m.commit,sha);
 assert.deepEqual(m.files.map(f=>f.name).sort(),Object.keys(expected).sort());
 for(const f of m.files){assert.equal(f.filename,filenameFor(f.name));assert.equal(expected[f.name],f.beforeSha);assert.equal(hash(releaseBytes(f.name)),f.afterSha);if(f.beforeSha!==null)assert.equal(fileHash(evidence+'/'+f.name+'.before'),f.beforeSha);}
 const restore=action==='restore'||action==='verify-restore',target=restore?'beforeSha':'afterSha';
 if(['apply','restore'].includes(action)){
  assert.equal(execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0','stop Gateway before code writes');
  for(const f of m.files)assert([f.beforeSha,f.afterSha].includes(fileHash(f.filename)),'concurrent runtime edit: '+f.name);
  for(const f of m.files){
   if(fileHash(f.filename)===f[target])continue;
   // An unused new helper is harmless on rollback; retain it as recoverable evidence.
   if(restore&&f.beforeSha===null)continue;
   const bytes=restore?fs.readFileSync(evidence+'/'+f.name+'.before'):releaseBytes(f.name);
   assert.equal(hash(bytes),f[target]);replacePublicCode(f.filename,bytes,f);
  }
 }
 guard();
 for(const f of m.files){if(restore&&f.beforeSha===null)continue;assert.equal(fileHash(f.filename),f[target],f.name);const stat=fs.statSync(f.filename);assert.equal(stat.mode&0o777,f.mode);assert.equal(stat.uid,f.uid);assert.equal(stat.gid,f.gid);}
 console.log(JSON.stringify({action,commit:sha,verifiedFiles:m.files.length,configUnchanged:true,voiceUnchanged:true,databaseNotRewound:true,manifest:manifestFile}));
}
