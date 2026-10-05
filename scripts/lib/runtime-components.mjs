// The components production V runs that the release pipeline knows about, in
// one place. Every tool that maps, captures, compares or describes V's code
// reads this table:
//
//   scripts/promote-to-v.mjs      VLab stage target -> path on V; what to capture; sentinel manifests
//   scripts/vlab-v-parity.mjs     which directory pairs must be byte-identical
//   scripts/sync-vlab-from-v.mjs  which capture in git holds a target's bytes
//   scripts/release-notes.mjs     which captures make up one V release
//   tests/vlab-static.sh          which capture suffixes belong to a release
//
// Adding a component (a new channel plugin, say) is one entry here plus its
// first capture; nothing else should need a hard-coded path.
//
// Kinds:
//   runtime  code under VLab's runtime/ directory. VLab ships it with
//            stage/deploy/rollback; promote-to-v copies the same bytes to V.
//   sidecar  a service or plugin installed outside both runtimes by its own
//            install script from a git commit (scripts/install-desktop-host.sh,
//            scripts/install-secret-entry-host.sh). Not stageable, not
//            captured (the commit is the record); parity compares it so that
//            "ALIGNED" also means both hosts run the same sidecar bytes.
//
// A component with `blocking: false` is compared and reported but does not
// decide the parity state. Use it while a component is being brought into
// line for the first time, then flip it.

import assert from 'node:assert/strict';

export const V_HOME = '/home/openclaw/.openclaw';
export const V_FEISHU = '/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu';
export const VLAB_RUNTIME = '/srv/vlab-production-mirror/labs/instances/db91-parity/runtime';

const DINGTALK_PLUGIN = 'node_modules/@dingtalk-real-ai/dingtalk-connector';

export const COMPONENTS = [
  {
    id: 'core', kind: 'runtime', label: 'core', suffix: '', blocking: true,
    // Stage target -> [prefix, rest]. Capture and sync cover dist/ only.
    target: /^(openclaw)\/(.+)$/,
    v: { from: 'core' },
    vlab: { fixed: 'openclaw' },
    capture: { sub: 'dist', base: 'npm:openclaw@2026.9.1', upstream: '2026.9.1', sourceCheckout: true },
    syncPrefix: 'openclaw/dist/',
  },
  {
    id: 'worker', kind: 'runtime', label: 'worker', suffix: '.worker', blocking: true,
    target: /^(production-worker)\/(.+)$/,
    v: { from: 'worker' },
    vlab: { fixed: 'production-worker' },
    capture: { base: 'none' },
    syncPrefix: 'production-worker/',
  },
  {
    id: 'feishu', kind: 'runtime', label: 'feishu', suffix: '.feishu', blocking: true,
    target: /^(npm\/projects\/openclaw-feishu-[^/]+\/node_modules\/@openclaw\/feishu)\/(.+)$/,
    // V runs Feishu from an old experiment directory, VLab from its npm project.
    v: { fixed: V_FEISHU },
    vlab: { glob: 'npm/projects/openclaw-feishu-*/node_modules/@openclaw/feishu' },
    capture: { base: 'none', upstream: '@openclaw/feishu 2026.9.1' },
  },
  {
    // The npm-managed Codex plugin: promotable, not captured, not compared
    // (V and VLab run different generations of it on purpose).
    id: 'codex', kind: 'runtime', label: 'codex', suffix: null, blocking: false,
    target: /^(npm\/projects\/(openclaw-codex-[^/]+)\/node_modules\/@openclaw\/codex)\/(.+)$/,
    v: { npmSameProject: true },
    vlab: null,
    capture: null,
  },
  {
    // npm project name carries a generation hash that changes on reinstall:
    // matched by glob on V, and by VLab's own plugins.load.paths on VLab.
    id: 'dingtalk', kind: 'runtime', label: 'dingtalk', suffix: '.dingtalk', blocking: true,
    target: /^(npm\/projects\/dingtalk-real-ai-dingtalk-connector-[^/]+\/node_modules\/@dingtalk-real-ai\/dingtalk-connector)\/(.+)$/,
    v: { glob: `${V_HOME}/npm/projects/dingtalk-real-ai-dingtalk-connector-*/${DINGTALK_PLUGIN}` },
    vlab: { loadPath: /\/npm\/projects\/(dingtalk-real-ai-dingtalk-connector-[^/]+)\/node_modules\/@dingtalk-real-ai\/dingtalk-connector\/?$/,
      canonical: (vDir) => `npm/projects/${/\/npm\/projects\/([^/]+)\//.exec(vDir)[1]}/${DINGTALK_PLUGIN}` },
    capture: { base: 'none', upstream: '@dingtalk-real-ai/dingtalk-connector (version in package.json)' },
  },
  {
    id: 'wecom', kind: 'runtime', label: 'wecom', suffix: '.wecom', blocking: true,
    target: /^(extensions\/wecom-openclaw-plugin)\/(.+)$/,
    // V also has an unused npm project of an older WeCom plugin (2026.5.7);
    // the one it loads is the extension.
    v: { fixed: `${V_HOME}/extensions/wecom-openclaw-plugin` },
    vlab: { loadPath: /\/extensions\/wecom-openclaw-plugin\/?$/, canonical: () => 'extensions/wecom-openclaw-plugin' },
    capture: { base: 'none', upstream: '@wecom/wecom-openclaw-plugin (version in package.json)' },
  },
  {
    // 2026-10-05: V was installed from a newer commit than VLab (V has
    // service/build-viewer.mjs and service/vendor/novnc-1.3.0, VLab does not).
    // Advisory until the multi-channel release reinstalls VLab's copy from the
    // commit V runs; then set blocking: true.
    id: 'handoff', kind: 'sidecar', label: 'desktop handoff', blocking: false,
    v: { fixed: '/opt/v-desktop-handoff' },
    vlab: { fixed: '/opt/vlab-v-desktop-handoff' },
    // Only what install-desktop-host.sh installs; *.bak-* siblings are not.
    subdirs: ['plugin', 'service', 'desktop'],
  },
  {
    id: 'secret-entry', kind: 'sidecar', label: 'secret entry', blocking: true,
    v: { fixed: '/opt/v-secret-entry' },
    vlab: { fixed: '/opt/vlab-v-secret-entry' },
    subdirs: [''],
  },
];

