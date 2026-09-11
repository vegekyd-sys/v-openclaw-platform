import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promoteWorkerLifecycle } from "./worker-lifecycle-promotion.mjs";
import { instrumentGatewayDispatchPhases } from "./gateway-dispatch-phase-patch.mjs";

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");
const sha = (value) => createHash("sha256").update(value).digest("hex");

test("lifecycle promotion keeps the current release-layer behavior", () => {
  const baseline = read("./release-files/production-worker-index.mjs");
  const candidate = read("./release-files/coldstart-production-worker-index.mjs");
  assert.equal(
    sha(baseline),
    "9a2825c9ae901867a5e564ebb2644e7c46b70d7ce929c61dd11405690f209790",
  );
  assert.equal(candidate, promoteWorkerLifecycle(baseline));
  for (const retained of [
    "ocFirsttextWorkerMark",
    "publishWorkerPublicStream",
    "nativePersistedUserTurn",
    "gatewayOwnedEventArgs",
    "withGatewayCompletionContext",
  ]) {
    assert(candidate.includes(retained), `lost ${retained}`);
  }
  assert.match(candidate, /resolveWorkerRuntime\(SHARED_POOL_KEY, sharedPool\)/);
  assert.match(candidate, /workerIsolationVersion: "0\.2\.12-rc\.1"/);
  assert.equal((candidate.match(/createWorkerRuntimeLifecycle\(/g) ?? []).length, 1);
});

test("Gateway phase patch is a bounded mechanical projection", () => {
  const baseline = read("./release-files/chat-send-handler-DBjXcn_1.js");
  const candidate = read("./release-files/coldstart-chat-send-handler-DBjXcn_1.js");
  assert.equal(
    sha(baseline),
    "99c82a810e112f097ab75a0129d80cf3d6305c7c77867504a20307a4cab9b311",
  );
  assert.equal(candidate, instrumentGatewayDispatchPhases(baseline));
  assert.equal((candidate.match(/createGatewayDispatchPhaseObserver/g) ?? []).length, 2);
  for (const stage of [
    "gateway-dispatch-function-enter",
    "gateway-dispatch-wrapper-call",
    "gateway-media-transcript-run",
    "gateway-work-admission-run",
    "gateway-dispatch-inbound-enter",
    "gateway-plugin-media-await-enter",
    "gateway-plugin-media-await-end",
    "gateway-projected-dispatch-enter",
  ]) {
    assert.equal((candidate.match(new RegExp(stage, "g")) ?? []).length, 1);
  }
});

test("observer is opt-in, sanitized and cannot emit arbitrary stages", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-phase-observer-"));
  try {
    const helper = new URL(
      "./release-files/gateway-dispatch-phase-observer.mjs",
      import.meta.url,
    ).href;
    const code = `
      import {createGatewayDispatchPhaseObserver} from ${JSON.stringify(helper)};
      const mark=createGatewayDispatchPhaseObserver('11111111-1111-1111-1111-111111111111');
      mark('gateway-dispatch-function-enter',{secret:'Bearer should-not-appear'});
      mark('arbitrary-secret-stage');
    `;
    const enabled = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      encoding: "utf8",
      env: { ...process.env, OPENCLAW_GATEWAY_DISPATCH_PHASES: "1" },
    });
    assert.equal(enabled.status, 0, enabled.stderr);
    const lines = enabled.stderr.trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    assert(!lines[0].includes("Bearer"));
    const row = JSON.parse(lines[0].slice(lines[0].indexOf("{")));
    assert.deepEqual(
      Object.keys(row).sort(),
      [
        "atMs",
        "cpuSystemMs",
        "cpuUserMs",
        "elapsedMs",
        "eventLoopUtilization",
        "monoMs",
        "pid",
        "runId",
        "stage",
        "v",
      ].sort(),
    );
    const disabled = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      encoding: "utf8",
      env: { ...process.env, OPENCLAW_GATEWAY_DISPATCH_PHASES: "0" },
    });
    assert.equal(disabled.status, 0, disabled.stderr);
    assert.equal(disabled.stderr, "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("release plan retains exact accepted before hashes", () => {
  const plan = JSON.parse(read("./worker-coldstart-longterm-plan.json"));
  assert.equal(plan.baseRelease, "native-final-candidate-20260911-v5");
  assert.equal(plan.files.length, 11);
  assert.equal(new Set(plan.files.map((entry) => entry.target)).size, 11);
  assert.equal(
    plan.files.find((entry) => entry.target === "production-worker/worker-pool.mjs")
      .before,
    "9b471ee18ace343f60081f0f8d8f9040fa2c058444ba697aad90a7e1ecc9d046",
  );
});
