import test from 'node:test';import assert from 'node:assert/strict';
import {createPublicVoiceGateway} from './public-voice-gateway.mjs';
import {patchPublicTask} from './patch-voice-public-task.mjs';
test('Public forwards ordinary V memory/search unchanged and restricts task controls to its own receipts',async()=>{
 const calls=[],memory={ok:true,output:{content:[{type:'text',text:'V project memory'}]}};
 const gateway={ready:true,async request(method,params){calls.push({method,params});if(method==='tools.catalog')return {groups:[{tools:['memory_search','web_search','exec','lark_read'].map(id=>({id}))}]};if(method==='tools.invoke')return memory;if(method==='voice.product.task.start')return {taskId:'own-task',runId:'own-run'};return {taskId:'own-task',status:'ok'};}};
 let authorized=true;const sessionKey='voice:guest:'+'a'.repeat(64),g=createPublicVoiceGateway({gateway,sessionKey,isAuthorized:()=>authorized});
 assert.deepEqual((await g.request('tools.catalog')).groups[0].tools.map(t=>t.id),['memory_search','web_search']);
 assert.equal(await g.request('tools.invoke',{name:'memory_search',args:{query:'项目历史'}}),memory);
 assert.deepEqual(calls.at(-1).params,{agentId:'makaron',sessionKey:'agent:makaron:voice:public:'+'a'.repeat(64),name:'memory_search',args:{query:'项目历史'}});
 await g.request('tools.invoke',{name:'web_search',args:{query:'public web'}});
 await assert.rejects(g.request('tools.invoke',{name:'exec',args:{command:'anything'}}));
 await assert.rejects(g.request('tools.invoke',{name:'memory_search',sessionKey:'private'}));
 await g.request('voice.product.task.start',{sessionKey,voiceSessionId:'call',callId:'tool',question:'existing V task'});
 await g.request('voice.product.task.read',{taskId:'own-task'});
 await assert.rejects(g.request('voice.product.task.read',{taskId:'foreign-task'}));
 await assert.rejects(g.request('voice.product.task.lookup',{voiceSessionId:'other',callId:'other'}));
 authorized=false;await assert.rejects(g.request('tools.invoke',{name:'memory_search',args:{query:'project'}}));
});
test('task admission patch accepts canonical Public without changing task execution or existing Feishu admission',()=>{
 const source="const match=/^agent:([^:]+):feishu:(?:group|direct|dm):(?:oc_|ou_)[A-Za-z0-9]+$/.exec(params.sessionKey??'');\nif(!match)throw Error('Voice task requires its bound Feishu session');";
 const patched=patchPublicTask(source);assert.equal(patchPublicTask(patched),patched);
 const admit=new Function('params',patched+'return match[1];');
 assert.equal(admit({sessionKey:'agent:makaron:feishu:group:oc_test'}),'makaron');
 assert.equal(admit({sessionKey:'agent:makaron:voice:public:'+'a'.repeat(64)}),'makaron');
 for(const sessionKey of ['agent:makaron:main','voice:guest:'+'a'.repeat(64),'agent:makaron:voice:public:forged'])assert.throws(()=>admit({sessionKey}));
 assert.throws(()=>patchPublicTask('unknown source'));
});
