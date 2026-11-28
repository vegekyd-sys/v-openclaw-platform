#!/usr/bin/env node
'use strict';

// Resolve an inbound Feishu reply without touching OpenClaw's agent prompt.
// Input is the normal inbound message ID (already provided by OpenClaw); the
// script asks Feishu for its authoritative reply_to field, then maps that
// delivered-media message to the exact Makaron project and local asset.

const {execFileSync} = require('node:child_process');
const registry = require('./delivered-media-registry.cjs');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(message, code=2) {
  console.error(message);
  process.exit(code);
}

const messageId = String(arg('--message-id') || '').trim();
if (!/^om_[A-Za-z0-9]+$/.test(messageId)) fail('Usage: resolve-feishu-reply-media.cjs --message-id om_xxx');

let parsed;
try {
  const raw = execFileSync('lark-cli', [
    'im', '+messages-mget', '--as', 'bot', '--message-ids', messageId,
    '--no-reactions', '--format', 'json',
  ], {encoding:'utf8', stdio:['ignore','pipe','pipe']});
  parsed = JSON.parse(raw);
} catch (error) {
  fail(`Feishu message lookup failed: ${String(error.stderr || error.message).trim()}`, 1);
}

const message = parsed?.data?.messages?.find((item) => item?.message_id === messageId);
if (!message) {
  console.log(JSON.stringify({ok:true, status:'message_not_found', messageId}, null, 2));
  process.exit(0);
}
const replyToMessageId = String(message.reply_to || '').trim();
if (!replyToMessageId) {
  console.log(JSON.stringify({ok:true, status:'not_a_reply', messageId}, null, 2));
  process.exit(0);
}
const anchor = registry.resolveDelivery(replyToMessageId);
console.log(JSON.stringify({
  ok:true,
  status: anchor ? 'anchored' : 'reply_target_unmapped',
  messageId,
  replyToMessageId,
  anchor: anchor || null,
}, null, 2));
