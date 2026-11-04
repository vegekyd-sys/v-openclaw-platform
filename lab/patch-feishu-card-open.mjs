import assert from 'node:assert/strict';

export const MARKER = 'v-feishu-card-open-v1';
export const V_MODEL_CARD = Symbol.for('v.feishu.modelCard');

// The stock sanitizer rebuilt every model-written card from a four-element allowlist (header,
// markdown with <> escaped, hr, buttons): tables, columns, charts, panels and images were dropped.
// V now sends the card it wrote, unchanged, within the existing 30 KB / 200-element envelope.
// Feishu validates the card; when it rejects one, the reply still reaches the chat as text.
export function openNativeFeishuCard(card) {
  const inner = card.type === 'interactive' && isRecord(card.card) ? card.card : card;
  const hasBody = isRecord(inner.body) && Array.isArray(inner.body.elements) && inner.body.elements.length > 0;
  const hasLegacy = Array.isArray(inner.elements) && inner.elements.length > 0;
  const hasTemplate = inner.type === 'template' && isRecord(inner.data);
  if (!hasBody && !hasLegacy && !hasTemplate) return;
  let copy;
  try { copy = JSON.parse(JSON.stringify(inner)); } catch { return; }
  copy[V_MODEL_CARD] = true;
  return copy;
}

