// Real full-data Agent. Native default thinking; no prompt/history/tool pruning.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const owner='codex-db91-production-equivalent-20260908';
for(const f of ['db91-parity','integration'])assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/'+f+'.json')).owner,owner);
const pid=execFileSync('systemctl',['show','openclaw-lab-db91-parity.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const v of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=v.indexOf('=');if(i>0)process.env[v.slice(0,i)]=v.slice(i+1);}
assert.equal(process.env.OPENCLAW_STATE_DIR,root+'/state');
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));
assert.equal(cfg.gateway.port,26340);assert.equal(Object.keys(cfg.channels??{}).length,0);assert.equal(cfg.cron.enabled,false);assert.equal(cfg.browser.enabled,false);
assert(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize>3*1024**3);
const arm=process.argv[2]??'baseline';assert(/^[a-z0-9_-]{1,24}$/.test(arm));
const stamp=Date.now(),dir=root+'/tmp/firsttext-results';fs.mkdirSync(dir,{recursive:true,mode:0o700});
const output=dir+'/'+arm+'-'+stamp+'.json';
const report={arm,stamp,startedAt:new Date().toISOString(),gatewayPid:pid,thinking:'native-default-unmodified',scope:'full-data-lab-real-agent-websocket-no-external-channel',jobs:[]};
const persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
let client,current;
const {GatewayClient}=await import(root+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{client?.stop();reject(Error('connection deadline'));},20000);
 client=new GatewayClient({url:'ws://127.0.0.1:26340',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],
 onHelloOk(){clearTimeout(timer);resolve();},onConnectError(e){clearTimeout(timer);reject(e);},
 onEvent(e){const p=e.payload,j=current;if(!j||p?.runId!==j.runId)return;
  const ms=Date.now()-j.start;
  if(e.event==='agent'&&p.stream==='assistant'&&typeof p.data?.text==='string'&&p.data.text.trim())j.firstTextMs??=ms;
  if(e.event==='chat'&&['delta','final'].includes(p.state)){
   const text=(p.message?.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('');
   if(text.trim())j.chatFirstTextMs??=ms;
   if(p.state==='final')j.finalMs=ms;
  }
  if(e.event==='chat'&&['error','aborted'].includes(p.state))j.error=p.state;
 }});client.start();
});
const call=(method,params={},timeoutMs=30000)=>client.request(method,params,{timeoutMs});
const status=async()=>{const s=await call('vlab.workers.status');return {pending:s.pending,workers:s.workers.map(w=>({pid:w.pid,ready:w.ready,activeCount:w.activeCount,queued:w.queued}))};};
try{
 report.before=await status();assert.equal(report.before.pending,0);assert(report.before.workers.every(w=>w.ready&&!w.activeCount&&!w.queued));
 for(const [i,mode] of ['cold_new','warm_same','warm_new','exec_regression'].entries()){
  const key='agent:makaron:explicit:db91-hi-firsttext-'+stamp+'-'+(i===1?0:i===3?2:i);
  const j={mode,runId:'DB91_HI_'+stamp+'_'+arm+'_'+mode,sessionKey:key,start:Date.now()};report.jobs.push(j);current=j;persist();
  await call('sessions.messages.subscribe',{agentId:'makaron',key});j.start=Date.now();let finished=false;
  try{
   const message=mode==='exec_regression'?`请现在调用 exec 执行这条只读命令：date -u "+%s ${j.runId}"。不能复用过去结果，不访问网络，不读写其他文件。最后只回复本轮命令的实际输出。`:'hi';
   const ack=await call('chat.send',{agentId:'makaron',sessionKey:key,message,deliver:false,idempotencyKey:j.runId,timeoutMs:180000});assert.equal(ack.runId,j.runId);j.ackMs=Date.now()-j.start;
   while(Date.now()-j.start<180000&&j.finalMs===undefined&&!j.error)await new Promise(r=>setTimeout(r,100));
   assert(!j.error,j.error);assert(Number.isFinite(j.finalMs)&&Number.isFinite(j.firstTextMs),'final/first text deadline');
   const h=await call('chat.history',{agentId:'makaron',sessionKey:key,limit:50});
   assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
   const userAt=h.messages.findLastIndex(m=>m.role==='user');assert.equal(h.messages[userAt].idempotencyKey,j.runId+':user');
   const turn=h.messages.slice(userAt+1),last=turn.filter(m=>m.role==='assistant').at(-1);assert.equal(last.model,'deepseek-v4-pro');assert.notEqual(last.stopReason,'error');
   j.assistants=turn.filter(m=>m.role==='assistant').map(m=>({model:m.model,usage:m.usage,stopReason:m.stopReason,contentTypes:m.content.map(c=>c.type)}));
   j.replyHash=createHash('sha256').update(last.content.filter(c=>c.type==='text').map(c=>c.text).join('')).digest('hex');
   if(mode==='exec_regression'){
    const calls=turn.flatMap(m=>Array.isArray(m.content)?m.content.filter(c=>c.type==='toolCall'):[]).filter(c=>['exec','tool_call'].includes(c.name)&&JSON.stringify(c.arguments??{}).includes(j.runId));assert.equal(calls.length,1);
    const result=turn.find(m=>m.role==='toolResult'&&m.toolCallId===calls[0].id);assert(result&&!result.isError&&JSON.stringify(result).includes(j.runId));j.freshExecVerified=true;
   }
   for(let n=0;n<120;n++){const s=await call('sessions.list',{agentId:'makaron',search:key,archived:'all',limit:10});if(s.sessions.some(s=>s.key===key&&s.hasActiveRun===false)){finished=true;break;}await new Promise(r=>setTimeout(r,500));}
   assert(finished,'own session did not settle');j.verified=true;
   console.log(JSON.stringify({phase:'reply',arm,mode,runId:j.runId,firstTextMs:j.firstTextMs,chatFirstTextMs:j.chatFirstTextMs,finalMs:j.finalMs,freshExecVerified:j.freshExecVerified}));
  }catch(e){j.failure=String(e);throw e;}finally{persist();if(!finished)await call('chat.abort',{sessionKey:key,runId:j.runId}).catch(()=>{});current=undefined;}
 }
 report.after=await status();report.completed=true;
}finally{report.finishedAt=new Date().toISOString();persist();client.stop();console.log(JSON.stringify({phase:'finished',output,completed:report.completed??false}));}
