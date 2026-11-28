#!/usr/bin/env node
'use strict';

/**
 * Standalone Makaron card-runner asset preparation gate.
 *
 * This script is intentionally not wired into visible-parent-flow yet. It probes
 * local video assets, compresses videos that are too long or too large, and
 * writes a manifest that preserves both original and prepared paths.
 */

const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const ROOT = require('./workspace-root.cjs');
const DEFAULT_TMP_DIR = path.join(ROOT, 'tmp', 'makaron-prepared-assets');
const FALLBACK_TMP_DIR = path.join('/tmp', 'makaron-prepared-assets');
const MAX_DURATION_SECONDS = 20;
const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const TARGET_DURATION_SECONDS = 15;
const TARGET_SIZE_BYTES = 10 * 1024 * 1024;

function usage() {
  console.error(`Usage:
node scripts/makaron-card-runner/prepare-assets.cjs \\
  --video <path> [--video <path> ...] [--image <path> ...] [--slug <slug>] [--manifest <manifest.json>] [--out-dir <dir>] [--json] [--no-launch]

Notes:
- --no-launch is verification-only mode. It writes a manifest and planned actions
  without invoking ffmpeg.
- Local videos are compressed when duration >20s or size >20MB.
- Remote http(s) assets are skipped and passed through unchanged.
`);
  process.exit(2);
}

function take(argv, name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}

function flag(argv, name) {
  return argv.includes(name);
}

function isFlag(s) {
  return /^--/.test(String(s || ''));
}

function isRemoteUrl(s) {
  return /^https?:\/\//i.test(String(s || ''));
}

function normalizePath(p) {
  const s = String(p || '').trim();
  if (!s) return s;
  if (isRemoteUrl(s)) return s;
  if (s.startsWith('~/')) return path.join(process.env.HOME || '/root', s.slice(2));
  return path.isAbsolute(s) ? s : path.resolve(ROOT, s);
}

function takeMedia(argv) {
  const assets = [];
  let order = 1;
  let imageN = 1;
  let videoN = 1;
  const consumed = new Set();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if ((key === '--image' || key === '--video') && argv[i + 1] && !isFlag(argv[i + 1])) {
      const type = key === '--video' ? 'video' : 'image';
      const n = type === 'video' ? videoN++ : imageN++;
      assets.push({type, path: normalizePath(argv[i + 1]), originalArg: argv[i + 1], label: `${type}${n}`, order: order++});
      consumed.add(i);
      consumed.add(i + 1);
      i++;
    }
  }
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (consumed.has(i)) continue;
    if (!item || isFlag(item)) continue;
    const previous = argv[i - 1];
    if (['--image', '--video', '--slug', '--manifest', '--out-dir'].includes(previous)) continue;
    const ext = path.extname(item).toLowerCase();
    if (['.mp4', '.mov', '.webm', '.m4v', '.avi'].includes(ext)) {
      assets.push({type: 'video', path: normalizePath(item), originalArg: item, label: `video${videoN++}`, order: order++});
    }
  }
  return assets;
}

