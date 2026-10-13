import {randomBytes} from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import {spawn,execFileSync} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const root=path.dirname(process.env.VLAB_CANDIDATE_DATA);
if(!root.includes('/candidate-tests/runs/candidate-'))throw Error('Private Candidate only');
const evidence='/srv/vlab-production-mirror/labs/candidate-tests/evidence/voice-native-control-20261012';fs.mkdirSync(evidence,{recursive:true,mode:0o700});fs.chmodSync(path.dirname(evidence),0o711);
const voice=root+'/voice';fs.mkdirSync(voice);execFileSync('tar',['-xzf',process.argv[2],'-C',voice]);
execFileSync('npm',['ci','--ignore-scripts'],{cwd:voice,stdio:'ignore'});
const state=process.env.OPENCLAW_STATE_DIR,config=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
config.gateway.auth={...config.gateway.auth,mode:'token',token:randomBytes(32).toString('hex')};
config.plugins??={};config.plugins.load??={};config.plugins.load.paths=[...(config.plugins.load.paths??[]),voice+'/plugins/v-voice-gpt-live'];config.plugins.entries??={};config.plugins.entries['v-voice-gpt-live']={enabled:true};if(config.plugins.allow&&!config.plugins.allow.includes('v-voice-gpt-live'))config.plugins.allow.push('v-voice-gpt-live');
config.channels={};config.cron={...config.cron,enabled:false};config.browser={...config.browser,enabled:false};
if(config.agents.defaults?.heartbeat)config.agents.defaults.heartbeat.every='0m';
const old='/srv/vlab-production-mirror/labs/candidate-tests/runs/voice-capability-routing-20261011/data/state/agents/makaron/agent/openclaw-agent.sqlite';
const extensions=state+'/extensions';fs.mkdirSync(extensions,{recursive:true});
if(fs.existsSync(process.env.VLAB_SHARED_STATE_DIR+'/extensions'))execFileSync('rsync',['-a',process.env.VLAB_SHARED_STATE_DIR+'/extensions/',extensions+'/']);
const db=state+'/agents/makaron/agent/openclaw-agent.sqlite';fs.mkdirSync(path.dirname(db),{recursive:true});fs.copyFileSync(old,db);
for(const agent of config.agents.list??[])if(agent.id==='makaron')agent.workspace=process.env.OPENCLAW_WORKSPACE_DIR+'/makaron';
fs.mkdirSync(process.env.OPENCLAW_WORKSPACE_DIR+'/makaron',{recursive:true});
execFileSync('rsync',['-a','/srv/vlab-production-mirror/labs/candidate-tests/runs/voice-capability-routing-20261011/data/workspace/makaron/',process.env.OPENCLAW_WORKSPACE_DIR+'/makaron/']);
for(const entry of Object.values(config.plugins?.entries??{}))if(entry.config&&'minWorkers' in entry.config){entry.config.minWorkers=1;entry.config.maxWorkers=3;entry.config.gatewayConfigPath=process.env.OPENCLAW_CONFIG_PATH;entry.config.workerConfigPath=state+'/candidate-worker.json';}
fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH,JSON.stringify(config));
const runtime=process.env.VLAB_CANDIDATE_RUNTIME,node=process.execPath,env={...process.env,VLAB_OPENCLAW_AGENT_RUNTIME:runtime+'/openclaw/dist/plugin-sdk/agent-runtime.js',RTC_H5_PORT:'27541',npm_config_cache:root+'/cache/npm',NPM_CONFIG_CACHE:root+'/cache/npm',XDG_CACHE_HOME:root+'/cache',TMPDIR:root+'/tmp',RTC_H5_TRANSCRIPT_DIR:evidence+'/transcripts',RTC_H5_AVATAR_LOG_DIR:evidence+'/avatars',VOICE_QA_SOURCE:voice,VOICE_GPT_PROVIDER:'v-voice-gpt-live',VOICE_QA_AUDIT:evidence+'/gateway.private.jsonl'};
// Private test-only credential input; keys never enter the package or Gateway.
const controlFixture='/tmp/voice-native-control-20261012/control-env.private.json';
if(fs.existsSync(controlFixture)){
 const secret=JSON.parse(fs.readFileSync(controlFixture));
 for(const key of ['OPENROUTER_API_KEY','VOICE_CALL_CONTROL_API_KEY'])if(typeof secret[key]==='string')env[key]=secret[key];
 env.VOICE_HOST_CALL_CONTROL='1';
}
fs.mkdirSync(root+'/tmp',{recursive:true});
// Optional owner-only CLI fixture for authorized real Feishu acceptance.
// Copy credentials into this Candidate; never use shared CLI writable storage.
const larkFixture='/tmp/voice-native-control-20261012/lark-fixture';
if(fs.existsSync(larkFixture+'/ready')){
 execFileSync('cp',['-a',larkFixture+'/config',root+'/lark-config']);
 execFileSync('cp',['-a',larkFixture+'/data',root+'/lark-data']);
 fs.mkdirSync(root+'/bin');fs.copyFileSync(larkFixture+'/lark-cli',root+'/bin/lark-cli');fs.chmodSync(root+'/bin/lark-cli',0o700);
 Object.assign(env,{LARKSUITE_CLI_CONFIG_DIR:root+'/lark-config',LARKSUITE_CLI_DATA_DIR:root+'/lark-data',DIRECT_LARK_CLI_CONFIG_DIR:root+'/lark-config',DIRECT_LARK_CLI_DATA_DIR:root+'/lark-data',PATH:root+'/bin:'+env.PATH,VOICE_QA_LARK_LOG:root+'/lark-guard.private.jsonl'});
}
// Agent tests require the configured Worker identity; never change shared files.
execFileSync('chown',['-R','lab-db91-parity:lab-db91-parity',root]);execFileSync('chown',['-R','lab-db91-parity:lab-db91-parity',evidence]);
const uid=Number(execFileSync('id',['-u','lab-db91-parity']).toString()),gid=Number(execFileSync('id',['-g','lab-db91-parity']).toString());
const start=(args,log)=>spawn(node,args,{cwd:voice,env,uid,gid,stdio:['ignore',fs.openSync(evidence+'/'+log,'a',0o600),fs.openSync(evidence+'/'+log,'a',0o600)]});
const children=[];
for (const f of ['stop','ready.json']) {try {fs.unlinkSync(evidence+'/'+f);} catch (e) {if(e.code!=='ENOENT')throw e;}}
const tunnelLog=evidence+'/cloudflared.log';fs.writeFileSync(tunnelLog,'',{mode:0o600});
const tunnel=spawn('/usr/local/bin/cloudflared',['tunnel','--url','http://127.0.0.1:27541','--no-autoupdate','--protocol','http2'],{stdio:['ignore',fs.openSync(tunnelLog,'a'),fs.openSync(tunnelLog,'a')]});children.push(tunnel);
let publicOrigin;for(let i=0;i<120;i++){publicOrigin=fs.readFileSync(tunnelLog,'utf8').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];if(publicOrigin)break;await delay(500);}if(!publicOrigin)throw Error('Candidate tunnel did not start');
const accessToken=randomBytes(32).toString('hex');
Object.assign(env,{GPT_LIVE_H5_PORT:'27541',GPT_LIVE_H5_BASE_PATH:'/voice',GPT_LIVE_H5_PUBLIC_ORIGIN:publicOrigin,GPT_LIVE_H5_ACCESS_TOKEN:accessToken,RTC_H5_BASE_PATH:'/voice',RTC_H5_PUBLIC_ORIGIN:publicOrigin,RTC_H5_ACCESS_TOKEN:accessToken});
// Credentials remain server-side, with no inherited production caller bindings.
delete env.VOICE_ENTRIES_FILE;

