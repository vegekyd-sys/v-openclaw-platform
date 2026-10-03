import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULTS, MAX_DRAIN_MS, MIN_DRAIN_MS, classifyActivity, decide, describeActivity, drainVerdict,
  parseDurationMs, resolveIntentWriterExport, resolveRestartOptions, summarizeRestartJournal,
} from './v-restart-gateway-policy.mjs';

const cli = fileURLToPath(new URL('./v-restart-gateway.mjs', import.meta.url));
const remoteSource = fs.readFileSync(new URL('./v-restart-gateway-remote.mjs', import.meta.url), 'utf8');

const status = (counts = {}, workers = { active: 0, queued: 0, runs: [] }, pid = 4151237) => ({
  ok: true, running: true, pid, preflight: { safe: false, counts, blockers: [] }, workers,
});

test('durations parse with units and reject junk', () => {
  assert.equal(parseDurationMs('90s'), 90_000);
  assert.equal(parseDurationMs('10m'), 600_000);
  assert.equal(parseDurationMs('1h'), 3_600_000);
  assert.equal(parseDurationMs('250ms'), 250);
  assert.equal(parseDurationMs('1500'), 1500);
  assert.throws(() => parseDurationMs('soon'));
  assert.throws(() => parseDurationMs('-5s'));
});

test('options: reason required, no force, drain bounded and never zero', () => {
  assert.throws(() => resolveRestartOptions({}), /--reason is required/);
  assert.throws(() => resolveRestartOptions({ reason: 'x', force: true }), /--force is not offered/);
  assert.throws(() => resolveRestartOptions({ reason: 'x', drainMs: '0' }), /--drain must be between/);
  assert.throws(() => resolveRestartOptions({ reason: 'x', drainMs: '5s' }), /--drain must be between/);
  assert.throws(() => resolveRestartOptions({ reason: 'x', drainMs: '11m' }), /--drain must be between/);
  assert.throws(() => resolveRestartOptions({ reason: 'x'.repeat(201) }), /at most 200/);
  const o = resolveRestartOptions({ reason: ' load dist ' });
  assert.equal(o.reason, 'load dist');
  assert.equal(o.drainMs, DEFAULTS.drainMs);
  assert.ok(o.drainMs >= MIN_DRAIN_MS && o.drainMs <= MAX_DRAIN_MS);
  assert.equal(o.allowInterrupt, false);
  assert.equal(o.host, 'v');
  assert.equal(o.unit, 'openclaw-gateway.service');
});

test('background work never blocks; user-facing work and Worker runs do', () => {
  // The 2026-10-03 20:15 picture: Night Shift + cron tasks and long-poll RPCs, plus replies in flight.
  const busy = classifyActivity(status({ queueSize: 1, pendingReplies: 3, embeddedRuns: 2, rootRequests: 2, activeTasks: 3 }));
  assert.equal(busy.userFacingTotal, 6);
  assert.equal(busy.backgroundTotal, 5);
  const backgroundOnly = classifyActivity(status({ activeTasks: 3, cronRuns: 1, rootRequests: 2, backgroundExecSessions: 1 }));
  assert.equal(backgroundOnly.userFacingTotal, 0);
  assert.equal(backgroundOnly.backgroundTotal, 7);
  const worker = classifyActivity(status({}, { active: 1, queued: 1, runs: [{ runId: 'r1', sessionKey: 'agent:makaron:feishu:dm:x' }] }));
  assert.equal(worker.userFacingTotal, 2);
  assert.equal(classifyActivity(status({}, null)).workersKnown, false);
  assert.match(describeActivity(status({ pendingReplies: 1 }, { active: 1, queued: 0, runs: [{ runId: 'r1', sessionKey: 's' }] })), /pendingReplies=1 workerRuns=1[\s\S]*worker run r1 s/);
});

test('decision waits for consecutive quiet samples, then proceeds', () => {
  const base = { startedAt: 0, idleWaitMs: 600_000, quietPolls: 2, allowInterrupt: false };
  const quiet = status({ activeTasks: 2 });
  const busy = status({ embeddedRuns: 1 });
  assert.equal(decide({ ...base, samples: [], now: 0 }).action, 'wait');
  assert.equal(decide({ ...base, samples: [quiet], now: 10 }).action, 'wait');
  assert.equal(decide({ ...base, samples: [quiet, busy], now: 20 }).action, 'wait');
  assert.equal(decide({ ...base, samples: [busy, quiet, quiet], now: 30 }).action, 'proceed');
});

test('at the deadline: refuse by default, bounded interrupt only when allowed', () => {
  const base = { startedAt: 0, idleWaitMs: 600_000, quietPolls: 2 };
  const busy = status({ pendingReplies: 1 });
  assert.equal(decide({ ...base, samples: [busy, busy], now: 600_000, allowInterrupt: false }).action, 'refuse');
  assert.equal(decide({ ...base, samples: [busy, busy], now: 600_000, allowInterrupt: true }).action, 'interrupt');
  // Quiet right at the deadline but not for quietPolls samples: the bounded drain covers it.
  assert.equal(decide({ ...base, samples: [busy, status()], now: 600_000, allowInterrupt: false }).action, 'proceed');
});

