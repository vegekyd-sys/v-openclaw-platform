import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { planMoves, rewriteLoadPaths, diffTrees, parseSums, assertLease, REMOTE, VLAB_RUNTIME } from './vlab-channel-plugins-prep.mjs';

const hash = (b) => createHash('sha256').update(b).digest('hex');
const SRC = '/srv/vlab-production-mirror/labs/instances/db91-parity/capability-alignment-20260911/plugin-sources/home/openclaw/.openclaw';
const DT = 'dingtalk-real-ai-dingtalk-connector-aa54111b45__openclaw-generation__g-7ae9583359ddbec0';
const V_DIRS = {
  dingtalk: `/home/openclaw/.openclaw/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`,
  wecom: '/home/openclaw/.openclaw/extensions/wecom-openclaw-plugin',
};
// The shape of the shared VLab load paths on 2026-10-05.
const LOAD = [
  `${VLAB_RUNTIME}/production-worker`,
  `${SRC}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`,
  `${SRC}/extensions/landing-chat`,
  `${SRC}/extensions/wecom-openclaw-plugin`,
  `${VLAB_RUNTIME}/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu`,
];

test('plan moves the whole DingTalk npm project and the WeCom extension into runtime/ under V\'s names', () => {
  const [dt, wc] = planMoves(LOAD, V_DIRS);
  assert.deepEqual(dt, {
    id: 'dingtalk', done: false, vPlugin: V_DIRS.dingtalk,
    fromUnit: `${SRC}/npm/projects/${DT}`, toUnit: `${VLAB_RUNTIME}/npm/projects/${DT}`,
    fromPlugin: LOAD[1], plugin: `${VLAB_RUNTIME}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`,
  });
  assert.deepEqual(wc, {
    id: 'wecom', done: false, vPlugin: V_DIRS.wecom,
    fromUnit: `${SRC}/extensions/wecom-openclaw-plugin`, toUnit: `${VLAB_RUNTIME}/extensions/wecom-openclaw-plugin`,
    fromPlugin: LOAD[3], plugin: `${VLAB_RUNTIME}/extensions/wecom-openclaw-plugin`,
  });
});

test('a VLab project with another generation suffix still lands under V\'s project name', () => {
  const other = LOAD.map((p) => p.replace('g-7ae9583359ddbec0', 'g-0000000000000000'));
  const [dt] = planMoves(other, V_DIRS);
  assert.equal(dt.toUnit, `${VLAB_RUNTIME}/npm/projects/${DT}`);
  assert.match(dt.fromUnit, /g-0000000000000000$/);
});

test('already-moved plugins are reported done; missing or duplicate load paths are refused', () => {
  const moved = [`${VLAB_RUNTIME}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`, `${VLAB_RUNTIME}/extensions/wecom-openclaw-plugin`];
  assert(planMoves(moved, V_DIRS).every((m) => m.done));
  assert.throws(() => planMoves(LOAD.filter((p) => !p.includes('wecom')), V_DIRS), /wecom: expected exactly one load path, found 0/);
  assert.throws(() => planMoves([...LOAD, `${SRC}/x/extensions/wecom-openclaw-plugin`], V_DIRS), /found 2/);
  // Inside runtime/ under a different name: someone moved it by hand; do not guess.
  assert.throws(() => planMoves([LOAD[1], `${VLAB_RUNTIME}/extensions/other/extensions/wecom-openclaw-plugin`], V_DIRS), /inside runtime/);
});

test('rewriteLoadPaths changes only the named entries and keeps their position', () => {
  const cfg = { plugins: { load: { paths: [...LOAD] }, entries: { 'dingtalk-connector': { enabled: true } } }, gateway: { port: 24993 } };
  const plans = planMoves(LOAD, V_DIRS);
  const { config, changed } = rewriteLoadPaths(cfg, plans.map((m) => ({ from: m.fromPlugin, to: m.plugin })));
  assert.equal(changed, 2);
  assert.deepEqual(config.plugins.load.paths, [LOAD[0], plans[0].plugin, LOAD[2], plans[1].plugin, LOAD[4]]);
  assert.deepEqual({ ...config, plugins: { ...config.plugins, load: undefined } }, { ...cfg, plugins: { ...cfg.plugins, load: undefined } });
  assert.deepEqual(cfg.plugins.load.paths, LOAD, 'input untouched');
  assert.equal(rewriteLoadPaths({ gateway: {} }, [{ from: 'a', to: 'b' }]).changed, 0, 'config without load paths (Worker copy) is left alone');
  assert.throws(() => rewriteLoadPaths({ plugins: { load: { paths: ['a', 'b'] } } }, [{ from: 'a', to: 'b' }]), /already present/);
});