// Plain text of a card, for the fallback when Feishu rejects the card itself.
export function nativeFeishuCardText(card) {
  const out = [];
  const title = card?.header?.title?.content;
  if (typeof title === 'string' && title.trim()) out.push(`**${title.trim()}**`);
  const walk = (value, key) => {
    if (Array.isArray(value)) { for (const v of value) walk(v); return; }
    if (!isRecord(value)) return;
    if (value.tag === 'table' && Array.isArray(value.columns) && Array.isArray(value.rows)) {
      const cols = value.columns.filter(isRecord);
      const cell = (v) => String(typeof v === 'object' && v !== null ? JSON.stringify(v) : v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      out.push([`| ${cols.map((c) => cell(c.display_name ?? c.name)).join(' | ')} |`, `|${cols.map(() => ' --- ').join('|')}|`, ...value.rows.filter(isRecord).map((r) => `| ${cols.map((c) => cell(r[c.name])).join(' | ')} |`)].join('\n'));
      return;
    }
    if (value.tag === 'chart') return;
    for (const [k, v] of Object.entries(value)) {
      if (k === 'header' && value === card) continue;
      if (typeof v === 'string' && (k === 'content' || k === 'text') && v.trim()) out.push(v);
      else if (v && typeof v === 'object') walk(v, k);
    }
  };
  walk(card);
  return [...new Set(out)].join('\n\n');
}

function isRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function replacer(source) {
  return (before, after) => {
    assert.equal(source.split(before).length, 2, `anchor drift: ${before.slice(0, 80)}`);
    source = source.replace(before, after);
    return source;
  };
}

export function patchReplyDelivery(source) {
  assert(!source.includes(MARKER), 'already patched');
  const replace = replacer(source);
  const start = source.indexOf('function sanitizeNativeFeishuCard(card) {');
  const end = source.indexOf('\nfunction readNativeFeishuCardJson(text, options) {');
  assert(start > 0 && end > start, 'anchor drift: sanitizeNativeFeishuCard');
  const stock = source.slice(start, end + 1);
  source = replace(stock, `// ${MARKER}
const V_MODEL_CARD = Symbol.for("v.feishu.modelCard");
${openNativeFeishuCard.toString().replace('export ', '')}
${nativeFeishuCardText.toString().replace('export ', '')}
function sanitizeNativeFeishuCard(card) {
\treturn openNativeFeishuCard(card);
}
`);
  // Mentions go first; a v1 card keeps its elements at the top level.
  source = replace(`	if (params.mentions?.length) card = {
		...card,
		body: {
			...card.body,
			elements: [{
				tag: "markdown",
				content: buildMentionedCardContent(params.mentions, "").trimEnd()
			}, ...card.body.elements]
		}
	};`, `	if (params.mentions?.length && (Array.isArray(card.body?.elements) || Array.isArray(card.elements))) {
		const mention = {
			tag: "markdown",
			content: buildMentionedCardContent(params.mentions, "").trimEnd()
		};
		card = Array.isArray(card.body?.elements) ? {
			...card,
			body: {
				...card.body,
				elements: [mention, ...card.body.elements]
			}
		} : {
			...card,
			elements: [mention, ...card.elements]
		};
	}`);
  // A card Feishu rejects (wrong field, unknown tag) must not swallow the reply.
  source = replace(`async function sendCardFeishu(params) {
	const { cfg, to, card, replyToMessageId, replyInThread, allowTopLevelReplyFallback, accountId } = params;`, `async function sendCardFeishu(params) {
	if (params.card?.[V_MODEL_CARD] === true) try {
		return await sendCardFeishuOnce(params);
	} catch (error) {
		const text = nativeFeishuCardText(params.card).trim();
		if (!text) throw error;
		console.warn(\`[feishu] model card rejected, sent as text: \${formatErrorMessage(error)}\`);
		return await sendCardFeishuOnce({
			...params,
			card: {
				schema: "2.0",
				config: { width_mode: "fill" },
				body: { elements: [{ tag: "markdown", content: text.slice(0, 2e4) }] }
			}
		});
	}
	return await sendCardFeishuOnce(params);
}
async function sendCardFeishuOnce(params) {
	const { cfg, to, card, replyToMessageId, replyInThread, allowTopLevelReplyFallback, accountId } = params;`);
  return source;
}

// While V writes a card, show what is already complete: the header and every finished top-level
// element of body.elements (a v2 card). Returns null until something is renderable.
export function vPartialFeishuCard(text) {
  const src = text.trimStart();
  if (!src.startsWith('{')) return null;
  const stack = [];
  let header = null, elements = [], inString = false, escaped = false, expectKey = false, key = null, stringStart = -1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') { inString = false; if (expectKey) key = src.slice(stringStart + 1, i); }
      continue;
    }
    if (ch === '"') { inString = true; stringStart = i; continue; }
    if (ch === ':') { expectKey = false; continue; }
    if (ch === ',') { expectKey = stack.at(-1)?.t === '{'; continue; }
    if (ch === '{' || ch === '[') {
      const parent = stack.at(-1);
      stack.push({ t: ch, key: parent?.t === '{' ? key : '#', start: i });
      expectKey = ch === '{';
      continue;
    }
    if (ch === '}' || ch === ']') {
      const done = stack.pop();
      if (!done) return null;
      if (done.t === '{' && stack.length === 3 && stack[1].key === 'body' && stack[2].key === 'elements') {
        try { elements.push(JSON.parse(src.slice(done.start, i + 1))); } catch { return null; }
      } else if (done.t === '{' && stack.length === 1 && done.key === 'header') {
        try { header = JSON.parse(src.slice(done.start, i + 1)); } catch { return null; }
      }
      expectKey = false;
    }
  }
  if (!header && !elements.length) return null;
  return {
    count: elements.length + (header ? 1 : 0),
    card: {
      schema: '2.0',
      config: { width_mode: 'fill', streaming_mode: true, summary: { content: '[Generating...]' } },
      ...(header ? { header } : {}),
      body: { elements: elements.length ? elements : [{ tag: 'markdown', content: '…' }] },
    },
  };
}

// The reply dispatcher builds a card only from a structured `presentation`; a final reply whose text
// is a card JSON was streamed as raw JSON. Send it as the card instead (the preview is discarded,
// as for any independent presentation), and do not stream the JSON while V writes it.
export const MONITOR_MARKER = '// v-feishu-card-open-v1: model-written card replies';

