// Mechanically patches exact read-code-verified VLab artifacts; never writes the live runtime.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  patchGatewayKeepaliveCaller,
  patchWebSocketKeepalive,
} from "./patch-websocket-keepalive-backport.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "lab/release-files/ws-heartbeat-backport-91");
const specs = [
  {
    target: "openclaw/dist/websocket-keepalive-Jg8mBtsJ.js",
    patch: patchWebSocketKeepalive,
  },
  {
    target: "openclaw/dist/server-ws-runtime-BJcMZyBf.js",
    patch: patchGatewayKeepaliveCaller,
  },
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

mkdirSync(outputDir, { recursive: true });
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
      { encoding: "utf8", maxBuffer: 16 * 1024 ** 2, timeout: 120_000 },
    ),
  );
  baseRelease ??= result.current.release;
  assert.equal(result.current.release, baseRelease, "VLab release changed during artifact read");
  const before = Buffer.from(result.content, "base64").toString();
  assert.equal(sha256(before), result.sha256, `${spec.target} read-code digest mismatch`);
  const after = spec.patch(before);
  const source = `lab/release-files/ws-heartbeat-backport-91/${path.basename(spec.target)}`;
  writeFileSync(path.join(root, source), after);
  files.push({ source, target: spec.target, before: result.sha256 });
  console.log(JSON.stringify({ target: spec.target, before: result.sha256, after: sha256(after) }));
}

writeFileSync(
  path.join(root, "lab/ws-heartbeat-backport-91-plan.json"),
  `${JSON.stringify({ baseRelease, files }, null, 2)}\n`,
);
writeFileSync(
  path.join(root, "lab/ws-heartbeat-backport-91-candidate-plan.json"),
  `${JSON.stringify({
    baseRelease,
    files,
    tests: ["lab/ws-heartbeat-backport-91-candidate.test.mjs"],
    timeoutSeconds: 120,
  }, null, 2)}\n`,
);
