#!/usr/bin/env node
// Pin the npm dependency tree of one runtime part as a committed lockfile.
//
//   node distro/build/lock.mjs <name> <spec> [--before <ISO date>] [--registry <url>]
//
// Writes distro/runtime/locks/<name>/{package.json,package-lock.json}. Needs the
// network (npm resolves the tree), so it is not part of `pnpm test`; the build
// only copies the committed result. `--before` resolves ranges as they stood on
// that date, which is how a lock is made to match a host installed back then.
//
// Locks taken from V itself (copied, not generated) are marked in
// distro/runtime/components.json with "lockSource".

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const locksRoot = path.resolve(here, '../runtime/locks');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--before' || a === '--registry') out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const [name, spec] = args._;
if (!name || !spec || !/^[a-z0-9-]+$/.test(name)) {
  console.error('usage: lock.mjs <name> <pkg>@<exact version>[,<pkg>@<version>...] [--before ISO] [--registry URL]');
  process.exit(2);
}
const dependencies = {};
for (const item of spec.split(',')) {
  const at = item.lastIndexOf('@');
  if (at <= 0) throw new Error(`not <pkg>@<version>: ${item}`);
  const version = item.slice(at + 1);
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/.test(version)) throw new Error(`exact version required: ${item}`);
  dependencies[item.slice(0, at)] = version;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `v-distro-lock-${name}-`));
const pkg = { name: `v-distro-${name}`, private: true, dependencies };
fs.writeFileSync(path.join(tmp, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
const npmArgs = ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'];
if (args.before) npmArgs.push(`--before=${args.before}`);
if (args.registry) npmArgs.push(`--registry=${args.registry}`);
execFileSync('npm', npmArgs, { cwd: tmp, stdio: 'inherit' });
const dest = path.join(locksRoot, name);
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(tmp, 'package.json'), path.join(dest, 'package.json'));
fs.copyFileSync(path.join(tmp, 'package-lock.json'), path.join(dest, 'package-lock.json'));
fs.rmSync(tmp, { recursive: true, force: true });
const lock = JSON.parse(fs.readFileSync(path.join(dest, 'package-lock.json'), 'utf8'));
console.log(JSON.stringify({ name, dependencies, before: args.before ?? null, packages: Object.keys(lock.packages ?? {}).length - 1 }));
