import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prepareCandidate,OWNER,GROUP_B,groupKey,until,redact} from './bound-task-support.mjs';
test('real cron current continuation: original Feishu group receives start, process and one final',{timeout:540000},async t=>{
 let c;t.after(async()=>c?.stop());
 c=await prepareCandidate({harness:process.env.BOUND_TASK_HARNESS??'vds',maxWorkers:2,registerCleanup:fn=>t.after(fn)});
 const proof={harness:c.harness,checks:[]};
 try{
  await c.start({timeoutMs:120000});console.log(JSON.stringify({stage:'gateway-ready',harness:c.harness}));
  const seed=c.fake.post({receive_id:GROUP_B,msg_type:'text',content:JSON.stringify({text:'candidate init'})});
  await c.inject({chatId:GROUP_B,chatType:'group',sender:OWNER,messageId:seed.message_id,mentionBot:true,text:'只回复 CRON_NATIVE_INIT，不调用工具。'});
  await until(()=>c.fake.list(GROUP_B).some(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes('CRON_NATIVE_INIT')),{timeoutMs:120000,label:'native baseline'});
  const sessionKey=groupKey(GROUP_B),inspect=()=>c.rpc('candidate.boundTask',{op:'inspect',sessionKey});
  assert.equal((await inspect()).tasks.length,0);proof.checks.push('native human ingress still owns its card');
  const job=await c.rpc('cron.add',{name:'Candidate automatic continuation',agentId:'makaron',sessionKey,enabled:false,deleteAfterRun:false,
   schedule:{kind:'at',at:new Date(Date.now()+3600000).toISOString()},sessionTarget:'current',wakeMode:'now',
   payload:{kind:'agentTurn',message:'这是隔离候选测试。先用一句简短的公开进度说明你开始检查。然后调用 exec 执行命令 printf CRON_PROCESS_OK; sleep 4; printf CRON_RESULT_OK。必须实际调用 exec 并等待命令结束；开始检查这句进度不能作为最终结果。只有看到真实输出 CRON_RESULT_OK 后才最终回答 CRON_RESULT_OK。不要使用任何发消息工具。',toolsAllow:['exec'],timeoutSeconds:120},
   delivery:{mode:'announce',channel:'feishu',accountId:'default',to:GROUP_B}});
  const id=job.id??job.job?.id;assert(id,JSON.stringify(job));console.log(JSON.stringify({stage:'cron-created',id}));
  const receipt=await c.rpc('cron.run',{id,mode:'force'},30000);assert(receipt.ok!==false,JSON.stringify(receipt));
  const started=await until(async()=>{const s=await inspect();return s.tasks.find(x=>x.source==='cron-continuation');},{timeoutMs:120000,label:'cron start card'});
  assert.equal(started.sessionKey,sessionKey);assert(started.executionSessionKey.includes(':cron:'));console.log(JSON.stringify({stage:'presentation-open',runIds:started.runIds}));
  const terminal=await until(async()=>{const s=await inspect();return s.tasks.find(x=>x.id===started.id&&x.delivered);},{timeoutMs:180000,label:'cron native final ACK'});
  const runs=await until(async()=>{const r=await c.rpc('cron.runs',{id,limit:5});return r.entries?.find(x=>x.action==='finished')??r.runs?.find(x=>x.status);},{timeoutMs:60000,label:'cron terminal receipt'});
  assert.equal(runs.status,'ok',JSON.stringify(runs));assert.equal(runs.delivered,true,JSON.stringify(runs));assert.equal(terminal.phase,'completed');
  const finals=c.fake.list(GROUP_B).filter(m=>m.msg_type==='interactive'&&JSON.stringify(m.body).includes('CRON_RESULT_OK'));
  assert.equal(finals.length,1,'result appears on one card only');
  const prior=c.fake.snapshots.filter(x=>x.at>=started.createdAt&&x.message.chat_id===GROUP_B&&x.message.msg_type==='interactive'&&!JSON.stringify(x.message.body).includes('CRON_RESULT_OK'));
  assert(prior.length>0,'start visible before result');
  assert(prior.some(x=>/exec|bash|执行|运行命令/iu.test(JSON.stringify(x.message.body))),'actual tool progress visible before result');
  assert(!prior.some(x=>JSON.stringify(x.message.body).includes('后台任务已结束')),'another conversation task cannot label a running continuation as ended');
  const raw=JSON.stringify(c.fake.list(GROUP_B));assert(!raw.includes('这是隔离候选测试'));assert(!raw.includes('unattended scheduled run'));
  proof.checks.push('real cron.add/run path','detached execution attached to original group','start and actual tool progress precede final','one native final with scheduler delivered receipt');
  proof.task={id:terminal.id,phase:terminal.phase,delivered:terminal.delivered,runIds:terminal.runIds,selectedModel:terminal.selectedModel};proof.run={status:runs.status,delivered:runs.delivered,delivery:runs.delivery};
  proof.visible={progressSnapshots:prior.length,finalCards:finals.length,finalMessageId:finals[0].message_id};
  assert.equal(terminal.selectedModel?.agentRuntime,c.harness==='worker'?'vlab-worker':'codex','actual selected harness');
  const cross=await c.rpc('candidate.boundTask',{op:'cross',sessionKey,sourceSessionKey:sessionKey,runId:'cron-regression-cross-'+Date.now(),text:'只回复 CROSS_UNCHANGED，不调用任何工具。'},120000);
  assert(cross.result);await until(()=>c.fake.list(GROUP_B).some(m=>JSON.stringify(m.body).includes('CROSS_UNCHANGED')),{timeoutMs:60000,label:'existing cross-session path'});
  proof.checks.push('existing inter-session presentation unchanged');assert.equal(c.fake.unimplemented.length,0,JSON.stringify(c.fake.unimplemented));
  fs.writeFileSync(path.join(c.data,'cron-progress-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({stage:'passed',proof}));
 }catch(e){console.error(redact(e.stack));
  console.error(redact(c.lines.slice(-70).map(x=>x.line).join('\n')));
  try{console.log(JSON.stringify({stage:'failure-evidence',presentation:await c.rpc('candidate.boundTask',{op:'inspect'}),messages:c.fake.list(GROUP_B)}));}catch{}
  throw e;
 }
});
