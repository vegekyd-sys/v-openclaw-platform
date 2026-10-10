import assert from 'node:assert/strict';

// Feishu streaming card that ends with no text is taken back instead of left as an empty card.
//
// Shared VLab 2026-10-10 17:10 (VLab 发布验收 B, om_x100b63945f59…), with no-reply-after-tool v2:
// V reacted THUMBSUP and stayed silent, as asked, and the runtime no longer sent the English
// "no final summary" text. But the reaction's tool status line ("正在 …") had already opened the
// streaming card, and on close the card was finalized with an empty body: the group got a card
// holding only the footer (Agent / Model / Runtime). Before the runtime fix the fallback text
// filled that card, so nobody saw it empty. Any silent turn that used a tool does the same.
//
// The monitor already knows how to take a card back (FeishuStreamingSession.discard: delete the
// message, fall back to an empty close if Feishu refuses). Closing now discards when the final
// text (answer + reasoning) is blank and the card carries no background-task status, which keeps
// updating the card after close. A final payload that still has text is not lost: the card reports
// nothing visible, so the existing static fallback sends it. OPENCLAW_FEISHU_EMPTY_CARD_DISCARD=0
// turns it off.

export const MARKER = 'v-feishu-empty-card-discard-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchFeishuMonitor(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `					if (disposition === "discarded") closed = await streamingToClose.discard();
					else {
						const finalNote = resolveCardNote(agentId, identity, responsePrefixContextProvider());`,
    `					// ${MARKER}: nothing but a status line was ever shown; take the card back
					const vEmptyCard = !text.trim() && !streamingToClose.vTaskStatusCard && process.env.OPENCLAW_FEISHU_EMPTY_CARD_DISCARD !== "0";
					if (disposition === "discarded" || vEmptyCard) closed = await streamingToClose.discard();
					else {
						const finalNote = resolveCardNote(agentId, identity, responsePrefixContextProvider());`,
    'performStreamingClose close/discard');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'usage: patch-feishu-empty-card-discard.mjs <monitor.account in> <out>');
  fs.writeFileSync(output, patchFeishuMonitor(fs.readFileSync(input, 'utf8')));
}
