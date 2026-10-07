import assert from 'node:assert/strict';
import {presentBackendResult,LONG_RESULT_NOTICE,readBackendResult,extractResultSummary,backendResultQuestion,BACKEND_RESULT_INSTRUCTIONS} from './gpt-live-h5/result-presentation.mjs';
function once(source,before,after){assert.equal(source.split(before).length-1,1,'Backend document host anchor drifted');return source.replace(before,after);}
export function patchBackendResultController(source) {
  if(source.includes('// voice-backend-document-controller-v1'))return source;
  return '// voice-backend-document-controller-v1\n'+once(source,'\t\t\ttext = this.formatCallerConditionEnvelope(result);',
    '\t\t\tconst spoken = this.options.onBackendResult?.({delegationId:delegation.id,text:result.text});\n'+
    '\t\t\tif(spoken !== undefined && (typeof spoken !== "string" || spoken.length > 300 || !spoken.trim())) throw new Error("Invalid backend document spoken notice");\n'+
    '\t\t\ttext = spoken ?? this.formatCallerConditionEnvelope(result);');
}
export function patchBackendResultBroker(source) {
  if(source.includes('// voice-backend-document-broker-v1'))return source;
  source=once(source,'\t\t\t\trunAgentConsult,','\t\t\t\trunAgentConsult: (params) => runAgentConsult({...params,prompt:typeof offer.request.gatewayControl?.onBackendResult === "function" ? backendResultQuestion(params.prompt) : params.prompt}),');
  return '// voice-backend-document-broker-v1\n'+`const BACKEND_RESULT_INSTRUCTIONS=${JSON.stringify(BACKEND_RESULT_INSTRUCTIONS)};\n${backendResultQuestion.toString()}\n`+once(source,'\t\t\t\tonCallLifecycleEvent: (event) => offer.request.gatewayControl?.onCallLifecycleEvent?.(event),',
    '\t\t\t\tonBackendResult: (result) => offer.request.gatewayControl?.onBackendResult?.(result),\n\t\t\t\tonCallLifecycleEvent: (event) => offer.request.gatewayControl?.onCallLifecycleEvent?.(event),');
}
export function patchBackendResultTalk(source) {
  if(source.includes('// voice-backend-document-talk-v1'))return source;
  const method=`\t\t\tonBackendResult: ({delegationId,text}) => {
\t\t\t\towner.assertOpen();
\t\t\t\tif(owners.get(params.voiceSessionId)!==owner)throw new Error("Realtime voice session is not active");
\t\t\t\tif(typeof delegationId!=="string"||!delegationId||typeof text!=="string")throw new Error("Invalid backend document identity");
\t\t\t\tconst document=presentBackendResult(text);
\t\t\t\tif(!document?.long)return document?.text!==text?document?.text:undefined;
\t\t\t\tharness.emit({type:"tool.result",callId:delegationId,turnId:harness.ensureTurn(),payload:{name:"openclaw_backend_result",text:document.text,...talkPayload()},final:true});
\t\t\t\treturn document.spokenText;
\t\t\t},
`;
  return '// voice-backend-document-talk-v1\n'+`const LONG_RESULT_NOTICE=${JSON.stringify(LONG_RESULT_NOTICE)};\n${readBackendResult.toString()}\n${extractResultSummary.toString()}\n${presentBackendResult.toString()}\n`+
    once(source,'\t\t\tonCallLifecycleEvent: (event) => {',method+'\t\t\tonCallLifecycleEvent: (event) => {');
}
