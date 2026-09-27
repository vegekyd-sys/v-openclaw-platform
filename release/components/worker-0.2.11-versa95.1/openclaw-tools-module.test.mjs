import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveOpenClawToolsModule } from "./openclaw-tools-module.mjs";

const SKILL_MARKER = "Create the Skill Workshop tool for proposal discovery";

async function dist(files) {
  const dir = await mkdtemp(join(tmpdir(), "openclaw-tools-module-"));
  for (const [name, source] of Object.entries(files)) {
    await writeFile(join(dir, name), source);
  }
  return dir;
}

test("9.6 layout: .mjs chunk beside a re-export stub and a separate sessions_spawn chunk", async () => {
  const dir = await dist({
    "openclaw-tools-BKfU1ivV.mjs":
      'import { t as createOpenClawTools } from "./openclaw-tools-CQs499-L.mjs";\nexport { createOpenClawTools };\n',
    "openclaw-tools-CQs499-L.mjs": `/** ${SKILL_MARKER} and lifecycle actions. */\nfunction createOpenClawTools(options) {}\nexport { createOpenClawTools as t };\n`,
    "openclaw-tools-serve-config-C8JxIGR6.mjs": "export const x = 1;\n",
    "openclaw-tools.requester-yield-a2lv_CJZ.mjs": "export const y = 1;\n",
    "sessions-spawn-tool-Cfb0wE6v.mjs": "// sessions_spawn built-in tool\n",
  });
  try {
    const expected = join(dir, "openclaw-tools-CQs499-L.mjs");
    assert.equal(await resolveOpenClawToolsModule(dir, { marker: SKILL_MARKER }), expected);
    assert.equal(await resolveOpenClawToolsModule(dir), expected);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("9.5 layout: .js chunk still resolves", async () => {
  const dir = await dist({
    "openclaw-tools-abc123.js": `// ${SKILL_MARKER}\n// sessions_spawn built-in tool\nfunction createOpenClawTools() {}\nexport { createOpenClawTools as t };\n`,
    "openclaw-tools-stub.js": 'export { t as createOpenClawTools } from "./openclaw-tools-abc123.js";\n',
  });
  try {
    assert.equal(
      await resolveOpenClawToolsModule(dir, { marker: SKILL_MARKER }),
      join(dir, "openclaw-tools-abc123.js"),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fails loudly when the marked tool moved out of the factory chunk", async () => {
  const dir = await dist({
    "openclaw-tools-CQs499-L.mjs": "function createOpenClawTools() {}\n",
    "skill-workshop-XYZ.mjs": `// ${SKILL_MARKER}\n`,
  });
  try {
    await assert.rejects(
      resolveOpenClawToolsModule(dir, { marker: SKILL_MARKER, label: "Skill Workshop" }),
      /expected one OpenClaw tools module with Skill Workshop, found 0/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
