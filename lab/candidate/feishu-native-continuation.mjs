import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {prepareCandidate,until,groupKey,GROUP_B,OWNER,redact} from './bound-task-support.mjs';
const cleanups=[];
const c=await prepareCandidate({harness:'native',maxWorkers:1,registerCleanup:f=>cleanups.push(f)});
c.humanInGroup=async(chatId,{text})=>{const seed=c.fake.post({receive_id:chatId,msg_type:'text',content:JSON.stringify({text})});await c.inject({chatId,chatType:'group',sender:OWNER,text,messageId:seed.message_id,mentionBot:true});return {messageId:seed.message_id};};
c.ensureSession=async()=>{};
const joint=process.env.ISC_ANNOUNCE_FOLLOWUP==='1';
if(joint){c.config.messages={...c.config.messages,queue:{...c.config.messages?.queue,mode:'steer'}};fs.writeFileSync(c.configPath,JSON.stringify(c.config));}
const proof={kind:'unified-announce',ok:false,checks:[],loadedCode:c.notes.filter(n=>n.startsWith('managed Codex overlay:'))};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const fault=process.env.ISC_ANNOUNCE_EMPTY_RETRY==='1';
if(fault){
 const command=path.join(c.dist,'agent-command-DPfawBbr.js'),before=fs.readFileSync(command,'utf8');
 const anchor='\t\tconst payloads = result.payloads ?? [];';assert.equal(before.split(anchor).length,2);
 const after=before.replace(anchor,'\t\tif(String(runId).startsWith("announce:")) result.payloads=[];\n'+anchor);fs.writeFileSync(command,after);
 proof.emptyFinalAllowance={before:sha(before),after:sha(after),purpose:'simulate an announce with no final payload after real tool execution'};
 const handle=c.fake.handle.bind(c.fake);let until=0,blocked=0;
 c.fake.handle=(method,p,b,...args)=>{
  if(method!=='GET'&&JSON.stringify(b).includes('本轮没有文字结果')){
   until ||= Date.now()+12000;
   if(Date.now()<until){blocked++;return {code:999999,msg:'candidate injected temporary final rejection'};}
  }
  return handle(method,p,b,...args);
 };
 proof.transportFault=()=>({blocked,until});
}
const projects=path.join(c.stateDir,'npm','projects');
const codex=fs.readdirSync(projects).filter(n=>n.startsWith('openclaw-codex-')).map(n=>path.join(projects,n,'node_modules','@openclaw','codex','dist')).find(p=>fs.existsSync(p));assert(codex);
const finalizerFault=process.env.ISC_FINALIZER_SUPPRESSED==='1';
if(finalizerFault){
 const file=path.join(codex,'run-attempt-D1hJO4fX.js'),before=fs.readFileSync(file,'utf8');
 const anchor='\tconst mirrorOutcome = await codexTranscriptMirrorRuntime.mirrorBestEffort({';assert.equal(before.split(anchor).length,2);
 const after=before.replace(anchor,'\n if (String(params.runId).startsWith("announce:")) { result.assistantTexts=[]; result.lastAssistant=undefined; result.messagesSnapshot=result.messagesSnapshot.filter(m=>!String(m.__openclaw?.mirrorIdentity??"").endsWith(":assistant")); }\n'+anchor);
 fs.writeFileSync(file,after);
 const mirrorFile=path.join(codex,'transcript-mirror-DTUxFWa_.js'),mirrorBefore=fs.readFileSync(mirrorFile,'utf8');
 const probe='\t\tconst mirroredMessages = mirrorResult.messagesPresent.filter((message) => {';
 assert.equal(mirrorBefore.split(probe).length,2);
 fs.writeFileSync(mirrorFile,mirrorBefore.replace(probe,`if(String(params.params.runId).startsWith('announce:')) {
 const expected=messages.find(m=>m.role==='user');
 embeddedAgentLog.warn('candidate-finalizer-prompt ' + JSON.stringify({expected:expected&&{identity:readMirrorIdentity(expected),idempotencyKey:expected.idempotencyKey,upstream:!!readUpstreamUserText(expected)},actual:mirrorResult.userMessagesPresent.map(m=>({identity:readMirrorIdentity(m),idempotencyKey:m.idempotencyKey,upstream:!!readUpstreamUserText(m),sameContent:JSON.stringify(m.content)===JSON.stringify(expected?.content),sameEvidence:serializeCodexMirrorSourceEvidence(m)===serializeCodexMirrorSourceEvidence(expected)}))}));
 }\n`+probe));
 proof.finalizerFault={purpose:'provider completes actual tools without a final answer; native isolated finalizer must recover the suppressed announce prompt',before:sha(before),after:sha(after)};
}
const input=path.join(c.data,'announce-input.bin'),tokenFile=path.join(c.data,'announce-token.txt');
const bytes=crypto.randomBytes(2048),token='TOK_'+crypto.randomBytes(8).toString('hex');fs.writeFileSync(input,bytes);fs.writeFileSync(tokenFile,token);
const expected=sha(bytes).slice(0,16);
const busy=path.join(c.data,'announce-parent-busy');
const executions=path.join(c.data,'announce-parent-executions');
const records=()=>{const d=path.join(c.stateDir,'feishu-task-presentation');return fs.existsSync(d)?fs.readdirSync(d).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(d,n)))):[];};
const rows=()=>{const f=path.join(c.stateDir,'state','openclaw.sqlite');if(!fs.existsSync(f))return[];const db=new DatabaseSync(f,{readOnly:true});try{return db.prepare("select run_id as runId,status,delivery_status as deliveryStatus,error from task_runs where task_kind='codex-native'").all();}finally{db.close();}};
try{
 await c.start();await c.ensureSession(groupKey(GROUP_B));
 await c.humanInGroup(GROUP_B,{text:`这是自动化功能验收。用 Codex 原生 spawn_agent（不是 sessions_spawn）派一个子 agent 执行 sleep 20; sha256sum ${input} 并返回哈希前16位；你不要代做。派出后立即 sessions_yield，不用 wait_agent；第一轮只做派发与让出，不执行父回合命令。收到子 agent 的回报后，先公开说明 ANN_PUBLIC_PROGRESS，调用 progress_card，plan 设为 [{"step":"ANN_PLAN_UPDATE","status":"in_progress"}]，再执行 echo executed >> ${executions}; touch ${busy}; sleep ${joint?35:8}; cat ${tokenFile}，等待真实命令结束，最后正常回复 ANN_FINAL <哈希前16位> <读取的 token>。不要调用 message 工具。`});
 let queued;
 if(joint){
  await until(()=>fs.existsSync(busy),{timeoutMs:180000,label:'announce parent is actually executing'});
  assert(records().some(r=>r.source==='subagent-announce'&&!r.delivered));
  queued=await c.humanInGroup(GROUP_B,{text:'这是新的独立追问。先公开说明 JOINT_QUEUE_PUBLIC_PROGRESS，调用 progress_card，plan 设为 [{"step":"JOINT_QUEUE_PLAN_UPDATE","status":"in_progress"}]，再执行 sleep 8; printf JOINT_QUEUE_FINAL，最后只回复实际命令输出。不用 message 工具。'});
 }
 const row=await until(()=>records().find(r=>r.source==='subagent-announce'&&r.delivered),{timeoutMs:240000,label:'announce native final ACK'});
 await until(()=>rows().some(r=>r.deliveryStatus==='delivered'),{timeoutMs:90000,label:'native task delivery ledger acknowledgement'});
 const output=fault?JSON.stringify(await c.rpc('chat.history',{sessionKey:groupKey(GROUP_B),limit:80})):JSON.stringify(c.fake.list(GROUP_B));
 assert(output.includes(expected));assert(output.includes(token));
 if(finalizerFault){
  const recovered=JSON.stringify(row.executionOutcome?.result?.payloads??[]);
  assert(recovered.includes(expected)&&recovered.includes(token),'persisted recovered final must contain actual tool evidence, not merely an earlier stream fragment');
  assert(!output.includes('no final summary was produced'),'must recover real summary, not generic terminal fallback');
  assert(c.lines.some(x=>x.line.includes('running isolated finalization')),'must exercise native finalizer');
  assert(!c.lines.some(x=>x.line.includes('finalization context is unavailable')),'suppressed prompt has verified finalizer evidence');
  assert.equal(fs.readFileSync(executions,'utf8').trim(),'executed','finalizer cannot rerun completed actions');
  proof.checks.push('suppressed prompt isolated finalizer recovered actual result','finalizer had no tools and parent side effect stayed once');
 }
 const final=c.fake.list(GROUP_B).filter(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes(fault?'本轮没有文字结果':token));assert.equal(final.length,1);
 const snaps=c.fake.snapshots.filter(x=>x.message?.message_id===row.sinkState?.stream?.messageId);
 assert(snaps.some(s=>!JSON.stringify(s).includes(token)&&/ANN_PUBLIC_PROGRESS|Bash|执行/u.test(JSON.stringify(s))),'native public process before final');
 assert(snaps.some(s=>!JSON.stringify(s).includes(token)&&JSON.stringify(s).includes('ANN_PLAN_UPDATE')),'announce progress_card visible before final');
 if(fault){
  const transport=proof.transportFault();delete proof.transportFault;proof.transportFault=transport;
  assert(transport.blocked>0);assert(JSON.stringify(row.executionOutcome).includes('没有文字结果'));
  assert.equal(fs.readFileSync(executions,'utf8').trim(),'executed','delivery recovery must not execute parent tools again');
  assert.equal(records().filter(r=>r.source==='subagent-announce').length,1);
  assert.equal(c.fake.list(GROUP_B).filter(m=>m.msg_type==='interactive').length,2,'initial native card plus one continuation card');
  proof.checks.push('empty final becomes truthful status notice','temporary final rejection recovered','cached announce failure reconciles actual ACK','parent side effect exactly once');
 }
 if(joint){
  const follow=await until(()=>records().find(r=>r.source==='queued-followup'&&r.delivered),{timeoutMs:180000,label:'steer-mode followup delivery'});
  assert.equal(follow.anchorId,queued.messageId);assert.notEqual(follow.activeRunId,row.activeRunId);assert.notEqual(follow.sinkState.stream.messageId,row.sinkState.stream.messageId);
  const followSnaps=c.fake.snapshots.filter(x=>x.message?.message_id===follow.sinkState.stream.messageId);
  assert(followSnaps.some(s=>!JSON.stringify(s).includes('JOINT_QUEUE_FINAL')&&JSON.stringify(s).includes('JOINT_QUEUE_PLAN_UPDATE')),'followup progress_card before final');
  assert(!JSON.stringify(snaps).includes('JOINT_QUEUE_PLAN_UPDATE'),'followup plan must not enter announce card');
  assert(!JSON.stringify(followSnaps).includes('ANN_PLAN_UPDATE'),'old announce plan must not enter followup card');
  assert.equal(c.fake.list(GROUP_B).filter(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes('JOINT_QUEUE_FINAL')).length,1);
  proof.followup=follow;proof.queueMode=c.config.messages.queue.mode;proof.checks.push('production steer mode with live announce lane','independent followup and original user anchor','both progress cards visible before final without mixing');
 }
 assert.equal(c.fake.unimplemented.length,0);proof.checks.push('native spawn_agent then sessions_yield','actual child hash and parent tool token','native progress before final','one result card','task_runs deliveryStatus=delivered');proof.record=row;proof.taskRows=rows();proof.ok=true;
}catch(e){proof.error=redact(e.stack);proof.records=records();proof.taskRows=rows();proof.finalizerDiagnostics=redact(c.lines.filter(x=>/finalization|evidence verification|candidate-finalizer-prompt/.test(x.line)).map(x=>x.line).join('\n'));proof.gatewayTail=redact(c.lines.slice(-100).map(x=>x.line).join('\n'));process.exitCode=1;}
finally{await c.stop();for(const f of cleanups)await f();console.log(JSON.stringify(proof));}
