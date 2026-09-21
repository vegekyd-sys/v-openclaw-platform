import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RTC_MODULE_AFTER,
  patchControlUiIndexImportMap,
} from "./patch-control-ui-import-map.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputDir = resolve(root, "lab/release-files/volcengine-rtc-agent");
const indexInput = resolve(root, "lab/release-files/control-ui-import-map-base/index.html");
const outputDir = resolve(root, "lab/release-files/xiaohe-ui-import-map");
const planPath = resolve(root, "lab/xiaohe-ui-import-map-plan.json");

const hashes = {
  index: "ecb3576de9af0afa7adea2ca0a062295c5f7d3a0c0c14455e783642990c42b78",
  manifest: "5a7b1e0908389ac4c5c11c11d1d5708eac98bf01953669a45b3187d83d2b7a75",
  rtc: "71f6b0960f0d4d38ac586892bf0bbed30f270e55d227cf2d0e63e54f454c9c4b",
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function manifestEntry(path, value) {
  return { path, sha256: sha256(value), size: Buffer.byteLength(value) };
}

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

function checkedRead(path, expected, label) {
  const value = readFileSync(path);
  assert.equal(sha256(value), expected, `${label} drifted`);
  return value;
}

function write(name, value) {
  writeFileSync(resolve(outputDir, name), value);
  return sha256(value);
}

export function build() {
  const indexBefore = checkedRead(indexInput, hashes.index, "Control UI index");
  const manifestBefore = checkedRead(
    resolve(inputDir, "asset-manifest.json"),
    hashes.manifest,
    "Control UI manifest",
  );
  const rtc = checkedRead(
    resolve(inputDir, "control-ui-boot-chat-DWTSrxxk.js"),
    hashes.rtc,
    "RTC module",
  );
  const indexAfter = Buffer.from(patchControlUiIndexImportMap(indexBefore.toString("utf8")));
  const manifest = JSON.parse(manifestBefore.toString("utf8"));
  assert.equal(manifest.version, 1, "unsupported Control UI manifest");
  assert.equal(manifest.generation, hashManifestAssets(manifest.assets), "manifest drifted");
  const additions = [manifestEntry(`assets/${RTC_MODULE_AFTER}`, rtc)];
  assert.equal(
    manifest.assets.some((entry) => additions.some((added) => added.path === entry.path)),
    false,
    "versioned RTC module already exists",
  );
  manifest.assets.push(...additions);
  manifest.generation = hashManifestAssets(manifest.assets);
  const manifestAfter = Buffer.from(`${JSON.stringify(manifest)}\n`);

  mkdirSync(outputDir, { recursive: true });
  const outputHashes = {
    index: write("index.html", indexAfter),
    manifest: write("asset-manifest.json", manifestAfter),
    rtc: write(RTC_MODULE_AFTER, rtc),
  };
  const plan = {
    baseRelease: "xiaohe-ui-cache-bust-v1",
    tests: ["lab/patch-control-ui-import-map.test.mjs"],
    timeoutSeconds: 60,
    files: [
      {
        source: "lab/release-files/xiaohe-ui-import-map/index.html",
        target: "openclaw/dist/control-ui/index.html",
        before: hashes.index,
      },
      {
        source: "lab/release-files/xiaohe-ui-import-map/asset-manifest.json",
        target: "openclaw/dist/control-ui/asset-manifest.json",
        before: hashes.manifest,
      },
      ...[RTC_MODULE_AFTER].map((name) => ({
        source: `lab/release-files/xiaohe-ui-import-map/${name}`,
        target: `openclaw/dist/control-ui/assets/${name}`,
        before: null,
      })),
    ],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return { outputHashes, planPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