test('diffTrees compares like vlab-v-parity: residue ignored, three kinds of difference', () => {
  const v = parseSums(`${'a'.repeat(64)}  ./dist/index.js\n${'b'.repeat(64)}  ./package.json\n${'c'.repeat(64)}  ./dist/only-v.js\n`);
  const vlab = parseSums(`${'a'.repeat(64)}  ./dist/index.js\n${'d'.repeat(64)}  ./package.json\n${'e'.repeat(64)}  ./dist/only-vlab.js\n${'f'.repeat(64)}  ./dist/index.js.bak-x\n`);
  assert.deepEqual(diffTrees(v, vlab).map((d) => `${d.kind} ${d.path}`), ['only-on-v dist/only-v.js', 'only-on-vlab dist/only-vlab.js', 'differs package.json']);
});

test('apply needs the lease, no pending deployment and an aligned VLab; undo only the lease', () => {
  const ok = { lease: { owner: 'me' }, pending: null, current: { v: { aligned: true } } };
  assertLease(ok, 'me', { aligned: true });
  assert.throws(() => assertLease(ok, 'other', { aligned: true }), /lease/);
  assert.throws(() => assertLease({ ...ok, pending: { id: 'x' } }, 'me', { aligned: true }), /pending|Unresolved/);
  assert.throws(() => assertLease({ ...ok, current: { v: { aligned: false, aheadBy: 'r' } } }, 'me', { aligned: true }), /aligned/);
  assertLease({ ...ok, current: { v: { aligned: false } } }, 'me', { aligned: false });
});

// The remote half, for real, on a temp tree. systemctl is a fake that records calls.
function hostFixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'channel-prep-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin'), log = path.join(root, 'systemctl.log'), state = path.join(root, 'active');
  fs.mkdirSync(bin);
  fs.writeFileSync(state, 'active');
  fs.writeFileSync(path.join(bin, 'systemctl'), `#!/bin/sh
echo "$@" >> ${log}
case "$1" in stop) echo inactive > ${state};; start) echo active > ${state};; show) cat ${state};; esac
`, { mode: 0o755 });
  const runtime = path.join(root, 'runtime'), src = path.join(root, 'plugin-sources');
  const dtPlugin = path.join(src, 'npm/projects', DT, 'node_modules/@dingtalk-real-ai/dingtalk-connector');
  const wcPlugin = path.join(src, 'extensions/wecom-openclaw-plugin');
  for (const d of [path.join(runtime, 'npm/projects'), path.join(dtPlugin, 'dist'), path.join(wcPlugin, 'dist')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(dtPlugin, 'dist/index.js'), 'dingtalk-old');
  fs.writeFileSync(path.join(dtPlugin, 'dist/extra.js'), 'only on vlab');
  fs.writeFileSync(path.join(wcPlugin, 'dist/index.js'), 'wecom');
  const cfgFile = path.join(root, 'openclaw.json');
  const cfg = { plugins: { load: { paths: [dtPlugin, wcPlugin] } } };
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  const destDt = path.join(runtime, 'npm/projects', DT), destWc = path.join(runtime, 'extensions/wecom-openclaw-plugin');
  const destDtPlugin = path.join(destDt, 'node_modules/@dingtalk-real-ai/dingtalk-connector');
  const after = JSON.stringify({ plugins: { load: { paths: [destDtPlugin, destWc] } } }, null, 2) + '\n';
  const dir = path.join(root, 'backup');
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'files', '0'), 'dingtalk-v');
  fs.writeFileSync(path.join(dir, 'files', '2'), 'new on v');
  fs.writeFileSync(path.join(dir, 'files', 'config-0'), after);
  const plan = {
    unit: 'fake.service', runtime, lock: path.join(root, 'operation.lock'),
    moves: [{ id: 'dingtalk', fromUnit: path.join(src, 'npm/projects', DT), toUnit: destDt }, { id: 'wecom', fromUnit: wcPlugin, toUnit: destWc }],
    files: [
      { preMove: path.join(dtPlugin, 'dist/index.js'), dest: path.join(destDtPlugin, 'dist/index.js'), before: hash('dingtalk-old'), after: hash('dingtalk-v') },
      { preMove: path.join(dtPlugin, 'dist/extra.js'), dest: path.join(destDtPlugin, 'dist/extra.js'), before: hash('only on vlab'), after: null },
      { preMove: path.join(dtPlugin, 'dist/sub/new.js'), dest: path.join(destDtPlugin, 'dist/sub/new.js'), before: null, after: hash('new on v') },
    ],
    configs: [{ file: cfgFile, before: hash(fs.readFileSync(cfgFile)), after: hash(after) }],
  };
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan));
  const remote = (mode) => spawnSync(process.execPath, ['-', mode, dir], {
    input: REMOTE, encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  const snapshot = () => {
    const out = {};
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[path.relative(root, p)] = fs.readFileSync(p, 'utf8'); } };
    for (const d of ['runtime', 'plugin-sources']) walk(path.join(root, d));
    out.config = fs.readFileSync(cfgFile, 'utf8');
    return out;
  };
  return { root, dir, log, state, cfgFile, destDtPlugin, destWc, remote, snapshot, after };
}

