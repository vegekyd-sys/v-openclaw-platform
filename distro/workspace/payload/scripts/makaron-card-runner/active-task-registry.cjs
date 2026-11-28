#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = require('./workspace-root.cjs');

const DEFAULT_REGISTRY = path.resolve(process.env.MAKARON_ACTIVE_TASKS || path.join(ROOT, 'tmp', 'makaron-active-tasks.json'));
const DEFAULT_ACTIVE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_DONE_FEEDBACK_TTL_MS = 10 * 60 * 1000;
const DEFAULT_STALE_IN_PROGRESS_TTL_MS = 48 * 60 * 60 * 1000;
const DEFAULT_AUTO_COMPLETE_TTL_MS = 2 * 60 * 60 * 1000;

function nowMs() { return Date.now(); }
function ensureDir(file) { fs.mkdirSync(path.dirname(file), {recursive:true}); }
function projectIdFromUrl(url='') { return String(url || '').match(/projects\/([0-9a-f-]{36})/i)?.[1] || ''; }
function normalizeProject(task={}) {
  const projectId = String(task.projectId || projectIdFromUrl(task.projectUrl) || '').trim();
  return projectId ? {...task, projectId} : task;
}
function normalizeData(data) {
  data = data && typeof data === 'object' ? data : {};
  const tasks = data.tasks && typeof data.tasks === 'object' ? data.tasks : {};
  const out = { version: Math.max(Number(data.version || 0), 2), tasks: {}, chatIndex: {}, cardIndex: {}, taskIndex: {} };
  for (const [legacyKey, raw] of Object.entries(tasks)) {
    if (!raw || typeof raw !== 'object') continue;
    const chatId = key(raw.chatId || (legacyKey.startsWith('chat:') ? legacyKey.slice(5) : legacyKey));
    const cardId = raw.cardId || raw.messageId || '';
    const taskId = raw.taskId || raw.id || '';
    const primary = taskKey({cardId, messageId: cardId, taskId}, chatId);
    const task = normalizeProject({...raw, chatId, cardId: cardId || raw.cardId || '', messageId: raw.messageId || cardId || ''});
    task.attemptHistory = Array.isArray(task.attemptHistory) ? task.attemptHistory : (Array.isArray(task.attempts) ? task.attempts : []);
    out.tasks[primary] = task;
    indexTask(out, primary, task);
  }
  return out;
}
function readJson(file=DEFAULT_REGISTRY) {
  try { return normalizeData(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { return {version:2, tasks:{}, chatIndex:{}, cardIndex:{}, taskIndex:{}}; }
}
function writeJson(data, file=DEFAULT_REGISTRY) {
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(normalizeData(data), null, 2));
  return data;
}
function key(chatId) { return String(chatId || '').replace(/^chat:/, ''); }
function taskKey(input={}, chatId='') {
  const cardId = input.cardId || input.messageId || input.openMessageId || '';
  const explicitTaskId = input.taskId || input.id || '';
  if (cardId) return `card:${cardId}`;
  if (explicitTaskId) return `task:${explicitTaskId}`;
  return `chat:${key(chatId || input.chatId)}`;
}
function pushUnique(arr, value) {
  if (!value) return arr || [];
  const out = Array.isArray(arr) ? arr.slice() : [];
  if (!out.includes(value)) out.push(value);
  return out;
}
function indexTask(data, primary, task={}) {
  const chatId = key(task.chatId || '');
  const cardId = task.cardId || task.messageId || '';
  const explicitTaskId = task.taskId || task.id || '';
  data.chatIndex ||= {}; data.cardIndex ||= {}; data.taskIndex ||= {};
  if (chatId) data.chatIndex[chatId] = pushUnique(data.chatIndex[chatId], primary);
  if (cardId) data.cardIndex[cardId] = primary;
  if (explicitTaskId) data.taskIndex[explicitTaskId] = primary;
}
function compactAttempt(patch={}) {
  if (patch.attempt) return patch.attempt;
  if (patch.launch || patch.jobPath || patch.workerPid || patch.lastCardAction) {
    return {
      at: patch.updatedAt || nowMs(),
      source: patch.source || '',
      status: patch.status || '',
      jobPath: patch.jobPath || '',
      workerPid: patch.workerPid || '',
      action: patch.lastCardAction || '',
    };
  }
  return null;
}
function mergeAttemptHistory(prev={}, patch={}) {
  const base = Array.isArray(prev.attemptHistory) ? prev.attemptHistory.slice() : (Array.isArray(prev.attempts) ? prev.attempts.slice() : []);
  if (Array.isArray(patch.attemptHistory)) base.push(...patch.attemptHistory);
  const one = compactAttempt(patch);
  if (one) base.push(one);
  return base.slice(-80);
}
function normalizeText(text) { return String(text || '').trim().replace(/\s+/g, ' '); }
function ageMs(task, at=nowMs()) { return at - Number(task?.updatedAt || task?.createdAt || 0); }
function isClosedTask(task={}) {
  return Boolean(task.superseded || task.closed || task.autoClosed || task.phase === 'superseded' || task.status === '已被新卡替代');
}
function hasLivePid(pid) {
  const n = Number(pid || 0);
  if (!Number.isInteger(n) || n <= 0) return false;
  try { process.kill(n, 0); return true; }
  catch { return false; }
}
function taskWorkerPids(task={}) {
  const pids = [];
  if (task.workerPid) pids.push(task.workerPid);
  for (const a of task.attemptHistory || task.attempts || []) {
    if (a?.workerPid) pids.push(a.workerPid);
    if (a?.pid) pids.push(a.pid);
  }
  return [...new Set(pids.map(Number).filter(n => Number.isInteger(n) && n > 0))];
}
function hasLiveWorker(task={}) { return taskWorkerPids(task).some(hasLivePid); }
function isInProgressLike(task={}) {
  if (!task || task.done || task.failed || task.accepted || task.autoCompleted || isClosedTask(task)) return false;
  const text = `${task.status || ''} ${task.phase || ''}`.toLowerCase();
  return !text || /in[_ -]?progress|progress|worker|handoff|生成|处理中|接管|提交|素材|准备|qc gate|需要你决定|重新生成/.test(text);
}
function isFeedbackWaitingDone(task={}) {
  if (!task || !task.done || task.failed || task.accepted || task.autoCompleted || isClosedTask(task)) return false;
  const text = `${task.status || ''} ${task.phase || ''}`.toLowerCase();
  return /delivered|已发送|等待反馈|完成|done/.test(text);
}

function reconcileTaskLifecycle(opts={}) {
  const file = opts.file || DEFAULT_REGISTRY;
  const at = Number(opts.at || nowMs());
  const staleTtlMs = Number(opts.staleTtlMs || opts.staleHours * 60 * 60 * 1000 || DEFAULT_STALE_IN_PROGRESS_TTL_MS);
  const autoCompleteTtlMs = Number(opts.autoCompleteTtlMs || opts.autoCompleteHours * 60 * 60 * 1000 || DEFAULT_AUTO_COMPLETE_TTL_MS);
  const dryRun = Boolean(opts.dryRun);
  const data = readJson(file);
  const changes = [];
  for (const [primary, task] of Object.entries(data.tasks || {})) {
    const taskAge = ageMs(task, at);
    if (isInProgressLike(task) && taskAge >= staleTtlMs && !hasLiveWorker(task)) {
      const patch = {
        status: 'stale_needs_review',
        phase: 'stale',
        stale: true,
        staleReason: `no live worker for ${Math.round(taskAge / 3600000)}h`,
        staleAt: at,
        done: false,
        failed: false,
      };
      changes.push({primary, cardId: task.messageId || task.cardId || '', chatId: task.chatId || '', from: task.status || '', to: patch.status, reason: patch.staleReason});
      if (!dryRun) data.tasks[primary] = {...task, ...patch, updatedAt: at, attemptHistory: mergeAttemptHistory(task, {updatedAt: at, status: patch.status, source: 'reconcileTaskLifecycle'})};
      continue;
    }
    const noButtonSinceDelivery = !task.lastCardActionAt || Number(task.lastCardActionAt) < Number(task.updatedAt || task.createdAt || 0);
    if (isFeedbackWaitingDone(task) && noButtonSinceDelivery && taskAge >= autoCompleteTtlMs) {
      const patch = {
        status: 'auto_completed',
        phase: 'completed',
        autoCompleted: true,
        autoCompletedAt: at,
        autoCompleteReason: `no card action for ${Math.round(taskAge / 60000)}min after delivery`,
        done: true,
        failed: false,
      };
      changes.push({primary, cardId: task.messageId || task.cardId || '', chatId: task.chatId || '', from: task.status || '', to: patch.status, reason: patch.autoCompleteReason});
      if (!dryRun) data.tasks[primary] = {...task, ...patch, updatedAt: at, attemptHistory: mergeAttemptHistory(task, {updatedAt: at, status: patch.status, source: 'reconcileTaskLifecycle'})};
    }
  }
  if (!dryRun && changes.length) writeJson(data, file);
  return {ok: true, file, dryRun, at, staleTtlMs, autoCompleteTtlMs, changed: changes.length, changes};
}

function getActiveTask(chatId, opts={}) {
  const data = readJson(opts.file);
  if (opts.cardId && data.cardIndex?.[opts.cardId]) return data.tasks[data.cardIndex[opts.cardId]] || null;
  if (opts.taskId && data.taskIndex?.[opts.taskId]) return data.tasks[data.taskIndex[opts.taskId]] || null;
  const ids = data.chatIndex?.[key(chatId)] || [];
  const tasks = ids.map(id => data.tasks[id]).filter(t=>t && (opts.includeClosed || !isClosedTask(t)));
  if (!tasks.length) return null;
  return tasks.sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0))[0];
}

