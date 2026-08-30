var FeishuStreamingSession = class {
	constructor() {
		this.state = null;
		this.closed = false;
		this.pendingText = null;
		this.queue = Promise.resolve();
	}
	clearFlushTimer() {}
	async replaceCardContent() { return true; }
	async update(text) {
		if (!this.state || this.closed) return;
		return text;
	}
};

const reasoningPreviewEnabled = false;
const stripReasoningTagsFromText = (text) => text;
const formatReasoningMessage = (text) => text;
const isChannelProgressDraftWorkToolName = () => true;
const formatChannelProgressDraftLineForEntry = () => "raw tool status";
const resolveSendableOutboundReplyParts = (payload) => ({ text: payload.text });
const mergeStreamingFinalText = (left, right) => [left, right].filter(Boolean).join("\n\n");
const sessionEntries = new Map([
	["session-codex", { providerOverride: "openai", modelOverride: "gpt-5.6-sol" }],
	["session-worker", { providerOverride: "openai", modelOverride: "gpt-5.6-terra" }],
]);
const getSessionEntry = ({ sessionKey }) => sessionEntries.get(sessionKey);

function createFeishuReplyDispatcher(params) {
	const core = { channel: { session: { resolveStorePath: () => "/tmp/sessions.json" } } };
	const { cfg, agentId, chatId } = params;
	const account = { config: { streaming: true, blockStreaming: false } };
	const renderMode = "card";
	const streamingEnabled = account.config?.streaming !== false && renderMode !== "raw";
	const coreBlockStreamingEnabled = account.config?.blockStreaming === true;
	let streaming = null;
	let partialUpdateQueue = Promise.resolve();
	let streamingFlushScheduled = false;
	let latestStreamingCombined = null;
	let streamingStartPromise = null;
	let streamText = "";
	let lastPartial = "";
	let reasoningText = "";
	let statusLine = "";
	let snapshotBaseText = "";
	let lastSnapshotTextLength = 0;
	let hasStreamingFinalText = false;
	const replyOptions = {};
	const typingCallbacks = {};
	const rendered = [];
	const buildCombinedStreamText = (_reasoning, text) => text;
	const flushStreamingCardUpdate = (combined) => {
		latestStreamingCombined = combined;
		if (streamingFlushScheduled) return;
		streamingFlushScheduled = true;
		partialUpdateQueue = partialUpdateQueue.then(async () => {
			try {
				while (latestStreamingCombined !== null) {
					const nextCombined = latestStreamingCombined;
					latestStreamingCombined = null;
					if (streamingStartPromise) await streamingStartPromise;
					if (streaming?.isActive()) await streaming.update(nextCombined);
				}
			} finally {
				streamingFlushScheduled = false;
			}
		});
	};
	const queueStreamingUpdate = (nextText, options) => {
		streamText = nextText;
		flushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
	};
	const queueReasoningUpdate = () => {};
	const startStreaming = () => {
		if (streaming) return;
		streaming = {
			isActive: () => true,
			update: async (text) => rendered.push({ operation: "update", text }),
			replace: async (text) => rendered.push({ operation: "replace", text }),
		};
	};
	const resetStreamingState = () => {
		streaming = null;
		streamingStartPromise = null;
		partialUpdateQueue = Promise.resolve();
		streamingFlushScheduled = false;
		latestStreamingCombined = null;
		streamText = "";
		lastPartial = "";
		reasoningText = "";
		statusLine = "";
		snapshotBaseText = "";
		lastSnapshotTextLength = 0;
		hasStreamingFinalText = false;
	};
	const closeStreaming = async (options) => {
		try {
			return options;
		} finally {
			resetStreamingState();
		}
	};
	const discardStreamingPreview = async () => {
		try {
			return;
		} finally {
			resetStreamingState();
		}
	};
	const updateStreamingStatusLine = (nextStatusLine, options) => {
		statusLine = nextStatusLine;
		if (!Boolean(streaming?.isActive() || streamingStartPromise) && (options?.startIfNeeded === false || renderMode !== "card")) return;
		startStreaming();
		flushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
	};
	const callbacks = {
		onReplyStart: async () => {
			if (streamingEnabled && renderMode === "card") startStreaming();
			await Promise.resolve(typingCallbacks?.onReplyStart?.());
		},
		deliver: async (payload, info) => {
			if (info?.kind === "final") skippedFinalReason = null;
			const payloadText = payload.isReasoning && payload.text ? formatReasoningMessage(payload.text) : payload.text;
			const reply = resolveSendableOutboundReplyParts({ ...payload, text: payloadText });
			const text = info?.kind === "final" ? mergeStreamingFinalText(streamText, reply.text, payload.isError === true && hasStreamingFinalText) : reply.text;
			return text;
		},
	};
	return {
		...callbacks,
		rendered,
		flush: () => partialUpdateQueue,
		replyOptions: {
			...replyOptions,
			disableBlockStreaming: typeof account.config?.blockStreaming === "boolean" ? !account.config.blockStreaming : true,
			onPartialReply: streamingEnabled ? (payload) => {
				if (!payload.text) return;
				const cleaned = payload.text.trim();
				if (!cleaned) return;
				startStreaming();
				queueStreamingUpdate(cleaned, {
					dedupeWithLastPartial: true,
					mode: "snapshot"
				});
			} : void 0,
			onToolStart: streamingEnabled ? (payload) => {
				if (!isChannelProgressDraftWorkToolName(payload.name)) return;
				const statusLineLocal = formatChannelProgressDraftLineForEntry(account.config, {
					event: "tool",
					name: payload.name,
					phase: payload.phase,
					args: payload.args
				}, { detailMode: payload.detailMode });
				if (statusLineLocal) updateStreamingStatusLine(statusLineLocal);
			} : void 0,
			onAssistantMessageStart: streamingEnabled ? () => {
				updateStreamingStatusLine("", { startIfNeeded: false });
			} : void 0,
			onReasoningStream: reasoningPreviewEnabled ? (payload) => {
				if (!payload.text) return;
				startStreaming();
				queueReasoningUpdate(formatReasoningMessage(payload.text));
			} : void 0,
			onReasoningEnd: reasoningPreviewEnabled ? () => {} : void 0,
			onCompactionStart: streamingEnabled ? () => {
				updateStreamingStatusLine("📦 **Compacting context...**");
			} : void 0,
			onCompactionEnd: streamingEnabled ? () => {
				updateStreamingStatusLine("");
			} : void 0
		},
	};
}

