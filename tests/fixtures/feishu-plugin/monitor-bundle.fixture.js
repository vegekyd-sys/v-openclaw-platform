// Shape fixture reproducing the five sites the deployed Feishu monitor bundle
// carries. Kept byte-identical to the live bundle's expressions so the
// patcher's shape gate is exercised for real.
//
// Stored flat rather than under a `dist/` directory because the repo's
// .gitignore ignores `dist/` everywhere; the test assembles the plugin layout
// the patcher expects.
function createPublicCommentaryState() {
  const items = new Map();
  let closed = false;
  return {
    close() { closed = true; items.clear(); },
    isClosed() { return closed; },
    push(runtime, payload) {
      if (closed || !['codex', 'vlab-worker'].includes(runtime) || payload?.kind !== 'preamble' || typeof payload.progressText !== 'string') return null;
      return payload.progressText;
    },
  };
}
function createFeishuReplyDispatcher(params) {
	const vlab91Commentary = createPublicCommentaryState();
	return {
		replyOptions: {
			onPartialReply: previewStreamingEnabled ? (payload) => {
				if (!payload.text) return false;
				const cleaned = stripReasoningTagsFromText(payload.text, {
					mode: "strict",
					trim: "both"
				});
				if (!cleaned) return false;
				startStreaming();
				queueStreamingUpdate(cleaned, {
					dedupeWithLastPartial: true,
					mode: "snapshot"
				});
				return false;
			} : void 0,
			onToolStart: previewStreamingEnabled ? (payload) => {
				if (["codex", "vlab-worker"].includes(responsePrefixContextProvider().agentRuntime)) {
					return true;
				}
				return false;
			} : void 0,
			onCompactionStart: previewStreamingEnabled ? () => updateStreamingStatusLine("compacting", {startIfNeeded: ["codex", "vlab-worker"].includes(responsePrefixContextProvider().agentRuntime)}) : void 0
		}
	};
}
