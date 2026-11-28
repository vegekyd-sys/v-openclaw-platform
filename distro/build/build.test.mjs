// Offline tests for distro/build: a throwaway git repo with a fake release
// capture on a captured-store branch, built twice and taken apart again.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildPackage } from './build.mjs';
import { tarBytes, scanSecrets } from './lib.mjs';
import { verifyPackage } from '../install/lib/release.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const REL = 'fixture-rel-20261127';
const LONG = `${'deep/'.repeat(25)}chunk-with-a-very-long-name-AbCdEfGh.js`;

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-27T08:00:00Z', GIT_COMMITTER_DATE: '2026-11-27T08:00:00Z' } }).trim();
}

function write(root, rel, data, mode) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  if (mode) fs.chmodSync(file, mode);
}

function captureManifest(release, files, extra = {}) {
  return `${JSON.stringify({ release, ...extra, removedFromBase: [], files: files.map(([p, d, kind, base]) => ({ path: `./${p}`, sha256: sha(Buffer.from(d)), kind, ...(base ? { baseSha256: sha(Buffer.from(base)) } : {}), bytes: Buffer.byteLength(d) })) }, null, 2)}\n`;
}

function fixtureRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'v-distro-build-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@example.invalid');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'commit.gpgsign', 'false');
  const core = [['index.js', 'export const v = 2;\n', 'modified', 'export const v = 1;\n'], [LONG, 'long\n', 'added']];
  const worker = [['index.mjs', 'export default {};\n', 'added'], ['openclaw.plugin.json', '{"id":"w"}\n', 'added']];
  // captured-store: orphan branch with only dist bytes.
  git(repo, 'checkout', '-q', '--orphan', 'captured-store');
  for (const [p, d] of core) write(repo, `release/captured/${REL}/dist/${p}`, d);
  for (const [p, d] of worker) write(repo, `release/captured/${REL}.worker/dist/${p}`, d);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'store');
  git(repo, 'checkout', '-q', '--orphan', 'main');
  git(repo, 'rm', '-rq', '--cached', '.');
  fs.rmSync(path.join(repo, 'release'), { recursive: true, force: true });
  write(repo, `release/captured/${REL}/manifest.json`, captureManifest(REL, core, { upstream: '2026.9.1', capturedAt: '2026-11-26T00:00:00Z' }));
  write(repo, `release/captured/${REL}.worker/manifest.json`, captureManifest(`${REL}.worker`, worker));
  write(repo, 'distro/runtime/components.json', JSON.stringify({
    agentId: 'makaron', openclawSchema: { '2026.9.1': { state: 15, agent: 19 } },
    components: {
      core: { suffix: '', install: 'overlay', lock: 'core-openclaw', target: 'core/node_modules/openclaw/dist' },
      'core-ai': { source: 'distro', install: 'overlay', package: '@openclaw/ai', target: 'core/node_modules/@openclaw/ai/dist' },
      worker: { suffix: '.worker', install: 'plugin-dir', pluginId: 'w', target: 'plugins/worker' },
    },
    notIncluded: { '.dingtalk': 'not for customers' },
    vplugins: { 'deepseek-web': { dir: 'apps/v-deepseek-web/plugin' } },
    ops: { 'scripts/op.py': 'an ops script' },
  }));
  const ai = [['transports.mjs', 'V ai\n', 'modified', 'npm ai\n']];
  write(repo, `distro/runtime/overlays/${REL}/core-ai/manifest.json`, captureManifest(`${REL}.core-ai`, ai, { upstream: '2026.9.1' }));
  for (const [p, d] of ai) write(repo, `distro/runtime/overlays/${REL}/core-ai/files/${p}`, d);
  write(repo, 'distro/runtime/tools.json', JSON.stringify({ node: { version: '22.23.1' }, npm: { t: { package: 't', version: '1.0.0', lock: 'tool-t', bin: 't' } } }));
  write(repo, 'distro/runtime/gateway.env', 'A=1\n');
  write(repo, 'distro/runtime/locks/core-openclaw/package.json', '{"dependencies":{"openclaw":"2026.9.1"}}\n');
  write(repo, 'distro/runtime/locks/core-openclaw/package-lock.json', '{}\n');
  write(repo, 'distro/runtime/locks/tool-t/package.json', '{}\n');
  write(repo, 'distro/runtime/locks/tool-t/package-lock.json', '{}\n');
  write(repo, 'scripts/op.py', 'print(1)\n', 0o755);
  write(repo, 'distro/install/install.sh', '#!/bin/sh\necho hi\n', 0o755);
  write(repo, 'distro/install/lib/vctl.mjs', 'export {};\n');
  write(repo, 'distro/install/lib/vctl.test.mjs', 'not shipped\n');
  write(repo, 'distro/install/config/openclaw-config.mjs', 'export {};\n');
  write(repo, 'distro/workspace/payload/AGENTS.md', '# V at @@WORKSPACE@@\n');
  write(repo, 'distro/workspace/render.mjs', 'export function render() { return []; }\n');
  write(repo, 'distro/workspace/V_CORE_COMMIT', `${'c'.repeat(40)}\n`);
  // Line B's own tooling and tests sit beside payload/; its leak tests carry id shapes.
  write(repo, 'distro/workspace/tests/workspace.test.mjs', `const leak = 'ou_${'b2'.repeat(16)}';\n`);
  write(repo, 'distro/workspace/build.mjs', 'export {};\n');
  write(repo, 'apps/v-desktop-handoff/plugin/index.js', 'export default {};\n');
  write(repo, 'apps/v-deepseek-web/plugin/index.js', 'export default {};\n');
  write(repo, 'apps/v-deepseek-web/plugin/tests/deepseek.test.mjs', 'not shipped\n');
  write(repo, 'apps/v-desktop-handoff/desktop/start-desktop.sh', '#!/bin/sh\n', 0o755);
  write(repo, 'apps/v-desktop-handoff/service/tests/server.test.mjs', 'not shipped\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'main');
  return repo;
}

