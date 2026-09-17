import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchTalkPlaybackBuffer } from "./patch-talk-playback-buffer.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetPath = "assets/control-ui-boot-shared-VfuwipMj.js";
const bundleTarget = `openclaw/dist/control-ui/${assetPath}`;
const manifestTarget = "openclaw/dist/control-ui/asset-manifest.json";
const fixtureDir = resolve(root, "lab/fixtures/talk-playback-buffer");
const outputDir = resolve(root, "lab/release-files/talk-playback-buffer");
const planPath = resolve(root, "lab/talk-playback-buffer-plan.json");
const expectedBaseRelease = "talk-wait-phrase-v2";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// Same construction the Control UI uses; do not reinvent it.
function hashManifestAssets(assets) {
  const hash = createHash("sha256");
  for (const asset of assets) {
    hash.update(asset.path);
    hash.update("\0");
    hash.update(String(asset.size));
    hash.update("\0");
    hash.update(asset.sha256);
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function build() {
  const bundleBefore = readFileSync(resolve(fixtureDir, "control-ui-boot-shared-VfuwipMj.js"), "utf8");
  const manifestBefore = readFileSync(resolve(fixtureDir, "asset-manifest.json"), "utf8");
  const bundleAfter = patchTalkPlaybackBuffer(bundleBefore);

  // The Control UI refuses an asset whose bytes no longer match the manifest,
  // so the entry and the generation hash move with the bundle.
  const manifest = JSON.parse(manifestBefore);
  assert.equal(manifest.version, 1, "unsupported Control UI asset manifest");
  assert.equal(manifest.generation, hashManifestAssets(manifest.assets), "manifest generation drifted");
  const entries = manifest.assets.filter((entry) => entry.path === assetPath);
  assert.equal(entries.length, 1, "shared bundle manifest entry drifted");
  assert.equal(entries[0].sha256, sha256(bundleBefore), "manifest disagrees with the captured bundle");
  Object.assign(entries[0], { sha256: sha256(bundleAfter), size: Buffer.byteLength(bundleAfter) });
  manifest.generation = hashManifestAssets(manifest.assets);
  const manifestAfter = `${JSON.stringify(manifest)}\n`;

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "control-ui-boot-shared-VfuwipMj.js"), bundleAfter);
  writeFileSync(resolve(outputDir, "asset-manifest.json"), manifestAfter);
  writeFileSync(planPath, `${JSON.stringify({
    baseRelease: expectedBaseRelease,
    files: [
      {
        source: "lab/release-files/talk-playback-buffer/control-ui-boot-shared-VfuwipMj.js",
        target: bundleTarget,
        before: sha256(bundleBefore),
      },
      {
        source: "lab/release-files/talk-playback-buffer/asset-manifest.json",
        target: manifestTarget,
        before: sha256(manifestBefore),
      },
    ],
  }, null, 2)}\n`);
  return {
    bundle: { before: sha256(bundleBefore), after: sha256(bundleAfter) },
    manifest: { before: sha256(manifestBefore), after: sha256(manifestAfter) },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
