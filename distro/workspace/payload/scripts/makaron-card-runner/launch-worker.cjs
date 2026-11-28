#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const crypto = require('node:crypto');
const {evaluateDepartmentCapabilityShadow} = require('./capability-shadow.cjs');

const ROOT = require('./workspace-root.cjs');
const runnerRelease = require('./RELEASE.json');
const LOG_DIR = path.join(ROOT, 'tmp', 'makaron-worker-logs');
const LOCK_DIR = path.join(ROOT, 'tmp', 'makaron-worker-locks');

function usage() {
  console.error('Usage: node scripts/makaron-card-runner/launch-worker.cjs <worker.cjs> [--json] [-- <args...>]');
  process.exit(2);
}
function safeName(s) { return String(s || '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 140) || 'makaron-task'; }
function isPidAlive(pid) {
  if (!pid) return false;
  try { process.kill(Number(pid), 0); return true; }
  catch { return false; }
}
function jobPathFromArgs(args) {
  const i = args.indexOf('--job');
  return i >= 0 ? args[i + 1] : null;
}
function readJobForLock(args) {
  const jp = jobPathFromArgs(args);
  if (!jp) return null;
  try { return JSON.parse(fs.readFileSync(path.resolve(ROOT, jp), 'utf8')); }
  catch { return null; }
}
function reserveLock(job, script, extraArgs) {
  if (!job) return null;
  const key = job.lockKey || job.cardId || (job.chatId && job.slug ? `${job.chatId}:${job.slug}` : null);
  if (!key) return null;
  fs.mkdirSync(LOCK_DIR, {recursive:true});
  const lockPath = path.join(LOCK_DIR, `${safeName(key)}.lock.json`);
  try {
    const prev = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (isPidAlive(prev.pid)) return {duplicate:true, lockPath, prev};
    fs.unlinkSync(lockPath);
  } catch {}
  const fd = fs.openSync(lockPath, 'wx');
  fs.writeSync(fd, JSON.stringify({reservedAt:Date.now(), pid:null, script, extraArgs, jobCardId:job.cardId, projectId:job.projectId||null}, null, 2));
  fs.closeSync(fd);
  return {duplicate:false, lockPath};
}
function activateLock(lockPath, pid) {
  if (!lockPath) return;
  try {
    const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    data.pid = pid; data.activatedAt = Date.now();
    fs.writeFileSync(lockPath, JSON.stringify(data, null, 2));
  } catch {}
}
function resolveMakaronKeyForJob(job) {
  const {resolveJobAccount, accountMetadata} = require('./account-routing.cjs');
  const result = resolveJobAccount(job);
  const env = {...process.env};
  delete env.MAKARON_API_KEY;
  if (result.api_key) env.MAKARON_API_KEY = result.api_key;
  // Snapshot references only, never credentials. Worker re-resolves the same source.
  env.MAKARON_ACCOUNT_REF = result.credential_ref || '';
  return {env, info:accountMetadata(result)};
}

function withReviewAgentRuntime(env) {
  if (env.MAKARON_REVIEW_AGENT_BIN || env.OPENCLAW_BIN) return env;
  const wrapper = path.join(ROOT, 'scripts', 'skill-layer', 'openclaw-cli-wrapper.sh');
  try {
    fs.accessSync(wrapper, fs.constants.X_OK);
    return {...env, MAKARON_REVIEW_AGENT_BIN: wrapper};
  } catch {
    return env;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const scriptArg = argv.shift();
  if (!scriptArg) usage();
  const json = argv.includes('--json');
  const sep = argv.indexOf('--');
  const extraArgs = sep >= 0 ? argv.slice(sep + 1) : [];
  const script = path.resolve(ROOT, scriptArg);
  if (!script.startsWith(ROOT + path.sep)) throw new Error(`worker outside workspace: ${script}`);
  if (!fs.existsSync(script)) throw new Error(`worker not found: ${script}`);
  if (!script.endsWith('.cjs') && !script.endsWith('.js')) throw new Error(`worker must be .cjs/.js: ${script}`);

  const job = readJobForLock(extraArgs);
  const lock = reserveLock(job, script, extraArgs);
  if (lock?.duplicate) {
    const result = {ok:false, runnerVersion:runnerRelease.version, runnerReleaseId:runnerRelease.releaseId, duplicate:true, reason:'active_worker_lock', lockPath:lock.lockPath, active:lock.prev};
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`duplicate active worker pid=${lock.prev?.pid} lock=${lock.lockPath}`);
    return;
  }

  fs.mkdirSync(LOG_DIR, {recursive:true});
  const id = `${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${crypto.randomBytes(4).toString('hex')}`;
  const logPath = path.join(LOG_DIR, `${path.basename(script).replace(/[^a-z0-9._-]+/gi,'-')}.${id}.log`);
  const out = fs.openSync(logPath, 'a');
  const launchedAt = Date.now();
  const keyResolution = resolveMakaronKeyForJob(job);
  const workerEnv = withReviewAgentRuntime(keyResolution.env);
  // This is intentionally observational. It must never alter keyResolution or
  // the child environment until an explicit enforcement rollout is approved.
  const capabilityShadow = evaluateDepartmentCapabilityShadow(job);
  fs.writeSync(out, JSON.stringify({event:'launch', runnerVersion:runnerRelease.version, runnerReleaseId:runnerRelease.releaseId, launchedAt, script, extraArgs, lockPath:lock?.lockPath || null, makaronKey: keyResolution.info, capabilityShadow}) + '\n');

  const child = spawn(process.execPath, [script, ...extraArgs], {
    cwd: ROOT,
    env: {...workerEnv, MAKARON_WORKER:'1', LAUNCHED_AT:String(launchedAt), MAKARON_WORKER_LOG:logPath, MAKARON_WORKER_LOCK:lock?.lockPath || ''},
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  activateLock(lock?.lockPath, child.pid);
  const result = {ok:true, runnerVersion:runnerRelease.version, runnerReleaseId:runnerRelease.releaseId, pid:child.pid, launchedAt, script, logPath, lockPath:lock?.lockPath || null};
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(`launched pid=${child.pid} log=${logPath}`);
}

try { main(); }
catch (e) { console.error(e.stack || e); process.exit(1); }
