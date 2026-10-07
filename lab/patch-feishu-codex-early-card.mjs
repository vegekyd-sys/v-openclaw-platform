import assert from 'node:assert/strict';

// Codex turns: open the Feishu streaming card when the run starts, not at the first answer text.
//
// V 2026-10-06 (24 h, firsttext-e2e): in 10 of 12 codex turns the card start was the first
// answer delta itself (cardStartAtMs == firstAnswerTokenAtMs). Codex runs answer without a tool
// status line first (0 of 12; worker 17 of 35), so nothing opened the card earlier, and creating
// it (two Feishu API calls, P50 1.0-1.6 s, vcodex P95 13.4 s) plus the first push ran in series
// in front of 首字. A codex run spends 7-9 s between run start and its first answer delta
// (thread resume, turn start, model thinking), so a card opened at run start is ready long
// before the text and the first delta goes straight into it.
//
// The card opened early is the same streaming card the first delta would have created (header,
// empty body, "[Generating...]" summary). Other runtimes keep opening it on their first status
// line or text. The card is not opened once the reply has gone idle.

export const MARKER = 'v-feishu-codex-early-card-v1';
export const EARLY_CARD_RUNTIMES = ['codex'];

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchFeishuMonitor(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    '\t\t\t\tvFirsttextMark("runStartAtMs");\n\t\t\t},\n',
    `\t\t\t\tvFirsttextMark("runStartAtMs");
				// ${MARKER}: codex has no status line before its answer, so open the card now
				if (previewStreamingEnabled && !idleRequestedForReply && ${JSON.stringify(EARLY_CARD_RUNTIMES)}.includes(responsePrefixContextProvider()?.agentRuntime)) startStreaming();
			},
`, 'onAgentRunStart run start mark');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'usage: patch-feishu-codex-early-card.mjs <monitor.account-*.js> <out>');
  fs.writeFileSync(output, patchFeishuMonitor(fs.readFileSync(input, 'utf8')));
}
