import assert from "node:assert/strict";
import test from "node:test";
import { classify, hotEffect, normalizePath, parseArgs, setPath, verdict } from "../scripts/v-config-precheck.mjs";

// reloadKind as production V's Gateway answered config.schema.lookup on 2026-10-12.
const V_LOOKUP = {
  gateway: "restart",
  browser: "restart",
  "browser.ssrfPolicy": "restart",
  "browser.ssrfPolicy.allowedHostnames": "restart",
  "browser.profiles": "hot",
  desktop: "restart",
  "desktop.host": "restart",
  plugins: "hot",
  "plugins.allow": "restart",
  "plugins.entries": "hot",
  messages: "none",
  "talk.realtime": "none",
  "talk.realtime.provider": "hot",
  "talk.realtime.transport": "none",
  channels: "restart",
  "channels.feishu": "hot",
};
const lookup = (path) => (V_LOOKUP[path] ? { path, reloadKind: V_LOOKUP[path] } : null);

test("paths: --set takes the part before =, brackets become dots", () => {
  assert.equal(setPath('browser.ssrfPolicy.allowedHostnames=["ha.lan"]'), "browser.ssrfPolicy.allowedHostnames");
  assert.equal(setPath("messages.ackReaction=@/tmp/v.json"), "messages.ackReaction");
  assert.equal(normalizePath('agents.defaults.models["deepseek/x"].alias'), "agents.defaults.models.deepseek/x.alias");
  assert.throws(() => setPath("=1"), /PATH=JSON/u);
  assert.throws(() => parseArgs([]), /at least one/u);
  assert.deepEqual(parseArgs(["--path", "desktop.host", "--json"]).paths, ["desktop.host"]);
});

test("10/12 incident: ssrfPolicy restarts while profiles is hot", () => {
  assert.equal(classify("browser.ssrfPolicy.allowedHostnames", lookup).reloadKind, "restart");
  const profile = classify("browser.profiles.ha-lab.cdpUrl", lookup);
  assert.equal(profile.reloadKind, "hot");
  assert.equal(profile.resolvedAt, "browser.profiles", "map keys resolve at the deepest known ancestor");
});

test("plugin rules: plugins.allow restarts on V even though the plugins prefix is hot", () => {
  assert.equal(classify("plugins.allow", lookup).reloadKind, "restart");
  assert.equal(classify("plugins.entries.xai.config.xSearch.timeoutSeconds", lookup).reloadKind, "hot");
});

test("unknown paths default to restart, like the Gateway", () => {
  const r = classify("nosuch.key", lookup);
  assert.equal(r.reloadKind, "restart");
  assert.equal(r.resolvedAt, null);
});

test("hot effects use the longest prefix", () => {
  assert.match(hotEffect("talk.realtime.provider"), /重载全部插件/u);
  assert.match(hotEffect("channels.feishu.streaming"), /断开重连/u);
  assert.match(hotEffect("agents.defaults.models.x.alias"), /心跳/u);
  assert.match(hotEffect("tools.profile"), /快照/u);
});

test("verdict: any restart path flags the whole change and points to v-self-restart", () => {
  const entries = ["browser.profiles.ha-lab", "browser.ssrfPolicy.allowedHostnames"].map((p) => classify(p, lookup));
  const report = verdict(entries, true);
  assert.equal(report.restartRequired, true);
  assert.match(report.advice.join("\n"), /v-self-restart/u);
  assert.match(report.entries[0].effect, /快照/u);
});

test("verdict: hot-only change and a stopped Gateway never require a restart", () => {
  const hot = verdict([classify("talk.realtime.transport", lookup), classify("messages.ackReaction", lookup)], true);
  assert.equal(hot.restartRequired, false);
  assert.match(hot.advice[0], /热生效/u);
  const stopped = verdict([{ path: "desktop.host", reloadKind: "restart", resolvedAt: "desktop.host" }], false);
  assert.equal(stopped.restartRequired, false);
  assert.match(stopped.advice[0], /没有运行/u);
});
