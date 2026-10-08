import assert from 'node:assert/strict';
function once(source,before,after){assert.equal(source.split(before).length-1,1,'JEV host anchor drifted: '+before.slice(0,100));return source.replace(before,after);}
export function patchVoiceJevTalk(source){
  if(source.includes('// voice-jev-unified-v1'))return source;
  source='// voice-jev-unified-v1\nimport {jevEvaluatorFromEnv} from "./voice-decision-router.mjs";\nimport {createGatewayVoiceDecisionOwner} from "./voice-decision-gateway.mjs";\nimport {appendFileSync} from "node:fs";\n'+source;
  source=once(source,'function createTalkClientGatewayControlOwner(params) {\n\tlet callLifecycle;',`function createTalkClientGatewayControlOwner(params) {
\tlet decisionOwner;
\tconst decisionEvaluate=jevEvaluatorFromEnv();
\tlet callLifecycle;`);
  source=once(source,'\t\tif (role === "user") runControl.handleSpoken(text, params.flushTranscript());','\t\tif (!decisionEvaluate && role === "user") runControl.handleSpoken(text, params.flushTranscript());');
  source=once(source,'\t\t\tconst spokenGrant = authorizeGptLiveClientVoicePendingConfirmation({',`\t\t\tif(decisionEvaluate){
\t\t\t\tif(!boundCallControl || typeof callControl.acceptDecision !== "function") throw new Error("JEV requires complete native USER ownership");
\t\t\t\tdecisionOwner ??= createGatewayVoiceDecisionOwner({evaluate:decisionEvaluate,
\t\t\t\t\tcontext:params.decisionContext??"",isCallCurrent:()=>{owner.assertOpen();return owners.get(params.voiceSessionId)===owner;},
\t\t\t\t\tinvoke:params.invokeDirectTool,
\t\t\t\t\tcontrol:applyControl,
\t\t\t\t\temit:event=>harness.emit({...event,turnId:harness.ensureTurn(),payload:{...event.payload,...talkPayload()},final:event.type!=="tool.call"}),
\t\t\t\t\taudit:event=>appendFileSync(process.env.GPT_LIVE_VOICE_JEV_AUDIT_PATH??("/tmp/openclaw-voice-jev-"+process.pid+"-audit.jsonl"),JSON.stringify({at:Date.now(),voiceSessionId:params.voiceSessionId,...event})+"\\n",{mode:0o600})});
\t\t\t\treturn await decisionOwner.run({request:boundCallControl.userTurnText,requestId:boundCallControl.nativeDelegationId,
\t\t\t\t\tsignal:AbortSignal.any([consultSignal,signal]),isCurrent:boundCallControl.isCurrent,
\t\t\t\t\tacceptEnd:proof=>{if(!boundCallControl.isCurrent())return false;return callControl.acceptDecision(proof);},
\t\t\t\t\tdelegate:args=>{const grant=authorizeGptLiveClientVoicePendingConfirmation({agentId:params.sessionTarget.agentId,sessionKey:params.sessionTarget.sessionKey,voiceSessionId:params.voiceSessionId,callerInputAcceptedAt});return params.runAgentConsult({question:buildGptLiveBackendCallControlQuestion(args.question,boundCallControl),...grant?{confirmationId:grant.confirmationId}:{}},AbortSignal.any([consultSignal,signal]),onProgress,continuationContext);}});
\t\t\t}
\t\t\tconst spokenGrant = authorizeGptLiveClientVoicePendingConfirmation({`);
  source=once(source,'\t\t\trunAgentConsult: consultRunner.runArgs,',`\t\t\tdecisionContext:JSON.stringify(initialItems),
\t\t\tinvokeDirectTool:async(name,args,callId,signal)=>{
\t\t\t\tconst {t:invokeGatewayTool}=await import("./tools-invoke-shared-CjpflNGO.js");
\t\t\t\tconst outcome=await invokeGatewayTool({cfg:context.getRuntimeConfig(),signal,
\t\t\t\t\tinput:{agentId:target.agentId,sessionKey:target.canonicalKey,name,args},
\t\t\t\t\tauthenticatedUserProfile:client?.authenticatedUserProfile,operatorRoleActor:client?.internal?.operatorRoleActor,
\t\t\t\t\toperatorScopes:client?.connect.scopes,senderIsOwner:client?.connect.scopes?.includes("operator.admin"),
\t\t\t\t\tclientCaps:client?.connect.caps,toolCallIdPrefix:"voice-jev",approvalMode:"report"});
\t\t\t\tif(!outcome.ok)throw new Error(outcome.error?.message??"Direct voice tool failed");
\t\t\t\treturn outcome.result;
\t\t\t},
\t\t\trunAgentConsult: consultRunner.runArgs,`);
  return source;
}

export function patchVoiceJevController(source){
  // Direct native tool evidence must reach Live intact, without the long Agent
  // document extractor publishing raw tool JSON as a completed screen plan.
  if(!source.includes('// voice-jev-direct-result-v2')&&source.includes('this.options.onBackendResult?.({delegationId:delegation.id,text:result.text})')){
    source='// voice-jev-direct-result-v2\n'+once(source,
      'this.options.onBackendResult?.({delegationId:delegation.id,text:result.text})',
      '(result.provenance?.source === "direct_tool" ? undefined : this.options.onBackendResult?.({delegationId:delegation.id,text:result.text}))');
  }
  if(source.includes('// voice-jev-concurrent-decisions-v1'))return source;
  source='// voice-jev-concurrent-decisions-v1\n'+source;
  source=once(source,'\t\tthis.stopped = false;','\t\tthis.stopped = false;\n\t\tthis.decisionDelegations = new Map();');
  source=once(source,'\t\tthis.transcript = [];\n\t\tthis.partialTranscriptRole = void 0;\n\t\tif (this.consultController)',`\t\tthis.transcript = [];
\t\tthis.partialTranscriptRole = void 0;
\t\tif(process.env.VOICE_DECISION_PROVIDER==="jev"){
\t\t\tif(this.decisionDelegations.size>=8){this.sendAppend(id,"Too many tasks are pending; this request was not started.","speakable");return;}
\t\t\tconst controller=new AbortController();
\t\t\tthis.decisionDelegations.set(id,{generation:delegation.generation,controller});
\t\t\tthis.runDelegation(delegation,controller.signal).catch(error=>this.failTerminalDelivery(toErrorObject(error,"JEV task failed"))).finally(()=>this.decisionDelegations.delete(id));
\t\t\treturn;
\t\t}
\t\tif (this.consultController)`);
  source=once(source,'\t\tthis.stopped = true;','\t\tthis.stopped = true;\n\t\tfor(const entry of this.decisionDelegations.values())entry.controller.abort(new Error("Voice session stopped"));\n\t\tthis.decisionDelegations.clear();');
  source=once(source,'\t\t\tthis.activeDelegationId === delegation.id && this.delegationGeneration === delegation.generation;','\t\t\t((this.decisionDelegations.get(delegation.id)?.generation === delegation.generation) ||\n\t\t\tthis.activeDelegationId === delegation.id && this.delegationGeneration === delegation.generation);');
  return source;
}
