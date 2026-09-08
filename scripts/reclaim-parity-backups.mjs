// VLab only: preserve exact archive contents before removing inactive backup files.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
assert.equal(process.getuid(), 0);
const owner = 'codex-db91-production-equivalent-20260908';
const lease = '/srv/vlab-production-mirror/labs/control/integration.json';
assert.equal(JSON.parse(fs.readFileSync(lease)).owner, owner);
const dir = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/tmp';
assert([undefined,'synthetic'].includes(process.argv[2]));
const targets = process.argv[2]==='synthetic'
 ? ['native-gate-v1','native-gate-v2','native-gate-scale-v3'].map(n=>'/srv/vlab-production-mirror/labs/instances/db91-fix/tmp/'+n+'/state/agents/db91synthetic/agent/openclaw-agent.sqlite')
 : [dir + '/makaron-agent.before-auth-refresh.sqlite', dir + '/vcodex-auth-migrate-backup'];
const out = '/var/log/vlab-space-cleanup/20260908-production-equivalent-'+Date.now();
fs.mkdirSync(out, {recursive:true, mode:0o700});
const hash = async p => {const h=createHash('sha256');for await (const c of fs.createReadStream(p))h.update(c);return h.digest('hex');};
function unused(p) {
  const r=spawnSync('fuser',[p],{encoding:'utf8'});
  assert.equal(r.status,1, 'backup is in use or reference check failed');
  assert.equal(r.stdout.trim(),'');assert.equal(r.stderr.trim(),'');
}
function services() {return execFileSync('systemctl',['list-units','--type=service','--state=running','--no-legend','--no-pager'],{encoding:'utf8'}).split('\n').filter(s=>/openclaw|vlab|nightshift/.test(s)).map(s=>s.trim().split(/\s+/)[0]).map(u=>({unit:u,state:execFileSync('systemctl',['show',u,'-p','MainPID','-p','ActiveState','-p','NRestarts'],{encoding:'utf8'}).trim()}));}
function run(c,a) {return new Promise((resolve,reject)=>{const p=spawn(c,a,{stdio:['ignore','inherit','inherit']});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error(c+' exit '+code)));});}
const beforeServices = services();
fs.writeFileSync(out+'/services-before.json',JSON.stringify(beforeServices),{mode:0o600,flag:'wx'});
for (const p of targets) {
  assert.equal(fs.realpathSync(p),p);unused(p);
  const st=fs.statSync(p);assert(st.isFile());
  const z=p+'.parity-preserved.zst';assert(!fs.existsSync(z));
  const disk=fs.statfsSync(dir);assert(disk.bavail*disk.bsize>3*1024**3,'reserve too low');
  const sha=await hash(p);console.log(JSON.stringify({phase:'compress',path:p,bytes:st.size}));
  await run('nice',['-n','15','zstd','-T1','-1','--no-progress',p,'-o',z]);fs.chmodSync(z,0o600);
  const h=createHash('sha256');const child=spawn('zstd',['-dc','--',z],{stdio:['ignore','pipe','inherit']});
  const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('decompress '+code)));});
  for await (const c of child.stdout)h.update(c);await ended;assert.equal(h.digest('hex'),sha);
  const now=fs.statSync(p);for(const k of ['ino','dev','size','mtimeMs','ctimeMs'])assert.equal(now[k],st[k]);unused(p);
  assert.equal(JSON.parse(fs.readFileSync(lease)).owner,owner);
  const evidence={action:'compress_verified_backup',path:p,archive:z,sha256:sha,beforeBytes:st.size,afterBytes:fs.statSync(z).size,at:new Date().toISOString()};
  fs.appendFileSync(out+'/manifest.jsonl',JSON.stringify({...evidence,phase:'verified-before-unlink'})+'\n',{mode:0o600});
  fs.unlinkSync(p);fs.appendFileSync(out+'/manifest.jsonl',JSON.stringify({...evidence,phase:'complete'})+'\n',{mode:0o600});
  console.log(JSON.stringify(evidence));
}
const afterServices=services();fs.writeFileSync(out+'/services-after.json',JSON.stringify(afterServices),{mode:0o600,flag:'wx'});
assert.deepEqual(afterServices,beforeServices,'running service state changed; inspect before proceeding');
console.log(JSON.stringify({servicesUnchanged:true,freeBytes:fs.statfsSync(dir).bavail*fs.statfsSync(dir).bsize}));