function safeName(s) {
  return String(s || '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80) || 'makaron-assets';
}

function shanghaiTimestamp() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.year}${m.month}${m.day}-${m.hour}${m.minute}${m.second}`;
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...opts});
  if (res.status !== 0) {
    const detail = String(res.stderr || res.stdout || '').trim();
    if (res.error && !detail) throw res.error;
    throw new Error(`${cmd} ${args.join(' ')} failed${detail ? `\n${detail}` : ''}`);
  }
  return res.stdout || '';
}

function fileStat(file) {
  const st = fs.statSync(file);
  return {size: st.size, mtimeMs: st.mtimeMs};
}

function probeVideo(file) {
  const st = fileStat(file);
  const out = run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'format=duration:stream=width,height,r_frame_rate',
    '-of', 'json',
    file,
  ]);
  const j = JSON.parse(out || '{}');
  const stream = (j.streams || []).find(s => s.width && s.height) || {};
  const duration = Number(j.format && j.format.duration);
  return {
    path: file,
    size: st.size,
    duration: Number.isFinite(duration) ? duration : null,
    width: stream.width || null,
    height: stream.height || null,
    fps: stream.r_frame_rate || null,
  };
}

function reasonsFor(meta) {
  const reasons = [];
  if (Number(meta.duration || 0) > MAX_DURATION_SECONDS) reasons.push('duration_gt_20s');
  if (Number(meta.size || 0) > MAX_SIZE_BYTES) reasons.push('size_gt_20mb');
  return reasons;
}

function formatMb(bytes) {
  return Number(bytes || 0) / 1024 / 1024;
}

function scaleFilter(meta) {
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  const box = height > width
    ? "w='min(720,iw)':h='min(1280,ih)'"
    : "w='min(1280,iw)':h='min(720,ih)'";
  return `scale=${box}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1`;
}

function ffmpegArgs(input, output, meta, attempt) {
  return [
    '-y',
    '-i', input,
    '-t', String(attempt.duration),
    '-map', '0:v:0',
    '-map', '0:a?',
    '-vf', scaleFilter(meta),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(attempt.crf),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    output,
  ];
}

function compressVideo(input, output, originalMeta) {
  const attempts = [
    {name: '15s-crf24', duration: TARGET_DURATION_SECONDS, crf: 24},
    {name: '15s-crf28', duration: TARGET_DURATION_SECONDS, crf: 28},
    {name: '12s-crf28', duration: 12, crf: 28},
  ];
  const records = [];
  let prepared = null;
  for (const attempt of attempts) {
    const args = ffmpegArgs(input, output, originalMeta, attempt);
    run('ffmpeg', args);
    prepared = probeVideo(output);
    records.push({
      name: attempt.name,
      durationLimit: attempt.duration,
      crf: attempt.crf,
      outputPath: output,
      prepared,
      commandSummary: `ffmpeg -t ${attempt.duration} -vf ${scaleFilter(originalMeta)} -c:v libx264 -crf ${attempt.crf} -c:a aac`,
    });
    if (Number(prepared.duration || 0) <= TARGET_DURATION_SECONDS + 0.5 && Number(prepared.size || 0) <= TARGET_SIZE_BYTES) break;
  }
  return {prepared, attempts: records};
}

function ensureOutDir(options) {
  if (options.outDir) {
    const dir = path.resolve(ROOT, options.outDir);
    fs.mkdirSync(dir, {recursive: true});
    return dir;
  }
  const leaf = `${shanghaiTimestamp()}-${safeName(options.slug || 'assets')}`;
  const preferred = path.join(DEFAULT_TMP_DIR, leaf);
  try {
    fs.mkdirSync(preferred, {recursive: true});
    return preferred;
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
    const fallback = path.join(FALLBACK_TMP_DIR, leaf);
    fs.mkdirSync(fallback, {recursive: true});
    return fallback;
  }
}

function videoOutputPath(outDir, index) {
  return path.join(outDir, `video${index}.prepared.mp4`);
}

function plannedVideoRecord(asset, index, outDir, options) {
  const preparedPath = videoOutputPath(outDir, index);
  return {
    type: 'video',
    originalPath: asset.path,
    preparedPath,
    label: asset.label,
    order: asset.order,
    status: options.noLaunch ? 'planned' : 'pending',
    reason: [],
    original: null,
    prepared: null,
    noLaunch: options.noLaunch,
  };
}

function handleImage(asset) {
  return {
    type: 'image',
    originalPath: asset.path,
    preparedPath: asset.path,
    label: asset.label,
    order: asset.order,
    status: 'passed_through',
    reason: [],
  };
}

function handleRemote(asset) {
  return {
    type: asset.type,
    originalPath: asset.path,
    preparedPath: asset.path,
    label: asset.label,
    order: asset.order,
    status: 'skipped',
    reason: ['remote_url'],
  };
}

function handleMissing(asset, index, outDir, options) {
  const rec = asset.type === 'video'
    ? plannedVideoRecord(asset, index, outDir, options)
    : handleImage(asset);
  return {
    ...rec,
    preparedPath: asset.path,
    status: options.noLaunch ? 'missing_no_launch' : 'missing',
    reason: ['missing_file'],
    error: `File not found: ${asset.path}`,
  };
}

function prepareVideo(asset, videoIndex, outDir, options) {
  if (isRemoteUrl(asset.path)) return handleRemote(asset);
  if (!fs.existsSync(asset.path)) return handleMissing(asset, videoIndex, outDir, options);

  const original = probeVideo(asset.path);
  const reason = reasonsFor(original);
  if (!reason.length) {
    return {
      type: 'video',
      originalPath: asset.path,
      preparedPath: asset.path,
      label: asset.label,
      order: asset.order,
      status: 'passed_through',
      reason,
      original,
      prepared: original,
    };
  }

  const preparedPath = videoOutputPath(outDir, videoIndex);
  if (options.noLaunch) {
    return {
      type: 'video',
      originalPath: asset.path,
      preparedPath,
      label: asset.label,
      order: asset.order,
      status: 'planned',
      reason,
      original,
      prepared: null,
      noLaunch: true,
      planned: {
        targetDurationSeconds: TARGET_DURATION_SECONDS,
        targetSizeBytes: TARGET_SIZE_BYTES,
        outputPath: preparedPath,
        commandSummary: `ffmpeg -t ${TARGET_DURATION_SECONDS} -vf ${scaleFilter(original)} -c:v libx264 -crf 24/28 -c:a aac`,
      },
    };
  }

  const {prepared, attempts} = compressVideo(asset.path, preparedPath, original);
  const ok = Number(prepared.duration || 0) <= TARGET_DURATION_SECONDS + 0.5 && Number(prepared.size || 0) <= TARGET_SIZE_BYTES;
  return {
    type: 'video',
    originalPath: asset.path,
    preparedPath,
    label: asset.label,
    order: asset.order,
    status: ok ? 'compressed' : 'blocker',
    reason: ok ? reason : [...reason, 'compressed_still_over_target'],
    original,
    prepared,
    attempts,
    blocker: ok ? undefined : `Prepared video is ${prepared.duration ? prepared.duration.toFixed(1) : '?'}s / ${formatMb(prepared.size).toFixed(1)}MB after fallback compression; target is <=15.5s / <=10MB.`,
  };
}

function toMediaAsset(record) {
  const status = record.status || '';
  const usePrepared = ['compressed', 'passed_through', 'skipped'].includes(status);
  const pathForJob = usePrepared ? record.preparedPath : record.originalPath;
  return {
    type: record.type,
    path: pathForJob,
    originalPath: record.originalPath,
    label: record.label,
    order: record.order,
    preprocess: {
      status: record.status,
      reason: record.reason || [],
      original: record.original || null,
      prepared: record.prepared || null,
      preparedPath: record.preparedPath,
      noLaunch: Boolean(record.noLaunch),
      blocker: record.blocker,
    },
  };
}

function prepareAssets(inputAssets, options = {}) {
  const outDir = ensureOutDir(options);
  let videoIndex = 0;
  const records = inputAssets.map(asset => {
    if (asset.type === 'image') return isRemoteUrl(asset.path) ? handleRemote(asset) : (fs.existsSync(asset.path) || options.noLaunch ? handleImage(asset) : handleMissing(asset, videoIndex, outDir, options));
    if (asset.type === 'video') return prepareVideo(asset, ++videoIndex, outDir, options);
    return handleRemote(asset);
  });
  const mediaAssets = records.map(toMediaAsset);
  const manifestPath = options.manifestPath
    ? path.resolve(ROOT, options.manifestPath)
    : path.join(outDir, 'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
  const manifest = {
    ok: !records.some(r => ['missing', 'blocker'].includes(r.status)),
    noLaunch: Boolean(options.noLaunch),
    createdAt: new Date().toISOString(),
    thresholds: {
      triggerDurationSeconds: MAX_DURATION_SECONDS,
      triggerSizeBytes: MAX_SIZE_BYTES,
      targetDurationSeconds: TARGET_DURATION_SECONDS,
      targetSizeBytes: TARGET_SIZE_BYTES,
    },
    outDir,
    manifestPath,
    records,
    mediaAssets,
    summary: records.map((r, i) => {
      if (r.type !== 'video') return `${r.label || `asset${i + 1}`}: ${r.status}`;
      const before = r.original ? `${r.original.duration ? r.original.duration.toFixed(1) : '?'}s / ${formatMb(r.original.size).toFixed(1)}MB` : '?';
      const after = r.prepared ? `${r.prepared.duration ? r.prepared.duration.toFixed(1) : '?'}s / ${formatMb(r.prepared.size).toFixed(1)}MB` : (r.status === 'planned' ? 'planned' : '?');
      return `${r.label || `video${i + 1}`}: ${before} -> ${after} (${r.status})`;
    }),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

function main() {
  const argv = process.argv.slice(2);
  if (flag(argv, '--help') || flag(argv, '-h')) usage();
  const assets = takeMedia(argv);
  if (!assets.length) usage();
  const options = {
    slug: take(argv, '--slug', 'makaron-assets'),
    outDir: take(argv, '--out-dir'),
    manifestPath: take(argv, '--manifest'),
    noLaunch: flag(argv, '--no-launch') || flag(argv, '--dry-run') || flag(argv, '--smoke'),
  };
  const manifest = prepareAssets(assets, options);
  if (flag(argv, '--json')) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    console.log(JSON.stringify({ok: manifest.ok, noLaunch: manifest.noLaunch, manifestPath: manifest.manifestPath, summary: manifest.summary}, null, 2));
  }
  if (!manifest.ok && !options.noLaunch) process.exit(1);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.stack || err);
    process.exit(1);
  }
}

module.exports = {
  prepareAssets,
  probeVideo,
  reasonsFor,
  ffmpegArgs,
  scaleFilter,
  constants: {
    MAX_DURATION_SECONDS,
    MAX_SIZE_BYTES,
    TARGET_DURATION_SECONDS,
    TARGET_SIZE_BYTES,
  },
};
