// Native 9.1 separates the attempt callback from the process-wide UI event bus.
// A child process must reproduce both paths. Never import child ownership/seq
// into the Gateway, and never publish its nested command's terminal lifecycle.
const publicStreams = new Set(['assistant', 'tool', 'reasoning']);
export function publishWorkerPublicStream(params, name, args, emit) {
  if (name !== 'onAgentEvent' || params.abortSignal?.aborted) return 0;
  let published = 0;
  for (const event of args) {
    // gpt-live-public-progress-bridge-v1: classified public preambles only.
    const data = event?.data;
    if (!data || typeof data !== 'object') continue;
    const publicPreamble = event.stream === 'item' && data.kind === 'preamble' &&
      (data.phase === 'update' || data.phase === 'end') && !data.isReasoning &&
      typeof data.progressText === 'string' && data.progressText.trim().length > 0;
    if (!publicStreams.has(event?.stream) && !publicPreamble) continue;
    // Only the public text projection crosses this new item boundary.
    // Gateway-issued routing below still replaces all child ownership fields.
    const publishedData = publicPreamble ? {
      kind: 'preamble', phase: data.phase, progressText: data.progressText,
      ...(typeof data.itemId === 'string' ? { itemId: data.itemId } : {}),
      ...(typeof data.title === 'string' ? { title: data.title } : {}),
    } : data;
    emit({
      runId: params.runId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      lifecycleGeneration: params.lifecycleGeneration,
      stream: event.stream,
      data: publishedData,
    });
    published++;
  }
  return published;
}
