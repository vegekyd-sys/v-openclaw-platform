import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPONENTS, V_FEISHU, VLAB_RUNTIME, captureRuns, diffReleaseComponents, captureSourceForTarget, captureSuffixes, componentOfTarget,
  parityPairs, presentCaptureRuns, releaseNoteComponents, resolveSidecarDirs, resolveVDirs, vPathForTarget,
} from './runtime-components.mjs';
import { evaluateParity } from './parity.mjs';

const V_CORE = '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core';
const DT = 'dingtalk-real-ai-dingtalk-connector-aa54111b45__openclaw-generation__g-7ae9583359ddbec0';
const V_DT = `/home/openclaw/.openclaw/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`;
const FEISHU_T = 'npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu';
const CODEX_T = 'npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex';
const V_CODEX = `/home/openclaw/.openclaw/${CODEX_T}`;
const listV = (glob) => (glob.includes('dingtalk') ? [V_DT] : glob.includes('openclaw-codex') ? [V_CODEX] : []);
const vDirs = resolveVDirs(V_CORE, listV);

test('V directories: core from ExecStart, Worker beside it, Feishu fixed, Codex and DingTalk by glob, WeCom extension', () => {
  assert.deepEqual(vDirs, {
    core: V_CORE,
    worker: '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/worker',
    feishu: V_FEISHU,
    codex: V_CODEX,
    dingtalk: V_DT,
    wecom: '/home/openclaw/.openclaw/extensions/wecom-openclaw-plugin',
    'session-relay': '/home/openclaw/.openclaw/extensions/v-session-relay',
    ai: `${V_CORE}/node_modules/@openclaw/ai`,
    handoff: '/opt/v-desktop-handoff',
    'secret-entry': '/opt/v-secret-entry',
    'browser-fill': '/opt/v-browser-fill',
  });
  assert.throws(() => resolveVDirs(V_CORE, (g) => (g.includes('codex') ? [V_CODEX] : [])), /dingtalk: expected one directory on V/);
  // A second Codex generation on V (a reinstall) has to be noticed, not guessed.
  assert.throws(() => resolveVDirs(V_CORE, (g) => (g.includes('codex') ? [V_CODEX, V_CODEX.replace('g-b42', 'g-000')] : [V_DT])), /codex: expected one directory on V.*found 2/);
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
  // The session relay plugin: a whole directory beside WeCom in V's extensions.
  assert.equal(vPathForTarget('extensions/v-session-relay/core/transports/bridge.js', vDirs),
    '/home/openclaw/.openclaw/extensions/v-session-relay/core/transports/bridge.js');
  assert.equal(componentOfTarget('extensions/v-session-relay/openclaw.plugin.json').id, 'session-relay');
  assert.equal(vPathForTarget('extensions/v-session-relay-old/index.js', vDirs), null, 'the directory name is exact');
  assert.equal(componentOfTarget('sidecar:handoff/plugin/index.js'), null, 'sidecars are never stage targets');
});

test('captures: the three existing runs are unchanged, Codex, DingTalk, WeCom and the session relay are whole-directory captures', () => {
  const runs = captureRuns('rel', vDirs);
  assert.deepEqual(runs.map((r) => r.suffix), ['', '.worker', '.feishu', '.codex', '.dingtalk', '.wecom', '.session-relay', '.ai']);
  // Exactly the arguments promote-to-v.mjs passed before.
  assert.deepEqual(runs.slice(0, 3).map((r) => [r.release, r.runtime, r.args, r.out]), [
    ['rel', `${V_CORE}/dist`, ['--base', 'npm:openclaw@2026.9.1', '--upstream', '2026.9.1', '--sourceCheckout', '/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/source'], 'release/captured/rel'],
    ['rel.worker', vDirs.worker, ['--base', 'none', '--exclude', 'node_modules'], 'release/captured/rel.worker'],
    ['rel.feishu', V_FEISHU, ['--base', 'none', '--exclude', 'node_modules', '--upstream', '@openclaw/feishu 2026.9.1'], 'release/captured/rel.feishu'],
  ]);
  assert.deepEqual([runs[3].release, runs[3].runtime, runs[3].args, runs[3].out], ['rel.codex', V_CODEX,
    ['--base', 'none', '--exclude', 'node_modules', '--upstream', '@openclaw/codex 2026.9.1', '--sudo'], 'release/captured/rel.codex']);
  assert.equal(runs[4].runtime, V_DT);
  assert.deepEqual(runs[4].args.slice(0, 4), ['--base', 'none', '--exclude', 'node_modules']);
  assert.equal(runs[5].manifest, 'release/captured/rel.wecom/manifest.json');
  assert.deepEqual([runs[6].release, runs[6].runtime, runs[6].args, runs[6].out, runs[6].optional], ['rel.session-relay',
    '/home/openclaw/.openclaw/extensions/v-session-relay', ['--base', 'none', '--exclude', 'node_modules', '--sudo'], 'release/captured/rel.session-relay', true]);
  assert.deepEqual(runs.filter((r) => r.optional).map((r) => r.id), ['session-relay'], 'only the session relay may be missing on V');
  assert.deepEqual(captureSuffixes(), ['.worker', '.feishu', '.codex', '.dingtalk', '.wecom', '.session-relay', '.ai']);
  assert.deepEqual(releaseNoteComponents(), [['core', ''], ['worker', '.worker'], ['feishu', '.feishu'], ['codex', '.codex'], ['dingtalk', '.dingtalk'], ['wecom', '.wecom'], ['session-relay', '.session-relay'], ['@openclaw/ai', '.ai']]);
});

