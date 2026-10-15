#!/usr/bin/env node
/**
 * V patch: keep DingTalk group peer ids case-exact in session keys.
 *
 * Root cause it repairs (2026-10-15):
 * OpenClaw folds session peer ids to lowercase unless the channel/peer-kind is
 * registered in CASE_PRESERVING_PEERS. DingTalk openConversationId is
 * case-sensitive base64 (`cidvcoS13FzQXFw5ZNRTUMU2Q==`), so the folded session
 * key / stored delivery target produces
 *   POST /v1.0/robot/groupMessages/send -> 400 invalid.openConversationId
 * for every proactive send (captions and file attachments) from a session.
 * Inbound-reply announces carried the raw id and therefore worked, which is why
 * the same group received some messages and failed on others.
 *
 * Fix: register `dingtalk-connector` + peer kind `group` with span "segment",
 * exactly like the existing `signal` entry. Segment-preserved channels keep the
 * permissive folded-alias fallback inside core's store-entry/delivery lookup
 * (`foldedSessionKeyAliasCandidates`), so already-stored lowercase sessions are
 * still resolved as legacy aliases instead of being split.
 *
 * Usage:
 *   node scripts/patch-openclaw91-dingtalk-peer-case.mjs <coreRoot> --check
 *   node scripts/patch-openclaw91-dingtalk-peer-case.mjs <coreRoot> --apply
 *   node scripts/patch-openclaw91-dingtalk-peer-case.mjs <coreRoot> --rollback
 */
