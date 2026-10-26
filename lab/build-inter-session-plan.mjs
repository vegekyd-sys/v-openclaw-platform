#!/usr/bin/env node
// The one release plan of the inter-session work (docs/inter-session/design.md
// §11 WP12; R1 and R2 ship together): every core dist file, the Feishu monitor,
// the DingTalk and WeCom files, and the whole v-session-relay plugin directory.
// `before` is V's bytes (tests/fixtures/inter-session-v-bytes.json, checked
// against the capture), `after` the committed artifact. The plugin is new on
// both hosts, so its files have `before: null`.
//
//   node lab/build-inter-session-plan.mjs           write lab/inter-session.plan.json
//   node lab/build-inter-session-plan.mjs --check   exit 1 when the committed plan is stale
//
// Rerun it whenever a package regenerates an artifact or the plugin gains or
// loses a file. tests/inter-session-plan.test.mjs re-runs every package's
// patcher on V's captured bytes and fails on any difference, and simulates the
// shared-VLab deploy/rollback and the promotion to V with this plan.
//
// The plan does not change any config: the plugin is switched on afterwards
// with scripts/configure-v-session-relay.mjs (docs/inter-session/README.md).

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PLAN = "lab/inter-session.plan.json";
export const V_BYTES = "tests/fixtures/inter-session-v-bytes.json";

export const FEISHU = "npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu";
export const DINGTALK = "npm/projects/dingtalk-real-ai-dingtalk-connector-aa54111b45__openclaw-generation__g-7ae9583359ddbec0/node_modules/@dingtalk-real-ai/dingtalk-connector";
export const WECOM = "extensions/wecom-openclaw-plugin";
export const PLUGIN_SOURCE = "apps/v-session-relay/plugin";
export const PLUGIN_TARGET = "extensions/v-session-relay";

const row = (pkg, component, file, source, target, module, fn) => Object.freeze({ pkg, component, file, source, target, module, fn });
const RF = "lab/release-files";

// Every V file the release replaces: the package that owns it, its artifact, its
// stage target, and the function that makes the artifact from V's bytes.
export const PATCHED = Object.freeze([
  row("sessions-send-relay", "core", "sessions-spawn-tool-1FQMTkIo.js", `${RF}/sessions-send-relay/generated/sessions-spawn-tool-1FQMTkIo.js`,
    "openclaw/dist/sessions-spawn-tool-1FQMTkIo.js", `${RF}/sessions-send-relay/patch.mjs`, "patchSessionsSendRelay"),
  row("sessions-send-relay", "core", "openclaw-tools-BODVdJQD.js", `${RF}/sessions-send-relay/generated/openclaw-tools-BODVdJQD.js`,
    "openclaw/dist/openclaw-tools-BODVdJQD.js", `${RF}/sessions-send-relay/patch.mjs`, "patchOpenclawTools"),
  row("inter-session-admission", "core", "get-reply-CqW1y05D.js", `${RF}/inter-session-admission/generated/get-reply-CqW1y05D.js`,
    "openclaw/dist/get-reply-CqW1y05D.js", `${RF}/inter-session-admission/patch.mjs`, "patchGetReply"),
  row("inter-session-admission", "core", "agent-runner.runtime-CAdsMsQt.js", `${RF}/inter-session-admission/generated/agent-runner.runtime-CAdsMsQt.js`,
    "openclaw/dist/agent-runner.runtime-CAdsMsQt.js", `${RF}/inter-session-admission/patch.mjs`, "patchAgentRunnerRuntime"),
  row("inter-session-admission", "core", "dispatch-from-config-DOJq_7CI.js", `${RF}/inter-session-admission/generated/dispatch-from-config-DOJq_7CI.js`,
    "openclaw/dist/dispatch-from-config-DOJq_7CI.js", `${RF}/inter-session-admission/patch.mjs`, "patchDispatchFromConfig"),
  row("task-bridge-extra-sources", "core", "task-registry-activity-DSlVVJwD.js", `${RF}/task-bridge-extra-sources/generated/task-registry-activity-DSlVVJwD.js`,
    "openclaw/dist/task-registry-activity-DSlVVJwD.js", `${RF}/task-bridge-extra-sources/patch.mjs`, "patchTaskBridgeExtraSources"),
  row("v-experience-session-kind", "core", "v-experience.js", `${RF}/v-experience-session-kind/openclaw/dist/v-experience.js`,
    "openclaw/dist/v-experience.js", `${RF}/v-experience-session-kind/patch.mjs`, "patchExperienceSessionKind"),
  row("telegram-inter-session-bridge", "core", "telegram-ingress-drain-factory-DJM2Jqrc.js", `${RF}/telegram-inter-session-bridge/generated/telegram-ingress-drain-factory-DJM2Jqrc.js`,
    "openclaw/dist/telegram-ingress-drain-factory-DJM2Jqrc.js", `${RF}/telegram-inter-session-bridge/patch.mjs`, "patchTelegramIngress"),
  row("telegram-inter-session-bridge", "core", "bot-message-DC6p8sB3.js", `${RF}/telegram-inter-session-bridge/generated/bot-message-DC6p8sB3.js`,
    "openclaw/dist/bot-message-DC6p8sB3.js", `${RF}/telegram-inter-session-bridge/patch.mjs`, "patchTelegramDispatch"),
  row("feishu-inter-session-bridge", "feishu", "monitor.account-WFdlCDhR.js", `${RF}/feishu-inter-session-bridge/generated/monitor.account-WFdlCDhR.js`,
    `${FEISHU}/dist/monitor.account-WFdlCDhR.js`, `${RF}/feishu-inter-session-bridge/patch.mjs`, "patchFeishuInterSessionBridge"),
  row("dingtalk-inter-session-bridge", "dingtalk", "connection-DCvu-l09.mjs", `${RF}/dingtalk-inter-session-bridge/dist/connection-DCvu-l09.mjs`,
    `${DINGTALK}/dist/connection-DCvu-l09.mjs`, "apps/v-experience/dingtalk/patch-inter-session.mjs", "patchConnectionChunk"),
  row("dingtalk-inter-session-bridge", "dingtalk", "message-handler-BUoLSylZ.mjs", `${RF}/dingtalk-inter-session-bridge/dist/message-handler-BUoLSylZ.mjs`,
    `${DINGTALK}/dist/message-handler-BUoLSylZ.mjs`, "apps/v-experience/dingtalk/patch-inter-session.mjs", "patchMessageHandlerChunk"),
  row("v-experience-session-kind", "dingtalk", "v-experience.mjs", `${RF}/v-experience-session-kind/dingtalk/dist/v-experience.mjs`,
    `${DINGTALK}/dist/v-experience.mjs`, `${RF}/v-experience-session-kind/patch.mjs`, "patchExperienceSessionKind"),
  row("wecom-inter-session-bridge", "wecom", "monitor.js", `${RF}/wecom-inter-session-bridge/dist/src/monitor.js`,
    `${WECOM}/dist/src/monitor.js`, "apps/v-experience/wecom/patch-inter-session.mjs", "patchWeComInterSessionBridge"),
  row("v-experience-session-kind", "wecom", "v-experience.mjs", `${RF}/v-experience-session-kind/wecom/dist/src/v-experience.mjs`,
    `${WECOM}/dist/src/v-experience.mjs`, `${RF}/v-experience-session-kind/patch.mjs`, "patchExperienceSessionKind"),
]);

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (repo, rel) => fs.readFileSync(path.join(repo, rel));

