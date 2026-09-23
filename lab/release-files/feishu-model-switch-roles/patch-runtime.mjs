#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const marker = 'FEISHU_MODEL_SWITCH_ROLES_V1';
const core = process.argv[2];
const check = process.argv.includes('--check');
assert(core && path.isAbsolute(core), 'Usage: patch-runtime.mjs /absolute/runtime/openclaw --check|--apply');
assert(check !== process.argv.includes('--apply'), 'Choose exactly one of --check or --apply');

const dist = path.join(core, 'dist');
function file(prefix) {
  const pattern = new RegExp(`^${prefix.replaceAll('.', '\\.')}[A-Za-z0-9_-]{8}\\.js$`);
  const matches = fs.readdirSync(dist).filter(name => pattern.test(name));
  assert.equal(matches.length, 1, `Expected one ${prefix}*.js, found ${matches.length}`);
  return path.join(dist, matches[0]);
}
function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  assert(first >= 0 && source.indexOf(before, first + 1) < 0, `${label}: anchor must occur once`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}
const protectedHelper = `function isFeishuOwnerOnlyModelSelection(cfg, agentId, selection) {
  if (!selection) return false;
  if (["vcodex", "vcc"].includes(String(selection.alias ?? "").toLowerCase())) return true;
  const selected = \`\${selection.provider}/\${selection.model}\`.toLowerCase();
  const sources = [cfg.agents?.defaults?.models, cfg.agents?.entries?.[agentId]?.models,
    cfg.agents?.list?.find((entry) => entry.id === agentId)?.models];
  return sources.some((models) => Object.entries(models ?? {}).some(([ref, options]) =>
    ref.toLowerCase() === selected && ["vcodex", "vcc"].includes(String(options?.alias ?? "").toLowerCase())));
}
`;

const patches = [
  {
    path: file('command-auth-'),
    verifyAlready(source) {
      assert(source.includes('commandText: ctx.commandText ?? ctx.Body ?? ""'), 'command-auth partial patch');
      assert(source.includes('params.providerId === "feishu" && !params.senderIsOwner'), 'command-auth policy missing');
    },
    transform(source) {
      source = replaceOnce(source,
        'return !params.providerResolutionError && (commandsAllowAll || Boolean(matchedCommandsAllowFrom)) ? "commands" : "denied";',
        `if (params.providerResolutionError || !(commandsAllowAll || Boolean(matchedCommandsAllowFrom))) return "denied";
    // ${marker}: Feishu colleagues get /model only, not the full elevated command set.
    if (params.providerId === "feishu" && !params.senderIsOwner) return /^\\s*\\/model(?:\\s|$)/i.test(params.commandText ?? "") ? "commands" : "reset-only";
    return "commands";`, 'command authorization');
      source = replaceOnce(source,
        'const access = resolveCommandSenderAuthorization({\n\t\tcommandAuthorized,',
        'const access = resolveCommandSenderAuthorization({\n\t\tcommandAuthorized,\n\t\tproviderId,\n\t\tsenderIsOwner,\n\t\tcommandText: ctx.commandText ?? ctx.Body ?? "",', 'authorization context');
      return source;
    },
  },
  {
    path: file('get-reply-'),
    verifyAlready(source) {
      assert(source.includes('ctx.Provider === "feishu" && !command.senderIsOwner'), 'get-reply guard missing');
      assert(source.includes('function isFeishuOwnerOnlyModelSelection'), 'get-reply helper missing');
    },
    transform(source) {
      source = replaceOnce(source, 'async function applyInlineDirectiveOverrides(params) {',
        `// ${marker}: protect the two owner-only model routes, including direct provider/model refs.\n${protectedHelper}\nasync function applyInlineDirectiveOverrides(params) {`, 'reply helper');
      source = replaceOnce(source,
        'const modelSelection = modelResolution.modelSelection;\n\t\t\tif (modelSelection) {',
        `const modelSelection = modelResolution.modelSelection;
            if (modelSelection && ctx.Provider === "feishu" && !command.senderIsOwner && isFeishuOwnerOnlyModelSelection(cfg, agentId, modelSelection)) {
                typing.cleanup();
                return { kind: "reply", reply: { text: "这个模型仅限 V 的 owner 切换。你可以选择其他模型。", isError: true } };
            }
\t\t\tif (modelSelection) {`, 'standalone /model guard');
      return source;
    },
  },
  {
    path: file('directive-handling.impl-'),
    verifyAlready(source) {
      assert(source.includes('params.messageProvider === "feishu" && !params.senderIsOwner'), 'directive guard missing');
      assert(source.includes('function isFeishuOwnerOnlyModelSelection'), 'directive helper missing');
    },
    transform(source) {
      source = replaceOnce(source, 'async function handleDirectiveOnly(params) {',
        `// ${marker}: enforce the same policy for mixed text/model directives.\n${protectedHelper}\nasync function handleDirectiveOnly(params) {`, 'directive helper');
      source = replaceOnce(source,
        'const modelSelection = modelResolution.modelSelection;\n\tconst profileOverride = modelResolution.profileOverride;',
        `const modelSelection = modelResolution.modelSelection;
    if (modelSelection && params.messageProvider === "feishu" && !params.senderIsOwner && isFeishuOwnerOnlyModelSelection(params.cfg, activeAgentId, modelSelection))
        return rejectModelTransaction("这个模型仅限 V 的 owner 切换。你可以选择其他模型。");
\tconst profileOverride = modelResolution.profileOverride;`, 'mixed directive guard');
      return source;
    },
  },
];

let pending = 0;
for (const entry of patches) {
  const original = fs.readFileSync(entry.path, 'utf8');
  const already = original.includes(marker);
  if (!already) {
    entry.after = entry.transform(original);
    pending++;
  } else entry.verifyAlready(original);
  console.log(`${path.basename(entry.path)}: ${already ? 'already' : 'pending'}`);
}
if (check) process.exit(0);
for (const entry of patches) {
  if (!entry.after) continue;
  const mode = fs.statSync(entry.path).mode & 0o777;
  const temp = `${entry.path}.feishu-model-switch-${process.pid}`;
  fs.writeFileSync(temp, entry.after, { mode, flag: 'wx' });
  fs.renameSync(temp, entry.path);
}
console.log(`applied: ${pending}`);
