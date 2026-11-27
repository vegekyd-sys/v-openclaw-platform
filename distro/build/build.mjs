#!/usr/bin/env node
// Build v-distro-<version>.tgz for one V release (distro/CONTRACT.md).
//
//   node distro/build/build.mjs --release <rel> [--version <ver>] [--out <dir>]
//        [--source <commit>] [--captured-ref <ref>] [--workspace-ref <ref>] [--repo <dir>]
//
// Every input is read from git objects: the --source commit for distro/,
// scripts/ and release/captured/<rel>*/manifest.json, the captured-store ref
// for the dist/ bytes, the --workspace-ref commit for distro/workspace/payload/ and render.mjs.
// Uncommitted edits never reach the package, and the same inputs give the
// same bytes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sha256, resolveCommit, commitTime, treeSha, listTree, readBlobs, readFile, fileExists,
  tarBytes, gzipDeterministic, scanSecrets,
} from './lib.mjs';

const REPO_SLUG = 'vegekyd-sys/v-openclaw-platform';

export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const m = /^--([a-z-]+)$/.exec(a);
    if (!m) throw new Error(`unexpected argument ${a}`);
    opts[m[1]] = argv[++i];
    if (opts[m[1]] === undefined) throw new Error(`${a} needs a value`);
  }
  return opts;
}

const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,80}$/;

/**
 * A capture's manifest and bytes. Platform captures: manifest on the source
 * commit, bytes on captured-store. Distro overlays (bytes V changed outside what
 * the platform captures, e.g. core's node_modules): both under
 * distro/runtime/overlays/<release>/<component>/ on the source commit.
 */
