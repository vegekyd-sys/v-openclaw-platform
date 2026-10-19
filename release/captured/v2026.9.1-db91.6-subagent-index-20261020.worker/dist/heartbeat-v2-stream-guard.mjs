import { AsyncLocalStorage } from 'node:async_hooks';

// This scope is a transport deadline, never a content/ranking decision.
const scope = new AsyncLocalStorage();
const jobs = new Set([
  'e4fbbf9a-e157-4582-82e8-1aca94c51a40',
  'f3cf09ee-d3b1-4099-a08a-8c1fc07cc0d6',
]);
export function isHeartbeatV2Session(key) {
  if (typeof key !== 'string') return false;
  const match = /^agent:makaron:cron:([^:]+)(?::run:[^:]+)?$/.exec(key);
  return !!match && jobs.has(match[1]);
}
export function withHeartbeatV2Scope(message, action) {
  const state = { enabled: isHeartbeatV2Session(message?.sessionKey), calls: 0, eventSeen: false };
  return scope.run(state, async () => {
    try { return await action(); }
    catch (error) {
      if (state.enabled && state.calls > 0 && !state.eventSeen && error instanceof Error && error.name !== 'AbortError') {
        error.heartbeatV2PreModelFailure = true;
      }
      throw error;
    }
  });
}

export async function requireFirstSseEvent(fetchRequest, input, init, {
  timeoutMs = 30_000,
  maxPreludeBytes = 65_536,
  onFirstEvent,
} = {}) {
  const abort = new AbortController();
  const sourceSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = sourceSignal ? AbortSignal.any([sourceSignal, abort.signal]) : abort.signal;
  let reader;
  let timer;
  const fail = () => Object.assign(new Error(
    `Heartbeat V2 first-event timeout (${timeoutMs}ms): provider sent no complete SSE data event`,
  ), { name: 'TimeoutError', code: 'ETIMEDOUT' });
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = fail();
      abort.abort(error);
      void reader?.cancel(error).catch(() => {});
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetchRequest(input, { ...init, signal });
      // Let the provider SDK classify HTTP errors and non-SSE responses.
      if (!response.ok || !/\btext\/event-stream\b/i.test(response.headers.get('content-type') ?? '') || !response.body) return response;
      reader = response.body.getReader();
      const chunks = [];
      const decoder = new TextDecoder();
      let text = '';
      let bytes = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) {
          throw Object.assign(new Error('Heartbeat V2 provider stream ended before its first SSE data event'), { code: 'ECONNRESET' });
        }
        chunks.push(part.value);
        bytes += part.value.byteLength;
        text += decoder.decode(part.value, { stream: true });
        if (/(?:^|\n)data:[^\n]*\n(?:[^\n]*\n)*?\n/.test(text.replace(/\r\n/g, '\n'))) break;
        if (bytes > maxPreludeBytes) throw Object.assign(new Error('Heartbeat V2 SSE prelude exceeded bounded buffer'), { code: 'ECONNRESET' });
      }
      const upstreamReader = reader;
      onFirstEvent?.();
      reader = undefined;
      let index = 0;
      return new Response(new ReadableStream({
        async pull(controller) {
          try {
            if (index < chunks.length) { controller.enqueue(chunks[index++]); return; }
            const part = await upstreamReader.read();
            if (part.done) controller.close(); else controller.enqueue(part.value);
          } catch (error) { controller.error(error); }
        },
        cancel: reason => upstreamReader.cancel(reason),
      }), { status: response.status, statusText: response.statusText, headers: response.headers });
    })()]);
  } catch (error) {
    abort.abort(error);
    void reader?.cancel(error).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

let installed;
export function installHeartbeatV2StreamGuard(getHost, configureHost) {
  const baseBuilder = getHost().buildModelFetch;
  if (baseBuilder === installed) return;
  installed = model => {
    const baseFetch = baseBuilder(model);
    return (input, init) => {
      const state = scope.getStore();
      if (!state?.enabled) return baseFetch(input, init);
      // A different provider may already have performed work: never certify
      // that whole run as pre-model merely because DeepSeek failed earlier.
      if (model.provider !== 'deepseek') { state.eventSeen = true; return baseFetch(input, init); }
      state.calls++;
      return requireFirstSseEvent(baseFetch, input, init, {
        onFirstEvent: () => { state.eventSeen = true; },
      });
    };
  };
  configureHost({ buildModelFetch: installed });
}

export function heartbeatV2PreModelFailureResult(error, message) {
  if (!isHeartbeatV2Session(message?.sessionKey) || message?.harnessAttempt !== true || error?.heartbeatV2PreModelFailure !== true) return undefined;
  return {
    kind: 'agent', payloads: [], acceptedSessionSpawns: [],
    meta: { provider: 'deepseek', model: 'deepseek-flash', sessionId: message.sessionId },
    attempt: {
      aborted: false, assistantTranscriptOwned: true, externalAbort: false,
      timedOut: false, idleTimedOut: false, timedOutDuringCompaction: false,
      // IPC-safe failure text is accepted by the native prompt-failure classifier.
      promptError: error.message, promptErrorSource: 'prompt',
      providerRetryMaxRetries: 0,
      sessionIdUsed: message.sessionId,
      messagesSnapshot: [],
      assistantTexts: [], toolMetas: [], acceptedSessionSpawns: [],
      didSendViaMessagingTool: false,
      messagingToolSentTexts: [], messagingToolSentMediaUrls: [], messagingToolSentTargets: [],
      replayMetadata: { hadPotentialSideEffects: false, replaySafe: true },
      itemLifecycle: { startedCount: 0, completedCount: 0, activeCount: 0 },
    },
  };
}
