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

function createFeishuReplyDispatcher(params) {
	const { chatId } = params;
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
	const buildCombinedStreamText = () => "";
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
	const startStreaming = () => {};
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
	};
	return {
		...callbacks,
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
		},
	};
}

if (process.argv[2] === "probe") {
	const result = {
		scoped: isVcodexMeaningfulProgressChat("oc_vcodex"),
		unlisted: isVcodexMeaningfulProgressChat("oc_unlisted"),
		values: [
		formatVcodexMeaningfulProgress({ kind: "command", phase: "start" }),
		formatVcodexMeaningfulProgress({ kind: "patch", phase: "result", status: "completed" }),
		formatVcodexMeaningfulProgress({ kind: "preamble", progressText: "正在检查 `/tmp/private/file.js` 并准备修改。" }),
		],
	};
	process.stdout.write(JSON.stringify(result));
}
