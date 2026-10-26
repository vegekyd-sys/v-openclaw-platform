// Real private Gateway / real configured model, synthetic Feishu transport only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {prepareCandidate,OWNER,DM_CHAT,GROUP_B,dmKey,groupKey,until,sha256,redact} from './bound-task-support.mjs';
import {createBackendDelegation} from '../realtime-direct-tools/backend.mjs';
test('bound Feishu tasks: native baseline, cross-session, direct/native Voice and restart', {timeout:600000}, async t=>{
 let c;t.after(async()=>{await c?.stop();});
 c=await prepareCandidate({harness:process.env.BOUND_TASK_HARNESS??'worker',maxWorkers:2,registerCleanup:fn=>t.after(fn)});
 const allowances=[];
 const f=path.join(c.dist,'realtime-session-harness-CEO5kVAJ.js'),before=fs.readFileSync(f,'utf8');
 const after=before+'\nexport {consultRealtimeVoiceAgent as candidateConsult};\n';fs.writeFileSync(f,after);
 allowances.push({target:path.basename(f),before:sha256(before),after:sha256(after),purpose:'Export exact native consult entry for a backend-only test; no audio connection'});
 const inspect=()=>c.rpc('candidate.boundTask',{op:'inspect'},30000);
 const waitTerminal=async source=>until(async()=>{const s=await inspect();return s.tasks.find(x=>x.source===source&&x.delivered);},{timeoutMs:180000,label:source+' native visible terminal'});
 const proof={harness:c.harness,allowances,checks:[]};
 const visibleProgress=(task,final)=>c.fake.snapshots.some(({at,message:m})=>at>=task.createdAt&&m.chat_id===(task.route.kind==='direct'?DM_CHAT:task.route.chatId)&&m.msg_type==='interactive'&&!JSON.stringify(m.body).includes(final)&&/exec|bash|执行|运行命令/iu.test(JSON.stringify(m.body)));
 const toolProof=async(key,marker)=>{const h=await c.rpc('chat.history',{sessionKey:key,limit:60});return (h.messages??[]).some(m=>{
  const blocks=m.content??[];const outputs=(m.role==='toolResult'||m.role==='tool')?m:blocks.filter?.(b=>['toolResult','tool_result'].includes(b.type));
  return outputs&&JSON.stringify(outputs).includes(marker);
 });};

 try {
  await c.start({timeoutMs:120000});console.log(JSON.stringify({stage:'gateway-ready',harness:c.harness}));assert((await inspect()).accounts.length>0);
  for(const [chatId,chatType] of [[DM_CHAT,'p2p'],[GROUP_B,'group']]){
   const seed=c.fake.post({receive_id:chatId,msg_type:'text',content:JSON.stringify({text:'candidate initialization'})});
   await c.inject({chatId,chatType,sender:OWNER,messageId:seed.message_id,mentionBot:chatType==='group',text:'只回复 BOUND_NATIVE_INIT，不调用工具。'});
   await until(()=>c.fake.list(chatId).some(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes('BOUND_NATIVE_INIT')),{timeoutMs:120000,label:'native baseline '+chatType});
  }
  assert.equal((await inspect()).tasks.length,0,'native channel ingress owns its existing dispatcher');proof.checks.push('native baseline: no second task/card');
  const target=groupKey(GROUP_B),source=dmKey();
  const result=await c.rpc('candidate.boundTask',{op:'cross',sessionKey:target,sourceSessionKey:source,runId:'bound-cross-'+Date.now(),
   text:'这是跨会话后台任务。调用 exec 执行命令 printf BOUND_CROSS_TOOL; sleep 2; printf BOUND_CROSS_FINAL。完成后回答实际输出里的最后一个标记，不发送任何外部消息。'},180000);
  const cross=await waitTerminal('inter-session');assert(JSON.stringify(c.fake.list(GROUP_B)).includes('BOUND_CROSS_FINAL'));assert(result.result);assert(visibleProgress(cross,'BOUND_CROSS_FINAL'),'cross-session native tool process before final');assert(await toolProof(target,'BOUND_CROSS_FINAL'),'cross-session actual tool output');proof.checks.push('cross-session native task request, process and terminal');
  const backend=createBackendDelegation({gateway:{request:(...a)=>c.client.request(...a)},sessionKey:source,ownerId:'candidate-call',timeoutMs:120000});
  c.onEvent=e=>backend.handleEvent(e);
  const direct=await backend.run({question:'调用 exec 执行命令 printf BOUND_DIRECT_TOOL; sleep 2; printf BOUND_DIRECT_FINAL。完成后回答实际输出里的最后一个标记，不发送外部消息。',context:'PRIVATE_DIRECT_CONTEXT_NOT_FOR_CARD',callId:'direct-1',signal:new AbortController().signal});
  assert(direct.result.includes('BOUND_DIRECT_FINAL'));const directTask=await waitTerminal('voice-direct');assert(visibleProgress(directTask,'BOUND_DIRECT_FINAL'),'direct Voice native tool process before final');assert(await toolProof(source,'BOUND_DIRECT_FINAL'),'direct Voice actual tool output');proof.checks.push('Voice direct backend: same run and actual final');
  const native=await c.rpc('candidate.boundTask',{op:'native',sessionKey:target,text:'调用 exec 执行命令 printf BOUND_NATIVE_TOOL; sleep 2; printf BOUND_NATIVE_FINAL。完成后回答实际输出里的最后一个标记，不发送任何外部消息。'},180000);
  assert(native.result.text.includes('BOUND_NATIVE_FINAL'));const nativeTask=await waitTerminal('voice-native');assert(visibleProgress(nativeTask,'BOUND_NATIVE_FINAL'),'native Voice tool process before final');assert(await toolProof(target,'BOUND_NATIVE_FINAL'),'native Voice actual tool output');proof.checks.push('Voice native consult: actual backend entry and final');
  const publicBodies=JSON.stringify([...c.fake.messages.values(),...c.fake.snapshots]);
  assert(!publicBodies.includes('PRIVATE_DIRECT_CONTEXT_NOT_FOR_CARD'));assert(!publicBodies.includes('PRIVATE_TRANSCRIPT_NOT_FOR_CARD'));
  assert.equal((await inspect()).tasks.length,3);assert.equal(c.fake.unimplemented.length,0,JSON.stringify(c.fake.unimplemented));
  const beforeSend=new Set((await inspect()).tasks.map(x=>x.id));
  const nested=await backend.run({question:`这是隔离候选里的内部跨会话验收。请只调用一次 sessions_send，将任务派给 sessionKey=${target}，timeoutSeconds=0。任务正文是“调用 exec 执行 printf BOUND_SEND_TOOL，然后只回复 BOUND_SEND_TARGET_DONE”。拿到受理回执后，你只回复 BOUND_SEND_REQUESTER_DONE，不替目标执行，不调用 message/send 工具。`,callId:'direct-send-2',signal:new AbortController().signal});
  assert(nested.result.includes('BOUND_SEND_REQUESTER_DONE'));
  const sent=await until(async()=>{const s=await inspect();return s.tasks.find(x=>!beforeSend.has(x.id)&&x.source==='inter-session'&&x.delivered);},{timeoutMs:180000,label:'real sessions_send target presentation'});
  const responses=c.fake.list(GROUP_B).filter(m=>m.message_id!==sent.anchorId&&JSON.stringify(m.body).includes('BOUND_SEND_TARGET_DONE'));
  assert.equal(responses.length,1,'real sessions_send plus legacy announce must create one visible target result');
  assert((await inspect()).tasks.length>=5);proof.checks.push('real model sessions_send: one target execution/card, legacy announce suppressed');
  let quietSince=Date.now(),lastSignature='';
  await until(async()=>{const rows=(await inspect()).tasks;const signature=JSON.stringify(rows.map(r=>[r.id,r.phase,r.delivered]));if(signature!==lastSignature){lastSignature=signature;quietSince=Date.now();}
   return rows.every(r=>r.delivered)&&Date.now()-quietSince>=2000;},{timeoutMs:180000,intervalMs:250,label:'all accepted requester wake turns settled before restart'});
  proof.checks.push('requester wake turns settled before restart');
  for(const task of (await inspect()).tasks)assert.equal(task.selectedModel?.agentRuntime,c.harness==='worker'?'vlab-worker':'codex','actual selected harness footer');
  proof.tasks=(await inspect()).tasks.map(({source,phase,delivered,runIds,selectedModel})=>({source,phase,delivered,runIds,selectedModel}));
  assert(!JSON.stringify([...c.fake.messages.values()]).includes('[Inter-session message]'));
  const count=c.fake.messages.size;await c.stop();await c.start({timeoutMs:120000});
  await inspect();assert.equal(c.fake.messages.size,count,'restart must not send completed outputs again');proof.checks.push('completed journal restart: no duplicate');
  const blocked=path.join(c.data,'blocked-platform.jsonl');assert(!fs.existsSync(blocked)||!fs.readFileSync(blocked,'utf8').trim(),'no real platform request attempted');
  proof.ok=true;proof.messages=c.fake.messages.size;proof.cards=c.fake.cards.size;
 } catch(error){proof.ok=false;proof.error=redact(error.stack);proof.observedCards=c.fake.snapshots.slice(-30);try{proof.observedTasks=(await inspect()).tasks;}catch{};proof.gatewayTail=redact(c.lines.slice(-55).map(x=>x.line).join('\n'));throw error;}
 finally {fs.writeFileSync(path.join(c.data,'bound-task-result.json'),JSON.stringify(proof,null,2));const output={...proof};if(!proof.ok){output.failureEvidenceGzip=gzipSync(JSON.stringify({cards:proof.observedCards,tasks:proof.observedTasks,gatewayTail:proof.gatewayTail})).toString('base64');delete output.observedCards;delete output.observedTasks;output.gatewayTail=proof.gatewayTail?.split('\n').slice(-8).join('\n');}console.log(JSON.stringify(output));}
});
