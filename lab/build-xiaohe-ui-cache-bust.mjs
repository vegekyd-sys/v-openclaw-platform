import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchControlUiCacheReset } from "./patch-control-ui-cache-reset.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(
  root,
  "lab/release-files/control-ui-revalidate/control-ui-DhD7PO_6.js",
);
const outputDir = resolve(root, "lab/release-files/xiaohe-ui-cache-bust");
const outputPath = resolve(outputDir, "control-ui-DhD7PO_6.js");
const planPath = resolve(root, "lab/xiaohe-ui-cache-bust-plan.json");
const inputSha256 = "e0c94d7cad05f7797d57a3e62223902cd31d3d870c2cd7ee6112605c304096b8";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function build() {
  const input = readFileSync(inputPath);
  assert.equal(sha256(input), inputSha256, "Control UI static module drifted");
  const output = patchControlUiCacheReset(input.toString("utf8"));
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, output);
  const plan = {
    baseRelease: "volcengine-rtc-agent-v4",
    tests: ["lab/patch-control-ui-cache-reset.test.mjs"],
    timeoutSeconds: 60,
    files: [
      {
        source: "lab/release-files/xiaohe-ui-cache-bust/control-ui-DhD7PO_6.js",
        target: "openclaw/dist/control-ui-DhD7PO_6.js",
        before: inputSha256,
      },
    ],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return { sha256: sha256(output), planPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
