import { test } from "node:test";
import assert from "node:assert/strict";
import { includeInstructionsOf, setIncludeInstructions } from "./configure-v-codex-native-skills.mjs";

// makaron codex-home/config.toml on V, 2026-11-20 (no credentials in it)
const V = `approval_policy = "never"
sandbox_mode = "danger-full-access"

[projects."/root/makaron-openclaw/.openclaw-local/workspace"]
trust_level = "trusted"

[projects."/home/openclaw/makaron-openclaw/.openclaw-local/workspace"]
trust_level = "trusted"

[plugins."openai-developers@openai-curated"]
enabled = true

[model_providers.deepseek]
request_max_retries = 1
stream_max_retries = 1
name = "DeepSeek"
base_url = "https://api.deepseek.com/v1"
wire_api = "responses"
env_key = "DEEPSEEK_API_KEY"
`;

test("V's file has no value; apply appends one [skills] table and keeps every other byte", () => {
  assert.equal(includeInstructionsOf(V), undefined);
  const next = setIncludeInstructions(V, false);
  assert.equal(includeInstructionsOf(next), false);
  assert.equal(next, `${V}\n[skills]\ninclude_instructions = false\n`);
  assert.equal(setIncludeInstructions(next, false), next, "idempotent");
});

test("restore gives back the original file exactly", () => {
  assert.equal(setIncludeInstructions(setIncludeInstructions(V, false), undefined), V);
  assert.equal(setIncludeInstructions(V, undefined), V);
});

test("an existing [skills] table gets the key, and restore leaves its other keys", () => {
  const text = `a = 1\n\n[skills]\nbundled = true\n\n[x]\ny = 2\n`;
  const next = setIncludeInstructions(text, false);
  assert.equal(next, `a = 1\n\n[skills]\ninclude_instructions = false\nbundled = true\n\n[x]\ny = 2\n`);
  assert.equal(includeInstructionsOf(next), false);
  assert.equal(setIncludeInstructions(next, undefined), text);
});

test("an existing true value is switched, in a table or as a root dotted key", () => {
  assert.equal(setIncludeInstructions(`[skills]\ninclude_instructions = true\n`, false), `[skills]\ninclude_instructions = false\n`);
  assert.equal(setIncludeInstructions(`skills.include_instructions = true\n[a]\nb = 1\n`, false), `skills.include_instructions = false\n[a]\nb = 1\n`);
  assert.equal(includeInstructionsOf(`skills.include_instructions = false # off\n`), false);
});

test("the same key in another table is not the skills key", () => {
  const text = `[other]\ninclude_instructions = false\n`;
  assert.equal(includeInstructionsOf(text), undefined);
  assert.equal(includeInstructionsOf(setIncludeInstructions(text, false)), false);
  assert.match(setIncludeInstructions(text, false), /\[other\]\ninclude_instructions = false\n\n\[skills\]\ninclude_instructions = false\n$/u);
});

test("an [[skills.config]] array table does not count as [skills]", () => {
  const text = `[[skills.config]]\npath = "/x/SKILL.md"\nenabled = false\n`;
  const next = setIncludeInstructions(text, false);
  assert.equal(includeInstructionsOf(next), false);
  assert.equal(setIncludeInstructions(next, undefined), text);
});

test("ambiguous files are refused", () => {
  assert.throws(() => setIncludeInstructions(`[skills]\na = 1\n[skills]\nb = 2\n`, false), /defined twice/u);
  assert.throws(() => setIncludeInstructions(`skills.include_instructions = true\n[skills]\ninclude_instructions = true\n`, false), /more than once/u);
});
