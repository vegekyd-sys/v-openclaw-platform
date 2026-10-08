import fs from 'node:fs';
import {createJevEvaluator,createVoiceDecisionRouter} from './voice-decision-router.mjs';

// These are router judgments, not evidence of actual tool execution or audio.
export const ROUTING_CASES=[
 {id:'memory',request:'查一下记忆，十二是谁？',expected:'memory_search'},
 {id:'web',request:'上网查一下今天上海天气。',expected:'web_search'},
 {id:'calendar',request:'查一下我明天飞书有什么安排。',expected:'feishu_calendar'},
 {id:'end',request:'今天就聊到这，谢谢你，挂了吧。',expected:'end_call'},
 {id:'discuss-end',request:'我想了解，你什么时候会挂电话？',expected:'noop'},
 {id:'negate-end',request:'别挂电话，我还要问一件事。',expected:'noop'},
 {id:'cancel',request:'不用查了，取消刚才的后台任务，电话别挂。',pending:true,expected:'cancel_task'},
 {id:'status',request:'刚才那个报告做得怎么样了？',pending:true,expected:'task_status'},
 {id:'chat-while-busy',request:'你先查着，我们聊聊天。',pending:true,expected:'noop'},
 {id:'clarify',request:'查一下那个。',expected:'clarify'},
 {id:'research',request:'比较上海几所小学，结合十二的性格、家庭条件和招生政策做一份择校方案。',expected:'delegate_to_v'},
 {id:'explicit-agent',request:'交给后端模型查一下今天的天气。',expected:'delegate_to_v'},
 {id:'volume',request:'你说话的声音小一点。',expected:'volume_down'},
 {id:'quoted-end',request:'刚才他说“就聊到这里，挂电话”，这句话是什么意思？',expected:'noop'},
 {id:'time',request:'现在上海几点？',expected:'current_time'},
 {id:'read-url',request:'帮我读一下 https://www.openai.com/ 这个网页。',urls:['https://www.openai.com/'],expected:'web_fetch'},
];
export async function runRouterBenchmark({evaluate,repetitions=1}) {
 const rows=[];
 for(let repeat=0;repeat<repetitions;repeat++)for(const item of ROUTING_CASES){
  const router=createVoiceDecisionRouter({evaluate});
  const result=await router.decide({...item,requestId:item.id+'-'+repeat,available:['memory_search','web_search','web_fetch','feishu_calendar','current_time'],callActive:true,volumeControl:true});
  rows.push({case:item.id,repeat,expected:item.expected,passed:result.action===item.expected,...result});
 }
 const latencies=rows.map(r=>r.durationMs).sort((a,b)=>a-b),quantile=q=>latencies[Math.max(0,Math.ceil(q*latencies.length)-1)];
 return {scope:'real JEV router only; no voice/tool or baseline comparison',at:new Date().toISOString(),passed:rows.filter(r=>r.passed).length,total:rows.length,p50:quantile(.5),p95:quantile(.95),rows};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const output=process.argv[2];if(!output||fs.existsSync(output))throw Error('Specify a fresh private output path');
 const result=await runRouterBenchmark({evaluate:createJevEvaluator({apiKey:process.env.VOICE_JEV_API_KEY??process.env.OPENROUTER_API_KEY,timeoutMs:10000}),repetitions:Number(process.env.JEV_BENCH_REPETITIONS??1)});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({output,scope:result.scope,passed:result.passed,total:result.total,p50:result.p50,p95:result.p95,failures:result.rows.filter(r=>!r.passed).map(r=>({case:r.case,action:r.action,expected:r.expected,confidence:r.confidence,fallback:r.fallback}))}));
}
