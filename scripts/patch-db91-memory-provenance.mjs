import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
const sha = text => createHash('sha256').update(text).digest('hex');
export function patchProvenance(source) {
  const anchor='function ensureMemoryChunkProvenance(db) {\n';
  assert.equal(source.split(anchor).length,2,'native provenance anchor drift');
  assert(!source.includes('db91ProvenanceComplete'),'already patched');
  assert(source.includes("SELECT id, 'untrusted', 'unknown', updated_at FROM memory_index_chunks;"));
  source=source.replace(anchor,anchor+'\tif (db91ProvenanceComplete(db, MEMORY_INDEX_CHUNK_PROVENANCE_SCHEMA_SQL)) return;\n');
  // The original outer SAVEPOINT is deferred: schema reads then attempt a
  // write upgrade, which can fail immediately with BUSY_SNAPSHOT under another
  // process's commit. Acquire the existing SQLite writer lock before those
  // reads; retain both original savepoint rollback paths inside it.
  for(const [name,label] of [['ensureMemoryChunkFtsSchema','memory.fts.ensure-body'],['ensureMemoryPathFtsSchema','memory.fts.ensure-path']]) {
    const target='function '+name+'(params) {\n';assert.equal(source.split(target).length,2);
    source=source.replace(target,target+'\tif (process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE === "1" && !params.db.isTransaction) return runSqliteImmediateTransactionSync(params.db, () => '+name+'(params), {operationLabel: "'+label+'", databaseLabel: "memory index"});\n');
  }
  return 'import { isMemoryProvenanceBackfillComplete as db91ProvenanceComplete } from "./db91-memory-provenance.mjs";\n'+source;
}
export function buildProvenancePlan(core) {
  const dist=path.join(core,'dist');
  const files=fs.readdirSync(dist).filter(n=>n.startsWith('memory-schema-')&&n.endsWith('.js')&&fs.readFileSync(path.join(dist,n),'utf8').includes('function ensureMemoryChunkProvenance(db)'));
  assert.equal(files.length,1);
  const native=path.join(dist,files[0]),before=fs.readFileSync(native,'utf8');
  const helper=path.join(dist,'db91-memory-provenance.mjs');assert(!fs.existsSync(helper));
  return [{filename:native,before,after:patchProvenance(before)},
    {filename:helper,before:null,after:fs.readFileSync(fileURLToPath(new URL('../experiments/db91-memory-provenance/fast-path.mjs',import.meta.url)),'utf8')}];
}
function write(filename,content,template) {
  const stat=fs.statSync(template??filename),temporary=filename+'.db91-provenance-'+process.pid+'.tmp';
  fs.writeFileSync(temporary,content,{mode:stat.mode&0o777,flag:'wx'});fs.chownSync(temporary,stat.uid,stat.gid);fs.renameSync(temporary,filename);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [action,core,backup]=process.argv.slice(2);
  assert(['check','apply','rollback','ensure'].includes(action));assert(path.isAbsolute(core));assert.equal(fs.realpathSync(core),core);
  if(action==='rollback'||action==='ensure'&&backup&&fs.existsSync(path.join(backup,'changes.json'))) {
    const plan=JSON.parse(fs.readFileSync(path.join(backup,'changes.json')));
    assert.equal(plan.length,2);assert(plan.every(p=>path.dirname(p.filename)===path.join(core,'dist')));
    for(const p of plan) {
      const current=fs.existsSync(p.filename)?fs.readFileSync(p.filename,'utf8'):null;
      assert(action==='ensure'?current===p.after:current===p.before||current===p.after,'concurrent native change');
    }
    if(action==='rollback') for(const p of plan) {
      if(p.before===null) {if(fs.existsSync(p.filename))fs.unlinkSync(p.filename);}
      else write(p.filename,p.before);
    }
    console.log(JSON.stringify({action,files:2}));
  } else {
    const plan=buildProvenancePlan(core);
    if(['apply','ensure'].includes(action)) {
      assert(backup&&path.isAbsolute(backup)&&!fs.existsSync(backup));fs.mkdirSync(backup,{recursive:true,mode:0o700});
      fs.writeFileSync(path.join(backup,'changes.json'),JSON.stringify(plan),{mode:0o600,flag:'wx'});
      for(const p of plan)write(p.filename,p.after,p.before===null?plan[0].filename:undefined);
    }
    console.log(JSON.stringify({action,enabled:false,files:plan.map(p=>({filename:p.filename,beforeSha:p.before===null?null:sha(p.before),afterSha:sha(p.after)}))}));
  }
}
