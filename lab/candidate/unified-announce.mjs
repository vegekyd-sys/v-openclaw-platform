import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {prepareCandidate,until,groupKey,GROUP_B,redact} from './inter-session-support.mjs';
const c=await prepareCandidate({harness:'vds',envMode:'v',plugin:'on',maxWorkers:1});
const joint=process.env.ISC_ANNOUNCE_FOLLOWUP==='1';
if(joint){c.config.messages={...c.config.messages,queue:{...c.config.messages?.queue,mode:'steer'}};fs.writeFileSync(c.configPath,JSON.stringify(c.config));}
const proof={kind:'unified-announce',ok:false,checks:[]};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const projects=path.join(c.stateDir,'npm','projects');
const codex=fs.readdirSync(projects).filter(n=>n.startsWith('openclaw-codex-')).map(n=>path.join(projects,n,'node_modules','@openclaw','codex','dist')).find(p=>fs.existsSync(p));assert(codex);
const name=fs.readdirSync(codex).find(n=>/^thread-lifecycle-.*\.js$/u.test(n)),file=path.join(codex,name),before=fs.readFileSync(file,'utf8');
const anchor='return normalizedId === "gpt-5.4-nano" || normalizedId.startsWith("deepseek");';assert.equal(before.split(anchor).length,2);
const after=before.replace(anchor,'return normalizedId === "gpt-5.4-nano";');fs.writeFileSync(file,after);proof.allowance={purpose:'DeepSeek native multi-agent enabled in private candidate only',file:name,before:sha(before),after:sha(after)};
const input=path.join(c.data,'announce-input.bin'),tokenFile=path.join(c.data,'announce-token.txt');
const bytes=crypto.randomBytes(2048),token='TOK_'+crypto.randomBytes(8).toString('hex');fs.writeFileSync(input,bytes);fs.writeFileSync(tokenFile,token);
const expected=sha(bytes).slice(0,16);
const busy=path.join(c.data,'announce-parent-busy');
const records=()=>{const d=path.join(c.stateDir,'feishu-task-presentation');return fs.existsSync(d)?fs.readdirSync(d).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(d,n)))):[];};
const rows=()=>{const f=path.join(c.stateDir,'state','openclaw.sqlite');if(!fs.existsSync(f))return[];const db=new DatabaseSync(f,{readOnly:true});try{return db.prepare("select run_id as runId,status,delivery_status as deliveryStatus,error from task_runs where task_kind='codex-native'").all();}finally{db.close();}};
try{
 await c.start();await c.ensureSession(groupKey(GROUP_B));
 await c.humanInGroup(GROUP_B,{text:`这是自动化功能验收。用 Codex 原生 spawn_agent（不是 sessions_spawn）派一个子 agent 执行 sha256sum ${input} 并返回哈希前16位；你不要代做。派出后立即 sessions_yield，不用 wait_agent。收到子 agent 的回报后，先公开说明 ANN_PUBLIC_PROGRESS，调用 progress_card，plan 设为 [{"step":"ANN_PLAN_UPDATE","status":"in_progress"}]，再执行 touch ${busy}; sleep ${joint?35:8}; cat ${tokenFile}，等待真实命令结束，最后正常回复 ANN_FINAL <哈希前16位> <读取的 token>。不要调用 message 工具。`});
 let queued;
 if(joint){
  await until(()=>fs.existsSync(busy),{timeoutMs:180000,label:'announce parent is actually executing'});
  assert(records().some(r=>r.source==='subagent-announce'&&!r.delivered));
  queued=await c.humanInGroup(GROUP_B,{text:'这是新的独立追问。先公开说明 JOINT_QUEUE_PUBLIC_PROGRESS，调用 progress_card，plan 设为 [{"step":"JOINT_QUEUE_PLAN_UPDATE","status":"in_progress"}]，再执行 sleep 8; printf JOINT_QUEUE_FINAL，最后只回复实际命令输出。不用 message 工具。'});
 }
 const row=await until(()=>records().find(r=>r.source==='subagent-announce'&&r.delivered),{timeoutMs:240000,label:'announce native final ACK'});
 await until(()=>rows().some(r=>r.deliveryStatus==='delivered'),{timeoutMs:45000,label:'native task delivery ledger acknowledgement'});
 const output=JSON.stringify(c.fake.list(GROUP_B));assert(output.includes(expected));assert(output.includes(token));
 const final=c.fake.list(GROUP_B).filter(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes(token));assert.equal(final.length,1);
 const snaps=c.fake.snapshots.filter(x=>x.message?.message_id===row.sinkState?.stream?.messageId);
 assert(snaps.some(s=>!JSON.stringify(s).includes(token)&&/ANN_PUBLIC_PROGRESS|Bash|执行/u.test(JSON.stringify(s))),'native public process before final');
 assert(snaps.some(s=>!JSON.stringify(s).includes(token)&&JSON.stringify(s).includes('ANN_PLAN_UPDATE')),'announce progress_card visible before final');
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
}catch(e){proof.error=redact(e.stack);proof.records=records();proof.taskRows=rows();proof.gatewayTail=redact(c.lines.slice(-100).map(x=>x.line).join('\n'));process.exitCode=1;}
finally{await c.stop();await c.cleanup();console.log(JSON.stringify(proof));}
