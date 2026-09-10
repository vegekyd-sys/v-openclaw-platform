// Real read-only tool execution and cross-turn recall in dedicated shared-Agent sessions.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const [owner,countArg='15',label='tool-context']=process.argv.slice(2),count=Number(countArg);
assert(/^[\w-]+$/.test(owner));assert(/^[a-z0-9-]+$/.test(label));assert(Number.isInteger(count)&&count>=1&&count<=15);assert.equal(os.hostname(),'VM-0-4-ubuntu');
const base='/srv/vlab-production-mirror/labs/instances/db91-parity',unit='openclaw-vlab-production-mirror-v8.service';
const run=(bin,args)=>execFileSync(bin,args,{encoding:'utf8',timeout:10000}).trim();
const pid=Number(run('systemctl',['show',unit,'-p','MainPID','--value']));assert(pid>1);
const env=Object.fromEntries(fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').filter(v=>v.includes('=')).map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));Object.assign(process.env,env);
const cfg=JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH)),model='deepseek/deepseek-v4-pro';assert.equal(cfg.gateway.port,24993);
for(const c of [cfg,JSON.parse(fs.readFileSync(cfg.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath))]){assert.equal(c.agents.defaults.model.primary,model);assert.deepEqual(c.agents.defaults.model.fallbacks,[]);}
const cg='/sys/fs/cgroup'+run('systemctl',['show',unit,'-p','ControlGroup','--value']);let peakMemory=0,minFreeBytes=Infinity;
function guard(){assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,owner);const s=fs.statfsSync(base);minFreeBytes=Math.min(minFreeBytes,s.bavail*s.bsize);assert(minFreeBytes>=3*1024**3,'Data-disk reserve below 3 GiB');const memory=Number(fs.readFileSync(cg+'/memory.current'));peakMemory=Math.max(peakMemory,memory);assert(memory<12.5*1024**3,'Memory safety limit');}
const {GatewayClient}=await import(base+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
const lanes=[],turns=[],byId=new Map(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));let client,started,report;
const body=m=>m?.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??'';
async function idle(){const s=await client.request('vlab.workers.status',{});assert(!s.pending&&s.workers.every(w=>!w.activeCount&&!w.queued&&!w.detachedTaskCount),'Shared Gateway is busy');}
try{
  guard();await new Promise((resolve,reject)=>{client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token.replace(/\$\{([A-Z0-9_]+)\}/g,(_,k)=>env[k]),deviceIdentity:null,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],onHelloOk:resolve,onConnectError:reject,onEvent(e){const t=byId.get(e.payload?.runId);if(!t)return;if(e.event==='chat'&&['final','error','aborted'].includes(e.payload?.state)){t.terminal=e.payload.state;t.totalMs=Date.now()-t.start;}}});client.start();});
  await idle();started=Date.now();
  for(let i=0;i<count;i++){const lane={key:`agent:makaron:explicit:concurrency-fix-${label}-${started}-${i}`,marker:'CTX_'+randomUUID().replaceAll('-','')};lanes.push(lane);await client.request('sessions.patch',{key:lane.key,agentId:'makaron',model});await client.request('sessions.messages.subscribe',{agentId:'makaron',key:lane.key});}
  for(const round of [1,2]){
    const batch=lanes.map(l=>({id:randomUUID(),key:l.key,round,marker:l.marker}));for(const t of batch){byId.set(t.id,t);turns.push(t);}
    console.log(JSON.stringify({event:'round-start',round,count}));
    await Promise.all(batch.map(async t=>{guard();t.start=Date.now();const message=round===1?`这是共享 VLab 功能验收。请记住仅属于本对话的校验码 ${t.marker}。现在只调用一次 session_status 工具查询本会话，不传 model，不修改设置，不查询其他会话。工具成功后只回复“工具已验证 ${t.marker}”。不使用其他工具，不向外发送消息。`:'这是上一轮验收的继续。请直接回复刚才本对话的完整校验码，不要调用工具，不要添加其他文字。';await client.request('chat.send',{agentId:'makaron',sessionKey:t.key,message,deliver:false,idempotencyKey:t.id,timeoutMs:180000});}));
    const deadline=Date.now()+190000;while(batch.some(t=>!t.terminal)&&Date.now()<deadline){guard();await sleep(250);}
    for(const t of batch){assert.equal(t.terminal,'final','Tool/context turn did not finish');const h=await client.request('chat.history',{agentId:'makaron',sessionKey:t.key,limit:30});const messages=h.messages??[],assistant=messages.filter(m=>m.role==='assistant'),final=assistant.at(-1);assert.equal(final?.provider,'deepseek');assert.equal(final?.model,'deepseek-v4-pro');assert.equal(final?.stopReason,'stop');assert(body(final).includes(t.marker),'Conversation marker missing or crossed');if(round===2)assert.equal(body(final).trim(),t.marker);
      const calls=assistant.flatMap(m=>(m.content??[]).filter(c=>c.type==='toolCall')),results=messages.filter(m=>m.role==='toolResult');assert.equal(calls.length,1,'Expected one real tool call across both turns');assert.equal(calls[0].name,'session_status');assert.equal(results.length,1,'Expected one real tool result');assert.equal(results[0].toolCallId,calls[0].id);assert.equal(results[0].toolName,'session_status');assert.notEqual(results[0].isError,true);assert(body(results[0]).trim(),'Tool result body missing');
      assert(assistant.every(m=>m.provider==='deepseek'&&m.model==='deepseek-v4-pro'),'Unexpected provider/model in tool loop');assert.equal(h.sessionInfo?.thinkingLevel,'high');assert.equal(h.sessionInfo?.status,'done');assert.equal(h.sessionInfo?.lastRunId,t.id);assert.equal(h.sessionInfo?.hasActiveRun,false);t.verified=true;t.toolCalls=calls.length;t.toolResults=results.length;t.modelCalls=assistant.length;t.thinking=h.sessionInfo.thinkingLevel;
    }await idle();console.log(JSON.stringify({event:'round-end',round,count,verified:batch.filter(t=>t.verified).length}));
  }
  const raw=execFileSync('journalctl',['-u',unit,'--since',new Date(started-1000).toISOString(),'-o','json','--no-pager'],{encoding:'utf8',maxBuffer:40*1024**2});const errors=[];
  for(const l of raw.split('\n')){if(!l)continue;const m=JSON.parse(l).MESSAGE??'';const kind=['terminal session persistence failed','webchat dispatch failed','Embedded agent failed before reply','SQLite session write failed','Worker Agent request failed','SQLite automatic session maintenance failed','SQLite automatic maintenance coordinator failed','SQLite automatic maintenance coordinator release failed','SQLite session maintenance cleanup failed','SQLite session maintenance archive sizing failed'].find(k=>m.includes(k));if(kind)errors.push({kind,databaseLocked:m.includes('database is locked')});}assert.equal(errors.length,0,'Runtime persistence/dispatch error');
  report={label,count,pid,started,finished:Date.now(),peakMemory,minFreeBytes,turns:turns.map(({marker,...rest})=>rest),errors};
}catch(e){report={label,count,pid,started,finished:Date.now(),peakMemory,minFreeBytes,turns:turns.map(({marker,...rest})=>rest),failure:{name:e.name,message:String(e.message).slice(0,300)}};throw e;
}finally{
  if(report){const output='/srv/vlab-production-mirror/labs/control/concurrency-tool-context-'+label+'-'+Date.now()+'.json';fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({output,...report}));}
  // Cancel only the exact native Worker-owned requests from this test.
  for(const t of turns.filter(t=>t.start&&!t.terminal))await client?.request('vlab.workers.native.cancel',{runId:t.id}).catch(()=>{});client?.stop();
}