test('captures: a promotion before the session relay release skips its capture; afterwards it is captured', () => {
  const runs = captureRuns('rel', vDirs);
  const asked = [];
  const before = presentCaptureRuns(runs, (dir) => { asked.push(dir); return false; });
  assert.deepEqual(before.map((r) => r.suffix), ['', '.worker', '.feishu', '.codex', '.dingtalk', '.wecom', '.ai']);
  assert.deepEqual(asked, ['/home/openclaw/.openclaw/extensions/v-session-relay'], 'only optional components are looked up on V');
  assert.deepEqual(presentCaptureRuns(runs, () => true), runs);
  // A required component that is missing still fails loudly in the capture itself, never silently.
  assert.equal(presentCaptureRuns(runs, () => false).find((r) => r.id === 'wecom').runtime, vDirs.wecom);
});

test('sync: a target\'s bytes come from the matching capture; core outside dist and uncaptured components have none', () => {
  assert.equal(captureSourceForTarget('r', 'openclaw/dist/a/b.js'), 'release/captured/r/dist/a/b.js');
  assert.equal(captureSourceForTarget('r', 'production-worker/index.mjs'), 'release/captured/r.worker/dist/index.mjs');
  assert.equal(captureSourceForTarget('r', `${FEISHU_T}/src/x.js`), 'release/captured/r.feishu/dist/src/x.js');
  assert.equal(captureSourceForTarget('r', `npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector/dist/a.mjs`), 'release/captured/r.dingtalk/dist/dist/a.mjs');
  assert.equal(captureSourceForTarget('r', 'extensions/wecom-openclaw-plugin/dist/src/channel.js'), 'release/captured/r.wecom/dist/dist/src/channel.js');
  assert.equal(captureSourceForTarget('r', 'openclaw/package.json'), null);
  assert.equal(captureSourceForTarget('r', `${CODEX_T}/dist/run-attempt-D1hJO4fX.js`), 'release/captured/r.codex/dist/dist/run-attempt-D1hJO4fX.js');
  assert.equal(captureSourceForTarget('r', 'sidecar:handoff/plugin/index.js'), null);
  assert.equal(captureSourceForTarget('r', 'extensions/v-session-relay/core/engine.js'), 'release/captured/r.session-relay/dist/core/engine.js');
});

const LEGACY = '/srv/vlab-production-mirror/labs/instances/db91-parity/capability-alignment-20260911/plugin-sources/home/openclaw/.openclaw';
const VLAB_CODEX_GW = '/srv/vlab-production-mirror/labs/instances/db91-parity/state/npm/projects/openclaw-codex-8902d781d4/node_modules/@openclaw/codex';
const vlabGlob = (rel) => (rel.includes('feishu') ? [`${VLAB_RUNTIME}/${FEISHU_T}`]
  : rel.includes('openclaw-codex') ? [`${VLAB_RUNTIME}/../state/npm/projects/openclaw-codex-8902d781d4/node_modules/@openclaw/codex`] : []);

