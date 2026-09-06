// A single owner-scoped, real model/tool/final check; never a business Session.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {target,readJson,service,record,sourceCommit,treeHash} from './lab-instance.mjs';

const [name,owner,expectedCore]=process.argv.slice(2),m=target(name,owner),root=m.root;
assert(['2026.9.1','2026.9.2'].includes(expectedCore));
const core=`${root}/runtime/openclaw`;assert.equal(readJson(`${core}/package.json`).version,expectedCore);
const commit=sourceCommit(m),workerArtifact=treeHash(`${root}/runtime/worker`);
const cfg=readJson(`${root}/state/openclaw.json`),before=service(m.unit);assert(Number(before.MainPID)>1);
for(const entry of fs.readFileSync(`/proc/${before.MainPID}/environ`,'utf8').split('\0').filter(Boolean))process.env[entry.slice(0,entry.indexOf('='))]=entry.slice(entry.indexOf('=')+1);
const {GatewayClient}=await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
let client;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client.stop();reject(Error('Connect deadline'));},20000);
  client=new GatewayClient({url:`ws://127.0.0.1:${m.port}`,token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write'],
    onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);client.stop();reject(e);}});client.start();});
const call=(method,params={})=>client.request(method,params,{timeoutMs:45000});
const stamp=Date.now(),id=`vplatform-${expectedCore.replaceAll('.','-')}-${stamp}`,key=`agent:lab:explicit:${id}`;
const tool=`VPLATFORM_${stamp}_TOOL`,final=`VPLATFORM_${stamp}_DONE`;let runId,terminal;
try{
  await call('vlab.workers.status'); // Fail before sending a model request if registration is missing.
  let retainedHistories=0;
  for(const file of fs.readdirSync(`${root}/platform-evidence`).filter(x=>x.endsWith('-runtime-probe.json'))){
    const prior=readJson(`${root}/platform-evidence/${file}`);
    if(!prior.passed)continue;
    assert.match(prior.key,/^agent:lab:explicit:vplatform-2026-9-[12]-\d+$/);
    const history=await call('chat.history',{agentId:'lab',sessionKey:prior.key,limit:20});
    const priorStamp=prior.key.split('-').at(-1),messages=history.messages??[];
    const text=x=>typeof x.content==='string'?x.content:JSON.stringify((x.content??[]).filter(c=>c.type==='text'));
    assert(messages.some(x=>x.role==='toolResult'&&text(x).includes(`VPLATFORM_${priorStamp}_TOOL`)),'Prior synthetic tool history was lost');
    assert(messages.some(x=>x.role==='assistant'&&text(x).includes(`VPLATFORM_${priorStamp}_DONE`)),'Prior synthetic final history was lost');
    retainedHistories++;
  }
  await call('sessions.patch',{key,agentId:'lab',model:'deepseek/deepseek-v4-pro',label:id});
  const accepted=await call('chat.send',{agentId:'lab',sessionKey:key,idempotencyKey:id,deliver:false,thinking:'low',timeoutMs:180000,
    message:`这是用户授权的隔离 VLab 验收。不得读写业务文件、记忆或配置，不调用网络/浏览器、不发外部消息、不委派子任务、不重试。只调用 exec 执行 printf '${tool}\\n'，核对真实工具输出后最终只回复 ${final}。失败请如实说明，不得伪造成功。`});
  runId=accepted.runId??id;
  for(let i=0;i<42;i++){
    const wait=await call('agent.wait',{runId,timeoutMs:1});
    if(!['running','timeout'].includes(wait.status)){terminal=wait.status;break;}
    await new Promise(r=>setTimeout(r,5000));
  }
  assert.equal(terminal,'ok','Owned probe did not finish successfully');
  const h=await call('chat.history',{agentId:'lab',sessionKey:key,limit:20});
  const messages=h.messages??[],assistants=messages.filter(x=>x.role==='assistant');
  const text=x=>typeof x.content==='string'?x.content:JSON.stringify((x.content??[]).filter(c=>c.type==='text'));
  const toolOk=messages.filter(x=>x.role==='toolResult').some(x=>text(x).includes(tool));
  const replyOk=assistants.some(x=>text(x).includes(final));const models=[...new Set(assistants.map(x=>x.model).filter(Boolean))];
  const toolCalls=assistants.flatMap(x=>Array.isArray(x.content)?x.content.filter(c=>c.type==='toolCall').map(c=>c.name):[]);
  const runtime=h.sessionInfo?.agentRuntime?.id,status=h.sessionInfo?.status;
  const passed=toolOk&&replyOk&&runtime==='vlab-worker'&&status==='done'&&models.length===1&&models[0]==='deepseek-v4-pro'&&!messages.some(x=>x.isError||x.stopReason==='error');
  const workers=await call('vlab.workers.status');
  record(m,'runtime-probe',{expectedCore,commit,workerArtifact,retainedHistories,key,runId,terminal,elapsedMs:Date.now()-stamp,actualModels:models,runtime,status,toolCalls,toolResult:toolOk,finalReply:replyOk,
    workerVersion:workers.integration?.workerIsolationVersion,gatewayUnchanged:JSON.stringify(service(m.unit))===JSON.stringify(before),passed});
  assert(passed,'Actual runtime/model/tool/final proof failed');
}catch(error){
  if(runId&&!terminal)try{await call('chat.abort',{sessionKey:key,runId});}catch{}
  record(m,'runtime-probe-failed',{expectedCore,commit,workerArtifact,key,runId,terminal,error:String(error.message).slice(0,300),passed:false});process.exitCode=1;
}finally{client.stop();}
