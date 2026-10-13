import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { RESIZE_SKIP_MARKER, patchEmbeddedAgentHelpers, patchHistoryImagePrune } from './patch-history-image-resize-skip.mjs';
import { RESIZE_SKIP_FILES } from './build-history-image-resize-skip.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const [helpers, prune] = RESIZE_SKIP_FILES;

test('release files are the patched V chunks', () => {
  for (const file of RESIZE_SKIP_FILES) {
    const original = read(file.input);
    const patched = read(file.output);
    assert.equal(sha(original), file.before);
    assert.equal(sha(file.patch(original)), sha(patched));
    assert.throws(() => file.patch(patched), /already patched/);
    assert.ok(patched.includes(RESIZE_SKIP_MARKER));
    assert.equal(spawnSync(process.execPath, ['--check', path.join(repo, file.output)]).status, 0);
  }
  assert.equal(patchEmbeddedAgentHelpers, helpers.patch);
  assert.equal(patchHistoryImagePrune, prune.patch);
});

function extract(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `cannot extract ${start}`);
  return source.slice(from, to);
}

// The chunk's own sanitizeSessionMessagesImages with the per-block image pass stubbed out.
function loadSanitizer(source) {
  const body = extract(source, 'async function sanitizeSessionMessagesImages(', '//#endregion');
  const calls = [];
  const sanitizeContentBlocksImages = async (blocks, label, limits) => {
    calls.push(limits);
    return blocks;
  };
  const passthrough = (value) => value;
  const run = new Function('sanitizeContentBlocksImages', 'sanitizeToolCallIdsForCloudCodeAssist', 'ensureNonEmptyContent', 'dropEmptyTextBlocks', 'stripThoughtSignatures', 'replaceCompactionReplayOwnerContent',
    `${body}; return sanitizeSessionMessagesImages;`)(sanitizeContentBlocksImages, passthrough, passthrough, passthrough, passthrough, (_message, content) => ({ ..._message, content }));
  return { run, calls };
}

function loadBoundaries(source) {
  const preserve = extract(source, 'const PRESERVE_RECENT_COMPLETED_TURNS', ';');
  const pruneFn = extract(source, 'function resolvePruneBeforeIndex(messages) {', 'function resolveMessageMediaFacts(message) {');
  return new Function(`${preserve}; ${pruneFn}; return { resolvePruneBeforeIndex, resolveImageResizeSkipBeforeIndex };`)();
}

const image = { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' };
function conversation(turns, { toolImages = true } = {}) {
  const messages = [];
  for (let i = 0; i < turns; i++) {
    messages.push({ role: 'user', content: [{ type: 'text', text: `q${i}` }] });
    messages.push({ role: 'assistant', content: [{ type: 'toolCall', id: `c${i}`, name: 'view_image', arguments: {} }] });
    messages.push({ role: 'toolResult', toolCallId: `c${i}`, content: toolImages ? [{ type: 'text', text: 'img' }, image] : [{ type: 'text', text: 'ok' }] });
    messages.push({ role: 'assistant', content: [{ type: 'text', text: `a${i}` }] });
  }
  return messages;
}

test('only images the prune transform drops skip the resize', () => {
  const { resolvePruneBeforeIndex, resolveImageResizeSkipBeforeIndex } = loadBoundaries(read(prune.output));
  for (let turns = 0; turns <= 12; turns++) {
    const messages = conversation(turns);
    const skip = resolveImageResizeSkipBeforeIndex(messages);
    const pruned = resolvePruneBeforeIndex([...messages, { role: 'user', content: 'next' }]);
    if (turns <= 4) assert.equal(skip, -1, `${turns} turns keep every image`);
    else {
      assert.ok(skip > 0 && skip < pruned, `${turns} turns: skip ${skip} < prune ${pruned}`);
      // four completed turns (16 messages) keep the full image pass
      assert.equal(messages.length - skip, 16);
    }
  }
  // a recent turn that history repair leaves without a reply moves the prune boundary one
  // turn earlier; the margin keeps those images on the full pass
  const messages = conversation(8);
  const skip = resolveImageResizeSkipBeforeIndex(messages);
  const repaired = messages.filter((_message, index) => index !== messages.length - 1 && index !== messages.length - 3);
  assert.ok(skip <= resolvePruneBeforeIndex([...repaired, { role: 'user', content: 'next' }]));
});

test('old messages keep their image bytes, recent ones and other callers keep the limits', async () => {
  const limits = { maxDimensionPx: undefined, maxBytes: undefined };
  const messages = conversation(6);
  const patched = loadSanitizer(read(helpers.output));
  await patched.run(messages, 'session:history', { keepImageBytesBeforeIndex: 8 });
  const kept = { maxDimensionPx: Number.MAX_SAFE_INTEGER, maxBytes: Number.MAX_SAFE_INTEGER };
  // calls: user + toolResult per turn (assistant text blocks go through too)
  const perMessage = patched.calls;
  assert.equal(perMessage.length, messages.length);
  perMessage.forEach((value, index) => assert.deepEqual(value, index < 8 && messages[index].role !== 'assistant' ? kept : limits, `message ${index}`));

  const other = loadSanitizer(read(helpers.output));
  await other.run(messages, 'compaction');
  assert.ok(other.calls.every((value) => value.maxDimensionPx === undefined && value.maxBytes === undefined));

  const stock = loadSanitizer(read(helpers.input));
  await stock.run(messages, 'session:history', { keepImageBytesBeforeIndex: 8 });
  assert.ok(stock.calls.every((value) => value.maxDimensionPx === undefined));
});

test('only the embedded attempt opts in, and the env switch turns it off', () => {
  const source = read(prune.output);
  assert.equal(source.split('skipPrunedImageResize: true').length - 1, 1);
  const call = extract(source, 'const prior = await sanitizeSessionHistory({', '});');
  assert.ok(call.includes('skipPrunedImageResize: true'));
  assert.ok(source.includes('process.env.OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP !== "0"'));
});