let gateway,ready=false;
for(let attempt=0;attempt<2;attempt++){
 fs.writeFileSync(evidence+'/gateway.log','',{mode:0o600});
 gateway=start(['--max-old-space-size=4096',runtime+'/openclaw/dist/index.js','gateway','--port',String(config.gateway.port)],'gateway.log');children.push(gateway);
 for(let i=0;i<240;i++){
  try{const r=await fetch('http://127.0.0.1:'+config.gateway.port+'/health');if(r.ok){ready=true;break;}}catch{}
  if(gateway.exitCode!==null)break;
  await delay(500);
 }
 if(ready)break;
 // OpenClaw's cold-start plugin migration explicitly requires one restart.
 // Apply it only to our private process after it has exited.
 if(gateway.exitCode===null||!fs.readFileSync(evidence+'/gateway.log','utf8').includes('migration inputs changed during startup convergence'))break;
}
if(!ready)throw Error('Private Gateway did not start');
const h5=start(['--import',path.resolve('lab/candidate/voice-native-control-probe.mjs'),voice+'/lab/gpt-live-h5/server.mjs'],'voice.log');children.push(h5);
for(let i=0;i<80;i++){try{const r=await fetch(publicOrigin+'/voice/',{signal:AbortSignal.timeout(2500)});if(r.ok){fs.writeFileSync(evidence+'/ready.json',JSON.stringify({root,voicePort:27541,gatewayPort:config.gateway.port,gatewayPid:gateway.pid,voicePid:h5.pid,publicOrigin,url:publicOrigin+'/voice/?entry=tianyi#access='+accessToken}),{mode:0o600});ready=true;break;}}catch{}await delay(500);}
if(!fs.existsSync(evidence+'/ready.json'))throw Error('Voice did not start');
const end=Date.now()+18*60*1000;while(Date.now()<end&&!fs.existsSync(evidence+'/stop'))await delay(500);
for(const c of children)c.kill('SIGTERM');await delay(2000);
console.log(JSON.stringify({candidate:'voice-native-control',ready:true,evidence,stopped:true}));
