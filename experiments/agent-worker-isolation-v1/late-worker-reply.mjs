// Only replies/acks and cancellation use this helper. Request admission still
// fails normally; a closed cancellation channel means the worker is exiting.
export function sendLateWorkerReply(child,message){
  if(!child.connected)return false;
  const report=error=>{
    if(!error)return;
    // Cancellation/exit can race the connected check; the callback consumes
    // Node's async send error rather than emitting an uncaught ChildProcess error.
    if(['ERR_IPC_CHANNEL_CLOSED','EPIPE','ERR_IPC_DISCONNECTED'].includes(error.code))return;
    process.stderr.write('[worker-reply-delivery] '+JSON.stringify({type:message.type,code:error.code??'UNKNOWN'})+'\n');
  };
  try{return child.send(message,report);}catch(error){report(error);return false;}
}

export function patchLateWorkerReplies(source){
  if(source.includes('sendLateWorkerReply'))throw Error('Already patched');
  let count=0;
  const patched=source.replace(/worker\.child\.send\(\{(\s+type: "(?:worker-gateway-event-ack|gateway-tool-response|stream-event-ack)")/g,(_,tail)=>{count++;return 'sendLateWorkerReply(worker.child,{'+tail;});
  if(count!==7)throw Error('Reply anchors drift: '+count);
  return 'import {sendLateWorkerReply} from "./late-worker-reply.mjs";\n'+patched;
}

export function patchLateWorkerCancellations(source){
  if(!source.includes('import {sendLateWorkerReply}'))throw Error('Reply guard prerequisite missing');
  for(const message of ['{ type: "cancel", requestId }','{ type: "cancel", requestId: active.id }']){
    const before='worker.child.send('+message+');';
    if(source.split(before).length!==2)throw Error('Cancellation anchor drift or already patched');
    source=source.replace(before,'sendLateWorkerReply(worker.child,'+message+');');
  }
  return source;
}
