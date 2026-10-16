#!/usr/bin/env node
// /vds and /vcodex group chats on OpenClaw 2026.9.1 (V): stop rotating the Codex thread
// every time the speaker changes between the owner and another member.
//
//   node patch-codex-toolset-cover.mjs --codex <.../node_modules/@openclaw/codex> [--check]
//
// Why (README.md): an owner turn gets 12 more dynamic tools than a member turn
// (owner-only tools, plus descriptions that mention them). A Codex thread's tools are
// fixed when it starts, so each change of speaker started a fresh thread and replayed the
// whole OpenClaw transcript into it. On V's oc_88d96b7e group (/vds) that replay was
// 37–38万 input tokens against Codex's 244,800-token auto-compaction limit for DeepSeek,
// so every such turn compacted at once (2026-10-13 16:31–17:06: 11 threads, 6 compactions).
//
// Tool calls only run what the current turn grants (dynamic-tools toolMap), so a bound
// thread whose recorded tools cover this turn's tools by name and parameter schema keeps
// serving it; descriptions may differ. The binding keeps the thread's real fingerprint.
// Same change as 253d1ad8 (patch F, withdrawn 2026-10-09 before it took effect on V),
// rebuilt on the bytes V runs on 2026-10-13: thread-lifecycle a9f76cf4 (vds-view-image).
//
// Idempotent: a replacement that is already present is left alone; otherwise its anchor
// must match exactly once.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const codexRoot = option("--codex");
const checkOnly = args.includes("--check");
assert(codexRoot, "usage: patch-codex-toolset-cover.mjs --codex <@openclaw/codex dir> [--check]");
const MARK = "v-codex-toolset-cover-v1";

const pkg = JSON.parse(fs.readFileSync(path.join(codexRoot, "package.json"), "utf8"));
assert.equal(pkg.name, "@openclaw/codex");
assert.equal(pkg.version, "2026.9.1", `written against 2026.9.1, found ${pkg.version}`);
const codexDist = path.join(codexRoot, "dist");

function moduleIn(dir, re, marker) {
  const hits = fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f))
    .filter((f) => fs.readFileSync(f, "utf8").includes(marker));
  assert.equal(hits.length, 1, `expected one ${re} containing ${JSON.stringify(marker.slice(0, 60))} in ${dir}, found ${hits.length}`);
  return hits[0];
}

