import assert from 'node:assert/strict';

// Worker: stop waiting for the Gateway's acknowledgement of onActiveModelSelected before
// the model call (worker-model-selected-async), on top of the worker-prewarm-v Worker V
// runs today.
//
// OpenClaw's agent command awaits `params.opts.onActiveModelSelected(...)` in runCandidate,
// right before it builds the attempt and calls the model. In the isolated Worker that
// callback is a bridged stream event: the Worker sends it over IPC, the Gateway's pool runs
// it behind the request's earlier events, calls the Gateway callback and only then sends
// `stream-event-ack`. Until that ack arrives the Worker's turn does not reach the model, so
// every turn pays one Gateway round trip on its critical path, and that round trip is as
// slow as the Gateway event loop is busy (V 2026-10-06 night sample: worker-stream-send ->
// worker-ack-done P50 0.2 s, P95 2.9 s, max 3.0 s).
//
// The callback is a notification: harness-event-contract lists it among the bridged
// callbacks whose "arguments and completion semantics can cross the Worker IPC boundary
// without changing the Agent's decision-making", and runCandidate ignores its return value.
// So the Worker now queues it exactly as before (same per-request order in the Worker and
// in the pool, same Gateway callback, same ack) but resolves the Agent's await at once.
// A failed delivery is not lost: it is recorded as the request's stream failure, which
// fails every later stream event of the request and the request itself after the run
// (`if (streamState.failure) throw streamState.failure`), the same terminal outcome as
// today, only reported after the model call instead of before it.
//
// OPENCLAW_WORKER_ASYNC_MODEL_SELECTED=0 restores the blocking await.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// Callbacks the Agent awaits before its model call whose results it never uses.
export const NON_BLOCKING_STREAM_CALLBACKS = ['onActiveModelSelected'];

const CALLBACK_MAP = `      .map((name) => [
        name,
        (...args) =>
          queueStreamEvent(
            state,
            requestId,
            request,
            name,
            args,
            abortSignal,
          ),
      ]),
  );
}
`;

const CALLBACK_MAP_ASYNC = `      .map((name) => [
        name,
        nonBlockingStreamCallback(name)
          ? (...args) => {
              // Same queue, order and ack; the Agent just does not wait for the ack.
              // A failure becomes state.failure and fails the request after the run.
              void queueStreamEvent(
                state,
                requestId,
                request,
                name,
                args,
                abortSignal,
              ).catch(() => {});
            }
          : (...args) =>
              queueStreamEvent(
                state,
                requestId,
                request,
                name,
                args,
                abortSignal,
              ),
      ]),
  );
}

// OPENCLAW_WORKER_MODEL_SELECTED_ASYNC_V1
const NON_BLOCKING_STREAM_CALLBACKS = new Set(${JSON.stringify(NON_BLOCKING_STREAM_CALLBACKS)});
function nonBlockingStreamCallback(name) {
  return process.env.OPENCLAW_WORKER_ASYNC_MODEL_SELECTED !== "0" &&
    NON_BLOCKING_STREAM_CALLBACKS.has(name);
}
`;

export function patchWorker(source) {
  assert.equal(source.includes('OPENCLAW_WORKER_MODEL_SELECTED_ASYNC_V1'), false, 'Worker is already patched');
  return replaceExactlyOnce(source, CALLBACK_MAP, CALLBACK_MAP_ASYNC, 'stream callback map');
}
