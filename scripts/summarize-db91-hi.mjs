import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const shared=process.argv.includes('--shared');
const root=shared?'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902':'/srv/vlab-production-mirror/labs/instances/db91-fix';
const file=process.argv[2];assert(/^hi-\d+\.json$/.test(file));
const r=JSON.parse(fs.readFileSync(root+(shared?'/state/db91-c5-release-20260907':'/workspace')+'/'+file));
const since=new Date(r.startedAt).toISOString().replace('T',' ').replace(/\.\d+Z$/,' UTC');
const logs=execFileSync('journalctl',['-u',shared?'openclaw-vlab-production-mirror-v8.service':'openclaw-lab-db91-fix.service','--since',since,'--no-pager','-o','json'],{encoding:'utf8',maxBuffer:32*1024**2});
const jobs=new Map(r.jobs.map(j=>[j.runId,{...j,stages:[],nativePhases:[]}]));
for(const line of logs.split('\n').filter(Boolean)){
  const text=String(JSON.parse(line).MESSAGE??'');
  for(const m of text.matchAll(/\[(db91-hi-stage|db91-native-first-text|db91-(?:worker|prompt|attempt|session|boundary)-(?:phase|timing))\] (\{[^\n]+\})/g)){
    let p;try{p=JSON.parse(m[2]);}catch{continue;}const j=jobs.get(p.runId);if(!j)continue;
    if(m[1]==='db91-hi-stage')j.stages.push(p);
    else if(m[1]==='db91-native-first-text')j.workerFirstTextAt??=p.atMs;
    else j.nativePhases.push({kind:m[1],phase:p.phase??p.stage,elapsedMs:p.elapsedMs,atMs:p.atMs,pid:p.pid});
  }
}
const output=[...jobs.values()].map(j=>{
  j.stages.sort((a,b)=>a.atMs-b.atMs);
  const t=name=>j.stages.find(s=>s.stage===name)?.atMs;
  const delta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?Math.round(b-a):null;
  const relative=at=>delta(j.start,at);
  const pairs=[
    ['clientToGateway','CLIENT','gateway-chat-received'],
    ['gatewayAdmission','gateway-chat-received','gateway-admission-end'],
    ['gatewayAdmissionToHarness','gateway-admission-end','gateway-harness-enter'],
    ['harnessSessionPreflight','gateway-harness-enter','gateway-session-preflight-end'],
    ['poolWait','pool-enqueued','worker-ipc-send'],
    ['workerIPC','worker-ipc-send','worker-turn-enter'],
    ['workerBeforeCommand','worker-turn-enter','worker-before-agent-command'],
    ['agentCommandToProvider','worker-before-agent-command','provider-enter'],
    ['providerParamBuild','provider-client-ready','provider-params-built'],
    ['providerPayloadHooks','provider-params-built','provider-payload-hooks-end'],
    ['providerToFetch','provider-enter','http-fetch-start'],
    ['fetchToWireHeaders','http-fetch-start','http-headers-sent'],
    ['wireToResponseHeaders','http-headers-sent','http-response-headers'],
    ['headersToBodyConsumption','http-response-headers','http-first-body-consumed'],
    ['bodyToProviderText','http-first-body-consumed','provider-first-text'],
    ['providerTextToWorker','provider-first-text','WORKER_TEXT'],
    ['workerTextToClient','WORKER_TEXT','CLIENT_TEXT'],
  ];
  const time=name=>name==='CLIENT'?j.start:name==='CLIENT_TEXT'?j.start+j.firstTextMs:name==='WORKER_TEXT'?j.workerFirstTextAt:t(name);
  const segments=Object.fromEntries(pairs.map(([name,a,b])=>[name,delta(time(a),time(b))]));
  const calls=[...new Set(j.stages.filter(s=>s.call).map(s=>s.call))].map(call=>{
    const events=j.stages.filter(s=>s.call===call),s=stage=>events.find(e=>e.stage===stage);
    return {call,reasoningEffort:s('provider-enter')?.reasoningEffort,messages:s('provider-enter')?.messages,tools:s('provider-enter')?.tools,
      startsAtMs:relative(s('provider-enter')?.atMs),firstTextAtMs:relative(s('provider-first-text')?.atMs),
      errors:events.filter(e=>e.errorCategory).map(({stage,errorCategory,status})=>({stage,errorCategory,status})),
      events:events.map(({stage,atMs,request,status,bodyChars})=>({stage,atMs:relative(atMs),request,status,bodyChars}))};
  });
  const cpu0=j.resourceBefore?.cpu,cpu1=j.resourceAfter?.cpu;
  return {mode:j.mode,runId:j.runId,firstTextMs:j.firstTextMs,finalEventMs:j.finalEventMs,within10Seconds:j.within10Seconds,error:j.error,
    userCount:j.userCount,lastUserIdempotencyVerified:j.lastUserIdempotencyVerified,segments,calls,
    nativePhases:j.nativePhases.map(p=>({...p,atMs:relative(p.atMs)})),
    preProviderStages:j.stages.filter(s=>!s.call).map(({stage,atMs,cpuUserUs,cpuSystemUs,pid,eventLoopLagMaxMs,eventLoopUtilization})=>({stage,atMs:relative(atMs),cpuUserUs,cpuSystemUs,pid,eventLoopLagMaxMs,eventLoopUtilization})),
    resourceDelta:cpu0&&cpu1?{usageMs:(cpu1.usage_usec-cpu0.usage_usec)/1000,throttledMs:(cpu1.throttled_usec-cpu0.throttled_usec)/1000,throttledPeriods:cpu1.nr_throttled-cpu0.nr_throttled,
      memoryPeakSample:Math.max(j.resourceBefore.memoryCurrent,j.resourceAfter.memoryCurrent),oomKills:j.resourceAfter.memoryEvents.oom_kill-j.resourceBefore.memoryEvents.oom_kill}:undefined,
    assistantMetadata:j.assistantMetadata};
});
console.log(JSON.stringify({source:file,databaseBytes:r.databaseBytes,thinkingRequested:r.thinkingRequested,completed:r.completed??false,gatewayPid:r.gatewayPid,
  notes:['Wire-to-headers includes remote wait and network, not pure inference time.','First body is when SDK consumes its first existing stream chunk, not a packet timestamp.','Missing segments remain null.','Cold means first measured Agent turn after Gateway restart and readiness; not empty database.','Private instance is CPU 1 core, MemoryHigh 2GiB, MemoryMax 3GiB.'],jobs:output}));
