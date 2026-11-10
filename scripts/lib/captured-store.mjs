// Where the bytes of release/captured/<name>/dist/ live, now that they are not
// on dev (docs/release-captured-store.md).
//
// dev keeps every capture's manifest.json (and the other small files next to
// it); the dist/ bytes are committed to the orphan branch `captured-store` of
// the same GitHub repository, under the same paths. Git stores each distinct
// file once, so the ~550 captures (1.8 GB as a checkout, 66k files) are about
// 1.1k distinct blobs / 65 MB in the object store.
//
// A worktree gets them back as real directories, copied from a cache:
//   <git common dir>/v-captured/trees/<dist tree sha>  --cp -c-->  release/captured/<name>/dist
// The cache is next to the object store, so every worktree of one clone shares
// it; inside it each distinct blob is one file, hard-linked into the trees that
// contain it (65 MB in all). The copies are APFS clones (reflinks on Linux
// where available): no data blocks of their own, and writing to one changes
// only that file. Paths in tests, lab scripts and docs stay the same.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STORE_BRANCH = 'captured-store';
export const CAPTURED = 'release/captured';

export function git(cwd, args, opts = {}) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: opts.encoding === 'buffer' ? null : (opts.encoding ?? 'utf8'),
    maxBuffer: 2 * 1024 * 1024 * 1024,
    stdio: ['pipe', 'pipe', opts.quiet ? 'ignore' : 'pipe'],
    input: opts.input,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
}

export const storeRef = (remote = 'origin') => `refs/remotes/${remote}/${STORE_BRANCH}`;

export function repoRoot(cwd = process.cwd()) {
  return git(cwd, ['rev-parse', '--show-toplevel']).trim();
}

export function cacheDir(root) {
  if (process.env.V_CAPTURED_CACHE) return path.resolve(process.env.V_CAPTURED_CACHE);
  const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
  return path.join(common, 'v-captured');
}

