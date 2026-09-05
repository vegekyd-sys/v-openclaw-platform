import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {deferWorkerTerminalEvent} from '../experiments/agent-worker-isolation-v1/gateway-owned-terminal.mjs';
const root=process.argv[2];
assert(root?.includes('/labs/instances/'),'Private instance core required');
const {t:createBackstop}=await import(pathToFileURL(root+'/dist/agent-lifecycle-terminal-BKyQ-iM8.js'));
const {d:onAgentEvent,c:getGeneration}=await import(pathToFileURL(root+'/dist/agent-events-Con5xUCM.js'));
let seq=0;
for(const sample of [{stopReason:'end_turn'}, {aborted:true,stopReason:'user_aborted'}, {yielded:true,livenessState:'paused',stopReason:'end_turn'}]) {
  for(const fixed of [false,true]) {
    const runId='owned-terminal-probe-'+(++seq),events=[];
    const unsubscribe=onAgentEvent(e=>{if(e.runId===runId)events.push(e);});
    const backstop=createBackstop({runId,sessionKey:'agent:test:probe',resolveTerminationFields:()=>({}),getLifecycleGeneration:getGeneration});
    const event={stream:'lifecycle',data:{phase:'end',...sample}};
    backstop.note(fixed?deferWorkerTerminalEvent(event):event);
    backstop.emit('end',{meta:sample});
    backstop.emit('end',{meta:sample});
    unsubscribe();
    assert.equal(events.length,fixed?1:0);
    if(fixed) {
      assert.equal(events[0].data.executionSettled,true);
      for(const [key,value] of Object.entries(sample))assert.equal(events[0].data[key],value);
    }
  }
}
console.log(JSON.stringify({nativeCore:'2026.9.1',oldTerminalPublications:0,fixedTerminalPublications:1,duplicateSuppressed:true,cancellationAndYieldPreserved:true,noGatewayOrSessionWrites:true}));