export const byId = (id) => {
  const c = COMPONENTS.find((x) => x.id === id);
  assert(c, `unknown component ${id}`);
  return c;
};
export const captured = () => COMPONENTS.filter((c) => c.capture);
export const captureSuffixes = () => captured().map((c) => c.suffix).filter(Boolean);

// V-side directory of every runtime component, from the core directory V's
// unit runs and a `list(glob)` that returns the matching paths on V.
export function resolveVDirs(vCore, list, overrides = {}) {
  const out = {};
  for (const c of COMPONENTS) {
    if (overrides[c.id]) { out[c.id] = overrides[c.id]; continue; }
    if (c.v.from === 'core') out[c.id] = vCore;
    else if (c.v.from === 'worker') out[c.id] = vCore.replace(/\/core$/, '/worker');
    else if (c.v.fixed) out[c.id] = c.v.fixed;
    else if (c.v.glob) {
      const hits = list(c.v.glob);
      assert.equal(hits.length, 1, `${c.id}: expected one directory on V for ${c.v.glob}, found ${hits.length}${hits.length ? ': ' + hits.join(', ') : ''}`);
      out[c.id] = hits[0];
    }
  }
  return out;
}

// promote-to-v: where a VLab stage target lives on V. null = no known place.
export function vPathForTarget(target, vDirs, vNpmProjects = `${V_HOME}/npm/projects`) {
  for (const c of COMPONENTS) {
    if (c.kind !== 'runtime') continue;
    const m = c.target.exec(target);
    if (!m) continue;
    const rest = m.at(-1);
    if (c.v.npmSameProject) return `${vNpmProjects}/${m[2]}/node_modules/@openclaw/codex/${rest}`;
    assert(vDirs[c.id], `${c.id}: V directory not resolved`);
    return `${vDirs[c.id]}/${rest}`;
  }
  return null;
}

export const componentOfTarget = (target) => COMPONENTS.find((c) => c.kind === 'runtime' && c.target.test(target)) ?? null;

