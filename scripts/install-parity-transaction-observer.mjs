import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const m=JSON.parse(fs.readFileSync(root+'/../../control/db91-parity.json'));assert.equal(m.owner,'codex-db91-production-equivalent-20260908');
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const file=root+'/runtime/openclaw/dist/openclaw-agent-db-CUTe8BX6.js',before=fs.readFileSync(file,'utf8');
assert(!before.includes('__parityTxnPhase'));
const body='const operationResult = operation(database);',permission='if (!incognitoDatabases.has(database)) ensureOpenClawAgentDatabasePermissions(database.path, options);';
assert.equal(before.split(body).length,2);assert.equal(before.split(permission).length,2);
const after=before.replace(body,'const operationResult = __parityTxnPhase("body",options.agentId,()=>operation(database));').replace(permission,'if (!incognitoDatabases.has(database)) __parityTxnPhase("permissions",options.agentId,()=>ensureOpenClawAgentDatabasePermissions(database.path, options));')+`
function __parityTxnPhase(phase,agent,fn){const at=performance.now(),cpu=process.cpuUsage();try{return fn();}finally{const ms=Math.round(performance.now()-at);if(ms>=100){const used=process.cpuUsage(cpu);process.stderr.write('[parity-transaction-phase] '+JSON.stringify({pid:process.pid,at:Date.now(),agent,phase,ms,cpuUserMs:Math.round(used.user/1000),cpuSystemMs:Math.round(used.system/1000),stack:new Error().stack.split('\\n').slice(2,20)})+'\\n');}}}
`;
fs.writeFileSync(root+'/tmp/before-transaction-observer.js',before,{mode:0o600,flag:'wx'});fs.writeFileSync(file,after);execFileSync(process.execPath,['--check',file]);
console.log(JSON.stringify({observerOnly:true,transactionSemanticsUnchanged:true,thresholdMs:100}));
