// Owner-only synthetic Steer/stop acceptance. No channels or production state.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {target,readJson,service,record,sourceCommit,treeHash} from './lab-instance.mjs';

const [mode,name,owner,version]=process.argv.slice(2);
assert(['steer','stop'].includes(mode));assert(['2026.9.1','2026.9.2'].includes(version));
const m=target(name,owner),root=m.root,core=`${root}/runtime/openclaw`;
assert.equal(readJson(`${core}/package.json`).version,version);
const commit=sourceCommit(m),workerArtifact=treeHash(`${root}/runtime/worker`);
const before=service(m.unit);assert(Number(before.MainPID)>1);
const shared=service('openclaw-vlab-production-mirror-v8.service');
for(const entry of fs.readFileSync(`/proc/${before.MainPID}/environ`,'utf8').split('\0').filter(Boolean))process.env[entry.slice(0,entry.indexOf('='))]=entry.slice(entry.indexOf('=')+1);
const cfg=readJson(`${root}/state/openclaw.json`);
const {GatewayClient}=await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
let client,runId,key,settled=false;
const stamp=Date.now(),tag=`VPLATFORM_${mode.toUpperCase()}_${stamp}`;
try {
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client.stop();reject(Error('Connect deadline'));},20000);
  client=new GatewayClient({url:`ws://127.0.0.1:${m.port}`,token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write'],
   onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);client.stop();reject(e);}});client.start();});
 const call=async(method,params={})=>{
  for(let i=0;;i++)try{return await client.request(method,params,{timeoutMs:45000});}
  catch(error){if(method!=='chat.history'||!error.retryable||i>=5)throw error;await new Promise(r=>setTimeout(r,500));}
 };
 const statusBefore=await call('vlab.workers.status');
 key=`agent:lab:explicit:vplatform-${mode}-${stamp}`;
 await call('sessions.patch',{key,agentId:'lab',model:'deepseek/deepseek-v4-pro'});
 const first=await call('chat.send',{agentId:'lab',sessionKey:key,deliver:false,idempotencyKey:`${tag}-first`,timeoutMs:150000,
  message:`这是用户授权的隔离运行控制验收。不处理业务、不读写文件或记忆、不联网、不发送外部消息、不委派。先用 exec 执行 sleep 20，等待该前台工具完成后最终只回复 ${tag}_ORIGINAL。如果期间收到新指令，改变这个任务的最终回复。`});
 runId=first.runId;assert(runId);
 let ready=false;
 for(let i=0;i<55;i++){
  const h=await call('chat.history',{agentId:'lab',sessionKey:key,limit:20});
  if(h.messages?.some(x=>x.role==='assistant'&&Array.isArray(x.content)&&x.content.some(c=>c.type==='toolCall'&&c.name==='exec'))){ready=true;break;}
  const state=await call('agent.wait',{runId,timeoutMs:1});
  if(!['running','timeout'].includes(state.status))break;
  await new Promise(r=>setTimeout(r,1000));
 }
 assert(ready,'No real exec boundary');
 const second=await call('chat.send',{agentId:'lab',sessionKey:key,deliver:false,idempotencyKey:`${tag}-second`,timeoutMs:150000,
  ...(mode==='steer'?{queueMode:'steer'}:{}),message:mode==='stop'?'/stop':`改变正在执行的这一个任务，不另起新任务。当前工具完成后，只回复 ${tag}_CHANGED，不得回复旧 ORIGINAL 标记。`});
 let terminal;
 for(let i=0;i<6;i++){const result=await call('agent.wait',{runId,timeoutMs:25000});terminal=result.status;if(!['running','timeout'].includes(terminal))break;}
 assert(!['running','timeout'].includes(terminal),'Controlled run did not settle');settled=true;
 const statusAfter=await call('vlab.workers.status');
 const attempts=statusAfter.integration?.nativeHarnessStats?.workerAttempts-statusBefore.integration?.nativeHarnessStats?.workerAttempts;
 let nextStatus;
 if(mode==='stop'){
  const next=await call('chat.send',{agentId:'lab',sessionKey:key,deliver:false,idempotencyKey:`${tag}-next`,timeoutMs:90000,
   message:`停止验收完成，不恢复旧任务。请只用 exec 执行 printf '${tag}_TOOL\\n'，核对实际工具输出后最终只回复 ${tag}_RECOVERED。`});
  runId=next.runId;settled=false;
  for(let i=0;i<4;i++){const result=await call('agent.wait',{runId,timeoutMs:20000});nextStatus=result.status;if(!['running','timeout'].includes(nextStatus))break;}
  assert.equal(nextStatus,'ok');settled=true;
 } else {
  assert.equal(terminal,'ok');assert.equal(attempts,1,'Steer created a replacement Worker attempt');
  const injected=await call('agent.wait',{runId:second.runId,timeoutMs:1000});assert.equal(injected.status,'ok');
 }
 const h=await call('chat.history',{agentId:'lab',sessionKey:key,limit:35}),messages=h.messages??[];
 const plain=x=>typeof x.content==='string'?x.content:(x.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
 const assistants=messages.filter(x=>x.role==='assistant'),text=assistants.map(plain).join('\n');
 assert(!text.includes(`${tag}_ORIGINAL`));assert(text.includes(`${tag}_${mode==='stop'?'RECOVERED':'CHANGED'}`));
 if(mode==='stop')assert(messages.some(x=>x.role==='toolResult'&&plain(x).includes(`${tag}_TOOL`)));
 else assert.equal(messages.filter(x=>x.role==='user').length,2,'Steer persisted user input incorrectly');
 assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');assert.equal(h.sessionInfo?.status,'done');
 assert.deepEqual([...new Set(assistants.map(x=>x.model).filter(Boolean))],['deepseek-v4-pro']);
 assert.deepEqual(service(m.unit),before);assert.deepEqual(service('openclaw-vlab-production-mirror-v8.service'),shared);
 record(m,'control-probe',{mode,version,commit,workerArtifact,key,terminal,nextStatus,attempts,elapsedMs:Date.now()-stamp,passed:true});
} catch(error) {
 if(client&&runId&&!settled)try{await client.request('chat.abort',{sessionKey:key,runId},{timeoutMs:15000});}catch{}
 record(m,'control-probe',{mode,version,commit,workerArtifact,key,error:String(error.message).slice(0,300),passed:false});process.exitCode=1;
} finally {client?.stop();}
