import assert from 'node:assert/strict';

// Reply attachments that ride on a block are sent even when block streaming is off (V 2026-11-28).
//
// With block streaming disabled, core still delivers a reply block that carries media at once
// (agent-runner sendDirectBlockReply) and records that media as sent, so buildReplyPayloads drops it
// from the final reply. The Feishu dispatcher (monitor.account-WFdlCDhR.js) returned early for such a
// block whenever its text was not going into a streaming card and block streaming was off: right for
// the text (it comes with the final), wrong for the media, which is then never sent. V runs
// renderMode auto with streaming.block.enabled false, so every plain-text reply with a MEDIA: line lost
// its files. VLab candidate trace (vlab-worker, 2026-11-28 19:24): feishu-deliver kind=block media=2 ->
// branch useStreamingCard=false coreBlockStreamingEnabled=false -> no send; final media=0
// (blockSentMedia=2); Feishu showed only the text card.
//
// feishu-block-media-v1 (source: vegekyd-sys/openclaw-versa versa/port-feishu-block-media-20261128
// @9d4e383b30c, on V's Feishu lineage f73ee277c7e): such a block sends its media at once.

export const MARKER = 'feishu-block-media-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchMonitor(source) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to monitor.account-WFdlCDhR.js`);
  return replaceExactlyOnce(source,
    `							if (hasMedia) await collectDelivery(sendMediaReplies(payload));
						}
						return mergeFeishuReplyDeliveryResults(deliveredResults, text);
`,
    `							if (hasMedia) await collectDelivery(sendMediaReplies(payload));
						} else if (hasMedia) await collectDelivery(sendMediaReplies(payload)); // ${MARKER}: core already counts this block's media as sent; the text waits for the final, the media must go now
						return mergeFeishuReplyDeliveryResults(deliveredResults, text);
`,
    'non-streaming block early return');
}

export const FEISHU_DIST = 'npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist';
export const FILES = [
  { name: 'monitor.account-WFdlCDhR.js', base: 'lab/release-files/feishu-block-media/base', target: FEISHU_DIST, before: '46711745f606535264faace8c25d38844be6fc1eaa30c0c4c413b0518ec75b5c', patch: patchMonitor },
];
