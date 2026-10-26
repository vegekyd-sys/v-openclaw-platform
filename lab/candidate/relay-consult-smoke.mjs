import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prepareCandidate,OWNER,DM_CHAT,GROUP_B,dmKey,groupKey,until,sha256,redact} from './bound-task-support.mjs';
test('both Voice consult callers wait through real sessions_send and requester handback', {timeout:600000},async t=>{
 let c; t.after(async()=>c?.stop());
 c=await prepareCandidate({harness:process.env.BOUND_TASK_HARNESS??'vds',maxWorkers:2,registerCleanup:fn=>t.after(fn)});
 const file=path.join(c.dist,'realtime-session-harness-CEO5kVAJ.js'),before=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,before+'\nexport {consultRealtimeVoiceAgent as candidateConsult};\n');
 const proof={harness:c.harness,allowance:{before:sha256(before),after:sha256(fs.readFileSync(file)),purpose:'export exact consult SDK for private backend-only acceptance'},checks:[]};
 try {
  await c.start({timeoutMs:120000});
  for(const[chatId,chatType]of[[DM_CHAT,'p2p'],[GROUP_B,'group']]){
   const m=c.fake.post({receive_id:chatId,msg_type:'text',content:JSON.stringify({text:'init'})});
   await c.inject({chatId,chatType,sender:OWNER,messageId:m.message_id,mentionBot:chatType==='group',text:'只回复 RELAY_CONSULT_INIT，不调用工具。'});
   await until(()=>c.fake.list(chatId).some(x=>x.msg_type==='interactive'&&JSON.stringify(x).includes('RELAY_CONSULT_INIT')),{timeoutMs:120000});
  }
  const source=dmKey(),target=groupKey(GROUP_B);
  for(const kind of ['direct','native']){
   const marker=kind==='direct'?'RELAY_DIRECT':'RELAY_NATIVE';
   const question=`隔离候选的跨会话回源验收。仅调用一次 sessions_send，sessionKey=${target}，timeoutSeconds=0，任务正文为：调用 exec 执行 sleep 3; printf '${marker}_'; date +%s，然后回复命令实际输出全文。你不要代替目标执行或猜测结果。派发受理后先结束当前回合；结果回源后再汇报命令实际输出全文。不得将受理回执作为任务最终结果。`;
   const start=Date.now();
   const r=await c.rpc('candidate.boundTask',{op:'native',direct:kind==='direct',continuation:true,sessionKey:source,text:question},240000);
   const text=r.result.text;
   const token=text.match(new RegExp(marker+'_\\d{10}'))?.[0];assert(token,'caller must receive runtime-generated target output, never acceptance ACK: '+text);
   const history=await c.rpc('chat.history',{sessionKey:target,limit:80});
   assert(history.messages.some(m=>['tool','toolResult'].includes(m.role)&&JSON.stringify(m.content).includes(token)),'actual target tool output');
   await until(()=>c.fake.list(DM_CHAT).some(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes(token)),{timeoutMs:30000,label:'actual requester card final'});
   const inspect=await c.rpc('candidate.boundTask',{op:'inspect'});
   const own=inspect.tasks.find(r=>r.source==='voice-'+kind&&r.publicText?.includes(marker)||r.source==='voice-'+kind&&r.text?.includes(marker))??inspect.tasks.filter(r=>r.source==='voice-'+kind).at(-1);
   assert(own,'source presentation exists');
   proof.checks.push({kind,actualOutput:token,elapsedMs:Date.now()-start,callerResult:text,taskId:own.id,phase:own.phase});
  }
  assert.equal(c.fake.unimplemented.length,0);proof.ok=true;
 }catch(error){proof.ok=false;proof.error=redact(error.stack);proof.gatewayTail=redact(c.lines.slice(-30).map(x=>x.line).join('\n'));throw error;}
 finally{fs.writeFileSync(path.join(c.data,'relay-consult-result.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));}
});
