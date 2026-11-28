#!/usr/bin/env node

// 环境里没有 MAKARON_API_KEY 时，从 OpenClaw 凭据库的镜像文件读主人的 key（只读，不打印）。
try {
  const fsx = require('fs');
  const p = '@@STATE_DIR@@/secrets/store/MAKARON_API_KEY';
  if (!process.env.MAKARON_API_KEY && fsx.existsSync(p)) {
    process.env.MAKARON_API_KEY = fsx.readFileSync(p, 'utf8').trim();
  }
} catch (e) {}
'use strict';

/**
 * Makaron v1.3.1 restart helper.
 *
 * Purpose: perform same-card restart/reroll handoff quickly from a Feishu
 * inbound session, then exit. It must never watch Makaron, poll logs, sleep for
 * render completion, or wait for final assets.
 *
 * Flow:
 *   1) Update the existing task card with the new brief/status.
 *   2) Stop the active worker for this card if it is still alive and safe.
 *   3) Clear the same-card worker lock.
 *   4) Create a new v1.3 multi-asset job.
 *   5) Launch detached default worker (v1.4 review-sidecar worker by default).
 *   6) Print {parentShouldExit:true} so callers know to end immediately.
 */

const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {
  connect, disconnect, createExistingCardController, trim,
} = require('./run.cjs');

const ROOT = require('./workspace-root.cjs');
const LOCK_DIR = path.join(ROOT, 'tmp', 'makaron-worker-locks');
const activeTasks = require('./active-task-registry.cjs');

