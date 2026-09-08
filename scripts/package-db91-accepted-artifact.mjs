// Export only the accepted runtime deltas. Never export config, state or logs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const owner=JSON.parse(fs.readFileSync(root+'/../../control/db91-parity.json'));
assert.equal(owner.owner,'codex-db91-production-equivalent-20260908');
assert.equal(execFileSync('systemctl',['show',owner.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const releaseId='v2026.9.1-db91.1',directory=root+'/tmp/'+releaseId;
assert(!fs.existsSync(directory),'Artifact export is immutable');
const load=name=>JSON.parse(fs.readFileSync(root+'/tmp/parity-results/'+name));
const foreground=load('B-full-1788884549666.json'),background=load('background-I12-B2-restarted.json');
const coordinator=load('coordinator-I12-B2-restarted.json'),recovery=load('recovery-i12-recovery2.json');
assert(foreground.completed&&foreground.jobs.length===90&&foreground.jobs.every(j=>j.verified));
assert(background.completed&&background.errors.length===0&&coordinator.completed&&recovery.completed);
const spec=[
 ['core','dist/state/openclaw-database-verify.worker.js','before-read-ahead-verification-worker.js'],
 ['core','dist/db91-integrity-bootstrap.mjs','before-read-ahead-integrity-bootstrap.mjs'],
 ['core','dist/db91-read-ahead.mjs',null],
 ['core','dist/openclaw-state-db-Bh3Bq87y.js','before-state-read-ahead.js'],
 ['core','dist/db91-state-read-ahead.mjs',null],
 ['core','dist/runtime-store.sqlite-D0DF2c9M.js','before-trajectory-sweep.js'],
 ['core','dist/db91-trajectory-sweep.mjs',null],
 ['worker','worker-pool.mjs','before-late-reply-worker-pool.mjs'],
 ['worker','late-worker-reply.mjs',null],
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest={releaseId,upstream:'2026.9.1',workerBase:'0.2.11-steer91',nodeVersion:'22.23.1',
 platformCommit:execFileSync('git',['-C',root+'/source','rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 testedSourceCommit:coordinator.sourceCommit,testedRuntimeSha256:'386187b8478e10247825a769fb8874f49490ba1e85022a915b1265c4cca74b8f6',
 files:[],acceptance:{foreground:90,realExec:36,backgroundCompleted:391,inFlightRecovery:true,duplicateEffects:0},
 excludes:['all state and credentials','all VLab config','temporary inspector/prototype observer','database-open and Kysely timing-only instrumentation'],
 limitations:['two background first replies exceeded 80s','final same-memory cold A/B/A not complete','channel acceptance required in production'],
 migration:'additive trajectory runtime byte-budget index; original retention policy and integrity checks unchanged'};
assert.equal(execFileSync('git',['-C',root+'/source','status','--porcelain'],{encoding:'utf8'}).trim(),'');
fs.mkdirSync(directory,{mode:0o755});
for(const [kind,name,baseline]of spec){
 const input=root+'/runtime/'+(kind==='core'?'openclaw':'production-worker')+'/'+name;
 assert.equal(fs.realpathSync(input),input);assert(fs.statSync(input).isFile());
 const bytes=fs.readFileSync(input);
 assert(!bytes.includes(Buffer.from(root)),'VLab absolute path in release code');
 const relative=kind+'/'+name,destination=directory+'/'+relative;
 fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o755});
 fs.writeFileSync(destination,bytes,{mode:0o644,flag:'wx'});
 execFileSync(process.execPath,['--check',destination]);
 manifest.files.push({path:relative,sha256:hash(bytes),bytes:bytes.length,beforeSha256:baseline?hash(fs.readFileSync(root+'/tmp/'+baseline)):null});
}
fs.writeFileSync(directory+'/manifest.json',JSON.stringify(manifest,null,2)+'\n',{mode:0o644,flag:'wx'});
execFileSync('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','-C',directory,'-cf',directory+'.tar','.']);
console.log(JSON.stringify({releaseId,directory,files:manifest.files,artifactSha256:hash(fs.readFileSync(directory+'.tar')),manifestSha256:hash(fs.readFileSync(directory+'/manifest.json'))}));
