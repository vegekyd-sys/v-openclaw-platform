#!/usr/bin/env node
// Run the Gateway (and, through its environment, every Worker and Node child it forks) with
// --experimental-async-context-frame.
//
// Why: on Node 22, AsyncLocalStorage is built on async_hooks, so every promise pays
// promiseInitHook and every async hop pays _propagate. The vcodex pre-turn profile on a private
// VLab Gateway (#258, 2026-10-06) spent 1.0 s of a first turn in async_hooks _propagate; with the
// flag it was 0, CLI->turn/started fell 6.2 s -> 3.3 s on the first turn and 0.1-0.4 s on warm
// ones. Node 24 uses AsyncContextFrame by default; on 22.7+ it is this flag.
//
// How: one systemd drop-in that re-declares the Gateway's current ExecStart with the flag right after
// the node binary. Workers are forked by the pool with resolveWorkerExecArgv(process.execArgv), which
// keeps every flag but --inspect and the old-space limit, so they get it too. Not NODE_OPTIONS: V's
// /usr/bin/node is Node 18, which refuses to start with this flag in NODE_OPTIONS, and every shell
// command an agent runs would inherit it. The drop-in records the ExecStart it was derived from; if a
// later release changes the unit's ExecStart, plan/--verify report it stale instead of silently
// starting the old command. It never restarts anything: the flag applies at the next Gateway start,
// and restarting V is Tianyi's decision.
//
//   node scripts/node-async-context-frame.mjs --target vlab|v            # plan (read-only)
//   node scripts/node-async-context-frame.mjs --target vlab|v --apply    # install drop-in, daemon-reload
//   node scripts/node-async-context-frame.mjs --target vlab|v --undo     # remove it, daemon-reload
//   node scripts/node-async-context-frame.mjs --target vlab|v --verify   # after a restart: the flag is live

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const FLAG = '--experimental-async-context-frame';
export const TARGETS = {
  v: { host: 'VM-8-2-ubuntu', unit: 'openclaw-gateway.service' },
  vlab: { host: 'VM-0-4-ubuntu', unit: 'openclaw-vlab-production-mirror-v8.service' },
};
export const DROPIN_NAME = 'zzzz-node-async-context-frame.conf';
export const dropinPath = (unit) => `/etc/systemd/system/${unit}.d/${DROPIN_NAME}`;
const BASE_MARK = '# base ExecStart: ';

