// VLab-only native plugin installer. No production target or permissions bypass.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {patchWecomEntry,patchWecomTool} from './patch-wecom-runtime-config.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const base='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902',owner='01a06fbe-7654-7331-8d6e-73a8cd2dcd7e';
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,owner);
const core=base+'/runtime/npm-global/lib/node_modules/openclaw',node='/opt/vlab/node-v22.23.1-linux-x64/bin/node',unit='openclaw-vlab-production-mirror-v8.service';
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH=base+'/state/openclaw.json';process.env.PATH='/opt/vlab/node-v22.23.1-linux-x64/bin:'+process.env.PATH;
const {callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const w=await callGatewayFromCli('vlab.workers.status',{timeout:'20000',json:true},{});
const sessions=await callGatewayFromCli('sessions.list',{timeout:'20000',json:true},{limit:1000});
assert(!sessions.hasMore,'Need full session inventory');assert(!sessions.sessions.some(s=>s.hasActiveRun),'Active session');assert(w.pending===0&&w.workers.every(w=>!w.activeCount&&!w.queued),'Active Worker');
const src=base+'/state/extensions/wecom-openclaw-plugin',backup=base+'/backups/wecom-native-config-346916e';
assert(!fs.existsSync(backup),'Candidate already staged; inspect rather than overwrite');
const uid=Number(execFileSync('id',['-u','vlab'],{encoding:'utf8'})),gid=Number(execFileSync('id',['-g','vlab'],{encoding:'utf8'}));
fs.mkdirSync(backup,{mode:0o700});fs.chownSync(backup,uid,gid);
for(const [label,p]of [['main',base+'/state/openclaw.json'],['worker',base+'/experiments/agent-worker-isolation-v1/worker-openclaw.json']])fs.copyFileSync(p,backup+'/'+label+'.before.json');
for(const p of ['plugins/installs.json','plugins/registry.json'])if(fs.existsSync(base+'/state/'+p))fs.copyFileSync(base+'/state/'+p,backup+'/'+p.replace('/','-')+'.before');
const stage=backup+'/package';fs.mkdirSync(stage);
for(const file of ['dist','skills','openclaw.plugin.json','README.md','LICENSE','package.json'])if(fs.existsSync(src+'/'+file))fs.cpSync(src+'/'+file,stage+'/'+file,{recursive:true});
function pack(label){const result=JSON.parse(execFileSync(node,['/opt/vlab/node-v22.23.1-linux-x64/lib/node_modules/npm/bin/npm-cli.js','pack','--ignore-scripts','--json','--pack-destination',backup],{cwd:stage,encoding:'utf8'}));const p=backup+'/'+result[0].filename;fs.renameSync(p,backup+'/'+label+'.tgz');return backup+'/'+label+'.tgz';}
const previous=pack('previous');
fs.writeFileSync(stage+'/dist/index.js',patchWecomEntry(fs.readFileSync(stage+'/dist/index.js','utf8')));
fs.writeFileSync(stage+'/dist/src/cli/tool.js',patchWecomTool(fs.readFileSync(stage+'/dist/src/cli/tool.js','utf8')));
const pkg=JSON.parse(fs.readFileSync(stage+'/package.json'));pkg.version='2026.8.17-vlab.2';fs.writeFileSync(stage+'/package.json',JSON.stringify(pkg,null,2)+'\n');
const candidate=pack('candidate');fs.chownSync(candidate,uid,gid);fs.chmodSync(candidate,0o600);
const sha=createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
fs.writeFileSync(backup+'/manifest.json',JSON.stringify({sourceVersion:'2026.8.17-vlab.1',candidateVersion:pkg.version,sha,candidate,previous,codeCommit:'346916e',permissionsChanged:false},null,2),{mode:0o600});
const configBefore=fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH,'utf8');
console.log(JSON.stringify({stage:'backed-up',backup,sha,permissionsChanged:false}));
const r=spawnSync('runuser',['-u','vlab','--',node,core+'/openclaw.mjs','plugins','install','--force',candidate],{env:process.env,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
fs.writeFileSync(backup+'/install.log',(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});
console.log(JSON.stringify({stage:'installed',status:r.status,error:r.error?.code,configChanged:fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH,'utf8')!==configBefore,log:backup+'/install.log'}));
// Never auto-accept new capabilities or restart on a rejected installation.
assert.equal(r.status,0,'Installer failed; inspect private log. Gateway not restarted.');
console.log(JSON.stringify({stage:'restart-required',unit}));
