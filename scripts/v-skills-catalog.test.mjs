import { test } from "node:test";
import assert from "node:assert/strict";
import { readProposal, applyProposal, restoreSkills, pending, describePrompt } from "./v-skills-catalog.mjs";

const proposal = { limits: { maxSkillsInPrompt: 400, maxSkillsPromptChars: 40000 }, disable: ["gsap", "meshy-3d-agent", "feishu-doc"] };
const v = () => ({ skills: { install: { nodeManager: "npm" }, entries: {
  "meshy-3d-agent": { apiKey: { source: "file", provider: "skillhub", id: "/MESHY_API_KEY" }, enabled: true },
  "feishu-doc": { enabled: false },
  "didi-ride-skill": { enabled: true },
} } });

test("the shipped proposal is well formed and keeps the skills V uses most", () => {
  const shipped = readProposal();
  assert.equal(new Set(shipped.disable).size, shipped.disable.length);
  assert(shipped.limits.maxSkillsInPrompt > 339, "the count limit must not cut the catalog again");
  for (const name of ["makaron", "scene-cli", "material-verification", "lark-base", "lark-doc", "lark-shared", "night-shift-operator",
    "lark-user-auth-flow", "hyperframes-audio", "remote-browser-cdp", "skill-creation-coach",
    "ai-video-brief", "background-worker-contract", "geelark-cloud-phone", "cdn-upload", "wecom-unified", "wecom-send-media", "hyperframes"]) {
    assert(!shipped.disable.includes(name), `${name} is in use and must stay enabled`);
  }
});

test("apply sets the limits, switches the keys off, keeps other fields, and is idempotent", () => {
  const config = v();
  const changes = applyProposal(config, proposal);
  assert.deepEqual(changes.map((c) => c.key), ["skills.limits", "skills.entries.gsap.enabled", "skills.entries.meshy-3d-agent.enabled"]);
  assert.deepEqual(config.skills.limits, proposal.limits);
  assert.deepEqual(config.skills.entries["meshy-3d-agent"].apiKey, v().skills.entries["meshy-3d-agent"].apiKey);
  assert.equal(config.skills.entries.gsap.enabled, false);
  assert.deepEqual(config.skills.entries["didi-ride-skill"], { enabled: true });
  assert.deepEqual(pending(config, proposal), { limitsDiffer: false, stillEnabled: [] });
  assert.equal(applyProposal(config, proposal).length, 0);
});

test("restore puts the backup's skills section back and leaves the rest of the config alone", () => {
  const backup = { ...v(), gateway: { port: 1 } };
  const config = structuredClone(backup);
  applyProposal(config, proposal);
  config.gateway.port = 2; // changed by someone else since
  assert.equal(restoreSkills(config, backup).length, 1);
  assert.deepEqual(config.skills, v().skills);
  assert.equal(config.gateway.port, 2);
  assert.equal(restoreSkills(config, backup).length, 0);
});

test("describePrompt reads what the catalog admitted", () => {
  const prompt = [
    "⚠️ Skills truncated: included 2 of 3 (compact format, descriptions omitted). Run `openclaw skills check` to audit.",
    "<available_skills>",
    "  <skill>", "    <name>a</name>", "    <location>~/a/SKILL.md</location>", "  </skill>",
    "  <skill>", "    <name>b</name>", "    <description>bee</description>", "    <location>~/b/SKILL.md</location>", "  </skill>",
    "</available_skills>",
  ].join("\n");
  const d = describePrompt(prompt);
  assert.deepEqual(d.names, ["a", "b"]);
  assert.equal(d.withDescription, 1);
  assert.equal(d.longestDescription, 3);
  assert.match(d.note, /included 2 of 3/u);
});
