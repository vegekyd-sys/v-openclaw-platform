// Additive observation only: original H5 owns microphone, playback, RTC and controls.
export const BROWSER_PROBE = String.raw`(()=>{
 const p=globalThis.__candidateLiveProbe={events:[],tools:[],api:[],ui:[],audioFrames:[],micFrames:[],pcs:[],pcTransitions:[],streams:[],recordings:[],resources:[],playRejections:[],micDiagnostics:[],observerStops:[],observerErrors:[]};
 const observe=(owned,source)=>{try{owned.sample?.(source)}catch(error){p.observerErrors.push({at:Date.now(),pcIndex:owned.pcIndex,kind:owned.kind,source,message:String(error.message)});}};
 const sampleBoundary=(pcIndex,source)=>{for(const owned of p.resources)if(owned.pcIndex===pcIndex&&!owned.stopped)observe(owned,source);};
 const stopObservation=(owned,source)=>{if(owned.stopped)return;observe(owned,source);clearInterval(owned.timer);owned.stopped=true;
  p.observerStops.push({at:Date.now(),pcIndex:owned.pcIndex,kind:owned.kind,trackId:owned.track?.id??null,source});};
 const capture=(raw,pcIndex)=>{
  const turn=raw.turn??{},item=raw.item??{};
  p.events.push({at:Date.now(),pcIndex,type:raw.type,turnId:raw.turn_id??turn.id??null,role:turn.role??null,
   text:turn.transcript??item.text??raw.text??(typeof raw.delta==='string'?raw.delta:''),startMs:raw.start_ms??turn.start_ms??null,endMs:raw.end_ms??turn.end_ms??null,raw});
  // Observe the genuine wire terminal in the same task, before the original
  // H5 handles it. A timer phase must not discard the first quiet boundary.
  if(raw.type==='turn.done'&&turn.role==='assistant')sampleBoundary(pcIndex,'native-assistant-terminal');
 };
 const NativeRTC=globalThis.RTCPeerConnection;
 globalThis.RTCPeerConnection=class extends NativeRTC {
  constructor(...args){super(...args);p.pcs.push(this);const pcIndex=p.pcs.length-1;this.addEventListener('connectionstatechange',()=>p.pcTransitions.push({at:Date.now(),pcIndex,state:this.connectionState}));
   this.addEventListener('track',event=>{
    const stream=new MediaStream([event.track]),context=new AudioContext(),source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();
    analyser.fftSize=2048;source.connect(analyser);void context.resume();
    const chunks=[],recorder=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus'}),recording={pcIndex,recorder,chunks,startedAt:Date.now(),track:event.track};p.recordings.push(recording);
    recorder.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data)});recorder.addEventListener('error',event=>{recording.error=event.error?.message??'recorder error'});recorder.start(500);
    const samples=new Float32Array(analyser.fftSize),owned={context,timer:null,pcIndex,kind:'receiver',track:event.track};let lastStatsAt=0;p.resources.push(owned);
    owned.sample=(sampleSource='interval')=>{
     analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length),audio=document.getElementById('remoteAudio');
     const row={at:Date.now(),pcIndex,rms,sampleSource,muted:audio?.muted,paused:audio?.paused,volume:audio?.volume,
       contextState:context.state,trackState:event.track.readyState,trackMuted:event.track.muted,currentTime:audio?.currentTime,
       connected:this.connectionState,receiverTrackId:event.track.id,
       playbackTrackIds:audio?.srcObject?.getAudioTracks().map(track=>track.id)??[],
       receiverAttachedToPlayback:Boolean(audio?.srcObject?.getAudioTracks().some(track=>track.id===event.track.id))};
     row.digitalAudible=row.receiverAttachedToPlayback&&rms>.005&&audio?.muted===false&&audio?.paused===false&&audio.volume>0&&context.state==='running'&&event.track.readyState==='live';
     // Append synchronously so an in-flight getStats cannot hide the last
     // live player state. The asynchronous real stats retain their own clock.
     p.audioFrames.push(row);
     if(sampleSource!=='interval'||row.at-lastStatsAt>=200){lastStatsAt=row.at;row.statsRequestedAt=Date.now();
      void this.getStats().then(stats=>{row.statsObservedAt=Date.now();row.rtp=[...stats.values()].filter(s=>s.type==='inbound-rtp'&&s.kind==='audio').map(s=>({id:s.id,timestamp:s.timestamp,packetsReceived:s.packetsReceived,bytesReceived:s.bytesReceived,totalSamplesReceived:s.totalSamplesReceived,totalAudioEnergy:s.totalAudioEnergy,audioLevel:s.audioLevel,jitterBufferDelay:s.jitterBufferDelay,jitterBufferEmittedCount:s.jitterBufferEmittedCount}));},error=>{row.statsObservedAt=Date.now();row.statsError=String(error.message)});
     }
    };
    owned.timer=setInterval(()=>observe(owned,'interval'),50);
   });
  }
  createDataChannel(...args){const channel=super.createDataChannel(...args),pcIndex=p.pcs.indexOf(this);channel.addEventListener('message',event=>{try{capture(JSON.parse(String(event.data)),pcIndex)}catch{}});return channel;}
  close(...args){const pcIndex=p.pcs.indexOf(this);
   // This is observation immediately before the real release, with no wait,
   // no model/app drain substitution and no change to original close timing.
   for(const owned of p.resources)if(owned.pcIndex===pcIndex&&owned.kind==='receiver')stopObservation(owned,'original-pc-close-before-release');
   return super.close(...args);
  }
 };
 const nativeMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=async(...args)=>{
  const stream=await nativeMedia(...args);p.streams.push(stream);const track=stream.getAudioTracks()[0],pcIndex=p.pcs.length-1;
  p.micDiagnostics.push({at:Date.now(),pcIndex,requested:args[0],settings:track.getSettings(),trackId:track.id});
  const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(stream).connect(analyser);void context.resume();
  const samples=new Float32Array(1024),owned={context,timer:null,pcIndex,kind:'microphone',track};p.resources.push(owned);
  owned.sample=(sampleSource='interval')=>{analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);
   const pc=p.pcs[pcIndex],sender=pc?.getSenders().find(s=>s.track?.kind==='audio');
   p.micFrames.push({at:Date.now(),pcIndex,rms,sampleSource,trackId:track.id,trackState:track.readyState,trackEnabled:track.enabled,senderTrackId:sender?.track?.id??null});
  };owned.timer=setInterval(()=>observe(owned,'interval'),50);return stream;
 };
 const nativeTrackStop=MediaStreamTrack.prototype.stop;
 MediaStreamTrack.prototype.stop=function(...args){for(const owned of p.resources)if(owned.kind==='microphone'&&owned.track===this)stopObservation(owned,'original-microphone-stop-before-release');return nativeTrackStop.apply(this,args);};
 const nativePlay=HTMLMediaElement.prototype.play;
 HTMLMediaElement.prototype.play=function(...args){const result=nativePlay.apply(this,args);if(this.id==='remoteAudio')result?.catch(error=>p.playRejections.push({at:Date.now(),name:error.name,message:error.message}));return result};
 const nativeFetch=globalThis.fetch.bind(globalThis);
 const NativeEvents=globalThis.EventSource;
 globalThis.EventSource=class extends NativeEvents {constructor(...args){super(...args);this.addEventListener('message',event=>{try{p.tools.push({at:Date.now(),raw:JSON.parse(event.data)})}catch{}});}};
 globalThis.fetch=async(...args)=>{const requestedAt=Date.now(),response=await nativeFetch(...args),url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);
  if(url.origin===location.origin&&url.pathname.startsWith('/api/')){const row={at:Date.now(),requestedAt,route:url.pathname,status:response.status};p.api.push(row);
   if(url.pathname==='/api/session')void response.clone().json().then(data=>{row.model=data.model;row.voiceSessionId=data.voiceSessionId});
   if(['/api/steer','/api/close'].includes(url.pathname))try{row.request=JSON.parse(args[1]?.body??'{}')}catch{}
   if(url.pathname==='/api/steer')void response.clone().json().then(data=>{row.responseBody=data;row.responseObservedAt=Date.now()}).catch(error=>{row.responseReadError=error.message});
  }return response;
 };
 document.addEventListener('DOMContentLoaded',()=>{
  let previous='';const snapshot=()=>{const row={at:Date.now(),badge:document.getElementById('badge')?.textContent,status:document.getElementById('status')?.textContent,
   conversation:document.getElementById('conversation')?.innerText,taskStatus:document.getElementById('taskStatus')?.textContent,callState:document.body.dataset.callState};
   const key=JSON.stringify({...row,at:0});if(key!==previous){previous=key;p.ui.push(row);}
  };new MutationObserver(snapshot).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});snapshot();
 },{once:true});
 p.dispose=async()=>{for(const owned of p.resources){clearInterval(owned.timer);await owned.context.close().catch(()=>{});owned.closed=true;}for(const row of p.recordings){if(row.recorder.state!=='inactive')await new Promise(resolve=>{row.recorder.addEventListener('stop',resolve,{once:true});row.recorder.stop()});}};
})()`;

