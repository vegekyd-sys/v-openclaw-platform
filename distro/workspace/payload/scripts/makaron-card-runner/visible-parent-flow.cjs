#!/usr/bin/env node

// Makaron key 由 account-routing.cjs 解析（这台机器上就是主人的 key），这里不另读凭据。
'use strict';

/**
 * Makaron card runner v1.26.0 parent-session helper.
 *
 * Purpose: after necessary Feishu material download, create the task card
 * immediately and keep all parent preparation visible in that same card.
 *
 * This helper is the normal v1.1 parent path. It does not watch Makaron and it
 * does not wait for outputs. For production runs it launches generic-task-worker
 * and returns. For smoke tests use --no-launch to stop at the worker handoff
 * point without spending Makaron/video credits.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {
  connect, disconnect, createCard, createExistingCardController, trim,
} = require('./run.cjs');

const ROOT = require('./workspace-root.cjs');
const {inspectMediaManifest}=require('./media-manifest.cjs');
const TMP_DIR = path.join(ROOT, 'tmp', 'makaron-visible-parent');

function take(argv, name, fallback=null) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}
function takeAll(argv, name) {
  const out=[];
  for(let i=0;i<argv.length;i++) if(argv[i]===name && argv[i+1]) out.push(argv[i+1]);
  return out;
}
function takeMedia(argv) {
  const out=[];
  for(let i=0;i<argv.length;i++) {
    if ((argv[i] === '--image' || argv[i] === '--video' || argv[i] === '--audio') && argv[i+1]) {
      out.push({type:argv[i] === '--video' ? 'video' : argv[i] === '--audio' ? 'audio' : 'image', path:argv[i+1]});
      i++;
    }
  }
  return out;
}
function flag(argv, name) { return argv.includes(name); }
function rejectRetiredChatOptions(argv) {
  const retired=['--video-resolution','--video-model','--image-model','--model'];
  const found=retired.find(name=>argv.includes(name)||argv.some(value=>String(value).startsWith(`${name}=`)));
  if(found) throw new Error(`${found} is not supported by makaron chat. Put model/resolution requirements in the prompt instead.`);
}
function safeName(s) { return String(s || '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 100) || 'makaron-task'; }
function handoffFingerprint({chatId, requestId, prompt, expected, projectId, skill, mediaArgs, mediaManifestPath}) {
  return crypto.createHash('sha256').update(JSON.stringify({
    chatId, requestId:requestId || null, prompt, expected, projectId:projectId || null,
    skill:skill || null, mediaArgs, mediaManifestPath:mediaManifestPath || null,
  })).digest('hex');
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
function run(cmd, args, opts={}) {
  const r = spawnSync(cmd, args, {cwd:ROOT, encoding:'utf8', ...opts});
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed\n${r.stderr || r.stdout}`);
  return r.stdout;
}
function getFeishuChatInfo(chatId) {
  if (!chatId || !String(chatId).startsWith('oc_')) return null;
  try {
    const r = spawnSync('lark-cli', ['im', 'chats', 'get', '--chat-id', chatId, '--as', 'bot', '--json'], {cwd:ROOT, encoding:'utf8', env:process.env, timeout:15000});
    if (r.status !== 0) return null;
    const j = JSON.parse(r.stdout || '{}');
    return j?.data || j?.chat || j;
  } catch { return null; }
}
function maybeRead(file) { return file ? fs.readFileSync(path.resolve(file), 'utf8') : ''; }
function mediaKind(file) {
  const ext = path.extname(String(file||'')).toLowerCase();
  if (['.mp4','.mov','.webm','.m4v','.avi'].includes(ext)) return 'video';
  if (['.jpg','.jpeg','.png','.webp','.gif'].includes(ext)) return 'image';
  if (['.mp3','.wav','.m4a','.aac','.flac'].includes(ext)) return 'audio';
  return 'file';
}
function probeMedia(file) {
  const abs = path.resolve(file);
  const st = fs.statSync(abs);
  const kind = mediaKind(abs);
  if (kind === 'video') {
    try {
      const out = run('ffprobe', ['-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',abs]);
      const j = JSON.parse(out);
      const s = (j.streams||[]).find(x=>x.width) || {};
      return {kind, path:abs, size:st.size, duration:Number(j.format?.duration||0), width:s.width||null, height:s.height||null, fps:s.r_frame_rate||null};
    } catch (e) {
      return {kind, path:abs, size:st.size, error:e.message};
    }
  }
  if (kind === 'image') {
    try {
      const out = run('identify', ['-format','%wx%h',abs]);
      const [w,h]=out.trim().split('x').map(Number);
      return {kind, path:abs, size:st.size, width:w||null, height:h||null};
    } catch (e) {
      return {kind, path:abs, size:st.size, error:e.message};
    }
  }
  if (kind === 'audio') {
    try {
      const out = run('ffprobe', ['-v','error','-show_entries','format=duration:stream=codec_name','-of','json',abs]);
      const j = JSON.parse(out);
      const s = (j.streams||[]).find(x=>x.codec_name) || {};
      return {kind, path:abs, size:st.size, duration:Number(j.format?.duration||0), codec:s.codec_name||null};
    } catch (e) {
      return {kind, path:abs, size:st.size, error:e.message};
    }
  }
  return {kind, path:abs, size:st.size};
}
function mediaSummary(items) {
  if (!items.length) return '无本地素材路径';
  return items.map((m,i)=>{
    if (m.kind === 'video') return `视频${i+1}: ${m.duration?m.duration.toFixed(1)+'s':'?s'} · ${m.width||'?'}×${m.height||'?'} · ${m.fps||'?'} · ${Math.round(m.size/1024)}KB`;
    if (m.kind === 'image') return `图片${i+1}: ${m.width||'?'}×${m.height||'?'} · ${Math.round(m.size/1024)}KB`;
    if (m.kind === 'audio') return `音频${i+1}: ${m.duration?m.duration.toFixed(1)+'s':'?s'} · ${m.codec||'?'} · ${Math.round(m.size/1024)}KB`;
    return `素材${i+1}: ${Math.round(m.size/1024)}KB`;
  }).join('\n');
}
function extractMissingScopes(err) {
  const text = String(err && (err.stack || err.message) || err || '');
  const scopes = new Set();
  const patterns = [
    /scopes?\s+(?:is|are)\s+required:\s*\[([^\]]+)\]/ig,
    /required\s+permissions?:\s*\[([^\]]+)\]/ig,
    /missing\s+scopes?:\s*\[([^\]]+)\]/ig,
    /缺少[^\[]*\[([^\]]+)\]/ig,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      for (const s of String(m[1] || '').split(',')) {
        const scope = s.trim().replace(/^['"]|['"]$/g, '');
        if (/^[a-z0-9_.:-]+$/i.test(scope)) scopes.add(scope);
      }
    }
  }
  return [...scopes];
}
function maybeSendPermissionLink(argv, err) {
  const chatId = take(argv, '--chat');
  if (!chatId) return;
  const scopes = extractMissingScopes(err);
  if (!scopes.length) return;
  const replyTo = take(argv, '--reply-to');
  const args = [
    path.join(ROOT, 'scripts/deliver-feishu-permission-link.mjs'),
    '--target', chatId,
    '--scopes', scopes.join(','),
    '--token-type', 'tenant',
    '--title', 'Makaron 需要开通飞书权限',
    '--subtitle', `缺少权限：${scopes.join(', ')}`,
  ];
  if (replyTo) args.push('--reply-to', replyTo);
  const r = spawnSync(process.execPath, args, {cwd:ROOT, encoding:'utf8'});
  if (r.stdout) console.error(r.stdout.trim());
  if (r.stderr) console.error(r.stderr.trim());
}
function usage() {
  console.error(`Usage:
node scripts/makaron-card-runner/visible-parent-flow.cjs \\
  --chat <oc_xxx> --prompt-file <brief.md> --title <title> --brief <brief> \\
  [--image <path>] [--video <path>] [--audio <path>] [--media-manifest <manifest.json>] [--expected video,image] [--slug slug] [--project auto] [--skill <id|label>] [--agent-model <id>] [--no-launch]
  [--worker generic|v14-staged|v15-supervisor] [--review-sidecar] [--request-id <trusted inbound message_id>]
  [--parent-task-id <durable parent id> --child-id <unique child id>]

Notes:
- Run this only after Feishu material download has completed.
- It creates the card first, then shows media inspection / account policy / brief / job / worker handoff in-card.
- Without --no-launch it launches generic-task-worker and exits.
- The trusted inbound message id makes repeated invocations idempotent; do not derive it from message text.
`);
  process.exit(2);
}

(async()=>{
  const argv = process.argv.slice(2);
  rejectRetiredChatOptions(argv);
  const chatId = take(argv, '--chat');
  const promptFile = take(argv, '--prompt-file');
  const promptText = take(argv, '--prompt');
  const title = take(argv, '--title', 'Makaron 任务');
  const subtitle = take(argv, '--subtitle', '');
  const brief = take(argv, '--brief', 'Makaron 任务准备中');
  const slug = take(argv, '--slug', 'makaron-visible-task');
  const expected = take(argv, '--expected', 'video');
  const projectId = take(argv, '--project');
  if (projectId && projectId !== 'auto') {
    throw new Error('新卡必须使用独立项目（--project auto）；继续原项目请在原卡使用 restart-task-worker.cjs。');
  }
  const skill = take(argv, '--skill');
  const agentModel = take(argv, '--agent-model');
  const requestId = take(argv, '--request-id');
  const originalUserRequest = take(argv, '--user-request');
  const parentTaskId = take(argv, '--parent-task-id');
  const childId = take(argv, '--child-id');
  if (Boolean(parentTaskId) !== Boolean(childId)) throw new Error('parent-task-id and child-id must be paired');
  const mediaManifestPath = take(argv, '--media-manifest');
  // These must originate from the trusted Feishu event envelope, never from
  // the user's message content. They are optional until shadow rollout.
  const senderOpenId = take(argv, '--sender-open-id');
  const recipientAppId = take(argv, '--recipient-app-id');
  const noLaunch = flag(argv, '--no-launch') || flag(argv, '--smoke');
  const workerMode = take(argv, '--worker', process.env.MAKARON_DEFAULT_WORKER || 'v15-supervisor');
  const reviewSidecar = (workerMode === 'v15-supervisor')
    ? !flag(argv, '--no-review-sidecar')
    : (flag(argv, '--review-sidecar') || flag(argv, '--review-sidecar-enabled'));
  const mediaArgs = takeMedia(argv);
  const mediaManifest = mediaManifestPath ? inspectMediaManifest(mediaManifestPath) : null;
  const images = mediaArgs.filter(m=>m.type==='image').map(m=>m.path);
  const videos = mediaArgs.filter(m=>m.type==='video').map(m=>m.path);
  const audios = mediaArgs.filter(m=>m.type==='audio').map(m=>m.path);
  if (!chatId || (!promptFile && !promptText)) usage();
  const prompt = promptText || maybeRead(promptFile);
  if (!prompt.trim()) throw new Error('empty prompt');

  fs.mkdirSync(TMP_DIR, {recursive:true});
  const handoffDir = path.join(TMP_DIR, 'handoffs');
  fs.mkdirSync(handoffDir, {recursive:true});
  const fingerprint = handoffFingerprint({chatId, requestId, prompt, expected, projectId, skill, mediaArgs, mediaManifestPath});
  const handoffKey = parentTaskId ? crypto.createHash('sha256').update(JSON.stringify([chatId,requestId,parentTaskId,childId])).digest('hex') : (requestId ? safeName(requestId) : fingerprint);
  const handoffPath = path.join(handoffDir, `${handoffKey}.json`);
  const existing = readJson(handoffPath);
  const dedupeTtlMs = requestId ? 24 * 60 * 60 * 1000 : 2 * 60 * 1000;
  if (existing?.fingerprint === fingerprint && Date.now() - Number(existing.createdAt || 0) < dedupeTtlMs) {
    console.log(JSON.stringify({
      ...(existing.result || {ok:true, chatId, cardId:existing.cardId || '', lockPath:existing.lockPath || ''}),
      deduplicated:true,
      handoffState:existing.state || 'in_progress',
    }, null, 2));
    return;
  }
  writeJson(handoffPath, {version:1, state:'in_progress', createdAt:Date.now(), fingerprint, requestId:requestId || null, chatId});
  const startedAt = Date.now();
  const events=[];
  const event=(name, extra={})=>events.push({name, ms:Date.now()-startedAt, ...extra});

  const {channel} = await connect(chatId);
  let cardId='', lockPath='';
  try {
    event('material_download_already_done', {images:images.length, videos:videos.length, audios:audios.length, manifestRanges:mediaManifest?.rangeCount||0});

    const cardStart = Date.now();
    const sent = await createCard(channel, chatId, {
      title, brief, parentTaskId, childId,
      status:mediaManifest?'Scene 精确片段已拿到':'素材已拿到',
      progress:5,
      makaronSay:mediaManifest?'Scene 已交接在线精确片段，正在导入 Makaron。':'素材已下载到本地，正在准备下一步。',
      phase:'material-ready',
    });
    cardId = sent.messageId;
    writeJson(handoffPath, {...readJson(handoffPath), cardId});
    event('card_created', {cardId, cardMs:Date.now()-cardStart});
    const ctrl = createExistingCardController(channel, cardId, {chatId, title, brief, parentTaskId, childId});
    await ctrl.log('素材已就绪，开始准备');

    await ctrl.update({status:mediaManifest?'检查 Scene 片段中':'检查素材中', progress:10, makaronSay:mediaManifest?'正在校验 Scene 精确片段范围…':'正在读取素材信息…'});
    const probeStart = Date.now();
    const media = mediaArgs.map(m=>probeMedia(m.path));
    event('media_probe_done', {probeMs:Date.now()-probeStart, media, mediaManifest});
    const manifestSummary=mediaManifest ? `✅ Scene 精确片段\n${mediaManifest.title}\n${mediaManifest.videoCount} 段视频 · ${mediaManifest.totalDurationSec.toFixed(1)} 秒${mediaManifest.imageCount?` · ${mediaManifest.imageCount} 张图片`:''}\n交接方式：在线 source_url（视频含精确入/出点，图片为整源，不导出 MP4）` : '';
    await ctrl.output([manifestSummary, media.length?`✅ 素材信息\n${mediaSummary(media)}`:''].filter(Boolean).join('\n\n'));

    await ctrl.update({status:'检查账号', progress:16, makaronSay:'正在确认 Makaron 账号可用。'});
    const chatInfo = getFeishuChatInfo(chatId);
    event('account_policy_visible', chatInfo ? {chatMode:chatInfo.chat_mode || '', ownerId:chatInfo.owner_id || ''} : {});
    await ctrl.log('账号检查完成');

    await ctrl.update({status:'准备任务', progress:22, makaronSay:`正在整理任务。生成和分析交给后台和大模型。\n\n${trim(prompt, 900)}`});
    const id = `${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${safeName(slug)}`;
    const promptOut = path.join(TMP_DIR, `${id}.brief.md`);
    const stateOut = path.join(TMP_DIR, `${id}.state.json`);
    fs.writeFileSync(promptOut, prompt);
    fs.writeFileSync(stateOut, JSON.stringify({
      title, brief, parentTaskId, childId,
      ...(projectId ? {projectId} : {}),
      status:'准备交接', progress:26,
      makaronSay:'准备工作完成，正在交付执行。',
      phase:'worker-handoff',
    }, null, 2));
    event('brief_written', {promptOut, stateOut});

    await ctrl.update({status:'交接中', progress:30, makaronSay:'正在把任务交给后台执行…'});
    const createArgs = [path.join(ROOT,'scripts/makaron-card-runner/create-task-job.cjs'), '--chat', chatId, '--card', cardId, '--prompt-file', promptOut, '--state-file', stateOut, '--expected', expected, '--slug', slug];
    for (const item of mediaArgs) createArgs.push(item.type === 'video' ? '--video' : item.type === 'audio' ? '--audio' : '--image', item.path);
    if (mediaManifest) createArgs.push('--media-manifest', mediaManifest.path);
    if (chatInfo?.chat_mode) createArgs.push('--chat-mode', chatInfo.chat_mode);
    if (chatInfo?.owner_id) createArgs.push('--chat-owner-id', chatInfo.owner_id);
    if (senderOpenId) createArgs.push('--sender-open-id', senderOpenId);
    if (recipientAppId) createArgs.push('--recipient-app-id', recipientAppId);
    if (projectId) createArgs.push('--project', projectId);
    if (skill) createArgs.push('--skill', skill);
    if (agentModel) createArgs.push('--agent-model', agentModel);
    if (reviewSidecar) createArgs.push(workerMode === 'v15-supervisor' ? '--sidecar-supervisor-v15' : '--review-sidecar');
    const job = JSON.parse(run(process.execPath, createArgs));
    if(originalUserRequest){
      const savedJob=JSON.parse(fs.readFileSync(job.jobPath,'utf8'));
      savedJob.originalUserRequest=originalUserRequest;
      fs.writeFileSync(job.jobPath,JSON.stringify(savedJob,null,2));
    }
    event('job_created', {jobPath:job.jobPath});
    await ctrl.log('任务已交接');

    if (noLaunch) {
      await ctrl.update({status:'交接完成（测试模式）', progress:100, done:true, failed:false, makaronSay:'准备工作已完成，本次为测试模式未启动生成。'});
      await ctrl.log('测试模式：未启动后台执行');
      event('done_no_launch');
    } else {
      const workerScript = workerMode === 'v15-supervisor'
        ? 'scripts/makaron-card-runner/workers/generic-task-worker-v15-supervisor.cjs'
        : workerMode === 'v14-staged'
          ? 'scripts/makaron-card-runner/workers/generic-task-worker-v14-staged.cjs'
          : 'scripts/makaron-card-runner/workers/generic-task-worker.cjs';
      await ctrl.update({status:'已提交 Makaron', progress:36, makaronSay:'任务已提交，V 会在后台全程监督生成进度并持续更新这张卡。'});
      const launch = JSON.parse(run(process.execPath, [path.join(ROOT,'scripts/makaron-card-runner/launch-worker.cjs'), workerScript, '--json', '--', '--job', job.jobPath]));
      lockPath = launch.lockPath || '';
      event('worker_launched', {launch});
      await ctrl.update({status:'生成中', progress:40, makaronSay:'Makaron 正在生产，V 全程监督中，后续会继续更新这张卡。'});
    }

    const result = {ok:true, cardRunnerVersion:'v1.26.0', noLaunch, chatId, cardId, events, lockPath, parentTaskId, childId, stateFile:stateOut};
    writeJson(handoffPath, {...readJson(handoffPath), state:'completed', completedAt:Date.now(), lockPath, result});
    fs.writeFileSync(path.join(TMP_DIR, `${safeName(slug)}.last-result.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await disconnect(channel).catch(()=>{});
    setTimeout(()=>process.exit(0), 100).unref?.();
  }
})().catch(e=>{maybeSendPermissionLink(process.argv.slice(2), e); console.error(e.stack || e); process.exit(1);});