if (process.argv[2] === "probe") {
	(async () => {
		const cfg = {
			agents: {
				defaults: {
					model: { primary: "deepseek/deepseek-v4-pro" },
					models: {
						"openai/*": { agentRuntime: { id: "vlab-worker" } },
						"openai/gpt-5.6-terra": { agentRuntime: { id: "vlab-worker" } },
					},
				},
				list: [{
					id: "makaron",
					model: { primary: "deepseek/deepseek-v4-pro" },
					models: {
						"openai/gpt-5.6-sol": { alias: "vcodex", agentRuntime: { id: "codex" } },
					},
				}],
			},
			plugins: { entries: { codex: { enabled: true } } },
		};
		const dispatcher = createFeishuReplyDispatcher({ cfg, agentId: "makaron", chatId: "oc_any", sessionKey: "session-codex" });
		const workerDispatcher = createFeishuReplyDispatcher({ cfg, agentId: "makaron", chatId: "oc_any", sessionKey: "session-worker" });
		await dispatcher.onReplyStart();
		await dispatcher.flush();
		const afterStart = dispatcher.rendered.length;
		dispatcher.replyOptions.onItemEvent({ kind: "command", command: "RAW_COMMAND_SENTINEL" });
		dispatcher.replyOptions.onToolStart({ name: "bash", args: { command: "RAW_COMMAND_SENTINEL" } });
		await dispatcher.flush();
		const afterTool = dispatcher.rendered.length;
		dispatcher.replyOptions.onItemEvent({ itemId: "commentary-1", kind: "preamble", progressText: "我先检查" });
		await dispatcher.flush();
		dispatcher.replyOptions.onItemEvent({ itemId: "commentary-1", kind: "preamble", progressText: "我先检查当前实现如何传递 Codex 的文字。" });
		await dispatcher.flush();
		dispatcher.replyOptions.onItemEvent({ itemId: "commentary-2", kind: "preamble", progressText: "问题已经定位，我正在调整事件路由。" });
		await dispatcher.flush();
		dispatcher.replyOptions.onPartialReply({ text: "最终结果：文字流式已经完成。" });
		await dispatcher.flush();
		dispatcher.replyOptions.onItemEvent({ itemId: "commentary-late", kind: "preamble", progressText: "LATE_COMMENTARY_SENTINEL" });
		await dispatcher.flush();
		const result = {
			codexRuntime: resolveVcodexSessionRuntime({ cfg, agentId: "makaron", sessionKey: "session-codex", storePath: "/tmp/sessions.json" }),
			workerRuntime: resolveVcodexSessionRuntime({ cfg, agentId: "makaron", sessionKey: "session-worker", storePath: "/tmp/sessions.json" }),
			codexDeliveryMode: dispatcher.replyOptions.sourceReplyDeliveryMode ?? null,
			workerDeliveryMode: workerDispatcher.replyOptions.sourceReplyDeliveryMode ?? null,
			afterStart,
			afterTool,
			rendered: dispatcher.rendered,
		};
		process.stdout.write(JSON.stringify(result));
	})().catch((error) => {
		process.stderr.write(String(error));
		process.exitCode = 1;
	});
}
