import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  patchLifecycleMessage,
  patchRegisterServiceMessage,
  patchRestartRuntime,
  patchServerReloadRuntime,
} from './safe-restart-no-forced-timeout.mjs';

test('direct safe restart waits for idle without a forced timeout', () => {
  const source = `\t\tdeferGatewayRestartUntilIdle({
\t\t\tgetPendingCount: pendingCheck,
\t\t\tmaxWaitMs: resolveGatewayRestartDeferralTimeoutMs(),
\t\t\treason: scheduledReason,
\t\t\ttimeoutIntent: {
\t\t\t\tforce: true,
\t\t\t\t...scheduledReason ? { reason: scheduledReason } : {}
\t\t\t}
\t\t});`;
  const result = patchRestartRuntime(source);
  assert.match(result, /maxWaitMs: void 0/);
  assert.doesNotMatch(result, /timeoutIntent|force: true/);
  assert.throws(() => patchRestartRuntime(result), /anchor drift/);
});

test('restart-required config reload also never escalates to a forced restart', () => {
  const source = `\t\t\tthis.restartDeferral = deferGatewayRestartUntilIdle({
\t\t\t\tgetPendingCount: () => this.options.getActiveCounts().totalActive,
\t\t\t\tmaxWaitMs: resolveGatewayRestartDeferralTimeoutMs(void 0),
\t\t\t\ttimeoutIntent: {
\t\t\t\t\tforce: true,
\t\t\t\t\treason: "config reload forced restart"
\t\t\t\t},
\t\t\t\treason: restartReason,`;
  const result = patchServerReloadRuntime(source);
  assert.match(result, /maxWaitMs: void 0/);
  assert.doesNotMatch(result, /timeoutIntent|forced restart/);
  assert.throws(() => patchServerReloadRuntime(result), /anchor drift/);
});

test('operator-facing text describes indefinite safe waiting and explicit force', () => {
  assert.equal(
    patchLifecycleMessage('safe restart requested; gateway will restart after active work drains (bounded wait; may force after the timeout expires)'),
    'safe restart requested; gateway will restart after active work drains; use --force only for an explicit immediate restart',
  );
  assert.equal(
    patchRegisterServiceMessage('Request an OpenClaw-aware restart after active work drains (bounded wait; may force after the timeout expires)'),
    'Request an OpenClaw-aware restart after active work drains (waits indefinitely; use --force for an immediate restart)',
  );
});

test('generated artifacts contain the policy change at the exact call sites', () => {
  const read = name => fs.readFileSync(new URL(`./release-files/${name}`, import.meta.url), 'utf8');
  const restart = read('restart-BXbZs7-w.js');
  const reload = read('server-reload-handlers-DblQx0j4.js');
  const lifecycle = read('lifecycle-C5MBRQv0.js');
  const register = read('register-service-commands-CgYnEAQx.js');
  assert.equal(restart.match(/getPendingCount: pendingCheck,\n\t\t\tmaxWaitMs: void 0,/g)?.length, 1);
  assert.equal(reload.match(/getPendingCount: \(\) => this\.options\.getActiveCounts\(\)\.totalActive,\n\t\t\t\tmaxWaitMs: void 0,/g)?.length, 1);
  assert.doesNotMatch(restart, /\.\.\.scheduledReason \? \{ reason: scheduledReason \} : \{\}/);
  assert.doesNotMatch(reload, /reason: "config reload forced restart"/);
  assert.match(lifecycle, /use --force only for an explicit immediate restart/);
  assert.match(register, /waits indefinitely; use --force for an immediate restart/);
});
