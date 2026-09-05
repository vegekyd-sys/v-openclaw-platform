import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const unit='openclaw-vlab-production-mirror-v8.service',root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
const {callGatewayFromCli}=await import(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js');
const rpc=(m,p={})=>callGatewayFromCli(m,{timeout:'20000',json:true},p);
const w=await rpc('vlab.workers.status');assert.equal(w.pending,0);assert(w.workers.every(x=>x.activeCount===0));
const key='agent:makaron:feishu:direct:ou_775a78b0aaae67da5e15eeaf102e3cd9';
await rpc('sessions.patch',{key,expectedSessionId:'b0d6da6b-9cb2-4591-84f5-8adbe6be3404',model:null,thinkingLevel:'high'});
const old=root+'/runtime/plugins/v-browser-device-0.4.6',dest=root+'/runtime/plugins/v-browser-device-0.4.6-trace';assert(!fs.existsSync(dest));fs.cpSync('/tmp/v-browser-session-runtime-trace/openclaw-plugin',dest,{recursive:true});fs.cpSync(old+'/node_modules',dest+'/node_modules',{recursive:true});execFileSync('chown',['-R','vlab:vlab',dest]);
const backup=root+'/backups/browser-session-runtime-0.4.6/trace';fs.mkdirSync(backup,{mode:0o700});
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));const overlay=cfg.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath;
for(const [i,p] of [root+'/state/openclaw.json',overlay].entries()){
 const c=JSON.parse(fs.readFileSync(p));assert(c.plugins.load.paths.includes(old));fs.copyFileSync(p,backup+`/${i}.before.json`);
 c.plugins.load.paths=c.plugins.load.paths.map(x=>x===old?dest:x);c.plugins.entries['v-browser-device'].config.traceLifecycle=true;fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
}
fs.writeFileSync(backup+'/unit.before.txt',execFileSync('systemctl',['cat',unit]));execFileSync('systemctl',['restart',unit],{timeout:60000});console.log(JSON.stringify({traceLabOnly:true,backup,dmModelRestored:true}));
