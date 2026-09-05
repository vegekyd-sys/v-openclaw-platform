// Bounded destructive-to-A-only isolation check. Restores A's test edits.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root='/srv/vlab-production-mirror/labs',node='/opt/vlab/node-v22.23.1-linux-x64/bin/node';
const owner=process.argv[2];
assert(owner,'Explicit owner required');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const a=read(`${root}/control/astra.json`), b=read(`${root}/control/isolation-check.json`);
assert.equal(a.owner,owner);assert.equal(b.owner,owner);
const ctl=(args)=>execFileSync(node,[`${root}/control/labctl.mjs`,...args],{encoding:'utf8',timeout:90000});
const pid=unit=>execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();
const shared='openclaw-vlab-production-mirror-v8.service';
const before={a:pid(a.unit),b:pid(b.unit),integration:pid(shared)};
for(const p of Object.values(before))assert.notEqual(p,'0');
const health=m=>JSON.parse(ctl(['cli',m.name,'--owner',owner,'--','gateway','health','--json']));
for(const m of [a,b]) {
  const h=health(m);assert.equal(h.ok,true);assert.deepEqual(h.plugins.errors,[]);assert.deepEqual(h.channels,{});
}
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const file=m=>`${m.root}/runtime/openclaw/package.json`;
const base=`${root}/baselines/${a.baseline}/runtime/openclaw/package.json`;
assert.notEqual(fs.statSync(file(a)).ino,fs.statSync(file(b)).ino);
assert.notEqual(fs.statSync(file(a)).ino,fs.statSync(base).ino);
const original=fs.readFileSync(file(a));
const hashes={a:hash(file(a)),b:hash(file(b)),baseline:hash(base)};
try {
  execFileSync('runuser',['-u',a.user,'--',node,'-e','require("fs").appendFileSync(process.argv[1],"\\n")',file(a)]);
  assert.notEqual(hash(file(a)),hashes.a);assert.equal(hash(file(b)),hashes.b);assert.equal(hash(base),hashes.baseline);
} finally {
  execFileSync('runuser',['-u',a.user,'--',node,'-e','require("fs").writeFileSync(process.argv[1],require("fs").readFileSync(0))',file(a)],{input:original});
}
for(const target of [`${b.root}/state/openclaw.json`,'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/state/openclaw.json']) {
  const r=spawnSync('runuser',['-u',a.user,'--',node,'-e','require("fs").accessSync(process.argv[1],require("fs").constants.R_OK | require("fs").constants.W_OK)',target]);
  assert.notEqual(r.status,0,'A must not access B or integration config');
}
const wrong=spawnSync(node,[`${root}/control/labctl.mjs`,'stop',b.name,'--owner','wrong-task'],{encoding:'utf8'});
assert.notEqual(wrong.status,0);assert.match(wrong.stderr,/Owner mismatch/);assert.equal(pid(b.unit),before.b);
ctl(['restart',a.name,'--owner',owner]);
const after={a:pid(a.unit),b:pid(b.unit),integration:pid(shared)};
assert.notEqual(after.a,before.a);assert.notEqual(after.a,'0');
assert.equal(after.b,before.b);assert.equal(after.integration,before.integration);
const h=health(b);assert.equal(h.ok,true);assert.deepEqual(h.plugins.errors,[]);
const result={at:new Date().toISOString(),result:'PASS',before,after,
  checks:['both-gateways-health-without-plugin-errors','no-messaging-channels','different-code-inodes','A-code-write-not-in-B-or-baseline','A-permission-denied-to-B-and-integration','wrong-owner-stop-rejected','restart-A-keeps-B-and-integration-PID','B-health-after-A-restart'],
  limits:'Only infrastructure isolation accepted; model/channel/feature acceptance is separate'};
fs.writeFileSync(`${root}/control/isolation-acceptance.log`,JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(result,null,2));
