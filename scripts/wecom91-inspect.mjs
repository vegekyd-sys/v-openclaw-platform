import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const state='/home/openclaw/.openclaw',core='/opt/openclaw-2026.9.1-v/openclaw';
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
Object.assign(process.env,{OPENCLAW_CONFIG_PATH:state+'/openclaw.json',OPENCLAW_STATE_DIR:state,HOME:'/home/openclaw'});
const{callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const call=(m,p={})=>callGatewayFromCli(m,{timeout:'30000',json:true},p);
const cfg=JSON.parse(fs.readFileSync(state+'/openclaw.json'));
const current=state+'/extensions/wecom-openclaw-plugin',candidate=state+'/backups/wecom-native-config-20260906/probe-only';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const w=await call('vlab.workers.status'),h=await call('health');
const all=[];let offset=0;
for(let i=0;i<10;i++){const s=await call('sessions.list',{limit:1000,offset});all.push(...s.sessions);if(!s.hasMore)break;assert(s.nextOffset>offset);offset=s.nextOffset;}
console.log(JSON.stringify({pid,healthOk:h.ok,workerCount:w.workers.length,ready:w.workers.filter(x=>x.ready).length,pending:w.pending,activeWorkers:w.workers.reduce((n,x)=>n+x.activeCount,0),active:all.filter(x=>x.hasActiveRun).map(x=>({key:x.key,runtime:x.agentRuntime,updatedAt:x.updatedAt})),wecomSessions:all.filter(x=>x.key?.startsWith('agent:makaron:wecom:')).map(x=>({key:x.key,runtime:x.agentRuntime,updatedAt:x.updatedAt})),plugin:JSON.parse(fs.readFileSync(current+'/package.json')).version,defaultRuntime:cfg.agents?.list?.find(x=>x.id==='makaron')?.runtime,alsoAllow:cfg.tools?.alsoAllow,preserved:Object.fromEntries(['dist/src/monitor.js','dist/src/sender-name.js','dist/src/message-sender.js','openclaw.plugin.json'].map(p=>[p,hash(current+'/'+p)===hash(candidate+'/'+p)]))}));
