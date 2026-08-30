import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createProjectSandboxHostDenyPolicy,
  normalizeProjectSandboxPolicyToolName,
} from "../plugin/core/policy.js";

test("plugin manifest declares routing Skill, fail-closed Agent exposure, and opt-in host restriction", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../plugin/openclaw.plugin.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(manifest.contracts.trustedToolPolicies, ["project-sandbox-host-deny"]);
  assert.deepEqual(manifest.configSchema.properties.allowedAgentIds.default, []);
  assert.equal(manifest.configSchema.properties.allowedAgentIds.uniqueItems, true);
  assert.deepEqual(manifest.configSchema.properties.allowedSessionKeys.default, []);
  assert.deepEqual(manifest.configSchema.properties.allowedSessionPrefixes.default, []);
  assert.deepEqual(manifest.configSchema.properties.blockedAgentIds.default, []);
  assert.equal(manifest.configSchema.properties.blockedAgentIds.uniqueItems, true);
  assert.deepEqual(manifest.skills, ["./skill"]);
});

test("routing Skill selects Sandbox for approved project execution without taking over ordinary Agent work", async () => {
  const skill = await readFile(new URL("../plugin/skill/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /current Session exposes `project_sandbox_open`/);
  assert.match(skill, /searchable rather than already loaded/);
  assert.match(skill, /ordinary conversation/);
  assert.match(skill, /no matching approved project/);
  assert.match(skill, /Do not silently edit the Gateway host project instead/);
});

test("configured agents deny host tools, Codex aliases, and every non-allowlisted tool", async () => {
  const policy = createProjectSandboxHostDenyPolicy({
    blockedAgentIds: [" VLab-Sandbox-Codex "],
  });
  const context = { agentId: "vlab-sandbox-codex" };

  for (const toolName of [
    "exec",
    "exec_command",
    "bash",
    "process",
    "code_execution",
    "read",
    "read_file",
    "write",
    "write_file",
    "edit",
    "apply_patch",
    "apply-patch",
    "view_image",
    "tool_search",
    "future_native_tool_not_known_today",
  ]) {
    const decision = await policy.evaluate({ toolName, params: {} }, context);
    assert.equal(decision?.allow, false, `${toolName} must be denied`);
    assert.match(decision?.reason ?? "", /only project_sandbox_\* and message/);
  }

  assert.equal(normalizeProjectSandboxPolicyToolName("exec_command"), "exec");
  assert.equal(normalizeProjectSandboxPolicyToolName("apply-patch"), "apply_patch");
});

test("configured agents can still use Project Sandbox and message tools", async () => {
  const policy = createProjectSandboxHostDenyPolicy({
    blockedAgentIds: ["vlab-sandbox-codex"],
  });
  const context = { agentId: "vlab-sandbox-codex" };

  for (const toolName of [
    "project_sandbox_open",
    "project_sandbox_files",
    "project_sandbox_exec",
    "project_sandbox_finish",
    "message",
  ]) {
    assert.equal(await policy.evaluate({ toolName, params: {} }, context), undefined);
  }
});

test("an empty policy and non-target agents pass through unchanged", async () => {
  const emptyPolicy = createProjectSandboxHostDenyPolicy();
  assert.equal(
    await emptyPolicy.evaluate({ toolName: "exec", params: {} }, { agentId: "any-agent" }),
    undefined,
  );

  const scopedPolicy = createProjectSandboxHostDenyPolicy({
    blockedAgentIds: ["vlab-sandbox-codex"],
  });
  for (const agentId of ["main", "makaron", undefined]) {
    assert.equal(
      await scopedPolicy.evaluate({ toolName: "exec_command", params: {} }, { agentId }),
      undefined,
      `${agentId ?? "missing agent id"} must not be affected`,
    );
  }
});
