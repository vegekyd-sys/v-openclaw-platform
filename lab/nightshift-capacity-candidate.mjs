import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {enableNativeWorkboardTools} from './nightshift-native-worker-config.mjs';
const runtime=process.env.VLAB_CANDIDATE_RUNTIME, data=process.env.VLAB_CANDIDATE_DATA;
assert(runtime&&data,'candidate runtime required');
const configPath=process.env.OPENCLAW_CONFIG_PATH, state=process.env.OPENCLAW_STATE_DIR;
const config=JSON.parse(fs.readFileSync(configPath));
const sharedState=process.env.VLAB_SHARED_STATE_DIR;
const sharedRuntime=path.dirname(sharedState)+'/runtime';
const workerConfigSource=fs.readFileSync(sharedState+'/worker-openclaw.json','utf8');
const workerConfigSha256=createHash('sha256').update(workerConfigSource).digest('hex');
const workerConfig=JSON.parse(workerConfigSource
  .replaceAll(sharedState,state).replaceAll(sharedRuntime,runtime));
const workers=Number(process.env.BENCH_WORKERS??'5');
const benchmarkModel=process.env.BENCH_MODEL??config.agents.defaults.model.primary;
const actualModels=[],workerErrors=[];
const progress=(phase,details={})=>fs.writeFileSync(data+'/benchmark-progress.json',JSON.stringify({phase,at:new Date().toISOString(),...details}),{mode:0o600});
const offlineFiles=fs.readdirSync('packages/nightshift-core/test').filter(n=>n.endsWith('.test.mjs')).map(n=>'packages/nightshift-core/test/'+n)
  .concat(fs.readdirSync('apps/nightshift-dashboard/server').filter(n=>n.endsWith('.test.mjs')).map(n=>'apps/nightshift-dashboard/server/'+n));
