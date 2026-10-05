#!/usr/bin/env node
// Capture the exact bytes by which a live OpenClaw runtime differs from its
// upstream base install, so the running release becomes reproducible from git.
//
// Read-only on the target host. Safe to run while another line is deploying:
// it only reads, and the manifest records the capture instant so a later drift
// is visible rather than silently absorbed.
//
//   node scripts/capture-production-runtime.mjs \
//     --host v \
//     --release v2026.9.1-db91.6 \
//     --runtime /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist \
//     --base    /opt/openclaw-2026.9.1-v/openclaw/dist \
//     --out     release/captured/v2026.9.1-db91.6
//
// A component with no upstream install to diff against (the worker plugin, a
// patched channel plugin) takes `--base none`: every file is captured. Use
// `--exclude node_modules` (repeatable) to leave installed dependencies out.
// `--sudo` runs the remote reads as root, for runtimes the ssh user cannot read.
// Hashing runs at nice 19 / idle IO class: the host is production.
//
// `--base npm:openclaw@2026.9.1[:dist]` diffs against the pristine published
// package, packed and hashed locally, instead of a directory on the host. Use
// it whenever the host's own "base" install may have been patched in place:
// V's /opt/openclaw-2026.9.1-v carried 18 production patches of its own, so a
// capture against it left them out.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const required = ['host', 'release', 'runtime', 'base', 'out'];
for (const key of required) {
  if (!args[key]) {
    console.error(`missing --${key}\n`);
    console.error(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 15).join('\n'));
    process.exit(2);
  }
}

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const outDir = resolve(repoRoot, args.out);

// `--sudo`: the runtime sits where the ssh user cannot read it (V's channel
// plugins under /home/openclaw/.openclaw); every remote command runs as root.
const remote = (script) => (args.sudo ? `sudo -n bash -c ${shq(script)}` : script);
const ssh = (script) =>
  execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30', args.host, remote(script)], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });

// `find -print0 | xargs -0 sha256sum` keeps paths with spaces intact and covers
// every regular file, not just *.js -- a patched .json or .wasm counts too.
const excludes = [].concat(args.exclude ?? []).filter((x) => typeof x === 'string');
const prune = excludes.map((d) => `-path ${shq(`./${d}`)} -prune -o `).join('');
const GENTLE = 'nice -n 19 ionice -c3';
const listFiles = `find . ${prune}-type f -print0 | LC_ALL=C sort -z`;
const hashDir = (dir) => {
  if (dir === 'none') return new Map();
  if (dir.startsWith('npm:')) return hashNpmPackage(dir.slice(4));
  const raw = ssh(
    `cd ${shq(dir)} && ${GENTLE} ${listFiles} | ${GENTLE} xargs -0 -r sha256sum`,
  );
  const map = new Map();
  for (const line of raw.split('\n')) {
    const m = /^([0-9a-f]{64})\s[ *](.*)$/.exec(line);
    if (m) map.set(m[2], m[1]);
  }
  return map;
};

console.error(`# hashing runtime ${args.runtime} on ${args.host}`);
const runtime = hashDir(args.runtime);
console.error(`#   ${runtime.size} files`);

console.error(`# hashing base ${args.base} on ${args.host}`);
const base = hashDir(args.base);

// A published package as base is not on the host, so the drift sentinel there
// cannot compare undeclared files with it. Keep its inventory in the repo, one
// file per package spec, for install-v-release-drift.sh to ship alongside.
if (args.base.startsWith('npm:')) {
  const inventoryPath = join(repoRoot, 'release/captured/base', `${baseInventoryName(args.base)}.json`);
  const files = Object.fromEntries([...base].sort(([a], [b]) => (a < b ? -1 : 1)));
  const body = `${JSON.stringify({ base: args.base, files }, null, 0)}\n`;
  let existing = null;
  try { existing = readFileSync(inventoryPath, 'utf8'); } catch {}
  if (existing !== null && existing !== body) {
    console.error(`FATAL: ${relative(repoRoot, inventoryPath)} already exists with different content; the published package changed?`);
    process.exit(1);
  }
  if (existing === null) {
    mkdirSync(dirname(inventoryPath), { recursive: true });
    writeFileSync(inventoryPath, body);
    console.error(`# wrote base inventory ${relative(repoRoot, inventoryPath)} (${base.size} files)`);
  }
}
console.error(`#   ${base.size} files`);

// Leftover backups from earlier in-place patching. They are not part of the
// release, but they do enter the deploy channel's directory fingerprint, so
// record them and leave their bytes on the server.
const RESIDUE = /\.(bak|orig|staged)(-.*)?$|\.(pre|predeploy)-[^/]*$/;

const diff = [];
const residue = [];
for (const [path, sha] of runtime) {
  const baseSha = base.get(path);
  // Residue is recorded whether or not the base carries it too. The base
  // install turned out to hold inherited .bak files of its own, so filtering
  // residue by "differs from base" would hide most of it.
  if (RESIDUE.test(path)) {
    residue.push({ path, sha256: sha, alsoInBase: baseSha !== undefined });
    continue;
  }
  if (baseSha === sha) continue;
  diff.push(
    baseSha === undefined
      ? { path, sha256: sha, kind: 'added' }
      : { path, sha256: sha, kind: 'modified', baseSha256: baseSha },
  );
}
residue.sort((a, b) => (a.path < b.path ? -1 : 1));
const removed = [...base.keys()].filter((p) => !runtime.has(p)).sort();
diff.sort((a, b) => (a.path < b.path ? -1 : 1));

