// Fault injection into an idle disposable Candidate only; never shared or production.
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const readyPath=process.argv[2],beforePath=process.argv[3];assert(readyPath&&beforePath,'Pass Candidate ready metadata and exact before module');
const r=JSON.parse(fs.readFileSync(readyPath)),root=r.voice.replace(/\/runtime\/voice-delivery-authorization$/,'');assert(root.includes('/candidate-tests/runs/'),'Private Candidate only');
const env=JSON.parse(fs.readFileSync(root+'/environment.json'));Object.assign(process.env,env);const cfg=JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH)),core=root+'/runtime/openclaw/dist',sessionKey=r.conversationEntries[0].sessionKey;
const {GatewayClient}=await import(r.voice+'/lib/gateway-client.mjs'),ready=Promise.withResolvers();
const gateway=new GatewayClient({url:'ws://127.0.0.1:'+cfg.gateway.port,token:String(cfg.gateway.auth.token).replace(/\$\{([^}]+)\}/g,(_,k)=>env[k]??''),onHelloOk:ready.resolve,onConnectError:ready.reject});
gateway.start();try{await ready.promise;const pool=await gateway.request('vlab.workers.status',{});assert(!pool.pending&&pool.workers.every(w=>!w.activeCount&&!w.queued),'Candidate must be idle before index fault injection');}finally{gateway.stop();}
const {a:load}=await import(core+'/subagent-announce-delivery-Dosep7Zr.js');const target=load(sessionKey,'makaron');assert(target.entry?.sessionId);const scope={sessionKey,sessionId:target.entry.sessionId,storePath:target.storePath,agentId:target.agentId};
const {C:read,T:isUnavailable}=await import(core+'/session-accessor-K0XuW6ln.js'),{waitForSessionTranscriptProjection:wait}=await import(core+'/session-transcript-reconcile-DFsDtc9l.js');await wait(scope);
const db=new DatabaseSync(cfg.agents.entries.makaron.agentDir+'/openclaw-agent.sqlite');
const mark=()=>{const a=db.prepare('UPDATE session_transcript_index_state SET needs_rebuild=1 WHERE session_id=?').run(scope.sessionId);assert.equal(a.changes,1);};
function call(source){let dispatches=0,finishes=0;const control=new AbortController();const voice={signal:control.signal,assertCurrent:x=>{assert.equal(x.sessionId,scope.sessionId);assert.equal(x.sessionKey,sessionKey);},prepareResumeInput:x=>x,onAccepted(){},onExecutionStarted(){},finish(){finishes++;}};
let fn=source.slice(source.indexOf('async function runAnnounceAgentCall('),source.indexOf('\nasync function sendSubagentAnnounceDirectly('));fn=fn.replace('await import("./session-transcript-reconcile-DFsDtc9l.js")','await Promise.resolve(reconciler)');
const run=new Function('dispatchSubagentAnnounceAgent','loadRequesterSessionEntry','reconciler','SourceOwnerChangedError','shouldPreserveUserFacingSessionStateForInputProvenance','getGatewayAgentResult',`return (${fn});`)(async(args,options)=>{dispatches++;read(scope,()=>true);options.onAccepted({runId:'fault-test'});options.onExecutionStarted();return {text:'guarded continuation'};},()=>target,{waitForSessionTranscriptProjection:wait},Error,()=>false,x=>x);
return {run:()=>run({voiceContinuation:voice,agentParams:{sessionKey,agentId:'makaron'},getRequesterSessionId:()=>scope.sessionId,isExecutionAllowed:()=>true,timeoutMs:20000}),stats:()=>({dispatches,finishes})};}
try{
mark();const before=call(fs.readFileSync(beforePath,'utf8'));await assert.rejects(before.run(),error=>isUnavailable(error)&&error.sessionId===scope.sessionId);assert.equal(before.stats().dispatches,1);await wait(scope);
mark();const after=call(fs.readFileSync(core+'/subagent-announce-delivery-Dosep7Zr.js','utf8'));const at=Date.now();await after.run();assert.deepEqual(after.stats(),{dispatches:1,finishes:1});
const proof={candidate:r.candidate,actualNativeDatabase:true,privateIndexFaultOnly:true,before:{projectionUnavailable:true,...before.stats()},after:{...after.stats(),waitAndDispatchMs:Date.now()-at},noModelOrToolReplay:true,sharedTouched:false};fs.writeFileSync(r.state+'/real-projection-regression.json',JSON.stringify(proof,null,2),{mode:0o600});console.log(JSON.stringify(proof));
}finally{await wait(scope);db.close();}
