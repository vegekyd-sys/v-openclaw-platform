import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash,randomUUID} from 'node:crypto';
import {createGptLiveCallLifecycle,createGptLiveEndCallClientTool} from './gpt-live-call-lifecycle.mjs';
const source=readFileSync(new URL('./release-files/voice-native-turn-control/realtime-quicksilver-delegation-controller-B0yPpiHp.js',import.meta.url),'utf8');
const Controller=new Function('createHash','randomUUID','toErrorObject','formatErrorMessage','rawDataToString','buildOpenAIQuicksilverDelegationPrompt','parseOpenAIQuicksilverEvent','boundOpenAIQuicksilverDelegationResult','chunkOpenAIQuicksilverAppendText','boundOpenAIQuicksilverContextItems','createGptLiveCallLifecycle','createGptLiveEndCallClientTool',source.split(String.fromCharCode(10)).filter(l=>!l.startsWith('import ')).join(String.fromCharCode(10)).replace('export { OpenAIQuicksilverDelegationController as t };','')+String.fromCharCode(10)+'return OpenAIQuicksilverDelegationController;')(
 createHash,randomUUID,e=>e,e=>e.message,s=>String(s),x=>x.input,
 s=>{const r=JSON.parse(s);if(r.type==='delegation.created')return {kind:'delegation',id:r.item.id,prompt:r.item.content[0].text};if(r.type==='turn.done')return {kind:'transcript-done',role:r.turn.role,text:r.turn.transcript};return {kind:'ignored'};},s=>s,s=>[s],x=>x,createGptLiveCallLifecycle,createGptLiveEndCallClientTool);
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(){const frames=[],calls=[],events=[];const abort=new AbortController();const socket={readyState:1,send:s=>frames.push(JSON.parse(s))};const c=new Controller({signal:abort.signal,getSocket:()=>socket,isCallCurrent:()=>true,callLifecycle:true,logger:{warn:()=>{}},onFatalError:e=>{throw e;},onCallLifecycleEvent:e=>events.push(e),runAgentConsult:p=>new Promise((resolve,reject)=>calls.push({...p,resolve,reject}))});
 const turn=(id,text)=>{c.handleFrame(JSON.stringify({type:'turn.created',turn:{id,role:'user',transcript:text}}),false);c.handleFrame(JSON.stringify({type:'turn.done',turn:{id,role:'user',transcript:text}}),false);};
 const delegate=(id,text,turnId)=>c.handleFrame(JSON.stringify({type:'delegation.created',item:{id,type:'delegation',target:'client',user_bidi_turn_id:turnId,content:[{type:'input_text',text}]}}),false);
 return {c,calls,frames,events,turn,delegate};}
test('real controller can request current-turn end control while the original backend remains running',async()=>{const f=fixture();f.turn('turn_one','整理长方案');f.delegate('item_one','整理长方案','turn_one');await settle();assert.equal(f.calls.length,1);const original=f.calls[0];f.turn('turn_two','今天聊到这里，拜拜，请结束电话');f.delegate('item_two','结束电话','turn_two');await settle();assert.equal(f.calls.length,2);assert.equal(original.signal.aborted,false);const control=f.calls[1];assert.equal(control.controlOnly,true);assert.equal(control.callControl.userTurnText,'今天聊到这里，拜拜，请结束电话');assert.equal(control.callControl.accept({backendRunId:'control-run-1',backendToolCallId:'call_control_end'}).status,'accepted');control.resolve({callControl:true});await settle();assert.equal(f.events.filter(e=>e.type==='tool.result').length,1);assert.equal(original.signal.aborted,false);assert.equal(f.c.pendingDelegations.length,0);f.c.detach();});
test('a non-control follow-up is retained once and dispatched after the first actual result',async()=>{const f=fixture();f.turn('t1','做方案');f.delegate('i1','做方案','t1');await settle();f.turn('t2','再查玩具');f.delegate('i2','再查玩具','t2');await settle();assert.equal(f.calls[1].controlOnly,true);f.calls[1].resolve({text:'CONTROL_NOT_SELECTED'});await settle();assert.equal(f.calls.length,2);assert.equal(f.c.pendingDelegations.length,1);f.calls[0].resolve({text:'方案完成'});await settle();assert.equal(f.calls.length,3);assert.equal(f.calls[2].prompt.startsWith('再查玩具'),true);assert.equal(f.calls[2].controlOnly,undefined);assert.equal(f.events.length,0);f.c.detach();});
test('a new native caller turn revokes the earlier end-call proof before tool acceptance',async()=>{const f=fixture();f.turn('t1','做方案');f.delegate('i1','做方案','t1');await settle();f.turn('t2','挂断');f.delegate('i2','挂断','t2');await settle();const grant=f.calls[1].callControl;f.turn('t3','不要挂断，我继续说');assert.equal(grant.isCurrent(),false);assert.equal(grant.accept({backendRunId:'control-run-1',backendToolCallId:'call_control_end'}),false);assert.equal(f.events.length,0);f.c.detach();});

test('accepted goodbye withholds late business speech without aborting its task, and a new caller turn reopens delivery',async()=>{
 const f=fixture();f.turn('t1','查官网');f.delegate('i1','查官网','t1');await settle();
 const original=f.calls[0];f.turn('t2','拜拜，请挂断');f.delegate('i2','结束通话','t2');await settle();
 const receipt=f.calls[1].callControl.accept({backendRunId:'owned-control',backendToolCallId:'call_end'});assert(receipt);
 const before=f.frames.length;
 for(const kind of ['progress','final','failure'])assert.equal(f.c.sendAppend('i1','迟到的官网结果','speakable',{kind}),true);
 assert.equal(f.frames.length,before);assert.equal(original.signal.aborted,false);
 f.turn('t3','不要挂断，我继续聊');
 assert.equal(f.c.sendAppend('i1','已查到官网','speakable',{kind:'progress'}),true);
 assert.equal(f.frames.length,before+1);f.c.detach();
});

test('host receipt identifies only an actually open native assistant turn at acceptance',async()=>{
 const f=fixture();f.turn('t1','挂断');f.delegate('i1','挂断','t1');await settle();
 f.c.handleFrame(JSON.stringify({type:'turn.created',turn:{id:'actual-native-assistant',role:'assistant',transcript:'收到'}}),false);
 const receipt=f.calls[0].callControl.accept({backendRunId:'owned-control',backendToolCallId:'call_end'});
 assert.equal(receipt.nativeAssistantTurnIdAtAcceptance,'actual-native-assistant');f.c.detach();
 const g=fixture();g.turn('t1','挂断');g.delegate('i1','挂断','t1');await settle();
 g.c.handleFrame(JSON.stringify({type:'turn.created',turn:{id:'finished-ack',role:'assistant',transcript:'收到'}}),false);
 g.c.handleFrame(JSON.stringify({type:'turn.done',turn:{id:'finished-ack',role:'assistant',transcript:'收到'}}),false);
 const next=g.calls[0].callControl.accept({backendRunId:'owned-control',backendToolCallId:'call_end'});
 assert.equal(next.nativeAssistantTurnIdAtAcceptance,undefined);g.c.detach();
});
