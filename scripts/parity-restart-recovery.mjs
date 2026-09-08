// A real Agent/tool lifecycle test; the timer creates an in-flight boundary,
// and is NEVER used as a performance/TTFT sample or background load.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {originalRecoveryUserIndex} from '../experiments/db91-integrity-gate/recovery-proof.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
assert.equal(process.env.OPENCLAW_STATE_DIR,root+'/state');
const [mode,tag]=process.argv.slice(2);assert(['start','verify'].includes(mode));assert(/^[a-z0-9-]{1,32}$/.test(tag));
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));assert.equal(cfg.gateway.port,26340);assert.equal(Object.keys(cfg.channels).length,0);
const resultFile=root+'/tmp/parity-results/recovery-'+tag+'.json';
const pid=()=>Number(execFileSync('systemctl',['show','openclaw-lab-db91-parity.service','-p','MainPID','--value'],{encoding:'utf8'}).trim());
const processStartedAt=processId=>{const stat=fs.readFileSync('/proc/'+processId+'/stat','utf8');const ticks=Number(stat.slice(stat.lastIndexOf(')')+2).split(' ')[19]);const boot=Number(fs.readFileSync('/proc/stat','utf8').match(/^btime (\d+)$/m)[1]);return 1000*(boot+ticks/Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'}).trim()));};
const workspace=cfg.agents.entries.makaron.workspace??cfg.agents.defaults.workspace;assert(workspace.startsWith(root+'/workspace/'));
const report=mode==='start'?{tag,key:'agent:makaron:explicit:parity-recovery-'+tag,runId:'PARITY_RECOVERY_'+tag,marker:workspace+'/parity-recovery-'+tag+'.log',beforePid:pid(),startedAt:Date.now(),readyForRestart:false,completed:false}:JSON.parse(fs.readFileSync(resultFile));
if(mode==='start'){assert(report.beforePid>1);assert(!fs.existsSync(report.marker));fs.writeFileSync(resultFile,JSON.stringify(report),{mode:0o600,flag:'wx'});}
const save=()=>fs.writeFileSync(resultFile,JSON.stringify(report,null,2),{mode:0o600});
const {GatewayClient}=await import(root+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');let client;
await new Promise((resolve,reject)=>{client=new GatewayClient({url:'ws://127.0.0.1:26340',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],onHelloOk:resolve,onConnectError:reject});client.start();});
const call=(method,params)=>client.request(method,params,{timeoutMs:30000});
const history=()=>call('chat.history',{agentId:'makaron',sessionKey:report.key,limit:80});
const state=async()=>{const result=await call('sessions.list',{agentId:'makaron',search:report.key,limit:10,archived:'all'});return result.sessions.find(row=>row.key===report.key);};
const effectLines=()=>fs.existsSync(report.marker)?fs.readFileSync(report.marker,'utf8').trim().split('\n'):[];
const pause=()=>new Promise(resolve=>setTimeout(resolve,1000));
try{
 if(mode==='start'){
  const status=await call('vlab.workers.status',{});assert.equal(status.pending,0);assert.equal(status.workers.reduce((n,w)=>n+w.activeCount,0),0,'Run lifecycle test after the busy matrix ends');
  const code='const fs=require("node:fs");fs.appendFileSync('+JSON.stringify(report.marker)+','+JSON.stringify(report.runId+'\n')+');console.log('+JSON.stringify('EFFECT_WRITTEN '+report.runId)+');setTimeout(()=>console.log('+JSON.stringify('DONE '+report.runId)+'),180000);';
  const command="/opt/vlab/node-v22.23.1-linux-x64/bin/node -e '"+code+"'";
  report.command=command;save();
  const message='本轮独立 VLab 重启恢复验收编号 '+report.runId+'。不要继续历史任务、不联网、不对外发送。请用 exec 仅执行一次以下命令，超时设为至少240秒；必须等待其实际结束再给最终回复，可用 process 查询状态。命令只向本轮独立文件追加一行标记，然后等待测试重启。'+command+' 。如果重启导致命令被中断，只读检查文件 '+report.marker+' 是否恰好包含一行 '+report.runId+'，如实说明已写入但等待被中断，最终回复须包含本轮编号。绝对不要重新执行追加命令、修改或清理这个文件。';
  report.ack=await call('chat.send',{agentId:'makaron',sessionKey:report.key,message,thinking:'low',deliver:false,idempotencyKey:report.runId,timeoutMs:600000});save();
  while(Date.now()-report.startedAt<120000){
   const lines=effectLines();assert(lines.length<=1,'Duplicate side effect before restart');
   if(lines.length===1){assert.equal(lines[0],report.runId);const row=await state();assert.equal(row?.hasActiveRun,true,'Must restart an actually active task');const h=await history();report.beforeMessageCount=h.messages.length;report.markerWrittenAt=Date.now();report.readyForRestart=true;save();console.log(JSON.stringify({readyForRestart:true,runId:report.runId,pid:report.beforePid,actualActive:true,effectCount:1}));break;}
   await pause();
  }
  assert(report.readyForRestart,'No real side effect reached the restart boundary');
 }else{
  assert(report.readyForRestart);report.afterPid=pid();assert(report.afterPid>1&&report.afterPid!==report.beforePid);report.afterProcessStartedAt=processStartedAt(report.afterPid);
  const started=Date.now();let lastSummary;
  while(Date.now()-started<420000){
   assert.deepEqual(effectLines(),[report.runId],'Restart must not duplicate or erase the side effect');
   const h=await history(),userIndex=originalRecoveryUserIndex(h.messages,report.runId);
   const turn=h.messages.slice(userIndex+1),last=turn.filter(x=>x.role==='assistant').at(-1),row=await state();
   const calls=turn.flatMap(x=>Array.isArray(x.content)?x.content.filter(c=>c.type==='toolCall'):[]);
   const writes=calls.filter(c=>c.name==='exec'&&JSON.stringify(c.arguments??{}).includes('EFFECT_WRITTEN '+report.runId));
   assert(writes.length<=1,'Original effect command must not be dispatched twice');
   lastSummary={hasActiveRun:row?.hasActiveRun,stopReason:last?.stopReason,writeCalls:writes.length,messageCount:h.messages.length};
   if(row?.hasActiveRun===false&&last?.stopReason!=='toolUse'&&last?.stopReason!=='tool_use'&&last){
    assert.equal(last.stopReason,'stop');assert.equal(writes.length,1);assert.equal(last.model,'deepseek-v4-pro');
    const finalAt=typeof last.timestamp==='number'?last.timestamp:Date.parse(last.timestamp);assert(Number.isFinite(finalAt)&&finalAt>=report.afterProcessStartedAt,'Must observe a new final after the replacement Gateway started');
    const text=(Array.isArray(last.content)?last.content:[]).filter(c=>c.type==='text').map(c=>c.text).join('');assert(text.includes(report.runId),'Visible final must identify the real result');
    report.completed=true;report.verifiedAt=Date.now();report.after=lastSummary;report.effectCount=1;save();break;
   }
   await pause();
  }
  report.after=lastSummary;save();assert(report.completed,'Native continuation did not reach a visible final');console.log(JSON.stringify({completed:true,beforePid:report.beforePid,afterPid:report.afterPid,effectCount:1,userResend:false,writeCalls:report.after.writeCalls}));
 }
}finally{if(mode==='start'&&!report.readyForRestart)await call('chat.abort',{agentId:'makaron',sessionKey:report.key,runId:report.runId}).catch(()=>{});client.stop();}
