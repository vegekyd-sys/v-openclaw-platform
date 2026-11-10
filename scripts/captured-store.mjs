#!/usr/bin/env node
// The dist/ bytes of release/captured/<name>/ live on the orphan branch
// `captured-store`, not on dev (docs/release-captured-store.md).
//
//   node scripts/captured-store.mjs link [--soft] [--quiet] [--verify]
//       Fill release/captured/<name>/dist of this worktree from the shared cache,
//       as copy-on-write clones (fetches the store branch if a capture is not in
//       it yet). Run after a checkout; `pnpm install` runs it too
//       (postinstall, --soft), and so does .githooks/post-checkout.
//       --verify also re-checks the cache and every copied dist/.
//
//   node scripts/captured-store.mjs publish <name>... [--remote origin]
//       After capture-production-runtime.mjs: commit release/captured/<name>/
//       (manifest + dist) onto captured-store and push it. Commit only the
//       manifest to your branch (dist/ is ignored).
//       promote-to-v.mjs --apply runs this for the captures it makes.
//
//   node scripts/captured-store.mjs check
//       CI: no dist/ file is tracked on this branch, and every manifest's files
//       are on captured-store with the recorded sha256.
//
//   node scripts/captured-store.mjs seed --from <commit>
//       One-off (done 2026-11-10): create captured-store from the
//       release/captured tree of <commit>. Refuses if the branch exists.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAPTURED, STORE_BRANCH, cacheDir, fetchStore, git, hasRef, materialize, readBlobs, repoRoot,
  sha256, storeIndex, storeRef, worktreeCaptures,
} from './lib/captured-store.mjs';

const manifestOf = (root, name) => {
  const file = path.join(root, CAPTURED, name, 'manifest.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
};
const relOf = (p) => p.replace(/^\.\//, '');

// release/captured/<name>/.dist-tree names the store tree a dist/ was copied
// from. A dist/ without it is real data (a branch that still tracks dist/, or a
// capture not published yet) and is never touched.
export const MARK = '.dist-tree';
const markOf = (root, name) => {
  try { return fs.readFileSync(path.join(root, CAPTURED, name, MARK), 'utf8').trim(); } catch { return null; }
};
const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };

// Copy a cache tree to `dest` as copy-on-write clones where the filesystem has
// them (APFS: cp -c; btrfs/xfs: --reflink): a real directory that costs no
// data blocks, and a write to it never reaches the cache or another worktree.
function cloneTree(src, dest) {
  const tmp = `${dest}.tmp-${process.pid}`;
  const copy = (flags) => {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    execFileSync('cp', [...flags, `${src}/.`, `${tmp}/`], { stdio: ['ignore', 'ignore', 'pipe'] });
  };
  const fast = process.platform === 'darwin' ? ['-c', '-R'] : process.platform === 'linux' ? ['-R', '--reflink=auto'] : null;
  try {
    copy(fast ?? ['-R']);
  } catch (e) {
    if (!fast) throw e;
    copy(['-R']); // e.g. a non-APFS volume
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(tmp, dest);
}

// Same files and bytes as the cache tree?
function sameTree(dir, entry, cache) {
  const listed = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else listed.push(r);
    }
  };
  walk(dir, '');
  if (listed.length !== entry.files.length) return false;
  const tree = path.join(cache, 'trees', entry.dist);
  return entry.files.every((f) => {
    try { return fs.readFileSync(path.join(dir, f.rel)).equals(fs.readFileSync(path.join(tree, f.rel))); } catch { return false; }
  });
}

export function link(root, { remote = 'origin', fetch = true, quiet = false, verify = false } = {}) {
  const log = quiet ? () => {} : (m) => console.log(m);
  const names = worktreeCaptures(root);
  const capturedDir = path.join(root, CAPTURED);
  const distOf = (n) => path.join(capturedDir, n, 'dist');
  const wanted = names.filter((n) => !fs.existsSync(distOf(n)) || isLink(distOf(n)) || markOf(root, n) !== null);
  const ref = storeRef(remote);
  let fetched = false;
  if (fetch && wanted.length && !hasRef(root, ref)) {
    fetchStore(root, remote);
    fetched = true;
  }
  let index = hasRef(root, ref) ? storeIndex(root, ref) : new Map();
  const absent = () => wanted.filter((n) => !index.get(n)?.dist && manifestOf(root, n).files?.length);
  if (fetch && !fetched && absent().length) {
    fetchStore(root, remote);
    index = storeIndex(root, ref);
  }
  const missing = absent();
  const cache = cacheDir(root);
  const stale = wanted.filter((n) => index.get(n)?.dist &&
    (markOf(root, n) !== index.get(n).dist || isLink(distOf(n)) || !fs.existsSync(distOf(n))));
  const built = materialize(root, cache, (verify ? wanted : stale).map((n) => index.get(n)).filter((e) => e?.dist), { verify });
  if (verify) {
    for (const n of wanted) {
      if (!stale.includes(n) && index.get(n)?.dist && !sameTree(distOf(n), index.get(n), cache)) {
        console.error(`captured-store: ${CAPTURED}/${n}/dist was modified; copying it again`);
        stale.push(n);
      }
    }
  }
  for (const name of stale) {
    const dist = index.get(name).dist;
    if (isLink(distOf(name))) fs.unlinkSync(distOf(name));
    cloneTree(path.join(cache, 'trees', dist), distOf(name));
    fs.writeFileSync(path.join(capturedDir, name, MARK), `${dist}\n`);
  }
  const local = names.length - wanted.length;
  log(`captured-store: ${names.length} captures, ${stale.length} copied now, ${built} trees built in ${cache}` +
    (local ? `, ${local} with a dist/ of their own (not published yet, or an old branch that still tracks it)` : ''));
  if (missing.length) {
    console.error(`captured-store: ${missing.length} captures are not on ${STORE_BRANCH}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''}`);
    console.error(`  whoever captured them has to run: node scripts/captured-store.mjs publish <name>`);
  }
  return { names, linked: stale.length, missing };
}