export function hasRef(root, ref) {
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

// Fetch the store branch into refs/remotes/<remote>/captured-store. Returns
// false when the remote has no such branch (yet).
export function fetchStore(root, remote = 'origin') {
  try {
    git(root, ['fetch', '--quiet', '--no-tags', remote,
      `+refs/heads/${STORE_BRANCH}:${storeRef(remote)}`]);
    return true;
  } catch (e) {
    if (/couldn't find remote ref/i.test(String(e.stderr ?? e.message))) return false;
    throw e;
  }
}

// Every blob and dist tree under release/captured/ in `ref`, by capture name.
//   Map<name, { dist: <tree sha> | null, files: [{ mode, sha, rel }] }>
export function storeIndex(root, ref) {
  const out = new Map();
  const raw = git(root, ['ls-tree', '-r', '-t', '-z', '--full-tree', ref, '--', `${CAPTURED}/`]);
  for (const rec of raw.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const [mode, type, sha] = rec.slice(0, tab).split(' ');
    const parts = rec.slice(tab + 1).split('/');
    // release / captured / <name> / dist / ...
    if (parts.length < 4 || parts[3] !== 'dist') continue;
    const name = parts[2];
    if (!out.has(name)) out.set(name, { dist: null, files: [] });
    const entry = out.get(name);
    if (parts.length === 4 && type === 'tree') entry.dist = sha;
    else if (type === 'blob') entry.files.push({ mode, sha, rel: parts.slice(4).join('/') });
  }
  return out;
}

// Contents of many blobs at once: Map<sha, Buffer>.
export function readBlobs(root, shas) {
  const out = new Map();
  const list = [...new Set(shas)];
  for (let i = 0; i < list.length; i += 2000) {
    const chunk = list.slice(i, i + 2000);
    const buf = git(root, ['cat-file', '--batch'], { encoding: 'buffer', input: `${chunk.join('\n')}\n` });
    let at = 0;
    while (at < buf.length) {
      const nl = buf.indexOf(10, at);
      const [sha, type, size] = buf.subarray(at, nl).toString().split(' ');
      if (type === 'missing') throw new Error(`blob ${sha} missing from the object store`);
      const n = Number(size);
      out.set(sha, buf.subarray(nl + 1, nl + 1 + n));
      at = nl + 1 + n + 1;
    }
  }
  return out;
}

const gitBlobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Make <cache>/trees/<dist sha>/ exist for each capture in `entries`. Each
// tree is built in a temp dir and renamed into place, so a concurrent run in
// another worktree either sees a whole tree or none.
export function materialize(root, cache, entries, { verify = false } = {}) {
  const objects = path.join(cache, 'objects');
  const trees = path.join(cache, 'trees');
  fs.mkdirSync(objects, { recursive: true });
  fs.mkdirSync(trees, { recursive: true });
  const objectPath = (f) => path.join(objects, f.mode === '100755' ? `${f.sha}.x` : f.sha);

  if (verify) {
    // Every file of a built tree is a hard link of its object. A file that was
    // replaced (copied over, renamed over) has its own inode: rebuild the tree.
    for (const e of entries) {
      const dir = path.join(trees, e.dist ?? '');
      if (!e.dist || !fs.existsSync(dir)) continue;
      let count = 0;
      const walk = (d) => { for (const x of fs.readdirSync(d, { withFileTypes: true })) x.isDirectory() ? walk(path.join(d, x.name)) : (count += 1); };
      walk(dir);
      const intact = count === e.files.length && e.files.every((f) => {
        if (f.mode === '120000') return true;
        try { return fs.statSync(path.join(dir, f.rel)).ino === fs.statSync(objectPath(f)).ino; } catch { return false; }
      });
      if (!intact) {
        console.error(`captured-store: cache tree ${e.dist} was modified; rebuilding it`);
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
  const todo = entries.filter((e) => e.dist && !fs.existsSync(path.join(trees, e.dist)));
  const files = todo.flatMap((e) => e.files);
  const need = files.filter((f) => f.mode !== '120000' && !fs.existsSync(objectPath(f)));
  const repair = [];
  if (verify) {
    // A write into a cache tree lands in the shared object (all hard links
    // are one inode). Re-hash what is there and repair it in place, so every
    // tree linking that inode gets the right bytes back.
    for (const name of fs.readdirSync(objects)) {
      const p = path.join(objects, name);
      const sha = name.replace(/\.x$/, '');
      if (/^[0-9a-f]{40}$/.test(sha) && gitBlobSha(fs.readFileSync(p)) !== sha) {
        console.error(`captured-store: ${p} was modified; restoring it from git`);
        repair.push({ sha, path: p });
      }
    }
  }
  if (need.length || repair.length) {
    const blobs = readBlobs(root, [...need, ...repair].map((f) => f.sha));
    for (const f of need) {
      const tmp = `${objectPath(f)}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, blobs.get(f.sha), { mode: f.mode === '100755' ? 0o755 : 0o644 });
      fs.renameSync(tmp, objectPath(f));
    }
    for (const f of repair) fs.writeFileSync(f.path, blobs.get(f.sha));
  }
  const links = files.filter((f) => f.mode === '120000');
  const linkTargets = links.length ? readBlobs(root, links.map((f) => f.sha)) : new Map();
  for (const e of todo) {
    const tmp = path.join(trees, `.tmp-${e.dist}-${process.pid}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const f of e.files) {
      const dest = path.join(tmp, f.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (f.mode === '120000') fs.symlinkSync(linkTargets.get(f.sha).toString(), dest);
      else fs.linkSync(objectPath(f), dest);
    }
    fs.mkdirSync(tmp, { recursive: true });
    try {
      fs.renameSync(tmp, path.join(trees, e.dist));
    } catch (err) {
      // Another worktree finished the same tree first.
      fs.rmSync(tmp, { recursive: true, force: true });
      if (!fs.existsSync(path.join(trees, e.dist))) throw err;
    }
  }
  return todo.length;
}

// Capture names in this worktree: every directory release/captured/<name>/
// (nearly all have a manifest.json; three early ones only a capture-provenance.json).
export function worktreeCaptures(root) {
  const dir = path.join(root, CAPTURED);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

// The bytes of release/captured/<name>/dist/<rel>: the worktree first (a
// symlinked or not-yet-published capture), then the store branch, then the
// given commit (captures from before the move are still in dev's history).
export function capturedBytes(root, file, { remote = 'origin', commit } = {}) {
  const local = path.join(root, file);
  if (fs.existsSync(local)) return fs.readFileSync(local);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const ref of [storeRef(remote), commit].filter(Boolean)) {
      try {
        return git(root, ['show', `${ref}:${file}`], { encoding: 'buffer', quiet: true });
      } catch {}
    }
    if (attempt === 0) {
      try { fetchStore(root, remote); } catch {}
    }
  }
  return null;
}
