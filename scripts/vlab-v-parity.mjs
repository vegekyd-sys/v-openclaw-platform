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
// DingTalk, WeCom (runtime code) and the sidecars: desktop handoff, secret
// entry, and V Browser (plugin, Broker, Browser Gateway). A
// component marked `blocking: false` there is reported as advisory and does
// not decide the state. A sidecar absent on both hosts is equal. A --pending
// plan may list `"sidecars": ["secret-entry"]` when the release installs one.
//
// Config is advisory only (scripts/lib/parity-config.mjs): for the Gateway
// config and the Worker config on each host, which MCP servers and plugin
// entries exist and whether each is enabled. Names and booleans only; a
// difference is reported, never decides the state.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parityPairs, resolveSidecarDirs, resolveVDirs } from './lib/runtime-components.mjs';
import { evaluateParity, parseSums } from './lib/parity.mjs';
import { compareConfigSwitches, configSwitches } from './lib/parity-config.mjs';

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
const vlabConfig = gatewayLoadPaths(vlabHost, vlabUnit, args.vlabConfig);
const vConfig = gatewayLoadPaths(vHost, vUnit, args.vConfig);
// Sidecars that are not at a fixed path: found where each host runs them.
const sidecarDirs = resolveSidecarDirs({
  loadPaths: { v: vConfig, vlab: vlabConfig },
  execStart: { v: (unit) => execStart(vHost, unit), vlab: (unit) => execStart(vlabHost, unit) },
});
const pairs = parityPairs({
  vDirs, vlabRuntime, sidecarDirs,
  vlabGlob: (rel) => (rel.includes('openclaw-feishu') && args.vlabFeishu ? [args.vlabFeishu] : listDirs(vlabHost, `${vlabRuntime}/${rel}`)),
  vlabLoadPaths: args.vlabLoadPaths ? JSON.parse(args.vlabLoadPaths) : vlabConfig.main,
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
  v: hashTree(vHost, pair.v, true, pair.optional, pair.exclude),
  vlab: hashTree(vlabHost, pair.vlab, false, pair.optional, pair.exclude),
}));
const { state, compared, findings: fileFindings, residue } = evaluateParity({ pairs, trees, pending, pendingSidecars });
// Advisory, added after the state is decided: config never changes it.
const switches = { v: vConfig.switches, vlab: vlabConfig.switches };
const config = compareConfigSwitches(switches);
const findings = [...fileFindings, ...config.findings];
const notes = pairs.filter((p) => p.note).map((p) => p.note);
const report = { state, vCore, vlabRuntime, pairs, compared, pendingPlans: [].concat(args.pending ?? []), findings, residue, notes,
  config: { compared: config.compared, switches } };

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${state}: ${compared} files compared; V=${vHost}:${vCore}  VLab=${vlabHost}:${vlabRuntime}`);
  console.log(`components: ${[...new Set(pairs.map((p) => p.component + (p.blocking === false ? ' (advisory)' : '')))].join(', ')}`);
  console.log(`config (advisory): ${config.compared} switches compared (MCP servers, plugin entries, memory-core dreaming; Gateway and Worker config)`);
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

function hashTree(host, root, gentle, optional = false, exclude = []) {
  // A sidecar the host does not run at all has no directory to hash.
  if (root == null && optional) return null;
  const prefix = gentle ? 'nice -n 19 ionice -c3 ' : '';
  // An optional (sidecar) directory may be absent: print a marker instead of failing.
  const guard = optional ? `[ -d ${shellQuote(root)} ] || { echo ABSENT; exit 0; }; ` : '';
  const prune = ['node_modules', ...exclude].map((d) => `-path ${shellQuote(`./${d}`)} -prune -o `).join('');
  const script = `${guard}cd ${shellQuote(root)} && ${prefix}find . ${prune}-type f -print0 | ${prefix}xargs -0 -r sha256sum`;
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

// The DingTalk, WeCom and V Browser plugin pairs follow what the Gateway
// actually loads: plugins.load.paths of its config, and of the Worker's copy
// (the model runs in the Worker child, which reads only that second file).
// The same two files give the advisory config switches: configSwitches()
// keeps names and booleans only, and the parsed configs are not kept.
function gatewayLoadPaths(host, unit, override) {
  const env = execFileSync('ssh', ['-o', 'ConnectTimeout=15', host, `systemctl show ${unit} -p Environment --value`], { encoding: 'utf8' });
  const config = override ?? /(?:^|\s)OPENCLAW_CONFIG_PATH=(\S+)/.exec(env)?.[1];
  if (!config) throw new Error(`cannot find OPENCLAW_CONFIG_PATH in ${host}:${unit}`);
  const read = (file) => JSON.parse(execFileSync('ssh', ['-o', 'ConnectTimeout=15', host, `sudo cat ${shellQuote(file)}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const cfg = read(config);
  const workerConfig = cfg.plugins?.entries?.['vlab-agent-worker-isolation']?.config?.workerConfigPath;
  const worker = workerConfig ? read(workerConfig) : null;
  return {
    main: cfg.plugins?.load?.paths ?? [], worker: worker?.plugins?.load?.paths ?? [],
    switches: { gateway: configSwitches(cfg), worker: configSwitches(worker) },
  };
}

function execStart(host, unit) {
  return execFileSync('ssh', ['-o', 'ConnectTimeout=15', host, `systemctl show ${shellQuote(unit)} -p ExecStart --value`], { encoding: 'utf8' });
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

function short(value) {
  // File findings carry sha256 hashes; config findings carry true/false/absent.
  if (value == null) return '-';
  return /^[0-9a-f]{64}$/.test(value) ? value.slice(0, 8) : String(value);
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
    console.error('usage: vlab-v-parity.mjs [--pending plan.json]... [--json] [--v-core dir] [--vlab-runtime dir] [--v-config file] [--vlab-config file]');
    process.exit(2);
  }
  return out;
}
