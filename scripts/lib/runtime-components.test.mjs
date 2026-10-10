import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPONENTS, V_FEISHU, VLAB_RUNTIME, captureRuns, diffReleaseComponents, captureSourceForTarget, captureSuffixes, componentOfTarget,
  parityPairs, releaseNoteComponents, resolveSidecarDirs, resolveVDirs, vPathForTarget,
} from './runtime-components.mjs';
import { evaluateParity } from './parity.mjs';

const V_CORE = '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core';
const DT = 'dingtalk-real-ai-dingtalk-connector-aa54111b45__openclaw-generation__g-7ae9583359ddbec0';
const V_DT = `/home/openclaw/.openclaw/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`;
const FEISHU_T = 'npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu';
const listV = (glob) => (glob.includes('dingtalk') ? [V_DT] : []);
const vDirs = resolveVDirs(V_CORE, listV);

test('V directories: core from ExecStart, Worker beside it, Feishu fixed, DingTalk by glob, WeCom extension', () => {
  assert.deepEqual(vDirs, {
    core: V_CORE,
    worker: '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/worker',
    feishu: V_FEISHU,
    dingtalk: V_DT,
    wecom: '/home/openclaw/.openclaw/extensions/wecom-openclaw-plugin',
    handoff: '/opt/v-desktop-handoff',
    'secret-entry': '/opt/v-secret-entry',
    'browser-fill': '/opt/v-browser-fill',
  });
  assert.throws(() => resolveVDirs(V_CORE, () => []), /dingtalk: expected one directory on V/);
  assert.throws(() => resolveVDirs(V_CORE, () => [V_DT, V_DT.replace('g-7ae', 'g-000')]), /found 2/);
  assert.equal(resolveVDirs(V_CORE, listV, { worker: '/x/worker' }).worker, '/x/worker');
});

// The mapping promote-to-v.mjs had before the table, verbatim, for the
// existing components: the table must reproduce it exactly.
function legacyMapTarget(t, vCore, vFeishu, vNpm) {
  const vWorker = vCore.replace(/\/core$/, '/worker');
  if (t.startsWith('openclaw/')) return `${vCore}/${t.slice('openclaw/'.length)}`;
  if (t.startsWith('production-worker/')) return `${vWorker}/${t.slice('production-worker/'.length)}`;
  const m = /^npm\/projects\/openclaw-feishu-[^/]+\/node_modules\/@openclaw\/feishu\/(.+)$/.exec(t);
  if (m) return `${vFeishu}/${m[1]}`;
  const codex = /^npm\/projects\/(openclaw-codex-[^/]+)\/node_modules\/@openclaw\/codex\/(.+)$/.exec(t);
  if (codex) return `${vNpm}/${codex[1]}/node_modules/@openclaw/codex/${codex[2]}`;
  return null;
}

test('promote mapping: existing targets map exactly as before; new channel plugins map to V\'s own directories', () => {
  const vNpm = '/home/openclaw/.openclaw/npm/projects';
  for (const t of ['openclaw/dist/index.js', 'openclaw/dist/plugin-sdk/x.js', 'openclaw/package.json', 'production-worker/index.mjs',
    'production-worker/lib/a.mjs', `${FEISHU_T}/src/monitor.account-x.js`,
    'npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist/a.js',
    'worker/index.mjs', 'codex-code-mode-host/a.js', 'npm/projects/other/node_modules/x/a.js']) {
    assert.equal(vPathForTarget(t, vDirs, vNpm), legacyMapTarget(t, V_CORE, V_FEISHU, vNpm), t);
  }
  // VLab's DingTalk project may carry another generation suffix than V's.
  assert.equal(vPathForTarget(`npm/projects/${DT.replace('g-7ae', 'g-d10')}/node_modules/@dingtalk-real-ai/dingtalk-connector/dist/runtime-C81EKBS1.mjs`, vDirs),
    `${V_DT}/dist/runtime-C81EKBS1.mjs`);
  assert.equal(vPathForTarget('extensions/wecom-openclaw-plugin/dist/src/monitor.js', vDirs),
    '/home/openclaw/.openclaw/extensions/wecom-openclaw-plugin/dist/src/monitor.js');
  assert.equal(vPathForTarget('extensions/other-plugin/index.js', vDirs), null, 'only known extensions');
  assert.equal(componentOfTarget('extensions/wecom-openclaw-plugin/package.json').id, 'wecom');
  assert.equal(componentOfTarget('sidecar:handoff/plugin/index.js'), null, 'sidecars are never stage targets');
});

