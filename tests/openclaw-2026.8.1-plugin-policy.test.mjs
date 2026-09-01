import assert from "node:assert/strict";
import test from "node:test";

import { prepareOpenClaw2026081PluginPolicy } from "../scripts/prepare-openclaw-2026.8.1-plugin-policy.mjs";

test("disables stale incompatible plugins and authorizes the reviewed WeCom hook", () => {
  const config = prepareOpenClaw2026081PluginPolicy({
    plugins: {
      entries: {
        "landing-chat": { enabled: true },
        "openclaw-qqbot": { enabled: true, config: { keep: true } },
        "wecom-openclaw-plugin": { enabled: true, config: { keep: true } },
      },
    },
  });

  assert.equal(config.plugins.entries["landing-chat"].enabled, false);
  assert.equal(config.plugins.entries["openclaw-qqbot"].enabled, false);
  assert.equal(config.plugins.entries["openclaw-qqbot"].config.keep, true);
  assert.equal(config.plugins.entries["openclaw-weixin"].enabled, false);
  assert.equal(config.plugins.entries.slack.enabled, false);
  assert.equal(config.plugins.entries["wecom-openclaw-plugin"].enabled, true);
  assert.equal(
    config.plugins.entries["wecom-openclaw-plugin"].hooks.allowConversationAccess,
    true,
  );
  assert.equal(config.plugins.entries["wecom-openclaw-plugin"].config.keep, true);
});

test("does not enable a disabled WeCom plugin", () => {
  const config = prepareOpenClaw2026081PluginPolicy({
    plugins: { entries: { "wecom-openclaw-plugin": { enabled: false } } },
  });
  assert.equal(config.plugins.entries["wecom-openclaw-plugin"].enabled, false);
  assert.equal(config.plugins.entries["wecom-openclaw-plugin"].hooks, undefined);
});
