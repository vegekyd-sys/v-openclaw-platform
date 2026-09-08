// Read only metadata from this benchmark's synthetic chats; no message text/args.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-fix';
const file=process.argv[2];assert(/^hi-\d+\.json$/.test(file));
const report=JSON.parse(fs.readFileSync(root+'/workspace/'+file));
const pid=execFileSync('systemctl',['show','openclaw-lab-db91-fix.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const v of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=v.indexOf('=');if(i>0)process.env[v.slice(0,i)]=v.slice(i+1);}
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));
const {GatewayClient}=await import(root+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');let client;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client?.stop();reject(Error('connect deadline'));},20000);client=new GatewayClient({url:'ws://127.0.0.1:26300',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);}});client.start();});
try{
  for(const j of report.jobs){assert(j.sessionKey.includes('db91-hi-'));
    const h=await client.request('chat.history',{agentId:'makaron',sessionKey:j.sessionKey,limit:100},{timeoutMs:20000});
    if(process.argv.includes('--first-command')){
      const tool=(h.messages??[]).flatMap(m=>Array.isArray(m.content)?m.content:[]).find(c=>c.type==='toolCall');
      const command=String(tool?.arguments?.command??'').replace(/https?:\/\/[^\s'"<>]+/g,'[URL]').replace(/(?:Bearer\s+|--(?:token|password|api-key)\s+|(?:API_KEY|TOKEN|PASSWORD)=)[^\s]+/gi,'[REDACTED]').replace(/[A-Za-z0-9_-]{32,}/g,'[LONG_ID]');
      console.log(JSON.stringify({runId:j.runId,firstTool:tool?.name,firstCommand:command.slice(0,300)}));continue;
    }
    console.log(JSON.stringify({runId:j.runId,mode:j.mode,messages:(h.messages??[]).map(m=>({role:m.role,model:m.model,stopReason:m.stopReason,isError:m.isError===true,
      content:(Array.isArray(m.content)?m.content:[{type:'text',text:typeof m.content==='string'?m.content:''}]).map(c=>({type:c.type,toolName:c.type==='toolCall'?c.name:undefined,textChars:c.text?.length,
        diagnosticFlags:typeof c.text==='string'?['not found','not available','unknown tool','permission','denied','ENOENT','EACCES','invalid','must','error','read','bootstrap'].filter(s=>c.text.toLowerCase().includes(s.toLowerCase())):undefined,
        knownBootstrapFile:c.type==='toolCall'&&['AGENTS.md','SOUL.md','BOOTSTRAP.md','USER.md','IDENTITY.md','MEMORY.md'].find(name=>JSON.stringify(c.arguments??{}).includes(name)),
        commandKeywords:c.type==='toolCall'?['python','node','curl','git','sqlite','openclaw','bootstrap','systemctl','labctl','chmod','mkdir','rm ','cp ','printf','find','grep','ls ','cat '].filter(s=>JSON.stringify(c.arguments??{}).toLowerCase().includes(s)):undefined,
        operation:c.type==='toolCall'&&typeof c.arguments?.command==='string'?(c.arguments.command.match(/^\s*(pwd|ls|cat|find|sed|printf|rg|head)\b/)?.[1]??'other'):undefined})),
      usage:m.usage?{input:m.usage.input,cacheRead:m.usage.cacheRead,output:m.usage.output}:undefined,
    }))}));
  }
}finally{client.stop();}
