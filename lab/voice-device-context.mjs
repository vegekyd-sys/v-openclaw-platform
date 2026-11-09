// Gateway-owned metadata bridge for the existing GPT consult runner.
// It never grants tools, chooses an actor, fetches an endpoint or executes a device.
const states=new Set(['available','prompt','denied','unavailable','requires_foreground']);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=160;
function normalize(terminal,bridge,voiceSessionId){
 if(!terminal||terminal.version!==1||terminal.voiceSessionId!==voiceSessionId||terminal.device?.owner!==voiceSessionId||!['ios','web','robot','speaker'].includes(terminal.terminal?.kind)||Object.keys(terminal).some(k=>!['version','voiceSessionId','terminal','actor','session','device','capabilities'].includes(k)))throw Error('Invalid current terminal');
 const capabilities={};if(!terminal.capabilities||Object.keys(terminal.capabilities).length>24)throw Error('Invalid capabilities');
 for(const [operation,value] of Object.entries(terminal.capabilities)){
  if(!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(operation)||!states.has(value?.status)||Object.keys(value).some(k=>k!=='status'))throw Error('Invalid capability');
  capabilities[operation]={status:value.status};
 }
 if(!bridge||bridge.version!==1||bridge.voiceSessionId!==voiceSessionId||!/^[A-Za-z0-9_-]{43}$/.test(bridge.lease)||typeof bridge.cli!=='string'||!bridge.cli.startsWith('/')||!bridge.cli.endsWith('/scripts/device-call.mjs')||typeof bridge.skill!=='string'||!bridge.skill.startsWith('/')||!bridge.skill.endsWith('/skills/device-use/SKILL.md')||typeof bridge.node!=='string'||!(bridge.node==='node'||bridge.node.startsWith('/'))||!/^[a-f0-9]{64}$/.test(bridge.bundleSha256)||Object.keys(bridge).some(k=>!['version','voiceSessionId','lease','endpoint','cli','skill','node','bundleSha256'].includes(k)))throw Error('Invalid current device bridge');
 const endpoint=new URL(bridge.endpoint);
 if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!endpoint.pathname.endsWith('/internal/device-request')||!(endpoint.protocol==='https:'||endpoint.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)))throw Error('Invalid device endpoint');
 const snapshot={version:1,voiceSessionId,terminal:{kind:terminal.terminal.kind},actor:{verified:terminal.actor?.verified===true,...(terminal.actor?.displayName?{displayName:String(terminal.actor.displayName).slice(0,128)}:{})},session:{scope:terminal.session?.scope==='guest'?'guest':'bound',permissions:'existing_session_only'},device:{scope:'current_call',owner:voiceSessionId},capabilities};
 if(snapshot.session.scope==='guest'||snapshot.actor.verified!==true)throw Error('Device bridge requires current verified account');
 const descriptor={version:1,voiceSessionId,lease:bridge.lease,endpoint:endpoint.href,cli:bridge.cli,skill:bridge.skill,node:bridge.node,bundleSha256:bridge.bundleSha256};
 if(JSON.stringify({snapshot,descriptor}).length>8192)throw Error('Device context too large');
 return {snapshot,descriptor};
}
export function registerRealtimeVoiceDeviceContext(api,{reservations,now=Date.now}={}){
 const active=new Map();
 const retire=secret=>{const row=active.get(secret);if(row)row.closed=true;active.delete(secret);};
 api.registerGatewayMethod('voice.product.device-context',({params,client,respond})=>{
  try{
   if(!params||Object.keys(params).some(k=>!['clientSecret','voiceSessionId','revision','terminal','bridge','mode'].includes(k)))throw Error();
   const row=active.get(params.clientSecret),reservation=reservations.get(params.clientSecret);
   if(!row||row.closed||!reservation||row.owner!==client?.connId||reservation.ownerConnId!==client?.connId||row.voiceSessionId!==params.voiceSessionId||now()>row.deadline)throw Error();
   if(params.mode==='check'){respond(true,{accepted:true,voiceSessionId:row.voiceSessionId,revision:row.revision});return;}
   if(params.mode==='close'){retire(params.clientSecret);respond(true,{accepted:true,closed:true});return;}
   if(params.mode!==undefined&&params.mode!=='bind'||!Number.isSafeInteger(params.revision)||params.revision<=row.revision)throw Error();
   const next=normalize(params.terminal,params.bridge,row.voiceSessionId);
   if(row.context&&(JSON.stringify(row.context.descriptor)!==JSON.stringify(next.descriptor)||Object.keys(next.snapshot.capabilities).some(op=>!Object.hasOwn(row.context.snapshot.capabilities,op))))throw Error();
   row.context=next;row.revision=params.revision;
   respond(true,{accepted:true,voiceSessionId:row.voiceSessionId,revision:row.revision});
  }catch{respond(false,undefined,{code:'INVALID_REQUEST',message:'Device context requires its live authenticated call owner'});}
 },{scope:'operator.write'});
 return {
  retire,
  create(request){
   if(!id(request.voiceSessionId)||!id(request.ownerConnId)||typeof request.runAgentConsult!=='function')return null;
   let secret,closed=false;const row={voiceSessionId:request.voiceSessionId,owner:request.ownerConnId,revision:0,deadline:now()+2*60*60*1000,closed:false};
   return {
    activate(value){if(closed||active.size>=64||!reservations.has(value))throw Error('Device context activation unavailable');secret=value;active.set(value,row);},
    close(){closed=true;row.closed=true;if(secret)retire(secret);},
    wrapConsult(run){return params=>{
     if(row.closed)throw Error('Device call has closed');
     const context=row.context;
     if(!context)return run(params);
     if(now()>row.deadline)throw Error('Device call expired');
     const prompt=params.prompt+'\n\n当前通话设备状态（服务端绑定数据，不授予新的工具或账号权限）：'+JSON.stringify(context.snapshot)+'\n当前设备执行通道（仅本任务使用，不要输出或写长期记忆）：'+JSON.stringify(context.descriptor)+'\n需要当前位置时，先读 descriptor.skill 指定的 device-use Skill，再用 descriptor.cli；已经附有新鲜设备位置就使用同一份，不猜测或用历史/IP代替。拒绝不能绕过；设备点不是上车点；不要直接下单。';
     return run({...params,prompt});
    };},
   };
  },
 };
}
