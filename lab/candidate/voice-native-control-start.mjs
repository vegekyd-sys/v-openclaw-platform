import fs from 'node:fs';import path from 'node:path';import {spawn,execFileSync} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const root=path.dirname(process.env.VLAB_CANDIDATE_DATA);
if(!root.includes('/candidate-tests/runs/candidate-'))throw Error('Private Candidate only');
const evidence='/srv/vlab-production-mirror/labs/candidate-tests/evidence/voice-native-control-20261012';fs.mkdirSync(evidence,{recursive:true,mode:0o700});
const voice=root+'/voice';fs.mkdirSync(voice);execFileSync('tar',['-xzf',process.argv[2],'-C',voice]);
execFileSync('npm',['ci','--ignore-scripts'],{cwd:voice,stdio:'ignore'});
const state=process.env.OPENCLAW_STATE_DIR,config=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
config.channels={};config.cron={...config.cron,enabled:false};config.browser={...config.browser,enabled:false};
if(config.agents.defaults?.heartbeat)config.agents.defaults.heartbeat.every='0m';
const old='/srv/vlab-production-mirror/labs/candidate-tests/runs/voice-capability-routing-20261011/data/state/agents/makaron/agent/openclaw-agent.sqlite';
const db=state+'/agents/makaron/agent/openclaw-agent.sqlite';fs.mkdirSync(path.dirname(db),{recursive:true});fs.copyFileSync(old,db);
for(const agent of config.agents.list??[])if(agent.id==='makaron')agent.workspace=process.env.OPENCLAW_WORKSPACE_DIR+'/makaron';
fs.mkdirSync(process.env.OPENCLAW_WORKSPACE_DIR+'/makaron',{recursive:true});
execFileSync('rsync',['-a','/srv/vlab-production-mirror/labs/candidate-tests/runs/voice-capability-routing-20261011/data/workspace/makaron/',process.env.OPENCLAW_WORKSPACE_DIR+'/makaron/']);
for(const entry of Object.values(config.plugins?.entries??{}))if(entry.config&&'minWorkers' in entry.config){entry.config.minWorkers=1;entry.config.maxWorkers=3;}
fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH,JSON.stringify(config));
const runtime=process.env.VLAB_CANDIDATE_RUNTIME,node=process.execPath,env={...process.env,VLAB_OPENCLAW_AGENT_RUNTIME:runtime+'/openclaw/dist/plugin-sdk/agent-runtime.js',RTC_H5_PORT:'27541',RTC_H5_TRANSCRIPT_DIR:evidence+'/transcripts',RTC_H5_AVATAR_LOG_DIR:evidence+'/avatars',VOICE_QA_SOURCE:voice,VOICE_QA_AUDIT:evidence+'/gateway.private.jsonl'};
// Agent tests require the configured Worker identity; never change shared files.
execFileSync('chown',['-R','lab-db91-parity:lab-db91-parity',root]);execFileSync('chown',['-R','lab-db91-parity:lab-db91-parity',evidence]);
const uid=Number(execFileSync('id',['-u','lab-db91-parity']).toString()),gid=Number(execFileSync('id',['-g','lab-db91-parity']).toString());
const start=(args,log)=>spawn(node,args,{cwd:voice,env,uid,gid,stdio:['ignore',fs.openSync(evidence+'/'+log,'a',0o600),fs.openSync(evidence+'/'+log,'a',0o600)]});
const children=[];
const gateway=start(['--max-old-space-size=4096',runtime+'/openclaw/dist/index.js','gateway','--port',String(config.gateway.port)],'gateway.log');children.push(gateway);
let ready=false;for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:'+config.gateway.port+'/health');if(r.ok){ready=true;break;}}catch{}await delay(500);}if(!ready)throw Error('Private Gateway did not start');
const h5=start(['--import',path.resolve('lab/candidate/voice-native-control-probe.mjs'),voice+'/lab/gpt-live-h5/server.mjs'],'voice.log');children.push(h5);
for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:27541/');if(r.ok){fs.writeFileSync(evidence+'/ready.json',JSON.stringify({root,voicePort:27541,gatewayPort:config.gateway.port,gatewayPid:gateway.pid,voicePid:h5.pid}));ready=true;break;}}catch{}await delay(500);}
if(!fs.existsSync(evidence+'/ready.json'))throw Error('Voice did not start');
const end=Date.now()+25*60*1000;while(Date.now()<end&&!fs.existsSync(evidence+'/stop'))await delay(500);
for(const c of children)c.kill('SIGTERM');await delay(2000);
console.log(JSON.stringify({candidate:'voice-native-control',ready:true,evidence,stopped:true}));
