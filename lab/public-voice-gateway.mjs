// A transport filter for existing V tools/tasks. No memory store, provider,
// model loop or replacement tool implementation lives here.
export function createPublicVoiceGateway({gateway,sessionKey,agentId='makaron',isAuthorized}) {
 if(!gateway||!/^voice:guest:[a-f0-9]{64}$/u.test(sessionKey)||typeof isAuthorized!=='function')throw Error('Invalid Public binding');
 const target=`agent:${agentId}:voice:public:${sessionKey.slice('voice:guest:'.length)}`;
 const tools=new Set(['web_search','memory_search']),tasks=new Set(),requests=new Set();
 const requestKey=p=>JSON.stringify([p.voiceSessionId,p.callId]);
 const check=()=>{if(isAuthorized()!==true)throw Error('Public binding expired');};
 return Object.freeze({publicVoice:true,get ready(){return gateway.ready;},async request(method,input={},options){
  check();
  if(input.voiceActor!==undefined||input.sessionKey!==undefined&&input.sessionKey!==sessionKey||input.agentId!==undefined&&input.agentId!==agentId)throw Error('Public binding cannot change');
  if(method==='tools.catalog'){
   const catalog=await gateway.request(method,{agentId,includePlugins:true},options);check();
   return {...catalog,groups:(catalog.groups??[]).map(g=>({...g,tools:(g.tools??[]).filter(t=>tools.has(t.id))})).filter(g=>g.tools.length)};
  }
  if(method==='tools.invoke'){
   if(!tools.has(input.name))throw Error('Public tool not enabled');
   const result=await gateway.request(method,{agentId,sessionKey:target,name:input.name,args:input.args},options);check();return result;
  }
  if(method==='voice.product.task.start'){
   requests.add(requestKey(input));
   const result=await gateway.request(method,{...input,sessionKey:target},options);check();if(result.taskId)tasks.add(result.taskId);return result;
  }
  if(method==='voice.product.task.lookup'){
   if(!requests.has(requestKey(input)))throw Error('Public task not owned');
   const result=await gateway.request(method,input,options);check();if(result.taskId)tasks.add(result.taskId);return result;
  }
  if(['voice.product.task.read','voice.product.task.control','voice.product.task.cancel'].includes(method)&&tasks.has(input.taskId)){
   const result=await gateway.request(method,input,options);check();return result;
  }
  throw Error('Public method not enabled');
 }});
}
