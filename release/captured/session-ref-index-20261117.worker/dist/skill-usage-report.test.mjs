import assert from "node:assert/strict";
import test from "node:test";
import { buildSkillUsageReport } from "./skill-usage-report.mjs";

test("reports cumulative and post-baseline Skill activation counts", () => {
  const report = buildSkillUsageReport(
    [
      {
        skill_file: "/skills/a/SKILL.md",
        skill_key: "a",
        skill_name: "A",
        skill_source: "workspace",
        first_used_at_ms: 10,
        last_used_at_ms: 30,
        use_count: 5,
        last_agent_id: "makaron",
      },
      {
        skill_file: "/skills/b/SKILL.md",
        skill_key: "b",
        skill_name: "B",
        skill_source: "bundled",
        first_used_at_ms: 20,
        last_used_at_ms: 40,
        use_count: 2,
        last_agent_id: null,
      },
    ],
    [
      { skillFile: "/skills/a/SKILL.md", useCount: 3 },
      { skillFile: "/skills/b/SKILL.md", useCount: 2 },
    ],
  );
  assert.equal(report.trackedSkills, 2);
  assert.equal(report.totalActivations, 7);
  assert.equal(report.deltaActivations, 2);
  assert.equal(report.skills[0].skillKey, "a");
  assert.equal(report.skills[0].deltaUseCount, 2);
  assert.equal(report.skills[1].deltaUseCount, 0);
});