test('captures: the three existing runs are unchanged, DingTalk and WeCom are whole-directory captures', () => {
  const runs = captureRuns('rel', vDirs);
  assert.deepEqual(runs.map((r) => r.suffix), ['', '.worker', '.feishu', '.dingtalk', '.wecom']);
  // Exactly the arguments promote-to-v.mjs passed before.
  assert.deepEqual(runs.slice(0, 3).map((r) => [r.release, r.runtime, r.args, r.out]), [
    ['rel', `${V_CORE}/dist`, ['--base', 'npm:openclaw@2026.9.1', '--upstream', '2026.9.1', '--sourceCheckout', '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/source'], 'release/captured/rel'],
    ['rel.worker', vDirs.worker, ['--base', 'none', '--exclude', 'node_modules'], 'release/captured/rel.worker'],
    ['rel.feishu', V_FEISHU, ['--base', 'none', '--exclude', 'node_modules', '--upstream', '@openclaw/feishu 2026.9.1'], 'release/captured/rel.feishu'],
  ]);
  assert.equal(runs[3].runtime, V_DT);
  assert.deepEqual(runs[3].args.slice(0, 4), ['--base', 'none', '--exclude', 'node_modules']);
  assert.equal(runs[4].manifest, 'release/captured/rel.wecom/manifest.json');
  assert.deepEqual(captureSuffixes(), ['.worker', '.feishu', '.dingtalk', '.wecom']);
  assert.deepEqual(releaseNoteComponents(), [['core', ''], ['worker', '.worker'], ['feishu', '.feishu'], ['dingtalk', '.dingtalk'], ['wecom', '.wecom']]);
});

test('sync: a target\'s bytes come from the matching capture; core outside dist and uncaptured components have none', () => {
  assert.equal(captureSourceForTarget('r', 'openclaw/dist/a/b.js'), 'release/captured/r/dist/a/b.js');
  assert.equal(captureSourceForTarget('r', 'production-worker/index.mjs'), 'release/captured/r.worker/dist/index.mjs');
  assert.equal(captureSourceForTarget('r', `${FEISHU_T}/src/x.js`), 'release/captured/r.feishu/dist/src/x.js');
  assert.equal(captureSourceForTarget('r', `npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector/dist/a.mjs`), 'release/captured/r.dingtalk/dist/dist/a.mjs');
  assert.equal(captureSourceForTarget('r', 'extensions/wecom-openclaw-plugin/dist/src/channel.js'), 'release/captured/r.wecom/dist/dist/src/channel.js');
  assert.equal(captureSourceForTarget('r', 'openclaw/package.json'), null);
  assert.equal(captureSourceForTarget('r', 'npm/projects/openclaw-codex-1/node_modules/@openclaw/codex/a.js'), null);
  assert.equal(captureSourceForTarget('r', 'sidecar:handoff/plugin/index.js'), null);
});

const LEGACY = '/srv/vlab-production-mirror/labs/instances/db91-parity/capability-alignment-20260911/plugin-sources/home/openclaw/.openclaw';
const vlabGlob = (rel) => (rel.includes('feishu') ? [`${VLAB_RUNTIME}/${FEISHU_T}`] : []);

