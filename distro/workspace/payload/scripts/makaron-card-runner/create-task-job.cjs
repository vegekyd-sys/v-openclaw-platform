#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = require('./workspace-root.cjs');
const {inspectMediaManifest}=require('./media-manifest.cjs');
const JOB_DIR = path.join(ROOT, 'tmp', 'makaron-jobs');

function usage(){
  console.error('Usage: create-task-job.cjs --chat <oc_xxx> --card <message_id> --prompt-file <file> --state-file <file> [--image <path>] [--video <path>] [--audio <path>] [--media-manifest <manifest.json>] [--project <id>] [--expected image,video] [--slug <slug>] [--skill <id|label>] [--agent-model <id>] [--chat-mode p2p|group] [--chat-owner-id <ou_xxx>] [--sender-open-id <ou_xxx>] [--recipient-app-id <cli_xxx>] [--review-sidecar|--sidecar-supervisor-v15] [--max-failed-recovery-attempts N] [--max-no-asset-decision-attempts N]');
  process.exit(2);
}
function take(argv, name){const i=argv.indexOf(name); return i>=0 ? argv[i+1] : null;}
function rejectRetiredChatOptions(argv){
  const retired=['--video-resolution','--video-model','--image-model','--model'];
  const found=retired.find(name=>argv.includes(name)||argv.some(value=>String(value).startsWith(`${name}=`)));
  if(found) throw new Error(`${found} is not supported by makaron chat. Put model/resolution requirements in the prompt instead.`);
}
function takeAll(argv, name){const out=[]; for(let i=0;i<argv.length;i++) if(argv[i]===name && argv[i+1]) out.push(argv[i+1]); return out;}
function isAccessibleUrl(p){ return /^https?:\/\//i.test(String(p||'')); }
function normalizeMaterialPath(p){
  const s=String(p||'').trim();
  if(!s)return s;
  if(isAccessibleUrl(s))return s;
  if(s.startsWith('~/'))return path.join(process.env.HOME||'/root',s.slice(2));
  return path.isAbsolute(s)?s:path.resolve(ROOT,s);
}
function parseMediaAssets(argv){
  const assets=[];
  let order=1;
  let imageN=1;
  let videoN=1;
  let audioN=1;
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];
    if((flag==='--image'||flag==='--video'||flag==='--audio') && argv[i+1]){
      const type=flag==='--video'?'video':flag==='--audio'?'audio':'image';
      const n=type==='image'?imageN++:type==='video'?videoN++:audioN++;
      assets.push({type,path:normalizeMaterialPath(argv[i+1]),originalPath:argv[i+1],role:'',label:`${type}${n}`,sourceMessageId:'',order:order++});
      i++;
    }
  }
  return assets;
}
function parseMediaManifest(value){
  if(!value) return null;
  return inspectMediaManifest(normalizeMaterialPath(value));
}
function shanghaiCompactTimestamp(){
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date());
  const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${m.year}${m.month}${m.day}${m.hour}${m.minute}${m.second}`;
}
function main(){
  const argv=process.argv.slice(2);
  rejectRetiredChatOptions(argv);
  const chatId=take(argv,'--chat');
  const cardId=take(argv,'--card');
  const promptFile=take(argv,'--prompt-file');
  const stateFile=take(argv,'--state-file');
  const slug=take(argv,'--slug') || 'makaron-task';
  if(!chatId||!cardId||!promptFile||!stateFile) usage();
  const prompt=fs.readFileSync(promptFile,'utf8');
  const initialState=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  const mediaAssets=parseMediaAssets(argv);
  const mediaManifest=parseMediaManifest(take(argv,'--media-manifest'));
  const imagePaths=mediaAssets.filter(a=>a.type==='image').map(a=>a.path);
  const videoPaths=mediaAssets.filter(a=>a.type==='video').map(a=>a.path);
  const audioPaths=mediaAssets.filter(a=>a.type==='audio').map(a=>a.path);
  const projectId=take(argv,'--project') || undefined;
  const skill=take(argv,'--skill') || undefined;
  const agentModel=take(argv,'--agent-model') || undefined;
  const chatMode=take(argv,'--chat-mode') || undefined;
  const chatOwnerId=take(argv,'--chat-owner-id') || undefined;
  const senderOpenId=take(argv,'--sender-open-id') || undefined;
  const recipientAppId=take(argv,'--recipient-app-id') || undefined;
  const expectedRaw=take(argv,'--expected') || '';
  const expectedAssets=expectedRaw.split(',').map(s=>s.trim()).filter(Boolean);
  const sidecarSupervisorV15=argv.includes('--sidecar-supervisor-v15') || argv.includes('--v15-sidecar-supervisor');
  const reviewSidecarEnabled=sidecarSupervisorV15 || argv.includes('--review-sidecar') || argv.includes('--review-sidecar-enabled');
  const reviewSidecar=reviewSidecarEnabled ? {
    enabled:true,
    version:sidecarSupervisorV15 ? 'v1.5-supervisor' : 'v1.4-review',
    mode:take(argv,'--review-mode') || (sidecarSupervisorV15 ? 'supervisor' : 'required'),
    agentId:take(argv,'--review-agent') || 'makaron',
    model:take(argv,'--review-model') || '',
    thinking:take(argv,'--review-thinking') || 'high',
    timeoutSeconds:Number(take(argv,'--review-timeout') || 180),
    maxIdleMs:Number(take(argv,'--review-max-idle-ms') || 6 * 60 * 60 * 1000),
  } : undefined;
  fs.mkdirSync(JOB_DIR,{recursive:true});
  const safe=slug.replace(/[^a-z0-9._-]+/gi,'-').slice(0,80)||'makaron-task';
  const id=`${shanghaiCompactTimestamp()}-${crypto.randomBytes(4).toString('hex')}`;
  const outDir=path.join(ROOT,'output',`${safe}-${id}`);
  const job={
    kind:'makaron-task', schemaVersion:mediaManifest?'makaron-task-v1.25-manifest':(sidecarSupervisorV15?'makaron-task-v1.5-staged':'makaron-task-v1.3'), chatId, cardId, prompt, initialState:{...initialState,chatId}, outDir, outPrefix:safe,
    ...(chatMode ? {chatMode} : {}),
    ...(chatOwnerId ? {chatOwnerId} : {}),
    ...(senderOpenId ? {senderOpenId} : {}),
    ...(recipientAppId ? {recipientAppId} : {}),
    stateFile:path.resolve(stateFile),
    ...(mediaManifest ? {mediaManifest:mediaManifest.path,mediaManifestSummary:mediaManifest} : {}),
    mediaAssets,
    imagePaths, videoPaths, audioPaths, imagePath:imagePaths[0], videoPath:videoPaths[0], audioPath:audioPaths[0], projectId, expectedAssets,
    maxFailedRecoveryAttempts:Number(take(argv,'--max-failed-recovery-attempts') || 1),
    maxNoAssetDecisionAttempts:Number(take(argv,'--max-no-asset-decision-attempts') || 1),
    ...(skill ? {skill} : {}),
    ...(agentModel ? {agentModel} : {}),
    ...(reviewSidecar ? {reviewSidecar} : {}),
    createdAt:Date.now(),
  };
  const jobPath=path.join(JOB_DIR,`${safe}.${id}.json`);
  fs.writeFileSync(jobPath,JSON.stringify(job,null,2));
  console.log(JSON.stringify({ok:true,jobPath,outDir,expectedAssets,mediaAssetCount:mediaAssets.length,mediaAssets,mediaManifest},null,2));
}
try{main();}catch(e){console.error(e.stack||e);process.exit(1);}
