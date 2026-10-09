import assert from 'node:assert/strict';

// Feishu streaming card: take card creation off the 首字 critical path.
//
// V 2026-10-08 (firsttext-e2e, 557 replies with a card): on renderMode=auto the streaming card is
// only opened by the first status line or answer text, and opening it costs three Feishu calls in
// series in front of 首字: create the CardKit entity, send the message that shows it
// (cardStart -> cardCreated P50 1.01 s, P95 2.30 s), then put the first text into it
// (cardCreated -> firstPush P50 0.41 s, P95 0.73 s). Same shape on 10/06 and 10/07, all runtimes.
//
// 1. Pre-create: when the reply starts, create the card entity in the background. An entity is
//    invisible until a message references it, so the user sees nothing new; the chat still shows
//    no card until there is text (Tianyi rejected an empty card first, #247). The first status
//    line or answer text then only has to send the message.
// 2. First text in parallel with the send: the first text is written into the entity while the
//    message is being sent, instead of after it. The message never shows up empty because the
//    entity already carries the text, or gets it a moment later through the same streaming card.
//
// Nothing about what is written changes: same card JSON, header, note and text. If the model was
// picked after the entity was made, the note is refreshed by replacing the whole note component
// (PUT .../elements/note), never through the streaming content endpoint: on a streaming-mode card
// that endpoint types the footer out character by character (V 2026-10-10 00:24, Tianyi). An entity older than PRECREATE_MAX_AGE_MS is not
// used (streaming mode on an entity ends 10 min after creation), nor one whose creation failed;
// then the card is created the old way. Unused entities expire on Feishu's side.
// OPENCLAW_FEISHU_CARD_PRECREATE=0 turns both parts off.

