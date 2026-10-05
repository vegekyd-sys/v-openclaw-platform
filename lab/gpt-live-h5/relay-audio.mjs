// Gateway-owned PCM transport shared by Seeduplex and Grok. No provider key
// or arbitrary tool request is accepted from this browser audio channel.
export function createRelayAudio({context,stream,reservation,onEvent,onError,onClosed}) {
  const endpoint=new URL('./api/relay',location.href);
  endpoint.protocol=location.protocol==='https:'?'wss:':'ws:';
  endpoint.search=new URLSearchParams({voiceSessionId:reservation.voiceSessionId,ticket:reservation.relayTicket});
  const socket=new WebSocket(endpoint);socket.binaryType='arraybuffer';
  let closed=false,ready=false,nextAt=0,node,source,quietGain,ending=null,tailTimer;
  const pendingInput=[],players=new Set();let pendingBytes=0;
  const stats={inputBytes:0,outputBytes:0,clears:0,playbackDrained:false};
  const send=e=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(e));};
  const flush=()=>{for(const player of players){try{player.stop();}catch{}}players.clear();nextAt=context.currentTime;stats.clears++;ending=null;clearTimeout(tailTimer);};
  const checkEnd=()=>{
    if(closed||!ending)return;
    if(context.state==='running'&&players.size===0&&context.currentTime>=nextAt+.75){stats.playbackDrained=true;send({type:'playback.drained',callId:ending});ending=null;}
    else tailTimer=setTimeout(checkEnd,100);
  };
  const play=e=>{
    const bytes=Uint8Array.from(atob(e.audio),c=>c.charCodeAt(0));
    if(bytes.length%2||bytes.length>480000||e.sampleRate!==24000)throw Error('语音帧格式无效');
    if(context.state!=='running')throw Error('声音播放被暂停了，请点击页面恢复');
    const data=new DataView(bytes.buffer),buffer=context.createBuffer(1,bytes.length/2,24000),values=buffer.getChannelData(0);
    for(let i=0;i<values.length;i++)values[i]=data.getInt16(i*2,true)/32768;
    if(nextAt-context.currentTime>30)throw Error('语音播放积压，请重新拨号');
    const player=context.createBufferSource();player.buffer=buffer;player.connect(context.destination);
    players.add(player);player.onended=()=>{players.delete(player);player.disconnect();};
    nextAt=Math.max(nextAt,context.currentTime+.01);player.start(nextAt);nextAt+=buffer.duration;
    stats.outputBytes+=bytes.length;
  };
  const promise=new Promise((resolve,reject)=>{
    socket.onmessage=e=>{
      if(closed)return;
      try {
        const value=JSON.parse(e.data);if(value.voiceSessionId!==reservation.voiceSessionId)return;
        if(value.type==='ready'){
          ready=true;for(const frame of pendingInput)socket.send(frame);pendingInput.length=0;pendingBytes=0;
          resolve();send({type:'greeting'});
        }
        if(value.type==='audio')play(value);
        if(value.type==='audio.clear')flush();
        if(value.type==='end.cancelled'){ending=null;clearTimeout(tailTimer);}
        if(value.type==='end.after-playback'){ending=value.callId;checkEnd();}
        if(value.type==='error'){reject(Error(value.message));onError(Error(value.message));}
        onEvent(value);
      }catch(error){reject(error);onError(error);}
    };
    socket.onerror=()=>{const error=Error('实时语音连接失败');reject(error);onError(error);};
    socket.onclose=()=>{reject(Error('实时语音连接已关闭'));if(!closed)onClosed();};
  });
  // The socket can fail while the AudioWorklet module is still loading. Keep
  // the original rejected promise for start(), without an unhandled rejection.
  void promise.catch(()=>{});
  async function capture(){
    const script=`class Mic extends AudioWorkletProcessor {
      constructor(){super();this.sum=0;this.count=0;this.phase=0;this.frame=new Int16Array(480);this.index=0;}
      process(inputs,outputs){const data=inputs[0]?.[0];if(data)for(const value of data){
        this.sum+=value;this.count++;this.phase+=24000;
        if(this.phase>=sampleRate){this.phase-=sampleRate;const v=Math.max(-1,Math.min(1,this.sum/this.count));
          this.frame[this.index++]=Math.round(v*(v<0?32768:32767));this.sum=0;this.count=0;
          if(this.index===480){this.port.postMessage(this.frame.buffer,[this.frame.buffer]);this.frame=new Int16Array(480);this.index=0;}}
      }return true;}}
      registerProcessor('v-direct-mic',Mic);`;
    const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
    try{await context.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}
    if(closed)return;
    node=new AudioWorkletNode(context,'v-direct-mic');source=context.createMediaStreamSource(stream);
    quietGain=context.createGain();quietGain.gain.value=0;source.connect(node);node.connect(quietGain);quietGain.connect(context.destination);
    node.port.onmessage=e=>{
      if(closed)return;const frame=e.data;
      if(ready&&socket.readyState===WebSocket.OPEN){
        if(socket.bufferedAmount>480000){onError(Error('音频上传积压，请重新拨号'));return;}
        socket.send(frame);stats.inputBytes+=frame.byteLength;
      }else {pendingBytes+=frame.byteLength;if(pendingBytes>384000){onError(Error('模型连接超时，请重新拨号'));return;}pendingInput.push(frame);}
    };
  }
  return {ready:promise,stats,async start(){await capture();await promise;},sendText:text=>send({type:'text',text}),
    dispose(){closed=true;clearTimeout(tailTimer);node?.port.close();node?.disconnect();source?.disconnect();quietGain?.disconnect();flush();socket.close();}};
}
