#!/usr/bin/env node
'use strict';
process.env.MAKARON_WORKER='1';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {
  connect, disconnect, createExistingCardController,
  submitChat, normalizeMediaAssets, watchEvents, eventText, eventVideo, eventAsset, eventIsDone,
  getRunOutput, downloadAndSendAsset, createAssetDeliveryTracker, trim,
} = require('../run.cjs');

const ROOT = require('../workspace-root.cjs');
const {assertMakaronCliRuntime}=require('../makaron-cli-runtime.cjs');
const DELIVERED_DIR = path.join(ROOT, 'tmp', 'makaron-delivered-assets');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function loadJob() {
  const jobPath = arg('--job') || process.env.MAKARON_JOB_JSON;
  if (!jobPath) throw new Error('missing --job <job.json>');
  const abs = path.resolve(jobPath);
  return {jobPath: abs, job: JSON.parse(fs.readFileSync(abs, 'utf8'))};
}
function required(job, key) {
  if (!job[key]) throw new Error(`job missing ${key}`);
  return job[key];
}
function safeName(s) { return String(s || '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 120) || 'makaron-task'; }
function mediaSummary(assets=[]){
  if(!assets.length) return '无本地素材';
  const counts = assets.reduce((m,a)=>{m[a.type]=(m[a.type]||0)+1;return m;},{});
  const head = [`素材确认｜共 ${assets.length} 个`, counts.image?`图片 ${counts.image} 张`:null, counts.video?`视频 ${counts.video} 段`:null, counts.audio?`音频 ${counts.audio} 条`:null].filter(Boolean).join('　');
  const lines = assets.slice(0,10).map((a,i)=>`${String(i+1).padStart(2,'0')}　${path.basename(a.path||'')}`);
  const tail = assets.length>10 ? [`…　其余 ${assets.length-10} 个素材已收起`] : [];
  return [head, ...lines, ...tail].join('\n');
}
function mediaKind(url='') {
  if (url.includes('/uploads/')) return 'upload';
  if (url.includes('/videos/')) return 'generated';
  if (url.includes('/images/') || url.includes('/renders/') || url.includes('/designs/') || url.includes('/music/') || url.includes('/audio/') || url.includes('/files/')) return 'generated';
  return 'unknown';
}
function sha256Buffer(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function localFileHash(file) {
  try { return sha256Buffer(fs.readFileSync(path.resolve(file))); }
  catch { return null; }
}
async function remoteUrlHash(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return sha256Buffer(Buffer.from(ab));
  } catch { return null; }
}
function hasExpectedMedia(expected) {
  return ['image','video','design','music','audio','file'].some(t => expected.has(t));
}
function autoContinuePrompt({makaronSay, expected}) {
  const types = [...expected].filter(t => ['image','video','design','music','audio','file'].includes(t)).join('/') || '最终媒体';
  return `V QC 通过。请不要再等待用户确认，也不要只输出脚本/方案。请基于上一轮已经确认的方案，继续同一个项目生成并返回${types}产物 URL / artifact。\n\n上一轮 Makaron 输出摘要：\n${trim(makaronSay || '', 2400)}\n\n硬要求：本轮必须继续到${types}生成；如果需要使用素材，请引用项目中已有的 media ref（例如 <<<media_1>>>），不要要求重新上传素材。`;
}
function runShell(cmd,args,opts={}){
  return new Promise(resolve=>{
    const p=spawn(cmd,args,{...opts,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    p.stdout.on('data',d=>stdout+=d.toString());
    p.stderr.on('data',d=>stderr+=d.toString());
    p.on('close',(code,signal)=>resolve({code,signal,stdout,stderr}));
  });
}
async function getProjectMedia(projectId){
  if(!projectId) return [];
  const res=await runShell(assertMakaronCliRuntime(),['project','media',projectId,'--json'],{cwd:ROOT,env:process.env});
  if(res.code!==0) return [];
  try { return JSON.parse(res.stdout).media || []; } catch { return []; }
}
function readDelivered(file){
  try { return new Set(JSON.parse(fs.readFileSync(file,'utf8')).urls || []); }
  catch { return new Set(); }
}
function writeDelivered(file,set){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify({version:1,updatedAt:Date.now(),urls:[...set]},null,2));
}
function unlinkIfSet(file){
  if(!file) return;
  try{ fs.unlinkSync(file); }catch{}
}

(async()=>{
  const {jobPath, job} = loadJob();
  const chatId = required(job, 'chatId');
  const cardId = required(job, 'cardId');
  const prompt = required(job, 'prompt');
  const mediaAssets = normalizeMediaAssets(job);
  const outDir = job.outDir || path.join(ROOT, 'output', 'generic-task-worker');
  const outPrefix = job.outPrefix || 'makaron-task';
  const launchedAt = Number(process.env.LAUNCHED_AT || job.launchedAt || Date.now());
  const workerStartedAt = Date.now();
  const expected = new Set(job.expectedAssets || job.expectedAssetTypes || []);
  const maxGateContinues = Number(job.maxGateContinues ?? 2);
  const initialState = {
    ...(job.initialState || {}),
    chatId,
  };
  const deliveredFile = path.join(DELIVERED_DIR, `${safeName(chatId)}.${safeName(cardId)}.json`);
  const deliveredUrls = readDelivered(deliveredFile);
  const inputAssetHashes = new Set(mediaAssets.filter(a=>a.type==='image').map(a=>localFileHash(a.path)).filter(Boolean));

  const {channel} = await connect(chatId);
  const ctrl = createExistingCardController(channel, cardId, initialState);
  const deliverAsset = createAssetDeliveryTracker({channel, chatId, ctrl, outDir, outPrefix});
  let runId=null, projectUrl=null, projectId=job.projectId||null, makaronSay='';
  const runIds=[];
  const sentAssets=[];
  let gateContinues=0;

  async function deliverOnce(asset, statusLabel){
    if(!asset?.url) return {delivered:false};
    if(deliveredUrls.has(asset.url) || deliverAsset.wasDelivered(asset.url)) return {duplicate:true, delivered:false};
    if(statusLabel) await ctrl.update({status:statusLabel, progress:asset.type === 'video' ? 86 : 78});
    const delivered = await deliverAsset(asset);
    if(delivered?.delivered){
      deliveredUrls.add(asset.url);
      writeDelivered(deliveredFile, deliveredUrls);
      sentAssets.push(asset.type || 'asset');
      await ctrl.update({status:`${asset.type || 'asset'} 已发送`, progress:asset.type === 'video' ? 92 : 90});
    }
    return delivered;
  }

  async function recoverFromRunOutput(currentRunId){
    const out = await getRunOutput(currentRunId);
    if (out?.text && !makaronSay) makaronSay = out.text;
    if (out?.videoUrl) {
      await deliverOnce({type:'video', url:out.videoUrl, status:'completed', id:`${currentRunId}:recovered-video`}, '从结果中恢复到视频，发送中');
    }
    for (const url of out?.imageUrls || []) {
      await deliverOnce({type:'image', url, status:'completed', id:`${currentRunId}:recovered-image`}, '从结果中恢复到图片，发送中');
    }
  }

  async function reconcileProjectMedia(reason='项目产物复核'){
    const media = await getProjectMedia(projectId);
    if(!media.length) return 0;
    const allowed = expected.size ? expected : new Set(['image','video','design','music','audio','file']);
    let count=0;
    for(const m of media){
      const type=String(m.type||'').toLowerCase();
      const url=m.url||m.imageUrl||m.videoUrl||m.audioUrl||m.fileUrl;
      if(!url || !allowed.has(type)) continue;
      if(m.status && !['completed','succeeded','ready'].includes(String(m.status).toLowerCase())) continue;
      if(mediaKind(url)==='upload') continue;
      if (type === 'image' && inputAssetHashes.size) {
        const h = await remoteUrlHash(url);
        if (h && inputAssetHashes.has(h)) {
          await ctrl.log(`跳过参考图/输入图，不作为生成产物发送：${m.ref || ''}`.trim());
          continue;
        }
      }
      const r = await deliverOnce({
        type, url, status:m.status||'completed', id:m.id||m.snapshot_id||m.snapshotId||m.task_id||m.taskId||url,
        snapshotId:m.snapshot_id||m.snapshotId||'', createdAt:m.created_at||m.createdAt||'', raw:m,
      }, `${reason}：发现${type}，发送中`);
      if(r?.delivered) count++;
    }
    if(count>0) await ctrl.output(`🔎 项目复核补发产物：${count} 个`);
    return count;
  }

  try {
    await ctrl.log(`direct task worker 接管：${workerStartedAt - launchedAt}ms`);
    await ctrl.update({
      status: job.statusOnStart || 'direct worker 已接管，提交 Makaron 中',
      progress: job.progressOnStart ?? 12,
      makaronSay: job.startSay || `后台 Node task worker 已接管（${workerStartedAt - launchedAt}ms），正在提交 Makaron。\n\n${mediaSummary(mediaAssets)}`,
    });


    let currentPrompt = prompt;
    let currentProjectId = job.projectId || null;
    let attachMedia = !currentProjectId || job.attachOnContinue === true;

    require('../account-routing.cjs').applyJobAccount(job);
    while(true){
      const submitStartedAt = Date.now();
      const submitted = await submitChat({
        mediaAssets: attachMedia ? mediaAssets : [],
        prompt: currentPrompt,
        projectId: currentProjectId,
        skill: job.skill || undefined,
        agentModel: job.agentModel || undefined,
      });
      runId = submitted.runId; projectUrl = submitted.projectUrl; projectId = submitted.projectId || projectId || currentProjectId;
      currentProjectId = projectId;
      runIds.push(runId);
      await ctrl.log(`Makaron 项目已创建/继续（submit ${Date.now() - submitStartedAt}ms）`);
      await ctrl.update({projectUrl, status:'Makaron 正在生产', progress:25});

      for await (const ev of watchEvents(runId)) {
        const text = eventText(ev);
        if (text) {
          makaronSay = text;
          await ctrl.update({status:'Makaron 输出中', makaronSay:trim(text,1800), progress:Math.min(70, 30 + Math.floor(String(text).length/100))});
        }

        const asset = eventAsset(ev);
        if (asset?.url) {
          await deliverOnce(asset, `${asset.type} 已生成，发送中`);
        } else if (asset) {
          await ctrl.update({status:`${asset.type} 生成中`, progress:55});
        }

        const video = eventVideo(ev);
        if (video?.url) {
          await deliverOnce({type:'video', url:video.url, status:video.status || 'completed', id:`${runId}:video`}, 'video 已生成，发送中');
        }

        if (eventIsDone(ev)) await ctrl.log('Makaron 本轮输出结束');
      }

      await recoverFromRunOutput(runId);
      await reconcileProjectMedia('项目产物复核');

      if(sentAssets.length>0) break;

      if (makaronSay && hasExpectedMedia(expected) && gateContinues < maxGateContinues) {
        gateContinues++;
        await ctrl.output(`✅ V QC 通过第 ${gateContinues} 个确认 gate，继续生成最终媒体`);
        await ctrl.update({
          status:'V QC 通过，继续生成媒体',
          progress:58,
          done:false,
          failed:false,
          makaronSay:trim(`${makaronSay}\n\nV QC：方向通过，继续同一项目生成最终媒体，不等待人工确认。`,1800),
        });
        currentPrompt = job.autoContinuePrompt || autoContinuePrompt({makaronSay, expected});
        attachMedia = job.attachOnContinue === true; // default: do NOT re-upload media when continuing a project
        continue;
      }
      break;
    }

    if (sentAssets.length > 0) {
      await ctrl.output(job.doneOutput || `✅ 产物已发送到群：${[...new Set(sentAssets)].join(', ')}`);
      await ctrl.update({
        status:'已发送，等待反馈',
        progress:100,
        done:true,
        failed:false,
        makaronSay:trim(makaronSay || job.doneSay || 'Makaron 产物已生成并发送。', 1800),
      });
      console.log(JSON.stringify({status:'delivered', jobPath, runIds, runId, projectId, projectUrl, sentAssets, gateContinues, workerHandoffMs: workerStartedAt - launchedAt}, null, 2));
    } else if (makaronSay && hasExpectedMedia(expected)) {
      await ctrl.output('⏸️ Makaron 返回了确认 gate，尚未生成最终媒体');
      await ctrl.update({
        status:'V QC gate：需要人工/策略介入',
        progress:55,
        done:false,
        failed:false,
        makaronSay:trim(makaronSay + '\n\nV 判断：已达到自动 QC 继续次数上限，需人工或策略介入。',1800),
      });
      console.log(JSON.stringify({status:'gate_text_only', jobPath, runIds, runId, projectId, projectUrl, expectedAssets:[...expected], gateContinues, makaronSay:trim(makaronSay,1000)}, null, 2));
    } else {
      await ctrl.update({status:'未拿到可发送产物', progress:70, failed:true, makaronSay:trim(makaronSay || 'Makaron 本轮没有返回可发送的产物 URL，需要检查项目输出。',1800)});
      console.log(JSON.stringify({status:'no_asset', jobPath, runIds, runId, projectId, projectUrl, makaronSay:trim(makaronSay,1000)}, null, 2));
      process.exitCode = 1;
    }
  } catch (e) {
    await ctrl.update({status:'执行受阻', progress:60, failed:true, makaronSay:`Makaron task worker 受阻：${trim(e?.message || e, 1600)}`});
    console.error(e);
    process.exitCode = 1;
  } finally {
    try { await disconnect(channel); } catch {}
    unlinkIfSet(process.env.MAKARON_WORKER_LOCK);
    setTimeout(()=>process.exit(process.exitCode || 0), 100).unref?.();
  }
})();
