import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RESTART_REQUIRED, WORKER_ROLL_ONLY, classifyRelease, classifyTarget, formatVerdict, loadManifest, normalizeManifest } from './restart-scope.mjs';
import { applyAdjustments, captureTarget, diffFiles, readCaptures, releaseChanges, splitCaptureName } from '../replay-restart-scope.mjs';

const manifest = normalizeManifest({
  schema: 1,
  gateway: ['openclaw/dist/index.js', 'openclaw/dist/shared-AAAA.js', 'production-worker/index.mjs', 'production-worker/worker-pool.mjs'],
  worker: ['openclaw/dist/shared-AAAA.js', 'openclaw/dist/bash-tools-BBBB.js', 'production-worker/worker.mjs', 'openclaw/dist/lazy-DDDD.js'],
  gatewayReachable: ['openclaw/dist/lazy-DDDD.js'],
});
const FEISHU = 'npm/projects/openclaw-feishu-x/node_modules/@openclaw/feishu/dist/monitor.account-W.js';
const CODEX = 'npm/projects/openclaw-codex-x/node_modules/@openclaw/codex/dist/run-attempt-D.js';

test('a file only Workers load can be rolled', () => {
  const r = classifyRelease(['openclaw/dist/bash-tools-BBBB.js', 'production-worker/worker.mjs'], manifest);
  assert.equal(r.verdict, WORKER_ROLL_ONLY);
  assert.deepEqual(r.files.map((f) => f.scope), ['worker', 'worker']);
  assert.deepEqual(r.triggers, []);
});

test('any file the Gateway loads forces a restart and is named as the trigger', () => {
  const r = classifyRelease(['openclaw/dist/bash-tools-BBBB.js', 'openclaw/dist/shared-AAAA.js'], manifest);
  assert.equal(r.verdict, RESTART_REQUIRED);
  assert.deepEqual(r.triggers.map((f) => [f.target, f.scope]), [['openclaw/dist/shared-AAAA.js', 'gateway']]);
  assert.match(r.triggers[0].reason, /Gateway and by Workers/u);
});

test('the Worker plugin Gateway side (index.mjs, worker-pool.mjs) restarts, worker.mjs rolls', () => {
  assert.equal(classifyTarget('production-worker/index.mjs', manifest).scope, 'gateway');
  assert.equal(classifyTarget('production-worker/worker-pool.mjs', manifest).restart, true);
  assert.equal(classifyTarget('production-worker/worker.mjs', manifest).restart, false);
});

test('a Worker file the Gateway could still import lazily restarts', () => {
  const f = classifyTarget('openclaw/dist/lazy-DDDD.js', manifest);
  assert.deepEqual([f.scope, f.restart], ['gateway-reachable', true]);
  assert.equal(classifyRelease(['openclaw/dist/lazy-DDDD.js'], manifest).verdict, RESTART_REQUIRED);
  // No declaration covers it: a later Gateway load would mix new and old modules.
  assert.equal(classifyRelease(['openclaw/dist/lazy-DDDD.js'], manifest, { workerBehavior: { 'openclaw/dist/lazy-DDDD.js': 'worker-only branch' } }).verdict, RESTART_REQUIRED);
});

test('unmeasured core files, channel and Codex plugins, unknown targets all restart', () => {
  assert.equal(classifyTarget('openclaw/dist/never-seen-CCCC.js', manifest).scope, 'unmeasured');
  assert.equal(classifyTarget(FEISHU, manifest).scope, 'gateway-plugin');
  assert.equal(classifyTarget(CODEX, manifest).scope, 'gateway-plugin');
  assert.equal(classifyTarget('extensions/wecom-openclaw-plugin/dist/src/monitor.js', manifest).scope, 'gateway-plugin');
  assert.equal(classifyTarget('somewhere/else.js', manifest).scope, 'unknown');
  for (const t of ['openclaw/dist/never-seen-CCCC.js', FEISHU, CODEX, 'somewhere/else.js']) {
    assert.equal(classifyRelease(['production-worker/worker.mjs', t], manifest).verdict, RESTART_REQUIRED, t);
  }
});

