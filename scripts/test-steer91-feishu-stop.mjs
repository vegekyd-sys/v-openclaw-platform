// User-authorized messages to the dedicated V - Lab DM only.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile),chat='oc_8f28eb6bcb3b847471693f066dac61c4';
const key='agent:makaron:feishu:direct:ou_775a78b0aaae67da5e15eeaf102e3cd9';
const stamp=Date.now(),old=`STOP_OLD_${stamp}`,next=`STOP_NEXT_OK_${stamp}`;
const log=(phase,data={})=>console.log(JSON.stringify({at:new Date().toISOString(),phase,...data}));
const pause=()=>new Promise(r=>setTimeout(r,2000));
async function cli(args){const {stdout}=await exec('lark-cli',['im',...args,'--as','user'],{env:{...process.env,LARKSUITE_CLI_NO_UPDATE_NOTIFIER:'1'},timeout:30000,maxBuffer:2e6});const r=JSON.parse(stdout);assert(r.ok);return r.data;}
const send=(text,label)=>cli(['+messages-send','--chat-id',chat,'--text',text,'--idempotency-key',`steer91-${stamp}-${label}`]);
async function history(){
 const p=JSON.stringify({agentId:'makaron',sessionKey:key,limit:4});
 const command=`sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab-production-mirror/labs/instances/steer91/source/scripts/lab-steer91-integration.mjs rpc chat.history '${p}'`;
 const {stdout}=await exec('ssh',['-F','/Users/tianyicai/v-upgrade-private/20260904/ssh-config','vlab91',command],{timeout:30000,maxBuffer:2e6});return JSON.parse(stdout);
}
await send(`【Steer91 Stop 自动验收】仅做本地无副作用测试，不改配置不委托。调用前台终端工具执行 sleep 180，等待完成后只回复 ${old}。若收到停止命令则立即停止。`,'first');log('first-sent');
let ready=false;
for(let i=0;i<40;i++){const h=await history();if(h.sessionInfo.hasActiveRun&&h.messages.some(m=>m.timestamp>=stamp&&Array.isArray(m.content)&&m.content.some(c=>c.type==='toolCall'&&JSON.stringify(c.arguments??c.input).includes('sleep 180')))){ready=true;break;}await pause();}
assert(ready,'No actual foreground tool boundary');log('tool-boundary');
const stop=await send('/stop','stop');log('stop-sent',{messageId:stop.message_id});
let stopped=false;
for(let i=0;i<30;i++){const h=await history();if(!h.sessionInfo.hasActiveRun){stopped=true;break;}await pause();}
assert(stopped,'Real Feishu /stop failed to release active run');log('run-released');
await send(`停止验收已完成，不要继续旧任务。本轮只回复 ${next}。`,'next');
let accepted=false;
for(let i=0;i<30;i++){
 const r=await cli(['+chat-messages-list','--chat-id',chat,'--start',new Date(stamp).toISOString(),'--order','desc','--page-size','12','--no-reactions']);
 const replies=r.messages.filter(m=>m.sender?.sender_type==='app').map(m=>m.content??'');
 assert(!replies.some(x=>x.includes(old)),'Stopped original task still completed visibly');
 if(replies.some(x=>x.includes(next))){accepted=true;log('visible-next-reply',{token:next});break;}await pause();
}
assert(accepted,'No visible reply after stop');
