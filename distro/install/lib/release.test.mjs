// Offline tests for the installer's file work: overlay, whole-package replace,
// package verification, env split, rollback rule. No npm, no systemd.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { applyOverlay, replacePackage, verifyCapture, verifyPackage, linkNpmProjects, overlayStatePlugins, installRelease } from './release.mjs';
import { splitEnv, schemaCompatible, fingerprintLoss, toolShim, openclawShim } from './vctl.mjs';
import { execFileSync } from 'node:child_process';

const sha = (s) => createHash('sha256').update(s).digest('hex');

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v-distro-release-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function put(root, rel, data) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), data);
}

/** A capture dir (manifest + dist/) and an "installed npm package" with dist/. */
function overlayFixture(t, { baseOf = 'v1' } = {}) {
  const root = tmp(t);
  const capture = path.join(root, 'capture');
  const pkg = path.join(root, 'node_modules/openclaw');
  put(pkg, 'package.json', JSON.stringify({ version: '2026.9.1' }));
  put(pkg, 'dist/a.js', baseOf);
  put(pkg, 'dist/untouched.js', 'same');
  put(capture, 'dist/a.js', 'v2');
  put(capture, 'dist/new/b.js', 'added');
  put(capture, 'manifest.json', JSON.stringify({
    release: 'r', upstream: '2026.9.1',
    files: [
      { path: './a.js', sha256: sha('v2'), kind: 'modified', baseSha256: sha('v1') },
      { path: './new/b.js', sha256: sha('added'), kind: 'added' },
    ],
  }));
  return { capture, dist: path.join(pkg, 'dist') };
}

test('overlay replaces exactly the captured base bytes, adds new files, and is idempotent', (t) => {
  const { capture, dist } = overlayFixture(t);
  assert.deepEqual(applyOverlay(capture, dist, '2026.9.1'), { capture: 'r', modified: 1, added: 1, alreadyApplied: 0 });
  assert.equal(fs.readFileSync(path.join(dist, 'a.js'), 'utf8'), 'v2');
  assert.equal(fs.readFileSync(path.join(dist, 'new/b.js'), 'utf8'), 'added');
  assert.equal(fs.readFileSync(path.join(dist, 'untouched.js'), 'utf8'), 'same');
  assert.deepEqual(applyOverlay(capture, dist, '2026.9.1'), { capture: 'r', modified: 0, added: 0, alreadyApplied: 2 });
  assert.deepEqual(verifyCapture(capture, dist), []);
});