// promote-to-v / sync: the capture-production-runtime.mjs runs that record
// one V release (<name><suffix> for every captured component).
export function captureRuns(name, vDirs) {
  return captured().map((c) => {
    const dir = vDirs[c.id];
    assert(dir, `${c.id}: V directory not resolved`);
    const args = ['--base', c.capture.base];
    if (c.capture.base === 'none') args.push('--exclude', 'node_modules');
    if (c.capture.upstream) args.push('--upstream', c.capture.upstream);
    if (c.capture.sourceCheckout) args.push('--sourceCheckout', `${dir.replace(/\/core$/, '')}/source`);
    return { id: c.id, suffix: c.suffix, release: name + c.suffix, runtime: c.capture.sub ? `${dir}/${c.capture.sub}` : dir,
      args, out: `release/captured/${name}${c.suffix}`, manifest: `release/captured/${name}${c.suffix}/manifest.json` };
  });
}

// sync-vlab-from-v: the file in git that holds a target's V bytes.
export function captureSourceForTarget(name, target) {
  for (const c of captured()) {
    if (c.syncPrefix) {
      if (target.startsWith(c.syncPrefix)) return `release/captured/${name}${c.suffix}/dist/${target.slice(c.syncPrefix.length)}`;
      continue;
    }
    const m = c.target.exec(target);
    if (m) return `release/captured/${name}${c.suffix}/dist/${m.at(-1)}`;
  }
  return null;
}

// vlab-v-parity: the directory pairs to compare. `vlab` is resolved by the
// caller: { glob(rel) -> [abs], loadPaths: [abs] } for VLab's runtime and the
// load paths of its Gateway config.
export function parityPairs({ vDirs, vlabRuntime = VLAB_RUNTIME, vlabGlob, vlabLoadPaths = [], only } = {}) {
  const pairs = [];
  for (const c of COMPONENTS) {
    if (!c.vlab || (only && !only.includes(c.id))) continue;
    if (c.kind === 'sidecar') {
      for (const sub of c.subdirs) {
        pairs.push({ component: c.id, kind: c.kind, blocking: c.blocking, optional: true,
          prefix: `sidecar:${c.id}${sub ? '/' + sub : ''}`,
          v: sub ? `${c.v.fixed}/${sub}` : c.v.fixed, vlab: sub ? `${c.vlab.fixed}/${sub}` : c.vlab.fixed });
      }
      continue;
    }
    const v = vDirs[c.id];
    assert(v, `${c.id}: V directory not resolved`);
    if (c.vlab.fixed) {
      pairs.push({ component: c.id, kind: c.kind, blocking: c.blocking, prefix: c.vlab.fixed, v, vlab: `${vlabRuntime}/${c.vlab.fixed}` });
    } else if (c.vlab.glob) {
      const hits = vlabGlob(c.vlab.glob);
      assert.equal(hits.length, 1, `${c.id}: expected one ${c.vlab.glob} under ${vlabRuntime}, found ${hits.length}`);
      pairs.push({ component: c.id, kind: c.kind, blocking: c.blocking, prefix: hits[0].slice(vlabRuntime.length + 1), v, vlab: hits[0] });
    } else if (c.vlab.loadPath) {
      // What the shared Gateway actually loads. Several DingTalk projects can
      // sit in npm/projects (an old generation is still there); only the
      // load path decides.
      const hits = vlabLoadPaths.map((p) => p.replace(/\/$/, '')).filter((p) => c.vlab.loadPath.test(p));
      assert.equal(hits.length, 1, `${c.id}: expected one plugins.load.paths entry in the VLab config, found ${hits.length}`);
      const inRuntime = hits[0].startsWith(`${vlabRuntime}/`);
      pairs.push({ component: c.id, kind: c.kind, blocking: c.blocking, v, vlab: hits[0],
        prefix: inRuntime ? hits[0].slice(vlabRuntime.length + 1) : c.vlab.canonical(v),
        ...(inRuntime ? {} : { note: `VLab loads ${c.id} from outside runtime/ (${hits[0]}); bytes are compared, but it cannot be staged until scripts/vlab-channel-plugins-prep.mjs has run` }) });
    }
  }
  return pairs;
}

// release-notes: [label, suffix] of every captured component.
export const releaseNoteComponents = () => captured().map((c) => [c.label, c.suffix]);
