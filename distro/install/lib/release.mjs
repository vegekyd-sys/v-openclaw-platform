// Turn an unpacked v-distro package into an installed release directory
// (distro/CONTRACT.md section 3). Pure file work plus `npm ci`; no systemd.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const sha256File = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function safeRel(rel) {
  if (!rel || path.isAbsolute(rel) || rel.split('/').some((p) => !p || p === '.' || p === '..')) throw new Error(`unsafe path ${rel}`);
  return rel;
}

/** Every file of the package matches manifest.files, and nothing else is there. */
export function verifyPackage(pkgDir) {
  const manifest = readJson(path.join(pkgDir, 'manifest.json'));
  if (manifest.schema !== 'v-distro/1') throw new Error(`not a v-distro/1 package (${manifest.schema})`);
  const listed = new Set();
  for (const f of manifest.files) {
    const rel = safeRel(f.path);
    listed.add(rel);
    const abs = path.join(pkgDir, rel);
    if (!fs.existsSync(abs)) throw new Error(`package file missing: ${rel}`);
    if (sha256File(abs) !== f.sha256) throw new Error(`package file changed: ${rel}`);
  }
  const extra = [];
  const walk = (dir, prefix) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(path.join(dir, ent.name), rel);
      else if (rel !== 'manifest.json' && !listed.has(rel)) extra.push(rel);
    }
  };
  walk(pkgDir, '');
  // Installed parts live next to the package files in a release directory.
  const installedRoots = ['core/', 'plugins/', 'npm/', '.installed.json', '.release.env', '.tools.json'];
  const unexpected = extra.filter((rel) => !installedRoots.some((r) => rel === r || rel.startsWith(r)));
  if (unexpected.length) throw new Error(`files not in the package manifest: ${unexpected.slice(0, 5).join(', ')}`);
  return manifest;
}

