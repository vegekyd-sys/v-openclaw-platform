import test from 'node:test';
import assert from 'node:assert/strict';
import {createAvatarReactionSelector,avatarEvaluatorFromEnv,boundedAvatarContext} from './avatar-decision.mjs';
import {AVATAR_CATALOG,avatarVariants,avatarPicture} from './avatar-catalog.mjs';
import {AVATAR_SEQUENCES} from './avatar-state.mjs';
const context={turns:[{role:'user',text:'找了半天还是不对，有点失落。'},{role:'assistant',text:'我听懂了，我们慢慢找。'}],activity:'memory'};
const answer=choice=>({model:'test',answers:{picture:{type:'choice',choice,confidence:.9}}});
test('each reviewed picture has unique contextual tags and an actual shipped frame',()=>{
 assert.equal(AVATAR_CATALOG.length,37);assert.equal(new Set(AVATAR_CATALOG.map(p=>p.id)).size,37);
 for(const p of AVATAR_CATALOG){assert.ok(AVATAR_SEQUENCES[p.scene][p.frame]);for(const field of ['label','action','emotions','contexts','avoid'])assert.ok(p[field]);}
});
test('decision sees both speakers and exact picture choices; tool results and execution routes are absent',async()=>{
 let input;const s=createAvatarReactionSelector({evaluate:async(...args)=>{input=args;return answer('listen-3');}});
 assert.deepEqual(await s.select({owner:'a',context:{...context,query:'private-tool-query',result:'private-tool-result'}}),{picture:'listen-3',hold:false});
 assert.deepEqual(input[0].turns,context.turns);assert.equal(input[0].activity,'memory');
 assert.deepEqual(Object.keys(input[1]),['picture']);assert.equal(Object.keys(input[1].picture.criteria).length,36);
 assert.equal(JSON.stringify(input).includes('private-tool'),false);
 assert.equal(input[1].picture.criteria['listen-3'].includes('安慰'),true);
});
test('bounded context excludes unsupported roles, caps six turns and 600 characters',()=>{
 const v=boundedAvatarContext({turns:[{role:'system',text:'instructions'},...Array.from({length:10},(_,i)=>({role:i%2?'user':'assistant',text:String(i)+'x'.repeat(1000)}))],activity:'execute',taskOutcome:'fabricated'});
 assert.equal(v.turns.length,6);assert.ok(v.turns.every(t=>t.text.length===600));assert.equal(v.activity,'listen');assert.equal(v.taskOutcome,'none');
});
test('unknown, low confidence, failed and stale cosmetic calls never produce a picture',async()=>{
 for(const raw of [null,answer('end_call'),{answers:{picture:{type:'choice',choice:'listen-3',confidence:.2}}}, {answers:{picture:{type:'choice',choice:'listen-3',confidence:2}}}]){
  assert.equal(await createAvatarReactionSelector({evaluate:async()=>raw}).select({owner:'a',context}),null);
 }
 assert.equal(await createAvatarReactionSelector({evaluate:async()=>{throw Error('offline');}}).select({owner:'a',context}),null);
 assert.equal(await createAvatarReactionSelector({evaluate:async()=>answer('listen-3')}).select({owner:'a',context,isCurrent:()=>false}),null);
 assert.equal(avatarEvaluatorFromEnv({VOICE_DECISION_PROVIDER:'jev'}),null);
});
test('same task can select different reactions from changed speech; budget prevents fanout and close aborts',async()=>{
 let n=0,resolve,signal,clock=0;const s=createAvatarReactionSelector({now:()=>clock,evaluate:(input,questions,sig)=>{n++;signal=sig;return new Promise(r=>resolve=r);}});
 const first=s.select({owner:'a',context});assert.equal(await s.select({owner:'a',context}),null);
 resolve(answer('listen-3'));assert.deepEqual(await first,{picture:'listen-3',hold:false});assert.equal(await s.select({owner:'a',context}),null);
 clock=500;const next=s.select({owner:'a',context:{...context,turns:[{role:'user',text:'太好了，终于成功啦！'}]}});
 resolve(answer('complete-2'));assert.deepEqual(await next,{picture:'complete-2',hold:false});assert.equal(n,2);
 clock=1000;const closed=s.select({owner:'a',context});s.forget('a');assert.equal(signal.aborted,true);resolve(answer('web-4'));assert.equal(await closed,null);
});

test('neutral fallback cannot become a HOLD shortcut; new meaning is selected independently',async()=>{
 let input;const s=createAvatarReactionSelector({evaluate:async(...args)=>{input=args;return answer('complete-2');}});
 assert.deepEqual(await s.select({owner:'a',context:{...context,currentPicture:'listen-5',reactionPicture:'listen-5'}}),{picture:'complete-2',hold:false});
 assert.equal(input[0].currentPicture,undefined);assert.equal(input[0].reactionPicture,undefined);
 assert.equal(Object.keys(input[1].picture.criteria).length,36);assert.equal(input[1].picture.criteria.hold,undefined);
 const same=createAvatarReactionSelector({evaluate:async()=>answer('listen-3')});
 assert.deepEqual(await same.select({owner:'b',context:{...context,reactionPicture:'listen-3'}}),{picture:'listen-3',hold:true});
 assert.equal(await createAvatarReactionSelector({evaluate:async()=>answer('hold')}).select({owner:'c',context}),null);
});
test('all performance pictures have reviewed relational and visual tags, empathy variations do not celebrate',()=>{
 for(const p of AVATAR_CATALOG.filter(p=>p.id!=='idle')){
  for(const key of ['dialogue','affect','energy','gaze','gesture','family'])assert.notEqual(p[key],undefined);
  assert.ok(avatarVariants(p.id).length);assert.ok(avatarVariants(p.id).every(id=>avatarPicture(id)&&id!==p.id));
 }
 for(const id of avatarVariants('listen-3'))assert.equal(avatarPicture(id).family,'attentive');
 assert.equal(avatarVariants('listen-3').includes('complete-2'),false);
});
test('equivalent listening pictures may split mass; conflicting emotions or malformed mass stay uncertain',async()=>{
 const select=raw=>createAvatarReactionSelector({evaluate:async()=>raw}).select({owner:'a',context});
 const raw={answers:{picture:{type:'choice',choice:'listen-5',confidence:.4,probabilities:{'listen-5':.4,'listen-3':.4,'complete-2':.2}}}};
 assert.deepEqual(await select(raw),{picture:'listen-5',hold:false});
 raw.answers.picture.probabilities={'listen-5':.4,'complete-2':.4,'web-4':.2};assert.equal(await select(raw),null);
 raw.answers.picture.probabilities={'listen-5':.9,'listen-3':.9};assert.equal(await select(raw),null);
});

test('a clear cosmetic winner across 36 choices can react; tied or inconsistent scores cannot',async()=>{
 const select=picture=>createAvatarReactionSelector({evaluate:async()=>({answers:{picture}})}).select({owner:'a',context});
 const p={type:'choice',choice:'complete-1',confidence:.44,probabilities:{'complete-1':.46,'complete-5':.2,'web-2':.18,'listen-3':.16}};
 assert.deepEqual(await select(p),{picture:'complete-1',hold:false});
 p.probabilities={'complete-1':.4,'web-2':.4,'listen-3':.2};assert.equal(await select(p),null);
 p.probabilities={'complete-1':.2,'web-2':.15,'listen-3':.65};assert.equal(await select(p),null);
});
