import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRelayAudio,PcmPlaybackQueue,relayWorkletSource} from './relay-audio.mjs';

function queue(rate=48000,ms=120){return new PcmPlaybackQueue(rate,ms)}
const pcm=(n,value=8192)=>new Int16Array(n).fill(value);
function render(q,n=128,at=0){const out=new Float32Array(n);q.render(out,at);return out;}
function replay(rate,arrivals){
 const q=queue(rate),out=[];let index=0,first=null;
 for(let frame=0;frame<rate*.5;frame+=128){const at=frame/rate;
  while(index<arrivals.length&&at>=arrivals[index]){q.push(pcm(480,8192+index*100));index++;if(index===arrivals.length)q.end();}
  const block=render(q,128,at);for(const v of block){if(v!==0&&first===null)first=out.length;out.push(v);}
 }
 const last=out.findLastIndex(v=>v!==0);return {q,out,first,last,zeros:first===null?0:out.slice(first,last+1).filter(v=>v===0).length};
}
test('120ms audio-thread prebuffer absorbs the recorded 50/60ms scheduling holes without replay',()=>{
 const arrivals=[0,.02,.04,.11,.13,.15,.23,.25,.27];
 for(const rate of [24000,44100,48000]){const r=replay(rate,arrivals);assert.equal(r.zeros,0);assert.equal(r.q.consumed,9*480);assert.equal(r.q.underflows,0);assert.ok(r.first/rate<.13);assert.ok(r.first/rate>=.11);}
});
test('starvation produces silence, not the last syllable; new speech resumes once after rebuffer',()=>{
 const q=queue(48000,0);q.push(pcm(480,16384));const heard=render(q,960);assert(heard.every(v=>v===.5));
 assert(render(q).every(v=>v===0));assert.equal(q.underflows,1);assert(render(q).every(v=>v===0));assert.equal(q.underflows,1);
 q.push(pcm(480,8192));const next=render(q,960);assert(next.every(v=>v===.25));assert.equal(q.consumed,960);
});
test('FIFO retains chunk boundaries, sample order, and legitimate identical frames',()=>{
 const q=queue(24000,0);q.push(Int16Array.from([1,2,3]));q.push(Int16Array.from([4,5]));q.push(Int16Array.from([4,5]));q.end();
 assert.deepEqual([...render(q,7)].map(v=>Math.round(v*32768)),[1,2,3,4,5,4,5]);assert.equal(q.frames,0);assert.equal(q.underflows,0);
});
test('clear discards queued/partly consumed speech, resets resampling, and bounds allocation',()=>{
 const q=new PcmPlaybackQueue(44100,0,1024);q.push(pcm(1000));render(q);assert.throws(()=>q.push(pcm(1000)),/overflow/);
 q.clear();assert.equal(q.frames,0);assert(render(q).every(v=>v===0));q.push(pcm(100,-8192));q.end();const out=render(q);assert(out.every(v=>v===-.25));
});
test('fast long speech releases queue capacity after playback, independently of a 30-second lead',()=>{
 const q=queue(24000,0);for(let i=0;i<70;i++)q.push(pcm(24000));assert.equal(q.frames,70*24000);q.end();
 for(let i=0;i<70*24000;i+=24000)render(q,24000);assert.equal(q.frames,0);assert.equal(q.consumed,70*24000);assert.equal(q.underflows,0);
});

