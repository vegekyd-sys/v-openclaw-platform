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
//
// What is compared is scripts/lib/runtime-components.mjs: core, Worker, Feishu,
// DingTalk, WeCom (runtime code) and the handoff / secret-entry sidecars. A
// component marked `blocking: false` there is reported as advisory and does
// not decide the state. A sidecar absent on both hosts is equal. A --pending
// plan may list `"sidecars": ["secret-entry"]` when the release installs one.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parityPairs, resolveVDirs } from './lib/runtime-components.mjs';
import { evaluateParity, parseSums } from './lib/parity.mjs';

const args = parseArgs(process.argv.slice(2));
const vHost = args.vHost ?? 'v';
const vlabHost = args.vlabHost ?? 'vlab91';
const vUnit = args.vUnit ?? 'openclaw-gateway.service';
const vlabUnit = args.vlabUnit ?? 'openclaw-vlab-production-mirror-v8.service';
const vlabRuntime = args.vlabRuntime ?? '/srv/vlab-production-mirror/labs/instances/db91-parity/runtime';

// Plan targets are written relative to the VLab runtime directory
// ("openclaw/dist/x.js", "production-worker/index.mjs"). Each pair maps one of
// those prefixes to the directory that plays the same role on each host; the
// pairs come from scripts/lib/runtime-components.mjs (core, Worker, Feishu,
// DingTalk, WeCom, and the sidecars). V runs Feishu from an old experiment
// directory, VLab from its npm project: same role, so same pair. (Found
// 2026-09-24: this is where the secret-card patch landed on V.)
const vCore = args.vCore ?? detectVCore();
const vDirs = resolveVDirs(vCore, (glob) => listDirs(vHost, glob), {
  ...(args.vWorker ? { worker: args.vWorker } : {}), ...(args.vFeishu ? { feishu: args.vFeishu } : {}),
});
const pairs = parityPairs({
  vDirs, vlabRuntime,
  vlabGlob: (rel) => (rel.includes('openclaw-feishu') && args.vlabFeishu ? [args.vlabFeishu] : listDirs(vlabHost, `${vlabRuntime}/${rel}`)),
  vlabLoadPaths: vlabLoadPaths(),
});

const pending = new Map();
const pendingSidecars = new Set();
for (const planPath of [].concat(args.pending ?? [])) {
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  for (const file of plan.files ?? []) {
    let after = file.after ?? file.sha256 ?? null;
    if (!after && file.content) after = sha256(Buffer.from(file.content, 'base64'));
    pending.set(file.target, { plan: planPath, before: file.before ?? null, after });
  }
  // A release that also installs a sidecar (e.g. the secret-entry service) on
  // VLab names it here; differences in that sidecar are then pending, not drift.
  for (const id of plan.sidecars ?? []) pendingSidecars.add(id);
}

const trees = pairs.map((pair) => ({
  v: hashTree(vHost, pair.v, true, pair.optional),
  vlab: hashTree(vlabHost, pair.vlab, false, pair.optional),
}));
const { state, compared, findings, residue } = evaluateParity({ pairs, trees, pending, pendingSidecars });
const notes = pairs.filter((p) => p.note).map((p) => p.note);
const report = { state, vCore, vlabRuntime, pairs, compared, pendingPlans: [].concat(args.pending ?? []), findings, residue, notes };

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${state}: ${compared} files compared; V=${vHost}:${vCore}  VLab=${vlabHost}:${vlabRuntime}`);
  console.log(`components: ${[...new Set(pairs.map((p) => p.component + (p.blocking === false ? ' (advisory)' : '')))].join(', ')}`);
  for (const note of notes) console.log(`note: ${note}`);
  const byKind = Map.groupBy(findings, (f) => (f.advisory ? `advisory, does not decide the state: ${f.kind}` : f.kind));
  for (const [kind, list] of byKind) {
    console.log(`\n${kind} (${list.length})`);
    for (const f of list) console.log(`  ${f.target}${f.v !== undefined ? `  V=${short(f.v)} VLab=${short(f.vlab)}` : ''}`);
  }
  if (residue.v.length || residue.vlab.length) {
    console.log(`\nresidue: V ${residue.v.length}, VLab ${residue.vlab.length} (not counted; still blocks deploy fingerprints)`);
  }
}
process.exit(state === 'DIVERGED' ? 1 : 0);

function hashTree(host, root, gentle, optional = false) {
  const prefix = gentle ? 'nice -n 19 ionice -c3 ' : '';
  // An optional (sidecar) directory may be absent: print a marker instead of failing.
  const guard = optional ? `[ -d ${shellQuote(root)} ] || { echo ABSENT; exit 0; }; ` : '';
  const script = `${guard}cd ${shellQuote(root)} && ${prefix}find . -path ./node_modules -prune -o -type f -print0 | ${prefix}xargs -0 -r sha256sum`;
  const out = execFileSync('ssh', ['-o', 'ConnectTimeout=15', host, `sudo sh -c ${shellQuote(script)}`], {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  if (optional && out.trim() === 'ABSENT') return null;
  const tree = parseSums(out);
  if (tree.size === 0 && !optional) throw new Error(`${host}:${root} hashed to nothing; wrong path?`);
  return tree;
}

function listDirs(host, glob) {
  const out = execFileSync('ssh', ['-o', 'ConnectTimeout=15', host, `sudo sh -c ${shellQuote(`for d in ${glob}; do [ -d "$d" ] && echo "$d"; done; true`)}`], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

// The DingTalk and WeCom pairs follow what the shared Gateway actually loads.
function vlabLoadPaths() {
  if (args.vlabLoadPaths) return JSON.parse(args.vlabLoadPaths);
  const env = execFileSync('ssh', ['-o', 'ConnectTimeout=15', vlabHost, `systemctl show ${vlabUnit} -p Environment --value`], { encoding: 'utf8' });
  const config = args.vlabConfig ?? /(?:^|\s)OPENCLAW_CONFIG_PATH=(\S+)/.exec(env)?.[1];
  if (!config) throw new Error(`cannot find OPENCLAW_CONFIG_PATH in ${vlabUnit}`);
  const cfg = JSON.parse(execFileSync('ssh', ['-o', 'ConnectTimeout=15', vlabHost, `sudo cat ${shellQuote(config)}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  return cfg.plugins?.load?.paths ?? [];
}

function detectVCore() {
  // The unit file lies (25 drop-ins, last one wins); ask systemd what it runs.
  const out = execFileSync('ssh', ['-o', 'ConnectTimeout=15', vHost, `systemctl show ${vUnit} -p ExecStart --value`], { encoding: 'utf8' });
  const m = /(\/\S+)\/dist\/index\.js/.exec(out);
  if (!m) throw new Error(`cannot find dist/index.js in ${vUnit} ExecStart`);
  return m[1];
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
    console.error('usage: vlab-v-parity.mjs [--pending plan.json]... [--json] [--v-core dir] [--vlab-runtime dir] [--vlab-config file]');
    process.exit(2);
  }
  return out;
}
