import test from 'node:test';import assert from 'node:assert/strict';
import {placeDeepSeekRuntimeContext as place,cacheBoundary as boundary} from './deepseek-late-runtime-context.mjs';
const model={provider:'deepseek',id:'deepseek-v4-pro'};
const context={systemPrompt:'EXACT Core prompt.  \n'+boundary+'  Runtime: session=NEW\nPolicy stays system.'};
const head={role:'system',content:context.systemPrompt.replace(boundary,'\n')};
const history=[{role:'user',content:'old user'},{role:'assistant',content:'old assistant'},{role:'user',content:'new user'}];
test('disabled and other models remain reference-identical',()=>{
 const m=[head,...history];assert.equal(place(m,context,model,false),m);
 assert.equal(place(m,context,{...model,provider:'other'},true),m);
 assert.equal(place(m,context,{...model,id:'deepseek-v4-flash'},true),m);
});
test('system text is byte-identical when recombined; roles and history are retained',()=>{
 const m=[head,...history],before=structuredClone(m),out=place(m,context,model,true);
 assert.deepEqual(m,before);assert.notEqual(out,m);
 assert.equal(out.filter(m=>m.role==='system').map(m=>m.content).join(''),head.content);
 assert.deepEqual(out.filter(m=>m.role!=='system'),history);
 assert.equal(out.at(-2).role,'system');assert.equal(out.at(-1),history.at(-1));
 assert.equal(out[0].content,context.systemPrompt.split(boundary)[0]);
});
test('tool-call continuations and multiple parallel results remain contiguous',()=>{
 const tail=[{role:'assistant',tool_calls:[{id:'a'},{id:'b'}]},{role:'tool',tool_call_id:'a',content:'A'},{role:'tool',tool_call_id:'b',content:'B'}];
 const out=place([head,...history,...tail],context,model,true);
 assert.deepEqual(out.slice(-4),[history.at(-1),...tail]);
});
test('two different runtime identities retain an identical full historical prefix',()=>{
 const a=place([head,...history],context,model,true);
 const c={systemPrompt:context.systemPrompt.replace('NEW','OTHER')};
 const b=place([{...head,content:c.systemPrompt.replace(boundary,'\n')},...history],c,model,true);
 assert.deepEqual(a.slice(0,-2),b.slice(0,-2));assert.notEqual(a.at(-2).content,b.at(-2).content);
});
test('ambiguous/sanitized/structured/multiple-system/no-history inputs fail closed',()=>{
 const cases=[
  [[{...head,content:head.content.trim()},...history],context],
  [[{...head,content:[{type:'text',text:head.content}]},...history],context],
  [[head,{role:'developer',content:'extra'},...history],context],
  [[head,...history],{systemPrompt:context.systemPrompt+boundary+'extra'}],
  [[head,{role:'user',content:'hi'}],context],
  [[head,...history],{systemPrompt:'no boundary'}],
 ];
 // trim() above may preserve this particular string; use an explicit transform.
 cases[0][0][0].content=head.content+'changed';
 for(const [m,c]of cases)assert.equal(place(m,c,model,true),m);
});
