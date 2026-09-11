import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const pid=Number(execFileSync('systemctl',['show','openclaw-gateway','-p','MainPID','--value'],{encoding:'utf8'}));assert(pid>1);
const env=Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const cfg=JSON.parse(fs.readFileSync('/home/openclaw/.openclaw/openclaw.json','utf8').replace(/\$\{([^}]+)\}/g,(all,key)=>env[key]===undefined?all:JSON.stringify(env[key]).slice(1,-1)));
assert.equal(cfg.gateway.port,22793);const token=cfg.gateway.auth?.token||env.OPENCLAW_GATEWAY_TOKEN;assert.equal(typeof token,'string');
const queries=['批量任务应该怎样逐步增加运行数量，避免刚启动时争抢数据库？','视频导出时怎样确保配音和背景音乐真的能听见？','做完代码修复以后，什么时候才可以合并到开发分支？'];
let failures=0;
for(const query of queries){
 const at=performance.now();
 const response=await fetch('http://127.0.0.1:22793/tools/invoke',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({tool:'memory_search',args:{query,maxResults:3,minScore:0.1},sessionKey:'agent:makaron:memory-repair-acceptance-20260911'}),signal:AbortSignal.timeout(45000)});
 const body=await response.json();
 let result=body.result?.details;
 if(!result){const text=body.result?.content?.find(x=>x.type==='text')?.text;if(text){try{result=JSON.parse(text);}catch{result={text:text.slice(0,300)};}}}
 const summary=result?{provider:result.provider,model:result.model,disabled:result.disabled,unavailable:result.unavailable,error:result.error,debug:result.debug,results:result.results?.map(x=>({path:x.path,startLine:x.startLine,endLine:x.endLine,score:x.score,vectorScore:x.vectorScore,textScore:x.textScore,source:x.source,corpus:x.corpus,hasSnippet:!!x.snippet}))}:undefined;
 console.log(JSON.stringify({query,ms:Math.round(performance.now()-at),status:response.status,ok:body.ok,resultKeys:Object.keys(body.result||{}),result:summary,error:body.error}));
 if(!response.ok||!body.ok||body.result?.isError||result?.disabled||result?.unavailable||!result?.results?.length)failures++;
}
assert.equal(failures,0,'Some real Gateway memory_search checks did not return usable results');
