import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {patchBackendResultBroker} from './patch-gpt-live-result-presentation.mjs';
import {backendResultQuestion,isSpokenBackendProgress} from './gpt-live-h5/result-presentation.mjs';

test('compiled GPT broker has the same media policy, including an upgrade of the deployed helper',()=>{
  let legacy='// voice-backend-document-broker-v1\nconst BACKEND_RESULT_INSTRUCTIONS="existing result policy";\nfunction backendResultQuestion(question) {\n  return `${question}\\n\\n${BACKEND_RESULT_INSTRUCTIONS}`;\n}\n';
  legacy+='function configure() {return {runAgentConsult: (params) => runAgentConsult({...params,prompt:typeof offer.request.gatewayControl?.onBackendResult === \"function\" ? backendResultQuestion(params.prompt) : params.prompt})};}';
  const source='function configure() { return {\n\t\t\t\trunAgentConsult,\n\t\t\t\tonCallLifecycleEvent: (event) => offer.request.gatewayControl?.onCallLifecycleEvent?.(event),\n}; }';
  for(const original of [legacy,source]) {
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


test('short streamed media fragments do not bypass canonical speech summary or lose final media delivery',async()=>{
 const broker=fs.readFileSync(new URL('./release-files/voice-content-product-20261010/realtime-quicksilver-session-B3HKftDE.js',import.meta.url),'utf8');
 const helpers=broker.split('import ')[0];
 const assignment=broker.match(/runAgentConsult: \(params\) => ([^\n]+),/u)?.[1];assert(assignment);
 let forwarded=[];
 const invoke=new Function('params','runAgentConsult','offer',helpers+'\nreturn '+assignment+';');
 const final={text:'![赛车](https://cdn.test/a.jpg)'};
 const result=await invoke({prompt:'查询图片',onProgress:p=>forwarded.push(p.text)},async options=>{
  for(const text of ['已确认这张图生成完成。','https://cdn.test/a.jpg','![赛车](https://cdn.test/a.jpg)','MEDIA:https://cdn.test/a.jpg'])await options.onProgress({kind:'commentary',text});
  return final;
 },{request:{gatewayControl:{onBackendResult(){}}}});
 assert.deepEqual(forwarded,['已确认这张图生成完成。']);assert.equal(result,final);
 assert.equal(isSpokenBackendProgress({text:'链接还在验证中。'}),true);
});