export const SNAPSHOT_EXPRESSION = `(()=>{const p=globalThis.__candidateLiveProbe,a=document.getElementById('remoteAudio');return p?{events:p.events,tools:p.tools,api:p.api,ui:p.ui,audioFrames:p.audioFrames,micFrames:p.micFrames,playRejections:p.playRejections,micDiagnostics:p.micDiagnostics,pcTransitions:p.pcTransitions,pcStates:p.pcs.map(pc=>pc.connectionState),senderTracks:p.pcs.map(pc=>pc.getSenders().filter(s=>s.track?.kind==='audio').map(s=>({id:s.track.id,state:s.track.readyState,enabled:s.track.enabled}))),remoteAudio:{muted:a?.muted,paused:a?.paused,volume:a?.volume,attached:Boolean(a?.srcObject)},badge:document.getElementById('badge')?.textContent,callState:document.body?.dataset?.callState,duplex:globalThis.__gptLiveDuplexDiagnostics??null}:null})()`;

// A full CDP return-by-value of several MB blocks the page's main thread and
// creates observer-induced microphone gaps. Freeze prefix counts in a small
// header, then retrieve every raw row in bounded pages without losing data.
export const SNAPSHOT_ARRAY_FIELDS = ['events','tools','api','ui','audioFrames','micFrames','playRejections','micDiagnostics','pcTransitions','observerStops','observerErrors'];
export const SNAPSHOT_PAGED_HEADER_EXPRESSION = `(()=>{const p=globalThis.__candidateLiveProbe,a=document.getElementById('remoteAudio'),d=globalThis.__gptLiveDuplexDiagnostics??null;if(!p)return null;
 const snapshotStartedAt=Date.now();
 // Duplex diagnostics are rolling rings. Counts alone cannot freeze their
 // indices, so retain the original row references before any paged reads.
 const frozen=p.frozenDuplexSnapshot={generation:(p.frozenDuplexSnapshot?.generation??0)+1,observedAt:snapshotStartedAt,probeTimeOrigin:performance.timeOrigin,events:d?.events?.slice()??[],transitions:d?.transitions?.slice()??[]};
 return {snapshotStartedAt,snapshotObservedAt:snapshotStartedAt,probeTimeOrigin:performance.timeOrigin,arrayCounts:Object.fromEntries(${JSON.stringify(SNAPSHOT_ARRAY_FIELDS)}.map(key=>[key,p[key].length])),duplexArrayCounts:d?{events:frozen.events.length,transitions:frozen.transitions.length}:null,duplexSnapshotGeneration:frozen.generation,pcStates:p.pcs.map(pc=>pc.connectionState),senderTracks:p.pcs.map(pc=>pc.getSenders().filter(s=>s.track?.kind==='audio').map(s=>({id:s.track.id,state:s.track.readyState,enabled:s.track.enabled}))),remoteAudio:{muted:a?.muted,paused:a?.paused,volume:a?.volume,attached:Boolean(a?.srcObject)},badge:document.getElementById('badge')?.textContent,callState:document.body?.dataset?.callState,duplex:d?{...d,events:[],transitions:[]}:null}})()`;

