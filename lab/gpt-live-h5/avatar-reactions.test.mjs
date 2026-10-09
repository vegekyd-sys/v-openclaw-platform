import test from 'node:test';
import assert from 'node:assert/strict';
import {createAvatarReactions} from './avatar-reactions.mjs';
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const snap=(text,key='u')=>({history:[{key,role:'user',text}],current:[]});

test('stable phrase reacts without five second wait, documents excluded and no idle model polling',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});const inputs=[],pictures=[],attention=[];
 const c=createAvatarReactions({request:async q=>{inputs.push(q);return {picture:'listen-3',hold:false};},apply:p=>pictures.push(p),attend:()=>attention.push('listen'),current:()=>({currentPicture:'listen-5',reactionPicture:'listen-5'})});
 c.update({snapshot:snap('我有点')});t.mock.timers.tick(200);c.update({snapshot:snap('我有点失落')});
 t.mock.timers.tick(399);await settle();assert.equal(inputs.length,0);
 t.mock.timers.tick(1);await settle();assert.equal(inputs.length,1);assert.equal(inputs[0].turns[0].text,'我有点失落');assert.equal(inputs[0].currentPicture,'listen-5');assert.equal(attention.length,1);
 c.update({snapshot:{history:[...snap('我有点失落').history,{key:'doc',role:'assistant',speaker:'V · 完整方案',text:'private full document'},{key:'a',role:'assistant',text:'我听懂了'}],current:[]}});
 t.mock.timers.tick(400);await settle();assert.equal(inputs.length,2);
 assert.deepEqual(inputs[1].turns.map(t=>t.text),['我有点失落','我听懂了']);assert.equal(pictures.length,2);
 t.mock.timers.tick(30000);await settle();assert.equal(inputs.length,2);c.dispose();
});
test('new user turn and changed partial phrase reject stale reactions; disposal aborts work',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});let resolve,signal;const pictures=[];
 const c=createAvatarReactions({request:(q,o)=>{signal=o.signal;return new Promise(r=>resolve=r);},apply:p=>pictures.push(p)});
 c.update({snapshot:snap('好开心','u1')});t.mock.timers.tick(400);await settle();
 c.update({snapshot:snap('不对，有点难过','u2')});assert.equal(signal.aborted,true);resolve({picture:'complete-2'});await settle();assert.equal(pictures.length,0);
 t.mock.timers.tick(400);await settle();c.update({snapshot:snap('不对，有点难过，不想庆祝','u2')});resolve({picture:'listen-3'});await settle();assert.equal(pictures.length,0);
 t.mock.timers.tick(400);await settle();c.dispose();assert.equal(signal.aborted,true);resolve({picture:'web-4'});await settle();assert.equal(pictures.length,0);
});
test('continuous streaming has a bounded debounce; hidden pages wait until visible',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});let visible=false,n=0;
 const c=createAvatarReactions({request:async()=>{n++;return null;},apply:()=>{},isVisible:()=>visible});
 c.update({snapshot:snap('开始')});t.mock.timers.tick(2000);await settle();assert.equal(n,0);
 visible=true;c.resume();
 for(let i=0;i<5;i++){t.mock.timers.tick(200);c.update({snapshot:snap('开始'+i)});await settle();}
 assert.ok(n>=1);c.dispose();
});
