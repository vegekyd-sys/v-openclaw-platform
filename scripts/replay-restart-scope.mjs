#!/usr/bin/env node
// Replays V's releases through the restart-scope rule (scripts/lib/restart-scope.mjs):
// for every release captured in release/captured/ inside the window, which
// targets changed against the previous capture, and would the release have
// needed a Gateway restart or only `vlab.workers.roll`?
//
//   node scripts/replay-restart-scope.mjs [--manifest release/load-manifest/v2026.9.1-db91.6.json]
//     [--from 2026-10-01T16:00:00Z] [--to 2026-10-11T16:00:00Z] [--extra-ref <git ref>] [--json]
//
// --extra-ref reads captures that exist only on another branch (manifests only,
// through `git show`), e.g. the two 10/10 releases whose capture PR #312 is open.
// Adjustments that captures cannot express (Codex plugin files, releases with
// no capture, a revert between two captures) are in release/load-manifest/replay-adjustments.json,
// each with its CHANGELOG source.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRelease, loadManifest } from './lib/restart-scope.mjs';
import { COMPONENTS } from './lib/runtime-components.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Capture path ("./x.js" relative to the captured directory) -> stage target.
const TARGET_PREFIX = {
  core: 'openclaw/dist/',
  worker: 'production-worker/',
  feishu: 'npm/projects/openclaw-feishu-captured/node_modules/@openclaw/feishu/',
  dingtalk: 'npm/projects/dingtalk-real-ai-dingtalk-connector-captured/node_modules/@dingtalk-real-ai/dingtalk-connector/',
  wecom: 'extensions/wecom-openclaw-plugin/',
  codex: 'npm/projects/openclaw-codex-captured/node_modules/@openclaw/codex/',
};
export const captureTarget = (component, path) => `${TARGET_PREFIX[component]}${path.replace(/^\.\//, '')}`;

const SUFFIXES = COMPONENTS.filter((c) => c.capture).map((c) => [c.suffix, c.id]);
export function splitCaptureName(name) {
  for (const [suffix, id] of SUFFIXES) {
    if (suffix && name.endsWith(suffix)) return { release: name.slice(0, -suffix.length), component: id };
  }
  return { release: name, component: 'core' };
}

// Every capture manifest: [{ name, release, component, capturedAt, files: Map(path -> { sha, kind }) }].
// kind is relative to the component's base: 'modified' (base has the path) or 'added'.
export function readCaptures({ root = repo, extraRef } = {}) {
  const out = new Map();
  const add = (name, manifest) => {
    const { release, component } = splitCaptureName(name);
    out.set(name, { name, release, component, capturedAt: manifest.capturedAt,
      files: new Map(manifest.files.map((f) => [f.path, { sha: f.sha256, kind: f.kind ?? 'added' }])) });
  };
  const dir = join(root, 'release/captured');
  for (const name of readdirSync(dir)) {
    const file = join(dir, name, 'manifest.json');
    if (existsSync(file)) add(name, JSON.parse(readFileSync(file, 'utf8')));
  }
  if (extraRef) {
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    let listing = '';
    try {
      listing = git('ls-tree', '--name-only', `${extraRef}:release/captured/`);
    } catch {
      console.error(`replay: ${extraRef} not available; its captures are skipped`);
    }
    for (const path of listing.split('\n').filter(Boolean)) {
      if (out.has(path)) continue;
      try {
        add(path, JSON.parse(git('show', `${extraRef}:release/captured/${path}/manifest.json`)));
      } catch { /* not a capture directory */ }
    }
  }
  return [...out.values()];
}

// Changed paths between two captures of one component, with the change kind.
// A capture lists only what differs from the base, so a path missing from one
// side is either a base file (modified / reverted) or does not exist (added / removed).
export function diffFiles(before, after) {
  const changed = [];
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(path);
    const b = after.get(path);
    if (a?.sha === b?.sha) continue;
    const change = !a ? (b.kind === 'added' ? 'added' : 'modified') : !b ? (a.kind === 'added' ? 'removed' : 'modified') : 'modified';
    changed.push({ path, change });
  }
  return changed.sort((x, y) => x.path.localeCompare(y.path));
}

// Releases (named by their core capture) inside [from, to), each with the
// targets that changed against the previous capture of the same component.
export function releaseChanges(captures, { from, to }) {
  const byComponent = Map.groupBy(captures, (c) => c.component);
  for (const list of byComponent.values()) list.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const releases = (byComponent.get('core') ?? []).filter((c) => c.capturedAt >= from && c.capturedAt < to);
  return releases.map((core) => {
    const targets = [];
    const notes = [];
    for (const [component, list] of byComponent) {
      const i = list.findIndex((c) => c.release === core.release);
      if (i < 0) continue;
      if (i === 0) { notes.push(`${component}: first capture, no baseline`); continue; }
      for (const { path, change } of diffFiles(list[i - 1].files, list[i].files)) targets.push({ target: captureTarget(component, path), change });
    }
    return { release: core.release, capturedAt: core.capturedAt, targets: sortTargets(targets), notes };
  });
}

