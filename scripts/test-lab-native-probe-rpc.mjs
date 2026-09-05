import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync}from'node:child_process';
const prod=process.argv[2]==='--production';assert.equal(os.hostname(),prod?'VM-8-2-ubuntu':'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const pid=execFileSync('systemctl',['show',prod?'openclaw-gateway.service':'openclaw-vlab-production-mirror-v8.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);process.env.OPENCLAW_CONFIG_PATH=prod?'/home/openclaw/.openclaw/openclaw.json':root+'/state/openclaw.json';
const {callGatewayFromCli}=await import((prod?'/opt/openclaw-2026.9.1-v/openclaw':root+'/runtime/npm-global/lib/node_modules/openclaw')+'/dist/plugin-sdk/gateway-runtime.js');
const at=Date.now();const r=await callGatewayFromCli('openclaw.chat',{timeout:'120000',json:true},{sessionId:'native-probe-0210-20260905',message:'This is a read-only acceptance test. Reply only NATIVE_PROBE_0210_OK. Do not change configuration or invoke business actions.'});
console.log(JSON.stringify({production:prod,elapsedMs:Date.now()-at,reply:r.reply,action:r.action}));
