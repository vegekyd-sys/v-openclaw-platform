import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {GrokVoiceBridge,GROK_VOICE_MODEL} from './grok-provider.mjs';
class Socket extends EventEmitter {constructor(){super();this.readyState=1;this.sent=[];}send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;this.emit('close');}}
async function fixture(){const ws=new Socket(),calls=[],audio=[],text=[];
 const bridge=new GrokVoiceBridge({instructions:'中文',tools:[{type:'function',name:'memory_search',parameters:{type:'object'}}],onToolCall:c=>calls.push(c),onAudio:b=>audio.push(b),onTranscript:(...a)=>text.push(a)},
 {apiKey:'private-key',createWebSocket:async(url,options)=>{assert(url.endsWith(GROK_VOICE_MODEL));assert.equal(options.headers.Authorization,'Bearer private-key');return ws;}});
 const opening=bridge.connect();await new Promise(r=>setImmediate(r));ws.emit('open');bridge.receive({type:'session.updated'});await opening;
 return {ws,calls,audio,text,bridge};}
test('Grok config is Chinese PCM plus native functions; keys are not provider events',async()=>{const f=await fixture();assert.equal(f.ws.sent[0].session.audio.input.format.rate,24000);assert.equal(f.ws.sent[0].session.audio.input.transcription.language_hint,'zh');assert.equal(f.ws.sent[0].session.tools[0].name,'memory_search');f.bridge.receive({type:'response.output_audio.delta',delta:Buffer.from([0,1]).toString('base64')});assert.deepEqual(f.audio,[Buffer.from([0,1])]);f.bridge.close();});
test('parallel calls wait for terminal call batch and both real results; one continuation',async()=>{const f=await fixture();f.bridge.receive({type:'response.created',response:{id:'r1'}});
 for(const id of ['a','b'])f.bridge.receive({type:'response.function_call_arguments.done',response_id:'r1',call_id:id,name:'memory_search',arguments:'{"query":"x"}'});
 f.bridge.submitToolResult('a',{result:'A'});f.bridge.submitToolResult('b',{result:'B'});
 assert.equal(f.ws.sent.filter(e=>e.type==='response.create').length,0);
 f.bridge.receive({type:'response.done',response:{id:'r1',status:'completed'}});
 assert.equal(f.ws.sent.filter(e=>e.type==='conversation.item.create').length,2);
 assert.equal(f.ws.sent.filter(e=>e.type==='response.create').length,1);
 f.bridge.submitToolResult('a',{result:'changed'});assert.equal(f.ws.sent.filter(e=>e.type==='response.create').length,1);f.bridge.close();});
test('duplicate function event is not executed twice and conflicting call identity closes',async()=>{const f=await fixture();const event={type:'response.function_call_arguments.done',response_id:'r1',call_id:'a',name:'memory_search',arguments:'{"query":"x"}'};
 f.bridge.receive(event);f.bridge.receive(event);assert.equal(f.calls.length,1);f.bridge.receive({...event,arguments:'{"query":"other"}'});assert.equal(f.bridge.closed,true);});
test('provider failure cancels connect, late events cannot emit audio',async()=>{const f=await fixture();f.bridge.close();f.bridge.receive({type:'response.output_audio.delta',delta:'AAE='});assert.equal(f.audio.length,0);});
