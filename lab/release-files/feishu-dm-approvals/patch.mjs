// Generates the Feishu owner-DM approval release from the live Feishu plugin dist:
//   node patch.mjs INPUT_DIST_DIR OUTPUT_DIR
// Writes only the files that change: v-feishu-approvals.js (new), channel-*.js
// and monitor.account-*.js. Anchors must match exactly once; re-running on an
// already patched input is a no-op for that file.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "v-feishu-dm-approvals-v1";
export const MODULE_FILE = "v-feishu-approvals.js";
const here = (name) => new URL(name, import.meta.url);

function replaceOne(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}: ${from.slice(0, 80)}`);
  return source.replace(from, () => to);
}

/** Map exported names to their minified aliases from a chunk's final export statement. */
export function readExportAliases(chunkSource) {
  const match = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(chunkSource.trimEnd());
  if (!match) throw new Error("chunk has no trailing export statement");
  const aliases = new Map();
  for (const part of match[1].split(",")) {
    const m = /^\s*([\w$]+)\s+as\s+([\w$]+)\s*$/.exec(part) ?? /^\s*([\w$]+)\s*$/.exec(part);
    if (m) aliases.set(m[1], m[2] ?? m[1]);
  }
  return aliases;
}

function findChunk(files, prefix) {
  // Rolldown chunks carry an 8-character hash; stable entry files (channel-entry.js) do not.
  const matches = files.filter((name) => name.startsWith(prefix) && /^[A-Za-z0-9_-]{8}\.js$/.test(name.slice(prefix.length)));
  if (matches.length !== 1) throw new Error(`expected one ${prefix}*.js chunk, found ${matches.length}`);
  return matches[0];
}

function chunkImport(distDir, files, prefix, names) {
  const file = findChunk(files, prefix);
  const aliases = readExportAliases(readFileSync(path.join(distDir, file), "utf8"));
  const specs = Object.entries(names).map(([name, local]) => {
    const alias = aliases.get(name);
    if (!alias) throw new Error(`${file} does not export ${name}`);
    return `${alias} as ${local}`;
  });
  return `import { ${specs.join(", ")} } from "./${file}";`;
}

export function buildApprovalModule(distDir, files = readdirSync(distDir)) {
  const core = readFileSync(here("core.mjs"), "utf8").replace(/^export /gm, "");
  const imports = [
    chunkImport(distDir, files, "accounts-", {
      resolveDefaultFeishuAccountId: "vFaResolveDefaultFeishuAccountId",
      listFeishuAccountIds: "vFaListFeishuAccountIds",
      resolveFeishuAccount: "vFaResolveFeishuAccount",
    }),
    chunkImport(distDir, files, "reply-delivery-result-", {
      sendCardFeishu: "vFaSendCardFeishu",
      editMessageFeishu: "vFaEditMessageFeishu",
    }),
  ].join("\n");
  const template = readFileSync(here("module.mjs"), "utf8");
  return `// ${MARKER}\n` + replaceOne(replaceOne(template, "/*@@CHUNK_IMPORTS@@*/", imports, MODULE_FILE), "/*@@CORE@@*/", core, MODULE_FILE);
}

export function patchChannel(source) {
  if (source.includes(`// ${MARKER}\n`)) return source;
  source = replaceOne(source, "approvalCapability: feishuApprovalAuth,", "approvalCapability: createVFeishuApprovalCapability(feishuApprovalAuth),", "channel");
  return `// ${MARKER}\nimport { createVFeishuApprovalCapability } from "./${MODULE_FILE}";\n${source}`;
}

export function patchMonitor(source) {
  if (source.includes(`// ${MARKER}\n`)) return source;
  source = replaceOne(source, '"card.action.trigger": async (data) => {', `"card.action.trigger": async (data) => {
      const vApprovalClick = await vFeishuApprovalCardAction(data, { cfg, accountId });
      if (vApprovalClick) return vApprovalClick;`, "monitor");
  source = replaceOne(source, "const vSecretEntryUnsubscribe = vSecretEntrySubscribeRequested({ cfg, accountId, abortSignal, log });",
    `const vSecretEntryUnsubscribe = vSecretEntrySubscribeRequested({ cfg, accountId, abortSignal, log });
	vFeishuApprovalRegisterContext({ channelRuntime: params.channelRuntime, accountId, abortSignal });`, "monitor");
  return `// ${MARKER}\nimport { vFeishuApprovalCardAction, vFeishuApprovalRegisterContext } from "./${MODULE_FILE}";\n${source}`;
}

export function generateRelease(distDir) {
  const files = readdirSync(distDir);
  const channel = findChunk(files, "channel-");
  const monitor = findChunk(files, "monitor.account-");
  return {
    [MODULE_FILE]: buildApprovalModule(distDir, files),
    [channel]: patchChannel(readFileSync(path.join(distDir, channel), "utf8")),
    [monitor]: patchMonitor(readFileSync(path.join(distDir, monitor), "utf8")),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , input, output] = process.argv;
  if (!input || !output || path.resolve(input) === path.resolve(output)) {
    throw new Error("Usage: node patch.mjs INPUT_DIST_DIR OUTPUT_DIR (separate output directory)");
  }
  mkdirSync(output, { recursive: true });
  for (const [name, content] of Object.entries(generateRelease(input))) writeFileSync(path.join(output, name), content);
}
