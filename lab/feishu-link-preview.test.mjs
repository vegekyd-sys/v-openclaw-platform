import test from 'node:test';
import assert from 'node:assert/strict';
import {feishuLinkPreview} from './feishu-link-preview.mjs';
import {patchFeishuLinkPreview} from './patch-feishu-link-preview.mjs';
const event={header:{event_type:'url.preview.get'},event:{context:{url:'https://example.test/?project=A',preview_token:'tok'}}};
const flat=event.event,endpoint='http://127.0.0.1:1/v1/preview',answer={inline:{title:'x'}};
const ok=async()=>new Response(JSON.stringify(answer),{status:200});
test('forwards the link and token and returns the answer, for the nested and the SDK-flattened shape',async()=>{
 for(const data of [event,flat]){
  let body;const result=await feishuLinkPreview(data,{endpoint,fetchImpl:async(url,init)=>{body=JSON.parse(init.body);return ok();}});
  assert.deepEqual(result,answer);assert.deepEqual(body,{url:'https://example.test/?project=A',previewToken:'tok'});
 }
});
test('not configured: no call at all, and the callback answers nothing',async()=>{
 let calls=0;assert.equal(await feishuLinkPreview(event,{endpoint:'',fetchImpl:async()=>{calls++;return ok();}}),undefined);assert.equal(calls,0);
});
test('down, failing, garbled, oversized or nothing to say: answers nothing and never throws',async()=>{
 for(const fetchImpl of [async()=>{throw Error('ECONNREFUSED');},async()=>new Response('x',{status:500}),async()=>new Response(null,{status:204}),
  async()=>new Response('not json',{status:200}),async()=>new Response('x'.repeat(40*1024),{status:200})])
  assert.equal(await feishuLinkPreview(event,{endpoint,fetchImpl}),undefined);
});
test('a hanging service is cut off inside Feishu\'s 3 seconds',async()=>{
 const started=Date.now();
 const hang=(url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason)));
 assert.equal(await feishuLinkPreview(event,{endpoint,fetchImpl:hang,timeoutMs:50}),undefined);assert(Date.now()-started<1000);
});
test('patch registers next to the card callback, once, and refuses a drifted anchor',()=>{
 const source='const a = {\n\t\t"card.action.trigger": async (data) => {\n}};';
 const patched=patchFeishuLinkPreview(source);
 assert(patched.indexOf('"url.preview.get"')<patched.indexOf('"card.action.trigger"'));
 assert.equal(patchFeishuLinkPreview(patched),patched);assert.throws(()=>patchFeishuLinkPreview('nothing'));
});
