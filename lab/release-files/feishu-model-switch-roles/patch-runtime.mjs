#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// V3 widens the V2 Feishu-only rule to every chat channel V serves; Feishu
// behaviour is unchanged. A runtime that carries V2 is upgraded in place.
const marker = 'V_MODEL_COMMAND_ONLY_V3';
const v2Marker = 'FEISHU_MODEL_COMMAND_ONLY_V2';
export const MODEL_ONLY_CHANNELS = ['feishu', 'telegram', 'dingtalk-connector', 'wecom', 'msteams'];
const modelOnly = '/^[ \\t]*\\/model(?:[ \\t]+[^\\r\\n]*)?[ \\t]*$/i.test(params.commandText ?? "") ? "commands" : "reset-only"';
const v2Rule = `        // ${v2Marker}: non-owner Feishu senders may use /model, not the full command set.
        if (params.providerId === "feishu" && !params.senderIsOwner) return ${modelOnly};`;
const v3Rule = `        // ${marker}: on V's chat channels a non-owner admitted by commands.allowFrom may use /model, not the full command set.
        if (${JSON.stringify(MODEL_ONLY_CHANNELS).replaceAll(',', ', ')}.includes(params.providerId) && !params.senderIsOwner) return ${modelOnly};`;
const context = 'commandText: ctx.commandText ?? ctx.Body ?? ""';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  assert(first >= 0 && source.indexOf(before, first + 1) < 0, `${label}: anchor must occur once`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

/** Returns { state, updated }: state is already | upgrade-v2 | pending. */
export function patchCommandAuth(original) {
  assert(!original.includes('FEISHU_MODEL_SWITCH_ROLES_V1'), 'older model-switch patch present; do not layer patches');
  if (original.includes(marker)) {
    assert(original.includes(context), 'authorization context missing');
    assert(original.includes(v3Rule), 'V3 channel guard missing');
    assert(!original.includes(v2Marker), 'V2 and V3 both present');
    return { state: 'already', updated: original };
  }
  if (original.includes(v2Marker)) {
    assert(original.includes(context), 'authorization context missing');
    return { state: 'upgrade-v2', updated: replaceOnce(original, v2Rule, v3Rule, 'V2 Feishu guard') };
  }
  let updated = replaceOnce(original,
    'return !params.providerResolutionError && (commandsAllowAll || Boolean(matchedCommandsAllowFrom)) ? "commands" : "denied";',
    `if (params.providerResolutionError || !(commandsAllowAll || Boolean(matchedCommandsAllowFrom))) return "denied";
${v3Rule}
        return "commands";`, 'command authorization');
  updated = replaceOnce(updated,
    'const access = resolveCommandSenderAuthorization({\n\t\tcommandAuthorized,',
    `const access = resolveCommandSenderAuthorization({\n\t\tcommandAuthorized,\n\t\tproviderId,\n\t\tsenderIsOwner,\n\t\t${context},`, 'authorization context');
  return { state: 'pending', updated };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const core = process.argv[2];
  const check = process.argv.includes('--check');
  assert(core && path.isAbsolute(core), 'Usage: patch-runtime.mjs /absolute/runtime/openclaw --check|--apply');
  assert(check !== process.argv.includes('--apply'), 'Choose exactly one of --check or --apply');
  const dist = path.join(core, 'dist');
  const matches = fs.readdirSync(dist).filter(name => /^command-auth-[A-Za-z0-9_-]{8}\.js$/.test(name));
  assert.equal(matches.length, 1, `Expected one command-auth-*.js, found ${matches.length}`);
  const target = path.join(dist, matches[0]);
  const { state, updated } = patchCommandAuth(fs.readFileSync(target, 'utf8'));
  console.log(`${path.basename(target)}: ${state}`);
  if (check || state === 'already') process.exit(0);
  const mode = fs.statSync(target).mode & 0o777;
  const temp = `${target}.model-command-roles-${process.pid}`;
  fs.writeFileSync(temp, updated, { mode, flag: 'wx' });
  fs.renameSync(temp, target);
  console.log('applied: 1');
}
