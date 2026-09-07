// Execute in a transient service; both activation and rollback wait for health.
import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const rollback=process.argv[2]==='rollback';assert(rollback||process.argv[2]==='apply');
const script='/opt/openclaw-experiments/db91-persisted-user-turn-20260908/source/scripts/release-db91-persisted-user-turn.mjs';
const run=(bin,args)=>execFileSync(bin,args,{stdio:'inherit',timeout:300000});
const code=action=>run(process.execPath,[script,action]);
async function startAndWait(){
 run('systemctl',['start','openclaw-gateway.service']);const end=Date.now()+600000;
 while(Date.now()<end){try{const r=await fetch('http://127.0.0.1:22793/healthz',{signal:AbortSignal.timeout(2500)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,2000));}
 throw new Error('Gateway health wait exceeded 600 seconds');
}
code(rollback?'verify':'verify-restore');
run('systemctl',['stop','openclaw-gateway.service']);
try{
 code(rollback?'restore':'apply');await startAndWait();code(rollback?'verify-restore':'verify');
 console.log(JSON.stringify({phase:rollback?'rolled-back-health-only':'activated-health-only',at:new Date().toISOString(),acceptanceStillRequired:true}));
}catch(error){
 console.error(JSON.stringify({phase:'activation-failed-restoring-baseline',error:String(error)}));
 run('systemctl',['stop','openclaw-gateway.service']);code('restore');await startAndWait();code('verify-restore');throw error;
}
