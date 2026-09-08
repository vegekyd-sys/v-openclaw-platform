// Private VLab observer. Only explicitly named synthetic runs are recorded.
// No payloads, URLs, headers, SQL, credentials, prompts or response text.
import {AsyncLocalStorage} from 'node:async_hooks';
import {channel} from 'node:diagnostics_channel';
import {performance} from 'node:perf_hooks';

export const DB91_HI_TRACE = Symbol.for('db91.hi.trace');
const valid = id => typeof id === 'string' && /^DB91_HI_[0-9]+_[a-z0-9_]+$/.test(id);
const safeReason = value => ['off','minimal','low','medium','high','xhigh','max'].includes(value) ? value : 'unspecified';
const category = error => /timeout|timed out/i.test(String(error?.message)) ? 'timeout' :
  /abort/i.test(String(error?.name)) ? 'abort' : error?.status === 429 ? 'rate-limit' :
  Number(error?.status) >= 500 ? 'http-5xx' : 'other';

export function createHiTrace(write = row => console.error('[db91-hi-stage] '+JSON.stringify(row))) {
  const turns = new AsyncLocalStorage(), requests = new AsyncLocalStorage();
  const requestContexts = new WeakMap();
  const subscriptions = [];
  function mark(runId,stage,fields={}) {
    if (!valid(runId)) return;
    const cpu=process.cpuUsage();
    write({runId,pid:process.pid,stage,atMs:Date.now(),monoMs:performance.now(),
      cpuUserUs:cpu.user,cpuSystemUs:cpu.system,...fields});
  }
  function subscribe(name,fn) {
    const c=channel(name);c.subscribe(fn);subscriptions.push([c,fn]);
  }
  subscribe('undici:request:create', ({request}) => {
    const ctx=requests.getStore();if(ctx&&request){requestContexts.set(request,ctx);ctx.mark('http-request-created');}
  });
  for(const [name,stage] of [
    ['undici:client:sendHeaders','http-headers-sent'],
    ['undici:request:bodySent','http-body-sent'],
    ['undici:request:headers','http-response-headers'],
    ['undici:request:trailers','http-response-body-complete'],
  ]) subscribe(name, ({request,response}) => {
    const ctx=requestContexts.get(request);if(ctx)ctx.mark(stage,response?.statusCode?{status:response.statusCode}:{});
  });
  subscribe('undici:request:error', ({request,error}) => {
    requestContexts.get(request)?.mark('http-request-error',{errorCategory:category(error)});
  });
  function beginModel(model,context,options) {
    const turn=turns.getStore();if(!turn)return undefined;
    const call=++turn.calls, seen=new Set();let fetches=0;
    const modelMark=(stage,fields={})=>mark(turn.runId,stage,{call,...fields});
    modelMark('provider-enter',{model:model?.id==='deepseek-v4-pro'?'deepseek-v4-pro':'other',
      reasoningEffort:safeReason(options?.reasoningEffort),messages:context?.messages?.length??0,tools:context?.tools?.length??0});
    const once=(stage,fields={})=>{if(!seen.has(stage)){seen.add(stage);modelMark(stage,fields);}};
    return {
      mark:modelMark,
      error:error=>modelMark('provider-error',{errorCategory:category(error),status:Number(error?.status)||undefined}),
      event:event=>{
        if(event?.type==='thinking_delta'&&event.delta)once('provider-first-thinking');
        if(event?.type==='text_delta'&&event.delta)once('provider-first-text');
        if(event?.type==='toolcall_start')once('provider-first-tool');
      },
      wrapFetch:fetchFn=>async(input,init)=>{
        const request=++fetches;
        const requestMark=(stage,fields={})=>modelMark(stage,{request,...fields});
        requestMark('http-fetch-start',{bodyChars:typeof init?.body==='string'?init.body.length:undefined});
        try {
          const response=await requests.run({mark:requestMark},()=> (fetchFn??globalThis.fetch)(input,init));
          requestMark('http-fetch-response',{status:response.status});
          const body=response.body;
          if(body){
            let first=false,done=false;
            const observed=value=>{
              if(value?.value?.byteLength&&!first){first=true;requestMark('http-first-body-consumed');}
              if(value?.done&&!done){done=true;requestMark('http-body-consumption-end');}
              return value;
            };
            // Observe reads the SDK already performs. No tee, read-ahead or buffering.
            const getReader=body.getReader.bind(body);
            Object.defineProperty(body,'getReader',{configurable:true,value:(...args)=>{
              const reader=getReader(...args),read=reader.read.bind(reader);
              Object.defineProperty(reader,'read',{configurable:true,value:async(...readArgs)=>observed(await read(...readArgs))});
              return reader;
            }});
            const values=body.values?.bind(body);
            if(values){
              const observeIterator=(...args)=>{
                const iterator=values(...args);
                return {next:async(...nextArgs)=>observed(await iterator.next(...nextArgs)),
                  return:async(...returnArgs)=>iterator.return(...returnArgs),[Symbol.asyncIterator](){return this;}};
              };
              Object.defineProperty(body,'values',{configurable:true,value:observeIterator});
              Object.defineProperty(body,Symbol.asyncIterator,{configurable:true,value:observeIterator});
            }
          }
          return response;
        } catch(error){requestMark('http-fetch-error',{errorCategory:category(error),status:Number(error?.status)||undefined});throw error;}
      },
    };
  }
  return {mark,beginModel,
    run:async(message,fn)=>{
      if(!valid(message?.runId)||!message.sessionKey?.includes('db91-hi-'))return fn();
      const before=performance.eventLoopUtilization();let lagMax=0,last=performance.now();
      const timer=setInterval(()=>{const now=performance.now();lagMax=Math.max(lagMax,now-last-50);last=now;},50);timer.unref();
      mark(message.runId,'worker-turn-enter');
      try{return await turns.run({runId:message.runId,calls:0},fn);}
      finally{clearInterval(timer);mark(message.runId,'worker-turn-exit',{eventLoopLagMaxMs:Math.round(lagMax),eventLoopUtilization:performance.eventLoopUtilization(before).utilization});}
    },
    dispose:()=>{for(const [c,fn]of subscriptions)c.unsubscribe(fn);},
  };
}
export const db91HiTrace=globalThis[DB91_HI_TRACE]??=createHiTrace();