function usage(){
  console.error(`Usage:
node scripts/makaron-card-runner/restart-task-worker.cjs \\
  --chat <oc_xxx> --card <message_id> --prompt-file <brief.md> --state-file <state.json> \\
  [--image <path>] [--video <path>] [--audio <path>] [--media-manifest <manifest.json>] [--expected video,image] [--slug slug] [--project <id>] [--skill <id|label>] [--agent-model <id>] \\
  [--kill-existing true|false] [--kill-grace-ms 1500] [--worker generic|v14-staged|v15-supervisor] [--dry-run]

Rules:
- This helper launches a detached worker and exits.
- Do not call watchEvents, process.poll, sleep, or wait for final render in the parent session.
`);
  process.exit(2);
}
function take(argv,name,fallback=null){const i=argv.indexOf(name);return i>=0?argv[i+1]:fallback;}
function flag(argv,name){return argv.includes(name);}
function rejectRetiredChatOptions(argv){
  const retired=['--video-resolution','--video-model','--image-model','--model'];
  const found=retired.find(name=>argv.includes(name)||argv.some(value=>String(value).startsWith(`${name}=`)));
  if(found) throw new Error(`${found} is not supported by makaron chat. Put model/resolution requirements in the prompt instead.`);
}
function boolArg(argv,name,fallback){const v=take(argv,name,null); if(v==null)return fallback; return !/^(0|false|no)$/i.test(v);}
function safeName(s){return String(s||'').replace(/[^a-z0-9._-]+/gi,'-').slice(0,140)||'makaron-task';}
function projectIdFromUrl(url=''){return String(url||'').match(/projects\/([0-9a-f-]{36})/i)?.[1]||'';}
function runSync(cmd,args,opts={}){
  const r=spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',...opts});
  if(r.status!==0) throw new Error(`${cmd} ${args.join(' ')} failed\n${r.stderr||r.stdout}`);
  return r.stdout;
}
function lockPathForCard(cardId){return path.join(LOCK_DIR, `${safeName(cardId)}.lock.json`);}
function isPidAlive(pid){try{process.kill(Number(pid),0);return true;}catch{return false;}}
function cmdline(pid){try{return fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').replace(/\0/g,' ').trim();}catch{return '';}}
function safeWorkerPid(pid){
  const c=cmdline(pid);
  return /scripts\/makaron-card-runner\/workers\/generic-task-worker(?:-v14-staged|-v15-supervisor)?\.cjs/.test(c) || /generic-task-worker(?:-v14-staged|-v15-supervisor)?\.cjs/.test(c);
}
async function shortWait(ms){return new Promise(r=>setTimeout(r,ms));}
function cleanupStaleSidecar(sidecarDir, dryRun) {
  const result = {found: false, cleaned: false, sidecarDir, reason: ''};
  try {
    if (!fs.existsSync(sidecarDir)) return result;
    result.found = true;
    const doneFile = path.join(sidecarDir, 'done.json');
    if (!dryRun) {
      fs.writeFileSync(doneFile, JSON.stringify({done: true, cleanedAt: new Date().toISOString(), reason: 'sidecar_cleaned_by_restart_helper'}));
      result.cleaned = true;
      result.reason = 'wrote_done_json_to_exit_sidecar_loop';
    } else {
      result.reason = 'dry_run_would_write_done_json';
    }
  } catch (e) {
    result.reason = `cleanup_error: ${e.message}`;
  }
  return result;
}
async function stopExistingWorker(cardId,{killExisting=true,killGraceMs=1500,dryRun=false}={}){
  const lockPath=lockPathForCard(cardId);
  let prev=null;
  try{prev=JSON.parse(fs.readFileSync(lockPath,'utf8'));}catch{}
  const result={lockPath, hadLock:!!prev, killed:false, pid:prev?.pid||null, skipped:false, reason:''};
  if(!prev){return result;}
  const pid=Number(prev.pid||0);
  const alive=isPidAlive(pid);
  if(!alive){
    if(!dryRun) try{fs.unlinkSync(lockPath);}catch{}
    result.reason='stale_lock_removed';
    return result;
  }
  if(!killExisting){
    result.skipped=true; result.reason='active_worker_present_kill_disabled'; return result;
  }
  if(!safeWorkerPid(pid)){
    result.skipped=true; result.reason='pid_alive_but_not_generic_task_worker'; return result;
  }
  if(dryRun){result.reason='dry_run_would_sigterm_worker_and_remove_lock'; return result;}
  try{process.kill(pid,'SIGTERM'); result.killed=true;}catch(e){result.reason=`sigterm_failed:${e.message}`;}
  await shortWait(Math.max(0, Math.min(Number(killGraceMs)||1500, 3000)));
  if(isPidAlive(pid)){
    result.reason = result.reason || 'sigterm_sent_worker_still_alive';
  }else{
    result.reason = result.reason || 'worker_stopped';
  }
  try{fs.unlinkSync(lockPath);}catch{}
  return result;
}
function buildCreateArgs({argv,chatId,cardId,promptFile,stateFile,expected,slug,projectId}){
  const args=[path.join(ROOT,'scripts/makaron-card-runner/create-task-job.cjs'), '--chat', chatId, '--card', cardId, '--prompt-file', promptFile, '--state-file', stateFile, '--expected', expected, '--slug', slug];
  for(let i=0;i<argv.length;i++){
    if((argv[i]==='--image'||argv[i]==='--video'||argv[i]==='--audio')&&argv[i+1]){args.push(argv[i],argv[i+1]);i++;}
  }
  const mediaManifest=take(argv,'--media-manifest','');
  if(mediaManifest) args.push('--media-manifest',mediaManifest);
  if(projectId) args.push('--project', projectId);
  const skill=take(argv,'--skill','');
  if(skill) args.push('--skill',skill);
  const agentModel=take(argv,'--agent-model','');
  if(agentModel) args.push('--agent-model',agentModel);
  const workerMode=take(argv,'--worker',process.env.MAKARON_DEFAULT_WORKER||'v15-supervisor');
  if(workerMode==='v15-supervisor' && !flag(argv,'--no-review-sidecar')) args.push('--sidecar-supervisor-v15');
  else if(workerMode==='v14-staged' && !flag(argv,'--no-review-sidecar')) args.push('--review-sidecar');
  else if(workerMode!=='v14-staged' && (flag(argv,'--review-sidecar')||flag(argv,'--review-sidecar-enabled'))) args.push('--review-sidecar');
  return args;
}

(async()=>{
  const argv=process.argv.slice(2);
  rejectRetiredChatOptions(argv);
  const chatId=take(argv,'--chat');
  const cardId=take(argv,'--card');
  const promptFile=take(argv,'--prompt-file');
  const stateFile=take(argv,'--state-file');
  const expected=take(argv,'--expected','video');
  const slug=take(argv,'--slug','makaron-restart');
  const requestedProjectId=take(argv,'--project','');
  const dryRun=flag(argv,'--dry-run');
  const killExisting=boolArg(argv,'--kill-existing',true);
  const killGraceMs=Number(take(argv,'--kill-grace-ms','1500'));
  const workerMode=take(argv,'--worker',process.env.MAKARON_DEFAULT_WORKER||'v15-supervisor');
  if(!chatId||!cardId||!promptFile||!stateFile) usage();

  const state=JSON.parse(fs.readFileSync(path.resolve(stateFile),'utf8'));
  const prompt=fs.readFileSync(path.resolve(promptFile),'utf8');
  if(!prompt.trim()) throw new Error('empty prompt');
  // Command input wins; otherwise restore the exact card's durable project
  // pointer, then the state file. Never silently fall back to --project auto.
  const registryTask=activeTasks.getProjectTask(chatId,{cardId});
  const projectId=requestedProjectId || registryTask?.projectId || state.projectId || projectIdFromUrl(state.projectUrl);

  let cardUpdated=false;
  if(!dryRun){
    const {channel}=await connect(chatId);
    const ctrl=createExistingCardController(channel,cardId,{...state,chatId});
    try{
      await ctrl.update({
        ...state,
        chatId,
        status: state.status || '收到补充方向，准备重启生成',
        progress: state.progress ?? 32,
        done:false,
        failed:false,
        makaronSay: trim(state.makaronSay || `已收到新的任务方向，正在安全重启后台 worker。\n\n${prompt}`, 1800),
      });
      await ctrl.log('v1.3.1 restart helper 接管：只重启 worker，不在父 session 等结果');
      cardUpdated=true;
    }finally{
      await disconnect(channel).catch(()=>{});
    }
  }

  const stop=await stopExistingWorker(cardId,{killExisting,killGraceMs,dryRun});

  // Clean up stale sidecar: find old sidecar dirs for this card and close them
  const sidecarDir = path.join(ROOT, 'tmp', 'makaron-sidecar-supervisors-v15', safeName(cardId));
  const sidecarCleanup = cleanupStaleSidecar(sidecarDir, dryRun);

  const createArgs=buildCreateArgs({argv,chatId,cardId,promptFile,stateFile,expected,slug,projectId});
  const job=dryRun
    ? {ok:true,dryRun:true,jobPath:null,createArgs:createArgs.map(a=>a.startsWith(ROOT)?path.relative(ROOT,a):a)}
    : JSON.parse(runSync(process.execPath,createArgs));
  const workerScript = workerMode === 'v15-supervisor'
    ? 'scripts/makaron-card-runner/workers/generic-task-worker-v15-supervisor.cjs'
    : workerMode === 'v14-staged'
      ? 'scripts/makaron-card-runner/workers/generic-task-worker-v14-staged.cjs'
      : 'scripts/makaron-card-runner/workers/generic-task-worker.cjs';
  const launch=dryRun
    ? {ok:true,dryRun:true,skippedLaunch:true}
    : JSON.parse(runSync(process.execPath,[path.join(ROOT,'scripts/makaron-card-runner/launch-worker.cjs'),workerScript,'--json','--','--job',job.jobPath]));

  console.log(JSON.stringify({
    ok:true,
    mode:'restart-task-worker',
    workerMode,
    dryRun,
    chatId,
    cardId,
    projectId:projectId || null,
    projectSource:requestedProjectId ? 'argument' : registryTask?.projectId ? 'card_registry' : state.projectId ? 'state_file' : state.projectUrl ? 'state_project_url' : 'none',
    cardUpdated,
    stopExisting:stop,
    sidecarCleanup,
    job,
    launch,
    parentShouldExit:true,
    parentRule:'End the Feishu inbound session now. Do not sleep, poll, watch, or wait for render completion here.',
  },null,2));
})().then(()=>setTimeout(()=>process.exit(0),100).unref?.()).catch(e=>{console.error(e.stack||e);process.exit(1);});
