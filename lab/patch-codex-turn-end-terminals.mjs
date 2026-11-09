import assert from 'node:assert/strict';

// Stop the background terminals a Codex turn leaves running when it ends (V 2026-11-09).
//
// Codex keeps a command in a native background terminal once exec_command passes its
// yield_time_ms, and keeps shells opened for write_stdin. OpenClaw's Codex plugin stopped them
// (terminateCodexBackgroundTerminals: thread/backgroundTerminals/list + terminate) only when a turn
// was cancelled or timed out. After a normal ending nothing wakes the agent when such a command
// ends: 16:40 a /vds chat's `grep -rl chengpian-daily ~/.openclaw` kept reading for 14 minutes after
// its turn had replied (docs/incidents/2026-11-09-recursive-scan.md).
//
// cleanupCodexAttempt now stops the thread's background terminals on every ending the abort path
// does not already handle. OPENCLAW_CODEX_TURN_END_TERMINALS=keep keeps them.
//
// Source: openclaw-versa versa/port-codex-turn-end-terminals-20261110 @ b507ffe16b3.

export const MARKER = 'v-codex-turn-end-terminals-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// @openclaw/codex/dist/run-attempt-D1hJO4fX.js (extensions/codex/src/app-server/run-attempt-cleanup.ts)
export function patchRunAttempt(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `		await runCleanupStep("codex-trajectory-flush", () => trajectoryRecorder?.flush());
		const retainLiveIncognitoThread =`,
    `		await runCleanupStep("codex-trajectory-flush", () => trajectoryRecorder?.flush());
		// ${MARKER}: stop the native background terminals a normally ended turn left running.
		if (!runAbortController.signal.aborted && state.timeout === void 0 && process.env.OPENCLAW_CODEX_TURN_END_TERMINALS !== "keep") await runCleanupStep("codex-turn-end-background-terminals", () => terminateCodexBackgroundTerminals(resourceState.client, resourceState.thread.threadId));
		const retainLiveIncognitoThread =`,
    'cleanupCodexAttempt trajectory flush');
}

const CODEX = 'npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist';
export const FILES = [
  { name: 'run-attempt-D1hJO4fX.js', base: 'codex/dist', target: CODEX, before: 'f67df60a4e880c96a32a415d0e26c5863c24e0ab9126e8a7755cd009c29b0d4b', patch: patchRunAttempt },
];
