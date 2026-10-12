import assert from 'node:assert/strict';
const once=(s,a,b)=>{assert.equal(s.split(a).length-1,1,'Voice control lane anchor drifted');return s.replace(a,b);};
export function patchGptLiveControlLaneController(s){
 s=once(s,'Deliver all parts as the backend spoken answer. Keep every fact, value and condition; apply caller format.','Verified result for a brief answer, not a reading obligation. Yield to caller; never resume unless asked. Preserve stated facts and conditions.');
 s=once(s,'\t\tthis.callControlUserTurnWaiters = new Set();','\t\tthis.priorityControls = new Map();\n\t\tthis.callControlUserTurnWaiters = new Set();');
 s=once(s,'\t\t\tonToolEvent: (event) => options.onCallLifecycleEvent(event),','\t\t\tgetActiveAssistantTurnId: () => this.activeCallControlAssistantTurnId,\n\t\t\tonToolEvent: (event) => options.onCallLifecycleEvent(event),');
 s=once(s,'\t\tif (raw.type === "turn.created" && raw.turn?.role === "user") {','\t\tif (raw.type === "turn.created" && raw.turn?.role === "assistant") this.activeCallControlAssistantTurnId = turnId;\n\t\tif (raw.type === "turn.done" && raw.turn?.role === "assistant" && this.activeCallControlAssistantTurnId === turnId) this.activeCallControlAssistantTurnId = undefined;\n\t\tif (raw.type === "turn.created" && raw.turn?.role === "user") {\n\t\t\tthis.activeCallControlAssistantTurnId = undefined;');
 s=once(s,'if (receipt) { delegation.callControlReceipt = receipt; this.cancelQueuedProgress?.(); }','if (receipt) { delegation.callControlReceipt = receipt; this.closingUserTurnId = receipt.originUserTurnId; this.cancelQueuedProgress?.(); }');
 s=once(s,'\tsendAppend(delegationId, text, channel, diagnostic = {}) {','\tsendAppend(delegationId, text, channel, diagnostic = {}) {\n\t\t// Accepted goodbye owns speech until the caller starts another turn.\n\t\t// Keep business work alive; do not append late progress that can reopen audio.\n\t\tif (this.closingUserTurnId && this.closingUserTurnId === this.latestCallControlUserTurnId && ["progress", "final", "failure"].includes(diagnostic.kind)) {\n\t\t\tthis.tracePublicProgress("closing-business-speech-withheld", delegationId, text, diagnostic);\n\t\t\treturn true;\n\t\t}');
 s=once(s,'\tisCurrentDelegation(delegation, signal) {','\tisCurrentDelegation(delegation, signal) {\n\t\tif(delegation.controlOnly===true)return !this.stopped&&!this.options.signal.aborted&&!signal.aborted&&this.priorityControls.get(delegation.id)?.delegation===delegation;');
 const queue='\t\t\tdelegation.queuedBehind = this.activeDelegationId;\n\t\t\tthis.pendingDelegations.push(delegation);';
 s=once(s,queue,queue+'\n\t\t\tif(this.callLifecycle){delegation.controlProbePending=true;void this.probeQueuedCallControl(delegation);}');
 s=once(s,'\t\t\tconst pending = this.pendingDelegations.shift();','\t\t\tconst pending = this.pendingDelegations[0]?.controlProbePending ? undefined : this.pendingDelegations.shift();');
 s=once(s,'\t\tthis.callLifecycle?.close();','\t\tthis.callLifecycle?.close();\n\t\tfor(const entry of this.priorityControls.values())entry.controller.abort();\n\t\tthis.priorityControls.clear();');
 const method=`\tasync probeQueuedCallControl(queued) {
\t\tconst controller=new AbortController();
\t\tconst delegation={...queued,controlOnly:true};
\t\tthis.priorityControls.set(delegation.id,{delegation,controller});
\t\ttry {
\t\t\tconst callControl=await this.prepareBackendCallControl(delegation,controller.signal);
\t\t\tif(callControl&&callControl.isCurrent())await this.options.runAgentConsult({
\t\t\t\tprompt:"Evaluate only whether the complete current caller utterance requests ending this voice call. Use openclaw_end_call only for that clear request. Otherwise take no action and return CONTROL_NOT_SELECTED. Do not execute or discuss other tasks.",
\t\t\t\tsignal:controller.signal,callControl,controlOnly:true,callerInputAcceptedAt:queued.callerInputAcceptedAt,
\t\t\t\tcontinuationIdentity:{delegationItemId:delegation.id,delegationGeneration:delegation.generation}
\t\t\t});
\t\t\tif(delegation.callControlReceipt)this.pendingDelegations=this.pendingDelegations.filter(item=>item!==queued);
\t\t}catch(error){if(!this.stopped)this.options.logger.warn("GPT Live queued call-control check did not complete; normal request retained");}
\t\tfinally {
\t\t\tthis.priorityControls.delete(delegation.id);queued.controlProbePending=false;
\t\t\tif(!this.stopped&&!this.consultController&&!this.options.signal.aborted&&!this.pendingDelegations[0]?.controlProbePending){
\t\t\t\tconst next=this.pendingDelegations.shift();if(next)this.launchDelegation(next);
\t\t\t}
\t\t}
\t}
`;
 return once(s,'\tasync prepareBackendCallControl(delegation, signal) {',method+'\tasync prepareBackendCallControl(delegation, signal) {');
}
export function patchGptLiveControlLaneTalk(s){
 s=once(s,'callerInputAcceptedAt, callControl }) => {','callerInputAcceptedAt, callControl, controlOnly=false }) => {');
 s=once(s,'const spokenGrant = authorizeGptLiveClientVoicePendingConfirmation({','const spokenGrant = controlOnly ? undefined : authorizeGptLiveClientVoicePendingConfirmation({');
 s=once(s,'identity: continuationIdentity, ownerConnId: params.connId, voiceSessionId: params.voiceSessionId, ownerGeneration: entryPrefix,','identity: continuationIdentity, ownerConnId: params.connId, voiceSessionId: params.voiceSessionId, ownerGeneration: entryPrefix, callControlOnly:controlOnly===true,');
 s=once(s,'\t\tconst parsedArgs = parseRealtimeVoiceAgentConsultArgs(args);','\t\tconst parsedArgs = parseRealtimeVoiceAgentConsultArgs(args);\n\t\tconst controlOnly=continuationContext?.callControlOnly===true;\n\t\tif(controlOnly&&continuationContext.callControl?.isCurrent()!==true)throw Error("Call control source is not current");');
 const key='\t\t\tsessionKey: canonicalKey,\n\t\t\tstorePath,\n\t\t\tmessageProvider: "webchat",\n\t\t\tlane: "talk",';
 s=once(s,key,'\t\t\tsessionKey: controlOnly ? `agent:${agentId}:explicit:voice-call-control-${voiceSessionId}` : canonicalKey,\n\t\t\tstorePath,\n\t\t\tmessageProvider: "webchat",\n\t\t\tlane: controlOnly ? "voice-call-control" : "talk",');
 s=once(s,'\t\t\t...authority,','\t\t\t...authority,\n\t\t\t...(controlOnly ? {toolsAllow:["openclaw_end_call"], transcript:[], thinkLevel:"low", timeoutMs:20000} : {}),');
 return s;
}
export function patchGptLiveControlLaneRegistry(s){
 return once(s,'const voiceKey = JSON.stringify([context.ownerConnId, context.voiceSessionId, context.ownerGeneration]);','if(context.callControlOnly===true&&!callControl)throw error("Control lane requires host-owned call control");\n    const voiceKey = JSON.stringify(context.callControlOnly===true ? [context.ownerConnId, context.voiceSessionId, context.ownerGeneration, "call-control"] : [context.ownerConnId, context.voiceSessionId, context.ownerGeneration]);');
}
