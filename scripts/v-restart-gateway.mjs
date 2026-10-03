#!/usr/bin/env node
// The sanctioned way to restart production V's Gateway (OpenClaw 2026.9.1).
//
//   node scripts/v-restart-gateway.mjs status
//   node scripts/v-restart-gateway.mjs restart --reason "load promoted dist <name>" [--dry-run]
//        [--idle-wait 10m] [--quiet-polls 2] [--poll 15s] [--drain 60s] [--ready-timeout 10m]
//        [--allow-interrupt] [--host v] [--unit openclaw-gateway.service]
//
// Do not use `systemctl restart openclaw-gateway`, `kill -USR1`, or a config
// write that needs a restart, to restart V:
//   - `systemctl restart|stop`: the QQBot SIGTERM hook calls process.exit before
//     the Gateway reads any restart intent, so in-flight runs are killed at once
//     and nothing is marked for restart recovery (docs/v2026.9.1-db91.1-release.md).
//   - bare `kill -USR1`, `gateway.restart.request`, and restart-requiring config
//     edits all go through the Gateway's own deferral, which is hard-coded to
//     300 s in 9.1 and then requests a FORCED restart: 0 ms drain, pending
//     replies and active runs cut (2026-10-03 20:15). V's background work is
//     never idle, so that deferral nearly always ends forced.
//
// What this does instead:
//   1. Polls the Gateway's restart preflight and the Worker pool while the
//      Gateway keeps serving, until no user-facing work (queued turns, pending
//      replies, embedded runs, Worker runs) is seen for --quiet-polls samples,
//      or --idle-wait expires. Background work (Night Shift, cron, long-poll
//      RPCs) is reported but does not block: restart recovery and the Night
//      Shift restart hold resume it.
//   2. At the deadline it refuses (exit 3) unless --allow-interrupt is given.
//   3. Writes a native restart intent {waitMs: --drain} for the exact MainPID and
//      sends it SIGUSR1. The Gateway drains for at most --drain, exits, and
//      systemd starts it again. New work is rejected during the drain and the
//      Gateway waits for ALL active work, including background tasks that never
//      finish, so on V the drain usually runs to its bound: keep it short.
//   4. Waits for a new MainPID that answers the preflight RPC, then prints the
//      drain outcome from the journal and the companion units' state.
// There is no --force: a 0 ms forced drain is never the default and is not offered.
// Read-only on V except step 3.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  DEFAULTS, classifyActivity, decide, describeActivity, drainVerdict, formatMs,
  resolveRestartOptions, summarizeRestartJournal,
} from './v-restart-gateway-policy.mjs';

const REMOTE_SOURCE = fs.readFileSync(new URL('./v-restart-gateway-remote.mjs', import.meta.url), 'utf8');
const V_NODE = '/opt/node-v22.23.1/bin/node';
const SERVICE_USER = 'openclaw';
const COMPANIONS = ['nightshift-workboard.service', 'openclaw-rtc-h5.service'];

const sq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;
const ssh = (host, command, input, timeoutMs = 120_000) => execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', host, command], {
  input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs,
});

function remote(host, args) {
  const command = `sudo -n -u ${SERVICE_USER} env HOME=/home/${SERVICE_USER} ${V_NODE} --input-type=module - ${args.map(sq).join(' ')}`;
  let out;
  try {
    out = ssh(host, command, REMOTE_SOURCE);
  } catch (error) {
    out = String(error.stdout ?? '');
    if (!out.includes('RESULT ')) throw new Error(`remote ${args[0]} failed: ${String(error.stderr ?? error.message).trim().slice(0, 500)}`);
  }
  const line = out.split('\n').filter((l) => l.startsWith('RESULT ')).at(-1);
  if (!line) throw new Error(`remote ${args[0]} printed no RESULT line`);
  const value = JSON.parse(line.slice('RESULT '.length));
  if (!value.ok) throw new Error(`remote ${args[0]}: ${value.error}`);
  return value;
}

function journal(host, unit, sinceEpochSec) {
  try {
    return ssh(host, `sudo -n journalctl -u ${sq(unit)} --since @${Math.floor(sinceEpochSec)} --no-pager -o cat`, undefined, 60_000).split('\n');
  } catch {
    return [];
  }
}

const startEpoch = (status) => (status.startedAtEpoch > 0 ? status.startedAtEpoch : Date.now() / 1000 - 3600);

class UsageError extends Error {}

function parseArgs(argv) {
  const [command = 'status', ...rest] = argv;
  const raw = {};
  const map = {
    '--reason': 'reason', '--host': 'host', '--unit': 'unit', '--idle-wait': 'idleWaitMs', '--poll': 'pollMs',
    '--quiet-polls': 'quietPolls', '--drain': 'drainMs', '--ready-timeout': 'readyTimeoutMs',
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--allow-interrupt') raw.allowInterrupt = true;
    else if (a === '--dry-run') raw.dryRun = true;
    else if (a === '--force') raw.force = true;
    else if (map[a]) { if (rest[i + 1] === undefined) throw new UsageError(`${a} needs a value`); raw[map[a]] = rest[++i]; }
    else throw new UsageError(`unknown argument ${a}`);
  }
  return { command, raw };
}

