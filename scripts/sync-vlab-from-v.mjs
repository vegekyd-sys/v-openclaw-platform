#!/usr/bin/env node
// V changed itself; bring VLab to it. The reverse of promote-to-v.mjs.
//
// "V changed itself" covers a hotfix applied on the host, and V's own agent
// editing its runtime. The drift sentinel reports it within the hour. If the
// change is to stay, it must first become a capture in git, then reach VLab
// through the ordinary release path, so VLab keeps a record and a rollback:
//
//   1. capture V   : scripts/capture-production-runtime.mjs (every captured
//                    component of scripts/lib/runtime-components.mjs)
//                    -> PR to dev -> merged. install-v-release-drift.sh with it.
//   2. this script : node scripts/sync-vlab-from-v.mjs --name <captured release> --owner <o>          # plan
//                    node scripts/sync-vlab-from-v.mjs --name <captured release> --owner <o> --apply  # do it
//
// --apply: every file where VLab differs from V is taken from the capture in
// dev (and must hash to V's live bytes), packaged with vlab.mjs as an ordinary
// release whose `before` is VLab's current bytes, then lease -> stage ->
// deploy -> parity must be ALIGNED -> accept (evidence: the parity result) ->
// align -> release the lease.
//
// Not handled here, on purpose: a file that exists only on VLab (stage cannot
// delete), or a V file equal to the published package and therefore absent
// from the capture. Both mean VLab carries something V does not; use
// scripts/vlab-rebase-to-v.mjs for that.
//
// If the change is NOT to stay, do not use this: put V back instead
// (promote-to-v.mjs --undo, or the backup the hot patch left).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { captured, captureSourceForTarget } from './lib/runtime-components.mjs';

const args = parseArgs(process.argv.slice(2));
const repo = resolve(dirname(new URL(import.meta.url).pathname), '..');
const VLAB_TOOL = args.vlabTool ?? '/Users/tianyicai/vlab-dev/lab/vlab.mjs';
const DEV = dirname(dirname(VLAB_TOOL));
if (!args.name || !args.owner) usage('--name and --owner are required');
const id = args.id ?? `sync-from-v-${args.name}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

const git = (...a) => execFileSync('git', ['-C', DEV, ...a], { maxBuffer: 256 * 1024 * 1024 });
const vlab = (...a) => execFileSync('node', [VLAB_TOOL, ...a], { encoding: 'utf8', cwd: DEV, maxBuffer: 64 * 1024 * 1024 });
const sha = (b) => createHash('sha256').update(b).digest('hex');

// ---- what differs, and where its bytes are in git ----------------------------
const parity = runParity();
if (parity.state === 'ALIGNED') {
  console.log('VLab already equals V; nothing to sync');
  process.exit(0);
}
const commit = git('rev-parse', 'HEAD').toString().trim();
// The three original components must be in the capture. A release captured
// before DingTalk/WeCom became components lacks theirs; a difference there then
// has no source below and is refused (recapture V).
for (const c of captured().filter((x) => ['', '.worker', '.feishu'].includes(x.suffix))) {
  const manifest = `release/captured/${args.name}${c.suffix}/manifest.json`;
  try { git('cat-file', '-e', `${commit}:${manifest}`); } catch {
    fail(`${manifest} is not in dev ${commit.slice(0, 12)}: capture V and merge it first`);
  }
}
const sourceFor = (target) => captureSourceForTarget(args.name, target);

const files = [];
const refused = [];
// Sidecars are installed by their own scripts, never by a release; an advisory
// component does not block alignment, so it is not synced either.
const sidecars = parity.findings.filter((f) => !f.advisory && f.target.startsWith('sidecar:'));
if (sidecars.length) {
  console.error('Sidecars differ between V and VLab; install them on VLab from the commit V runs (UNIT_PREFIX=vlab-), then run this again:');
  for (const f of sidecars) console.error(`  ${f.kind} ${f.target}`);
  process.exit(1);
}
// VLab's Gateway copy of the Codex plugin (state/npm) is outside the release
// channel: a difference there is copied by hand, from V's capture.
const handCopy = parity.findings.filter((f) => !f.advisory && f.copy);
for (const f of parity.findings) {
  if (f.advisory || f.copy) continue;
  if (f.kind !== 'differs' && f.kind !== 'only-on-v') {
    refused.push(`${f.kind} ${f.target}`);
    continue;
  }
  const source = sourceFor(f.target);
  let bytes = null;
  try { bytes = source && git('show', `${commit}:${source}`); } catch {}
  if (!bytes) {
    refused.push(`not-in-capture ${f.target}`);
    continue;
  }
  if (sha(bytes) !== f.v) fail(`${f.target}: dev capture ${sha(bytes).slice(0, 8)} is not V's live ${f.v.slice(0, 8)}; recapture V`);
  files.push({ source, target: f.target, before: f.vlab });
}
if (handCopy.length) {
  console.error(`VLab's Gateway copy of the Codex plugin differs from V (${handCopy.length} files); the release channel cannot write it.`);
  console.error(`Copy it by hand from release/captured/${args.name}.codex/dist/ (keep owner and mode), then run this again; e.g. ${handCopy[0].kind} ${handCopy[0].target}`);
  // Otherwise the parity check after the deploy below cannot reach ALIGNED.
  process.exit(1);
}
if (refused.length) {
  console.error('These cannot go through a release (use scripts/vlab-rebase-to-v.mjs):');
  for (const r of refused) console.error(`  ${r}`);
  process.exit(1);
}

