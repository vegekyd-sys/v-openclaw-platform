// Run against a read-only copy of the actual installed Feishu 9.1 monitor.
// No Gateway, channel credentials or business session is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {patchFeishuActiveRunSteeringBundle} from '../scripts/patch-feishu-active-run-steering.mjs';

const file = process.env.FEISHU91_MONITOR;
const source = file ? fs.readFileSync(file, 'utf8') : null;
const tick = () => new Promise(resolve => setImmediate(resolve));
const gate = () => { let release; const promise = new Promise(r => release = r); return {promise, release}; };
function fixture(patched, {enabled='1', chats='*', handler}={}) {
  const code = patched ? patchFeishuActiveRunSteeringBundle(source).source : source;
  const queueStart = code.indexOf('function createSequentialQueue(');
  const queueEnd = code.indexOf('//#endregion', queueStart);
  const dispatchStart = code.indexOf('\tconst dispatchFeishuMessage = async (event, messageDedupeKey, processingClaim, turnAdoptionLifecycle) => {');
  const dispatchEnd = code.indexOf('\n\tconst resolveSenderDebounceId', dispatchStart);
  assert(queueStart >= 0 && queueEnd > queueStart && dispatchStart >= 0 && dispatchEnd > dispatchStart);
  const context = vm.createContext({
    setTimeout, clearTimeout, DEFAULT_TASK_TIMEOUT_MS: 300000,
    resolveTimerTimeoutMs: n => n,
    process: {env: {VLAB_FEISHU_STEER_ENABLED: enabled, VLAB_FEISHU_STEER_CHAT_IDS: chats}},
    cfg: {}, runtime: {}, channelRuntime: {}, chatHistories: new Map(), accountId: 'test',
    getBotOpenId: () => 'bot', getBotName: () => 'test',
    resolveSequentialKey: ({event}) => event.message.chat_id,
    handleMessage: handler,
  });
  return vm.runInContext(`${code.slice(queueStart, queueEnd)}\nconst enqueue=createSequentialQueue();\n${code.slice(dispatchStart, dispatchEnd)}\ndispatchFeishuMessage;`, context);
}
const event = (id, chat='allowed') => ({message:{chat_id:chat, message_id:id}});

test('real 9.1 bundle: patch is exact and idempotent', {skip:!source}, () => {
  const p=patchFeishuActiveRunSteeringBundle(source);
  assert(p.changed); assert(!patchFeishuActiveRunSteeringBundle(p.source).changed);
  assert.equal(p.source.includes('const DEFAULT_TASK_TIMEOUT_MS = 3e5;'),true);
});

for (const [label,patched,enabled,chats,expectedEarly] of [
  ['original reproduces waiting',false,'1','*',false],
  ['enabled wildcard admits early',true,'1','*',true],
  ['explicit allowlist admits early',true,'1','allowed',true],
  ['disabled preserves original queue',true,'0','*',false],
  ['outside allowlist preserves queue',true,'1','another',false],
]) test(`real 9.1 dispatch: ${label}`, {skip:!source}, async () => {
  const first=gate(), started=gate(), seen=[];
  const dispatch=fixture(patched,{enabled,chats,handler:async p=>{
    seen.push(p.event.message.message_id);
    if(p.event.message.message_id==='first'){started.release();await first.promise;}
  }});
  const a=dispatch(event('first')); await started.promise;
  const b=dispatch(event('second')); await tick();
  try {assert.equal(seen.includes('second'),expectedEarly);} finally {first.release();await Promise.all([a,b]);}
  assert.deepEqual(seen,['first','second']);
});

test('real dispatch: later steer turns remain ordered, other chat independent', {skip:!source}, async()=>{
  const a=gate(),b=gate(),firstStarted=gate(),seen=[];
  const dispatch=fixture(true,{handler:async p=>{
    const id=p.event.message.message_id;seen.push(id);
    if(id==='a'){firstStarted.release();await a.promise;}
    if(id==='b')await b.promise;
  }});
  const pa=dispatch(event('a'));await firstStarted.promise;
  const pb=dispatch(event('b')),pc=dispatch(event('/stop')),pd=dispatch(event('other','other-chat'));
  await tick();
  try {assert.deepEqual(seen,['a','b','other']);b.release();await Promise.all([pb,pc,pd]);assert(seen.includes('/stop'));}
  finally {a.release();b.release();await Promise.all([pa,pb,pc,pd]);}
});

test('real dispatch: aborted ingress is abandoned and does not run', {skip:!source}, async()=>{
  let abandoned=0,calls=0;
  const dispatch=fixture(true,{handler:async()=>calls++});
  await dispatch(event('aborted'),null,null,{abortSignal:{aborted:true},onAbandoned:async()=>abandoned++});
  assert.equal(abandoned,1);assert.equal(calls,0);
});

test('real dispatch: failure does not poison later same-chat work', {skip:!source}, async()=>{
  const seen=[];
  const dispatch=fixture(true,{handler:async p=>{seen.push(p.event.message.message_id);if(seen.length===1)throw Error('fixture failure');}});
  await assert.rejects(dispatch(event('fail')),/fixture failure/);
  await dispatch(event('recover'));assert.deepEqual(seen,['fail','recover']);
});