const build = (repo, extra = {}) => buildPackage({ repo, release: REL, version: '0.1.0-test', 'captured-ref': 'captured-store', ...extra });

function untar(t, tgz) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v-distro-untar-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'p.tgz');
  fs.writeFileSync(file, tgz);
  execFileSync('tar', ['-xzf', file, '-C', dir]);
  return dir;
}

test('same inputs give the same bytes; uncommitted edits do not reach the package', (t) => {
  const repo = fixtureRepo(t);
  const a = build(repo);
  write(repo, 'distro/install/install.sh', '#!/bin/sh\necho edited\n');
  write(repo, 'distro/workspace/payload/NEW.md', 'untracked\n');
  const b = build(repo);
  assert.equal(a.tgzSha256, b.tgzSha256);
  assert.equal(a.tarSha256, b.tarSha256);
  assert.ok(!b.manifest.files.some((f) => f.path === 'workspace/NEW.md'));
});

test('manifest records sources, components and every file; system tar unpacks it and the installer verifies it', (t) => {
  const repo = fixtureRepo(t);
  const built = build(repo);
  const m = built.manifest;
  assert.equal(m.schema, 'v-distro/1');
  assert.equal(m.release, REL);
  assert.deepEqual(m.upstream, { openclaw: '2026.9.1', node: '22.23.1' });
  assert.deepEqual(m.openclawSchema, { state: 15, agent: 19 });
  assert.equal(m.source.commit, git(repo, 'rev-parse', 'main'));
  assert.equal(m.source.capturedStore, git(repo, 'rev-parse', 'captured-store'));
  assert.equal(m.source.workspace.commit, m.source.commit);
  assert.equal(m.components.core.files, 2);
  assert.equal(m.components.core.base, 'openclaw@2026.9.1');
  assert.equal(m.components.worker.pluginId, 'w');
  assert.deepEqual(m.notIncluded.map((x) => x.capture), [`${REL}.dingtalk`]);
  const paths = m.files.map((f) => f.path);
  for (const p of ['runtime/core/manifest.json', `runtime/core/dist/${LONG}`, 'runtime/worker/dist/index.mjs', 'runtime/ops/op.py',
    'runtime/locks/core-openclaw/package-lock.json', 'install/install.sh', 'install/lib/vctl.mjs', 'config/openclaw-config.mjs',
    'workspace/AGENTS.md', 'optional/optional.json', 'optional/desktop/plugin/index.js', 'optional/desktop/desktop/start-desktop.sh', 'vplugins/deepseek-web/index.js']) assert.ok(paths.includes(p), p);
  assert.ok(!paths.some((p) => p.includes('/tests/')), 'desktop tests stay in the repo');
  assert.ok(!paths.includes('install/lib/vctl.test.mjs'));
  const dir = untar(t, built.tgz);
  const pkg = path.join(dir, 'v-distro-0.1.0-test');
  assert.equal(fs.readFileSync(path.join(pkg, 'runtime/core/dist', LONG), 'utf8'), 'long\n');
  assert.equal(fs.statSync(path.join(pkg, 'install/install.sh')).mode & 0o777, 0o755);
  assert.equal(fs.statSync(path.join(pkg, 'runtime/ops/op.py')).mode & 0o777, 0o755);
  assert.equal(verifyPackage(pkg).version, '0.1.0-test');
  fs.appendFileSync(path.join(pkg, 'install/install.sh'), '# tampered\n');
  assert.throws(() => verifyPackage(pkg), /package file changed: install\/install.sh/);
});

