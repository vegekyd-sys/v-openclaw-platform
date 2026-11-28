#!/usr/bin/env node
'use strict';

/**
 * Parent-session visibility guard for Makaron Feishu cards.
 *
 * Start this immediately after createCard(...). It keeps the existing card
 * visibly alive while the parent session prepares materials/account/job. Once
 * launch-worker creates the card lock for the real worker, this watchdog exits.
 *
 * It does NOT run Makaron, download outputs, or rescue work. It only prevents
 * the user from seeing a static card for minutes before worker handoff.
 */

process.env.MAKARON_PARENT_WATCHDOG = '1';

const fs = require('node:fs');
const path = require('node:path');
const {
  connect, disconnect, createExistingCardController,
} = require('./run.cjs');

const ROOT = require('./workspace-root.cjs');
const LOCK_DIR = path.join(ROOT, 'tmp', 'makaron-worker-locks');

function take(name, fallback=null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function flag(name) { return process.argv.includes(name); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeName(s) { return String(s || '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 140) || 'makaron-task'; }
function now() { return new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'}); }
function isPidAlive(pid) {
  if (!pid) return false;
  try { process.kill(Number(pid), 0); return true; }
  catch { return false; }
}
function readLock(lockPath) {
  try { return JSON.parse(fs.readFileSync(lockPath, 'utf8')); }
  catch { return null; }
}
function workerActive(lockPath) {
  const lock = readLock(lockPath);
  return Boolean(lock && isPidAlive(lock.pid));
}

async function main() {
  const chatId = take('--chat');
  const cardId = take('--card');
  if (!chatId || !cardId) {
    console.error('Usage: parent-handoff-watchdog.cjs --chat <oc_xxx> --card <om_xxx> [--brief <text>] [--max-ms 180000] [--interval-ms 15000]');
    process.exit(2);
  }

  const lockPath = take('--lock', path.join(LOCK_DIR, `${safeName(cardId)}.lock.json`));
  const brief = take('--brief', '正在准备素材、账号与任务交接；完成后会由后台 worker 接管。');
  const maxMs = Number(take('--max-ms', '180000'));
  const intervalMs = Number(take('--interval-ms', '15000'));
  const firstDelayMs = Number(take('--first-delay-ms', '10000'));
  const progressBase = Number(take('--progress', '10'));
  const silent = flag('--silent');
  const startedAt = Date.now();

  const {channel} = await connect(chatId);
  const ctrl = createExistingCardController(channel, cardId, {chatId});
  try {
    if (!silent) console.log(JSON.stringify({event:'watchdog_start', chatId, cardId, lockPath, startedAt}));
    await sleep(firstDelayMs);
    let tick = 0;
    while (Date.now() - startedAt < maxMs) {
      if (workerActive(lockPath)) {
        if (!silent) console.log(JSON.stringify({event:'worker_detected', cardId, lockPath, elapsedMs:Date.now()-startedAt}));
        return;
      }
      tick++;
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      await ctrl.update({
        status: `准备中：尚未交接 worker（${elapsedSec}s）`,
        progress: Math.min(18, progressBase + tick),
        makaronSay: `${brief}\n\n如果这里停留较久，不代表生成失败；当前仍在父会话准备阶段，稍后会交给后台 worker。`,
      });
      await ctrl.log(`父会话仍在准备：${elapsedSec}s`);
      await sleep(intervalMs);
    }
    if (!workerActive(lockPath)) {
      await ctrl.update({
        status: '准备阶段过长，尚未交接 worker',
        progress: 20,
        makaronSay: '父会话准备时间过长：worker 还没有接管。这个状态是可见的，不应再表现为“没反应”。',
      });
      await ctrl.log('⚠️ worker 交接超时');
    }
  } finally {
    await disconnect(channel).catch(()=>{});
    setTimeout(()=>process.exit(0), 100).unref?.();
  }
}

main().catch(e => {
  console.error(e.stack || e);
  process.exit(1);
});
