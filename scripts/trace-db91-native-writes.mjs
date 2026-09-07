// Lab-only observer. Never included in the production integrity installer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const root='/srv/vlab-production-mirror/labs/instances/db91-fix';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const manifest=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json'));
assert.equal(manifest.owner,'codex-db91-contention-20260907');
assert.equal(execFileSync('systemctl',['show',manifest.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const file=root+'/runtime/openclaw/dist/session-accessor.sqlite-scope-BwPKGcgm.js';
const backup=root+'/tmp/native-write-scope.original.js';
const original=fs.existsSync(backup)?fs.readFileSync(backup,'utf8'):fs.readFileSync(file,'utf8');
const anchor='\t\t\tlabel: "runExclusiveSqliteSessionWrite",\n\t\t\tfn\n';
assert.equal(original.split(anchor).length,2);
const replacement=`\t\t\tlabel: "runExclusiveSqliteSessionWrite",
\t\t\tfn: async () => {
\t\t\t\tconst observer = globalThis[Symbol.for("db91.lab.native.write.trace")];
\t\t\t\tconst callbackAt = Date.now();
\t\t\t\ttry { return await fn(); }
\t\t\t\tfinally {
\t\t\t\t\tif (observer) {
\t\t\t\t\t\tif (observer.events.length < 20000) observer.events.push({pid:process.pid,seq:observer.sequence++,startMs:startedAt,callbackMs:callbackAt,endMs:Date.now(),queueMs:callbackAt-startedAt,bodyMs:Date.now()-callbackAt});
\t\t\t\t\t\telse observer.dropped++;
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
`;
const after=original.replace(anchor,replacement), current=fs.readFileSync(file,'utf8');
assert(current===original||current===after,'refuse unexpected native trace target drift');
if(!fs.existsSync(backup)) fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});
fs.writeFileSync(file,process.argv.includes('--restore')?original:after);
const transactionFile=root+'/runtime/openclaw/dist/node-sqlite-CL-d6drd.js';
const transactionBackup=root+'/tmp/native-transaction.original.js';
const transactionOriginal=fs.existsSync(transactionBackup)?fs.readFileSync(transactionBackup,'utf8'):fs.readFileSync(transactionFile,'utf8');
const pidAnchor='pid: process.pid,';
assert.equal(transactionOriginal.split(pidAnchor).length,4,'three slow/failure transaction log sites');
const transactionAfter=transactionOriginal.replaceAll(pidAnchor,pidAnchor+'\n\t\tdb91Callsite: process.env.DB91_TRACE_NATIVE === "1" ? new Error("db91 native transaction trace").stack : void 0,');
assert([transactionOriginal,transactionAfter].includes(fs.readFileSync(transactionFile,'utf8')),'transaction observer target drift');
if(!fs.existsSync(transactionBackup))fs.writeFileSync(transactionBackup,transactionOriginal,{mode:0o600,flag:'wx'});
fs.writeFileSync(transactionFile,process.argv.includes('--restore')?transactionOriginal:transactionAfter);
const envFile=root+'/secrets.env',envText=fs.readFileSync(envFile,'utf8').split('\n').filter(l=>!l.startsWith('DB91_TRACE_NATIVE=')).join('\n');
fs.writeFileSync(envFile,envText+'\nDB91_TRACE_NATIVE='+(process.argv.includes('--restore')?'0':'1')+'\n',{mode:0o600});
console.log(JSON.stringify({observerEnabled:!process.argv.includes('--restore'),productionInstallerUnaffected:true}));
