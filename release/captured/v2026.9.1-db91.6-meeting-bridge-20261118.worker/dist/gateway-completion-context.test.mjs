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