test('overlay fails closed on different upstream bytes and writes nothing', (t) => {
  const { capture, dist } = overlayFixture(t, { baseOf: 'someone else patched this' });
  assert.throws(() => applyOverlay(capture, dist), /upstream bytes differ from the capture's base: a.js/);
  assert.ok(!fs.existsSync(path.join(dist, 'new/b.js')), 'no partial overlay');
});

test('overlay refuses a different upstream version and a corrupted capture', (t) => {
  const { capture, dist } = overlayFixture(t);
  assert.throws(() => applyOverlay(capture, dist, '2026.9.2'), /base package is 2026.9.1, capture needs 2026.9.2/);
  fs.writeFileSync(path.join(capture, 'dist/a.js'), 'v3');
  assert.throws(() => applyOverlay(capture, dist), /capture bytes differ from its manifest: a.js/);
});

test('whole-package replace leaves exactly the captured files and keeps node_modules', (t) => {
  const root = tmp(t);
  const capture = path.join(root, 'capture');
  const target = path.join(root, 'plugins/feishu/node_modules/@openclaw/feishu');
  put(capture, 'dist/package.json', '{"name":"@openclaw/feishu"}');
  put(capture, 'dist/dist/x.js', 'patched');
  put(capture, 'manifest.json', JSON.stringify({ release: 'r.feishu', files: [
    { path: './package.json', sha256: sha('{"name":"@openclaw/feishu"}'), kind: 'added' },
    { path: './dist/x.js', sha256: sha('patched'), kind: 'added' },
  ] }));
  put(target, 'package.json', '{"name":"@openclaw/feishu","version":"npm"}');
  put(target, 'dist/x.js', 'upstream');
  put(target, 'dist/only-upstream.js', 'gone after replace');
  put(target, 'node_modules/dep/index.js', 'kept');
  const r = replacePackage(capture, target);
  assert.equal(r.written, 2);
  assert.deepEqual(r.removed, ['dist/only-upstream.js']);
  assert.equal(fs.readFileSync(path.join(target, 'node_modules/dep/index.js'), 'utf8'), 'kept');
  assert.deepEqual(verifyCapture(capture, target, { exact: true }), []);
  put(target, 'dist/late.js', 'x');
  assert.deepEqual(verifyCapture(capture, target, { exact: true }), ['extra:dist/late.js']);
});

test('package verification catches changed, missing, extra and escaping files; installed parts are allowed', (t) => {
  const pkg = tmp(t);
  put(pkg, 'install/install.sh', 'echo');
  const manifest = { schema: 'v-distro/1', version: '1', files: [{ path: 'install/install.sh', sha256: sha('echo') }] };
  put(pkg, 'manifest.json', JSON.stringify(manifest));
  assert.equal(verifyPackage(pkg).version, '1');
  put(pkg, 'core/node_modules/openclaw/package.json', '{}');
  put(pkg, '.installed.json', '{}');
  assert.equal(verifyPackage(pkg).version, '1');
  put(pkg, 'runtime/stray.js', 'x');
  assert.throws(() => verifyPackage(pkg), /not in the package manifest: runtime\/stray.js/);
  fs.rmSync(path.join(pkg, 'runtime'), { recursive: true });
  put(pkg, 'manifest.json', JSON.stringify({ ...manifest, files: [{ path: '../etc/passwd', sha256: 'x' }] }));
  assert.throws(() => verifyPackage(pkg), /unsafe path/);
  put(pkg, 'manifest.json', JSON.stringify({ ...manifest, files: [{ path: 'install/missing.sh', sha256: 'x' }] }));
  assert.throws(() => verifyPackage(pkg), /package file missing/);
});

test('env split: keys ending in _KEY/_SECRET/_TOKEN/_PASSWORD go to the secrets file; empty values dropped', () => {
  const { install, secrets } = splitEnv([
    '# comment', 'V_OWNER_NAME=王总', 'export TZ=Asia/Shanghai', 'DEEPSEEK_API_KEY=sk-x', 'FEISHU_APP_ID=cli_x',
    'FEISHU_APP_SECRET=s', 'V_OWNER_FEISHU_OPEN_ID=', 'OPENCLAW_GATEWAY_TOKEN=t',
  ].join('\n'));
  assert.deepEqual(install, ['V_OWNER_NAME=王总', 'TZ=Asia/Shanghai', 'FEISHU_APP_ID=cli_x']);
  assert.deepEqual(secrets, ['DEEPSEEK_API_KEY=sk-x', 'FEISHU_APP_SECRET=s', 'OPENCLAW_GATEWAY_TOKEN=t']);
  assert.throws(() => splitEnv('lower=1'), /bad variable name/);
  assert.throws(() => splitEnv('NOEQUALS'), /not KEY=VALUE/);
});

test('rollback may swap code alone only when both releases have the same OpenClaw schema', () => {
  assert.equal(schemaCompatible({ state: 15, agent: 19 }, { state: 15, agent: 19 }), true);
  assert.equal(schemaCompatible({ state: 15, agent: 19 }, { state: 16, agent: 19 }), false);
  assert.equal(schemaCompatible(null, { state: 15, agent: 19 }), false);
});

test('core imports of "../../npm/projects/<p>/node_modules/<pkg>/" get V\'s symlink to the installed package; unknown packages fail', (t) => {
  const rel = tmp(t);
  const code = 'import "../../npm/projects/openclaw-feishu-abc__g-1/node_modules/@openclaw/feishu/dist/m.js";\n';
  put(rel, 'runtime/core/dist/v.mjs', code);
  put(rel, 'runtime/core/manifest.json', JSON.stringify({ release: 'r', files: [{ path: './v.mjs', sha256: sha(code), kind: 'added' }] }));
  put(rel, 'core/node_modules/openclaw/dist/v.mjs', code);
  put(rel, 'plugins/feishu/node_modules/@openclaw/feishu/dist/m.js', 'export {};');
  const components = { components: {
    core: { install: 'overlay', target: 'core/node_modules/openclaw/dist' },
    feishu: { install: 'npm-package', package: '@openclaw/feishu', target: 'plugins/feishu/node_modules/@openclaw/feishu' },
  } };
  const links = linkNpmProjects(rel, components);
  assert.deepEqual(links, [{ link: 'core/node_modules/npm/projects/openclaw-feishu-abc__g-1/node_modules/@openclaw/feishu', target: 'plugins/feishu/node_modules/@openclaw/feishu' }]);
  const resolved = path.resolve(rel, 'core/node_modules/openclaw/dist', '../../npm/projects/openclaw-feishu-abc__g-1/node_modules/@openclaw/feishu/dist/m.js');
  assert.equal(fs.readFileSync(resolved, 'utf8'), 'export {};');
  delete components.components.feishu;
  assert.throws(() => linkNpmProjects(rel, components), /imports @openclaw\/feishu from npm project openclaw-feishu-abc__g-1, which this release does not install/);
});

test('update/rollback loss check: missing or changed workspace files and missing databases are losses; additions are not', () => {
  const before = { workspaceFiles: { 'memory/2026-11-27.md': 'a', 'AGENTS.md': 'b', '.v/install.json': 'c' }, agentDatabases: ['makaron'], stateDatabase: true };
  assert.deepEqual(fingerprintLoss(before, { ...before, workspaceFiles: { ...before.workspaceFiles, 'memory/new.md': 'd' } }), []);
  assert.deepEqual(fingerprintLoss(before, { ...before, workspaceFiles: { ...before.workspaceFiles, '.v/install.json': 'x' } }), []);
  assert.deepEqual(fingerprintLoss(before, { workspaceFiles: { 'AGENTS.md': 'changed', '.v/install.json': 'c' }, agentDatabases: [], stateDatabase: false }),
    ['workspace file missing: memory/2026-11-27.md', 'workspace file changed: AGENTS.md', 'agent database missing: makaron', 'state database missing']);
});

test('V\'s bytes are laid over the official plugin OpenClaw installed in the state dir; another version is refused', (t) => {
  const root = tmp(t);
  const release = path.join(root, 'release');
  const state = path.join(root, 'state');
  put(release, 'runtime/components.json', JSON.stringify({ components: { feishu: { install: 'npm-package', stateOverlay: true, package: '@openclaw/feishu' } } }));
  put(release, 'runtime/feishu/dist/package.json', '{"version":"2026.9.1"}');
  put(release, 'runtime/feishu/dist/dist/m.js', 'V');
  put(release, 'runtime/feishu/manifest.json', JSON.stringify({ release: 'r.feishu', upstream: '@openclaw/feishu 2026.9.1', files: [
    { path: './package.json', sha256: sha('{"version":"2026.9.1"}'), kind: 'added' }, { path: './dist/m.js', sha256: sha('V'), kind: 'added' }] }));
  const installed = path.join(state, 'npm/projects/openclaw-feishu-dc69f44688/node_modules/@openclaw/feishu');
  put(installed, 'package.json', '{"version":"2026.9.1"}');
  put(installed, 'dist/m.js', 'upstream');
  put(installed, 'node_modules/@larksuiteoapi/node-sdk/index.js', 'bundled');
  assert.deepEqual(overlayStatePlugins(release, state), [{ component: 'feishu', project: 'openclaw-feishu-dc69f44688', written: 1, removed: 0 }]);
  assert.equal(fs.readFileSync(path.join(installed, 'dist/m.js'), 'utf8'), 'V');
  assert.equal(fs.readFileSync(path.join(installed, 'node_modules/@larksuiteoapi/node-sdk/index.js'), 'utf8'), 'bundled');
  assert.deepEqual(overlayStatePlugins(release, state)[0].written, 0, 'idempotent');
  put(installed, 'package.json', '{"version":"2026.9.4"}');
  assert.throws(() => overlayStatePlugins(release, state), /installed @openclaw\/feishu@2026.9.4 .* capture is over 2026.9.1/);
});

test('installRelease end to end with a fake npm: V layout for core, overlay, plugin dirs, state-only parts, records', (t) => {
  const rel = tmp(t);
  // A fake `npm ci`: materialise node_modules from the lock's "packages" (each entry's files listed under "fake").
  const npm = path.join(rel, '..', `fake-npm-${path.basename(rel)}`);
  fs.writeFileSync(npm, `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
for (const [k, files] of Object.entries(lock.fake || {})) for (const [f, d] of Object.entries(files)) { const p = path.join(k, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d); }
`, { mode: 0o755 });
  t.after(() => fs.rmSync(npm, { force: true }));
  const coreCode = 'import "../../npm/projects/openclaw-feishu-x/node_modules/@openclaw/feishu/dist/m.js";';
  const files = {
    'runtime/components.json': JSON.stringify({ components: {
      core: { install: 'overlay', package: 'openclaw', lock: 'core', target: 'core/dist' },
      'core-ai': { install: 'overlay', source: 'distro', package: '@openclaw/ai', target: 'core/node_modules/@openclaw/ai/dist' },
      worker: { install: 'plugin-dir', target: 'plugins/worker' },
      codex: { install: 'state-overlay', package: '@openclaw/codex' },
      feishu: { install: 'npm-package', package: '@openclaw/feishu', lock: 'feishu', target: 'plugins/feishu/node_modules/@openclaw/feishu', peerLink: 'openclaw', stateOverlay: true },
    } }),
    'runtime/locks/core/package.json': '{}',
    'runtime/locks/core/package-lock.json': JSON.stringify({ fake: {
      'node_modules/openclaw': { 'package.json': '{"version":"2026.9.1"}', 'dist/index.js': 'base' },
      'node_modules/@openclaw/ai': { 'package.json': '{"version":"2026.9.1"}', 'dist/index.mjs': 'ai', 'dist/transports.mjs': 'npm ai' } } }),
    'runtime/locks/feishu/package.json': '{}',
    'runtime/locks/feishu/package-lock.json': JSON.stringify({ fake: { 'node_modules/@openclaw/feishu': { 'package.json': 'npm', 'dist/m.js': 'upstream', 'node_modules/dep/i.js': 'b' } } }),
    'runtime/core/dist/index.js': 'V', 'runtime/core/dist/v.mjs': coreCode,
    'runtime/worker/dist/index.mjs': 'w',
    'runtime/core-ai/dist/transports.mjs': 'V ai',
    'runtime/codex/dist/package.json': 'c',
    'runtime/feishu/dist/package.json': 'npm', 'runtime/feishu/dist/dist/m.js': 'Vfeishu',
  };
  const caps = {
    core: { release: 'r', upstream: '2026.9.1', files: [{ path: './index.js', sha256: sha('V'), kind: 'modified', baseSha256: sha('base') }, { path: './v.mjs', sha256: sha(coreCode), kind: 'added' }] },
    'core-ai': { release: 'r.core-ai', upstream: '2026.9.1', files: [{ path: './transports.mjs', sha256: sha('V ai'), kind: 'modified', baseSha256: sha('npm ai') }] },
    worker: { release: 'r.worker', files: [{ path: './index.mjs', sha256: sha('w'), kind: 'added' }] },
    codex: { release: 'r.codex', files: [{ path: './package.json', sha256: sha('c'), kind: 'added' }] },
    feishu: { release: 'r.feishu', files: [{ path: './package.json', sha256: sha('npm'), kind: 'added' }, { path: './dist/m.js', sha256: sha('Vfeishu'), kind: 'added' }] },
  };
  for (const [id, m] of Object.entries(caps)) files[`runtime/${id}/manifest.json`] = JSON.stringify(m);
  for (const [p, d] of Object.entries(files)) put(rel, p, d);
  put(rel, 'manifest.json', JSON.stringify({ schema: 'v-distro/1', version: '1', release: 'r', upstream: { openclaw: '2026.9.1' }, openclawSchema: { state: 15 },
    files: Object.entries(files).map(([p, d]) => ({ path: p, sha256: sha(d) })) }));
  const record = installRelease(rel, { npm });
  assert.equal(fs.readFileSync(path.join(rel, 'core/dist/index.js'), 'utf8'), 'V');
  assert.equal(fs.readFileSync(path.join(rel, 'core/node_modules/@openclaw/ai/dist/index.mjs'), 'utf8'), 'ai', 'deps nested under the package, as on V');
  assert.equal(fs.readFileSync(path.join(rel, 'core/node_modules/@openclaw/ai/dist/transports.mjs'), 'utf8'), 'V ai', 'V\'s @openclaw/ai change laid over the npm copy');
  assert.equal(record.components['core-ai'].modified, 1);
  assert.ok(!fs.existsSync(path.join(rel, '.npm-core')), 'staging removed');
  assert.equal(fs.readFileSync(path.join(rel, 'plugins/worker/index.mjs'), 'utf8'), 'w');
  assert.equal(fs.readFileSync(path.join(rel, 'plugins/feishu/node_modules/@openclaw/feishu/dist/m.js'), 'utf8'), 'Vfeishu');
  assert.equal(fs.readFileSync(path.join(rel, 'npm/projects/openclaw-feishu-x/node_modules/@openclaw/feishu/dist/m.js'), 'utf8'), 'Vfeishu');
  assert.equal(fs.realpathSync(path.join(rel, 'plugins/feishu/node_modules/openclaw')), fs.realpathSync(path.join(rel, 'core')));
  assert.ok(!fs.existsSync(path.join(rel, 'plugins/codex')), 'state-only part has no release copy');
  assert.equal(record.components.codex.stateOverlay, true);
  assert.equal(readJsonFile(path.join(rel, '.installed.json')).openclawSchema.state, 15);
  assert.equal(verifyPackage(rel).version, '1', 'installed parts do not break package verification');
});

function readJsonFile(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

test('tool shims: lark-cli gets LARKSUITE_CLI_* from the FEISHU_* install env, values already set win; the agent has an openclaw CLI', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v-distro-shim-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fake = path.join(dir, 'real-lark');
  fs.writeFileSync(fake, '#!/bin/sh\necho "$LARKSUITE_CLI_APP_ID|$LARKSUITE_CLI_APP_SECRET|$LARKSUITE_CLI_CONFIG_DIR|$*"\n', { mode: 0o755 });
  const tools = JSON.parse(fs.readFileSync(new URL('../../runtime/tools.json', import.meta.url), 'utf8'));
  const shim = path.join(dir, 'lark-cli');
  fs.writeFileSync(shim, toolShim(fake, tools.npm['lark-cli'].env), { mode: 0o755 });
  const run = (env) => execFileSync(shim, ['im', '+x'], { env: { PATH: '/usr/bin:/bin', HOME: '/home/openclaw', ...env } }).toString().trim();
  assert.equal(run({ FEISHU_APP_ID: 'app', FEISHU_APP_SECRET: 's' }), 'app|s|/home/openclaw/.lark-cli|im +x');
  assert.equal(run({ FEISHU_APP_ID: 'app', LARKSUITE_CLI_APP_ID: 'own' }), 'own||/home/openclaw/.lark-cli|im +x');
  assert.throws(() => toolShim(fake, { 'bad name': 'x' }), /bad env name/);
  assert.match(openclawShim('/opt/v'), /exec '\/opt\/v\/node\/current\/bin\/node' '\/opt\/v\/current\/core\/dist\/index.js' "\$@"/);
});
