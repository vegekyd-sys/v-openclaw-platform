import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH='/home/openclaw/.openclaw/backups/astra-browser-nativehooks-20260905/0.apply.candidate.json';
const {readConfigFileSnapshotForWrite}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/config-runtime.js');
const r=await readConfigFileSnapshotForWrite();
console.log(JSON.stringify({keys:Object.keys(r),valid:r.snapshot?.valid,issues:r.snapshot?.issues,warnings:r.snapshot?.warnings}));
