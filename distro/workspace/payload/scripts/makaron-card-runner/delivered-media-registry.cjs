#!/usr/bin/env node
'use strict';

// Durable delivery anchor: the Feishu message that contains an asset is the
// only reliable user-facing identity for “modify this image/video/file”.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = require('./workspace-root.cjs');
const DEFAULT_REGISTRY = path.resolve(process.env.MAKARON_DELIVERED_MEDIA || path.join(ROOT, 'tmp', 'makaron-delivered-media.json'));
const MAX_RECORDS = 12000;

function ensureDir(file) { fs.mkdirSync(path.dirname(file), {recursive:true}); }
function normalizeChatId(chatId='') { return String(chatId || '').replace(/^chat:/, ''); }
function readJson(file=DEFAULT_REGISTRY) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      version: Math.max(1, Number(raw?.version || 1)),
      messages: raw?.messages && typeof raw.messages === 'object' ? raw.messages : {},
    };
  } catch { return {version:1, messages:{}}; }
}
function writeJson(data, file=DEFAULT_REGISTRY) {
  ensureDir(file);
  const out = {version:1, messages:data?.messages || {}};
  const entries = Object.entries(out.messages)
    .sort(([,a],[,b]) => Number(a?.sentAt || 0) - Number(b?.sentAt || 0));
  if (entries.length > MAX_RECORDS) out.messages = Object.fromEntries(entries.slice(-MAX_RECORDS));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
  fs.renameSync(tmp, file);
  return out;
}
function normalizeRecord(input={}) {
  const messageId = String(input.messageId || input.deliveryMessageId || '').trim();
  if (!messageId) throw new Error('delivery record requires messageId');
  return {
    messageId,
    chatId: normalizeChatId(input.chatId),
    cardId: String(input.cardId || '').trim(),
    projectId: String(input.projectId || '').trim(),
    projectUrl: String(input.projectUrl || '').trim(),
    runId: String(input.runId || '').trim(),
    asset: {
      type: String(input.asset?.type || input.assetType || 'file').trim(),
      id: String(input.asset?.id || input.assetId || '').trim(),
      mediaRef: String(input.asset?.mediaRef || input.mediaRef || '').trim(),
      url: String(input.asset?.url || input.assetUrl || '').trim(),
      localPath: String(input.asset?.localPath || input.localPath || '').trim(),
      name: String(input.asset?.name || input.name || '').trim(),
    },
    delivery: {
      transport: String(input.delivery?.transport || input.transport || '').trim(),
      replyTo: String(input.delivery?.replyTo || input.replyTo || '').trim(),
    },
    sentAt: Number(input.sentAt || Date.now()),
  };
}
function recordDelivery(input={}, opts={}) {
  const record = normalizeRecord(input);
  const data = readJson(opts.file);
  data.messages[record.messageId] = record;
  writeJson(data, opts.file);
  return record;
}
function resolveDelivery(messageId, opts={}) {
  if (!messageId) return null;
  return readJson(opts.file).messages[String(messageId)] || null;
}
function resolveReply(input={}, opts={}) {
  const replyToMessageId = input.replyTargetMessageId || input.reply_target_message_id || input.replyToMessageId || input.reply_to_message_id || input.parentMessageId || input.parent_message_id || input.repliedMessageId || input.replied_message_id || '';
  return resolveDelivery(replyToMessageId, opts);
}
function cli() {
  const [, , cmd, ...args] = process.argv;
  if (cmd === 'record') {
    console.log(JSON.stringify(recordDelivery(JSON.parse(args.join(' ') || '{}')), null, 2));
  } else if (cmd === 'resolve') {
    console.log(JSON.stringify(resolveDelivery(args[0]) || null, null, 2));
  } else {
    console.error('Usage: delivered-media-registry.cjs record <json> | resolve <deliveryMessageId>');
    process.exit(2);
  }
}
if (require.main === module) cli();
module.exports = {DEFAULT_REGISTRY, readJson, writeJson, recordDelivery, resolveDelivery, resolveReply};
