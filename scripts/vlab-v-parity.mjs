#!/usr/bin/env node
// Is shared VLab either production V, or production V plus the one release that
// is about to be promoted? Those are the only two states the shared instance is
// allowed to be in (docs/vlab-v-sync-flow.md). Anything else means a test on
// VLab says nothing about what V would do.
//
//   node scripts/vlab-v-parity.mjs
//   node scripts/vlab-v-parity.mjs --pending /abs/plan.json [--pending ...]
//   node scripts/vlab-v-parity.mjs --json
//
// Read-only on both hosts. Hashing on V runs at nice 19 / idle IO class,
// because V is production and its root filesystem is close to full.
//
// States (exit code):
//   ALIGNED   0  every compared file is byte-identical
//   AHEAD     0  every difference is a target of a --pending plan, V still has
//                that plan's `before` bytes, and VLab has the plan's new bytes
//   DIVERGED  1  anything else; the report says which files and why
//   usage     2
//
// Residue (.bak / .before-* / .predeploy-* ...) is reported but does not decide
// the state. It still has to go: it enters the deploy channel's fingerprint.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isResidue } from './lib/runtime-residue.mjs';

const args = parseArgs(process.argv.slice(2));
const vHost = args.vHost ?? 'v';
const vlabHost = args.vlabHost ?? 'vlab91';
const vUnit = args.vUnit ?? 'openclaw-gateway.service';
const vlabRuntime = args.vlabRuntime ?? '/srv/vlab-production-mirror/labs/instances/db91-parity/runtime';

// Plan targets are written relative to the VLab runtime directory
// ("openclaw/dist/x.js", "production-worker/index.mjs"). Each pair maps one of
// those prefixes to the directory that plays the same role on each host.
const vCore = args.vCore ?? detectVCore();
const vRelease = vCore.replace(/\/core$/, '');
// V runs the Feishu channel plugin from an old experiment directory, not from
// its npm project tree; VLab runs it from the npm project. Same role, so same
// pair. (Found 2026-09-24: this is where the secret-card patch landed on V.)
const vFeishu = args.vFeishu ?? '/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu';
const vlabFeishu = args.vlabFeishu ?? detectVlabFeishu();
const pairs = [
  { prefix: 'openclaw', v: vCore, vlab: `${vlabRuntime}/openclaw` },
  { prefix: 'production-worker', v: args.vWorker ?? `${vRelease}/worker`, vlab: `${vlabRuntime}/production-worker` },
  { prefix: vlabFeishu.slice(vlabRuntime.length + 1), v: vFeishu, vlab: vlabFeishu },
];

const RESIDUE = { test: isResidue };

const pending = new Map();
for (const planPath of [].concat(args.pending ?? [])) {
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  for (const file of plan.files ?? []) {
    let after = file.after ?? file.sha256 ?? null;
    if (!after && file.content) after = sha256(Buffer.from(file.content, 'base64'));
    pending.set(file.target, { plan: planPath, before: file.before ?? null, after });
  }
}

const findings = [];
const residue = { v: [], vlab: [] };
let compared = 0;

for (const pair of pairs) {
  const v = hashTree(vHost, pair.v, true);
  const vlab = hashTree(vlabHost, pair.vlab, false);
  for (const [side, tree] of [['v', v], ['vlab', vlab]]) {
    for (const [path, sha] of tree) if (RESIDUE.test(path)) residue[side].push({ target: `${pair.prefix}/${path}`, sha });
  }
  const paths = new Set([...v.keys(), ...vlab.keys()]);
  for (const path of [...paths].sort()) {
    if (RESIDUE.test(path)) continue;
    compared += 1;
    const target = `${pair.prefix}/${path}`;
    const vSha = v.get(path) ?? null;
    const vlabSha = vlab.get(path) ?? null;
    if (vSha === vlabSha) continue;
    const want = pending.get(target);
    if (want) {
      const vOk = vSha === want.before;
      const vlabOk = want.after == null || vlabSha === want.after;
      if (vOk && vlabOk) {
        findings.push({ target, kind: 'pending', plan: want.plan });
        continue;
      }
      findings.push({
        target,
        kind: vOk ? 'pending-not-deployed-on-vlab' : 'pending-base-moved-on-v',
        v: vSha, vlab: vlabSha, expectedV: want.before, expectedVlab: want.after,
      });
      continue;
    }
    findings.push({
      target,
      kind: vSha == null ? 'only-on-vlab' : vlabSha == null ? 'only-on-v' : 'differs',
      v: vSha, vlab: vlabSha,
    });
  }
}