function getActiveTaskByCard(cardId, opts={}) {
  const data = readJson(opts.file);
  return data.tasks[data.cardIndex?.[cardId]] || null;
}

// Project context is deliberately durable, unlike an active worker. A finished
// card can be resumed days later; only an explicit "new project" should drop it.
function getProjectTask(chatId, opts={}) {
  const data = readJson(opts.file);
  if (opts.cardId && data.cardIndex?.[opts.cardId]) {
    const exact = normalizeProject(data.tasks[data.cardIndex[opts.cardId]] || {});
    if (exact.projectId) return exact;
  }
  const ids = data.chatIndex?.[key(chatId)] || [];
  return ids.map(id => normalizeProject(data.tasks[id] || {}))
    .filter(task => task.projectId && !isClosedTask(task))
    .sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0))[0] || null;
}

function upsertActiveTask(chatId, patch={}, opts={}) {
  const data = readJson(opts.file);
  const chatKey = key(chatId || patch.chatId);
  const primary = taskKey(patch, chatKey);
  const prev = data.tasks[primary] || (patch.messageId && data.cardIndex?.[patch.messageId] ? data.tasks[data.cardIndex[patch.messageId]] : {}) || {};
  const t = nowMs();
  const next = normalizeProject({
    ...prev,
    ...patch,
    chatId:chatKey,
    cardId: patch.cardId || patch.messageId || prev.cardId || prev.messageId || '',
    messageId: patch.messageId || patch.cardId || prev.messageId || prev.cardId || '',
    taskId: patch.taskId || prev.taskId || '',
    attemptHistory: mergeAttemptHistory(prev, patch),
    createdAt: prev.createdAt || patch.createdAt || t,
    updatedAt: patch.updatedAt || t,
  });
  data.tasks[primary] = next;
  indexTask(data, primary, next);
  writeJson(data, opts.file);
  return next;
}

