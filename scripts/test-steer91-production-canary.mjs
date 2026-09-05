// User-authorized canary in V Backup. Does not patch/reset any session or config.
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
const exec=promisify(execFile),chat='oc_ede0fdc8e94dc40d7424691ddf80d948';
const key='agent:makaron:feishu:group:'+chat,bot='ou_b1cdeccdefbd26f53e51835b3cc7554a';
const stamp=Date.now(),old=`V_STEER_ORIGINAL_${stamp}`,next=`V_STEER_OK_${stamp}`;
const log=(phase,data={})=>console.log(JSON.stringify({at:new Date().toISOString(),phase,...data}));
const pause=()=>new Promise(r=>setTimeout(r,3000));
async function cli(args){const {stdout}=await exec('lark-cli',['im',...args,'--as','user'],{env:{...process.env,LARKSUITE_CLI_NO_UPDATE_NOTIFIER:'1'},timeout:30000,maxBuffer:2e6});const r=JSON.parse(stdout);assert(r.ok);return r.data;}
const send=(text,label)=>cli(['+messages-send','--chat-id',chat,'--text',`<at user_id="${bot}">V - Makaron</at> ${text}`,'--idempotency-key',`v-steer91-${stamp}-${label}`]);
async function inspect(history=false){
 const command='sudo /opt/node-v22.23.1/bin/node /tmp/inspect-steer91-production.mjs'+(history?` history '${key}'`:'');
 const {stdout}=await exec('ssh',['-o','ProxyCommand=/usr/local/bin/tailscale nc 100.82.39.107 22','-o','HostKeyAlias=100.82.39.107','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=8','-i','/Users/tianyicai/.ssh/v-zkda-20260719','ubuntu@100.82.39.107',command],{timeout:35000,maxBuffer:2e6});return JSON.parse(stdout);
}
const before=await inspect();assert.equal(before.sessions.find(x=>x.key===key)?.active,false);
const a=await send(`【上线 Steer 验收 A】仅做本地无副作用测试，不修改配置、不委托、不执行业务。请调用 exec 执行 sleep 45（返回进程ID则用process等它完成），完成后只回复 ${old}。执行期间若收到我的变更指令，以新指令改变本轮最终回复。`,'first');log('first-sent',{id:a.message_id});
let ready=false;
for(let i=0;i<30;i++){const h=await inspect(true);if(h.active&&h.messages.some(m=>m.timestamp>=stamp&&Array.isArray(m.content)&&m.content.some(c=>c.type==='toolCall'&&JSON.stringify(c.arguments??c.input).includes('sleep 45')))){ready=true;break;}await pause();}
assert(ready,'No foreground tool boundary on the expected session');log('tool-boundary');
const b=await send(`【上线 Steer 变更 B】改变正在执行的那个任务：不要回复 ORIGINAL 标记，不要另外开一轮任务。现有前台工具结束后，本轮最终只回复 ${next}。`,'second');log('steer-sent',{id:b.message_id});
let accepted=false;
for(let i=0;i<40;i++){
 const r=await cli(['+chat-messages-list','--chat-id',chat,'--start',new Date(stamp).toISOString(),'--order','desc','--page-size','15','--no-reactions']);
 const replies=r.messages.filter(m=>m.sender?.sender_type==='app');
 assert(!replies.some(x=>x.content?.includes(old)),'Original task completed without adopting steer');
 const reply=replies.find(x=>x.content?.includes(next));
 if(reply){accepted=true;log('visible-reply',{id:reply.message_id,token:next,content:reply.content});break;}await pause();
}
assert(accepted,'No visible changed-target reply');
const after=await inspect();log('final-status',{attemptsDelta:after.stats.workerAttempts-before.stats.workerAttempts,pending:after.pending,failedDelta:after.stats.failed-before.stats.failed});
