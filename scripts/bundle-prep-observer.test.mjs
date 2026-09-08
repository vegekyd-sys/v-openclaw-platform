import test from 'node:test';import assert from 'node:assert/strict';
import {createBundlePrepObserver} from './bundle-prep-observer.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('preserves returned identity and does not record payloads',async()=>{
 const rows=[],o=createBundlePrepObserver({sink:r=>rows.push(r)}),result={private:'never-log'};
 const actual=await o.run({runId:'test-1',sessionId:'private-session',prompt:'secret'},async()=>{
  o.mark('a',{server:'voice-memory',url:'https://secret',error:'secret'});return o.wait('x',{server:'private-name'},async()=>result);
 });
 assert.equal(actual,result);assert.equal(rows.at(-1).outcome,'ok');assert.equal(rows.at(-1).events.length,3);
 for(const value of ['never-log','private-session','https://secret','private-name','prompt'])assert(!JSON.stringify(rows).includes(value));
});
test('preserves synchronous throw, async rejection and abort identity',async()=>{
 const rows=[],o=createBundlePrepObserver({sink:r=>rows.push(r)});
 for(const error of [new Error('sensitive'),Object.assign(new Error('cancelled'),{name:'AbortError'})]){
  await assert.rejects(o.run({runId:'errors'},()=>o.wait('call',{},()=>{throw error})),x=>x===error);
  await assert.rejects(o.run({runId:'errors'},()=>Promise.reject(error)),x=>x===error);
 }
 assert(!JSON.stringify(rows).includes('sensitive'));assert.equal(rows.at(-1).outcome,'aborted');
});
test('concurrent async contexts remain isolated; late background marks ignored',async()=>{
 const rows=[],o=createBundlePrepObserver({sink:r=>rows.push(r)});let late;
 await Promise.all(['one','two'].map((runId,i)=>o.run({runId},async()=>{await pause(i*10);o.mark(runId);if(i===0)late=pause(30).then(()=>o.mark('late'));})));
 await late;for(const runId of ['one','two'])assert.deepEqual(rows.find(r=>r.kind==='end'&&r.runId===runId).events.map(e=>e.stage),[runId]);
});
test('bounded event collection and nonthrowing sink',async()=>{
 let end;const o=createBundlePrepObserver({sink:r=>{if(r.kind==='end')end=r;}});
 await o.run({runId:'bounded'},async()=>{for(let i=0;i<200;i++)o.mark('test');});assert.equal(end.events.length,96);assert.equal(end.dropped,104);
 const broken=createBundlePrepObserver({sink:()=>{throw Error('sink failed')}});assert.equal(await broken.run({},()=>42),42);
});
test('detects synchronous event-loop blocking without changing call value',async()=>{
 const rows=[],o=createBundlePrepObserver({sink:r=>rows.push(r)});
 const v=await o.run({runId:'block'},()=>{const end=performance.now()+125;while(performance.now()<end){}return 7;});
 assert.equal(v,7);assert(rows.at(-1).eventLoopLagMaxMs>=15);
});
