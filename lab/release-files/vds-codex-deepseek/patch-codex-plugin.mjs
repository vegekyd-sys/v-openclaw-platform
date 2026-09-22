#!/usr/bin/env node
// Patches an installed @openclaw/codex@2026.9.1 so the Codex harness can run DeepSeek (/vds).
// Seven patches: the original five model/tool-surface patches plus the Feishu
// secret-entry progress bridge used by Codex dynamic tools.
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
      // 6. Codex executes OpenClaw dynamic tools outside the embedded harness subscriber. Preserve the
      //    normal progress callback in the bridge context so interactive tool prompts can reach the
      //    originating channel instead of waiting invisibly for the full human-input timeout.
      ['sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,\n\t\t\tonToolOutcome: onCodexToolOutcome,',
       'sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,\n\t\t\tonToolResult: params.onToolResult, // v-codex-feishu-secret-entry-v1\n\t\t\tonToolOutcome: onCodexToolOutcome,'],
    ],
  },
  {
    file: find(/^thread-lifecycle-.*\.js$/u, 'function shouldDisableCodexToolSearchForModel'),
    patches: [
      // 5. Deferred OpenClaw dynamic tools (web_search, web_fetch, message, browser, ...) are reached via
      //    Codex tool search, which rides on code mode. With code mode off (patch 4) DeepSeek sees them but
      //    cannot call them. Reuse the plugin's per-model switch (today only gpt-5.4-nano) to load them
      //    directly. Side effect by design: native multi_agent is off; OpenClaw sessions_spawn/subagents remain.
      ['return normalizeCodexModelId(modelId) === "gpt-5.4-nano";',
       'const normalizedId = normalizeCodexModelId(modelId); return normalizedId === "gpt-5.4-nano" || normalizedId.startsWith("deepseek");'],
    ],
  },
  {
    file: find(/^dynamic-tools-.*\.js$/u, 'function createCodexDynamicToolBridge'),
    patches: [
      // 7. `secrets.request` normally gets its visible prompt from the embedded harness tool-start
      //    subscriber. Codex dynamic tools bypass that subscriber, so the Gateway question existed but
      //    no Feishu card was emitted and the tool blocked until expiry. Start the tool, then publish the
      //    deterministic question id through the same onToolResult path used by the embedded harness.
      ['\t\t\t\tconst rawResult = await Reflect.apply(tool.execute, tool, executionArgs);',
       `\t\t\t\tconst vSecretEntryRequest = toolName === "secrets" && executedArgs.action === "request" && String(params.hookContext?.currentChannelProvider ?? "").trim().toLowerCase() === "feishu" && typeof params.hookContext?.onToolResult === "function" && typeof executedArgs.name === "string" && executedArgs.name.trim(); // v-codex-feishu-secret-entry-v1
\t\t\t\tconst toolExecution = Promise.resolve().then(() => Reflect.apply(tool.execute, tool, executionArgs));
\t\t\t\ttoolExecution.catch(() => {});
\t\t\t\tif (vSecretEntryRequest) {
\t\t\t\t\tconst questionIdentity = \`\${String(toolResultHookContext.runId ?? toolResultHookContext.sessionKey ?? toolResultHookContext.agentId ?? "unknown").trim()}\\0\${call.callId}\`;
\t\t\t\t\tconst questionId = \`ask_\${createHash("sha256").update(questionIdentity).digest("hex").slice(0, 32)}\`;
\t\t\t\t\tawait new Promise((resolve) => setTimeout(resolve, 50));
\t\t\t\t\tawait params.hookContext.onToolResult({
\t\t\t\t\t\ttext: \`🔑 V 需要凭据 \${executedArgs.name.trim()}，请在卡片里安全录入。\`,
\t\t\t\t\t\tchannelData: {
\t\t\t\t\t\t\taskUser: { questionId },
\t\t\t\t\t\t\tvSecretEntry: {
\t\t\t\t\t\t\t\tquestionId,
\t\t\t\t\t\t\t\tname: executedArgs.name.trim(),
\t\t\t\t\t\t\t\t...(typeof executedArgs.reason === "string" && executedArgs.reason.trim() ? { reason: executedArgs.reason.trim() } : {}),
\t\t\t\t\t\t\t\tallowedHosts: Array.isArray(executedArgs.allowedHosts) ? executedArgs.allowedHosts.filter((host) => typeof host === "string" && host.trim()).map((host) => host.trim()) : []
\t\t\t\t\t\t\t}
\t\t\t\t\t\t}
\t\t\t\t\t});
\t\t\t\t}
\t\t\t\tconst rawResult = await toolExecution;`],
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
