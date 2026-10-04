import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {BROWSER_PROBE} from './browser-probe.mjs';

// Execute the actual injected probe. Only the browser's native event producers
// and clocks are controlled here; these are offline tests, not call evidence.
function fixture({emitStart=true,stopError=null}={}) {
 let clock=1000,nextTimer=1;const timers=new Map(),recorders=[],calls=[];
 const event=(type,properties={})=>{const value=new Event(type);
  for(const [key,v] of Object.entries({timeStamp:clock-900,...properties}))Object.defineProperty(value,key,{value:v});return value;};
 class Track extends EventTarget {constructor(){super();this.id='original-receiver';this.readyState='live';this.enabled=true;this.muted=false;this.kind='audio';}
  stop(){calls.push({kind:'track-stop',at:clock});this.readyState='ended';}getSettings(){return {};}}
 class Stream {constructor(tracks){this.tracks=tracks;}getAudioTracks(){return this.tracks;}getTracks(){return this.tracks;}}
 class RTC extends EventTarget {constructor(){super();this.connectionState='connected';}
  getSenders(){return [];}getStats(){return Promise.resolve(new Map());}createDataChannel(){return new EventTarget();}
  close(...args){calls.push({kind:'original-pc-close',at:clock,args});this.connectionState='closed';}}
 class Context {constructor(){this.state='running';}createMediaStreamSource(){return {connect(){}};}
  createAnalyser(){return {fftSize:2048,getFloatTimeDomainData:s=>s.fill(0)};}
  resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}}
 class Recorder extends EventTarget {
  constructor(){super();this.state='inactive';this.stopCalls=0;recorders.push(this);}
  start(){calls.push({kind:'recorder-start-call',at:clock});this.state='recording';if(emitStart)this.dispatchEvent(event('start'));}
  stop(){this.stopCalls++;calls.push({kind:'recorder-stop-call',at:clock});if(stopError)throw Error(stopError);this.state='inactive';}
 }
 const receiver=new Track(),audio={muted:false,paused:false,volume:1,srcObject:new Stream([receiver]),currentTime:0};
 const context=vm.createContext({Event,EventTarget,Blob,Uint8Array,MediaStreamTrack:Track,MediaStream:Stream,RTCPeerConnection:RTC,
  AudioContext:Context,MediaRecorder:Recorder,Date:class extends Date {static now(){return clock;}},performance:{timeOrigin:900,now:()=>clock-900},
  navigator:{mediaDevices:{getUserMedia:async()=>new Stream([])}},setInterval:()=>nextTimer++,clearInterval(){},
  setTimeout:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms,at:clock});return id;},clearTimeout:id=>timers.delete(id),
  HTMLMediaElement:class {play(){return Promise.resolve();}},EventSource:class extends EventTarget {},fetch:async()=>({status:200}),
  document:{addEventListener(){},getElementById:id=>id==='remoteAudio'?audio:null},location:{href:'http://127.0.0.1:1/',origin:'http://127.0.0.1:1'},URL,
  btoa:value=>Buffer.from(value,'binary').toString('base64')});
 vm.runInContext(BROWSER_PROBE,context);
 const pc=new context.RTCPeerConnection();pc.dispatchEvent(event('track',{track:receiver}));
 const p=context.__candidateLiveProbe,recorder=recorders[0],row=p.recordings[0];
 return {context,p,pc,receiver,recorder,row,timers,calls,
  at(value){clock=value;},
  start(){recorder.dispatchEvent(event('start'));},
  data(bytes,timecode=0){recorder.dispatchEvent(event('dataavailable',{data:new Blob([Uint8Array.from(bytes)]),timecode}));},
  ended(){receiver.readyState='ended';receiver.dispatchEvent(event('ended'));},
  stop(){recorder.state='inactive';recorder.dispatchEvent(event('stop'));},
  error(message){recorder.dispatchEvent(event('error',{error:Error(message)}));},
  async flush(){for(let i=0;i<12;i++)await Promise.resolve();},
  expire(){const pending=[...timers.values()];assert.equal(pending.length,1);assert.equal(pending[0].ms,5000);clock+=5000;pending[0].fn();}
 };
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('actual recorder listeners precede start and retain original lifecycle clocks, bytes and native track-ended',async()=>{
 const f=fixture();assert.deepEqual(plain(f.row.lifecycle.events).map(e=>e.kind),['start-requested','start']);
 f.at(1050);f.data([1,2],0);f.at(1100);f.data([],50);f.at(1150);f.ended();f.stop();
 const result=await f.p.dispose();assert.equal(result,undefined);assert.equal(f.recorder.stopCalls,0);
 const lifecycle=plain(f.row.lifecycle);assert.equal(lifecycle.receiverTrackId,'original-receiver');
 assert.deepEqual(lifecycle.events.map(e=>e.kind),['start-requested','start','dataavailable','dataavailable','track-ended','stop']);
 assert.deepEqual(lifecycle.events.map(e=>e.at),[1000,1000,1050,1100,1150,1150]);
 assert.deepEqual(lifecycle.events.map(e=>e.performanceNowMs),[100,100,150,200,250,250]);
 assert(lifecycle.events.every(e=>e.performanceTimeOriginMs===900));
 assert.equal(lifecycle.events[2].eventTimeStampMs,150);assert.equal(lifecycle.events[2].timecodeMs,0);
 assert.equal(lifecycle.events[2].blobSizeBytes,2);assert.equal(lifecycle.events[3].blobSizeBytes,0);
 assert.equal(lifecycle.events[3].retained,false);assert.equal(lifecycle.events[3].chunkIndex,null);
 assert.equal(f.row.chunks.length,1);assert.deepEqual(Buffer.from(await new Blob(f.row.chunks).arrayBuffer()),Buffer.from([1,2]));
 assert.equal(f.row.startedAt,1000,'Keep the original pre-start nominal anchor');assert.equal(lifecycle.nominalStartedAtIsNotMeasuredFirstSample,true);
 assert.equal(lifecycle.finalization.passed,true);assert.equal(lifecycle.finalization.lastDataAvailableBeforeStop.sequence,3);
 assert.equal(f.timers.size,0);assert.equal(f.p.observerErrors.length,0);
});

