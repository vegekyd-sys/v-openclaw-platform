'use strict';

// Single-owner account routing for an installed V (v-distro).
//
// V itself serves many people and keeps one Makaron key per chat (~/.makaron/chat-keys.json, with
// self-registration for new groups). An installed V serves exactly one owner: every chat it answers in
// (the owner's direct chat, task rooms, groups where only the owner's messages get through) is the
// owner's, so every job uses the owner's Makaron key. There is no per-group registration.
//
// Key sources, in order: the owner's entry in ~/.makaron/chat-keys.json (mode 600), the OpenClaw
// secrets store mirror ~/.openclaw/secrets/store/MAKARON_API_KEY, then MAKARON_API_KEY from the
// installer's environment. The owner is the one onboarding recorded (onboarding/owner.json).
// Same exports as V's version, so launcher and workers are unchanged.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runnerRelease = require('./RELEASE.json');
const ROOT = require('./workspace-root.cjs');

const INSTALL_KEY = process.env.MAKARON_API_KEY || '';

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function ownerOpenId() {
  if (process.env.V_OWNER_OPEN_ID) return process.env.V_OWNER_OPEN_ID;
  return String(readJson(path.join(ROOT, 'onboarding', 'owner.json'))?.open_id || '');
}
const OWNER = ownerOpenId();

function canonicalScope(value) {
  return String(value || '').trim().replace(/^chat:/, '');
}
function storeKey(home) {
  const storePath = path.join(home, '.makaron', 'chat-keys.json');
  const store = readJson(storePath);
  const record = store && OWNER && store[OWNER];
  if (!record?.api_key) return null;
  try {
    if ((fs.statSync(storePath).mode & 0o077) !== 0) return {error:'account_store_permissions'};
  } catch { return null; }
  return {api_key:record.api_key, source:'owner_store', credential_ref:`chat-key:${OWNER}`};
}
function secretsKey(home) {
  try {
    const key = fs.readFileSync(path.join(home, '.openclaw', 'secrets', 'store', 'MAKARON_API_KEY'), 'utf8').trim();
    return key ? {api_key:key, source:'owner_secret', credential_ref:'secret:MAKARON_API_KEY'} : null;
  } catch { return null; }
}
function resolveAccount({chatId, home = os.homedir(), env = process.env} = {}) {
  const scope = canonicalScope(chatId);
  if (!/^(oc_|ou_|user:ou_)[a-zA-Z0-9_:.-]+$/.test(scope)) {
    return {error:'invalid_account_scope', action:'blocked', scope};
  }
  const fromStore = storeKey(home);
  if (fromStore?.error) return {error:fromStore.error, action:'blocked', scope};
  const found = fromStore || secretsKey(home)
    || ((env.MAKARON_API_KEY || INSTALL_KEY) ? {api_key:env.MAKARON_API_KEY || INSTALL_KEY, source:'owner_env', credential_ref:'env:MAKARON_API_KEY'} : null);
  if (!found) return {error:'owner_key_unavailable', action:'blocked', scope, credential_ref:'env:MAKARON_API_KEY'};
  return {...found, scope, claimed:true, claim_url:'', chat_name:'', authorization_message_id:'', override_expires_at:null, action:'use_key'};
}
// Only non-secret fields may reach logs/job snapshots or user-facing output.
function accountMetadata(result) {
  const {api_key, claim_url, ...metadata} = result;
  return {...metadata, runnerVersion:runnerRelease.version, runnerReleaseId:runnerRelease.releaseId, hasClaimUrl:Boolean(claim_url), ok:Boolean(api_key)};
}
function resolveJobAccount(job, options = {}) {
  return resolveAccount({...options, chatId:canonicalScope(job?.chatId)});
}
function applyJobAccount(job, env = process.env, options = {}) {
  const result = resolveJobAccount(job, {...options, env:{...env}});
  delete env.MAKARON_API_KEY;
  if (!result.api_key) throw new Error(`账号凭据解析受阻：${result.error || result.action}；这台机器还没有配置 Makaron key（MAKARON_API_KEY），请主人提供。`);
  if (env.MAKARON_ACCOUNT_REF && env.MAKARON_ACCOUNT_REF !== result.credential_ref) {
    throw new Error('账号凭据在启动后发生变化，已停止提交；请续接原卡。');
  }
  env.MAKARON_API_KEY = result.api_key;
  return {...accountMetadata(result), claim_url:''};
}
module.exports = {resolveAccount, resolveJobAccount, applyJobAccount, accountMetadata, canonicalScope, OWNER};
if (require.main === module) {
  const result = resolveAccount({chatId:process.argv[2]});
  process.stdout.write(JSON.stringify(accountMetadata(result)) + '\n');
  process.exitCode = result.api_key ? 0 : 3;
}
