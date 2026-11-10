// Native 9.1 separates the attempt callback from the process-wide UI event bus.
// A child process must reproduce both paths. Never import child ownership/seq
// into the Gateway, and never publish its nested command's terminal lifecycle.
const publicStreams = new Set(['assistant', 'tool', 'reasoning']);
export function publishWorkerPublicStream(params, name, args, emit) {
  if (name !== 'onAgentEvent' || params.abortSignal?.aborted) return 0;
  let published = 0;
  for (const event of args) {
    if (!publicStreams.has(event?.stream) || !event.data || typeof event.data !== 'object') continue;
    emit({
      runId: params.runId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      lifecycleGeneration: params.lifecycleGeneration,
      stream: event.stream,
      data: event.data,
    });
    published++;
  }
  return published;
}
