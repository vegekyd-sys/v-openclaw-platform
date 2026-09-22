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

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

const ssh = (script) =>
  execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30', args.host, script], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });

// `find -print0 | xargs -0 sha256sum` keeps paths with spaces intact and covers
// every regular file, not just *.js -- a patched .json or .wasm counts too.
const hashDir = (dir) => {
  const raw = ssh(
    `cd ${shq(dir)} && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum`,
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
    `cd ${shq(args.runtime)} && tar -czf - -T -`],
  { input: list, maxBuffer: 512 * 1024 * 1024 },
);
const distDir = join(outDir, 'dist');
mkdirSync(distDir, { recursive: true });
execFileSync('tar', ['-xzf', '-', '-C', distDir], { input: tar });

// mtimes are the evidence that a supposedly immutable release dir was edited
// in place; keep them in the manifest rather than relying on memory.
const mtimes = new Map();
for (const line of ssh(
  `cd ${shq(args.runtime)} && find . -type f -print0 | LC_ALL=C sort -z | ` +
  `xargs -0 -r stat -c '%Y %n'`,
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

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
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
