import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const input=process.argv[2];assert(['apply','retry-apply','rollback','status'].includes(input));const mode=input==='retry-apply'?'apply':input;
const state='/home/openclaw/.openclaw',core='/opt/openclaw-2026.9.1-v/openclaw',node='/opt/node-v22.23.1/bin/node',unit='openclaw-gateway.service',src=state+'/extensions/wecom-openclaw-plugin',backup=state+'/backups/wecom-native-config-20260906';
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();
if(pid!=='0')for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
Object.assign(process.env,{HOME:'/home/openclaw',OPENCLAW_STATE_DIR:state,OPENCLAW_CONFIG_PATH:state+'/openclaw.json',PATH:'/opt/node-v22.23.1/bin:'+process.env.PATH});
const {callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
async function idle(){const w=await callGatewayFromCli('vlab.workers.status',{timeout:'20000',json:true},{});let active=0,offset=0;for(let i=0;i<10;i++){const s=await callGatewayFromCli('sessions.list',{timeout:'20000',json:true},{limit:1000,offset});active+=s.sessions.filter(x=>x.hasActiveRun).length;if(!s.hasMore)break;assert(s.nextOffset>offset&&i<9);offset=s.nextOffset;}const ok=active===0&&w.pending===0&&w.workers.every(x=>!x.activeCount&&!x.queued);console.log(JSON.stringify({stage:'idle',active,pending:w.pending,ready:w.workers.filter(x=>x.ready).length,ok}));return ok;}
if(mode==='status'){await idle();process.exit(0);}
assert.equal(read(core+'/package.json').version,'2026.9.1');
const uid=Number(execFileSync('id',['-u','openclaw'],{encoding:'utf8'})),gid=Number(execFileSync('id',['-g','openclaw'],{encoding:'utf8'}));
if(mode==='apply'&&input!=='retry-apply'){
 assert(await idle(),'Wait for safe restart window');assert(!fs.existsSync(backup),'Backup exists: inspect first');assert.equal(read(src+'/package.json').version,'2026.8.17-vlab.1');
 assert.equal(sha('/tmp/wecom-native-config-346916e.tgz'),'2ac843d6455c34f30c33c0cf7bd75a5d16fb23e3b170dd134af3e60e5e0875a7');
 fs.mkdirSync(backup,{mode:0o700});fs.chownSync(backup,uid,gid);fs.copyFileSync(import.meta.filename,backup+'/deploy.mjs');fs.copyFileSync('/tmp/wecom-native-config-346916e.tgz',backup+'/candidate.tgz');
 execFileSync('tar',['-cpf',backup+'/plugin-full.before.tar','-C',src,'.']);
 const configs=[state+'/openclaw.json',read(state+'/openclaw.json').plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath];
 for(const [i,p]of configs.entries())fs.copyFileSync(p,backup+`/config-${i}.before.json`);
 const stage=backup+'/previous-package';fs.mkdirSync(stage);
 for(const p of ['dist','skills','openclaw.plugin.json','README.md','LICENSE','package.json'])if(fs.existsSync(src+'/'+p))fs.cpSync(src+'/'+p,stage+'/'+p,{recursive:true});
 const pkg=read(stage+'/package.json');delete pkg.devDependencies;for(const name of Object.keys(pkg.dependencies??{}))pkg.dependencies[name]=read(src+'/node_modules/'+name+'/package.json').version;fs.writeFileSync(stage+'/package.json',JSON.stringify(pkg,null,2)+'\n');
 const packed=JSON.parse(execFileSync(node,['/opt/node-v22.23.1/lib/node_modules/npm/bin/npm-cli.js','pack','--ignore-scripts','--json','--pack-destination',backup],{cwd:stage,env:{...process.env,npm_config_cache:backup+'/build-cache'},encoding:'utf8'}));fs.renameSync(backup+'/'+packed[0].filename,backup+'/previous.tgz');
 const candidateManifest=JSON.parse(execFileSync('tar',['-xOf',backup+'/candidate.tgz','package/openclaw.plugin.json'],{encoding:'utf8'}));assert.deepEqual(candidateManifest,read(src+'/openclaw.plugin.json'),'Unreviewed capability change');
 fs.writeFileSync(backup+'/manifest.json',JSON.stringify({configs,candidateSha:sha(backup+'/candidate.tgz'),previousSha:sha(backup+'/previous.tgz'),sourceVersion:pkg.version,version:'2026.8.17-vlab.2',at:new Date().toISOString()}),{mode:0o600});
}
const manifest=read(backup+'/manifest.json');const archive=backup+(mode==='apply'?'/candidate.tgz':'/previous.tgz');assert.equal(sha(archive),mode==='apply'?manifest.candidateSha:manifest.previousSha);
fs.chownSync(archive,uid,gid);fs.chmodSync(archive,0o600);const cache=backup+'/install-cache';fs.mkdirSync(cache,{recursive:true,mode:0o700});fs.chownSync(cache,uid,gid);
if(mode==='apply')assert(await idle(),'New active work; no install performed');
const before=manifest.configs.map(p=>fs.readFileSync(p,'utf8'));
const r=spawnSync('/usr/sbin/runuser',['-u','openclaw','--',node,core+'/openclaw.mjs','plugins','install','--force','--accept-capabilities',archive],{env:{...process.env,npm_config_cache:cache},encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
fs.writeFileSync(backup+'/'+mode+'.log',(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});
console.log(JSON.stringify({stage:'install',mode,status:r.status,error:r.error?.code,backup,version:read(src+'/package.json').version,configChanged:manifest.configs.map((p,i)=>fs.readFileSync(p,'utf8')!==before[i])}));
assert.equal(r.status,0,'Installer failed: inspect private log; no restart');
if(mode==='apply')assert(await idle(),'Installed but new active work: defer restart');
execFileSync('systemctl',['restart',unit],{timeout:60000});console.log(JSON.stringify({stage:'restarted',mode,at:new Date().toISOString(),backup}));
