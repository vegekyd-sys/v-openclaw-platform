// Explicit live acceptance: independent bot, allowlisted test chat, private Voice.
// This file is candidate-only and never part of a Gateway release.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {prepareCandidate,sha256,redact,freePort} from './bound-task-support.mjs';
import {configureCandidateOpenAIAuth,installCandidateOpenAIAuth} from '../gpt-live-call-live-auth.mjs';
const privateConfig=process.env.BOUND_TASK_LIVE_CONFIG;
assert(privateConfig&&process.env.VLAB_CANDIDATE_ID,'Explicit private live-test configuration required');
const live=JSON.parse(fs.readFileSync(privateConfig));
const c=await prepareCandidate({harness:process.env.BOUND_TASK_HARNESS??'worker',maxWorkers:2,liveConfig:live});
if(live.recoverTasks){
 const rows=JSON.parse(fs.readFileSync(live.recoverTasks));fs.mkdirSync(c.ledgerDir,{recursive:true,mode:0o700});
 for(const row of rows){assert(/^[a-f0-9]{64}$/.test(row.id)&&row.executionOutcome,'Only captured terminal results may be recovered');fs.writeFileSync(path.join(c.ledgerDir,row.id+'.json'),JSON.stringify(row),{mode:0o600});}
}
const evidence=process.env.BOUND_TASK_EVIDENCE_DIR;assert(path.isAbsolute(evidence));fs.mkdirSync(evidence,{recursive:true,mode:0o700});
const save=(name,data)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(data,null,2),{mode:0o600});
const voice=path.join(c.runtime,'bound-voice');fs.mkdirSync(voice,{mode:0o700});
execFileSync('tar',['-xzf','tmp/bound-voice-source.tgz','--no-same-owner','-C',voice]);
execFileSync('npm',['ci','--omit=dev','--ignore-scripts'],{cwd:voice,env:{...c.env,npm_config_cache:path.join(c.data,'voice-npm-cache')},stdio:'pipe',timeout:120000});
const plugin=path.join(voice,'plugins/v-voice-gpt-live');fs.mkdirSync(path.join(plugin,'node_modules'),{recursive:true});fs.symlinkSync(path.join(c.runtime,'openclaw'),path.join(plugin,'node_modules/openclaw'));
// Load the real Voice plugin from the exact submitted Voice source archive.
c.config.plugins.load.paths.push(plugin);c.config.plugins.entries['v-voice-gpt-live']={enabled:true};c.config.plugins.allow?.push('v-voice-gpt-live');
if(live.openaiAccessFile){process.env.GPT_LIVE_CALL_ACCESS_FIXTURE=live.openaiAccessFile;configureCandidateOpenAIAuth(c.config);}
fs.writeFileSync(c.configPath,JSON.stringify(c.config,null,2),{mode:0o600});
if(live.openaiAccessFile){
 const {g:openAgentDatabase,a:closeAgentDatabases}=await import(path.join(c.dist,'openclaw-agent-db-CUTe8BX6.js'));
 const db=path.join(c.stateDir,'agents/makaron/agent/openclaw-agent.sqlite');
 fs.mkdirSync(path.dirname(db),{recursive:true,mode:0o700});openAgentDatabase({agentId:'makaron',path:db,env:process.env});closeAgentDatabases();
 installCandidateOpenAIAuth();save('auth-fixture.json',{source:'user-approved access-only fixture',refreshCopied:false});
}
const consult=path.join(c.dist,'realtime-session-harness-CEO5kVAJ.js');
const original=fs.readFileSync(consult,'utf8');fs.writeFileSync(consult,original+'\nexport {consultRealtimeVoiceAgent as candidateConsult};\n');
save('allowance.json',{exportNativeConsult:{before:sha256(original),after:sha256(fs.readFileSync(consult))},loader:c.allowance});
if(live.outboundOnly){
 const monitor=path.join(c.runtime,'npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/monitor.account-WFdlCDhR.js');
 const before=fs.readFileSync(monitor,'utf8');fs.writeFileSync(monitor,before+'\nexport {createTaskPresentationAccount,createFeishuClient,createFeishuReplyDispatcher,resolveFeishuRuntimeAccount,resolveVisibleProgressRuntimes};\n');
 save('outbound-allowance.json',{before:sha256(before),after:sha256(fs.readFileSync(monitor)),purpose:'Export unchanged native sender functions; channel startup disabled'});
}
await c.start({timeoutMs:150000});
if(live.outboundOnly){await c.rpc('candidate.boundTask',{op:'attach-live-sender'});await c.rpc('candidate.boundTask',{op:'seed-live-sessions'});}
const {createLiveH5Server}=await import(path.join(voice,'lab/gpt-live-h5/server.mjs'));
const {createDirectVoiceService}=await import(path.join(voice,'lab/realtime-direct-tools/session.mjs'));
const {voiceConversationContext}=await import(path.join(voice,'lab/realtime-direct-tools/conversation-context.mjs'));
const wsModule=createRequire(path.join(voice,'package.json'))('ws');
const audit=[];const record=row=>{audit.push(row);save('voice-audit.json',audit);};
const directVoice=createDirectVoiceService({gateway:c.client,wsModule,audit:record,loadContext:async sessionKey=>voiceConversationContext((await c.rpc('chat.history',{sessionKey,limit:6})).messages??[]),apiKeys:{grok:c.env.XAI_API_KEY??live.voiceKeys?.XAI_API_KEY,seeduplex:c.env.VOLCENGINE_REALTIME_API_KEY??c.env.DOUBAO_SPEECH_API_KEY??live.voiceKeys?.VOLCENGINE_REALTIME_API_KEY??live.voiceKeys?.DOUBAO_SPEECH_API_KEY}});
const sessionKey=`agent:makaron:feishu:group:${live.groupChat}`;
const bridge=createLiveH5Server({gateway:c.client,directVoice,gptProvider:'v-voice-gpt-live',defaultModel:live.openaiAccessFile?'gpt-live':'grok',avatarEvaluate:async()=>null,callControlAudit:record,
 conversationEntries:[{id:'bound-task-test',agentId:'makaron',sessionKey,accountId:'default',kind:'group',callerId:'tianyi',permissionProfile:'personal-tianyi',accessToken:randomUUID()+randomUUID()}],
 offer:async(reservation,sdp)=>{
  const r=await fetch(`http://127.0.0.1:${c.port}${reservation.offerUrl}`,{method:'POST',headers:{authorization:`Bearer ${reservation.clientSecret}`,'content-type':'application/sdp'},body:sdp,signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Native SDP exchange failed: '+r.status);return r.text();
 }});
c.onEvent=e=>bridge.emit(e);
const voicePort=await freePort();await new Promise(r=>bridge.server.listen(voicePort,'127.0.0.1',r));
const controlKey=randomUUID(),controlPort=await freePort();let closing=false;
const controller=http.createServer(async(req,res)=>{
 if(req.headers.authorization!==controlKey){res.writeHead(403);res.end();return;}
 let input='';for await(const part of req){input+=part;if(input.length>65536){res.writeHead(413);res.end();return;}}
 try{const p=JSON.parse(input||'{}');let result;
  if(req.url==='/rpc')result=await c.rpc(p.method,p.params??{},p.timeoutMs??180000);
  else if(req.url==='/audit')result=audit;
  else if(req.url==='/close'){closing=true;result={closing:true};}
  else throw Error('Unknown candidate control path');
  res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result}));
 }catch(error){res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:false,error:redact(error.message)}));}
});await new Promise(r=>controller.listen(controlPort,'127.0.0.1',r));
save('ready.private.json',{candidate:process.env.VLAB_CANDIDATE_ID,controlPort,controlKey,voicePort,gatewayPort:c.port,sessionKey,groupChat:live.groupChat,appId:live.appId,voiceRoot:voice,data:c.data,state:c.stateDir});
console.log(JSON.stringify({stage:'live-ready',candidate:process.env.VLAB_CANDIDATE_ID,voicePort,controlPort,appId:live.appId,groupChat:live.groupChat}));
const close=async()=>{closing=true;};process.once('SIGTERM',close);process.once('SIGINT',close);
while(!closing)await new Promise(r=>setTimeout(r,500));
save('tasks.json',(await c.rpc('candidate.boundTask',{op:'inspect'})).tasks);await bridge.dispose();await c.stop();controller.close();
console.log(JSON.stringify({stage:'live-closed',evidence}));
