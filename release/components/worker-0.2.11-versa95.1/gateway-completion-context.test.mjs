import test from 'node:test';
import assert from 'node:assert/strict';
import {withGatewayCompletionContext} from './gateway-completion-context.mjs';
test('Feishu completion uses the existing native subagent instance binding', async () => {
  const scope={},runtime={},resolver=()=>({instance:'fixture'}),trace=[];
  const result=await withGatewayCompletionContext({scope,subagentRuntime:runtime,
    getResolver:o=>o===runtime?resolver:undefined,
    withoutCaller:run=>{trace.push('detach');return run();},
    withResolver:(r,run)=>{assert.equal(r,resolver);trace.push('bind');return run();},
  },()=>{trace.push('deliver');return scope;});
  assert.equal(result,scope);assert.deepEqual(trace,['detach','bind','deliver']);
});
test('an existing scoped lifecycle fence is never replaced by a newer runtime', () => {
  const scope={},fenced=()=>undefined;
  withGatewayCompletionContext({scope,subagentRuntime:{},getResolver:o=>o===scope?fenced:()=>({}),
    withoutCaller:run=>run(),withResolver:r=>assert.equal(r,fenced)},()=>assert.fail());
});
test('missing native instance fails closed before dispatch', () => {
  assert.throws(()=>withGatewayCompletionContext({scope:{},subagentRuntime:{},getResolver:()=>undefined},()=>assert.fail()),/binding is unavailable/);
});
test('delivery after the parent yielded takes its own root admission, not the released turn root', async () => {
  // Model 9.6 root-work admission: subordinate work in a released root is refused.
  const {AsyncLocalStorage}=await import('node:async_hooks');
  const roots=new AsyncLocalStorage(),trace=[];
  const runDetached=(run,origin)=>{trace.push(`admit:${origin}`);return roots.run({origin,released:false},run);};
  const scope={},resolver=()=>({});
  let openGate,relay;const gate=new Promise(r=>{openGate=r;});
  const parentRoot={origin:'ws:chat.send',released:false};
  roots.run(parentRoot,()=>{relay=gate.then(()=>withGatewayCompletionContext({scope,subagentRuntime:{},
    getResolver:o=>o===scope?resolver:undefined,
    withoutCaller:run=>{trace.push('detach');return run();},
    withResolver:(r,run)=>{assert.equal(r,resolver);trace.push('bind');return run();},
    runDetached,
  },()=>{
    const root=roots.getStore();
    if(root?.released)throw new Error('Gateway is draining; new tasks are not accepted');
    trace.push('deliver');return root.origin;
  }));});
  parentRoot.released=true; // parent turn yielded
  openGate();
  assert.equal(await relay,'vlab-worker:subagent-completion');
  assert.deepEqual(trace,['detach','admit:vlab-worker:subagent-completion','bind','deliver']);
});
test('restart drain still refuses the relay admission', async () => {
  const drained=new Error('gateway is draining for restart');
  await assert.rejects(withGatewayCompletionContext({scope:{},subagentRuntime:{},getResolver:()=>()=>({}),
    withoutCaller:run=>run(),withResolver:()=>assert.fail('must not bind'),
    runDetached:async()=>{throw drained;}},()=>assert.fail('must not deliver')),drained);
});
