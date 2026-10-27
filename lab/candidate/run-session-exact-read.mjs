// No Gateway, channel, model call or profiler is started. Run the actual old/new resolver
// against a private SQLite snapshot; assert exact answers and measure wall/event-loop cost.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {FILE,unpatch,sha256} from '../patch-run-session-exact-read.mjs';
const dist=path.join(process.env.VLAB_CANDIDATE_RUNTIME,'openclaw/dist');
const state=process.env.OPENCLAW_STATE_DIR;
assert(process.env.VLAB_CANDIDATE_RUNTIME&&state&&process.env.VLAB_SHARED_STATE_DIR);
// Use the relocated candidate runner on the root disk (see the incident report).
// The runtime deliberately rejects symlinked databases during target discovery,
// so keep a regular database inside this candidate's managed state directory.
const relative='agents/makaron/agent/openclaw-agent.sqlite';
const link=path.join(state,relative);
try {
assert(!fs.existsSync(link),'candidate state must not already contain a database');
fs.mkdirSync(path.dirname(link),{recursive:true});
execFileSync('python3',['-c',
 'import sqlite3,sys; src=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); dst=sqlite3.connect(sys.argv[2]); src.backup(dst,pages=1024); dst.close(); src.close()',
 path.join(process.env.VLAB_SHARED_STATE_DIR,relative),link],{timeout:300000,stdio:'inherit'});
console.log(JSON.stringify({stage:'private-snapshot',bytes:fs.statSync(link).size}));
const source=fs.readFileSync(path.join(dist,FILE),'utf8');
const beforePath=path.join(dist,'run-session-exact-before.js');
fs.writeFileSync(beforePath,unpatch(source));
const before=await import(beforePath),after=await import(path.join(dist,FILE));
const db=new DatabaseSync(link,{readOnly:true});
const queryPlan=db.prepare('EXPLAIN QUERY PLAN SELECT session_key FROM session_nodes WHERE current_session_id IN (?)').all('missing-fixture').map(r=>r.detail);
assert(queryPlan.some(s=>s.includes('idx_agent_session_nodes_current_session_id')));
const rows=db.prepare('SELECT session_key,current_session_id FROM session_nodes WHERE current_session_id IS NOT NULL ORDER BY session_key').all();
assert(rows.length>0,'real snapshot required');
const step=Math.max(1,Math.floor(rows.length/12));
const sample=[...new Set(rows.filter((_,i)=>i%step===0).slice(0,12).map(r=>r.current_session_id))];
const queries=[...sample,...Array.from({length:8},(_,i)=>`missing-event-fixture-${i}`)];
async function measure(fn){
 let last=performance.now(),maxGap=0; const iv=setInterval(()=>{const n=performance.now();maxGap=Math.max(maxGap,n-last);last=n;},1);
 const start=performance.now();let value,ms;
 try{value=fn();ms=performance.now()-start;await new Promise(r=>setTimeout(r,5));}finally{clearInterval(iv);}
 return {value,ms,maxGap};
}
const results=[];
for(const id of queries){
 before.t();after.t();
 const a=await measure(()=>before.n(id,{agentId:'makaron'}));
 const b=await measure(()=>after.n(id,{agentId:'makaron'}));
 assert.equal(b.value,a.value,'old/new run resolution differs');
 results.push({kind:id.startsWith('missing-')?'missing':'existing',beforeMs:a.ms,afterMs:b.ms,beforeGapMs:a.maxGap,afterGapMs:b.maxGap,found:typeof b.value==='string'});
}
assert(results.filter(r=>r.kind==='existing'&&r.found).length>=8,'positive parity must actually resolve the copied database');
// The event handler's missing-context fallback across many distinct run IDs is the fault path.
const burst=await measure(()=>{for(let i=0;i<64;i++)assert.equal(after.n(`unmapped-burst-${i}`,{agentId:'makaron'}),undefined);});
const result={runtimeHash:sha256(source),beforeHash:sha256(unpatch(source)),rows:rows.length,queryPlan,parity:results.length,
 mismatch:0,results,unmapped64:{ms:burst.ms,maxGapMs:burst.maxGap}};
console.log(JSON.stringify(result,null,2));
db.close();fs.unlinkSync(beforePath);
} finally {
 for(const suffix of['','-wal','-shm'])fs.rmSync(link+suffix,{force:true});
}
