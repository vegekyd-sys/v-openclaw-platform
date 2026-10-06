import test from 'node:test';
import assert from 'node:assert/strict';
import {createRelayAudio} from './relay-audio.mjs';

test('fast long speech remains playable, while completed and cleared buffers release capacity',async()=>{
 const original={WebSocket:globalThis.WebSocket,location:globalThis.location};
 let socket;const sources=[],errors=[];
 class Socket{static OPEN=1;readyState=1;constructor(){socket=this;}send(){}close(){} }
 globalThis.WebSocket=Socket;globalThis.location={href:'http://127.0.0.1:26244/'};
 const context={state:'running',currentTime:0,destination:{},
  createBuffer:(_,frames,rate)=>({duration:frames/rate,getChannelData:()=>new Float32Array(frames)}),
  createBufferSource:()=>{const s={connect(){},disconnect(){},start(at){this.at=at;},stop(){this.stopped=true;}};sources.push(s);return s;}};
 try{
  const relay=createRelayAudio({context,stream:{},reservation:{voiceSessionId:'long',relayTicket:'test'},onEvent(){},onError:e=>errors.push(e),onClosed(){}});
  const event=x=>socket.onmessage({data:JSON.stringify({voiceSessionId:'long',...x})});
  event({type:'ready'});await relay.ready;
  // A 70-second answer generated in seven seconds exceeds the old 30s guard.
  const audio=Buffer.alloc(48000).toString('base64');
  for(let i=0;i<70;i++){context.currentTime=i/10;event({type:'audio',sampleRate:24000,audio});}
  assert.equal(errors.length,0);assert.equal(sources.length,70);
  assert.ok(sources.at(-1).at-context.currentTime>60);
  assert.equal(relay.stats.queuedOutputBytes,70*48000);
  sources[0].onended();assert.equal(relay.stats.queuedOutputBytes,69*48000);
  event({type:'audio.clear'});assert.equal(relay.stats.queuedOutputBytes,0);
  assert.ok(sources.slice(1).every(s=>s.stopped));
  // Late onended callbacks from cleared sources cannot corrupt a new turn.
  event({type:'audio',sampleRate:24000,audio});
  for(const s of sources.slice(1,-1))s.onended();
  assert.equal(relay.stats.queuedOutputBytes,48000);
  assert.equal(sources.at(-1).at,context.currentTime+.18);
  relay.dispose();assert.equal(relay.stats.queuedOutputBytes,0);
 }finally{Object.assign(globalThis,original);}
});

test('a genuine excessive PCM allocation still hits the bounded memory guard',async()=>{
 const original={WebSocket:globalThis.WebSocket,location:globalThis.location};let socket;const errors=[];
 class Socket{static OPEN=1;readyState=1;constructor(){socket=this;}send(){}close(){} }
 globalThis.WebSocket=Socket;globalThis.location={href:'http://127.0.0.1:26244/'};
 const context={state:'running',currentTime:0,destination:{},createBuffer:(_,n,r)=>({duration:n/r,getChannelData:()=>new Float32Array(n)}),createBufferSource:()=>({connect(){},disconnect(){},start(){},stop(){}})};
 try{
  const relay=createRelayAudio({context,stream:{},reservation:{voiceSessionId:'bounded',relayTicket:'test'},onEvent(){},onError:e=>errors.push(e),onClosed(){}});
  const event=x=>socket.onmessage({data:JSON.stringify({voiceSessionId:'bounded',...x})});
  event({type:'ready'});await relay.ready;
  const audio=Buffer.alloc(480000).toString('base64');
  for(let i=0;i<36;i++)event({type:'audio',sampleRate:24000,audio});
  assert.ok(errors.some(e=>e.message==='语音缓存过大，请重新拨号'));
  assert.ok(relay.stats.queuedOutputBytes<=16*1024*1024);relay.dispose();
 }finally{Object.assign(globalThis,original);}
});


test('short delivery jitter preserves contiguous PCM scheduling and a real underrun is recorded',async()=>{
 const original={WebSocket:globalThis.WebSocket,location:globalThis.location};let socket;const sources=[],errors=[];
 class Socket{static OPEN=1;readyState=1;constructor(){socket=this;}send(){}close(){} }
 globalThis.WebSocket=Socket;globalThis.location={href:'http://127.0.0.1:26244/'};
 const context={state:'running',currentTime:0,destination:{},createBuffer:(_,n,r)=>({duration:n/r,getChannelData:()=>new Float32Array(n)}),createBufferSource:()=>{const p={connect(){},disconnect(){},start(at){this.at=at;},stop(){}};sources.push(p);return p;}};
 try{
  const relay=createRelayAudio({context,stream:{},reservation:{voiceSessionId:'jitter',relayTicket:'test'},onEvent(){},onError:e=>errors.push(e),onClosed(){}});
  const event=x=>socket.onmessage({data:JSON.stringify({voiceSessionId:'jitter',...x})});event({type:'ready'});await relay.ready;
  const audio=Buffer.alloc(960).toString('base64');
  for(const at of [0,.08,.09,.11,.14]){context.currentTime=at;event({type:'audio',sampleRate:24000,audio});}
  assert.equal(relay.stats.underruns,0);
  sources.forEach((p,i)=>assert.ok(Math.abs(p.at-(.18+.02*i))<1e-9));
  assert.equal(relay.stats.outputBytes,4800);
  context.currentTime=1;event({type:'audio',sampleRate:24000,audio});assert.equal(relay.stats.underruns,1);assert.equal(sources.at(-1).at,1.18);
  assert.equal(errors.length,0);relay.dispose();
 }finally{Object.assign(globalThis,original);}
});
