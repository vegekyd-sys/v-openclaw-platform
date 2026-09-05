import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const pid=execFileSync('systemctl',['show','openclaw-vlab-production-mirror-v8.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean)) process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
const owner=fs.statSync(root+'/state/openclaw.json');process.setgid(owner.gid);process.setuid(owner.uid);
const {readVisibleSessionTranscriptMessageEntries}=await import(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/session-transcript-runtime.js');
const entries=await readVisibleSessionTranscriptMessageEntries({agentId:'makaron',sessionId:'b0d6da6b-9cb2-4591-84f5-8adbe6be3404',sessionKey:'agent:makaron:feishu:direct:ou_775a78b0aaae67da5e15eeaf102e3cd9'});
console.log(JSON.stringify(entries.slice(-12).map(e=>({id:e.id,createdAt:e.createdAt,role:e.message.role,stopReason:e.message.stopReason,keys:Object.keys(e.message),content:e.message.content?.filter?.(c=>c.type!=='thinking').map(c=>({type:c.type,name:c.name,text:c.text?.slice(0,350)}))})),null,2));
