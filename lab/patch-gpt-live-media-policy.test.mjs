import test from 'node:test';
import assert from 'node:assert/strict';
import {patchBackendResultBroker} from './patch-gpt-live-result-presentation.mjs';
import {backendResultQuestion} from './gpt-live-h5/result-presentation.mjs';

test('compiled GPT broker has the same media policy, including an upgrade of the deployed helper',()=>{
  const legacy='// voice-backend-document-broker-v1\nconst BACKEND_RESULT_INSTRUCTIONS="existing result policy";\nfunction backendResultQuestion(question) {\n  return `${question}\\n\\n${BACKEND_RESULT_INSTRUCTIONS}`;\n}\n';
  const source='function configure() { return {\n\t\t\t\trunAgentConsult,\n\t\t\t\tonCallLifecycleEvent: (event) => offer.request.gatewayControl?.onCallLifecycleEvent?.(event),\n}; }';
  for(const original of [legacy,source]) {
    const compiled=patchBackendResultBroker(original);
    const question=new Function('input',compiled+'\nreturn backendResultQuestion(input);')('生成图片，然后做成视频');
    assert(question.includes('makaron chat --project auto -b --json'));
    assert(question.includes('轮询') && question.includes('不重复付费提交'));
    assert(question.includes('生成图片，然后做成视频'));
    assert.equal(patchBackendResultBroker(compiled),compiled);
    if(original===source)assert.equal(question,backendResultQuestion('生成图片，然后做成视频'));
  }
});