function clearActiveTask(chatId, opts={}) {
  const data = readJson(opts.file);
  const chatKey = key(chatId);
  for (const id of data.chatIndex?.[chatKey] || []) delete data.tasks[id];
  delete data.chatIndex?.[chatKey];
  writeJson(data, opts.file);
}

const newTaskRe = /(下一个|另一个|新(的)?任务|新开|重新开|另做|再做一[个张条]|换一张图|用这张(新图|照片)|这张照片.*做|这个素材.*做|再试次|我们再试)/i;
const updateRe = /(刚刚|上[一个张条版]|这[个张版]|当前|原来|那个|继续|接着|补充|加上|加一点|改成|换成|不要|去掉|保留|更|再.*一点|重新生成|重做|reroll|修改|调整|优化|这个方向|这样|按这个)/i;
const explicitNoNewRe = /(不要新开|别新建|别再建|更新(这个|当前|原)卡|同一张卡|接着这个|继续这个)/i;
const explicitNewRe = /(新建卡|新开卡|新建一个卡|另开一张卡|单独开|新任务)/i;

function classifyMakaronMessage(input={}) {
  const at = Number(input.at || nowMs());
  const chatId = key(input.chatId || input.chat_id);
  const text = normalizeText(input.text || input.message || '');
  const hasMedia = Boolean(input.hasMedia || input.media || input.imagePath || input.videoPath);
  const task = input.task || getActiveTask(chatId, {file: input.file});
  const projectTask = input.projectTask || getProjectTask(chatId, {file: input.file, cardId: input.cardId});
  const activeTtlMs = input.activeTtlMs || DEFAULT_ACTIVE_TTL_MS;
  const doneFeedbackTtlMs = input.doneFeedbackTtlMs || DEFAULT_DONE_FEEDBACK_TTL_MS;

  if (!task && !projectTask) return {action:'new_card', confidence:0.95, reason:'no_active_task', task:null};

  // A completed/expired worker is not a completed project. Keep the project
  // pointer available for explicit continuation even after active-task TTL.
  if (explicitNoNewRe.test(text) && projectTask) return {action:'update_card', confidence:0.99, reason:'explicit_continue_project', task:projectTask};
  if (explicitNewRe.test(text)) return {action:'new_card', confidence:0.98, reason:'explicit_new_card', task:task || projectTask || null};
  if (!task && projectTask && updateRe.test(text)) return {action:'update_card', confidence:0.94, reason:'durable_project_followup', task:projectTask};

  if (!task) return {action:'new_card', confidence:0.95, reason:'no_active_task', task:null};

  const done = task.done || task.status === 'done' || task.status === 'delivered' || task.status === 'completed';
  const stale = ageMs(task, at) > (done ? doneFeedbackTtlMs : activeTtlMs);
  // "Continue this project" remains valid after the card feedback window. The
  // window controls active-card UX, not whether a Makaron project may resume.
  if (stale && projectTask && updateRe.test(text) && !newTaskRe.test(text)) {
    return {action:'update_card', confidence:0.94, reason:'durable_project_followup', task:projectTask};
  }
  if (stale) return {action:'new_card', confidence:0.9, reason: done ? 'previous_done_feedback_window_expired' : 'active_task_expired', task};

  if (explicitNoNewRe.test(text)) return {action:'update_card', confidence:0.98, reason:'explicit_update_existing_card', task};

  const saysUpdate = updateRe.test(text);
  const saysNew = newTaskRe.test(text);

  // New media often starts a new card, unless the wording clearly says it is a revision/reference for the current card.
  if (hasMedia && saysUpdate && !saysNew) return {action:'update_card', confidence:0.82, reason:'media_with_update_language', task};
  if (hasMedia && saysNew) return {action:'new_card', confidence:0.86, reason:'media_with_new_task_language', task};
  if (hasMedia && !saysUpdate) return {action:'new_card', confidence:0.78, reason:'new_media_without_update_language', task};

  if (saysUpdate && !saysNew) return {action:'update_card', confidence:0.84, reason: done ? 'recent_done_feedback' : 'active_task_followup_text', task};
  if (saysNew && !saysUpdate) return {action:'new_card', confidence:0.82, reason:'new_task_language', task};

  // Short text during an active unfinished task is usually extra brief, not a new task.
  if (!done && text.length > 0 && text.length <= 120) return {action:'update_card', confidence:0.72, reason:'short_text_during_active_task', task};

  return {action:'ask_or_default_update', confidence:0.55, reason:'ambiguous', task};
}