export function patchMonitor(source) {
  assert(!source.includes(MONITOR_MARKER), 'already patched');
  const rep = replacer(source);
  const replace = (before, after) => (source = rep(before, after));
  replace('g as renderFeishuReplyPayload, i as noVisibleFeishuReplyDelivery', 'g as renderFeishuReplyPayload, i as noVisibleFeishuReplyDelivery, it as vReadNativeFeishuCardJson, s as vBuildFeishuPayloadCard');
  // Session: replace the whole card entity (the preview grows into V's card), and close it with the
  // final card instead of the text body.
  replace('var FeishuStreamingSession = class {', `${MONITOR_MARKER}
${vPartialFeishuCard.toString().replace('export ', '')}
var FeishuStreamingSession = class {`);
  replace(`	isActive() {
		return this.state !== null && !this.closed;
	}
};`, `	isActive() {
		return this.state !== null && !this.closed;
	}
	async vPutWholeCard(card) {
		const apiBase = resolveApiBase(this.creds.domain);
		this.state.sequence += 1;
		const { response, release } = await fetchWithSsrFGuard({
			url: \`\${apiBase}/cardkit/v1/cards/\${this.state.cardId}\`,
			init: {
				method: "PUT",
				headers: {
					Authorization: \`Bearer \${await getToken(this.creds, { fetchImpl: this.fetchImpl, lookupFn: this.lookupFn })}\`,
					"Content-Type": "application/json",
					"User-Agent": getFeishuUserAgent()
				},
				body: JSON.stringify({
					card: { type: "card_json", data: JSON.stringify(card) },
					sequence: this.state.sequence,
					uuid: \`w_\${this.state.cardId}_\${this.state.sequence}\`
				})
			},
			fetchImpl: this.fetchImpl,
			lookupFn: this.lookupFn,
			policy: { allowedHostnames: resolveAllowedHostnames(this.creds.domain) },
			auditContext: "feishu.streaming-card.model-card",
			timeoutMs: this.creds.httpTimeoutMs ?? 3e4
		});
		try {
			await assertSuccessfulCardKitResponse(response, "feishu.streaming-card.model-card", "Replace whole card");
		} finally {
			await release();
		}
	}
	// v-feishu-card-open-v1: one more finished piece of V's card is shown in place.
	vShowModelCard(card) {
		this.queue = this.queue.then(async () => {
			if (!this.state || this.closed) return;
			await this.vPutWholeCard(card);
			this.vModelCardShown = true;
		}).catch((error) => this.log?.(\`Model card preview failed: \${String(error)}\`));
		return this.queue;
	}
	async vCloseWithModelCard(card) {
		this.closed = true;
		this.clearFlushTimer();
		await this.queue;
		const messageId = this.state.messageId;
		let error;
		try {
			await this.vPutWholeCard(card);
		} catch (e) {
			error = e;
			this.log?.(\`Model card final failed: \${String(e)}\`);
		}
		const cardId = this.state.cardId;
		this.state.sequence += 1;
		await fetchWithSsrFGuard({
			url: \`\${resolveApiBase(this.creds.domain)}/cardkit/v1/cards/\${cardId}/settings\`,
			init: {
				method: "PATCH",
				headers: {
					Authorization: \`Bearer \${await getToken(this.creds, { fetchImpl: this.fetchImpl, lookupFn: this.lookupFn })}\`,
					"Content-Type": "application/json; charset=utf-8",
					"User-Agent": getFeishuUserAgent()
				},
				body: JSON.stringify({
					settings: JSON.stringify({ config: { streaming_mode: false, summary: { content: truncateSummary(card.header?.title?.content ?? "") } } }),
					sequence: this.state.sequence,
					uuid: \`c_\${cardId}_\${this.state.sequence}\`
				})
			},
			fetchImpl: this.fetchImpl,
			lookupFn: this.lookupFn,
			policy: { allowedHostnames: resolveAllowedHostnames(this.creds.domain) },
			auditContext: "feishu.streaming-card.close",
			timeoutMs: this.creds.httpTimeoutMs ?? 3e4
		}).then(async ({ response, release }) => {
			try { await assertSuccessfulCardKitResponse(response, "feishu.streaming-card.close", "Close streaming card"); } finally { await release(); }
		}).catch((e) => this.log?.(\`Close failed: \${String(e)}\`));
		this.state = null;
		this.pendingText = null;
		this.log?.(\`Closed streaming with model card: cardId=\${cardId}\`);
		if (error !== void 0) throw error;
		return { visibleReplySent: true, content: "", ...messageId ? { messageId } : {} };
	}
};`)
  // Dispatcher: stream V's card while it is written; finish it in place.
  replace('	const queueStreamingUpdate = (nextText, options) => {', `	let vModelCardShownCount = 0;
	const vStreamModelCard = (text) => {
		const partial = vPartialFeishuCard(text);
		if (!partial || partial.count <= vModelCardShownCount) return;
		vModelCardShownCount = partial.count;
		startStreaming();
		const startPromise = streamingStartPromise;
		void (async () => {
			if (startPromise) await startPromise;
			if (streaming?.isActive()) await streaming.vShowModelCard(partial.card);
		})();
	};
	const queueStreamingUpdate = (nextText, options) => {`);
  replace(`				if (!cleaned) return false;
				if (!vlab91Commentary.isClosed()`, `				if (!cleaned) return false;
				if (cleaned.trimStart().startsWith("{")) {
					vStreamModelCard(cleaned);
					return false;
				}
				if (!vlab91Commentary.isClosed()`);
  replace(`				const prepared = await renderFeishuReplyPayload(inputPayload, {
					to: sendTarget,
					identity,
					mentions: requiredMentionTargets
				});`, `				let vModelCard;
				if (info?.kind !== "block" && !inputPayload.presentation && !inputPayload.interactive && vReadNativeFeishuCardJson(inputPayload.text)) try {
					vModelCard = vBuildFeishuPayloadCard({
						payload: inputPayload,
						text: inputPayload.text,
						identity,
						mentions: requiredMentionTargets
					});
				} catch (error) {
					params.runtime?.log?.(\`feishu[\${account.accountId}] model card refused before send: \${String(error)}\`);
				}
				const prepared = vModelCard ? {
					payload: inputPayload,
					card: vModelCard
				} : await renderFeishuReplyPayload(inputPayload, {
					to: sendTarget,
					identity,
					mentions: requiredMentionTargets
				});`);
  replace(`				if (shouldDiscardStreamingPreview) await discardStreamingPreview();
				if (presentationCard) {`, `				if (vModelCard && (streaming?.isActive() || streamingStartPromise)) {
					if (streamingStartPromise) await streamingStartPromise;
					const session = streaming;
					try {
						if (hasMedia) await collectDelivery(sendMediaReplies(payload));
						if (streamingStartPromise) await streamingStartPromise;
						if (!session?.isActive()) throw new Error("no preview card to finish");
						const closed = await session.vCloseWithModelCard(vModelCard);
						if (streaming === session) resetStreamingState();
						markVisibleReplySent();
						return mergeFeishuReplyDeliveryResults([...deliveredResults, createFeishuReplyDeliveryResult({
							results: [closed],
							visibleReplySent: true,
							content: resolvedText,
							kind: "card"
						})], resolvedText);
					} catch (error) {
						params.runtime?.log?.(\`feishu[\${account.accountId}] model card could not finish in place; sending it as a new card: \${String(error)}\`);
						if (streaming === session) resetStreamingState();
					}
				}
				if (shouldDiscardStreamingPreview) await discardStreamingPreview();
				if (presentationCard) {`);
  return source;
}

const FEISHU_DIST = 'npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist';

// What V runs on 2026-11-04: reply-delivery-result is stock 9.1 (same bytes in every capture);
// monitor.account is the feishu-card-images release.
export const FILES = [
  { name: 'reply-delivery-result-CEFTDA3f.js', base: 'release/captured/v-desktop-handback-progress-20261030.feishu/dist/dist', before: '0cc2f09c3f541e522bbb05344dc09abd1a200bd73f53405a8f75cf8652a65a82', target: FEISHU_DIST, patch: patchReplyDelivery },
  { name: 'monitor.account-WFdlCDhR.js', base: 'lab/release-files/feishu-card-images', before: 'd642af6e81adf2c8e80cfa9fd354cf637d3460266b39e872b03c306b21f07d11', target: FEISHU_DIST, patch: patchMonitor },
];
