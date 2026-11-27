// Building blocks for distro/build/build.mjs: read files straight from git
// objects (never the working tree), write a deterministic tar, scan for secrets.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function git(repo, args, input) {
  const r = spawnSync('git', ['-C', repo, ...args], { input, maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.toString().trim()}`);
  return r.stdout;
}

export function resolveCommit(repo, ref) {
  return git(repo, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).toString().trim();
}

export function commitTime(repo, commit) {
  return Number(git(repo, ['show', '-s', '--format=%ct', commit]).toString().trim());
}

/** Tree sha of a path at a commit, or null when the path does not exist there. */
export function treeSha(repo, commit, dir) {
  const out = git(repo, ['ls-tree', '-d', '--full-tree', commit, '--', dir.replace(/\/$/, '')]).toString().trim();
  if (!out) return null;
  return out.split(/\s+/)[2];
}

/**
 * Every file under `dir` at `commit`: [{ path (relative to dir), mode, blob }].
 * Symlinks and submodules are refused: a release file is always a regular file.
 */
export function listTree(repo, commit, dir) {
  const prefix = dir.replace(/\/$/, '') + '/';
  const out = git(repo, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', prefix]).toString();
  const files = [];
  for (const rec of out.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const [mode, type, blob] = rec.slice(0, tab).split(' ');
    const full = rec.slice(tab + 1);
    if (type !== 'blob' || (mode !== '100644' && mode !== '100755')) throw new Error(`unsupported git entry ${mode} ${type} ${full}`);
    files.push({ path: full.slice(prefix.length), mode: mode === '100755' ? 0o755 : 0o644, blob });
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Contents of many blobs in one `git cat-file --batch` round trip. */
export function readBlobs(repo, blobs) {
  const unique = [...new Set(blobs)];
  const out = new Map();
  if (!unique.length) return out;
  const buf = git(repo, ['cat-file', '--batch'], unique.join('\n') + '\n');
  let at = 0;
  for (const id of unique) {
    const nl = buf.indexOf(0x0a, at);
    const header = buf.subarray(at, nl).toString();
    const [sha, type, size] = header.split(' ');
    if (sha !== id || type !== 'blob') throw new Error(`cat-file: unexpected ${header} for ${id}`);
    const n = Number(size);
    out.set(id, buf.subarray(nl + 1, nl + 1 + n));
    at = nl + 1 + n + 1;
  }
  return out;
}

export function readFile(repo, commit, file) {
  return git(repo, ['cat-file', 'blob', `${commit}:${file}`]);
}

export function fileExists(repo, commit, file) {
  const r = spawnSync('git', ['-C', repo, 'cat-file', '-e', `${commit}:${file}`]);
  return r.status === 0;
}

// ---- deterministic tar (POSIX ustar + pax headers for long names) ----

function octal(n, width) {
  return n.toString(8).padStart(width - 1, '0') + '\0';
}

function header({ name, size, mode, mtime, type = '0' }) {
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, 100, 'utf8');
  h.write(octal(mode, 8), 100, 8, 'ascii');
  h.write(octal(0, 8), 108, 8, 'ascii');
  h.write(octal(0, 8), 116, 8, 'ascii');
  h.write(octal(size, 12), 124, 12, 'ascii');
  h.write(octal(mtime, 12), 136, 12, 'ascii');
  h.fill(0x20, 148, 156);
  h.write(type, 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

const pad = (n) => Buffer.alloc((512 - (n % 512)) % 512, 0);

function paxRecord(key, value) {
  const body = ` ${key}=${value}\n`;
  let len = Buffer.byteLength(body) + 1;
  while (String(len).length + Buffer.byteLength(body) !== len) len = String(len).length + Buffer.byteLength(body);
  return `${len}${body}`;
}

/**
 * entries: [{ path, data: Buffer, mode }] (sorted by the caller or here).
 * Same entries and mtime give the same bytes on every platform.
 */
export function tarBytes(entries, mtime) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const parts = [];
  for (const e of sorted) {
    if (e.mode !== 0o644 && e.mode !== 0o755) throw new Error(`mode ${e.mode.toString(8)} for ${e.path}`);
    let name = e.path;
    if (Buffer.byteLength(name) > 100) {
      const pax = Buffer.from(paxRecord('path', e.path), 'utf8');
      parts.push(header({ name: 'PaxHeader', size: pax.length, mode: 0o644, mtime, type: 'x' }), pax, pad(pax.length));
      name = Buffer.from(e.path).subarray(0, 100).toString('utf8').replace(/�+$/, '');
    }
    parts.push(header({ name, size: e.data.length, mode: e.mode, mtime }), e.data, pad(e.data.length));
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

/** gzip with a fixed header: mtime 0 (zlib's default) and OS byte 255 (unknown) on every platform. */
export function gzipDeterministic(buf) {
  const gz = zlib.gzipSync(buf, { level: 9 });
  gz[9] = 0xff;
  return gz;
}

// ---- secret scan ----

// Strict shapes only: V's code is full of "sk-..." CSS class names and ids.
export const SECRET_PATTERNS = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['openai project key', /sk-proj-[A-Za-z0-9_-]{20,}/],
  ['deepseek-style key', /\bsk-[a-f0-9]{32}\b/],
  ['google api key', /AIza[0-9A-Za-z_-]{35}/],
  ['xai key', /\bxai-[A-Za-z0-9]{40,}/],
  ['github token', /\bgh[pousr]_[A-Za-z0-9]{36}\b/],
  ['vercel ai gateway key', /\bvck_[A-Za-z0-9]{30,}/],
  ['feishu open_id', /\bou_[0-9a-f]{32}\b/],
  ['feishu chat id', /\boc_[0-9a-f]{32}\b/],
  ['feishu app id', /\bcli_[0-9a-f]{16}\b/],
];

/** [{ path, kind }] for every match in the given entries (binary files included: byte search). */
export function scanSecrets(entries) {
  const hits = [];
  for (const e of entries) {
    const text = e.data.toString('latin1');
    for (const [kind, re] of SECRET_PATTERNS) if (re.test(text)) hits.push({ path: e.path, kind });
  }
  return hits;
}