offlineFiles.push('lab/nightshift-native-worker-config.test.mjs');
const offline=execFileSync(process.execPath,['--test',...offlineFiles],{env:{...process.env,NIGHTSHIFT_GATEWAY_CONTRACT_SOURCE:runtime+'/openclaw/dist/runtime-api-1CCazqtv.js'},encoding:'utf8',maxBuffer:2*1024*1024});
console.log(JSON.stringify({event:'offline-tests',summary:offline.split('\n').filter(l=>/^# (tests|pass|fail|skipped|duration)/.test(l))}));
progress('configure');
for(const c of [config,workerConfig]){
  c.logging={...c.logging,file:data+'/gateway-offload.log'};
  c.plugins=enableNativeWorkboardTools(c).plugins;
  c.cron={...c.cron,enabled:false};c.browser={...c.browser,enabled:false};
  for(const channel of Object.values(c.channels??{})) if(channel&&typeof channel==='object') channel.enabled=false;
  c.agents.defaults.heartbeat={...c.agents.defaults.heartbeat,every:'0m'};
  c.agents.defaults.maxConcurrent=45;
  c.agents.defaults.model={primary:benchmarkModel,fallbacks:[]};
  c.agents.defaults.workspace=data+'/workspace';
  for(const [id,a]of Object.entries(c.agents.entries??{})){
    a.workspace=data+'/workspace/'+id;a.agentDir=state+'/agents/'+id+'/agent';
    a.heartbeat={...a.heartbeat,every:'0m'};
    a.model={primary:benchmarkModel,fallbacks:[]};
  }
  c.gateway.port=config.gateway.port;
  c.gateway.bind='loopback';c.gateway.tailscale={mode:'off'};
}
const wp=config.plugins.entries['vlab-agent-worker-isolation'].config;
Object.assign(wp,{minWorkers:workers,maxWorkers:15,sessionsPerWorker:3,
  workerConfigPath:state+'/worker-openclaw.json',gatewayConfigPath:configPath});
// Copy only authentication files inside the server; never emit credentials.
for(const id of Object.keys(config.agents.entries??{})){
  for(const name of ['auth-profiles.json','auth.json','models.json']){
    const src=sharedState+'/agents/'+id+'/agent/'+name,dst=state+'/agents/'+id+'/agent/'+name;
    if(fs.existsSync(src))fs.copyFileSync(src,dst);
  }
}
// V workspaces commonly have Git metadata. Seed one small, explicit fixture so
// model selection via sessions.patch cannot accidentally skip the baseline path.
fs.mkdirSync(data+'/workspace',{recursive:true});
for(const agent of Object.values(config.agents.entries??{}))fs.mkdirSync(agent.workspace,{recursive:true});
const sharedConfig=JSON.parse(fs.readFileSync(process.env.VLAB_SHARED_CONFIG_PATH,'utf8'));
const identityFiles=[];
for(const [id,agent] of Object.entries(config.agents.entries??{})){
  const source=sharedConfig.agents.entries?.[id]?.workspace??sharedConfig.agents.defaults.workspace;
  if(!source)continue;
  for(const name of ['AGENTS.md','SOUL.md','IDENTITY.md','USER.md','TOOLS.md','MEMORY.md']){
    const p=path.join(source,name);
    if(fs.existsSync(p)){
      const bytes=fs.readFileSync(p);fs.writeFileSync(path.join(agent.workspace,name),bytes,{mode:0o600});
      identityFiles.push({agent:id,name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  }
}
console.log(JSON.stringify({event:'identity-fixture',files:identityFiles}));
if(process.env.NS_SERVER_E2E==='1'){
  const skill=config.agents.entries.makaron.workspace+'/skills/nightshift-capacity-fixture';
  fs.mkdirSync(skill,{recursive:true});
  fs.writeFileSync(skill+'/SKILL.md','---\nname: nightshift-capacity-fixture\ndescription: Execute only the current isolated candidate Workboard test and report its actual marker.\n---\nRead the current card. Run only its stated local marker command, verify the result, call workboard_complete with the current card id and token, then reply with the marker. Never operate on another card or send a message.\n');
}

fs.writeFileSync(data+'/workspace/benchmark-seed.txt','Gateway offload workload fixture\n');
for(const args of [['init','-q'],['config','user.name','Candidate Benchmark'],['config','user.email','candidate@example.invalid'],['add','benchmark-seed.txt'],['commit','-qm','benchmark fixture']])
  execFileSync('git',['-C',data+'/workspace',...args],{stdio:'pipe'});
fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
fs.writeFileSync(state+'/worker-openclaw.json',JSON.stringify(workerConfig),{mode:0o600});
const preload=path.resolve('lab/nightshift-capacity-profile.mjs');
const env={...process.env,OPENCLAW_FIRSTTEXT_WORKER_PHASES:'1',OPENCLAW_NO_RESPAWN:'1',OPENCLAW_SKIP_CHANNELS:'1',OPENCLAW_SKIP_CRON:'1'};
// A candidate cannot reuse the service's listener/inspector flags.
delete env.NODE_OPTIONS;delete env.OPENCLAW_GATEWAY_PORT;
const gateway=spawn(process.execPath,['--import',preload,runtime+'/openclaw/dist/index.js','gateway','--port',String(config.gateway.port)],{env,stdio:['ignore','pipe','pipe']});
let profilePort,closed=false,logTail=[],phases=[],client,lastConnectError;
gateway.on('exit',()=>{closed=true;});
for(const stream of [gateway.stdout,gateway.stderr]){
  let pending='';stream.on('data',chunk=>{
    pending+=chunk;const lines=pending.split('\n');pending=lines.pop();
    for(const line of lines){
      if(line.includes('[nightshift-profile-ready]'))try{profilePort=JSON.parse(line.slice(line.indexOf('{'))).port;}catch{}
      if(line.includes('[offload-worker-error]'))try{workerErrors.push(JSON.parse(line.slice(line.indexOf('{'))));}catch{}
      if(line.includes('[firsttext-metrics]'))try{const m=JSON.parse(line.slice(line.indexOf('{')));if(m.stage==='payload-ready')actualModels.push({runId:m.runId,provider:m.provider,model:m.model,effort:m.effort,toolCount:m.toolCount});}catch{}
      if(line.includes('firsttext-worker-phases'))try{phases.push(JSON.parse(line.slice(line.indexOf('{'))));}catch{}
      if(/error|fail|invalid|ready|listening|started/i.test(line)){logTail.push(line);if(logTail.length>25)logTail.shift();}
    }
  });
}
function proc(pid){
  try{
    const raw=fs.readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1].split(' ');
    const main=fs.readFileSync('/proc/'+pid+'/task/'+pid+'/stat','utf8').split(') ')[1].split(' ');
    const sm=fs.readFileSync('/proc/'+pid+'/smaps_rollup','utf8');
    const kb=k=>Number(sm.match(new RegExp('^'+k+':\\s+(\\d+)','m'))?.[1]??0);
    const threadCpuSets=[...new Set(fs.readdirSync('/proc/'+pid+'/task').flatMap(tid=>{try{return[fs.readFileSync('/proc/'+pid+'/task/'+tid+'/status','utf8').match(/^Cpus_allowed_list:\s*(.*)$/m)?.[1]];}catch{return[];}}))];
    return{pid,threadCpuSets,cpuSet:fs.readFileSync('/proc/'+pid+'/status','utf8').match(/^Cpus_allowed_list:\s*(.*)$/m)?.[1],mainCpuTicks:Number(main[11])+Number(main[12]),cpuTicks:Number(raw[11])+Number(raw[12]),rssKb:kb('Rss'),pssKb:kb('Pss'),privateKb:kb('Private_Clean')+kb('Private_Dirty')};
  }catch{return null;}
}
const hostSample=()=>({memAvailableKb:Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1]??0),cpu:fs.readFileSync('/proc/pressure/cpu','utf8').trim(),io:fs.readFileSync('/proc/pressure/io','utf8').trim(),memory:fs.readFileSync('/proc/pressure/memory','utf8').trim()});
const hostBefore=hostSample();let resourceStop=false,minAvailableKb=hostBefore.memAvailableKb;
const guard=setInterval(()=>{const available=hostSample().memAvailableKb;minAvailableKb=Math.min(minAvailableKb,available);if(available<600*1024&&!resourceStop){resourceStop=true;gateway.kill('SIGTERM');}},500);
const cgroupPath='/sys/fs/cgroup'+fs.readFileSync('/proc/self/cgroup','utf8').split('\n').find(l=>l.startsWith('0::')).slice(3);
const groupResources=()=>({cpuUsec:Number(fs.readFileSync(cgroupPath+'/cpu.stat','utf8').match(/^usage_usec (\d+)/m)[1]),
  memoryBytes:Number(fs.readFileSync(cgroupPath+'/memory.current','utf8')),peakMemoryBytes:fs.existsSync(cgroupPath+'/memory.peak')?Number(fs.readFileSync(cgroupPath+'/memory.peak','utf8')):undefined});
const clockTicks=100; // VLab Linux USER_HZ; verified with getconf CLK_TCK.
const {GatewayClient}=await import(runtime+'/openclaw/dist/plugin-sdk/gateway-runtime.js');
const eventRows=new Map();
try{
  progress('wait-health');
  for(let i=0;i<1200;i++){
    if(closed)throw Error('Gateway exited during startup');
    try{const r=await fetch('http://127.0.0.1:'+config.gateway.port+'/health',{signal:AbortSignal.timeout(500)});if(r.ok)break;}catch{}
    await delay(500);
  }
  progress('wait-connect');
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Gateway connect timeout: '+lastConnectError)),180000);
    client=new GatewayClient({url:'ws://127.0.0.1:'+config.gateway.port,token:config.gateway.auth.token,deviceIdentity:null,
      clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],
      onHelloOk:()=>{clearTimeout(timer);resolve();},
      onConnectError:e=>{lastConnectError=String(e?.message??e);},
      onEvent:event=>{
        const p=event.payload;if(!p?.runId)return;
        let row=eventRows.get(p.runId);if(!row)eventRows.set(p.runId,row={});
        if(event.event==='chat'&&p.state==='delta'&&JSON.stringify(p.message?.content??'').length>2)row.firstTextAt??=performance.now();
        if(event.event==='chat'&&p.state==='final')row.finalEvent=true;
      }});client.start();
  });
  const call=(method,params,timeoutMs=30000)=>client.request(method,params,{timeoutMs});
  async function addCron(params){
    const deadline=performance.now()+90000;
    for(;;){
      try{return await call('cron.add',params);}
      catch(error){
        if(!error.retryable||error.details?.method!=='cron.add'||!Number.isFinite(error.retryAfterMs)||performance.now()+error.retryAfterMs>deadline)throw error;
        await delay(Math.max(1,error.retryAfterMs)+100);
      }
    }
  }
  progress('wait-workers');
  let status;
  for(let i=0;i<180;i++){
    status=await call('vlab.workers.status',{});
    if(status.workers?.filter(w=>w.ready).length===workers)break;
    await delay(500);
  }
  assert.equal(status.workers?.filter(w=>w.ready).length,workers,'full actual Worker pool must be ready');
  assert(profilePort,'Gateway profile endpoint absent');
  console.log(JSON.stringify({event:'ready',pid:gateway.pid,workers:status.workers.map(w=>({pid:w.pid,ready:w.ready})),model:config.agents.defaults.model.primary}));

  const {WorkboardGatewayAdapter} = await import('../packages/nightshift-core/src/workboard-gateway-adapter.mjs');
  const {DispatchPressureGuard} = await import('../apps/nightshift-dashboard/server/dispatch-pressure-guard.mjs');
  const adapter=new WorkboardGatewayAdapter({board:'nightshift-capacity-'+randomUUID(),configPath,entry:runtime+'/openclaw/dist/index.js',gatewayUrl:'ws://127.0.0.1:'+config.gateway.port});
  await adapter.connect();
  let changes=0;adapter.onChange(()=>changes++);
  const percentiles=values=>{const s=values.toSorted((a,b)=>a-b);return {n:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)}};
  const ordinary=async()=>{
    const marker='INTERACTIVE_'+randomUUID().replaceAll('-',''),key='agent:makaron:explicit:'+marker,at=performance.now();
    const r=await call('chat.send',{agentId:'makaron',sessionKey:key,deliver:false,idempotencyKey:randomUUID(),message:'独立测试：只调用 exec 执行 printf '+marker+'，然后回复 '+marker+'。不要做其他操作。'},30000);
    const acceptedMs=performance.now()-at;
    let terminal;
    for(let i=0;i<6;i++){terminal=await call('agent.wait',{runId:r.runId,timeoutMs:30000},40000);if(terminal.status!=='timeout')break;}
    const h=await call('chat.history',{agentId:'makaron',sessionKey:key,limit:15});
    const executed=h.messages.some(m=>/tool/i.test(m.role)&&JSON.stringify(m).includes(marker));
    const replied=h.messages.some(m=>m.role==='assistant'&&JSON.stringify(m.content).includes(marker));
    return {acceptedMs,totalMs:performance.now()-at,ok:terminal.status==='ok'&&executed&&replied,runId:r.runId};
  };
  const baseline=[];for(let i=0;i<3;i++)baseline.push(await ordinary());
  console.log(JSON.stringify({event:'ordinary-baseline',outcomes:baseline}));
  assert(baseline.every(x=>x.ok));
  if(process.env.NS_SERVER_E2E==='1'){
    const {testNightShiftServer}=await import('./nightshift-server-e2e.mjs');
    await testNightShiftServer({data,runtime,env,call,ordinary});
  }
  for(const count of (process.env.NS_COUNTS??'2').split(',').filter(Boolean).map(Number)){
    const stage=String(count)+'-'+randomUUID(),barrier=data+'/release-'+stage;
    const tasks=[];
    const hold=process.env.NS_HOLD==='1' && count>=20;
    const script=data+'/hold-'+stage+'.py';
    fs.writeFileSync(script,`import pathlib,time,sys\nrelease=pathlib.Path(${JSON.stringify(barrier)})\ndeadline=time.time()+660\nwhile not release.exists() and time.time()<deadline: time.sleep(1)\nassert release.exists(), 'barrier timed out'\nprint(sys.argv[1])\n`);
    for(let i=0;i<count;i++){
      const marker='NS_'+stage.replaceAll('-','')+'_'+i;
      const command=hold?'python3 '+script+' '+marker+'_TOOL':'printf '+marker+'_TOOL';
      const notes='这是本次独立 VLab 测试，不能读取或修改业务卡、发送消息或调用付费服务。先调用 memory_search 查询 nightshift-capacity-fixture（允许无结果），再调用 exec 执行 '+command+'。若返回 running 则用 process poll 等待，timeout=120000，不要重复启动命令。看到 '+marker+'_TOOL 后调用 workboard_complete 完成本卡，最后回复 '+marker+'_FINAL。';
      const card=(await call('workboard.cards.create',{boardId:adapter.board,title:marker,status:'ready',agentId:'makaron',notes,parents:count===2&&i===1?[tasks[0].id]:undefined,maxRetries:1,maxRuntimeSeconds:900})).card;
      tasks.push({id:card.id,marker});
    }
    if(count===2){
      const blocked=await adapter.dispatch(1,{cardIds:[tasks[1].id]});
      assert.equal(blocked.started.length,0,'child must wait for native parent completion');
      console.log(JSON.stringify({event:'native-parent-gate',parent:tasks[0].id,child:tasks[1].id,started:blocked.started.length}));
    }
    const pressure=new DispatchPressureGuard({maxActive:36,initialMaxActive:3});
    const samples=[],interactive=[],launches=[];let peak=0,stop=false;
    const initialGatewayPid=gateway.pid;
    await fetch('http://127.0.0.1:'+profilePort+'/start');
    const start=performance.now();
    const deadline=start+(hold?540000:180000);
    const pending=new Set(tasks.map(t=>t.id));
    let nextOrdinary=0,ordinaryPending=null;
    while(pending.size&&performance.now()<deadline){
      const cards=await adapter.listCards({cardIds:tasks.map(t=>t.id)});
      const running=cards.filter(c=>c.status==='running'||c.execution?.status==='running').length;peak=Math.max(peak,running);
      const capacityProbe=await adapter.probeGatewayCapacity();const {latencyMs}=capacityProbe;samples.push(latencyMs);
      const probe=pressure.recordProbe({...capacityProbe,running});
      if(!ordinaryPending && performance.now()>nextOrdinary){
        nextOrdinary=performance.now()+15000;
        ordinaryPending=ordinary().then(result=>interactive.push(result),error=>interactive.push({ok:false,error:String(error)})).finally(()=>{ordinaryPending=null;});
      }
      if(probe.availableStarts){
        const at=performance.now();const r=await adapter.dispatch(1,{cardIds:[...pending]});
        for(const item of r.started){pending.delete(item.cardId);launches.push({...item,admissionMs:performance.now()-at});pressure.consumeStarts(1);}
        if(r.startFailures?.length)throw Error('native launch failure '+JSON.stringify(r.startFailures));
      }
      progress('ramp',{count,started:launches.length,pending:pending.size,peak,probeMs:latencyMs,level:probe.lastProbe.level});
      if(latencyMs>=5000||interactive.some(x=>!x.ok)){stop=true;break;}
      await delay(5000);
    }
    if(hold){
      await delay(1500);
      const cards=await adapter.listCards({cardIds:tasks.map(t=>t.id)});
      peak=Math.max(peak,cards.filter(c=>c.status==='running'||c.execution?.status==='running').length);
      fs.writeFileSync(barrier,'release');
    }
    if(ordinaryPending)await ordinaryPending;
    const outcomes=[];
    for(const run of launches){
      let terminal;for(let n=0;n<8;n++){terminal=await call('agent.wait',{runId:run.runId,timeoutMs:30000},40000);if(terminal.status!=='timeout')break;}
      const h=await call('chat.history',{agentId:'makaron',sessionKey:run.sessionKey,limit:40});
      const t=tasks.find(t=>t.id===run.cardId);
      const tc=h.messages.filter(m=>m.role==='assistant').flatMap(m=>m.content??[]).filter(c=>c.type==='toolCall');
      const exec=h.messages.some(m=>/tool/i.test(m.role)&&JSON.stringify(m).includes(t.marker+'_TOOL'));
      const final=h.messages.some(m=>m.role==='assistant'&&JSON.stringify(m.content).includes(t.marker+'_FINAL'));
      outcomes.push({cardId:t.id,runId:run.runId,status:terminal.status,error:terminal.error,messages:h.messages.filter(m=>m.role==='assistant').map(m=>({stopReason:m.stopReason,errorMessage:m.errorMessage,text:m.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n').slice(-1600)})),exec,final,memorySearch:tc.some(c=>c.name==='memory_search'),complete:tc.some(c=>c.name==='workboard_complete'),ok:terminal.status==='ok'&&exec&&final});
    }
    const finalCards=await adapter.listCards({cardIds:tasks.map(t=>t.id)});
    const profile=await(await fetch('http://127.0.0.1:'+profilePort+'/stop')).json();
    const result={event:'native-capacity',count,hold,peak,started:launches.length,pending:pending.size,stop,wallMs:performance.now()-start,probes:percentiles(samples),ordinary:interactive,admission:percentiles(launches.map(x=>x.admissionMs)),outcomes,cards:finalCards.map(c=>({id:c.id,status:c.status,parents:c.parents,execution:c.execution,automationSummary:c.metadata?.automation?.summary})),changes,profile,restarted:closed||gateway.pid!==initialGatewayPid,workerErrors,actualModels,logTail:outcomes.some(x=>!x.ok)?logTail:[]};
    console.log(JSON.stringify(result));
    assert.equal(launches.length,count,'pressure gate did not admit target');
    assert(outcomes.every(x=>x.ok&&x.memorySearch&&x.complete),'full native model/tool/final evidence required');
    assert(finalCards.every(c=>c.status==='done'),'native completion required');
    if(hold)assert.equal(peak,count,'target must be concurrently running');
    assert(interactive.every(x=>x.ok),'ordinary session failure');
    assert(percentiles(interactive.map(x=>x.acceptedMs)).p95 < 1000,'ordinary admission p95 exceeded 1 second');
    const ordinaryBudgetMs=Math.max(30000,2*percentiles(baseline.slice(1).map(x=>x.totalMs)).p95);
    assert(percentiles(interactive.map(x=>x.totalMs)).p95 < ordinaryBudgetMs,'ordinary tool/reply p95 exceeded baseline budget');
    assert(!closed&&workerErrors.length===0);
  }
  await adapter.close();
}finally{
  clearInterval(guard);client?.stop();gateway.kill('SIGTERM');await Promise.race([new Promise(r=>gateway.once('exit',r)),delay(10000)]);
  if(!closed)gateway.kill('SIGKILL');
}
