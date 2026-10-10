import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {patchBackendResultBroker} from './patch-gpt-live-result-presentation.mjs';
import {backendResultQuestion} from './gpt-live-h5/result-presentation.mjs';

test('compiled GPT broker has the same media policy, including an upgrade of the deployed helper',()=>{
  const legacy='// voice-backend-document-broker-v1\nconst BACKEND_RESULT_INSTRUCTIONS="existing result policy";\nfunction backendResultQuestion(question) {\n  return `${question}\\n\\n${BACKEND_RESULT_INSTRUCTIONS}`;\n}\n';
  const source='function configure() { return {\n\t\t\t\trunAgentConsult,\n\t\t\t\tonCallLifecycleEvent: (event) => offer.request.gatewayControl?.onCallLifecycleEvent?.(event),\n}; }';
  const v2=patchBackendResultBroker(legacy).replace('broker-v3','broker-v2').replace(/const BACKEND_RESULT_INSTRUCTIONS=.*?;\n/u,'const BACKEND_RESULT_INSTRUCTIONS=\"old document policy\";\n');
  for(const original of [legacy,v2,source]) {
    const compiled=patchBackendResultBroker(original);
    const question=new Function('input',compiled+'\nreturn backendResultQuestion(input);')('生成图片，然后做成视频');
    assert(question.includes('makaron chat --project auto -b --json'));
    assert(question.includes('轮询') && question.includes('不重复付费提交'));
    assert(question.includes('生成图片，然后做成视频'));
    assert.equal(patchBackendResultBroker(compiled),compiled);
    assert.equal(question,backendResultQuestion('生成图片，然后做成视频'));
  }
});


test('frozen Gateway broker and Talk use the canonical media policy and recognize the real plain-link result',()=>{
 const root=new URL('./release-files/voice-content-product-20261010/',import.meta.url);
 const broker=fs.readFileSync(new URL('realtime-quicksilver-session-B3HKftDE.js',root),'utf8').split('import ')[0];
 assert.equal(new Function('input',broker+'\nreturn backendResultQuestion(input);')('生成小赛车图片'),backendResultQuestion('生成小赛车图片'));
 const talk=fs.readFileSync(new URL('talk-DkFuKRod.js',root),'utf8').split('import ')[0];
 const result=new Function('input',talk+'\nreturn presentBackendResult(input);')('已生成：小赛车。\n链接：https://cdn.test/a.jpg');
 assert.equal(result.media,true);assert.equal(result.long,false);assert(!result.spokenText.includes('https:'));
});
