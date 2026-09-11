import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sha = (value) => createHash("sha256").update(value).digest("hex");

test("command runtime exposes a module-only first-command preparation contract", () => {
  const command = read("./release-files/agent-command-DPfawBbr.js");
  assert.match(command, /async function prewarmAgentCommandRuntimes\(\)/);
  assert.match(
    command,
    /export \{[^}]*\bprewarmAgentCommandRuntimes\b[^}]*\};/s,
  );
  for (const loader of [
    "loadAttemptExecutionRuntime",
    "loadAcpManagerRuntime",
    "loadAcpPolicyRuntime",
    "loadAcpRuntimeErrorsRuntime",
    "loadAcpSessionIdentifiersRuntime",
    "loadDeliveryRuntime",
    "loadSessionStoreRuntime",
    "loadCliCompactionRuntime",
    "loadAgentRunnerMemoryRuntime",
    "loadTranscriptResolveRuntime",
    "loadTranscriptAppendRuntime",
    "cliDepsRuntimeLoader.load",
    "loadExecDefaultsRuntime",
    "loadSkillsRuntime",
  ]) {
    const body = command.slice(
      command.indexOf("async function prewarmAgentCommandRuntimes()"),
      command.indexOf("async function resolveAgentCommandDeps"),
    );
    assert(body.includes(`${loader}()`), `missing ${loader}`);
  }
});

test("semantic command facade exposes the preparation contract to Worker resolution", () => {
  const facade = read("./release-files/agent-command-DeP5kHlK.js");
  assert.match(
    facade,
    /import \{[^}]*\bprewarmAgentCommandRuntimes\b[^}]*\} from "\.\/agent-command-DPfawBbr\.js";/,
  );
  assert.match(
    facade,
    /export \{[^}]*\bprewarmAgentCommandRuntimes\b[^}]*\};/,
  );
});

test("Worker prewarm requires command preparation after the static lease", () => {
  const helper = read(
    "../experiments/agent-worker-isolation-v1/runtime-prewarm.mjs",
  );
  const acquire = helper.indexOf(
    "preparedRuntime.acquireAgentRunPreparedModelRuntime",
  );
  const command = helper.indexOf("commandRuntime.prewarmAgentCommandRuntimes");
  assert(acquire >= 0);
  assert(command > acquire);
  assert.match(helper, /deferred-to-normal-turn/);
});

test("release plan is pinned to the currently deployed readiness candidate", () => {
  const plan = JSON.parse(read("./worker-command-readiness-plan.json"));
  assert.equal(plan.baseRelease, "worker-runtime-readiness-20260912-v1");
  assert.deepEqual(
    plan.files.map(({ target, before }) => [target, before]),
    [
      [
        "openclaw/dist/agent-command-DPfawBbr.js",
        "1ffe7569cc0edcdc45d108056dc89f14853d27d1e9c1bff4d2bfc0f583f2bc18",
      ],
      [
        "openclaw/dist/agent-command-DeP5kHlK.js",
        "893415c5f2bb79551a48b8571099f85743f8f04329235eda2f268e0b7634835a",
      ],
      [
        "production-worker/runtime-prewarm.mjs",
        "a6c8d4e994de17f5c0114c9b8d396392e81698db732088bf5bf893ef76a0a57a",
      ],
    ],
  );
  assert.equal(
    sha(read("./release-files/agent-command-DPfawBbr.js")) ===
      plan.files[0].before,
    false,
    "candidate command file must differ from its base",
  );
});