test('captured-store bytes that differ from the release manifest fail the build', (t) => {
  const repo = fixtureRepo(t);
  git(repo, 'checkout', '-q', 'captured-store');
  write(repo, `release/captured/${REL}/dist/index.js`, 'export const v = 3;\n');
  git(repo, 'commit', '-qam', 'tamper');
  git(repo, 'checkout', '-q', 'main');
  assert.throws(() => build(repo), /index.js sha256 differs from its manifest/);
});

test('a file on captured-store that the manifest does not list fails the build', (t) => {
  const repo = fixtureRepo(t);
  git(repo, 'checkout', '-q', 'captured-store');
  write(repo, `release/captured/${REL}.worker/dist/stray.mjs`, 'x\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'stray');
  git(repo, 'checkout', '-q', 'main');
  assert.throws(() => build(repo), /manifest does not list: stray.mjs/);
});

test('secret-like content in the workspace fails the build', (t) => {
  const repo = fixtureRepo(t);
  write(repo, 'distro/workspace/payload/USER.md', `owner: ou_${'a1'.repeat(16)}\n`);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'leak');
  assert.throws(() => build(repo), /secret-like content.*workspace\/USER.md \(feishu open_id\)/);
});

test('only distro/workspace/payload/ becomes workspace/; render.mjs ships beside it, B\'s tests and tools do not', (t) => {
  const repo = fixtureRepo(t);
  const { manifest } = build(repo);
  const paths = manifest.files.map((f) => f.path);
  assert.deepEqual(paths.filter((p) => p.startsWith('workspace/')), ['workspace/AGENTS.md']);
  assert.ok(paths.includes('runtime/workspace-render.mjs'));
  for (const p of paths) assert.ok(!/(^|\/)(tests|payload)\//.test(p) && !p.endsWith('V_CORE_COMMIT') && p !== 'workspace/build.mjs', p);
  assert.equal(manifest.source.workspace.tree, git(repo, 'rev-parse', 'main:distro/workspace/payload'));
  assert.equal(manifest.source.workspace.vCoreCommit, 'c'.repeat(40));
  git(repo, 'rm', '-q', 'distro/workspace/render.mjs');
  git(repo, 'commit', '-qm', 'no renderer');
  assert.throws(() => build(repo), /without distro\/workspace\/render.mjs/);
});

test('a workspace ref other than the source commit is recorded; a missing workspace ships an empty marker', (t) => {
  const repo = fixtureRepo(t);
  const wsCommit = git(repo, 'rev-parse', 'main');
  git(repo, 'rm', '-rq', 'distro/workspace');
  git(repo, 'commit', '-qm', 'no workspace');
  const without = build(repo);
  assert.equal(without.manifest.source.workspace, null);
  assert.ok(without.manifest.files.some((f) => f.path === 'workspace/.empty'));
  const withRef = build(repo, { 'workspace-ref': wsCommit });
  assert.equal(withRef.manifest.source.workspace.commit, wsCommit);
  assert.ok(withRef.manifest.files.some((f) => f.path === 'workspace/AGENTS.md'));
});

test('tar writer: sorted, fixed owner and mtime, pax header only for long names', () => {
  const tar = tarBytes([{ path: 'b', data: Buffer.from('2'), mode: 0o644 }, { path: 'a', data: Buffer.from('1'), mode: 0o755 }], 1000);
  assert.equal(tar.subarray(0, 1).toString(), 'a');
  assert.equal(tar.length, 512 * 4 + 1024);
  assert.equal(tar.subarray(108, 115).toString(), '0000000');
  assert.throws(() => tarBytes([{ path: 'x', data: Buffer.alloc(0), mode: 0o600 }], 0), /mode 600/);
});

test('secret scan keeps to strict shapes (V code is full of sk-... class names)', () => {
  const entries = (s) => [{ path: 'f', data: Buffer.from(s) }];
  assert.deepEqual(scanSecrets(entries('class="sk-suggestion__header" sk-followup-presentation-v1')), []);
  assert.equal(scanSecrets(entries(`key sk-${'0123456789abcdef'.repeat(2)}`))[0].kind, 'deepseek-style key');
  assert.equal(scanSecrets(entries(['-----BEGIN OPENSSH', 'PRIVATE KEY-----'].join(' ')))[0].kind, 'private key');
});

test('distro overlays (V bytes outside platform captures) ship with their manifest; a release without one fails', (t) => {
  const repo = fixtureRepo(t);
  const m = build(repo).manifest;
  assert.equal(m.components['core-ai'].capture, `${REL}.core-ai`);
  assert.equal(m.components['core-ai'].source, `distro/runtime/overlays/${REL}/core-ai`);
  assert.ok(m.files.some((f) => f.path === 'runtime/core-ai/dist/transports.mjs'));
  git(repo, 'mv', `distro/runtime/overlays/${REL}`, 'distro/runtime/overlays/other-release');
  git(repo, 'commit', '-qm', 'overlay for another release only');
  assert.throws(() => build(repo), /no distro\/runtime\/overlays\/fixture-rel-20261127\/core-ai\/manifest.json/);
});

test('a vplugin pinned to an older commit ships those bytes only when they match the pinned sha256s', (t) => {
  const repo = fixtureRepo(t);
  write(repo, 'extensions/old-plugin/index.js', 'export default 1;\n');
  write(repo, 'extensions/old-plugin/index.test.mjs', 'not shipped\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'old plugin');
  const old = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'rm', '-rq', 'extensions');
  const setPin = (sha) => {
    const c = JSON.parse(fs.readFileSync(path.join(repo, 'distro/runtime/components.json'), 'utf8'));
    c.vplugins['old-plugin'] = { dir: 'extensions/old-plugin', commit: old, sha256: { 'index.js': sha } };
    write(repo, 'distro/runtime/components.json', JSON.stringify(c));
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'pin');
  };
  setPin(createHash('sha256').update('export default 1;\n').digest('hex'));
  const paths = build(repo).manifest.files.map((f) => f.path);
  assert.ok(paths.includes('vplugins/old-plugin/index.js'));
  assert.ok(!paths.includes('vplugins/old-plugin/index.test.mjs'));
  setPin('0'.repeat(64));
  assert.throws(() => build(repo), /old-plugin: files differ from the pinned sha256s: index.js/);
});

test('release.json names a captured V release and a full captured-store commit; release-build.sh is valid bash', async () => {
  const fsm = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const rel = JSON.parse(fsm.readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(rel).sort(), ['capturedStore', 'release']);
  assert.match(rel.capturedStore, /^[0-9a-f]{40}$/);
  assert.ok(fsm.existsSync(new URL(`../../release/captured/${rel.release}/manifest.json`, import.meta.url)), `release/captured/${rel.release}/manifest.json`);
  const sh = new URL('./release-build.sh', import.meta.url).pathname;
  assert.equal(spawnSync('bash', ['-n', sh]).status, 0);
});
