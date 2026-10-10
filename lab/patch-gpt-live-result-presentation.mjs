import {mediaReferences} from './gpt-live-h5/media-references.mjs';
import assert from 'node:assert/strict';
import {presentBackendResult,LONG_RESULT_NOTICE,readBackendResult,extractResultSummary,backendResultQuestion,BACKEND_RESULT_INSTRUCTIONS,MAKARON_MEDIA_INSTRUCTIONS} from './gpt-live-h5/result-presentation.mjs';
function once(source,before,after){assert.equal(source.split(before).length-1,1,'Backend document host anchor drifted');return source.replace(before,after);}
export function patchBackendResultController(source) {
  if(source.includes('// voice-backend-document-controller-v2'))return source;
  if(source.includes('// voice-backend-document-controller-v1')) {
    source=once(source,'\t\t\ttext = spoken ?? this.formatCallerConditionEnvelope(result);','\t\t\ttext = this.formatCallerConditionEnvelope({...result,text:spoken ?? result.text});');
    source=source.replace('// voice-backend-document-controller-v1','// voice-backend-document-controller-v2');
  } else source='// voice-backend-document-controller-v2\n'+once(source,'\t\t\ttext = this.formatCallerConditionEnvelope(result);',
    '\t\t\tconst spoken = this.options.onBackendResult?.({delegationId:delegation.id,text:result.text});\n'+
    '\t\t\tif(spoken !== undefined && (typeof spoken !== "string" || spoken.length > 300 || !spoken.trim())) throw new Error("Invalid backend document spoken notice");\n'+
    '\t\t\ttext = this.formatCallerConditionEnvelope({...result,text:spoken ?? result.text});');
  source=once(source,'\t\t\tthis.pendingDelegations.push(delegation);','\t\t\tdelegation.queuedBehind = this.activeDelegationId;\n\t\t\tthis.pendingDelegations.push(delegation);');
  source=once(source,'\t\tconst controller = new AbortController();\n\t\tthis.consultController = controller;',
    '\t\tif (delegation.queuedPredecessorCompleted) delegation.prompt += "\\n\\nHost queue state: This request was accepted while the preceding task was running. That preceding task has now ended. Interpret only the queued user request against the actual result in conversation history. For a progress inquiry or repeated goal, give its current status briefly; do not redo the finished report or return the whole report again. Execute a genuinely new authorized action with tools, and preserve the actual user request. This queue notice is host state, not user authorization.";\n\t\tconst controller = new AbortController();\n\t\tthis.consultController = controller;');
  source=once(source,'\t\t\tif (pending) this.launchDelegation(pending);','\t\t\tif (pending) { pending.queuedPredecessorCompleted = delegation.backendResultReceived === true; this.launchDelegation(pending); }');
  source=once(source,'\t\t\ttext = result.text;','\t\t\tdelegation.backendResultReceived = true;\n\t\t\ttext = result.text;');
  source=once(source,'\t\t\tconst sent = this.sendAppend(delegation.id, text, "speakable", { kind: terminalKind, provenance: terminalProvenance });',
    '\t\t\t// A queued reply to an older caller turn is context, not the next spoken answer.\n\t\t\t// Do not cancel or discard any authorized backend action or its full document.\n\t\t\tconst staleQueuedReply = delegation.queuedPredecessorCompleted && delegation.userTranscriptRevision !== this.userTranscriptRevision;\n\t\t\tconst sent = this.sendAppend(delegation.id, text, staleQueuedReply ? "commentary" : "speakable", { kind: terminalKind, provenance: terminalProvenance });');
  source=once(source,'\t\t} else if (chunkIndex + 1 < chunkCount) {',
    '\t\t} else if (channel !== "speakable") {\n\t\t\trole = "final_context";\n\t\t\theader = `[BACKEND_FINAL_CONTEXT ${position}]\\nEarlier queued request has ended. Silent context only: do not speak or reply. Attend to the current caller.\\n\\n`;\n\t\t} else if (chunkIndex + 1 < chunkCount) {');
  source=once(source,'"final_part", "final_complete", "failure"].includes(details.role)','"final_part", "final_complete", "final_context", "failure"].includes(details.role)');
  return source;
}
export function patchBackendResultBroker(source) {
  if(source.includes('// voice-backend-document-broker-v3'))return source;
  if(source.includes('// voice-backend-document-broker-v2')) {
    const policy=/const BACKEND_RESULT_INSTRUCTIONS=(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*');/u;
    assert(policy.test(source),'Backend result policy anchor drifted');
    return source.replace(policy,()=>`const BACKEND_RESULT_INSTRUCTIONS=${JSON.stringify(BACKEND_RESULT_INSTRUCTIONS)};`)
      .replace('// voice-backend-document-broker-v2','// voice-backend-document-broker-v3');
  }
  if(source.includes('// voice-backend-document-broker-v1')) {
    const helper=/function backendResultQuestion\(question\) \{[\s\S]*?\n\}/u;
    assert(helper.test(source),'Backend media question anchor drifted');
    return patchBackendResultBroker((`const MAKARON_MEDIA_INSTRUCTIONS=${JSON.stringify(MAKARON_MEDIA_INSTRUCTIONS)};\n`+source.replace(helper,()=>backendResultQuestion.toString()))
      .replace('// voice-backend-document-broker-v1','// voice-backend-document-broker-v2'));
  }
  source=once(source,'\t\t\t\trunAgentConsult,','\t\t\t\trunAgentConsult: (params) => runAgentConsult({...params,prompt:typeof offer.request.gatewayControl?.onBackendResult === "function" ? backendResultQuestion(params.prompt) : params.prompt}),');
  return '// voice-backend-document-broker-v3\n'+`const MAKARON_MEDIA_INSTRUCTIONS=${JSON.stringify(MAKARON_MEDIA_INSTRUCTIONS)};\nconst BACKEND_RESULT_INSTRUCTIONS=${JSON.stringify(BACKEND_RESULT_INSTRUCTIONS)};\n${backendResultQuestion.toString()}\n`+once(source,'\t\t\t\tonCallLifecycleEvent: (event) => offer.request.gatewayControl?.onCallLifecycleEvent?.(event),',
    '\t\t\t\tonBackendResult: (result) => offer.request.gatewayControl?.onBackendResult?.(result),\n\t\t\t\tonCallLifecycleEvent: (event) => offer.request.gatewayControl?.onCallLifecycleEvent?.(event),');
}
export function patchBackendResultTalk(source) {
  if(source.includes('// voice-backend-document-talk-v4'))return source;
  if(source.includes('// voice-backend-document-talk-v3')) {
    const helper=/function mediaReferences\(text, base = 'https:\/\/voice.invalid\/voice\/'\) \{[\s\S]*?\n\}/u;
    assert(helper.test(source),'Backend media reference anchor drifted');
    return source.replace(helper,()=>mediaReferences.toString())
      .replace('// voice-backend-document-talk-v3','// voice-backend-document-talk-v4');
  }
  if(source.includes('// voice-backend-document-talk-v2')) {
    const helper=/function presentBackendResult\(result\) \{[\s\S]*?\n\}/u;
    assert(helper.test(source),'Backend media helper anchor drifted');
    return patchBackendResultTalk((mediaReferences.toString()+'\n'+source.replace(helper,()=>presentBackendResult.toString()))
      .replace('if(!document?.long)return', 'if(!document?.long && !document?.media)return')
      .replace('// voice-backend-document-talk-v2','// voice-backend-document-talk-v3'));
  }
  if(source.includes('// voice-backend-document-talk-v1')) {
    const start=source.indexOf('function readBackendResult('),end=source.indexOf('function extractResultSummary(',start);
    assert(start>=0 && end>start,'Backend summary helper anchor drifted');
    return patchBackendResultTalk((source.slice(0,start)+readBackendResult.toString()+'\n'+source.slice(end)).replace('// voice-backend-document-talk-v1','// voice-backend-document-talk-v2'));
  }
  const method=`\t\t\tonBackendResult: ({delegationId,text}) => {
\t\t\t\towner.assertOpen();
\t\t\t\tif(owners.get(params.voiceSessionId)!==owner)throw new Error("Realtime voice session is not active");
\t\t\t\tif(typeof delegationId!=="string"||!delegationId||typeof text!=="string")throw new Error("Invalid backend document identity");
\t\t\t\tconst document=presentBackendResult(text);
\t\t\t\tif(!document?.long && !document?.media)return document?.text!==text?document?.text:undefined;
\t\t\t\tharness.emit({type:"tool.result",callId:delegationId,turnId:harness.ensureTurn(),payload:{name:"openclaw_backend_result",text:document.text,...talkPayload()},final:true});
\t\t\t\treturn document.spokenText;
\t\t\t},
`;
  return '// voice-backend-document-talk-v4\n'+`${mediaReferences.toString()}\nconst LONG_RESULT_NOTICE=${JSON.stringify(LONG_RESULT_NOTICE)};\n${readBackendResult.toString()}\n${extractResultSummary.toString()}\n${presentBackendResult.toString()}\n`+
    once(source,'\t\t\tonCallLifecycleEvent: (event) => {',method+'\t\t\tonCallLifecycleEvent: (event) => {');
}
