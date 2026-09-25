import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { updateManifestAsset } from "./patch-xiaohe-rtc-audio-cache-bust.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestInput = resolve(
  root,
  "lab/release-files/xiaohe-rtc-audio-manifest-hash/asset-manifest.json",
);
const adapterInput = resolve(root, "lab/volcengine-rtc-managed-room-client.mjs");
const outputDir = resolve(root, "lab/release-files/xiaohe-rtc-sdk-timeout");
const output = resolve(outputDir, "asset-manifest.json");
const planPath = resolve(root, "lab/xiaohe-rtc-sdk-timeout-plan.json");
const manifestBefore = "23050d852a7f72452d56f92b8ab46db8f3c466bbe23b12e7bff0c51e8f3c9a31";
const adapterBefore = "e73c07c03f82567040902bdae6be44d3ceb5acfd84f6a2776af2944f34f4d49a";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function build() {
  const manifest = readFileSync(manifestInput);
  if (sha256(manifest) !== manifestBefore) throw new Error("manifest input drifted");
  const adapter = readFileSync(adapterInput);
  const result = Buffer.from(
    updateManifestAsset(
      manifest.toString("utf8"),
      "assets/volcengine-rtc-managed-room-client.js",
      adapter,
    ),
  );
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(output, result);
  writeFileSync(
    planPath,
    `${JSON.stringify({
      baseRelease: "xiaohe-rtc-audio-manifest-hash-v1",
      tests: [
        "lab/volcengine-rtc-managed-room-client.test.mjs",
        "lab/patch-xiaohe-rtc-audio-cache-bust.test.mjs",
      ],
      support: ["lab/patch-xiaohe-rtc-audio-cache-bust.mjs"],
      timeoutSeconds: 60,
      files: [
        {
          source: "lab/volcengine-rtc-managed-room-client.mjs",
          target: "openclaw/dist/control-ui/assets/volcengine-rtc-managed-room-client.js",
          before: adapterBefore,
        },
        {
          source: "lab/release-files/xiaohe-rtc-sdk-timeout/asset-manifest.json",
          target: "openclaw/dist/control-ui/asset-manifest.json",
          before: manifestBefore,
        },
      ],
    }, null, 2)}\n`,
  );
  return { planPath, sha256: sha256(result) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
