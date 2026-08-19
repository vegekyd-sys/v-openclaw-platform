import assert from "node:assert/strict";
import test from "node:test";
import { parseJobRequest, resolveNetworkPolicy, sandboxName } from "../src/policy.mjs";

const base = { jobId: "unit-test", command: ["node", "--version"] };

test("accepts a minimal offline job", () => {
  const job = parseJobRequest(base, {});
  assert.equal(job.networkPolicy, "deny-all");
  assert.equal(job.vcpus, 1);
  assert.equal(job.timeoutMs, 300000);
});

test("rejects shell commands by default", () => {
  assert.throws(() => parseJobRequest({ ...base, command: ["bash", "-lc", "id"] }, {}), /shell execution/);
});

test("rejects paths that escape the sandbox workspace", () => {
  assert.throws(() => parseJobRequest({ ...base, files: [{ path: "../secret", content: "x" }] }, {}), /unsafe relative path/);
  assert.throws(() => parseJobRequest({ ...base, cwd: "/etc" }, {}), /cwd must stay/);
});

test("allow-all requires an explicit operator gate", () => {
  assert.throws(() => parseJobRequest({ ...base, networkProfile: "allow-all" }, {}), /disabled by policy/);
  assert.equal(parseJobRequest({ ...base, networkProfile: "allow-all" }, { VLAB_SANDBOX_ALLOW_ALL_NETWORK: "1" }).networkPolicy, "allow-all");
});

test("package profile exposes only the fixed package registry allowlist", () => {
  const policy = resolveNetworkPolicy("packages");
  assert.ok(policy.allow.includes("registry.npmjs.org"));
  assert.ok(!policy.allow.includes("*"));
});

test("sandbox names are bounded and include a unique nonce", () => {
  const name = sandboxName("unit-test", Date.UTC(2026, 7, 20, 0, 0, 0), "a1b2c3d4");
  assert.match(name, /^vjob-unit-test-20260820000000-a1b2c3d4$/);
  assert.ok(name.length <= 64);
});
