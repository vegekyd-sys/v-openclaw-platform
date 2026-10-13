import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SEEDUPLEX_IMPORT,
  SEEDUPLEX_REGISTER,
  patchProductionWorkerForSeeduplex,
} from "./patch-seeduplex-voice-provider.mjs";
import {
  ROUTED_CALL,
  ROUTING_IMPORT,
  patchWorkerHarnessModelRouting,
} from "./patch-worker-harness-model-routing.mjs";

const fixture = readFileSync(
  new URL("./fixtures/seeduplex-voice-provider/production-worker-index.mjs", import.meta.url),
  "utf8",
);

test("production-worker patch is exact, idempotent and fail-closed", () => {
  const patched = patchProductionWorkerForSeeduplex(fixture);
  assert.equal(patched.split(SEEDUPLEX_IMPORT).length - 1, 1);
  assert.equal(patched.split(SEEDUPLEX_REGISTER).length - 1, 1);
  assert.equal(patchProductionWorkerForSeeduplex(patched), patched);
  assert.throws(
    () => patchProductionWorkerForSeeduplex(`${fixture}\n${SEEDUPLEX_IMPORT}`),
    /partially patched/,
  );
  assert.throws(() => patchProductionWorkerForSeeduplex("unrelated"), /refuses runtime drift/);
});

test("registration happens before the existing worker startup validation", () => {
  const patched = patchProductionWorkerForSeeduplex(fixture);
  assert.ok(patched.indexOf(SEEDUPLEX_REGISTER) < patched.indexOf("workerConfigPath is required"));
});

test("Worker release artifacts preserve their exact pinned VLab baseline", () => {
  const releaseIndex = readFileSync(
    new URL(
      "./release-files/seeduplex-voice-provider/production-worker-index.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  const releaseProvider = readFileSync(
    new URL(
      "./release-files/seeduplex-voice-provider/seeduplex-realtime-provider.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  const sha256 = (value) => createHash("sha256").update(value).digest("hex");
  // Re-baselined 2026-09-16 onto release agent-db-lease-lifetime-v1. The
  // previous pin came from the 0.2.12-rc.1 lineage, which the shared VLab no
  // longer runs; rebuilding from that baseline would have reverted the
  // worker-memory-recycle knobs that are live today.
  assert.equal(
    sha256(fixture),
    "6655f0caecb53b98beee73b17011e6a966d9ee2d2bd3e814df253ef843658191",
  );
  assert.equal(
    releaseIndex,
    patchWorkerHarnessModelRouting(patchProductionWorkerForSeeduplex(fixture)),
  );
  assert.equal(releaseIndex.split(ROUTING_IMPORT).length - 1, 1);
  assert.equal(releaseIndex.split(ROUTED_CALL).length - 1, 1);
  // This is the historical Worker/Gateway release snapshot, not the independent
  // Voice entrypoint. Voice-only fixes must not rewrite this pinned release.
  // gpt-live-h5-release.test.mjs verifies Voice freezes its current provider.
  assert.equal(
    sha256(releaseProvider),
    "0a4edb88fa197497733012dff69623a7109f5c4a9f12dee79eadb86d72168f69",
  );
});
