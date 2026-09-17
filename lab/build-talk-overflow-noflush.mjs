import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchTalkOverflowNoFlush } from "./patch-talk-overflow-noflush.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetPath = "assets/control-ui-boot-chat-DWTSrxxk.js";
const fixtureDir = resolve(root, "lab/fixtures/talk-overflow-noflush");
const outputDir = resolve(root, "lab/release-files/talk-overflow-noflush");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function hashManifestAssets(assets) {
  const hash = createHash("sha256");
  for (const asset of assets) {
    hash.update(asset.path); hash.update("\0");
    hash.update(String(asset.size)); hash.update("\0");
    hash.update(asset.sha256); hash.update("\n");
  }
  return hash.digest("hex");
}

export function build() {
  const bundleBefore = readFileSync(resolve(fixtureDir, "control-ui-boot-chat-DWTSrxxk.js"), "utf8");
  const manifestBefore = readFileSync(resolve(fixtureDir, "asset-manifest.json"), "utf8");
  const bundleAfter = patchTalkOverflowNoFlush(bundleBefore);

  const manifest = JSON.parse(manifestBefore);
  assert.equal(manifest.generation, hashManifestAssets(manifest.assets), "manifest generation drifted");
  const entries = manifest.assets.filter((entry) => entry.path === assetPath);
  assert.equal(entries.length, 1, "bundle manifest entry drifted");
  assert.equal(entries[0].sha256, sha256(bundleBefore), "manifest disagrees with the captured bundle");
  Object.assign(entries[0], { sha256: sha256(bundleAfter), size: Buffer.byteLength(bundleAfter) });
  manifest.generation = hashManifestAssets(manifest.assets);
  const manifestAfter = `${JSON.stringify(manifest)}\n`;

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "control-ui-boot-chat-DWTSrxxk.js"), bundleAfter);
  writeFileSync(resolve(outputDir, "asset-manifest.json"), manifestAfter);
  return {
    bundle: { before: sha256(bundleBefore), after: sha256(bundleAfter) },
    manifest: { before: sha256(manifestBefore), after: sha256(manifestAfter) },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