export async function readBoundedProbeSnapshot(evaluate,{pageSize=32,previous=null}={}) {
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>64)throw Error('Bounded probe snapshot page size required');
 const snapshotRequestedAt=Date.now();
 const state=await evaluate(SNAPSHOT_PAGED_HEADER_EXPRESSION);if(!state)return null;
 const samePage=Number.isFinite(state.probeTimeOrigin)&&previous?.probeTimeOrigin===state.probeTimeOrigin;
 if(samePage&&!(state.duplexSnapshotGeneration>previous.duplexSnapshotGeneration))throw Error('Fresh browser snapshot header required');
 const frozenGuard=`const p=globalThis.__candidateLiveProbe,frozen=p?.frozenDuplexSnapshot;if(frozen?.generation!==${state.duplexSnapshotGeneration}||frozen.observedAt!==${state.snapshotObservedAt}||frozen.probeTimeOrigin!==${state.probeTimeOrigin})throw Error('Frozen probe snapshot changed during paged read');`;
 const read=async(expression,count,prior)=>{
  if(!Number.isSafeInteger(count)||count<0||count>1e6)throw Error('Invalid frozen probe snapshot prefix');
  // Polls reuse only this page's append-only prefix. Re-read the bounded last
  // page for asynchronously attached real RTP/API fields. Final full reads
  // pass no previous state and retrieve every original row again.
  const start=samePage&&Array.isArray(prior)&&prior.length<=count?Math.max(0,prior.length-pageSize):0;
  const rows=start?prior.slice(0,start):[];for(let at=start;at<count;at+=pageSize){const to=Math.min(at+pageSize,count),page=await evaluate(`(${expression}).slice(${at},${to})`);
   if(!Array.isArray(page)||page.length!==to-at)throw Error('Original probe snapshot prefix changed during paged read');
   rows.push(...page);
  }return rows;
 };
 for(const field of SNAPSHOT_ARRAY_FIELDS)state[field]=await read(`(()=>{${frozenGuard}return p[${JSON.stringify(field)}];})()`,state.arrayCounts[field],previous?.[field]);
 // Rings must always read the entire header-time copy, never a cached prefix.
 if(state.duplex)for(const field of ['events','transitions'])state.duplex[field]=await read(`(()=>{${frozenGuard}return frozen[${JSON.stringify(field)}];})()`,state.duplexArrayCounts[field]);
 await evaluate(`(()=>{${frozenGuard}return true;})()`);
 // The prefix was observed at the browser header, not when the collector
 // finishes receiving its pages. Keep these clock domains explicit.
 state.snapshotRequestedAt=snapshotRequestedAt;state.snapshotCompletedAt=Date.now();state.snapshotCollectionLatencyMs=state.snapshotCompletedAt-snapshotRequestedAt;state.snapshotCompletedClock='collector-wall';state.snapshotSource='bounded-pages-of-frozen-original-observer-prefix';return state;
}
