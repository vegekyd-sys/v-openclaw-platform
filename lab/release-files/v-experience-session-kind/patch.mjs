// Inter-session collaboration (docs/inter-session/design.md §3.7 last bullet, §7.9,
// §13 item 12): the background line of Telegram, DingTalk and WeCom names a
// sessions_send request another session is working on 「会话请求」, like Feishu does.
//
// The v-session-relay plugin adds one row per in-flight request to the requester's
// task registry bridge (task-bridge-extra-sources, WP3):
//   { taskId: "v-a2a:<sendId>", runtime: "session", taskKind: "sessions_send", … }
// Unpatched, `backgroundKind` calls it 「后台任务」 (an acceptable fallback). Patched:
//   ⏳ 后台 3 项进行中 · 会话请求 2 · 后台命令 1
//
// Two edits in v-experience, nothing else changes:
//   - `KIND_ORDER` starts with 「会话请求」 (the same order the Feishu card uses);
//   - `backgroundKind` returns 「会话请求」 for taskKind "sessions_send", before any
//     runtime check.
//
// V runs three byte-identical copies of v-experience (core dist `v-experience.js` for
// Telegram, the DingTalk connector's and the WeCom plugin's `v-experience.mjs`). They
// are generated here from V's captured bytes, never from apps/v-experience/v-experience.mjs,
// which already carries changes V does not run (release-artifact-rebase-trap). The
// same function is applied to the app source, so the next full copy keeps the kind.
//
//   node lab/release-files/v-experience-session-kind/patch.mjs --write
//     regenerates the three copies and manifest.json from the capture.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "v-experience-session-kind-v1";
export const TASK_KIND = "sessions_send";
export const KIND_LABEL = "会话请求";

export const ORDER_ANCHOR = 'const KIND_ORDER = ["子 agent", "后台命令", "生图", "生成视频", "生成音乐", "自动化", "后台任务"];\n';
export const ORDER_PATCHED = `// ${MARKER}: 「${KIND_LABEL}」 is a sessions_send request another session is working on.
const KIND_ORDER = ["${KIND_LABEL}", "子 agent", "后台命令", "生图", "生成视频", "生成音乐", "自动化", "后台任务"];
`;
export const KIND_ANCHOR = '  const kind = typeof task?.taskKind === "string" ? task.taskKind : "";\n';
export const KIND_PATCHED = `${KIND_ANCHOR}  if (kind === "${TASK_KIND}") return "${KIND_LABEL}";\n`;

function once(source, anchor, label) {
  const parts = source.split(anchor);
  if (parts.length !== 2) {
    throw new Error(`${label}: expected exactly one anchor, found ${parts.length - 1}`);
  }
  return parts;
}

/** v-experience with the 「会话请求」 kind, from the exact bytes V runs (or the app source). */
export function patchExperienceSessionKind(source) {
  if (source.includes(MARKER)) {
    throw new Error("already patched");
  }
  const [beforeOrder, afterOrder] = once(source, ORDER_ANCHOR, "KIND_ORDER");
  let out = `${beforeOrder}${ORDER_PATCHED}${afterOrder}`;
  const [beforeKind, afterKind] = once(out, KIND_ANCHOR, "backgroundKind taskKind");
  out = `${beforeKind}${KIND_PATCHED}${afterKind}`;
  return out;
}

const CAPTURE = "release/captured/v2026.9.1-db91.6-subagent-index-20261020";
const DINGTALK_PROJECT = "npm/projects/dingtalk-real-ai-dingtalk-connector-aa54111b45__openclaw-generation__g-7ae9583359ddbec0/node_modules/@dingtalk-real-ai/dingtalk-connector";

/**
 * The three copies V runs. `path` is the component-relative path (as in
 * v-experience-channels/manifest.json), `capture` V's captured bytes, `source` the
 * generated file (repo-relative), `target` the shared-VLab / promote target.
 */
export const COPIES = Object.freeze([
  Object.freeze({
    component: "core",
    path: "v-experience.js",
    capture: `${CAPTURE}/dist/v-experience.js`,
    source: "lab/release-files/v-experience-session-kind/openclaw/dist/v-experience.js",
    target: "openclaw/dist/v-experience.js",
    hostPath: "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/v-experience.js",
  }),
  Object.freeze({
    component: "dingtalk",
    path: "dist/v-experience.mjs",
    capture: `${CAPTURE}.dingtalk/dist/dist/v-experience.mjs`,
    source: "lab/release-files/v-experience-session-kind/dingtalk/dist/v-experience.mjs",
    target: `${DINGTALK_PROJECT}/dist/v-experience.mjs`,
    hostPath: `/home/openclaw/.openclaw/${DINGTALK_PROJECT}/dist/v-experience.mjs`,
  }),
  Object.freeze({
    component: "wecom",
    path: "dist/src/v-experience.mjs",
    capture: `${CAPTURE}.wecom/dist/dist/src/v-experience.mjs`,
    source: "lab/release-files/v-experience-session-kind/wecom/dist/src/v-experience.mjs",
    target: "extensions/wecom-openclaw-plugin/dist/src/v-experience.mjs",
    hostPath: "/home/openclaw/.openclaw/extensions/wecom-openclaw-plugin/dist/src/v-experience.mjs",
  }),
]);

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Manifest entries: before = V's bytes, after = the generated copy. */
export function buildManifest(repoRoot) {
  return COPIES.map((copy) => {
    const before = fs.readFileSync(path.join(repoRoot, copy.capture), "utf8");
    return {
      component: copy.component,
      path: copy.path,
      source: copy.source,
      target: copy.target,
      hostPath: copy.hostPath,
      before: sha256(before),
      after: sha256(patchExperienceSessionKind(before)),
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "--write") {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  for (const copy of COPIES) {
    const out = path.join(root, copy.source);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, patchExperienceSessionKind(fs.readFileSync(path.join(root, copy.capture), "utf8")));
  }
  fs.writeFileSync(path.join(root, "lab/release-files/v-experience-session-kind/manifest.json"), `${JSON.stringify(buildManifest(root), null, 2)}\n`);
}
