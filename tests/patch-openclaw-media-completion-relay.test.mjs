import assert from "node:assert/strict";
import test from "node:test";
import vm from 'node:vm';
import {createWorkerGatewayEventRouter} from '../experiments/agent-worker-isolation-v1/worker-gateway-events.mjs';
import {
  PATCH_MARKER,
  PATCH_MARKER_92,
  patchOpenClawMediaCompletionBundle,
} from "../scripts/patch-openclaw-media-completion-relay.mjs";

const fixture = `
function scheduleMediaGenerationTaskCompletion(params) {
\tparams.scheduleBackgroundWork(async () => {
\t\tlet executed;
\t\ttry {
\t\t\texecuted = await params.run();
\t\t} catch (error) {
\t\t\treturn;
\t\t}
\t\ttry {
\t\t\tparams.lifecycle.completeTaskRun({ handle: params.handle });
\t\t} catch (error) {
\t\t\tparams.onWakeFailure(\`\${params.toolName} completion state update failed\`, {
\t\t\t\ttaskId: params.handle?.taskId,
\t\t\t\trunId: params.handle?.runId,
\t\t\t\terror
\t\t\t});
\t\t\tparams.lifecycle.failTaskRun({
\t\t\t\thandle: params.handle,
\t\t\t\terror
\t\t\t});
\t\t}
\t});
}
async function wakeMediaGenerationTaskCompletion(params) {
\tconst announceId = \`\${params.toolName}:\${params.handle.taskId}:\${params.status}\`;
\tconst internalEvents = [];
\tconst triggerMessage = "complete";
\tconst delivery = await deliverSubagentAnnouncement({
\t\trequesterSessionKey: params.handle.requesterSessionKey
\t});
\treturn delivery.delivered;
}
async function tryDeliverMediaGenerationDirect(params) { return false; }
`;

const openClaw81Fixture = `
function scheduleMediaGenerationTaskCompletion(params) {
\tconst runBackgroundWork = async () => {
\t\tlet executed;
\t\ttry {
\t\t\texecuted = await withMediaGenerationTaskKeepalive({
\t\t\t\thandle: params.handle,
\t\t\t\trun: params.run
\t\t\t});
\t\t} catch (error) {
\t\t\tparams.lifecycle.failTaskRun({ handle: params.handle, error });
\t\t\treturn;
\t\t}
\t\ttry {
\t\t\tparams.lifecycle.completeTaskRun({ handle: params.handle });
\t\t} catch (error) {
\t\t\tparams.lifecycle.failTaskRun({ handle: params.handle, error });
\t\t}
\t};
\tparams.scheduleBackgroundWork(() => runWithoutOwnedSessionTranscriptWrites(runBackgroundWork));
}
async function wakeMediaGenerationTaskCompletion(params) {
\tconst announceId = \`\${params.toolName}:\${params.handle.taskId}:\${params.status}\`;
\tconst internalEvents = [];
\tconst triggerMessage = "complete";
\tconst delivery = await deliverSubagentAnnouncement({
\t\trequesterSessionKey: params.handle.requesterSessionKey
\t});
\treturn delivery.delivered;
}
async function tryDeliverMediaGenerationDirect(params) { return false; }
`;

test("patches lifecycle ownership and completion delivery together", () => {
  const result = patchOpenClawMediaCompletionBundle(fixture);
  assert.equal(result.changed, true);
  assert.equal(result.source.split(PATCH_MARKER).length - 1, 2);
  assert.match(result.source, /detached_task_started/);
  assert.match(result.source, /detached_task_settled/);
  assert.match(result.source, /media_generation_completion/);
  assert.match(result.source, /directIdempotencyKey: announceId/);
  assert.match(result.source, /if \(bridged\?\.handled === true\) return/);
});

const fixture92=`
async function wakeMediaGenerationTaskCompletion(params) {
\tconst announceId = params.handle.taskId;
\tconst internalEvents = [{type:'task_completion',attachments:params.attachments}];
\tconst triggerMessage = "complete";
\tconst delivery = await deliverSubagentAnnouncement({
\t\trequesterSessionKey: params.handle.requesterSessionKey,
\t\trequesterAgentId: params.handle.requesterAgentId,
\t\ttargetRequesterSessionKey: params.handle.requesterSessionKey,
\t\tannounceId, triggerMessage, steerMessage:triggerMessage, internalEvents,
\t\tsourceSessionKey:'image_generate:task-1',sourceTool:'image_generate',
\t\tdirectIdempotencyKey:announceId
\t});
\tif (delivery.delivered) return { status: "delivered" };
\tif (delivery.disposition === "session_queued" || delivery.reason === "completion_handoff_pending") return { status: "pending" };
\tif (delivery.disposition === "ambiguous") return { status: "delivered" };
\treturn { status: "permanent_failure" };
}
//#region src/agents/tools/media-generate-background-shared.ts
async function wakeMediaGenerationTaskCompletionWithRetry(params) { return await params.wake(); }
function scheduleMediaGenerationTaskCompletion(params) {
\tconst runBackgroundWork = async () => {
\t\tlet executed;
\t\ttry { executed=await params.run(); }
\t\tcatch(error) { params.lifecycle.failTaskRun({error}); return; }
\t\tparams.lifecycle.completeTaskRun({executed});
\t};
\tparams.scheduleBackgroundWork(() => runWithoutOwnedSessionTranscriptWrites(runBackgroundWork));
}
function createMediaGenerationTaskLifecycle(params) { return params; }
`;
const bridgeSymbol=Symbol.for('versa.vlab-worker.gateway-event-bridge-v1');
const mediaParams={toolName:'image_generate',status:'ok',handle:{taskId:'task-1',runId:'run-1',
  requesterSessionKey:'agent:lab:explicit:media-fixture',requesterAgentId:'lab'},
  attachments:[{type:'image',url:'https://example.invalid/fixture.png'}]};

