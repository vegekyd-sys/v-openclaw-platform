// Lives in the Worker that owns the native process registry. Never accepts a
// browser PID, a foreign run, or a caller-supplied process session ID.
export function createVoiceProcessOwner({runId,sessionKey,loadProcessTool,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=20}) {
 const ids=new Set(),pending=new Set();let cleanup,settled=false;
 const terminal=r=>r&&!r.isError&&['completed','failed','killed','cancelled'].includes(r.details?.status)&&!(r.details.status==='failed'&&!Number.isInteger(r.details.exitCode)&&!(typeof r.details.exitSignal==='string'&&/^SIG[A-Z0-9]+$/.test(r.details.exitSignal))&&!(Number.isInteger(r.details.exitSignal)&&r.details.exitSignal>0));
 return {observe(e){if(e?.runId!==runId||e.sessionKey&&e.sessionKey!==sessionKey||e.stream!=='tool')return;
  const d=e.data??{},detail=d.result?.details;
  if(d.name==='exec'&&d.phase==='start')pending.add(d.toolCallId);
  if(d.name==='exec'&&d.phase==='result'){pending.delete(d.toolCallId);if(detail?.status==='running'&&detail.sessionId)ids.add(detail.sessionId);}
  if(d.name==='process'&&d.phase==='result'&&terminal(d.result))ids.delete(detail.sessionId);
 },markSettled(){settled=true;},async cancel(){if(cleanup)return cleanup;
  cleanup=(async()=>{for(let n=0;n<attempts&&!settled;n++)await wait(100);if(!settled)throw Error('Voice model execution is still pending');
   // Foreground exec aborts suppress the normal tool result. Recover IDs from
   // the native registry scoped by the trusted run, after no new exec can start.
   const tool=await loadProcessTool(),listed=await tool.execute('voice-list-'+runId,{action:'list'}),results=[];
   if(listed?.isError||!Array.isArray(listed?.details?.sessions))throw Error('Voice run-scoped native registry is unavailable');
   for(const row of listed.details.sessions){
    if(typeof row.sessionId!=='string'||!row.sessionId)throw Error('Voice native registry identity is unavailable');
    if(row.status==='running')ids.add(row.sessionId);
    else if(!terminal({details:row}))throw Error('Voice native registry exit is unconfirmed: '+row.sessionId);
    else if(!ids.has(row.sessionId))results.push({sessionId:row.sessionId,result:{details:row},source:'native-run-scoped-list'});
   }
   for(const sessionId of ids){await tool.execute('voice-kill-'+sessionId,{action:'kill',sessionId});let result;
    for(let n=0;n<attempts;n++){result=await tool.execute('voice-poll-'+sessionId,{action:'poll',sessionId,timeout:500});if(terminal(result))break;await wait(100);}
    if(!terminal(result))throw Error('Voice owned process exit is unconfirmed: '+sessionId);
    ids.delete(sessionId);results.push({sessionId,result});
   }
   pending.clear();return {runId,sessionKey,processes:results,pendingExecs:0,modelSettled:true,registryScope:runId,confirmed:true};
  })().catch(e=>{cleanup=null;throw e;});return cleanup;
 },snapshot:()=>({processes:[...ids],pending:[...pending],settled,cleaning:Boolean(cleanup)})};
}
