import assert from 'node:assert/strict';

// Worker processes compile JavaScript eagerly (worker-eager-compile), on top of V's
// production-worker/worker-pool.mjs (voice-reliability-20261007, captured from V 2026-10-08).
//
// A Worker's first user turn is slow even after prewarm, and the cost belongs to the
// process, not to the Session. V 2026-10-10 and 2026-10-11, vlab-worker, 504 turns:
// - First recorded turn of a process: Worker stream-send -> model call P50 3.21 s, P90
//   4.75 s; command entry -> stream-send P50 1.80 s.
// - Later turns on a process, including a Session that is new to it: send -> model P50
//   0.16-0.19 s; command entry -> stream-send P50 0.85-1.36 s.
// - First turns are bimodal, not slow across the board: 47 of 123 took under 0.5 s, 70 took
//   2.5-5.5 s, and the split does not follow the Session or concurrency. A fast one is
//   typically on a process spawned well before it, which has room for an unrecorded run
//   (heartbeat, cron, background work) to have exercised the turn path first.
//
// V8 parses and compiles a function only on its first call. Prewarm imports the turn's
// modules but never calls most of their functions, so the first real turn compiles the
// whole turn path (prompt assembly, tool construction, harness, provider transport) on
// the Worker's single thread. Local probe with V's captured dist (release-batch-20261009)
// on npm openclaw@2026.9.1, fake provider, Worker-style prewarm then three new Sessions:
// - default:    turn 1 -> model 621-690 ms, turns 2-3 163-208 ms.
// - --no-lazy:  turn 1 -> model 334-349 ms, turns 2-3 158-208 ms.
// That removes about two thirds of the first-turn surcharge. It held after 30 forced GCs,
// so bytecode flushing does not undo it on an idle Worker.
//
// Cost: the Worker compiles every loaded function at startup. Locally prewarm took 2.07 ->
// 2.25-2.50 s, bytecode 7.5 -> 30 MB and RSS 825 -> 966 MB. Startup happens before the
// Worker reports ready, so no turn waits on it unless the pool has to grow for that turn.
// The Gateway process is unchanged.
//
// OPENCLAW_WORKER_EAGER_COMPILE=0 (or "off"/"false") restores lazy compilation.

export const MARKER = '/* OPENCLAW_WORKER_EAGER_COMPILE_V1 */';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWorkerPool(source) {
  assert.equal(source.includes(MARKER), false, 'already patched');
  let out = replaceExactlyOnce(
    source,
    `function readIntEnv(env, key, fallback) {`,
    `${MARKER}
// On (default) unless OPENCLAW_WORKER_EAGER_COMPILE is "0", "off" or "false".
function readWorkerEagerCompile(env) {
  const raw = String(env?.OPENCLAW_WORKER_EAGER_COMPILE ?? "").trim().toLowerCase();
  return !(raw === "0" || raw === "off" || raw === "false");
}

// worker-eager-compile.1: compile each function when its module loads, so the first
// turn does not pay V8's lazy compilation of the whole turn path.
export function withWorkerEagerCompile(execArgv, enabled) {
  const rest = execArgv.filter((arg) => !/^--(?:no-)?lazy$/.test(arg));
  return enabled ? [...rest, "--no-lazy"] : execArgv;
}

function readIntEnv(env, key, fallback) {`,
    'readIntEnv',
  );
  out = replaceExactlyOnce(
    out,
    `    this.workerMaxOldSpaceMb = options.workerMaxOldSpaceMb ??
      readIntEnv(this.configEnv, "VLAB_WORKER_MAX_OLD_SPACE_MB", 0);`,
    `    this.workerMaxOldSpaceMb = options.workerMaxOldSpaceMb ??
      readIntEnv(this.configEnv, "VLAB_WORKER_MAX_OLD_SPACE_MB", 0);
    this.workerEagerCompile = options.workerEagerCompile ??
      readWorkerEagerCompile(this.configEnv);`,
    'max old space option',
  );
  out = replaceExactlyOnce(
    out,
    `      execArgv: resolveWorkerExecArgv(
        process.execArgv,
        this.workerMaxOldSpaceMb,
      ),`,
    `      execArgv: withWorkerEagerCompile(
        resolveWorkerExecArgv(process.execArgv, this.workerMaxOldSpaceMb),
        this.workerEagerCompile,
      ),`,
    'spawn execArgv',
  );
  out = replaceExactlyOnce(
    out,
    `      workerMaxOldSpaceMb: this.workerMaxOldSpaceMb,
      recycleRssBytes: this.recycleRssBytes,`,
    `      workerMaxOldSpaceMb: this.workerMaxOldSpaceMb,
      workerEagerCompile: this.workerEagerCompile,
      recycleRssBytes: this.recycleRssBytes,`,
    'pool status',
  );
  return out;
}
