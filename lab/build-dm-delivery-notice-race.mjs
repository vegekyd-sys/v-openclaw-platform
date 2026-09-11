// Mechanically patches the exact read-code-verified VLab artifact. No live runtime writes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  patchFeishuDmPendingDeliveryNoticePresentation,
  patchPendingDeliveryNoticeRace,
} from "../scripts/patch-dm-delivery-notice-race.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specs = [
  {
    target: "openclaw/dist/delivery-completion-Do3nBV6b.js",
    destination: "lab/release-files/dm-delivery-notice-delivery-completion-Do3nBV6b.js",
    patch: patchPendingDeliveryNoticeRace,
  },
  {
    target: "openclaw/dist/lifecycle-YRwzpo9_.js",
    destination: "lab/release-files/dm-delivery-notice-lifecycle-YRwzpo9_.js",
    patch: patchFeishuDmPendingDeliveryNoticePresentation,
  },
];
const files = [];
let baseRelease;
for (const spec of specs) {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "/Users/tianyicai/vlab-dev/lab/vlab.mjs",
        "read-code",
        "--repo",
        "/Users/tianyicai/vlab-dev",
        "--target",
        spec.target,
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 ** 2, timeout: 120_000 },
    ),
  );
  if (baseRelease === undefined) {
    baseRelease = result.current.release;
  } else {
    assert.equal(result.current.release, baseRelease, "VLab release changed during artifact read");
  }
  const source = Buffer.from(result.content, "base64").toString();
  assert.equal(createHash("sha256").update(source).digest("hex"), result.sha256);
  const patched = spec.patch(source);
  assert.equal(patched.changed, true);
  fs.writeFileSync(path.join(root, spec.destination), patched.source);
  files.push({ source: spec.destination, target: spec.target, before: result.sha256 });
  console.log(
    JSON.stringify({
      target: spec.target,
      before: result.sha256,
      after: createHash("sha256").update(patched.source).digest("hex"),
    }),
  );
}
assert.equal(typeof baseRelease, "string");
const plan = { baseRelease, files };
fs.writeFileSync(
  path.join(root, "lab/dm-delivery-notice-race-plan.json"),
  `${JSON.stringify(plan, null, 2)}\n`,
);
