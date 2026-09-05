// A single native tool message to the current, freshly listed WeCom test group.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const state='/home/openclaw/.openclaw',core='/opt/openclaw-2026.9.1-v/openclaw';
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
Object.assign(process.env,{HOME:'/home/openclaw',OPENCLAW_CONFIG_PATH:state+'/openclaw.json',OPENCLAW_STATE_DIR:state});
const{callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const call=(m,p={})=>callGatewayFromCli(m,{timeout:'30000',json:true},p);
const sessions=await call('sessions.list',{limit:1000});
const s=sessions.sessions.find(x=>x.key==='agent:makaron:wecom:group:wrsp-weqaamkhes2cphiuotu29ypj7ag');
assert(s,'Expected existing WeCom group missing');
async function invoke(args){
  const r=await call('tools.invoke',{name:'wecom-cli',agentId:'makaron',sessionKey:s.key,args:{args}});
  assert(r.ok,'RPC failed');
  let d=r.output?.details??r.output;
  if(typeof d==='string')d=JSON.parse(d);
  assert(!r.output?.isError&&!d.error,'Tool failed');
  assert(d.success!==false,'Provider returned success=false');
  if(d.errcode!==undefined)assert.equal(d.errcode,0,'Provider rejected');
  return d;
}
const fresh=await invoke(['message','aibot','sessions','list']);
const matches=fresh.sessions.filter(x=>'agent:makaron:wecom:group:'+x.chat_id.toLowerCase()===s.key);
assert.equal(matches.length,1,'Target not uniquely available in fresh provider list');
console.log(JSON.stringify({listed:true,targetMatched:true,groupName:matches[0].chat_name}));
if(process.argv[2]==='send'){
  // Local marker prevents rerunning this one-time visible smoke by accident.
  const marker=state+'/backups/wecom-native-config-20260906/outbound-smoke-attempted';
  fs.writeFileSync(marker,new Date().toISOString(),{flag:'wx',mode:0o600});
  const d=await invoke(['message','aibot','send','--json',JSON.stringify({chat_id:matches[0].chat_id,msg_type:'markdown',markdown:{content:'【Codex 企微升级回归】WECOM91_DELIVERY_OK。9.1 原生业务工具查询已恢复；这是单条投递测试，不处理业务、不修改配置。'}})]);
  console.log(JSON.stringify({sent:true,success:d.success??null,errcode:d.errcode??null,resultKeys:Object.keys(d)}));
}
