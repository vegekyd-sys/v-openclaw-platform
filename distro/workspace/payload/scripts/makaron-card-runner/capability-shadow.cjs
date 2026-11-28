'use strict';

// Default-off shadow evaluator for department-driven capabilities.
// It never changes key selection or child-process environment. Its only output
// is a minimal, non-secret decision record for the worker audit log.

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = require('./workspace-root.cjs');
const EVALUATOR = path.join(ROOT, 'scripts', 'department-capability-poc.mjs');

function parseDecision(stdout, stderr) {
  for (const raw of [stdout, stderr]) {
    const text = String(raw || '').trim();
    if (!text) continue;
    try { return JSON.parse(text); } catch {}
  }
  return null;
}

function auditSafe(decision) {
  const evidence = decision?.evidence || {};
  return {
    mode: 'shadow',
    evaluated: true,
    decision: decision?.decision || 'deny',
    reason: decision?.reason || '',
    failClosed: Boolean(decision?.fail_closed),
    capability: decision?.capability || 'makaron.owner-key',
    policyVersion: decision?.policy_version || '',
    evidence: {
      departmentOpenId: evidence.department_open_id || '',
      channelRule: evidence.channel_rule || '',
      membershipSource: evidence.membership_source || '',
    },
  };
}

function evaluateDepartmentCapabilityShadow(job, options = {}) {
  const env = options.env || process.env;
  const run = options.run || spawnSync;
  const mode = String(env.MAKARON_DEPARTMENT_CAPABILITY_MODE || 'off').toLowerCase();
  if (mode !== 'shadow') return {mode, evaluated:false, reason:'disabled'};

  const senderOpenId = String(job?.senderOpenId || '');
  const chatId = String(job?.chatId || '');
  const chatType = String(job?.chatMode || job?.chatInfo?.chat_mode || '').toLowerCase();
  const recipientAppId = String(job?.recipientAppId || '');
  if (!senderOpenId || !chatId || !['p2p', 'group'].includes(chatType)) {
    return {mode:'shadow', evaluated:false, reason:'missing_trusted_identity_context'};
  }
  if (chatType === 'p2p' && !recipientAppId) {
    return {mode:'shadow', evaluated:false, reason:'missing_trusted_recipient_app'};
  }

  const args = [EVALUATOR,
    '--sender-open-id', senderOpenId,
    '--chat-id', chatId,
    '--chat-type', chatType,
    '--capability', 'makaron.owner-key',
  ];
  if (chatType === 'p2p') args.push('--recipient-app-id', recipientAppId);

  try {
    const result = run(process.execPath, args, {
      cwd: ROOT,
      encoding: 'utf8',
      env,
      timeout: 15000,
    });
    const decision = parseDecision(result?.stdout, result?.stderr);
    if (!decision) return {mode:'shadow', evaluated:false, reason:'evaluator_unparseable'};
    return auditSafe(decision);
  } catch (error) {
    // Shadow failures must never affect the existing production path.
    return {mode:'shadow', evaluated:false, reason:'evaluator_error'};
  }
}

module.exports = {evaluateDepartmentCapabilityShadow};