test('9.2 patch tolerates native function reordering but preserves pending and failure outcomes',async()=>{
  const patched=patchOpenClawMediaCompletionBundle(fixture92);
  assert.equal(patched.source.split(PATCH_MARKER_92).length-1,2);
  assert.equal(patchOpenClawMediaCompletionBundle(patched.source).changed,false);
  let calls=0,local=0;const forwarded=[];
  const context=vm.createContext({deliverSubagentAnnouncement:()=>{local++;throw Error('must use Gateway');}});
  context[bridgeSymbol]=createWorkerGatewayEventRouter({async deliverMediaCompletion(params){
    forwarded.push(params);calls++;return calls===1?{delivered:false,disposition:'session_queued'}:{delivered:true};
  }});
  vm.runInContext(patched.source,context);
  assert.equal((await context.wakeMediaGenerationTaskCompletion(mediaParams)).status,'pending');
  assert.equal((await context.wakeMediaGenerationTaskCompletion(mediaParams)).status,'delivered');
  assert.equal((await context.wakeMediaGenerationTaskCompletion(mediaParams)).status,'delivered');
  assert.equal(calls,2);assert.equal(local,0);
  assert.equal(forwarded[0].requesterAgentId,'lab');
  assert.equal(JSON.stringify(forwarded[0].internalEvents[0].attachments),JSON.stringify(mediaParams.attachments));
});

test('9.2 IPC rejection is not hidden by a Worker-local emergency delivery',async()=>{
  const context=vm.createContext({deliverSubagentAnnouncement:()=>assert.fail('must not fall back')});
  context[bridgeSymbol]=async()=>{throw Error('IPC unavailable');};
  vm.runInContext(patchOpenClawMediaCompletionBundle(fixture92).source,context);
  await assert.rejects(context.wakeMediaGenerationTaskCompletion(mediaParams),/IPC unavailable/);
});

test('9.2 without a Worker bridge keeps native local delivery semantics',async()=>{
  for(const [delivery,status] of [[{delivered:true},'delivered'],[{disposition:'session_queued'},'pending'],
    [{disposition:'ambiguous'},'delivered'],[{delivered:false,error:'failed'},'permanent_failure']]) {
    const context=vm.createContext({deliverSubagentAnnouncement:async()=>delivery});
    vm.runInContext(patchOpenClawMediaCompletionBundle(fixture92).source,context);
    assert.equal((await context.wakeMediaGenerationTaskCompletion(mediaParams)).status,status);
  }
});

test('9.2 detached lifecycle settles both successful and failed generation without transcript ownership changes',async()=>{
  for(const failed of [false,true]) {
    const events=[];let work,unowned=0,completed=0,errors=0;
    const context=vm.createContext({runWithoutOwnedSessionTranscriptWrites:async fn=>{unowned++;return await fn();}});
    context[bridgeSymbol]=async event=>{events.push(event);return {handled:true};};
    vm.runInContext(patchOpenClawMediaCompletionBundle(fixture92).source,context);
    context.scheduleMediaGenerationTaskCompletion({...mediaParams,
      scheduleBackgroundWork:fn=>{work=fn;},onWakeFailure:()=>assert.fail('relay failed'),
      run:async()=>{if(failed)throw Error('generation failed');return {};},
      lifecycle:{completeTaskRun:()=>completed++,failTaskRun:()=>errors++}});
    await work();
    assert.deepEqual(events.map(e=>e.eventKind),['detached_task_started','detached_task_settled']);
    assert.equal(unowned,1);assert.equal(completed,failed?0:1);assert.equal(errors,failed?1:0);
  }
});

test('9.2 patch rejects drift and partial or legacy modifications',()=>{
  assert.throws(()=>patchOpenClawMediaCompletionBundle(fixture92.replace('requesterAgentId: params.handle.requesterAgentId','requesterAgentId: "unknown"')),/contract missing/);
  assert.throws(()=>patchOpenClawMediaCompletionBundle(fixture92+'\n// '+PATCH_MARKER_92),/partially/);
  const patched=patchOpenClawMediaCompletionBundle(fixture92).source;
  assert.throws(()=>patchOpenClawMediaCompletionBundle(patched.replace('eventKind: "detached_task_settled"','eventKind: "lost"')),/incomplete/);
});

test("patch is idempotent and rejects partial patches", () => {
  const first = patchOpenClawMediaCompletionBundle(fixture);
  const second = patchOpenClawMediaCompletionBundle(first.source);
  assert.equal(second.changed, false);
  assert.equal(second.source, first.source);
  assert.throws(
    () => patchOpenClawMediaCompletionBundle(`${fixture}\n// ${PATCH_MARKER}`),
    /partially patched/,
  );
});

test("patches the OpenClaw 2026.8.1 background-work shape", () => {
  const result = patchOpenClawMediaCompletionBundle(openClaw81Fixture);
  assert.equal(result.changed, true);
  assert.equal(result.source.split(PATCH_MARKER).length - 1, 2);
  assert.match(result.source, /const runBackgroundWork = async \(\) => \{/);
  assert.match(result.source, /detached_task_started/);
  assert.match(result.source, /detached_task_settled/);
  assert.match(result.source, /media_generation_completion/);
  assert.doesNotThrow(() => new Function(result.source));
  assert.equal(
    patchOpenClawMediaCompletionBundle(result.source).changed,
    false,
  );
});
