import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CAPTURE} from './build-feishu-task-presentation.mjs';
import {patchSuppressedPromptContext,patchSuppressedPromptAttempt} from './patch-codex-suppressed-prompt-finalization.mjs';
const base=fs.readFileSync(CAPTURE+'.codex/dist/dist/settled-turn-context-D3SNWtUn.js','utf8');
const load=source=>new Function('readMirrorIdentity','serializeCodexMirrorSourceEvidence',source.slice(source.indexOf('function rejectEvidence('),source.indexOf('/** Verifies and freezes'))+';return verifiedSettledMessages;')(m=>m.__openclaw?.mirrorIdentity,JSON.stringify);
const message=(role,id,content)=>({role,content,__openclaw:{mirrorIdentity:id}});
const prompt=message('user','turn:prompt','original request');
const call=message('assistant','turn:tool:call','actual call');
const result=message('toolResult','turn:tool:result','actual result');
test('late-persisted pure reasoning never changes public tool evidence order',()=>{
 const reasoning=message('assistant','turn:reasoning',[{type:'thinking',thinking:'synthetic private fixture'}]);
 const params={turnId:'turn',settledMessages:[prompt,reasoning,call,result],mirroredMessages:[prompt,reasoning,call,result]};
 const history=[prompt,call,result,reasoning];
 assert.throws(()=>[...load(base)(history,params)],/does not match/);
 assert.deepEqual([...load(patchSuppressedPromptContext(base))(history,params)],[prompt,call,result]);
 const mixed={...reasoning,content:[...reasoning.content,{type:'text',text:'public statement'}]};
 assert.throws(()=>[...load(patchSuppressedPromptContext(base))([prompt,call,result,mixed],{...params,settledMessages:[prompt,mixed,call,result],mirroredMessages:[prompt,mixed,call,result]})],/does not match/,'public content cannot be hidden by a reasoning identity');
 assert.throws(()=>[...load(patchSuppressedPromptContext(base))([prompt,call,{...result,content:'changed'},reasoning],params)],/does not match/);
});
test('core-admitted prompt resolves by exact key and content without rewriting history or relaxing tool proof',()=>{
 const admitted={role:'user',content:'announce body',idempotencyKey:'announce:parent:child:succeeded:user'};
 const current={...admitted,__openclaw:{mirrorIdentity:'turn:prompt',upstreamUserText:'native execution envelope'}};
 const history=[admitted,call,result,{role:'user',content:'later followup'}];
 const params={turnId:'turn',settledMessages:[current,call,result],mirroredMessages:[call,result],persistedUserMessages:[admitted]};
 const original=structuredClone(history),read=load(patchSuppressedPromptContext(base));
 assert.throws(()=>[...load(base)(history,params)],/does not match/);
 assert.deepEqual([...read(history,params)],[current,call,result]);
 assert.deepEqual(history,original,'detached projection cannot alter persisted messages');
 for(const p of [
  {...params,persistedUserMessages:[]},
  {...params,persistedUserMessages:[admitted,admitted]},
  {...params,persistedUserMessages:[{...admitted,idempotencyKey:'other'}]},
  {...params,persistedUserMessages:[{...admitted,content:'different'}]},
  {...params,persistedUserMessages:[{...admitted,__openclaw:{mirrorIdentity:'previous:prompt'}}]},
  {...params,persistedUserMessages:[{...admitted,__openclaw:{upstreamUserText:'previous request'}}]},
  {...params,settledMessages:[{...current,idempotencyKey:undefined},call,result]},
  {...params,mirroredMessages:[call]},
 ])assert.throws(()=>[...read(history,p)],/does not match/);
 for(const h of [
  [call,result], [admitted,call,{...result,content:'tampered'}],
  [{...admitted,content:'changed after mirror'},call,result],
  [admitted,call,result,admitted], [call,admitted,result],
 ])assert.throws(()=>[...read(h,params)],/does not match/);
});
test('suppressed announce prompt recovers only after exact persisted tool evidence is verified',()=>{
 const history=[{role:'user',content:'already persisted announce'},call,result];
 const params={turnId:'turn',settledMessages:[call,result],mirroredMessages:[call,result],suppressNextUserMessagePersistence:true};
 assert.throws(()=>[...load(base)(history,params)],/does not match/);
 assert.deepEqual([...load(patchSuppressedPromptContext(base))(history,params)],history);
 for(const mutate of [p=>({...p,suppressNextUserMessagePersistence:false}),p=>({...p,turnId:'other'}),p=>({...p,mirroredMessages:[call]}),p=>({...p,settledMessages:[{role:'user',content:'unattested'},call,result]})])
  assert.throws(()=>[...load(patchSuppressedPromptContext(base))(history,mutate(params))],/does not match/);
 for(const invalid of [[history[0],call,{...result,content:'tampered'}],[history[0],result,call],[...history,result],[history[0],call]])
  assert.throws(()=>[...load(patchSuppressedPromptContext(base))(invalid,params)],/does not match/);
});
test('ordinary prompt still requires its own verified identity and later followup stays outside settled context',()=>{
 const read=load(patchSuppressedPromptContext(base));
 const params={turnId:'turn',settledMessages:[prompt,call,result],mirroredMessages:[prompt,call,result]};
 assert.deepEqual([...read([prompt,call,result,{role:'user',content:'later followup'}],params)],[prompt,call,result]);
 assert.throws(()=>[...read([call,result],params)],/does not match/);
 assert.throws(()=>[...read([{...prompt,content:'changed'},call,result],params)],/does not match/);
});
test('attempt passes its own suppression flag and does not finalize a deliberate yield',()=>{
 const before=fs.readFileSync(CAPTURE+'.codex/dist/dist/run-attempt-D1hJO4fX.js','utf8'),after=patchSuppressedPromptAttempt(before);
 assert(after.includes('!toolState.yieldDetected && result.assistantTexts.every('));
 assert(after.includes('suppressNextUserMessagePersistence: params.suppressNextUserMessagePersistence === true,'));
 assert.throws(()=>patchSuppressedPromptAttempt(after),/Already patched/);
});