/** V's record of a file: { captured, sha256, hostPath, ... } from the fixture. */
export function vBytesOf(fixture, component, file) {
  const hits = fixture.files.filter((f) => f.component === component && f.file === file);
  if (hits.length !== 1) throw new Error(`${component}/${file}: ${hits.length} entries in ${V_BYTES}`);
  return hits[0];
}

/**
 * The files the plugin ships (package.json "files" plus package.json itself),
 * as paths relative to the plugin directory. Its tests/ never ship.
 */
export function pluginFiles(repo = REPO) {
  const root = path.join(repo, PLUGIN_SOURCE);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const out = new Set(["package.json"]);
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (fs.statSync(abs).isDirectory()) {
      for (const name of fs.readdirSync(abs)) walk(rel ? `${rel}/${name}` : name);
    } else out.add(rel);
  };
  for (const entry of pkg.files) walk(entry.replace(/\/$/u, ""));
  return [...out].sort();
}

export function buildPlan(repo = REPO) {
  const fixture = JSON.parse(fs.readFileSync(path.join(repo, V_BYTES), "utf8"));
  const files = [];
  for (const r of PATCHED) {
    const v = vBytesOf(fixture, r.component, r.file);
    const before = sha256(read(repo, v.captured));
    if (before !== v.sha256) throw new Error(`${v.captured} is not the bytes recorded on V (${before} != ${v.sha256})`);
    files.push({ source: r.source, target: r.target, before, after: sha256(read(repo, r.source)) });
  }
  for (const rel of pluginFiles(repo)) {
    files.push({ source: `${PLUGIN_SOURCE}/${rel}`, target: `${PLUGIN_TARGET}/${rel}`, before: null, after: sha256(read(repo, `${PLUGIN_SOURCE}/${rel}`)) });
  }
  return { baseRelease: "REPLACE_AT_STAGE", files };
}

export const render = (plan) => `${JSON.stringify(plan, null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = render(buildPlan());
  const file = path.join(REPO, PLAN);
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (process.argv.includes("--check")) {
    if (current !== text) {
      console.error(`${PLAN} is stale: node lab/build-inter-session-plan.mjs`);
      process.exit(1);
    }
    console.log(`${PLAN} is current`);
  } else {
    fs.writeFileSync(file, text);
    console.log(`wrote ${PLAN}: ${JSON.parse(text).files.length} files`);
  }
}
