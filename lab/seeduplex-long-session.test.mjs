import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {SeeduplexRealtimeVoiceBridge,classifySeeduplexError} from './seeduplex-realtime-provider.mjs';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
class Socket extends EventEmitter {
  readyState=1;sent=[];
  send(raw){this.sent.push(JSON.parse(raw));}
  close(){this.readyState=3;this.emit('close');}
  message(value){this.emit('message',Buffer.from(JSON.stringify(value)),false);}
}
async function fixture(t,extra={}) {
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:100000});
  const sockets=[],errors=[],closed=[],diagnostics=[],calls=[];
  const bridge=new SeeduplexRealtimeVoiceBridge({providerConfig:{apiKey:'SECRET',voice:'xiaohe'},tools:[{name:'work',parameters:{type:'object'}}],onAudio(){},onError:e=>errors.push(e.message),onClose:e=>closed.push(e),onDiagnostic:e=>diagnostics.push(e),onToolCall:c=>calls.push(c),...extra},{createWebSocket:async()=>{const socket=new Socket();sockets.push(socket);return socket;}});
  t.after(()=>bridge.close());
  const opening=bridge.connect();await settle();sockets[0].emit('open');sockets[0].message({type:'session.created',session:{id:'same-dialog'}});await opening;
  return {bridge,sockets,errors,closed,diagnostics,calls,async reopen(){t.mock.timers.tick(500);await settle();const socket=sockets.at(-1);socket.emit('open');return socket;}};
}

test('classifies input timeout, inference errors and configuration errors without retaining provider messages',()=>{
  assert.deepEqual(classifySeeduplexError({error:{code:'55000000',message:'sami error: codes=52000033, desc=AudioServerNoAudioInputTooLongError SECRET'}}),{upstreamCode:'55000000',category:'input-timeout',recoverable:true});
  assert.equal(classifySeeduplexError({error:{code:'52000022',message:'AudioChatError'}}).recoverable,true);
  for(const message of ['ClientError:InvalidSpeaker','ExceededConcurrentDurationLimit'])assert.equal(classifySeeduplexError({error:{code:'55000001',message}}).recoverable,false);
  assert.equal(classifySeeduplexError({error:{code:'45000000',message:'bad input'}}).recoverable,false);
});

test('three hours without mic frames stays muted, resumes before audio, and bursts are paced at 20ms',async t=>{
  const f=await fixture(t);t.mock.timers.tick(3*60*60*1000);
  assert.equal(f.sockets[0].sent.filter(e=>e.type==='input_audio_mute.commit').length,1);
  f.bridge.sendAudio(Buffer.alloc(960*10));
  const events=f.sockets[0].sent.slice(-2);assert.deepEqual(events.map(e=>e.type),['input_audio_unmute.commit','input_audio_buffer.append']);
  assert.equal(f.sockets[0].sent.filter(e=>e.type==='input_audio_buffer.append').length,1);
  for(let i=0;i<9;i++)t.mock.timers.tick(20);
  assert.equal(f.sockets[0].sent.filter(e=>e.type==='input_audio_buffer.append').length,10);
  assert.equal(f.errors.length,0);
});

test('transient failure resumes the same dialog and preserves exactly one pending backend job and final',async t=>{
  const f=await fixture(t);
  f.sockets[0].message({type:'response.function_call_arguments.done',items:[{call_id:'once',name:'work',arguments:'{}'}]});
  f.bridge.beginBackgroundTool('once','用户已授权发送报告');
  f.sockets[0].close();
  assert.equal(f.closed.length,0);assert.equal(f.bridge.abortController.signal.aborted,false);
  f.bridge.sendAudio(Buffer.alloc(960*100));assert.equal(f.bridge.pendingInput.length,0);
  f.bridge.completeBackgroundTool('once',{result:'报告已发送。'});
  assert.equal(f.bridge.outbox.length,2);
  const next=await f.reopen();assert.equal(next.sent[0].session.id,'same-dialog');
  f.sockets[0].message({type:'error',error:{code:'45000000'}});assert.equal(f.errors.length,0);
  next.message({type:'session.created',session:{id:'same-dialog'}});
  next.message({type:'response.function_call_arguments.done',items:[{call_id:'once',name:'work',arguments:'{}'}]});
  assert.equal(f.calls.length,1);
  assert.equal(next.sent.filter(e=>e.type==='conversation.item.create').length,1);
  assert.equal(next.sent.filter(e=>e.type==='speech_text_buffer.commit').length,1);
  assert.equal(f.bridge.outbox.length,0);
  assert(f.diagnostics.some(e=>e.stage==='recovered'));
  assert.equal(f.closed.length,0);
});

