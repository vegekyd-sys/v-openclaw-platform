import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const unit='openclaw-vlab-production-mirror-v8.service';
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const core=root+'/runtime/npm-global/lib/node_modules/openclaw';
const mode=process.argv[2]??'inspect';
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>0);
const env=Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean).map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
assert.equal(env.OPENCLAW_CONFIG_PATH,root+'/state/openclaw.json');
Object.assign(process.env,env);
const {callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const w=await callGatewayFromCli('vlab.workers.status',{timeout:'20000',json:true},{});
console.log(JSON.stringify({phase:'before',pending:w.pending,workers:w.workers?.map(x=>({activeCount:x.activeCount,ready:x.ready,queued:x.queued}))}));
if(mode==='inspect')process.exit(0);
assert.equal(mode,'install');
const lease=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json'));
assert.equal(lease.owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
assert.equal(w.pending,0);assert(w.workers.every(x=>x.activeCount===0 && (!x.queued || x.queued===0)));
const health=await callGatewayFromCli('health',{timeout:'20000',json:true},{});assert(health.ok);
const cfg=JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH));
const overlay=cfg.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath;
assert(overlay.startsWith(root+'/experiments/'));
const backup=root+'/backups/browser-session-runtime-0.4.6';assert(!fs.existsSync(backup));fs.mkdirSync(backup,{mode:0o700});
const old=root+'/runtime/plugins/v-browser-device-0.4.5';
const dest=root+'/runtime/plugins/v-browser-device-0.4.6';assert(!fs.existsSync(dest));
fs.cpSync('/tmp/v-browser-session-runtime-candidate/openclaw-plugin',dest,{recursive:true});
fs.cpSync(old+'/node_modules',dest+'/node_modules',{recursive:true});
assert.equal(JSON.parse(fs.readFileSync(dest+'/package.json')).version,'0.4.6');
execFileSync('chown',['-R','vlab:vlab',dest]);
const changes=[env.OPENCLAW_CONFIG_PATH,overlay].map((p,i)=>{
 const c=JSON.parse(fs.readFileSync(p));assert(c.plugins.load.paths.includes(old));
 fs.copyFileSync(p,backup+`/${i===0?'main':'worker'}.json.before`);
 c.plugins.load.paths=c.plugins.load.paths.map(x=>x===old?dest:x);
 // Keep the ordinary default local, so a successful V Browser test cannot be
 // masked by the old Lab-wide vbrowser-01 default. Only this Lab config changes.
 c.browser.defaultProfile='openclaw';
 return {p,c};
});
// A transient systemd unit disappears after stop. Keep its definition loaded
// by issuing restart as one transaction, never separate stop/start calls.
fs.writeFileSync(backup+'/unit.before.txt',execFileSync('systemctl',['cat',unit]));
for(const {p,c} of changes)fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
execFileSync('systemctl',['restart',unit],{timeout:60000});
console.log(JSON.stringify({installed:true,backup,pluginVersion:'0.4.6',productionChanged:false}));
