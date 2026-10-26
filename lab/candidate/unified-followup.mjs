import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prepareCandidate,until,groupKey,GROUP_B,AGENT,redact} from './inter-session-support.mjs';
const c=await prepareCandidate({harness:'vds',envMode:'v',plugin:'on',maxWorkers:1});
c.config.messages={...c.config.messages,queue:{...c.config.messages?.queue,mode:'followup'}};
c.env.VLAB_FEISHU_STEER_ENABLED='0';fs.writeFileSync(c.configPath,JSON.stringify(c.config));
const proof={kind:'unified-followup',ok:false,checks:[],allowance:'queue.mode=followup; Feishu owner steering disabled in private fixture to exercise queued admission deterministically'};
const records=()=>{const d=path.join(c.stateDir,'feishu-task-presentation');return fs.existsSync(d)?fs.readdirSync(d).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(d,n)))):[];};
try{
 await c.start();const key=groupKey(GROUP_B);await c.ensureSession(key);
 await c.humanInGroup(GROUP_B,{text:'这是隔离验收，只回复 QUEUE_BASE_READY。'});
 await until(()=>c.fake.list(GROUP_B).some(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes('QUEUE_BASE_READY')),{timeoutMs:120000,label:'initial native binding'});
 const busy=path.join(c.data,'queue-busy-start');
 const blocking=await c.rpc('agent',{sessionKey:key,agentId:AGENT,deliver:false,idempotencyKey:'queue-busy',message:`请立即用 exec 执行 touch ${busy}; sleep 25; printf QUEUE_BUSY_DONE，然后只回复命令输出。`});
 await until(()=>fs.existsSync(busy),{timeoutMs:120000,label:'busy run actually executing'});
 const ev=await c.humanInGroup(GROUP_B,{text:'这是独立追问。先告诉我“QUEUE_PUBLIC_PROGRESS：正在检查”，再调用 exec 执行 sleep 8; printf QUEUE_FOLLOWUP_FINAL，最后只回复实际命令输出。不要调用 message 工具。'});
 const row=await until(()=>records().find(r=>r.source==='queued-followup'&&r.delivered),{timeoutMs:180000,label:'followup native final ACK'});
 assert.equal(row.anchorId,ev.messageId);assert(row.runIds.length===1);assert.notEqual(row.runIds[0],blocking.runId);
 const replies=c.fake.list(GROUP_B).filter(m=>m.msg_type==='interactive'&&JSON.stringify(m).includes('QUEUE_FOLLOWUP_FINAL'));
 assert.equal(replies.length,1,'exactly one final card');
 const cardId=row.sinkState?.stream?.cardId;assert(cardId);
 const snapshots=c.fake.snapshots.filter(x=>x.message?.message_id===row.sinkState?.stream?.messageId);proof.snapshots=snapshots;
 assert(snapshots.some(x=>{const s=JSON.stringify(x);return !s.includes('QUEUE_FOLLOWUP_FINAL')&&/QUEUE_PUBLIC_PROGRESS|exec|执行/u.test(s);}), 'public progress before final on the exact card');
 assert(row.sinkState.receipts?.every(r=>r.visibleReplySent===true));
 assert.equal(c.fake.unimplemented.length,0);proof.checks.push('queued followup admitted as distinct run','same original request anchor','native progress before final','one final card with per-payload ACK');
 proof.record=row;proof.ok=true;
}catch(e){proof.error=redact(e.stack);proof.records=records();proof.gatewayTail=redact(c.lines.slice(-80).map(x=>x.line).join('\n'));process.exitCode=1;}
finally{await c.stop();await c.cleanup();console.log(JSON.stringify(proof));}