function captureFiles(repo, sourceCommit, storeCommit, capture, { overlayDir } = {}) {
  const base = overlayDir ?? `release/captured/${capture}`;
  const bytesCommit = overlayDir ? sourceCommit : storeCommit;
  // Overlay bytes sit in files/, not dist/: the repo's .gitignore drops every dist/ directory.
  const bytesDir = overlayDir ? `${overlayDir}/files` : `${base}/dist`;
  const manifestPath = `${base}/manifest.json`;
  if (!fileExists(repo, sourceCommit, manifestPath)) throw new Error(`no ${manifestPath} at ${sourceCommit}`);
  const manifestBuf = readFile(repo, sourceCommit, manifestPath);
  const manifest = JSON.parse(manifestBuf.toString('utf8'));
  if (manifest.release !== capture) throw new Error(`${manifestPath} names release ${manifest.release}`);
  if (manifest.removedFromBase?.length) throw new Error(`${capture}: removedFromBase is not supported`);
  if (!treeSha(repo, bytesCommit, bytesDir)) throw new Error(`${capture}: no ${bytesDir} at ${bytesCommit}`);
  const tree = listTree(repo, bytesCommit, bytesDir);
  const byPath = new Map(tree.map((f) => [f.path, f]));
  const blobs = readBlobs(repo, tree.map((f) => f.blob));
  const files = [];
  const seen = new Set();
  for (const entry of manifest.files) {
    const rel = entry.path.replace(/^\.\//, '');
    if (!rel || rel.split('/').some((p) => !p || p === '..' || p === '.')) throw new Error(`${capture}: bad path ${entry.path}`);
    const f = byPath.get(rel);
    if (!f) throw new Error(`${capture}: ${rel} is in the manifest but not in ${bytesDir}`);
    const data = blobs.get(f.blob);
    if (sha256(data) !== entry.sha256) throw new Error(`${capture}: ${rel} sha256 differs from its manifest`);
    seen.add(rel);
    files.push({ rel, data, mode: f.mode });
  }
  const extra = tree.filter((f) => !seen.has(f.path)).map((f) => f.path);
  if (extra.length) throw new Error(`${capture}: ${bytesDir} has files the manifest does not list: ${extra.slice(0, 5).join(', ')}`);
  return { manifest, manifestBuf, files };
}

/**
 * Replace personal identifiers V hard-codes in its own runtime bytes (its Feishu
 * group, say) before they reach a customer. Each redaction must match; the
 * capture manifest in the package carries the new sha256 and the original one.
 */
export function applyRedactions(componentId, manifest, files, redactions) {
  const done = [];
  for (const r of redactions.filter((x) => x.component === componentId)) {
    const f = files.find((x) => x.rel === r.path);
    if (!f) throw new Error(`redaction target ${componentId}:${r.path} is not in the capture`);
    const re = new RegExp(r.pattern, 'g');
    const before = f.data.toString('utf8');
    const count = (before.match(re) ?? []).length;
    if (!count) throw new Error(`redaction ${componentId}:${r.path} /${r.pattern}/ matched nothing`);
    const after = Buffer.from(before.replace(re, r.replacement), 'utf8');
    const entry = manifest.files.find((e) => e.path.replace(/^\.\//, '') === r.path);
    const originalSha256 = entry.sha256;
    entry.sha256 = sha256(after);
    entry.bytes = after.length;
    entry.distroRedacted = { originalSha256, reason: r.reason };
    f.data = after;
    done.push({ path: r.path, pattern: r.pattern, matches: count, originalSha256, sha256: entry.sha256, reason: r.reason });
  }
  if (done.length) manifest.distroRedactions = done;
  return done;
}

function filesUnder(repo, commit, dir, { exclude = () => false } = {}) {
  if (!treeSha(repo, commit, dir)) return [];
  const tree = listTree(repo, commit, dir).filter((f) => !exclude(f.path));
  const blobs = readBlobs(repo, tree.map((f) => f.blob));
  return tree.map((f) => ({ rel: f.path, data: blobs.get(f.blob), mode: f.mode }));
}

export function buildPackage(opts) {
  const repo = path.resolve(opts.repo ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  const release = opts.release;
  if (!release || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(release)) throw new Error('--release <name> is required');
  const version = opts.version ?? release;
  if (!VERSION_RE.test(version)) throw new Error(`bad --version ${version}`);
  const sourceCommit = resolveCommit(repo, opts.source ?? 'HEAD');
  const storeCommit = resolveCommit(repo, opts['captured-ref'] ?? 'origin/captured-store');
  const workspaceCommit = resolveCommit(repo, opts['workspace-ref'] ?? sourceCommit);
  const mtime = commitTime(repo, sourceCommit);

  const components = JSON.parse(readFile(repo, sourceCommit, 'distro/runtime/components.json').toString('utf8'));
  const tools = JSON.parse(readFile(repo, sourceCommit, 'distro/runtime/tools.json').toString('utf8'));
  const root = `v-distro-${version}`;
  const entries = [];
  const add = (rel, data, mode = 0o644) => entries.push({ path: `${root}/${rel}`, rel, data: Buffer.isBuffer(data) ? data : Buffer.from(data), mode });

  // runtime/<component>/ : the capture's manifest plus its dist bytes, checked against the manifest.
  const componentMeta = {};
  let upstream = null;
  for (const [id, c] of Object.entries(components.components)) {
    const distroOverlay = c.source === 'distro';
    const capture = distroOverlay ? `${release}.${id}` : `${release}${c.suffix}`;
    const { manifest, manifestBuf: capturedManifestBuf, files } = captureFiles(repo, sourceCommit, storeCommit, capture,
      distroOverlay ? { overlayDir: `distro/runtime/overlays/${release}/${id}` } : {});
    const redactions = applyRedactions(id, manifest, files, components.redactions ?? []);
    const manifestBuf = redactions.length ? Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) : capturedManifestBuf;
    if (id === 'core') {
      upstream = manifest.upstream;
      if (!/^\d{4}\.\d+\.\d+$/.test(upstream ?? '')) throw new Error(`core capture has no upstream version (${upstream})`);
    }
    add(`runtime/${id}/manifest.json`, manifestBuf);
    for (const f of files) add(`runtime/${id}/dist/${f.rel}`, f.data, f.mode);
    componentMeta[id] = {
      dir: `runtime/${id}`, capture, install: c.install, ...(distroOverlay ? { source: `distro/runtime/overlays/${release}/${id}` } : {}), ...(c.package ? { package: c.package } : {}),
      ...(c.pluginId ? { pluginId: c.pluginId } : {}), ...(c.lock ? { lock: c.lock } : {}), target: c.target,
      ...(id === 'core' ? { base: `openclaw@${upstream}` } : {}),
      files: files.length, captureSha256: sha256(capturedManifestBuf), capturedAt: manifest.capturedAt ?? null,
      ...(redactions.length ? { redactions } : {}),
    };
  }
  const notIncluded = Object.entries(components.notIncluded ?? {})
    .map(([suffix, reason]) => ({ capture: `${release}${suffix}`, present: fileExists(repo, sourceCommit, `release/captured/${release}${suffix}/manifest.json`), reason }));

  for (const f of filesUnder(repo, sourceCommit, 'distro/runtime/locks')) add(`runtime/locks/${f.rel}`, f.data, f.mode);
  for (const name of ['components.json', 'tools.json', 'gateway.env']) add(`runtime/${name}`, readFile(repo, sourceCommit, `distro/runtime/${name}`));
  for (const script of Object.keys(components.ops ?? {})) {
    const tree = listTree(repo, sourceCommit, path.posix.dirname(script)).find((f) => f.path === path.posix.basename(script));
    if (!tree) throw new Error(`ops script ${script} missing at ${sourceCommit}`);
    add(`runtime/ops/${path.posix.basename(script)}`, readFile(repo, sourceCommit, script), tree.mode);
  }

  // Lock files must cover every npm-installed part.
  for (const [id, c] of Object.entries(components.components)) {
    if (c.lock && !entries.some((e) => e.rel === `runtime/locks/${c.lock}/package-lock.json`)) throw new Error(`${id}: lock ${c.lock} missing`);
  }
  for (const [name, t] of Object.entries(tools.npm)) {
    if (!entries.some((e) => e.rel === `runtime/locks/${t.lock}/package-lock.json`)) throw new Error(`tool ${name}: lock ${t.lock} missing`);
  }

  // workspace/ = line B's distro/workspace/payload/ only (its README: the rest is B's
  // tooling and tests, which carry leak fixtures). Its render.mjs ships beside it so the
  // installer fills the placeholders. Empty (with a marker) until payload/ exists.
  const wsTree = treeSha(repo, workspaceCommit, 'distro/workspace/payload');
  const wsFiles = filesUnder(repo, workspaceCommit, 'distro/workspace/payload');
  for (const f of wsFiles) add(`workspace/${f.rel}`, f.data, f.mode);
  let vCoreCommit = null;
  if (wsFiles.length) {
    if (!fileExists(repo, workspaceCommit, 'distro/workspace/render.mjs')) throw new Error('distro/workspace/payload/ without distro/workspace/render.mjs: the installer could not fill its placeholders');
    add('runtime/workspace-render.mjs', readFile(repo, workspaceCommit, 'distro/workspace/render.mjs'));
    if (fileExists(repo, workspaceCommit, 'distro/workspace/V_CORE_COMMIT')) vCoreCommit = readFile(repo, workspaceCommit, 'distro/workspace/V_CORE_COMMIT').toString('utf8').trim();
  } else add('workspace/.empty', 'distro/workspace/payload/ did not exist at the workspace commit; the installer seeds nothing.\n');

  // config/ and install/
  for (const f of filesUnder(repo, sourceCommit, 'distro/install', { exclude: (p) => /\.test\.m?js$/.test(p) || p.startsWith('fixtures/') })) {
    const target = f.rel.startsWith('config/') ? f.rel : `install/${f.rel}`;
    add(target, f.data, f.mode);
  }
  add('optional/optional.json', `${JSON.stringify({
    schema: 'v-distro-optional/1',
    note: 'v-distro/1 lists the optional parts; their bytes are not shipped yet.',
    components: {
      desktop: { source: `${REPO_SLUG}:apps/v-desktop-handoff`, included: false },
      vbrowser: { source: 'vegekyd-sys/v-browser', included: false },
      voice: { source: `${REPO_SLUG}:lab/gpt-live-h5`, included: false },
    },
  }, null, 2)}\n`);

  const hits = scanSecrets(entries);
  if (hits.length) throw new Error(`secret-like content in the package: ${hits.map((h) => `${h.path} (${h.kind})`).join(', ')}`);

  const coreUpstreamSchema = JSON.parse(readFile(repo, sourceCommit, 'distro/runtime/locks/core-openclaw/package.json').toString('utf8'));
  if (coreUpstreamSchema.dependencies?.openclaw !== upstream) throw new Error(`core lock pins openclaw ${coreUpstreamSchema.dependencies?.openclaw}, capture is over ${upstream}`);

  const manifest = {
    schema: 'v-distro/1',
    version,
    release,
    upstream: { openclaw: upstream, node: tools.node.version },
    openclawSchema: components.openclawSchema?.[upstream] ?? null,
    agentId: components.agentId,
    source: {
      repo: REPO_SLUG,
      commit: sourceCommit,
      commitTime: new Date(mtime * 1000).toISOString(),
      capturedStore: storeCommit,
      workspace: wsFiles.length ? { ref: opts['workspace-ref'] ?? null, commit: workspaceCommit, tree: wsTree, vCoreCommit } : null,
    },
    components: componentMeta,
    tools,
    notIncluded,
    files: entries
      .map((e) => ({ path: e.rel, sha256: sha256(e.data), bytes: e.data.length, mode: e.mode === 0o755 ? '0755' : '0644' }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
  add('manifest.json', `${JSON.stringify(manifest, null, 1)}\n`);
  const tar = tarBytes(entries, mtime);
  const tgz = gzipDeterministic(tar);
  return { manifest, root, tar, tgz, tarSha256: sha256(tar), tgzSha256: sha256(tgz) };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const out = path.resolve(opts.out ?? 'dist-distro');
  const built = buildPackage(opts);
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${built.root}.tgz`);
  fs.writeFileSync(file, built.tgz);
  const summary = {
    file, version: built.manifest.version, release: built.manifest.release, upstream: built.manifest.upstream,
    source: built.manifest.source, tgzSha256: built.tgzSha256, tarSha256: built.tarSha256, bytes: built.tgz.length,
    files: built.manifest.files.length,
  };
  fs.writeFileSync(`${file}.json`, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(`${file}.sha256`, `${built.tgzSha256}  ${path.basename(file)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

// Compare real paths: installed scripts run through the /opt/v/current symlink.
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((err) => { console.error(`build failed: ${err.message}`); process.exit(1); });
}