function printStatus(status, label = 'Gateway') {
  if (!status.running) { console.log(`${label}: not running (ActiveState=${status.activeState}, MainPID=${status.pid})`); return; }
  console.log(`${label}: pid ${status.pid}, up since ${status.activeEnterTimestamp}, NRestarts=${status.nRestarts}`);
  console.log(describeActivity(status));
}

async function main() {
  const { command, raw } = parseArgs(process.argv.slice(2));
  if (command === 'status') {
    const host = raw.host ?? DEFAULTS.host;
    const unit = raw.unit ?? DEFAULTS.unit;
    const status = remote(host, ['status', unit]);
    printStatus(status);
    if (status.running) {
      const j = summarizeRestartJournal(journal(host, unit, startEpoch(status)));
      if (j.configRestartPending) {
        console.log(`WARNING: a config-reload restart (${j.configRestartDeferred.join(', ')}) is waiting inside the Gateway; ` +
          'after 300 s it will FORCE-restart with a 0 ms drain. Run `restart` now to supersede it with a drained restart.');
      }
    }
    return 0;
  }
  if (command !== 'restart') throw new UsageError('usage: v-restart-gateway.mjs status | restart --reason <text> [options]');

  let o;
  try { o = resolveRestartOptions(raw); } catch (error) { throw new UsageError(error.message); }
  console.log(`Restart ${o.unit} on ${o.host}: reason=${JSON.stringify(o.reason)}, idle wait ${formatMs(o.idleWaitMs)}, ` +
    `drain ${formatMs(o.drainMs)}${o.allowInterrupt ? ', interrupt allowed after the idle wait' : ''}${o.dryRun ? ', DRY RUN' : ''}`);

  const startedAt = Date.now();
  const samples = [];
  let decision;
  for (;;) {
    const status = remote(o.host, ['status', o.unit]);
    if (!status.running) throw new Error(`Gateway is not running (ActiveState=${status.activeState}); start it with systemctl, this script only restarts`);
    if (samples.length && status.pid !== samples[0].pid) throw new Error(`Gateway pid changed ${samples[0].pid} -> ${status.pid} while waiting; someone else restarted it`);
    samples.push(status);
    const a = classifyActivity(status);
    console.log(`[${new Date().toISOString()}] pid ${status.pid}: user-facing ${a.userFacingTotal}, background ${a.backgroundTotal}`);
    decision = decide({ samples, startedAt, now: Date.now(), idleWaitMs: o.idleWaitMs, quietPolls: o.quietPolls, allowInterrupt: o.allowInterrupt });
    if (decision.action !== 'wait') break;
    await sleep(o.pollMs);
  }
  const before = samples.at(-1);
  console.log(`Decision: ${decision.action} (${decision.why})`);
  printStatus(before, 'At decision');
  if (decision.action === 'refuse') {
    console.log('Nothing was restarted. Retry later, or pass --allow-interrupt to restart with a bounded drain anyway.');
    return 3;
  }
  if (o.dryRun) { console.log('Dry run: not restarting.'); return 0; }

  const triggerAt = Date.now() / 1000;
  const trigger = remote(o.host, ['trigger', o.unit, String(before.pid), String(o.drainMs), o.reason]);
  console.log(`Restart intent written (${trigger.writer}); ${trigger.signalled} sent to pid ${trigger.pid}; drain bounded at ${formatMs(trigger.waitMs)}.`);

  // Old process drains (<= drainMs) and exits; systemd restarts it after RestartSec.
  const readyBy = Date.now() + o.drainMs + o.readyTimeoutMs;
  let after = null;
  while (Date.now() < readyBy) {
    await sleep(5_000);
    try {
      const s = remote(o.host, ['status', o.unit]);
      if (s.running && s.pid !== before.pid) { after = s; break; }
    } catch { /* starting up or draining; the RPC is unavailable meanwhile */ }
  }
  const j = summarizeRestartJournal(journal(o.host, o.unit, triggerAt - 5));
  const verdict = drainVerdict(j);
  console.log(`Drain: ${verdict.text}${j.interruptedMainSessions ? `; ${j.interruptedMainSessions} main session(s) marked for restart recovery` : ''}`);
  for (const unit of COMPANIONS) {
    try { console.log(`${unit}: ${ssh(o.host, `systemctl is-active ${sq(unit)} || true`).trim()}`); } catch { /* optional unit */ }
  }
  if (!after) {
    console.log(`Gateway did not come back with a new pid answering RPC within ${formatMs(o.drainMs + o.readyTimeoutMs)}. Check: ssh ${o.host} systemctl status ${o.unit}`);
    return 4;
  }
  printStatus(after, 'Restarted');
  console.log('Restart accepted by the Gateway. Still verify a real reply (AGENTS.md: a green status is not acceptance).');
  return verdict.ok ? 0 : 4;
}

main().then((code) => process.exit(code), (error) => {
  console.error(`v-restart-gateway: ${error.message}`);
  process.exit(error instanceof UsageError ? 2 : 1);
});
