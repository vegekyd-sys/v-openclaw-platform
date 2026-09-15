import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

export async function testNightShiftServer({data,runtime,env,call,ordinary}) {
  const id='NS-E2E-'+randomUUID().slice(0,20),board='server-'+id.toLowerCase();
  const markerA=data+'/server-a.txt',markerB=data+'/server-b.txt';
  const source=`---
apiVersion: nightshift.versa.ai/v1alpha1
kind: Workflow
metadata: {id: candidate-native-dag, version: 1.0.0, name: Candidate native DAG}
spec:
  ownerAgentRole: operator
  concurrency: {perInstance: 1, maxActiveInstances: 10}
---
# Candidate native DAG
## STAGE first｜First native task
### Goal
本次独立测试只执行 exec 命令 printf STAGE_A > ${markerA}，然后使用 workboard_complete 完成当前卡，最终回复 STAGE_A。不要操作其他卡片，不要发送消息。
\`\`\`stage
actor: agent
scope: project
skills: [nightshift-capacity-fixture]
outputs: [marker]
completeWhen: [output.marker.traceable]
timeout: 3m
retry: {maxAttempts: 1, idempotencyKey: "\${instance.id}:first"}
next: [second]
\`\`\`
## STAGE second｜Second native task
### Goal
本次独立测试只执行 exec 命令 test -f ${markerA} && printf STAGE_B > ${markerB}，然后使用 workboard_complete 完成当前卡，最终回复 STAGE_B。不要操作其他卡片，不要发送消息。
\`\`\`stage
actor: agent
scope: project
skills: [nightshift-capacity-fixture]
needs: [first]
outputs: [marker]
completeWhen: [output.marker.traceable]
timeout: 3m
retry: {maxAttempts: 1, idempotencyKey: "\${instance.id}:second"}
\`\`\`
`;
  const workflow=data+'/server-e2e.workflow.md';fs.writeFileSync(workflow,source);
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  let app,closed=false,logs='';
  const api=async(path,body)=>{
    const r=await fetch('http://127.0.0.1:'+port+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    const json=await r.json();assert(r.ok,JSON.stringify({path,status:r.status,error:json.error}));return json;
  };
  try{
    app=spawn(process.execPath,['apps/nightshift-dashboard/server/index.mjs'],{env:{...env,NIGHTSHIFT_PORT:String(port),NIGHTSHIFT_HOST:'127.0.0.1',NIGHTSHIFT_DATA_DIR:data+'/nightshift-app',NIGHTSHIFT_WORKFLOW_PATH:workflow,NIGHTSHIFT_BOARD:board,NIGHTSHIFT_OPENCLAW_ENTRY:runtime+'/openclaw/dist/index.js',NIGHTSHIFT_GATEWAY_URL:'ws://127.0.0.1:'+JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH)).gateway.port,NIGHTSHIFT_PUBLIC_HOST:'',NIGHTSHIFT_BASIC_AUTH_FILE:''},stdio:['ignore','pipe','pipe']});
    app.on('exit',()=>{closed=true;});
    for(const stream of [app.stdout,app.stderr])stream.on('data',c=>{logs=(logs+c).slice(-4000);});
    for(let n=0;n<120;n++){if(closed)throw Error(logs);try{await api('/api/health');break;}catch{}await delay(500);}
    const published=await api('/api/workflows/publish',{sourceMarkdown:source});
    const created=await api('/api/instances',{id,name:'Server native DAG',workflowSha256:published.workflowSha256,agentBindings:{operator:'makaron'},inputs:{},automaticDispatch:true});
    assert.equal(created.initialScheduleError,null);
    assert.equal(created.initialSchedule.dispatched,false,'HTTP creation must enqueue guarded dispatch');
    const at=performance.now();let instance;
    while(performance.now()-at<180000){
      instance=await api('/api/instances/'+id);if(instance.status==='done')break;
      if(instance.stageRuns.some(r=>r.status==='blocked'))throw Error('server stage blocked '+JSON.stringify(instance.stageRuns));
      await delay(1500);
    }
    const snapshot=await api('/api/bootstrap'),health=await api('/api/health');
    const cards=(await call('workboard.cards.list',{boardId:board})).cards;
    console.log(JSON.stringify({event:'nightshift-server-e2e',instance,wallMs:performance.now()-at,health,cards:cards.map(c=>({id:c.id,status:c.status,labels:c.labels,links:c.metadata?.links})),eventTypes:snapshot.events.map(e=>e.type)}));
    assert.equal(instance.status,'done','event-driven server must finish before the 5-minute repair sweep');
    assert.equal(fs.readFileSync(markerA,'utf8'),'STAGE_A');assert.equal(fs.readFileSync(markerB,'utf8'),'STAGE_B');
    assert.equal(cards.length,2);assert(cards.every(c=>c.status==='done'));
    const first=cards.find(c=>c.labels.includes('stage:first')),second=cards.find(c=>c.labels.includes('stage:second'));
    assert(second.metadata.links.some(l=>l.type==='parent'&&l.targetCardId===first.id));
    assert.equal(health.schedulerMode,'workboard-events');assert(health.ok);
    assert((await ordinary()).ok);
  }catch(e){console.log(JSON.stringify({event:'nightshift-server-error',error:String(e.message),logs}));throw e;}
  finally{if(app){app.kill('SIGTERM');await Promise.race([new Promise(r=>app.once('exit',r)),delay(5000)]);if(!closed)app.kill('SIGKILL');}}
}
