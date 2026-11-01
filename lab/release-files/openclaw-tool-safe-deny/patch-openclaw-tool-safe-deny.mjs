#!/usr/bin/env node
// OpenClaw 2026.9.1 (V): an agent tool policy that denies the `openclaw` tool must not mark
// plugin-harness runs "tool policy restricted".
//
//   node patch-openclaw-tool-safe-deny.mjs --dist <openclaw dist> [--check]
//
// Why (README.md): V should not get the `openclaw` tool (the built-in system agent) on any
// route, and `agents.entries.makaron.tools.deny: ["openclaw"]` does remove it everywhere. But
// toolPolicyRestrictsHarnessNativeTools treats a denied name as restricting unless it is both a
// core-catalog tool id and in the harness's conversationToolPolicySafeDenyTools. `openclaw` is
// neither (the delegate tool is built outside CORE_TOOL_DEFINITIONS), so every /vcodex and /vds
// turn became restricted and Codex turned its native shell and file tools off
// (candidate-bee8efea). `openclaw` reaches every harness only as an OpenClaw tool that the core
// already drops from the tool list; no harness has a native counterpart, so denying it is
// always exactly enforced.
//
// Idempotent: a module that already carries the marker is left alone; otherwise the anchor
// must match exactly once.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dist = option("--dist");
const checkOnly = args.includes("--check");
assert(dist, "usage: patch-openclaw-tool-safe-deny.mjs --dist <openclaw dist> [--check]");
const MARK = "v-openclaw-tool-safe-deny-v1";
const ANCHOR = "\t\tconst normalized = normalizeToolPolicyName(deniedName);\n\t\treturn !isKnownCoreToolId(normalized) || !safeDenyToolNames.has(normalized);\n";
const REPLACEMENT = `\t\tconst normalized = normalizeToolPolicyName(deniedName);\n\t\tif (normalized === "openclaw") return false; // ${MARK}: OpenClaw-only tool, no harness-native counterpart\n\t\treturn !isKnownCoreToolId(normalized) || !safeDenyToolNames.has(normalized);\n`;
const hits = fs.readdirSync(dist).filter((f) => /^selection-[\w-]+\.js$/u.test(f)).map((f) => path.join(dist, f))
  .filter((f) => fs.readFileSync(f, "utf8").includes("function toolPolicyRestrictsHarnessNativeTools("));
assert.equal(hits.length, 1, `expected one selection module defining toolPolicyRestrictsHarnessNativeTools, found ${hits.length}`);
const file = hits[0];
const src = fs.readFileSync(file, "utf8");
let changed = false;
let out = src;
if (!src.includes(MARK)) {
  assert.equal(src.split(ANCHOR).length, 2, "anchor in toolPolicyRestrictsHarnessNativeTools not found exactly once");
  out = src.replace(ANCHOR, REPLACEMENT);
  changed = true;
}
if (changed && !checkOnly) fs.writeFileSync(file, out);
console.log(JSON.stringify({ file: path.basename(file), changed, wrote: changed && !checkOnly }));
