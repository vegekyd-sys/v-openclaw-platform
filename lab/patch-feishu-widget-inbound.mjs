import assert from 'node:assert/strict';

// Lets the v-feishu-widgets plugin put a verified person's widget button press through the same
// path as a typed message or a card button: handleFeishuMessage with a synthetic event, like
// card-action.ts dispatchSyntheticCommand. Sender policy, the chat queue, the streaming reply
// card and every runtime then behave as they do for that person's own message. The registry is
// global because the plugin and the channel do not share a module; one entry per Feishu account.

export const MARKER = 'v-feishu-widget-inbound-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchFeishuMonitor(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `	const { cfg, accountId, channelRuntime, runtime, chatHistories, fireAndForget, abortSignal } = context;\n`,
    `	const { cfg, accountId, channelRuntime, runtime, chatHistories, fireAndForget, abortSignal } = context;
	// ${MARKER}
	(globalThis[Symbol.for("v.feishu.synthetic-inbound")] ??= new Map()).set(accountId, ({ openId, chatId, chatType, text, replyToMessageId }) => handleFeishuMessage({
		cfg,
		event: {
			sender: { sender_id: { open_id: openId } },
			message: {
				message_id: \`card-action-v-widget-\${crypto.randomUUID()}\`,
				...(replyToMessageId ? { reply_target_message_id: replyToMessageId, typing_target_message_id: replyToMessageId } : { suppress_reply_target: true }),
				chat_id: chatId,
				chat_type: chatType,
				message_type: "text",
				content: JSON.stringify({ text }),
				...(chatType === "group" && botOpenIds.get(accountId) ? { mentions: [{ key: "mention_bot", id: { open_id: botOpenIds.get(accountId) }, name: "bot" }] } : {}),
			},
		},
		botOpenId: botOpenIds.get(accountId),
		runtime,
		channelRuntime,
		accountId,
	}));
`,
    'registerEventHandlers context destructure');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'usage: patch-feishu-widget-inbound.mjs <monitor.account in> <out>');
  fs.writeFileSync(output, patchFeishuMonitor(fs.readFileSync(input, 'utf8')));
}
