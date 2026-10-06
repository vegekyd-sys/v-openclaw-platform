// Lives in the Worker that owns the native process registry. Never accepts a
// browser PID, a foreign run, or a caller-supplied process session ID.
export function createVoiceProcessOwner({runId,sessionKey,loadProcessTool,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=20,nativeRegistryRemote=false,recoverRegistry=true,joinExecScope,onNativeCall=()=>{}}) {
 const ids=new Set(),pending=new Set(),observedExits=new Map();let cleanup,settled=false,nativeRegistryDrained=false;
 const terminal=r=>r&&!r.isError&&['completed','failed','killed','cancelled'].includes(r.details?.status)&&!(r.details.status==='failed'&&!Number.isInteger(r.details.exitCode)&&!(typeof r.details.exitSignal==='string'&&/^SIG[A-Z0-9]+$/.test(r.details.exitSignal))&&!(Number.isInteger(r.details.exitSignal)&&r.details.exitSignal>0));
 return {observe(e){if(e?.runId!==runId||e.sessionKey&&e.sessionKey!==sessionKey||e.stream!=='tool')return;
  const d=e.data??{},detail=d.result?.details;
  if(d.name==='exec'&&d.phase==='start')pending.add(d.toolCallId);
  if(d.name==='exec'&&d.phase==='result'){pending.delete(d.toolCallId);if(detail?.status==='running'&&detail.sessionId)ids.add(detail.sessionId);}
  if(d.name==='process'&&d.phase==='result'&&detail?.sessionId&&terminal(d.result)){ids.delete(detail.sessionId);observedExits.set(detail.sessionId,{sessionId:detail.sessionId,result:d.result,source:d.result?.__voiceHost?.source??'native-process-tool'});}
  if(d.name==='process'&&d.phase==='result'&&d.result?.__voiceHost?.source==='voice-native-lifecycle'&&d.result.__voiceHost.registryScope===runId&&d.result.__voiceHost.registryFinal===true){
   const rows=detail?.sessions;nativeRegistryDrained=Array.isArray(rows)&&rows.every(row=>terminal({details:row}));
   if(nativeRegistryDrained)for(const row of rows)observedExits.set(row.sessionId,{sessionId:row.sessionId,result:{details:row},source:'native-run-scoped-final-list'});
  }
 },markSettled(){settled=true;},async cancel(){if(cleanup)return cleanup;
  cleanup=(async()=>{for(let n=0;n<attempts&&!settled;n++)await wait(100);if(!settled)throw Error('Voice model execution is still pending');
   // Foreground exec aborts suppress the normal tool result. Recover IDs from
   // the native registry scoped by the trusted run, after no new exec can start.
   if(nativeRegistryRemote){
    if(!nativeRegistryDrained||ids.size)throw Error('Executing native Worker process cleanup is unconfirmed');
    pending.clear();return {runId,sessionKey,processes:[...observedExits.values()],pendingExecs:0,modelSettled:true,registryScope:runId,confirmed:true,source:'executing-native-worker'};
   }
   if(!recoverRegistry&&pending.size)throw Error('Voice exec identity is not settled; session registry cannot identify an unreturned command');
   if(pending.size&&!joinExecScope)throw Error('Foreground native exec scope exit is unconfirmed');
   const tool=await loadProcessTool(),results=[...observedExits.values()];
   const execute=async(args,final=false)=>{const toolCallId='voice-native-cleanup:'+runId+':'+args.action+':'+(args.sessionId??'registry')+(final?':final':'');await onNativeCall({phase:'start',toolCallId,args,registryFinal:final});const result=await tool.execute(toolCallId,args);await onNativeCall({phase:'result',toolCallId,result,registryFinal:final});return result;};
   const listed=await execute({action:'list'});
   if(listed?.isError||!Array.isArray(listed?.details?.sessions))throw Error('Voice run-scoped native registry is unavailable');
   for(const row of listed.details.sessions){
    if(!recoverRegistry&&!ids.has(row.sessionId))continue;
    if(typeof row.sessionId!=='string'||!row.sessionId)throw Error('Voice native registry identity is unavailable');
    if(row.status==='running')ids.add(row.sessionId);
    else if(!terminal({details:row}))throw Error('Voice native registry exit is unconfirmed: '+row.sessionId);
    else if(!ids.has(row.sessionId))results.push({sessionId:row.sessionId,result:{details:row},source:'native-run-scoped-list'});
   }
   for(const sessionId of ids){await execute({action:'kill',sessionId});let result;
    for(let n=0;n<attempts;n++){result=await execute({action:'poll',sessionId,timeout:500});if(terminal(result))break;await wait(100);}
    if(!terminal(result))throw Error('Voice owned process exit is unconfirmed: '+sessionId);
    ids.delete(sessionId);results.push({sessionId,result});
   }
   // Native list deliberately hides foreground commands. Join their real close
   // lifecycle only after killing listed background jobs, so neither an empty
   // list nor a still-running background command can falsely acknowledge exit.
   if(joinExecScope)await joinExecScope(runId);
   const finalList=await execute({action:'list'},true);if(finalList?.isError||!Array.isArray(finalList?.details?.sessions))throw Error('Native registry did not drain');
   const finalRows=recoverRegistry?finalList.details.sessions:finalList.details.sessions.filter(row=>results.some(item=>item.sessionId===row.sessionId));
   if(!finalRows.every(row=>terminal({details:row})))throw Error('Native registry did not drain');
   pending.clear();return {runId,sessionKey,processes:results,pendingExecs:0,modelSettled:true,registryScope:runId,nativeExecScopeJoined:Boolean(joinExecScope),confirmed:true};
  })().catch(e=>{cleanup=null;throw e;});return cleanup;
 },snapshot:()=>({processes:[...ids],pending:[...pending],settled,cleaning:Boolean(cleanup)})};
}
