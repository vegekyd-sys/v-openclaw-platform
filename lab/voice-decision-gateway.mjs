import {createVoiceDecisionRouter} from './voice-decision-router.mjs';
import {createToolExecutor} from './realtime-direct-tools/tools.mjs';

/** Protocol-independent owner. Transport supplies authenticated tool invocation,
 * real native turn ownership and real call closure; JEV never grants authority. */
export function createGatewayVoiceDecisionOwner({evaluate,invoke,control,emit=()=>{},audit=()=>{},isCallCurrent,context=''}={}) {
  const pending=new Map(),processes=new Set(),requests=new Map();
  const router=createVoiceDecisionRouter({evaluate,audit});
  let agentTail=Promise.resolve(),agentQueued=0;
  async function delegateSerial(run,signal){
    if(agentQueued>=8)throw Error("后台任务队列已满");
    agentQueued++;const previous=agentTail;let release;agentTail=new Promise(resolve=>{release=resolve});
    try{await previous;check(signal);return await run();}finally{agentQueued--;release();}
  }
  const allowedTools=new Set(['memory_search','web_search','web_fetch','exec','process']);
  const check=(signal)=>{signal.throwIfAborted();if(!isCallCurrent())throw Error('语音任务 owner 已失效');};
  const execute=createToolExecutor({allowedTools,invoke:async(name,args,callId,signal)=>{
    check(signal);
    if(name==='process'&&!processes.has(args.sessionId))throw Error('不能操作其他任务的执行会话');
    audit({type:"tool.invoke",callId,name,args});
    const result=await invoke(name,args,callId,signal);
    audit({type:"tool.native-result",callId,name,result});
    if(name==='exec'&&result?.details?.status==='running'&&result.details.sessionId)processes.add(result.details.sessionId);
    if(name==='process'&&result?.details?.status!=='running')processes.delete(args.sessionId);
    check(signal);return result;
  }});
  const run=async({request,requestId,signal,isCurrent,acceptEnd,delegate:runDelegate})=>{
      check(signal);
      const decision=await router.decide({request,requestId,signal,isCurrent,context,
        available:[...allowedTools,'current_time','feishu_calendar'],callActive:true,pending:pending.size>0,
        volumeControl:false,urls:request.match(/https?:\/\/[^\s<>"）)]+/gu)??[]});
      check(signal);
      if(['noop','clarify'].includes(decision.action))return {text:decision.action==='noop'?'没有新的操作请求，正常继续当前对话，不重复旧结果。':decision.error??'目标尚不明确，请简短确认具体要查什么。',provenance:{source:'decision_model',decisionId:decision.id,model:decision.model}};
      if(decision.action==='task_status')return {text:pending.size?'这通电话的任务仍在执行，没有新的已核实结果。':'这通电话当前没有仍在执行的任务；请根据已收到的结果回答，不重做。',provenance:{source:'host_task_state',decisionId:decision.id}};
      if(decision.action==='end_call'){
        if(typeof acceptEnd!=='function')throw Error('缺少真实挂断 owner');
        const callControl=acceptEnd({decisionId:decision.id,model:decision.model});
        if(!callControl)throw Error('当前用户结束请求已失效');
        return {callControl};
      }
      const action=decision.action;
      emit({type:'tool.call',callId:requestId,payload:{name:action}});
      pending.set(requestId,{action,signal});
      let outcome='tool.error';
      try{
        let result;
        if(action==='cancel_task')result=await control({mode:'cancel',text:request});
        else if(action==='delegate_to_v'){if(typeof runDelegate!=='function')throw Error('缺少本次请求的 Agent 绑定');result=await delegateSerial(()=>runDelegate(decision.args),signal);}
        else result=await execute(action,decision.args,requestId,signal);
        check(signal);
        outcome='tool.result';
        // Agent final/continuation provenance stays exactly as supplied.
        if(action==='delegate_to_v')return result;
        return {text:JSON.stringify({tool:action,result}),provenance:{source:'direct_tool',decisionId:decision.id,model:decision.model,tool:action}};
      }finally{
        pending.delete(requestId);
        emit({type:outcome,callId:requestId,payload:{name:action}});
      }
    };
  return {
    get pending(){return pending.size>0;},
    run(input){
      check(input.signal);
      if(input.isCurrent()!==true)throw Error('本次请求已失效');
      const old=requests.get(input.requestId);
      if(old){if(old.request!==input.request)throw Error('请求身份冲突');return old.promise;}
      if(requests.size>=256)throw Error('本通电话任务数已达上限');
      const promise=run(input);requests.set(input.requestId,{request:input.request,promise});return promise;
    },
  };
}

