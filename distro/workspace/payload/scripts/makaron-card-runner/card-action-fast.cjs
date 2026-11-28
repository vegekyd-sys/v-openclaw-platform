#!/usr/bin/env node
'use strict';

/**
 * Makaron v1.2 fast card actions.
 *
 * Foreground path: called by Feishu runtime card-action router. It must ACK by
 * updating the card quickly, then launch a detached background recorder.
 *
 * Background path: writes learning/revision signals for Makaron growth.
 */

process.env.MAKARON_WORKER = process.env.MAKARON_WORKER || '1';

const fs = require('node:fs');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {
  connect, disconnect, createExistingCardController, trim,
} = require('./run.cjs');
const activeTasks = require('./active-task-registry.cjs');

const ROOT = require('./workspace-root.cjs');
const ACTION_DIR = path.join(ROOT, 'tmp', 'makaron-card-actions');
const FEEDBACK_DIR = path.join(ROOT, 'memory', 'projects', 'makaron', 'feedback');

function arg(name, fallback=null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i+1] : fallback;
}
function flag(name) { return process.argv.includes(name); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJsonl(file, obj) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}
function today() {
  return new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Shanghai'});
}
function nowIso() { return new Date().toISOString(); }
function safeName(s) { return String(s || '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 120) || 'makaron-card-action'; }
function projectIdFromUrl(url='') { return String(url||'').match(/projects\/([0-9a-f-]{36})/)?.[1] || ''; }
function inferExpectedAsset(task={}) {
  const hay = `${task.title||''} ${task.brief||''} ${(task.outputs||[]).join(' ')} ${task.makaronSay||''}`.toLowerCase();
  if (/video|视频|kling|可灵|短片|成片/.test(hay)) return 'video';
  if (/music|音乐|audio|音频|歌曲/.test(hay)) return 'music';
  if (/design|设计|海报/.test(hay)) return 'design';
  return 'image';
}
function runSync(cmd,args,opts={}) {
  const r = spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',...opts});
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed\n${r.stderr || r.stdout}`);
  return r.stdout;
}
function normalizePayload(input={}) {
  const event = input.event || input.raw || {};
  const envelope = input.envelope || input.action || event.action?.value || {};
  const chatId = input.chatId || event.context?.chat_id || envelope.c?.h || '';
  const cardId = input.cardId || event.context?.open_message_id || event.open_message_id || event.context?.message_id || envelope.m?.messageId || '';
  const operatorOpenId = input.operatorOpenId || event.operator?.open_id || envelope.c?.u || '';
  const action = input.actionName || envelope.q || envelope.a || '';
  return {event, envelope, chatId, cardId, operatorOpenId, action, receivedAt: input.receivedAt || Date.now()};
}
function taskFor(chatId, cardId) {
  const task = (cardId ? activeTasks.getActiveTask(chatId, {cardId}) : activeTasks.getActiveTask(chatId)) || {};
  if (cardId && task.messageId && task.messageId !== cardId) return {...task, staleForCard:true};
  return task;
}
function spawnBackground(payloadFile) {
  const out = fs.openSync(path.join(ACTION_DIR, `${safeName(path.basename(payloadFile))}.bg.log`), 'a');
  const child = spawn(process.execPath, [__filename, '--background', '--payload', payloadFile], {
    cwd: ROOT,
    env: {...process.env, MAKARON_WORKER:'1'},
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  return child.pid;
}
async function updateCardFast(payload, task) {
  const action = payload.action;
  const {channel} = await connect(payload.chatId);
  const baseState = {
    ...task,
    chatId: payload.chatId,
    title: task.title || 'Makaron 任务',
    brief: task.brief || '',
    status: task.status || '已完成',
    progress: task.progress ?? 100,
    done: task.done ?? true,
    failed: false,
    makaronSay: task.makaronSay || '',
  };
  const ctrl = createExistingCardController(channel, payload.cardId, baseState);
  try {
    if (action === 'accept' || action === 'makaron.card.accept') {
      await ctrl.update({
        status: '已确认交付，正在记录偏好',
        progress: 100,
        done: true,
        failed: false,
        accepted: true,
        makaronSay: trim(`${baseState.makaronSay || ''}\n\n✅ 用户已确认交付。这是正向学习信号，后台会记录本轮满意点用于后续成长。`, 1800),
      });
      await ctrl.log('✅ 用户确认交付（v1.2 fast ACK）');
    } else if (action === 'regen' || action === 'makaron.card.regen') {
      await ctrl.update({
        status: '已收到重新生成请求，后台重抽中',
        progress: 35,
        done: false,
        failed: false,
        accepted: false,
        makaronSay: '已收到重新生成请求。这是迭代/不满意信号；后台会按当前卡片的原始 brief 直接重抽一版。如果你已经补充了文字修改方向，则文字反馈优先。',
      });
      await ctrl.log('🔁 用户请求重新生成（v1.2 fast ACK）');
    } else {
      await ctrl.update({status: `已收到按钮动作：${action || 'unknown'}`, progress: baseState.progress ?? 100});
      await ctrl.log(`按钮动作：${action || 'unknown'}（v1.2 fast ACK）`);
    }
  } finally {
    await disconnect(channel).catch(()=>{});
  }
}
async function backgroundRecord(payload) {
  const task = taskFor(payload.chatId, payload.cardId);
  const action = payload.action;
  const record = {
    version: 'makaron-card-action-v1.2',
    type: (action === 'accept' || action === 'makaron.card.accept') ? 'positive_acceptance' : (action === 'regen' || action === 'makaron.card.regen') ? 'revision_request' : 'unknown_action',
    action,
    at: nowIso(),
    chatId: payload.chatId,
    cardId: payload.cardId,
    operatorOpenId: payload.operatorOpenId,
    task: {
      title: task.title || '',
      brief: task.brief || '',
      status: task.status || '',
      projectId: task.projectId || projectIdFromUrl(task.projectUrl || ''),
      projectUrl: task.projectUrl || '',
      outputs: task.outputs || [],
      makaronSay: trim(task.makaronSay || '', 2000),
      createdAt: task.createdAt || null,
      updatedAt: task.updatedAt || null,
    },
    learning: (action === 'accept' || action === 'makaron.card.accept')
      ? 'User confirmed delivery. Treat this task as a positive style/brief/output signal for this chat/person; review repeated confirmations before promoting to durable preference rules.'
      : 'User requested regeneration. Treat this as an iteration/negative signal unless later accepted; default behavior is to reroll from the current card brief unless typed revision feedback overrides it.',
  };
  writeJsonl(path.join(FEEDBACK_DIR, `${today()}.jsonl`), record);
  if (payload.chatId) {
    activeTasks.upsertActiveTask(payload.chatId, {
      ...task,
      messageId: payload.cardId || task.messageId,
      lastCardAction: record.type,
      lastCardActionAt: Date.now(),
      accepted: record.type === 'positive_acceptance',
      done: record.type === 'positive_acceptance' ? true : false,
      status: record.type === 'positive_acceptance' ? 'accepted' : 'revision_requested',
    });
  }
  if (record.type === 'revision_request') {
    record.reroll = await launchDefaultReroll(payload, task);
    writeJsonl(path.join(FEEDBACK_DIR, `${today()}.jsonl`), {...record, type:'revision_reroll_launched'});
  }
  return record;
}

async function updateCardBackground(chatId, cardId, task, patch, logText) {
  const {channel} = await connect(chatId);
  const ctrl = createExistingCardController(channel, cardId, {...task, chatId});
  try {
    await ctrl.update(patch);
    if (logText) await ctrl.log(logText);
  } finally {
    await disconnect(channel).catch(()=>{});
  }
}

async function launchDefaultReroll(payload, task={}) {
  const expected = inferExpectedAsset(task);
  const projectId = task.projectId || projectIdFromUrl(task.projectUrl || '');
  const slug = `button-reroll-${safeName(task.title || payload.cardId)}-${Date.now()}`;
  const dir = path.join(ACTION_DIR, slug);
  fs.mkdirSync(dir, {recursive:true});
  const originalBrief = String(task.brief || task.makaronSay || '请基于当前 Makaron 项目重新生成一版。').trim();
  const prompt = `用户点击了「重新生成」。请基于当前卡片的原始 brief 直接重抽一版，不要等待用户进一步确认。

原始 brief：
${originalBrief}

要求：
- 保留原任务目标和素材上下文。
- 生成一版新的 ${expected} 产物，构图/细节/表现方式与上一版有所区别。
- 如果项目里已有素材或参考图，请优先使用当前项目 media refs。
- 本轮必须输出新的 ${expected} URL / artifact。`;
  const promptFile = path.join(dir, 'brief.md');
  const stateFile = path.join(dir, 'state.json');
  fs.writeFileSync(promptFile, prompt);
  fs.writeFileSync(stateFile, JSON.stringify({
    ...task,
    title: task.title || 'Makaron 重新生成',
    status: '重新生成中：按原 brief 重抽一版',
    progress: 42,
    done: false,
    failed: false,
    accepted: false,
    makaronSay: '用户点击「重新生成」；后台按当前卡片原始 brief 直接重抽一版。',
    chatId: payload.chatId,
  }, null, 2));
  const createArgs = [path.join(ROOT,'scripts/makaron-card-runner/create-task-job.cjs'), '--chat', payload.chatId, '--card', payload.cardId, '--prompt-file', promptFile, '--state-file', stateFile, '--expected', expected, '--slug', slug];
  if (projectId) createArgs.push('--project', projectId);
  const workerMode = process.env.MAKARON_DEFAULT_WORKER || 'v15-supervisor';
  if (workerMode === 'v15-supervisor') createArgs.push('--sidecar-supervisor-v15');
  else if (workerMode === 'v14-staged') createArgs.push('--review-sidecar');
  const job = JSON.parse(runSync(process.execPath, createArgs));
  const workerScript = workerMode === 'v15-supervisor'
    ? 'scripts/makaron-card-runner/workers/generic-task-worker-v15-supervisor.cjs'
    : workerMode === 'v14-staged'
      ? 'scripts/makaron-card-runner/workers/generic-task-worker-v14-staged.cjs'
      : 'scripts/makaron-card-runner/workers/generic-task-worker.cjs';
  const launch = JSON.parse(runSync(process.execPath, [path.join(ROOT,'scripts/makaron-card-runner/launch-worker.cjs'), workerScript, '--json', '--', '--job', job.jobPath]));
  await updateCardBackground(payload.chatId, payload.cardId, task, {
    status: launch.duplicate ? '重新生成已在进行中' : '重新生成已启动',
    progress: launch.duplicate ? 38 : 45,
    done: false,
    failed: false,
    accepted: false,
    makaronSay: launch.duplicate ? '已存在待处理任务，避免重复提交。' : '已按原要求重新启动生成，V 会继续监督。',
  }, launch.duplicate ? '🔁 已在处理中' : '🔁 重新生成已启动');
  return {expected, projectId, jobPath:job.jobPath, launch};
}

async function main() {
  fs.mkdirSync(ACTION_DIR, {recursive:true});
  const payloadFile = arg('--payload');
  if (!payloadFile) throw new Error('missing --payload <json>');
  const payload = normalizePayload(readJson(payloadFile));
  if (!payload.chatId || !payload.cardId) throw new Error(`missing chatId/cardId in payload: ${JSON.stringify(payload).slice(0,500)}`);

  if (flag('--background')) {
    const record = await backgroundRecord(payload);
    console.log(JSON.stringify({ok:true, mode:'background', record}, null, 2));
    return;
  }

  const started = Date.now();
  const task = taskFor(payload.chatId, payload.cardId);
  await updateCardFast(payload, task);
  const ackMs = Date.now() - started;
  const bgPid = spawnBackground(payloadFile);
  console.log(JSON.stringify({ok:true, mode:'foreground', action:payload.action, chatId:payload.chatId, cardId:payload.cardId, ackMs, bgPid}, null, 2));
}

main().then(() => {
  setTimeout(() => process.exit(0), 100).unref?.();
}).catch(e => {
  console.error(e.stack || e);
  process.exit(1);
});
