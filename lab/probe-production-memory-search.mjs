// Read-only diagnostic search. Run over SSH stdin; never persists credentials or text.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(), 'VM-8-2-ubuntu');
assert.equal(process.getuid(), 0);
const root = '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core/dist';
const query=process.env.MEMORY_PROBE_QUERY||'Makaron';
const semanticOnly=process.env.MEMORY_PROBE_SEMANTIC_ONLY==='1';
const vectorDatabase=process.env.MEMORY_PROBE_VECTOR_DATABASE;
if(vectorDatabase)assert(['/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911/compact-vector-v2.sqlite','/home/openclaw/.openclaw/memory-repair-probe-20260911/compact-vector-v2.sqlite'].includes(vectorDatabase));
const pid = Number(execFileSync('systemctl', ['show', 'openclaw-gateway', '-p', 'MainPID', '--value'], {encoding:'utf8'}));
assert(pid > 1);
const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(x => x.includes('=')).map(x => [x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
Object.assign(process.env, env);
const cfg = JSON.parse(fs.readFileSync('/home/openclaw/.openclaw/openclaw.json','utf8').replace(/\$\{([^}]+)\}/g, (all,key) => env[key] === undefined ? all : JSON.stringify(env[key]).slice(1,-1)));
assert.equal(cfg.gateway.port,22793);
const owner = fs.statSync(`/proc/${pid}`);
process.setgroups([]); process.setgid(owner.gid); process.setuid(owner.uid);
const watchdog = setTimeout(() => {console.error(JSON.stringify({event:'probe-deadline'}));process.exit(2);},45000);
const {MemoryIndexManager} = await import(root+'/extensions/memory-core/manager-runtime.js');
let manager;
const started = performance.now();
const log = data => console.log(JSON.stringify({elapsedMs:Math.round(performance.now()-started),...data}));
try {
  manager = await MemoryIndexManager.get({cfg,agentId:'makaron',purpose:'status'});
  assert(manager); assert.equal(manager.purpose,'status');
  if(semanticOnly)manager.settings.query.hybrid.enabled=false;
  if(vectorDatabase)manager.settings.store.databasePath=vectorDatabase;
  // status purpose opens the published agent database read-only and disables watchers.
  const state=manager.status();
  log({event:'manager-ready',files:state.files,chunks:state.chunks,dirty:state.dirty,provider:state.provider,model:state.model});
  for (const name of ['ensureProviderInitialized','ensureEmbeddingProviderForSearch','searchKeywordWithFallback','embedQueryWithRetry','ensureVectorReady','searchVector']) {
    const original=manager[name];
    manager[name]=async function(...args) {
      log({event:'stage-enter',stage:name});
      try {const result=await original.apply(this,args); log({event:'stage-end',stage:name,...(name==='searchVector'?{vectorCount:result.length}: {})});return result;}
      catch(error){log({event:'stage-error',stage:name,error:error.name});throw error;}
    };
  }
  for (const lexicalOnly of (semanticOnly?[false,false]:[true,false])) {
    const at=performance.now();
    try {
      const results=await manager.search(query,{maxResults:3,minScore:0.1,lexicalOnly,signal:AbortSignal.timeout(15000)});
      log({event:'search',lexicalOnly,ms:Math.round(performance.now()-at),count:results.length,results:results.map(x=>({source:x.source,score:x.score,startLine:x.startLine,endLine:x.endLine,hasSnippet:!!x.snippet}))});
    } catch(error) {log({event:'search-error',lexicalOnly,ms:Math.round(performance.now()-at),error:error.name,message:String(error.message).slice(0,240)});}
  }
} finally {await manager?.close();clearTimeout(watchdog);}