test('parity pairs: existing three unchanged; DingTalk/WeCom follow VLab\'s load paths, inside or outside runtime/', () => {
  const after = parityPairs({ vDirs, vlabGlob, vlabLoadPaths: [`${VLAB_RUNTIME}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`,
    `${VLAB_RUNTIME}/extensions/wecom-openclaw-plugin/`, `${LEGACY}/extensions/landing-chat`] });
  assert.deepEqual(after.slice(0, 3).map((p) => [p.prefix, p.v, p.vlab]), [
    ['openclaw', V_CORE, `${VLAB_RUNTIME}/openclaw`],
    ['production-worker', vDirs.worker, `${VLAB_RUNTIME}/production-worker`],
    [FEISHU_T, V_FEISHU, `${VLAB_RUNTIME}/${FEISHU_T}`],
  ]);
  const [dt, wc] = after.slice(3, 5);
  assert.deepEqual([dt.prefix, dt.v, dt.vlab, dt.note], [`npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`, V_DT,
    `${VLAB_RUNTIME}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`, undefined]);
  assert.deepEqual([wc.prefix, wc.vlab], ['extensions/wecom-openclaw-plugin', `${VLAB_RUNTIME}/extensions/wecom-openclaw-plugin`]);
  assert.deepEqual(after.slice(5).map((p) => [p.component, p.prefix, p.v, p.vlab, p.blocking]), [
    ['handoff', 'sidecar:handoff/plugin', '/opt/v-desktop-handoff/plugin', '/opt/vlab-v-desktop-handoff/plugin', false],
    ['handoff', 'sidecar:handoff/service', '/opt/v-desktop-handoff/service', '/opt/vlab-v-desktop-handoff/service', false],
    ['handoff', 'sidecar:handoff/desktop', '/opt/v-desktop-handoff/desktop', '/opt/vlab-v-desktop-handoff/desktop', false],
    ['secret-entry', 'sidecar:secret-entry', '/opt/v-secret-entry', '/opt/vlab-v-secret-entry', true],
    ['browser-fill', 'sidecar:browser-fill/plugin', '/opt/v-browser-fill/plugin', '/opt/vlab-v-browser-fill/plugin', true],
    // V Browser: not resolved here (no sidecarDirs), so absent on both sides.
    ['v-browser-plugin', 'sidecar:v-browser-plugin', null, null, false],
    ['v-browser-broker', 'sidecar:v-browser-broker', null, null, false],
    ['v-browser-gateway', 'sidecar:v-browser-gateway', null, null, false],
  ]);

  // Before the prep: compared where VLab loads them, under the target prefix they will have.
  const before = parityPairs({ vDirs, vlabGlob, vlabLoadPaths: [`${LEGACY}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`, `${LEGACY}/extensions/wecom-openclaw-plugin`] });
  assert.equal(before[3].vlab, `${LEGACY}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`);
  assert.equal(before[3].prefix, `npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`);
  assert.match(before[3].note, /outside runtime/);
  assert.equal(before[4].prefix, 'extensions/wecom-openclaw-plugin');

  assert.throws(() => parityPairs({ vDirs, vlabGlob, vlabLoadPaths: [] }), /dingtalk: expected one plugins.load.paths entry/);
  assert.throws(() => parityPairs({ vDirs, vlabGlob: () => [], vlabLoadPaths: [] }), /feishu: expected one/);
  assert.deepEqual(parityPairs({ vDirs, vlabGlob, only: ['core', 'worker'] }).map((p) => p.component), ['core', 'worker']);
});

