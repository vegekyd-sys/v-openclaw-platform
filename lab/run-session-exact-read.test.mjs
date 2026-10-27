import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FILE, patch, unpatch, sha256} from './patch-run-session-exact-read.mjs';
const source=fs.readFileSync(new URL(`release-files/run-session-exact-read/${FILE}`,import.meta.url),'utf8');
const plan=JSON.parse(fs.readFileSync(new URL('run-session-exact-read.plan.json',import.meta.url)));
function harness(code, entries={}) {
  let now=10000; const contexts=new Map(), reads=[];
  const cfg={agents:{},session:{}};
  const deps={
    resolveExpiresAtMsFromDurationMs: n=>now+n, asDateTimestampMs:n=>typeof n==='number'?n:undefined,
    getRuntimeConfig:()=>cfg, pruneMapToMaxSize:(m,n)=>{while(m.size>n)m.delete(m.keys().next().value);},
    resolveDefaultAgentId:()=> 'makaron', normalizeAgentId:s=>s.trim().toLowerCase(),
    parseAgentSessionKey:s=>{const m=/^agent:([^:]+):(.+)$/.exec(s);return m?{agentId:m[1],rest:m[2]}:null;},
    toAgentRequestSessionKey:s=>s, getAgentRunContext:id=>contexts.get(id),
    resolveSessionStoreAgentId:(_,s)=>s.startsWith('agent:')?s.split(':')[1]:'makaron',
    resolveSessionStoreKey:({sessionKey})=>sessionKey,
    loadCombinedSessionStoreForGatewayCore:(_,opts)=>{
      reads.push(opts);
      return {store:Object.fromEntries(Object.entries(entries).filter(([,v])=>!opts.match||opts.match.sessionIds.includes(v.sessionId)))};
    },
    resolvePreferredSessionKeyForSessionIdMatches:rows=>rows.sort(([a],[b])=>a.localeCompare(b))[0]?.[0],
    Date:{now:()=>now}
  };
  const body=code.replace(/^import .*;\n/gm,'').replace(/^export .*;\n?/gm,'');
  const fn=new Function(...Object.keys(deps),body+'\nreturn {resolveSessionKeyForRun,resetResolvedSessionKeyForRunCacheForTest};')(...Object.values(deps));
  return {...fn,contexts,reads,cfg,advance:n=>{now+=n;}};
}
test('release is exactly the anchored patch of the verified production bytes',()=>{
  assert.equal(sha256(unpatch(source)),plan.files[0].before);
  assert.equal(sha256(source),plan.files[0].after);
  assert.equal(patch(unpatch(source)),source);
  assert.throws(()=>patch(source),/already patched/);
  assert.throws(()=>patch('unrelated'),/anchor/);
});
test('unknown event bursts never request a whole durable store, including after miss TTL',()=>{
  const h=harness(source,{'agent:makaron:a':{sessionId:'known'}});
  for(let i=0;i<100;i++)assert.equal(h.resolveSessionKeyForRun('event-'+i),undefined);
  assert.equal(h.reads.length,100);
  assert(h.reads.every((r,i)=>r.agentId==='makaron'&&r.match.sessionIds[0]==='event-'+i));
  h.resolveSessionKeyForRun('event-99');assert.equal(h.reads.length,100);
  h.advance(1001);h.resolveSessionKeyForRun('event-99');assert.equal(h.reads.length,101);
  assert.deepEqual(h.reads.at(-1).match,{sessionIds:['event-99']});
});
test('late durable mapping becomes visible after the existing miss TTL',()=>{
  const entries={};const h=harness(source,entries);
  assert.equal(h.resolveSessionKeyForRun('late'),undefined);
  entries['agent:makaron:late']={sessionId:'late'};
  h.advance(1001);assert.equal(h.resolveSessionKeyForRun('late'),'agent:makaron:late');
});
test('run context overrides cached misses without reading storage',()=>{
  const h=harness(source);h.resolveSessionKeyForRun('r');
  h.contexts.set('r',{sessionKey:'agent:makaron:live'});
  assert.equal(h.resolveSessionKeyForRun('r'),'agent:makaron:live');assert.equal(h.reads.length,1);
});
test('agent isolation, ambiguous IDs, global scope and positive caches preserve old answers',()=>{
  const entries={'agent:makaron:b':{sessionId:'r'},'agent:makaron:a':{sessionId:'r'},
    'agent:other:z':{sessionId:'r'},global:{sessionId:'g'},'agent:malformed':{sessionId:'bad'},
    'agent:makaron:incognito:test':{sessionId:'inc',incognito:true}};
  const a=harness(unpatch(source),entries),b=harness(source,entries);
  for(const h of[a,b]){h.cfg.session.scope='global';h.contexts.set('owned',{sessionKey:'agent:other:owned'});}
  for(const id of ['r','g','bad','inc','missing','owned']) for(const opts of [{},{agentId:'makaron'},{agentId:'other'},{agentId:' MAKARON '}]) {
    for(const h of[a,b])h.resetResolvedSessionKeyForRunCacheForTest();
    assert.equal(b.resolveSessionKeyForRun(id,opts),a.resolveSessionKeyForRun(id,opts));
  }
  b.resetResolvedSessionKeyForRunCacheForTest();b.resolveSessionKeyForRun('r');const n=b.reads.length;
  assert.equal(b.resolveSessionKeyForRun('r'),'agent:makaron:a');assert.equal(b.reads.length,n);
});