test('fatal error during a cancellation is not mistaken for a harmless cancel race',async t=>{
  const f=await fixture(t);f.bridge.speakProgress('结果');f.bridge.handleBargeIn();
  assert.equal(f.bridge.cancelledOutputPending,true);
  f.sockets[0].message({type:'error',error:{code:'45000000',message:'SECRET invalid request'}});
  assert.equal(f.errors.length,1);assert.equal(f.closed.length,1);assert(!f.errors[0].includes('SECRET'));
});

test('inference error while cancellation is pending still triggers recovery',async t=>{
  const f=await fixture(t);f.bridge.speakProgress('结果');f.bridge.handleBargeIn();
  f.sockets[0].message({type:'error',error:{code:'55000000',message:'AudioServerNoAudioInputTooLongError'}});
  assert(f.diagnostics.some(e=>e.category==='input-timeout'));assert.equal(f.errors.length,0);
  const next=await f.reopen();next.message({type:'session.created',session:{id:'same-dialog'}});
  assert.equal(f.bridge.cancelledOutputPending,false);
});

test('repeated failures exhaust a bounded retry budget; hangup prevents any late reconnect',async t=>{
  const f=await fixture(t);
  for(let i=0;i<3;i++){f.sockets.at(-1).close();t.mock.timers.tick(4000);await settle();f.sockets.at(-1).emit('open');f.sockets.at(-1).message({type:'session.created',session:{id:'same-dialog'}});}
  f.sockets.at(-1).close();assert.equal(f.errors.length,1);assert.equal(f.closed.length,1);
  const count=f.sockets.length;t.mock.timers.tick(30000);await settle();assert.equal(f.sockets.length,count);
});

test('user hangup while reconnecting cancels recovery without restarting or replaying pending work',async t=>{
  const f=await fixture(t);f.sockets[0].close();f.bridge.close();t.mock.timers.tick(30000);await settle();
  assert.equal(f.sockets.length,1);assert.equal(f.bridge.abortController.signal.aborted,true);assert.equal(f.errors.length,0);
});

test('resumption must keep the exact upstream dialog; a fresh dialog cannot silently re-execute actions',async t=>{
  const f=await fixture(t);f.sockets[0].close();const next=await f.reopen();next.message({type:'session.created',session:{id:'different'}});
  assert.equal(f.errors.length,1);assert.equal(f.closed.length,1);
});

test('5,000 completed tool calls stay usable with bounded dedup memory; pending calls remain bounded',async t=>{
  const f=await fixture(t);
  for(let i=0;i<5000;i++){
    f.sockets[0].message({type:'response.function_call_arguments.done',items:[{call_id:`call-${i}`,name:'work',arguments:'{}'}]});
    f.bridge.submitToolResult(`call-${i}`,{ok:true});
  }
  assert.equal(f.calls.length,5000);assert.equal(f.errors.length,0);assert(f.bridge.seenToolCalls.size<=2048);assert.equal(f.bridge.pendingToolCalls.size,0);assert.equal(f.bridge.toolBatches.length,0);
  f.sockets[0].message({type:'response.function_call_arguments.done',items:[{call_id:'call-4999',name:'work',arguments:'{}'}]});assert.equal(f.calls.length,5000);
});
