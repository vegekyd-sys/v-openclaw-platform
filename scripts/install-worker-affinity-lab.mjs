// This installer has no production/shared mode. Only our stopped private instance.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const root='/srv/vlab-production-mirror/labs/instances/db91-fix',source=root+'/source';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json'));assert.equal(m.owner,'codex-db91-contention-20260907');assert.equal(m.root,root);
const run=(c,a)=>execFileSync(c,a,{encoding:'utf8'}).trim();assert.equal(run('systemctl',['show',m.unit,'-p','MainPID','--value']),'0');
const git=a=>run('runuser',['-u',m.user,'--','git','-C',source,...a]);assert.equal(git(['status','--porcelain']),'');
const commit=git(['rev-parse','HEAD']),hash=b=>createHash('sha256').update(b).digest('hex');
const mode=process.argv[2];assert(['fixture','candidate','baseline','restore-fixture'].includes(mode));
const dir=root+'/backups/worker-affinity.1',file=root+'/runtime/worker/worker-pool.mjs',drop='/etc/systemd/system/'+m.unit+'.d/zzz-worker-affinity.conf';
const hook='[Service]\nEnvironment=OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE=1\n';
const atomic=(p,bytes,stat=fs.statSync(p))=>{const temp=p+'.affinity-'+process.pid;fs.writeFileSync(temp,bytes,{mode:stat.mode&0o777,flag:'wx'});fs.chownSync(temp,stat.uid,stat.gid);fs.renameSync(temp,p);};
fs.mkdirSync(dir,{recursive:true,mode:0o700});
if(!fs.existsSync(dir+'/pool.before')){assert.equal(hash(fs.readFileSync(file)),'f4afe29c5ee7876b98f17fb28df55fff597802401c999c25ec5fbc40f3a29e64');fs.writeFileSync(dir+'/pool.before',fs.readFileSync(file),{mode:0o600,flag:'wx'});}
const before=fs.readFileSync(dir+'/pool.before'),after=fs.readFileSync(source+'/experiments/agent-worker-isolation-v1/worker-pool.mjs');
assert(after.includes('worker-affinity.1'));assert([hash(before),hash(after)].includes(hash(fs.readFileSync(file))));
run(process.execPath,['--check',source+'/experiments/agent-worker-isolation-v1/worker-pool.mjs']);
if(mode==='candidate'){atomic(file,after);fs.mkdirSync('/etc/systemd/system/'+m.unit+'.d',{recursive:true});if(fs.existsSync(drop))assert.equal(fs.readFileSync(drop,'utf8'),hook);else fs.writeFileSync(drop,hook,{mode:0o644,flag:'wx'});}
if(mode==='baseline'){atomic(file,before);if(fs.existsSync(drop)){assert.equal(fs.readFileSync(drop,'utf8'),hook);fs.unlinkSync(drop);}}
if(['fixture','restore-fixture'].includes(mode))for(const [i,relative]of ['state/openclaw.json','state/worker-openclaw.json'].entries()){
 const p=root+'/'+relative,backup=dir+'/config-'+i+'.before';
 if(!fs.existsSync(backup))fs.writeFileSync(backup,fs.readFileSync(p),{mode:0o600,flag:'wx'});
 const original=fs.readFileSync(backup,'utf8'),cfg=JSON.parse(original);assert.equal(cfg.cron.enabled,false);assert.equal(cfg.browser.enabled,false);assert.equal(Object.keys(cfg.channels).length,0);assert(!cfg.mcp);
 cfg.mcp={servers:{'db91-affinity-fixture':{command:process.execPath,args:[source+'/scripts/lab-affinity-mcp-fixture.mjs'],enabled:true,connectionTimeoutMs:10000,requestTimeoutMs:10000}}};
 const next=JSON.stringify(cfg,null,2)+'\n',current=fs.readFileSync(p,'utf8');assert([original,next].includes(current),'fixture config drift');atomic(p,mode==='fixture'?next:original);
}
run('systemctl',['daemon-reload']);
const report={at:new Date().toISOString(),version:'worker-affinity.1',mode,commit,poolSha:hash(fs.readFileSync(file)),beforeSha:hash(before),afterSha:hash(after),configHashes:['state/openclaw.json','state/worker-openclaw.json'].map(p=>({path:p,sha:hash(fs.readFileSync(root+'/'+p))})),instance:m.name??'db91-fix',productionTouched:false};
fs.writeFileSync(dir+'/'+Date.now()+'-'+mode+'.json',JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(report));