test('parity pairs: existing three unchanged; DingTalk/WeCom follow VLab\'s load paths, inside or outside runtime/', () => {
  const after = parityPairs({ vDirs, vlabGlob, vlabLoadPaths: [`${VLAB_RUNTIME}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`,
    `${VLAB_RUNTIME}/extensions/wecom-openclaw-plugin/`, `${LEGACY}/extensions/landing-chat`] });
  assert.deepEqual(after.slice(0, 3).map((p) => [p.prefix, p.v, p.vlab]), [
    ['openclaw', V_CORE, `${VLAB_RUNTIME}/openclaw`],
    ['production-worker', vDirs.worker, `${VLAB_RUNTIME}/production-worker`],
    [FEISHU_T, V_FEISHU, `${VLAB_RUNTIME}/${FEISHU_T}`],
  ]);
  // Codex: V's project name on VLab's runtime/ (not a glob: an older generation sits beside it),
  // then the copy VLab's Gateway loads, under the same prefix.
  assert.deepEqual(after.slice(3, 5).map((p) => [p.component, p.prefix, p.v, p.vlab, p.copy ?? null, p.blocking]), [
    ['codex', CODEX_T, V_CODEX, `${VLAB_RUNTIME}/${CODEX_T}`, null, true],
    ['codex', CODEX_T, V_CODEX, VLAB_CODEX_GW, 'vlab-gateway', true],
  ]);
  assert.match(after[4].note, /Gateway loads codex from .*state\/npm/);
  const noGatewayCopy = parityPairs({ vDirs, vlabGlob: (rel) => (rel.includes('openclaw-codex') ? [] : vlabGlob(rel)), only: ['codex'] });
  assert.equal(noGatewayCopy.length, 1);
  assert.match(noGatewayCopy[0].note, /loads codex from runtime/);
  assert.throws(() => parityPairs({ vDirs, vlabGlob: (rel) => (rel.includes('openclaw-codex') ? ['/a', '/b'] : vlabGlob(rel)), only: ['codex'] }), /codex: expected at most one/);
  const [dt, wc] = after.slice(5, 7);
  assert.deepEqual([dt.prefix, dt.v, dt.vlab, dt.note], [`npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`, V_DT,
    `${VLAB_RUNTIME}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`, undefined]);
  assert.deepEqual([wc.prefix, wc.vlab], ['extensions/wecom-openclaw-plugin', `${VLAB_RUNTIME}/extensions/wecom-openclaw-plugin`]);
  // The session relay: same place on both, may be absent on both (optional), still blocking.
  assert.deepEqual([after[7].component, after[7].prefix, after[7].v, after[7].vlab, after[7].blocking, after[7].optional],
    ['session-relay', 'extensions/v-session-relay', '/home/openclaw/.openclaw/extensions/v-session-relay', `${VLAB_RUNTIME}/extensions/v-session-relay`, true, true]);
  assert.equal(after.slice(0, 7).some((p) => p.optional), false, 'every other runtime directory must exist');
  assert.deepEqual(after.slice(8).map((p) => [p.component, p.prefix, p.v, p.vlab, p.blocking]), [
    ['ai', 'openclaw/node_modules/@openclaw/ai', `${V_CORE}/node_modules/@openclaw/ai`, `${VLAB_RUNTIME}/openclaw/node_modules/@openclaw/ai`, false],
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
  assert.equal(before[5].vlab, `${LEGACY}/npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`);
  assert.equal(before[5].prefix, `npm/projects/${DT}/node_modules/@dingtalk-real-ai/dingtalk-connector`);
  assert.match(before[5].note, /outside runtime/);
  assert.equal(before[6].prefix, 'extensions/wecom-openclaw-plugin');

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
  const vDirs = { ai: '/opt/x/core/node_modules/@openclaw/ai', core: '/opt/x/core', worker: '/opt/w', feishu: '/opt/f', codex: V_CODEX, dingtalk: '/home/openclaw/.openclaw/npm/projects/d/node_modules/@dingtalk-real-ai/dingtalk-connector', wecom: '/home/openclaw/.openclaw/extensions/wecom-openclaw-plugin',
    'session-relay': '/home/openclaw/.openclaw/extensions/v-session-relay' };
  const runs = Object.fromEntries(captureRuns('r', vDirs).map((r) => [r.id, r.args]));
  assert(runs.codex.includes('--sudo') && runs.dingtalk.includes('--sudo') && runs.wecom.includes('--sudo') && runs['session-relay'].includes('--sudo'));
  assert(!runs.core.includes('--sudo') && !runs.feishu.includes('--sudo'));
});

test('Codex: a release reaches both VLab copies or parity says which one it missed', () => {
  const pairs = pairsFor('codex');
  const f = 'dist/run-attempt-D1hJO4fX.js';
  const target = `${CODEX_T}/${f}`;
  const tree = (sha) => T({ [f]: h(sha), 'package.json': h('p') });
  const pending = new Map([[target, { plan: 'p.json', before: h('a'), after: h('b') }]]);
  // Both VLab copies have the release, V the before-bytes: AHEAD.
  assert.equal(evaluateParity({ pairs, trees: [{ v: tree('a'), vlab: tree('b') }, { v: tree('a'), vlab: tree('b') }], pending }).state, 'AHEAD');
  // Staged through the release channel only (runtime/), Gateway copy forgotten.
  const skipped = evaluateParity({ pairs, trees: [{ v: tree('a'), vlab: tree('b') }, { v: tree('a'), vlab: tree('a') }], pending });
  assert.equal(skipped.state, 'DIVERGED');
  assert.deepEqual(skipped.findings.map((x) => [x.kind, x.copy ?? null]), [['pending', null], ['pending-not-deployed-on-vlab', 'vlab-gateway']]);
  // After promotion: V and runtime/ agree, the Gateway copy lags.
  const lag = evaluateParity({ pairs, trees: [{ v: tree('b'), vlab: tree('b') }, { v: tree('b'), vlab: tree('a') }] });
  assert.equal(lag.state, 'DIVERGED');
  assert.deepEqual(lag.findings.map((x) => [x.kind, x.target, x.copy]), [['differs', target, 'vlab-gateway']]);
  // V's residue is counted once, not per VLab copy.
  const res = T({ [f]: h('a'), [`${f}.bak-1`]: h('e') });
  assert.equal(evaluateParity({ pairs, trees: [{ v: res, vlab: tree('a') }, { v: res, vlab: tree('a') }] }).residue.v.length, 1);
});

test('session relay parity: absent on both hosts is aligned; on VLab only is drift unless the release is pending; on both is aligned', () => {
  const pairs = pairsFor('core', 'session-relay');
  assert.deepEqual(pairs.map((p) => [p.component, p.optional ?? false]), [['core', false], ['session-relay', true]]);
  const core = { v: T({ 'dist/a.js': h('a') }), vlab: T({ 'dist/a.js': h('a') }) };
  // Before the release: neither host has the directory (hashTree returns null for an optional pair).
  const none = evaluateParity({ pairs, trees: [core, { v: null, vlab: null }] });
  assert.deepEqual([none.state, none.findings], ['ALIGNED', []]);
  // Staged and deployed on VLab, not yet on V.
  const plugin = T({ 'index.js': h('1'), 'core/engine.js': h('2') });
  const staged = [core, { v: null, vlab: plugin }];
  const drift = evaluateParity({ pairs, trees: staged });
  assert.equal(drift.state, 'DIVERGED');
  assert.deepEqual(drift.findings.map((f) => [f.kind, f.target]), [['only-on-vlab', 'extensions/v-session-relay/core/engine.js'], ['only-on-vlab', 'extensions/v-session-relay/index.js']]);
  const pending = new Map([
    ['extensions/v-session-relay/index.js', { plan: 'lab/inter-session.plan.json', before: null, after: h('1') }],
    ['extensions/v-session-relay/core/engine.js', { plan: 'lab/inter-session.plan.json', before: null, after: h('2') }],
  ]);
  assert.equal(evaluateParity({ pairs, trees: staged, pending }).state, 'AHEAD');
  // Promoted: same bytes on both.
  assert.equal(evaluateParity({ pairs, trees: [core, { v: plugin, vlab: plugin }] }).state, 'ALIGNED');
  // Removed from V by hand (or by promote --undo) while VLab keeps it: drift, so a rollback that forgot VLab shows.
  assert.equal(evaluateParity({ pairs, trees: [core, { v: null, vlab: plugin }] }).state, 'DIVERGED');
});
