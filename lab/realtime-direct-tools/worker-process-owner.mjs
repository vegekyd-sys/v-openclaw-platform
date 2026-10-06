// Lives in the Worker that owns the native process registry. Never accepts a
// browser PID, a foreign run, or a caller-supplied process session ID.
export function createVoiceProcessOwner({runId,sessionKey,loadProcessTool,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=20}) {
 const ids=new Set(),pending=new Set();let cleanup;
 const terminal=r=>r&&!r.isError&&['completed','failed','killed','cancelled'].includes(r.details?.status)&&!(r.details.status==='failed'&&!Number.isInteger(r.details.exitCode)&&!(typeof r.details.exitSignal==='string'&&/^SIG[A-Z0-9]+$/.test(r.details.exitSignal))&&!(Number.isInteger(r.details.exitSignal)&&r.details.exitSignal>0));
 return {observe(e){if(e?.runId!==runId||e.sessionKey&&e.sessionKey!==sessionKey||e.stream!=='tool')return;
  const d=e.data??{},detail=d.result?.details;
  if(d.name==='exec'&&d.phase==='start')pending.add(d.toolCallId);
  if(d.name==='exec'&&d.phase==='result'){pending.delete(d.toolCallId);if(detail?.status==='running'&&detail.sessionId)ids.add(detail.sessionId);}
  if(d.name==='process'&&d.phase==='result'&&terminal(d.result))ids.delete(detail.sessionId);
 },async cancel(){if(cleanup)return cleanup;
  cleanup=(async()=>{for(let n=0;n<attempts&&pending.size;n++)await wait(100);if(pending.size)throw Error('Voice exec result is still pending');
   const tool=await loadProcessTool(),results=[];
   for(const sessionId of ids){await tool.execute('voice-kill-'+sessionId,{action:'kill',sessionId});let result;
    for(let n=0;n<attempts;n++){result=await tool.execute('voice-poll-'+sessionId,{action:'poll',sessionId,timeout:500});if(terminal(result))break;await wait(100);}
    if(!terminal(result))throw Error('Voice owned process exit is unconfirmed: '+sessionId);
    ids.delete(sessionId);results.push({sessionId,result});
   }
   return {runId,sessionKey,processes:results,pendingExecs:0,confirmed:true};
  })().catch(e=>{cleanup=null;throw e;});return cleanup;
 },snapshot:()=>({processes:[...ids],pending:[...pending]})};
}
