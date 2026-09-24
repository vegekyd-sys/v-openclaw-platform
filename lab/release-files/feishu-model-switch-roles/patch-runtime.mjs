#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const marker = 'FEISHU_MODEL_COMMAND_ONLY_V2';
const core = process.argv[2];
const check = process.argv.includes('--check');
assert(core && path.isAbsolute(core), 'Usage: patch-runtime.mjs /absolute/runtime/openclaw --check|--apply');
assert(check !== process.argv.includes('--apply'), 'Choose exactly one of --check or --apply');

const dist = path.join(core, 'dist');
const matches = fs.readdirSync(dist).filter(name => /^command-auth-[A-Za-z0-9_-]{8}\.js$/.test(name));
assert.equal(matches.length, 1, `Expected one command-auth-*.js, found ${matches.length}`);
const target = path.join(dist, matches[0]);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  assert(first >= 0 && source.indexOf(before, first + 1) < 0, `${label}: anchor must occur once`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const original = fs.readFileSync(target, 'utf8');
const already = original.includes(marker);
if (already) {
  assert(original.includes('commandText: ctx.commandText ?? ctx.Body ?? ""'), 'authorization context missing');
  assert(original.includes('params.providerId === "feishu" && !params.senderIsOwner'), 'Feishu guard missing');
  assert(original.includes('/^[ \\t]*\\/model(?:[ \\t]+[^\\r\\n]*)?[ \\t]*$/i.test(params.commandText ?? "")'), 'whole-line /model guard missing');
} else {
  assert(!original.includes('FEISHU_MODEL_SWITCH_ROLES_V1'), 'older model-switch patch present; do not layer patches');
}
console.log(`${path.basename(target)}: ${already ? 'already' : 'pending'}`);
if (check || already) process.exit(0);

let updated = replaceOnce(original,
  'return !params.providerResolutionError && (commandsAllowAll || Boolean(matchedCommandsAllowFrom)) ? "commands" : "denied";',
  `if (params.providerResolutionError || !(commandsAllowAll || Boolean(matchedCommandsAllowFrom))) return "denied";
        // ${marker}: non-owner Feishu senders may use /model, not the full command set.
        if (params.providerId === "feishu" && !params.senderIsOwner) return /^[ \\t]*\\/model(?:[ \\t]+[^\\r\\n]*)?[ \\t]*$/i.test(params.commandText ?? "") ? "commands" : "reset-only";
        return "commands";`, 'command authorization');
updated = replaceOnce(updated,
  'const access = resolveCommandSenderAuthorization({\n\t\tcommandAuthorized,',
  'const access = resolveCommandSenderAuthorization({\n\t\tcommandAuthorized,\n\t\tproviderId,\n\t\tsenderIsOwner,\n\t\tcommandText: ctx.commandText ?? ctx.Body ?? "",', 'authorization context');

const mode = fs.statSync(target).mode & 0o777;
const temp = `${target}.feishu-model-switch-${process.pid}`;
fs.writeFileSync(temp, updated, { mode, flag: 'wx' });
fs.renameSync(temp, target);
console.log('applied: 1');