test('finds the minified intent writer export instead of hard-coding it', () => {
  // Tail of /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/restart-intent-BYVo1227.js on V.
  const chunk = 'function writeGatewayRestartIntentSync(opts) {}\n//#endregion\n' +
    'export { writeGatewayRestartIntentSync as a, normalizeRestartIntentReason as i, consumeGatewayRestartIntentPayloadSync as n, ' +
    'consumeGatewayRestartIntentSync as r, clearGatewayRestartIntentSync as t };';
  assert.equal(resolveIntentWriterExport(chunk), 'a');
  assert.equal(resolveIntentWriterExport(chunk.replace(' as a,', ' as zz,')), 'zz');
  assert.equal(resolveIntentWriterExport('function writeGatewayRestartIntentSync(o){}\nexport { writeGatewayRestartIntentSync };'), 'writeGatewayRestartIntentSync');
  assert.equal(resolveIntentWriterExport('export { other as a };'), null);
});

// Real journal lines from production V (journalctl -u openclaw-gateway -o cat).
const FORCED_20261003 = [
  '2026-10-03T20:10:06.902+08:00 [reload] config change requires gateway restart (browser.extraArgs) — deferring until 1 operation(s), 1 reply(ies), 1 embedded run(s), 2 background task run(s) complete',
  '2026-10-03T20:15:14.847+08:00 [reload] restart still deferred after 299106ms with 1 operation(s), 3 reply(ies)',
  '2026-10-03T20:15:19.206+08:00 [reload] restart timeout after 303366ms with 1 operation(s), 3 reply(ies), 2 embedded run(s) still active; forcing restart',
  '2026-10-03T20:15:19.534+08:00 [gateway] received SIGUSR1; restarting',
  '2026-10-03T20:15:22.506+08:00 [gateway] draining active work before restart with timeout 0ms: 1 queued or active operation(s); 3 pending reply delivery operation(s); 2 active embedded run(s)',
  '2026-10-03T20:15:22.507+08:00 [gateway] forced restart requested; skipping active work drain',
  '2026-10-03T20:15:27.931+08:00 [main-session-restart-recovery] marked 2 interrupted main session(s) for restart recovery (gateway restart shutdown)',
  '2026-10-03T20:16:20.267+08:00 [gateway] restart mode: full process restart (supervisor restart)',
];
const BOUNDED_20260930 = [
  '2026-09-30T13:00:13.387+08:00 [gateway] received SIGUSR1; restarting',
  '2026-09-30T13:00:16.462+08:00 [gateway] draining active work before restart with timeout 5000ms: taskId=875cedb7 status=running runtime=subagent',
  '2026-09-30T13:00:19.599+08:00 [gateway] active-work drain timeout reached; proceeding with restart: taskId=875cedb7',
  '2026-09-30T13:01:02.619+08:00 [gateway] restart mode: full process restart (supervisor restart)',
];

test('journal summary recognises the forced 0 ms restart of 2026-10-03', () => {
  const s = summarizeRestartJournal(FORCED_20261003);
  assert.deepEqual(s.configRestartDeferred, ['browser.extraArgs']);
  assert.equal(s.configRestartForced, true);
  assert.equal(s.signal, 'SIGUSR1');
  assert.equal(s.drainTimeoutMs, 0);
  assert.equal(s.forced, true);
  assert.equal(s.interruptedMainSessions, 2);
  assert.equal(s.configRestartPending, false);
  assert.equal(drainVerdict(s).ok, false);
  assert.match(drainVerdict(s).text, /FORCED/);
});

test('journal summary: bounded drain, idle restart, and a pending config restart', () => {
  const bounded = summarizeRestartJournal(BOUNDED_20260930);
  assert.equal(bounded.drainTimeoutMs, 5000);
  assert.equal(bounded.drainTimeout, true);
  assert.equal(drainVerdict(bounded).ok, true);
  const drained = summarizeRestartJournal(['[gateway] received SIGUSR1; restarting', '[gateway] draining active work before restart with timeout 90000ms: 1 active embedded run(s)', '[gateway] all active work drained']);
  assert.match(drainVerdict(drained).text, /all active work drained/);
  const idle = summarizeRestartJournal(['[gateway] received SIGUSR1; restarting', '[gateway] restart mode: full process restart (supervisor restart)']);
  assert.match(drainVerdict(idle).text, /idle/);
  assert.equal(drainVerdict(summarizeRestartJournal([])).ok, false);
  const pending = summarizeRestartJournal(FORCED_20261003.slice(0, 2));
  assert.equal(pending.configRestartPending, true);
});

test('remote side never requests a forced drain and never touches systemd state', () => {
  assert.doesNotMatch(remoteSource, /force\s*:\s*true/);
  assert.doesNotMatch(remoteSource, /systemctl'?,\s*\[\s*'(restart|stop|start|kill)/);
  assert.match(remoteSource, /intent: \{ waitMs \}/);
  assert.match(remoteSource, /pid !== expectedPid/);
});

test('CLI rejects --force, a missing reason and a zero drain before touching any host', () => {
  const run = (...a) => spawnSync(process.execPath, [cli, ...a, '--host', 'invalid.host.example'], { encoding: 'utf8', timeout: 20_000 });
  for (const [args, re] of [
    [['restart', '--reason', 'x', '--force'], /--force is not offered/],
    [['restart'], /--reason is required/],
    [['restart', '--reason', 'x', '--drain', '0'], /--drain must be between/],
    [['restart', '--reason', 'x', '--bogus'], /unknown argument/],
  ]) {
    const r = run(...args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, re);
  }
});