// What the two hosts reported on 2026-10-06 (systemctl show -p ExecStart, plugins.load.paths).
const VLAB_PLUGINS = '/srv/vlab-production-mirror/labs/instances/db91-parity/capability-alignment-20260911/plugin-sources/opt/v-browser/releases';
const EXEC = {
  v: {
    'v-browser-broker.service': '{ path=/opt/node-v22.23.1/bin/node ; argv[]=/opt/node-v22.23.1/bin/node /srv/vlab-browser/releases/native-browser91-20260905/app/broker/main.mjs ; ignore_errors=no }',
    'openclaw-vlab-browser.service': '{ path=/opt/node-v22.23.1/bin/node ; argv[]=/opt/node-v22.23.1/bin/node --max-old-space-size=1536 /srv/vlab-browser/releases/native-browser91-20260905/runtime/openclaw/dist/index.js gateway --port 23793 ; ignore_errors=no }',
  },
  vlab: {
    'v-browser-broker.service': '{ path=/opt/node-v24.15.0/bin/node ; argv[]=/opt/node-v24.15.0/bin/node /srv/vlab-browser/app/broker/main.mjs ; ignore_errors=no }',
    'openclaw-vlab-browser.service': '{ path=/opt/vlab/node-v22.23.1-linux-x64/bin/node ; argv[]=/opt/vlab/node-v22.23.1-linux-x64/bin/node --max-old-space-size=1536 /srv/vlab-production-mirror/browser91/native-browser-20260905/runtime/openclaw/dist/index.js gateway --port 24793 ; ignore_errors=no }',
  },
};
const loadPaths = (vPlugin, vlabPlugin, vWorkerPlugin = vPlugin) => ({
  v: { main: ['/opt/v-desktop-handoff/plugin', `${vPlugin}/`], worker: ['/opt/v-desktop-handoff/plugin', vWorkerPlugin] },
  vlab: { main: [vlabPlugin], worker: [vlabPlugin] },
});

test('V Browser sidecars: plugin from main config load paths, Broker and Browser Gateway from ExecStart', () => {
  const execStart = { v: (u) => EXEC.v[u] ?? '', vlab: (u) => EXEC.vlab[u] ?? '' };
  const dirs = resolveSidecarDirs({ execStart,
    loadPaths: loadPaths('/opt/v-browser/releases/0.4.7-wake-lease-20261006/openclaw-plugin', `${VLAB_PLUGINS}/0.4.7/openclaw-plugin`) });
  assert.deepEqual(Object.keys(dirs), ['v-browser-plugin', 'v-browser-broker', 'v-browser-gateway'], 'fixed sidecars need no resolving');
  assert.deepEqual(dirs['v-browser-plugin'], { v: '/opt/v-browser/releases/0.4.7-wake-lease-20261006/openclaw-plugin', vlab: `${VLAB_PLUGINS}/0.4.7/openclaw-plugin`, notes: [] });
  assert.deepEqual([dirs['v-browser-broker'].v, dirs['v-browser-broker'].vlab],
    ['/srv/vlab-browser/releases/native-browser91-20260905/app/broker', '/srv/vlab-browser/app/broker']);
  assert.match(dirs['v-browser-broker'].notes[0], /V runs it with \/opt\/node-v22\.23\.1\/bin\/node, VLab with \/opt\/node-v24\.15\.0/);
  assert.deepEqual([dirs['v-browser-gateway'].v, dirs['v-browser-gateway'].vlab],
    ['/srv/vlab-browser/releases/native-browser91-20260905/runtime/openclaw/dist', '/srv/vlab-production-mirror/browser91/native-browser-20260905/runtime/openclaw/dist']);

  const pairs = parityPairs({ vDirs, vlabGlob, sidecarDirs: dirs, only: ['v-browser-plugin', 'v-browser-broker', 'v-browser-gateway'] });
  assert.deepEqual(pairs.map((p) => [p.prefix, p.exclude ?? null, p.blocking]), [
    ['sidecar:v-browser-plugin', null, false], ['sidecar:v-browser-broker', ['tests'], false], ['sidecar:v-browser-gateway', null, false]]);
  assert.match(pairs[1].note, /node-v24/);

  // Worker loading another copy than main: compared on main, said out loud.
  const split = resolveSidecarDirs({ execStart,
    loadPaths: loadPaths('/opt/v-browser/releases/0.4.7/openclaw-plugin', `${VLAB_PLUGINS}/0.4.7/openclaw-plugin`, '/opt/v-browser/releases/0.4.6/openclaw-plugin') });
  assert.equal(split['v-browser-plugin'].v, '/opt/v-browser/releases/0.4.7/openclaw-plugin');
  assert.match(split['v-browser-plugin'].notes[0], /v Worker config loads \/opt\/v-browser\/releases\/0\.4\.6/);

  // Not running on a host (no unit, plugin not loaded): absent there, not an error.
  const none = resolveSidecarDirs({ execStart: { v: () => '', vlab: () => '' }, loadPaths: { v: { main: [] }, vlab: { main: [] } } });
  assert.deepEqual(none['v-browser-broker'], { v: null, vlab: null, notes: [] });
  assert.throws(() => resolveSidecarDirs({ execStart, loadPaths: { v: { main: ['/opt/v-browser/releases/a/openclaw-plugin', '/opt/v-browser/releases/b/openclaw-plugin'] }, vlab: {} } }),
    /v-browser-plugin: v main config loads 2 copies/);
});