test('a shared chunk rolls only with an explicit, reasoned declaration for that target', () => {
  const targets = ['openclaw/dist/shared-AAAA.js'];
  const declared = classifyRelease(targets, manifest, { workerBehavior: { 'openclaw/dist/shared-AAAA.js': 'the patched branch runs only under VLAB_WORKER_CHILD' } });
  assert.equal(declared.verdict, WORKER_ROLL_ONLY);
  assert.equal(declared.files[0].scope, 'worker-behavior');
  assert.equal(classifyRelease(targets, manifest, { workerBehavior: { 'openclaw/dist/shared-AAAA.js': '  ' } }).verdict, RESTART_REQUIRED);
  // A declaration cannot make a Gateway plugin or an unmeasured file rollable.
  assert.equal(classifyRelease([FEISHU], manifest, { workerBehavior: { [FEISHU]: 'x' } }).verdict, RESTART_REQUIRED);
  assert.throws(() => classifyRelease(targets, manifest, { workerBehavior: { 'openclaw/dist/other.js': 'x' } }), /not in this release/u);
});

test('added files roll (nothing has them cached) unless they are plugin manifests; removed files follow their scope', () => {
  const added = classifyRelease([{ target: 'production-worker/worker.mjs' }, { target: 'production-worker/secret-egress-worker.mjs', change: 'added' }], manifest);
  assert.equal(added.verdict, WORKER_ROLL_ONLY);
  assert.deepEqual(added.files.map((f) => [f.scope, f.change]), [['added', 'added'], ['worker', 'modified']]);
  // Even a name the manifest saw in the Gateway: it did not exist before this release.
  assert.equal(classifyTarget('openclaw/dist/index.js', manifest, {}, 'added').scope, 'added');
  assert.equal(classifyTarget('production-worker/openclaw.plugin.json', manifest, {}, 'added').scope, 'plugin-manifest');
  assert.equal(classifyTarget(FEISHU, manifest, {}, 'added').scope, 'gateway-plugin');
  assert.equal(classifyTarget('production-worker/never-seen.mjs', manifest, {}, 'removed').scope, 'removed');
  assert.equal(classifyTarget('openclaw/dist/index.js', manifest, {}, 'removed').scope, 'gateway');
  assert.equal(classifyTarget('openclaw/dist/lazy-DDDD.js', manifest, {}, 'removed').scope, 'gateway-reachable');
  assert.equal(classifyTarget('openclaw/dist/bash-tools-BBBB.js', manifest, {}, 'removed').scope, 'worker');
  assert.match(formatVerdict(added), /roll {4}<- added production-worker\/secret-egress-worker\.mjs/u);
});

test('an empty release is not reported as rollable', () => {
  const r = classifyRelease([], manifest);
  assert.equal(r.verdict, RESTART_REQUIRED);
  assert.match(formatVerdict(r), /no files/u);
});

test('formatVerdict lists triggers first and says how a roll is applied', () => {
  assert.match(formatVerdict(classifyRelease(['production-worker/worker.mjs'], manifest)), /worker-roll-only[\s\S]*vlab\.workers\.roll/u);
  const text = formatVerdict(classifyRelease(['production-worker/worker.mjs', 'production-worker/index.mjs'], manifest));
  assert.match(text, /restart-required\n {2}restart <- production-worker\/index\.mjs/u);
});

test('manifest must be schema 1 with both file lists', () => {
  assert.throws(() => normalizeManifest({ schema: 2, gateway: ['a'], worker: ['b'] }), /schema 1/u);
  assert.throws(() => normalizeManifest({ schema: 1, gateway: [], worker: ['b'] }), /gateway/u);
});

