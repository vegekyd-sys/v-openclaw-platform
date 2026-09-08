// Real Agent hi benchmark, private or exclusively leased full-data VLab only.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const shared=process.argv.includes('--shared');
const root=shared?'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902':'/srv/vlab-production-mirror/labs/instances/db91-fix';
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/'+(shared?'integration':'db91-fix')+'.json'));
assert.equal(m.owner,'codex-db91-contention-20260907');if(!shared)assert.equal(m.root,root);
const unit=shared?'openclaw-vlab-production-mirror-v8.service':m.unit;
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const v of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=v.indexOf('=');if(i>0)process.env[v.slice(0,i)]=v.slice(i+1);}
assert.equal(process.env.OPENCLAW_CONFIG_PATH,root+'/state/openclaw.json');
const cfg=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
assert.equal(cfg.gateway.port,shared?24993:26300);if(!shared){assert.equal(cfg.cron.enabled,false);assert.equal(cfg.browser.enabled,false);assert.equal(Object.keys(cfg.channels).length,0);}
const db=root+'/state/agents/makaron/agent/openclaw-agent.sqlite';assert(fs.statSync(db).size>=2_500_000_000);
assert(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize>3*1024**3);
const thinking=process.env.DB91_HI_THINKING??'low';assert(['low','max'].includes(thinking));
const fixtureName=process.argv.find(a=>/^hi-fixtures-\d+\.json$/.test(a));
const fixtures=fixtureName?JSON.parse(fs.readFileSync(root+'/state/db91-c5-release-20260907/'+fixtureName)):null;
if(fixtures){assert(shared);assert(fixtures.dm?.key?.startsWith('agent:makaron:')&&fixtures.group?.key?.startsWith('agent:makaron:'));}
const stamp=Date.now(),report={startedAt:new Date().toISOString(),gatewayPid:pid,databaseBytes:fs.statSync(db).size,thinkingRequested:thinking,message:'hi',count:3,scope:(shared?'shared':'private')+'-real-agent-websocket-no-channel-delivery',jobs:[]};
const output=root+(shared?'/state/db91-c5-release-20260907':'/workspace')+'/hi-'+stamp+'.json';
const persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
let current,client;
const {GatewayClient}=await import(root+(shared?'/runtime/npm-global/lib/node_modules/openclaw':'/runtime/openclaw')+'/dist/plugin-sdk/gateway-runtime.js');
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client?.stop();reject(Error('connection deadline'));},20000);
  client=new GatewayClient({url:'ws://127.0.0.1:'+cfg.gateway.port,token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],
    onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);},
    onEvent:event=>{
      const p=event.payload,j=current;if(!j||p?.runId!==j.runId&&p?.sessionKey!==j.sessionKey)return;
      const at=Date.now()-j.start,key=[event.event,p.stream??'',p.data?.phase??p.state??''].join('/');
      const record=j.events[key]??={firstMs:at,lastMs:at,count:0};record.lastMs=at;record.count++;
      const text=event.event==='agent'&&p.stream==='assistant'?p.data?.text:
        event.event==='chat'&&['delta','final'].includes(p.state)?(p.message?.content??[]).filter(c=>c.type==='text').map(c=>c.text).join(''):'';
      if(typeof text==='string'&&text.trim()&&j.firstTextMs===undefined){j.firstTextMs=at;j.firstTextChars=text.length;j.firstTextEvent=key;persist();console.log(JSON.stringify({phase:'first-text',runId:j.runId,elapsedMs:at}));}
      if(event.event==='chat'&&p.state==='final')j.finalEventMs=at;
      if(event.event==='chat'&&['error','aborted'].includes(p.state))j.terminalError=p.state;
    }});client.start();
});
const call=(method,params={},timeoutMs=20000)=>client.request(method,params,{timeoutMs});
const compactStatus=async()=>{const s=await call('vlab.workers.status');return {pending:s.pending,workers:s.workers.map(w=>({pid:w.pid,ready:w.ready,activeCount:w.activeCount,queued:w.queued}))};};
const counters=file=>Object.fromEntries(fs.readFileSync(file,'utf8').trim().split('\n').map(line=>{const [k,v]=line.split(/\s+/);return [k,Number(v)];}));
const cgroup='/sys/fs/cgroup/system.slice/'+unit;
report.resourceLimits=Object.fromEntries(['cpu.max','memory.high','memory.max'].map(name=>[name,fs.readFileSync(cgroup+'/'+name,'utf8').trim()]));
if(fixtures)report.historyFixture=fixtureName;
const resource=()=>({atMs:Date.now(),memoryCurrent:Number(fs.readFileSync(cgroup+'/memory.current')),memoryEvents:counters(cgroup+'/memory.events'),cpu:counters(cgroup+'/cpu.stat')});
try{
  report.before=await compactStatus();assert.equal(report.before.pending,0);assert(report.before.workers.every(w=>w.ready&&!w.activeCount&&!w.queued));
  const modes=fixtures?['dm_fork','group_fork','group_same']:['cold_new','warm_same','warm_new'];
  for(const [i,mode]of modes.entries()){
    assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/'+(shared?'integration':'db91-fix')+'.json')).owner,'codex-db91-contention-20260907');
    const sessionIndex=mode==='warm_same'?0:mode==='group_same'?1:i;
    // Use a synthetic, non-deliverable group peer while retaining native group classification.
    const prefix=fixtures&&mode.startsWith('group_')?'agent:makaron:feishu:group:':'agent:makaron:explicit:';
    const sessionKey=prefix+'db91-hi-'+stamp+'-'+thinking+'-'+sessionIndex;
    const j={mode,runId:'DB91_HI_'+stamp+'_'+thinking+'_'+mode,sessionKey,start:Date.now(),events:{},resourceBefore:resource()};
    report.jobs.push(j);current=j;persist();
    if(fixtures&&mode!=='group_same'){
      const parent=mode==='dm_fork'?fixtures.dm:fixtures.group;
      const forkAt=Date.now();
      await call('sessions.create',{key:sessionKey,agentId:'makaron',parentSessionKey:parent.key,fork:true,forkFrom:'last-completed',emitCommandHooks:false,succeedsParent:false,thinkingLevel:thinking},120000);
      j.forkSetupMs=Date.now()-forkAt;
      j.parentKeyHash=createHash('sha256').update(parent.key).digest('hex').slice(0,12);
      const inventory=await call('sessions.list',{limit:1000});
      const entry=(inventory.sessions??[]).find(s=>(s.key??s.sessionKey)===sessionKey);
      assert(entry,'forked session missing from native inventory');j.fixtureKind=entry.kind;j.fixtureChatType=entry.chatType;
      if(mode==='group_fork')assert.equal(entry.chatType,'group','group fixture lost native group classification');
    }
    assert.equal((await call('sessions.messages.subscribe',{agentId:'makaron',key:sessionKey})).subscribed,true);
    j.start=Date.now();let finished=false;
    try{
      const ack=await call('chat.send',{agentId:'makaron',sessionKey,message:'hi',thinking,deliver:false,idempotencyKey:j.runId,timeoutMs:180000});
      assert.equal(ack.runId,j.runId);j.admittedMs=Date.now()-j.start;
      while(Date.now()-j.start<180000){
        if(j.terminalError)throw Error('terminal '+j.terminalError);
        if(j.finalEventMs!==undefined)break;
        await new Promise(r=>setTimeout(r,100));
      }
      assert(Number.isFinite(j.finalEventMs),'final deadline');assert(Number.isFinite(j.firstTextMs),'no visible text');
      const h=await call('chat.history',{agentId:'makaron',sessionKey,limit:50});
      const users=(h.messages??[]).filter(v=>v.role==='user');
      if(!fixtures)assert.equal(users.length,mode==='warm_same'?2:1);
      assert.equal(users.at(-1).idempotencyKey,j.runId+':user');
      assert.equal(users.filter(u=>u.idempotencyKey===j.runId+':user').length,1);
      assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
      const assistants=(h.messages??[]).filter(v=>v.role==='assistant');
      const last=assistants.at(-1);assert.equal(last?.model,'deepseek-v4-pro');assert.notEqual(last.stopReason,'error');
      j.historyVerifiedMs=Date.now()-j.start;j.userCount=users.length;j.lastUserIdempotencyVerified=true;j.model=last.model;
      j.assistantMetadata=assistants.map(v=>({model:v.model,stopReason:v.stopReason,contentTypes:Array.isArray(v.content)?v.content.map(c=>c.type):[typeof v.content],usage:v.usage?{input:v.usage.input,cacheRead:v.usage.cacheRead,output:v.usage.output}:undefined}));
      j.resourceAfter=resource();j.within10Seconds=j.firstTextMs<=10000;
      j.replyTextSha256=createHash('sha256').update(Array.isArray(last.content)?last.content.filter(c=>c.type==='text').map(c=>c.text).join(''):String(last.content??'')).digest('hex');
      finished=true;persist();console.log(JSON.stringify({phase:'reply',mode,runId:j.runId,firstTextMs:j.firstTextMs,finalEventMs:j.finalEventMs,within10Seconds:j.within10Seconds}));
    }catch(error){j.error=String(error);persist();throw error;}
    finally{if(!finished)await call('chat.abort',{sessionKey,runId:j.runId}).catch(()=>{});current=undefined;}
  }
  report.after=await compactStatus();report.completed=true;persist();console.log(JSON.stringify({phase:'hi-complete',output}));
}finally{persist();client.stop();}
