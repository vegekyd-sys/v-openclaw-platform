import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const lab=os.hostname()==='VM-0-4-ubuntu';assert(lab||os.hostname()==='VM-8-2-ubuntu');
const root=lab?'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902':'/home/openclaw/.openclaw';
const unit=lab?'openclaw-vlab-production-mirror-v8.service':'openclaw-gateway.service';
const core=lab?root+'/runtime/npm-global/lib/node_modules/openclaw':'/opt/openclaw-2026.9.1-v/openclaw';
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH=root+(lab?'/state':'')+'/openclaw.json';
const {callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const call=(m,p={})=>callGatewayFromCli(m,{timeout:'60000',json:true},p);
const sessions=await call('sessions.list',{limit:1000});
const session=sessions.sessions.find(s=>(s.key??s.sessionKey??'').startsWith('agent:makaron:wecom:'));
assert(session,'No existing Makaron WeCom session; refusing implicit session creation');
const r=await call('tools.invoke',{name:'wecom-cli',agentId:'makaron',sessionKey:session.key??session.sessionKey,args:{args:['contact','users','search','--json','{"keywords":["Tianyi"]}']}});
const out=r.output?.details??r.output;
function summarize(x){if(Array.isArray(x))return {count:x.length};if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).filter(([k])=>!/(userid|token|secret|url|name|email|phone|mobile)/i.test(k)).map(([k,v])=>[k,/(error|code|status|timedOut|ms)$/i.test(k)&&typeof v!=='object'?v:summarize(v)]));return typeof x;}
console.log(JSON.stringify({lab,pid,rpcOk:r.ok,toolError:r.error??null,output:summarize(out)}));
