import assert from 'node:assert/strict';

// Worker prewarm retries when another process holds the state-lifecycle coordinator
// (worker-prewarm-contention-retry), on top of V's production-worker/worker.mjs
// (voice-reliability-20261007, captured from V 2026-10-08).
//
// Pool Workers prewarm at the same time. Each one's prewarm briefly takes the exclusive
// state-lifecycle coordinator (a SQLite BEGIN EXCLUSIVE with a 5 s busy timeout), and under
// that start-up burst one Worker can time out with StateDatabaseCoordinatorContentionError
// ("another OpenClaw process owns state-lifecycle"). The whole prewarm then fails and is
// recorded as deferred-to-normal-turn, so that Worker's first user turn pays every cost the
// prewarm exists to remove. Private VLab candidate 2026-10-08 (5 Workers, 8 concurrent cold
// turns): 5 of 6 runs had exactly one such Worker, failing after ~18.6 s.
//
// The failed attempt is retried after a short random delay, up to three attempts, within
// the existing prewarm timeout. Any other error, or an abort, ends prewarm as before.
// The prewarm record also gains attempts and the session-key step's result.
// OPENCLAW_WORKER_EAGER_PREPARE_RETRIES=0 restores a single attempt.

export const MARKER = '/* OPENCLAW_WORKER_PREWARM_CONTENTION_RETRY_V1 */';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWorker(source) {
  assert.equal(source.includes(MARKER), false, 'already patched');
  let out = replaceExactlyOnce(
    source,
    `  const started = performance.now();
  let lease;
  try {
    const agentRuntime = await loadAgentRuntime();`,
    `  const started = performance.now();
  ${MARKER}
  const configuredRetries = Number(process.env.OPENCLAW_WORKER_EAGER_PREPARE_RETRIES ?? 2);
  const maxAttempts = 1 + (Number.isFinite(configuredRetries) ? Math.min(5, Math.max(0, Math.trunc(configuredRetries))) : 2);
  for (let attempt = 1; ; attempt += 1) {
  let lease;
  let retry = false;
  try {
    const agentRuntime = await loadAgentRuntime();`,
    'prewarm attempt start',
  );
  out = replaceExactlyOnce(
    out,
    `      skillSnapshotPrepared: command?.skillSnapshotPrepared === true,
      ...(command?.skillSnapshotError ? { skillSnapshotError: command.skillSnapshotError } : {}),`,
    `      skillSnapshotPrepared: command?.skillSnapshotPrepared === true,
      ...(command?.skillSnapshotError ? { skillSnapshotError: command.skillSnapshotError } : {}),
      ...(attempt > 1 ? { attempts: attempt } : {}),
      ...(command?.sessionKeysPrepared !== undefined ? { sessionKeysPrepared: command.sessionKeysPrepared, sessionKeysMs: command.sessionKeysMs } : {}),
      ...(command?.sessionKeysError ? { sessionKeysError: command.sessionKeysError } : {}),`,
    'prewarm ready record',
  );
  out = replaceExactlyOnce(
    out,
    `  } catch (error) {
    runtimePrewarm = {
      status: "deferred-to-normal-turn",
      errorCategory: error?.name === "AbortError" || controller.signal.aborted ? "abort" : "other",
      error: String(error?.message ?? error).slice(0, 200),
      ms: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
    try { lease?.release(); } catch {}
  }
`,
    `  } catch (error) {
    const contention = error?.name === "StateDatabaseCoordinatorContentionError" || /another OpenClaw process owns /u.test(String(error?.message ?? ""));
    if (contention && attempt < maxAttempts && !controller.signal.aborted) {
      retry = true;
    } else {
      runtimePrewarm = {
        status: "deferred-to-normal-turn",
        errorCategory: error?.name === "AbortError" || controller.signal.aborted ? "abort" : contention ? "contention" : "other",
        error: String(error?.message ?? error).slice(0, 200),
        ms: Math.round(performance.now() - started),
        ...(attempt > 1 ? { attempts: attempt } : {}),
      };
    }
  } finally {
    try { lease?.release(); } catch {}
  }
  if (!retry) break;
  await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 750)));
  }
  clearTimeout(timer);
`,
    'prewarm catch and finally',
  );
  return out;
}
