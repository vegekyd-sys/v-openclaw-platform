import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../scripts/accept-openclaw-2026.8.1-plugin-capabilities.sh", import.meta.url),
  "utf8",
);

test("capability acceptance targets only reviewed active local plugins", () => {
  assert.match(source, /nightshift-feishu/);
  assert.match(source, /openclaw-deck/);
  assert.match(source, /wecom-openclaw-plugin/);
  assert.match(source, /--accept-capabilities/);
  assert.doesNotMatch(source, /openclaw-qqbot/);
  assert.doesNotMatch(source, /openclaw-weixin/);
});