import { chmod, chown, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SUPPORTED_PACKAGE_VERSIONS = new Set(['2026.9.1']);
const BACKUP_SUFFIX = '.v-dingtalk-peer-case-v1.bak';
const APPLIED_SHA_SUFFIX = '.v-dingtalk-peer-case-v1.sha';
const PATCH_MARKER = 'v-dingtalk-peer-case-v1';

/** dist/session-key-*.js (pretty-printed bundle) */
const PRETTY_ANCHOR = `const CASE_PRESERVING_PEERS = [{
\tchannel: "signal",`;
const PRETTY_PATCHED = `const CASE_PRESERVING_PEERS = [{
\t// ${PATCH_MARKER}: DingTalk group openConversationId is case-sensitive base64.
\t// Folding it makes DingTalk reject proactive sends (400 invalid.openConversationId).
\tchannel: "dingtalk-connector",
\tpeerKinds: /* @__PURE__ */ new Set(["group"]),
\tspan: "segment",
\tunscoped: true
}, {
\tchannel: "signal",`;

/** dist/worker/worker.mjs (minified bundle, second copy of the registry) */
const MIN_ANCHOR = 'CASE_PRESERVING_PEERS=[{channel:`signal`,';
const MIN_PATCHED =
  'CASE_PRESERVING_PEERS=[{channel:`dingtalk-connector`,peerKinds:new Set([`group`]),span:`segment`,unscoped:!0},{channel:`signal`,';

export function patchDingtalkPeerCase(source, shape) {
  const anchor = shape === 'min' ? MIN_ANCHOR : PRETTY_ANCHOR;
  const patched = shape === 'min' ? MIN_PATCHED : PRETTY_PATCHED;
  const already = source.includes(patched);
  if (already) return { changed: false, source };
  if (source.includes(PATCH_MARKER)) {
    throw new Error(`${PATCH_MARKER}: patch marker present but patched anchor missing (partial or drifted)`);
  }
  const first = source.indexOf(anchor);
  if (first === -1) throw new Error(`${PATCH_MARKER}: anchor not found (${shape})`);
  if (source.indexOf(anchor, first + anchor.length) !== -1) {
    throw new Error(`${PATCH_MARKER}: anchor not unique (${shape})`);
  }
  const next = `${source.slice(0, first)}${patched}${source.slice(first + anchor.length)}`;
  return { changed: true, source: next };
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function readPackageVersion(root) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  return pkg.version;
}

export async function resolveTargets(coreRoot) {
  const dist = path.join(coreRoot, 'dist');
  const pretty = path.join(dist, 'session-key-CRjxKW0X.js');
  const worker = path.join(dist, 'worker', 'worker.mjs');
  const targets = [];
  for (const [file, shape] of [[pretty, 'pretty'], [worker, 'min']]) {
    try {
      const info = await stat(file);
      if (info.isFile()) targets.push({ file, shape });
    } catch {
      // A different release cut may rename chunk hashes; anchor scanning below
      // reports the miss instead of silently patching nothing.
    }
  }
  return targets;
}

async function main() {
  const [coreRootArg, mode] = process.argv.slice(2);
  if (!coreRootArg || !['--check', '--apply', '--rollback'].includes(mode)) {
    console.error('usage: patch-openclaw91-dingtalk-peer-case.mjs <coreRoot> --check|--apply|--rollback');
    process.exit(2);
  }
  const coreRoot = path.resolve(coreRootArg);
  const version = await readPackageVersion(coreRoot);
  if (!SUPPORTED_PACKAGE_VERSIONS.has(version)) {
    throw new Error(`unsupported OpenClaw version ${version}; expected ${[...SUPPORTED_PACKAGE_VERSIONS].join(', ')}`);
  }

  const targets = await resolveTargets(coreRoot);
  if (targets.length === 0) throw new Error('no dist bundles found under coreRoot/dist');

  const report = [];
  for (const target of targets) {
    const original = await readFile(target.file);
    const source = original.toString('utf8');
    if (mode === '--rollback') {
      const backup = `${target.file}${BACKUP_SUFFIX}`;
      let backupSource;
      try {
        backupSource = await readFile(backup, 'utf8');
      } catch {
        report.push({ file: path.relative(coreRoot, target.file), action: 'no-backup' });
        continue;
      }
      if (source === backupSource) {
        report.push({ file: path.relative(coreRoot, target.file), action: 'already-rolled-back' });
        continue;
      }
      let appliedSha = '';
      try {
        appliedSha = (await readFile(`${target.file}${APPLIED_SHA_SUFFIX}`, 'utf8')).trim();
      } catch {
        report.push({ file: path.relative(coreRoot, target.file), action: 'no-manifest' });
        continue;
      }
      if (appliedSha !== sha256(original)) {
        report.push({
          file: path.relative(coreRoot, target.file),
          action: 'refused-drifted',
          sha256Now: sha256(original),
          sha256Applied: appliedSha,
        });
        continue;
      }
      await writeFile(target.file, backupSource);
      report.push({
        file: path.relative(coreRoot, target.file),
        action: 'rolled-back',
        sha256Restored: sha256(Buffer.from(backupSource)),
      });
      continue;
    }

    const { changed, source: next } = patchDingtalkPeerCase(source, target.shape);
    if (mode === '--check') {
      report.push({
        file: path.relative(coreRoot, target.file),
        shape: target.shape,
        changed,
        sha256Before: sha256(original),
        sha256After: sha256(Buffer.from(next)),
      });
      continue;
    }
    if (!changed) {
      report.push({ file: path.relative(coreRoot, target.file), action: 'already-patched' });
      continue;
    }
    const info = await stat(target.file);
    const backup = `${target.file}${BACKUP_SUFFIX}`;
    await writeFile(backup, original);
    await chmod(backup, info.mode & 0o777);
    await writeFile(target.file, next);
    await chown(target.file, info.uid, info.gid).catch(() => {});
    await writeFile(`${target.file}${APPLIED_SHA_SUFFIX}`, `${sha256(Buffer.from(next))}\n`);
    report.push({
      file: path.relative(coreRoot, target.file),
      action: 'patched',
      sha256Before: sha256(original),
      sha256After: sha256(Buffer.from(next)),
    });
  }
  console.log(JSON.stringify({ patch: PATCH_MARKER, version, mode, report }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(String(error?.message ?? error));
    process.exit(1);
  });
}
