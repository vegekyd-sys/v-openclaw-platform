import assert from 'node:assert/strict';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `${label} anchor drift`);
  return source.replace(before, after);
}

export function patchRestartRuntime(source) {
  return replaceExactlyOnce(
    source,
    `\t\tdeferGatewayRestartUntilIdle({
\t\t\tgetPendingCount: pendingCheck,
\t\t\tmaxWaitMs: resolveGatewayRestartDeferralTimeoutMs(),
\t\t\treason: scheduledReason,
\t\t\ttimeoutIntent: {
\t\t\t\tforce: true,
\t\t\t\t...scheduledReason ? { reason: scheduledReason } : {}
\t\t\t}
\t\t});`,
    `\t\tdeferGatewayRestartUntilIdle({
\t\t\tgetPendingCount: pendingCheck,
\t\t\tmaxWaitMs: void 0,
\t\t\treason: scheduledReason
\t\t});`,
    'direct safe restart timeout policy',
  );
}

export function patchServerReloadRuntime(source) {
  return replaceExactlyOnce(
    source,
    `\t\t\tthis.restartDeferral = deferGatewayRestartUntilIdle({
\t\t\t\tgetPendingCount: () => this.options.getActiveCounts().totalActive,
\t\t\t\tmaxWaitMs: resolveGatewayRestartDeferralTimeoutMs(void 0),
\t\t\t\ttimeoutIntent: {
\t\t\t\t\tforce: true,
\t\t\t\t\treason: "config reload forced restart"
\t\t\t\t},
\t\t\t\treason: restartReason,`,
    `\t\t\tthis.restartDeferral = deferGatewayRestartUntilIdle({
\t\t\t\tgetPendingCount: () => this.options.getActiveCounts().totalActive,
\t\t\t\tmaxWaitMs: void 0,
\t\t\t\treason: restartReason,`,
    'config reload restart timeout policy',
  );
}

export function patchLifecycleMessage(source) {
  return replaceExactlyOnce(
    source,
    'safe restart requested; gateway will restart after active work drains (bounded wait; may force after the timeout expires)',
    'safe restart requested; gateway will restart after active work drains; use --force only for an explicit immediate restart',
    'safe restart result message',
  );
}

export function patchRegisterServiceMessage(source) {
  return replaceExactlyOnce(
    source,
    'Request an OpenClaw-aware restart after active work drains (bounded wait; may force after the timeout expires)',
    'Request an OpenClaw-aware restart after active work drains (waits indefinitely; use --force for an immediate restart)',
    'safe restart CLI help',
  );
}
