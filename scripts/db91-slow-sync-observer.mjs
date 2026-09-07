// Temporary Lab-only observer. Never logs arguments, SQL, paths, or results.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {performance} from 'node:perf_hooks';
const output=process.stderr.write.bind(process.stderr);
const wrap=(object,key,label)=>{
 const original=object[key];if(typeof original!=='function')return;
 object[key]=function(...args){const start=performance.now();try{return Reflect.apply(original,this,args);}finally{
  const ms=performance.now()-start;
  if(ms>=100)output('[db91-slow-sync] '+JSON.stringify({pid:process.pid,atMs:Date.now(),op:label,ms:Math.round(ms),stack:new Error().stack.split('\n').slice(2,9)})+'\n');
 }};
};
const probe=new DatabaseSync(':memory:');
const statementPrototype=Object.getPrototypeOf(probe.prepare('select 1'));probe.close();
for(const key of ['exec','prepare','close','open'])wrap(DatabaseSync.prototype,key,'sqlite.'+key);
for(const key of ['all','get','run','iterate'])wrap(statementPrototype,key,'sqlite.statement.'+key);
for(const key of Object.keys(fs).filter(k=>k.endsWith('Sync')))wrap(fs,key,'fs.'+key);
for(const key of ['execSync','execFileSync','spawnSync'])wrap(cp,key,'child.'+key);
syncBuiltinESMExports();
let previous=performance.now();setInterval(()=>{const now=performance.now(),lag=now-previous-500;previous=now;if(lag>1000)output('[db91-loop-lag] '+JSON.stringify({pid:process.pid,atMs:Date.now(),ms:Math.round(lag)})+'\n');},500).unref();
