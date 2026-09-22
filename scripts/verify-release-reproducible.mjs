#!/usr/bin/env node
// Two checks against a captured release manifest.
//
//   node scripts/verify-release-reproducible.mjs --manifest release/captured/<rel>/manifest.json
//     Repo-side, no network: every file the manifest claims must have its bytes
//     committed next to it. This is what makes "production is reproducible from
//     git" a checkable statement instead of a hope. Safe in CI.
//
//   node scripts/verify-release-reproducible.mjs --manifest <path> --host v
//     Live drift check: re-hash the runtime on the host and report every file
//     that no longer matches the manifest, plus files that appeared or vanished.
//     Read-only. This is what catches somebody patching the running release in
//     place -- the habit this whole workflow exists to retire.
//
// Exit codes: 0 clean, 1 drift or missing bytes, 2 usage error.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (!args.manifest) {
  console.error('usage: --manifest <path> [--host <ssh-host>] [--json] [--quiet]');
  process.exit(2);
}

const manifestPath = resolve(args.manifest);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const releaseDir = dirname(manifestPath);
const distDir = join(releaseDir, 'dist');

const problems = [];
const say = (line) => {
  if (!args.quiet) console.log(line);
};

// ---- repo side: does git actually hold the bytes? -------------------------

let missing = 0;
let mismatched = 0;
for (const file of manifest.files) {
  const local = join(distDir, file.path);
  let bytes;
  try {
    bytes = readFileSync(local);
  } catch {
    missing += 1;
    problems.push({ kind: 'missing-in-repo', path: file.path });
    continue;
  }
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== file.sha256) {
    mismatched += 1;
    problems.push({ kind: 'repo-bytes-differ', path: file.path, expected: file.sha256, actual: sha });
  }
  if (file.bytes !== undefined && statSync(local).size !== file.bytes) {
    problems.push({ kind: 'repo-size-differ', path: file.path });
  }
}
say(`repo: ${manifest.files.length} files declared, ${missing} missing, ${mismatched} byte-mismatched`);

// ---- live side: does the host still match the manifest? -------------------

if (args.host) {
  const runtimeDir = args.runtime ?? manifest.capturedFrom?.runtimeDir;
  if (!runtimeDir) {
    console.error('manifest has no capturedFrom.runtimeDir; pass --runtime');
    process.exit(2);
  }

  const live = new Map();
  const raw = ssh(
    args.host,
    `cd ${shq(runtimeDir)} && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum`,
  );
  for (const line of raw.split('\n')) {
    const m = /^([0-9a-f]{64})\s[ *](.*)$/.exec(line);
    if (m) live.set(m[2], m[1]);
  }

  const declared = new Map(manifest.files.map((f) => [f.path, f.sha256]));
  const declaredResidue = new Map((manifest.residue ?? []).map((f) => [f.path, f.sha256]));

  let drifted = 0;
  let vanished = 0;
  for (const [path, sha] of declared) {
    const actual = live.get(path);
    if (actual === undefined) {
      vanished += 1;
      problems.push({ kind: 'gone-from-host', path });
    } else if (actual !== sha) {
      drifted += 1;
      problems.push({ kind: 'drifted-on-host', path, expected: sha, actual });
    }
  }

  // Files the manifest never mentioned. Most are untouched upstream bytes; the
  // interesting ones are new residue and files added since the capture.
  const newResidue = [];
  for (const path of live.keys()) {
    if (declared.has(path)) continue;
    if (declaredResidue.has(path)) continue;
    if (/\.(bak|orig|staged)(-.*)?$|\.(pre|predeploy)-[^/]*$/.test(path)) {
      newResidue.push(path);
      problems.push({ kind: 'new-residue-on-host', path });
    }
  }

  say(`host ${args.host}: ${live.size} files, ${drifted} drifted, ${vanished} gone, ` +
    `${newResidue.length} new residue`);

  // The running process must be the release the manifest describes. A drop-in
  // added after the capture can repoint ExecStart without touching a byte of
  // the release directory.
  if (args.unit) {
    const execStart = ssh(args.host, `systemctl show ${shq(args.unit)} -p ExecStart --no-pager`);
    if (!execStart.includes(runtimeDir.replace(/\/dist$/, ''))) {
      problems.push({ kind: 'execstart-points-elsewhere', unit: args.unit, execStart: execStart.trim() });
      say(`host ${args.host}: ExecStart for ${args.unit} does NOT reference ${runtimeDir}`);
    } else {
      say(`host ${args.host}: ExecStart for ${args.unit} references the expected release`);
    }
  }
}

if (args.json) console.log(JSON.stringify({ manifest: manifest.release, problems }, null, 2));
else if (problems.length) {
  say('');
  for (const p of problems.slice(0, 50)) {
    say(`  ${p.kind.padEnd(26)} ${p.path ?? p.unit ?? ''}`);
  }
  if (problems.length > 50) say(`  ... and ${problems.length - 50} more`);
}

process.exit(problems.length ? 1 : 0);

function ssh(host, script) {
  return execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30', host, script], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function shq(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

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
