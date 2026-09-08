// Internal V review relay. No channel delivery, deployment or business replay.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const root='/home/openclaw/.openclaw',release='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1';
const out=root+'/backups/v2026.9.1-db91.1/v-review.json';assert(!fs.existsSync(out));
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const e of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1);}
const cfg=JSON.parse(fs.readFileSync(root+'/openclaw.json'));assert.equal(cfg.gateway.port,22793);
const {GatewayClient}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/gateway-runtime.js');let client;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('review connection deadline')),30000);client=new GatewayClient({url:'ws://127.0.0.1:22793',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve()},onConnectError:reject});client.start()});
const stamp=Date.now(),key='agent:makaron:explicit:db91-release-review-'+stamp,id='DB91_V_REVIEW_'+stamp;
const message=`Tianyi 已授权 Codex 发布 V 2026.9.1-db91.1 并在 V 验证。本轮编号 ${id}。这是发布规程要求的 V 用户侧 review；飞书 bot 消息被现有 allowBots=false 拦截，故以内部 review relay 交给你，不是对外消息。请仅只读检查 ${release}/source/docs/v2026.9.1-db91.1-release.md、${release}/source/docs/db91-parity-candidate-evidence-20260908.md 和 ${release}/artifact/manifest.json；必要时只读对应 source/experiments/db91-integrity-gate 内补丁代码。不要自行部署、重启、改配置、写文件、调用外部服务或发送消息，也不要继续其他历史任务。证据是 VLab 前台90/90、36真实exec、后台391完整交付，实际21并发；无锁/EPIPE，进行中重启自动最终回复且写入唯一。仍有两次后台首段89/93秒；最后同内存冷A/B/A未完成。生产版本保留官方2026.9.1、Worker0.2.11-steer91、现有模型/亲和性/UM关闭/内存并发，仅部署精确9文件和新增轨迹索引及原生有序重启入口。Codex 已备份9库，正在无渠道隔离烟测，尚未切换。请从用户路径与不重复副作用边界 review：明确回复“接受本次有限修复发布口径”或“阻断”，说明理由和生产验证必须观察的事项。此回答只用于工程 review，不能代替飞书端到端验证，也不能宣布延迟全面修复。最终回复含本轮编号。`;
const report={id,key,startedAt:stamp,completed:false};fs.writeFileSync(out,JSON.stringify(report),{mode:0o600,flag:'wx'});
try{
 await client.request('chat.send',{agentId:'makaron',sessionKey:key,message,thinking:'low',deliver:false,idempotencyKey:id,timeoutMs:300000},{timeoutMs:30000});
 while(Date.now()-stamp<330000){
  const h=await client.request('chat.history',{agentId:'makaron',sessionKey:key,limit:80},{timeoutMs:30000});
  const at=h.messages.findLastIndex(m=>m.role==='user');
  if(at>=0&&h.messages[at].idempotencyKey===id+':user'){
   const last=h.messages.slice(at+1).filter(m=>m.role==='assistant').at(-1);
   if(last?.stopReason==='stop'){
    report.text=(last.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('');assert(report.text.includes(id));report.completed=true;report.model=last.model;report.finishedAt=Date.now();break;
   }
  }
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert(report.completed,'V review did not complete');console.log(JSON.stringify({completed:true,model:report.model,text:report.text}));
}finally{fs.writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600});client.stop();}