const sortTargets = (list) => list.sort((a, b) => a.target.localeCompare(b.target));

// Adjustments: { add: { release: [{target, source}] }, split: [...], insert: [...] }.
export function applyAdjustments(releases, adjustments = {}) {
  const list = releases.map((r) => ({ ...r, targets: [...r.targets], sources: [] }));
  for (const [release, entries] of Object.entries(adjustments.add ?? {})) {
    const r = list.find((x) => x.release === release);
    if (!r) throw new Error(`adjustment for unknown release ${release}`);
    for (const e of entries) { r.targets.push({ target: e.target, change: e.change ?? 'modified' }); r.sources.push(e.source); }
    sortTargets(r.targets);
  }
  // split: one capture diff covers several releases. `keep` stays on `release`,
  // the remaining targets go to a new row `rest` placed before or after it.
  for (const s of adjustments.split ?? []) {
    const i = list.findIndex((x) => x.release === s.release);
    if (i < 0) throw new Error(`split of unknown release ${s.release}`);
    const r = list[i];
    const keep = new Set(s.keep);
    const missing = s.keep.filter((t) => !r.targets.some((x) => x.target === t));
    if (missing.length) throw new Error(`split ${s.release}: ${missing.join(', ')} not in its diff`);
    const rest = { release: s.rest.release, capturedAt: r.capturedAt, targets: r.targets.filter((t) => !keep.has(t.target)),
      notes: [], sources: [s.rest.source], synthetic: true };
    list[i] = { ...r, targets: r.targets.filter((t) => keep.has(t.target)), sources: [...r.sources, s.source] };
    list.splice(s.rest.position === 'after' ? i + 1 : i, 0, rest);
  }
  return list;
}

function main(argv) {
  const args = Object.fromEntries(argv.reduce((acc, a, i) => (a.startsWith('--') ? [...acc, [a.slice(2), argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[i + 1]]] : acc), []));
  const manifest = loadManifest(resolve(repo, args.manifest ?? 'release/load-manifest/v2026.9.1-db91.6.json'));
  const adjustmentsFile = resolve(repo, args.adjustments ?? 'release/load-manifest/replay-adjustments.json');
  const adjustments = existsSync(adjustmentsFile) ? JSON.parse(readFileSync(adjustmentsFile, 'utf8')) : {};
  const captures = readCaptures({ extraRef: args['extra-ref'] ?? adjustments.extraRef });
  const releases = applyAdjustments(releaseChanges(captures, {
    from: args.from ?? adjustments.window?.from ?? '2026-10-01T16:00:00Z',
    to: args.to ?? adjustments.window?.to ?? '2026-10-11T16:00:00Z',
  }), adjustments);
  const reviewed = adjustments.workerBehavior ?? {};
  const rows = releases.map((r) => {
    const workerBehavior = Object.fromEntries(Object.entries(reviewed[r.release] ?? {}).filter(([t]) => r.targets.some((x) => x.target === t)));
    return { ...r, ...classifyRelease(r.targets, manifest, { workerBehavior }) };
  });
  if (args.json) {
    console.log(JSON.stringify(rows, null, 1));
    return;
  }
  const short = (t) => t.replace(/^openclaw\/dist\//, 'core:').replace(/^production-worker\//, 'worker:')
    .replace(/^npm\/projects\/openclaw-feishu-captured\/node_modules\/@openclaw\/feishu\//, 'feishu:')
    .replace(/^npm\/projects\/openclaw-codex-captured\/node_modules\/@openclaw\/codex\//, 'codex:')
    .replace(/^npm\/projects\/dingtalk-[^/]+\/node_modules\/@dingtalk-real-ai\/dingtalk-connector\//, 'dingtalk:')
    .replace(/^extensions\/wecom-openclaw-plugin\//, 'wecom:');
  console.log('| # | 发版 | 变更文件 | 判定 | 触发重启的文件（范围） / 只需 roll 的文件 |');
  console.log('|---|---|---|---|---|');
  rows.forEach((r, i) => {
    const fmt = (f) => `${short(f.target)}（${f.change === 'modified' ? '' : `${f.change}, `}${f.scope}）`;
    const detail = r.verdict === 'worker-roll-only'
      ? r.files.map(fmt).join('、')
      : r.triggers.map(fmt).join('、') || '（无文件）';
    console.log(`| ${i + 1} | ${r.release}${r.synthetic ? '*' : ''} | ${r.targets.length} | ${r.verdict} | ${detail} |`);
  });
  const roll = rows.filter((r) => r.verdict === 'worker-roll-only').length;
  const empty = rows.filter((r) => r.targets.length === 0).length;
  console.log(`\n${rows.length} releases: ${roll} worker-roll-only, ${rows.length - roll - empty} restart-required, ${empty} with no file change in any capture or adjustment.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