test('synchronous inactive still waits for late original final data and stop; concurrent dispose shares completion',async()=>{
 const f=fixture();f.at(1100);f.data([1,2],0);f.at(1200);f.pc.close('business-close');
 assert.equal(f.pc.connectionState,'closed');assert.deepEqual(f.calls.find(e=>e.kind==='original-pc-close').args,['business-close']);
 let done=false;const disposing=f.p.dispose().then(()=>{done=true;});const shared=f.p.dispose();
 assert.equal(shared,f.p.disposePromise);await f.flush();assert.equal(f.recorder.state,'inactive');assert.equal(f.recorder.stopCalls,1);
 assert.equal(done,false);assert.equal(f.row.lifecycle.finalization,null);
 f.at(1240);f.data([3,4,5],140);await f.flush();assert.equal(done,false);
 f.at(1250);f.stop();await disposing;assert.equal(done,true);assert.equal(f.recorder.stopCalls,1);
 assert.equal(f.row.lifecycle.finalization.passed,true);assert.equal(f.row.lifecycle.finalization.completed.at,1250);
 assert.deepEqual(Buffer.from(await new Blob(f.row.chunks).arrayBuffer()),Buffer.from([1,2,3,4,5]));
 assert.equal(f.calls.find(e=>e.kind==='original-pc-close').at,1200,'Final recorder wait does not retime the original PC close');
});

test('naturally inactive track waits for an already registered real stop event without a second stop call',async()=>{
 const f=fixture();f.data([8],0);f.recorder.state='inactive';f.at(1300);f.ended();
 let done=false;const dispose=f.p.dispose().then(()=>{done=true;});await f.flush();assert.equal(done,false);assert.equal(f.recorder.stopCalls,0);
 f.at(1320);f.data([9],320);f.at(1330);f.stop();await dispose;
 assert.equal(f.row.lifecycle.finalization.passed,true);assert.equal(f.row.lifecycle.finalization.lastDataAvailableBeforeStop.timecodeMs,320);
});

test('missing native stop explicitly times out and a later real stop never upgrades the failed finalization',async()=>{
 const f=fixture();f.data([1],0);const dispose=f.p.dispose();await f.flush();f.expire();await dispose;
 const result=plain(f.row.lifecycle.finalization);assert.equal(result.passed,false);assert.equal(result.status,'timeout');
 assert.equal(result.nativeStopObserved,false);assert.equal(f.p.observerErrors.length,1);assert.match(f.p.observerErrors[0].message,/5000ms/);
 f.at(6200);f.data([2],5200);f.stop();await f.p.dispose();
 assert.deepEqual(plain(f.row.lifecycle.finalization),result);assert.equal(f.recorder.stopCalls,1);
 assert.equal(f.row.lifecycle.events.at(-1).kind,'stop','Keep the genuine late event without rewriting the failed result');
});

test('a native stop request throw is an explicit failed recording, never a successful stop',async()=>{
 const f=fixture({stopError:'native stop failed'});f.data([1],0);await f.p.dispose();
 assert.equal(f.row.lifecycle.finalization.passed,false);assert.equal(f.row.lifecycle.finalization.status,'stop-request-error');
 assert.equal(f.row.lifecycle.finalization.nativeStopObserved,false);assert.equal(f.row.error,'native stop failed');assert.equal(f.timers.size,0);
 assert.equal(f.p.observerErrors.length,1);
});

