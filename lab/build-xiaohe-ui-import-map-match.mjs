import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchControlUiServerImportMap } from "./patch-control-ui-import-map.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(
  root,
  "lab/release-files/xiaohe-ui-cache-bust/control-ui-DhD7PO_6.js",
);
const outputDir = resolve(root, "lab/release-files/xiaohe-ui-import-map-match");
const outputPath = resolve(outputDir, "control-ui-DhD7PO_6.js");
const planPath = resolve(root, "lab/xiaohe-ui-import-map-match-plan.json");
const inputSha256 = "9fd0d26098db573957e85cb84669127bcbf5d76cdb8158d19ea0dcc567613dd7";
const currentSha256 = "4d4cb9e8e0a5a33a89a62601917c0ad2e9b0459a73f28c3c355753cc76fd9dd1";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function build() {
  const input = readFileSync(inputPath);
  assert.equal(sha256(input), inputSha256, "Control UI server base drifted");
  const output = Buffer.from(patchControlUiServerImportMap(input.toString("utf8")));
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, output);
  const plan = {
    baseRelease: "xiaohe-ui-import-map-v3",
    tests: ["lab/patch-control-ui-import-map.test.mjs"],
    timeoutSeconds: 60,
    files: [
      {
        source: "lab/release-files/xiaohe-ui-import-map-match/control-ui-DhD7PO_6.js",
        target: "openclaw/dist/control-ui-DhD7PO_6.js",
        before: currentSha256,
      },
    ],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return { sha256: sha256(output), planPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
