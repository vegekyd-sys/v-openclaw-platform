import assert from 'node:assert/strict';

// User-perceived first-token timing for every Feishu message V answers.
//
// Until now first-token was measured where it is cheap, not where the user looks: the model's
// first text (firsttext-metrics) or the reply written to the session store. On 2026-10-05 a
// one-character reply on V had its first model text 2.4 s after the message arrived, but the
// card was only created 1.4 s later (two Feishu API calls, started by that first text) and the
// text pushed into it 0.5 s after that: 4.3 s, plus Feishu's own delivery both ways. Tianyi
// reported ~6 s from typing to seeing text while those measurements said 3.4 s.
//
// The reply dispatcher already exists once per inbound message and owns the card, so it now
// records the moments the user can see, and the handler logs one line when the turn ends:
//   [firsttext-e2e.1] {sessionKey, chatId, inboundMessageId, sentAtMs (Feishu create_time),
//     receivedAtMs, dispatcherAtMs, runId / runStartAtMs (onAgentRunStart), typingShownAtMs, firstReasoningAtMs / firstAnswerTokenAtMs
//     (first reasoning / answer text reaching the channel), cardStartAtMs, cardCreatedAtMs,
//     firstPushAtMs (first card content pushed), firstAnswerPushAtMs (first push carrying
//     answer text, not only reasoning/status), visibleAtMs (first non-streaming visible reply),
//     endAtMs, provider/model/agentRuntime, queuedFinal, finalCount}
// No message text is logged. Logging never throws into the reply path.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchFeishuMonitor(source) {
  let out = source;
  // per-message tracker inside the reply dispatcher
  out = replaceExactlyOnce(out,
    '\tconst typingTargetMessageId = explicitTypingTargetMessageId?.trim() || replyToMessageId;\n',
    `\tconst typingTargetMessageId = explicitTypingTargetMessageId?.trim() || replyToMessageId;
	// firsttext-e2e: the moments the user can see, for this one inbound message
	const vFirsttextE2e = {
		v: 1,
		sessionKey: params.sessionKey,
		chatId,
		inboundMessageId: typingTargetMessageId,
		sentAtMs: normalizeEpochMs(params.messageCreateTimeMs),
		dispatcherAtMs: Date.now()
	};
	const vFirsttextMark = (key) => {
		if (vFirsttextE2e[key] === void 0) vFirsttextE2e[key] = Date.now();
	};
`, 'typing target');
  out = replaceExactlyOnce(out,
    '\t\t\t\t});\n\t\t\t},\n\t\t\tstop: async () => {\n',
    '\t\t\t\t});\n\t\t\t\tif (typingState?.reactionId) vFirsttextMark("typingShownAtMs");\n\t\t\t},\n\t\t\tstop: async () => {\n',
    'typing start end');
  out = replaceExactlyOnce(out,
    '\t\tstreamingStartPromise = (async () => {\n',
    '\t\tstreamingStartPromise = (async () => {\n\t\t\tvFirsttextMark("cardStartAtMs");\n',
    'streaming start');
  out = replaceExactlyOnce(out,
    '\t\t\t\tstreamingStartBackoffUntilByAccount.delete(account.accountId);\n',
    '\t\t\t\tvFirsttextMark("cardCreatedAtMs");\n\t\t\t\tstreamingStartBackoffUntilByAccount.delete(account.accountId);\n',
    'streaming start success');
  out = replaceExactlyOnce(out,
    '\t\t\tstartPromise: streamingStartPromise\n\t\t};',
    '\t\t\tstartPromise: streamingStartPromise,\n\t\t\thasAnswer: Boolean(streamText)\n\t\t};',
    'streaming update record');
  out = replaceExactlyOnce(out,
    '\t\t\t\t\tif (next.generation !== void 0 && next.session?.isActive()) await next.session.update(next.combined);\n',
    `\t\t\t\t\tif (next.generation !== void 0 && next.session?.isActive()) {
						await next.session.update(next.combined);
						vFirsttextMark("firstPushAtMs");
						if (next.hasAnswer) vFirsttextMark("firstAnswerPushAtMs");
					}
`, 'streaming update push');
  out = replaceExactlyOnce(out,
    '\tconst markVisibleReplySent = () => {\n\t\tvisibleReplySent = true;\n\t};',
    '\tconst markVisibleReplySent = () => {\n\t\tvisibleReplySent = true;\n\t\tvFirsttextMark("visibleAtMs");\n\t};',
    'visible reply marker');
  // when the first answer text / reasoning reaches the channel (model side done, delivery begins)
  out = replaceExactlyOnce(out,
    '\t\t\tonPartialReply: previewStreamingEnabled ? (payload) => {\n\t\t\t\tif (!payload.text) return false;\n',
    '\t\t\tonPartialReply: previewStreamingEnabled ? (payload) => {\n\t\t\t\tif (!payload.text) return false;\n\t\t\t\tvFirsttextMark("firstAnswerTokenAtMs");\n',
    'partial reply');
  out = replaceExactlyOnce(out,
    '\t\t\tonReasoningStream: reasoningPreviewEnabled ? (payload) => {\n\t\t\t\tif (vlab91OwnsCodexProgress()) return false;\n\t\t\t\tif (!payload.text) return false;\n',
    '\t\t\tonReasoningStream: reasoningPreviewEnabled ? (payload) => {\n\t\t\t\tif (vlab91OwnsCodexProgress()) return false;\n\t\t\t\tif (!payload.text) return false;\n\t\t\t\tvFirsttextMark("firstReasoningAtMs");\n',
    'reasoning stream');
  // the run this message started: its id joins the Worker's [firsttext-worker-phases] marks,
  // and received -> run start is the queue wait before any agent work
  out = replaceExactlyOnce(out,
    '\n\t\treplyOptions: {\n',
    '\n\t\treplyOptions: {\n\t\t\tonAgentRunStart: (runId) => {\n\t\t\t\tif (typeof runId === "string" && vFirsttextE2e.runId === void 0) vFirsttextE2e.runId = runId;\n\t\t\t\tvFirsttextMark("runStartAtMs");\n\t\t\t},\n',
    'dispatcher reply options');
  out = replaceExactlyOnce(out,
    '\t\tgetVisibleReplyState: () => ({',
    `\t\tgetFirsttextE2e: () => {
			const record = { ...vFirsttextE2e };
			try {
				const context = responsePrefixContextProvider() ?? {};
				for (const key of ["provider", "model", "agentRuntime"]) if (typeof context[key] === "string" && context[key].length <= 120) record[key] = context[key];
			} catch {}
			return record;
		},
		getVisibleReplyState: () => ({`,
    'dispatcher return');
  // the handler: when the message arrived, and one line when the turn ends
  out = replaceExactlyOnce(out,
    '\tlog(`feishu[${account.accountId}]: received message from ${ctx.senderOpenId} in ${ctx.chatId} (${ctx.chatType})`);\n',
    '\tlog(`feishu[${account.accountId}]: received message from ${ctx.senderOpenId} in ${ctx.chatId} (${ctx.chatType})`);\n\tconst vFirsttextReceivedAtMs = Date.now();\n',
    'received log');
  out = replaceExactlyOnce(out,
    '\t\t\tconst { dispatcherOptions, delivery, replyOptions, ensureNoVisibleReplyFallback } = createFeishuReplyDispatcher({',
    '\t\t\tconst { dispatcherOptions, delivery, replyOptions, ensureNoVisibleReplyFallback, getFirsttextE2e } = createFeishuReplyDispatcher({',
    'dispatcher call');
  out = replaceExactlyOnce(out,
    '\t\t\tlog(`feishu[${account.accountId}]: dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);\n',
    `\t\t\tlog(\`feishu[\${account.accountId}]: dispatch complete (queuedFinal=\${queuedFinal}, replies=\${counts.final})\`);
			try {
				log("[firsttext-e2e.1] " + JSON.stringify({ ...getFirsttextE2e(), receivedAtMs: vFirsttextReceivedAtMs, endAtMs: Date.now(), queuedFinal, finalCount: counts.final }));
			} catch {}
`, 'dispatch complete');
  return out;
}
