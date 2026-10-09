import test from 'node:test';
import assert from 'node:assert/strict';
import {createAvatarReactions} from './avatar-reactions.mjs';
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const snap=(text,key='u')=>({history:[{key,role:'user',text}],current:[]});
test('streaming is coalesced, complete documents excluded and subsequent pictures wait five seconds',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});const inputs=[],pictures=[];
 const c=createAvatarReactions({request:async q=>{inputs.push(q);return {picture:'listen-3'};},apply:p=>pictures.push(p)});
 c.update({snapshot:snap('我有点')});t.mock.timers.tick(500);c.update({snapshot:snap('我有点失落')});
 t.mock.timers.tick(150);await settle();assert.equal(inputs.length,1);assert.equal(inputs[0].turns[0].text,'我有点失落');
 c.update({snapshot:{history:[...snap('我有点失落').history,{key:'doc',role:'assistant',speaker:'V · 完整方案',text:'private full document'},{key:'a',role:'assistant',text:'我听懂了'}],current:[]}});
 t.mock.timers.tick(4999);await settle();assert.equal(inputs.length,1);t.mock.timers.tick(1);await settle();assert.equal(inputs.length,2);
 assert.deepEqual(inputs[1].turns.map(t=>t.text),['我有点失落','我听懂了']);assert.equal(pictures.length,2);c.dispose();
});
test('new user turn, timeout and closed owner reject late selection without touching speech',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});let resolve;const pictures=[];
 const c=createAvatarReactions({request:()=>new Promise(r=>resolve=r),apply:p=>pictures.push(p)});
 c.update({snapshot:snap('好开心','u1')});t.mock.timers.tick(650);await settle();
 c.update({snapshot:snap('不对，有点难过','u2')});resolve({picture:'complete-2'});await settle();assert.equal(pictures.length,0);
 t.mock.timers.tick(5000);await settle();t.mock.timers.tick(2500);resolve({picture:'listen-3'});await settle();assert.equal(pictures.length,0);
 c.update({snapshot:snap('新的话','u3')});t.mock.timers.tick(5000);await settle();c.dispose();resolve({picture:'web-4'});await settle();assert.equal(pictures.length,0);
});
