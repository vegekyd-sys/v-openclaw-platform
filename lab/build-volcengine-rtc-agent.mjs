import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchProductionWorkerForVolcengineRtcAgent } from "./patch-volcengine-rtc-agent-provider.mjs";
import {
  patchVolcengineRtcManagedRoomHarness,
  patchVolcengineRtcManagedRoomTalk,
} from "./patch-volcengine-rtc-managed-room-core.mjs";
import { patchVolcengineRtcManagedRoomUi } from "./patch-volcengine-rtc-managed-room-ui.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "lab/release-files/volcengine-rtc-agent");
const planPath = resolve(root, "lab/volcengine-rtc-agent-plan.json");
const baseRelease = "talk-input-stall-v1";
const uiAsset = "assets/control-ui-boot-chat-DWTSrxxk.js";

const inputs = {
  ui: {
    path: resolve(root, "lab/release-files/talk-input-stall/control-ui-boot-chat-DWTSrxxk.js"),
    sha256: "b1480f0fae6aa434532c02456bbd291d5c54edcdae61f386f13c62931a10b7e4",
  },
  manifest: {
    path: resolve(root, "lab/release-files/talk-input-stall/asset-manifest.json"),
    sha256: "a781e2fcba0d749a533a08a378f372cfe85ebe08003383adcc0c03b5c8392659",
  },
  talk: {
    path: resolve(root, "lab/release-files/talk-consult-model/talk-DkFuKRod.js"),
    sha256: "7b0f7548f264effb5e3bd1b250c96085cf76e4b75214fd9a5be65a5d3d7a7029",
  },
  harness: {
    path: resolve(
      root,
      "lab/release-files/talk-session-model-inheritance/realtime-session-harness-CEO5kVAJ.js",
    ),
    sha256: "d4011faeac0ad58e84f1157c9ebd861909e0d819e131b29d040e295484a3889c",
  },
  worker: {
    path: resolve(root, "lab/release-files/seeduplex-voice-provider/production-worker-index.mjs"),
    sha256: "96e333eb824eb0bf37186f92f24eec21300a1f4790928fc54554b647a25208b0",
  },
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function checkedRead(input, label) {
  const value = readFileSync(input.path);
  assert.equal(sha256(value), input.sha256, `${label} drifted from accepted 9.1 release`);
  return value;
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

function manifestEntry(path, value) {
  return { path, sha256: sha256(value), size: Buffer.byteLength(value) };
}

function writeArtifact(name, value) {
  writeFileSync(resolve(outputDir, name), value);
  return sha256(value);
}

export function build() {
  const uiBefore = checkedRead(inputs.ui, "Control UI").toString("utf8");
  const manifestBefore = checkedRead(inputs.manifest, "Control UI manifest").toString("utf8");
  const talkBefore = checkedRead(inputs.talk, "Talk runtime").toString("utf8");
  const harnessBefore = checkedRead(inputs.harness, "realtime harness").toString("utf8");
  const workerBefore = checkedRead(inputs.worker, "production worker").toString("utf8");

  const uiAfter = patchVolcengineRtcManagedRoomUi(uiBefore);
  const talkAfter = patchVolcengineRtcManagedRoomTalk(talkBefore);
  const harnessAfter = patchVolcengineRtcManagedRoomHarness(harnessBefore);
  const workerAfter = patchProductionWorkerForVolcengineRtcAgent(workerBefore);
  const browserClient = readFileSync(resolve(root, "lab/volcengine-rtc-managed-room-client.mjs"));
  const browserSdk = readFileSync(resolve(root, "node_modules/@volcengine/rtc/index.esm.min.js"));
  const provider = readFileSync(resolve(root, "lab/volcengine-rtc-agent-provider.mjs"));

  const manifest = JSON.parse(manifestBefore);
  assert.equal(manifest.version, 1, "unsupported Control UI manifest");
  assert.equal(manifest.generation, hashManifestAssets(manifest.assets), "manifest generation drifted");
  const uiEntries = manifest.assets.filter((entry) => entry.path === uiAsset);
  assert.equal(uiEntries.length, 1, "Control UI entry drifted");
  Object.assign(uiEntries[0], manifestEntry(uiAsset, uiAfter));
  for (const [path, value] of [
    ["assets/volcengine-rtc-managed-room-client.js", browserClient],
    ["assets/volcengine-rtc-4.68.1.esm.js", browserSdk],
  ]) {
    assert.equal(manifest.assets.some((entry) => entry.path === path), false, `${path} already exists`);
    manifest.assets.push(manifestEntry(path, value));
  }
  manifest.generation = hashManifestAssets(manifest.assets);
  const manifestAfter = `${JSON.stringify(manifest)}\n`;

  mkdirSync(outputDir, { recursive: true });
  const hashes = {
    ui: writeArtifact("control-ui-boot-chat-DWTSrxxk.js", uiAfter),
    manifest: writeArtifact("asset-manifest.json", manifestAfter),
    talk: writeArtifact("talk-DkFuKRod.js", talkAfter),
    harness: writeArtifact("realtime-session-harness-CEO5kVAJ.js", harnessAfter),
    worker: writeArtifact("production-worker-index.mjs", workerAfter),
    browserClient: writeArtifact("volcengine-rtc-managed-room-client.js", browserClient),
    browserSdk: writeArtifact("volcengine-rtc-4.68.1.esm.js", browserSdk),
    provider: writeArtifact("volcengine-rtc-agent-provider.mjs", provider),
  };

  const plan = {
    baseRelease,
    tests: ["lab/volcengine-rtc-agent-candidate.test.mjs"],
    timeoutSeconds: 60,
    files: [
      {
        source: "lab/release-files/volcengine-rtc-agent/control-ui-boot-chat-DWTSrxxk.js",
        target: `openclaw/dist/control-ui/${uiAsset}`,
        before: inputs.ui.sha256,
      },
      {
        source: "lab/release-files/volcengine-rtc-agent/asset-manifest.json",
        target: "openclaw/dist/control-ui/asset-manifest.json",
        before: inputs.manifest.sha256,
      },
      {
        source: "lab/release-files/volcengine-rtc-agent/volcengine-rtc-managed-room-client.js",
        target: "openclaw/dist/control-ui/assets/volcengine-rtc-managed-room-client.js",
        before: null,
      },
      {
        source: "lab/release-files/volcengine-rtc-agent/volcengine-rtc-4.68.1.esm.js",
        target: "openclaw/dist/control-ui/assets/volcengine-rtc-4.68.1.esm.js",
        before: null,
      },
      {
        source: "lab/release-files/volcengine-rtc-agent/talk-DkFuKRod.js",
        target: "openclaw/dist/talk-DkFuKRod.js",
        before: inputs.talk.sha256,
      },
      {
        source: "lab/release-files/volcengine-rtc-agent/realtime-session-harness-CEO5kVAJ.js",
        target: "openclaw/dist/realtime-session-harness-CEO5kVAJ.js",
        before: inputs.harness.sha256,
      },
      {
        source: "lab/release-files/volcengine-rtc-agent/production-worker-index.mjs",
        target: "production-worker/index.mjs",
        before: inputs.worker.sha256,
      },
      {
        source: "lab/release-files/volcengine-rtc-agent/volcengine-rtc-agent-provider.mjs",
        target: "production-worker/volcengine-rtc-agent-provider.mjs",
        before: null,
      },
    ],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return { baseRelease, files: plan.files.length, hashes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
