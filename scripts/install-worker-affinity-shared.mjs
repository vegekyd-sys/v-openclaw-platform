// Stopped, exclusively leased integration instance; no production target.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import path from 'node:path';
import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902',unit='openclaw-vlab-production-mirror-v8.service';
const lease=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json'));assert.equal(lease.owner,'codex-db91-contention-20260907');
const source=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run=(c,a)=>execFileSync(c,a,{encoding:'utf8'}).trim(),git=a=>run('git',['-c','safe.directory='+source,'-C',source,...a]);
assert.equal(git(['status','--porcelain']),'');assert.equal(run('systemctl',['show',unit,'-p','MainPID','--value']),'0');
const commit=git(['rev-parse','HEAD']),hash=b=>createHash('sha256').update(b).digest('hex');
const mode=process.argv[2];assert(['configure','candidate','baseline','restore-config'].includes(mode));
const cfgPath=root+'/state/openclaw.json',bytes=fs.readFileSync(cfgPath),cfg=JSON.parse(bytes);
assert.equal(cfg.gateway.port,24993);assert.equal(cfg.gateway.reload.mode,'off');
const worker=root+'/runtime/plugins/worker-v-platform-0.1.0-integration.1';assert(cfg.plugins.load.paths.includes(worker));
const file=worker+'/worker-pool.mjs',dir=root+'/state/worker-affinity-shared-20260908',drop='/etc/systemd/system/'+unit+'.d/zzz-worker-affinity-shared.conf';
const hook='[Service]\nEnvironment=OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE=1\n';
const atomic=(p,b)=>{const st=fs.statSync(p),temp=p+'.affinity-'+process.pid;fs.writeFileSync(temp,b,{mode:st.mode&0o777,flag:'wx'});fs.chownSync(temp,st.uid,st.gid);fs.renameSync(temp,p);};
fs.mkdirSync(dir,{recursive:true,mode:0o700});
if(!fs.existsSync(dir+'/pool.before')){assert.equal(hash(fs.readFileSync(file)),'edd2f3fcfc344f80b2f905763e0c2e2ba31d167f5d8d512746693277853e8ea8');fs.writeFileSync(dir+'/pool.before',fs.readFileSync(file),{mode:0o600,flag:'wx'});}
if(!fs.existsSync(dir+'/config.before'))fs.writeFileSync(dir+'/config.before',bytes,{mode:0o600,flag:'wx'});
const before=fs.readFileSync(dir+'/pool.before'),after=fs.readFileSync(source+'/experiments/agent-worker-isolation-v1/worker-pool.mjs');assert(after.includes('worker-affinity.1'));
assert([hash(before),hash(after)].includes(hash(fs.readFileSync(file))),'pool drift');
run(process.execPath,['--check',source+'/experiments/agent-worker-isolation-v1/worker-pool.mjs']);
const original=fs.readFileSync(dir+'/config.before'),nextCfg=JSON.parse(original);
Object.assign(nextCfg.plugins.entries['vlab-agent-worker-isolation'].config,{minWorkers:2,maxWorkers:2,sessionsPerWorker:3,warmSpareWorkers:0});nextCfg.agents.defaults.maxConcurrent=5;
const next=Buffer.from(JSON.stringify(nextCfg,null,2)+'\n');assert([hash(original),hash(next)].includes(hash(bytes)),'config drift');
if(mode==='configure')atomic(cfgPath,next);
if(mode==='restore-config')atomic(cfgPath,original);
if(mode==='candidate'){atomic(file,after);fs.mkdirSync(path.dirname(drop),{recursive:true});if(fs.existsSync(drop))assert.equal(fs.readFileSync(drop,'utf8'),hook);else fs.writeFileSync(drop,hook,{mode:0o644,flag:'wx'});}
if(mode==='baseline'){atomic(file,before);if(fs.existsSync(drop)){assert.equal(fs.readFileSync(drop,'utf8'),hook);fs.unlinkSync(drop);}}
run('systemctl',['daemon-reload']);
const report={at:new Date().toISOString(),version:'worker-affinity.integration.1',mode,commit,poolSha:hash(fs.readFileSync(file)),baselinePoolSha:hash(before),candidatePoolSha:hash(after),configSha:hash(fs.readFileSync(cfgPath)),originalConfigSha:hash(original),testConfigSha:hash(next),productionTouched:false};
fs.writeFileSync(dir+'/'+Date.now()+'-'+mode+'.json',JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(report));