console.error(`# divergence: ${diff.filter((f) => f.kind === 'modified').length} modified, ` +
  `${diff.filter((f) => f.kind === 'added').length} added, ${removed.length} removed, ` +
  `${residue.length} residue (recorded, not captured)`);

if (diff.length === 0) {
  console.error('# runtime is identical to base; nothing to capture');
  process.exit(0);
}

// Pull the bytes in one tar so the capture is a single consistent read.
console.error(`# fetching ${diff.length} files`);
const list = diff.map((f) => f.path).join('\n');
const tar = execFileSync(
  'ssh',
  ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30', args.host,
    remote(`cd ${shq(args.runtime)} && tar -czf - -T -`)],
  { input: list, maxBuffer: 512 * 1024 * 1024 },
);
const distDir = join(outDir, 'dist');
mkdirSync(distDir, { recursive: true });
execFileSync('tar', ['-xzf', '-', '-C', distDir], { input: tar });

// mtimes are the evidence that a supposedly immutable release dir was edited
// in place; keep them in the manifest rather than relying on memory.
const mtimes = new Map();
for (const line of ssh(
  `cd ${shq(args.runtime)} && ${listFiles} | xargs -0 -r stat -c '%Y %n'`,
).split('\n')) {
  const m = /^(\d+) (.*)$/.exec(line);
  if (m) mtimes.set(m[2], Number(m[1]));
}
for (const file of residue) {
  const mtime = mtimes.get(file.path);
  if (mtime) file.hostMtime = new Date(mtime * 1000).toISOString();
}

// Which captured bytes already existed somewhere in the repo? Anything that
// does not is a file whose only copy was on the server.
const repoBytes = indexRepoBytes(repoRoot, ['lab/release-files', 'runtime', 'patches']);

let reproducible = 0;
for (const file of diff) {
  const local = join(distDir, file.path);
  const actual = sha256File(local);
  if (actual !== file.sha256) {
    console.error(`FATAL: ${file.path} changed between hash and fetch (${actual} != ${file.sha256})`);
    process.exit(1);
  }
  file.bytes = statSync(local).size;
  const mtime = mtimes.get(file.path);
  if (mtime) file.hostMtime = new Date(mtime * 1000).toISOString();
  const known = repoBytes.get(file.sha256);
  file.alsoInRepo = known ?? null;
  if (known) reproducible += 1;
}

const platformCommit = args.platformCommit ?? tryGit(args.host, args.sourceCheckout);

const manifest = {
  release: args.release,
  capturedAt: new Date().toISOString(),
  capturedFrom: { host: args.host, runtimeDir: args.runtime, baseDir: args.base },
  upstream: args.upstream ?? null,
  platformCommit,
  note:
    'Point-in-time capture of how the live runtime diverges from its upstream base. ' +
    'These bytes are the existing production state, not a reviewed source build. ' +
    'Entries with alsoInRepo=null had no copy anywhere except the server.',
  counts: {
    runtimeFiles: runtime.size,
    baseFiles: base.size,
    modified: diff.filter((f) => f.kind === 'modified').length,
    added: diff.filter((f) => f.kind === 'added').length,
    removedFromBase: removed.length,
    alreadyInRepo: reproducible,
    capturedOnly: diff.length - reproducible,
    residue: residue.length,
  },
  removedFromBase: removed,
  files: diff,
  residue,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.error(`# wrote ${relative(repoRoot, join(outDir, 'manifest.json'))}`);
console.error(`#   ${diff.length} files captured, ${reproducible} already in repo, ` +
  `${diff.length - reproducible} were server-only`);

// Hash a published package exactly as the remote side hashes a directory:
// "./"-relative paths, regular files only, the same --exclude prunes.
function baseInventoryName(base) {
  // npm:openclaw@2026.9.1 -> openclaw@2026.9.1 ; npm:@scope/p@1:dist -> scope__p@1__dist
  return base.replace(/^npm:/, '').replace(/^@/, '').replace(/[/:]/g, '__');
}

function hashNpmPackage(spec) {
  const at = spec.lastIndexOf(':');
  const [pkg, sub] = at > spec.indexOf('@', 1) ? [spec.slice(0, at), spec.slice(at + 1)] : [spec, 'dist'];
  const work = mkdtempSync(join(tmpdir(), 'capture-base-'));
  try {
    const tgz = execFileSync('npm', ['pack', pkg, '--silent', '--pack-destination', work], {
      encoding: 'utf8',
    }).trim().split('\n').pop();
    execFileSync('tar', ['-xzf', join(work, tgz), '-C', work]);
    const root = join(work, 'package', sub);
    const skip = new Set(excludes.map((d) => join(root, d)));
    const map = new Map();
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (skip.has(full)) continue;
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) map.set(`./${relative(root, full)}`, sha256File(full));
      }
    };
    walk(root);
    return map;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = key === 'exclude' ? [].concat(out[key] ?? [], next) : next;
      i += 1;
    }
  }
  return out;
}

function shq(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function indexRepoBytes(root, dirs) {
  const index = new Map();
  const walk = (dir, label) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, label);
      else if (entry.isFile()) {
        const sha = sha256File(full);
        if (!index.has(sha)) index.set(sha, relative(root, full));
      }
    }
  };
  for (const dir of dirs) walk(join(root, dir), dir);
  return index;
}

function tryGit(host, checkout) {
  if (!checkout) return null;
  try {
    return execFileSync(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30', host,
        `git -C ${shq(checkout)} -c safe.directory=${shq(checkout)} rev-parse HEAD`],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    return null;
  }
}
