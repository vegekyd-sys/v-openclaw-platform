import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { updateManifestAsset } from "./patch-xiaohe-rtc-audio-cache-bust.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestInput = resolve(root, "lab/release-files/xiaohe-rtc-audio-manifest-fix/asset-manifest.json");
const adapterInput = resolve(root, "lab/volcengine-rtc-managed-room-client.mjs");
const outputDir = resolve(root, "lab/release-files/xiaohe-rtc-audio-manifest-hash");
const output = resolve(outputDir, "asset-manifest.json");
const planPath = resolve(root, "lab/xiaohe-rtc-audio-manifest-hash-plan.json");
const before = "7398cfa2e56c8bb29062412ad9632d7725c0e85a18d1265c62724f2a8ab4f939";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function build() {
  const manifest = readFileSync(manifestInput);
  if (sha256(manifest) !== before) throw new Error("manifest input drifted");
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
      baseRelease: "xiaohe-rtc-audio-manifest-fix-v1",
      tests: ["lab/patch-xiaohe-rtc-audio-cache-bust.test.mjs"],
      support: ["lab/patch-xiaohe-rtc-audio-cache-bust.mjs"],
      timeoutSeconds: 60,
      files: [
        {
          source: "lab/release-files/xiaohe-rtc-audio-manifest-hash/asset-manifest.json",
          target: "openclaw/dist/control-ui/asset-manifest.json",
          before,
        },
      ],
    }, null, 2)}\n`,
  );
  return { planPath, sha256: sha256(result) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
