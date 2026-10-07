import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FLAG, TARGETS, baseExecStart, cmdlineHasFlag, dropinBase, dropinContent, dropinName, dropinPath, supportsFlag, withFlag,
} from './node-async-context-frame.mjs';

const own = dropinPath(TARGETS.v.unit);
const node = '/opt/node-v22.23.1/bin/node';
const core = '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core';
const vArgv = [node, '--inspect=127.0.0.1:9229', '--max-old-space-size=12288', `${core}/dist/index.js`, 'gateway', '--port', '22793'];
// shape of `systemctl cat openclaw-gateway.service` on V: unit file, then drop-ins in order
const vCat = (extra = '') => `# /etc/systemd/system/openclaw-gateway.service
[Unit]
Description=OpenClaw Gateway
[Service]
ExecStart=/usr/local/bin/node /home/openclaw/old/dist/index.js gateway

# /etc/systemd/system/openclaw-gateway.service.d/desktop-display.conf
[Service]
Environment=DISPLAY=:99

# /etc/systemd/system/openclaw-gateway.service.d/zzzz-db91-release-v1.conf
[Service]
ExecStart=
ExecStart=${vArgv.join(' ')}
ExecStartPre=
ExecStartPre=-+/bin/bash x
${extra}`;

test('paths and units', () => {
  assert.equal(own, '/etc/systemd/system/openclaw-gateway.service.d/zzzzz-node-async-context-frame.conf');
  assert.equal(TARGETS.vlab.unit, 'openclaw-vlab-production-mirror-v8.service');
  // sorts after V's release drop-in, so its ExecStart wins
  assert(path.basename(own) > 'zzzz-db91-release-v1.conf');
});

test('base ExecStart is the last one before this drop-in', () => {
  assert.deepEqual(baseExecStart(vCat(), own), vArgv);
  const ours = `\n# ${own}\n${dropinContent(vArgv).split('\n').slice(2).join('\n')}`;
  assert.deepEqual(baseExecStart(vCat(ours), own), vArgv, 'our own drop-in is ignored');
  const later = vCat().replace(core, '/opt/new-release/core');
  assert.equal(baseExecStart(later, own)[3], '/opt/new-release/core/dist/index.js');
  assert.throws(() => baseExecStart('# /x.service\n[Service]\nExecStart=/bin/bash -c "x"\n', own), /quoting|node/u);
  assert.throws(() => baseExecStart('# /x.service\n[Service]\nExecStart=/usr/bin/python3 x\n', own), /node/u);
});

test('drop-in re-declares ExecStart with the flag right after node and records its base', () => {
  const c = dropinContent(vArgv);
  assert.match(c, /^\[Service\]\nExecStart=\nExecStart=\/opt\/node-v22\.23\.1\/bin\/node --experimental-async-context-frame --inspect=127\.0\.0\.1:9229 --max-old-space-size=12288 \S+ gateway --port 22793\n$/mu);
  assert(!/NODE_OPTIONS|Environment=/u.test(c), 'no NODE_OPTIONS: V has Node 18 at /usr/bin/node');
  assert.deepEqual(dropinBase(c), vArgv);
  assert.deepEqual(withFlag(withFlag(vArgv)), withFlag(vArgv));
  assert.throws(() => dropinContent(withFlag(vArgv)), /already has the flag/u);
});

test('flag exists from Node 22.7', () => {
  assert.equal(supportsFlag('v22.23.1'), true);
  assert.equal(supportsFlag('v22.7.0'), true);
  assert.equal(supportsFlag('v22.6.0'), false);
  assert.equal(supportsFlag('v18.19.1'), false);
  assert.equal(supportsFlag('v24.1.0'), true);
});

test('cmdline check', () => {
  assert.equal(cmdlineHasFlag(`${node}\0${FLAG}\0x.js\0`), true);
  assert.equal(cmdlineHasFlag(`${node}\0x.js\0${FLAG}-other\0`), false);
});

test('a child forked with the parent execArgv minus --inspect keeps the flag (worker pool rule)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acf-'));
  try {
    fs.writeFileSync(path.join(dir, 'child.cjs'), 'process.send(process.execArgv)\n');
    // same filter as the Worker pool's resolveWorkerExecArgv
    fs.writeFileSync(path.join(dir, 'parent.cjs'), `const execArgv = process.execArgv.filter((a) => !/^--inspect(?:-brk)?(?:=|$)/.test(a));
require('node:child_process').fork(__dirname + '/child.cjs', [], { execArgv }).on('message', (m) => console.log(JSON.stringify(m)));\n`);
    const r = spawnSync(process.execPath, [FLAG, path.join(dir, 'parent.cjs')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), [FLAG]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// V's openclaw-gateway.service.d on 2026-10-07 (names only); the last four re-declare ExecStart
const vDropins = ['15-openclaw-home.conf', '25-v-self-maintenance.conf', '30-node-heap.conf', '35-node-inspector.conf', '40-v-browser.conf',
  '45-v-browser-cdp-timeout.conf', '60-claude-code-no-background-tasks.conf', '70-v-storage-governance.conf', '90-openclaw91.conf',
  '92-feishu-parity.conf', '93-cron-shared-management-20260910.conf', '94-verifier-resource-group-20260910.conf', '95-xiaohe-vds.conf',
  '97-v-experience-dingtalk-card.conf', '99-v91-version.conf', 'desktop-display.conf', 'secret-entry.conf', 'session-hotset-v0.2.0.conf',
  'vcodex-streaming-v0.1.4.conf', 'worker-steer-v0.2.3.conf', 'zz-db91-c5.conf', 'zz-steer91-prestart.conf', 'zzz-worker-affinity-enabled.conf',
  'zzzz-db91-release-v1.conf', 'zzzzz-db91-process-global-writer-v2.conf', 'zzzzzz-db91-memory-fts-v3.conf', 'zzzzzz-db91-memory-fts-v3.conf.staged',
  'zzzzzzz-db91-writer-transaction-scope-v5.conf', 'zzzzzzzz-db91-state-db-fastpath-v6.conf'];

test('the drop-in sorts after every other drop-in, so its ExecStart is the one systemd keeps', () => {
  const name = dropinName(vDropins);
  assert.equal(name, 'zzzzzzzzz-node-async-context-frame.conf');
  const order = [...vDropins.filter((n) => n.endsWith('.conf')), name].sort();
  assert.equal(order.at(-1), name);
  assert.equal(dropinPath(TARGETS.v.unit, vDropins), `/etc/systemd/system/openclaw-gateway.service.d/${name}`);
  // an installed one (including the old fixed name) is found by its suffix, not renamed
  assert.equal(dropinPath(TARGETS.v.unit, [...vDropins, 'zzzz-node-async-context-frame.conf']), '/etc/systemd/system/openclaw-gateway.service.d/zzzz-node-async-context-frame.conf');
});