export const MARKER = 'v-feishu-card-precreate-v1';
export const PRECREATE_MAX_AGE_MS = 180_000;

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchFeishuMonitor(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = source;

  // FeishuStreamingSession: split entity creation out of start() so it can run ahead of time.
  out = replaceExactlyOnce(out,
    `	async start(receiveId, receiveIdType = "chat_id", options) {
		if (this.state) return;
		const apiBase = resolveApiBase(this.creds.domain);
		const elements = [{`,
    `	// ${MARKER}: create the CardKit entity only; it stays invisible until a message references it
	async createCard(options) {
		const apiBase = resolveApiBase(this.creds.domain);
		const elements = [{`,
    'start() head');
  out = replaceExactlyOnce(out,
    `		if (createData.code !== 0 || !createData.data?.card_id) throw new Error(\`Create card failed: \${createData.msg}\`);
		const cardId = createData.data.card_id;
		const cardContent = JSON.stringify({`,
    `		if (createData.code !== 0 || !createData.data?.card_id) throw new Error(\`Create card failed: \${createData.msg}\`);
		return createData.data.card_id;
	}
	async start(receiveId, receiveIdType = "chat_id", options) {
		if (this.state) return;
		const vStartedAt = performance.now();
		const vPrecreated = typeof options?.precreatedCardId === "string" && options.precreatedCardId ? options.precreatedCardId : null;
		const cardId = vPrecreated ?? await this.createCard(options);
		const vCreateMs = Math.round(performance.now() - vStartedAt);
		// ${MARKER}: the entity exists, so the first text can go in while the message is sent
		this.state = {
			cardId,
			// writes already made to a precreated entity (its note) used sequence numbers up to this one
			sequence: vPrecreated && Number.isInteger(options?.precreatedSequence) && options.precreatedSequence > 1 ? options.precreatedSequence : 1,
			currentText: "",
			sentText: "",
			hasNote: Boolean(options?.note)
		};
		const vInitialText = VFEISHU_CARD_PRECREATE_ENABLED && typeof options?.initialText === "function" ? options.initialText() : "";
		const vInitialPut = vInitialText ? this.replaceCardContent(vInitialText, (e) => this.log?.(\`Initial update failed: \${String(e)}\`)).then((ok) => {
			if (ok && this.state?.cardId === cardId && this.state.sentText === "") {
				this.state.sentText = vInitialText;
				this.state.currentText = vInitialText;
			}
		}) : null;
		const vSendStartedAt = performance.now();
		let messageId;
		try {
		const cardContent = JSON.stringify({`,
    'start() card id');
  out = replaceExactlyOnce(out,
    `		if (sendRes.code !== 0) throw new Error(\`Send card failed: \${sendRes.msg}\`);
		const messageId = sendRes.data?.message_id?.trim();
		this.state = {
			cardId,
			...messageId ? { messageId } : {},
			sequence: 1,
			currentText: "",
			sentText: "",
			hasNote: Boolean(options?.note)
		};
		this.log?.(\`Started streaming: cardId=\${cardId}\${messageId ? \`, messageId=\${messageId}\` : ""}\`);`,
    `		if (sendRes.code !== 0) throw new Error(\`Send card failed: \${sendRes.msg}\`);
		messageId = sendRes.data?.message_id?.trim();
		} catch (error) {
			if (this.state?.cardId === cardId) this.state = null;
			throw error;
		}
		const vSendMs = Math.round(performance.now() - vSendStartedAt);
		if (vInitialPut) await vInitialPut;
		if (messageId && this.state) this.state.messageId = messageId;
		this.log?.(\`card-start \${JSON.stringify({ cardId, precreated: Boolean(vPrecreated), createMs: vCreateMs, sendMs: vSendMs, initialText: Boolean(vInitialText), totalMs: Math.round(performance.now() - vStartedAt) })}\`);
		this.log?.(\`Started streaming: cardId=\${cardId}\${messageId ? \`, messageId=\${messageId}\` : ""}\`);`,
    'start() state after send');

  // Module-level switch, next to the other streaming constants.
  out = replaceExactlyOnce(out,
    'const STREAMING_UPDATE_THROTTLE_MS = 160;\n',
    `const STREAMING_UPDATE_THROTTLE_MS = 160;
// ${MARKER}
const VFEISHU_CARD_PRECREATE_ENABLED = process.env.OPENCLAW_FEISHU_CARD_PRECREATE !== "0";
const VFEISHU_CARD_PRECREATE_MAX_AGE_MS = ${PRECREATE_MAX_AGE_MS};
`,
    'streaming throttle constant');

  // Reply dispatcher: create the entity when the reply starts, hand it to the first card.
  out = replaceExactlyOnce(out,
    `	const startStreaming = () => {
		if (!streamingEnabled || streamingStartPromise || streaming || isStreamingStartBackedOff(account.accountId)) return;
		streamingStartPromise = (async () => {
			vFirsttextMark("cardStartAtMs");
			const creds = account.appId && account.appSecret ? {
				appId: account.appId,
				appSecret: account.appSecret,
				domain: account.domain,
				httpTimeoutMs: resolveConfiguredHttpTimeoutMs(account)
			} : null;
			if (!creds) return;
			const session = new FeishuStreamingSession(createFeishuClient(account), creds, (message) => params.runtime.log?.(\`feishu[\${account.accountId}] \${message}\`));
			const generation = ++streamingGeneration;
			streaming = session;
			activeStreamingGeneration = generation;
			try {
				const cardHeader = resolveCardHeader(agentId, identity);
				const cardNote = resolveCardNote(agentId, identity, responsePrefixContextProvider());
				const streamingTarget = sendTarget.replace(/^(feishu|lark):/i, "").replace(/^(chat|user|group|dm|open_id):/i, "").trim();
				await session.start(streamingTarget, resolveReceiveIdType(sendTarget), {
					replyToMessageId: sendReplyToMessageId,
					replyInThread: effectiveReplyInThread,
					rootId,
					header: cardHeader,
					note: cardNote
				});
				vFirsttextMark("cardCreatedAtMs");`,
    `	// ${MARKER}: one card entity per reply, created when the reply starts
	let vPrecreatedCard = null;
	let vPrecreateAttempted = false;
	const vPrecreateCard = () => {
		if (!VFEISHU_CARD_PRECREATE_ENABLED || vPrecreateAttempted || !streamingEnabled || streamingStartPromise || streaming || isStreamingStartBackedOff(account.accountId)) return;
		if (!account.appId || !account.appSecret) return;
		vPrecreateAttempted = true;
		const creds = {
			appId: account.appId,
			appSecret: account.appSecret,
			domain: account.domain,
			httpTimeoutMs: resolveConfiguredHttpTimeoutMs(account)
		};
		const log = (message) => params.runtime.log?.(\`feishu[\${account.accountId}] \${message}\`);
		const header = resolveCardHeader(agentId, identity);
		const note = resolveCardNote(agentId, identity, responsePrefixContextProvider());
		const createdAt = Date.now();
		const session = new FeishuStreamingSession(createFeishuClient(account), creds, log);
		const cardId = session.createCard({ header, note }).catch((error) => {
			log(\`card precreate failed: \${String(error)}\`);
			return null;
		});
		vPrecreatedCard = { cardId, createdAt, header: JSON.stringify(header ?? null), note, session, sequence: 1, log };
	};
	// The model is usually picked after the reply starts, so the precreated note lacks it. Complete
	// it on the entity as soon as the model is known, as one whole note component (never the
	// streaming content endpoint), so the card shows the full footer from its first appearance.
	const vRefreshPrecreatedNote = () => {
		const entry = vPrecreatedCard;
		if (!entry) return;
		const note = resolveCardNote(agentId, identity, responsePrefixContextProvider());
		if (note === entry.note || note === entry.pendingNote) return;
		entry.pendingNote = note;
		entry.sequence += 1;
		const state = { cardId: void 0, sequence: entry.sequence - 1 };
		entry.cardId.then((cardId) => {
			if (!cardId) return;
			state.cardId = cardId;
			return vAskCardKitWrite(entry.session, state, "/elements/note", { element: JSON.stringify({ tag: "markdown", element_id: "note", content: \`<font color='grey'>\${note}</font>\` }) }).then(() => {
				if (entry.pendingNote === note) entry.note = note;
			});
		}).catch((error) => entry.log(\`card precreate note failed: \${String(error)}\`));
	};
	const vTakePrecreatedCard = async (header) => {
		const entry = vPrecreatedCard;
		vPrecreatedCard = null;
		if (!entry || Date.now() - entry.createdAt > VFEISHU_CARD_PRECREATE_MAX_AGE_MS || entry.header !== JSON.stringify(header ?? null)) return null;
		const cardId = await entry.cardId;
		return cardId ? { cardId, note: entry.note, sequence: entry.sequence } : null;
	};
	const startStreaming = () => {
		if (!streamingEnabled || streamingStartPromise || streaming || isStreamingStartBackedOff(account.accountId)) return;
		streamingStartPromise = (async () => {
			vFirsttextMark("cardStartAtMs");
			const creds = account.appId && account.appSecret ? {
				appId: account.appId,
				appSecret: account.appSecret,
				domain: account.domain,
				httpTimeoutMs: resolveConfiguredHttpTimeoutMs(account)
			} : null;
			if (!creds) return;
			const session = new FeishuStreamingSession(createFeishuClient(account), creds, (message) => params.runtime.log?.(\`feishu[\${account.accountId}] \${message}\`));
			const generation = ++streamingGeneration;
			streaming = session;
			activeStreamingGeneration = generation;
			try {
				const cardHeader = resolveCardHeader(agentId, identity);
				const precreated = await vTakePrecreatedCard(cardHeader);
				const cardNote = resolveCardNote(agentId, identity, responsePrefixContextProvider());
				const streamingTarget = sendTarget.replace(/^(feishu|lark):/i, "").replace(/^(chat|user|group|dm|open_id):/i, "").trim();
				await session.start(streamingTarget, resolveReceiveIdType(sendTarget), {
					replyToMessageId: sendReplyToMessageId,
					replyInThread: effectiveReplyInThread,
					rootId,
					header: cardHeader,
					note: cardNote,
					...precreated ? { precreatedCardId: precreated.cardId, precreatedSequence: precreated.sequence } : {},
					initialText: () => buildCombinedStreamText(reasoningText, streamText)
				});
				// the model may have been picked after the entity was made; fix the note behind the first text.
				// Replace the whole note component: the content endpoint streams it in like a typewriter on a
				// streaming-mode card. An inline question owns the note already (same whole-component write).
				if (precreated && precreated.note !== cardNote) session.queue = session.queue.then(() => {
					if (!session.state?.hasNote) return;
					if (session.vAskAttached) return session.updateNoteContent(cardNote);
					return vAskCardKitWrite(session, session.state, "/elements/note", { element: JSON.stringify({ tag: "markdown", element_id: "note", content: \`<font color='grey'>\${cardNote}</font>\` }) });
				}).catch((error) => params.runtime.log?.(\`feishu[\${account.accountId}] card note refresh failed: \${String(error)}\`));
				vFirsttextMark("cardCreatedAtMs");`,
    'startStreaming');

  out = replaceExactlyOnce(out,
    '\t\t\tonModelSelected,\n\t\t\tcommentaryProgressEnabled: previewStreamingEnabled,\n',
    `\t\t\tonModelSelected: (...args) => {
				const selected = onModelSelected?.(...args);
				// ${MARKER}: the precreated card gets the full note now, not behind the first text
				Promise.resolve(selected).then(vRefreshPrecreatedNote, () => {});
				return selected;
			},
			commentaryProgressEnabled: previewStreamingEnabled,
`,
    'reply options onModelSelected');

  out = replaceExactlyOnce(out,
    '\t\t\tif (previewStreamingEnabled && renderMode === "card") startStreaming();\n',
    `\t\t\tif (previewStreamingEnabled && renderMode === "card") startStreaming();
			else if (previewStreamingEnabled) vPrecreateCard();
`,
    'onReplyStart card mode start');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'usage: patch-feishu-card-precreate.mjs <monitor.account-*.js> <out>');
  fs.writeFileSync(output, patchFeishuMonitor(fs.readFileSync(input, 'utf8')));
}