test('V Browser drift is advisory: reported, does not decide the state', () => {
  const pairs = pairsFor('v-browser-plugin');
  const r = evaluateParity({ pairs, trees: [{ v: T({ 'index.js': h('a'), 'core/session-actor-memory.js': h('b') }), vlab: T({ 'index.js': h('c') }) }] });
  assert.equal(r.state, 'ALIGNED');
  assert.deepEqual(r.findings.map((f) => [f.kind, f.target, f.advisory]), [
    ['only-on-v', 'sidecar:v-browser-plugin/core/session-actor-memory.js', true], ['differs', 'sidecar:v-browser-plugin/index.js', true]]);
});

const T = (o) => new Map(Object.entries(o));
const h = (c) => c.repeat(64);
const pairsFor = (...ids) => {
  const all = parityPairs({ vDirs, vlabGlob, vlabLoadPaths: [`${VLAB_RUNTIME}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`, `${VLAB_RUNTIME}/extensions/wecom-openclaw-plugin`] });
  return all.filter((p) => ids.includes(p.component));
};

test('parity state: aligned, pending release, drift in a new channel plugin, advisory and pending sidecars', () => {
  const pairs = pairsFor('core', 'wecom', 'handoff', 'secret-entry');
  const same = { v: T({ 'dist/a.js': h('a') }), vlab: T({ 'dist/a.js': h('a') }) };
  const absent = { v: null, vlab: null };
  const base = [same, same, same, same, same, absent];
  assert.equal(evaluateParity({ pairs, trees: base }).state, 'ALIGNED');

  // A WeCom file in a pending release: AHEAD; the same difference without the plan: DIVERGED.
  const wecomAhead = [same, { v: T({ 'dist/a.js': h('a') }), vlab: T({ 'dist/a.js': h('b') }) }, same, same, same, absent];
  const pending = new Map([['extensions/wecom-openclaw-plugin/dist/a.js', { plan: 'p.json', before: h('a'), after: h('b') }]]);
  assert.equal(evaluateParity({ pairs, trees: wecomAhead, pending }).state, 'AHEAD');
  const drift = evaluateParity({ pairs, trees: wecomAhead });
  assert.equal(drift.state, 'DIVERGED');
  assert.deepEqual(drift.findings.map((f) => [f.component, f.kind, f.target]), [['wecom', 'differs', 'extensions/wecom-openclaw-plugin/dist/a.js']]);

  // Handoff differs: reported, but advisory while blocking is false.
  const handoff = [same, same, { v: T({ 'index.js': h('a'), 'vendor/x.js': h('c') }), vlab: T({ 'index.js': h('a') }) }, same, same, absent];
  const adv = evaluateParity({ pairs, trees: handoff });
  assert.equal(adv.state, 'ALIGNED');
  assert.deepEqual(adv.findings.map((f) => [f.kind, f.target, f.advisory]), [['only-on-v', 'sidecar:handoff/plugin/vendor/x.js', true]]);

  // Secret entry installed on VLab only: drift, unless the pending release installs it.
  const secret = [...base.slice(0, 5), { v: null, vlab: T({ 'server.mjs': h('d') }) }];
  assert.equal(evaluateParity({ pairs, trees: secret }).state, 'DIVERGED');
  const p2 = evaluateParity({ pairs, trees: secret, pendingSidecars: new Set(['secret-entry']) });
  assert.equal(p2.state, 'AHEAD');
  assert.deepEqual(p2.findings, [{ target: 'sidecar:secret-entry/server.mjs', component: 'secret-entry', kind: 'pending', plan: 'sidecar:secret-entry' }]);

  // Residue never decides; a pending target that is identical blocks (as before).
  const res = [{ v: T({ 'dist/a.js': h('a'), 'dist/a.js.bak-1': h('e') }), vlab: T({ 'dist/a.js': h('a') }) }, same, same, same, same, absent];
  const r = evaluateParity({ pairs, trees: res });
  assert.equal(r.state, 'ALIGNED');
  assert.equal(r.residue.v.length, 1);
  assert.equal(evaluateParity({ pairs, trees: base, pending: new Map([['openclaw/dist/a.js', { before: h('a'), after: h('b') }]]) }).state, 'DIVERGED');
});

