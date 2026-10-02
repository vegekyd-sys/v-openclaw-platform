// Disposable full-path test bootstrap. It never changes shared runtime/state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {setTimeout as delay} from 'node:timers/promises';
import {configureCandidateOpenAIAuth,installCandidateOpenAIAuth} from './gpt-live-call-live-auth.mjs';
import {GPT_LIVE_CALL_INSTRUCTIONS} from './gpt-live-h5/instructions.mjs';
import {createLiveH5Server} from './gpt-live-h5/server.mjs';
import {parsePublicProgressDiagnostics} from './gpt-live-h5-provenance-evidence.mjs';

const runtime=process.env.VLAB_CANDIDATE_RUNTIME,state=process.env.OPENCLAW_STATE_DIR,configPath=process.env.OPENCLAW_CONFIG_PATH;
assert(runtime&&state&&configPath,'Disposable candidate environment required');
const scratch=path.join(state,'tmp');fs.mkdirSync(scratch,{recursive:true,mode:0o700});
for(const key of ['TMPDIR','TMP','TEMP'])process.env[key]=scratch;
if(process.env.GPT_LIVE_CALL_AUDIO_FIXTURE_GZIP) {
  const audio=gunzipSync(fs.readFileSync(path.resolve(process.env.GPT_LIVE_CALL_AUDIO_FIXTURE_GZIP)),{maxOutputLength:32*1024**2});
  assert(audio.subarray(0,4).toString()==='RIFF'&&audio.subarray(8,12).toString()==='WAVE','Synthetic input must be a WAV');
  const fixture=path.join(state,'synthetic-main-input.wav');fs.writeFileSync(fixture,audio,{mode:0o600,flag:'wx'});
  process.env.GPT_LIVE_CALL_AUDIO_FIXTURE=fixture;
}
const clipsArchive=process.env.GPT_LIVE_H5_USER_CLIPS_ARCHIVE;
if(clipsArchive) {
  const names=execFileSync('tar',['-tzf',path.resolve(clipsArchive)],{encoding:'utf8'}).trim().split('\n');
  const allowed=new Set(['silence.wav',...['long-request','long-child-request','chat','barge','new-greeting'].flatMap(name=>[name+'.wav',name+'.txt'])]);
  assert(names.length===allowed.size&&names.every(name=>allowed.has(name))&&new Set(names).size===names.length,'Unexpected or missing synthetic clip archive member');
  const entries=execFileSync('tar',['-tvzf',path.resolve(clipsArchive)],{encoding:'utf8'}).trim().split('\n');
  let expandedBytes=0;
  for(const entry of entries) {
    const fields=entry.trim().split(/\s+/u),size=Number(fields[2]);
    assert(fields[0].startsWith('-')&&Number.isSafeInteger(size)&&size>=0&&size<=24*1024**2,'Synthetic clip must be a bounded regular file');
    expandedBytes+=size;
  }
  assert(entries.length===names.length&&expandedBytes<=40*1024**2,'Synthetic clip archive size mismatch');
  const clips=path.join(state,'synthetic-user-clips');fs.mkdirSync(clips,{mode:0o700});
  execFileSync('tar',['-xzf',path.resolve(clipsArchive),'--no-same-owner','--no-same-permissions','-C',clips]);
  process.env.GPT_LIVE_H5_USER_CLIPS_DIR=clips;
}
process.env.XDG_CACHE_HOME=path.join(state,'cache');fs.mkdirSync(process.env.XDG_CACHE_HOME,{recursive:true,mode:0o700});
const config=JSON.parse(fs.readFileSync(configPath));
config.channels={};config.cron={...(config.cron??{}),enabled:false};
config.logging={...(config.logging??{}),file:path.join(state,'candidate-gateway.log')};
config.talk={...(config.talk??{}),realtime:{...(config.talk?.realtime??{}),instructions:GPT_LIVE_CALL_INSTRUCTIONS}};
configureCandidateOpenAIAuth(config);
const allowed=new Set(['vlab-agent-worker-isolation','deepseek','openai','xai']);
if(config.plugins?.entries)config.plugins.entries=Object.fromEntries(Object.entries(config.plugins.entries).filter(([id])=>allowed.has(id)));
if(Array.isArray(config.plugins?.allow))config.plugins.allow=config.plugins.allow.filter(id=>allowed.has(id));
const worker=config.plugins?.entries?.['vlab-agent-worker-isolation']?.config;
assert(worker?.workerConfigPath,'Worker configuration unavailable');
const relative=path.relative(state,worker.workerConfigPath);assert(!relative.startsWith('..'));
const workerBytes=fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR,relative),'utf8')
 .replaceAll(process.env.VLAB_SHARED_STATE_DIR,state).replaceAll('/srv/vlab-production-mirror/labs/instances/db91-parity/runtime',runtime);
