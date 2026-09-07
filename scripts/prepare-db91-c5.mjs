import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {PROFILE, validateGrant} from '../lab/db91-benchmark-profile.mjs';
const root='/srv/vlab-production-mirror/labs/instances/db91-fix';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const manifest=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json'));
const grant=JSON.parse(fs.readFileSync(root+'/tmp/benchmark-grant.json'));
validateGrant(manifest,grant);
const [mode,gate,provenance='0']=process.argv.slice(2);
assert(['native','single','multi'].includes(mode));assert(['0','1'].includes(gate));assert(['0','1'].includes(provenance));
if(provenance==='1')assert(fs.existsSync(root+'/runtime/openclaw/dist/db91-memory-provenance.mjs'));
assert.equal(execFileSync('systemctl',['show',manifest.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
for (const [script,args] of [['prepare-db91-worker-evaluation.mjs',[mode]],['prepare-db91-full-gateway.mjs',[]],['prepare-db91-integrity-lab.mjs',[gate]]])
  execFileSync(process.execPath,[root+'/source/scripts/'+script,...args],{stdio:'inherit'});
for(const name of ['openclaw.json','worker-openclaw.json']) {
  const file=root+'/state/'+name,config=JSON.parse(fs.readFileSync(file));
  config.agents.defaults.maxConcurrent=5;
  const worker=config.plugins.entries['vlab-agent-worker-isolation']?.config;
  if(worker&&mode!=='native') {
    worker.minWorkers=worker.maxWorkers=mode==='single'?1:5;
    worker.sessionsPerWorker=mode==='single'?5:1;worker.warmSpareWorkers=0;
  }
  fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n',{mode:0o600});
}
const envFile=root+'/secrets.env';
fs.writeFileSync(envFile,fs.readFileSync(envFile,'utf8').split('\n').filter(l=>!l.startsWith('OPENCLAW_DB91_PROVENANCE_ENABLE=')&&!l.startsWith('OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE=')).join('\n')+'\nOPENCLAW_DB91_PROVENANCE_ENABLE='+provenance+'\nOPENCLAW_DB91_MEMORY_SCHEMA_ENABLE='+provenance+'\n',{mode:0o600});
console.log(JSON.stringify({mode,gate:gate==='1',provenance:provenance==='1',profile:PROFILE,actualTargetConcurrent:5,aggregateCPUPercent:200,aggregateMemoryMaxGiB:6,expiresAt:grant.until}));
