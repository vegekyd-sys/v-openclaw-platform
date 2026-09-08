// Compare the exact installed function with its observer transform under stubs.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {observePrompt} from './prompt-prep-observer-plan.mjs';
const source=fs.readFileSync(process.argv[2],'utf8'),after=observePrompt(source);
const extract=s=>{const at=s.indexOf('async function prepareEmbeddedAttemptSystemPrompt(params) {');return s.slice(at,s.indexOf('//#endregion',at));};
const error=new Error('secret-error-must-not-be-logged');
function fixture(code,fail,backlog=0){
 const logs=[],runtimeInfo={agentId:'a',sessionKey:'s'};
 const context={performance,process:{pid:1,stderr:{writableLength:backlog}},console:{error:s=>logs.push(s)}};
 const noop=()=>undefined;
 for(const name of ['resolveEmbeddedSandboxInfoExecPolicy','buildEmbeddedSandboxInfo','isReasoningTagProvider','buildToolSchemaDirectoryPrompt','resolveProcessToolScopeKey','resolveAgentPromptSurfaceForSessionKey','resolveProviderSystemPromptContribution','buildProjectMemoryWriteInstruction','buildModelToolsUnavailablePrompt','isAcpRuntimeSpawnAvailable','buildBootstrapPromptWarningNotice','buildBootstrapTruncationReportMeta'])context[name]=noop;
 Object.assign(context,{
  listActiveProcessSessionReferences:()=>[],resolveAgentRuntimePrompt:async()=>({runtimeInfo}),resolvePromptModeForSession:()=> 'full',toolPolicyRestrictsTools:()=>false,
  resolveOpenClawReferencePaths:async()=>({}),prepareAgentMemoryPrompt:async()=>({value:'memory-secret'}),prepareWatchedSessionsPrompt:()=>({value:'watched-secret'}),prepareProjectMemoryBootstrap:async()=>[],
  listRegisteredPluginAgentPromptGuidance:()=>[],resolveSandboxRuntimeStatus:()=>({sandboxed:false}),
  buildAttemptSystemPrompt:()=>({systemPrompt:'private-prompt',refreshSystemPrompt:s=>s}),buildSystemPromptReport:p=>({systemPrompt:p.systemPrompt}),
 });
 if(fail)context[fail]=()=>{throw error;};
 const fn=vm.runInNewContext(extract(code)+';prepareEmbeddedAttemptSystemPrompt',context);
 const params={attempt:{model:{api:'test'},provider:'test',modelId:'test',config:{},sessionKey:'ordinary-production-session',sessionId:'s',preparedModelRuntime:{activeProjectKeys:['p']}},
  getProviderRuntimeHandle:noop,effectiveTools:[{name:'read'}],capabilityToolNames:[],markStage:noop,
  bootstrap:{workspaceNotes:[],contextFiles:[],bootstrapPromptWarning:{lines:[]},bootstrapInjectionStats:[]}};
 return {fn,params,logs};
}
for(const fail of [null,'resolveAgentRuntimePrompt','prepareAgentMemoryPrompt','prepareWatchedSessionsPrompt','prepareProjectMemoryBootstrap','buildAttemptSystemPrompt','buildSystemPromptReport']){
 const a=fixture(source,fail),b=fixture(after,fail);
 if(fail){await assert.rejects(a.fn(a.params),e=>e===error);await assert.rejects(b.fn(b.params),e=>e===error);}
 else{const x=await a.fn(a.params),y=await b.fn(b.params);assert.equal(JSON.stringify(x),JSON.stringify(y));assert.equal(typeof x.preparePermissionPrompt,typeof y.preparePermissionPrompt);}
 assert(b.logs.length>0&&b.logs.length<=32);
 assert(!b.logs.join('').match(/private-prompt|memory-secret|watched-secret|secret-error/));
 const last=JSON.parse(b.logs.at(-1).slice('[prompt-prep-observer.1] '.length));assert.equal(last.stage,'total');assert.equal(last.outcome,fail?'error':'ok');
}
const blocked=fixture(after,null,300000);await blocked.fn(blocked.params);assert.equal(blocked.logs.length,0);
const settled=fixture(after);settled.params.attempt.operation='settled-tool-finalization';const result=await settled.fn(settled.params);assert.equal(result.systemPromptText,'');assert.equal(settled.logs.length,2);
console.log(JSON.stringify({version:'prompt-prep-observer.1',tests:9,passed:true,returnAndErrorSemantics:true,contentNotLogged:true,backpressureGuard:true}));
