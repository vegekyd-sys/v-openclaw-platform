import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAttemptBridge } from './native-attempt-bridge.mjs';
import { createWorkerActiveRunProxy } from './worker-active-run-proxy.mjs';
import { createGatewayMessageToolRelay } from './gateway-message-tool.mjs';
import { WorkerPool } from './worker-pool.mjs';

const message = {id:'r1',runId:'run1',sessionId:'s1',sessionKey:'agent:a:s1',agentId:'a',gatewayMessageTool:true,
  agentCommandOptions:{conversationRoutePeerId:'peer1'}};
test('9.2 preserves native local authority and fences Gateway-to-Worker Steer translation',async()=>{
 const b=createNativeAttemptBridge(),c=new AbortController(),seen=[];
 const close=b.register({...message,nativeHarnessData:{toolAuthorityFingerprint:'gateway-issued'}},c.signal,()=>{},()=>{});
 const input=b.prepare({...message,toolAuthorityFingerprint:'worker-native'});
 assert.equal(input.toolAuthorityFingerprint,'worker-native');
 const handle={toolAuthorityFingerprint:'worker-native',queueMessage:async(text,options)=>seen.push(options)};
 b.bind(message,handle,()=>true,()=>{});
 const options={isInboundUserMessage:true,toolAuthorityFingerprint:'gateway-issued'};
 await b.steer('run1','edit',options);
 assert.equal(seen[0].toolAuthorityFingerprint,'worker-native');
 assert.equal(options.toolAuthorityFingerprint,'gateway-issued');
 await assert.rejects(b.steer('run1','edit',{...options,toolAuthorityFingerprint:'worker-native'}),/authority mismatch/);
 handle.toolAuthorityFingerprint='new-generation';
 await assert.rejects(b.steer('run1','edit',options),/authority mismatch/);
 close();await assert.rejects(b.steer('run1','edit',options),/no longer active/);
});
test('native attempt preserves both deadline callbacks and current conversation route', () => {
  const b=createNativeAttemptBridge(), events=[], c=new AbortController();
  const close=b.register(message,c.signal,d=>events.push(['gateway',d]),()=>{});
  const p=b.prepare({...message,onAttemptDeadlineChanged:d=>events.push(['native',d])});
  const d={kind:'bounded',deadlineAtMs:Date.now()+1000};
  p.onAttemptDeadlineChanged(d);
  assert.equal(p.conversationRoutePeerId,'peer1');
  assert.deepEqual(events,[['native',d],['gateway',d]]);
  assert.throws(()=>b.prepare({...message,sessionId:'other'}),/identity mismatch/);
  close();
  p.onAttemptDeadlineChanged(d);
  assert.equal(events.length,2);
});
test('native permission change uses exact bound owner and denies retired generations',async()=>{
  const b=createNativeAttemptBridge(),c=new AbortController();
  b.register(message,c.signal,()=>{},()=>{});
  let current=true, authorized=0;
  b.bind(message,{applyPermissionMode(){}},()=>current,async(mode,revoke)=>{
    assert.equal(mode,'readonly');revoke();authorized++;return true;
  });
  assert.equal(await b.applyPermission('run1','readonly'),true);
  current=false;
  assert.equal(await b.applyPermission('run1','readonly'),false);
  assert.equal(authorized,1);
  c.abort();
  await assert.rejects(b.applyPermission('run1','full'),/no longer active/);
});
test('Gateway permission record remains synchronous in the native authorized handoff',async()=>{
  let authorized=false,revoked=0,applied=0;
  const p=createWorkerActiveRunProxy({requestId:'r1',runId:'run1',
    permissionChange:{owner:{},recordApplied(){assert.equal(authorized,true);applied++;}},
    pool:{applyPermission:async()=>true}});
  authorized=true;
  const result=p.handle.applyPermissionMode('readonly',()=>revoked++);
  authorized=false;
  assert.equal(applied,1);assert.equal(revoked,1);assert.equal(await result,true);
  p.deactivate();
  assert.equal(await p.handle.applyPermissionMode('full',()=>revoked++),false);
  assert.equal(revoked,1);
});
test('message relay retains capability and identity in Gateway; denies ended owners',async()=>{
  const seen=[];
  const p={sessionKey:'native-session',runId:'native-run',messageActionTurnCapability:'opaque-do-not-forward',
    hostCapabilities:{assertActive(){},createToolSurface(opts){seen.push(opts);return [{name:'message',execute:async(id,args)=>({id,args})}];}}};
  const relay=createGatewayMessageToolRelay(p);
  await relay.execute({kind:'native-message',toolCallId:'t1',args:{action:'send'},sessionKey:'forged',runId:'forged'});
  assert.equal(seen[0].sessionKey,p.sessionKey);assert.equal(seen[0].messageActionTurnCapability,p.messageActionTurnCapability);
  relay.close();
  await assert.rejects(relay.execute({kind:'native-message',toolCallId:'t2'}),/no longer active/);
});
test('message relay respects native tool deny and permission-generation cancellation',async()=>{
  const denied=createGatewayMessageToolRelay({hostCapabilities:{assertActive(){},createToolSurface:()=>[]}});
  await assert.rejects(denied.execute({kind:'native-message',toolCallId:'t'}),/does not allow/);
  let started;
  const ready=new Promise(r=>started=r);
  const relay=createGatewayMessageToolRelay({hostCapabilities:{assertActive(){},createToolSurface:()=>[{
    name:'message',execute:async(id,args,signal)=>{started();return await new Promise((r,j)=>signal.addEventListener('abort',()=>j(signal.reason),{once:true}));}
  }]}});
  const pending=relay.execute({kind:'native-message',toolCallId:'t'});
  await ready;relay.invalidate();
  await assert.rejects(pending,/generation retired/);
});
test('Worker message request does not serialize capability or construction identity',async()=>{
  const b=createNativeAttemptBridge(),c=new AbortController();let sent;
  const close=b.register(message,c.signal,()=>{},async request=>(sent=request,{ok:true}));
  const opts={runId:'run1',sessionId:'s1',agentSessionKey:message.sessionKey,messageActionTurnCapability:'local'};
  assert.deepEqual(await b.executeMessage(opts,'t',{action:'send'},c.signal),{handled:true,result:{ok:true}});
  assert.deepEqual(Object.keys(sent).sort(),['args','kind','ownerRequestId','toolCallId']);
  await assert.rejects(b.executeMessage({...opts,sessionId:'other'},'t',{},c.signal),/identity mismatch/);
  close();await assert.rejects(b.executeMessage(opts,'t',{},c.signal),/no longer active/);
});
test('native deadlines pause/extend one job only; malformed and stale updates fail closed',()=>{
  const pool=new WorkerPool(),a={id:'a',timer:setTimeout(()=>{},1000)},b={id:'b',timer:setTimeout(()=>{},1000)};
  const worker={active:new Map([['a',a],['b',b]])};
  try {
    pool.updateAttemptDeadline(worker,a,{kind:'unlimited'});assert.equal(a.timer,null);assert.ok(b.timer);
    pool.updateAttemptDeadline(worker,a,{kind:'bounded',deadlineAtMs:Date.now()+10000});assert.ok(a.timer);
    assert.throws(()=>pool.updateAttemptDeadline(worker,a,{kind:'bounded',deadlineAtMs:'bad'}),/Malformed/);
    worker.active.delete('a');assert.throws(()=>pool.updateAttemptDeadline(worker,a,{kind:'unlimited'}),/no longer active/);
  } finally {clearTimeout(a.timer);clearTimeout(b.timer);}
});
test('permission ACK cannot cross Worker/request owners',async()=>{
  const pool=new WorkerPool(),a={id:'a'},sent=[];
  const worker={active:new Map([['a',a]]),child:{send:m=>sent.push(m)}};
  pool.workers.set(0,worker);
  const pending=pool.applyPermission('a','readonly');const m=sent[0];
  pool.onMessage({}, {...m,type:'permission-change-ack',ok:true,applied:true});
  assert.equal(pool.pendingControls.size,1);
  pool.onMessage(worker, {...m,type:'permission-change-ack',ok:true,applied:true});
  assert.equal(await pending,true);assert.equal(pool.pendingControls.size,0);
});
test('native identity relay retains local target and exact session, without serializing claims',async()=>{
 const b=createNativeAttemptBridge(),c=new AbortController();let request;
 const close=b.register(message,c.signal,()=>{},async r=>(request=r,{token:'native-signed-token'}));
 const identity={operationalRunInstance:{runId:'run1'},sessionKey:message.sessionKey,agentId:'a'};
 const params={method:'exec.approval.request',target:'local',opts:{},required:true};
 assert.equal(await b.resolveGatewayIdentity(identity,params),'native-signed-token');
 assert.deepEqual(Object.keys(request).sort(),['kind','method','ownerRequestId','required']);
 await assert.rejects(b.resolveGatewayIdentity({...identity,agentId:'other'},params),/mismatch/);
 await assert.rejects(b.resolveGatewayIdentity(identity,{...params,target:'remote'}),/trusted local/);
 close();await assert.rejects(b.resolveGatewayIdentity(identity,params),/no longer active/);
});