for (const target of pending.keys()) {
  if (!findings.some((f) => f.target === target)) {
    findings.push({ target, kind: 'pending-but-identical', note: 'already on V, or not deployed to VLab' });
  }
}

const blocking = findings.filter((f) => f.kind !== 'pending');
const state = findings.length === 0 ? 'ALIGNED' : blocking.length === 0 ? 'AHEAD' : 'DIVERGED';
const report = { state, vCore, vlabRuntime, pairs, compared, pendingPlans: [].concat(args.pending ?? []), findings, residue };

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${state}: ${compared} files compared; V=${vHost}:${vCore}  VLab=${vlabHost}:${vlabRuntime}`);
  const byKind = Map.groupBy(findings, (f) => f.kind);
  for (const [kind, list] of byKind) {
    console.log(`\n${kind} (${list.length})`);
    for (const f of list) console.log(`  ${f.target}${f.v !== undefined ? `  V=${short(f.v)} VLab=${short(f.vlab)}` : ''}`);
  }
  if (residue.v.length || residue.vlab.length) {
    console.log(`\nresidue: V ${residue.v.length}, VLab ${residue.vlab.length} (not counted; still blocks deploy fingerprints)`);
  }
}
process.exit(state === 'DIVERGED' ? 1 : 0);

function hashTree(host, root, gentle) {
  const prefix = gentle ? 'nice -n 19 ionice -c3 ' : '';
  const script = `cd ${shellQuote(root)} && ${prefix}find . -path ./node_modules -prune -o -type f -print0 | ${prefix}xargs -0 -r sha256sum`;
  const out = execFileSync('ssh', ['-o', 'ConnectTimeout=15', host, `sudo sh -c ${shellQuote(script)}`], {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  const tree = new Map();
  for (const line of out.split('\n')) {
    const m = /^([0-9a-f]{64})\s+\.\/(.+)$/.exec(line);
    if (m) tree.set(m[2], m[1]);
  }
  if (tree.size === 0) throw new Error(`${host}:${root} hashed to nothing; wrong path?`);
  return tree;
}

function detectVCore() {
  // The unit file lies (25 drop-ins, last one wins); ask systemd what it runs.
  const out = execFileSync('ssh', ['-o', 'ConnectTimeout=15', vHost, `systemctl show ${vUnit} -p ExecStart --value`], { encoding: 'utf8' });
  const m = /(\/\S+)\/dist\/index\.js/.exec(out);
  if (!m) throw new Error(`cannot find dist/index.js in ${vUnit} ExecStart`);
  return m[1];
}

function detectVlabFeishu() {
  const out = execFileSync('ssh', ['-o', 'ConnectTimeout=15', vlabHost,
    `sudo sh -c 'ls -d ${vlabRuntime}/npm/projects/openclaw-feishu-*/node_modules/@openclaw/feishu'`], { encoding: 'utf8' });
  const dirs = out.split('\n').filter(Boolean);
  if (dirs.length !== 1) throw new Error(`expected one Feishu plugin under ${vlabRuntime}/npm/projects, found ${dirs.length}`);
  return dirs[0];
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function short(sha) {
  return sha ? sha.slice(0, 8) : '-';
}

function shellQuote(s) {
  return `'${String(s).replaceAll("'", `'\\''`)}'`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith('--') ? true : (i += 1, next);
    if (key === 'pending') out.pending = [].concat(out.pending ?? [], value);
    else out[key] = value;
  }
  if (out.help) {
    console.error('usage: vlab-v-parity.mjs [--pending plan.json]... [--json] [--v-core dir] [--vlab-runtime dir]');
    process.exit(2);
  }
  return out;
}
