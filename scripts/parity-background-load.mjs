// Sixteen real Agent runs over copied history, not sleepers or synthetic locks.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
assert.equal(process.env.OPENCLAW_STATE_DIR,root+'/state');
const [tag,durationArg='1800']=process.argv.slice(2);assert(/^[A-Za-z0-9-]{1,40}$/.test(tag??''));
if(durationArg==='stop'){
 const marker=root+'/tmp/parity-results/background-'+tag+'.stop';
 if(!fs.existsSync(marker))fs.writeFileSync(marker,'coordinator requested controlled test end\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({tag,stopRequested:true}));process.exit(0);
}
const duration=Number(durationArg);assert(duration>=60&&duration<=3600);
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));
assert.equal(cfg.gateway.port,26340);assert.equal(cfg.channels&&Object.keys(cfg.channels).length,0);assert.equal(cfg.cron.enabled,false);
const directory=root+'/tmp/parity-results';fs.mkdirSync(directory,{recursive:true,mode:0o700});
const output=directory+'/background-'+tag+'.json';assert(!fs.existsSync(output),'unique run tag required');
const stopFile=directory+'/background-'+tag+'.stop';const stamp=Date.now();
const roster=[...Array(10).fill('makaron'),'v-codex','dealclaw','dealclaw','short-v','short-v','xiaoai'];
const report={tag,stamp,roster,controlledReplay:true,productionOAuthCopied:false,model:'deepseek/deepseek-v4-pro',jobs:[],sessions:[],samples:[],errors:[],ready:false,completed:false};
const persist=()=>{const tmp=output+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(report,null,2),{mode:0o600});fs.renameSync(tmp,output);};persist();
const tracked=new Map();let client,stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
const {GatewayClient}=await import(root+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{client?.stop();reject(Error('connect deadline'));},25000);
 client=new GatewayClient({url:'ws://127.0.0.1:26340',token:cfg.gateway.auth.token,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],
 onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);},
 onEvent:e=>{const p=e.payload,j=tracked.get(p?.runId);if(!j)return;const elapsed=Date.now()-j.start;
 if(e.event==='agent'&&p.stream==='assistant'&&typeof p.data?.text==='string'&&p.data.text.trim())j.firstTextMs??=elapsed;
 if(e.event==='chat'&&p.state==='final')j.finalMs=elapsed;if(e.event==='chat'&&['error','aborted'].includes(p.state))j.error=p.state;
 }});client.start();
});
const call=(method,params={},timeoutMs=30000)=>client.request(method,params,{timeoutMs});
const shouldStop=()=>stopping||fs.existsSync(stopFile)||Date.now()-stamp>duration*1000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let sampleLoop;
try{
 // Fork completed copied history, never resume a copied pending business run.
 for(let i=0;i<roster.length;i++){
  const agentId=roster[i],file=root+'/state/agents/'+agentId+'/agent/openclaw-agent.sqlite';
  const db=new DatabaseSync(file,{readOnly:true});
  const parents=db.prepare("SELECT session_key,current_session_id, json_extract(entry_json,'$.totalTokens') AS tokens FROM session_nodes WHERE status='done' AND json_extract(entry_json,'$.totalTokens') BETWEEN 30000 AND 90000 AND session_key NOT LIKE '%parity-%' ORDER BY tokens DESC LIMIT 12").all().map(p=>({...p,transcriptBytes:db.prepare('SELECT coalesce(sum(length(CAST(event_json AS BLOB))),0) AS n FROM transcript_events WHERE session_id=?').get(p.current_session_id).n})).filter(p=>p.transcriptBytes<=16*1024**2);db.close();
  const parent=parents.length?parents[i%parents.length]:null;
  const space=fs.statfsSync(root);assert(space.bavail*space.bsize>3.7*1024**3+3*(parent?.transcriptBytes??0),'Fork would violate data reserve');
  const key='agent:'+agentId+':explicit:parity-bg-'+tag+'-'+i;
  await call('sessions.create',{agentId,key,idempotencyKey:'BG_CREATE_'+tag+'_'+i,model:report.model,thinkingLevel:'low',
    ...(parent?{parentSessionKey:parent.session_key,fork:true,forkFrom:'last-completed',emitCommandHooks:false,succeedsParent:false}:{})},120000);
  report.sessions.push({agentId,key,parentKey:parent?.session_key??null,parentTokens:parent?.tokens??null,parentTranscriptBytes:parent?.transcriptBytes??null});persist();
 }
 sampleLoop=(async()=>{while(!shouldStop()){
  try{const s=await call('vlab.workers.status');const totalActive=s.workers.reduce((n,w)=>n+w.activeCount,0);
   report.samples.push({at:Date.now(),totalActive,pending:s.pending,workers:s.workers.length,backgroundSubmitted:tracked.size});
   if(totalActive>=16&&tracked.size===16)report.ready=true;
   const space=fs.statfsSync(root);if(space.bavail*space.bsize<3.2*1024**3)throw Error('Data reserve below 3.2 GiB');
   persist();
  }catch(e){report.errors.push({stage:'monitor',error:String(e)});stopping=true;}
  if(!shouldStop())await sleep(1000);
 }})();
 const workers=report.sessions.map(async(session,index)=>{
  for(let turn=0;!shouldStop();turn++){
   const j={index,turn,agentId:session.agentId,sessionKey:session.key,runId:'PARITY_BG_'+tag+'_'+index+'_'+turn,start:Date.now()};
   report.jobs.push(j);tracked.set(j.runId,j);assert(tracked.size<=16);persist();
   try{
    await call('sessions.messages.subscribe',{agentId:j.agentId,key:j.sessionKey});j.start=Date.now();
    const filename='parity-background-'+j.runId+'.md';
    const message='本轮独立 VLab 验收编号 '+j.runId+'。不要执行或继续历史任务，不访问外网、不对外发消息、不调用子 Agent。请只在当前测试 workspace 内完成一次实际文档审阅：先调用 exec 执行 pwd 和 ls -l AGENTS.md，接着用 read 工具读取当前 AGENTS.md，分析其中的隔离、验证和协作约束，写出 300～500 字的中文审阅结论。必须用 write 工具将结论写到当前目录的 '+filename+'，首行包含本轮编号。不得修改其他已有文件。最终只回复本轮编号和已写入的文件名。';
    j.ack=await call('chat.send',{agentId:j.agentId,sessionKey:j.sessionKey,message,thinking:'low',deliver:false,idempotencyKey:j.runId,timeoutMs:180000});
    while(!shouldStop()&&Date.now()-j.start<180000){if(j.error)throw Error(j.error);if(j.finalMs!==undefined)break;await sleep(250);}
    if(shouldStop()){j.cancelReason=report.errors.length?'peer-or-monitor-failure':'controlled-test-end';await call('chat.abort',{agentId:j.agentId,sessionKey:j.sessionKey,runId:j.runId}).catch(()=>{});break;}
    assert(Number.isFinite(j.finalMs),'Background final deadline');
    const h=await call('chat.history',{agentId:j.agentId,sessionKey:j.sessionKey,limit:80});
    assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
    const turnMessages=h.messages.slice(h.messages.findLastIndex(x=>x.role==='user')+1);
    const calls=turnMessages.flatMap(x=>Array.isArray(x.content)?x.content.filter(v=>v.type==='toolCall'):[]);
    const writes=calls.filter(c=>c.name==='write'&&JSON.stringify(c.arguments??{}).includes(j.runId));
    assert.equal(writes.length,1,'Exactly one fresh write required');
    const result=turnMessages.find(x=>x.role==='toolResult'&&x.toolCallId===writes[0].id);assert(result&&result.isError!==true);
    assert(calls.some(x=>x.name==='exec')&&calls.some(x=>x.name==='read'),'Actual native exec/read/write required');
    const last=turnMessages.filter(x=>x.role==='assistant').at(-1);assert.equal(last.model,'deepseek-v4-pro');assert.notEqual(last.stopReason,'error');j.usage=last.usage??null;
    const workspace=cfg.agents.entries[j.agentId].workspace??cfg.agents.defaults.workspace;
    const file=workspace+'/'+filename;assert(fs.readFileSync(file,'utf8').includes(j.runId));j.outputBytes=fs.statSync(file).size;j.verified=true;
    // Real native idle boundary; no synthetic sleep to hold an occupied slot.
    let idle=false;const started=Date.now();while(!shouldStop()&&Date.now()-started<60000){const s=await call('sessions.list',{limit:100});if(s.sessions.some(x=>x.key===j.sessionKey&&x.hasActiveRun===false)){idle=true;break;}await sleep(500);}assert(idle||shouldStop(),'Background did not become idle');
    console.log(JSON.stringify({phase:'background-reply',index,turn,runId:j.runId,firstTextMs:j.firstTextMs,finalMs:j.finalMs,outputBytes:j.outputBytes}));
   }catch(e){j.failure=String(e);report.errors.push({runId:j.runId,error:String(e)});stopping=true;}
   finally{tracked.delete(j.runId);persist();}
  }
 });
 await Promise.allSettled(workers);report.completed=report.errors.length===0;
}catch(e){report.errors.push({stage:'setup-or-run',error:String(e)});throw e;}finally{
 stopping=true;
 for(const j of report.jobs.filter(x=>!x.verified))await call('chat.abort',{agentId:j.agentId,sessionKey:j.sessionKey,runId:j.runId}).catch(()=>{});
 await sampleLoop;report.finishedAt=Date.now();persist();client.stop();
}
console.log(JSON.stringify({phase:'background-ended',output,completed:report.completed,ready:report.ready,jobs:report.jobs.length,errors:report.errors.length}));
