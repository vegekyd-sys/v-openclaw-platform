// Incremental code-only release over the verified firstword release, never DB rewind.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {replacePublicCode} from './db91-firstword-files.mjs';
import {patchPersistedUserTurnFile} from './db91-persisted-user-turn-plan.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const action=process.argv[2];assert(['stage','apply','restore','verify','verify-restore'].includes(action));
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.equal(source,'/opt/openclaw-experiments/db91-persisted-user-turn-20260908/source');
const root='/home/openclaw/.openclaw',plugin='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.11-steer91';
const evidence=root+'/backups/db91-persisted-user-turn-20260908',manifestFile=evidence+'/manifest.json';
const previousFile=root+'/backups/db91-firstword-20260907/manifest.json';
const hash=b=>createHash('sha256').update(b).digest('hex'),fileHash=p=>hash(fs.readFileSync(p));
const previous=JSON.parse(fs.readFileSync(previousFile));assert.equal(previous.commit,'25ac0ec56751fde3a61c2e9dfe85e632f797f9aa');
const commit=execFileSync('git',['-c','safe.directory='+source,'-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(execFileSync('git',['-c','safe.directory='+source,'-C',source,'status','--porcelain'],{encoding:'utf8'}).trim(),'');
const expected={
 'index.mjs':'5da926bc2144bbea78d8ffe39644d9be589a77f927f6d93e3412b5cb9015e332',
 'native-attempt-bridge.mjs':'a5843b97d1e47aaa9f401691915274546fe85e647454a500e102016064b54c0f',
 'user-turn-ownership.mjs':'5fb8913ebaf328b95ee35093598bf0ad31c261d896117adb8ce7ad1a725dc99f',
};
const helper=fs.readFileSync(source+'/experiments/agent-worker-isolation-v1/user-turn-ownership.mjs','utf8');
function guard(){
 assert.equal(fs.realpathSync(plugin),plugin);
 for(const [file,sha] of Object.entries(previous.protectedFiles))assert.equal(fileHash(file),sha,'protected file drift');
 for(const f of previous.files)if(!Object.hasOwn(expected,f.name))assert.equal(fileHash(f.filename),f.afterSha,'prior release drift');
 else assert.equal(expected[f.name],f.afterSha,'incorrect prior release chain');
 const cfg=JSON.parse(fs.readFileSync(root+'/openclaw.json'));assert(cfg.plugins.load.paths.includes(plugin));
 const w=cfg.plugins.entries['vlab-agent-worker-isolation'].config;assert.equal(w.minWorkers,1);assert.equal(w.maxWorkers,15);assert.equal(w.sessionsPerWorker,3);
 assert(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize>8*1024**3);
}
function candidate(name){
 const backup=evidence+'/'+name+'.before',original=fs.readFileSync(fs.existsSync(backup)?backup:plugin+'/'+name,'utf8');
 assert.equal(hash(original),expected[name]);return Buffer.from(patchPersistedUserTurnFile(name,original,helper));
}
guard();
if(action==='stage'){
 assert(/^[a-f0-9]{40}$/.test(process.argv[3]??''));assert.equal(commit,process.argv[3]);
 assert(!fs.existsSync(manifestFile),'already staged');
 const files=Object.entries(expected).map(([name,beforeSha])=>{const filename=plugin+'/'+name;assert.equal(fileHash(filename),beforeSha);const s=fs.statSync(filename);return {name,filename,beforeSha,afterSha:hash(candidate(name)),mode:s.mode&0o777,uid:s.uid,gid:s.gid};});
 fs.mkdirSync(evidence,{mode:0o700});for(const f of files)fs.writeFileSync(evidence+'/'+f.name+'.before',fs.readFileSync(f.filename),{mode:0o600,flag:'wx'});
 fs.writeFileSync(manifestFile,JSON.stringify({source,commit,createdAt:new Date().toISOString(),previousFile,previousManifestSha:fileHash(previousFile),protectedFiles:previous.protectedFiles,files},null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({action,commit,manifest:manifestFile,codeNotActivated:true}));
}else{
 const m=JSON.parse(fs.readFileSync(manifestFile));assert.equal(m.source,source);assert.equal(m.commit,commit);assert.equal(m.previousManifestSha,fileHash(previousFile));
 assert.deepEqual(m.files.map(f=>f.name).sort(),Object.keys(expected).sort());
 for(const f of m.files){assert.equal(f.filename,plugin+'/'+f.name);assert.equal(f.beforeSha,expected[f.name]);assert.equal(hash(candidate(f.name)),f.afterSha);assert.equal(fileHash(evidence+'/'+f.name+'.before'),f.beforeSha);}
 const restore=action==='restore'||action==='verify-restore',key=restore?'beforeSha':'afterSha';
 if(action==='apply'||action==='restore'){
  assert.equal(execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
  for(const f of m.files)assert([f.beforeSha,f.afterSha].includes(fileHash(f.filename)),'concurrent code modification');
  for(const f of m.files)replacePublicCode(f.filename,restore?fs.readFileSync(evidence+'/'+f.name+'.before'):candidate(f.name),f);
 }
 guard();for(const f of m.files){assert.equal(fileHash(f.filename),f[key]);const s=fs.statSync(f.filename);assert.equal(s.mode&0o777,f.mode);assert.equal(s.uid,f.uid);assert.equal(s.gid,f.gid);}
 console.log(JSON.stringify({action,commit,verifiedFiles:3,previousReleasePreserved:true,configUnchanged:true,voiceUnchanged:true,databaseNotRewound:true,manifest:manifestFile}));
}
