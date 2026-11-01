#!/usr/bin/env node
// OpenClaw 2026.9.1 (V): load the workspace's root MEMORY.md into every session's bootstrap
// context, not only direct chats, and paste it into native Codex turns too.
//
//   node patch-bootstrap-memory-everywhere.mjs --core-dist <openclaw dist> --codex-dist <@openclaw/codex dist> [--check]
//
// Why (README.md): upstream drops root MEMORY.md from group, channel, cron and subagent
// sessions (filterBootstrapFilesForSession), and the Codex harness never pastes it once
// memory_search/memory_get are available (it renders a one-line pointer instead). Those
// sessions can already read the same file through memory_search, so withholding it protects
// nothing; it only makes V weaker at the start of a turn. Tianyi asked for it everywhere
// (2026-10-28).
//
// Core (workspace-*.js): no privacy filter, and MEMORY.md joins the subagent and cron
// allowlists. Codex (attempt-context-*.js): MEMORY.md stays in the context files and is
// delivered with SOUL/IDENTITY/USER as turn-scoped developer instructions (not prepended to the
// user prompt, so it does not accumulate in the thread history); the "OpenClaw does not paste
// its contents" pointer is no longer rendered. Memory recall instructions are unchanged.
//
// Idempotent: a module that already carries the marker is left alone; otherwise every anchor
// must match exactly once.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const coreDist = option("--core-dist");
const codexDist = option("--codex-dist");
const checkOnly = args.includes("--check");
assert(coreDist || codexDist, "usage: patch-bootstrap-memory-everywhere.mjs --core-dist <dist> --codex-dist <dist> [--check]");
const MARK = "v-bootstrap-memory-everywhere-v1";

const CORE_EDITS = [[
  "\tconst privacyFilteredFiles = isSubagent || isCron || effectiveChatType === \"group\" || effectiveChatType === \"channel\" ? filterRootMemoryBootstrapFiles(files, workspaceDir) : files;\n" +
  "\tif (isSubagent) return privacyFilteredFiles.filter((file) => SUBAGENT_BOOTSTRAP_ALLOWLIST.has(file.name));\n" +
  "\tif (isCron) return privacyFilteredFiles.filter((file) => CRON_BOOTSTRAP_ALLOWLIST.has(file.name));\n",
  `\tconst privacyFilteredFiles = files; // ${MARK}: MEMORY.md in every session; memory_search reaches it anyway\n` +
  "\tif (isSubagent) return privacyFilteredFiles.filter((file) => SUBAGENT_BOOTSTRAP_ALLOWLIST.has(file.name) || file.name === DEFAULT_MEMORY_FILENAME);\n" +
  "\tif (isCron) return privacyFilteredFiles.filter((file) => CRON_BOOTSTRAP_ALLOWLIST.has(file.name) || file.name === DEFAULT_MEMORY_FILENAME);\n",
]];

const CODEX_EDITS = [
  [
    "const CODEX_TURN_SCOPED_WORKSPACE_DEVELOPER_CONTEXT_BASENAMES = /* @__PURE__ */ new Set([\n\t\"identity.md\",\n\t\"soul.md\",\n\t\"user.md\"\n]);\n",
    `const CODEX_TURN_SCOPED_WORKSPACE_DEVELOPER_CONTEXT_BASENAMES = /* @__PURE__ */ new Set([\n\t"identity.md",\n\t"soul.md",\n\t"user.md",\n\t"memory.md" // ${MARK}\n]);\n`,
  ],
  [
    "\t\tconst memoryToolRoutedBootstrapFiles = memoryToolsAvailable ? selectCodexWorkspaceMemoryReferenceFiles({\n",
    `\t\tconst memoryToolRoutedBootstrapFiles = false /* ${MARK}: MEMORY.md is pasted, not referenced */ ? selectCodexWorkspaceMemoryReferenceFiles({\n`,
  ],
  [
    "\t\tconst contextFiles = buildBootstrapContextForFiles(memoryToolsAvailable ? bootstrapFiles.filter((file) => !isCodexWorkspaceRootMemoryBootstrapFile({\n",
    `\t\tconst contextFiles = buildBootstrapContextForFiles(false /* ${MARK} */ ? bootstrapFiles.filter((file) => !isCodexWorkspaceRootMemoryBootstrapFile({\n`,
  ],
];

function patchOne(dist, filePattern, definition, edits) {
  const hits = fs.readdirSync(dist).filter((f) => filePattern.test(f)).map((f) => path.join(dist, f))
    .filter((f) => fs.readFileSync(f, "utf8").includes(definition));
  assert.equal(hits.length, 1, `expected one module in ${dist} defining ${definition}, found ${hits.length}`);
  const file = hits[0];
  const src = fs.readFileSync(file, "utf8");
  let out = src;
  if (!src.includes(MARK)) {
    for (const [anchor, replacement] of edits) {
      assert.equal(out.split(anchor).length, 2, `anchor not found exactly once in ${path.basename(file)}: ${anchor.slice(0, 80)}`);
      out = out.replace(anchor, replacement);
    }
  }
  const changed = out !== src;
  if (changed && !checkOnly) fs.writeFileSync(file, out);
  return { file: path.basename(file), changed, wrote: changed && !checkOnly };
}

const results = [];
if (coreDist) results.push(patchOne(coreDist, /^workspace-[\w-]+\.js$/u, "function filterBootstrapFilesForSession(", CORE_EDITS));
if (codexDist) results.push(patchOne(codexDist, /^attempt-context-[\w-]+\.js$/u, "function selectCodexWorkspaceTurnScopedDeveloperInstructionFiles(", CODEX_EDITS));
console.log(JSON.stringify(results));
