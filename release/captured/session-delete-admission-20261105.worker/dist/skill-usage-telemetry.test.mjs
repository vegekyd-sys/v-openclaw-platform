import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRelayedSkillUsageEvent,
  buildSkillTelemetryIndex,
  normalizeSkillTelemetrySource,
  resolveSkillTelemetryEntry,
} from "./skill-usage-telemetry.mjs";

test("builds a safe resolved-skill index from the native snapshot", () => {
  const index = buildSkillTelemetryIndex({
    resolvedSkills: [
      {
        name: "makaron",
        source: "agents-skills-personal",
        filePath: "/srv/skills/makaron/SKILL.md",
      },
      {
        name: "bundled-help",
        sourceInfo: { source: "openclaw-bundled" },
        baseDir: "/opt/openclaw/skills/bundled-help",
      },
      { name: "relative", filePath: "skills/relative/SKILL.md" },
    ],
  });
  assert.deepEqual(index, [
    {
      name: "makaron",
      source: "workspace",
      skillFile: "/srv/skills/makaron/SKILL.md",
    },
    {
      name: "bundled-help",
      source: "bundled",
      skillFile: "/opt/openclaw/skills/bundled-help/SKILL.md",
    },
  ]);
});

test("matches a skill using the same source normalization as OpenClaw", () => {
  const index = [
    { name: "makaron", source: "workspace", skillFile: "/a/SKILL.md" },
  ];
  assert.equal(normalizeSkillTelemetrySource("openclaw-workspace"), "workspace");
  assert.equal(
    resolveSkillTelemetryEntry(index, {
      skillName: "makaron",
      skillSource: "workspace",
    })?.skillFile,
    "/a/SKILL.md",
  );
});

test("builds an idempotent Worker Gateway skill usage event", () => {
  const relayed = buildRelayedSkillUsageEvent({
    contractVersion: "test-contract",
    request: {
      runId: "run-1",
      sessionId: "session-1",
      sessionKey: "agent:makaron:feishu:group:oc_test",
      agentId: "makaron",
    },
    skillTelemetryIndex: [
      {
        name: "makaron",
        source: "workspace",
        skillFile: "/srv/skills/makaron/SKILL.md",
      },
    ],
    event: {
      type: "skill.used",
      seq: 7,
      runId: "run-1",
      skillName: "makaron",
      skillSource: "workspace",
      activation: "read",
      toolName: "read",
      toolCallId: "tool-1",
    },
  });
  assert.equal(relayed.eventKind, "skill_usage");
  assert.equal(relayed.eventId, "skill.used:run-1:tool-1:makaron");
  assert.equal(relayed.usage.skillFile, "/srv/skills/makaron/SKILL.md");
  assert.equal(relayed.usage.sessionId, "session-1");
});

test("does not invent file identity for an unmatched skill", () => {
  assert.equal(
    buildRelayedSkillUsageEvent({
      contractVersion: "test-contract",
      request: { runId: "run-1", sessionKey: "session-key" },
      skillTelemetryIndex: [],
      event: {
        type: "skill.used",
        skillName: "missing",
        skillSource: "workspace",
      },
    }),
    undefined,
  );
});
