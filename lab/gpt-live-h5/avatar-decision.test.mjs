import test from 'node:test';
import assert from 'node:assert/strict';
import {createAvatarExpressionSelector,avatarEvaluatorFromEnv} from './avatar-decision.mjs';

test('avatar decision has only display choices, no private content or execution route',async()=>{
 let input;const selector=createAvatarExpressionSelector({evaluate:async(...args)=>{input=args;return {model:'test',answers:{expression:{type:'choice',choice:'curious',confidence:.9}}};}});
 assert.equal(await selector.select({owner:'a',callId:'b',activity:'memory',query:'private',result:'private'}),'curious');
 assert.equal(input[0].activity,'memory');assert.equal(JSON.stringify(input).includes('private'),false);
 assert.deepEqual(Object.keys(input[1]),['expression']);
});
test('unknown, stale, failed or low confidence cosmetic calls never affect tasks',async()=>{
 for(const raw of [null,{answers:{expression:{type:'choice',choice:'end_call',confidence:1}}},{answers:{expression:{type:'choice',choice:'calm',confidence:.2}}}]){
  const s=createAvatarExpressionSelector({evaluate:async()=>raw});assert.equal(await s.select({owner:'a',callId:'b',activity:'web'}),null);
 }
 const s=createAvatarExpressionSelector({evaluate:async()=>{throw Error('provider unavailable');}});assert.equal(await s.select({owner:'a',callId:'b',activity:'memory'}),null);
 const t=createAvatarExpressionSelector({evaluate:async()=>({answers:{expression:{type:'choice',choice:'calm',confidence:1}}})});assert.equal(await t.select({owner:'a',callId:'b',activity:'calendar',isCurrent:()=>false}),null);
 assert.equal(avatarEvaluatorFromEnv({VOICE_DECISION_PROVIDER:'jev'}),null);
});
test('cosmetic budget does not fan out for repeated/concurrent tools',async()=>{
 let n=0,resolve;const s=createAvatarExpressionSelector({evaluate:()=>{n++;return new Promise(r=>resolve=r);}});
 const first=s.select({owner:'a',callId:'1',activity:'web'});
 assert.equal(await s.select({owner:'a',callId:'2',activity:'memory'}),null);
 resolve({answers:{expression:{type:'choice',choice:'bright',confidence:1}}});assert.equal(await first,'bright');
 assert.equal(await s.select({owner:'a',callId:'3',activity:'memory'}),null);assert.equal(n,1);
});
