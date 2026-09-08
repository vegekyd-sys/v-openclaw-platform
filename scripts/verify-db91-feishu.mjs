// Read-only verification of the one user-authorized Feishu acceptance turn.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
assert.equal(process.getuid(),0);
const root='/home/openclaw/.openclaw',id='DB91_FEISHU_20260909_1',group='oc_87351e46c81b9864869830e131dd4f52';
const pid=execFileSync('systemctl',['show','openclaw-gateway','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const e of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1);}
assert.equal(process.env.V_RELEASE_VERSION,'v2026.9.1-db91.1');
const cfg=JSON.parse(fs.readFileSync(root+'/openclaw.json'));
assert.equal(cfg.channels.feishu.allowBots,true);
const {callGatewayFromCli}=await import('/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core/dist/plugin-sdk/gateway-runtime.js');
const key='agent:makaron:feishu:group:'+group;
const h=await callGatewayFromCli('chat.history',{timeout:'20000',json:true},{agentId:'makaron',sessionKey:key,limit:30});
const at=h.messages.findLastIndex(m=>m.role==='user'&&JSON.stringify(m.content).includes(id));assert(at>=0);
const turn=h.messages.slice(at+1),calls=turn.flatMap(m=>(m.content??[]).filter(c=>c.type==='toolCall'&&c.name==='exec'&&JSON.stringify(c.arguments).includes(id)));
assert.equal(calls.length,1);
const result=turn.find(m=>m.role==='toolResult'&&m.toolCallId===calls[0].id&&!m.isError);assert(result);
const expected=JSON.stringify(result.content).match(/\d{10} DB91_FEISHU_20260909_1/)?.[0];assert(expected);
const final=turn.filter(m=>m.role==='assistant').at(-1);assert.equal(final.stopReason,'stop');assert(JSON.stringify(final.content).includes(expected));
assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
const f=cfg.channels.feishu;
const auth=await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_id:f.appId,app_secret:f.appSecret})}).then(r=>r.json());
assert.equal(auth.code,0,'Feishu bot authentication failed');
const query=new URLSearchParams({container_id_type:'chat',container_id:group,start_time:'1788891130',end_time:'1788891190',sort_type:'ByCreateTimeAsc',page_size:'50'});
const r=await fetch('https://open.feishu.cn/open-apis/im/v1/messages?'+query,{headers:{Authorization:'Bearer '+auth.tenant_access_token}}).then(r=>r.json());
assert.equal(r.code,0,'Feishu read-back failed with code '+r.code);
const reply=r.data?.items?.find(m=>m.sender?.sender_type==='app'&&m.sender?.id===f.appId&&m.body?.content?.includes(expected));
if(!reply){console.log(JSON.stringify({candidateMessages:r.data?.items?.map(m=>({id:m.message_id,sender:m.sender,containsExpected:m.body?.content?.includes(expected),type:m.msg_type}))}));throw Error('Exact native V reply not found');}
const report={at:new Date().toISOString(),pid,allowBots:true,id,group,runtime:h.sessionInfo.agentRuntime.id,model:final.model,execCalls:1,expected,replyId:reply.message_id,replyCreateTime:reply.create_time,feishuReadBack:true};
fs.writeFileSync(root+'/backups/v2026.9.1-db91.1/feishu-acceptance.json',JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report));