const status = JSON.parse(vlab('status'));
// A release pending on VLab (deployed, not yet on V) also shows up as "VLab
// differs from V". Syncing those files would silently revert it on VLab.
// It has to reach V (promote-to-v) or be rolled back first.
const pending = status.current?.v?.aligned === false && !status.current?.v?.syncFromV ? status.current.release : null;
if (pending) {
  const artifact = JSON.parse(execFileSync('ssh', ['-o', 'BatchMode=yes', 'vlab91',
    `sudo cat /srv/vlab-production-mirror/labs/shared-workflow/releases/${pending}/artifact.json`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const overlap = files.filter((f) => artifact.files.some((a) => a.target === f.target)).map((f) => f.target);
  if (overlap.length) {
    fail(`VLab release ${pending} is deployed but not on V yet, and syncing would revert its files:\n  ${overlap.join('\n  ')}\n` +
      `Promote it to V (scripts/promote-to-v.mjs) or roll it back first, then run this again.`);
  }
}
console.log(`sync VLab to V release ${args.name} as VLab release ${id} (dev ${commit.slice(0, 12)}, base ${status.current.release})`);
for (const f of files) console.log(`  ${f.before ? 'replace' : 'add    '} ${f.target}`);
if (!args.apply) {
  console.log('\nplan only; add --apply (restarts the shared VLab Gateway)');
  process.exit(0);
}

// ---- ordinary release path on VLab ------------------------------------------------
const work = mkdtempSync(join(tmpdir(), 'sync-vlab-'));
const planPath = join(work, 'plan.json');
writeFileSync(planPath, JSON.stringify({ baseRelease: status.current.release, files }, null, 2));
const packaged = JSON.parse(vlab('package', '--id', id, '--commit', commit, '--owner', args.owner, '--plan', planPath, '--output', join(work, `${id}.json`), '--syncFromV', args.name));
console.log(`packaged ${packaged.files} files`);
console.log(vlab('lease', '--owner', args.owner).trim());
try {
  vlab('stage', '--artifact', packaged.artifact);
  console.log('staged; deploying (restarts the shared Gateway, cold start takes minutes)');
  const receipt = JSON.parse(vlab('deploy', '--id', id, '--owner', args.owner));
  const after = runParity();
  if (after.state !== 'ALIGNED') {
    console.error(`parity after deploy is ${after.state}; not accepting. Roll back with: node lab/vlab.mjs rollback --id ${id} --owner ${args.owner}`);
    process.exit(1);
  }
  const evidence = `Synced from production V release ${args.name} (release/captured in dev ${commit.slice(0, 12)}); ` +
    `vlab-v-parity after deploy: ALIGNED, ${after.compared} files compared; ${files.length} files replaced by V's live bytes.`;
  vlab('accept', '--id', id, '--owner', args.owner, '--artifactSha', receipt.artifactSha, '--evidence', evidence);
  console.log('accepted');
  console.log(vlab('align', '--owner', args.owner).trim().slice(0, 300));
} finally {
  console.log(vlab('lease', '--owner', args.owner, '--release', 'true').trim());
}
console.log(`\nDone: VLab = V (${args.name}).`);

function runParity() {
  try {
    return JSON.parse(execFileSync('node', [join(repo, 'scripts/vlab-v-parity.mjs'), '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch (e) {
    if (e.status === 1 && e.stdout) return JSON.parse(e.stdout);
    throw e;
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function usage(msg) {
  console.error(`${msg}\nusage: sync-vlab-from-v.mjs --name <captured V release> --owner <lease owner> [--apply] [--id <vlab release id>]`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    out[key] = next === undefined || next.startsWith('--') ? true : (i += 1, next);
  }
  return out;
}
