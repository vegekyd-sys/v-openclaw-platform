// Exact anchors patch the current runtime, preserving unrelated Worker changes.
export function patchVoiceWorker(source) {
 if(source.includes('// voice-worker-process-owner-v3'))return source;
 if(/voice-worker-process-owner-v[12]/.test(source))throw Error('Previous voice Worker patch must be rebased from its unpatched source');
 const once=(needle,value)=>{if(source.split(needle).length!==2)throw Error('Worker process owner anchor changed: '+needle);source=source.replace(needle,value);};
 once('const activeControllers = new Map();',`// voice-worker-process-owner-v3
const activeControllers = new Map();
const voiceProcessOwners = new Map();`);
 source=`import {createVoiceProcessOwner} from './voice-process-owner.mjs';\n`+source;
 once('  let unsubscribeAgentEvents = () => {};',`  const voiceOwner = /^voice-[a-f0-9-]{36}-[a-f0-9-]{36}$/.test(message.runId ?? '') ? createVoiceProcessOwner({
    runId:message.runId,sessionKey:message.sessionKey,
    loadProcessTool:async()=>{const m=await import(new URL('../bash-tools-DiAfkLAC.js',pathToFileURL(configuredAgentRuntimePath())).href);if(typeof m.t!=='function')throw Error('Native process tool unavailable');return m.t({scopeKey:message.runId});}
  }) : null;
  if(voiceOwner)voiceProcessOwners.set(message.runId,{owner:voiceOwner,requestId:message.id,sessionKey:message.sessionKey});
  let unsubscribeAgentEvents = () => {};`);
 once('      if (event?.runId !== message.runId) {','      voiceOwner?.observe(event);\n      if (event?.runId !== message.runId) {');
 // Control starts while this exact request is active. It aborts the model before
 // reaping the same Worker's native exec IDs, and returns actual terminal polls.
 once('  if (message?.type === "cancel" && message.requestId) {',`  if(message?.type==='voice-process-cancel'&&message.requestId&&message.controlId){
    const active=activeControllers.get(message.requestId),binding=voiceProcessOwners.get(message.runId),owner=binding?.owner;
    try{
      if(!owner||binding.requestId!==message.requestId||binding.sessionKey!==message.sessionKey||active&&(active.request.runId!==message.runId||active.request.sessionKey!==message.sessionKey))throw Error('Voice Worker ownership changed');
      if(!active&&!owner.snapshot().settled)throw Error('Voice Worker model exit is unconfirmed');
      active?.controller.abort(Object.assign(new Error('Voice task cancelled'),{name:'AbortError'}));
      const result=await owner.cancel();voiceProcessOwners.delete(message.runId);
      process.send?.({type:'voice-process-cancel-ack',controlId:message.controlId,requestId:message.requestId,ok:true,result});
    }catch(error){process.send?.({type:'voice-process-cancel-ack',controlId:message.controlId,requestId:message.requestId,ok:false,error:serializeError(error)});}
    return;
  }
  if (message?.type === "cancel" && message.requestId) {`);
 // Keep failed/live ownership; retire only already empty completed owners.
 once('    unsubscribeAgentEvents();','    voiceOwner?.markSettled();\n    unsubscribeAgentEvents();\n    if(voiceOwner&&!voiceOwner.snapshot().cleaning&&voiceOwner.snapshot().processes.length===0&&voiceOwner.snapshot().pending.length===0)voiceProcessOwners.delete(message.runId);');
 return source;
}
export function patchVoicePool(source){
 if(source.includes('// voice-worker-process-control-v3'))return source;
 if(/voice-worker-process-control-v[12]/.test(source))throw Error('Previous voice pool patch must be rebased from its unpatched source');
 const needle='  async applyPermission(requestId, mode) {';if(source.split(needle).length!==2)throw Error('Pool control anchor changed');
 source=source.replace(needle,`  // voice-worker-process-control-v3
  async cancelVoiceProcesses(runId,sessionKey){
    for(const worker of this.workers.values())for(const active of [...worker.active.values(),...(worker.voiceProcessRuns?.values()??[])]){
      if(active.request?.runId!==runId||active.sessionKey!==sessionKey)continue;
      const controlId='voice-process-'+this.nextControlId++;
      return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pendingControls.delete(controlId);reject(Error('Voice process cleanup acknowledgement timed out'));},15000);timer.unref?.();
        this.pendingControls.set(controlId,{worker,active,requestId:active.id,runId,sessionKey,timer,resolve,reject});
        worker.child.send({type:'voice-process-cancel',controlId,requestId:active.id,runId,sessionKey});
      });
    }
    throw Error('Exact voice Worker run is no longer active; process exit remains unconfirmed');
  }
${needle}`);
 const ack='  onMessage(worker, message) {';if(source.split(ack).length!==2)throw Error('Pool acknowledgement anchor changed');
 source=source.replace('  rejectPendingSteers(requestId, error) {','  rejectPendingSteers(requestId, error, preserveVoiceProcessControls=false) {');
 source=source.replace('      if (pending.requestId !== requestId) continue;','      if (pending.requestId !== requestId || preserveVoiceProcessControls && pending.runId) continue;');
 const completed='new Error(`worker request ${message.id} completed before Steer acknowledgement`),';
 if(source.split(completed).length!==2)throw Error('Worker completion control anchor changed');
 source=source.replace(completed,completed+'\n      true,');
 const retired='    worker.active.delete(message.id);';
 if(source.split(retired).length!==2)throw Error('Worker retirement anchor changed');
 source=source.replace(retired,`    if(/^voice-[a-f0-9-]{36}-[a-f0-9-]{36}$/.test(active.request?.runId??'')){
      worker.voiceProcessRuns??=new Map();worker.voiceProcessRuns.set(active.request.runId,active);
    }
${retired}`);
 return source.replace(ack,`${ack}
    if(message?.type==='voice-process-cancel-ack'){
      const p=this.pendingControls.get(message.controlId);if(!p||p.worker!==worker||p.requestId!==message.requestId||!p.runId)return;
      clearTimeout(p.timer);this.pendingControls.delete(message.controlId);
      if(!message.ok||message.result?.runId!==p.runId||message.result?.sessionKey!==p.sessionKey||message.result?.confirmed!==true)p.reject(Error(message.error?.message??'Voice process cleanup identity mismatch'));
      else {p.worker.voiceProcessRuns?.delete(p.runId);p.resolve(message.result);}return;
    }`);
}
// Scope native exec and process registries to the trusted voice run rather than
// the shared personal session. Normal Feishu/non-voice execution is unchanged.
export function patchNativeVoiceProcessScope(source){
 if(source.includes('// voice-native-process-scope-v1'))return source;
 const needle='\t\t\tscopeKey: params.sessionKey,\n\t\t\tsessionKey: params.sessionKey,\n\t\t\trunId: params.runId,';
 if(source.split(needle).length!==2)throw Error('Native voice exec scope anchor changed');
 source=source.replace(needle,'\t\t\t// voice-native-process-scope-v1\n\t\t\tscopeKey: /^voice-[a-f0-9-]{36}-[a-f0-9-]{36}$/.test(params.runId ?? "") ? params.runId : params.sessionKey,\n\t\t\tsessionKey: params.sessionKey,\n\t\t\trunId: params.runId,');
 const process='processDefaults: { scopeKey: params.sessionKey }';if(source.split(process).length!==2)throw Error('Native voice process scope anchor changed');
 return source.replace(process,'processDefaults: { scopeKey: /^voice-[a-f0-9-]{36}-[a-f0-9-]{36}$/.test(params.runId ?? "") ? params.runId : params.sessionKey }');
}
export function patchVoiceIndex(source){
 if(source.includes('// voice-worker-process-rpc-v1'))return source;
 const needle='    api.registerGatewayMethod(\n      "vlab.workers.native.cancel",';if(source.split(needle).length!==2)throw Error('Worker RPC anchor changed');
 return source.replace(needle,`    // voice-worker-process-rpc-v1
    api.registerGatewayMethod('vlab.workers.voice.cancelProcesses',async({params,respond})=>{
      try{const runId=readString(params,'runId',{required:true}),sessionKey=readString(params,'sessionKey',{required:true});
        if(!/^voice-[a-f0-9-]{36}-[a-f0-9-]{36}$/.test(runId))throw Error('Not a server-owned voice run');
        respond(true,await pool.cancelVoiceProcesses(runId,sessionKey));
      }catch(error){respondError(respond,error);}
    },{scope:'operator.write'});
${needle}`);
}
