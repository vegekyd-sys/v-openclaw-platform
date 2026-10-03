// Additive observation only: original H5 owns microphone, playback, RTC and controls.
export const BROWSER_PROBE = String.raw`(()=>{
 const p=globalThis.__candidateLiveProbe={events:[],tools:[],api:[],ui:[],audioFrames:[],micFrames:[],pcs:[],pcTransitions:[],streams:[],recordings:[],resources:[],playRejections:[],micDiagnostics:[]};
 const capture=(raw,pcIndex)=>{
  const turn=raw.turn??{},item=raw.item??{};
  p.events.push({at:Date.now(),pcIndex,type:raw.type,turnId:raw.turn_id??turn.id??null,role:turn.role??null,
   text:turn.transcript??item.text??raw.text??(typeof raw.delta==='string'?raw.delta:''),startMs:raw.start_ms??turn.start_ms??null,endMs:raw.end_ms??turn.end_ms??null,raw});
 };
 const NativeRTC=globalThis.RTCPeerConnection;
 globalThis.RTCPeerConnection=class extends NativeRTC {
  constructor(...args){super(...args);p.pcs.push(this);const pcIndex=p.pcs.length-1;this.addEventListener('connectionstatechange',()=>p.pcTransitions.push({at:Date.now(),pcIndex,state:this.connectionState}));
   this.addEventListener('track',event=>{
    const stream=new MediaStream([event.track]),context=new AudioContext(),source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();
    analyser.fftSize=2048;source.connect(analyser);void context.resume();
    const chunks=[],recorder=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus'}),recording={pcIndex,recorder,chunks,startedAt:Date.now(),track:event.track};p.recordings.push(recording);
    recorder.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data)});recorder.addEventListener('error',event=>{recording.error=event.error?.message??'recorder error'});recorder.start(500);
    const samples=new Float32Array(analyser.fftSize),owned={context,timer:null,pcIndex};let lastStatsAt=0;p.resources.push(owned);
    owned.timer=setInterval(async()=>{
     analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length),audio=document.getElementById('remoteAudio');
     const row={at:Date.now(),pcIndex,rms,muted:audio?.muted,paused:audio?.paused,volume:audio?.volume,
       contextState:context.state,trackState:event.track.readyState,trackMuted:event.track.muted,currentTime:audio?.currentTime,
       connected:this.connectionState,receiverTrackId:event.track.id,
       playbackTrackIds:audio?.srcObject?.getAudioTracks().map(track=>track.id)??[],
       receiverAttachedToPlayback:Boolean(audio?.srcObject?.getAudioTracks().some(track=>track.id===event.track.id))};
     row.digitalAudible=row.receiverAttachedToPlayback&&rms>.005&&audio?.muted===false&&audio?.paused===false&&audio.volume>0&&context.state==='running'&&event.track.readyState==='live';
     if(row.at-lastStatsAt>=200){lastStatsAt=row.at;const stats=await this.getStats().catch(()=>null);row.rtp=[...(stats?.values()??[])].filter(s=>s.type==='inbound-rtp'&&s.kind==='audio').map(s=>({id:s.id,packetsReceived:s.packetsReceived,bytesReceived:s.bytesReceived,totalSamplesReceived:s.totalSamplesReceived,totalAudioEnergy:s.totalAudioEnergy,audioLevel:s.audioLevel,jitterBufferDelay:s.jitterBufferDelay,jitterBufferEmittedCount:s.jitterBufferEmittedCount}));}
     p.audioFrames.push(row);
    },50);
   });
  }
  createDataChannel(...args){const channel=super.createDataChannel(...args),pcIndex=p.pcs.indexOf(this);channel.addEventListener('message',event=>{try{capture(JSON.parse(String(event.data)),pcIndex)}catch{}});return channel;}
 };
 const nativeMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=async(...args)=>{
  const stream=await nativeMedia(...args);p.streams.push(stream);const track=stream.getAudioTracks()[0],pcIndex=p.pcs.length-1;
  p.micDiagnostics.push({at:Date.now(),pcIndex,requested:args[0],settings:track.getSettings(),trackId:track.id});
  const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(stream).connect(analyser);void context.resume();
  const samples=new Float32Array(1024),owned={context,timer:null,pcIndex};p.resources.push(owned);
  owned.timer=setInterval(()=>{analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);
   const pc=p.pcs[pcIndex],sender=pc?.getSenders().find(s=>s.track?.kind==='audio');
   p.micFrames.push({at:Date.now(),pcIndex,rms,trackId:track.id,trackState:track.readyState,trackEnabled:track.enabled,senderTrackId:sender?.track?.id??null});
  },50);return stream;
 };
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
