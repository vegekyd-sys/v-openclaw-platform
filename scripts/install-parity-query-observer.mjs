import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const m=JSON.parse(fs.readFileSync(root+'/../../control/db91-parity.json'));assert.equal(m.owner,'codex-db91-production-equivalent-20260908');
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const file=root+'/runtime/openclaw/dist/kysely-sync-DKYGT267.js',before=fs.readFileSync(file,'utf8');
const anchor='function executeCompiledSqliteQuerySync(db, compiledQuery) {';
assert.equal(before.split(anchor).length,2);assert(!before.includes('__parityQuery'));
const after=before.replace(anchor,`function executeCompiledSqliteQuerySync(db, compiledQuery) {
 const start=performance.now(),cpu=process.cpuUsage();
 try{return __parityQuery(db,compiledQuery);}finally{
  const ms=Math.round(performance.now()-start);
  if(ms>=100){const used=process.cpuUsage(cpu);process.stderr.write('[parity-query] '+JSON.stringify({pid:process.pid,at:Date.now(),ms,cpuUserMs:Math.round(used.user/1000),cpuSystemMs:Math.round(used.system/1000),stack:new Error().stack.split('\\n').slice(2,12)})+'\\n');}
 }
}
function __parityQuery(db, compiledQuery) {`);
fs.writeFileSync(root+'/tmp/before-query-observer.js',before,{mode:0o600,flag:'wx'});fs.writeFileSync(file,after);execFileSync(process.execPath,['--check',file]);
console.log(JSON.stringify({observerOnly:true,includesIteratorConsumption:true,logsNoSqlOrParameters:true}));
