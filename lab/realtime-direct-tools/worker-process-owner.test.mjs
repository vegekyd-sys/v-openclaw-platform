import test from 'node:test';import assert from 'node:assert/strict';
import {createVoiceProcessOwner} from './worker-process-owner.mjs';
import {patchVoiceWorker,patchVoicePool,patchVoiceIndex,patchNativeVoiceProcessScope,patchClassicVoiceProcessScope} from '../patch-voice-worker-process-owner.mjs';
import fs from 'node:fs';
test('only exact-run native exec IDs enter cleanup; terminal poll follows kill and is idempotent',async()=>{
 const calls=[];const owner=createVoiceProcessOwner({runId:'own',sessionKey:'personal',loadProcessTool:async()=>({execute:async(id,args)=>{calls.push(args);if(args.action==='list')return {details:{sessions:[]}};return {details:{status:args.action==='kill'?'running':'failed',sessionId:args.sessionId,exitSignal:'SIGTERM'}};}})});
 owner.observe({runId:'foreign',stream:'tool',data:{name:'exec',phase:'result',result:{details:{status:'running',sessionId:'foreign'}}}});
 owner.observe({runId:'own',sessionKey:'personal',stream:'tool',data:{name:'exec',phase:'result',result:{details:{status:'running',sessionId:'owned'}}}});
 owner.markSettled();const result=await owner.cancel();assert(result.confirmed);assert.deepEqual(result.processes.map(p=>p.sessionId),['owned']);await owner.cancel();assert.deepEqual(calls.map(c=>c.action),['list','kill','poll','list']);assert.equal(owner.snapshot().processes.length,0);
});
test('registry misses and unfinished exec results retain ownership and allow retry',async()=>{
 let done=false;const owner=createVoiceProcessOwner({runId:'own',sessionKey:'p',attempts:1,wait:async()=>{},loadProcessTool:async()=>({execute:async(id,args)=>args.action==='list'?{details:{sessions:[]}}:done?{details:{status:'completed',exitCode:0}}:{isError:true,details:{status:'failed'}}})});
 const event=(phase,result)=>owner.observe({runId:'own',stream:'tool',data:{name:'exec',toolCallId:'late',phase,result}});event('start');await assert.rejects(owner.cancel(),/pending/);event('result',{details:{status:'running',sessionId:'owned'}});owner.markSettled();await assert.rejects(owner.cancel(),/unconfirmed/);assert.deepEqual(owner.snapshot().processes,['owned']);done=true;assert((await owner.cancel()).confirmed);
});
test('patches preserve current Worker code, apply once, and reject changed anchors',()=>{
 for(const [file,patch] of [['worker.mjs',patchVoiceWorker],['worker-pool.mjs',patchVoicePool],['index.mjs',patchVoiceIndex]]){const original=fs.readFileSync(new URL('../../experiments/agent-worker-isolation-v1/'+file,import.meta.url),'utf8'),next=patch(original);assert.equal(patch(next),next);assert(next.includes('voice-'));assert.throws(()=>patch('changed runtime'));}
});
async function patchedPool(){
 const root=new URL('../../experiments/agent-worker-isolation-v1/',import.meta.url);
 let source=patchVoicePool(fs.readFileSync(new URL('worker-pool.mjs',root),'utf8'));
 source=source.replace('"./native-harness-data.mjs"',JSON.stringify(new URL('native-harness-data.mjs',root).href));
 source=source.replace('fileURLToPath(new URL("./worker.mjs", import.meta.url))',JSON.stringify(new URL('worker.mjs',root).pathname));
 return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).WorkerPool;
}
test('Worker control selects the exact active run/session and rejects foreign acknowledgements',async()=>{
 const Pool=await patchedPool(),pool=new Pool(),sent=[];
 const active={id:'request-own',sessionKey:'personal',request:{runId:'voice-own'}},worker={active:new Map([[active.id,active]]),child:{send:m=>sent.push(m)}};
 pool.workers.set('own',worker);
 await assert.rejects(pool.cancelVoiceProcesses('voice-foreign','personal'),/no longer active/);
 await assert.rejects(pool.cancelVoiceProcesses('voice-own','foreign-session'),/no longer active/);
 assert.equal(sent.length,0);
 const pending=pool.cancelVoiceProcesses('voice-own','personal'),control=sent[0];
 const ack={...control,type:'voice-process-cancel-ack',ok:true,result:{runId:'voice-own',sessionKey:'personal',confirmed:true,processes:[],pendingExecs:0}};
 pool.onMessage({active:new Map()},ack);assert.equal(pool.pendingControls.size,1);
 pool.onMessage(worker,{...ack,requestId:'foreign-request'});assert.equal(pool.pendingControls.size,1);
 pool.onMessage(worker,ack);assert.equal((await pending).confirmed,true);assert.equal(pool.pendingControls.size,0);
});
test('Worker terminal acknowledgement cannot substitute another run or unconfirmed exit',async()=>{
 const Pool=await patchedPool(),pool=new Pool();let control;
 const active={id:'own',sessionKey:'p',request:{runId:'voice-own'}},worker={active:new Map([['own',active]]),child:{send:m=>control=m}};pool.workers.set('own',worker);
 for(const result of [{runId:'foreign',sessionKey:'p',confirmed:true},{runId:'voice-own',sessionKey:'p',confirmed:false}]){
  const promise=pool.cancelVoiceProcesses('voice-own','p');
  const rejected=assert.rejects(promise,/identity mismatch/);
  pool.onMessage(worker,{...control,type:'voice-process-cancel-ack',ok:true,result});await rejected;
  assert.equal(pool.pendingControls.size,0);
 }
});