function cli() {
  const [, , cmd, ...args] = process.argv;
  if (cmd === 'classify') {
    const input = JSON.parse(args.join(' ') || '{}');
    console.log(JSON.stringify(classifyMakaronMessage(input), null, 2));
  } else if (cmd === 'upsert') {
    const [chatId, json='{}'] = args;
    console.log(JSON.stringify(upsertActiveTask(chatId, JSON.parse(json)), null, 2));
  } else if (cmd === 'get') {
    console.log(JSON.stringify(getActiveTask(args[0], {cardId: args[1]}), null, 2));
  } else if (cmd === 'get-project') {
    console.log(JSON.stringify(getProjectTask(args[0], {cardId: args[1]}), null, 2));
  } else if (cmd === 'clear') {
    clearActiveTask(args[0]);
    console.log('ok');
  } else if (cmd === 'reconcile' || cmd === 'reconcile-stale') {
    const dryRun = args.includes('--dry-run');
    const json = args.includes('--json');
    const staleHoursIdx = args.indexOf('--stale-hours');
    const autoCompleteHoursIdx = args.indexOf('--auto-complete-hours');
    const result = reconcileTaskLifecycle({
      dryRun,
      staleHours: staleHoursIdx >= 0 ? Number(args[staleHoursIdx + 1]) : undefined,
      autoCompleteHours: autoCompleteHoursIdx >= 0 ? Number(args[autoCompleteHoursIdx + 1]) : undefined,
    });
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`ok: ${dryRun ? 'would update' : 'updated'} ${result.changed} task(s)`);
  } else {
    console.error('Usage: active-task-registry.cjs classify <json> | upsert <chatId> <json> | get <chatId> [cardId] | get-project <chatId> [cardId] | clear <chatId> | reconcile [--dry-run] [--json] [--stale-hours 48] [--auto-complete-hours 2]');
    process.exit(2);
  }
}

if (require.main === module) cli();

module.exports = {
  DEFAULT_REGISTRY,
  readJson, writeJson,
  getActiveTask, getActiveTaskByCard, getProjectTask, upsertActiveTask, clearActiveTask, isClosedTask,
  reconcileTaskLifecycle, hasLiveWorker, isInProgressLike,
  classifyMakaronMessage,
};
