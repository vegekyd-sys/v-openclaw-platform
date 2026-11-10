import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY, VALUE, readSetting, writeSetting } from "./configure-v-codex-post-turn-compact.mjs";

// V's makaron codex-home/config.toml as of 2026-11-09 (the /vds default switch added retries).
const V_TOML = `approval_policy = "never"
sandbox_mode = "danger-full-access"

[projects."/home/openclaw/makaron-openclaw/.openclaw-local/workspace"]
trust_level = "trusted"

[model_providers.deepseek]
request_max_retries = 1
stream_max_retries = 1
name = "DeepSeek"
base_url = "https://api.deepseek.com/v1"
wire_api = "responses"
`;

test("90% of DeepSeek's usable 950k window sits under Codex's 900k compaction line with room for a re-delivered context", () => {
  const threshold = (1_000_000 * 95) / 100 * VALUE / 100;
  assert.equal(threshold, 855_000);
  assert(900_000 - threshold >= 40_000, "a ~25k-token context re-delivery plus the message must not cross 900k");
});

test("apply puts the key at top level before every table, restore removes it, both idempotent", () => {
  assert.equal(readSetting(V_TOML), undefined);
  const applied = writeSetting(V_TOML, VALUE);
  assert.equal(readSetting(applied), VALUE);
  assert.ok(applied.indexOf(`${KEY} = ${VALUE}`) < applied.indexOf("["), "top-level keys must precede tables");
  assert.equal(writeSetting(applied, VALUE), applied, "applying twice changes nothing");
  assert.equal(writeSetting(applied, undefined), V_TOML, "restore gives back V's file byte for byte");
  assert.equal(writeSetting(V_TOML, undefined), V_TOML);
});

test("a value under a table or a non-integer value is refused, not rewritten", () => {
  assert.throws(() => readSetting(`${V_TOML}${KEY} = 90\n`), /under a \[table\]/u);
  assert.throws(() => readSetting(`${KEY} = "90"\n`), /not an integer/u);
  assert.equal(readSetting(`${KEY} = 85 # tuned\n${V_TOML}`), 85);
});
