import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createPublicVoiceRuntime} from './runtime.mjs';
const a='a'.repeat(32),b='b'.repeat(32),la='1'.repeat(32),lb='2'.repeat(32);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(t,options={}){const directory=await mkdtemp(join(tmpdir(),'public-runtime-'));const runtime=await createPublicVoiceRuntime({directory,search:async({query})=>({results:[{title:query,url:'https://example.org/public'}]}),modelStep:async()=>({content:'Public result'}),leasePollMs:5,...options});t.after(async()=>{await runtime.dispose();await rm(directory,{recursive:true,force:true});});const bind=(visitorId,leaseId,isAuthorized=()=>true)=>runtime.bind({visitorId,leaseId,isAuthorized});return {runtime,bind,directory};}
const invoke=(g,name,args)=>g.request('tools.invoke',{name,args});
async function wait(g,id){for(let i=0;i<100;i++){const r=await g.request('voice.product.task.read',{taskId:id});if(['ok','error','cancelled'].includes(r.status))return r;await pause(5);}throw Error('Task did not finish');}
test('server-created visitor scope isolates memory, tasks and all identity/path injection',async t=>{
 const f=await fixture(t),ga=f.bind(a,la),gb=f.bind(b,lb);
 await invoke(ga,'memory_write',{text:'合成记忆：红豆，只属于 A'});await invoke(gb,'memory_write',{text:'合成记忆：蓝莓，只属于 B'});
 assert.equal((await invoke(ga,'memory_search',{query:'红豆'})).output.results.length,1);
 assert.equal((await invoke(gb,'memory_search',{query:'红豆'})).output.results.length,0);
 assert.equal((await invoke(ga,'memory_search',{query:'天懿私人金丝雀1492'})).output.results.length,0);
 for(const [method,args]of [['tools.invoke',{name:'exec',args:{command:'cat /private'}}],['tools.invoke',{name:'memory_search',args:{query:'红豆',visitorId:a}}],['chat.history',{}],['send',{}],['tools.catalog',{visitorId:b}]])await assert.rejects(ga.request(method,args));
 const p={voiceSessionId:'voice-A',callId:'task-A',question:'独立访客任务'};
 const task=await ga.request('voice.product.task.start',p);assert.equal((await wait(ga,task.taskId)).status,'ok');
 await assert.rejects(gb.request('voice.product.task.read',{taskId:task.taskId}));
 await assert.rejects(f.bind(a,lb).request('voice.product.task.read',{taskId:task.taskId}));
 assert.equal((await invoke(gb,'task_status',{})).output.tasks.length,0);
 assert.equal((await invoke(f.bind(a,la),'task_status',{})).output.tasks[0].taskId,task.taskId);
});
test('task replay, media reconnect and service restart do not execute again; memory persists',async t=>{
 let runs=0;const f=await fixture(t,{modelStep:async()=>{runs++;return {content:'已完成合成结果'};}}),g=f.bind(a,la),p={voiceSessionId:'call',callId:'item',question:'请后台完成'};
 await g.request('public.memory.append',{role:'user',text:'我喜欢红豆',id:'call-turn-1'});
 const first=await g.request('voice.product.task.start',p);await wait(g,first.taskId);
 const reconnected=f.bind(a,la);assert.equal((await reconnected.request('voice.product.task.start',p)).taskId,first.taskId);assert.equal(runs,1);
 await f.runtime.dispose();const next=await createPublicVoiceRuntime({directory:f.directory,search:async()=>({}),modelStep:async()=>{runs++;throw Error('must not rerun');}});t.after(()=>next.dispose());const n=next.bind({visitorId:a,leaseId:la,isAuthorized:()=>true});
 assert.equal((await n.request('voice.product.task.start',p)).taskId,first.taskId);assert.equal(runs,1);
 assert.equal((await invoke(n,'memory_search',{query:'红豆'})).output.results.length,1);
});
test('revoked/expired device lease aborts model and denies result, memory and new tasks',async t=>{
 let allowed=true,aborted=false;const f=await fixture(t,{modelStep:async({signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true});})});
 const g=f.bind(a,la,()=>allowed),p={voiceSessionId:'call',callId:'item',question:'等待任务'};await g.request('voice.product.task.start',p);allowed=false;await pause(30);assert.equal(aborted,true);
 for(const [method,params]of [['tools.catalog',{}],['tools.invoke',{name:'memory_search',args:{query:'test'}}],['voice.product.task.lookup',p],['voice.product.task.start',{...p,callId:'other'}]])await assert.rejects(g.request(method,params),/lease/);
 const files=await readdir(f.directory),store=JSON.parse(await readFile(join(f.directory,files[0])));assert.equal(store.tasks[0].status,'cancelled');assert.equal(store.tasks[0].text,'');
});
test('backend model tool loop cannot expand tools or inject another visitor, while public search really runs',async t=>{
 let steps=0,searches=0;const f=await fixture(t,{search:async()=>{searches++;return {results:[{title:'真实提供给模型的公开资料',url:'https://example.org'}]};},modelStep:async({messages,tools})=>{
  assert.deepEqual(tools.map(t=>t.name),['web_search','memory_search','memory_write','task_status']);steps++;
  if(steps===1)return {tool_calls:[{id:'bad',type:'function',function:{name:'exec',arguments:'{"command":"read private"}'}},{id:'public',type:'function',function:{name:'web_search',arguments:'{"query":"公开天气"}'}}]};
  assert(messages.some(m=>m.role==='tool'&&m.content.includes('Public权限')));return {content:'公开搜索结果已整理，来源 https://example.org'};
 }});const g=f.bind(a,la),ack=await g.request('voice.product.task.start',{voiceSessionId:'call',callId:'item',question:'查公开天气'});const result=await wait(g,ack.taskId);assert.equal(result.status,'ok');assert.equal(searches,1);assert.equal(steps,2);
});
