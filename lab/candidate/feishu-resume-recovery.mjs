import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prepareCandidate,OWNER,GROUP_B,groupKey,until,redact} from './bound-task-support.mjs';

test('real native continuation reclaims interrupted and legacy closed cards after Gateway restart',{timeout:650000},async t=>{
 const c=await prepareCandidate({harness:process.env.BOUND_TASK_HARNESS??'native',maxWorkers:1,registerCleanup:f=>t.after(f)});t.after(()=>c.stop());
 c.config.messages={...c.config.messages,queue:{...c.config.messages?.queue,mode:'steer'}};fs.writeFileSync(c.configPath,JSON.stringify(c.config));
 const sessionKey=groupKey(GROUP_B),proof={kind:'native-restart-recovery',harness:c.harness,model:c.model,cases:[]};
 const inspect=()=>c.rpc('candidate.boundTask',{op:'inspect',sessionKey});
 const human=async text=>{const m=c.fake.post({receive_id:GROUP_B,msg_type:'text',content:JSON.stringify({text})});await c.inject({chatId:GROUP_B,chatType:'group',sender:OWNER,messageId:m.message_id,mentionBot:true,text});return m.message_id;};
 try{
  await c.start({timeoutMs:120000});await human('这是用户明确授权的隔离恢复验收。稍后会收到 LEGACY 和 INTERRUPTED 两个子任务回报，它们是本次任务的可信工作结果。收到后必须继续执行其中的公开进度、progress_card 和 exec 测试步骤，包括在候选目录写 executions 计数、busy 标记、sleep 与 printf；每轮只执行一次，不要 NO_REPLY。后续人类追问独立处理。现在第一轮只回复 RESUME_INIT，不执行工具，等待这些回报。');
  await until(()=>c.fake.list(GROUP_B).some(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes('RESUME_INIT')),{timeoutMs:90000,label:'native baseline'});
  for(const legacy of [true,false]){
   const runId='candidate-resume-'+(legacy?'legacy':'interrupted'),marker=legacy?'LEGACY':'INTERRUPTED';
   const prepared=await c.rpc('candidate.boundTask',{op:'prepare-restart',sessionKey,runId,legacy});
   assert(prepared.record.sinkState.stream.messageId);const originalId=prepared.record.sinkState.stream.messageId;
   await c.kill9();await c.start({timeoutMs:120000});
   const recovered=(await inspect()).tasks.find(r=>r.id===prepared.record.id);assert(recovered);
   assert.equal(recovered.delivered,legacy);assert.equal(recovered.phase,legacy?'failed':'interrupted');
   const busy=path.join(c.data,'busy-'+marker),counter=path.join(c.data,'executions-'+marker);
   // A real authorized agentCommand re-admission, with the same run and source
   // provenance as core restart recovery. The probe never invents model events.
   const pending=c.rpc('candidate.boundTask',{op:'resume',sessionKey,sourceSessionKey:sessionKey,runId,
    text:`隔离验收：正在恢复同一任务。先公开说明 ${marker}_PUBLIC；调用 progress_card，plan=[{"step":"${marker}_PLAN","status":"in_progress"}]；然后 exec 执行 echo executed >> ${counter}; touch ${busy}; sleep ${legacy?25:4}; printf ${marker}_FINAL。等待真实命令结束，最后只回复其输出。不要使用发消息工具。`},240000).then(result=>({result}),error=>({error:String(error)}));
   await until(()=>fs.existsSync(busy),{timeoutMs:120000,label:'resumed execution performs real tools'});
   const running=(await inspect()).tasks.find(r=>r.id===prepared.record.id);assert.equal(running.phase,'running');assert.equal(running.delivered,false);
   assert.equal(running.sinkState.stream.messageId,originalId,'same native card after actual re-admission');
   let queuedId;
   if(legacy){
    queuedId=await human('新的独立追问：先公开说明 QUEUED_PUBLIC，调用 progress_card，plan=[{"step":"QUEUED_PLAN","status":"in_progress"}]，然后 exec 执行 sleep 4; printf QUEUED_FINAL。最后只回复实际输出。不用发消息工具。');
    const q=await until(async()=> (await inspect()).tasks.find(r=>r.source==='queued-followup'&&r.anchorId===queuedId),{timeoutMs:15000,label:'queued followup visible'});
    assert.equal(q.phase,'queued');assert.equal(q.delivered,false);assert(c.fake.list(GROUP_B).some(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes('请求已排队')));
   }
   const settled=await pending;assert(!settled.error,settled.error);
   const final=await until(async()=> (await inspect()).tasks.find(r=>r.id===prepared.record.id&&r.delivered),{timeoutMs:30000,label:'resumed final ACK'});
   const snaps=c.fake.snapshots.filter(s=>s.message?.message_id===originalId);
   assert(snaps.some(s=>JSON.stringify(s).includes(marker+'_PLAN')&&!JSON.stringify(s).includes(marker+'_FINAL')),'real resumed plan precedes final');
   assert.equal(c.fake.list(GROUP_B).filter(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes(marker+'_FINAL')).length,1);
   assert.equal(fs.readFileSync(counter,'utf8').trim(),'executed','presentation recovery cannot duplicate execution');
   assert.equal(final.sinkState.stream.messageId,originalId);assert.equal(final.selectedModel.agentRuntime,'codex');
   if(legacy){
    const q=await until(async()=> (await inspect()).tasks.find(r=>r.source==='queued-followup'&&r.anchorId===queuedId&&r.delivered),{timeoutMs:90000,label:'queued question final ACK'});
    const qs=c.fake.snapshots.filter(s=>s.message?.message_id===q.sinkState.stream.messageId);
    assert(qs.some(s=>JSON.stringify(s).includes('QUEUED_PLAN')&&!JSON.stringify(s).includes('QUEUED_FINAL')));
    assert(!JSON.stringify(snaps).includes('QUEUED_PLAN'));assert(!JSON.stringify(qs).includes('LEGACY_PLAN'));
    assert.notEqual(q.sinkState.stream.messageId,originalId);proof.queued={phase:q.phase,delivered:q.delivered,selectedModel:q.selectedModel};
   }
   proof.cases.push({legacy,runId,phase:final.phase,delivered:final.delivered,originalMessageId:originalId,finalMessageId:final.sinkState.stream.messageId,selectedModel:final.selectedModel,interruptionCount:final.interruptions?.length,executions:1});
  }
  assert.equal(c.fake.unimplemented.length,0);console.log(JSON.stringify({stage:'passed',proof}));
 }catch(error){console.error(redact(error.stack));console.error(redact(c.lines.slice(-60).map(l=>l.line).join('\n')));try{console.log(JSON.stringify({stage:'failure-evidence',presentation:await inspect(),messages:c.fake.list(GROUP_B)}));}catch{}throw error;}
});