// The bytes in release/captured/<name>/dist/ match the manifest.
function verifyLocal(root, name) {
  const m = manifestOf(root, name);
  const dist = path.join(root, CAPTURED, name, 'dist');
  const bad = [];
  for (const f of m.files ?? []) {
    let actual = null;
    try { actual = sha256(fs.readFileSync(path.join(dist, relOf(f.path)))); } catch {}
    if (actual !== f.sha256) bad.push(`${f.path}: ${actual ? `sha256 ${actual.slice(0, 12)} != ${f.sha256.slice(0, 12)}` : 'missing'}`);
  }
  return bad;
}

export function publish(root, names, { remote = 'origin', push = true } = {}) {
  if (!names.length) throw new Error('publish: name at least one capture (release/captured/<name>)');
  for (const name of names) {
    const dir = path.join(root, CAPTURED, name);
    if (!fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error(`${CAPTURED}/${name}/manifest.json does not exist`);
    if (markOf(root, name) !== null || isLink(path.join(dir, 'dist'))) {
      throw new Error(`${CAPTURED}/${name}/dist was copied from ${STORE_BRANCH}: already published (recapture into a fresh dist/ to replace it)`);
    }
    const bad = verifyLocal(root, name);
    if (bad.length) throw new Error(`${name}: dist/ does not match its manifest:\n  ${bad.slice(0, 10).join('\n  ')}`);
  }
  const ref = storeRef(remote);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'captured-store-'));
  const env = { GIT_INDEX_FILE: path.join(tmp, 'index') };
  try {
    for (let attempt = 1; ; attempt += 1) {
      if (!fetchStore(root, remote)) throw new Error(`${remote} has no ${STORE_BRANCH} branch; it is created once with \`seed\``);
      const parent = git(root, ['rev-parse', ref]).trim();
      fs.rmSync(env.GIT_INDEX_FILE, { force: true });
      git(root, ['read-tree', parent], { env });
      for (const name of names) {
        git(root, ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', `${CAPTURED}/${name}`], { env });
        git(root, ['add', '-f', '--', `${CAPTURED}/${name}`], { env });
      }
      const tree = git(root, ['write-tree'], { env }).trim();
      if (tree === git(root, ['rev-parse', `${parent}^{tree}`]).trim()) {
        console.log(`captured-store: ${names.join(', ')} already on ${STORE_BRANCH} with these bytes`);
        break;
      }
      const commit = git(root, ['commit-tree', tree, '-p', parent, '-m', `captured: ${names.join(' ')}`]).trim();
      if (!push) {
        git(root, ['update-ref', ref, commit]);
        console.log(`captured-store: ${commit.slice(0, 12)} (not pushed)`);
        break;
      }
      try {
        git(root, ['push', '--quiet', remote, `${commit}:refs/heads/${STORE_BRANCH}`]);
        git(root, ['update-ref', ref, commit]);
        console.log(`captured-store: pushed ${commit.slice(0, 12)} to ${remote}/${STORE_BRANCH} (${names.join(', ')})`);
        break;
      } catch (e) {
        // Someone else published first: rebuild on their commit.
        if (attempt >= 5 || !/rejected|non-fast-forward|fetch first/i.test(String(e.stderr ?? e.message))) throw e;
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // dist/ is on the store now: mark it as a copy of that tree, so link keeps it
  // current and check / publish treat it as published.
  for (const name of names) {
    const dist = git(root, ['rev-parse', `${ref}:${CAPTURED}/${name}/dist`]).trim();
    fs.writeFileSync(path.join(root, CAPTURED, name, MARK), `${dist}\n`);
  }
}

export function check(root, { remote = 'origin', fetch = true } = {}) {
  const problems = [];
  const tracked = git(root, ['ls-files', '-z', '--', `:(glob)${CAPTURED}/*/dist/**`]).split('\0').filter(Boolean);
  if (tracked.length) {
    const names = [...new Set(tracked.map((p) => p.split('/')[2]))];
    const shown = names.slice(0, 8);
    const more = names.length > shown.length ? ` ... (${names.length} captures)` : '';
    problems.push(`${tracked.length} files under ${CAPTURED}/*/dist are tracked on this branch (${shown.join(', ')}${more}).\n` +
      `    dist/ bytes go to ${STORE_BRANCH}, only the manifest to your branch. Publish them and untrack them:\n` +
      `      node scripts/captured-store.mjs publish ${shown.join(' ')}${more}\n` +
      `      git rm -r -q --cached ${shown.map((n) => `${CAPTURED}/${n}/dist`).join(' ')}${more}`);
  }
  if (fetch) fetchStore(root, remote);
  const ref = storeRef(remote);
  if (!hasRef(root, ref)) throw new Error(`${ref} does not exist (git fetch ${remote} ${STORE_BRANCH})`);
  const index = storeIndex(root, ref);
  const want = [];
  for (const name of worktreeCaptures(root)) {
    const files = manifestOf(root, name).files ?? [];
    if (!files.length) continue;
    const entry = index.get(name);
    if (!entry?.dist) {
      if (!tracked.some((p) => p.split('/')[2] === name)) problems.push(`${name}: not on ${STORE_BRANCH}; run node scripts/captured-store.mjs publish ${name}`);
      continue;
    }
    const bySha = new Map(entry.files.map((f) => [f.rel, f.sha]));
    for (const f of files) want.push({ name, path: f.path, sha256: f.sha256, blob: bySha.get(relOf(f.path)) });
  }
  const blobs = readBlobs(root, want.filter((w) => w.blob).map((w) => w.blob));
  const digests = new Map([...blobs].map(([k, v]) => [k, sha256(v)]));
  const bad = want.filter((w) => digests.get(w.blob) !== w.sha256);
  for (const w of bad.slice(0, 20)) problems.push(`${w.name}: ${w.path} ${w.blob ? 'has other bytes on' : 'is missing from'} ${STORE_BRANCH}`);
  if (bad.length > 20) problems.push(`... and ${bad.length - 20} more`);
  return { problems, files: want.length };
}

export function seed(root, from, { remote = 'origin', push = true } = {}) {
  if (fetchStore(root, remote)) throw new Error(`${remote}/${STORE_BRANCH} already exists`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'captured-store-'));
  const env = { GIT_INDEX_FILE: path.join(tmp, 'index') };
  try {
    git(root, ['read-tree', `--prefix=${CAPTURED}/`, `${from}:${CAPTURED}`], { env });
    const tree = git(root, ['write-tree'], { env }).trim();
    const commit = git(root, ['commit-tree', tree, '-m',
      `captured-store: ${CAPTURED} as of ${git(root, ['rev-parse', '--short=12', from]).trim()}\n\n` +
      'The dist/ bytes of every production capture. dev keeps the manifests;\n' +
      'see docs/release-captured-store.md.']).trim();
    if (push) git(root, ['push', '--quiet', remote, `${commit}:refs/heads/${STORE_BRANCH}`]);
    git(root, ['update-ref', storeRef(remote), commit]);
    console.log(`captured-store: ${commit.slice(0, 12)} ${push ? `pushed to ${remote}/${STORE_BRANCH}` : '(not pushed)'}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--') && !['--remote', '--from'].includes(a)));
  const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  const positional = rest.filter((a, i) => !a.startsWith('--') && !['--remote', '--from'].includes(rest[i - 1]));
  const remote = opt('--remote') ?? 'origin';
  let root;
  try {
    root = repoRoot();
  } catch (e) {
    if (flags.has('--soft')) return 0; // e.g. pnpm install in a tarball without .git
    throw e;
  }
  if (cmd === 'link') {
    try {
      const r = link(root, { remote, quiet: flags.has('--quiet'), verify: flags.has('--verify'), fetch: !flags.has('--no-fetch') });
      return r.missing.length && !flags.has('--soft') ? 1 : 0;
    } catch (e) {
      if (!flags.has('--soft')) throw e;
      console.error(`captured-store: link skipped (${String(e.message).split('\n')[0]}); run node scripts/captured-store.mjs link later`);
      return 0;
    }
  }
  if (cmd === 'publish') {
    publish(root, positional.map((n) => n.replace(/^release\/captured\//, '').replace(/\/$/, '')), { remote, push: !flags.has('--no-push') });
    return 0;
  }
  if (cmd === 'check') {
    const { problems, files } = check(root, { remote, fetch: !flags.has('--no-fetch') });
    if (problems.length) {
      console.error(`captured-store check failed:\n  ${problems.join('\n  ')}`);
      return 1;
    }
    console.log(`captured-store: ${files} manifest entries match ${STORE_BRANCH}; no dist/ tracked`);
    return 0;
  }
  if (cmd === 'seed') {
    if (!opt('--from')) throw new Error('seed needs --from <commit>');
    seed(root, opt('--from'), { remote, push: !flags.has('--no-push') });
    return 0;
  }
  console.error('usage: captured-store.mjs link [--soft] [--quiet] [--verify] [--no-fetch] | publish <name>... | check | seed --from <commit>');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`captured-store: ${e.message}`);
    process.exitCode = 1;
  }
}
