import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "lab/release-files/volcenine-rtc-provider");
const planPath = resolve(root, "lab/volcenine-rtc-provider-plan.json");
const providerTarget = "production-worker/volcengine-rtc-agent-provider.mjs";
const clientTarget =
  "openclaw/dist/control-ui/assets/volcengine-rtc-managed-room-client.js";
const manifestTarget = "openclaw/dist/control-ui/asset-manifest.json";
const providerSource =
  "lab/release-files/volcengine-rtc-agent/volcengine-rtc-agent-provider.mjs";
const clientSource =
  "lab/release-files/volcengine-rtc-agent/volcengine-rtc-managed-room-client.js";
const manifestSource = "lab/release-files/volcenine-rtc-provider/asset-manifest.json";
const vlab = "/Users/tianyicai/vlab-dev/lab/vlab.mjs";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function readCode(target) {
  const snapshot = JSON.parse(
    execFileSync(process.execPath, [vlab, "read-code", "--target", target], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    }),
  );
  const content = Buffer.from(snapshot.content, "base64");
  assert.equal(sha256(content), snapshot.sha256, `${target} checksum mismatch`);
  return { ...snapshot, content };
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

export function build() {
  const providerBefore = readCode(providerTarget);
  const clientBefore = readCode(clientTarget);
  const manifestBefore = readCode(manifestTarget);
  const baseRelease = providerBefore.current.release;
  assert.equal(clientBefore.current.release, baseRelease, "release changed while reading client");
  assert.equal(manifestBefore.current.release, baseRelease, "release changed while reading manifest");

  const providerAfter = readFileSync(resolve(root, providerSource));
  const clientAfter = readFileSync(resolve(root, clientSource));
  const manifest = JSON.parse(manifestBefore.content.toString("utf8"));
  assert.equal(manifest.version, 1, "unsupported Control UI manifest");
  assert.equal(manifest.generation, hashManifestAssets(manifest.assets), "manifest generation drifted");
  const clientEntry = manifest.assets.find(
    (entry) => entry.path === "assets/volcengine-rtc-managed-room-client.js",
  );
  assert(clientEntry, "managed-room client is missing from the current manifest");
  clientEntry.size = clientAfter.length;
  clientEntry.sha256 = sha256(clientAfter);
  manifest.generation = hashManifestAssets(manifest.assets);
  const manifestAfter = Buffer.from(`${JSON.stringify(manifest)}\n`);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(root, manifestSource), manifestAfter);
  const plan = {
    baseRelease,
    files: [
      { source: providerSource, target: providerTarget, before: providerBefore.sha256 },
      { source: clientSource, target: clientTarget, before: clientBefore.sha256 },
      { source: manifestSource, target: manifestTarget, before: manifestBefore.sha256 },
    ],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return {
    baseRelease,
    files: plan.files,
    after: {
      provider: sha256(providerAfter),
      client: sha256(clientAfter),
      manifest: sha256(manifestAfter),
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
