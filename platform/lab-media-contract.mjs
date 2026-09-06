// Execute the actual 9.2 wake/schedule bodies with synthetic dependencies.
// No provider, network, media generation, channel or runtime mutation occurs.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {target,readJson,sourceCommit,record,digest,run,NODE} from './lab-instance.mjs';
import {patchOpenClawMediaCompletionBundle} from '../scripts/patch-openclaw-media-completion-relay.mjs';
import {createWorkerGatewayEventRouter} from '../experiments/agent-worker-isolation-v1/worker-gateway-events.mjs';

const [name,owner]=process.argv.slice(2),m=target(name,owner),commit=sourceCommit(m);
const core=`${m.root}/runtime/core92/node_modules/openclaw`;
assert.equal(readJson(`${core}/package.json`).version,'2026.9.2');
const files=fs.readdirSync(`${core}/dist`).filter(n=>/^openclaw-tools-[\w-]+\.js$/.test(n));
const matches=files.map(file=>({file,source:fs.readFileSync(`${core}/dist/${file}`,'utf8')}))
  .filter(x=>x.source.includes('function scheduleMediaGenerationTaskCompletion(params)'));
assert.equal(matches.length,1);const {file,source}=matches[0];
const patched=patchOpenClawMediaCompletionBundle(source).source;
run(NODE,['--check','--input-type=module'],{input:patched});
assert.equal(patchOpenClawMediaCompletionBundle(patched).changed,false);
function segment(start,end){const a=patched.indexOf(start),b=patched.indexOf(end,a);assert(a>=0&&b>a);return patched.slice(a,b);}
const wake=segment('async function wakeMediaGenerationTaskCompletion(params)',
  '//#region src/agents/tools/media-generate-background-shared.ts');
const schedule=segment('function scheduleMediaGenerationTaskCompletion(params)',
  'function createMediaGenerationTaskLifecycle(params)');
const bridge=Symbol.for('versa.vlab-worker.gateway-event-bridge-v1');
const handle={taskId:'synthetic-media-contract',runId:'synthetic-media-run',taskLabel:'fixture',
  requesterSessionKey:'agent:lab:explicit:media-contract',requesterAgentId:'lab'};
const attachments=[{kind:'image',url:'https://example.invalid/not-requested.png',mimeType:'image/png'}];
const params={handle,toolName:'image_generate',completionLabel:'image',eventSource:'image_generate',
  announceType:'task_completion',status:'ok',statusLabel:'completed',result:'fixture',attachments};
const outcomes=[];
for(const final of [{delivered:true},{delivered:false,disposition:'ambiguous'},
  {delivered:false,disposition:'failed',error:'fixture failed'}]) {
  let calls=0;const payloads=[];
  const context=vm.createContext({mediaUrlsFromGeneratedAttachments:()=>[],formatAgentInternalEventsForPrompt:()=> 'fixture',
    buildMediaGenerationReplyInstruction:()=> 'fixture instruction','log$6':{warn(){},error(){}},
    deliverSubagentAnnouncement:()=>assert.fail('Worker must not perform local delivery')});
  context[bridge]=createWorkerGatewayEventRouter({async deliverMediaCompletion(payload){
    payloads.push(payload);calls++;return calls===1?{delivered:false,disposition:'session_queued'}:final;
  }});
  vm.runInContext(wake,context);
  assert.equal((await context.wakeMediaGenerationTaskCompletion(params)).status,'pending');
  const status=(await context.wakeMediaGenerationTaskCompletion(params)).status;
  assert.equal(status,final.delivered||final.disposition==='ambiguous'?'delivered':'permanent_failure');
  assert.equal(calls,2);assert.equal(payloads[0].requesterAgentId,'lab');
  assert.equal(Object.hasOwn(payloads[0],'sourceChannel'),false);
  assert.deepEqual(payloads[0].internalEvents[0].attachments,attachments);
  assert.equal(payloads[0].directIdempotencyKey,'image_generate:synthetic-media-contract:ok');
  outcomes.push(status);
}
const lifecycle=[];
for(const generationFails of [false,true]) {
  const events=[];let work,completed=0,failed=0,unowned=0;
  const context=vm.createContext({
    withMediaGenerationTaskKeepalive:async p=>p.run(),formatErrorMessage:e=>e.message,
    wakeMediaGenerationTaskCompletionWithRetry:async p=>p.wake(),
    MEDIA_GENERATION_DELIVERING_COMPLETION_PROGRESS:'fixture',
    retainBlockedMediaReferences:x=>x,
    resolveRequiredCompletionDeliveryFailureTerminalResult:reason=>({status:'error',reason}),
    runWithoutOwnedSessionTranscriptWrites:async fn=>{unowned++;return await fn();}});
  context[bridge]=async e=>{events.push(e.eventKind);return {handled:true};};
  vm.runInContext(schedule,context);
  context.scheduleMediaGenerationTaskCompletion({...params,config:{},
    scheduleBackgroundWork:fn=>{work=fn;},onWakeFailure:()=>assert.fail('unexpected wake failure'),
    run:async()=>{if(generationFails)throw Error('fixture generation failure');return {attachments,wakeResult:'fixture'};},
    lifecycle:{wakeTaskCompletion:async()=>({status:'delivered'}),recordTaskProgress(){},
      completeTaskRun:()=>completed++,failTaskRun:()=>failed++}});
  await work();
  assert.deepEqual(events,['detached_task_started','detached_task_settled']);
  assert.equal(unowned,1);assert.equal(completed,generationFails?0:1);assert.equal(failed,generationFails?1:0);
  lifecycle.push({generationFails,completed,failed,transcriptOwnershipPreserved:true});
}
record(m,'media-contract-probe',{commit,coreVersion:'2026.9.2',file,beforeSha256:digest(source),
  transformedSha256:digest(patched),syntaxValid:true,idempotent:true,outcomes,lifecycle,
  runtimeModified:false,realMediaGeneration:false,externalDelivery:false,contractPassed:true,releaseReady:false});