test('foreground abort recovers an exec with no tool result from the exact native run registry',async()=>{
 const calls=[];let running=true;const owner=createVoiceProcessOwner({runId:'trusted-run',sessionKey:'personal',attempts:2,wait:async()=>owner.markSettled(),joinExecScope:async scope=>{assert.equal(scope,'trusted-run');assert.equal(running,false);},loadProcessTool:async()=>({execute:async(id,args)=>{
  calls.push(args);if(args.action==='list')return {details:{sessions:running?[{sessionId:'native-foreground',status:'running',pid:123}]:[{sessionId:'native-foreground',status:'failed',exitSignal:'SIGTERM'}]}};
  if(args.action==='kill'){running=false;return {details:{status:'running'}};}
  return {details:{status:running?'running':'failed',sessionId:args.sessionId,exitSignal:'SIGTERM'}};
 }})});
 owner.observe({runId:'trusted-run',stream:'tool',data:{name:'exec',phase:'start',toolCallId:'aborted-no-result'}});
 const result=await owner.cancel();assert(result.confirmed);assert(result.modelSettled);assert.equal(result.registryScope,'trusted-run');
 assert.deepEqual(calls,[{action:'list'},{action:'kill',sessionId:'native-foreground'},{action:'poll',sessionId:'native-foreground',timeout:500},{action:'list'}]);assert.deepEqual(owner.snapshot().pending,[]);
});
test('an aborted foreground already terminated natively needs no fabricated kill or tool result',async()=>{
 const owner=createVoiceProcessOwner({runId:'r',sessionKey:'s',joinExecScope:async()=>{},loadProcessTool:async()=>({execute:async()=>({details:{sessions:[{sessionId:'native',status:'failed',exitSignal:'SIGTERM'}]}})})});
 owner.observe({runId:'r',stream:'tool',data:{name:'exec',phase:'start',toolCallId:'missing'}});owner.markSettled();
 const result=await owner.cancel();assert(result.confirmed);assert.equal(result.processes[0].source,'native-run-scoped-list');assert.equal(result.processes[0].result.details.exitSignal,'SIGTERM');
});
test('unknown native registry cannot clear suppressed exec responsibility',async()=>{
 const owner=createVoiceProcessOwner({runId:'r',sessionKey:'s',joinExecScope:async()=>{},loadProcessTool:async()=>({execute:async()=>({isError:true})})});owner.observe({runId:'r',stream:'tool',data:{name:'exec',phase:'start',toolCallId:'x'}});owner.markSettled();await assert.rejects(owner.cancel(),/registry is unavailable/);assert.deepEqual(owner.snapshot().pending,['x']);
});
test('normal model completion preserves native process acknowledgement; Worker failure rejects it',async()=>{
 const Pool=await patchedPool(),pool=new Pool();let control;const active={id:'own',sessionKey:'p',request:{runId:'voice-own'}},worker={active:new Map([['own',active]]),child:{send:m=>control=m}};pool.workers.set('own',worker);
 const promise=pool.cancelVoiceProcesses('voice-own','p');pool.rejectPendingSteers('own',Error('model finished'),true);assert.equal(pool.pendingControls.size,1);
 pool.onMessage(worker,{...control,type:'voice-process-cancel-ack',ok:true,result:{runId:'voice-own',sessionKey:'p',confirmed:true}});assert((await promise).confirmed);
 const failed=pool.cancelVoiceProcesses('voice-own','p'),rejected=assert.rejects(failed,/Worker died/);pool.rejectPendingSteers('own',Error('Worker died'));await rejected;assert.equal(pool.pendingControls.size,0);
});
test('native exec/process scope patch keeps ordinary personal sessions unchanged',()=>{
 const original='\t\t\tscopeKey: params.sessionKey,\n\t\t\tsessionKey: params.sessionKey,\n\t\t\trunId: params.runId,\nprocessDefaults: { scopeKey: params.sessionKey }\n\tlet finalTranscriptFailure;\n\ttry {\n\t\tturnLifetime.abort();';
 const patched=patchNativeVoiceProcessScope(original);assert.equal(patchNativeVoiceProcessScope(patched),patched);assert.throws(()=>patchNativeVoiceProcessScope('changed runtime'));
 const expression=patched.match(/scopeKey: (.*),/)[1],scope=new Function('params','return '+expression);
 const runId='voice-12345678-1234-1234-1234-123456789abc-12345678-1234-1234-1234-123456789abc';assert.equal(scope({runId,sessionKey:'personal'}),runId);assert.equal(scope({runId:'normal',sessionKey:'personal'}),'personal');
});
test('completed model cleanup remains bound to its exact surviving Worker registry',async()=>{
 const Pool=await patchedPool(),pool=new Pool();let control;
 const active={id:'retired-request',sessionKey:'personal',request:{runId:'voice-retired'}},worker={active:new Map(),voiceProcessRuns:new Map([['voice-retired',active]]),child:{send:m=>control=m}};pool.workers.set('own',worker);
 await assert.rejects(pool.cancelVoiceProcesses('voice-retired','foreign'),/no longer active/);
 const result=pool.cancelVoiceProcesses('voice-retired','personal');assert.equal(control.requestId,'retired-request');
 pool.onMessage(worker,{...control,type:'voice-process-cancel-ack',ok:true,result:{runId:'voice-retired',sessionKey:'personal',confirmed:true}});assert((await result).confirmed);assert.equal(worker.voiceProcessRuns.size,0);
 await assert.rejects(pool.cancelVoiceProcesses('voice-retired','personal'),/no longer active/);
});

