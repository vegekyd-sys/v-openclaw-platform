import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SEEDUPLEX_IMPORT,
  SEEDUPLEX_REGISTER,
  patchProductionWorkerForSeeduplex,
} from "./patch-seeduplex-voice-provider.mjs";

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

test("release artifacts derive from the exact current VLab runtime", () => {
  const releaseIndex = readFileSync(
    new URL(
      "./release-files/seeduplex-voice-provider/production-worker-index.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  const provider = readFileSync(
    new URL("./seeduplex-realtime-provider.mjs", import.meta.url),
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
  assert.equal(
    sha256(fixture),
    "d5416a86ff77bf8a8c00395a0e7feb05a31d1668e9234c8ce001762f8c59f13e",
  );
  assert.equal(releaseIndex, patchProductionWorkerForSeeduplex(fixture));
  assert.equal(
    sha256(releaseIndex),
    "d5416a86ff77bf8a8c00395a0e7feb05a31d1668e9234c8ce001762f8c59f13e",
  );
  assert.equal(releaseProvider, provider);
  assert.equal(
    sha256(releaseProvider),
    "3be4d7565ac7ae88d1ad73f2e5c14e0a7f9fe4d730508bcf517d6e337fdb71fc",
  );
});
