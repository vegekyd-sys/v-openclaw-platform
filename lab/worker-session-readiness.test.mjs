import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sha = (value) => createHash("sha256").update(value).digest("hex");

test("non-Git operator sessions bypass the baseline write claim", () => {
  const baseline = read(
    "./release-files/session-diff-baseline-DLuS-HQ-.js",
  );
  const functionStart = baseline.indexOf(
    "async function ensureSessionDiffBaseline(params)",
  );
  const functionBody = baseline.slice(functionStart);
  const discovery = functionBody.indexOf(
    "await hasDiscoverableGitMetadata(params.cwd)",
  );
  const claim = functionBody.indexOf(
    "createSessionDiffBaselineCaptureClaim()",
  );
  assert(discovery >= 0);
  assert(claim > discovery);
  assert.match(
    baseline,
    /export \{[^}]*\bhasDiscoverableGitMetadata\b[^}]*\};/,
  );
});

test("command readiness populates the same process-local skill snapshot inputs", () => {
  const command = read("./release-files/agent-command-DPfawBbr.js");
  const start = command.indexOf(
    "async function prewarmAgentCommandRuntimes(params)",
  );
  const end = command.indexOf("async function resolveAgentCommandDeps", start);
  const body = command.slice(start, end);
  for (const expected of [
    "resolveReusableWorkspaceSkillSnapshot",
    "resolveEffectiveAgentSkillFilter(params.config, params.agentId)",
    "resolveNodeExecEligibility",
    "getRemoteSkillEligibility",
    'executionSkillsDir: path.join(executionCwd, "skills")',
    "pluginMetadataSnapshot",
    "watch: false",
    "skillSnapshotPrepared: true",
  ]) {
    assert(body.includes(expected), `missing ${expected}`);
  }
});

test("release sources differ from the exact deployed v3 base", () => {
  assert.notEqual(
    sha(read("./release-files/agent-command-DPfawBbr.js")),
    "b901716000cc1474a4c7982fe3fc7f5d9045beabb912efab4263c82435407c46",
  );
  assert.notEqual(
    sha(read("../experiments/agent-worker-isolation-v1/runtime-prewarm.mjs")),
    "353da5470410b65f6fe89a4516fd456665a704bc27653200631928f0d687d3c1",
  );
  assert.notEqual(
    sha(read("./release-files/session-diff-baseline-DLuS-HQ-.js")),
    "1e1d6ff55c983deab33905c6e7e4060f66dc0d958c7d97c2671d127d9e0dd2d9",
  );
});