function captureEntries(captureDir) {
  const manifest = readJson(path.join(captureDir, 'manifest.json'));
  return { manifest, files: manifest.files.map((e) => ({ ...e, rel: safeRel(e.path.replace(/^\.\//, '')) })) };
}

function writeAtomic(src, dst, mode) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const tmp = `${dst}.v-distro.tmp`;
  fs.copyFileSync(src, tmp);
  if (mode !== undefined) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, dst);
}

/**
 * Lay a capture over an installed package's dist. Fail closed: a "modified"
 * file must replace exactly the upstream bytes it was captured against, an
 * "added" file must not already exist with other bytes. Idempotent.
 */
export function applyOverlay(captureDir, distDir, expectVersion) {
  const { manifest, files } = captureEntries(captureDir);
  const pkg = readJson(path.join(distDir, '..', 'package.json'));
  if (expectVersion && pkg.version !== expectVersion) throw new Error(`base package is ${pkg.version}, capture needs ${expectVersion}`);
  if (manifest.upstream && pkg.version !== manifest.upstream) throw new Error(`base package is ${pkg.version}, capture is over ${manifest.upstream}`);
  const counts = { modified: 0, added: 0, alreadyApplied: 0 };
  // Check everything before writing anything.
  for (const e of files) {
    const src = path.join(captureDir, 'dist', e.rel);
    const dst = path.join(distDir, e.rel);
    if (sha256File(src) !== e.sha256) throw new Error(`capture bytes differ from its manifest: ${e.rel}`);
    const have = fs.existsSync(dst) ? sha256File(dst) : null;
    if (have === e.sha256) { e.skip = true; counts.alreadyApplied += 1; continue; }
    if (e.kind === 'modified') {
      if (have !== e.baseSha256) throw new Error(`upstream bytes differ from the capture's base: ${e.rel}`);
      counts.modified += 1;
    } else if (e.kind === 'added') {
      if (have !== null) throw new Error(`added file already exists with other bytes: ${e.rel}`);
      counts.added += 1;
    } else throw new Error(`unknown capture kind ${e.kind} for ${e.rel}`);
  }
  for (const e of files) if (!e.skip) writeAtomic(path.join(captureDir, 'dist', e.rel), path.join(distDir, e.rel), 0o644);
  return { capture: manifest.release, ...counts };
}

function listFiles(dir, skipTop = new Set()) {
  const out = [];
  const walk = (d, prefix) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (!prefix && skipTop.has(ent.name)) continue;
      if (ent.isDirectory()) walk(path.join(d, ent.name), rel);
      else out.push(rel);
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out;
}

/**
 * Make targetDir hold exactly the captured package files (node_modules/ under
 * it is left alone): write every captured file, delete package files the
 * capture does not have. Used for whole-package captures (baseDir "none").
 */
export function replacePackage(captureDir, targetDir) {
  const { manifest, files } = captureEntries(captureDir);
  const want = new Set(files.map((e) => e.rel));
  for (const e of files) {
    const src = path.join(captureDir, 'dist', e.rel);
    if (sha256File(src) !== e.sha256) throw new Error(`capture bytes differ from its manifest: ${e.rel}`);
  }
  let written = 0;
  for (const e of files) {
    const dst = path.join(targetDir, e.rel);
    if (fs.existsSync(dst) && sha256File(dst) === e.sha256) continue;
    writeAtomic(path.join(captureDir, 'dist', e.rel), dst, 0o644);
    written += 1;
  }
  const removed = [];
  for (const rel of listFiles(targetDir, new Set(['node_modules']))) {
    if (!want.has(rel)) { fs.rmSync(path.join(targetDir, rel)); removed.push(rel); }
  }
  return { capture: manifest.release, files: files.length, written, removed };
}

/** Same check after the fact: what V's sentinel would see. */
export function verifyCapture(captureDir, targetDir, { exact = false } = {}) {
  const { files } = captureEntries(captureDir);
  const bad = files.filter((e) => !fs.existsSync(path.join(targetDir, e.rel)) || sha256File(path.join(targetDir, e.rel)) !== e.sha256).map((e) => e.rel);
  if (exact) {
    const want = new Set(files.map((e) => e.rel));
    for (const rel of listFiles(targetDir, new Set(['node_modules']))) if (!want.has(rel)) bad.push(`extra:${rel}`);
  }
  return bad;
}

export function copyTree(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, preserveTimestamps: false });
}

export function npmCi(dir, lockDir, { npm = 'npm', registry, log = () => {} } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(lockDir, 'package.json'), path.join(dir, 'package.json'));
  fs.copyFileSync(path.join(lockDir, 'package-lock.json'), path.join(dir, 'package-lock.json'));
  const args = ['ci', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'];
  if (registry) args.push(`--registry=${registry}`);
  log(`npm ${args.join(' ')} (${dir})`);
  const r = spawnSync(npm, args, { cwd: dir, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, npm_config_update_notifier: 'false' } });
  if (r.status !== 0) throw new Error(`npm ci failed in ${dir} (exit ${r.status})`);
}

/**
 * npm ci the lock in a staging project, then lay it out the way V's core is:
 * <dir>/ is the package itself and every dependency is in <dir>/node_modules.
 */
export function installPackageRoot(releaseDir, dirRel, pkgName, lockDir, opts) {
  const dir = path.join(releaseDir, dirRel);
  const staging = path.join(releaseDir, `.npm-${path.basename(dirRel)}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  npmCi(staging, lockDir, opts);
  const nm = path.join(staging, 'node_modules');
  const pkgDir = path.join(nm, ...pkgName.split('/'));
  if (fs.existsSync(path.join(pkgDir, 'node_modules'))) throw new Error(`${pkgName} has nested node_modules; refusing to merge layouts`);
  fs.renameSync(pkgDir, dir);
  fs.mkdirSync(path.join(dir, 'node_modules'));
  for (const ent of fs.readdirSync(nm)) {
    if (ent === '.bin' || ent === '.package-lock.json') continue;
    if (ent.startsWith('@')) {
      for (const sub of fs.readdirSync(path.join(nm, ent))) {
        fs.mkdirSync(path.join(dir, 'node_modules', ent), { recursive: true });
        fs.renameSync(path.join(nm, ent, sub), path.join(dir, 'node_modules', ent, sub));
      }
    } else fs.renameSync(path.join(nm, ent), path.join(dir, 'node_modules', ent));
  }
  fs.rmSync(staging, { recursive: true, force: true });
}

/**
 * Install the runtime parts of the release in releaseDir (the unpacked package
 * already copied there). Returns the record written to .installed.json.
 */
export function installRelease(releaseDir, { npm, registry, log = () => {} } = {}) {
  const manifest = verifyPackage(releaseDir);
  const components = readJson(path.join(releaseDir, 'runtime/components.json'));
  const locks = path.join(releaseDir, 'runtime/locks');
  const record = { version: manifest.version, release: manifest.release, upstream: manifest.upstream, openclawSchema: manifest.openclawSchema, components: {} };
  for (const [id, c] of Object.entries(components.components)) {
    const captureDir = path.join(releaseDir, 'runtime', id);
    const target = c.target ? path.join(releaseDir, c.target) : null;
    if (c.install === 'overlay') {
      installPackageRoot(releaseDir, path.dirname(c.target), c.package, path.join(locks, c.lock), { npm, registry, log });
      record.components[id] = applyOverlay(captureDir, target, manifest.upstream.openclaw);
    } else if (c.install === 'npm-package') {
      const projectDir = path.join(releaseDir, c.target.split('/node_modules/')[0]);
      npmCi(projectDir, path.join(locks, c.lock), { npm, registry, log });
      record.components[id] = replacePackage(captureDir, target);
      if (c.peerLink) {
        const link = path.join(projectDir, 'node_modules', c.peerLink);
        const coreDir = path.join(releaseDir, components.components.core.target, '..');
        fs.rmSync(link, { recursive: true, force: true });
        fs.symlinkSync(path.relative(path.dirname(link), coreDir), link);
      }
    } else if (c.install === 'state-overlay') {
      // Nothing in the release: overlayStatePlugins() applies it to OpenClaw's own install.
      const bad = captureEntries(captureDir).files.filter((e) => sha256File(path.join(captureDir, 'dist', e.rel)) !== e.sha256);
      if (bad.length) throw new Error(`${id}: capture bytes differ from its manifest: ${bad[0].rel}`);
      record.components[id] = { capture: readJson(path.join(captureDir, 'manifest.json')).release, stateOverlay: true, verified: true };
      continue;
    } else if (c.install === 'plugin-dir') {
      copyTree(path.join(captureDir, 'dist'), target);
      record.components[id] = { capture: readJson(path.join(captureDir, 'manifest.json')).release, files: listFiles(target).length };
    } else throw new Error(`unknown install kind ${c.install}`);
    const bad = verifyCapture(captureDir, target, { exact: c.install !== 'overlay' });
    if (bad.length) throw new Error(`${id}: installed files differ from the capture: ${bad.slice(0, 5).join(', ')}`);
    record.components[id].verified = true;
  }
  record.projectLinks = linkNpmProjects(releaseDir, components);
  record.installedAt = new Date().toISOString();
  fs.writeFileSync(path.join(releaseDir, '.installed.json'), `${JSON.stringify(record, null, 2)}\n`);
  fs.writeFileSync(path.join(releaseDir, '.release.env'), `V_RELEASE_VERSION=${manifest.release}\nV_DISTRO_VERSION=${manifest.version}\nOPENCLAW_SERVICE_VERSION=${manifest.upstream.openclaw}\n`);
  return record;
}

const PROJECT_IMPORT = /["'`]\.\.\/\.\.\/npm\/projects\/([A-Za-z0-9._-]+)\/node_modules\/((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)\//g;

/**
 * V's core dist imports some plugins by a path relative to itself:
 * "../../npm/projects/<project>/node_modules/<package>/..." (V's release
 * directory has npm/projects/<project>/node_modules/<package> as a symlink to
 * the plugin it runs). Find every such import in the core overlay and give it
 * the same symlink, pointing at the package this release installed. A package
 * the release does not install fails the install.
 */
export function linkNpmProjects(releaseDir, components) {
  const core = components.components.core;
  const distDir = path.join(releaseDir, core.target);
  const { files } = captureEntries(path.join(releaseDir, 'runtime', 'core'));
  const byPackage = new Map(Object.values(components.components).filter((c) => c.package && c.install === 'npm-package').map((c) => [c.package, path.join(releaseDir, c.target)]));
  const links = new Map();
  for (const e of files) {
    if (!/\.m?js$/.test(e.rel)) continue;
    const text = fs.readFileSync(path.join(distDir, e.rel), 'utf8');
    for (const m of text.matchAll(PROJECT_IMPORT)) {
      const [, project, pkg] = m;
      const target = byPackage.get(pkg);
      if (!target) throw new Error(`core ${e.rel} imports ${pkg} from npm project ${project}, which this release does not install`);
      links.set(path.join(distDir, '..', '..', 'npm', 'projects', project, 'node_modules', pkg), target);
    }
  }
  const out = [];
  for (const [link, target] of [...links].sort()) {
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.rmSync(link, { recursive: true, force: true });
    fs.symlinkSync(path.relative(path.dirname(link), target), link);
    out.push({ link: path.relative(releaseDir, link), target: path.relative(releaseDir, target) });
  }
  return out;
}

/**
 * Lay V's captured package files over every copy OpenClaw installed of an
 * official plugin (~/.openclaw/npm/projects/<project>/node_modules/<package>).
 * Refuses a copy of another version: the capture belongs to one upstream.
 * Returns what changed, so the caller knows whether a restart is needed.
 */
export function overlayStatePlugins(releaseDir, stateDir) {
  const components = readJson(path.join(releaseDir, 'runtime/components.json'));
  const projects = path.join(stateDir, 'npm', 'projects');
  const results = [];
  for (const [id, c] of Object.entries(components.components)) {
    if (!(c.install === 'state-overlay' || c.stateOverlay)) continue;
    const captureDir = path.join(releaseDir, 'runtime', id);
    const upstream = readJson(path.join(captureDir, 'manifest.json')).upstream ?? '';
    const want = upstream.split(' ').at(-1);
    if (!fs.existsSync(projects)) continue;
    for (const project of fs.readdirSync(projects).sort()) {
      const dir = path.join(projects, project, 'node_modules', ...c.package.split('/'));
      if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
      const have = readJson(path.join(dir, 'package.json')).version;
      if (want && /^\d/.test(want) && have !== want && verifyCapture(captureDir, dir, { exact: true }).length) {
        throw new Error(`${id}: OpenClaw installed ${c.package}@${have} in ${project}; the capture is over ${want}`);
      }
      const r = replacePackage(captureDir, dir);
      const bad = verifyCapture(captureDir, dir, { exact: true });
      if (bad.length) throw new Error(`${id}: ${project} differs from the capture after overlay: ${bad.slice(0, 3).join(', ')}`);
      results.push({ component: id, project, written: r.written, removed: r.removed.length });
    }
  }
  return results;
}

/** npm CLIs from tools.json, each into its own prefix; returns { name: binPath }. */
export function installTools(releaseDir, toolsRoot, { npm, registry, log = () => {}, arch = process.arch } = {}) {
  const tools = readJson(path.join(releaseDir, 'runtime/tools.json'));
  const out = {};
  for (const [name, t] of Object.entries(tools.npm)) {
    const dir = path.join(toolsRoot, `${name}-${t.version}`);
    const lockDir = path.join(releaseDir, 'runtime/locks', t.lock);
    const marker = path.join(dir, '.v-distro-lock.sha256');
    const lockSha = sha256File(path.join(lockDir, 'package-lock.json'));
    if (!(fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === lockSha)) {
      fs.rmSync(dir, { recursive: true, force: true });
      npmCi(dir, lockDir, { npm, registry, log });
      fs.writeFileSync(marker, `${lockSha}\n`);
    }
    const platform = `linux-${arch === 'arm64' ? 'arm64' : 'x64'}`;
    const bin = t.native?.[platform] ? path.join(dir, t.native[platform]) : path.join(dir, 'node_modules/.bin', t.bin);
    if (!fs.existsSync(bin)) throw new Error(`tool ${name}: ${bin} missing after install`);
    out[name] = bin;
  }
  return out;
}
