// Gateway-owned PCM transport shared by Seeduplex and Grok. No provider key
// or arbitrary tool request is accepted from this browser audio channel.
// Runs inside the audio rendering thread. A consumed sample is never replayed
// during starvation: silence and a short rebuffer replace the old waveform.
export class PcmPlaybackQueue {
  constructor(rate, prefillMs=120, maxFrames=8*1024*1024) {
    this.rate=rate;this.prefill=Math.ceil(rate*prefillMs/1000);this.maxFrames=maxFrames;this.clear();
  }
  clear(){this.chunks=[];this.head=0;this.offset=0;this.frames=0;this.phase=0;this.wait=0;this.playing=false;this.consumed=0;this.underflows=0;this.lastPlayedAt=null;this.complete=false;}
  end(){this.complete=true;}
  push(pcm){this.complete=false;if(!(pcm instanceof Int16Array)||!pcm.length)throw Error('Invalid PCM');if(this.frames+pcm.length>this.maxFrames)throw Error('PCM queue overflow');this.chunks.push(pcm);this.frames+=pcm.length;}
  peek(offset){const c=this.chunks[this.head];const i=this.offset+offset;return i<c.length?c[i]:(this.chunks[this.head+1]?.[i-c.length]??c[c.length-1]);}
  advance(){this.offset++;this.frames--;this.consumed++;if(this.offset===this.chunks[this.head].length){this.chunks[this.head]=null;this.head++;this.offset=0;if(this.head>=32){this.chunks.splice(0,this.head);this.head=0;}}}
  render(out,at){
    out.fill(0);
    if(!this.frames){if(this.playing){if(!this.complete)this.underflows++;this.playing=false;this.wait=0;}return;}
    if(!this.playing){this.wait+=out.length;if(this.frames<Math.ceil(24000*this.prefill/this.rate)&&this.wait<this.prefill)return;this.playing=true;this.wait=0;}
    const step=24000/this.rate;
    for(let i=0;i<out.length;i++){
      if(!this.frames){if(!this.complete)this.underflows++;this.playing=false;this.wait=0;break;}
      const a=this.peek(0),b=this.peek(1);out[i]=(a+(b-a)*this.phase)/32768;this.lastPlayedAt=at+(i+1)/this.rate;
      this.phase+=step;while(this.phase>=1&&this.frames){this.phase-=1;this.advance();}
      if(!this.frames)this.phase=0;
    }
  }
}
export function relayWorkletSource(){return `${PcmPlaybackQueue.toString()}
class Speaker extends AudioWorkletProcessor {
 constructor(){super();this.queue=new PcmPlaybackQueue(sampleRate);this.epoch=0;this.tick=0;
 this.port.onmessage=({data:e})=>{if(e.type==='clear'){this.epoch=e.epoch;this.queue.clear();}
 else if(e.type==='done'&&e.epoch===this.epoch)this.queue.end();
 else if(e.type==='audio'&&e.epoch===this.epoch){try{this.queue.push(new Int16Array(e.buffer));}catch{this.port.postMessage({type:'error',epoch:this.epoch});}}};}
 process(inputs,outputs){const out=outputs[0]?.[0];if(!out)return true;
 const before=this.queue.frames;this.queue.render(out,currentTime);
 if(++this.tick%8===0||before>0&&this.queue.frames===0)this.port.postMessage({type:'playback',epoch:this.epoch,consumed:this.queue.consumed,underflows:this.queue.underflows,lastPlayedAt:this.queue.lastPlayedAt,playing:this.queue.playing});return true;}
}
class Mic extends AudioWorkletProcessor {
 constructor(){super();this.sum=0;this.count=0;this.phase=0;this.frame=new Int16Array(480);this.index=0;}
 process(inputs){const data=inputs[0]?.[0];if(data)for(const value of data){this.sum+=value;this.count++;this.phase+=24000;
 if(this.phase>=sampleRate){this.phase-=sampleRate;const v=Math.max(-1,Math.min(1,this.sum/this.count));this.frame[this.index++]=Math.round(v*(v<0?32768:32767));this.sum=0;this.count=0;
 if(this.index===480){this.port.postMessage(this.frame.buffer,[this.frame.buffer]);this.frame=new Int16Array(480);this.index=0;}}}return true;}
}
registerProcessor('v-direct-speaker',Speaker);registerProcessor('v-direct-mic',Mic);`;}
export function createRelayAudio({context,stream,reservation,onEvent,onError,onClosed,onPlaybackActivity=()=>{}}) {
  const endpoint=new URL('./api/relay',location.href);endpoint.protocol=location.protocol==='https:'?'wss:':'ws:';
  endpoint.search=new URLSearchParams({voiceSessionId:reservation.voiceSessionId,ticket:reservation.relayTicket});
  const socket=new WebSocket(endpoint);socket.binaryType='arraybuffer';
  let closed=false,ready=false,node,speaker,source,quietGain,ending=null,tailTimer,epoch=0,written=0,lastPlayedAt=null,lastSequence=0,blocked=false,outputComplete=false,playbackActive=false;
  const pendingInput=[],pendingOutput=[];let pendingBytes=0;
  const maxQueuedOutputBytes=16*1024*1024;
  const stats={inputBytes:0,outputBytes:0,queuedOutputBytes:0,peakQueuedOutputBytes:0,clears:0,duplicateFrames:0,underflows:0,contextState:context.state,playbackDrained:false};
  const activity=value=>{if(playbackActive!==value){playbackActive=value;onPlaybackActivity(value);}};
  const send=e=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(e));};
  const flush=()=>{epoch++;written=0;pendingOutput.length=0;outputComplete=false;stats.queuedOutputBytes=0;lastPlayedAt=null;speaker?.port.postMessage({type:'clear',epoch});stats.clears++;activity(false);ending=null;clearTimeout(tailTimer);};
  const checkEnd=()=>{if(closed||!ending)return;
    if(context.state==='running'&&lastPlayedAt!==null&&stats.queuedOutputBytes===0&&context.currentTime>=lastPlayedAt+.75){stats.playbackDrained=true;send({type:'playback.drained',callId:ending});ending=null;}
    else tailTimer=setTimeout(checkEnd,100);
  };
  const stateChanged=()=>{if(closed)return;stats.contextState=context.state;
    if(context.state==='running'){if(blocked){blocked=false;onEvent({type:'playback.resumed'});}}
    else if(!blocked){blocked=true;activity(false);onEvent({type:'playback.blocked'});}
  };
  context.addEventListener?.('statechange',stateChanged);
  const transfer=buffer=>speaker.port.postMessage({type:'audio',buffer,epoch},[buffer]);
  const play=e=>{
    // Only a transport identity can establish duplication. Never compare PCM:
    // identical silence and repeated syllables are valid audio.
    if(Number.isSafeInteger(e.sequence)&&e.sequence>0){if(e.sequence<=lastSequence){stats.duplicateFrames++;return;}lastSequence=e.sequence;}
    const bytes=Uint8Array.from(atob(e.audio),c=>c.charCodeAt(0));
    if(!bytes.length||bytes.length%2||bytes.length>480000||e.sampleRate!==24000)throw Error('语音帧格式无效');
    if(stats.queuedOutputBytes+bytes.length>maxQueuedOutputBytes)throw Error('语音缓存过大，请重新拨号');
    outputComplete=false;written+=bytes.length/2;stats.queuedOutputBytes+=bytes.length;stats.peakQueuedOutputBytes=Math.max(stats.peakQueuedOutputBytes,stats.queuedOutputBytes);stats.outputBytes+=bytes.length;stats.playbackDrained=false;
    if(speaker)transfer(bytes.buffer);else pendingOutput.push(bytes.buffer);
    if(context.state!=='running')stateChanged();
  };
  const promise=new Promise((resolve,reject)=>{
    socket.onmessage=e=>{if(closed)return;try{
      const value=JSON.parse(e.data);if(value.voiceSessionId!==reservation.voiceSessionId)return;
      if(value.type==='ready'&&!ready){ready=true;for(const frame of pendingInput)socket.send(frame);pendingInput.length=0;pendingBytes=0;resolve();send({type:'greeting'});}
      if(value.type==='audio')play(value);
      if(value.type==='audio.clear')flush();
      if(value.type==='audio.done'){outputComplete=true;speaker?.port.postMessage({type:'done',epoch});}
      if(value.type==='end.cancelled'){ending=null;clearTimeout(tailTimer);}
      if(value.type==='end.after-playback'){ending=value.callId;checkEnd();}
      if(value.type==='error'){reject(Error(value.message));onError(Error(value.message));}
      onEvent(value);
    }catch(error){reject(error);onError(error);}};
    socket.onerror=()=>{const error=Error('实时语音连接失败');reject(error);onError(error);};
    socket.onclose=()=>{reject(Error('实时语音连接已关闭'));if(!closed)onClosed();};
  });void promise.catch(()=>{});
  async function capture(){
    const url=URL.createObjectURL(new Blob([relayWorkletSource()],{type:'text/javascript'}));
    try{await context.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}
    if(closed)return;
    speaker=new AudioWorkletNode(context,'v-direct-speaker',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
    speaker.port.postMessage({type:'clear',epoch});speaker.connect(context.destination);
    speaker.port.onmessage=({data:e})=>{
      if(closed||e.epoch!==epoch)return;
      if(e.type==='error'){onError(Error('语音缓存过大，请重新拨号'));return;}
      if(e.type!=='playback')return;
      stats.queuedOutputBytes=Math.max(0,written-e.consumed)*2;stats.underflows=e.underflows;lastPlayedAt=e.lastPlayedAt;
      activity(e.playing&&context.state==='running');
    };
    for(const buffer of pendingOutput)transfer(buffer);pendingOutput.length=0;if(outputComplete)speaker.port.postMessage({type:'done',epoch});
    node=new AudioWorkletNode(context,'v-direct-mic');source=context.createMediaStreamSource(stream);
    quietGain=context.createGain();quietGain.gain.value=0;source.connect(node);node.connect(quietGain);quietGain.connect(context.destination);
    node.port.onmessage=e=>{if(closed)return;const frame=e.data;
      if(ready&&socket.readyState===WebSocket.OPEN){if(socket.bufferedAmount>480000){onError(Error('音频上传积压，请重新拨号'));return;}socket.send(frame);stats.inputBytes+=frame.byteLength;}
      else{pendingBytes+=frame.byteLength;if(pendingBytes>384000){onError(Error('模型连接超时，请重新拨号'));return;}pendingInput.push(frame);}
    };
  }
  return {ready:promise,stats,async start(){await capture();await promise;},sendText:text=>send({type:'text',text}),
    dispose(){closed=true;clearTimeout(tailTimer);context.removeEventListener?.('statechange',stateChanged);flush();node?.port.close();node?.disconnect();speaker?.port.close();speaker?.disconnect();source?.disconnect();quietGain?.disconnect();socket.close();}};
}