test('settled finalizer uses original DeepSeek runtime route with no tools, and leaves GPT route intact',async()=>{
 const {patchSettledFinalizerRoute,patchBoundedDeepSeekCatalog}=await import('./patch-codex-suppressed-prompt-finalization.mjs');
 const source=patchSettledFinalizerRoute(fs.readFileSync(CAPTURE+'.codex/dist/dist/settled-turn-finalizer-BVJx4yoc.js','utf8'));
 class Context {data=[];}
 let captured;
 const attempt={provider:'deepseek',modelId:'vds-deepseek-flash',model:{params:{codexAppServerRuntimeModel:'deepseek-flash'}},config:{models:{providers:{deepseek:{baseUrl:'https://api.deepseek.com/v1'}}}},prompt:'settled result'};
 // Bind the immutable instructions used by the extracted function.
 const fullFn=new Function('CodexSettledTurnContext','runBoundedCodexAppServerTurn','FINALIZER_DEVELOPER_INSTRUCTIONS',source.slice(source.indexOf('async function runCodexSettledTurnFinalization('),source.indexOf('//#endregion'))+';return runCodexSettledTurnFinalization;')(Context,async p=>{captured=p;throw Error('captured');},'no tools');
 const invoke=a=>fullFn({attempt:a,settledAttempt:{settledTurnFinalizationContext:new Context()}},{});
 await assert.rejects(invoke(attempt),/captured/);
 assert.equal(captured.model.id,'deepseek-flash');assert.equal(captured.modelProvider,'deepseek');assert.equal(captured.requireNoExternalCapabilities,true);assert.equal(captured.isolation,'private-stdio');assert.equal(captured.threadConfig['model_providers.deepseek'].env_key,'DEEPSEEK_API_KEY');
 await assert.rejects(invoke({...attempt,model:{}}),/original runtime model/);
 await assert.rejects(invoke({...attempt,provider:'openai',modelId:'gpt-6.1-sol'}),/captured/);
 assert.equal(captured.model.id,'gpt-6.1-sol');assert.equal(captured.modelProvider,'openai');assert.equal(captured.threadConfig,undefined);
 const bounded=patchBoundedDeepSeekCatalog(fs.readFileSync(CAPTURE+'.codex/dist/dist/bounded-turn-wzJrwKKe.js','utf8'));
 assert(bounded.includes('slug:params.model.id'));assert(bounded.includes('buildCodexRingZeroThreadConfigPatch'));assert(bounded.includes('model not found:'));
});
