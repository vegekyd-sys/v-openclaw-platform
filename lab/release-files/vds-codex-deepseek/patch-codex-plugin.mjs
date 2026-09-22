#!/usr/bin/env node
// Patches an installed @openclaw/codex@2026.9.1 so the Codex harness can run DeepSeek (/vds).
// Idempotent: each anchor must match exactly once, or the patched text must already be present.
//   node patch-codex-plugin.mjs <path-to>/node_modules/@openclaw/codex [--check]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const checkOnly = process.argv.includes('--check');
assert(root && fs.existsSync(path.join(root, 'package.json')), 'usage: patch-codex-plugin.mjs <@openclaw/codex dir> [--check]');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.name, '@openclaw/codex');
assert.equal(pkg.version, '2026.9.1', `patches were written against 2026.9.1, found ${pkg.version}`);
const dist = path.join(root, 'dist');
const find = (re, marker) => fs.readdirSync(dist).map((f) => path.join(dist, f))
  .find((f) => re.test(path.basename(f)) && fs.readFileSync(f, 'utf8').includes(marker));

const FILES = [
  {
    file: find(/^harness-.*\.js$/u, 'DEFAULT_CODEX_HARNESS_PROVIDER_IDS = '),
    patches: [
      // 1. Accept the deepseek provider on the Codex harness.
      ['new Set(["codex", "openai"]);', 'new Set(["codex", "openai", "deepseek"]);'],
      // 2. The deepseek provider route is served by Codex's own [model_providers.deepseek].
      ['} else if (ctx.modelProvider && provider !== "codex" && !nativeAccountOwnsUnobservedModel) return {',
       '} else if (ctx.modelProvider && provider !== "codex" && provider !== "deepseek" && !nativeAccountOwnsUnobservedModel) return {'],
      // 3. OpenClaw's deepseek baseUrl/api (openai-completions) is never replayed by Codex; without this
      //    the run silently falls back to the openclaw harness (runner "embedded", no Codex rollout).
      ['if (ctx.modelProvider?.requestTransportOverrides === "present") return {',
       'if (ctx.modelProvider?.requestTransportOverrides === "present" && provider !== "deepseek") return {'],
    ],
  },
  {
    file: find(/^run-attempt-.*\.js$/u, 'nativeCodeModeEnabled: params.nativeToolSurfaceEnabled'),
    patches: [
      // 4. Code mode exposes a custom "exec" tool; DeepSeek accepts only the apply_patch custom tool.
      ['nativeCodeModeEnabled: params.nativeToolSurfaceEnabled,',
       'nativeCodeModeEnabled: params.nativeToolSurfaceEnabled && String(params.buildAttemptParams()?.provider ?? "").trim().toLowerCase() !== "deepseek",'],
    ],
  },
];

const report = [];
for (const {file, patches} of FILES) {
  assert(file, 'target module not found in dist');
  let src = fs.readFileSync(file, 'utf8');
  for (const [from, to] of patches) {
    const applied = src.includes(to);
    const count = src.split(from).length - 1;
    if (applied) { report.push({file: path.basename(file), patch: to.slice(0, 50), state: 'already'}); continue; }
    assert.equal(count, 1, `anchor must match exactly once in ${path.basename(file)}: ${from.slice(0, 60)}`);
    if (!checkOnly) src = src.replace(from, to);
    report.push({file: path.basename(file), patch: to.slice(0, 50), state: checkOnly ? 'pending' : 'applied'});
  }
  if (!checkOnly) fs.writeFileSync(file, src);
}
console.log(JSON.stringify({root, checkOnly, report}, null, 1));