// The ExecStart the unit has without this drop-in, from `systemctl cat` (unit file, then drop-ins in
// order, each introduced by a `# /path` line). `ExecStart=` resets, a value sets it.
export function baseExecStart(systemctlCat, ownPath) {
  let current = null, inOwn = false;
  for (const line of systemctlCat.split('\n')) {
    if (/^# \//u.test(line)) { inOwn = line.slice(2).trim() === ownPath; continue; }
    if (inOwn) continue;
    const m = /^ExecStart=(.*)$/u.exec(line.trim());
    if (m) current = m[1].trim() || null;
  }
  assert(current, 'unit has no ExecStart');
  assert(!/["'\\]/u.test(current), 'ExecStart has quoting; refusing to re-declare it');
  const argv = current.replace(/^[-@:+!]+/u, '').split(/\s+/u);
  assert(/\/node$/u.test(argv[0]), `ExecStart does not start with node: ${argv[0]}`);
  return argv;
}

// /proc/<pid>/cmdline is NUL-separated
export const cmdlineHasFlag = (cmdline) => cmdline.split('\0').includes(FLAG);

export const withFlag = (argv) => (argv.includes(FLAG) ? argv : [argv[0], FLAG, ...argv.slice(1)]);

export function dropinContent(baseArgv) {
  assert(!baseArgv.includes(FLAG), 'base ExecStart already has the flag');
  return `# scripts/node-async-context-frame.mjs: AsyncLocalStorage without async_hooks (Node 22.7+)
${BASE_MARK}${baseArgv.join(' ')}
[Service]
ExecStart=
ExecStart=${withFlag(baseArgv).join(' ')}
`;
}

export const dropinBase = (content) => content.split('\n').find((l) => l.startsWith(BASE_MARK))?.slice(BASE_MARK.length).split(' ');

export function supportsFlag(version) {
  const m = /^v(\d+)\.(\d+)\./u.exec(version.trim());
  assert(m, `unexpected node version: ${version}`);
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > 22 || (major === 22 && minor >= 7);
}

function show(unit, prop) {
  return execFileSync('systemctl', ['show', unit, '-p', prop], { encoding: 'utf8' }).trim();
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const target = TARGETS[arg('--target')];
  assert(target, `--target must be one of ${Object.keys(TARGETS).join(', ')}`);
  assert.equal(os.hostname(), target.host, `--target ${arg('--target')} runs on ${target.host}`);
  const file = dropinPath(target.unit);
  const installed = fs.existsSync(file);
  const mode = ['--apply', '--undo', '--verify'].find((m) => argv.includes(m)) ?? 'plan';
  const base = baseExecStart(execFileSync('systemctl', ['cat', target.unit], { encoding: 'utf8' }), file);
  const version = execFileSync(base[0], ['--version'], { encoding: 'utf8' }).trim();
  // installed but derived from another ExecStart: a later release changed the unit under it
  const stale = installed && dropinBase(fs.readFileSync(file, 'utf8'))?.join(' ') !== base.join(' ');
  const plan = { unit: target.unit, dropin: file, installed, stale, base: base.join(' '), node: base[0], version, supported: supportsFlag(version) };

  if (mode === 'plan') {
    console.log(JSON.stringify({ ...plan, content: base.includes(FLAG) ? null : dropinContent(base), restart: 'not done here; the flag applies at the next Gateway start' }, null, 1));
    return;
  }
  if (mode === '--verify') {
    const pid = Number(show(target.unit, 'MainPID').replace(/^MainPID=/u, ''));
    assert(pid > 0, `${target.unit} is not running`);
    let children = '';
    try { children = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }); } catch {} // exit 1: no children
    const rows = [pid, ...children.split('\n').filter(Boolean).map(Number)].map((p) => {
      let comm = '', flag = false;
      try { comm = fs.readFileSync(`/proc/${p}/comm`, 'utf8').trim(); flag = cmdlineHasFlag(fs.readFileSync(`/proc/${p}/cmdline`, 'latin1')); } catch {}
      return { pid: p, comm, flag };
    });
    // Worker pool processes are node children forked with the Gateway's execArgv
    console.log(JSON.stringify({ ...plan, processes: rows }, null, 1));
    assert(!stale, `${file} was derived from another ExecStart; --undo and --apply again`);
    assert(rows[0].flag, 'Gateway main process does not run with the flag; was it restarted after --apply?');
    return;
  }
  assert.equal(process.getuid(), 0, 'root required');
  if (mode === '--apply') {
    assert(plan.supported, `${version} does not have ${FLAG}`);
    assert(!installed, `${file} already exists`);
    assert(!base.includes(FLAG), 'the unit already runs with the flag');
    fs.mkdirSync(`/etc/systemd/system/${target.unit}.d`, { recursive: true, mode: 0o755 });
    fs.writeFileSync(file, dropinContent(base), { flag: 'wx', mode: 0o644 });
  } else {
    assert(installed, `${file} is not installed`);
    const recorded = dropinBase(fs.readFileSync(file, 'utf8'));
    assert(recorded, `${file} has no recorded base; not removing a file this script did not write`);
    assert.equal(fs.readFileSync(file, 'utf8'), dropinContent(recorded), `${file} was changed by hand; not removing it`);
    fs.unlinkSync(file);
  }
  execFileSync('systemctl', ['daemon-reload']);
  const effective = show(target.unit, 'ExecStart');
  assert.equal(effective.includes(` ${FLAG} `), mode === '--apply', `unit ExecStart after ${mode}: ${effective.slice(0, 300)}`);
  console.log(JSON.stringify({ ...plan, done: mode, restarted: false, next: mode === '--apply' ? `restart ${target.unit} when allowed, then --verify` : `restart ${target.unit} when allowed` }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