fs.mkdirSync(path.dirname(worker.workerConfigPath),{recursive:true});fs.writeFileSync(worker.workerConfigPath,workerBytes,{mode:0o600});
worker.gatewayConfigPath=configPath;fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});
const {g:openAgentDatabase,a:closeAgentDatabases}=await import(`${runtime}/openclaw/dist/openclaw-agent-db-CUTe8BX6.js`);
const privateAgentDb=path.join(state,'agents/makaron/agent/openclaw-agent.sqlite');fs.mkdirSync(path.dirname(privateAgentDb),{recursive:true,mode:0o700});
openAgentDatabase({agentId:'makaron',path:privateAgentDb,env:process.env});closeAgentDatabases();installCandidateOpenAIAuth();
const tracePath=path.join(state,'gateway-stdout.log'),sessionPath=path.join(state,'h5-session.json');
fs.writeFileSync(tracePath,'',{flag:'wx',mode:0o600});
let gateway,client,bridge,smoke;let recent=[];
function launch() {
  gateway=spawn(process.execPath,['--max-old-space-size=4096',`${runtime}/openclaw/dist/index.js`,'gateway','--port',String(config.gateway.port)],{env:{...process.env,OPENCLAW_GATEWAY_PORT:String(config.gateway.port),OPENCLAW_GPT_LIVE_PROGRESS_TRACE:'1'},stdio:['ignore','pipe','pipe']});
  for(const stream of [gateway.stdout,gateway.stderr])stream.on('data',chunk=>{fs.appendFileSync(tracePath,chunk);recent.push(String(chunk));if(recent.length>30)recent.shift();});
}
async function stop(child) {
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
  await Promise.race([done,delay(10000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await Promise.race([done,delay(2000)]);
}
async function port() {
  const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const result=server.address().port;await new Promise(resolve=>server.close(resolve));return result;
}
try {
  const {GatewayClient}=await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
  launch();let ready=false,migrationRestarted=false;
  const token=String(config.gateway.auth.token).replace(/\$\{([^}]+)\}/gu,(_,key)=>{assert(process.env[key]);return process.env[key];});
  for(const deadline=Date.now()+300000;Date.now()<deadline;) {
    try {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Private Gateway connection deadline')),5000);
        client=new GatewayClient({url:`ws://127.0.0.1:${config.gateway.port}`,token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],
          onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:error=>{clearTimeout(timer);reject(error);},onEvent:event=>bridge?.emit(event)});client.start();
      });
      const catalog=await client.request('talk.catalog',{}, {timeoutMs:15000});
      assert(catalog.realtime?.providers?.some(p=>p.id==='openai'&&p.configured&&(p.models??[]).some(m=>(typeof m==='string'?m:m.id)==='gpt-live-1-codex')),'Native GPT Live provider unavailable');
      ready=true;break;
    } catch(error) {
      client?.stop();client=null;
      if(gateway.exitCode!==null) {
        if(!migrationRestarted&&recent.some(line=>line.includes('plugin migration inputs changed during startup convergence'))){migrationRestarted=true;launch();}
        else throw Error('Private Gateway stopped before native provider readiness');
      }
      await delay(1000);
    }
  }
  assert(ready,'Private Gateway readiness deadline');
  const guardedGateway={request:async(method,params,options)=>{
    const result=await client.request(method,params,options);
    if(method==='talk.client.create')fs.writeFileSync(sessionPath,JSON.stringify({sessionKey:params.sessionKey,voiceSessionId:result.voiceSessionId}),{mode:0o600});
    return result;
  }};
  bridge=createLiveH5Server({gateway:guardedGateway,offer:async(reservation,sdp)=>{
    const response=await fetch(`http://127.0.0.1:${config.gateway.port}${reservation.offerUrl}`,{method:'POST',headers:{authorization:`Bearer ${reservation.clientSecret}`,'content-type':'application/sdp'},body:sdp,signal:AbortSignal.timeout(25000)});
    assert(response.ok,'Native SDP exchange failed');return response.text();
  }});
  const h5port=await port();await new Promise(resolve=>bridge.server.listen(h5port,'127.0.0.1',resolve));
  const appSha=createHash('sha256').update(fs.readFileSync('lab/gpt-live-h5/app.js')).digest('hex');
  const cases=(process.env.GPT_LIVE_H5_CASE??'workflow').split(',');
  assert(cases.every(value=>['workflow','cancel','close-reopen','barge-chat'].includes(value)),'Unknown candidate H5 case');
  const evidenceBase=process.env.GPT_LIVE_H5_EVIDENCE_DIR;
  assert(evidenceBase&&path.isAbsolute(evidenceBase),'Absolute candidate evidence directory required');
  fs.mkdirSync(evidenceBase,{recursive:true,mode:0o700});
  const results=[];
  for(const testCase of cases) {
    const helper=testCase==='workflow'?'lab/gpt-live-h5-provenance-smoke.mjs':'lab/gpt-live-h5-control-smoke.mjs';
    const clips=process.env.GPT_LIVE_H5_USER_CLIPS_DIR;
    smoke=spawn(process.execPath,[helper],{env:{...process.env,
      GPT_LIVE_H5_CASE:testCase,GPT_LIVE_H5_EVIDENCE_DIR:cases.length>1?path.join(evidenceBase,testCase):evidenceBase,
      ...(clips?{GPT_LIVE_H5_USER_CLIPS_DIR:path.resolve(clips),...(testCase!=='workflow'?{GPT_LIVE_CALL_AUDIO_FIXTURE:path.join(path.resolve(clips),'silence.wav')}:{})}:{}),
      GPT_LIVE_H5_READY:'1',GPT_LIVE_H5_URL:`http://127.0.0.1:${h5port}`,GPT_LIVE_H5_APP_SHA:appSha,GPT_LIVE_H5_GATEWAY_PID:String(gateway.pid),
      GPT_LIVE_H5_RUNTIME_ROOT:runtime+'/openclaw',GPT_LIVE_H5_TRACE_PATH:tracePath,GPT_LIVE_H5_SESSION_PATH:sessionPath},stdio:'inherit'});
    const code=await new Promise((resolve,reject)=>{smoke.once('error',reject);smoke.once('exit',code=>resolve(code));});
    results.push({case:testCase,code,passed:code===0});
  }
  fs.writeFileSync(path.join(evidenceBase,'case-results.json'),JSON.stringify(results,null,2)+'\n',{mode:0o600});
  assert(results.every(result=>result.passed),'Full native H5 cases failed: '+results.filter(result=>!result.passed).map(result=>result.case).join(', '));
} catch(error) {
  console.error(JSON.stringify({candidateFailed:error.message,gatewayExit:gateway?.exitCode??null,
    gatewayRecent:recent.slice(-8).map(line=>line.replace(/(token|api.?key|authorization|secret|password)[=: ]+[^\s]+/giu,'$1=[redacted]').replace(/https?:\/\/\S+/giu,'[endpoint]').slice(0,300))}));process.exitCode=1;
} finally {
  await stop(smoke);
  try { await bridge?.dispose(); } finally {
    client?.stop(); await stop(gateway);
    // Preserve only structured, metadata-only public trace events. The private
    // Gateway stdout/config/auth are removed by the candidate runner.
    const evidence=process.env.GPT_LIVE_H5_EVIDENCE_DIR;
    if(evidence&&path.isAbsolute(evidence)&&fs.existsSync(tracePath)) {
      fs.mkdirSync(evidence,{recursive:true,mode:0o700});
      fs.writeFileSync(path.join(evidence,'native-public-diagnostics.json'),
        JSON.stringify(parsePublicProgressDiagnostics(fs.readFileSync(tracePath,'utf8')),null,2)+'\n',{mode:0o600});
    }
  }
}
