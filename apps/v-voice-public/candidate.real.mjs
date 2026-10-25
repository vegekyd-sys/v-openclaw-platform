// Explicit opt-in provider acceptance via `vlab.mjs candidate`; never npm test.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createPublicVoiceRuntime} from './runtime.mjs';
import {publicDeepSeekProviders} from './providers.mjs';
const config=JSON.parse(await readFile(process.env.OPENCLAW_CONFIG_PATH,'utf8'));
const apiKey=process.env.DEEPSEEK_API_KEY??config.models?.providers?.deepseek?.apiKey;
const providers=publicDeepSeekProviders({apiKey});
const directory=await mkdtemp(join(process.env.VLAB_CANDIDATE_DATA,'voice-public-'));
let searches=0,steps=0;
const runtime=await createPublicVoiceRuntime({directory,search:async args=>{searches++;return providers.search(args);},modelStep:async args=>{steps++;return providers.modelStep(args);}});
const visitorId=randomBytes(16).toString('hex'),leaseId=randomBytes(16).toString('hex');
const bind=r=>r.bind({visitorId,leaseId,isAuthorized:()=>true}),a=bind(runtime),b=runtime.bind({visitorId:randomBytes(16).toString('hex'),leaseId:randomBytes(16).toString('hex'),isAuthorized:()=>true});
const invoke=(g,name,args)=>g.request('tools.invoke',{name,args});
const marker='访客合成标记-'+randomBytes(8).toString('hex');
try{
 const search=await invoke(a,'web_search',{query:'site:developer.mozilla.org HTTP 429 Too Many Requests',count:3});
 assert(search.output.results.length>0);assert(search.output.results.every(r=>/^https?:\/\//u.test(r.url)));
 await invoke(a,'memory_write',{text:marker+'；我喜欢红豆。'});
 assert((await invoke(a,'memory_search',{query:marker})).output.results.some(r=>r.text.includes(marker)));
 assert.equal((await invoke(b,'memory_search',{query:marker})).output.results.length,0);
 const p={voiceSessionId:'candidate-call',callId:'candidate-task',question:'请实际调用 web_search 搜索 site:developer.mozilla.org HTTP 429 Too Many Requests，再调用 memory_search 查询“红豆”，最后用三句话解释429状态码并附资料链接和我的偏好。'};
 const ack=await a.request('voice.product.task.start',p);
 // A media connection is deliberately absent: admission owns the task.
 let result;
 for(let i=0;i<180;i++){result=await a.request('voice.product.task.read',{taskId:ack.taskId});if(result.status!=='running')break;await new Promise(r=>setTimeout(r,1000));}
 assert.equal(result.status,'ok');assert.match(result.text,/https?:\/\//u);assert.match(result.text,/红豆/u);assert(searches>=2);
 assert.equal((await a.request('voice.product.task.start',p)).taskId,ack.taskId);
 await assert.rejects(b.request('voice.product.task.read',{taskId:ack.taskId}));
 const oldSteps=steps;await runtime.dispose();
 const next=await createPublicVoiceRuntime({directory,...providers});
 try{const reconnect=bind(next);assert.equal((await invoke(reconnect,'task_status',{})).output.tasks[0].taskId,ack.taskId);assert((await invoke(reconnect,'memory_search',{query:marker})).output.results.some(r=>r.text.includes(marker)));assert.equal((await reconnect.request('voice.product.task.start',p)).taskId,ack.taskId);assert.equal(steps,oldSteps);}finally{await next.dispose();}
 console.log(JSON.stringify({realSearchResults:search.output.results.length,realSearchCalls:searches,realModelSteps:steps,backgroundTask:'ok',crossCallMemory:true,restartTaskReplay:'same-task-no-rerun',otherVisitorDenied:true,privateGatewayUsed:false}));
}finally{await runtime.dispose();await rm(directory,{recursive:true,force:true});}