test('outer Worker cannot use its empty registry to confirm inner execution exit',async()=>{
 const runId='voice-owned',owner=createVoiceProcessOwner({runId,sessionKey:'personal',nativeRegistryRemote:true,loadProcessTool:async()=>{throw Error('wrong address space');}});
 owner.observe({runId,stream:'tool',data:{name:'exec',phase:'result',result:{details:{status:'running',sessionId:'inner'}}}});owner.markSettled();
 await assert.rejects(owner.cancel(),/Executing native Worker/);assert.deepEqual(owner.snapshot().processes,['inner']);
 const event=data=>owner.observe({runId,stream:'tool',data});
 event({name:'process',phase:'result',result:{__voiceHost:{source:'voice-native-lifecycle',registryScope:'foreign',registryFinal:true},details:{sessions:[]}}});await assert.rejects(owner.cancel(),/unconfirmed/);
 event({name:'process',phase:'result',source:'voice-native-lifecycle',result:{details:{status:'failed',sessionId:'inner',exitSignal:'SIGTERM'}}});
 await assert.rejects(owner.cancel(),/unconfirmed/);
 event({name:'process',phase:'result',result:{__voiceHost:{source:'voice-native-lifecycle',registryScope:runId,registryFinal:true},details:{sessions:[{sessionId:'inner',status:'failed',exitSignal:'SIGTERM'}]}}});
 const proof=await owner.cancel();assert(proof.confirmed);assert.equal(proof.processes[0].result.details.exitSignal,'SIGTERM');assert.equal(proof.source,'executing-native-worker');
});

test('native registry cleanup awaits the reliable final receipt before confirming',async()=>{
 let release;const order=[],owner=createVoiceProcessOwner({runId:'r',sessionKey:'s',loadProcessTool:async()=>({execute:async()=>({details:{sessions:[]}})}),onNativeCall:async call=>{order.push([call.phase,call.registryFinal]);if(call.registryFinal&&call.phase==='result')await new Promise(resolve=>release=resolve);}});
 owner.markSettled();let complete=false;const p=owner.cancel().then(result=>{complete=true;return result;});
 for(let n=0;n<10&&!release;n++)await new Promise(resolve=>setImmediate(resolve));assert(release);assert.equal(complete,false);release();assert((await p).confirmed);
 assert.deepEqual(order,[['start',false],['result',false],['start',true],['result',true]]);
});

