// Candidate-only preload for the memory-flush-defer announce arm. Never part of a release:
// it is loaded into a candidate Gateway with `node --import <this file>` (NODE_OPTIONS) and
// does nothing unless MEMORY_FLUSH_DEFER_PROBE_DIST names the candidate's openclaw dist dir.
//
// When a deferred memory flush registers its run (agent-runner-memory, memory-flush-defer-v1),
// it waits MEMORY_FLUSH_DEFER_PROBE_DELAY_MS (default 3000) and then wakes the session the way
// a subagent completion wakes an active requester (subagent-announce-delivery
// resolveActiveWakeWithRetries): queueEmbeddedAgentMessageWithOutcomeAsync(sessionId, text,
// { steeringMode: "all", waitForTranscriptCommit: true }), dropping waitForTranscriptCommit on
// transcript_commit_wait_unsupported and retrying "compacting" after 1, 2, 4 and 8 s. Each
// outcome is printed to stderr as `[memory-flush-defer-probe] {json}` (no message text).
//
// Expected with the patch: compacting (flush yields: phase=yielded reason=session-injection),
// compacting while it unwinds, then no_active_run and verdict "direct-delivery".
// Without the builtin patch: queued, verdict "absorbed-by-flush".
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFERRED_RUNS = Symbol.for('openclaw.memoryFlushDefer.deferredRuns.v1');
const EMBEDDED_RUN_STATE = Symbol.for('openclaw.embeddedRunState');
// npm 2026.9.1 runs-5WnDPZ0V.js export letters
const RUNS_CHUNK = 'runs-5WnDPZ0V.js';
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

const dist = process.env.MEMORY_FLUSH_DEFER_PROBE_DIST;
if (dist) {
  const delayMs = Number(process.env.MEMORY_FLUSH_DEFER_PROBE_DELAY_MS ?? 3000);
  const retryDelays = process.env.MEMORY_FLUSH_DEFER_PROBE_RETRY_MS ? process.env.MEMORY_FLUSH_DEFER_PROBE_RETRY_MS.split(',').map(Number) : RETRY_DELAYS_MS;
  const text = process.env.MEMORY_FLUSH_DEFER_PROBE_TEXT ?? '[memory-flush-defer probe] A background task finished. Reply with one short line: "probe received".';
  const once = process.env.MEMORY_FLUSH_DEFER_PROBE_ONCE !== '0';
  const seen = new Set();
  let fired = false;
  const log = (fields) => process.stderr.write(`[memory-flush-defer-probe] ${JSON.stringify({ at: new Date().toISOString(), ...fields })}\n`);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const wake = async (runId) => {
    const runs = await import(pathToFileURL(path.join(dist, RUNS_CHUNK)).href);
    const queue = runs.v;
    const isActive = runs.u;
    const active = globalThis[EMBEDDED_RUN_STATE]?.activeRuns;
    const sessionId = active instanceof Map ? [...active].find(([, handle]) => handle?.runId === runId)?.[0] : undefined;
    if (!sessionId) return log({ phase: 'no-handle', runId });
    let options = { steeringMode: 'all', waitForTranscriptCommit: true };
    const outcomes = [];
    let retry = 0;
    for (;;) {
      const outcome = await queue(sessionId, text, options);
      outcomes.push(outcome.queued ? 'queued' : outcome.reason);
      log({ phase: 'attempt', runId, sessionId, outcome: outcomes.at(-1) });
      if (outcome.queued) break;
      if (outcome.reason === 'transcript_commit_wait_unsupported' && options.waitForTranscriptCommit) {
        options = { steeringMode: 'all' };
        continue;
      }
      if (outcome.reason === 'compacting' && retry < retryDelays.length) {
        await sleep(retryDelays[retry++]);
        continue;
      }
      break;
    }
    const queued = outcomes.at(-1) === 'queued';
    const requesterActive = isActive(sessionId);
    log({ phase: 'result', runId, sessionId, outcomes, requesterActive, verdict: queued ? 'absorbed-by-flush' : requesterActive ? 'requester-still-active' : 'direct-delivery' });
  };

  setInterval(() => {
    const registered = globalThis[DEFERRED_RUNS];
    if (!(registered instanceof Map) || (once && fired)) return;
    for (const runId of registered.keys()) {
      if (seen.has(runId)) continue;
      seen.add(runId);
      fired = true;
      log({ phase: 'armed', runId, delayMs });
      setTimeout(() => {
        if (!registered.has(runId)) return log({ phase: 'flush-gone', runId });
        wake(runId).catch((error) => log({ phase: 'error', runId, error: String(error?.message ?? error) }));
      }, delayMs);
    }
  }, 50).unref();
  log({ phase: 'loaded', dist, delayMs });
}
