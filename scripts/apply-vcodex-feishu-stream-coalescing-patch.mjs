#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));

const distDir = args.get("--dist") ? resolve(args.get("--dist")) : null;
const rootDir = args.get("--root") ? resolve(args.get("--root")) : null;
const backupDir = args.get("--backup-dir") ? resolve(args.get("--backup-dir")) : null;
const dryRun = args.has("--dry-run");
const allowMissing = args.has("--allow-missing");

if (Boolean(distDir) === Boolean(rootDir)) {
  throw new Error("Specify exactly one of --dist=/path/to/dist or --root=/path/to/npm/projects");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function findBundles() {
  const distDirs = [];
  if (distDir) {
    distDirs.push(distDir);
  } else if (existsSync(rootDir)) {
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(rootDir, entry.name, "node_modules", "@openclaw", "feishu", "dist");
      if (existsSync(candidate)) distDirs.push(candidate);
    }
  }

  return distDirs.flatMap((candidateDist) => readdirSync(candidateDist)
    .filter((name) => /^monitor\.account-.*\.js$/.test(name))
    .map((name) => join(candidateDist, name)));
}

const bundles = findBundles();
if (bundles.length === 0 && allowMissing) {
  process.stdout.write(JSON.stringify({ changed: false, status: "plugin-not-installed" }) + "\n");
  process.exit(0);
}
if (bundles.length !== 1) {
  throw new Error(`Expected exactly one Feishu monitor bundle, found ${bundles.length}`);
}

const file = bundles[0];
const source = readFileSync(file, "utf8");
const patchedMarkers = [
  "let streamingFlushScheduled = false;",
  "let latestStreamingCombined = null;",
  "while (latestStreamingCombined !== null)",
  "streamText = mergeStreamingText(streamText, nextText)",
];

if (patchedMarkers.every((marker) => source.includes(marker))) {
  process.stdout.write(JSON.stringify({
    changed: false,
    file,
    sha256: sha256(source),
    status: "already-patched",
  }) + "\n");
  process.exit(0);
}

const replacements = [
  {
    label: "coalescing state",
    before: `\tlet sentIndependentBlockText = false;
\tlet partialUpdateQueue = Promise.resolve();
\tlet streamingStartPromise = null;`,
    after: `\tlet sentIndependentBlockText = false;
\tlet partialUpdateQueue = Promise.resolve();
\tlet streamingFlushScheduled = false;
\tlet latestStreamingCombined = null;
\tlet streamingStartPromise = null;`,
  },
  {
    label: "latest-snapshot update pump",
    before: `\tconst flushStreamingCardUpdate = (combined) => {
\t\tpartialUpdateQueue = partialUpdateQueue.then(async () => {
\t\t\tif (streamingStartPromise) await streamingStartPromise;
\t\t\tif (streaming?.isActive()) await streaming.update(combined);
\t\t});
\t};`,
    after: `\tconst flushStreamingCardUpdate = (combined) => {
\t\tlatestStreamingCombined = combined;
\t\tif (streamingFlushScheduled) return;
\t\tstreamingFlushScheduled = true;
\t\tpartialUpdateQueue = partialUpdateQueue.then(async () => {
\t\t\ttry {
\t\t\t\twhile (latestStreamingCombined !== null) {
\t\t\t\t\tconst nextCombined = latestStreamingCombined;
\t\t\t\t\tlatestStreamingCombined = null;
\t\t\t\t\tif (streamingStartPromise) await streamingStartPromise;
\t\t\t\t\tif (streaming?.isActive()) await streaming.update(nextCombined);
\t\t\t\t}
\t\t\t} finally {
\t\t\t\tstreamingFlushScheduled = false;
\t\t\t}
\t\t});
\t};`,
  },
  {
    label: "idempotent delta merge",
    before: `\t\tif ((options?.mode ?? "snapshot") === "delta") streamText = \`\${streamText}\${nextText}\`;`,
    after: `\t\tif ((options?.mode ?? "snapshot") === "delta") streamText = mergeStreamingText(streamText, nextText);`,
  },
  {
    label: "coalescing reset",
    before: `\t\tstreaming = null;
\t\tstreamingStartPromise = null;
\t\tpartialUpdateQueue = Promise.resolve();
\t\tstreamText = "";`,
    after: `\t\tstreaming = null;
\t\tstreamingStartPromise = null;
\t\tpartialUpdateQueue = Promise.resolve();
\t\tstreamingFlushScheduled = false;
\t\tlatestStreamingCombined = null;
\t\tstreamText = "";`,
  },
];

let updated = source;
for (const replacement of replacements) {
  const first = updated.indexOf(replacement.before);
  const last = updated.lastIndexOf(replacement.before);
  if (first < 0 || first !== last) {
    throw new Error(`${replacement.label} signature changed; refusing to patch ${file}`);
  }
  updated = updated.replace(replacement.before, replacement.after);
}

if (updated === source || !patchedMarkers.every((marker) => updated.includes(marker))) {
  throw new Error(`Patch verification failed for ${file}`);
}

const result = {
  changed: !dryRun,
  dryRun,
  file,
  beforeSha256: sha256(source),
  afterSha256: sha256(updated),
  status: dryRun ? "would-patch" : "patched",
};

if (!dryRun) {
  if (!backupDir) throw new Error("--backup-dir is required unless --dry-run is used");
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupFile = join(backupDir, `${basename(file)}.${result.beforeSha256}.before`);
  if (!existsSync(backupFile)) copyFileSync(file, backupFile);
  writeFileSync(file, updated);
  result.backupFile = backupFile;
}

process.stdout.write(JSON.stringify(result) + "\n");
