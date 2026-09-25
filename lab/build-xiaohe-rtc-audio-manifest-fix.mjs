import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeManifest } from "./patch-xiaohe-rtc-audio-cache-bust.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "lab/release-files/xiaohe-rtc-audio-cache-bust/asset-manifest.json");
const outputDir = resolve(root, "lab/release-files/xiaohe-rtc-audio-manifest-fix");
const output = resolve(outputDir, "asset-manifest.json");
const planPath = resolve(root, "lab/xiaohe-rtc-audio-manifest-fix-plan.json");
const before = "7a00a348f1a70d507724e876ac41584f304a3a6ec7524380fe275fa17c8cf00f";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function build() {
  const source = readFileSync(input);
  if (sha256(source) !== before) throw new Error("manifest input drifted");
  const result = Buffer.from(normalizeManifest(source.toString("utf8")));
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(output, result);
  writeFileSync(
    planPath,
    `${JSON.stringify({
      baseRelease: "xiaohe-rtc-audio-cache-bust-v1",
      tests: ["lab/patch-xiaohe-rtc-audio-cache-bust.test.mjs"],
      support: ["lab/patch-xiaohe-rtc-audio-cache-bust.mjs"],
      timeoutSeconds: 60,
      files: [
        {
          source: "lab/release-files/xiaohe-rtc-audio-manifest-fix/asset-manifest.json",
          target: "openclaw/dist/control-ui/asset-manifest.json",
          before,
        },
      ],
    }, null, 2)}\n`,
  );
  return { planPath, sha256: sha256(result) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