test('every captured component has a unique suffix and a stage target; sidecars have neither', () => {
  const suffixes = COMPONENTS.filter((c) => c.capture).map((c) => c.suffix);
  assert.equal(new Set(suffixes).size, suffixes.length);
  for (const c of COMPONENTS) {
    if (c.kind === 'sidecar') assert(!c.capture && !c.target && c.subdirs.length);
    else assert(c.target instanceof RegExp);
  }
});

test('release notes: a component missing from the previous release is a first appearance, not a change list', () => {
  const files = (o) => ({ files: o });
  const from = { core: files({ 'a.js': h('1') }), worker: files({ 'i.mjs': h('2') }), feishu: files({}), dingtalk: null, wecom: null };
  const to = { core: files({ 'a.js': h('3'), './b.js': h('4') }), worker: files({ 'i.mjs': h('2') }), feishu: files({}),
    dingtalk: files({ 'dist/x.mjs': h('5'), 'package.json': h('6') }), wecom: null };
  const { changes, firstSeen } = diffReleaseComponents(from, to, ['core', 'worker', 'feishu', 'dingtalk', 'wecom']);
  assert.deepEqual(changes, [
    { label: 'core', path: 'a.js', before: h('1'), after: h('3') },
    { label: 'core', path: 'b.js', before: null, after: h('4') },
  ]);
  assert.deepEqual(firstSeen, ['dingtalk']);
  const next = { ...to, dingtalk: files({ 'dist/x.mjs': h('7'), 'package.json': h('6') }) };
  assert.deepEqual(diffReleaseComponents(to, next, ['dingtalk']).changes, [{ label: 'dingtalk', path: 'dist/x.mjs', before: h('5'), after: h('7') }]);
});

test('captures of V channel plugins read as root (they live under /home/openclaw/.openclaw)', () => {
  const vDirs = { core: '/opt/x/core', worker: '/opt/w', feishu: '/opt/f', dingtalk: '/home/openclaw/.openclaw/npm/projects/d/node_modules/@dingtalk-real-ai/dingtalk-connector', wecom: '/home/openclaw/.openclaw/extensions/wecom-openclaw-plugin' };
  const runs = Object.fromEntries(captureRuns('r', vDirs).map((r) => [r.id, r.args]));
  assert(runs.dingtalk.includes('--sudo') && runs.wecom.includes('--sudo'));
  assert(!runs.core.includes('--sudo') && !runs.feishu.includes('--sudo'));
});
