import test from 'node:test';import assert from 'node:assert/strict';
import {sendLateWorkerReply,patchLateWorkerReplies} from './late-worker-reply.mjs';
test('closed reply channel is never used',()=>assert.equal(sendLateWorkerReply({connected:false,send(){throw Error('must not send');}},{type:'stream-event-ack'}),false));
test('async channel-close race is consumed by send callback',async()=>{
  let done;const observed=new Promise(r=>done=r);
  assert.equal(sendLateWorkerReply({connected:true,send(message,callback){assert.equal(typeof callback,'function');queueMicrotask(()=>{callback({code:'ERR_IPC_CHANNEL_CLOSED'});done();});return true;}},{type:'stream-event-ack'}),true);await observed;
});
test('sync EPIPE is consumed, successful ack is unchanged',()=>{
  assert.equal(sendLateWorkerReply({connected:true,send(){throw Object.assign(Error('pipe'),{code:'EPIPE'});}},{type:'stream-event-ack'}),false);
  const message={type:'stream-event-ack',ok:true};let seen;
  assert.equal(sendLateWorkerReply({connected:true,send(m,cb){seen=m;cb(null);return false;}},message),false);assert.equal(seen,message);
});
test('patch is reply-only, exact, and rejects duplicate application',()=>{
  const source=Array(7).fill('worker.child.send({\n type: "stream-event-ack"});').join('\n')+'\nworker.child.send({type:"request"});';
  const patched=patchLateWorkerReplies(source);assert(patched.includes('worker.child.send({type:"request"})'));
  assert.throws(()=>patchLateWorkerReplies(patched));assert.throws(()=>patchLateWorkerReplies('drift'));
});
