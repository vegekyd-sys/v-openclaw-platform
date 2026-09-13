// Build code-only artifacts from the current shared VLab release. Credentials
// remain outside the Git artifact and are installed through the VLab secret env.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchProductionWorkerForSeeduplex } from "./patch-seeduplex-voice-provider.mjs";

const repo = "/Users/tianyicai/vlab-dev";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = resolve(root, "lab/fixtures/seeduplex-voice-provider");
const outputDir = resolve(root, "lab/release-files/seeduplex-voice-provider");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function readLiveCode(target) {
  try {
    return JSON.parse(
      execFileSync(
        process.execPath,
        [
          "/Users/tianyicai/vlab-dev/lab/vlab.mjs",
          "read-code",
          "--repo",
          repo,
          "--target",
          target,
        ],
        { encoding: "utf8", maxBuffer: 32 * 1024 ** 2, timeout: 600_000 },
      ),
    );
  } catch (error) {
    const output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`;
    if (output.includes("does not exist")) return null;
    throw error;
  }
}

mkdirSync(fixtureDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

const target = "production-worker/index.mjs";
const result = readLiveCode(target);
assert(result, `${target} is missing from VLab`);
const providerTarget = "production-worker/seeduplex-realtime-provider.mjs";
const currentProvider = readLiveCode(providerTarget);
const before = Buffer.from(result.content, "base64").toString();
assert.equal(sha256(before), result.sha256, "VLab read-code digest mismatch");
const after = patchProductionWorkerForSeeduplex(before);

writeFileSync(resolve(fixtureDir, "production-worker-index.mjs"), before);
writeFileSync(resolve(outputDir, "production-worker-index.mjs"), after);
writeFileSync(
  resolve(outputDir, "seeduplex-realtime-provider.mjs"),
  readFileSync(resolve(root, "lab/seeduplex-realtime-provider.mjs")),
);

const plan = {
  baseRelease: result.current.release,
  files: [
    {
      source: "lab/release-files/seeduplex-voice-provider/production-worker-index.mjs",
      target,
      before: result.sha256,
    },
    {
      source: "lab/release-files/seeduplex-voice-provider/seeduplex-realtime-provider.mjs",
      target: providerTarget,
      before: currentProvider?.sha256 ?? null,
    },
  ],
};
writeFileSync(
  resolve(root, "lab/seeduplex-voice-provider-plan.json"),
  `${JSON.stringify(plan, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    baseRelease: result.current.release,
    files: plan.files.length,
    before: result.sha256,
    after: sha256(after),
    provider: sha256(readFileSync(resolve(root, "lab/seeduplex-realtime-provider.mjs"))),
  }),
);