test('remote apply stops, moves, installs V bytes, repoints config, starts; undo restores every byte', (t) => {
  const f = hostFixture(t);
  const before = f.snapshot();
  const check = f.remote('check');
  assert.equal(check.status, 0, check.stderr);
  assert(!fs.existsSync(f.log), 'check does not touch the service');
  const r = f.remote('apply');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readFileSync(f.log, 'utf8').trim().split('\n').filter((l) => !l.startsWith('show')), ['stop fake.service', 'start fake.service']);
  assert.equal(fs.readFileSync(path.join(f.destDtPlugin, 'dist/index.js'), 'utf8'), 'dingtalk-v');
  assert.equal(fs.readFileSync(path.join(f.destDtPlugin, 'dist/sub/new.js'), 'utf8'), 'new on v');
  assert(!fs.existsSync(path.join(f.destDtPlugin, 'dist/extra.js')));
  assert.equal(fs.readFileSync(path.join(f.destWc, 'dist/index.js'), 'utf8'), 'wecom');
  assert(!fs.existsSync(path.join(f.root, 'plugin-sources/extensions/wecom-openclaw-plugin')));
  assert.equal(fs.readFileSync(f.cfgFile, 'utf8'), f.after);
  assert.equal(fs.statSync(f.cfgFile).mode & 0o777, 0o600);
  assert(!fs.existsSync(path.join(f.root, 'operation.lock')), 'lock released');
  assert.notEqual(f.remote('apply').status, 0, 'a used backup cannot be applied twice');

  const u = f.remote('undo');
  assert.equal(u.status, 0, u.stderr);
  assert.deepEqual(f.snapshot(), before);
  assert(!fs.existsSync(path.join(f.root, 'runtime/extensions')), 'created parent removed again');
  assert.equal(fs.readFileSync(f.state, 'utf8').trim(), 'active');
});

test('remote check refuses moved targets and changed bytes; undo refuses to overwrite a foreign config edit', (t) => {
  const f = hostFixture(t);
  fs.mkdirSync(f.destWc, { recursive: true });
  assert.match(f.remote('check').stderr, /already exists/);
  fs.rmdirSync(f.destWc);
  fs.writeFileSync(path.join(f.root, 'plugin-sources/npm/projects', DT, 'node_modules/@dingtalk-real-ai/dingtalk-connector/dist/index.js'), 'edited');
  assert.match(f.remote('check').stderr, /changed since the plan/);
  fs.writeFileSync(path.join(f.root, 'plugin-sources/npm/projects', DT, 'node_modules/@dingtalk-real-ai/dingtalk-connector/dist/index.js'), 'dingtalk-old');
  assert.equal(f.remote('apply').status, 0);
  fs.writeFileSync(f.cfgFile, '{"someone":"else"}\n');
  const u = f.remote('undo');
  assert.notEqual(u.status, 0);
  assert.match(u.stderr, /refusing to overwrite/);
  assert.equal(fs.readFileSync(f.cfgFile, 'utf8'), '{"someone":"else"}\n');
});

test('undo of a backup that never applied anything does not restart the Gateway', (t) => {
  const f = hostFixture(t);
  const u = f.remote('undo');
  assert.equal(u.status, 0, u.stderr);
  assert.match(u.stdout, /nothing to undo/);
  assert(!fs.existsSync(f.log));
});
