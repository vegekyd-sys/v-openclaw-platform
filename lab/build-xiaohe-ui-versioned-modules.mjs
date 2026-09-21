import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchControlUiVersionedModuleGraph } from "./patch-control-ui-versioned-module-graph.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(
  root,
  "lab/release-files/xiaohe-ui-cache-bust/control-ui-DhD7PO_6.js",
);
const outputDir = resolve(root, "lab/release-files/xiaohe-ui-versioned-modules");
const outputPath = resolve(outputDir, "control-ui-DhD7PO_6.js");
const planPath = resolve(root, "lab/xiaohe-ui-versioned-modules-plan.json");
const inputSha256 = "9fd0d26098db573957e85cb84669127bcbf5d76cdb8158d19ea0dcc567613dd7";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function build() {
  const input = readFileSync(inputPath);
  assert.equal(sha256(input), inputSha256, "Control UI static module drifted");
  const output = patchControlUiVersionedModuleGraph(input.toString("utf8"));
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, output);
  const plan = {
    baseRelease: "xiaohe-ui-cache-bust-v1",
    tests: ["lab/patch-control-ui-versioned-module-graph.test.mjs"],
    timeoutSeconds: 60,
    files: [
      {
        source:
          "lab/release-files/xiaohe-ui-versioned-modules/control-ui-DhD7PO_6.js",
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