const TARGETS = [
  {
    file: moduleIn(codexDist, /^thread-lifecycle-.*\.js$/u, "function shouldStartTransientNoToolThread(params) {"),
    patches: [
      ["function shouldStartTransientNoToolThread(params) {",
        `// ${MARK}: a thread whose recorded tools cover this turn's tools keeps serving it.\n`
        + "function codexThreadToolName(tool) {\n"
        + "\treturn tool?.namespace ?? tool?.name;\n"
        + "}\n"
        + "function codexThreadToolShape(tool) {\n"
        + "\tconst { description, tools, deferLoading, ...rest } = tool ?? {};\n"
        + "\treturn JSON.stringify(stabilizeJsonValue({ ...rest, deferLoading: deferLoading === true }));\n"
        + "}\n"
        + "function codexThreadToolServes(have, want) {\n"
        + "\tif (!have || !want || codexThreadToolName(have) !== codexThreadToolName(want)) return false;\n"
        + "\tif (Array.isArray(have.tools) || Array.isArray(want.tools)) {\n"
        + "\t\tif (!Array.isArray(have.tools) || !Array.isArray(want.tools)) return false;\n"
        + "\t\tconst byName = new Map(have.tools.map((tool) => [codexThreadToolName(tool), tool]));\n"
        + "\t\treturn want.tools.every((tool) => codexThreadToolServes(byName.get(codexThreadToolName(tool)), tool));\n"
        + "\t}\n"
        + "\treturn codexThreadToolShape(have) === codexThreadToolShape(want);\n"
        + "}\n"
        + "async function codexBoundThreadToolCatalogForTurn(params, binding) {\n"
        + "\tif (!binding?.rolloutPath || !binding.dynamicToolsFingerprint || binding.connectionScope === \"supervision\" || params.dynamicTools.length === 0) return;\n"
        + "\ttry {\n"
        + "\t\tconst sessionsRoot = path.join(resolveCodexAppServerLocalHomeDir(params.appServer.start, resolveCodexThreadAgentDir(params)), \"sessions\");\n"
        + "\t\tconst recorded = (await readCodexSessionMeta(sessionsRoot, binding.rolloutPath, binding.threadId))?.dynamic_tools;\n"
        + "\t\tif (!Array.isArray(recorded) || codexDynamicToolsFingerprint(recorded) !== binding.dynamicToolsFingerprint) return;\n"
        + "\t\tconst byName = new Map(recorded.map((tool) => [codexThreadToolName(tool), tool]));\n"
        + "\t\tif (!params.dynamicTools.every((tool) => codexThreadToolServes(byName.get(codexThreadToolName(tool)), tool))) return;\n"
        + "\t\treturn {\n"
        + "\t\t\tdynamicToolsFingerprint: binding.dynamicToolsFingerprint,\n"
        + "\t\t\tlegacyDynamicToolsFingerprint: codexLegacyDynamicToolsFingerprint(recorded),\n"
        + "\t\t\trecordedToolCount: recorded.length\n"
        + "\t\t};\n"
        + "\t} catch {\n"
        + "\t\treturn;\n"
        + "\t}\n"
        + "}\n"
        + "function shouldStartTransientNoToolThread(params) {"],
      ["\t\tif (binding?.threadId) {\n"
        + "\t\t\tif (binding.dynamicToolsFingerprint && !areDynamicToolFingerprintsCompatible(binding.dynamicToolsFingerprint, dynamicToolsFingerprint, legacyDynamicToolsFingerprint)) {\n",
        `\t\tlet codexKeptToolCatalog; // ${MARK}\n`
        + "\t\tif (binding?.threadId && binding.dynamicToolsFingerprint && !areDynamicToolFingerprintsCompatible(binding.dynamicToolsFingerprint, dynamicToolsFingerprint, legacyDynamicToolsFingerprint)) {\n"
        + "\t\t\tconst kept = await codexBoundThreadToolCatalogForTurn(params, binding);\n"
        + "\t\t\tif (kept) {\n"
        + "\t\t\t\tembeddedAgentLog.info(\"codex app-server keeping thread whose tool catalog covers this turn\", {\n"
        + "\t\t\t\t\tthreadId: binding.threadId,\n"
        + "\t\t\t\t\tthreadTools: kept.recordedToolCount,\n"
        + "\t\t\t\t\tturnTools: params.dynamicTools.length\n"
        + "\t\t\t\t});\n"
        + "\t\t\t\tcodexKeptToolCatalog = {\n"
        + "\t\t\t\t\tdynamicToolsFingerprint: kept.dynamicToolsFingerprint,\n"
        + "\t\t\t\t\tlegacyDynamicToolsFingerprint: kept.legacyDynamicToolsFingerprint\n"
        + "\t\t\t\t};\n"
        + "\t\t\t}\n"
        + "\t\t}\n"
        + "\t\tif (binding?.threadId) {\n"
        + "\t\t\tif (!codexKeptToolCatalog && binding.dynamicToolsFingerprint && !areDynamicToolFingerprintsCompatible(binding.dynamicToolsFingerprint, dynamicToolsFingerprint, legacyDynamicToolsFingerprint)) {\n"],
      ["\t\t\t\tconst warmReuse = await tryReuseCodexLiveThread({\n\t\t\t\t\t...requestContext,\n",
        "\t\t\t\tconst warmReuse = await tryReuseCodexLiveThread({\n\t\t\t\t\t...requestContext,\n\t\t\t\t\t...codexKeptToolCatalog,\n"],
      ["\t\t\t\t\tconst configuration = await prepareCodexThreadResume(params, binding, requestContext);\n",
        "\t\t\t\t\tconst configuration = await prepareCodexThreadResume(params, binding, {\n\t\t\t\t\t\t...requestContext,\n\t\t\t\t\t\t...codexKeptToolCatalog\n\t\t\t\t\t});\n"],
      ["\t\t\t\t\t\tconst resumed = await resumeExistingCodexThread(params, {\n\t\t\t\t\t\t\t...requestContext,\n\t\t\t\t\t\t\tbinding,\n",
        "\t\t\t\t\t\tconst resumed = await resumeExistingCodexThread(params, {\n\t\t\t\t\t\t\t...requestContext,\n\t\t\t\t\t\t\t...codexKeptToolCatalog,\n\t\t\t\t\t\t\tbinding,\n"],
    ],
  },
];

let changed = 0;
for (const target of TARGETS) {
  let text = fs.readFileSync(target.file, "utf8");
  for (const [from, to] of target.patches) {
    const fromHits = text.split(from).length - 1;
    const toHits = text.split(to).length - 1;
    // An anchor may reappear inside its own replacement; the replacement decides.
    if (toHits === 1) continue;
    assert.equal(fromHits, 1, `${path.basename(target.file)}: anchor must match once, matched ${fromHits}: ${JSON.stringify(from.slice(0, 80))}`);
    text = text.replace(from, () => to);
    changed++;
  }
  if (!checkOnly) fs.writeFileSync(target.file, text);
  console.log(`${checkOnly ? "check" : "patched"} ${target.file}`);
}
console.log(JSON.stringify({ marker: MARK, changed, checkOnly }));