test('local admitted Worker reaps only exact observed IDs in a shared personal-session registry',async()=>{
 let running=true;const calls=[];
 const owner=createVoiceProcessOwner({runId:'voice-own',sessionKey:'personal',recoverRegistry:false,loadProcessTool:async()=>({execute:async(id,args)=>{
  calls.push(args);if(args.action==='list')return {details:{sessions:[{sessionId:'foreign',status:'running'},{sessionId:'owned',status:running?'running':'failed',exitSignal:running?undefined:'SIGTERM'}]}};
  if(args.action==='kill'){assert.equal(args.sessionId,'owned');running=false;return {details:{status:'running'}};}
  return {details:{sessionId:'owned',status:'failed',exitSignal:'SIGTERM'}};
 }})});
 owner.observe({runId:'voice-own',sessionKey:'personal',stream:'tool',data:{name:'exec',phase:'result',result:{details:{status:'running',sessionId:'owned'}}}});owner.markSettled();
 const proof=await owner.cancel();assert(proof.confirmed);assert.deepEqual(proof.processes.map(x=>x.sessionId),['owned']);assert.deepEqual(calls.filter(x=>x.sessionId).map(x=>x.sessionId),['owned','owned']);
});
test('a shared session registry cannot recover an unreturned command by guessing a foreign ID',async()=>{
 let opened=false;const owner=createVoiceProcessOwner({runId:'voice-own',sessionKey:'personal',recoverRegistry:false,loadProcessTool:async()=>{opened=true;return {execute:async()=>({details:{sessions:[{sessionId:'foreign',status:'running'}]}})};}});
 owner.observe({runId:'voice-own',stream:'tool',data:{name:'exec',phase:'start',toolCallId:'pending'}});owner.markSettled();await assert.rejects(owner.cancel(),/identity is not settled/);assert.equal(opened,false);assert.deepEqual(owner.snapshot().pending,['pending']);
});
test('installed classic Worker joins its actual native registry in the exact run scope',()=>{
 const original=fs.readFileSync(new URL('../../experiments/agent-worker-isolation-v1/worker.mjs',import.meta.url),'utf8'),patched=patchVoiceWorker(original);
 assert(patched.includes('nativeRegistryRemote:false,recoverRegistry:true'));
 assert(patched.includes('return m.t({scopeKey:message.runId})'));
 assert(patched.includes("../bash-process-registry-BIq3VUFD.js"));assert(patched.includes('await m.S(runId)'));
 assert(!patched.includes('return m.t({scopeKey:message.sessionKey})'));
});
test('empty public registry cannot confirm hidden foreground exit until its native scope join finishes',async()=>{
 let release,finished=false;const calls=[],owner=createVoiceProcessOwner({runId:'own',sessionKey:'shared',joinExecScope:scope=>{assert.equal(scope,'own');return new Promise(r=>release=r);},loadProcessTool:async()=>({execute:async(id,args)=>{calls.push(args.action);return {details:{sessions:[]}};}})});
 owner.observe({runId:'own',stream:'tool',data:{name:'exec',phase:'start',toolCallId:'hidden'}});owner.markSettled();const cleanup=owner.cancel().then(x=>{finished=true;return x});
 for(let i=0;i<10&&!release;i++)await new Promise(r=>setImmediate(r));assert(release);assert.equal(finished,false);assert.deepEqual(calls,['list']);assert.deepEqual(owner.snapshot().pending,['hidden']);release();const result=await cleanup;assert(result.nativeExecScopeJoined);assert(result.confirmed);assert.deepEqual(calls,['list','list']);
});
test('suppressed foreground without the native lifecycle join stays unconfirmed',async()=>{
 const owner=createVoiceProcessOwner({runId:'own',sessionKey:'shared',loadProcessTool:async()=>{throw Error('must not open an empty registry');}});owner.observe({runId:'own',stream:'tool',data:{name:'exec',phase:'start',toolCallId:'hidden'}});owner.markSettled();await assert.rejects(owner.cancel(),/scope exit is unconfirmed/);assert.deepEqual(owner.snapshot().pending,['hidden']);
});
test('classic factory scopes voice exec and process together and preserves ordinary session resolution',()=>{
 const needle='\tconst scopeKey = resolveProcessToolScopeKey({';const source=needle+'scopeKey:options?.exec?.scopeKey,sessionKey:options?.sessionKey});';const after=patchClassicVoiceProcessScope(source);assert.equal(patchClassicVoiceProcessScope(after),after);assert.throws(()=>patchClassicVoiceProcessScope('changed factory'),/anchor changed/);
 const scope=new Function('options','resolveProcessToolScopeKey',after+'return scopeKey;'),normal=x=>x.scopeKey??x.sessionKey;const voice='voice-12345678-1234-1234-1234-123456789abc-12345678-1234-1234-1234-123456789abc';assert.equal(scope({runId:voice,sessionKey:'personal',exec:{scopeKey:'caller'}},normal),voice);assert.equal(scope({runId:'ordinary',sessionKey:'personal'},normal),'personal');assert.equal(scope({runId:'ordinary',sessionKey:'personal',exec:{scopeKey:'ordinary-override'}},normal),'ordinary-override');
});
