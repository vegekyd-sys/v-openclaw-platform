import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import{execFileSync,spawnSync}from'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const root='/home/openclaw/.openclaw',dir=root+'/backups/worker-affinity-production-20260908',core='/opt/openclaw-2026.9.1-v/openclaw';
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const e of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1);}
const secrets=Object.values(process.env).filter(s=>s.length>6);const c=JSON.parse(fs.readFileSync(root+'/openclaw.json'));
const collect=x=>{if(!x||typeof x!=='object')return;for(const[k,v]of Object.entries(x)){if(/key|token|secret|password|authorization/i.test(k)&&typeof v==='string'&&v.length>6)secrets.push(v);else collect(v);}};collect(c);
const redact=s=>{for(const v of secrets)s=s.split(v).join('<redacted>');return s.slice(0,6000);};
const latest=fs.readdirSync(dir).filter(n=>n.endsWith('-cfg-0.after')).sort().at(-1);assert(latest);
for(const p of [root+'/openclaw.json']){const r=spawnSync('/usr/sbin/runuser',['-u','openclaw','--',process.execPath,core+'/openclaw.mjs','config','validate','--json'],{encoding:'utf8',env:{...process.env,OPENCLAW_CONFIG_PATH:p},timeout:60000,maxBuffer:2e6});console.log(JSON.stringify({asServiceUser:true,staged:false,status:r.status,error:r.error?.code,stdout:redact(r.stdout??''),stderr:redact(r.stderr??'')}));}
