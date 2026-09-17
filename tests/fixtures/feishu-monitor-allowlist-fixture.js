// Minimal shape fixture reproducing the three runtime-allowlist sites the
// deployed Feishu monitor bundle carries. Kept byte-identical to the live
// bundle's expressions so the patcher's shape gate is exercised for real.
function createPublicCommentaryState() {
  return {
    push(runtime, payload) {
      if (closed || !['codex', 'vlab-worker'].includes(runtime) || payload?.kind !== 'preamble' || typeof payload.progressText !== 'string') return null;
      return payload.progressText;
    },
  };
}
function createFeishuReplyDispatcher(params) {
	return {
		replyOptions: {
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
