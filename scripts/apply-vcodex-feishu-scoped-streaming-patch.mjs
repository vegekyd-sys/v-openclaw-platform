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
  "function resolveVcodexScopedRenderMode(params)",
  "V_FEISHU_VCODEX_STREAM_CHAT_IDS",
  "VLAB_VCODEX_ACCEPTANCE_CHAT_ID",
  "resolveVcodexScopedRenderMode({",
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

const dispatcherSignature = "function createFeishuReplyDispatcher(params) {";
const dispatcherOffset = source.indexOf(dispatcherSignature);
if (dispatcherOffset < 0 || dispatcherOffset !== source.lastIndexOf(dispatcherSignature)) {
  throw new Error(`Dispatcher signature changed; refusing to patch ${file}`);
}

const renderModeSignature = '\tconst renderMode = account.config?.renderMode ?? "auto";';
const renderModeOffset = source.indexOf(renderModeSignature);
if (renderModeOffset < 0 || renderModeOffset !== source.lastIndexOf(renderModeSignature)) {
  throw new Error(`Render-mode signature changed; refusing to patch ${file}`);
}

const helper = `function resolveVcodexScopedRenderMode(params) {
\tconst fallback = params.renderMode ?? "auto";
\tconst configuredChatIds = process.env.V_FEISHU_VCODEX_STREAM_CHAT_IDS ?? process.env.VLAB_VCODEX_ACCEPTANCE_CHAT_ID ?? "";
\tconst scopedChatIds = new Set(configuredChatIds.split(",").map((value) => value.trim()).filter((value) => value.startsWith("oc_")));
\treturn scopedChatIds.has(params.chatId) ? "card" : fallback;
}
`;

let updated = source.replace(dispatcherSignature, `${helper}${dispatcherSignature}`);
updated = updated.replace(
  renderModeSignature,
  '\tconst renderMode = resolveVcodexScopedRenderMode({ chatId, renderMode: account.config?.renderMode });',
);

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