async function fixture(t){
 const old={WebSocket:globalThis.WebSocket,location:globalThis.location,AudioWorkletNode:globalThis.AudioWorkletNode};
 let socket;const sent=[],nodes=[],classes=new Map(),events=[],errors=[],listeners=new Map();
 class Socket{static OPEN=1;readyState=1;bufferedAmount=0;constructor(){socket=this}send(e){sent.push(e)}close(){this.readyState=3}}
 const realm=vm.createContext({Int16Array,Float32Array,sampleRate:48000,currentTime:0,registerProcessor:(name,K)=>classes.set(name,K),AudioWorkletProcessor:class{constructor(){this.port={postMessage:e=>this.toHost?.(e)}}}});
 class Worklet{constructor(context,name){this.name=name;this.processor=new(classes.get(name))();this.port={postMessage:(e,transfer=[])=>this.processor.port.onmessage?.({data:structuredClone(e,{transfer})}),close(){}};this.processor.toHost=e=>this.port.onmessage?.({data:e});nodes.push(this)}connect(){}disconnect(){this.disconnected=true}}
 Object.assign(globalThis,{WebSocket:Socket,location:{href:'https://voice.test/voice/'},AudioWorkletNode:Worklet});
 const ctx={state:'running',currentTime:0,destination:{},audioWorklet:{addModule:async url=>vm.runInContext(await(await fetch(url)).text(),realm)},addEventListener:(name,cb)=>listeners.set(name,cb),removeEventListener:name=>listeners.delete(name),createMediaStreamSource:()=>({connect(){},disconnect(){}}),createGain:()=>({gain:{value:1},connect(){},disconnect(){}})};
 const relay=createRelayAudio({context:ctx,stream:{},reservation:{voiceSessionId:'fixture',relayTicket:'fixture'},onEvent:e=>events.push(e),onError:e=>errors.push(e.message),onClosed(){}});
 const event=e=>socket.onmessage({data:JSON.stringify({voiceSessionId:'fixture',...e})});event({type:'ready'});await relay.start();
 t.after(()=>{relay.dispose();Object.assign(globalThis,old)});
 const speaker=nodes.find(n=>n.name==='v-direct-speaker');const pump=n=>{const output=[];for(let i=0;i<n;i+=128){realm.currentTime=ctx.currentTime;const block=new Float32Array(128);speaker.processor.process([],[[block]]);output.push(...block);ctx.currentTime+=128/48000;}return output;};
 return {relay,event,ctx,speaker,nodes,sent,events,errors,pump,listeners};
}
test('serialized production worklet executes; exact relay sequence is consumed once, identical PCM still valid',async t=>{
 const f=await fixture(t),audio=Buffer.alloc(960,1).toString('base64');
 for(const sequence of [1,1,2])f.event({type:'audio',sequence,sampleRate:24000,audio});f.event({type:'audio.done'});f.pump(48000);
 assert.equal(f.relay.stats.duplicateFrames,1);assert.equal(f.relay.stats.outputBytes,1920);assert.equal(f.relay.stats.queuedOutputBytes,0);assert.equal(f.speaker.processor.queue.consumed,960);assert.deepEqual(f.errors,[]);
});
test('Safari interruption buffers audio without ending the call; render-thread playback drains after resume',async t=>{
 const f=await fixture(t);f.ctx.state='interrupted';f.listeners.get('statechange')();f.event({type:'audio',sequence:1,sampleRate:24000,audio:Buffer.alloc(960,1).toString('base64')});
 assert.equal(f.relay.stats.queuedOutputBytes,960);assert(f.events.some(e=>e.type==='playback.blocked'));assert.deepEqual(f.errors,[]);
 f.ctx.state='running';f.listeners.get('statechange')();f.event({type:'audio.done'});f.pump(48000);assert.equal(f.relay.stats.queuedOutputBytes,0);assert(f.events.some(e=>e.type==='playback.resumed'));
});
test('clear retires old audio and late epoch receipts; only new speech is played',async t=>{
 const f=await fixture(t);const frame=value=>Buffer.from(pcm(2400,value).buffer).toString('base64');
 f.event({type:'audio',sequence:1,sampleRate:24000,audio:frame(8192)});f.event({type:'audio.clear'});f.event({type:'audio',sequence:2,sampleRate:24000,audio:frame(-8192)});
 f.speaker.port.onmessage({data:{type:'playback',epoch:0,consumed:90000,lastPlayedAt:0}});assert.equal(f.relay.stats.queuedOutputBytes,4800);
 f.event({type:'audio.done'});const out=f.pump(24000);assert(out.filter(v=>v!==0).every(v=>v===-.25));assert.equal(f.relay.stats.queuedOutputBytes,0);
});
test('farewell acknowledgement waits for actual render and 750ms tail; disposal rejects stale audio',async t=>{
 const f=await fixture(t);f.event({type:'audio',sequence:1,sampleRate:24000,audio:Buffer.alloc(960,1).toString('base64')});f.event({type:'audio.done'});f.event({type:'end.after-playback',callId:'end-1'});
 assert.equal(f.sent.filter(s=>typeof s==='string'&&JSON.parse(s).type==='playback.drained').length,0);
 f.pump(48000);await new Promise(r=>setTimeout(r,120));assert.equal(f.sent.filter(s=>typeof s==='string'&&JSON.parse(s).type==='playback.drained').length,1);
 f.relay.dispose();const bytes=f.relay.stats.outputBytes;f.event({type:'audio',sequence:2,sampleRate:24000,audio:Buffer.alloc(960).toString('base64')});assert.equal(f.relay.stats.outputBytes,bytes);assert(f.nodes.every(n=>n.disconnected));
});
test('worklet source does not perform main-thread per-frame BufferSource scheduling',()=>{
 assert.match(relayWorkletSource(),/registerProcessor\('v-direct-speaker'/);assert.doesNotMatch(createRelayAudio.toString(),/createBufferSource/);
});
test('queued and prebuffering playback reports busy before the first rendered sample',async t=>{
 const f=await fixture(t);f.event({type:'audio',sequence:1,sampleRate:24000,audio:Buffer.alloc(960,1).toString('base64')});
 assert(f.sent.some(raw=>typeof raw==='string'&&JSON.parse(raw).type==='playback.state'&&JSON.parse(raw).speaking));
 f.event({type:'audio.done'});f.pump(48000);assert.equal(JSON.parse(f.sent.filter(raw=>typeof raw==='string'&&JSON.parse(raw).type==='playback.state').at(-1)).speaking,false);
});