test('native recorder error remains a failure even when final data and real stop arrive',async()=>{
 const f=fixture();f.data([1],0);f.error('encoder failed');const dispose=f.p.dispose();await f.flush();f.data([2],100);f.stop();await dispose;
 assert.equal(f.row.lifecycle.finalization.nativeStopObserved,true);assert.equal(f.row.lifecycle.finalization.passed,false);
 assert.equal(f.row.lifecycle.finalization.error,'encoder failed');assert(f.row.lifecycle.events.some(e=>e.kind==='error'&&e.message==='encoder failed'));
});

test('stop without actual start/data events cannot masquerade as completed recording evidence',async()=>{
 const f=fixture({emitStart:false});f.recorder.state='inactive';f.stop();await f.p.dispose();
 assert.equal(f.row.lifecycle.finalization.status,'native-stop');assert.equal(f.row.lifecycle.finalization.nativeStopObserved,true);
 assert.equal(f.row.lifecycle.finalization.nativeStartObserved,false);assert.equal(f.row.lifecycle.finalization.orderedNativeData,false);
 assert.equal(f.row.lifecycle.finalization.passed,false);assert.match(f.p.observerErrors[0].message,/sequence incomplete/);
});

test('data preceding native start is retained as raw evidence but rejects the observed event ordering',async()=>{
 const f=fixture({emitStart:false});f.data([1],0);f.at(1100);f.start();f.stop();await f.p.dispose();
 assert.equal(f.row.chunks.length,1);assert.equal(f.row.lifecycle.finalization.orderedNativeData,false);assert.equal(f.row.lifecycle.finalization.passed,false);
});

for(const file of ['native-smoke.mjs','call-lifecycle-smoke.mjs'])test(file+' executes actual export, finalization gate and decoded metadata without changing the nominal PCM anchor',async()=>{
 const f=fixture();f.data([1,2],0);const dispose=f.p.dispose();await f.flush();f.at(1200);f.data([3,4],200);f.stop();await dispose;
 const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
 const expression=source.match(/const (?:audio|recordings)=await evaluate\(`(.*?)`\)/s)?.[1];assert(expression);
 const rows=await vm.runInContext(expression,f.context);assert.equal(rows.length,1);
 assert.equal(rows[0].recorderLifecycle.finalization.passed,true);assert.equal(rows[0].startedAt,1000);
 assert.deepEqual(Buffer.from(rows[0].base64,'base64'),Buffer.from([1,2,3,4]));
 const saves=[],checks=[];const context=vm.createContext({audio:rows,recordings:rows,owners:new Map([[0,{}]]),callOwners:new Map([[0,{}]]),
  save:(name,value)=>saves.push({name,value}),check:(name,passed,value)=>checks.push({name,passed,value})});
 const gate=source.slice(source.indexOf('  const recordingMetadata='),source.indexOf('  const decoded=',source.indexOf('  const recordingMetadata=')));
 assert(gate);vm.runInContext(gate,context);assert.equal(checks[0].passed,true);
 assert.equal(saves[0].name,'native-recordings-metadata.json');assert.equal(saves[0].value.nominalPCMMappingUnchanged,true);
 assert.equal(saves[0].value.recordings[0].base64,undefined);assert.equal(saves[0].value.recordings[0].recorderLifecycle.finalization.nativeStopObserved,true);
 const push=source.match(/decoded\.push\((\{pcIndex:(?:recording|row)\.pcIndex,[^\n]+?)\);/)?.[0];assert(push);
 const decoded=[],ff={status:0,stdout:Buffer.from([1,0,2,0])};
 vm.runInContext(push,vm.createContext({decoded,recording:rows[0],row:rows[0],ff,rms:1,peak:2,hash:v=>createHash('sha256').update(v).digest('hex')}));
 assert.equal(decoded[0].startedAt,1000);assert.equal(decoded[0].recorderLifecycle.finalization.passed,true);
 assert.equal(decoded[0].pcmBytes,4);assert.equal(decoded[0].durationSeconds,4/96000);
 const failed=fixture();failed.data([7],0);const pending=failed.p.dispose();await failed.flush();failed.expire();await pending;
 const failedRows=await vm.runInContext(expression,failed.context);const failures=[];
 vm.runInContext(gate,vm.createContext({audio:failedRows,recordings:failedRows,owners:new Map([[0,{}]]),callOwners:new Map([[0,{}]]),save(){},check:(name,passed)=>failures.push({name,passed})}));
 assert.equal(failures[0].passed,false,'Decodable original bytes cannot hide missing native finalization');
 assert.deepEqual(Buffer.from(failedRows[0].base64,'base64'),Buffer.from([7]));
});
