import {postDeepSeek,toSearchPayload,clampQuery} from '../v-deepseek-web/plugin/core/deepseek.js';
// Provider credentials are host configuration. The backend model receives only
// its request, Public tool schemas and scoped results, never this object.
export function publicDeepSeekProviders({apiKey,baseUrl='https://api.deepseek.com',model='deepseek-flash',fetchImpl=fetch}){
 if(!apiKey||!/^https:\/\/api\.deepseek\.com(?:\/v1)?\/?$/u.test(baseUrl))throw Error('Public provider requires the official DeepSeek HTTPS endpoint');
 baseUrl=baseUrl.replace(/\/$/u,'').replace(/\/v1$/u,'');
 return {
  async search({query,count,signal}){const q=clampQuery(query),started=Date.now();const data=await postDeepSeek({apiKey,baseUrl,path:'/v1/tools/search',body:{query:q,count},signal,timeoutMs:20000,fetchImpl});return toSearchPayload({query:q,sentQuery:q,data,tookMs:Date.now()-started});},
  async modelStep({messages,tools,signal}){
   const response=await fetchImpl(baseUrl+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},body:JSON.stringify({model,messages,tools:tools.map(t=>({type:'function',function:t})),thinking:{type:'disabled'},max_tokens:2400,stream:false}),signal:AbortSignal.any([signal,AbortSignal.timeout(90000)])});
   if(!response.ok)throw Error('Public backend model HTTP '+response.status);
   const data=await response.json(),message=data.choices?.[0]?.message;if(!message)throw Error('Public backend model returned no message');return message;
  },
 };
}