test('the checked-in manifest loads and keeps the known split', () => {
  const m = loadManifest(new URL('../../release/load-manifest/v2026.9.1-db91.6.json', import.meta.url));
  assert.ok(m.gatewaySet.has('openclaw/dist/index.js'));
  assert.ok(m.gatewaySet.has('production-worker/index.mjs'));
  assert.ok(m.workerSet.has('production-worker/worker.mjs'));
  assert.ok(!m.gatewaySet.has('production-worker/worker.mjs'));
  for (const t of [...m.gateway, ...m.worker, ...m.gatewayReachable]) assert.match(t, /^(openclaw\/dist|production-worker)\//u, t);
  // The Gateway tools proxy put bash-tools in the Gateway: without it this chunk would roll.
  assert.ok(m.gatewaySet.has('openclaw/dist/bash-tools-DiAfkLAC.js'));
  // worker-prewarm-20261005: reachable, not loaded -> mixing hazard -> restart.
  assert.equal(classifyTarget('openclaw/dist/agent-command-DeP5kHlK.js', m).scope, 'gateway-reachable');
});

test('replay: capture names, targets and diffs', () => {
  assert.deepEqual(splitCaptureName('night-batch-20261010.worker'), { release: 'night-batch-20261010', component: 'worker' });
  assert.deepEqual(splitCaptureName('night-batch-20261010'), { release: 'night-batch-20261010', component: 'core' });
  assert.equal(captureTarget('core', './talk-D.js'), 'openclaw/dist/talk-D.js');
  assert.equal(captureTarget('worker', './worker.mjs'), 'production-worker/worker.mjs');
  assert.equal(classifyTarget(captureTarget('feishu', './dist/monitor.account-W.js'), manifest).component, 'feishu');
  assert.equal(classifyTarget(captureTarget('dingtalk', './dist/x.mjs'), manifest).component, 'dingtalk');
  const m = (o) => new Map(Object.entries(o).map(([k, [sha, kind]]) => [k, { sha, kind }]));
  assert.deepEqual(diffFiles(m({ a: ['1', 'modified'], b: ['2', 'modified'], c: ['3', 'added'], e: ['5', 'modified'] }),
    m({ a: ['1', 'modified'], b: ['9', 'modified'], d: ['4', 'added'], f: ['6', 'modified'] })), [
    { path: 'b', change: 'modified' }, { path: 'c', change: 'removed' }, { path: 'd', change: 'added' },
    { path: 'e', change: 'modified' }, { path: 'f', change: 'modified' },
  ]);
});

test('replay: adjacent captures per component, window, adjustments', () => {
  const root = mkdtempSync(join(tmpdir(), 'replay-'));
  try {
    const cap = (name, at, files) => {
      mkdirSync(join(root, 'release/captured', name), { recursive: true });
      writeFileSync(join(root, 'release/captured', name, 'manifest.json'), JSON.stringify({ capturedAt: at,
        files: Object.entries(files).map(([path, sha256]) => ({ path, sha256, kind: path.endsWith('.mjs') ? 'added' : 'modified' })) }));
    };
    cap('r0', '2026-10-01T00:00:00Z', { './a.js': '1' });
    cap('r0.worker', '2026-10-01T00:00:01Z', { './worker.mjs': '1' });
    cap('r1', '2026-10-02T00:00:00Z', { './a.js': '1' });
    cap('r1.worker', '2026-10-02T00:00:01Z', { './worker.mjs': '2' });
    cap('r2', '2026-10-03T00:00:00Z', { './a.js': '2', './b.js': '1' });
    cap('r2.worker', '2026-10-03T00:00:01Z', { './worker.mjs': '2', './extra.mjs': '1' });
    const releases = releaseChanges(readCaptures({ root }), { from: '2026-10-01T12:00:00Z', to: '2026-10-04T00:00:00Z' });
    const names = (r) => r.targets.map((t) => `${t.change}:${t.target}`);
    assert.deepEqual(releases.map((r) => [r.release, names(r)]), [
      ['r1', ['modified:production-worker/worker.mjs']],
      ['r2', ['modified:openclaw/dist/a.js', 'modified:openclaw/dist/b.js', 'added:production-worker/extra.mjs']],
    ]);
    const adjusted = applyAdjustments(releases, {
      add: { r1: [{ target: CODEX, source: 'changelog' }] },
      split: [{ release: 'r2', keep: ['production-worker/extra.mjs'], source: 's', rest: { release: 'r2-uncaptured', position: 'before', source: 'diff' } }],
    });
    assert.deepEqual(adjusted.map((r) => [r.release, names(r)]), [
      ['r1', [`modified:${CODEX}`, 'modified:production-worker/worker.mjs']],
      ['r2-uncaptured', ['modified:openclaw/dist/a.js', 'modified:openclaw/dist/b.js']],
      ['r2', ['added:production-worker/extra.mjs']],
    ]);
    assert.equal(classifyRelease(adjusted[2].targets, manifest).verdict, WORKER_ROLL_ONLY);
    assert.throws(() => applyAdjustments(releases, { split: [{ release: 'r2', keep: ['nope'], rest: { release: 'x' } }] }), /not in its diff/u);
    assert.throws(() => applyAdjustments(releases, { add: { nope: [] } }), /unknown release/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
