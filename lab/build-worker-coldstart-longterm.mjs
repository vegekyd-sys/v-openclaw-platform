// Build immutable release-layer files from the exact accepted VLab baseline.
// This script reads no state/config and performs no runtime mutation.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promoteWorkerLifecycle } from "./worker-lifecycle-promotion.mjs";
import { instrumentGatewayDispatchPhases } from "./gateway-dispatch-phase-patch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), value);
const sha = (value) => createHash("sha256").update(value).digest("hex");

const workerIndexBaseline = read("lab/release-files/production-worker-index.mjs");
assert.equal(
  sha(workerIndexBaseline),
  "9a2825c9ae901867a5e564ebb2644e7c46b70d7ce929c61dd11405690f209790",
  "Worker release baseline drifted",
);
const workerIndex = promoteWorkerLifecycle(workerIndexBaseline);
write("lab/release-files/coldstart-production-worker-index.mjs", workerIndex);

const handlerBaseline = read("lab/release-files/chat-send-handler-DBjXcn_1.js");
assert.equal(
  sha(handlerBaseline),
  "99c82a810e112f097ab75a0129d80cf3d6305c7c77867504a20307a4cab9b311",
  "Gateway handler baseline drifted",
);
const handler = instrumentGatewayDispatchPhases(handlerBaseline);
write("lab/release-files/coldstart-chat-send-handler-DBjXcn_1.js", handler);

const packageJson = JSON.parse(
  read("experiments/agent-worker-isolation-v1/package.json"),
);
assert.equal(packageJson.version, "0.2.12-rc.1");
write(
  "lab/release-files/coldstart-production-worker-package.json",
  JSON.stringify(packageJson, null, 2) + "\n",
);

const plan = {
  baseRelease: "native-final-candidate-20260911-v5",
  files: [
    {
      source: "lab/release-files/coldstart-production-worker-package.json",
      target: "production-worker/package.json",
      before: "c4d6a9e11b06859ac173024f8bebf02d11e5fc00291a68aa6e9100de82598c90",
    },
    {
      source: "lab/release-files/coldstart-production-worker-index.mjs",
      target: "production-worker/index.mjs",
      before: "9a2825c9ae901867a5e564ebb2644e7c46b70d7ce929c61dd11405690f209790",
    },
    {
      source: "lab/release-files/production-worker-worker-pool.mjs",
      target: "production-worker/worker-pool.mjs",
      before: "9b471ee18ace343f60081f0f8d8f9040fa2c058444ba697aad90a7e1ecc9d046",
    },
    {
      source: "experiments/agent-worker-isolation-v1/worker-runtime-lifecycle.mjs",
      target: "production-worker/worker-runtime-lifecycle.mjs",
      before: null,
    },
    {
      source: "lab/release-files/agent-command-DPfawBbr.js",
      target: "openclaw/dist/agent-command-DPfawBbr.js",
      before: "013390e6d73c91ecfd1ff625fa8c90d3dee988d350ff3948e6c32d35394fac54",
    },
    {
      source: "lab/release-files/cold-config-singleflight.mjs",
      target: "openclaw/dist/cold-config-singleflight.mjs",
      before: null,
    },
    {
      source: "lab/release-files/db91-integrity-bootstrap.mjs",
      target: "openclaw/dist/db91-integrity-bootstrap.mjs",
      before: "3b0b3e2da8162faca7fba820e56392bf3b9817cc32cd166304730a834024caa3",
    },
    {
      source: "lab/release-files/gateway-module-resolution-cache.mjs",
      target: "openclaw/dist/gateway-module-resolution-cache.mjs",
      before: null,
    },
    {
      source: "experiments/agent-worker-isolation-v1/native-module-resolution-cache.mjs",
      target: "openclaw/dist/native-module-resolution-cache.mjs",
      before: null,
    },
    {
      source: "lab/release-files/coldstart-chat-send-handler-DBjXcn_1.js",
      target: "openclaw/dist/chat-send-handler-DBjXcn_1.js",
      before: "99c82a810e112f097ab75a0129d80cf3d6305c7c77867504a20307a4cab9b311",
    },
    {
      source: "lab/release-files/gateway-dispatch-phase-observer.mjs",
      target: "openclaw/dist/gateway-dispatch-phase-observer.mjs",
      before: null,
    },
  ],
};
write("lab/worker-coldstart-longterm-plan.json", JSON.stringify(plan, null, 2) + "\n");
console.log(
  JSON.stringify({
    baseRelease: plan.baseRelease,
    files: plan.files.length,
    workerIndexSha: sha(workerIndex),
    handlerSha: sha(handler),
  }),
);
