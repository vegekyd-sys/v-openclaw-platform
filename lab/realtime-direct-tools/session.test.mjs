import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createDirectVoiceService} from './session.mjs';

async function fixture(invoke=async()=>({ok:true,output:{answer:'实际结果'}})) {
 const peers=[],audit=[],invocations=[];
 class WS extends EventEmitter {constructor(){super();this.readyState=1;this.sent=[];peers.push(this);queueMicrotask(()=>this.emit('open'));}
  send(raw){const value=JSON.parse(raw);this.sent.push(value);if(value.type==='session.update')queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({type:'session.updated'})),false));}
  close(){this.readyState=3;this.emit('close');}}
 class Server {handleUpgrade(req,socket,head,done){done(socket);}close(){}}
 const gateway={request:async(method,args)=>{
  if(method==='tools.catalog')return {groups:[{tools:['memory_search','web_search','web_fetch','exec','process'].map(id=>({id}))}]};
  invocations.push(args);return invoke(args);
 }};
 const service=createDirectVoiceService({gateway,wsModule:{WebSocket:WS,WebSocketServer:Server},apiKeys:{grok:'fixture-key'},audit:v=>audit.push(v)});
 const reservation=await service.reserve({model:'grok',sessionKey:'agent:makaron:explicit:personal-fixture'});
 const client=new EventEmitter();client.readyState=1;client.sent=[];client.send=raw=>client.sent.push(JSON.parse(raw));client.close=()=>{client.readyState=3;client.emit('close');};
 service.upgrade({},client,Buffer.alloc(0),reservation.voiceSessionId,reservation.relayTicket);await delay(5);
 const upstream=peers[0],event=v=>upstream.emit('message',Buffer.from(JSON.stringify(v)),false);
 const call=(name,args,id='call-1')=>{event({type:'response.created',response:{id:'response-'+id}});event({type:'response.function_call_arguments.done',response_id:'response-'+id,call_id:id,name,arguments:JSON.stringify(args)});event({type:'response.done',response:{id:'response-'+id,status:'completed'}});};
 return {service,reservation,client,upstream,event,call,audit,invocations};
}
test('native direct call executes real Gateway tool, retains personal session and never delegates to a model',async()=>{
 const f=await fixture();f.call('memory_search',{query:'家庭'});await delay(5);
 assert.equal(f.invocations[0].name,'memory_search');assert.equal(f.invocations[0].sessionKey,'agent:makaron:explicit:personal-fixture');
 assert.equal(f.audit.filter(x=>x.type==='tool.delivered').length,1);
 assert.equal(f.upstream.sent.filter(x=>x.item?.type==='function_call_output').length,1);await f.service.dispose();
});
test('ordinary steering preserves pending work; explicit cancellation retires its late facts',async()=>{
 let finish;const f=await fixture(()=>new Promise(resolve=>finish=resolve));f.call('web_search',{query:'天气'});await delay(2);
 await f.service.steer(f.reservation.voiceSessionId,{mode:'append',text:'我再补充一下'});
 assert.equal(f.audit.filter(x=>x.type==='tool.delivered').length,0);
 await f.service.steer(f.reservation.voiceSessionId,{mode:'cancel',text:'取消刚才的任务'});
 finish({ok:true,output:{privateOldFact:'不得续传'}});await delay(5);
 const delivered=f.audit.find(x=>x.type==='tool.delivered');assert.equal(delivered.result.cancelled,true);assert.equal(JSON.stringify(delivered).includes('privateOldFact'),false);await f.service.dispose();
});
test('end requires native semantic tool, actual farewell audio and matching drained acknowledgement',async()=>{
 const f=await fixture();f.client.emit('message',Buffer.from(JSON.stringify({type:'text',text:'讨论挂断功能'})),false);await delay(2);
 assert.equal(f.client.sent.some(x=>x.type==='end.accepted'),false);
 f.call('end_call',{});await delay(5);assert.equal(f.client.sent.some(x=>x.type==='end.after-playback'),false);
 f.event({type:'response.output_audio.delta',delta:Buffer.alloc(960).toString('base64')});f.event({type:'response.done',response:{id:'farewell',status:'completed'}});
 assert.equal(f.client.sent.some(x=>x.type==='end.after-playback'),true);
 f.client.emit('message',Buffer.from(JSON.stringify({type:'playback.drained',callId:'foreign'})),false);assert.equal(f.client.readyState,1);
 f.client.emit('message',Buffer.from(JSON.stringify({type:'playback.drained',callId:'call-1'})),false);await delay(5);assert.equal(f.client.readyState,3);await f.service.dispose();
});
test('cancel kills and polls only process IDs actually created by this call',async()=>{
 const f=await fixture(async args=>args.name==='exec'?{ok:true,output:{details:{status:'running',sessionId:'owned-1'}}}:{ok:true,output:{details:{status:'completed'}}});
 f.call('openclaw_tool',{tool:'exec',arguments:JSON.stringify({command:'sleep 30'})});await delay(5);
 await f.service.steer(f.reservation.voiceSessionId,{mode:'cancel',text:'取消'});
 assert.deepEqual(f.invocations.filter(x=>x.name==='process').map(x=>x.args),[{action:'kill',sessionId:'owned-1'},{action:'poll',sessionId:'owned-1',timeout:2000}]);
 f.call('openclaw_tool',{tool:'process',arguments:JSON.stringify({action:'kill',sessionId:'foreign'})},'foreign');await delay(5);
 assert.equal(f.invocations.some(x=>x.args.sessionId==='foreign'),false);await f.service.dispose();
});
