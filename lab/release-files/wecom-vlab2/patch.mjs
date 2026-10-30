// Rebuilds the WeCom plugin bytes V runs as `2026.8.17-vlab.2` from the
// published `@wecom/wecom-openclaw-plugin@2026.8.17` package.
//
// vlab.2 = vlab.1 (sender context: `sender-name.ts` and the monitor hunks of
// `wecom-openclaw-plugin-2026.8.17.patch`, from
// integrations/wecom-sender-context-v0.1.0 on branch
// codex/wecom-sender-context-v0.1.0, built with tsc) + the native per-tool
// runtime config fix (scripts/patch-wecom-runtime-config.mjs) + the package
// metadata of the installed artifact (pinned dependencies, the README of
// upstream commit 3b1cbe3).
//
//   patchWecomVlab2(packageDir)
//
// rewrites README.md, package.json, dist/index.js, dist/src/cli/tool.js and
// dist/src/monitor.js in place and writes dist/src/sender-name.{js,d.ts}
// (`release/`, tsc output of `sender-name.ts`). Every anchor must match exactly
// once; an already patched file is left unchanged.
// apps/v-experience/wecom/patch.mjs then applies on top of dist/src.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { patchWecomEntry, patchWecomTool } from "../../../scripts/patch-wecom-runtime-config.mjs";

export const VERSION = "2026.8.17-vlab.2";
const here = path.dirname(fileURLToPath(import.meta.url));

function once(source, before, after, label) {
  if (source.includes(after)) return source;
  assert.equal(source.split(before).length - 1, 1, `wecom-vlab2 ${label}: anchor must match once`);
  return source.replace(before, () => after);
}

const README_HEAD = "English | [中文版](./README.zh.md)\n\n";
export const patchReadme = (source) => (source.startsWith(README_HEAD) ? source : README_HEAD + source);

const PINNED = [
  ['"@wecom/aibot-node-sdk": "^1.0.6"', '"@wecom/aibot-node-sdk": "1.0.7"'],
  ['"@wecom/cli": "^1.0.0"', '"@wecom/cli": "1.1.0"'],
  ['"fast-xml-parser": "^5.5.9"', '"fast-xml-parser": "5.11.0"'],
  ['"file-type": "^21.3.0"', '"file-type": "21.3.4"'],
  ['"undici": "^7.24.6"', '"undici": "7.29.0"'],
];

export function patchPackageJson(source) {
  let s = once(source, '"version": "2026.8.17",', `"version": "${VERSION}",`, "version");
  for (const [before, after] of PINNED) s = once(s, before, after, "dependency pin");
  return s;
}

const SENDER_RESOLVER = `import { createWeComCliTool } from "./cli/tool.js";
import { SenderNameResolver } from "./sender-name.js";
const cliToolsByAccount = new Map();
const senderNameResolver = new SenderNameResolver({
    lookup: async (accountId, userid) => {
        let tool = cliToolsByAccount.get(accountId);
        if (!tool) {
            tool = createWeComCliTool({ accountId });
            cliToolsByAccount.set(accountId, tool);
        }
        const result = await tool.execute("wecom-sender-name", {
            args: ["contact", "users", "search", "--json", JSON.stringify({ keywords: [userid] })],
        });
        const text = result.content.find((item) => item.type === "text")?.text;
        return text ?? result.details;
    },
});
`;

/** The sender-context hunks of vlab.1, as tsc emitted them. */
export function patchMonitorSenderContext(source) {
  const version = 'import { PLUGIN_VERSION } from "./version.js";\n';
  let s = once(source, version, version + SENDER_RESOLVER, "imports");
  s = once(
    s,
    "\nfunction buildMessageContext(frame, account, config, text, mediaList, quoteContent, runtime) {",
    "\nasync function buildMessageContext(frame, account, config, text, mediaList, quoteContent, runtime) {",
    "async context",
  );
  const chatType = '    const chatType = body.chattype === "group" ? "group" : "direct";\n';
  s = once(
    s,
    chatType + "    // 解析路由信息\n",
    chatType +
      "    const senderName = chatType === \"group\"\n        ? await senderNameResolver.resolve(account.accountId, body.from.userid)\n        : undefined;\n    // 解析路由信息\n",
    "resolve sender",
  );
  s = once(s, "        SenderId: body.from.userid,\n", "        SenderId: body.from.userid,\n        SenderName: senderName,\n", "SenderName");
  s = once(
    s,
    "} = buildMessageContext(frame, account, config, text, mediaList, quoteContent, runtime);",
    "} = await buildMessageContext(frame, account, config, text, mediaList, quoteContent, runtime);",
    "await context",
  );
  return s;
}

export function patchWecomVlab2(packageDir) {
  const edits = [
    ["README.md", patchReadme],
    ["package.json", patchPackageJson],
    ["dist/index.js", patchWecomEntry],
    ["dist/src/cli/tool.js", patchWecomTool],
    ["dist/src/monitor.js", patchMonitorSenderContext],
  ];
  const files = {};
  for (const [rel, fn] of edits) {
    const p = path.join(packageDir, rel);
    const before = fs.readFileSync(p, "utf8");
    const after = fn(before);
    if (after !== before) fs.writeFileSync(p, after);
    files[rel] = after !== before;
  }
  for (const name of ["sender-name.js", "sender-name.d.ts"]) {
    const target = path.join(packageDir, "dist/src", name);
    const bytes = fs.readFileSync(path.join(here, "release", name));
    files[`dist/src/${name}`] = !fs.existsSync(target) || !fs.readFileSync(target).equals(bytes);
    fs.writeFileSync(target, bytes);
  }
  return { version: VERSION, changed: Object.values(files).some(Boolean), files };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [packageDir] = process.argv.slice(2);
  assert(packageDir, "usage: node patch.mjs <@wecom/wecom-openclaw-plugin package dir>");
  console.log(JSON.stringify(patchWecomVlab2(packageDir)));
}
